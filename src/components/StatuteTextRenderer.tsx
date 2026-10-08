import React from 'react';
import { Citation, Footnote } from '../types/akn';
import { FootnotePopover } from './FootnotePopover';
import { cleanStatuteText } from '../services/aknLoader';
import { cleanSegmentText, relationPresentation, sliceProvisionText } from '../services/citationEngine';

interface StatuteTextRendererProps {
  /** RAW provision text. Citation spans index into this exact string. */
  text: string;
  /**
   * Citations authored by THIS provision only. Passing a subtree union makes
   * the spans point at unrelated text, because they index other strings.
   */
  citations?: Citation[];
  footnotesByNumber?: Map<string, Footnote>;
  onCitationClick: (citation: Citation) => void;
  className?: string;
}

/**
 * Renders statutory text with interactive citation pills and amendment
 * footnote markers.
 *
 * Invariant: `sliceProvisionText` runs on the RAW text, and each resulting
 * segment is cleaned afterwards. Cleaning first would shift every span offset
 * and highlight the wrong words.
 */
/**
 * Marker glyph for a citation pill.
 *
 * This used to be a lucide `<svg>`. At 2,326 pills per Act that is 2,326 SVG
 * elements and roughly 700 bytes of path data each - about 1.6 MB of markup and
 * a large share of the 219,000 nodes on the page. A CSS pseudo-element carries
 * the same meaning for a few bytes and no node.
 *
 * The glyph differs by scope and by legal relation, because those are the two
 * things a reader must be able to distinguish at a glance.
 */
function markerGlyph(scope: Citation['target']['scope'], relation: Citation['relation']): string {
  switch (scope) {
    case 'external':
      return '\u2197'; // north-east arrow: another Act
    case 'unresolved':
      return '\u26a0'; // warning sign: not in the dataset
    default:
      if (relation === 'subject_to') return '\u21c4'; // left-right arrow
      if (relation === 'notwithstanding') return '\u2696'; // scales
      return '\u25cf'; // filled circle: ordinary reference
  }
}

const MARKER_COLOR: Record<Citation['target']['scope'], string> = {
  external: 'text-amber-600 dark:text-amber-400',
  unresolved: 'text-slate-400 dark:text-slate-500',
  internal: 'text-indigo-600 dark:text-indigo-400',
};

export const StatuteTextRenderer: React.FC<StatuteTextRendererProps> = ({
  text,
  citations = [],
  footnotesByNumber,
  onCitationClick,
  className = '',
}) => {
  if (!text) return null;

  const segments = sliceProvisionText(text, citations);
  const elements: React.ReactNode[] = [];
  let key = 0;

  for (const segment of segments) {
    if (segment.type === 'citation' && segment.citation) {
      const citation = segment.citation;
      const label = cleanStatuteText(segment.content);
      const relation = relationPresentation(citation.relation);
      const scope = citation.target.scope;

      // Pill colour encodes BOTH the legal relation and the target's scope.
      // `subject_to` and `notwithstanding` are opposite operations, so they
      // must not both look like an ordinary reference.
      let pillClass = 'border-indigo-200 bg-indigo-50 text-indigo-900 hover:border-indigo-400 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-200';
      let markerColor = MARKER_COLOR.internal;

      if (scope === 'external') {
        pillClass =
          'border-amber-300 bg-amber-50 text-amber-900 hover:border-amber-400 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200';
        markerColor = MARKER_COLOR.external;
      } else if (scope === 'unresolved') {
        pillClass =
          'border-dashed border-slate-300 bg-slate-50 text-slate-500 hover:border-slate-400 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400';
        markerColor = MARKER_COLOR.unresolved;
      } else if (citation.relation === 'subject_to') {
        pillClass =
          'border-violet-300 bg-violet-50 text-violet-900 hover:border-violet-400 hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-950/50 dark:text-violet-200';
        markerColor = 'text-violet-600 dark:text-violet-400';
      } else if (citation.relation === 'notwithstanding') {
        pillClass =
          'border-rose-300 bg-rose-50 text-rose-900 hover:border-rose-400 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-200';
        markerColor = 'text-rose-600 dark:text-rose-400';
      }

      const scopeNote =
        scope === 'external'
          ? `References another Act${citation.target.scope === 'external' && citation.target.actYear ? ` (${citation.target.actYear})` : ''}.`
          : scope === 'unresolved'
          ? 'This provision is not present in the parsed dataset.'
          : '';

      const degraded =
        scope === 'internal' && citation.target.resolution === 'section-level'
          ? 'Sub-provision not extracted; opens the enclosing section.'
          : '';

      elements.push(
        <button
          key={`cite-${key++}`}
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onCitationClick(citation);
          }}
          className={`inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded text-[13px] font-medium border transition-all cursor-pointer select-none shadow-sm ${pillClass}`}
          title={[
            relation.description,
            scopeNote,
            degraded,
            `Click to inspect in the side panel: "${citation.rawText}"`,
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {/* Glyph rather than an inline SVG: see markerGlyph above. */}
          <span aria-hidden="true" className={`shrink-0 text-[11px] leading-none ${markerColor}`}>
            {markerGlyph(scope, citation.relation)}
          </span>
          <span className="underline decoration-dotted underline-offset-2">{label}</span>
        </button>
      );
      continue;
    }

    // Plain text segment: clean it while preserving boundary spaces, then lift
    // out amendment footnote markers.
    const cleaned = cleanSegmentText(segment.content);
    if (!cleaned) continue;

    const markerPattern = /\[(\d+)\]/g;
    let match: RegExpExecArray | null;
    let cursor = 0;

    while ((match = markerPattern.exec(cleaned)) !== null) {
      if (match.index > cursor) {
        elements.push(<span key={`text-${key++}`}>{cleaned.substring(cursor, match.index)}</span>);
      }

      const footnote = footnotesByNumber?.get(match[1]) ?? {
        number: match[1],
        raw_text: `Footnote ${match[1]} (no amendment record in the parsed dataset).`,
      };

      elements.push(
        <FootnotePopover key={`fn-${key++}`} footnote={footnote}>
          [{footnote.number}]
        </FootnotePopover>
      );

      cursor = match.index + match[0].length;
    }

    if (cursor < cleaned.length) {
      elements.push(<span key={`text-${key++}`}>{cleaned.substring(cursor)}</span>);
    }
  }

  return <div className={`statute-text ${className}`}>{elements}</div>;
};