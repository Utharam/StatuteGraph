import React from 'react';
import { HierarchyIndex, HierarchyNavItem } from '../types/akn';
import { firstChildOfTier, sectionLabel, tierChildren } from '../services/hierarchyBuilder';

export interface NavigationPickerProps {
  hierarchyIndex: HierarchyIndex | null;
  /** The nav item the reader is currently at, at any depth. */
  activeItem: HierarchyNavItem | null;
  onSelectProvision: (eid: string) => void;
}

/**
 * Tiered index navigation: the active provision, then each meaningful tier
 * below it.
 *
 * Children are filtered by `kind`, not by depth. The previous version pushed
 * every direct child into "Sub-section" and every grandchild into "Clause", so
 * a dropdown labelled "Sub-section" offered "Provided that" and "Clause" offered
 * "Explanation" — 41 section-level provisos and 151 subsection-level provisos
 * were mislabelled.
 *
 * A fourth tier appears only when the active item actually has deeper
 * children, which is what surfaces the 59 sub-clauses that the old fixed
 * three-tier model made unreachable.
 */
export const NavigationPicker: React.FC<NavigationPickerProps> = ({
  hierarchyIndex,
  activeItem,
  onSelectProvision,
}) => {
  const sections = hierarchyIndex?.sections ?? [];

  // The ancestor chain for the active provision, e.g. for a clause (a) under
  // sub-section (93) of section 2:
  //
  //   path[0] = section 2   -> tier 1
  //   path[1] = sub-sec (93) -> tier 2
  //   path[2] = clause (a)   -> tier 3
  //
  // The previous version derived the tiers from `activeItem.depth` alone and
  // used the active item itself whenever it sat below tier 1. That made tier 2
  // a *clause* while the dropdown above it read "Sub-section", and since a
  // clause has no sub-sections the dropdown showed "No Sub-section" even though
  // the active section was full of them. Taking the ancestors from the path
  // cannot drift out of step with the item being displayed.
  const path = activeItem ? hierarchyIndex?.pathToEid.get(activeItem.eid) ?? [] : [];

  // A detached provision is not a section, so its own path[0] would select
  // nothing in the Section dropdown. Fall back to the nearest preceding section
  // for display, while the sub-section and clause tiers still reflect the
  // provision actually being read.
  const fallbackSection =
    activeItem ? hierarchyIndex?.eidToDisplaySectionMap.get(activeItem.eid) ?? null : null;
  const tier1 = path[0]?.depth === 0 ? path[0] : (fallbackSection ?? path[0]);
  const tier2 = path[1] ?? firstChildOfTier(tier1, 'subsection');
  const tier3 = path[2] ?? firstChildOfTier(tier2, 'clause');

  // Each dropdown's OPTIONS come from the tier above the one it selects:
  // sub-sections are children of the section, clauses are children of the
  // sub-section. Asking tier2 for its sub-section children instead always
  // returned nothing, which is why a section full of sub-sections rendered as
  // "No Sub-section" beside a sidebar listing all of them.
  const subsections = tierChildren(tier1, 'subsection');
  const clauses = tierChildren(tier2, 'clause');
  // Provisos and explanations can hang off either the clause or the
  // sub-section, so offer both rather than whichever happens to come first.
  const extras = dedupeByEid([
    ...tierChildren(tier3, 'proviso'),
    ...tierChildren(tier2, 'proviso'),
  ]);

  // Every tier is rendered unconditionally, in a fixed order and at a fixed
  // width. An earlier version omitted tiers that happened to be empty, which
  // meant the controls appeared, vanished and re-flowed while scrolling — the
  // header moved under the reader's eyes and disturbed the place they were
  // reading. A tier with nothing under it simply says so.
  const tiers = [
    {
      key: 'section',
      value: tier1?.eid ?? '',
      placeholder: 'Select Section',
      emptyLabel: 'No Section',
      options: sections,
      labelFor: sectionLabel,
      title: 'Section, Schedule or Preamble',
      weight: 1.25,
    },
    {
      key: 'subsection',
      value: tier2?.eid ?? '',
      placeholder: 'Sub-section',
      emptyLabel: 'No Sub-section',
      options: subsections,
      labelFor: labelWithTitle,
      title: 'Sub-sections of the selected section',
      weight: 1,
    },
    {
      key: 'clause',
      value: tier3?.eid ?? '',
      placeholder: 'Clause',
      emptyLabel: 'No Clause',
      options: clauses,
      labelFor: labelWithTitle,
      title: 'Clauses and sub-clauses',
      weight: 1,
    },
    {
      key: 'proviso',
      value: tier3 && (tier3.kind === 'proviso' || tier3.kind === 'explanation') ? tier3.eid : '',
      placeholder: 'Proviso',
      emptyLabel: 'No Proviso',
      options: extras,
      labelFor: labelWithNum,
      title: 'Provisos and explanations',
      weight: 1,
    },
  ];

  return (
    <nav
      // The picker is the only flexible element in the header, so it absorbs
      // all spare width. A tier still keeps a usable minimum, and the hidden
      // scrollbar is a fallback for very narrow viewports — on a normal window
      // nothing overflows, so no scrollbar appears.
      className="flex-1 min-w-0 flex items-center overflow-x-auto scrollbar-none"
      aria-label="Provision Navigation Hierarchy"
    >
      {/*
        One connected control rather than free-floating boxes joined by "/".
        The separators were decoration that consumed width and read as a
        breadcrumb the user could click but could not.

        The bar fills the space it is given. It must NOT size to its content:
        a native <select>'s intrinsic width comes from its longest <option>, so
        a content-sized bar would stretch to fit the Act's longest sub-section
        title, overflow the header and push the remaining tiers out of sight on
        any window narrower than that.
      */}
      <div className="w-full min-w-0 flex items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-1">
        {tiers.map(({ key, ...tier }) => (
          <TierSelect key={key} {...tier} onSelect={onSelectProvision} />
        ))}
      </div>
    </nav>
  );
};

const labelWithTitle = (item: HierarchyNavItem): string =>
  `${item.num || item.kind}${item.title && item.title !== item.num ? ` · ${item.title}` : ''}`;

const labelWithNum = (item: HierarchyNavItem): string => `${item.num || item.kind}`;

function dedupeByEid(items: HierarchyNavItem[]): HierarchyNavItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.eid)) return false;
    seen.add(item.eid);
    return true;
  });
}

interface TierSelectProps {
  value: string;
  placeholder: string;
  emptyLabel: string;
  options: HierarchyNavItem[];
  labelFor: (item: HierarchyNavItem) => string;
  title: string;
  /** Relative share of the available width, so the Section tier reads widest. */
  weight?: number;
  onSelect: (eid: string) => void;
}

/**
 * One tier control.
 *
 * Deliberately stateless apart from the select itself: nothing here may change
 * size or presence in response to scroll position. The inbound-citation count
 * used to float over this as a pill that appeared and vanished, which was a
 * moving part in the header; it now lives in the sidebar and on the section
 * cards, where it can change without the reading surface shifting.
 */
const TierSelect: React.FC<TierSelectProps> = ({
  value,
  placeholder,
  emptyLabel,
  options,
  labelFor,
  title,
  weight = 1,
  onSelect,
}) => {
  const disabled = options.length === 0;

  return (
    <div
      // A floor so a tier never collapses to an unusable sliver, but no more:
      // flex-basis 0 plus flex-grow lets the four boxes share whatever width
      // the header actually has, and each <select> is w-full of this box, so a
      // long option title is clipped by the control rather than widening it.
      className={`relative ${weight > 1 ? 'min-w-[8rem]' : 'min-w-[6rem]'}`}
      style={{ flexGrow: weight, flexBasis: 0, flexShrink: 1 }}
    >
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => {
          if (event.target.value) onSelect(event.target.value);
        }}
        // truncate keeps the option text from forcing the control wider;
        // the native select clips it, so nothing reflows.
        className="w-full min-w-0 truncate text-xs font-medium pl-2 pr-6 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500/50 cursor-pointer disabled:cursor-not-allowed disabled:text-slate-400 dark:disabled:text-slate-600 disabled:bg-slate-100/60 dark:disabled:bg-slate-800/40"
        title={title}
        aria-label={title}
      >
        <option value="">{disabled ? emptyLabel : placeholder}</option>
        {options.map((item) => (
          <option key={item.eid} value={item.eid}>
            {labelFor(item)}
          </option>
        ))}
      </select>
    </div>
  );
};

