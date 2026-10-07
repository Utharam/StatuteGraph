import React, { useState } from 'react';
import { Citation, CitationTreeNode } from '../types/akn';
import { getLevelStyle } from '../services/citationEngine';
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Repeat,
  Compass,
  BookOpen,
  ArrowRight,
} from 'lucide-react';

interface CitationNodeCardProps {
  node: CitationTreeNode;
  onSelectCitation: (citation: Citation) => void;
  onJumpToProvision?: (eid: string) => void;
}

export const CitationNodeCard: React.FC<CitationNodeCardProps> = ({
  node,
  onSelectCitation,
  onJumpToProvision,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(node.level <= 2);
  const style = getLevelStyle(node.level);
  const { resolvedTarget, citation, isCycle, cycleTargetLevel, children } = node;

  const hasChildren = children && children.length > 0;

  return (
    <div className="relative group/node my-2">
      {/* Connector lines for nested tree */}
      <div
        className={`rounded-xl border transition-all duration-200 shadow-sm ${
          isCycle
            ? 'border-red-400 bg-red-50/40 dark:border-red-800 dark:bg-red-950/20'
            : resolvedTarget.isExternal
            ? 'border-amber-300 bg-amber-50/40 dark:border-amber-800 dark:bg-amber-950/20'
            : `${style.accentBorder} ${style.accentBg}`
        } p-3.5 sm:p-4`}
      >
        {/* Node header bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            {/* Chromatic level badge */}
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${style.badgeBg} ${style.badgeText} ${style.badgeBorder}`}
            >
              <span>L{node.level}</span>
              <span className="hidden sm:inline">| {style.levelName.split(':')[1]}</span>
            </span>

            {/* Cycle warning badge */}
            {isCycle && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 border border-red-300 dark:border-red-800 animate-pulse">
                <Repeat className="w-3 h-3" />
                Cycle Loop (Target at L{cycleTargetLevel})
              </span>
            )}

            {/* External statute badge */}
            {resolvedTarget.isExternal && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                <ExternalLink className="w-3 h-3" />
                External Act
              </span>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1 ml-auto">
            <button
              type="button"
              onClick={() => onSelectCitation(citation)}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 shadow-xs transition-colors"
              title="Inspect details in side panel"
            >
              <Compass className="w-3 h-3 text-indigo-500" />
              <span>Inspect</span>
            </button>

            {resolvedTarget.provision && onJumpToProvision && (
              <button
                type="button"
                onClick={() => onJumpToProvision(resolvedTarget.provision!.eid)}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 shadow-xs transition-colors"
                title="Jump to this provision in the main reader"
              >
                <ArrowRight className="w-3 h-3 text-emerald-500" />
                <span>Jump</span>
              </button>
            )}

            {hasChildren && (
              <button
                type="button"
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-1 rounded-md text-slate-500 hover:bg-slate-200/60 dark:hover:bg-slate-700 transition-colors ml-1"
                title={isExpanded ? 'Collapse cascade' : 'Expand cascade'}
              >
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </button>
            )}
          </div>
        </div>

        {/* Title and reference */}
        <div className="mb-2">
          <div className="font-serif font-semibold text-sm sm:text-base text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
            <BookOpen className="w-4 h-4 text-slate-400 shrink-0" />
            <span>{resolvedTarget.displayTitle}</span>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Referenced as: <span className="font-mono font-medium text-slate-700 dark:text-slate-300">"{citation.raw_text}"</span>
          </div>
        </div>

        {/* Text preview snippet */}
        {resolvedTarget.previewSnippet && (
          <div className="text-xs sm:text-[13px] text-slate-600 dark:text-slate-300 bg-white/80 dark:bg-slate-900/60 p-2.5 rounded-lg border border-slate-200/60 dark:border-slate-800/60 statute-text max-h-28 overflow-y-auto">
            {resolvedTarget.previewSnippet}
          </div>
        )}

        {/* Branch stats indicator */}
        {hasChildren && !isExpanded && (
          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 font-medium">
            <span className="w-2 h-2 rounded-full bg-indigo-500 inline-block"></span>
            <span>{children.length} deeper citation{children.length > 1 ? 's' : ''} available. Click arrow to expand cascade.</span>
          </div>
        )}
      </div>

      {/* Recursive child nodes */}
      {hasChildren && isExpanded && (
        <div className="relative pl-4 sm:pl-6 mt-2 border-l-2 border-dashed border-slate-300 dark:border-slate-700 space-y-2">
          {children.map((childNode) => (
            <CitationNodeCard
              key={childNode.id}
              node={childNode}
              onSelectCitation={onSelectCitation}
              onJumpToProvision={onJumpToProvision}
            />
          ))}
        </div>
      )}
    </div>
  );
};
