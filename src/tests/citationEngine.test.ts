import { describe, it, expect } from 'vitest';
import { sliceProvisionText, cleanSegmentText } from '../services/citationEngine';
import { Citation } from '../types/akn';

describe('sliceProvisionText', () => {
  it('handles multibyte characters without splitting them', () => {
    const text = "Hello 🧑‍⚖️ world";
    const citations = [{ span: [6, 7], raw_text: '', relation: '', target_eid: '', parent_eid: '', resolved: false, external: false }];
    const result = sliceProvisionText(text, citations as any);
    
    const citationSlice = result.find(s => s.type === 'citation');
    expect(citationSlice?.content.length).toBe(2);
  });

  it('correctly slices consecutive and non-overlapping citations', () => {
    const text = 'Under section 10 and section 11 of the Act';
    const c1: Citation = { span: [6, 16], raw_text: 'section 10', target_eid: 'sec_10', parent_eid: 'sec_1', relation: '', resolved: true, external: false };
    const c2: Citation = { span: [21, 31], raw_text: 'section 11', target_eid: 'sec_11', parent_eid: 'sec_1', relation: '', resolved: true, external: false };

    const segments = sliceProvisionText(text, [c1, c2]);

    expect(segments.length).toBe(5);
    expect(segments[0]).toEqual({ start: 0, end: 6, type: 'text', content: 'Under ' });
    expect(segments[1]).toEqual({ start: 6, end: 16, type: 'citation', citation: c1, content: 'section 10' });
    expect(segments[2]).toEqual({ start: 16, end: 21, type: 'text', content: ' and ' });
    expect(segments[3]).toEqual({ start: 21, end: 31, type: 'citation', citation: c2, content: 'section 11' });
    expect(segments[4]).toEqual({ start: 31, end: 42, type: 'text', content: ' of the Act' });
  });

  it('resolves overlapping citations safely by picking the first longer one', () => {
    const text = 'refer to section 10(1) clause a';
    const c1: Citation = { span: [9, 22], raw_text: 'section 10(1)', target_eid: 'sec_10__subsec_1', parent_eid: '', relation: '', resolved: true, external: false };
    const c2: Citation = { span: [9, 19], raw_text: 'section 10', target_eid: 'sec_10', parent_eid: '', relation: '', resolved: true, external: false };

    const segments = sliceProvisionText(text, [c2, c1]);

    const cites = segments.filter(s => s.type === 'citation');
    expect(cites.length).toBe(1);
    expect(cites[0].content).toBe('section 10(1)');
  });

  it('handles empty or out-of-bounds citations gracefully', () => {
    const text = 'Sample text';
    const invalidCites = [
      { span: [-5, 2], raw_text: '', target_eid: '', parent_eid: '', relation: '', resolved: false, external: false },
      { span: [20, 30], raw_text: '', target_eid: '', parent_eid: '', relation: '', resolved: false, external: false },
      { span: [5, 5], raw_text: '', target_eid: '', parent_eid: '', relation: '', resolved: false, external: false },
    ];

    const segments = sliceProvisionText(text, invalidCites as any);
    expect(segments.length).toBe(1);
    expect(segments[0].content).toBe('Sample text');
  });
});

describe('cleanSegmentText', () => {
  it('preserves leading and trailing space while normalizing internal whitespace', () => {
    expect(cleanSegmentText('  and  ')).toBe(' and ');
    expect(cleanSegmentText('under ')).toBe('under ');
    expect(cleanSegmentText(' of the Act')).toBe(' of the Act');
    expect(cleanSegmentText('   ')).toBe(' ');
  });

  it('replaces omission markers with [Omitted]', () => {
    expect(cleanSegmentText('[*****.]')).toBe('[Omitted]');
    expect(cleanSegmentText('word [*****] test')).toBe('word [Omitted] test');
  });
});
