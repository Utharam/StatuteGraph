import { useCallback, useEffect, useRef, useState } from 'react';
import { HierarchyIndex, HierarchyNavItem } from '../types/akn';
import { settleScrollTo, createFrameTicker } from '../services/scrollSettle';

/** Height of the sticky header, in px. Must match `top-16` (64px) plus slack. */
const HEADER_OFFSET = 88;

/**
 * Where a jumped-to provision is left resting, in px.
 *
 * Matches the `scroll-mt-24` (6rem) on every provision card, which is what
 * `scrollIntoView` honours. Kept as a number because the settle loop measures
 * against it.
 */
const SCROLL_MARGIN = 96;

export interface ActiveLocation {
  /** The provision currently being read, at any depth. */
  activeItem: HierarchyNavItem | null;
  /** The document-level unit containing it. */
  activeSection: HierarchyNavItem | null;
  activeEid: string | null;
}

/**
 * Tracks which provision the reader is looking at, and scrolls to a provision
 * on demand.
 *
 * The previous implementation ran a `scroll` + `requestAnimationFrame` loop
 * that called `querySelectorAll('article[data-provision-eid]')` and then
 * `getBoundingClientRect()` on every one of the 397 articles, plus every
 * descendant of the active one, on every animation frame — roughly 448 forced
 * synchronous layouts per frame. A single IntersectionObserver with a top-biased
 * root margin reports the same answer without touching layout.
 */
export function useScrollSpy(hierarchyIndex: HierarchyIndex | null) {
  const [activeLocation, setActiveLocation] = useState<ActiveLocation>({
    activeItem: null,
    activeSection: null,
    activeEid: null,
  });

  const suppressSpy = useRef(false);
  const suppressTimer = useRef<number | null>(null);
  // Only the newest jump may keep pulling the viewport.
  const jumpToken = useRef({ cancelled: false });
  const mounted = useRef(true);

  const setActive = useCallback(
    (eid: string) => {
      const item = hierarchyIndex?.eidToNavItemMap.get(eid);
      if (!item) return;
      setActiveLocation((prev) => {
        if (prev.activeEid === eid) return prev;
        return {
          activeItem: item,
          // Display fallback: a detached provision belongs to no section, so
          // the Section dropdown shows the nearest preceding one instead of
          // blanking. Without this it would blank once per orphan, scattered
          // through the Act.
          activeSection:
            hierarchyIndex?.eidToDisplaySectionMap.get(eid) ??
            hierarchyIndex?.eidToSectionMap.get(eid) ??
            null,
          activeEid: eid,
        };
      });
    },
    [hierarchyIndex]
  );

  const scrollToProvision = useCallback(
    (eid: string) => {
      const element = document.getElementById(`prov-${eid}`);
      if (!element) return;

      // Supersede any jump still settling.
      const token = { cancelled: false };
      jumpToken.current.cancelled = true;
      jumpToken.current = token;

      suppressSpy.current = true;
      if (suppressTimer.current) window.clearTimeout(suppressTimer.current);

      // Restart the flash animation even if the class is still attached.
      element.classList.remove('target-highlight');
      void element.offsetWidth;
      element.classList.add('target-highlight');

      setActive(eid);

      // One measurement and one scroll cannot land here. Provision cards are
      // painted with `content-visibility: auto`, so every card above the target
      // that has never been rendered is measured at a 220px placeholder, and the
      // shortfall grows as those cards take their real heights. Measured on the
      // bundled CGST Act, scrolling to section 36 by hand came to rest 11,135px
      // short - about eleven sections.
      //
      // So the jump is measured with every card laid out for real. Lifting
      // containment for the duration costs one layout pass, and makes the
      // measurement exact instead of a guess that has to be chased. The settle
      // loop then cleans up whatever residual is left.
      //
      // `scroll-behavior` is forced to auto for the same duration: `html` sets
      // it to smooth, which would turn every correction into another long
      // animation and the loop would never see a settled position.
      const root = document.documentElement;
      const canvas = document.getElementById('statute-continuous-canvas');
      const previousScrollBehavior = root.style.scrollBehavior;

      root.style.scrollBehavior = 'auto';
      canvas?.classList.add('measure-exact');
      // Force the layout the class just unlocked, so the measurement below
      // reflects real heights rather than the placeholders.
      void document.body.offsetHeight;

      element.scrollIntoView({ block: 'start', behavior: 'auto' });

      canvas?.classList.remove('measure-exact');

      void settleScrollTo({
        residual: () => element.getBoundingClientRect().top - SCROLL_MARGIN,
        scrollBy: (deltaY) => window.scrollBy(0, deltaY),
        documentHeight: () => root.scrollHeight,
        // Raced against a timer: `requestAnimationFrame` is paused in a hidden
        // tab, and a loop that waits only for frames applies one correction and
        // then stalls, leaving the viewport short and the observer suppressed.
        nextFrame: createFrameTicker({
          requestFrame: (cb) => requestAnimationFrame(() => cb()),
          setTimer: (cb, ms) => window.setTimeout(cb, ms),
          clearTimer: (handle) => window.clearTimeout(handle as number),
        }),
      }, { token }).then((result) => {
        if (!mounted.current || jumpToken.current !== token) return;

        root.style.scrollBehavior = previousScrollBehavior;

        // Landed short: say where we actually ended up rather than leaving the
        // reader to wonder why the section they chose is not on screen.
        if (!result.converged) {
          console.warn(
            `[useScrollSpy] ${eid} could not be brought under the header: ` +
              `${result.residual}px short after ${result.frames} corrections.`
          );
        }

        suppressSpy.current = false;
      });
    },
    [setActive]
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      jumpToken.current.cancelled = true;
      if (suppressTimer.current) window.clearTimeout(suppressTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!hierarchyIndex || hierarchyIndex.sections.length === 0) return;
    if (typeof IntersectionObserver === 'undefined') return;

    // Every navigable element carries `data-provision-eid`, so one observer
    // covers all four tiers.
    const observer = new IntersectionObserver(
      (entries) => {
        if (suppressSpy.current) return;

        // Choose the entry whose top is closest to the header but still above it.
        let best: IntersectionObserverEntry | null = null;
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          if (entry.boundingClientRect.top > HEADER_OFFSET + 40) continue;
          if (!best || entry.boundingClientRect.top < best.boundingClientRect.top) {
            best = entry;
          }
        }

        if (!best) return;
        const eid = (best.target as HTMLElement).dataset.provisionEid;
        if (eid) setActive(eid);
      },
      // A shallow band just under the header: only provisions crossing it are
      // reported, so the callback stays cheap regardless of corpus size.
      { rootMargin: `-${HEADER_OFFSET}px 0px -70% 0px`, threshold: 0 }
    );

    const nodes = document.querySelectorAll<HTMLElement>('[data-provision-eid]');
    nodes.forEach((node) => observer.observe(node));

    return () => {
      observer.disconnect();
      if (suppressTimer.current) window.clearTimeout(suppressTimer.current);
    };
  }, [hierarchyIndex, setActive]);

  return { ...activeLocation, scrollToProvision };
}