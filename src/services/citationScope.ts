/**
 * Deciding whether a citation points at THIS Act or at another instrument.
 *
 * Why this module exists
 * ----------------------
 * The dataset flags references to other Acts with `external: true`, but many of
 * those carry a `target_eid` that collides with a real section of this Act:
 *
 *   "section 148 of the Companies Act, 2013"   -> target_eid `sec_148`
 *   "section 4 of the Indian Partnership Act, 1932" -> target_eid `sec_4`
 *
 * The old resolver looked up `target_eid` *before* consulting `external`, so
 * those links opened the wrong statute.
 *
 * The rule we adopt instead: the statutory *words* decide the scope.
 * `target_eid` may only choose WHICH internal node a same-Act reference lands
 * on; it must never decide whether we are looking at this Act at all.
 *
* A note on classification vs. enrichment
 * ---------------------------------------
 * The registry below supplies optional descriptions only. It must NOT decide
 * scope: an instrument we have never heard of ("the Indian Partnership Act,
 * 1932") would otherwise default to "internal" and open this Act's own section
 * 4. Classification is purely pattern-based, so an unfamiliar Act is still
 * correctly reported as another Act.
 */

import { CitationRelation, CitationTarget } from '../types/akn';

export interface ExternalAct {
  /** Canonical name as printed in the Gazette. */
  name: string;
  year: number | null;
  summary: string;
  /** Lowercased, whitespace-stripped alias forms used for matching. */
  aliases: string[];
}

/** An instrument named in the statutory words, whether or not we know it. */
export interface NamedAct {
  /** Registry name when known, otherwise the words as they appear. */
  name: string;
  year: number | null;
  /** Non-null only when we have a registry entry to enrich with. */
  known: ExternalAct | null;
}

/**
 * Optional descriptions for instruments this reader may encounter.
 *
 * This is DATA, not behaviour, and it is not required for correctness. Scope is
 * decided entirely by pattern; an instrument missing from this list is still
 * correctly reported as another statute, just without the one-line summary.
 * There is deliberately no entry for any Act a document might be *itself* -
 * self-reference is handled by comparing against the open document's title.
 */
export const EXTERNAL_ACTS: ExternalAct[] = [
  {
    name: 'The Companies Act, 2013',
    year: 2013,
    summary: 'Governs incorporation and conduct of companies in India.',
    aliases: ['companiesact', 'companiesact2013'],
  },
  {
    name: 'The Central Customs Act, 1942',
    year: 1942,
    summary: 'Governs customs valuation, drawback and clearance of goods.',
    aliases: ['centralcustomsact', 'centralcustomsact1942'],
  },
  {
    name: 'The Central Excise Act, 1944',
    year: 1944,
    summary: 'The pre-GST indirect tax law, repealed and re-enacted by the CGST Act.',
    aliases: ['centralexciseact', 'centralexciseact1944'],
  },
  {
    name: 'The Customs Act, 1962',
    year: 1962,
    summary: 'Governs import and export of goods, and the powers of customs officers.',
    aliases: ['customsact', 'customsact1962'],
  },
  {
    name: 'The Customs Tariff Act, 1975',
    year: 1975,
    summary:
      'Sets the standard rates of customs duty on imported goods, used to classify supplies under section 7(2) and section 18.',
    aliases: ['customstariffact', 'customstariffact1975'],
  },
  {
    name: 'The Chartered Accountants Act, 1949',
    year: 1949,
    summary: 'Regulates the chartered accountancy profession and establishes ICAI.',
    aliases: ['charteredaccountantsact', 'charteredaccountantsact1949'],
  },
  {
    name: 'The Company Secretaries Act, 1980',
    year: 1980,
    summary: 'Regulates the company secretary profession and establishes ICSI.',
    aliases: ['companysecretariesact', 'companysecretariesact1980'],
  },
  {
    name: 'The Cost and Works Accountants Act, 1959',
    year: 1959,
    summary: 'Regulates the cost accountancy profession and establishes ICMAI.',
    aliases: ['costandworksaccountantsact', 'costandworksaccountantsact1959'],
  },
  {
    name: 'The Depositories Act, 1996',
    year: 1996,
    summary: 'Establishes and regulates depositories and depository participants.',
    aliases: ['depositoriesact', 'depositoriesact1996'],
  },
  {
    name: 'The General Clauses Act, 1897',
    year: 1897,
    summary: 'Supplies the default rules of construction, including the meaning of "State".',
    aliases: ['generalclausesact', 'generalclausesact1897'],
  },
  {
    name: 'The Indian Contract Act, 1872',
    year: 1872,
    summary: 'Governs contractual obligations, including implied indemnity and agency.',
    aliases: ['indiancontractact', 'indiancontractact1872', 'contractact'],
  },
  {
    name: 'The Indian Partnership Act, 1932',
    year: 1932,
    summary: 'Governs the formation, structure and dissolution of partnerships in India.',
    aliases: ['indianpartnershipact', 'indianpartnershipact1932', 'partnershipact'],
  },
  {
    name: 'The Information Technology Act, 2000',
    year: 2000,
    summary:
      'Gives legal recognition to electronic records, electronic signatures and electronic transactions.',
    aliases: ['informationtechnologyact', 'informationtechnologyact2000'],
  },
  {
    name: 'The Integrated Goods and Services Tax Act, 2017',
    year: 2017,
    summary:
      'Levies tax on inter-State supplies of goods and services, and governs cross-registration of the same taxpayer across States.',
    aliases: ['integratedgoodsandservicestaxact', 'igstact'],
  },
  {
    name: 'The Union Territory Goods and Services Tax Act, 2017',
    year: 2017,
    summary:
      'Levies GST on intra-State supplies in Union Territories that have no legislature of their own.',
    aliases: ['utgstact', 'unionterritorygoodsandservicestaxact'],
  },
  {
    name: 'The State Goods and Services Tax Act, 2017',
    year: 2017,
    summary: 'The State-level GST legislation that a Union Territory GST Act generally replaces.',
    aliases: ['sgstact', 'stategoodsandservicestaxact'],
  },
  {
    name: 'The Finance Act, 2001',
    year: 2001,
    summary: 'Finance Act that introduced service tax, later subsumed by GST.',
    aliases: ['financeact', 'financeact2001'],
  },
  {
    name: 'The Finance Act, 1994',
    year: 1994,
    summary: 'Finance Act that introduced central excise and the excise tariff.',
    aliases: ['financeact', 'financeact1994'],
  },
  {
    name: 'The Finance Act, 2018',
    year: 2018,
    summary: 'The annual Union Budget Act carrying most post-2017 CGST amendments.',
    aliases: ['financeact', 'financeact2018'],
  },
  {
    name: 'The Registration Act, 1908',
    year: 1908,
    summary: 'Governs registration of documents; cited for the doctrine of registration.',
    aliases: ['registrationact', 'registrationact1908'],
  },
  {
    name: 'The Reserve Bank of India Act, 1934',
    year: 1934,
    summary: 'Establishes and regulates the Reserve Bank of India.',
    aliases: ['reservebankofindiaact', 'reservebankofindiaact1934'],
  },
  {
    name: 'The Transfer of Property Act, 1882',
    year: 1882,
    summary:
      'Defines actionable claims and the transfer of property; cited for the meaning of "actionable claim".',
    aliases: ['transferofpropertyact', 'transferofpropertyact1882'],
  },
  {
    name: 'The University Grants Commission Act, 1956',
    year: 1956,
    summary: 'Establishes and regulates university education in India.',
    aliases: [
      'universitygrantscommissionact',
      'universitygrantscommissionact1956',
      'universitygrantscommissionact1953',
    ],
  },
  {
    name: 'The Securities Contracts (Regulation) Act, 1963',
    year: 1963,
    summary: 'Governs listing and trading of securities on Indian stock exchanges.',
    aliases: [
      'securitiescontractsregulationact',
      'securitiescontractsregulationact1963',
      'securitiescontractsact',
    ],
  },
  {
    name: 'The Motor Vehicles Act, 1988',
    year: 1988,
    summary: 'Governs road transport, licensing and motor vehicle taxation.',
    aliases: ['motorvehiclesact', 'motorvehiclesact1988'],
  },
  {
    name: 'The Cantonments Act, 2006',
    year: 2006,
    summary: 'Governs the administration of Cantonment Boards.',
    aliases: ['cantonmentsact', 'cantonmentsact2006'],
  },
];

/** Collapses whitespace and lowercases so kerning gaps do not defeat matching. */
export function normalizeActText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '');
}

/**
 * Canonical comparison key for instrument names.
 *
 * "The Central Goods and Services Tax Act, 2017" and "Central Goods and
 * Services Tax Act" must compare equal, otherwise a self-reference that spells
 * out the Act's full title is never recognised and gets reported as another
 * statute. Articles, punctuation and years are dropped; everything else is
 * squashed to letters.
 */
function canonicalActKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[,()'".]/g, ' ')
    .replace(/\bthe\b|\ban?\b/g, ' ')
    .replace(/\b\d{4}\b/g, ' ')
    .replace(/[^a-z]/g, '');
}

/** Instrument name suffixes we recognise. */
const NAME_SUFFIXES = ['Act', 'Code', 'Ordinance'];

/** Lowercase words that may sit inside an instrument name. */
const NAME_CONNECTORS = new Set(['of', 'and', 'for', 'the', 'a', 'an', '&', 'to', 'on']);

/** Tokens that never belong to an instrument name. */
const NAME_STOPWORDS = new Set([
  'section',
  'sections',
  'subsection',
  'clause',
  'clauses',
  'paragraph',
  'item',
  'schedule',
  'chapter',
  'part',
  'table',
  'form',
  'rule',
  'rules',
  'herein',
  'aforesaid',
  'said',
  'such',
  'same',
  'present',
  'under',
  'with',
  'without',
  'be',
  'is',
  'as',
  'by',
]);

/** Strips trailing punctuation so "Act," and "Act." expose the bare suffix. */
function stripEdge(token: string): string {
  return token.replace(/^[.,;:'"\-]+/, '').replace(/[.,;:'"\-]+$/, '');
}

/**
 * Walks backwards from an Act / Code / Ordinance token to collect the words
 * making up the instrument name.
 *
 * A single regex was unreliable here. A greedy pattern matched from
 * "section 8 of the Companies Act" all the way to "Act", so the whole phrase
 * became the candidate; it contains digits, and because `lastIndex` had jumped
 * past the match the real name "Companies Act" was never re-examined.
 * Tokenising and walking backwards from the suffix is unambiguous.
 */
function nameEndingAtToken(tokens: string[], index: number): string | null {
  const start = Math.max(0, index - 8);
  const collected: string[] = [];

  for (let i = index; i >= start; i--) {
    const token = stripEdge(tokens[i]);
    if (!token) continue;
    const lower = token.toLowerCase();

    if (NAME_STOPWORDS.has(lower)) break;
    if (/\d/.test(token)) break;

    if (NAME_CONNECTORS.has(lower)) {
      collected.unshift(token);
      continue;
    }
    // Only capitalised words continue the name. This is what stops the walk at
    // "the said" and at lowercase verbs.
    if (!/^[A-Z]/.test(token)) break;
    collected.unshift(token);
  }

  while (collected.length > 0 && NAME_CONNECTORS.has(collected[0].toLowerCase())) {
    collected.shift();
  }
  if (collected.length === 0) return null;
  return collected.join(' ').trim();
}

/**
 * Rejects text that ends in "Act" but is not an instrument name.
 *
 * Two families of false positive:
 *  - ordinary words that happen to end in "act": "exact", "contact", "impact"
 *  - structural phrases left attached to the instrument word, e.g.
 *    "sub-section (4) of Section 107 of the said Act"
 */
function isPlausibleActName(candidate: string): boolean {
  const trimmed = candidate.trim();
  if (NAME_SUFFIXES.some((s) => trimmed.toLowerCase() === s.toLowerCase())) return false;
  if (!/[A-Z][a-z]/.test(trimmed)) return false;
  if (/\d/.test(trimmed)) return false;
  return true;
}

/** Leading determiners and pronouns mean the reference is to this Act. */
const SELF_LEADING_WORD = /^(the|this|that|said|such|same|aforesaid|present|its|his|her|their)\b/i;

/** True when the candidate refers to the Act being read. */
function isSelfReference(candidate: string, rawText: string, selfActName?: string): boolean {
  const trimmed = candidate.trim();
  const normalized = normalizeActText(candidate);

  if (selfActName && canonicalActKey(candidate) === canonicalActKey(selfActName)) return true;
  if (normalized === 'act' || normalized === 'code' || normalized === 'ordinance') return true;
  if (SELF_LEADING_WORD.test(trimmed)) return true;
  if (/\bherein\b/i.test(rawText)) return true;

  return false;
}

/**
 * Looks a candidate name up in the registry.
 *
 * PDF extraction often splits an instrument name mid-word ("Customs TariffAct"
 * or "Central Excise   Act"), so the regex can hand us either the full name or
 * just its tail. Matching therefore compares aliases bidirectionally by suffix
 * rather than demanding equality, with a length floor so short fragments cannot
 * match half the registry.
 */
function lookupRegistry(candidate: string, year: number | null): ExternalAct | null {
  const normalized = normalizeActText(candidate);
  const withYear = year ? `${normalized}${year}` : null;

  const MIN_SUFFIX = 8;

  let bySuffix: ExternalAct | null = null;
  for (const act of EXTERNAL_ACTS) {
    for (const alias of act.aliases) {
      if (normalized === alias) return act;
      // Alias plus its year, e.g. "financeact" matched against "financeact2001".
      if (withYear && alias === withYear) return act;
      if (normalized.length >= MIN_SUFFIX && (alias.endsWith(normalized) || normalized.endsWith(alias))) {
        if (!bySuffix) bySuffix = act;
      }
    }
  }
  return bySuffix;
}

/**
 * Finds the foreign instrument named in `rawText`, if any.
 *
 * Returns null when the words name this Act, or name no instrument at all —
 * in which case the reference is to this Act (e.g. a bare "section 44").
 */
export function extractNamedAct(rawText: string, selfActName?: string): NamedAct | null {
  if (!rawText) return null;

  // Tokenise once, keeping the raw order. Trailing punctuation is stripped so
  // "Act," and "Act." both expose the bare suffix.
  const tokens = rawText.split(/[\s,;()]+/).filter(Boolean);

  for (let i = 0; i < tokens.length; i++) {
    const bare = tokens[i].replace(/[.\-':]+$/, '');
    if (!bare || !/Act$|Code$|Ordinance$/.test(bare)) continue;

    // A year may sit after the name: "... Companies Act, 2013".
    const yearMatch = tokens[i + 1]?.match(/^(\d{4})[a-z]?\.?$/i);
    const year = yearMatch ? Number(yearMatch[1]) : null;

    const candidate = nameEndingAtToken(tokens, i) ?? bare;
    if (!isPlausibleActName(candidate)) continue;
    if (isSelfReference(candidate, rawText, selfActName)) continue;

    const known = lookupRegistry(candidate, year);

    return {
      // A registry entry gives the canonical title; otherwise keep the words.
      name: known?.name ?? candidate,
      year: year ?? known?.year ?? null,
      known,
    };
  }

  return null;
}

/**
 * Registry lookup, kept for callers that only want a curated description.
 * Prefer `extractNamedAct` for anything that decides scope.
 */
export function findExternalAct(rawText: string, selfActName?: string): ExternalAct | null {
  return extractNamedAct(rawText, selfActName)?.known ?? null;
}

/**
 * Pulls the provision reference out of the statutory words, e.g.
 * "section 148 of the Companies Act, 2013" -> "section 148".
 */
export function extractProvisionRef(rawText: string): string | null {
  const m = rawText.match(
    /((?:sub-)?section\s*\([0-9A-Za-z]+\)\s*of\s*)?(?:sub-)?section\s*\([0-9A-Za-z]+\)/i
  );
  if (m) return m[0].trim();
  const m2 = rawText.match(/(?:clause|sub-clause|paragraph|item)\s*\([0-9A-Za-z]+\)/i);
  return m2 ? m2[0].trim() : null;
}

export type CitationScope = 'internal' | 'external';

/**
 * The single source of truth for "which Act is this?".
 * Deliberately text-driven so it cannot be fooled by `target_eid`.
 */
export function classifyCitationScope(rawText: string, selfActName?: string): CitationScope {
  return extractNamedAct(rawText, selfActName) ? 'external' : 'internal';
}

/** Maps the parser's free-text relation onto the closed vocabulary. */
export function normalizeRelation(rawRelation: string | undefined): CitationRelation {
  switch ((rawRelation || '').toLowerCase()) {
    case 'subject_to':
      return 'subject_to';
    case 'notwithstanding':
      return 'notwithstanding';
    case 'reference':
      return 'reference';
    default:
      return 'unknown';
  }
}

const RELATION_LABELS: Record<CitationRelation, string> = {
  reference: 'Reference',
  subject_to: 'Subordinate to',
  notwithstanding: 'Overrides',
  unknown: 'Reference',
};

export function relationLabel(relation: CitationRelation): string {
  return RELATION_LABELS[relation];
}

export function relationDescription(relation: CitationRelation): string {
  switch (relation) {
    case 'subject_to':
      return 'This provision operates subject to the cited provision.';
    case 'notwithstanding':
      return 'This provision overrides anything in the cited provision.';
    default:
      return 'This provision refers to the cited provision.';
  }
}

export function buildExternalTarget(rawText: string, act: NamedAct): CitationTarget {
  return {
    scope: 'external',
    actName: act.name,
    actYear: act.year,
    citedAs: rawText.trim(),
    provisionRef: extractProvisionRef(rawText),
    // An unfamiliar instrument still gets an honest line of explanation.
    summary:
      act.known?.summary ??
      `A reference to another statute, ${act.name}${act.year ? ` (${act.year})` : ''}. This Act contains no text for it.`,
  };
}