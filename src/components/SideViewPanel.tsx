import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Citation, ResolvedCitationTarget, SideViewTab } from '../types/akn';
import { IndexedAknData, resolveCitation, cleanStatuteText } from '../services/aknLoader';
import { StatuteDocument } from '../services/documentLibrary';
import { relationPresentation } from '../services/citationEngine';
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
  Link2,
  AlertTriangle,
  ArrowRightLeft,
  Gavel,
} from 'lucide-react';

interface SideViewPanelProps {
  isOpen: boolean;
  isPinned: boolean;
  activeCitation: Citation | null;
  indexData: IndexedAknData;
  /**
   * The Act currently open, used for naming it in prose.
   *
   * Required, not optional: this was optional, App never passed it, and every
   * foreign reference then read "this Act" in production while the test that
   * covered it passed the prop by hand. Making it required turns that omission
   * into a build failure.
   */
  document: StatuteDocument;
  activeTab: SideViewTab;
  onTabChange: (tab: SideViewTab) => void;
  onClose: () => void;
  onTogglePin: () => void;
  onJumpToMain: (eid: string) => void;
  onSelectCitation: (citation: Citation) => void;
}

function isSameCitation(a: Citation | null, b: Citation | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.parentEid === b.parentEid && a.rawText === b.rawText && a.span[0] === b.span[0];
}

/**
 * Memoised: the panel resolves citations by walking a subtree, so re-rendering it
 * on every scroll event was pure waste. All props are stable callbacks.
 */
export const SideViewPanel = React.memo(function SideViewPanel({
  isOpen,
  isPinned,
  activeCitation,
  indexData,
  document,
  activeTab,
  onTabChange,
  onClose,
  onTogglePin,
  onJumpToMain,
  onSelectCitation,
}: SideViewPanelProps) {
  const [history, setHistory] = useState<Citation[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const isNavigatingHistory = useRef(false);

  // Push externally-arrived citations onto the history stack.
  //
  // The previous version called setHistoryIndex from inside the setHistory
  // updater. React forbids that: updaters must be pure, and StrictMode
  // double-invokes them. History is now derived from a single state update.
  useEffect(() => {
    if (!activeCitation) return;

    if (isNavigatingHistory.current) {
      isNavigatingHistory.current = false;
      return;
    }

    setHistory((prev) => {
      const current = prev[historyIndex];
      if (current && isSameCitation(current, activeCitation)) return prev;
      const next = [...prev.slice(0, historyIndex + 1), activeCitation];
      setHistoryIndex(next.length - 1);
      return next;
    });
    // historyIndex is read inside; including it would re-push on every move.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCitation]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen && !isPinned) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isPinned, onClose]);

  const currentCitation = useMemo(() => {
    if (historyIndex >= 0 && historyIndex < history.length) return history[historyIndex];
    return activeCitation;
  }, [history, historyIndex, activeCitation]);

  // Resolving walks the target's subtree, so it is memoised per citation rather
  // than recomputed on every render.
  const resolved: ResolvedCitationTarget | null = useMemo(
    () => (currentCitation ? resolveCitation(currentCitation, indexData) : null),
    [currentCitation, indexData]
  );

  const sectionEid = resolved?.target.scope === 'internal' ? (resolved.provision?.topLevelEid ?? null) : null;

  const backlinks = useMemo(() => {
    if (!sectionEid) return [];
    return indexData.incomingFromOtherSections.get(sectionEid) ?? [];
  }, [indexData, sectionEid]);

const ownOutgoing = resolved?.ownCitations ?? [];
  const incomingCount = resolved?.provision
    ? indexData.citationsByTarget.get(resolved.provision.eid)?.length ?? 0
    : 0;

  // Whichever Act is open, named from its own metadata.
  const shortActName = document.shortTitle || document.title || 'This Act';

  const canGoBack = historyIndex > 0;
  const canGoForward = historyIndex >= 0 && historyIndex < history.length - 1;

  const navigateHistory = (nextIndex: number) => {
    const target = history[nextIndex];
    if (!target) return;
    isNavigatingHistory.current = true;
    setHistoryIndex(nextIndex);
    onSelectCitation(target);
  };

  if (!isOpen || !activeCitation || !resolved || !currentCitation) return null;

  const target = resolved.target;
  const tabButton = (tab: SideViewTab, label: string, Icon: React.ElementType, badge?: number) => (
    <button
      type="button"
      onClick={() => onTabChange(tab)}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
        activeTab === tab
          ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm border border-slate-200 dark:border-slate-700'
          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
      <span>{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="px-1.5 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-[10px] font-mono text-slate-600 dark:text-slate-300">
          {badge}
        </span>
      )}
    </button>
  );

  return (
    <aside
      className={`fixed top-16 right-0 bottom-0 z-40 w-full sm:w-[480px] lg:w-[540px] flex flex-col bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl transition-transform duration-200 ease-in-out ${
        isPinned ? 'lg:shadow-none' : ''
      }`}
      aria-label="Statutory Side View"
    >
      {/* Action bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/90 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => navigateHistory(historyIndex - 1)}
            disabled={!canGoBack}
            className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none transition-colors"
            title="Go back in citation history"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => navigateHistory(historyIndex + 1)}
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

      {/* Title, provenance and jump */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-amber-50/30 dark:bg-slate-900/40 shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span
                className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                  resolved.isExternal
                    ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800'
                    : target.scope === 'unresolved'
                    ? 'bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                    : 'bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-950 dark:text-indigo-300 dark:border-indigo-800'
                }`}
              >
                {resolved.isExternal
                  ? 'Other Act'
                  : target.scope === 'unresolved'
                  ? 'Not in dataset'
                  : 'This Act'}
              </span>

              {currentCitation.relation !== 'reference' && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                  {relationPresentation(currentCitation.relation).label}
                </span>
              )}

              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate">
                {resolved.provision?.eid ?? (target.scope === 'external' ? target.actName : '—')}
              </span>
            </div>

            <h2 className="font-serif font-bold text-lg text-slate-900 dark:text-slate-100 leading-snug">
              {resolved.displayTitle}
            </h2>

            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 italic">
              Cited as &ldquo;{resolved.citedAs}&rdquo;
            </p>
          </div>

          {resolved.provision && (
            <button
              type="button"
              onClick={() => onJumpToMain(resolved.provision!.eid)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm shrink-0 transition-colors"
              title="Scroll the main canvas to this provision"
            >
              <CornerDownRight className="w-3.5 h-3.5" />
              <span>Jump to in Main View</span>
            </button>
          )}
        </div>

        {/* Honest notice when we had to step down to the parent section. */}
        {target.scope === 'internal' && target.resolution === 'section-level' && (
          <div className="mt-3 flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-900 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-200">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              This citation names <strong>{target.degradedFrom}</strong>, which the parser did not extract as a
              separate provision. Showing the enclosing section instead.
            </span>
          </div>
        )}

        {/* Tabs */}
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-200/60 dark:border-slate-800/60 overflow-x-auto">
          {tabButton('provision', 'Provision Text', FileText)}
          {tabButton('backlinks', 'Cited Elsewhere', Link2, backlinks.length || incomingCount)}
          {tabButton('nest', 'Nest View', GitFork)}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-5">
        {activeTab === 'provision' && (
          <div className="space-y-4">
            {resolved.isExternal && (
              <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 space-y-2">
                <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200 font-semibold text-sm">
                  <ExternalLink className="w-4 h-4 text-amber-600" />
                  <span>Reference to another Act</span>
                </div>
                <p className="text-xs sm:text-sm text-amber-950 dark:text-amber-300 leading-relaxed">
                  {resolved.previewSnippet}
                </p>
                {target.scope === 'external' && target.provisionRef && (
                  <p className="text-xs font-medium text-amber-900 dark:text-amber-200">
                    Provision cited: {target.provisionRef} of {target.actName}
                  </p>
                )}
<p className="text-[11px] text-amber-800 dark:text-amber-400 italic">
                  {/*
                    Named from the document that is actually open. This used to
                    say "the CGST Act" unconditionally, which was simply false
                    for every other statute the reader can load.
                  */}
                  This is not a provision of {shortActName}. {shortActName} contains no text for it.
                </p>
              </div>
            )}

            {target.scope === 'unresolved' && !resolved.isExternal && (
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 space-y-2">
                <div className="flex items-center gap-2 font-semibold">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  <span>Target unavailable</span>
                </div>
                <p>{resolved.previewSnippet}</p>
                {target.attemptedEid && (
                  <p className="font-mono text-[11px] text-slate-400">parser target: {target.attemptedEid}</p>
                )}
              </div>
            )}

            {resolved.provision && (
              <>
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 shadow-sm">
                  <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>Statutory Text</span>
                  </div>
                  {/* Own citations only: descendant spans index other strings. */}
                  <StatuteTextRenderer
                    text={resolved.provision.text}
                    citations={resolved.ownCitations}
                    footnotesByNumber={indexData.footnotesByNumber}
                    onCitationClick={onSelectCitation}
                    className="text-sm sm:text-base leading-relaxed text-slate-800 dark:text-slate-200 font-serif"
                  />
                </div>

                {resolved.provision.children.length > 0 && (
                  <div className="space-y-2 pt-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Sub-provisions ({resolved.provision.children.length})
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
                            citations={child.citations}
                            footnotesByNumber={indexData.footnotesByNumber}
                            onCitationClick={onSelectCitation}
                            className="font-serif text-slate-800 dark:text-slate-200"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {ownOutgoing.length > 0 && (
                  <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2.5 flex items-center gap-1.5">
                      <GitFork className="w-3.5 h-3.5 text-indigo-500" />
                      <span>Outgoing Citations From This Provision ({ownOutgoing.length})</span>
                    </h3>
                    <div className="space-y-1.5">
                      {ownOutgoing.map((citation) => (
                        <button
                          key={citation.id}
                          type="button"
                          onClick={() => onSelectCitation(citation)}
                          className="w-full text-left p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 hover:bg-indigo-50/60 dark:hover:bg-indigo-950/40 hover:border-indigo-300 transition-colors flex items-center justify-between gap-2 text-xs"
                        >
                          <span className="font-serif font-medium text-slate-800 dark:text-slate-200 truncate">
                            {citation.rawText}
                          </span>
                          <RelationChip relation={citation.relation} scope={citation.target.scope} />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === 'backlinks' && (
          <BacklinksPanel
            indexData={indexData}
            sectionEid={sectionEid}
            backlinks={backlinks}
            onSelectCitation={onSelectCitation}
            onJumpToMain={onJumpToMain}
          />
        )}

        {activeTab === 'nest' && (
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
});
/** Small inline badge describing a citation's relation and scope. */
const RelationChip: React.FC<{ relation: Citation['relation']; scope: Citation['target']['scope'] }> = ({
  relation,
  scope,
}) => {
  if (scope === 'external') {
    return (
      <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
        other Act
      </span>
    );
  }
  if (scope === 'unresolved') {
    return (
      <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
        n/a
      </span>
    );
  }
  if (relation === 'subject_to') {
    return (
      <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300">
        <ArrowRightLeft className="w-2.5 h-2.5" /> subject to
      </span>
    );
  }
  if (relation === 'notwithstanding') {
    return (
      <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
        <Gavel className="w-2.5 h-2.5" /> overrides
      </span>
    );
  }
  return null;
};

interface BacklinksPanelProps {
  indexData: IndexedAknData;
  sectionEid: string | null;
  backlinks: Citation[];
  onSelectCitation: (citation: Citation) => void;
  onJumpToMain: (eid: string) => void;
}

/**
 * "Found in other sections too."
 *
 * This is the half of cross-referencing the reader never had: there was no
 * reverse index anywhere, so every provision's incoming references were
 * unreachable. Grouped by the *citing* section, because the useful question is
 * "which other provisions point at this one, and what do they say".
 */
const BacklinksPanel: React.FC<BacklinksPanelProps> = ({
  indexData,
  sectionEid,
  backlinks,
  onSelectCitation,
  onJumpToMain,
}) => {
  if (!sectionEid) {
    return (
      <div className="p-6 text-center text-sm text-slate-500 dark:text-slate-400 space-y-2">
        <AlertTriangle className="w-6 h-6 mx-auto text-amber-500" />
        <p>This reference does not point at a provision of this Act, so it has no incoming references here.</p>
      </div>
    );
  }

  const target = indexData.provisionsByEid.get(sectionEid);
  const sameSection = (indexData.incomingBySection.get(sectionEid) ?? []).filter(
    (citation) => indexData.provisionsByEid.get(citation.parentEid)?.topLevelEid !== sectionEid
  );

  const groups = new Map<string, Citation[]>();
  for (const citation of backlinks) {
    const authorTop = indexData.provisionsByEid.get(citation.parentEid)?.topLevelEid ?? citation.parentEid;
    const list = groups.get(authorTop);
    if (list) list.push(citation);
    else groups.set(authorTop, [citation]);
  }

  const ordered = Array.from(groups.entries()).sort((a, b) => b[1].length - a[1].length);

  return (
    <div className="space-y-4">
      <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/60">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-indigo-800 dark:text-indigo-300">
            Cited Elsewhere
          </span>
          <span className="font-mono text-lg font-bold text-indigo-700 dark:text-indigo-300">
            {sameSection.length}
          </span>
        </div>
        <p className="mt-1 text-[11px] text-indigo-900/80 dark:text-indigo-200/80">
          {target ? `${target.num ? `Section ${target.num}` : target.title} ` : ''}
          is referred to from {ordered.length} other {ordered.length === 1 ? 'section' : 'sections'}.
        </p>
      </div>

      {backlinks.length === 0 ? (
        <div className="p-6 text-center text-sm text-slate-500 dark:text-slate-400">
          No other provision in this Act cites this one.
        </div>
      ) : (
        <div className="space-y-3">
          {ordered.map(([authorSectionEid, list]) => {
            const authorSection = indexData.provisionsByEid.get(authorSectionEid);
            const label = authorSection
              ? `${authorSection.num ? `§ ${authorSection.num}` : authorSection.title} · ${authorSection.title}`
              : authorSectionEid;

            return (
              <div key={authorSectionEid} className="space-y-1.5">
                <button
                  type="button"
                  onClick={() => onJumpToMain(authorSectionEid)}
                  className="w-full text-left flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                >
                  <span className="font-mono text-[11px] font-bold text-slate-700 dark:text-slate-200 truncate">
                    {label.slice(0, 70)}
                  </span>
                  <span className="shrink-0 text-[10px] font-mono text-slate-500 dark:text-slate-400">
                    {list.length} ref{list.length > 1 ? 's' : ''}
                  </span>
                </button>

                <div className="space-y-1 pl-3 border-l-2 border-slate-200 dark:border-slate-700">
                  {list.map((citation) => {
                    const citedIn = indexData.provisionsByEid.get(citation.parentEid);
                    return (
                      <button
                        key={citation.id}
                        type="button"
                        onClick={() => onSelectCitation(citation)}
                        title={citation.rawText}
                        className="w-full text-left px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/70 hover:border-indigo-300 dark:hover:border-indigo-700 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/30 transition-colors space-y-1"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 truncate">
                            {citedIn ? `${citedIn.num || citedIn.kind}` : citation.parentEid}
                          </span>
                          <RelationChip relation={citation.relation} scope={citation.target.scope} />
                        </div>
                        <div className="text-[11px] font-serif text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                          {cleanStatuteText(citedIn?.text ?? '').slice(0, 150) || '—'}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};