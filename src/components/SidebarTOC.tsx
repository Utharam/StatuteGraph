import React, { useState, useMemo } from 'react';
import { HierarchyIndex, HierarchyNavItem } from '../types/akn';
import { sectionLabel } from '../services/hierarchyBuilder';
import {
  Search,
  X,
  ChevronRight,
  ChevronDown,
  BookOpen,
  GitFork,
  Link2,
  Calendar,
  Inbox,
} from 'lucide-react';

interface SidebarTOCProps {
  hierarchyIndex: HierarchyIndex | null;
  activeSectionEid: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSelectProvision: (eid: string) => void;
  onShowBacklinks: (eid: string) => void;
}

export const SidebarTOC: React.FC<SidebarTOCProps> = ({
  hierarchyIndex,
  activeSectionEid,
  isOpen,
  onClose,
  onSelectProvision,
  onShowBacklinks,
}) => {
  const [filterQuery, setFilterQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showUnattributed, setShowUnattributed] = useState(false);

  const sections = hierarchyIndex?.sections ?? [];
  const groups = hierarchyIndex?.unattributedGroups ?? [];
  const query = filterQuery.trim().toLowerCase();

  /**
   * Filters to sections whose number, title, or any descendant matches.
   * The old filter only looked one level deep, so searching for a clause
   * inside a sub-section returned nothing.
   */
  const filteredSections = useMemo(() => {
    if (!query) return sections;

    const subtreeMatches = (item: HierarchyNavItem): boolean => {
      if (item.num.toLowerCase().includes(query)) return true;
      if (item.title.toLowerCase().includes(query)) return true;
      return item.children.some(subtreeMatches);
    };

    return sections.filter(subtreeMatches);
  }, [sections, query]);

  const matches = (item: HierarchyNavItem): boolean => {
    if (!query) return true;
    return (
      item.num.toLowerCase().includes(query) ||
      item.title.toLowerCase().includes(query) ||
      item.children.some(matches)
    );
  };

  const toggle = (eid: string, event: React.MouseEvent) => {
    event.stopPropagation();
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(eid)) next.delete(eid);
      else next.add(eid);
      return next;
    });
  };

  if (!isOpen) return null;

  const renderRow = (item: HierarchyNavItem, depth: number) => {
    const isActive = activeSectionEid === item.eid;
    const hasChildren = item.children.length > 0;
    // While filtering, everything that matches is expanded so hits are visible.
    const isExpanded = expanded.has(item.eid) || query.length > 0;
    const visibleChildren = query ? item.children.filter(matches) : item.children;

    return (
      <div key={item.eid}>
        <div
          onClick={() => onSelectProvision(item.eid)}
          className={`flex items-start justify-between gap-1.5 py-1.5 px-2 rounded-lg cursor-pointer text-xs transition-colors group ${
            isActive
              ? 'bg-amber-100/80 text-amber-950 dark:bg-amber-950/60 dark:text-amber-100 font-semibold border border-amber-300 dark:border-amber-800'
              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80'
          }`}
          style={{ paddingLeft: `${8 + depth * 12}px` }}
        >
          <div className="flex items-start gap-1.5 min-w-0 flex-1">
            <span
              className={`font-mono text-[10px] px-1 py-0.5 rounded font-bold shrink-0 ${
                isActive
                  ? 'bg-amber-200 text-amber-900 dark:bg-amber-900 dark:text-amber-200'
                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 group-hover:bg-amber-100 group-hover:text-amber-900'
              }`}
            >
              {item.num || item.kind}
            </span>
            <span className="truncate font-serif leading-snug">
              {depth === 0 ? sectionLabel(item) : item.title}
              {depth === 0 && item.title && item.title !== sectionLabel(item) ? (
                <span className="block text-slate-500 dark:text-slate-400 font-normal truncate">{item.title}</span>
              ) : null}
            </span>
          </div>

          <div className="flex items-center gap-0.5 shrink-0">
            {item.incomingFromOtherSectionsCount > 0 && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onShowBacklinks(item.eid);
                }}
                title={`Cited from ${item.incomingFromOtherSectionsCount} other place(s)`}
                className="inline-flex items-center gap-0.5 text-[10px] px-1 py-0.2 rounded bg-indigo-50 text-indigo-700 dark:bg-indigo-950/80 dark:text-indigo-300 font-mono hover:bg-indigo-100"
              >
                <Link2 className="w-2.5 h-2.5" />
                {item.incomingFromOtherSectionsCount}
              </button>
            )}
            {item.outgoingCount > 0 && depth === 0 && (
              <span
                title={`${item.outgoingCount} reference(s) made`}
                className="inline-flex items-center gap-0.5 text-[10px] px-1 py-0.2 rounded bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 font-mono"
              >
                <GitFork className="w-2.5 h-2.5" />
                {item.outgoingCount}
              </span>
            )}
            {hasChildren && (
              <button
                type="button"
                onClick={(event) => toggle(item.eid, event)}
                className="p-0.5 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                aria-label={isExpanded ? 'Collapse' : 'Expand'}
              >
                {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>
        </div>

        {hasChildren && isExpanded && visibleChildren.length > 0 && (
          <div className="my-0.5 space-y-0.5 border-l border-slate-200 dark:border-slate-800 ml-3">
            {visibleChildren.map((child) => renderRow(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <aside
      className="fixed top-16 left-0 bottom-0 z-40 w-80 sm:w-88 flex flex-col bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shadow-xl transition-all duration-200"
      aria-label="Table of Contents"
    >
      <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-amber-600" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
            Table of Contents
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          title="Close Table of Contents"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Filter (e.g. 37, return, levy)..."
            value={filterQuery}
            onChange={(event) => setFilterQuery(event.target.value)}
            className="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
          />
          {filterQuery && (
            <button
              type="button"
              onClick={() => setFilterQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-400">
          <span>
            {query ? `${filteredSections.length} matching` : `${sections.length} sections`}
          </span>
          <span>Index: Sec &bull; Sub &bull; Cl</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {filteredSections.length === 0 ? (
          <p className="p-6 text-center text-xs text-slate-400">Nothing matches &ldquo;{filterQuery}&rdquo;.</p>
        ) : (
          filteredSections.map((section) => renderRow(section, 0))
        )}

        {/* Unattributed provisions: present but not filed under a section. */}
        {groups.length > 0 && (
          <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setShowUnattributed((prev) => !prev)}
              className="w-full flex items-center justify-between gap-2 px-2 py-2 rounded-lg text-xs font-semibold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"
            >
              <span className="flex items-center gap-1.5">
                <Inbox className="w-3.5 h-3.5" />
                Unattributed text ({hierarchyIndex?.unattributedCount ?? 0})
              </span>
              {showUnattributed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
            <p className="px-2 mt-1 text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
              Belongs to sections 1&ndash;31, which the parser never emitted. Listed in page order.
            </p>

            {showUnattributed &&
              groups.map((group) => (
                <div key={group.id} className="mt-2 space-y-0.5">
                  <div className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    <Calendar className="w-3 h-3" />
                    Page {group.page}
                  </div>
                  {group.items.map((item) => (
                    <button
                      key={item.eid}
                      type="button"
                      onClick={() => onSelectProvision(item.eid)}
                      className="w-full text-left flex items-center gap-1.5 px-2 py-1 rounded text-[11px] text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 truncate"
                    >
                      <span className="font-mono font-medium text-slate-800 dark:text-slate-300 shrink-0">
                        {item.num || item.kind}
                      </span>
                      <span className="truncate font-serif">{item.title}</span>
                    </button>
                  ))}
                </div>
              ))}
          </div>
        )}
      </div>
    </aside>
  );
};