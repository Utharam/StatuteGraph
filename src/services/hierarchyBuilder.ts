import {
  HierarchySectionItem,
  HierarchySubsectionItem,
  HierarchyClauseItem,
  Provision,
} from '../types/akn';
import { IndexedAknData, extractProvisionTitle } from './aknLoader';

export interface HierarchyIndex {
  sections: HierarchySectionItem[];
  sectionMap: Map<string, HierarchySectionItem>;
  eidToSectionMap: Map<string, HierarchySectionItem>;
  eidToSubsectionMap: Map<string, HierarchySubsectionItem>;
  eidToClauseMap: Map<string, HierarchyClauseItem>;
}

export function buildHierarchyIndex(indexData: IndexedAknData): HierarchyIndex {
  const sections: HierarchySectionItem[] = [];
  const sectionMap = new Map<string, HierarchySectionItem>();
  const eidToSectionMap = new Map<string, HierarchySectionItem>();
  const eidToSubsectionMap = new Map<string, HierarchySubsectionItem>();
  const eidToClauseMap = new Map<string, HierarchyClauseItem>();

  // Helper to get citation count for a provision and its descendants
  function countCitations(p: Provision): number {
    let count = (p.citations || indexData.citationsByParent.get(p.eid) || []).length;
    if (p.children) {
      for (const child of p.children) {
        count += countCitations(child);
      }
    }
    return count;
  }

  function countFootnotes(p: Provision): number {
    let count = (indexData.footnotesByEid.get(p.eid) || []).length;
    if (p.children) {
      for (const child of p.children) {
        count += countFootnotes(child);
      }
    }
    return count;
  }

  // Iterate over root provisions
  for (const root of indexData.rootProvisions) {
    const sectionTitle = extractProvisionTitle(root);
    const subsections: HierarchySubsectionItem[] = [];

    const sectionItem: HierarchySectionItem = {
      eid: root.eid,
      num: root.num || '',
      title: sectionTitle,
      kind: root.kind,
      page: root.page_numbers?.[0],
      citationCount: countCitations(root),
      footnoteCount: countFootnotes(root),
      subsections,
    };

    sections.push(sectionItem);
    sectionMap.set(root.eid, sectionItem);
    eidToSectionMap.set(root.eid, sectionItem);

    // Process children (subsections)
    const directChildren = root.children || [];
    for (const child of directChildren) {
      const subsecTitle = extractProvisionTitle(child);
      const clauses: HierarchyClauseItem[] = [];

      const subsecItem: HierarchySubsectionItem = {
        eid: child.eid,
        num: child.num || '',
        title: subsecTitle,
        kind: child.kind,
        parentEid: root.eid,
        clauses,
      };

      subsections.push(subsecItem);
      eidToSectionMap.set(child.eid, sectionItem);
      eidToSubsectionMap.set(child.eid, subsecItem);

      // Process grandchildren (clauses, provisos, subclauses)
      const grandChildren = child.children || [];
      for (const grand of grandChildren) {
        const clauseTitle = extractProvisionTitle(grand);

        const clauseItem: HierarchyClauseItem = {
          eid: grand.eid,
          num: grand.num || '',
          title: clauseTitle,
          kind: grand.kind,
          parentEid: child.eid,
        };

        clauses.push(clauseItem);
        eidToSectionMap.set(grand.eid, sectionItem);
        eidToSubsectionMap.set(grand.eid, subsecItem);
        eidToClauseMap.set(grand.eid, clauseItem);

        // Sub-clauses if any
        if (grand.children) {
          for (const greatGrand of grand.children) {
            eidToSectionMap.set(greatGrand.eid, sectionItem);
            eidToSubsectionMap.set(greatGrand.eid, subsecItem);
            eidToClauseMap.set(greatGrand.eid, clauseItem);
          }
        }
      }
    }
  }

  return {
    sections,
    sectionMap,
    eidToSectionMap,
    eidToSubsectionMap,
    eidToClauseMap,
  };
}
