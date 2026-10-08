import { useCallback, useEffect, useRef, useState } from 'react';
import { HierarchyIndex, HierarchyNavItem } from '../types/akn';

/** Height of the sticky header, in px. Must match `top-16` (64px) plus slack. */
const HEADER_OFFSET = 88;

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

      suppressSpy.current = true;
      if (suppressTimer.current) window.clearTimeout(suppressTimer.current);

      const top = element.getBoundingClientRect().top + window.pageYOffset - HEADER_OFFSET;
      window.scrollTo({ top, behavior: 'smooth' });

      // Restart the flash animation even if the class is still attached.
      element.classList.remove('target-highlight');
      void element.offsetWidth;
      element.classList.add('target-highlight');

      setActive(eid);

      suppressTimer.current = window.setTimeout(() => {
        suppressSpy.current = false;
      }, 700);
    },
    [setActive]
  );

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