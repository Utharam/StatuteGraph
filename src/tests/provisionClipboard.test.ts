import { describe, it, expect } from 'vitest';
import { Provision, ProvisionKind } from '../types/akn';
import { formatProvisionCopyLabel, buildProvisionCopyText } from '../services/provisionClipboard';

function provision(overrides: Partial<Provision> = {}): Provision {
  return {
    eid: 'sec_44',
    kind: 'section',
    num: '44',
    text: 'The Central Government may register apprentices.',
    children: [],
    citations: [],
    footnotes: [],
    subtreeCitations: [],
    subtreeFootnotes: [],
    subtreeTextLength: 0,
    topLevelEid: 'sec_44',
    ...overrides,
  } as Provision;
}

describe('provisionClipboard', () => {
  describe('formatProvisionCopyLabel', () => {
    it('labels a section with its number and title', () => {
      const label = formatProvisionCopyLabel(
        provision({ num: '44', title: 'Apprenticeship registration' })
      );

      expect(label).toBe('Section 44. Apprenticeship registration');
    });

    it('does not repeat a title that only restates the tier', () => {
      // A sub-section numbered "(2)" carries a derived title of
      // "Sub-section (2)". Copying "Sub-section (2). Sub-section (2)" would be
      // noise in an email.
      const label = formatProvisionCopyLabel(
        provision({ kind: 'subsection' as ProvisionKind, num: '(2)', title: 'Sub-section (2)' })
      );

      expect(label).toBe('Sub-section (2)');
    });

    it('falls back to the bare tier label when there is no number or title', () => {
      const label = formatProvisionCopyLabel(provision({ num: '', title: undefined }));

      expect(label).toBe('Section');
    });
  });

  describe('buildProvisionCopyText', () => {
    it('puts the label, a blank line, then the provision', () => {
      const text = buildProvisionCopyText(
        provision({ num: '44', title: 'Apprenticeship registration' })
      );

      expect(text).toBe(
        'Section 44. Apprenticeship registration\n\n' +
          'The Central Government may register apprentices.'
      );
    });

    it('pastes as readable plain text with no markup', () => {
      const text = buildProvisionCopyText(provision());

      expect(text).not.toMatch(/[<>]/);
    });

    it('cleans replacement characters out of the body', () => {
      const text = buildProvisionCopyText(provision({ text: 'A provision with a \ufffd artefact.' }));

      expect(text).toContain('A provision with a artefact.');
      expect(text).not.toContain('\ufffd');
    });

    it('returns nothing when the provision has no text of its own', () => {
      // Container nodes legitimately hold no words. Copying a bare label would
      // put "Section 44" on the clipboard, which reads as a truncated quote.
      expect(buildProvisionCopyText(provision({ text: '' }))).toBe('');
      expect(buildProvisionCopyText(provision({ text: '   ' }))).toBe('');
    });

    it('does not duplicate text that already lives in a descendant', () => {
      // In this corpus a section's own text already contains sub-section (1).
      // Concatenating the subtree would paste the same sentence twice.
      const text = buildProvisionCopyText(provision());

      expect(text.match(/may register apprentices/g)).toHaveLength(1);
    });
  });
});