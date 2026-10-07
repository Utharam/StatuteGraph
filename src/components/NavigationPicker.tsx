import React from 'react';
import {
  HierarchySectionItem,
  HierarchySubsectionItem,
  HierarchyClauseItem,
} from '../types/akn';
import { HierarchyIndex } from '../services/hierarchyBuilder';

export interface NavigationPickerProps {
  hierarchyIndex: HierarchyIndex | null;
  activeSection: HierarchySectionItem | null;
  activeSubsection: HierarchySubsectionItem | null;
  activeClause: HierarchyClauseItem | null;
  onSelectProvision: (eid: string) => void;
}

export function formatSectionOptionLabel(sec: HierarchySectionItem): string {
  let prefix = '';
  if (sec.kind === 'schedule') {
    prefix = `Schedule ${sec.num}`;
  } else if (sec.kind === 'chapter') {
    prefix = sec.num === 'PREAMBLE' ? 'Preamble' : `Ch ${sec.num}`;
  } else if (sec.kind === 'section') {
    prefix = `Sec ${sec.num}`;
  } else if (sec.kind === 'subsection') {
    prefix = `Sub-sec ${sec.num}`;
  } else if (sec.kind === 'clause') {
    prefix = `Clause ${sec.num}`;
  } else {
    prefix = sec.num ? `${sec.kind.toUpperCase()} ${sec.num}` : sec.kind;
  }

  const cleanTitle = sec.title.replace(/^(Section|Sub-section|Clause|Schedule)\s+\w+[:.]?\s*/i, '');
  return `${prefix}${cleanTitle ? `: ${cleanTitle.slice(0, 34)}` : ''}`;
}

export const NavigationPicker: React.FC<NavigationPickerProps> = ({
  hierarchyIndex,
  activeSection,
  activeSubsection,
  activeClause,
  onSelectProvision,
}) => {
  const sections = hierarchyIndex?.sections || [];
  const subsections = activeSection?.subsections || [];
  const clauses = activeSubsection?.clauses || [];

  return (
    <nav
      className="flex-1 max-w-2xl flex items-center gap-1.5 sm:gap-2 overflow-x-auto py-1 no-scrollbar"
      aria-label="Provision Navigation Hierarchy"
    >
      {/* Tier 1: Section / Primary Provision Picker */}
      <div className="relative min-w-[130px] sm:min-w-[160px] flex-1">
        <select
          value={activeSection?.eid || ''}
          onChange={(e) => {
            if (e.target.value) onSelectProvision(e.target.value);
          }}
          className="w-full text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500/50 cursor-pointer truncate shadow-2xs"
          title="Select Section or Schedule"
          aria-label="Select Section or Schedule"
        >
          <option value="" disabled>
            Select Section
          </option>
          {sections.map((sec) => (
            <option key={sec.eid} value={sec.eid}>
              {formatSectionOptionLabel(sec)}
            </option>
          ))}
        </select>
      </div>

      <span className="text-slate-300 dark:text-slate-600 text-xs font-bold shrink-0 select-none">
        /
      </span>

      {/* Tier 2: Sub-section Picker */}
      <div className="relative min-w-[100px] sm:min-w-[130px] flex-1">
        <select
          value={activeSubsection?.eid || ''}
          disabled={subsections.length === 0}
          onChange={(e) => {
            if (e.target.value) onSelectProvision(e.target.value);
          }}
          className="w-full text-xs font-medium px-2 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-amber-500/50 cursor-pointer truncate shadow-2xs"
          title="Select Sub-section"
          aria-label="Select Sub-section"
        >
          <option value="">
            {subsections.length === 0 ? 'No Sub-sec' : 'Sub-section'}
          </option>
          {subsections.map((sub) => (
            <option key={sub.eid} value={sub.eid}>
              {sub.num || sub.kind}: {sub.title.slice(0, 26)}
            </option>
          ))}
        </select>
      </div>

      <span className="text-slate-300 dark:text-slate-600 text-xs font-bold shrink-0 select-none">
        /
      </span>

      {/* Tier 3: Clause Picker */}
      <div className="relative min-w-[90px] sm:min-w-[120px] flex-1">
        <select
          value={activeClause?.eid || ''}
          disabled={clauses.length === 0}
          onChange={(e) => {
            if (e.target.value) onSelectProvision(e.target.value);
          }}
          className="w-full text-xs font-medium px-2 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-amber-500/50 cursor-pointer truncate shadow-2xs"
          title="Select Clause"
          aria-label="Select Clause"
        >
          <option value="">
            {clauses.length === 0 ? 'No Clause' : 'Clause'}
          </option>
          {clauses.map((cl) => (
            <option key={cl.eid} value={cl.eid}>
              {cl.num || cl.kind}: {cl.title.slice(0, 24)}
            </option>
          ))}
        </select>
      </div>
    </nav>
  );
};
