import {
  Citation,
  CitationTreeNode,
  ResolvedCitationTarget,
} from '../types/akn';
import { IndexedAknData, resolveCitation } from './aknLoader';

export interface LevelStyleConfig {
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  accentBg: string;
  accentBorder: string;
  borderLeft: string;
  levelName: string;
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
  },
  2: {
    badgeBg: 'bg-cyan-100 dark:bg-cyan-950/80',
    badgeText: 'text-cyan-800 dark:text-cyan-300',
    badgeBorder: 'border-cyan-300 dark:border-cyan-800',
    accentBg: 'bg-cyan-50/60 dark:bg-cyan-950/30',
    accentBorder: 'border-cyan-200 dark:border-cyan-800/60',
    borderLeft: 'border-l-cyan-500',
    levelName: 'Level 2: Secondary Cascade',
  },
  3: {
    badgeBg: 'bg-emerald-100 dark:bg-emerald-950/80',
    badgeText: 'text-emerald-800 dark:text-emerald-300',
    badgeBorder: 'border-emerald-300 dark:border-emerald-800',
    accentBg: 'bg-emerald-50/60 dark:bg-emerald-950/30',
    accentBorder: 'border-emerald-200 dark:border-emerald-800/60',
    borderLeft: 'border-l-emerald-500',
    levelName: 'Level 3: Tertiary Cross-Ref',
  },
  4: {
    badgeBg: 'bg-amber-100 dark:bg-amber-950/80',
    badgeText: 'text-amber-800 dark:text-amber-300',
    badgeBorder: 'border-amber-300 dark:border-amber-800',
    accentBg: 'bg-amber-50/60 dark:bg-amber-950/30',
    accentBorder: 'border-amber-200 dark:border-amber-800/60',
    borderLeft: 'border-l-amber-500',
    levelName: 'Level 4: Quaternary Dependency',
  },
  5: {
    badgeBg: 'bg-rose-100 dark:bg-rose-950/80',
    badgeText: 'text-rose-800 dark:text-rose-300',
    badgeBorder: 'border-rose-300 dark:border-rose-800',
    accentBg: 'bg-rose-50/60 dark:bg-rose-950/30',
    accentBorder: 'border-rose-200 dark:border-rose-800/60',
    borderLeft: 'border-l-rose-500',
    levelName: 'Level 5: Quinary Sub-Chain',
  },
  6: {
    badgeBg: 'bg-purple-100 dark:bg-purple-950/80',
    badgeText: 'text-purple-800 dark:text-purple-300',
    badgeBorder: 'border-purple-300 dark:border-purple-800',
    accentBg: 'bg-purple-50/60 dark:bg-purple-950/30',
    accentBorder: 'border-purple-200 dark:border-purple-800/60',
    borderLeft: 'border-l-purple-500',
    levelName: 'Level 6: Deepest Authority',
  },
};

export function getLevelStyle(level: number): LevelStyleConfig {
  return CHROMATIC_LEVEL_STYLES[Math.min(Math.max(level, 1), 6)];
}

/**
 * Recursively builds citation tree up to 6 levels with cycle detection
 */
export function buildCitationTree(
  citation: Citation,
  indexData: IndexedAknData,
  maxLevel: number = 6
): CitationTreeNode {
  let nodeIdCounter = 0;

  function buildNode(
    currentCitation: Citation,
    currentLevel: number,
    visitedEids: Set<string>,
    visitedLevels: Map<string, number>,
    parentPath: string
  ): CitationTreeNode {
    const resolved: ResolvedCitationTarget = resolveCitation(currentCitation, indexData);
    const targetKey = resolved.provision ? resolved.provision.eid : currentCitation.target_eid || currentCitation.raw_text;
    const nodeId = `${parentPath}_L${currentLevel}_${++nodeIdCounter}`;

    // Cycle detection
    if (targetKey && visitedEids.has(targetKey)) {
      return {
        id: nodeId,
        level: currentLevel,
        citation: currentCitation,
        resolvedTarget: resolved,
        children: [],
        isCycle: true,
        cycleTargetLevel: visitedLevels.get(targetKey) ?? 1,
      };
    }

    // Branch state tracking
    const nextVisitedEids = new Set(visitedEids);
    if (targetKey) nextVisitedEids.add(targetKey);

    const nextVisitedLevels = new Map(visitedLevels);
    if (targetKey) nextVisitedLevels.set(targetKey, currentLevel);

    const children: CitationTreeNode[] = [];

    // Recurse if below maxLevel and not an external reference
    if (currentLevel < maxLevel && !resolved.isExternal && resolved.provision) {
      const childCitations = resolved.citations || [];
      // Deduplicate outgoing citations by target_eid to keep tree clean
      const seenChildTargets = new Set<string>();

      for (const childCite of childCitations) {
        const childTargetKey = childCite.target_eid || childCite.raw_text;
        if (!childTargetKey || seenChildTargets.has(childTargetKey)) continue;
        seenChildTargets.add(childTargetKey);

        const childNode = buildNode(
          childCite,
          currentLevel + 1,
          nextVisitedEids,
          nextVisitedLevels,
          nodeId
        );
        children.push(childNode);
      }
    }

    return {
      id: nodeId,
      level: currentLevel,
      citation: currentCitation,
      resolvedTarget: resolved,
      children,
      isCycle: false,
    };
  }

  const initialVisited = citation.parent_eid ? new Set<string>([citation.parent_eid]) : new Set<string>();
  const initialLevels = citation.parent_eid ? new Map<string, number>([[citation.parent_eid, 0]]) : new Map<string, number>();

  return buildNode(
    citation,
    1,
    initialVisited,
    initialLevels,
    'root'
  );
}

/**
 * Clean text segment while preserving single leading and trailing whitespace
 */
export function cleanSegmentText(text: string): string {
  if (!text) return '';
  const hasLeading = /^\s/.test(text);
  const hasTrailing = /\s$/.test(text);
  let cleaned = text
    .replace(/\ufffd/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\[\*\*\*\*\*[\.,]?\]/g, '[Omitted]')
    .trim();
  if (!cleaned) return hasLeading || hasTrailing ? ' ' : '';
  if (hasLeading) cleaned = ' ' + cleaned;
  if (hasTrailing) cleaned = cleaned + ' ';
  return cleaned;
}

/**
 * Flatten all nodes in a tree for summary statistics
 */
export function getCitationTreeStats(rootNode: CitationTreeNode) {
  let totalNodes = 0;
  let maxDepthReached = 1;
  let cycleCount = 0;
  let externalCount = 0;

  function traverse(node: CitationTreeNode) {
    totalNodes++;
    if (node.level > maxDepthReached) maxDepthReached = node.level;
    if (node.isCycle) cycleCount++;
    if (node.resolvedTarget.isExternal) externalCount++;

    for (const child of node.children) {
      traverse(child);
    }
  }

  traverse(rootNode);

  return {
    totalNodes,
    maxDepthReached,
    cycleCount,
    externalCount,
  };
}


export interface TextSpanSegment {
  start: number;
  end: number;
  type: 'text' | 'citation' | 'footnote';
  citation?: Citation;
  content: string;
}

export function sliceProvisionText(text: string, citations: Citation[] = []): TextSpanSegment[] {
  if (!text) return [];
  const textLength = text.length;

  // Guard against splitting surrogate pairs
  const isSurrogate = (idx: number) => {
    if (idx <= 0 || idx >= textLength) return false;
    const code = text.charCodeAt(idx - 1);
    return code >= 0xD800 && code <= 0xDBFF;
  };

  const adjustStart = (idx: number) => isSurrogate(idx) ? idx - 1 : idx;
  const adjustEnd = (idx: number) => isSurrogate(idx) ? idx + 1 : idx;

  const segments: TextSpanSegment[] = [];

  const validCitations = citations
    .filter(c => c.span && Array.isArray(c.span) && c.span.length === 2 && c.span[0] >= 0 && c.span[1] > c.span[0] && c.span[0] < textLength)
    .map(c => {
      let start = Math.min(Math.max(c.span[0], 0), textLength);
      let end = Math.min(Math.max(c.span[1], 0), textLength);
      start = adjustStart(start);
      end = adjustEnd(end);
      return { ...c, span: [start, end] as [number, number] };
    })
    .filter(c => c.span[1] > c.span[0])
    .sort((a, b) => {
      if (a.span[0] !== b.span[0]) return a.span[0] - b.span[0];
      return b.span[1] - a.span[1];
    });

  const nonOverlapping: Citation[] = [];
  let lastEnd = 0;
  for (const cite of validCitations) {
    if (cite.span[0] >= lastEnd) {
      nonOverlapping.push(cite);
      lastEnd = cite.span[1];
    }
  }

  let currentIndex = 0;
  for (const cite of nonOverlapping) {
    const start = cite.span[0];
    const end = cite.span[1];

    if (start > currentIndex) {
      segments.push({
        start: currentIndex,
        end: start,
        type: 'text',
        content: text.substring(currentIndex, start)
      });
    }

    segments.push({
      start,
      end,
      type: 'citation',
      citation: cite,
      content: text.substring(start, end)
    });

    currentIndex = end;
  }

  if (currentIndex < textLength) {
    segments.push({
      start: currentIndex,
      end: textLength,
      type: 'text',
      content: text.substring(currentIndex)
    });
  }

  return segments;
}
