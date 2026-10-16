/**
 * Landing a jump on the provision you actually clicked.
 *
 * Measuring where a provision sits and scrolling to that number once is not
 * enough in this reader. Provision cards are painted with
 * `content-visibility: auto` and `contain-intrinsic-size: auto 220px`, so every
 * card that has not been rendered yet occupies a 220px placeholder instead of
 * its real height. A target far down the Act is therefore measured against a
 * document that is mostly placeholders, and the measurement is short by
 * thousands of pixels.
 *
 * Worse, the shortfall is not a constant: as the browser scrolls it renders the
 * intervening cards, they take their real heights, and the target slides
 * further down while the scroll is already committed to the old number. In the
 * bundled CGST Act, clicking section 36 from the top stopped 11,135px short of
 * it, which is about eleven sections.
 *
 * So the scroll is corrected against a fresh measurement until the target is
 * genuinely under the header. Rendering is monotonic - a card that has been
 * revealed keeps its size - so the residual converges rather than oscillating.
 */

export interface ScrollEnvironment {
  /**
   * Signed distance in px from the target's top edge to where it should rest.
   * Positive means the target is below the desired resting place.
   */
  residual: () => number;
  /** Moves the viewport. Must be instant, never animated. */
  scrollBy: (deltaY: number) => void;
  /** Yields a frame, so newly visible content can be laid out. */
  nextFrame: () => Promise<void>;
  /**
   * Current scrollable height, when the caller can read it.
   *
   * A residual can read as zero while cards above the target are still trading
   * their 220px placeholder heights for real ones. This is the signal that the
   * layout has stopped moving, and it is what stops the loop trusting a reading
   * that was taken too early.
   */
  documentHeight?: () => number;
}

export interface SettleOptions {
  /** Considered arrived within this many px. */
  tolerance?: number;
  /** Upper bound on measurement rounds, so an unreachable target cannot spin. */
  maxFrames?: number;
  /**
   * Consecutive in-tolerance readings required before declaring arrival.
   *
   * More than one, because the reading taken immediately after a correction is
   * taken before the cards that correction revealed have taken their real
   * heights. That reading can report "arrived" a frame early, and believing it
   * strands the target below the fold with the loop reporting success.
   */
  stableFrames?: number;
  /** Set `cancelled` to abandon the loop, e.g. because a newer jump began. */
  token?: { cancelled: boolean };
}

export interface FrameScheduler {
  requestFrame: (callback: () => void) => unknown;
  setTimer: (callback: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
}

/**
 * Yields to the browser so newly visible content can be laid out, without
 * depending on animation frames actually being serviced.
 *
 * `requestAnimationFrame` is paused in a hidden tab and in headless browsers. A
 * settle loop that waits only for frames applies one correction and then stops
 * for good, which strands the viewport short of the target and leaves the
 * caller's suppression flag set forever. Racing a frame against a short timer
 * keeps the loop making progress either way.
 */
export function createFrameTicker(
  scheduler: FrameScheduler,
  timeoutMs = 60
): () => Promise<void> {
  return () =>
    new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        scheduler.clearTimer(timer);
        resolve();
      };
      const timer = scheduler.setTimer(finish, timeoutMs);
      scheduler.requestFrame(finish);
    });
}

export interface SettleResult {
  /** Corrections applied. */
  frames: number;
  /** Distance still to travel when the loop stopped. */
  residual: number;
  converged: boolean;
}

const DEFAULT_TOLERANCE = 1;
const DEFAULT_MAX_FRAMES = 40;
const DEFAULT_STABLE_FRAMES = 2;

/**
 * Scrolls until the target rests where it was asked to, and stays resting there.
 *
 * Returns rather than throwing on an unreachable target: a jump that only
 * gets most of the way is still useful, and the caller can say so.
 */
export async function settleScrollTo(
  env: ScrollEnvironment,
  options: SettleOptions = {}
): Promise<SettleResult> {
  const tolerance = options.tolerance ?? DEFAULT_TOLERANCE;
  const maxFrames = options.maxFrames ?? DEFAULT_MAX_FRAMES;
  const stableFramesRequired = options.stableFrames ?? DEFAULT_STABLE_FRAMES;
  const token = options.token;

  let frames = 0;
  let stableFrames = 0;
  let lastHeight: number | null = null;

  while (frames < maxFrames) {
    if (token?.cancelled) break;

    const residual = env.residual();
    const height = env.documentHeight ? env.documentHeight() : null;
    // "Arrived" means in place *and* no longer moving. A reading taken while
    // the layout is still settling is not evidence of anything.
    const heightSettled = height === null || height === lastHeight;
    lastHeight = height;

    if (Math.abs(residual) <= tolerance && heightSettled) {
      stableFrames++;
      if (stableFrames >= stableFramesRequired) {
        return { frames, residual, converged: true };
      }
    } else {
      stableFrames = 0;
      if (Math.abs(residual) > tolerance) env.scrollBy(residual);
    }

    frames++;

    // Yield before re-measuring: the correction is what brings the next batch of
    // cards into view, and their real heights are what the next residual needs.
    await env.nextFrame();
  }

  const residual = env.residual();
  return {
    frames,
    residual,
    converged: !token?.cancelled && Math.abs(residual) <= tolerance,
  };
}