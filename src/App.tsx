import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { IndexedAknData, DataQualityReport } from './services/aknLoader';
import { buildHierarchyIndex, HierarchyIndex } from './services/hierarchyBuilder';
import {
  DocumentLoadError,
  StatuteDocument,
  openDocument,
} from './services/documentLibrary';
import { useScrollSpy } from './hooks/useScrollSpy';
import { useReaderSettings } from './hooks/useReaderSettings';
import { useDocumentLibrary, LibraryError } from './hooks/useDocumentLibrary';
import { Citation, SideViewTab } from './types/akn';
import { Header } from './components/Header';
import { HomePage } from './components/HomePage';
import { GlobalDropZone } from './components/GlobalDropZone';
import { SidebarTOC } from './components/SidebarTOC';
import { ContinuousReader } from './components/ContinuousReader';
import { SideViewPanel } from './components/SideViewPanel';
import { SearchModal } from './components/SearchModal';
import { AlertCircle, X, TriangleAlert } from 'lucide-react';

/**
 * Wraps a citation so the side panel can open directly on a provision's
 * backlinks. The dataset has no "self" citation, so one is synthesised; it
 * uses the real `relation` vocabulary so relation-keyed UI needs no special
 * case.
 */
function syntheticSelfCitation(eid: string, label: string): Citation {
  return {
    id: `self:${eid}`,
    parentEid: eid,
    rawText: label,
    span: [0, 0],
    relation: 'reference',
    target: { scope: 'internal', targetEid: eid, citedAs: label, resolution: 'exact', degradedFrom: null },
    parser: { targetEid: eid, external: false, resolved: true, targetType: 'synthetic' },
  };
}

const DataQualityPanel: React.FC<{
  quality: DataQualityReport;
  activeDocument: StatuteDocument;
  onClose: () => void;
}> = ({ quality, activeDocument, onClose }) => {
  const rows: Array<[string, string, 'ok' | 'warn']> = [
    ['Provisions parsed', String(quality.totalProvisions), 'ok'],
    ['Sections identified', String(quality.sectionCount), 'ok'],
    ['References', String(quality.citationCount), 'ok'],
    [
      'References resolved inside this Act',
      `${quality.internalResolved} of ${quality.citationCount - quality.externalCount}`,
      'ok',
    ],
    ['References to other Acts', String(quality.externalCount), 'ok'],
[
      'Orphan roots',
      `${quality.unattributedCount} with no parent section, holding ${quality.unattributedCharCount.toLocaleString()} characters of their own`,
      quality.unattributedCount > 0 ? 'warn' : 'ok',
    ],
    [
      'Detached provisions (orphans + descendants)',
      `${quality.detachedCount} holding ${quality.detachedCharCount.toLocaleString()} characters, unreachable from any chapter, schedule or section`,
      quality.detachedCount > 0 ? 'warn' : 'ok',
    ],
    [
      'Provisions with an entirely empty subtree',
      `${quality.emptySubtreeCount} (no text in the provision or any descendant)`,
      quality.emptySubtreeCount > 0 ? 'warn' : 'ok',
    ],
    [
      'Empty own-text but text in descendants',
      `${quality.emptyOwnTextWithDescendantTextCount} (content lives in children, not the node)`,
      quality.emptyOwnTextWithDescendantTextCount > 0 ? 'warn' : 'ok',
    ],
    [
      'Suspect section numbers',
      quality.suspectSectionEids.length > 0
        ? `${quality.suspectSectionEids.slice(0, 8).join(', ')}${
            quality.suspectSectionEids.length > 8 ? ` +${quality.suspectSectionEids.length - 8}` : ''
          } (Schedule text mis-numbered)`
        : 'none',
      quality.suspectSectionEids.length > 0 ? 'warn' : 'ok',
    ],
    [
      'Footnotes without a provision link',
      `${quality.orphanedFootnoteCount} of ${quality.footnoteCount} (still reachable from their in-text marker)`,
      quality.orphanedFootnoteCount > 0 ? 'warn' : 'ok',
    ],
    [
      'In-text markers with no footnote',
      quality.danglingFootnoteMarkers.length > 0 ? quality.danglingFootnoteMarkers.join(', ') : 'none',
      quality.danglingFootnoteMarkers.length > 0 ? 'warn' : 'ok',
    ],
  ];

  const relations = Object.entries(quality.relationCounts);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-800">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
            <TriangleAlert className="w-4 h-4 text-amber-600" />
            Source Data Quality
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3 max-h-[65vh] overflow-y-auto">
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            <strong className="text-slate-800 dark:text-slate-200">{activeDocument.title}</strong> is read as
            parsed from its source PDF. These are the known gaps in that parse, so you can judge how much to
            trust the reader against the original.
          </p>

          <table className="w-full text-xs">
            <tbody>
              {rows.map(([label, value, tone]) => (
                <tr key={label} className="border-b border-slate-100 dark:border-slate-800/60 last:border-0">
                  <td className="py-1.5 pr-3 align-top text-slate-500 dark:text-slate-400">{label}</td>
                  <td
                    className={`py-1.5 text-right font-mono ${
                      tone === 'warn' ? 'text-amber-700 dark:text-amber-400' : 'text-slate-800 dark:text-slate-200'
                    }`}
                  >
                    {value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
              Reference types
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {relations.map(([relation, count]) => (
                <span
                  key={relation}
                  className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono text-[11px]"
                >
                  {relation.replace('_', ' ')}: {count}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export type View = 'home' | 'reader';

export const App: React.FC = () => {
  const [view, setView] = useState<View>('home');
  const [activeDocument, setActiveDocument] = useState<StatuteDocument | null>(null);
  const [indexData, setIndexData] = useState<IndexedAknData | null>(null);
  const [isOpeningId, setIsOpeningId] = useState<string | null>(null);
  const [openError, setOpenError] = useState<LibraryError | null>(null);
  const [activeCitation, setActiveCitation] = useState<Citation | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [showQuality, setShowQuality] = useState(false);

  const library = useDocumentLibrary();

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

  const openDocumentById = useCallback(async (target: StatuteDocument) => {
    setIsOpeningId(target.id);
    setOpenError(null);
    try {
      const opened = await openDocument(target);
      setActiveDocument(opened.document);
      setIndexData(opened.indexData);
      setActiveCitation(null);
      setSideViewOpen(false);
      setView('reader');
      window.scrollTo({ top: 0 });
    } catch (caught) {
      if (caught instanceof DocumentLoadError) {
        setOpenError({ title: caught.message, detail: caught.detail });
      } else {
        setOpenError({
          title: `Could not open ${target.shortTitle}.`,
          detail: caught instanceof Error ? caught.message : undefined,
        });
      }
    } finally {
      setIsOpeningId(null);
    }
  }, [setSideViewOpen]);

  /** Adds dropped/picked files, then opens the first one. */
  const handleAddFiles = useCallback(
    async (files: File[]) => {
      setOpenError(null);
      const added = await library.addFiles(files);
      if (added.length > 0) {
        await openDocumentById(added[0]);
      }
    },
    [library, openDocumentById]
  );

  const handleCitationClick = useCallback(
    (citation: Citation) => {
      setActiveCitation(citation);
      setSideViewTab('provision');
      setSideViewOpen(true);
    },
    [setSideViewOpen, setSideViewTab]
  );

  const hierarchyIndex: HierarchyIndex | null = useMemo(
    () => (indexData ? buildHierarchyIndex(indexData) : null),
    [indexData]
  );

  const { activeItem, activeSection, activeEid, scrollToProvision } = useScrollSpy(hierarchyIndex);

  // Deep link. Retried across a few frames because the reader mounts ~1,700
  // provision cards in one commit, so the target may not exist on frame one.
  const jumpToHash = scrollToProvision;
  useEffect(() => {
    if (view !== 'reader' || !indexData) return;
    const hash = window.location.hash.replace(/^#prov-/, '');
    if (!hash) return;

    let attempts = 0;
    const tryScroll = () => {
      if (window.document.getElementById(`prov-${hash}`)) {
        jumpToHash(hash);
        return;
      }
      if (attempts++ < 30) requestAnimationFrame(tryScroll);
    };
    requestAnimationFrame(tryScroll);
  }, [view, indexData, jumpToHash]);

const handleShowBacklinks = useCallback(
    (eid: string) => {
      const provision = indexData?.provisionsByEid.get(eid);
      if (!provision) return;
      // A detached provision belongs to no section, so there is no section-level
      // backlink rollup to open. Its own references are still reachable.
      const sectionEid = provision.topLevelEid;
      const label = sectionEid
        ? `Section ${indexData!.provisionsByEid.get(sectionEid)?.num ?? ''}`.trim()
        : `${provision.kind} ${provision.num || ''}`.trim();
      setActiveCitation(syntheticSelfCitation(eid, label));
      setSideViewTab('backlinks');
      setSideViewOpen(true);
    },
    [indexData, setSideViewOpen, setSideViewTab]
  );

  const handleJumpToMain = useCallback(
    (eid: string) => {
      scrollToProvision(eid);
      if (window.innerWidth < 1024 && !settings.isSideViewPinned) setSideViewOpen(false);
    },
    [scrollToProvision, settings.isSideViewPinned, setSideViewOpen]
  );

  // Single Ctrl/Cmd+K owner. Previously both App and SearchModal registered a
  // listener and composed correctly only because one branch was empty.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setIsSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

const goHome = useCallback(() => {
    setView('home');
    setSideViewOpen(false);
    setActiveCitation(null);
  }, [setSideViewOpen]);

  // Stable identities, so memoised children are not re-rendered whenever App
  // re-renders. App re-renders on every scroll (activeItem changes), and
  // without these the whole reading canvas would be reconciled each time.
  const toggleSideView = useCallback(
    () => setSideViewOpen(!settings.isSideViewOpen),
    [settings.isSideViewOpen, setSideViewOpen]
  );
  const closeSideView = useCallback(() => setSideViewOpen(false), [setSideViewOpen]);
  const openSearch = useCallback(() => setIsSearchOpen(true), []);
  const closeSearch = useCallback(() => setIsSearchOpen(false), []);
  const closeQuality = useCallback(() => setShowQuality(false), []);
  const dismissErrors = useCallback(() => {
    library.dismissError();
    setOpenError(null);
  }, [library]);

  // -- Home ------------------------------------------------------------------
  if (view === 'home' || !indexData || !activeDocument) {
    return (
      <>
        <HomePage
          documents={library.documents}
          isLoadingLibrary={library.isLoading}
          storageAvailable={library.storageAvailable}
          isOpeningId={isOpeningId}
          error={library.error ?? openError}
          onOpen={(target) => void openDocumentById(target)}
          onAddFiles={(files) => void handleAddFiles(files)}
          onRemove={(id) => void library.remove(id)}
          onDismissError={dismissErrors}
        />
        <GlobalDropZone onFiles={(files) => void handleAddFiles(files)} />
      </>
    );
  }

  // -- Reader ----------------------------------------------------------------
  const tab: SideViewTab = settings.sideViewTab;

  return (
    <div className="min-h-screen flex flex-col">
      <Header
        hierarchyIndex={hierarchyIndex}
        activeItem={activeItem}
        onSelectProvision={handleJumpToMain}
        theme={settings.theme}
        onThemeChange={setTheme}
        fontSize={settings.fontSize}
        onFontSizeChange={setFontSize}
        serifFont={settings.serifFont}
        onToggleSerif={toggleSerif}
        isTocOpen={settings.isTocOpen}
        onToggleToc={toggleTocOpen}
        onOpenSearch={openSearch}
        isSideViewOpen={settings.isSideViewOpen}
        onToggleSideView={toggleSideView}
        document={activeDocument}
        onHome={goHome}
      />

      {openError && (
        <div className="flex items-start gap-2 px-4 py-2.5 bg-red-50 dark:bg-red-950/30 border-b border-red-200 dark:border-red-800/60 text-xs text-red-900 dark:text-red-200">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold">{openError.title}</p>
            {openError.detail && <p className="text-red-800 dark:text-red-300">{openError.detail}</p>}
          </div>
          <button type="button" onClick={() => setOpenError(null)} className="p-0.5">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="flex-1 flex relative">
        <SidebarTOC
          hierarchyIndex={hierarchyIndex}
          activeSectionEid={activeSection?.eid ?? activeEid ?? null}
          isOpen={settings.isTocOpen}
          onClose={toggleTocOpen}
          onSelectProvision={handleJumpToMain}
          onShowBacklinks={handleShowBacklinks}
        />

        <div
          className={`flex-1 transition-all duration-200 ${settings.isTocOpen ? 'lg:pl-80' : ''} ${
            settings.isSideViewOpen && settings.isSideViewPinned ? 'xl:pr-[540px]' : ''
          }`}
        >
          <ContinuousReader
            indexData={indexData}
            document={activeDocument}
            onCitationClick={handleCitationClick}
            onShowBacklinks={handleShowBacklinks}
            fontSize={settings.fontSize}
            serifFont={settings.serifFont}
          />
        </div>

<SideViewPanel
          isOpen={settings.isSideViewOpen}
          isPinned={settings.isSideViewPinned}
          activeCitation={activeCitation}
          indexData={indexData}
          document={activeDocument}
          activeTab={tab}
          onTabChange={setSideViewTab}
          onClose={closeSideView}
          onTogglePin={toggleSideViewPinned}
          onJumpToMain={handleJumpToMain}
          onSelectCitation={handleCitationClick}
        />
      </div>

      <button
        type="button"
        onClick={() => setShowQuality(true)}
        className="fixed bottom-3 left-3 z-30 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/90 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 transition-colors shadow-sm"
      >
        <TriangleAlert className="w-3 h-3 text-amber-600" />
        Data quality
        {indexData.quality.unattributedCount > 0 && (
          <span className="px-1.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-mono">
            {indexData.quality.unattributedCount}
          </span>
        )}
      </button>

      {showQuality && (
        <DataQualityPanel
          quality={indexData.quality}
activeDocument={activeDocument}
          onClose={closeQuality}
        />
      )}

      <SearchModal
        isOpen={isSearchOpen}
        onClose={closeSearch}
        indexData={indexData}
        onSelectProvision={handleJumpToMain}
      />

      <GlobalDropZone onFiles={(files) => void handleAddFiles(files)} />
    </div>
  );
};

export default App;