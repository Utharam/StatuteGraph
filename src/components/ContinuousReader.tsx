import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Citation, FontSize, Provision, ProvisionKind } from '../types/akn';
import { IndexedAknData } from '../services/aknLoader';
import { formatProvisionDisplayTitle } from '../services/aknLoader';
import { StatuteDocument } from '../services/documentLibrary';
import { StatuteTextRenderer } from './StatuteTextRenderer';
import { CopyProvisionButton, CopyStatus } from './CopyProvisionButton';
import { buildProvisionCopyText, writeToClipboard } from '../services/provisionClipboard';
import {
  PRODUCT_NAME,
  AUTHOR_NAME,
  AUTHOR_URL,
  PARSER_NAME,
  PARSER_URL,
} from '../branding';
import {
  FileText,
  Calendar,
  GitFork,
  BookOpen,
  Link2,
  AlertTriangle,
  ChevronDown,
  Info,
  Unlink,
  Inbox,
  Check,
} from 'lucide-react';

interface ContinuousReaderProps {
  indexData: IndexedAknData;
  document: StatuteDocument;
  onCitationClick: (citation: Citation) => void;
  onShowBacklinks: (eid: string) => void;
  fontSize: FontSize;
  serifFont: boolean;
}

const FONT_CLASSES: Record<FontSize, string> = {
  sm: 'text-sm sm:text-[15px]',
  base: 'text-base sm:text-[17px]',
  lg: 'text-lg sm:text-[19px]',
  xl: 'text-xl sm:text-[21px]',
};

/** Left-accent treatment per provision kind. */
const KIND_STYLE: Record<ProvisionKind, string> = {
  proviso: 'bg-amber-50/70 dark:bg-amber-950/20 border-l-4 border-amber-500 text-amber-950 dark:text-amber-100',
  explanation:
    'bg-teal-50/70 dark:bg-teal-950/20 border-l-4 border-teal-500 text-teal-950 dark:text-teal-100',
  clause: 'bg-slate-50/80 dark:bg-slate-800/40 border-l-2 border-slate-300 dark:border-slate-700',
  subclause: 'bg-slate-50/80 dark:bg-slate-800/40 border-l-2 border-slate-300 dark:border-slate-700',
  subsection: 'bg-slate-50/60 dark:bg-slate-800/30 border-l-2 border-indigo-400 dark:border-indigo-600',
  section: 'bg-slate-50/60 dark:bg-slate-800/30 border-l-2 border-indigo-400 dark:border-indigo-600',
  chapter: 'bg-slate-50/60 dark:bg-slate-800/30 border-l-2 border-indigo-400 dark:border-indigo-600',
  schedule: 'bg-slate-50/60 dark:bg-slate-800/30 border-l-2 border-amber-500 dark:border-amber-700',
  schedule_item: 'bg-slate-50/80 dark:bg-slate-800/40 border-l-2 border-slate-300 dark:border-slate-700',
};

function kindBadge(kind: ProvisionKind): string {
  switch (kind) {
    case 'schedule':
      return 'SCH';
    case 'schedule_item':
      return 'ITEM';
    case 'chapter':
      return 'PART';
    default:
      return kind.toUpperCase().slice(0, 5);
  }
}

/** Groups digits so long counts stay readable: 153728 -> "153,728". */
const formatCount = (n: number): string => n.toLocaleString();

/**
 * Structural emptiness indicator.
 *
 * A provision with a zero-length subtree genuinely carries nothing, which is
 * different from one whose *own* text is empty but whose children hold the
 * content. Reporting both as "no text extracted" hid the fact that 8 real
 * provisions and 138 sub-clauses are effectively empty.
 */
const SubtreeSize: React.FC<{ provision: Provision; compact?: boolean }> = ({
  provision,
  compact = false,
}) => {
  const isEmpty = provision.subtreeTextLength === 0;
  const ownIsEmpty = provision.text.trim().length === 0;
  const descendantCount = provision.children.length;

  return (
    <span className="inline-flex items-center gap-1.5 font-mono">
      {/* A nested orphan gets a quiet tag; only its root gets the full banner. */}
      {!compact && provision.isDetached && !provision.isUnattributed && (
        <span
          className="px-1 py-px rounded bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300 text-[10px]"
          title="This provision is not attached to any chapter, schedule or section of the Act"
        >
          orphan
        </span>
      )}
      <span
        className={
          isEmpty
            ? 'text-red-600 dark:text-red-400 font-semibold'
            : ownIsEmpty
            ? 'text-amber-600 dark:text-amber-400'
            : 'text-slate-400 dark:text-slate-500'
        }
        title={
          isEmpty
            ? 'This provision and all of its descendants contain no text at all.'
            : `Own text: ${formatCount(provision.text.length)} characters. ` +
              `Whole subtree: ${formatCount(provision.subtreeTextLength)} characters across ` +
              `${formatCount(countDescendants(provision))} descendant(s).`
        }
      >
        {isEmpty ? (
          <>
            <AlertTriangle className="w-3 h-3 inline mr-0.5" />
            empty subtree
          </>
        ) : (
          `${formatCount(provision.subtreeTextLength)} ch`
        )}
      </span>
      {ownIsEmpty && !isEmpty && !compact && (
        <span className="hidden xl:inline text-amber-600 dark:text-amber-400">
          (own text empty; {formatCount(descendantCount)} child subtree
          {descendantCount === 1 ? '' : 's'})
        </span>
      )}
    </span>
  );
};

function countDescendants(provision: Provision): number {
  let n = 0;
  const stack = [...provision.children];
  while (stack.length > 0) {
    const node = stack.pop()!;
    n += 1;
    stack.push(...node.children);
  }
  return n;
}

/**
 * Why a provision has no body text.
 *
 * The single message "No text was extracted for this provision" was wrong for
 * provisions whose own text is empty but whose children carry the content, and
 * it gave no hint about structurally empty provisions. Both cases are now
 * stated separately, with the numbers that back them.
 */
const EmptyNotice: React.FC<{ provision: Provision }> = ({ provision }) => {
  const subtreeChars = provision.subtreeTextLength;
  const descendants = countDescendants(provision);

  if (subtreeChars === 0) {
    return (
      <p className="text-xs italic text-red-600 dark:text-red-400 flex items-start gap-1.5">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
        <span>
          {descendants > 0
            ? `No text anywhere in this subtree. ${formatCount(descendants)} descendant${
                descendants === 1 ? '' : 's'
              } exist but all are empty.`
            : 'No text anywhere in this subtree. This provision and its descendants are all empty.'}
        </span>
      </p>
    );
  }

  return (
    <p className="text-xs italic text-amber-600 dark:text-amber-400 flex items-start gap-1.5">
      <Info className="w-3.5 h-3.5 shrink-0 mt-px" />
      <span>
        This provision&rsquo;s own text is empty; {formatCount(descendants)} descendant
        {descendants === 1 ? '' : 's'} hold {formatCount(subtreeChars)} character
        {subtreeChars === 1 ? '' : 's'} of text. Scroll down for the content.
      </span>
    </p>
  );
};

/**
 * Provenance disclosure.
 *
 * Deliberately collapsed by default and rendered as one short line. A parsing
 * defect is a footnote to the statute, not a feature of the page: when the
 * warning occupies more room than the text it is describing, it stops guiding
 * the reader and starts obstructing one. Expand it when you want the detail.
 */
const ProvenanceNotice: React.FC<{
  tone: 'detached' | 'suspect';
  label: string;
  detail: React.ReactNode;
}> = ({ tone, label, detail }) => {
  const [open, setOpen] = useState(false);
  const detached = tone === 'detached';

  const chip = detached
    ? 'text-violet-600 dark:text-violet-400 hover:text-violet-800 dark:hover:text-violet-200'
    : 'text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-200';

  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className={`inline-flex items-center gap-1 text-[11px] font-medium transition-colors ${chip}`}
      >
        {detached ? <Unlink className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
        <span>{label}</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <p
          className={`mt-1.5 text-[11px] leading-relaxed max-w-prose ${
            detached ? 'text-violet-800/90 dark:text-violet-200/90' : 'text-amber-800/90 dark:text-amber-200/90'
          }`}
        >
          {detail}
        </p>
      )}
    </div>
  );
};



/**
 * Memoised on purpose.
 *
 * The reading canvas holds the entire Act - 218,714 DOM elements for the
 * Income-tax Act 2025. App re-renders on every scroll (the active provision
 * changes), so without this the whole canvas would be reconciled on every
 * scroll event, which is what made Chrome hang. All props here are stable, so
 * scrolling no longer touches it.
 */
export const ContinuousReader = React.memo(function ContinuousReader({
  indexData,
  document,
  onCitationClick,
  onShowBacklinks,
  fontSize,
  serifFont,
}: ContinuousReaderProps) {
  // One chronological stream. Detached provisions are interleaved by page rather
  // than appended, because we know which page their text came from.
  const stream = indexData.documentOrder;
  const fontClass = FONT_CLASSES[fontSize];
  const fontFamClass = serifFont ? 'font-serif' : 'font-sans';
  const suspectSections = new Set(indexData.quality.suspectSectionEids);

const [copiedEid, setCopiedEid] = useState<string | null>(null);
  const [copyFailed, setCopyFailed] = useState(false);
  const copyTimer = useRef<number | null>(null);

  // One timer for the whole canvas rather than one per card. At ~1,700 mounted
  // provisions the per-card version was 1,700 hooks and timers to colour one
  // icon.
  const copyProvision = useCallback(
    async (provision: Provision) => {
      const text = buildProvisionCopyText(provision);
      if (!text) return;

      const ok = await writeToClipboard(text);
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
      setCopiedEid(provision.eid);
      setCopyFailed(!ok);
      copyTimer.current = window.setTimeout(() => {
        setCopiedEid(null);
        setCopyFailed(false);
      }, 1800);
    },
    []
  );

  useEffect(
    () => () => {
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
    },
    []
  );

  const copyStatusFor = (eid: string): CopyStatus | null =>
    copiedEid === eid ? (copyFailed ? 'failed' : 'copied') : null;

  // Announced once, for screen readers, rather than via a live region per card.
  const announcement =
    copiedEid === null
      ? ''
      : copyFailed
        ? 'Copying failed. The browser blocked clipboard access; select the text and copy manually.'
        : 'Provision copied to clipboard.';

  const backlinkCount = (provision: Provision): number => {
    const sectionEid = provision.topLevelEid ?? provision.eid;
    return indexData.incomingFromOtherSections.get(sectionEid)?.length ?? 0;
  };

  // ---- Nested provision -----------------------------------------------------
  const renderChild = (child: Provision, depth: number): React.ReactNode => {
    const incoming = backlinkCount(child);

    return (
<div
        key={child.eid}
        id={`prov-${child.eid}`}
        data-provision-eid={child.eid}
        className={`provision-card ${KIND_STYLE[child.kind] ?? KIND_STYLE.clause} scroll-mt-24 my-3 p-3.5 sm:p-4 rounded-xl transition-colors ${
          depth === 1 ? 'sm:ml-3' : depth === 2 ? 'sm:ml-6' : 'sm:ml-9'
        }`}
      >
        <div className="flex items-center justify-between gap-2 mb-1.5 text-xs">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-mono font-bold text-indigo-700 dark:text-indigo-400 shrink-0">
              {child.num || kindBadge(child.kind)}
            </span>
            {(child.kind === 'proviso' || child.kind === 'explanation') && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-200/80 text-amber-900 dark:bg-amber-900 dark:text-amber-200">
                {child.kind === 'proviso' ? 'Proviso' : 'Explanation'}
              </span>
            )}
            {child.title && !child.title.startsWith(child.num ?? ' ') && child.text && (
              <span className="font-serif text-slate-600 dark:text-slate-300 truncate">{child.title}</span>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <SubtreeSize provision={child} compact />
            {incoming > 0 && (
              <button
                type="button"
                onClick={() => onShowBacklinks(child.eid)}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 transition-colors"
                title={`Cited from ${incoming} other place(s) in this Act`}
              >
                <Link2 className="w-3 h-3" />
                {incoming}
              </button>
            )}
<CopyProvisionButton
              label={`${formatProvisionDisplayTitle(child)}, ${kindBadge(child.kind)}`}
              status={copyStatusFor(child.eid)}
              onCopy={() => copyProvision(child)}
            />
          </div>
        </div>

        {child.text ? (
          <StatuteTextRenderer
            text={child.text}
            citations={child.citations}
            footnotesByNumber={indexData.footnotesByNumber}
            onCitationClick={onCitationClick}
            className={`${fontFamClass} ${fontClass} leading-relaxed`}
          />
        ) : (
          <EmptyNotice provision={child} />
        )}

        {child.children.length > 0 && (
          <div className="mt-2 space-y-2">{child.children.map((sub) => renderChild(sub, depth + 1))}</div>
        )}
      </div>
    );
  };

  // ---- Top-level unit -------------------------------------------------------
  const renderTopLevel = (provision: Provision, opts: { suspect?: boolean; orphan?: boolean } = {}) => {
    const isSchedule = provision.kind === 'schedule';
    const isPreamble = provision.kind === 'chapter';
    const incoming = backlinkCount(provision);
    const outgoing = provision.citations.length;
const isDetached = provision.isUnattributed;
    const suspect = opts.suspect ?? suspectSections.has(provision.eid);

    return (
      <article
        key={provision.eid}
        id={`prov-${provision.eid}`}
        data-provision-eid={provision.eid}
        className={`provision-card scroll-mt-24 p-5 sm:p-7 rounded-2xl border transition-all duration-200 bg-white dark:bg-slate-900 shadow-sm hover:shadow-md ${
          isDetached
            ? 'border-dashed border-violet-300 dark:border-violet-800/70'
            : isPreamble
            ? 'border-indigo-200 dark:border-indigo-900/60'
            : isSchedule
            ? 'border-amber-200 dark:border-amber-900/60'
            : 'border-slate-200/90 dark:border-slate-800'
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3 pb-4 mb-4 border-b border-slate-100 dark:border-slate-800">
<div className="flex items-start gap-3 min-w-0 flex-1">
            {/*
              A detached provision is NOT given a section number. It has none,
              and inventing one would be a lie the reader could not detect. The
              badge shows that it is unplaced, and the page is the only
              reference offered.
            */}
            <div
              className={`flex flex-col items-center justify-center min-w-[54px] p-2 rounded-xl border text-center select-none shrink-0 ${
                isDetached
                  ? 'bg-violet-50 dark:bg-violet-950/40 border-violet-200 dark:border-violet-800'
                  : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
              }`}
            >
              <span
                className={`text-[9px] uppercase font-bold tracking-widest ${
                  isDetached ? 'text-violet-500 dark:text-violet-400' : 'text-slate-400'
                }`}
              >
                {isDetached ? 'UNPLACED' : kindBadge(provision.kind)}
              </span>
              <span
                className={`font-serif font-black text-lg break-all ${
                  isDetached ? 'text-violet-800 dark:text-violet-200' : 'text-slate-800 dark:text-slate-100'
                }`}
              >
                {provision.num || (isDetached ? '?' : '§')}
              </span>
            </div>

            <div className="min-w-0">
              <h2 className="font-serif font-bold text-xl sm:text-2xl text-slate-900 dark:text-slate-100 leading-snug">
                {isDetached
                  ? provision.title || provision.text?.slice(0, 120) || 'Unplaced provision'
                  : formatProvisionDisplayTitle(provision)}
              </h2>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                {provision.page_numbers?.[0] ? (
                  <span className="inline-flex items-center gap-1 font-mono">
                    <Calendar className="w-3 h-3" />
                    p. {provision.page_numbers[0]}
                  </span>
                ) : (
                  // No page in the source, so no page is offered. It is still
                  // placed, by the parser's own ordering.
                  <span className="italic">page not recorded</span>
                )}
                <SubtreeSize provision={provision} />
                {provision.subtreeFootnotes.length > 0 && (
                  <span className="font-mono">
                    {provision.subtreeFootnotes.length} amendment note
                    {provision.subtreeFootnotes.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {incoming > 0 && (
              <button
                type="button"
                onClick={() => onShowBacklinks(provision.eid)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 transition-colors"
                title={`This provision is cited from ${incoming} other places in the Act`}
              >
                <Link2 className="w-3.5 h-3.5" />
                <span>
                  Cited in {incoming} other{incoming > 1 ? 's' : ''}
                </span>
              </button>
            )}

            {outgoing > 0 && (
              <span
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                title={`${outgoing} reference(s) made by this provision`}
              >
                <GitFork className="w-3.5 h-3.5" />
                <span>{outgoing}</span>
              </span>
            )}

<CopyProvisionButton
              label={formatProvisionDisplayTitle(provision)}
              status={copyStatusFor(provision.eid)}
              onCopy={() => copyProvision(provision)}
              size="md"
            />
          </div>
        </div>

{/* Provenance, collapsed by default so the statutory text leads. */}
        {isDetached && (
          <ProvenanceNotice
            tone="detached"
            label="Not attached to a section"
            detail={
              <>
                The parser recorded no parent section for this text
                {provision.page_numbers?.[0] ? ` (page ${provision.page_numbers[0]})` : ''}, so it has no
                section number and is not indexed. It is shown here in page order, where the source places
                it.
              </>
            }
          />
        )}

        {suspect && (
          <ProvenanceNotice
            tone="suspect"
            label="Numbering looks wrong"
            detail={
              <>
                This text appears on page {provision.page_numbers?.[0]}, after much later sections, so it
                is likely part of the Schedules rather than section {provision.num} of the Act. Verify
                against the source PDF.
              </>
            }
          />
        )}

        {provision.text ? (
          <div className="mb-4">
            <StatuteTextRenderer
              text={provision.text}
              citations={provision.citations}
              footnotesByNumber={indexData.footnotesByNumber}
              onCitationClick={onCitationClick}
              className={`${fontFamClass} ${fontClass} leading-relaxed text-slate-800 dark:text-slate-200`}
            />
          </div>
        ) : (
          <div className="mb-4">
            <EmptyNotice provision={provision} />
          </div>
        )}

        {provision.children.length > 0 && (
          <div className="space-y-3 pt-2">
            {provision.children.map((child) => renderChild(child, 1))}
          </div>
        )}
      </article>
    );
  };

// ---- Unattributed provisions --------------------------------------------
  // Counted here for the inline summary only. They are no longer collected into
  // a trailing block: they are interleaved into `stream` by page, because we
  // know which page each one's text came from.
  const detachedCount = indexData.unattributed.length;
  const detachedFirstPage = indexData.unattributed[0]?.page_numbers?.[0];

  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-8 py-8 space-y-10" id="statute-continuous-canvas">
      {/* One live region for the whole canvas. A live region per card would make
          a screen reader announce every copy feedback in the document. */}
      <p aria-live="polite" role="status" className="sr-only">
        {announcement}
      </p>
      {/* Act header */}
      <header className="text-center py-10 px-6 sm:px-10 rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-amber-600 via-amber-500 to-indigo-600" />
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-widest bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 border border-amber-300 dark:border-amber-800 mb-3">
          <BookOpen className="w-3.5 h-3.5" />
          <span>{document.source || 'Statute'}</span>
        </div>
        <h1 className="font-serif font-black text-2xl sm:text-4xl text-slate-900 dark:text-slate-100 tracking-tight leading-tight">
          {document.title}
        </h1>
        {(document.subtitle || document.updatedAsOf) && (
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 font-medium">
            {document.subtitle}
            {document.subtitle && document.updatedAsOf ? ' · ' : ''}
            {document.updatedAsOf && `As amended up to ${document.updatedAsOf}`}
          </p>
        )}
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3 text-xs text-slate-600 dark:text-slate-300">
          <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 font-mono">
            {indexData.quality.totalProvisions} Provisions
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 font-mono">
            {indexData.quality.citationCount} References
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 font-mono">
            {indexData.quality.footnoteCount} Amendment Notes
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 font-mono">
            {indexData.quality.sectionCount} Sections
          </span>
        </div>
      </header>

{/*
        One chronological stream. `indexData.documentOrder` interleaves the
        detached provisions by page, so this is the whole Act in source order
        rather than 583 sections followed by a dump.
      */}
      <div className="space-y-8">{stream.map((p) => renderTopLevel(p))}</div>

      {/* Note on the unplaced provisions, now scattered through the text above. */}
      {detachedCount > 0 && (
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-violet-50 dark:bg-violet-950/20 border border-violet-200 dark:border-violet-800/60">
          <Inbox className="w-5 h-5 text-violet-600 shrink-0 mt-0.5" />
          <div className="text-xs text-violet-900 dark:text-violet-200 space-y-1">
            <p className="font-bold">
              {detachedCount} provision{detachedCount > 1 ? 's' : ''} could not be attached to a section
              {detachedFirstPage ? ` (from page ${detachedFirstPage})` : ''}
            </p>
            <p>
              The parser did not record a parent section for these, so they are shown in page order with a
              dashed border and no section number rather than being guessed at or filed at the end of the
              Act. They are excluded from the index for the same reason.
            </p>
          </div>
        </div>
      )}

      <footer className="text-center py-10 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
        <p className="flex items-center justify-center gap-1">
          <FileText className="w-4 h-4" />
<span>
            {PRODUCT_NAME} &bull; {document.title}
          </span>
        </p>
        <p className="mt-1 flex items-center justify-center gap-1">
          <Check className="w-3 h-3 text-emerald-600" />
          <span>
            {indexData.quality.internalResolved} references resolved &bull;{' '}
            {indexData.quality.externalCount} to other Acts
          </span>
        </p>
        <p className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          <span>
            Created by{' '}
            <a
              href={AUTHOR_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="font-semibold text-indigo-600 hover:text-indigo-700 hover:underline dark:text-indigo-400 dark:hover:text-indigo-300"
            >
              {AUTHOR_NAME}
            </a>
          </span>
          <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
            &bull;
          </span>
          <span>
            No document yet? Convert a PDF with{' '}
            <a
              href={PARSER_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="font-semibold text-indigo-600 hover:text-indigo-700 hover:underline dark:text-indigo-400 dark:hover:text-indigo-300"
            >
              {PARSER_NAME}
            </a>
          </span>
        </p>
      </footer>
    </main>
  );
});