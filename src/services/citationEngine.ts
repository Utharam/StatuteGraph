/**
 * Citation cascade and text slicing.
 *
 * Two performance guards, both from measurements on the real dataset:
 *
 *  - `previewSnippet` used to be the ENTIRE provision text (longest: 11,820
 *    chars). A 6-level tree touches ~1,570 nodes, so one expanded tree put
 *    ~830,000 characters of statutory prose into the DOM. Snippets are now
 *    truncated in the resolver.
 *  - Level 6 fans out hard: the histogram is {L1:1, L2:8, L3:33, L4:115,
 *    L5:372, L6:1045}. Without a per-node cap, opening a high-fanout cascade
 *    can build thousands of nodes. `MAX_CHILDREN_PER_NODE` bounds it and
 *    reports what was hidden rather than silently dropping it.
 */

import { Citation, CitationRelation, CitationTreeNode, ResolvedCitationTarget } from '../types/akn';
import { IndexedAknData, resolveCitation } from './aknLoader';
import { relationDescription, relationLabel } from './citationScope';

export const MAX_CASCADE_LEVEL = 6;
export const MAX_CHILDREN_PER_NODE = 24;

// ---------------------------------------------------------------------------
// Level styling
// ---------------------------------------------------------------------------

export interface LevelStyleConfig {
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  accentBg: string;
  accentBorder: string;
  borderLeft: string;
  levelName: string;
  levelShort: string;
}

export const CHROMATIC_LEVEL_STYLES: Record<number, LevelStyleConfig> = {
  1: {
    badgeBg: 'bg-indigo-100 dark:bg-indigo-950/80',
    badgeText: 'text-indigo-800 dark:text-indigo-300',
    badgeBorder: 'border-indigo-300 dark:border-indigo-800',
    accentBg: 'bg-indigo-50/60 dark:bg-indigo-950/30',
    accentBorder: 'border-indigo-200 dark:border-indigo-800/60',
    borderLeft: 'border-l-indigo-500',
    levelName: 'Level 1: Direct Reference',
    levelShort: 'Direct',
  },
  2: {
    badgeBg: 'bg-cyan-100 dark:bg-cyan-950/80',
    badgeText: 'text-cyan-800 dark:text-cyan-300',
    badgeBorder: 'border-cyan-300 dark:border-cyan-800',
    accentBg: 'bg-cyan-50/60 dark:bg-cyan-950/30',
    accentBorder: 'border-cyan-200 dark:border-cyan-800/60',
    borderLeft: 'border-l-cyan-500',
    levelName: 'Level 2: Secondary Cascade',
    levelShort: 'Secondary',
  },
  3: {
    badgeBg: 'bg-emerald-100 dark:bg-emerald-950/80',
    badgeText: 'text-emerald-800 dark:text-emerald-300',
    badgeBorder: 'border-emerald-300 dark:border-emerald-800',
    accentBg: 'bg-emerald-50/60 dark:bg-emerald-950/30',
    accentBorder: 'border-emerald-200 dark:border-emerald-800/60',
    borderLeft: 'border-l-emerald-500',
    levelName: 'Level 3: Tertiary Cross-Reference',
    levelShort: 'Tertiary',
  },
  4: {
    badgeBg: 'bg-amber-100 dark:bg-amber-950/80',
    badgeText: 'text-amber-800 dark:text-amber-300',
    badgeBorder: 'border-amber-300 dark:border-amber-900',
    accentBg: 'bg-amber-50/60 dark:bg-amber-950/30',
    accentBorder: 'border-amber-200 dark:border-amber-900/60',
    borderLeft: 'border-l-amber-500',
    levelName: 'Level 4: Quaternary Dependency',
    levelShort: 'Quaternary',
  },
  5: {
    badgeBg: 'bg-rose-100 dark:bg-rose-950/80',
    badgeText: 'text-rose-800 dark:text-rose-300',
    badgeBorder: 'border-rose-300 dark:border-rose-800',
    accentBg: 'bg-rose-50/60 dark:bg-rose-950/30',
    accentBorder: 'border-rose-200 dark:border-rose-800/60',
    borderLeft: 'border-l-rose-500',
    levelName: 'Level 5: Quinary Sub-Chain',
    levelShort: 'Quinary',
  },
  6: {
    badgeBg: 'bg-purple-100 dark:bg-purple-950/80',
    badgeText: 'text-purple-800 dark:text-purple-300',
    badgeBorder: 'border-purple-300 dark:border-purple-800',
    accentBg: 'bg-purple-50/60 dark:bg-purple-950/30',
    accentBorder: 'border-purple-200 dark:border-purple-800/60',
    borderLeft: 'border-l-purple-500',
    levelName: 'Level 6: Deepest Authority',
    levelShort: 'Deepest',
  },
};

export function getLevelStyle(level: number): LevelStyleConfig {
  const clamped = Math.min(Math.max(Math.round(level) || 1, 1), MAX_CASCADE_LEVEL);
  return CHROMATIC_LEVEL_STYLES[clamped];
}

// ---------------------------------------------------------------------------
// Cascade
// ---------------------------------------------------------------------------

/**
 * Walks the citation graph outward from one citation.
 *
 * `visited` is cloned per branch, so a diamond (A -> B -> D and A -> C -> D)
 * is not mistaken for a cycle. Cycle detection compares against the ancestor
 * chain only, which is what makes that distinction possible.
 */
export function buildCitationTree(
  citation: Citation,
  indexData: IndexedAknData,
  maxLevel: number = MAX_CASCADE_LEVEL,
  maxChildren: number = MAX_CHILDREN_PER_NODE
): CitationTreeNode {
  let counter = 0;

  function buildNode(
    current: Citation,
    level: number,
    visitedEids: ReadonlySet<string>,
    visitedLevels: ReadonlyMap<string, number>,
    parentPath: string,
    originEid: string | null
  ): CitationTreeNode {
    const resolved: ResolvedCitationTarget = resolveCitation(current, indexData, {
      includeSubtree: true,
    });
    const id = `${parentPath}-L${level}-${++counter}`;

    // The identity we follow. External Acts have no node here, so we key them
    // on the statute name instead.
    const targetKey =
      resolved.target.scope === 'internal' && resolved.target.targetEid
        ? resolved.target.targetEid
        : resolved.target.scope === 'external'
        ? `ext:${resolved.displayTitle}`
        : `unresolved:${current.id}`;

    if (visitedEids.has(targetKey)) {
      return {
        id,
        level,
        citation: current,
        originEid,
        resolvedTarget: resolved,
        children: [],
        hiddenChildCount: 0,
        isCycle: true,
        // A cycle back to the citing provision itself is reported as level 1,
        // because there is no level 0 in this tree. The old code reported 0,
        // which rendered as the nonsensical "Target at L0".
        cycleTargetLevel: Math.max(visitedLevels.get(targetKey) ?? 1, 1),
      };
    }

    const nextVisitedEids = new Set(visitedEids);
    nextVisitedEids.add(targetKey);
    const nextVisitedLevels = new Map(visitedLevels);
    nextVisitedLevels.set(targetKey, level);

    const children: CitationTreeNode[] = [];
    let hiddenChildCount = 0;

    const provision = resolved.provision;
    if (level < maxLevel && provision) {
      // Subtree citations, so a section's cascade includes everything its
      // sub-sections rely on. Deduplicated per node so a provision cited five
      // times in one paragraph appears once, but its origin is retained.
      const seenTargets = new Set<string>();
      let considered = 0;

      for (const child of provision.subtreeCitations) {
        const childKey =
          child.target.scope === 'internal' && child.target.targetEid
            ? child.target.targetEid
            : child.rawText;

        if (!childKey || seenTargets.has(childKey)) continue;
        seenTargets.add(childKey);

        considered++;
        if (children.length >= maxChildren) {
          hiddenChildCount++;
          continue;
        }

        children.push(
          buildNode(
            child,
            level + 1,
            nextVisitedEids,
            nextVisitedLevels,
            id,
            child.parentEid === provision.eid ? null : child.parentEid
          )
        );
      }

      if (considered === 0) hiddenChildCount = 0;
    }

    return {
      id,
      level,
      citation: current,
      originEid: originEid ?? current.parentEid,
      resolvedTarget: resolved,
      children,
      hiddenChildCount,
      isCycle: false,
    };
  }

  // Seed with the citing provision so a provision that cites itself (which does
  // happen in the removal-of-difficulty appendix) is caught as a cycle.
  const seed = citation.parentEid ? [citation.parentEid] : [];
  return buildNode(citation, 1, new Set(seed), new Map(seed.map((eid) => [eid, 0])), 'root', null);
}

export interface CitationTreeStats {
  totalNodes: number;
  maxDepthReached: number;
  cycleCount: number;
  externalCount: number;
  unresolvedCount: number;
  truncatedBranches: number;
}

export function getCitationTreeStats(root: CitationTreeNode): CitationTreeStats {
  let totalNodes = 0;
  let maxDepthReached = 1;
  let cycleCount = 0;
  let externalCount = 0;
  let unresolvedCount = 0;
  let truncatedBranches = 0;

  const stack: CitationTreeNode[] = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    totalNodes++;
    if (node.level > maxDepthReached) maxDepthReached = node.level;
    if (node.isCycle) cycleCount++;
    if (node.hiddenChildCount > 0) truncatedBranches++;
    if (node.resolvedTarget.target.scope === 'external') externalCount++;
    if (node.resolvedTarget.target.scope === 'unresolved') unresolvedCount++;
    for (const child of node.children) stack.push(child);
  }

  return { totalNodes, maxDepthReached, cycleCount, externalCount, unresolvedCount, truncatedBranches };
}

// ---------------------------------------------------------------------------
// Text slicing
// ---------------------------------------------------------------------------

/**
 * Cleans a segment while preserving exactly one leading and trailing space, so
 * that rejoining the segments reproduces the original word boundaries.
 */
export function cleanSegmentText(text: string): string {
  if (!text) return '';
  const hasLeading = /^\s/.test(text);
  const hasTrailing = /\s$/.test(text);
  let cleaned = text
    .replace(/\ufffd/g, ' ')
    .replace(/[\u00AD\u200B\u200C\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\[\*\*\*\*\*[\.,]?\]/g, '[Omitted]')
    .trim();
  if (!cleaned) return hasLeading || hasTrailing ? ' ' : '';
  if (hasLeading) cleaned = ' ' + cleaned;
  if (hasTrailing) cleaned = cleaned + ' ';
  return cleaned;
}

export type TextSegmentType = 'text' | 'citation';

export interface TextSpanSegment {
  start: number;
  end: number;
  type: TextSegmentType;
  citation?: Citation;
  content: string;
}

/**
 * Splits RAW text into alternating plain-text and citation segments.
 *
 * `citations` MUST belong to the provision whose `text` is passed in. Passing
 * a descendant's citations against a parent's text is the bug that used to
 * render 396 citation pills over the wrong text: the spans were offsets into a
 * different string, so the pill silently highlighted unrelated prose.
 */
export function sliceProvisionText(text: string, citations: Citation[] = []): TextSpanSegment[] {
  if (!text) return [];

  const textLength = text.length;

  // Avoid splitting a surrogate pair across a segment boundary.
  const startsHighSurrogate = (idx: number) =>
    idx > 0 && idx < textLength && text.charCodeAt(idx - 1) >= 0xd800 && text.charCodeAt(idx - 1) <= 0xdbff;

  const valid = citations
    .filter(
      (c) =>
        Array.isArray(c.span) &&
        c.span.length === 2 &&
        Number.isFinite(c.span[0]) &&
        Number.isFinite(c.span[1]) &&
        c.span[0] >= 0 &&
        c.span[1] > c.span[0] &&
        c.span[0] < textLength
    )
    .map((c) => {
      let start = Math.min(Math.max(c.span[0], 0), textLength);
      let end = Math.min(Math.max(c.span[1], 0), textLength);
      if (startsHighSurrogate(start)) start -= 1;
      if (startsHighSurrogate(end)) end += 1;
      return { citation: c, span: [start, end] as [number, number] };
    })
    .filter((c) => c.span[1] > c.span[0] && c.span[1] <= textLength)
    .sort((a, b) => a.span[0] - b.span[0] || b.span[1] - a.span[1]);

  // Drop anything that overlaps an already-accepted citation.
  const nonOverlapping: { citation: Citation; span: [number, number] }[] = [];
  let lastEnd = 0;
  for (const entry of valid) {
    if (entry.span[0] >= lastEnd) {
      nonOverlapping.push(entry);
      lastEnd = entry.span[1];
    }
  }

  const segments: TextSpanSegment[] = [];
  let cursor = 0;

  for (const { citation, span } of nonOverlapping) {
    if (span[0] > cursor) {
      segments.push({ start: cursor, end: span[0], type: 'text', content: text.substring(cursor, span[0]) });
    }
    segments.push({
      start: span[0],
      end: span[1],
      type: 'citation',
      citation,
      content: text.substring(span[0], span[1]),
    });
    cursor = span[1];
  }

  if (cursor < textLength) {
    segments.push({ start: cursor, end: textLength, type: 'text', content: text.substring(cursor) });
  }

  return segments;
}

// ---------------------------------------------------------------------------
// Presentation helpers
// ---------------------------------------------------------------------------

export interface RelationPresentation {
  label: string;
  description: string;
  pill: string;
  icon: string;
}

/**
 * `subject_to` and `notwithstanding` are opposite legal operations - one
 * subordinates a provision, the other overrides it. Rendering both as a plain
 * blue "reference" link misstated the statute, so each gets its own treatment.
 */
export function relationPresentation(relation: CitationRelation): RelationPresentation {
  switch (relation) {
    case 'subject_to':
      return {
        label: relationLabel(relation),
        description: relationDescription(relation),
        pill: 'bg-violet-50 text-violet-900 border-violet-300 hover:bg-violet-100 hover:border-violet-400 dark:bg-violet-950/50 dark:text-violet-200 dark:border-violet-800',
        icon: 'text-violet-600 dark:text-violet-400',
      };
    case 'notwithstanding':
      return {
        label: relationLabel(relation),
        description: relationDescription(relation),
        pill: 'bg-rose-50 text-rose-900 border-rose-300 hover:bg-rose-100 hover:border-rose-400 dark:bg-rose-950/50 dark:text-rose-200 dark:border-rose-800',
        icon: 'text-rose-600 dark:text-rose-400',
      };
    default:
      return {
        label: relationLabel(relation),
        description: relationDescription(relation),
        pill: '',
        icon: '',
      };
  }
}