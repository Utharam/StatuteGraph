import React, { useState, useEffect } from 'react';
import { Citation, ResolvedCitationTarget } from '../types/akn';
import { IndexedAknData, resolveCitation, cleanStatuteText } from '../services/aknLoader';
import { NestedCitationTree } from './NestedCitationTree';
import { StatuteTextRenderer } from './StatuteTextRenderer';
import {
  X,
  Pin,
  PinOff,
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  BookOpen,
  CornerDownRight,
  GitFork,
  FileText,
} from 'lucide-react';

interface SideViewPanelProps {
  isOpen: boolean;
  isPinned: boolean;
  activeCitation: Citation | null;
  indexData: IndexedAknData;
  activeTab: 'provision' | 'nest';
  onTabChange: (tab: 'provision' | 'nest') => void;
  onClose: () => void;
  onTogglePin: () => void;
  onJumpToMain: (eid: string) => void;
  onSelectCitation: (citation: Citation) => void;
}

export const SideViewPanel: React.FC<SideViewPanelProps> = ({
  isOpen,
  isPinned,
  activeCitation,
  indexData,
  activeTab,
  onTabChange,
  onClose,
  onTogglePin,
  onJumpToMain,
  onSelectCitation,
}) => {
  // Navigation history inside side view
  const [history, setHistory] = useState<Citation[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const isNavigatingHistory = React.useRef<boolean>(false);

  const isSameCitation = (a: Citation | null, b: Citation | null): boolean => {
    if (a === b) return true;
    if (!a || !b) return false;
    return a.target_eid === b.target_eid && a.parent_eid === b.parent_eid && a.raw_text === b.raw_text;
  };

  // Sync activeCitation into history when it changes from outside
  useEffect(() => {
    if (!activeCitation) return;

    if (isNavigatingHistory.current) {
      isNavigatingHistory.current = false;
      return;
    }

    setHistory(prev => {
      // If it's already the current active item, don't duplicate
      if (historyIndex >= 0 && historyIndex < prev.length && isSameCitation(prev[historyIndex], activeCitation)) {
        return prev;
      }
      const next = [...prev.slice(0, historyIndex + 1), activeCitation];
      setHistoryIndex(next.length - 1);
      return next;
    });
  }, [activeCitation, historyIndex]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isPinned) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isPinned, onClose]);

  if (!isOpen || !activeCitation) {
    return null;
  }

  const currentCitation = (historyIndex >= 0 && historyIndex < history.length) ? history[historyIndex] : activeCitation;
  const resolved: ResolvedCitationTarget = resolveCitation(currentCitation, indexData);

  const canGoBack = historyIndex > 0;
  const canGoForward = historyIndex >= 0 && historyIndex < history.length - 1;

  const handleBack = () => {
    if (canGoBack) {
      const prevIndex = historyIndex - 1;
      const target = history[prevIndex];
      isNavigatingHistory.current = true;
      setHistoryIndex(prevIndex);
      onSelectCitation(target);
    }
  };

  const handleForward = () => {
    if (canGoForward) {
      const nextIndex = historyIndex + 1;
      const target = history[nextIndex];
      isNavigatingHistory.current = true;
      setHistoryIndex(nextIndex);
      onSelectCitation(target);
    }
  };

  const outgoingCitations = resolved.citations || [];

  return (
    <aside
      className={`fixed top-16 right-0 bottom-0 z-40 w-full sm:w-[480px] lg:w-[540px] flex flex-col bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl transition-transform duration-200 ease-in-out ${
        isPinned ? 'lg:shadow-none' : ''
      }`}
      aria-label="Statutory Side View"
    >
      {/* Panel Top Action Bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/90 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleBack}
            disabled={!canGoBack}
            className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none transition-colors"
            title="Go back in citation history"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleForward}
            disabled={!canGoForward}
            className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none transition-colors"
            title="Go forward in citation history"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">
            Side View Peek
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onTogglePin}
            className={`p-1.5 rounded-lg transition-colors ${
              isPinned
                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                : 'text-slate-500 hover:bg-slate-200/70 dark:hover:bg-slate-800'
            }`}
            title={isPinned ? 'Unpin side panel' : 'Pin side panel open'}
          >
            {isPinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors"
            title="Close side view (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Target Title & Main Jump */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-amber-50/30 dark:bg-slate-900/40 shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                {resolved.isExternal ? 'External Statute' : 'Referenced Provision'}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                {currentCitation.target_eid}
              </span>
            </div>
            <h2 className="font-serif font-bold text-lg text-slate-900 dark:text-slate-100 leading-snug">
              {resolved.displayTitle}
            </h2>
          </div>

          {resolved.provision && (
            <button
              type="button"
              onClick={() => onJumpToMain(resolved.provision!.eid)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm shrink-0 transition-colors"
              title="Scroll main canvas to this provision"
            >
              <CornerDownRight className="w-3.5 h-3.5" />
              <span>Jump to in Main View</span>
            </button>
          )}
        </div>

        {/* Tab Buttons */}
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-200/60 dark:border-slate-800/60">
          <button
            type="button"
            onClick={() => onTabChange('provision')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activeTab === 'provision'
                ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs border border-slate-200 dark:border-slate-700'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Provision Text</span>
          </button>
          <button
            type="button"
            onClick={() => onTabChange('nest')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activeTab === 'nest'
                ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs border border-slate-200 dark:border-slate-700'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <GitFork className="w-3.5 h-3.5" />
            <span>Nest View (Up to 6 Levels)</span>
          </button>
        </div>
      </div>

      {/* Main Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
        {activeTab === 'provision' ? (
          <div>
            {/* If external act */}
            {resolved.isExternal && (
              <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 space-y-2 mb-4">
                <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200 font-semibold text-sm">
                  <ExternalLink className="w-4 h-4 text-amber-600" />
                  <span>External Legislation Cross-Reference</span>
                </div>
                <p className="text-xs sm:text-sm text-amber-950 dark:text-amber-300 statute-text leading-relaxed">
                  {resolved.previewSnippet}
                </p>
                <div className="text-[11px] text-amber-800 dark:text-amber-400 italic">
                  Note: This provision belongs to an independent Act referenced by the Central Goods and Services Tax Act.
                </div>
              </div>
            )}

            {/* Statutory provision text */}
            {resolved.provision ? (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 shadow-xs">
                  <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>Statutory Text</span>
                  </div>
                  <StatuteTextRenderer
                    text={resolved.provision.text}
                    citations={resolved.citations}
                    footnotes={resolved.footnotes}
                    footnotesByNumber={indexData.footnotesByNumber}
                    onCitationClick={onSelectCitation}
                    className="text-sm sm:text-base leading-relaxed text-slate-800 dark:text-slate-200 font-serif"
                  />
                </div>

                {/* Subsections or clauses under this provision */}
                {resolved.provision.children && resolved.provision.children.length > 0 && (
                  <div className="space-y-2 pt-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Clauses & Sub-provisions ({resolved.provision.children.length})
                    </h3>
                    <div className="space-y-2 pl-3 border-l-2 border-indigo-200 dark:border-indigo-800">
                      {resolved.provision.children.map((child) => (
                        <div
                          key={child.eid}
                          className="p-3 rounded-lg bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm"
                        >
                          <div className="font-semibold text-indigo-700 dark:text-indigo-400 mb-1">
                            {child.num || child.kind}
                          </div>
                          <StatuteTextRenderer
                            text={child.text}
                            citations={child.citations || indexData.citationsByParent.get(child.eid)}
                            footnotesByNumber={indexData.footnotesByNumber}
                            onCitationClick={onSelectCitation}
                            className="font-serif text-slate-800 dark:text-slate-200"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Outgoing Citations from this provision */}
                {outgoingCitations.length > 0 && (
                  <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2.5 flex items-center gap-1.5">
                      <GitFork className="w-3.5 h-3.5 text-indigo-500" />
                      <span>Outgoing Citations From This Section ({outgoingCitations.length})</span>
                    </h3>
                    <div className="space-y-1.5">
                      {outgoingCitations.map((c, i) => (
                        <button
                          key={`${c.target_eid}-${i}`}
                          type="button"
                          onClick={() => onSelectCitation(c)}
                          className="w-full text-left p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 hover:bg-indigo-50/60 dark:hover:bg-indigo-950/40 hover:border-indigo-300 transition-colors flex items-center justify-between text-xs"
                        >
                          <span className="font-serif font-medium text-slate-800 dark:text-slate-200">
                            {c.raw_text}
                          </span>
                          <span className="text-[11px] font-mono text-slate-400">
                            {c.target_eid}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : !resolved.isExternal ? (
              <div className="p-4 text-center text-sm text-slate-500">
                {cleanStatuteText(resolved.previewSnippet) || 'No statutory text available for this reference.'}
              </div>
            ) : null}
          </div>
        ) : (
          /* 6-Level Recursive Nest View */
          <NestedCitationTree
            rootCitation={currentCitation}
            indexData={indexData}
            onSelectCitation={onSelectCitation}
            onJumpToProvision={onJumpToMain}
          />
        )}
      </div>
    </aside>
  );
};
