import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { loadAknData, IndexedAknData } from './services/aknLoader';
import { buildHierarchyIndex, HierarchyIndex } from './services/hierarchyBuilder';
import { useScrollSpy } from './hooks/useScrollSpy';
import { useReaderSettings } from './hooks/useReaderSettings';
import { Citation, Provision } from './types/akn';
import { Header } from './components/Header';
import { SidebarTOC } from './components/SidebarTOC';
import { ContinuousReader } from './components/ContinuousReader';
import { SideViewPanel } from './components/SideViewPanel';
import { SearchModal } from './components/SearchModal';
import { Loader2, AlertCircle, BookOpen } from 'lucide-react';

export const App: React.FC = () => {
  const [indexData, setIndexData] = useState<IndexedAknData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [activeCitation, setActiveCitation] = useState<Citation | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);

  // Settings hook
  const {
    settings,
    setTheme,
    setFontSize,
    toggleSerif,
    toggleSideViewPinned,
    setSideViewOpen,
    toggleTocOpen,
    setSideViewTab,
  } = useReaderSettings();

  // Load AKN dataset on mount
  useEffect(() => {
    loadAknData()
      .then((data) => {
        setIndexData(data);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load AKN data:', err);
        setError(err.message || 'Failed to load statutory dataset');
        setIsLoading(false);
      });
  }, []);

  // Build hierarchy index once data is ready
  const hierarchyIndex: HierarchyIndex | null = useMemo(() => {
    if (!indexData) return null;
    return buildHierarchyIndex(indexData);
  }, [indexData]);

  // ScrollSpy for continuous reading synchronization
  const {
    activeSection,
    activeSubsection,
    activeClause,
    scrollToProvision,
  } = useScrollSpy(hierarchyIndex);

  // Scroll to hash provision on initial load if URL contains anchor
  useEffect(() => {
    if (!isLoading && indexData && window.location.hash) {
      const targetId = window.location.hash.replace('#prov-', '').replace('#', '');
      if (targetId) {
        setTimeout(() => {
          scrollToProvision(targetId);
        }, 150);
      }
    }
  }, [isLoading, indexData, scrollToProvision]);

  // Handle in-text citation click -> opens side view without losing scroll position!
  const handleCitationClick = useCallback((citation: Citation) => {
    setActiveCitation(citation);
    setSideViewOpen(true);
  }, [setSideViewOpen]);

  // Handle exploring provision citations in side view
  const handleExploreProvisionInSideView = useCallback((provision: Provision) => {
    const cites = provision.citations || indexData?.citationsByParent.get(provision.eid) || [];
    if (cites.length > 0) {
      setActiveCitation(cites[0]);
      setSideViewOpen(true);
      setSideViewTab('nest');
    } else {
      // Synthetic self-reference
      setActiveCitation({
        parent_eid: provision.eid,
        target_eid: provision.eid,
        raw_text: `${provision.num || provision.kind}`,
        span: [0, 0],
        relation: 'self',
        resolved: true,
        external: false,
      });
      setSideViewOpen(true);
      setSideViewTab('provision');
    }
  }, [indexData, setSideViewOpen, setSideViewTab]);

  // Handle jumping to provision in main canvas from side view or search
  const handleJumpToMain = useCallback((eid: string) => {
    scrollToProvision(eid);
    // On small screens, close side view if not pinned
    if (window.innerWidth < 1024 && !settings.isSideViewPinned) {
      setSideViewOpen(false);
    }
  }, [scrollToProvision, settings.isSideViewPinned, setSideViewOpen]);

  // Global Ctrl+K listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsSearchOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[#FAF7EE] text-[#2A2315] dark:bg-[#090D16] dark:text-[#F1F5F9]">
        <div className="flex flex-col items-center space-y-4 max-w-sm text-center">
          <div className="w-16 h-16 rounded-2xl bg-amber-600/10 border border-amber-600/20 flex items-center justify-center text-amber-600">
            <BookOpen className="w-8 h-8 animate-pulse" />
          </div>
          <h1 className="font-serif font-bold text-xl">Loading Statute Dataset</h1>
          <p className="text-xs text-slate-500">
            Parsing 1,692 provisions, 555 cross-citations, and 113 amendment footnotes of the CGST Act...
          </p>
          <Loader2 className="w-6 h-6 animate-spin text-amber-600 mt-2" />
        </div>
      </div>
    );
  }

  if (error || !indexData) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-red-50 text-red-900 dark:bg-slate-900 dark:text-red-200">
        <div className="max-w-md p-6 bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-red-200 dark:border-red-900 text-center space-y-3">
          <AlertCircle className="w-10 h-10 mx-auto text-red-500" />
          <h2 className="font-bold text-lg">Failed to Load Act Data</h2>
          <p className="text-xs text-slate-600 dark:text-slate-300">{error}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors"
          >
            Retry Loading
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen flex flex-col ${settings.theme === 'dark' ? 'dark' : ''}`}>
      {/* Top Sticky Header with Synced Dropdowns */}
      <Header
        hierarchyIndex={hierarchyIndex}
        activeSection={activeSection}
        activeSubsection={activeSubsection}
        activeClause={activeClause}
        onSelectProvision={handleJumpToMain}
        theme={settings.theme}
        onThemeChange={setTheme}
        fontSize={settings.fontSize}
        onFontSizeChange={setFontSize}
        serifFont={settings.serifFont}
        onToggleSerif={toggleSerif}
        isTocOpen={settings.isTocOpen}
        onToggleToc={toggleTocOpen}
        onOpenSearch={() => setIsSearchOpen(true)}
        isSideViewOpen={settings.isSideViewOpen}
        onToggleSideView={() => setSideViewOpen(!settings.isSideViewOpen)}
      />

      {/* Main Body Layout */}
      <div className="flex-1 flex relative">
        {/* Collapsible Sidebar TOC */}
        <SidebarTOC
          hierarchyIndex={hierarchyIndex}
          activeSectionEid={activeSection?.eid || null}
          isOpen={settings.isTocOpen}
          onClose={toggleTocOpen}
          onSelectProvision={handleJumpToMain}
        />

        {/* Continuous Reading Canvas */}
        <div
          className={`flex-1 transition-all duration-200 ${
            settings.isTocOpen ? 'lg:pl-80' : ''
          } ${
            settings.isSideViewOpen && settings.isSideViewPinned ? 'xl:pr-[540px]' : ''
          }`}
        >
          <ContinuousReader
            indexData={indexData}
            onCitationClick={handleCitationClick}
            fontSize={settings.fontSize}
            serifFont={settings.serifFont}
            onExploreProvisionInSideView={handleExploreProvisionInSideView}
          />
        </div>

        {/* Frictionless Side View Panel */}
        <SideViewPanel
          isOpen={settings.isSideViewOpen}
          isPinned={settings.isSideViewPinned}
          activeCitation={activeCitation}
          indexData={indexData}
          activeTab={settings.sideViewTab}
          onTabChange={setSideViewTab}
          onClose={() => setSideViewOpen(false)}
          onTogglePin={toggleSideViewPinned}
          onJumpToMain={handleJumpToMain}
          onSelectCitation={handleCitationClick}
        />
      </div>

      {/* Global Quick Search Modal */}
      <SearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        indexData={indexData}
        onSelectProvision={handleJumpToMain}
      />
    </div>
  );
};

export default App;
