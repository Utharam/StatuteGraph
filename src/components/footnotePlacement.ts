/**
 * Where an amendment popover goes on screen.
 *
 * The popover cannot live inside the provision card: cards are painted with
 * `content-visibility: auto`, which applies paint containment and clips
 * descendants to the card's box. A 224px popover anchored above a footnote in a
 * 89px card was cut off 190px above it. So it is portalled to the document body
 * and positioned against the viewport instead, which needs these rules.
 */

export interface PopoverRect {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface PopoverSize {
  width: number;
  height: number;
}

export interface PopoverPosition {
  top: number;
  left: number;
  placement: 'above' | 'below';
}

/** Gap between the footnote and the popover. */
const GAP = 8;
/** Smallest distance kept between the popover and the viewport edge. */
const MARGIN = 16;

export function computePopoverPosition(
  anchor: PopoverRect,
  popover: PopoverSize,
  viewport: PopoverSize,
  options: { gap?: number; margin?: number } = {}
): PopoverPosition {
  const gap = options.gap ?? GAP;
  const margin = options.margin ?? MARGIN;

  const above = anchor.top - gap - popover.height;
  const below = anchor.bottom + gap;
  const placement: 'above' | 'below' = above >= margin ? 'above' : 'below';

  let top = placement === 'above' ? above : below;

  // A tall popover on a short viewport can overflow either way. Clamping is
  // better than letting it run off the bottom with no way to read the text.
  const maxTop = Math.max(margin, viewport.height - margin - popover.height);
  if (top > maxTop) top = maxTop;
  if (top < margin) top = margin;

  const centred = anchor.left + anchor.width / 2 - popover.width / 2;
  const maxLeft = Math.max(margin, viewport.width - margin - popover.width);
  const left = Math.min(Math.max(centred, margin), maxLeft);

  return { top, left, placement };
}