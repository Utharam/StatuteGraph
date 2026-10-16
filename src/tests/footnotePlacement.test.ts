import { describe, it, expect } from 'vitest';
import { computePopoverPosition, PopoverRect } from '../components/footnotePlacement';

/** Anchor box, as `getBoundingClientRect` would report it. */
function anchor(overrides: Partial<PopoverRect> = {}): PopoverRect {
  return { top: 500, left: 400, right: 420, bottom: 520, width: 20, height: 20, ...overrides };
}

const POPOVER = { width: 384, height: 224 };
const VIEWPORT = { width: 1400, height: 900 };

describe('computePopoverPosition', () => {
  it('sits above the footnote when there is room', () => {
    const position = computePopoverPosition(anchor(), POPOVER, VIEWPORT);

    expect(position.placement).toBe('above');
    expect(position.top).toBe(500 - 8 - 224);
  });

  it('flips below the footnote when there is no room above', () => {
    // A footnote near the top of the viewport: above would be off screen.
    const position = computePopoverPosition(
      anchor({ top: 30, bottom: 50 }),
      POPOVER,
      VIEWPORT
    );

    expect(position.placement).toBe('below');
    expect(position.top).toBe(50 + 8);
  });

  it('flips below when the popover would cross the top margin', () => {
    const position = computePopoverPosition(
      anchor({ top: 220, bottom: 240 }),
      POPOVER,
      VIEWPORT
    );

    expect(position.placement).toBe('below');
    expect(position.top).toBe(248);
  });

  it('centres the popover on the footnote', () => {
    const position = computePopoverPosition(anchor(), POPOVER, VIEWPORT);

    // Footnote centre 410, popover half-width 192.
    expect(position.left).toBe(218);
  });

  it('keeps the popover inside the right edge', () => {
    const position = computePopoverPosition(
      anchor({ left: 1360, right: 1380 }),
      POPOVER,
      VIEWPORT
    );

    // 1400 - 16 margin - 384 width.
    expect(position.left).toBe(1000);
  });

  it('keeps the popover inside the left edge', () => {
    const position = computePopoverPosition(
      anchor({ left: 4, right: 24 }),
      POPOVER,
      VIEWPORT
    );

    expect(position.left).toBe(16);
  });

  it('never pushes the popover off the bottom of a short viewport', () => {
    // Below the anchor, and below that would overflow: clamp instead.
    const position = computePopoverPosition(
      anchor({ top: 800, bottom: 820 }),
      POPOVER,
      { width: 1400, height: 860 }
    );

    expect(position.top + POPOVER.height).toBeLessThanOrEqual(860 - 16);
  });

  it('returns a placement that is never negative', () => {
    const position = computePopoverPosition(
      anchor({ top: 0, bottom: 4, left: 0, right: 4 }),
      { width: 384, height: 4000 },
      VIEWPORT
    );

    expect(position.top).toBeGreaterThanOrEqual(0);
    expect(position.left).toBeGreaterThanOrEqual(0);
  });
});