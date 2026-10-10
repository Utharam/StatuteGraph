/**
 * Turning a provision into something worth pasting.
 *
 * The reader's most frequent outward action is not linking, it is quoting. A
 * practitioner reading section 44 is usually copying it into an email, a memo
 * or a case note. So the copy button puts *the words of the provision* on the
 * clipboard, introduced by a label that survives being pasted out of context.
 *
 * Deliberately excluded: descendants. In this corpus a section's own text
 * already contains its sub-section (1) inline, and the loader creates separate
 * nodes for the rest. Concatenating the subtree would paste the same words
 * twice.
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
 * Labelled plain text: the label, a blank line, then the provision.
 *
 * Returns an empty string when there is no text to copy, so callers can skip
 * the clipboard write rather than writing a bare label.
 */
export function buildProvisionCopyText(provision: Provision): string {
  const body = cleanStatuteText(provision.text ?? '').trim();
  if (!body) return '';

  return `${formatProvisionCopyLabel(provision)}\n\n${body}`;
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