/**
 * Document catalogue and loading.
 *
 * Scope: JSON produced by the PDF parser, i.e.
 * an object with top-level `provisions`, `citations` and `footnotes` arrays.
 * Generic Akoma Ntoso XML/JSON is deliberately out of scope — guessing at an
 * unknown schema produces a reader that silently shows the wrong thing, which
 * is worse than a clear rejection.
 */

import { AknDataset } from '../types/akn';
import { buildIndex, IndexedAknData } from './aknLoader';
import {
  StoredDocument,
  deleteDocument,
  getDocument,
  listDocumentSummaries,
  makeDocumentId,
  markDocumentOpened,
  putDocument,
  MAX_DOCUMENT_BYTES,
} from './documentStore';

export type DocumentOrigin = 'builtin' | 'local';

export interface StatuteDocument {
  id: string;
  /** Full title as printed in the gazette, e.g. "The Central Goods and Services Tax Act, 2017". */
  title: string;
  /** Compact title for chrome, e.g. "CGST Act, 2017". */
  shortTitle: string;
  subtitle?: string;
  source?: string;
  updatedAsOf?: string;
  origin: DocumentOrigin;
  /** Where the bytes live: a URL for built-ins, IndexedDB for local files. */
  dataUrl?: string;
  fileName?: string;
  sizeBytes?: number;
  addedAt?: number;
  lastOpenedAt?: number;
  summary?: DatasetSummary;
}

/** Counts shown on library cards. Computed without building the full index. */
export interface DatasetSummary {
  provisions: number;
  sections: number;
  citations: number;
  footnotes: number;
  /** Chapters/schedules, used as a subtitle on the card. */
  containers: number;
}

/**
 * Documents that ship with the app.
 *
 * This is content, not behaviour: nothing in the reader assumes a particular
 * Act is here. `dataUrl` resolves against the site root, so entries work under
 * any base path, and removing one changes nothing but the library listing.
 *
 * To ship another statute, drop its JSON in `public/data/` and add an entry.
 */
export const BUILTIN_DOCUMENTS: StatuteDocument[] = [
  {
    id: 'builtin:cgst-act-2017',
    title: 'The Central Goods and Services Tax Act, 2017',
    shortTitle: 'CGST Act, 2017',
    subtitle: 'Act No. 12 of 2017',
    source: 'India Code',
    updatedAsOf: '30 September 2020',
    origin: 'builtin',
    dataUrl: 'data/cgst-act.json',
  },
];

export const BUILTIN_DOCUMENT_IDS = new Set(BUILTIN_DOCUMENTS.map((d) => d.id));

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export class DocumentLoadError extends Error {
  readonly detail?: string;
  constructor(message: string, detail?: string) {
    super(message);
    this.name = 'DocumentLoadError';
    this.detail = detail;
  }
}

/**
 * Validates the payload and reports *why* it is unusable.
 *
 * The important check is that `eid` values are unique and that citation parents
 * resolve, because both silently corrupt the index otherwise.
 */
export function validateDataset(value: unknown, origin: string): AknDataset {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new DocumentLoadError(
      `${origin} is not a statute JSON file.`,
      'The file must contain a single JSON object with "provisions", "citations" and "footnotes" arrays.'
    );
  }

  const candidate = value as Partial<AknDataset>;

  if (!Array.isArray(candidate.provisions)) {
    throw new DocumentLoadError(
      `${origin} has no "provisions" array.`,
      'This reader expects the AKN export produced by the PDF parser.'
    );
  }
  if (candidate.provisions.length === 0) {
    throw new DocumentLoadError(`${origin} contains no provisions.`, 'The "provisions" array is empty.');
  }

  const first = candidate.provisions[0] as unknown as Record<string, unknown>;
  for (const key of ['eid', 'kind', 'num', 'text'] as const) {
    if (!(key in first)) {
      throw new DocumentLoadError(
        `${origin} is missing the "${key}" field on its first provision.`,
        'Each provision needs at least: eid, kind, num, text.'
      );
    }
  }

  const seenEids = new Set<string>();
  for (const provision of candidate.provisions) {
    const eid = (provision as { eid?: unknown }).eid;
    if (typeof eid !== 'string' || eid.length === 0) {
      throw new DocumentLoadError(
        `${origin} has a provision with a missing or non-string "eid".`,
        'Provisions must carry a unique string identifier.'
      );
    }
    if (seenEids.has(eid)) {
      throw new DocumentLoadError(
        `${origin} contains duplicate provision ids (${eid}).`,
        'Identifiers must be unique or the index cannot be built.'
      );
    }
    seenEids.add(eid);
  }

  // Missing citation arrays are tolerable; dangling parents are not.
  const citations = Array.isArray(candidate.citations) ? candidate.citations : [];
  const dangling = citations.filter((citation) => {
    const parentEid = (citation as { parent_eid?: unknown }).parent_eid;
    return typeof parentEid === 'string' && !seenEids.has(parentEid);
  }).length;

  if (dangling > 0) {
    throw new DocumentLoadError(
      `${origin} has ${dangling} citation(s) pointing at provisions that do not exist.`,
      'This usually means the file was truncated or partially exported.'
    );
  }

  return {
    ...(candidate as AknDataset),
    citations,
    footnotes: Array.isArray(candidate.footnotes) ? candidate.footnotes : [],
    schema_version: candidate.schema_version ?? 'unknown',
  };
}

// ---------------------------------------------------------------------------
// Metadata derivation
// ---------------------------------------------------------------------------

/** "cgst-act-updated.json" -> "Cgst Act Updated". Last resort for a title. */
export function prettifyFileName(fileName: string): string {
  return fileName
    .replace(/\.(json|akn)$/i, '')
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Acronyms that are conventionally written in full capitals in Indian
 * legislation. These are abbreviations, not Act names, so they apply to any
 * statute; the table exists so a parsed title like "the cgst act, 2017" is
 * rendered "the CGST Act, 2017" rather than "Cgst Act".
 */
const ABBREVIATIONS: Array<[RegExp, string]> = [
  [/\bcgst\b/gi, 'CGST'],
  [/\bigst\b/gi, 'IGST'],
  [/\butgst\b/gi, 'UTGST'],
  [/\bsgst\b/gi, 'SGST'],
  [/\bact\b/gi, 'Act'],
];

function abbreviate(title: string): string {
  return ABBREVIATIONS.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), title);
}

/** Builds a short title: "The CGST Act, 2017" -> "CGST Act, 2017". */
export function toShortTitle(title: string): string {
  const withoutLeadingArticle = title.replace(/^The\s+/i, '');
  return abbreviate(withoutLeadingArticle);
}

export function summarizeDataset(dataset: AknDataset): DatasetSummary {
  let sections = 0;
  let containers = 0;
  for (const provision of dataset.provisions) {
    if (provision.kind === 'section') sections++;
    if (provision.kind === 'chapter' || provision.kind === 'schedule') containers++;
  }
  return {
    provisions: dataset.provisions.length,
    sections,
    citations: Array.isArray(dataset.citations) ? dataset.citations.length : 0,
    footnotes: Array.isArray(dataset.footnotes) ? dataset.footnotes.length : 0,
    containers,
  };
}

/**
 * Derives library metadata from the document itself, so a dropped file gets a
 * real title instead of a filename.
 */
export function describeDataset(dataset: AknDataset, fileName?: string): StatuteDocument {
  const fromMeta = dataset.akomaNtoso?.act?.meta?.title?.trim();
  const title = fromMeta && fromMeta.length > 2 ? fromMeta : prettifyFileName(fileName ?? 'Untitled statute');

  return {
    id: '',
    title,
    shortTitle: toShortTitle(title),
    subtitle: dataset.akomaNtoso?.act?.meta?.act_year
      ? `Act of ${dataset.akomaNtoso.act.meta.act_year}`
      : undefined,
    source: fileName ? `Opened from ${fileName}` : 'Opened from a file',
    origin: 'local',
    fileName,
    summary: summarizeDataset(dataset),
  };
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

function parseJson(text: string, origin: string): AknDataset {
  try {
    return JSON.parse(text) as AknDataset;
  } catch (error) {
    throw new DocumentLoadError(
      `${origin} is not valid JSON.`,
      error instanceof Error ? error.message : 'The file could not be parsed.'
    );
  }
}

/**
 * Reads and indexes a document. Everything that can fail is surfaced as a
 * `DocumentLoadError` with a human-readable detail, because a reader that dies
 * on a bad file with no explanation is useless.
 */
export async function openDocument(document: StatuteDocument): Promise<{
  indexData: IndexedAknData;
  document: StatuteDocument;
}> {
  let text: string;
  let origin: string;

  if (document.origin === 'builtin') {
    origin = document.fileName || document.title;
    const url = document.dataUrl ?? '';
    if (!url) throw new DocumentLoadError(`${document.title} has no data file.`);
    const response = await fetch(url);
    if (!response.ok) {
      throw new DocumentLoadError(
        `Could not load ${document.title} (HTTP ${response.status}).`,
        `The reader could not fetch ${url}.`
      );
    }
    text = await response.text();
  } else {
    origin = document.fileName || document.shortTitle;
    const stored = await getDocument(document.id);
    if (!stored) {
      throw new DocumentLoadError(
        `${document.shortTitle} is no longer in this browser.`,
        'It may have been cleared from site data. Open the file again.'
      );
    }
    text = stored.text;
  }

  const dataset = validateDataset(parseJson(text, origin), origin);
  const indexData = buildIndex(dataset);

  const described: StatuteDocument =
    document.origin === 'builtin'
      ? { ...document, summary: summarizeDataset(dataset) }
      : { ...document, summary: summarizeDataset(dataset), lastOpenedAt: Date.now() };

  if (document.origin === 'local') await markDocumentOpened(document.id);

  return { indexData, document: described };
}

/** Reads a user-supplied file, validates it, and remembers it. */
export async function addLocalDocument(file: File): Promise<StatuteDocument> {
  if (file.size > MAX_DOCUMENT_BYTES) {
    throw new DocumentLoadError(
      `${file.name} is ${formatBytes(file.size)}, larger than the ${formatBytes(MAX_DOCUMENT_BYTES)} limit.`,
      'Split the document or raise MAX_DOCUMENT_BYTES.'
    );
  }
  if (file.size === 0) {
    throw new DocumentLoadError(`${file.name} is empty.`);
  }

  const text = await file.text();
  const dataset = validateDataset(parseJson(text, file.name), file.name);

  const id = makeDocumentId(file.name, file.size);
  const now = Date.now();

  const described = describeDataset(dataset, file.name);
  const stored: StoredDocument = {
    id,
    name: file.name,
    sizeBytes: file.size,
    addedAt: now,
    lastOpenedAt: now,
    text,
  };

  const saved = await putDocument(stored);
  if (!saved) {
    // Storage unavailable (private mode, quota). Still allow reading it now.
    return { ...described, id, sizeBytes: file.size, addedAt: now, lastOpenedAt: now };
  }

  return { ...described, id, sizeBytes: file.size, addedAt: now, lastOpenedAt: now };
}

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

export async function loadCatalogue(): Promise<StatuteDocument[]> {
  const summaries = await listDocumentSummaries();
  const local: StatuteDocument[] = summaries.map((summary) => ({
    id: summary.id,
    title: prettifyFileName(summary.name),
    shortTitle: toShortTitle(prettifyFileName(summary.name)),
    subtitle: formatBytes(summary.sizeBytes),
    source: 'Opened locally',
    origin: 'local' as const,
    fileName: summary.name,
    sizeBytes: summary.sizeBytes,
    addedAt: summary.addedAt,
    lastOpenedAt: summary.lastOpenedAt,
  }));

  return [...BUILTIN_DOCUMENTS, ...local];
}

export async function removeLocalDocument(id: string): Promise<void> {
  await deleteDocument(id);
}

/** Recent documents, most recent first. Built-ins with no history trail the list. */
export function sortByRecency(documents: StatuteDocument[]): StatuteDocument[] {
  return [...documents].sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0));
}

export function recents(documents: StatuteDocument[], limit = 4): StatuteDocument[] {
  return sortByRecency(documents).slice(0, limit);
}

export function formatBytes(bytes: number | undefined): string {
  if (!bytes || bytes <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

/** Returns the `.json` files from a drop or paste, ignoring directories. */
export function extractJsonFiles(items: FileList | DataTransferItemList | null): File[] {
  if (!items) return [];
  const files: File[] = [];

  const list = items instanceof DataTransferItemList ? items : null;
  if (list) {
    for (const item of Array.from(list)) {
      if (item.kind !== 'file') continue;
      const file = item.getAsFile();
      if (file && isAcceptedFile(file)) files.push(file);
    }
    return files;
  }

  for (const file of Array.from(items as FileList)) {
    if (isAcceptedFile(file)) files.push(file);
  }
  return files;
}

export function isAcceptedFile(file: File): boolean {
  return /\.json$/i.test(file.name) || file.type === 'application/json';
}

export function relativeTime(timestamp: number | undefined): string {
  if (!timestamp) return '';
  const delta = Date.now() - timestamp;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (delta < minute) return 'just now';
  if (delta < hour) return `${Math.floor(delta / minute)} min ago`;
  if (delta < day) return `${Math.floor(delta / hour)} hr ago`;
  if (delta < 7 * day) return `${Math.floor(delta / day)} d ago`;
  return new Date(timestamp).toLocaleDateString();
}