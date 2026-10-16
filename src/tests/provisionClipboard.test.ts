import { describe, it, expect } from 'vitest';
import { Provision, ProvisionKind } from '../types/akn';
import {
  formatProvisionCopyLabel,
  buildProvisionCopyText,
  copyProvisionToClipboard,
} from '../services/provisionClipboard';

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

/** A sub-section hanging off the section above. */
function subSection(text: string, overrides: Partial<Provision> = {}): Provision {
  return provision({
    eid: 'sec_44__subsec_1',
    kind: 'subsection',
    num: '(1)',
    text,
    topLevelEid: 'sec_44',
    ...overrides,
  });
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

    it('returns nothing when neither the provision nor its subtree holds words', () => {
      // Copying a bare label would put "Section 44" on the clipboard, which
      // reads as a truncated quote. But emptiness is now a reported outcome,
      // never a silent one - see copyProvisionToClipboard below.
      expect(buildProvisionCopyText(provision({ text: '' }))).toBe('');
      expect(buildProvisionCopyText(provision({ text: '   ' }))).toBe('');
      expect(buildProvisionCopyText(provision({ text: '', children: [subSection('  ')] }))).toBe('');
    });

    it('includes the sub-provisions when the provision has no text of its own', () => {
      // 101 of the 189 sections in the shipped CGST export are exactly this
      // shape: a marginal note or nothing at all in `text`, with every
      // operative word living in the sub-sections. Copying own text alone
      // quotes the label and calls it the section.
      const section = provision({
        text: '',
        children: [
          subSection('Every registered person shall file a return.', { eid: 'sec_44__subsec_1' }),
          subSection('A late fee shall be payable.', { eid: 'sec_44__subsec_2', num: '(2)' }),
        ],
      });

      expect(buildProvisionCopyText(section)).toBe(
        'Section 44\n\n' +
          'Every registered person shall file a return.\n\n' +
          'A late fee shall be payable.'
      );
    });

    it('does not repeat a descendant whose words are already in the own text', () => {
      // Some sections print sub-section (1) inline and also emit it as a child
      // node. Pasting the same sentence twice reads as a drafting error.
      const section = provision({
        text: 'Every registered person shall file a return. A late fee shall be payable.',
        children: [
          subSection('Every registered person shall file a return.', { eid: 'sec_44__subsec_1' }),
          subSection('A late fee shall be payable.', { eid: 'sec_44__subsec_2', num: '(2)' }),
        ],
      });

      const text = buildProvisionCopyText(section);

      expect(text.match(/shall file a return/g)).toHaveLength(1);
      expect(text.match(/late fee shall be payable/g)).toHaveLength(1);
    });
  });

  describe('copyProvisionToClipboard', () => {
    it('reports copied when the browser accepts the text', async () => {
      const written: string[] = [];
      const outcome = await copyProvisionToClipboard(
        provision({ title: 'Apprenticeship registration' }),
        async (text) => {
          written.push(text);
          return true;
        }
      );

      expect(outcome.status).toBe('copied');
      expect(written).toHaveLength(1);
      expect(written[0]).toContain('Section 44. Apprenticeship registration');
    });

    it('reports failed when the browser blocks the clipboard', async () => {
      const outcome = await copyProvisionToClipboard(provision(), async () => false);

      expect(outcome.status).toBe('failed');
      // The text is still returned so the caller can offer it as a fallback.
      expect(outcome.text).not.toBe('');
    });

    it('reports empty rather than failing silently when there are no words to copy', async () => {
      // The bug this guards: an early `return ''` with no state change left the
      // button inert on 136 of the shipped document's provisions, with no
      // check, no warning and no announcement.
      let writeCalled = false;
      const outcome = await copyProvisionToClipboard(provision({ text: '' }), async () => {
        writeCalled = true;
        return true;
      });

      expect(writeCalled).toBe(false);
      expect(outcome.status).toBe('empty');
      expect(outcome.text).toBe('');
    });

    it('reports empty for a container whose whole subtree is blank', async () => {
      const section = provision({ text: '', children: [subSection('')] });

      expect((await copyProvisionToClipboard(section, async () => true)).status).toBe('empty');
    });
  });
});