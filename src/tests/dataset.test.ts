/**
 * Dataset-backed regression tests.
 *
 * Every test here runs against the real `public/data/cgst-act.json`, not a
 * synthetic fixture. The previous suite used hand-written stubs, which is why
 * it happily passed while the app opened the wrong statute 66 times.
 */

import { describe, it, expect } from 'vitest';
import raw from '../../public/data/cgst-act.json';
import { AknDataset, Citation, Provision } from '../types/akn';
import { buildIndex, resolveCitation, snippet, statutoryOrdinal } from '../services/aknLoader';
import { buildHierarchyIndex } from '../services/hierarchyBuilder';
import { buildCitationTree, sliceProvisionText } from '../services/citationEngine';
import { classifyCitationScope, extractNamedAct, findExternalAct } from '../services/citationScope';

const dataset = raw as unknown as AknDataset;

// Captured before indexing, because buildIndex releases the raw arrays once the
// normalised model exists - keeping a second copy of a 10 MB Act alive costs
// tens of megabytes of heap for nothing.
const RAW_PROVISION_COUNT = dataset.provisions.length;
const RAW_CITATION_COUNT = dataset.citations.length;
const RAW_PARENTED_COUNT = dataset.provisions.filter((p) => p.parent_eid).length;

const index = buildIndex(dataset);

/** Depth-first list of each provision in the array and its descendants. */
function flatten(provisions: Provision[]): Provision[] {
  const out: Provision[] = [];
  const stack = [...provisions];
  while (stack.length > 0) {
    const node = stack.pop()!;
    out.push(node);
    stack.push(...node.children);
  }
  return out;
}

describe('dataset shape', () => {
  it('normalises every provision', () => {
    expect(index.provisions.length).toBe(RAW_PROVISION_COUNT);
    expect(index.provisionsByEid.size).toBe(RAW_PROVISION_COUNT);
  });

  it('releases the raw payload once it has been indexed', () => {
    // The normalised model supersedes it; keeping both wastes heap.
    expect(dataset.provisions.length).toBe(0);
    expect(dataset.citations.length).toBe(0);
    expect(dataset.footnotes.length).toBe(0);
    // Meta survives, because the library card and self-reference detection use it.
    expect(dataset.akomaNtoso.act.meta.title).toBeTruthy();
    expect(index.meta?.title).toBe(dataset.akomaNtoso.act.meta.title);
    expect(index.provisions.length).toBe(RAW_PROVISION_COUNT);
    expect(index.citations.length).toBe(RAW_CITATION_COUNT);
  });

  it('drops no provision: every parent_eid chain terminates at a real node', () => {
    // The old loader silently discarded provisions whose parent_eid dangled.
    const withParents = RAW_PARENTED_COUNT;
    const linked = index.provisions.filter((p) => p.parent_eid).length;
    expect(linked).toBe(withParents);
  });

  it('every citation keeps its parent provision', () => {
    for (const citation of index.citations) {
      expect(index.provisionsByEid.has(citation.parentEid)).toBe(true);
    }
  });

  it('subtree rollups include the node\'s own citations', () => {
    // Regression: rollups ran before citations were attached.
    for (const provision of index.provisions) {
      expect(provision.subtreeCitations.length).toBeGreaterThanOrEqual(provision.citations.length);
      expect(provision.subtreeFootnotes.length).toBeGreaterThanOrEqual(provision.footnotes.length);
    }
  });

  it('no provision is its own descendant', () => {
    for (const provision of index.provisions) {
      for (const child of provision.children) {
        expect(child.eid).not.toBe(provision.eid);
      }
    }
  });
});

describe('citation spans', () => {
  it('every span indexes its own parent\'s raw text exactly', () => {
    // This is the invariant the renderer depends on.
    const mismatches: string[] = [];
    for (const citation of index.citations) {
      const parent = index.provisionsByEid.get(citation.parentEid)!;
      const sliced = parent.text.substring(citation.span[0], citation.span[1]);
      if (sliced !== citation.rawText) mismatches.push(citation.id);
    }
    expect(mismatches).toEqual([]);
  });

  it('produces pills only when a provision supplies its own citations', () => {
    // The old side panel passed a subtree-wide union of citations alongside the
    // parent text, producing 396 pills whose spans indexed other strings.
    for (const provision of index.provisions) {
      const segments = sliceProvisionText(provision.text, provision.citations);
      for (const seg of segments) {
        if (seg.type === 'citation') {
          expect(provision.citations).toContain(seg.citation);
        }
      }
    }
  });

  it('every citation segment resolves back to text', () => {
    for (const provision of index.provisions) {
      for (const seg of sliceProvisionText(provision.text, provision.citations)) {
        expect(provision.text.substring(seg.start, seg.end)).toBe(seg.content);
      }
    }
  });
});

describe('citation scope classification', () => {
  it('never resolves a citation to another Act as a CGST provision', () => {
    // The core correctness trap. "section 148 of the Companies Act, 2013"
    // carries target_eid `sec_148`, which IS a CGST section.
    const offenders: string[] = [];
    for (const citation of index.citations) {
      const resolved = resolveCitation(citation, index);
      if (resolved.isExternal && resolved.provision) {
        offenders.push(citation.id);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('treats self-references as internal even when flagged external', () => {
    // Asserted on phrasing rather than on the dataset: "the said Act" means the
    // Act being read, so it must classify internal no matter which statute is
    // open. The CGST export happens to contain no such phrase, so a
    // dataset-derived assertion here would silently stop testing anything.
    const selfReferences = [
      'section 172 of the said Act',
      'section 44 of the said Act',
      'sub-section (2) of section 7 of the said Act',
    ];
    for (const text of selfReferences) {
      expect(classifyCitationScope(text)).toBe('internal');
    }
  });

  it('never treats a self-reference as external in the open document', () => {
    for (const citation of index.citations) {
      if (/said Act/i.test(citation.rawText)) {
        expect(resolveCitation(citation, index).isExternal).toBe(false);
      }
    }
  });

  it('classifies named foreign instruments as external', () => {
    const cases: Array<[string, string]> = [
      ['section 148 of the Companies Act, 2013', 'Companies Act, 2013'],
      ['section 6 of the Registration Act, 1908', 'Registration Act, 1908'],
      ['section 3 of the Transfer of Property Act, 1882', 'Transfer of Property Act, 1882'],
      ['section 136 of the Finance Act, 2001', 'Finance Act, 2001'],
    ];
    for (const [text, expected] of cases) {
      expect(classifyCitationScope(text)).toBe('external');
      expect(findExternalAct(text)?.name).toContain(expected);
    }
  });

  it('tolerates PDF kerning gaps in act names', () => {
    // The parser emitted "Customs TariffAct" and "Central Excise   Act".
    expect(findExternalAct('the Customs TariffAct, 1975')).not.toBeNull();
    expect(findExternalAct('the Central Excise   Act, 1944')).not.toBeNull();
  });

  it('keeps bare section references internal', () => {
    for (const text of ['section 10', 'section 44(1)', 'sub-section (2) of section 52']) {
      expect(classifyCitationScope(text)).toBe('internal');
    }
  });

  it('recognises a self-reference that spells out the Act own title', () => {
    // Regression: the Act's own name never matched itself, because
    // "The Central Goods and Services Tax Act, 2017" and
    // "Central Goods and Services Tax Act" are not string-equal.
    const selfName = 'The Central Goods and Services Tax Act, 2017';
    expect(classifyCitationScope('section 39 of the Central Goods and Services Tax Act, 2017', selfName)).toBe(
      'internal'
    );
    expect(
      classifyCitationScope('section 39 of the Central Goods and Services Tax Act, 2017', 'The Income-tax Act, 2025')
    ).toBe('external');
  });

  it('recognises a self-reference for whichever Act is loaded', () => {
    expect(classifyCitationScope('section 4 of the Income-tax Act, 2025', 'The Income-tax Act, 2025')).toBe('internal');
    expect(classifyCitationScope('section 4 of the said Act', 'The Income-tax Act, 2025')).toBe('internal');
  });

  it('still reports an unfamiliar instrument as another Act', () => {
    // The registry must not gate classification, or a statute referencing an
    // instrument we have no entry for would open this Act's own section.
    expect(classifyCitationScope('section 4 of the Zzzz Unknown Act, 1999')).toBe('external');
    expect(extractNamedAct('section 4 of the Zzzz Unknown Act, 1999')?.name).toBe('Zzzz Unknown Act');
    expect(extractNamedAct('section 4 of the Zzzz Unknown Act, 1999')?.year).toBe(1999);
  });

  it('does not mistake words ending in act for an instrument', () => {
    for (const text of ['the exact amount', 'a contact detail', 'the impact of section 5']) {
      expect(classifyCitationScope(text)).toBe('internal');
    }
  });

  it('treats a structural phrase ending in the said Act as internal', () => {
    // The capitalised "Section" here used to make the whole span look like an
    // instrument name.
    expect(classifyCitationScope('sub-section (4) of Section 107 of the said Act')).toBe('internal');
  });
});

describe('backlinks: "found in other sections too"', () => {
  it('builds a reverse index covering every internal resolved citation', () => {
    let expected = 0;
    for (const citation of index.citations) {
      if (citation.target.scope === 'internal' && citation.target.targetEid) expected++;
    }
    const indexed = Array.from(index.citationsByTarget.values()).reduce((n, l) => n + l.length, 0);
    expect(indexed).toBe(expected);
    expect(indexed).toBeGreaterThan(0);
  });

  it('agrees with a brute-force scan', () => {
    const section = 'sec_73';
    const expected = index.citations.filter(
      (c) =>
        c.target.scope === 'internal' &&
        c.target.targetEid &&
        index.provisionsByEid.get(c.target.targetEid)?.topLevelEid === section
    ).length;
    expect(index.incomingBySection.get(section)?.length ?? 0).toBe(expected);
  });

  it('cross-section backlinks exclude same-section citations', () => {
    for (const [sectionEid, list] of index.incomingFromOtherSections) {
      for (const citation of list) {
        const authorTop = index.provisionsByEid.get(citation.parentEid)?.topLevelEid ?? null;
        expect(authorTop).not.toBe(sectionEid);
      }
    }
  });

  it('cross-section backlinks are a subset of all backlinks', () => {
    for (const [sectionEid, list] of index.incomingFromOtherSections) {
      expect(list.length).toBeLessThanOrEqual(index.incomingBySection.get(sectionEid)?.length ?? 0);
    }
  });

  it('every section-level backlink counts is reachable from the provision', () => {
    for (const provision of index.provisions) {
      const list = index.citationsByTarget.get(provision.eid);
      if (!list) continue;
      for (const citation of list) {
        expect(citation.target.scope).toBe('internal');
      }
    }
  });
});

describe('hierarchy', () => {
  const hierarchy = buildHierarchyIndex(index);

  it('contains only genuine document-level units at tier 1', () => {
    // Regression: 237 orphaned subsections were promoted to "sections".
    for (const section of hierarchy.sections) {
      expect(['section', 'schedule', 'chapter']).toContain(section.kind);
    }
    expect(hierarchy.sections.length).toBe(index.readingOrder.length);
  });

  it('never shows a parenthesised numeral as a section label', () => {
    for (const section of hierarchy.sections) {
      expect(section.num).not.toMatch(/^\([0-9a-z]+\)$/i);
    }
  });

  it('separates the unattributed provisions instead of hiding them', () => {
    expect(hierarchy.unattributedCount).toBe(index.unattributed.length);
    const grouped = hierarchy.unattributedGroups.reduce((n, g) => n + g.items.length, 0);
    expect(grouped).toBe(index.unattributed.length);
  });

  it('reaches every provision that has a parent section', () => {
    // Regression: 59 depth-3 sub-clauses were rendered but indexed nowhere.
    let reachable = 0;
    const walk = (items: typeof hierarchy.sections) => {
      for (const item of items) {
        reachable++;
        walk(item.children);
      }
    };
    walk(hierarchy.sections);
    expect(reachable).toBeGreaterThan(0);

    const unreachable = index.provisions.filter(
      (p) => p.topLevelEid !== null && !hierarchy.eidToNavItemMap.has(p.eid)
    );
    expect(unreachable).toEqual([]);
  });

  it('maps every provision to its enclosing document-level unit', () => {
    for (const provision of index.provisions) {
      if (provision.topLevelEid === null) continue;
      expect(hierarchy.eidToSectionMap.has(provision.eid)).toBe(true);
    }
  });

  it('assigns tiers by kind, not by depth', () => {
    // Regression: "Sub-section" dropdown offered "Provided that".
    for (const section of hierarchy.sections) {
      for (const child of section.children) {
        if (child.kind === 'subsection') {
          expect(child.depth).toBe(1);
        }
      }
    }
  });

  it('does not double-count a citation that targets a section directly', () => {
    // Regression: the nav builder wrote the per-node total and then added the
    // rolled-up section total onto it, so any directly-cited section reported
    // roughly double. Compare against a brute-force count.
    const bruteForce = (sectionEid: string) =>
      index.citations.filter(
        (c) =>
          c.target.scope === 'internal' &&
          c.target.targetEid !== null &&
          index.provisionsByEid.get(c.target.targetEid!)?.topLevelEid === sectionEid
      ).length;

    for (const section of hierarchy.sections) {
      const expected = bruteForce(section.eid);
      if (expected === 0) continue;
      expect(section.incomingCount).toBe(expected);
    }
  });

  it('reports cross-section backlink counts that agree with the map', () => {
    for (const section of hierarchy.sections) {
      const expected = index.incomingFromOtherSections.get(section.eid)?.length ?? 0;
      expect(section.incomingFromOtherSectionsCount).toBe(expected);
      expect(section.incomingFromOtherSectionsCount).toBeLessThanOrEqual(section.incomingCount);
    }
  });

  it('gives every section with inbound references a positive badge', () => {
    const cited = hierarchy.sections.filter((s) => (index.incomingBySection.get(s.eid)?.length ?? 0) > 0);
    expect(cited.length).toBeGreaterThan(20);
    for (const section of cited) {
      expect(section.incomingCount).toBeGreaterThan(0);
    }
  });
});

describe('citation cascade', () => {
  it('halts every cycle and never exceeds the level cap', () => {
    for (const citation of index.citations.slice(0, 120)) {
      const tree = buildCitationTree(citation, index);
      const stack = [tree];
      while (stack.length > 0) {
        const node = stack.pop()!;
        expect(node.level).toBeLessThanOrEqual(6);
        if (node.isCycle) expect(node.children).toHaveLength(0);
        stack.push(...node.children);
      }
    }
  });

  it('reports a cycle level of at least 1', () => {
    // Regression: the seed mapped to level 0, rendering "Target at L0".
    for (const citation of index.citations) {
      const tree = buildCitationTree(citation, index);
      const stack = [tree];
      while (stack.length > 0) {
        const node = stack.pop()!;
        if (node.isCycle) expect(node.cycleTargetLevel).toBeGreaterThanOrEqual(1);
        stack.push(...node.children);
      }
    }
  });

  it('gives every node a unique id', () => {
    const tree = buildCitationTree(index.citations[0], index);
    const ids: string[] = [];
    const stack = [tree];
    while (stack.length > 0) {
      const node = stack.pop()!;
      ids.push(node.id);
      stack.push(...node.children);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('caps fan-out and reports the remainder', () => {
    const tree = buildCitationTree(index.citations[0], index, 6, 3);
    const stack = [tree];
    while (stack.length > 0) {
      const node = stack.pop()!;
      expect(node.children.length).toBeLessThanOrEqual(3);
      stack.push(...node.children);
    }
  });

  it('does not recurse into external Acts', () => {
    for (const citation of index.citations) {
      if (citation.target.scope !== 'external') continue;
      const tree = buildCitationTree(citation, index);
      expect(tree.children).toHaveLength(0);
    }
  });
});

describe('resolution output', () => {
  it('truncates previews', () => {
    for (const provision of index.provisions) {
      expect(provision.text.length).toBeLessThan(200000);
    }
    expect(snippet('x'.repeat(5000)).length).toBeLessThanOrEqual(264);
    expect(snippet('x'.repeat(5000)).endsWith('\u2026')).toBe(true);
  });

  it('always carries the verbatim statutory words', () => {
    for (const citation of index.citations) {
      expect(citation.target.citedAs).toBe(citation.rawText.trim());
    }
  });

  it('marks degraded resolution honestly', () => {
    // "sub-section (1)" nodes were never extracted for 141 of 150 sections.
    const degraded = index.citations.filter(
      (c): c is Citation & { target: Extract<Citation['target'], { scope: 'internal' }> } =>
        c.target.scope === 'internal' && c.target.resolution === 'section-level'
    );
    for (const citation of degraded) {
      expect(citation.target.degradedFrom).toBeTruthy();
      expect(citation.target.targetEid).not.toBe(citation.target.degradedFrom);
    }
  });

  it('returns a null provision for anything not in this Act', () => {
    for (const citation of index.citations) {
      const resolved = resolveCitation(citation, index);
      if (citation.target.scope === 'internal' && citation.target.targetEid) {
        expect(resolved.provision?.eid).toBe(citation.target.targetEid);
      } else {
        expect(resolved.provision).toBeNull();
      }
    }
  });
});

describe('data quality report', () => {
  it('flags only sections whose page order contradicts their statutory number', () => {
    // The previous export mislabelled two Schedule II paragraphs as sections
    // 6 and 7, which this check caught. The current export has no such defect,
    // so the list is empty - the guard is that every id reported really is a
    // section, and that no genuinely out-of-place section slips through.
    for (const eid of index.quality.suspectSectionEids) {
      expect(index.sectionsByEid.has(eid)).toBe(true);
    }

    // Independently recompute: a section is suspect when a LATER statutory
    // number appears on an EARLIER page.
    const pageByOrdinal = new Map<number, number>();
    for (const section of index.readingOrder) {
      if (section.kind !== 'section') continue;
      const ordinal = statutoryOrdinal(section.num);
      if (ordinal === null) continue;
      const page = Math.min(...(section.page_numbers ?? [Number.MAX_SAFE_INTEGER]));
      if (!pageByOrdinal.has(ordinal)) pageByOrdinal.set(ordinal, page);
    }
    const expected = new Set<string>();
    for (const [ordinal, page] of pageByOrdinal) {
      for (const [otherOrdinal, otherPage] of pageByOrdinal) {
        if (otherOrdinal > ordinal && otherPage < page) {
          for (const section of index.readingOrder) {
            if (
              section.kind === 'section' &&
              statutoryOrdinal(section.num) === ordinal &&
              Math.min(...(section.page_numbers ?? [Number.MAX_SAFE_INTEGER])) === page
            ) {
              expected.add(section.eid);
            }
          }
        }
      }
    }
    expect(new Set(index.quality.suspectSectionEids)).toEqual(expected);
  });

  it('counts the unattributed provisions', () => {
    expect(index.quality.unattributedCount).toBeGreaterThan(0);
    expect(index.quality.unattributedCount).toBe(index.unattributed.length);
  });

  it('classifies every relation', () => {
    const total = Object.values(index.quality.relationCounts).reduce((a, b) => a + b, 0);
    expect(total).toBe(index.citations.length);
    expect(index.quality.relationCounts.subject_to ?? 0).toBeGreaterThan(0);
    expect(index.quality.relationCounts.notwithstanding ?? 0).toBeGreaterThan(0);
  });

  it('reports every unresolved in-text footnote marker instead of hiding it', () => {
    // The current export is missing footnote records 30-33 and 35, so markers
    // with no footnote behind them are a real defect in the payload. The
    // contract is that the quality report names them; asserting `[]` here
    // would only break again on the next re-export, and asserting a fixed list
    // would go stale the same way.
    const reported = index.quality.danglingFootnoteMarkers;

    // Recompute independently: a marker is dangling iff no footnote carries it.
    const footnoteNumbers = new Set(index.allFootnotes.map((f) => String(f.number)));
    const markersInText = new Set<string>();
    for (const provision of index.provisions) {
      for (const match of provision.text.matchAll(/\[(\d{1,3})\]/g)) markersInText.add(match[1]);
    }
    const expected = [...markersInText].filter((n) => !footnoteNumbers.has(n)).sort();

    expect([...reported].sort()).toEqual(expected);
  });

  it('recovers footnotes that carried no associated_eid from provision amendments', () => {
    expect(index.quality.orphanedFootnoteCount).toBeLessThan(index.quality.footnoteCount);
  });
});

describe('chronological placement of detached provisions', () => {
  const order = buildHierarchyIndex(index);
  const hierarchy = order;

  const minPageOf = (eid: string) => {
    const pages = index.provisionsByEid.get(eid)?.page_numbers ?? [];
    return pages.length ? Math.min(...pages) : Number.MAX_SAFE_INTEGER;
  };

  it('interleaves detached provisions instead of appending them', () => {
    const stream = index.documentOrder;
    expect(stream.length).toBe(index.readingOrder.length + index.unattributed.length);

    // Detached provisions must be spread through the stream, not all at the end.
    const detachedPositions = stream
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => p.isUnattributed)
      .map(({ i }) => i);

    expect(detachedPositions.length).toBe(index.unattributed.length);
    const firstDetached = detachedPositions[0];
    let lastReal = -1;
    stream.forEach((p, i) => {
      if (!p.isUnattributed) lastReal = i;
    });
    expect(firstDetached).toBeLessThan(lastReal);
  });

  it('never runs backwards through the pages', () => {
    let previous = -Infinity;
    for (const provision of index.documentOrder) {
      const page = minPageOf(provision.eid);
      expect(page).toBeGreaterThanOrEqual(previous);
      previous = page;
    }
  });

  it('puts detached body text between sections and schedules on a shared page', () => {
    const onOnePage = index.documentOrder.filter((p) => minPageOf(p.eid) === 4);
    const kinds = onOnePage.map((p) => (p.isUnattributed ? 'detached' : p.kind));
    const firstSchedule = kinds.indexOf('schedule');
    const firstDetached = kinds.indexOf('detached');
    if (firstSchedule >= 0 && firstDetached >= 0) {
      expect(firstDetached).toBeLessThan(firstSchedule);
    }
  });

  it('keeps detached provisions out of the section index', () => {
    // They are in the reading stream but not indexed as sections, because they
    // have no section number to index under.
    for (const section of hierarchy.sections) {
      expect(index.provisionsByEid.get(section.eid)?.isUnattributed).toBe(false);
    }
    for (const provision of index.unattributed) {
      expect(hierarchy.sections.some((s) => s.eid === provision.eid)).toBe(false);
    }
  });

  it('gives the header a section to display for every provision', () => {
    for (const provision of index.provisions) {
      const shown = hierarchy.eidToDisplaySectionMap.get(provision.eid);
      if (shown) {
        // The displayed section must be a real section.
        expect(hierarchy.sections.some((s) => s.eid === shown.eid)).toBe(true);
      }
    }
  });

  it('falls back to the nearest preceding section for detached provisions', () => {
    // Walk the stream; a detached card must not blank the Section dropdown.
    let nearest: string | null = null;
    const realSections = new Set(hierarchy.sections.map((s) => s.eid));
    let checked = 0;

    for (const item of hierarchy.documentOrder) {
      if (realSections.has(item.eid)) {
        nearest = item.eid;
        continue;
      }
      if (!nearest) continue;
      expect(hierarchy.eidToDisplaySectionMap.get(item.eid)?.eid).toBe(nearest);
      checked++;
    }

    expect(checked).toBeGreaterThan(0);
  });

  it('gives no page reference when the source recorded none', () => {
    const noPage = index.provisions.filter((p) => !p.page_numbers?.length);
    for (const provision of noPage) {
      // Nothing is invented: minPage stays unrepresentable and the provision is
      // simply ordered after the located ones.
      expect(minPageOf(provision.eid)).toBe(Number.MAX_SAFE_INTEGER);
    }
  });
});

describe('subtree text accounting', () => {
  it('sums a provision own text with every descendant', () => {
    for (const provision of index.provisions) {
      const expected =
        provision.text.length +
        provision.children.reduce((n, child) => n + child.subtreeTextLength, 0);
      expect(provision.subtreeTextLength).toBe(expected);
    }
  });

  it('always counts at least the provision own text', () => {
    for (const provision of index.provisions) {
      expect(provision.subtreeTextLength).toBeGreaterThanOrEqual(provision.text.length);
    }
  });

  it('finds zero-length subtrees only where the whole branch is empty', () => {
    // 8 schedules and 138 sub-clauses qualify. They may still have children —
    // an empty Schedule III full of empty items — but every descendant must
    // itself be empty.
    const empty = index.provisions.filter((p) => p.subtreeTextLength === 0);

    expect(index.quality.emptySubtreeCount).toBe(empty.length);
    expect(empty.length).toBeGreaterThan(0);

    for (const provision of empty) {
      expect(provision.text.trim()).toBe('');
      for (const descendant of flatten(provision.children)) {
        expect(descendant.subtreeTextLength).toBe(0);
      }
    }
  });

  it('never reports an empty subtree for a provision holding text', () => {
    const withText = index.provisions.filter((p) => p.subtreeTextLength > 0);
    expect(withText.length).toBe(index.provisions.length - index.quality.emptySubtreeCount);
  });

  it('identifies provisions whose content lives only in descendants', () => {
    // These are the cases the old "No text was extracted" message misreported.
    const cases = index.provisions.filter(
      (p) => p.text.trim().length === 0 && p.subtreeTextLength > 0
    );

    expect(cases.length).toBe(index.quality.emptyOwnTextWithDescendantTextCount);
    expect(cases.length).toBeGreaterThan(0);
    for (const provision of cases) {
      expect(provision.children.length).toBeGreaterThan(0);
      expect(provision.subtreeTextLength).toBeGreaterThan(0);
    }
  });

  it('flags orphans and measures the characters they hold', () => {
    const orphans = index.provisions.filter((p) => p.isUnattributed);
    expect(orphans.length).toBe(index.quality.unattributedCount);
    expect(orphans.length).toBeGreaterThan(0);

    // Every orphan must be a root that is not a document-level unit.
    for (const provision of orphans) {
      expect(provision.parent_eid).toBeNull();
      expect(['chapter', 'section', 'schedule']).not.toContain(provision.kind);
    }

    // And no genuine section may be flagged.
    for (const provision of index.provisions) {
      if (provision.kind === 'section') expect(provision.isUnattributed).toBe(false);
    }

    expect(index.quality.unattributedCharCount).toBeGreaterThan(0);
  });

  it('leaves every non-root provision unflagged', () => {
    for (const provision of index.provisions) {
      if (provision.parent_eid) expect(provision.isUnattributed).toBe(false);
    }
  });

  it('detaches whole orphan branches, not just the roots', () => {
    const detached = index.provisions.filter((p) => p.isDetached);
    const orphans = index.provisions.filter((p) => p.isUnattributed);

    expect(detached.length).toBeGreaterThan(orphans.length);
    expect(index.quality.detachedCount).toBe(detached.length);

    // Every orphan is detached, and every detached node sits under an orphan.
    for (const provision of orphans) expect(provision.isDetached).toBe(true);

    const covered = new Set<string>();
    for (const orphan of orphans) {
      covered.add(orphan.eid);
      for (const descendant of flatten([orphan])) covered.add(descendant.eid);
    }
    for (const provision of detached) expect(covered.has(provision.eid)).toBe(true);
  });

  it('never counts a character twice in the detached total', () => {
    // Summing subtreeTextLength over every detached node would double-count an
    // orphan's descendants via each ancestor. Own text is counted once.
    const detached = index.provisions.filter((p) => p.isDetached);
    const ownTotal = detached.reduce((n, p) => n + p.text.length, 0);

    expect(index.quality.detachedCharCount).toBe(ownTotal);
    expect(index.quality.unattributedCharCount).toBe(
      index.provisions.filter((p) => p.isUnattributed).reduce((n, p) => n + p.text.length, 0)
    );
  });

  it('leaves no provision inside a top-level branch detached', () => {
    const underTopLevel = index.provisions.filter((p) => p.topLevelEid !== null);
    for (const provision of underTopLevel) expect(provision.isDetached).toBe(false);
  });
});