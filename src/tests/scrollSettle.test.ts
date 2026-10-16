import { describe, it, expect, vi, afterEach } from 'vitest';
import { settleScrollTo, createFrameTicker, ScrollEnvironment } from '../services/scrollSettle';

/**
 * A faithful stand-in for `content-visibility: auto` with
 * `contain-intrinsic-size: auto 220px`: every card occupies a 220px
 * placeholder until it comes near the viewport, at which point it takes its
 * real height and stays there.
 *
 * This is what the real browser does, measured: jumping to a section grew the
 * document by 11,047px while the scroll was still in flight, leaving the
 * target 11,135px below the fold.
 */
function lazyDocument(options: {
  cards: number;
  placeholder: number;
  realHeight: number;
  targetCard: number;
  viewport: number;
}) {
  const { cards, placeholder, realHeight, targetCard, viewport } = options;
  const revealed = new Set<number>();
  let scrollY = 0;

  const topOf = (index: number): number => {
    let top = 0;
    for (let i = 0; i < index; i++) top += revealed.has(i) ? realHeight : placeholder;
    return top;
  };

  /** Rendering is monotonic: anything the viewport has reached stays rendered. */
  const reveal = () => {
    for (let i = 0; i < cards; i++) {
      if (topOf(i) >= scrollY + viewport) break;
      revealed.add(i);
    }
  };
  reveal();

  return {
    env: {
      residual: () => topOf(targetCard) - scrollY,
      scrollBy: (deltaY: number) => {
        scrollY += deltaY;
        reveal();
      },
      nextFrame: () => Promise.resolve(),
    } satisfies ScrollEnvironment,
    scrollY: () => scrollY,
  };
}

/** An environment that never converges, for budget and cancellation tests. */
function stubborn(residual = 500) {
  const state = { scrolls: 0 };
  const env: ScrollEnvironment = {
    residual: () => residual,
    scrollBy: () => {
      state.scrolls++;
    },
    nextFrame: () => new Promise((resolve) => setTimeout(resolve, 0)),
  };
  return { env, state };
}

describe('settleScrollTo', () => {
  it('lands the target under the header when content expands as it scrolls', async () => {
    const doc = lazyDocument({
      cards: 400,
      placeholder: 220,
      realHeight: 1000,
      targetCard: 200,
      viewport: 800,
    });

    // What the reader used to do: one measurement, one scroll, done.
    const naiveTarget = doc.env.residual();
    doc.env.scrollBy(naiveTarget);
    const residualAfterNaiveJump = doc.env.residual();
    // Still more than ten screens away: the cards above the target grew from
    // 220px placeholders to 1000px each while the scroll was in flight.
    expect(residualAfterNaiveJump).toBeGreaterThan(800 * 10);

    // The settle loop has to correct for it, starting from wherever it landed.
    const result = await settleScrollTo(doc.env);

    expect(result.converged).toBe(true);
    expect(result.residual).toBe(0);
    // More than one correction is the whole point: a single scroll cannot work.
    expect(result.frames).toBeGreaterThan(1);
  });

  it('does not declare arrival while the document is still changing height', async () => {
    // The target can read as arrived while cards above it are still trading
    // their 220px placeholder heights for real ones. Document height is the
    // honest signal that the layout has stopped moving: it grew from 112,140 to
    // 111,977 across the very jump that "landed" on the wrong section.
    const heights = [112_140, 112_140, 111_977, 111_977];
    let reading = 0;
    const env: ScrollEnvironment = {
      residual: () => 0,
      documentHeight: () => heights[Math.min(reading++, heights.length - 1)],
      scrollBy: () => {},
      nextFrame: () => Promise.resolve(),
    };

    const result = await settleScrollTo(env);

    expect(result.converged).toBe(true);
    // It had to keep reading until the height stopped changing.
    expect(result.frames).toBeGreaterThanOrEqual(3);
  });

  it('converges as soon as residual and height are both steady', async () => {
    let readings = 0;
    const env: ScrollEnvironment = {
      residual: () => 0,
      documentHeight: () => {
        readings++;
        return 100_000;
      },
      scrollBy: () => {},
      nextFrame: () => Promise.resolve(),
    };

    const result = await settleScrollTo(env);

    expect(result.converged).toBe(true);
    // Three readings: the first has no previous height to compare against, so
    // it cannot confirm anything on its own.
    expect(readings).toBe(3);
  });

  it('does not scroll when the target is already under the header', async () => {
    let scrolls = 0;
    const env: ScrollEnvironment = {
      residual: () => 0,
      scrollBy: () => {
        scrolls++;
      },
      nextFrame: () => Promise.resolve(),
    };

    const result = await settleScrollTo(env);

    expect(scrolls).toBe(0);
    // One extra reading to confirm, because "arrived" is not always true.
    expect(result).toEqual({ frames: 1, residual: 0, converged: true });
  });

  it('does not trust the first settled reading after a correction', async () => {
    // This is what the browser does. The reading taken immediately after a
    // correction is taken before the cards that correction revealed have taken
    // their real heights, so it can report "arrived" a frame early. Taking that
    // at face value is what left section 36 stranded 1,786px below the fold
    // after a single correction, with the loop reporting success.
    const readings: number[] = [];
    let corrections = 0;
    const env: ScrollEnvironment = {
      residual: () => {
        const value = corrections === 0 ? (readings.length === 0 ? 0 : 5_000) : 0;
        readings.push(value);
        return value;
      },
      scrollBy: () => {
        corrections++;
      },
      nextFrame: () => Promise.resolve(),
    };

    const result = await settleScrollTo(env);

    expect(corrections).toBe(1);
    expect(result.converged).toBe(true);
    expect(result.residual).toBe(0);
  });

  it('accepts a target already within a pixel', async () => {
    let scrolls = 0;
    const env: ScrollEnvironment = {
      residual: () => 0.4,
      scrollBy: () => {
        scrolls++;
      },
      nextFrame: () => Promise.resolve(),
    };

    const result = await settleScrollTo(env);

    expect(scrolls).toBe(0);
    expect(result.converged).toBe(true);
  });

  it('gives up after the frame budget instead of looping forever', async () => {
    const { env, state } = stubborn();

    const result = await settleScrollTo(env, { maxFrames: 6 });

    expect(state.scrolls).toBe(6);
    expect(result.frames).toBe(6);
    expect(result.converged).toBe(false);
    expect(result.residual).toBe(500);
  });

  it('stops scrolling once a newer jump supersedes it', async () => {
    const { env, state } = stubborn();
    const token = { cancelled: false };

    const pending = settleScrollTo(env, { maxFrames: 50, token });
    // A second jump lands while the first loop is between frames.
    await new Promise((resolve) => setTimeout(resolve, 5));
    token.cancelled = true;
    const result = await pending;
    const scrollsAtCancel = state.scrolls;

    await new Promise((resolve) => setTimeout(resolve, 30));

    // A superseded jump must not keep yanking the viewport.
    expect(state.scrolls).toBe(scrollsAtCancel);
    expect(result.converged).toBe(false);
  });
});

describe('createFrameTicker', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves on the next animation frame', async () => {
    let scheduled: (() => void) | null = null;
    const tick = createFrameTicker({
      requestFrame: (cb) => {
        scheduled = cb;
        return 1;
      },
      setTimer: () => 0,
      clearTimer: () => {},
    });

    const pending = tick();
    expect(scheduled).not.toBeNull();
    scheduled!();

    await expect(pending).resolves.toBeUndefined();
  });

  it('still resolves when no animation frame is ever serviced', async () => {
    // A hidden tab, and headless browsers, pause requestAnimationFrame. A jump
    // that waits only for frames applies one correction and then stalls for
    // good, leaving the viewport stranded short of the target.
    vi.useFakeTimers();
    const tick = createFrameTicker({
      requestFrame: () => 1,
      setTimer: (cb, ms) => setTimeout(cb, ms) as unknown as number,
      clearTimer: (handle) => clearTimeout(handle as unknown as ReturnType<typeof setTimeout>),
    });

    const pending = tick();
    let settled = false;
    void pending.then(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(200);

    expect(settled).toBe(true);
  });

  it('ignores a frame that arrives after the timeout already resolved', async () => {
    vi.useFakeTimers();
    let lateFrame: (() => void) | null = null;
    const tick = createFrameTicker({
      requestFrame: (cb) => {
        lateFrame = cb;
        return 1;
      },
      setTimer: (cb, ms) => setTimeout(cb, ms) as unknown as number,
      clearTimer: (handle) => clearTimeout(handle as unknown as ReturnType<typeof setTimeout>),
    });

    const pending = tick();
    await vi.advanceTimersByTimeAsync(200);
    lateFrame!();

    await expect(pending).resolves.toBeUndefined();
  });
});