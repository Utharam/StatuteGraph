/**
 * Document loading, validation and library-metadata tests.
 *
 * The point of these is that a bad file must fail with a message a user can act
 * on, never render a half-built index or throw an opaque TypeError.
 */

import { describe, it, expect } from 'vitest';
import raw from '../../public/data/cgst-act.json';
import {
  DocumentLoadError,
  describeDataset,
  formatBytes,
  isAcceptedFile,
  prettifyFileName,
  relativeTime,
  summarizeDataset,
  toShortTitle,
  validateDataset,
} from '../services/documentLibrary';
import { makeDocumentId, MAX_DOCUMENT_BYTES } from '../services/documentStore';
import { AknDataset } from '../types/akn';

const valid = raw as unknown as AknDataset;

const minimal = (overrides: Record<string, unknown> = {}) => ({
  schema_version: 'akn.statute.v1',
  akomaNtoso: { act: { meta: { title: 'Test Act, 2001', act_year: '2001' }, body: [] } },
  provisions: [
    { eid: 'sec_1', kind: 'section', num: '1', text: 'Section one.', page_numbers: [1] },
    { eid: 'sec_1__subsec_1', kind: 'subsection', num: '(1)', text: 'Subsection.', parent_eid: 'sec_1' },
  ],
  citations: [{ parent_eid: 'sec_1', raw_text: 'section 1', span: [0, 9], target_eid: 'sec_1', relation: 'reference', resolved: true, external: false }],
  footnotes: [],
  ...overrides,
});

/** Builds a File-alike good enough for the parts of the API under test. */
function fakeFile(name: string, content: string): File {
  return {
    name,
    size: new TextEncoder().encode(content).length,
    type: 'application/json',
    text: async () => content,
  } as unknown as File;
}

describe('validateDataset', () => {
  it('accepts the real dataset', () => {
    const dataset = validateDataset(valid, 'cgst-act.json');
    expect(dataset.provisions.length).toBe(1692);
    expect(dataset.citations.length).toBe(555);
  });

  it('accepts a minimal well-formed document', () => {
    const dataset = validateDataset(minimal(), 'test.json');
    expect(dataset.provisions).toHaveLength(2);
    expect(dataset.schema_version).toBe('akn.statute.v1');
  });

  it('tolerates a missing citations or footnotes array', () => {
    const dataset = validateDataset(
      { provisions: minimal().provisions, akomaNtoso: minimal().akomaNtoso },
      'test.json'
    );
    expect(dataset.citations).toEqual([]);
    expect(dataset.footnotes).toEqual([]);
  });

  it('rejects a non-object payload', () => {
    expect(() => validateDataset([1, 2, 3], 'test.json')).toThrow(DocumentLoadError);
    expect(() => validateDataset('hello', 'test.json')).toThrow(/not a statute JSON file/i);
    expect(() => validateDataset(null, 'test.json')).toThrow(DocumentLoadError);
  });

  it('rejects a payload with no provisions array', () => {
    expect(() => validateDataset({ citations: [] }, 'test.json')).toThrow(/no "provisions" array/i);
  });

  it('rejects an empty provisions array', () => {
    expect(() => validateDataset({ provisions: [] }, 'test.json')).toThrow(/no provisions/i);
  });

  it('rejects a provision missing a required field', () => {
    const broken = minimal();
    delete (broken.provisions[0] as Record<string, unknown>).text;
    expect(() => validateDataset(broken, 'test.json')).toThrow(/"text"/i);
  });

  it('rejects duplicate provision ids', () => {
    // Would otherwise collapse two provisions into one indexed node.
    const broken = minimal();
    broken.provisions.push({ ...broken.provisions[0] });
    expect(() => validateDataset(broken, 'test.json')).toThrow(/duplicate provision ids/i);
  });

  it('rejects a citation pointing at a missing provision', () => {
    const broken = minimal();
    broken.citations = [
      { parent_eid: 'sec_999', raw_text: 'section 999', span: [0, 9], target_eid: 'sec_999', relation: 'reference', resolved: true, external: false },
    ];
    expect(() => validateDataset(broken, 'test.json')).toThrow(/do not exist/i);
  });

  it('names the file in every error', () => {
    try {
      validateDataset({ nonsense: true }, 'broken-export.json');
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(DocumentLoadError);
      expect((error as DocumentLoadError).message).toContain('broken-export.json');
      expect((error as DocumentLoadError).detail).toBeTruthy();
    }
  });
});

describe('metadata derivation', () => {
  it('derives a title from the dataset rather than the filename', () => {
    const described = describeDataset(validateDataset(valid, 'x.json'), 'whatever-the-file-is.json');
    expect(described.title).toBe('The Central Goods and Services Tax Act, 2017');
  });

  it('falls back to a prettified filename when the title is unusable', () => {
    const noTitle = minimal();
    delete (noTitle.akomaNtoso.act.meta as unknown as Record<string, unknown>).title;
    const described = describeDataset(validateDataset(noTitle, 'x.json'), 'customs-tariff.json');
    expect(described.title).toBe('Customs Tariff');
  });

  it('abbreviates known acronyms in the short title', () => {
    expect(toShortTitle('The CGST Act, 2017')).toBe('CGST Act, 2017');
    expect(toShortTitle('The IGST Act, 2017')).toBe('IGST Act, 2017');
    expect(toShortTitle('The Motor Vehicles Act, 1988')).toBe('Motor Vehicles Act, 1988');
  });

  it('prettifies awkward filenames', () => {
    expect(prettifyFileName('cgst-act-updated.json')).toBe('Cgst Act Updated');
    expect(prettifyFileName('my_statute.akn')).toBe('My Statute');
  });

  it('summarises counts without building the index', () => {
    const summary = summarizeDataset(valid);
    expect(summary.provisions).toBe(1692);
    expect(summary.sections).toBe(150);
    expect(summary.citations).toBe(555);
    expect(summary.footnotes).toBe(113);
  });
});

describe('file acceptance', () => {
  it('accepts .json regardless of declared MIME type', () => {
    expect(isAcceptedFile(fakeFile('act.json', '{}'))).toBe(true);
    expect(isAcceptedFile(fakeFile('ACT.JSON', '{}'))).toBe(true);
  });

  it('accepts a JSON MIME type regardless of extension', () => {
    const odd = { name: 'statute', type: 'application/json' } as File;
    expect(isAcceptedFile(odd)).toBe(true);
  });

  it('rejects PDFs and other formats', () => {
    const pdf = { name: 'cgst.pdf', type: 'application/pdf' } as File;
    const png = { name: 'page.png', type: 'image/png' } as File;
    expect(isAcceptedFile(pdf)).toBe(false);
    expect(isAcceptedFile(png)).toBe(false);
  });
});

describe('document ids', () => {
  it('is stable for the same file and size, so re-dropping replaces', () => {
    expect(makeDocumentId('cgst.json', 100)).toBe(makeDocumentId('cgst.json', 100));
  });

  it('differs when the file or size differs', () => {
    expect(makeDocumentId('cgst.json', 100)).not.toBe(makeDocumentId('cgst.json', 200));
    expect(makeDocumentId('a.json', 100)).not.toBe(makeDocumentId('b.json', 100));
  });

  it('keeps different stems distinct', () => {
    // Near-identical names must not collide, or one document would silently
    // overwrite another in the library.
    expect(makeDocumentId('cgst-act.json', 100)).not.toBe(makeDocumentId('cgst-act-2.json', 100));
    expect(makeDocumentId('cgst-act.json', 100)).not.toBe(makeDocumentId('igst-act.json', 100));
  });

  it('ignores case and separator style for the same stem', () => {
    // Same document, written differently: should replace, not duplicate.
    expect(makeDocumentId('CGST-Act.json', 100)).toBe(makeDocumentId('cgst_act.json', 100));
    expect(makeDocumentId('cgst act.json', 100)).toBe(makeDocumentId('cgst-act.json', 100));
  });
});

describe('formatting', () => {
  it('formats byte sizes', () => {
    expect(formatBytes(0)).toBe('—');
    expect(formatBytes(undefined)).toBe('—');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2376452)).toMatch(/MB$/);
  });

  it('describes recency', () => {
    expect(relativeTime(undefined)).toBe('');
    expect(relativeTime(Date.now())).toBe('just now');
    expect(relativeTime(Date.now() - 5 * 60_000)).toBe('5 min ago');
    expect(relativeTime(Date.now() - 3 * 3_600_000)).toBe('3 hr ago');
  });
});

describe('storage limits', () => {
  it('caps document size well above any real statute dump', () => {
    expect(MAX_DOCUMENT_BYTES).toBeGreaterThan(2_376_452);
    expect(MAX_DOCUMENT_BYTES).toBeLessThanOrEqual(256 * 1024 * 1024);
  });
});