import React from 'react';
import { Citation, Footnote } from '../types/akn';
import { FootnotePopover } from './FootnotePopover';
import { ExternalLink, Link2 } from 'lucide-react';
import { cleanStatuteText } from '../services/aknLoader';
import { sliceProvisionText, cleanSegmentText } from '../services/citationEngine';

interface StatuteTextRendererProps {
  text: string;
  citations?: Citation[];
  footnotes?: Footnote[];
  footnotesByNumber?: Map<string, Footnote>;
  onCitationClick: (citation: Citation) => void;
  className?: string;
}

export const StatuteTextRenderer: React.FC<StatuteTextRendererProps> = ({
  text,
  citations = [],
  footnotesByNumber,
  onCitationClick,
  className = '',
}) => {
  if (!text) return null;

  // 1. Slice raw text by citation spans safely
  const segments = sliceProvisionText(text, citations);

  const elements: React.ReactNode[] = [];
  let globalIndex = 0;

  for (const seg of segments) {
    if (seg.type === 'citation' && seg.citation) {
      const cleanedCite = cleanStatuteText(seg.content);
      const isExt = seg.citation.external;
      elements.push(
        <button
          key={`cite-${globalIndex++}`}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onCitationClick(seg.citation!);
          }}
          className={`inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded text-[13px] font-medium border transition-all cursor-pointer group select-none shadow-sm ${
            isExt
              ? 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100 hover:border-amber-400 dark:bg-amber-950/50 dark:text-amber-200 dark:border-amber-800'
              : 'bg-indigo-50 text-indigo-900 border-indigo-200 hover:bg-indigo-100 hover:border-indigo-400 dark:bg-indigo-950/60 dark:text-indigo-200 dark:border-indigo-800'
          }`}
          title={`Click to view reference in side panel: ${seg.citation.raw_text}`}
        >
          {isExt ? (
            <ExternalLink className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0 group-hover:scale-110 transition-transform" />
          ) : (
            <Link2 className="w-3 h-3 text-indigo-600 dark:text-indigo-400 shrink-0 group-hover:scale-110 transition-transform" />
          )}
          <span className="underline decoration-dotted underline-offset-2">
            {cleanedCite}
          </span>
        </button>
      );
    } else {
      // It's a text segment. Clean it with space preservation, then process footnotes
      const cleanedText = cleanSegmentText(seg.content);
      if (!cleanedText) continue;

      const footnoteRegex = /\[(\d+)\]/g;
      let fnMatch: RegExpExecArray | null;
      let lastTextIndex = 0;

      while ((fnMatch = footnoteRegex.exec(cleanedText)) !== null) {
        // Push plain text before footnote
        if (fnMatch.index > lastTextIndex) {
          elements.push(
            <span key={`text-${globalIndex++}`}>
              {cleanedText.substring(lastTextIndex, fnMatch.index)}
            </span>
          );
        }

        const fnNum = fnMatch[1];
        const footnoteObj = footnotesByNumber?.get(fnNum) || {
          number: fnNum,
          raw_text: `Footnote ${fnNum}`,
        };

        elements.push(
          <FootnotePopover key={`fn-${globalIndex++}`} footnote={footnoteObj}>
            [{footnoteObj.number}]
          </FootnotePopover>
        );

        lastTextIndex = fnMatch.index + fnMatch[0].length;
      }

      if (lastTextIndex < cleanedText.length) {
        elements.push(
          <span key={`text-${globalIndex++}`}>
            {cleanedText.substring(lastTextIndex)}
          </span>
        );
      }
    }
  }

  return <div className={`statute-text ${className}`}>{elements}</div>;
};
