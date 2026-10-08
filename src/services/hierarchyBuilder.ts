/**
 * Builds the reader's navigation index.
 *
 * Two corrections to the previous model:
 *
 * 1. **Tiers come from `kind`, not from nesting depth.** The old code pushed
 *    every direct child into "subsections" and every grandchild into
 *    "clauses", so a `<select>` labelled "Sub-section" offered "Provided that"
 *    and "Clause" offered "Explanation". 41 section-level provisos, 151
 *    subsection-level provisos and 38 explanations were mislabelled.
 *
 * 2. **Orphans are not sections.** 237 provisions have no parent section
 *    because the parser read the table of contents' "SCHEDULE III" heading and
 *    then numbered every following top-level numeral as a schedule item. Those
 *    provisions used to be promoted to top-level "sections", producing 397
 *    tier-1 entries with 27 identical "Sub-sec (2)" labels. They now live in
 *    `unattributedGroups`, keyed by page, and are never presented as sections.
 *
 * The nav tree is a real recursive `children` array rather than a fixed
 * three-level shape, because the dataset reaches depth 3
 * (section > sub-section > clause > sub-clause) and the old fixed shape left
 * 59 sub-clauses invisible to every index.
 */

import {
  HierarchyIndex,
  HierarchyNavItem,
  Provision,
  UnattributedGroup,
} from '../types/akn';
import { IndexedAknData, compareStatutoryNumbers } from './aknLoader';

export type { HierarchyIndex, HierarchyNavItem, UnattributedGroup };

/** Tier titles, keyed by the provision kinds they contain. */
export const TIER_TITLES: { key: string; title: string; kinds: string[] }[] = [
  { key: 'subsection', title: 'Sub-section', kinds: ['subsection'] },
  { key: 'clause', title: 'Clause', kinds: ['clause', 'subclause'] },
  { key: 'proviso', title: 'Proviso', kinds: ['proviso', 'explanation'] },
];

export function buildHierarchyIndex(indexData: IndexedAknData): HierarchyIndex {
  const sections: HierarchyNavItem[] = [];
  const documentOrder: HierarchyNavItem[] = [];
  const eidToSectionMap = new Map<string, HierarchyNavItem>();
  const eidToDisplaySectionMap = new Map<string, HierarchyNavItem>();
  const eidToSubsectionMap = new Map<string, HierarchyNavItem>();
  const eidToClauseMap = new Map<string, HierarchyNavItem>();
  const eidToNavItemMap = new Map<string, HierarchyNavItem>();
  const pathToEid = new Map<string, HierarchyNavItem[]>();

  // Backlink counts.
  //
  // `incomingBySection` is already rolled up by the loader: a citation into
  // section X, or into any sub-provision of X, counts once against X. And
  // `incomingFromOtherSections` is that same set minus the same-section
  // citations — the literal "found in other sections too".
  //
  // Both are keyed by section, so every item inside a section shares its
  // section's figures. That is deliberate: in a table of contents the useful
  // question is "how much of the Act leans on this", not a per-node tally.
  //
  // Note the earlier version reconstructed these maps here and double-counted
  // any citation that targeted a section directly, because it wrote the
  // per-node total and then added the rolled-up total onto it.
  const countIncoming = (provision: Provision): number => {
    const key = provision.topLevelEid ?? provision.eid;
    return indexData.incomingBySection.get(key)?.length ?? 0;
  };

  const countIncomingFromOther = (provision: Provision): number => {
    const key = provision.topLevelEid ?? provision.eid;
    return indexData.incomingFromOtherSections.get(key)?.length ?? 0;
  };

  const makeItem = (provision: Provision, depth: number, parentEid: string | null = null): HierarchyNavItem => ({
    eid: provision.eid,
    num: provision.num,
    title: provision.title,
    kind: provision.kind,
    depth,
    parentEid,
    page: provision.page_numbers?.[0],
    outgoingCount: provision.subtreeCitations.length,
    incomingCount: countIncoming(provision),
    incomingFromOtherSectionsCount: countIncomingFromOther(provision),
    footnoteCount: provision.subtreeFootnotes.length,
    children: [],
  });

  // -- Genuine document-level units only --------------------------------------
  const orderedSections = [...indexData.readingOrder].sort((a, b) => {
    const aSchedule = a.kind === 'schedule' ? 1 : 0;
    const bSchedule = b.kind === 'schedule' ? 1 : 0;
    if (aSchedule !== bSchedule) return aSchedule - bSchedule;
    if (a.kind === 'section' && b.kind === 'section') {
      return compareStatutoryNumbers(a.num, b.num);
    }
    return a.sourceIndex - b.sourceIndex;
  });

  const register = (item: HierarchyNavItem, section: HierarchyNavItem, chain: HierarchyNavItem[]) => {
    eidToNavItemMap.set(item.eid, item);
    eidToSectionMap.set(item.eid, section);
    if (item.depth === 1) eidToSubsectionMap.set(item.eid, item);
    if (item.depth === 2) eidToClauseMap.set(item.eid, item);
    pathToEid.set(item.eid, chain);
  };

  const walk = (provision: Provision, depth: number, parentEid: string | null, section: HierarchyNavItem, chain: HierarchyNavItem[]) => {
    const item = makeItem(provision, depth, parentEid);
    const nextChain = [...chain, item];
    register(item, section, nextChain);

    for (const child of provision.children) {
      item.children.push(walk(child, depth + 1, provision.eid, section, nextChain));
    }
    return item;
  };

  for (const provision of orderedSections) {
    const item = makeItem(provision, 0, null);
    sections.push(item);
    register(item, item, [item]);
    for (const child of provision.children) {
      item.children.push(walk(child, 1, provision.eid, item, [item]));
    }
  }

  // -- The canvas stream -----------------------------------------------------
  // Walk the merged document order so detached provisions become first-class
  // cards interleaved by page, not an appendix. Each keeps its own descendants
  // so its sub-sections and clauses stay navigable.

  /**
   * Builds a detached branch. Its descendants belong to no section, so they are
   * registered in the nav maps without a section owner.
   */
  const walkDetached = (
    provision: Provision,
    depth: number,
    chain: HierarchyNavItem[]
  ): HierarchyNavItem => {
    const item = makeItem(provision, depth, provision.parent_eid ?? null);
    const nextChain = [...chain, item];
    eidToNavItemMap.set(item.eid, item);
    if (item.depth === 1) eidToSubsectionMap.set(item.eid, item);
    if (item.depth === 2) eidToClauseMap.set(item.eid, item);
    pathToEid.set(item.eid, nextChain);

    for (const child of provision.children) {
      item.children.push(walkDetached(child, depth + 1, nextChain));
    }
    return item;
  };

  const sectionItemByEid = new Map(sections.map((s) => [s.eid, s]));

  for (const provision of indexData.documentOrder) {
    const existing = sectionItemByEid.get(provision.eid);
    if (existing) {
      documentOrder.push(existing);
      continue;
    }

    documentOrder.push(walkDetached(provision, 0, []));
  }

  // Display-only: while reading a detached provision the Section dropdown shows
  // the nearest preceding section rather than blanking, which would otherwise
  // happen once per orphan.
  for (const section of sections) {
    eidToDisplaySectionMap.set(section.eid, section);
  }
  let nearest: HierarchyNavItem | null = null;
  for (const item of documentOrder) {
    if (sections.includes(item)) {
      nearest = item;
      eidToDisplaySectionMap.set(item.eid, item);
      for (const descendant of flattenNav(item)) {
        eidToDisplaySectionMap.set(descendant.eid, item);
      }
      continue;
    }
    if (nearest) {
      // The detached root itself, not just its descendants.
      eidToDisplaySectionMap.set(item.eid, nearest);
      for (const descendant of flattenNav(item)) {
        eidToDisplaySectionMap.set(descendant.eid, nearest);
      }
    }
  }

  // -- Orphans, grouped by page ----------------------------------------------
  // Retained as a compact audit list. The reading stream no longer hides them at
  // the end, but "which provisions could not be placed" is still worth one
  // click for anyone checking the parser.
  const unattributedGroups = groupUnattributed(
    indexData.unattributed,
    (provision, depth, parentEid) => makeItem(provision, depth, parentEid)
  );

  return {
    sections,
    documentOrder,
    eidToSectionMap,
    eidToDisplaySectionMap,
    eidToSubsectionMap,
    eidToClauseMap,
    eidToNavItemMap,
    pathToEid,
    unattributedGroups,
    unattributedCount: indexData.unattributed.length,
  };
}

/** Depth-first list of a nav item's descendants. */
function flattenNav(item: HierarchyNavItem): HierarchyNavItem[] {
  const out: HierarchyNavItem[] = [];
  const stack = [...item.children];
  while (stack.length > 0) {
    const node = stack.pop()!;
    out.push(node);
    stack.push(...node.children);
  }
  return out;
}

/**
 * Buckets parentless provisions by page so they stay readable and navigable
 * without pretending they are sections. Adjacent pages merge into one band.
 */
function groupUnattributed(
  provisions: Provision[],
  makeItem: (provision: Provision, depth: number, parentEid: string | null) => HierarchyNavItem
): UnattributedGroup[] {
  const groups: UnattributedGroup[] = [];

  const nest = (
    provision: Provision,
    depth: number,
    parentEid: string | null,
    chain: HierarchyNavItem[]
  ): HierarchyNavItem => {
    const item = makeItem(provision, depth, parentEid);
    const nextChain = [...chain, item];
    for (const child of provision.children) {
      item.children.push(nest(child, depth + 1, provision.eid, nextChain));
    }
    return item;
  };

  for (const provision of provisions) {
    const page = provision.page_numbers?.[0] ?? 0;
    const last = groups[groups.length - 1];
    // Merge runs of consecutive pages into one heading.
    if (last && Math.abs(last.page - page) <= 1) {
      last.items.push(nest(provision, 0, null, []));
    } else {
      groups.push({ id: `unattributed-p${page}`, page, items: [nest(provision, 0, null, [])] });
    }
  }

  return groups;
}

/**
 * Flat list of a nav item's immediate tier buckets, used by the picker to offer
 * only the children that belong to the next meaningful tier.
 */
/**
 * Children of `item` belonging to the requested tier. Drives the pickers, so a
 * dropdown labelled "Sub-section" can only ever offer sub-sections.
 */
export function tierChildren(
  item: HierarchyNavItem | null | undefined,
  tier: 'subsection' | 'clause' | 'proviso'
): HierarchyNavItem[] {
  if (!item) return [];
  const kinds = TIER_TITLES.find((t) => t.key === tier)?.kinds ?? [];
  return item.children.filter((child) => kinds.includes(child.kind));
}

/**
 * First child of `parent` belonging to the requested tier, used when the active
 * provision does not already sit at that tier.
 */
export function firstChildOfTier(
  parent: HierarchyNavItem | null,
  tier: 'subsection' | 'clause'
): HierarchyNavItem | null {
  if (!parent) return null;
  const kinds = TIER_TITLES.find((t) => t.key === tier)?.kinds ?? [];
  return parent.children.find((child) => kinds.includes(child.kind)) ?? null;
}

export function sectionLabel(item: HierarchyNavItem): string {
  switch (item.kind) {
    case 'schedule':
      return `Schedule ${item.num}`;
    case 'chapter':
      return /preamble/i.test(item.num) ? 'Preamble' : `Chapter ${item.num}`;
    case 'section':
      return `Section ${item.num}`;
    default:
      return item.title;
  }
}

export function fullLabel(item: HierarchyNavItem): string {
  const base = sectionLabel(item);
  const title = item.title.trim();
  if (!title || title.toLowerCase() === base.toLowerCase()) return base;
  if (/^(section|sub-section|clause|sub-clause|schedule|proviso|explanation)\b/i.test(title)) {
    return `${base}: ${title}`;
  }
  return title;
}