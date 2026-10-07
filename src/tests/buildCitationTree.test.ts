import { describe, it, expect } from 'vitest';
import { buildCitationTree } from '../services/citationEngine';
import { Citation, Provision } from '../types/akn';
import { IndexedAknData } from '../services/aknLoader';

describe('buildCitationTree', () => {
  it('detects cycles and limits depth to 6', () => {
    // Mock index data with a cycle: sec_1 -> sec_2 -> sec_3 -> sec_1
    const p1: Provision = { eid: 'sec_1', kind: 'section', num: '1', text: 'Section 1' };
    const p2: Provision = { eid: 'sec_2', kind: 'section', num: '2', text: 'Section 2' };
    const p3: Provision = { eid: 'sec_3', kind: 'section', num: '3', text: 'Section 3' };
    
    const c1: Citation = { parent_eid: 'sec_1', raw_text: 'sec 2', target_eid: 'sec_2', span: [0,0], relation: '', resolved: true, external: false };
    const c2: Citation = { parent_eid: 'sec_2', raw_text: 'sec 3', target_eid: 'sec_3', span: [0,0], relation: '', resolved: true, external: false };
    const c3: Citation = { parent_eid: 'sec_3', raw_text: 'sec 1', target_eid: 'sec_1', span: [0,0], relation: '', resolved: true, external: false };

    p1.citations = [c1];
    p2.citations = [c2];
    p3.citations = [c3];

    const provisionsByEid = new Map([['sec_1', p1], ['sec_2', p2], ['sec_3', p3]]);
    const citationsByParent = new Map([['sec_1', [c1]], ['sec_2', [c2]], ['sec_3', [c3]]]);
    const provisionsBySectionNum = new Map([['1', p1], ['2', p2], ['3', p3]]);
    const footnotesByEid = new Map();

    const mockData = {
      provisionsByEid,
      citationsByParent,
      provisionsBySectionNum,
      footnotesByEid,
    } as unknown as IndexedAknData;

    const root = buildCitationTree(c1, mockData);

    // root is c1 (sec_1->sec_2) (Level 1)
    //  -> child is c2 (sec_2->sec_3) (Level 2)
    //      -> child is c3 (sec_3->sec_1) (Level 3 - CYCLE!)
    
    expect(root.isCycle).toBe(false);
    expect(root.children.length).toBe(1);
    expect(root.children[0].isCycle).toBe(false);
    expect(root.children[0].children.length).toBe(1);
    
    const cycleNode = root.children[0].children[0];
    expect(cycleNode.isCycle).toBe(true);
    expect(cycleNode.cycleTargetLevel).toBe(0); // sec_1 was root parent, level 0
    expect(cycleNode.children.length).toBe(0); // halts!
  });

  it('limits max depth to 6', () => {
    // Chain of 10 provisions
    const provisions = Array.from({length: 10}, (_, i) => ({
      eid: `sec_${i}`, kind: 'section', num: `${i}`, text: `Section ${i}`
    } as Provision));

    const citations = Array.from({length: 9}, (_, i) => ({
      parent_eid: `sec_${i}`, raw_text: `sec ${i+1}`, target_eid: `sec_${i+1}`, span: [0,0], relation: '', resolved: true, external: false
    } as Citation));

    const provisionsByEid = new Map(provisions.map(p => [p.eid, p]));
    const citationsByParent = new Map(citations.map((c, i) => [`sec_${i}`, [c]]));

    const mockData = {
      provisionsByEid,
      citationsByParent,
      provisionsBySectionNum: new Map(),
      footnotesByEid: new Map(),
    } as unknown as IndexedAknData;

    const root = buildCitationTree(citations[0], mockData);

    // Level 1: sec_0 -> sec_1
    // ...
    // Level 6: sec_5 -> sec_6
    
    let depth = 1;
    let curr = root;
    while (curr.children && curr.children.length > 0) {
      depth++;
      curr = curr.children[0];
    }

    expect(depth).toBe(6); // should not exceed 6
  });

  it('allows diamond patterns without false-positive cycle detection', () => {
    // A -> B -> D and A -> C -> D (D is visited along two different branches)
    const pA: Provision = { eid: 'sec_A', kind: 'section', num: 'A', text: 'Section A' };
    const pB: Provision = { eid: 'sec_B', kind: 'section', num: 'B', text: 'Section B' };
    const pC: Provision = { eid: 'sec_C', kind: 'section', num: 'C', text: 'Section C' };
    const pD: Provision = { eid: 'sec_D', kind: 'section', num: 'D', text: 'Section D' };

    const cAB: Citation = { parent_eid: 'sec_A', raw_text: 'B', target_eid: 'sec_B', span: [0,0], relation: '', resolved: true, external: false };
    const cAC: Citation = { parent_eid: 'sec_A', raw_text: 'C', target_eid: 'sec_C', span: [0,0], relation: '', resolved: true, external: false };
    const cBD: Citation = { parent_eid: 'sec_B', raw_text: 'D', target_eid: 'sec_D', span: [0,0], relation: '', resolved: true, external: false };
    const cCD: Citation = { parent_eid: 'sec_C', raw_text: 'D', target_eid: 'sec_D', span: [0,0], relation: '', resolved: true, external: false };

    pA.citations = [cAB, cAC];
    pB.citations = [cBD];
    pC.citations = [cCD];
    pD.citations = [];

    const provisionsByEid = new Map([['sec_A', pA], ['sec_B', pB], ['sec_C', pC], ['sec_D', pD]]);
    const citationsByParent = new Map([['sec_A', [cAB, cAC]], ['sec_B', [cBD]], ['sec_C', [cCD]], ['sec_D', []]]);

    const mockData = {
      provisionsByEid,
      citationsByParent,
      provisionsBySectionNum: new Map(),
      footnotesByEid: new Map(),
    } as unknown as IndexedAknData;

    // Build from cAB (root target is B)
    const rootB = buildCitationTree(cAB, mockData);
    expect(rootB.isCycle).toBe(false);
    expect(rootB.children.length).toBe(1); // D
    expect(rootB.children[0].isCycle).toBe(false);

    // Build synthetic root citation pointing to A
    const cStart: Citation = { parent_eid: 'start', raw_text: 'A', target_eid: 'sec_A', span: [0,0], relation: '', resolved: true, external: false };
    const rootTree = buildCitationTree(cStart, mockData);

    // rootTree (A) has 2 children (B and C)
    expect(rootTree.children.length).toBe(2);
    const nodeB = rootTree.children.find(n => n.citation.target_eid === 'sec_B')!;
    const nodeC = rootTree.children.find(n => n.citation.target_eid === 'sec_C')!;

    // Both B and C cite D: neither should be marked as cycle
    expect(nodeB.children[0].resolvedTarget.targetEid).toBe('sec_D');
    expect(nodeB.children[0].isCycle).toBe(false);
    expect(nodeC.children[0].resolvedTarget.targetEid).toBe('sec_D');
    expect(nodeC.children[0].isCycle).toBe(false);
  });

  it('detects direct self-citation as a cycle immediately', () => {
    const p1: Provision = { eid: 'sec_1', kind: 'section', num: '1', text: 'Section 1' };
    const cSelf: Citation = { parent_eid: 'sec_1', raw_text: 'sec 1', target_eid: 'sec_1', span: [0,0], relation: '', resolved: true, external: false };
    p1.citations = [cSelf];

    const mockData = {
      provisionsByEid: new Map([['sec_1', p1]]),
      citationsByParent: new Map([['sec_1', [cSelf]]]),
      provisionsBySectionNum: new Map([['1', p1]]),
      footnotesByEid: new Map(),
    } as unknown as IndexedAknData;

    const root = buildCitationTree(cSelf, mockData);
    expect(root.isCycle).toBe(true);
    expect(root.cycleTargetLevel).toBe(0); // self parent
    expect(root.children.length).toBe(0);
  });

  it('handles external citations and calculates metrics properly', () => {
    const p1: Provision = { eid: 'sec_1', kind: 'section', num: '1', text: 'Section 1' };
    const cExt: Citation = {
      parent_eid: 'sec_1',
      raw_text: 'Transfer of Property Act, 1882',
      target_eid: 'act_topa_1882',
      span: [0,0],
      relation: '',
      resolved: false,
      external: true,
      target_type: 'external_act'
    };

    const mockData = {
      provisionsByEid: new Map([['sec_1', p1]]),
      citationsByParent: new Map([['sec_1', [cExt]]]),
      provisionsBySectionNum: new Map([['1', p1]]),
      footnotesByEid: new Map(),
    } as unknown as IndexedAknData;

    const root = buildCitationTree(cExt, mockData);
    expect(root.resolvedTarget.isExternal).toBe(true);
    expect(root.resolvedTarget.displayTitle).toContain('Transfer of Property Act');
    expect(root.children.length).toBe(0); // does not recurse into external acts
  });
});
