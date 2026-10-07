import {
  AknDataset,
  Provision,
  Citation,
  Footnote,
  ResolvedCitationTarget,
} from '../types/akn';

export interface IndexedAknData {
  dataset: AknDataset;
  provisions: Provision[];
  provisionsByEid: Map<string, Provision>;
  provisionsBySectionNum: Map<string, Provision>;
  citationsByParent: Map<string, Citation[]>;
  allCitations: Citation[];
  footnotesByNumber: Map<string, Footnote>;
  footnotesByEid: Map<string, Footnote[]>;
  allFootnotes: Footnote[];
  rootProvisions: Provision[];
}

// Clean garbled characters from PDF extraction
export function cleanStatuteText(text: string): string {
  if (!text) return '';
  return text
    .replace(/\ufffd/g, ' ')
    .replace(/[\u00AD\u200B\u200C\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\[\*\*\*\*\*[\.,]?\]/g, '[Omitted]')
    .trim();
}

// Extract human readable title from heading or beginning of text
export function extractProvisionTitle(provision: Provision): string {
  if (provision.heading && provision.heading.trim().length > 0) {
    return cleanStatuteText(provision.heading);
  }

  const text = provision.text ? cleanStatuteText(provision.text) : '';
  if (!text) {
    if (provision.kind === 'schedule') return `Schedule ${provision.num}`;
    if (provision.kind === 'schedule_item') return `Item ${provision.num}`;
    if (provision.kind === 'proviso') return 'Proviso';
    if (provision.kind === 'explanation') return 'Explanation';
    return `${provision.kind.toUpperCase()} ${provision.num || ''}`.trim();
  }

  // Common statutory format: "Title. (1) Body text..."
  const firstPeriod = text.indexOf('.');
  if (firstPeriod > 2 && firstPeriod < 70) {
    const candidate = text.substring(0, firstPeriod).trim();
    if (!candidate.startsWith('(') && !candidate.startsWith('Provided') && !candidate.startsWith('Explanation')) {
      return candidate;
    }
  }

  if (provision.kind === 'section') {
    return `Section ${provision.num}`;
  }
  if (provision.kind === 'subsection') {
    return `Sub-section ${provision.num}`;
  }
  if (provision.kind === 'clause') {
    return `Clause ${provision.num}`;
  }
  if (provision.kind === 'subclause') {
    return `Sub-clause ${provision.num}`;
  }
  if (provision.kind === 'proviso') {
    return 'Proviso';
  }
  if (provision.kind === 'explanation') {
    return 'Explanation';
  }

  return `${provision.kind.toUpperCase()} ${provision.num || ''}`.trim();
}

// Known external legislation references in the CGST Act
const KNOWN_EXTERNAL_ACTS: Record<string, { title: string; year: string; summary: string }> = {
  'Transfer of Property Act, 1882': {
    title: 'The Transfer of Property Act, 1882 (Act No. 4 of 1882)',
    year: '1882',
    summary: 'Governs the transfer of property in India, defining actionable claims, mortgages, and immovable property.',
  },
  'Chartered Accountants Act, 1949': {
    title: 'The Chartered Accountants Act, 1949 (Act No. 38 of 1949)',
    year: '1949',
    summary: 'Regulates the profession of Chartered Accountants and establishes the Institute of Chartered Accountants of India (ICAI).',
  },
  'Company Secretaries Act, 1980': {
    title: 'The Company Secretaries Act, 1980 (Act No. 56 of 1980)',
    year: '1980',
    summary: 'Regulates the profession of Company Secretaries and establishes the Institute of Company Secretaries of India (ICSI).',
  },
  'Cost and Works Accountants Act, 1959': {
    title: 'The Cost and Works Accountants Act, 1959 (Act No. 23 of 1959)',
    year: '1959',
    summary: 'Regulates the profession of Cost Accountants in India (ICMAI).',
  },
  'Information Technology Act, 2000': {
    title: 'The Information Technology Act, 2000 (Act No. 21 of 2000)',
    year: '2000',
    summary: 'Provides legal recognition for transactions carried out by means of electronic data interchange and digital signatures.',
  },
  'Integrated Goods and Services Tax Act': {
    title: 'The Integrated Goods and Services Tax Act, 2017 (Act No. 13 of 2017)',
    year: '2017',
    summary: 'Levies tax on all inter-State supplies of goods and/or services in India.',
  },
  'Union Territory Goods and Services Tax Act': {
    title: 'The Union Territory Goods and Services Tax Act, 2017 (Act No. 14 of 2017)',
    year: '2017',
    summary: 'Levies tax on intra-State supplies in Union Territories without legislature.',
  },
  'Finance Act, 2018': {
    title: 'The Finance Act, 2018 (Act No. 13 of 2018)',
    year: '2018',
    summary: 'Annual Union Budget Act containing amendments to various provisions of the CGST Act.',
  },
};

export async function loadAknData(): Promise<IndexedAknData> {
  const response = await fetch('/data/cgst-act.json');
  if (!response.ok) {
    throw new Error(`Failed to load act data: HTTP ${response.status}`);
  }
  const dataset: AknDataset = await response.json();

  const provisionsByEid = new Map<string, Provision>();
  const provisionsBySectionNum = new Map<string, Provision>();
  const citationsByParent = new Map<string, Citation[]>();
  const footnotesByNumber = new Map<string, Footnote>();
  const footnotesByEid = new Map<string, Footnote[]>();

  // Index provisions
  for (const prov of dataset.provisions) {
    prov.children = [];
    provisionsByEid.set(prov.eid, prov);
    if (prov.kind === 'section' && prov.num) {
      provisionsBySectionNum.set(prov.num.toLowerCase(), prov);
    }
  }

  // Index citations
  for (const citation of dataset.citations) {
    const parentList = citationsByParent.get(citation.parent_eid) || [];
    parentList.push(citation);
    citationsByParent.set(citation.parent_eid, parentList);
  }

  // Index footnotes
  for (const fn of dataset.footnotes) {
    footnotesByNumber.set(fn.number, fn);
    if (fn.associated_eid) {
      const list = footnotesByEid.get(fn.associated_eid) || [];
      list.push(fn);
      footnotesByEid.set(fn.associated_eid, list);
    }
  }

  // The hierarchical body tree
  const rootProvisions: Provision[] = [];
  for (const prov of dataset.provisions) {
    if (prov.parent_eid && provisionsByEid.has(prov.parent_eid)) {
      provisionsByEid.get(prov.parent_eid)!.children!.push(prov);
    } else if (!prov.parent_eid) {
      rootProvisions.push(prov);
    }
  }

  return {
    dataset,
    provisions: dataset.provisions,
    provisionsByEid,
    provisionsBySectionNum,
    citationsByParent,
    allCitations: dataset.citations,
    footnotesByNumber,
    footnotesByEid,
    allFootnotes: dataset.footnotes,
    rootProvisions,
  };
}

export function formatProvisionDisplayTitle(provision: Provision): string {
  const title = extractProvisionTitle(provision);
  if (provision.kind === 'section') {
    if (provision.heading) {
      return `Section ${provision.num}: ${cleanStatuteText(provision.heading)}`;
    }
    if (title && !title.toLowerCase().startsWith('section')) {
      return `Section ${provision.num}: ${title}`;
    }
    return `Section ${provision.num}`;
  }
  if (provision.kind === 'subsection') {
    return `Sub-section ${provision.num}`;
  }
  if (provision.kind === 'clause') {
    return `Clause ${provision.num}`;
  }
  if (provision.kind === 'subclause') {
    return `Sub-clause ${provision.num}`;
  }
  if (provision.kind === 'schedule') {
    return `Schedule ${provision.num}${provision.heading ? `: ${cleanStatuteText(provision.heading)}` : ''}`;
  }
  return title;
}

export function getProvisionAllCitations(prov: Provision, indexData: IndexedAknData): Citation[] {
  const result: Citation[] = [];
  const seen = new Set<string>();

  function collect(p: Provision) {
    const list = indexData.citationsByParent.get(p.eid) || p.citations || [];
    for (const c of list) {
      const key = `${c.parent_eid}_${c.target_eid}_${c.raw_text}_${c.span?.[0]}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(c);
      }
    }
    if (p.children) {
      for (const ch of p.children) {
        collect(ch);
      }
    }
  }

  collect(prov);
  return result;
}

export function getProvisionAllFootnotes(prov: Provision, indexData: IndexedAknData): Footnote[] {
  const result: Footnote[] = [];
  const seen = new Set<string>();

  function collect(p: Provision) {
    const list = indexData.footnotesByEid.get(p.eid) || [];
    for (const f of list) {
      if (!seen.has(f.number)) {
        seen.add(f.number);
        result.push(f);
      }
    }
    if (p.children) {
      for (const ch of p.children) {
        collect(ch);
      }
    }
  }

  collect(prov);
  return result;
}

export function resolveCitation(
  citation: Citation,
  indexData: IndexedAknData
): ResolvedCitationTarget {
  const targetEid = citation.target_eid;

  // 1. Direct match
  if (targetEid && indexData.provisionsByEid.has(targetEid)) {
    const prov = indexData.provisionsByEid.get(targetEid)!;
    return {
      targetEid,
      provision: prov,
      displayTitle: formatProvisionDisplayTitle(prov),
      isExternal: false,
      previewSnippet: cleanStatuteText(prov.text || ''),
      citations: getProvisionAllCitations(prov, indexData),
      footnotes: getProvisionAllFootnotes(prov, indexData),
    };
  }

  // 2. Normalized section lookup: e.g. "sec_51" or "sec_10"
  if (targetEid && targetEid.startsWith('sec_')) {
    const cleanNum = targetEid.replace('sec_', '').split('__')[0].toLowerCase();
    if (indexData.provisionsBySectionNum.has(cleanNum)) {
      const prov = indexData.provisionsBySectionNum.get(cleanNum)!;
      return {
        targetEid: prov.eid,
        provision: prov,
        displayTitle: formatProvisionDisplayTitle(prov),
        isExternal: false,
        previewSnippet: cleanStatuteText(prov.text || ''),
        citations: getProvisionAllCitations(prov, indexData),
        footnotes: getProvisionAllFootnotes(prov, indexData),
      };
    }
  }

  // 3. External legislation lookup
  const isExternal = citation.external || citation.target_type === 'external_act';
  let externalActName = '';
  let preview = citation.raw_text || '';

  if (citation.raw_text) {
    for (const [key, details] of Object.entries(KNOWN_EXTERNAL_ACTS)) {
      if (citation.raw_text.toLowerCase().includes(key.toLowerCase())) {
        externalActName = details.title;
        preview = `${details.summary} (Referenced in text as: "${citation.raw_text}")`;
        break;
      }
    }
  }

  if (!externalActName && isExternal) {
    externalActName = citation.raw_text || '';
    preview = citation.raw_text
      ? `External statutory provision referenced as: "${citation.raw_text}"`
      : 'External statutory provision reference.';
  }

  return {
    targetEid: targetEid || '',
    provision: undefined,
    displayTitle: externalActName || citation.raw_text || targetEid || 'Referenced Provision',
    isExternal: isExternal || !!externalActName,
    externalActName: externalActName || undefined,
    previewSnippet: preview,
    citations: [],
    footnotes: [],
  };
}
