import { describe, it, expect } from 'vitest';
import { buildHierarchyIndex } from '../services/hierarchyBuilder';
import { IndexedAknData } from '../services/aknLoader';
import { Provision } from '../types/akn';

describe('buildHierarchyIndex', () => {
  it('builds 3-tier hierarchy (Section > Sub-section > Clause)', () => {
    const sec1: Provision = { eid: 'sec_1', kind: 'section', num: '1', text: 'Section 1', children: [] };
    const sub1: Provision = { eid: 'sec_1__subsec_1', kind: 'subsection', num: '1', text: 'Sub 1', parent_eid: 'sec_1', children: [] };
    const clause1: Provision = { eid: 'sec_1__subsec_1__clause_a', kind: 'clause', num: 'a', text: 'Clause a', parent_eid: 'sec_1__subsec_1', children: [] };
    
    sec1.children = [sub1];
    sub1.children = [clause1];

    const mockData = {
      rootProvisions: [sec1],
      citationsByParent: new Map(),
      footnotesByEid: new Map(),
    } as unknown as IndexedAknData;

    const index = buildHierarchyIndex(mockData);

    expect(index.sections.length).toBe(1);
    expect(index.sections[0].eid).toBe('sec_1');
    expect(index.sections[0].subsections.length).toBe(1);
    expect(index.sections[0].subsections[0].eid).toBe('sec_1__subsec_1');
    expect(index.sections[0].subsections[0].clauses.length).toBe(1);
    expect(index.sections[0].subsections[0].clauses[0].eid).toBe('sec_1__subsec_1__clause_a');
  });
});
