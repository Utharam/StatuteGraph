import { describe, it, expect } from 'vitest';
import { sliceProvisionText, cleanSegmentText, relationPresentation } from '../services/citationEngine';
import { Citation } from '../types/akn';

function makeCitation(
  parentEid: string,
  rawText: string,
  span: [number, number],
  relation: Citation['relation'] = 'reference'
): Citation {
  return {
    id: `${parentEid}#${span[0]}-${span[1]}`,
    parentEid,
    rawText,
    span,
    relation,
    target: {
      scope: 'internal',
      targetEid: 'sec_10',
      citedAs: rawText,
      resolution: 'exact',
      degradedFrom: null,
    },
    parser: { targetEid: 'sec_10', external: false, resolved: true },
  };
}

describe('sliceProvisionText', () => {
  it('does not split a surrogate pair across segments', () => {
    const text = 'Hello \u{1F9D1}\u{2696}\uFE0F world';
    // Index 6 is the low half of the first astral character.
    const citation = makeCitation('sec_1', '', [6, 7]);
    const segments = sliceProvisionText(text, [citation]);

    const citationSegment = segments.find((s) => s.type === 'citation');
    expect(citationSegment?.content.length).toBe(2);
  });

  it('slices consecutive non-overlapping citations', () => {
    const text = 'Under section 10 and section 11 of the Act';
    const c1 = makeCitation('sec_1', 'section 10', [6, 16]);
    const c2 = makeCitation('sec_1', 'section 11', [21, 31]);

    const segments = sliceProvisionText(text, [c1, c2]);

    expect(segments.length).toBe(5);
    expect(segments[0]).toEqual({ start: 0, end: 6, type: 'text', content: 'Under ' });
    expect(segments[1]).toMatchObject({ start: 6, end: 16, type: 'citation', citation: c1, content: 'section 10' });
    expect(segments[2]).toEqual({ start: 16, end: 21, type: 'text', content: ' and ' });
    expect(segments[3]).toMatchObject({ start: 21, end: 31, type: 'citation', citation: c2, content: 'section 11' });
    expect(segments[4]).toEqual({ start: 31, end: 42, type: 'text', content: ' of the Act' });
  });

  it('keeps the longer of two overlapping citations', () => {
    const text = 'refer to section 10(1) clause a';
    const longer = makeCitation('sec_1', 'section 10(1)', [9, 22]);
    const shorter = makeCitation('sec_1', 'section 10', [9, 19]);

    const citations = sliceProvisionText(text, [shorter, longer]).filter((s) => s.type === 'citation');

    expect(citations.length).toBe(1);
    expect(citations[0].content).toBe('section 10(1)');
  });

  it('ignores citations with out-of-bounds or empty spans', () => {
    const text = 'Sample text';
    const citations = [
      makeCitation('sec_1', '', [-5, 2]),
      makeCitation('sec_1', '', [20, 30]),
      makeCitation('sec_1', '', [5, 5]),
    ];

    const segments = sliceProvisionText(text, citations);

    expect(segments.length).toBe(1);
    expect(segments[0].content).toBe('Sample text');
  });

  it('returns nothing for empty text', () => {
    expect(sliceProvisionText('', [])).toEqual([]);
  });
});

describe('cleanSegmentText', () => {
  it('preserves boundary whitespace while normalising the interior', () => {
    expect(cleanSegmentText('  and  ')).toBe(' and ');
    expect(cleanSegmentText('under ')).toBe('under ');
    expect(cleanSegmentText(' of the Act')).toBe(' of the Act');
    expect(cleanSegmentText('   ')).toBe(' ');
  });

  it('rewrites omission markers', () => {
    expect(cleanSegmentText('[*****.]')).toBe('[Omitted]');
    expect(cleanSegmentText('word [*****] test')).toBe('word [Omitted] test');
  });

  it('strips zero-width characters', () => {
    expect(cleanSegmentText('sec\u00ADtion')).toBe('section');
  });
});

describe('relationPresentation', () => {
  it('gives subordination and override distinct treatments', () => {
    // These are opposite legal operations and must not look alike.
    const subjectTo = relationPresentation('subject_to');
    const notwithstanding = relationPresentation('notwithstanding');
    const reference = relationPresentation('reference');

    expect(subjectTo.pill).not.toBe(notwithstanding.pill);
    expect(subjectTo.pill).not.toBe(reference.pill);
    expect(notwithstanding.pill).not.toBe(reference.pill);
  });

  it('describes each relation', () => {
    expect(relationPresentation('subject_to').description).toMatch(/subject to/i);
    expect(relationPresentation('notwithstanding').description).toMatch(/overrides/i);
  });
});