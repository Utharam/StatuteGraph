import React from 'react';
import { Provision, Citation, FontSize } from '../types/akn';
import { IndexedAknData, extractProvisionTitle } from '../services/aknLoader';
import { StatuteTextRenderer } from './StatuteTextRenderer';
import {
  FileText,
  Calendar,
  GitFork,
  BookOpen,
  Share2,
} from 'lucide-react';

interface ContinuousReaderProps {
  indexData: IndexedAknData;
  onCitationClick: (citation: Citation) => void;
  fontSize: FontSize;
  serifFont: boolean;
  onExploreProvisionInSideView: (provision: Provision) => void;
}

export const ContinuousReader: React.FC<ContinuousReaderProps> = ({
  indexData,
  onCitationClick,
  fontSize,
  serifFont,
  onExploreProvisionInSideView,
}) => {
  // Font size classes
  const fontClass = {
    sm: 'text-sm sm:text-[15px]',
    base: 'text-base sm:text-[17px]',
    lg: 'text-lg sm:text-[19px]',
    xl: 'text-xl sm:text-[21px]',
  }[fontSize];

  const fontFamClass = serifFont ? 'font-serif' : 'font-sans';

  const copyAnchor = (eid: string) => {
    const url = `${window.location.origin}${window.location.pathname}#prov-${eid}`;
    navigator.clipboard.writeText(url);
  };

  // Render a child provision (subsection, clause, proviso, explanation)
  const renderChildProvision = (child: Provision, depth: number = 1): React.ReactNode => {
    const isProviso = child.kind === 'proviso';
    const isExplanation = child.kind === 'explanation';
    const isClause = child.kind === 'clause' || child.kind === 'subclause';
    const citations = child.citations || indexData.citationsByParent.get(child.eid) || [];
    const footnotes = indexData.footnotesByEid.get(child.eid) || [];

    let containerStyle = 'my-3 p-3.5 sm:p-4 rounded-xl transition-colors';
    if (isProviso) {
      containerStyle += ' bg-amber-50/70 dark:bg-amber-950/20 border-l-4 border-amber-500 text-amber-950 dark:text-amber-100';
    } else if (isExplanation) {
      containerStyle += ' bg-teal-50/70 dark:bg-teal-950/20 border-l-4 border-teal-500 text-teal-950 dark:text-teal-100';
    } else if (isClause) {
      containerStyle += ' bg-black/2 dark:bg-white/3 border-l-2 border-slate-300 dark:border-slate-700';
    } else {
      containerStyle += ' bg-black/1 dark:bg-white/2 border-l-2 border-indigo-400 dark:border-indigo-600';
    }

    return (
      <div
        key={child.eid}
        id={`prov-${child.eid}`}
        data-provision-eid={child.eid}
        className={`${containerStyle} scroll-mt-24 ml-2 ${
          depth === 1 ? 'sm:ml-3' : depth === 2 ? 'sm:ml-6' : 'sm:ml-9'
        }`}
      >
        <div className="flex items-center justify-between gap-2 mb-1.5 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="font-mono font-bold text-indigo-700 dark:text-indigo-400">
              {child.num || child.kind}
            </span>
            {isProviso && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-200/80 text-amber-900 dark:bg-amber-900 dark:text-amber-200">
                Proviso
              </span>
            )}
            {isExplanation && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-teal-200/80 text-teal-900 dark:bg-teal-900 dark:text-teal-200">
                Explanation
              </span>
            )}
          </div>

          <div className="flex items-center gap-1">
            {citations.length > 0 && (
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                {citations.length} cite{citations.length > 1 ? 's' : ''}
              </span>
            )}
            <button
              type="button"
              onClick={() => copyAnchor(child.eid)}
              className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              title="Copy anchor link"
            >
              <Share2 className="w-3 h-3" />
            </button>
          </div>
        </div>

        {child.text && (
          <StatuteTextRenderer
            text={child.text}
            citations={citations}
            footnotes={footnotes}
            footnotesByNumber={indexData.footnotesByNumber}
            onCitationClick={onCitationClick}
            className={`${fontFamClass} ${fontClass} leading-relaxed`}
          />
        )}

        {/* Nested deeper children */}
        {child.children && child.children.length > 0 && (
          <div className="mt-2 space-y-2">
            {child.children.map((sub) => renderChildProvision(sub, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-8 py-8 space-y-10" id="statute-continuous-canvas">
      {/* Act Header Banner */}
      <header className="text-center py-10 px-6 sm:px-10 rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-amber-600 via-amber-500 to-indigo-600"></div>
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-widest bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 border border-amber-300 dark:border-amber-800 mb-3">
          <BookOpen className="w-3.5 h-3.5" />
          <span>India Code &bull; Central Legislation</span>
        </div>
        <h1 className="font-serif font-black text-2xl sm:text-4xl text-slate-900 dark:text-slate-100 tracking-tight leading-tight">
          {indexData.dataset.akomaNtoso?.act?.meta?.title || 'The Central Goods and Services Tax Act, 2017'}
        </h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 font-medium">
          Act No. 12 of 2017 &bull; As amended up to 30th September, 2020
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3 text-xs text-slate-600 dark:text-slate-300">
          <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 font-mono">
            {indexData.provisions.length} Provisions
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 font-mono">
            {indexData.allCitations.length} Citations
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 font-mono">
            {indexData.allFootnotes.length} Amendment Notes
          </span>
        </div>
      </header>

      {/* Provisions Stream */}
      <div className="space-y-8">
        {indexData.rootProvisions.map((root) => {
          const title = extractProvisionTitle(root);
          const isPreamble = root.eid === 'act_preamble';
          const isSchedule = root.kind === 'schedule';
          const citations = root.citations || indexData.citationsByParent.get(root.eid) || [];
          const footnotes = indexData.footnotesByEid.get(root.eid) || [];
          const hasChildren = root.children && root.children.length > 0;

          return (
            <article
              key={root.eid}
              id={`prov-${root.eid}`}
              data-provision-eid={root.eid}
              className={`scroll-mt-24 p-5 sm:p-7 rounded-2xl border transition-all duration-200 bg-white dark:bg-slate-900 shadow-sm hover:shadow-md ${
                isPreamble
                  ? 'border-indigo-200 dark:border-indigo-900/60'
                  : isSchedule
                  ? 'border-amber-200 dark:border-amber-900/60'
                  : 'border-slate-200/90 dark:border-slate-800'
              }`}
            >
              {/* Section Header with Marginalia Number */}
              <div className="flex flex-wrap items-start justify-between gap-3 pb-4 mb-4 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-start gap-3">
                  {/* Marginalia Badge */}
                  <div className="flex flex-col items-center justify-center min-w-[50px] p-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-center select-none shrink-0">
                    <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400">
                      {root.kind === 'schedule' ? 'SCH' : 'SEC'}
                    </span>
                    <span className="font-serif font-black text-lg text-slate-800 dark:text-slate-100">
                      {root.num || '§'}
                    </span>
                  </div>

                  <div>
                    <h2 className="font-serif font-bold text-xl sm:text-2xl text-slate-900 dark:text-slate-100 leading-snug">
                      {title}
                    </h2>
                    <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                      {root.page_numbers?.[0] && (
                        <span className="inline-flex items-center gap-1 font-mono">
                          <Calendar className="w-3.5 h-3.5" />
                          Page {root.page_numbers[0]}
                        </span>
                      )}
                      <span className="font-mono text-slate-400">
                        eid: {root.eid}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Header Action Tools */}
                <div className="flex items-center gap-1.5 ml-auto">
                  {citations.length > 0 && (
                    <button
                      type="button"
                      onClick={() => onExploreProvisionInSideView(root)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 transition-colors"
                      title="Inspect cross-citations in side view"
                    >
                      <GitFork className="w-3.5 h-3.5 text-indigo-500" />
                      <span>{citations.length} Citations</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => copyAnchor(root.eid)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    title="Copy section link"
                  >
                    <Share2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Main Provision Statutory Text */}
              {root.text && (
                <div className="mb-4">
                  <StatuteTextRenderer
                    text={root.text}
                    citations={citations}
                    footnotes={footnotes}
                    footnotesByNumber={indexData.footnotesByNumber}
                    onCitationClick={onCitationClick}
                    className={`${fontFamClass} ${fontClass} leading-relaxed text-slate-800 dark:text-slate-200`}
                  />
                </div>
              )}

              {/* Sub-provisions / Children (Subsections, Clauses, Provisos) */}
              {hasChildren && (
                <div className="space-y-3 pt-2">
                  {root.children!.map((child) => renderChildProvision(child, 1))}
                </div>
              )}
            </article>
          );
        })}
      </div>

      {/* Document Footer */}
      <footer className="text-center py-10 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
        <p className="flex items-center justify-center gap-1">
          <FileText className="w-4 h-4" />
          <span>AKN Legal Reader &bull; The Central Goods and Services Tax Act, 2017</span>
        </p>
        <p className="mt-1">Continuous Reading Mode &bull; Frictionless Side View &bull; 6-Level Cascade</p>
      </footer>
    </main>
  );
};
