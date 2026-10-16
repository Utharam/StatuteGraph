/**
 * Turning a provision into something worth pasting.
 *
 * The reader's most frequent outward action is not linking, it is quoting. A
 * practitioner reading section 44 is usually copying it into an email, a memo
 * or a case note. So the copy button puts *the words of the provision* on the
 * clipboard, introduced by a label that survives being pasted out of context.
 */

import { Provision } from '../types/akn';
import { cleanStatuteText, formatProvisionDisplayTitle } from './aknLoader';

/**
 * "Section 44. Apprenticeship registration"
 *
 * The display title renders as "Section 44: Apprenticeship registration". A
 * colon reads as a field separator, which is right on screen and wrong in an
 * email, so the first colon becomes a full stop.
 */
export function formatProvisionCopyLabel(provision: Provision): string {
  return formatProvisionDisplayTitle(provision).replace(/:\s/, '. ');
}

/**
 * Every run of words worth quoting under a provision, in reading order.
 *
 * The subtree is included because a provision's own text is frequently not the
 * provision. In the bundled CGST export 101 of 189 sections carry no own text
 * at all and 57 more carry only the marginal note, with every operative word
 * living in the sub-sections - so quoting own text alone would paste a label
 * and call it the section.
 *
 * A descendant is skipped when its words already appear in an ancestor's own
 * text, because parsers that print sub-section (1) inline also emit it as a
 * separate node. Checking ancestors only, rather than everything emitted so
 * far, keeps this linear rather than quadratic on an Act with thousands of
 * provisions under one chapter.
 */
function collectCopySegments(
  provision: Provision,
  ancestorTexts: string[],
  out: string[],
  emitted: Set<string>
): void {
  const own = cleanStatuteText(provision.text ?? '').trim();
  if (own && !emitted.has(own) && !ancestorTexts.some((ancestor) => ancestor.includes(own))) {
    out.push(own);
    emitted.add(own);
  }

  const path = own ? [...ancestorTexts, own] : ancestorTexts;
  for (const child of provision.children) {
    collectCopySegments(child, path, out, emitted);
  }
}

/**
 * Labelled plain text: the label, a blank line, then the provision.
 *
 * Returns an empty string only when the provision and its whole subtree hold no
 * words at all. Callers report that case rather than dropping it - see
 * `copyProvisionToClipboard`.
 */
export function buildProvisionCopyText(provision: Provision): string {
  const segments: string[] = [];
  collectCopySegments(provision, [], segments, new Set());
  if (segments.length === 0) return '';

  return `${formatProvisionCopyLabel(provision)}\n\n${segments.join('\n\n')}`;
}

/** What a copy attempt did, in the words shown to the reader. */
export type CopyStatus = 'copied' | 'failed' | 'empty';

/**
 * One wording per outcome, shared by the per-card tooltip and the canvas-wide
 * screen-reader announcement so the two can never disagree.
 */
export const COPY_FEEDBACK: Record<CopyStatus, string> = {
  copied: 'Provision copied to clipboard.',
  failed:
    'Copying failed. The browser blocked clipboard access; select the text and copy manually.',
  empty: 'This provision has no text of its own, and no sub-provisions to copy either.',
};

export interface CopyOutcome {
  status: CopyStatus;
  /** What was, or would have been, written. Useful to offer as a fallback. */
  text: string;
}

/**
 * Copies a provision and reports what happened.
 *
 * The writer is injectable so the decision can be tested without a browser.
 *
 * Every outcome is a reported status, including "there was nothing to copy".
 * An early return that changed no state left the button inert on 136 of the
 * shipped document's provisions, and a copy control that does nothing with no
 * explanation is indistinguishable from a broken one.
 */
export async function copyProvisionToClipboard(
  provision: Provision,
  write: (text: string) => Promise<boolean> = writeToClipboard
): Promise<CopyOutcome> {
  const text = buildProvisionCopyText(provision);
  if (!text) return { status: 'empty', text };

  const ok = await write(text);
  return { status: ok ? 'copied' : 'failed', text };
}

/**
 * Writes to the clipboard, falling back to a hidden textarea when the async
 * Clipboard API is unavailable or refused.
 *
 * Returns whether it worked. The async API is rejected in insecure contexts and
 * when permission is denied, and a provision button that fails silently reads
 * as a broken button.
 */
export async function writeToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the legacy path below.
    }
  }

  try {
    const area = document.createElement('textarea');
    area.value = text;
    // Off-screen but still focusable, otherwise the selection is lost and the
    // copy silently copies nothing.
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.top = '0';
    area.style.left = '-9999px';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}