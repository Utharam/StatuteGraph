export type ProvisionKind =
  | 'chapter'
  | 'section'
  | 'subsection'
  | 'clause'
  | 'subclause'
  | 'proviso'
  | 'explanation'
  | 'schedule'
  | 'schedule_item';

export interface Citation {
  parent_eid: string;
  raw_text: string;
  span: [number, number];
  target_eid: string;
  relation: string;
  resolved: boolean;
  external: boolean;
  target_type?: string;
}

export interface Amendment {
  footnote_number: string;
  action: string;
  amending_act: string;
  raw_text: string;
}

export interface Footnote {
  number: string;
  raw_text: string;
  associated_eid?: string;
  page_number?: number;
  amendment?: Amendment;
}

export interface Provision {
  eid: string;
  kind: ProvisionKind;
  num: string;
  heading?: string | null;
  parent_eid?: string | null;
  text: string;
  page_numbers?: number[];
  citations?: Citation[];
  children?: Provision[];
}

export interface AknActMeta {
  title: string;
  act_year: string;
}

export interface AknDataset {
  schema_version: string;
  akomaNtoso: {
    act: {
      meta: AknActMeta;
      body: Provision[];
    };
  };
  provisions: Provision[];
  citations: Citation[];
  footnotes: Footnote[];
  diagnostics?: unknown[];
}

export interface ResolvedCitationTarget {
  targetEid: string;
  provision?: Provision;
  displayTitle: string;
  isExternal: boolean;
  externalActName?: string;
  previewSnippet: string;
  citations: Citation[];
  footnotes: Footnote[];
}

export interface CitationTreeNode {
  id: string; // unique node id: `${path}-${targetEid}`
  level: number; // 1 to 6
  citation: Citation;
  resolvedTarget: ResolvedCitationTarget;
  children: CitationTreeNode[];
  isCycle: boolean;
  cycleTargetLevel?: number;
}

export type ThemeMode = 'parchment' | 'slate' | 'dark';
export type FontSize = 'sm' | 'base' | 'lg' | 'xl';

export interface ReaderSettings {
  theme: ThemeMode;
  fontSize: FontSize;
  serifFont: boolean;
  isSideViewPinned: boolean;
  isSideViewOpen: boolean;
  isTocOpen: boolean;
  sideViewTab: 'provision' | 'nest';
}

export interface HierarchySectionItem {
  eid: string;
  num: string;
  title: string;
  kind: ProvisionKind;
  page?: number;
  citationCount: number;
  footnoteCount: number;
  subsections: HierarchySubsectionItem[];
}

export interface HierarchySubsectionItem {
  eid: string;
  num: string;
  title: string;
  kind: ProvisionKind;
  parentEid: string;
  clauses: HierarchyClauseItem[];
}

export interface HierarchyClauseItem {
  eid: string;
  num: string;
  title: string;
  kind: ProvisionKind;
  parentEid: string;
}
