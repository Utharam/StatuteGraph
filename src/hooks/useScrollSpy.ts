import { useState, useEffect, useCallback, useRef } from 'react';
import { HierarchyIndex } from '../services/hierarchyBuilder';
import {
  HierarchySectionItem,
  HierarchySubsectionItem,
  HierarchyClauseItem,
} from '../types/akn';

export interface ActiveLocation {
  activeSection: HierarchySectionItem | null;
  activeSubsection: HierarchySubsectionItem | null;
  activeClause: HierarchyClauseItem | null;
  activeEid: string | null;
}

export function useScrollSpy(hierarchyIndex: HierarchyIndex | null) {
  const [activeLocation, setActiveLocation] = useState<ActiveLocation>({
    activeSection: null,
    activeSubsection: null,
    activeClause: null,
    activeEid: null,
  });

  const isManualScrolling = useRef<boolean>(false);
  const scrollTimeout = useRef<number | null>(null);

  const scrollToProvision = useCallback((eid: string) => {
    isManualScrolling.current = true;
    if (scrollTimeout.current) {
      window.clearTimeout(scrollTimeout.current);
    }

    const element = document.getElementById(`prov-${eid}`);
    if (element) {
      const headerOffset = 90;
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth',
      });

      // Highlight target temporarily
      element.classList.remove('target-highlight');
      // Trigger reflow
      void element.offsetWidth;
      element.classList.add('target-highlight');

      // Update location immediately on user click
      if (hierarchyIndex) {
        const sec = hierarchyIndex.eidToSectionMap.get(eid) || null;
        const subsec = hierarchyIndex.eidToSubsectionMap.get(eid) || null;
        const clause = hierarchyIndex.eidToClauseMap.get(eid) || null;
        setActiveLocation({
          activeSection: sec,
          activeSubsection: subsec,
          activeClause: clause,
          activeEid: eid,
        });
      }
    }

    scrollTimeout.current = window.setTimeout(() => {
      isManualScrolling.current = false;
    }, 800);
  }, [hierarchyIndex]);

  useEffect(() => {
    if (!hierarchyIndex || hierarchyIndex.sections.length === 0) return;

    let ticking = false;

    const handleScroll = () => {
      if (isManualScrolling.current) return;

      if (!ticking) {
        window.requestAnimationFrame(() => {
          const viewportCheckY = 140;
          let bestMatch: Element | null = null;

          // Check if user is scrolled near bottom of page
          const isNearBottom =
            window.innerHeight + window.scrollY >=
            document.documentElement.scrollHeight - 60;

          const articles = document.querySelectorAll('article[data-provision-eid]');

          if (isNearBottom && articles.length > 0) {
            const lastArticle = articles[articles.length - 1];
            const children = lastArticle.querySelectorAll('[data-provision-eid]');
            bestMatch = children.length > 0 ? children[children.length - 1] : lastArticle;
          } else {
            // Find the active article intersecting or above the check line
            let activeArticle: Element | null = null;
            for (let i = 0; i < articles.length; i++) {
              const el = articles[i];
              const rect = el.getBoundingClientRect();

              if (rect.top <= viewportCheckY) {
                activeArticle = el;
              } else if (rect.top > viewportCheckY + 300) {
                break;
              }
            }

            if (!activeArticle && articles.length > 0) {
              activeArticle = articles[0];
            }

            if (activeArticle) {
              bestMatch = activeArticle;
              // Search child subsections and clauses inside this article
              const children = activeArticle.querySelectorAll('[data-provision-eid]');
              for (let j = 0; j < children.length; j++) {
                const child = children[j];
                const childRect = child.getBoundingClientRect();
                if (childRect.top <= viewportCheckY && childRect.bottom >= 40) {
                  bestMatch = child;
                }
              }
            }
          }

          if (bestMatch) {
            const eid = bestMatch.getAttribute('data-provision-eid');
            if (eid) {
              const sec = hierarchyIndex.eidToSectionMap.get(eid) || null;
              const subsec = hierarchyIndex.eidToSubsectionMap.get(eid) || null;
              const clause = hierarchyIndex.eidToClauseMap.get(eid) || null;

              setActiveLocation(prev => {
                if (prev.activeEid === eid) return prev;
                return {
                  activeSection: sec,
                  activeSubsection: subsec,
                  activeClause: clause,
                  activeEid: eid,
                };
              });
            }
          }

          ticking = false;
        });

        ticking = true;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    // Initial check
    handleScroll();

    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (scrollTimeout.current) {
        window.clearTimeout(scrollTimeout.current);
      }
    };
  }, [hierarchyIndex]);

  return {
    ...activeLocation,
    scrollToProvision,
  };
}
