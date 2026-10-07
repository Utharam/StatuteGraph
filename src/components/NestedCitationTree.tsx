import React, { useMemo } from 'react';
import { Citation } from '../types/akn';
import { IndexedAknData } from '../services/aknLoader';
import { buildCitationTree, getCitationTreeStats } from '../services/citationEngine';
import { CitationNodeCard } from './CitationNodeCard';
import { Layers, Network, AlertTriangle, ExternalLink } from 'lucide-react';

interface NestedCitationTreeProps {
  rootCitation: Citation;
  indexData: IndexedAknData;
  onSelectCitation: (citation: Citation) => void;
  onJumpToProvision?: (eid: string) => void;
}

export const NestedCitationTree: React.FC<NestedCitationTreeProps> = ({
  rootCitation,
  indexData,
  onSelectCitation,
  onJumpToProvision,
}) => {
  // Build 6-level recursive tree
  const tree = useMemo(() => {
    return buildCitationTree(rootCitation, indexData, 6);
  }, [rootCitation, indexData]);

  // Statistics
  const stats = useMemo(() => {
    return getCitationTreeStats(tree);
  }, [tree]);

  return (
    <div className="space-y-4">
      {/* Metrics Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center p-3 rounded-xl bg-slate-100/80 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
        <div className="p-2 bg-white dark:bg-slate-900/60 rounded-lg shadow-2xs">
          <div className="flex items-center justify-center gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
            <Network className="w-3.5 h-3.5 text-indigo-500" />
            <span>Nodes</span>
          </div>
          <div className="text-lg font-bold text-slate-800 dark:text-slate-100 mt-0.5">
            {stats.totalNodes}
          </div>
        </div>

        <div className="p-2 bg-white dark:bg-slate-900/60 rounded-lg shadow-2xs">
          <div className="flex items-center justify-center gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
            <Layers className="w-3.5 h-3.5 text-cyan-500" />
            <span>Max Depth</span>
          </div>
          <div className="text-lg font-bold text-slate-800 dark:text-slate-100 mt-0.5">
            Level {stats.maxDepthReached} <span className="text-xs font-normal text-slate-400">/ 6</span>
          </div>
        </div>

        <div className="p-2 bg-white dark:bg-slate-900/60 rounded-lg shadow-2xs">
          <div className="flex items-center justify-center gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
            <span>Cycles Halted</span>
          </div>
          <div className="text-lg font-bold text-slate-800 dark:text-slate-100 mt-0.5">
            {stats.cycleCount}
          </div>
        </div>

        <div className="p-2 bg-white dark:bg-slate-900/60 rounded-lg shadow-2xs">
          <div className="flex items-center justify-center gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
            <ExternalLink className="w-3.5 h-3.5 text-emerald-500" />
            <span>External Acts</span>
          </div>
          <div className="text-lg font-bold text-slate-800 dark:text-slate-100 mt-0.5">
            {stats.externalCount}
          </div>
        </div>
      </div>

      {/* Chromatic Level Legend */}
      <div className="p-3 rounded-xl bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 text-xs">
        <div className="font-semibold text-slate-600 dark:text-slate-400 mb-2 uppercase tracking-wider text-[10px]">
          Cascade Depth Hierarchy (Levels 1 to 6)
        </div>
        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-100 text-indigo-800 border border-indigo-300 dark:bg-indigo-950 dark:text-indigo-300 dark:border-indigo-800">
            L1 Direct
          </span>
          <span className="text-slate-400">→</span>
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-cyan-100 text-cyan-800 border border-cyan-300 dark:bg-cyan-950 dark:text-cyan-300 dark:border-cyan-800">
            L2 Secondary
          </span>
          <span className="text-slate-400">→</span>
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800">
            L3 Tertiary
          </span>
          <span className="text-slate-400">→</span>
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800">
            L4 Quaternary
          </span>
          <span className="text-slate-400">→</span>
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-100 text-rose-800 border border-rose-300 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800">
            L5 Quinary
          </span>
          <span className="text-slate-400">→</span>
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-purple-100 text-purple-800 border border-purple-300 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800">
            L6 Deepest
          </span>
        </div>
      </div>

      {/* The Recursive Tree View */}
      <div className="pt-2">
        <CitationNodeCard
          node={tree}
          onSelectCitation={onSelectCitation}
          onJumpToProvision={onJumpToProvision}
        />
      </div>
    </div>
  );
};
