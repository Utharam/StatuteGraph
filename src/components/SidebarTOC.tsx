import React, { useState, useMemo } from 'react';
import { HierarchyIndex } from '../services/hierarchyBuilder';
import {
  Search,
  X,
  ChevronRight,
  ChevronDown,
  BookOpen,
  GitFork,
  Calendar,
} from 'lucide-react';

interface SidebarTOCProps {
  hierarchyIndex: HierarchyIndex | null;
  activeSectionEid: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSelectProvision: (eid: string) => void;
}

export const SidebarTOC: React.FC<SidebarTOCProps> = ({
  hierarchyIndex,
  activeSectionEid,
  isOpen,
  onClose,
  onSelectProvision,
}) => {
  const [filterQuery, setFilterQuery] = useState('');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  const sections = hierarchyIndex?.sections || [];

  // Filter sections based on query
  const filteredSections = useMemo(() => {
    if (!filterQuery.trim()) return sections;
    const q = filterQuery.toLowerCase();
    return sections.filter(
      (sec) =>
        sec.num.toLowerCase().includes(q) ||
        sec.title.toLowerCase().includes(q) ||
        sec.subsections.some((sub) => sub.title.toLowerCase().includes(q) || sub.num.toLowerCase().includes(q))
    );
  }, [sections, filterQuery]);

  const toggleExpand = (eid: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(eid)) {
        next.delete(eid);
      } else {
        next.add(eid);
      }
      return next;
    });
  };

  if (!isOpen) return null;

  return (
    <aside
      className="fixed top-16 left-0 bottom-0 z-40 w-80 sm:w-88 flex flex-col bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shadow-xl transition-all duration-200"
      aria-label="Table of Contents"
    >
      {/* Sidebar Header */}
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

      {/* Filter / Search Bar */}
      <div className="p-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Filter sections (e.g., 37, return, levy)..."
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
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
          <span>{filteredSections.length} items found</span>
          <span>Index: Sec &bull; Sub &bull; Cl</span>
        </div>
      </div>

      {/* Sections List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {filteredSections.map((sec) => {
          const isActive = activeSectionEid === sec.eid;
          const isExpanded = expandedSections.has(sec.eid) || filterQuery.trim().length > 0;
          const hasChildren = sec.subsections.length > 0;

          return (
            <div key={sec.eid} className="rounded-lg transition-colors">
              <div
                onClick={() => onSelectProvision(sec.eid)}
                className={`flex items-start justify-between gap-2 p-2 rounded-lg cursor-pointer text-xs transition-colors group ${
                  isActive
                    ? 'bg-amber-100/80 text-amber-950 dark:bg-amber-950/60 dark:text-amber-100 font-semibold border border-amber-300 dark:border-amber-800'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80'
                }`}
              >
                <div className="flex items-start gap-2 flex-1 min-w-0">
                  <span
                    className={`font-mono text-[11px] px-1.5 py-0.5 rounded font-bold shrink-0 ${
                      isActive
                        ? 'bg-amber-200 text-amber-900 dark:bg-amber-900 dark:text-amber-200'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 group-hover:bg-amber-100 group-hover:text-amber-900'
                    }`}
                  >
                    {sec.kind === 'schedule' ? `Sch ${sec.num}` : `§ ${sec.num}`}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-serif leading-snug">
                      {sec.title}
                    </div>
                    {sec.page && (
                      <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                        <Calendar className="w-2.5 h-2.5" />
                        <span>p. {sec.page}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {sec.citationCount > 0 && (
                    <span
                      className="inline-flex items-center gap-0.5 text-[10px] px-1 py-0.2 rounded bg-indigo-50 text-indigo-700 dark:bg-indigo-950/80 dark:text-indigo-300 font-mono"
                      title={`${sec.citationCount} outgoing citations`}
                    >
                      <GitFork className="w-2.5 h-2.5" />
                      {sec.citationCount}
                    </span>
                  )}
                  {hasChildren && (
                    <button
                      type="button"
                      onClick={(e) => toggleExpand(sec.eid, e)}
                      className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* Sub-sections tree */}
              {hasChildren && isExpanded && (
                <div className="pl-4 ml-3 my-1 border-l-2 border-slate-200 dark:border-slate-800 space-y-0.5">
                  {sec.subsections.map((sub) => (
                    <div key={sub.eid}>
                      <button
                        type="button"
                        onClick={() => onSelectProvision(sub.eid)}
                        className="w-full text-left p-1.5 rounded text-[11px] text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-indigo-600 flex items-center justify-between gap-1 transition-colors"
                      >
                        <span className="font-mono font-medium text-slate-800 dark:text-slate-300">
                          {sub.num || sub.kind}
                        </span>
                        <span className="truncate flex-1 text-slate-500 font-serif">
                          {sub.title.slice(0, 26)}
                        </span>
                      </button>

                      {/* Clauses under subsection */}
                      {sub.clauses.length > 0 && (
                        <div className="pl-3 ml-2 border-l border-slate-200 dark:border-slate-800 space-y-0.5">
                          {sub.clauses.map((cl) => (
                            <button
                              key={cl.eid}
                              type="button"
                              onClick={() => onSelectProvision(cl.eid)}
                              className="w-full text-left py-0.5 px-1.5 rounded text-[10px] text-slate-500 hover:text-indigo-500 flex items-center gap-1.5 truncate"
                            >
                              <span className="font-mono text-slate-700 dark:text-slate-400">
                                {cl.num || cl.kind}
                              </span>
                              <span className="truncate font-serif">
                                {cl.title.slice(0, 20)}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
};
