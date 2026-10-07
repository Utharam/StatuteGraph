import { describe, it, expect } from 'vitest';
import { formatSectionOptionLabel } from '../components/NavigationPicker';
import { HierarchySectionItem } from '../types/akn';

describe('formatSectionOptionLabel', () => {
  it('formats section option labels cleanly without redundant prefixes', () => {
    const sec: HierarchySectionItem = {
      eid: 'sec_10',
      num: '10',
      title: 'Composition levy',
      kind: 'section',
      citationCount: 2,
      footnoteCount: 0,
      subsections: [],
    };
    expect(formatSectionOptionLabel(sec)).toBe('Sec 10: Composition levy');
  });

  it('formats schedule option labels correctly', () => {
    const sch: HierarchySectionItem = {
      eid: 'schedule_1',
      num: '1',
      title: 'Activities to be treated as supply even if made without consideration',
      kind: 'schedule',
      citationCount: 0,
      footnoteCount: 0,
      subsections: [],
    };
    expect(formatSectionOptionLabel(sch)).toContain('Schedule 1: Activities to be treated');
  });

  it('formats preamble chapter correctly', () => {
    const preamble: HierarchySectionItem = {
      eid: 'act_preamble',
      num: 'PREAMBLE',
      title: 'An Act to make a provision for levying...',
      kind: 'chapter',
      citationCount: 0,
      footnoteCount: 0,
      subsections: [],
    };
    expect(formatSectionOptionLabel(preamble)).toContain('Preamble: An Act to make a provision');
  });

  it('formats subsection correctly', () => {
    const subsec: HierarchySectionItem = {
      eid: 'sec_unknown__subsec_2',
      num: '(2)',
      title: 'It extends to the whole of India',
      kind: 'subsection',
      citationCount: 0,
      footnoteCount: 0,
      subsections: [],
    };
    expect(formatSectionOptionLabel(subsec)).toBe('Sub-sec (2): It extends to the whole of India');
  });
});
