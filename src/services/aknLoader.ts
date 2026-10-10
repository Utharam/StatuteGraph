/**
 * Dataset ingestion for the statute reader. Any Act.
 *
 * Responsibilities, in order:
 *   1. Fetch and validate the raw AKN payload.
 *   2. Normalise `RawProvision` -> `Provision`, computing titles, subtree
 *      citation/footnote rollups and ancestry exactly once.
 *   3. Build the citation graph: forward (author -> citations) AND backward
 *      (target <- citations). The backward index is what answers "which other
 *      sections refer to this one?".
 *   4. Split provisions into genuine document-level units vs. provisions the
 *      parser lost the parent of, so the UI never shows an orphan as a section.
 *   5. Record every data defect we can detect, rather than hiding it.
 *
 * INVARIANT that must not be broken: `citation.span` indexes the RAW
 * `provision.text`. Any sanitising (whitespace collapsing, soft-hyphen
 * stripping) shifts offsets, so text must always be sliced raw and cleaned
 * per-segment at render time.
 */

import {
  AknActMeta,
  AknDataset,
  Citation,
  CitationTarget,
  Footnote,
  Provision,
  ProvisionKind,
  RawCitation,
  RawFootnote,
  ResolvedCitationTarget,
  TOP_LEVEL_KINDS,
} from '../types/akn';
import {
buildExternalTarget,
  classifyCitationScope,
  extractNamedAct,
  normalizeRelation,
  NamedAct,
} from './citationScope';

export interface DataQualityReport {
  totalProvisions: number;
  sectionCount: number;
  scheduleCount: number;
  preambleCount: number;
  /** Provisions with no resolvable parent section (all `sec_unknown__*`). */
  unattributedCount: number;
  /** Characters held by those unattributed provisions. */
  unattributedCharCount: number;
  /** Orphan roots plus every descendant of an orphan. */
  detachedCount: number;
  detachedCharCount: number;
  /** Provisions whose entire subtree holds zero characters. */
  emptySubtreeCount: number;
  /**
   * Provisions with empty own-text whose descendants DO hold text. These were
   * previously reported as "no text extracted", which is misleading.
   */
  emptyOwnTextWithDescendantTextCount: number;
  /** Sections whose page position contradicts their statutory number. */
  suspectSectionEids: string[];
  citationCount: number;
  /** Citations we can pin to a node in this Act. */
  internalResolved: number;
  /** Citations to provisions of THIS Act that the parser never emitted. */
  internalUnresolved: number;
  /** Citations to foreign instruments. */
  externalCount: number;
  footnoteCount: number;
  /** Footnotes with no `associated_eid`, so unreachable by provision. */
  orphanedFootnoteCount: number;
  /** In-text `[n]` markers that match no footnote record. */
  danglingFootnoteMarkers: string[];
  relationCounts: Record<string, number>;
}

export interface IndexedAknData {
  /**
   * The raw parsed payload, retained only for its `akomaNtoso.act.meta` block.
   *
   * The `provisions`, `citations` and `footnotes` arrays are deliberately
   * released after indexing: keeping a second full copy of a 10 MB Act alive
   * for the whole session is pure waste, and nothing reads it. See
   * `releaseRawPayload`.
   */
  dataset: AknDataset;
  /** Meta only, e.g. `{ title, act_year }`. Cheap to keep. */
  meta?: AknActMeta;
  provisions: Provision[];
  provisionsByEid: Map<string, Provision>;

  /** Genuine sections keyed by lowercased statutory number, e.g. "31a". */
  sectionsByNum: Map<string, Provision>;
  /** Sections keyed by eid, used for the "out of place" integrity check. */
  sectionsByEid: Map<string, Provision>;

  citations: Citation[];
  /** OUTGOING: source provision eid -> citations authored by it. */
  citationsByParent: Map<string, Citation[]>;
  /** INCOMING: target eid -> citations pointing at it. */
  citationsByTarget: Map<string, Citation[]>;
  /** INCOMING rolled up: a citation to sec_44(1) also counts against sec_44. */
  incomingBySection: Map<string, Citation[]>;
  /**
   * The literal "found in other sections too": citations into a section whose
   * author sits in a DIFFERENT section.
   */
  incomingFromOtherSections: Map<string, Citation[]>;

  footnotesByNumber: Map<string, Footnote>;
  footnotesByEid: Map<string, Footnote[]>;
  /**
   * Every footnote in the payload, including ones synthesised from provision
   * amendments and ones with no owning provision. Snapshotted before the raw
   * payload is released.
   */
  allFootnotes: Footnote[];

  /** Top-level document units in reading order. */
  readingOrder: Provision[];
  /** Provisions the parser failed to attach to a section. */
  unattributed: Provision[];
  /**
   * Reading order for the whole document: genuine units and detached
   * provisions interleaved by page. This is what the reader walks.
   *
   * `readingOrder` and `unattributed` stay separate because the index needs to
   * know which provisions are real sections.
   */
  documentOrder: Provision[];

  quality: DataQualityReport;
}

// ---------------------------------------------------------------------------
// Text sanitation
// ---------------------------------------------------------------------------

/** Repair artefacts introduced by PDF text extraction. */
export function cleanStatuteText(text: string): string {
  if (!text) return '';
  return text
    .replace(/\ufffd/g, ' ')
    .replace(/[\u00AD\u200B\u200C\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\[\*\*\*\*\*[\.,]?\]/g, '[Omitted]')
    .trim();
}

/**
 * Titles a provision the way a legal index does.
 *
 * `heading` exists on only 4 of 1692 provisions, so this heuristic carries the
 * whole UI. Indian statutes print the marginal note inline before the first
 * enumerated sub-provision:
 *
 *   "Prohibition of unauthorised collection of tax.- (1) A person who ..."
 *   "Authority for advance ruling.— Subject to the provisions ..."
 *
 * Splitting on the dash boundary is far more reliable than "the first full
 * stop", which used to mangle definitional sub-sections. Note some marginal
 * notes are long: section 73's runs to 187 characters, so the capture window
 * has to be generous or those sections fall back to a bare "Section 73".
 */
export function extractProvisionTitle(provision: {
  heading?: string | null;
  text?: string;
  kind: ProvisionKind;
  num: string;
}): string {
  const heading = provision.heading?.trim();
  if (heading) return cleanStatuteText(heading);

  const text = provision.text ? cleanStatuteText(provision.text) : '';
  if (!text) return fallbackTitle(provision.kind, provision.num);

  // "Marginal note.- body" / "Marginal note.— body"
  const withPeriod = text.match(/^(.{3,300}?)\.\s*[-–—]\s*/);
  if (withPeriod) return trimTitle(withPeriod[1]);

  // "Marginal note - body"
  const withDash = text.match(/^(.{3,300}?)\s[-–—]\s+(?=\S)/);
  if (withDash) return trimTitle(withDash[1]);

  // "Marginal note: body"
  const withColon = text.match(/^(.{3,200}?):\s+(?=\S)/);
  if (withColon) return trimTitle(withColon[1]);

  // A bare definitional sub-section has no marginal note. A short lead-in is
  // still more useful than the whole sentence.
  const firstSentence = text.match(/^(.{3,90}?)\.\s/);
  if (firstSentence && !firstSentence[1].startsWith('(')) return trimTitle(firstSentence[1]);

  // For a document-level unit a title is expected, so fall back to the opening
  // words rather than a bare "Section 73", which tells the reader nothing.
  if (TOP_LEVEL_KINDS.has(provision.kind) && !text.startsWith('(')) {
    return trimTitle(text);
  }

  return fallbackTitle(provision.kind, provision.num);
}

/** Caps a derived title at a word boundary so TOC labels stay scannable. */
function trimTitle(title: string): string {
  const clean = title.trim().replace(/\s+/g, ' ');
  const MAX = 180;
  if (clean.length <= MAX) return clean;
  const cut = clean.slice(0, MAX);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 60 ? cut.slice(0, lastSpace) : cut) + '…';
}

export function fallbackTitle(kind: ProvisionKind, num: string): string {
  const label = TIER_LABELS[kind];
  return num ? `${label} ${num}` : label;
}

export const TIER_LABELS: Record<ProvisionKind, string> = {
  chapter: 'Chapter',
  section: 'Section',
  subsection: 'Sub-section',
  clause: 'Clause',
  subclause: 'Sub-clause',
  proviso: 'Proviso',
  explanation: 'Explanation',
  schedule: 'Schedule',
  schedule_item: 'Schedule item',
};

// ---------------------------------------------------------------------------
// Title display
// ---------------------------------------------------------------------------

export function formatProvisionDisplayTitle(provision: Provision): string {
  const { kind, num } = provision;
  const label = TIER_LABELS[kind];

  if (kind === 'section') {
    const bare = num ? `Section ${num}` : 'Section';
    const heading = provision.heading?.trim();
    if (heading) return `${bare}: ${cleanStatuteText(heading)}`;
    const title = provision.title;
    if (title && !isRedundantTitle(title, kind)) return `${bare}: ${title}`;
    return bare;
  }

  if (kind === 'schedule') {
    const bare = num ? `Schedule ${num}` : 'Schedule';
    const heading = provision.heading?.trim();
    return heading ? `${bare}: ${cleanStatuteText(heading)}` : bare;
  }

  if (kind === 'subsection' || kind === 'clause' || kind === 'subclause') {
    const bare = num ? `${label} ${num}` : label;
    const title = provision.title;
    return title && !isRedundantTitle(title, kind) ? `${bare}: ${title}` : bare;
  }

  return provision.title || bareLabel(kind, num);
}

function bareLabel(kind: ProvisionKind, num: string): string {
  const label = TIER_LABELS[kind];
  return num ? `${label} ${num}` : label;
}

/**
 * True when a title merely restates the tier, e.g. a sub-section numbered "(2)"
 * whose derived title is "Sub-section (2)". Rendering "Sub-sec (2): Sub-section
 * (2)" is the bug this guard exists to prevent.
 */
function isRedundantTitle(title: string, kind: ProvisionKind): boolean {
  const normalised = title.trim().toLowerCase();
  const label = TIER_LABELS[kind].toLowerCase();
  if (normalised === label) return true;
  // "(2)" style numerals, punctuation-insensitive.
  const bare = normalised.replace(/[^a-z]/g, '');
  const labelBare = label.replace(/[^a-z]/g, '');
  if (bare === labelBare || bare === `${labelBare}s`) return true;
  if (new RegExp(`^\\(?[\\da-z]+\\)?$`).test(normalised)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

/**
 * Drops the bulk of a parsed payload once it has been indexed, keeping only
 * the document meta.
 *
 * For the Income-tax Act 2025 that is roughly 8,700 raw provision objects plus
 * 2,326 raw citations - all of which the normalised model already supersedes.
 * Nothing downstream reads them, so holding them for the life of the tab is
 * tens of megabytes of avoidable heap.
 *
 * The input object is emptied in place and returned, so callers holding a
 * reference see the same thing.
 */
function releaseRawPayload(dataset: AknDataset): AknDataset {
  dataset.provisions = [];
  dataset.citations = [];
  dataset.footnotes = [];
  dataset.diagnostics = [];
  return dataset;
}

/**
 * Builds every lookup the reader needs from a validated payload.
 * Pure and synchronous: also used directly by the test suite.
 */
export function buildIndex(dataset: AknDataset): IndexedAknData {
  const provisionsByEid = new Map<string, Provision>();
  const sectionsByNum = new Map<string, Provision>();
  const sectionsByEid = new Map<string, Provision>();

  // -- 1. Normalise provisions ------------------------------------------------
  const rawProvisions = dataset.provisions;

  for (let i = 0; i < rawProvisions.length; i++) {
    const raw = rawProvisions[i];
    const provision: Provision = {
      eid: raw.eid,
      kind: raw.kind,
      num: raw.num ?? '',
      heading: raw.heading ?? null,
      parent_eid: raw.parent_eid ?? null,
      text: raw.text ?? '',
      page_numbers: raw.page_numbers,
      citations: [],
      footnotes: [],
      children: [],
      sourceIndex: i,
      subtreeCitations: [],
      subtreeFootnotes: [],
      subtreeTextLength: (raw.text ?? '').length,
      topLevelEid: null,
      isUnattributed: false,
      isDetached: false,
      title: '',
    };
    provision.title = extractProvisionTitle(provision);
    provisionsByEid.set(provision.eid, provision);
  }

  // -- 2. Build the parent/child tree ----------------------------------------
  // Provisions whose parent does not exist are treated as roots and reported,
  // rather than silently dropped from the document.
  for (const provision of provisionsByEid.values()) {
    const parentEid = provision.parent_eid;
    if (!parentEid) continue;
    const parent = provisionsByEid.get(parentEid);
    if (parent && parent !== provision) {
      parent.children.push(provision);
    } else {
      provision.parent_eid = null;
    }
  }

  // Sibling order follows the source array: verified correct for every one of
  // the 341 parent groups in this dataset. `num` must not be used for sorting
  // because it is non-monotonic (e.g. sec_54's children run (2)...(14), (1), (2)dup).
  for (const provision of provisionsByEid.values()) {
    provision.children.sort((a, b) => a.sourceIndex - b.sourceIndex);
  }

  // -- 3. Ancestry -------------------------------------------------------------
  // topLevelEid is the nearest ancestor that heads the document. It powers the
  // backlink rollups and the "am I inside section X?" question.
  const topLevelCache = new Map<string, string | null>();
  const resolveTopLevel = (provision: Provision, seen: Set<string>): string | null => {
    const cached = topLevelCache.get(provision.eid);
    if (cached !== undefined) return cached;

    if (seen.has(provision.eid)) return null; // defensive: cyclic parent_eid
    seen.add(provision.eid);

    const parent = provision.parent_eid ? provisionsByEid.get(provision.parent_eid) : undefined;
    let result: string | null;
    if (!parent) {
      result = TOP_LEVEL_KINDS.has(provision.kind) ? provision.eid : null;
    } else {
      result = resolveTopLevel(parent, seen);
    }

    seen.delete(provision.eid);
    topLevelCache.set(provision.eid, result);
    return result;
  };

  for (const provision of provisionsByEid.values()) {
    provision.topLevelEid = resolveTopLevel(provision, new Set());
  }

  // -- 4. Footnotes ------------------------------------------------------------
  const footnotesByNumber = new Map<string, Footnote>();
  const footnotesByEid = new Map<string, Footnote[]>();
  // Held by reference and copied at the end of this step, because
  // `releaseRawPayload` empties `dataset.footnotes` before the return literal
  // is evaluated.
  const rawFootnotes = dataset.footnotes as RawFootnote[];
  /** Grows with synthesised footnotes so `allFootnotes` is the true total. */
  const allFootnotes: Footnote[] = [];

  for (const raw of rawFootnotes) {
    const footnote: Footnote = {
      number: raw.number,
      raw_text: raw.raw_text,
      associated_eid: raw.associated_eid,
      page_number: raw.page_number,
      amendment: raw.amendment,
    };
    footnotesByNumber.set(footnote.number, footnote);
    allFootnotes.push(footnote);

    const owner = footnote.associated_eid ? provisionsByEid.get(footnote.associated_eid) : undefined;
    if (owner) {
      owner.footnotes.push(footnote);
      const list = footnotesByEid.get(owner.eid) ?? [];
      list.push(footnote);
      footnotesByEid.set(owner.eid, list);
    }
  }

  // Some footnotes carry no associated_eid. They remain reachable through
  // their in-text [n] marker via footnotesByNumber, but they cannot be
  // attributed to a provision, so we record how many we lost.
  const orphanedFootnoteCount = rawFootnotes.filter(
    (fn) => !fn.associated_eid || !provisionsByEid.has(fn.associated_eid)
  ).length;

  // A provision may also carry its amendments inline even when
  // the matching footnote record has no associated_eid. Re-home those.
  for (const raw of rawProvisions) {
    if (!raw.amendments?.length) continue;
    const provision = provisionsByEid.get(raw.eid);
    if (!provision) continue;
    for (const amendment of raw.amendments) {
      const known = footnotesByNumber.get(amendment.footnote_number);
      if (known) {
        if (!known.associated_eid) {
          known.associated_eid = provision.eid;
          if (!footnotesByEid.has(provision.eid)) footnotesByEid.set(provision.eid, []);
          if (!provision.footnotes.some((f) => f.number === known.number)) {
            provision.footnotes.push(known);
            footnotesByEid.get(provision.eid)!.push(known);
          }
        }
      } else {
        const synthesised: Footnote = {
          number: amendment.footnote_number,
          raw_text: amendment.raw_text,
          associated_eid: provision.eid,
          amendment,
        };
        footnotesByNumber.set(synthesised.number, synthesised);
        provision.footnotes.push(synthesised);
        const list = footnotesByEid.get(provision.eid) ?? [];
        list.push(synthesised);
        footnotesByEid.set(provision.eid, list);
        allFootnotes.push(synthesised);
      }
    }
  }

  // -- 5. Sections -------------------------------------------------------------
  // Indexed before citation normalisation, because resolving a dangling
  // `sec_<num>` target needs the statutory-number lookup.
  for (const provision of provisionsByEid.values()) {
    if (provision.kind !== 'section') continue;
    sectionsByEid.set(provision.eid, provision);
    const key = provision.num.toLowerCase();
    if (key && !sectionsByNum.has(key)) sectionsByNum.set(key, provision);
  }

  // -- 6. Citations ------------------------------------------------------------
  // Must happen BEFORE the subtree rollups below, so a provision's own
  // citations are included in its rollup.
  //
  // `selfActName` lets a reference naming this Act's own full title be
  // recognised as internal. It is read from the document being opened, so it
  // works for any statute rather than a particular one.
  const selfActName = dataset.akomaNtoso?.act?.meta?.title?.trim() || undefined;
  const citations = normalizeCitations(
    dataset.citations as RawCitation[],
    provisionsByEid,
    sectionsByNum,
    selfActName
  );

  for (const citation of citations) {
    const author = provisionsByEid.get(citation.parentEid);
    if (author) author.citations.push(citation);
  }

  // -- 7. Subtree rollups ------------------------------------------------------
  // Post-order so children finish before their parent.
  const rollup = (provision: Provision, seen: Set<string>): void => {
    if (seen.has(provision.eid)) return;
    seen.add(provision.eid);

    const citations: Citation[] = provision.citations.slice();
    const footnotes: Footnote[] = provision.footnotes.slice();
    let textLength = provision.text.length;

    for (const child of provision.children) {
      rollup(child, seen);
      citations.push(...child.subtreeCitations);
      footnotes.push(...child.subtreeFootnotes);
      textLength += child.subtreeTextLength;
    }

    provision.subtreeCitations = citations;
    provision.subtreeFootnotes = footnotes;
    provision.subtreeTextLength = textLength;
    seen.delete(provision.eid);
  };

  for (const provision of provisionsByEid.values()) {
    if (provision.parent_eid) continue;
    rollup(provision, new Set());
  }

  // -- 8. Citation graph --------------------------------------------------------
  const citationsByParent = new Map<string, Citation[]>();
  const citationsByTarget = new Map<string, Citation[]>();

  const push = <K>(map: Map<K, Citation[]>, key: K, citation: Citation): void => {
    const list = map.get(key);
    if (list) list.push(citation);
    else map.set(key, [citation]);
  };

  for (const citation of citations) {
    push(citationsByParent, citation.parentEid, citation);

    // Only internal targets create backlinks. An external Act has no node here.
    if (citation.target.scope === 'internal' && citation.target.targetEid) {
      push(citationsByTarget, citation.target.targetEid, citation);
    }
  }

  // Roll backlinks up to the enclosing document-level unit, then split out the
  // ones authored from a DIFFERENT section. That split is requirement 3:
  // "find the section found in other sections too".
  const incomingBySection = new Map<string, Citation[]>();
  const incomingFromOtherSections = new Map<string, Citation[]>();

  for (const [targetEid, list] of citationsByTarget) {
    const sectionEid = topLevelCache.get(targetEid) ?? null;
    if (!sectionEid) continue;
    const existing = incomingBySection.get(sectionEid);
    if (existing) existing.push(...list);
    else incomingBySection.set(sectionEid, [...list]);
  }

  for (const [sectionEid, list] of incomingBySection) {
    incomingFromOtherSections.set(
      sectionEid,
      list.filter((citation) => {
        const authorTop = provisionsByEid.get(citation.parentEid)?.topLevelEid ?? null;
        return authorTop !== sectionEid;
      })
    );
  }

  // -- 9. Split top-level units from orphans -----------------------------------
  const readingOrder: Provision[] = [];
  const unattributed: Provision[] = [];
  let documentOrder: Provision[] = [];

  for (const provision of provisionsByEid.values()) {
    if (provision.parent_eid) continue;
    if (TOP_LEVEL_KINDS.has(provision.kind)) {
      readingOrder.push(provision);
    } else {
      // The parser lost this node's parent section. Recorded so the UI can flag
      // it rather than presenting it as a section.
      provision.isUnattributed = true;
      unattributed.push(provision);
    }
  }

  // A branch is detached when no ancestor of it heads the document. This is
  // wider than `unattributed`: it also covers every descendant of an orphan,
  // which matters because those descendants are just as unplaceable.
  for (const provision of provisionsByEid.values()) {
    if (provision.topLevelEid) continue;
    provision.isDetached = true;
    for (const descendant of descendantsOf(provision)) {
      descendant.isDetached = true;
    }
  }

  readingOrder.sort(compareReadingOrder);
  unattributed.sort((a, b) => minPage(a) - minPage(b) || a.sourceIndex - b.sourceIndex);

  // The single stream the reader actually walks.
  //
  // Detached provisions are NOT appended: they carry real statutory text and we
  // know which page it came from, so it is interleaved where the PDF puts it.
  // In the Income-tax Act 2025 export the 410 orphans hold 99,374 characters
  // against 37,597 for all 539 sections combined - burying them would hide the
  // bulk of the document behind 583 sections the reader must scroll past.
  documentOrder = [...readingOrder, ...unattributed].sort(compareReadingOrder);

  // -- 10. Integrity check ------------------------------------------------------
  const suspectSectionEids = findOutOfPlaceSections(sectionsByEid, readingOrder);

  // -- 11. Quality report ------------------------------------------------------
  const relationCounts: Record<string, number> = {};
  let internalResolved = 0;
  let internalUnresolved = 0;
  let externalCount = 0;

  for (const citation of citations) {
    relationCounts[citation.relation] = (relationCounts[citation.relation] ?? 0) + 1;
    if (citation.target.scope === 'internal') {
      if (citation.target.targetEid) internalResolved++;
      else internalUnresolved++;
    } else {
      externalCount++;
    }
  }

  const danglingFootnoteMarkers = findDanglingFootnoteMarkers(provisionsByEid, footnotesByNumber);

  const allProvisions = Array.from(provisionsByEid.values());
  const emptySubtreeCount = allProvisions.filter((p) => p.subtreeTextLength === 0).length;
  const emptyOwnTextWithDescendantTextCount = allProvisions.filter(
    (p) => p.text.trim().length === 0 && p.subtreeTextLength > 0
  ).length;
  // Own text, not subtree text. Summing `subtreeTextLength` over every detached
  // node would count an inner orphan's descendants once for the orphan and again
  // for each ancestor, inflating the figure. Counting each node's own text once
  // is the only unambiguous definition, and is what the parser report uses.
  const unattributedCharCount = unattributed.reduce((n, p) => n + p.text.length, 0);
  const detached = allProvisions.filter((p) => p.isDetached);
  const detachedCharCount = detached.reduce((n, p) => n + p.text.length, 0);

  const quality: DataQualityReport = {
    totalProvisions: provisionsByEid.size,
    sectionCount: sectionsByEid.size,
    scheduleCount: allProvisions.filter((p) => p.kind === 'schedule').length,
    preambleCount: allProvisions.filter((p) => p.kind === 'chapter' && /preamble/i.test(p.num)).length,
    unattributedCount: unattributed.length,
    unattributedCharCount,
    detachedCount: detached.length,
    detachedCharCount,
    emptySubtreeCount,
    emptyOwnTextWithDescendantTextCount,
    suspectSectionEids,
    citationCount: citations.length,
    internalResolved,
    internalUnresolved,
    externalCount,
    footnoteCount: dataset.footnotes.length,
    orphanedFootnoteCount,
    danglingFootnoteMarkers,
    relationCounts,
  };

  return {
    dataset: releaseRawPayload(dataset),
    meta: dataset.akomaNtoso?.act?.meta,
    provisions: Array.from(provisionsByEid.values()),
    provisionsByEid,
    sectionsByNum,
    sectionsByEid,
    citations,
    citationsByParent,
    citationsByTarget,
    incomingBySection,
    incomingFromOtherSections,
    footnotesByNumber,
    footnotesByEid,
    // Captured before release below: reading `dataset.footnotes` inside the
    // return literal would always yield the emptied array, so this field was
    // silently always [].
    allFootnotes: allFootnotes as Footnote[],
    readingOrder,
    unattributed,
    documentOrder,
    quality,
  };
}

/** Every descendant of `provision`, breadth-first, excluding itself. */
function descendantsOf(provision: Provision): Provision[] {
  const out: Provision[] = [];
  const stack = [...provision.children];
  while (stack.length > 0) {
    const node = stack.pop()!;
    out.push(node);
    stack.push(...node.children);
  }
  return out;
}

function minPage(provision: Provision): number {
  const pages = provision.page_numbers;
  if (!pages || pages.length === 0) return Number.MAX_SAFE_INTEGER;
  return Math.min(...pages);
}

/**
 * Document reading order: earliest page first, then tier, then the position of
 * the source array as a tiebreak. Sorting the top-level units by page is what
 * keeps appended material (schedules, appendix) at the end.
 *
 * Detached provisions rank between sections and schedules. They are body text,
 * so on a page shared with a schedule they should still precede it.
 *
 * A provision with no `page_numbers` cannot be placed, so it is neither given a
 * fabricated page nor a reference it does not have: `minPage` returns
 * MAX_SAFE_INTEGER, which parks it after every located provision while
 * preserving the parser's own ordering among the unplaced ones.
 */
function compareReadingOrder(a: Provision, b: Provision): number {
  return (
    minPage(a) - minPage(b) ||
    tierRank(a.kind, a.isUnattributed) - tierRank(b.kind, b.isUnattributed) ||
    a.sourceIndex - b.sourceIndex
  );
}

function tierRank(kind: ProvisionKind, isDetached: boolean): number {
  if (isDetached) return 2;
  switch (kind) {
    case 'chapter':
      return 0;
    case 'section':
      return 1;
    case 'schedule':
      return 3;
    default:
      return 2;
  }
}

/**
 * Flags sections whose position in the PDF contradicts their statutory number.
 *
 * This catches a specific parser failure: the extractor read the table of
 * contents' "SCHEDULE III" heading, then numbered every following top-level
 * numeral as a schedule item. Two provisions therefore exist as `section`
 * nodes carrying numbers 6 and 7 whose text is actually Schedule II
 * paragraphs, on page 200 - long after section 174 on page 195.
 *
 * We do not hardcode those eids. A section is suspect when it appears on a
 * page beyond every section that should follow it in the numbering sequence.
 */
function findOutOfPlaceSections(
  sectionsByEid: Map<string, Provision>,
  readingOrder: Provision[]
): string[] {
  const sections = readingOrder.filter((p) => p.kind === 'section');
  if (sections.length === 0) return [];

  const pageByOrdinal = new Map<number, number>();
  for (const section of sections) {
    const ordinal = statutoryOrdinal(section.num);
    if (ordinal === null) continue;
    if (!pageByOrdinal.has(ordinal)) pageByOrdinal.set(ordinal, minPage(section));
  }

  const sortedOrdinals = Array.from(pageByOrdinal.keys()).sort((a, b) => a - b);

  const suspect: string[] = [];
  for (const [ordinal, page] of pageByOrdinal) {
    let laterPage = Number.MAX_SAFE_INTEGER;
    for (const other of sortedOrdinals) {
      if (other > ordinal && pageByOrdinal.get(other)! < laterPage) {
        laterPage = pageByOrdinal.get(other)!;
      }
    }
    if (page > laterPage) {
      // Report the eid(s) behind this ordinal.
      for (const section of sections) {
        if (statutoryOrdinal(section.num) === ordinal && minPage(section) === page) {
          suspect.push(section.eid);
        }
      }
    }
  }

  // Keep only ids that exist in the section map, de-duplicated.
  return Array.from(new Set(suspect)).filter((eid) => sectionsByEid.has(eid));
}

/**
 * "31A" -> 1, "31B" -> 2. Returns null for non-statutory numerals.
 */
export function statutoryOrdinal(num: string): number | null {
  const m = (num || '').match(/^(\d+)/);
  return m ? Number(m[1]) : null;
}

/** Compares statutory numbers so 31 < 31A < 31B < 32. */
export function compareStatutoryNumbers(a: string, b: string): number {
  const na = statutoryOrdinal(a);
  const nb = statutoryOrdinal(b);
  if (na !== null && nb !== null && na !== nb) return na - nb;
  if (na !== null && nb === null) return -1;
  if (na === null && nb !== null) return 1;
  return (a || '').localeCompare(b || '');
}

function findDanglingFootnoteMarkers(
  provisionsByEid: Map<string, Provision>,
  footnotesByNumber: Map<string, Footnote>
): string[] {
  const dangling = new Set<string>();
  const marker = /\[(\d+)\]/g;
  for (const provision of provisionsByEid.values()) {
    if (!provision.text) continue;
    marker.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = marker.exec(provision.text)) !== null) {
      if (!footnotesByNumber.has(match[1])) dangling.add(match[1]);
    }
  }
  return Array.from(dangling).sort((a, b) => Number(a) - Number(b));
}

// ---------------------------------------------------------------------------
// Citation normalisation
// ---------------------------------------------------------------------------

function normalizeCitations(
  rawCitations: RawCitation[],
  provisionsByEid: Map<string, Provision>,
  sectionsByNum: Map<string, Provision>,
  selfActName?: string
): Citation[] {
  const out: Citation[] = [];
  const seen = new Set<string>();

  for (const raw of rawCitations) {
    const id = `${raw.parent_eid}#${raw.span?.[0] ?? 0}-${raw.span?.[1] ?? 0}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const rawText = raw.raw_text ?? '';
    const target = buildCitationTarget(raw, rawText, provisionsByEid, sectionsByNum, selfActName);

    out.push({
      id,
      parentEid: raw.parent_eid,
      rawText,
      span: [raw.span?.[0] ?? 0, raw.span?.[1] ?? 0],
      relation: normalizeRelation(raw.relation),
      target,
      parser: {
        targetEid: raw.target_eid,
        external: raw.external,
        resolved: raw.resolved,
        targetType: raw.target_type,
      },
    });
  }

  return out;
}

/**
 * Builds the citation target.
 *
 * Order matters and is the bug this replaces: scope is decided FIRST from the
 * statutory words. Only after we know a reference is to this Act do we use
 * `target_eid` to pick a node.
 */
export function buildCitationTarget(
  raw: RawCitation,
  rawText: string,
  provisionsByEid: Map<string, Provision>,
  sectionsByNum: Map<string, Provision>,
  selfActName?: string
): CitationTarget {
  // 1. Scope, from the words. Never from target_eid.
  //
  //    `extractNamedAct` recognises ANY instrument name, not just the ones in
  //    the registry. An unfamiliar Act must still be reported as another Act,
  //    otherwise a reference like "section 4 of the Indian Partnership Act,
  //    1932" would open this Act's own section 4.
  const named = extractNamedAct(rawText, selfActName);
  if (named) return buildExternalTarget(rawText, named);

  // Defensive: if the two disagree, trust the pattern classifier.
  if (classifyCitationScope(rawText, selfActName) === 'external') {
    const fallback: NamedAct = { name: rawText.trim(), year: null, known: null };
    return buildExternalTarget(rawText, fallback);
  }

  const attemptedEid = raw.target_eid ?? '';
  const citedAs = rawText.trim();

  // 2. Internal. Exact node.
  if (attemptedEid && provisionsByEid.has(attemptedEid)) {
    return {
      scope: 'internal',
      targetEid: attemptedEid,
      citedAs,
      resolution: 'exact',
      degradedFrom: null,
    };
  }

  // 3. Internal. The parser systematically dropped sub-section (1) (141 of
  //    150 sections) because it folded it into the section's own text. Step
  //    down to the parent section, but record that we degraded.
  if (attemptedEid) {
    const sectionMatch = attemptedEid.match(/^(sec_[0-9a-z]+)/i);
    if (sectionMatch) {
      const section = provisionsByEid.get(sectionMatch[1]);
      if (section) {
        return {
          scope: 'internal',
          targetEid: section.eid,
          citedAs,
          resolution: 'section-level',
          degradedFrom: attemptedEid,
        };
      }

      // 4. Bare `sec_<num>` with no exact node: try the statutory number.
      const numMatch = sectionMatch[1].match(/^sec_(.+)$/i);
      if (numMatch) {
        const byNum = sectionsByNum.get(numMatch[1].toLowerCase());
        if (byNum) {
          return {
            scope: 'internal',
            targetEid: byNum.eid,
            citedAs,
            resolution: 'section-level',
            degradedFrom: attemptedEid,
          };
        }
      }
    }
  }

  // 5. Genuinely unavailable: usually a section the parser never emitted at all
  //    (sections 1-31), or a provision of another Act mislabelled as internal.
  return {
    scope: 'unresolved',
    citedAs,
    attemptedEid: attemptedEid || null,
    reason: raw.external
      ? 'Named another Act, but no matching instrument could be identified.'
      : 'This provision is not present in the parsed dataset.',
  };
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

export function snippet(text: string, max = 260): string {
  const clean = cleanStatuteText(text);
  if (clean.length <= max) return clean;
  return clean.slice(0, max).replace(/\s+\S*$/, '') + '\u2026';
}

export interface ResolveOptions {
  /** Include citations from the target's descendants. Default false for text rendering. */
  includeSubtree?: boolean;
}

/**
 * Resolves a citation to something displayable, without ever lying about scope.
 */
export function resolveCitation(
  citation: Citation,
  indexData: IndexedAknData,
  options: ResolveOptions = {}
): ResolvedCitationTarget {
  const target = citation.target;
  const citedAs = citation.rawText?.trim() || citation.target.citedAs;

  if (target.scope === 'external') {
    return {
      target,
      provision: null,
      displayTitle: target.provisionRef
        ? `${target.provisionRef} of ${target.actName}`
        : target.actName,
      isExternal: true,
      citedAs,
      previewSnippet: target.summary ?? `Referenced as "${citedAs}".`,
      ownCitations: [],
      subtreeCitations: [],
      footnotes: [],
    };
  }

  if (target.scope === 'unresolved') {
    return {
      target,
      provision: null,
      displayTitle: citedAs || 'Unresolved reference',
      isExternal: false,
      citedAs,
      previewSnippet: `${target.reason} Cited as "${citedAs}".`,
      ownCitations: [],
      subtreeCitations: [],
      footnotes: [],
    };
  }

  const provision = target.targetEid ? indexData.provisionsByEid.get(target.targetEid) ?? null : null;

  if (!provision) {
    return {
      target,
      provision: null,
      displayTitle: citedAs || 'Unresolved reference',
      isExternal: false,
      citedAs,
      previewSnippet: 'This provision is not present in the parsed dataset.',
      ownCitations: [],
      subtreeCitations: [],
      footnotes: [],
    };
  }

  return {
    target,
    provision,
    displayTitle: formatProvisionDisplayTitle(provision),
    isExternal: false,
    citedAs,
    previewSnippet: snippet(provision.text),
    ownCitations: provision.citations,
    subtreeCitations: options.includeSubtree ? provision.subtreeCitations : provision.citations,
    footnotes: provision.subtreeFootnotes,
  };
}

/** Outgoing citations authored by a provision alone (spans valid against its text). */
export function getOwnCitations(provision: Provision): Citation[] {
  return provision.citations;
}

/** Outgoing citations from a provision and every descendant. */
export function getSubtreeCitations(provision: Provision): Citation[] {
  return provision.subtreeCitations;
}

export function getFootnotes(provision: Provision): Footnote[] {
  return provision.subtreeFootnotes;
}