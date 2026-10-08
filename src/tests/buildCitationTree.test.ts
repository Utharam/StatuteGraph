import { describe, it, expect } from 'vitest';
import { buildCitationTree, getCitationTreeStats } from '../services/citationEngine';
import { AknDataset, Citation, RawCitation } from '../types/akn';
import { buildIndex } from '../services/aknLoader';

/**
 * Builds an index from a graph spec: `{ from: to[] }`, plus optional external
 * edges. This exercises the real loader, resolver and cascade together.
 */
function indexGraph(graph: Record<string, string[]>, externals: Record<string, string> = {}) {
  const provisions = Object.keys(graph).map((eid, i) => ({
    eid,
    kind: 'section' as const,
    num: eid.replace(/^sec_(start|[A-Za-z0-9_]+)$/, '$1'),
    text: `Text of ${eid}.`,
    page_numbers: [i + 1],
  }));

  const raw: RawCitation[] = [];
  let offset = 0;
  for (const [from, targets] of Object.entries(graph)) {
    for (const to of targets) {
      raw.push({
        parent_eid: from,
        raw_text: `section ${to.replace('sec_', '')}`,
        // Distinct offsets: citations are keyed by parentEid#span, and two real
        // citations in one provision can never share a span.
        span: [offset, offset + 5],
        target_eid: to,
        relation: 'reference',
        resolved: true,
        external: false,
      });
      offset += 10;
    }
  }
  for (const [from, rawText] of Object.entries(externals)) {
    raw.push({
      parent_eid: from,
      raw_text: rawText,
      span: [offset, offset + 5],
      // Deliberately collides with a real internal eid, as the dataset does.
      target_eid: 'sec_2',
      relation: 'reference',
      resolved: false,
      external: true,
      target_type: 'external_act',
    });
    offset += 10;
  }

  const dataset = {
    schema_version: 'test',
    akomaNtoso: { act: { meta: { title: 'Test', act_year: '2017' }, body: [] } },
    provisions,
    citations: raw,
    footnotes: [],
  } as unknown as AknDataset;

  return buildIndex(dataset);
}

function firstCitationFor(index: ReturnType<typeof buildIndex>, parentEid: string): Citation {
  const citation = index.citations.find((c) => c.parentEid === parentEid);
  if (!citation) throw new Error(`no citation from ${parentEid}`);
  return citation;
}

describe('buildCitationTree', () => {
  it('halts a cycle and reports the level it points back to', () => {
    const index = indexGraph({ sec_1: ['sec_2'], sec_2: ['sec_3'], sec_3: ['sec_1'] });

    const root = buildCitationTree(firstCitationFor(index, 'sec_1'), index);

    expect(root.isCycle).toBe(false);
    expect(root.children).toHaveLength(1);

    const cycleNode = root.children[0].children[0];
    expect(cycleNode.isCycle).toBe(true);
    expect(cycleNode.children).toHaveLength(0);
    // Regression: the seed mapped the citing provision to level 0, which
    // rendered as the nonsensical "Cycle Loop (Target at L0)".
    expect(cycleNode.cycleTargetLevel).toBeGreaterThanOrEqual(1);
  });

  it('caps depth at six levels', () => {
    const graph: Record<string, string[]> = {};
    for (let i = 0; i < 12; i++) graph[`sec_${i}`] = [`sec_${i + 1}`];
    graph.sec_12 = [];
    const index = indexGraph(graph);

    const root = buildCitationTree(firstCitationFor(index, 'sec_0'), index);

    let depth = 1;
    let cursor = root;
    while (cursor.children.length > 0) {
      depth++;
      cursor = cursor.children[0];
    }
    expect(depth).toBe(6);
  });

  it('does not mistake a diamond for a cycle', () => {
    // A -> B -> D and A -> C -> D. D is reachable along two separate branches,
    // which must not look like a loop. `sec_start` exists so the tree root
    // resolves to A, giving us both of A's citations as siblings.
    const index = indexGraph({
      sec_start: ['sec_A'],
      sec_A: ['sec_B', 'sec_C'],
      sec_B: ['sec_D'],
      sec_C: ['sec_D'],
      sec_D: [],
    });

    const root = buildCitationTree(firstCitationFor(index, 'sec_start'), index);

    expect(root.isCycle).toBe(false);
    expect(root.children).toHaveLength(2);
    for (const branch of root.children) {
      expect(branch.isCycle).toBe(false);
      expect(branch.children).toHaveLength(1);
      expect(branch.children[0].isCycle).toBe(false);
      expect(branch.children[0].resolvedTarget.provision?.eid).toBe('sec_D');
    }
  });

  it('treats a provision citing itself as an immediate cycle', () => {
    const index = indexGraph({ sec_1: ['sec_1'] });

    const root = buildCitationTree(firstCitationFor(index, 'sec_1'), index);

    expect(root.isCycle).toBe(true);
    expect(root.children).toHaveLength(0);
  });

  it('never resolves an external reference to an internal provision', () => {
    // The regression this guards: "section 148 of the Companies Act, 2013"
    // carries target_eid `sec_148`, which is also a real CGST section.
    const index = indexGraph(
      { sec_1: [], sec_2: [] },
      { sec_1: 'section 2 of the Companies Act, 2013' }
    );

    const citation = firstCitationFor(index, 'sec_1');
    expect(citation.target.scope).toBe('external');

    const root = buildCitationTree(citation, index);
    expect(root.resolvedTarget.provision).toBeNull();
    expect(root.resolvedTarget.isExternal).toBe(true);
    expect(root.resolvedTarget.displayTitle).toContain('Companies Act');
    // External references are leaves: nothing to cascade into.
    expect(root.children).toHaveLength(0);
  });

  it('caps fan-out and reports how many children were hidden', () => {
    const targets = Array.from({ length: 10 }, (_, i) => `sec_t${i}`);
    const graph: Record<string, string[]> = { sec_start: ['sec_root'], sec_root: targets };
    targets.forEach((t) => (graph[t] = []));
    const index = indexGraph(graph);

    const root = buildCitationTree(firstCitationFor(index, 'sec_start'), index, 6, 3);

    expect(root.children).toHaveLength(3);
    expect(root.hiddenChildCount).toBe(7);
  });

  it('gives every node a unique id', () => {
    const index = indexGraph({ sec_1: ['sec_2'], sec_2: ['sec_3'], sec_3: [] });

    const root = buildCitationTree(firstCitationFor(index, 'sec_1'), index);
    const ids: string[] = [];
    const stack = [root];
    while (stack.length > 0) {
      const node = stack.pop()!;
      ids.push(node.id);
      stack.push(...node.children);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('getCitationTreeStats', () => {
  it('counts nodes, depth, cycles and external references', () => {
    const index = indexGraph(
      { sec_start: ['sec_1'], sec_1: ['sec_2'], sec_2: ['sec_1'], sec_3: [] },
      { sec_3: 'section 3 of the Finance Act, 2001' }
    );

    const stats = getCitationTreeStats(buildCitationTree(firstCitationFor(index, 'sec_start'), index));

    // L1 sec_1, L2 sec_2, L3 sec_1 again (cycle).
    expect(stats.totalNodes).toBe(3);
    expect(stats.maxDepthReached).toBe(3);
    expect(stats.cycleCount).toBe(1);

    const externalStats = getCitationTreeStats(buildCitationTree(firstCitationFor(index, 'sec_3'), index));
    expect(externalStats.externalCount).toBe(1);
  });
});