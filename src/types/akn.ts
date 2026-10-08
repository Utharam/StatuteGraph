/**
 * Type model for the statute reader. Any Act.
 *
 * Two layers exist deliberately:
 *
 *  - `Raw*` types mirror the parsed AKN JSON byte-for-byte, warts and all.
 *  - Normalised types (`Provision`, `Citation`) are what the UI consumes.
 *
 * The most important design rule in this file: a citation's target scope
 * (this Act vs another Act) is decided from the *statutory words*, never from
 * the parser's `target_eid` / `external` fields. The dataset contains 47
 * citations flagged `external: true` whose `target_eid` collides with a real
 * own section — e.g. "section 148 of the Companies Act, 2013" -> `sec_148`.
 * Trusting `target_eid` opens the wrong statute. See `classifyCitationScope`
 * in services/citationScope.ts.
 */

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

/** Kinds that may legitimately head the document (top-level reading units). */
export const TOP_LEVEL_KINDS: ReadonlySet<ProvisionKind> = new Set<ProvisionKind>([
  'chapter',
  'section',
  'schedule',
]);

/** Kinds that are structural children rather than free-standing provisions. */
export const SUBORDINATE_KINDS: ReadonlySet<ProvisionKind> = new Set<ProvisionKind>([
  'subsection',
  'clause',
  'subclause',
  'proviso',
  'explanation',
  'schedule_item',
]);

// ---------------------------------------------------------------------------
// Raw dataset shapes, as produced by the PDF parser.
// ---------------------------------------------------------------------------

export interface RawCitation {
  parent_eid: string;
  raw_text: string;
  /** Character offsets into the parent's RAW `text`. Verified exact for all 555. */
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
  amending_section?: string;
}

export interface RawFootnote {
  number: string;
  raw_text: string;
  associated_eid?: string;
  page_number?: number;
  amendment?: Amendment;
}

export interface RawProvision {
  eid: string;
  kind: ProvisionKind;
  num: string;
  heading?: string | null;
  parent_eid?: string | null;
  text: string;
  page_numbers?: number[];
  citations?: RawCitation[];
  amendments?: Amendment[];
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
      /**
       * Only 2 levels deep and disagrees with `parent_eid` on 157 nodes.
       * Do NOT prefer this over the flat `provisions` array.
       */
      body: unknown[];
    };
  };
  provisions: RawProvision[];
  citations: RawCitation[];
  footnotes: RawFootnote[];
  diagnostics?: unknown[];
}

// ---------------------------------------------------------------------------
// Normalised citation model
// ---------------------------------------------------------------------------

/**
 * Legal force of a reference. These are not stylistic labels: `subject_to`
 * subordinates a provision's operation, `notwithstanding` overrides it.
 */
export type CitationRelation = 'reference' | 'subject_to' | 'notwithstanding' | 'unknown';

/** How precisely an internal target was pinned down. */
export type InternalResolution =
  /** The target_eid exists verbatim in this Act. */
  | 'exact'
  /** Fell back to the parent section (sub-section (1) nodes were never extracted). */
  | 'section-level'
  /** No matching provision exists at all (usually a section the parser dropped). */
  | 'unresolved';

export type CitationTarget =
  | {
      scope: 'internal';
      /** Node id in this Act, or null when nothing matched. */
      targetEid: string | null;
      /** Verbatim statutory words, e.g. "sub-section (1) of section 44". Always shown. */
      citedAs: string;
      resolution: InternalResolution;
      /** Set when we deliberately stepped down to the parent section. */
      degradedFrom: string | null;
    }
  | {
      scope: 'external';
      actName: string;
      actYear: number | null;
      citedAs: string;
      /** e.g. "section 148" */
      provisionRef: string | null;
      summary: string | null;
    }
  | {
      scope: 'unresolved';
      citedAs: string;
      attemptedEid: string | null;
      reason: string;
    };

export interface Citation {
  /** Stable, derived from parentEid + span. */
  id: string;
  parentEid: string;
  rawText: string;
  span: [number, number];
  relation: CitationRelation;
  target: CitationTarget;
  /** Parser opinion, retained for auditing and diagnostics only. Never trusted. */
  parser: {
    targetEid: string;
    external: boolean;
    resolved: boolean;
    targetType?: string;
  };
}

// ---------------------------------------------------------------------------
// Normalised provision model
// ---------------------------------------------------------------------------

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
  /** RAW text. Citation spans index into this exact string. */
  text: string;
  page_numbers?: number[];
  /** Own citations only. Spans are valid against `text`. */
  citations: Citation[];
  /** Own footnotes only. */
  footnotes: Footnote[];
  /** Direct children, in dataset array order (the proven-correct sibling order). */
  children: Provision[];
  /** Index into the original `dataset.provisions` array. Authoritative ordering key. */
  sourceIndex: number;
  /** Own + all descendants' citations. Spans are NOT valid against `text`. */
  subtreeCitations: Citation[];
  /** Own + all descendants' footnotes. */
  subtreeFootnotes: Footnote[];
  /**
   * Characters of `text` across this provision and every descendant.
   *
   * Needed because "no text" and "no content" are different facts: a
   * provision can have empty own-text yet hold content in its children, and
   * reporting those as empty misleads the reader.
   */
  subtreeTextLength: number;
  /** Nearest ancestor that heads the document, or null if this node is unattributed. */
  topLevelEid: string | null;
  /**
   * True when the parser lost this node's parent section, i.e. it has no
   * parent_eid and is not a chapter, schedule or section. These are not
   * rendered as sections; they are grouped and flagged as orphans instead.
   */
  isUnattributed: boolean;
  /**
   * True when neither this node nor any ancestor heads the document, i.e. the
   * whole branch is detached from the Act's structure.
   *
   * Wider than isUnattributed: it also covers every descendant of an orphan.
   * In the Income-tax Act 2025 export this is 795 provisions holding 153,728
   * characters, against 410 orphan roots.
   */
  isDetached: boolean;
  /** Display title, computed once at load. */
  title: string;
}

// ---------------------------------------------------------------------------
// Resolution output
// ---------------------------------------------------------------------------

export interface ResolvedCitationTarget {
  target: CitationTarget;
  /** Non-null only for `internal` targets that resolved. */
  provision: Provision | null;
  displayTitle: string;
  isExternal: boolean;
  /** Verbatim statutory words the provision was cited by. */
  citedAs: string;
  previewSnippet: string;
  /** Citations authored by `provision` itself. Spans valid against `provision.text`. */
  ownCitations: Citation[];
  /** Citations from `provision` and every descendant. For the nest view. */
  subtreeCitations: Citation[];
  footnotes: Footnote[];
}

// ---------------------------------------------------------------------------
// Citation tree
// ---------------------------------------------------------------------------

export interface CitationTreeNode {
  /** Unique: `${parentPath}-L${level}-${counter}`. */
  id: string;
  /** 1..MAX_CASCADE_LEVEL */
  level: number;
  citation: Citation;
  /** Which descendant provision authored this citation (differs from parentEid of the source citation). */
  originEid: string | null;
  resolvedTarget: ResolvedCitationTarget;
  children: CitationTreeNode[];
  /** Children hidden by the per-node cap, so the UI can say "and N more". */
  hiddenChildCount: number;
  isCycle: boolean;
  cycleTargetLevel?: number;
}

// ---------------------------------------------------------------------------
// Navigation index
// ---------------------------------------------------------------------------

export interface HierarchyNavItem {
  eid: string;
  num: string;
  title: string;
  kind: ProvisionKind;
  /** 0 for a top-level unit, then 1, 2, 3 ... */
  depth: number;
  parentEid: string | null;
  page?: number;
  outgoingCount: number;
  /** How many places in this Act cite this node. */
  incomingCount: number;
  /** How many *other* sections cite this node. */
  incomingFromOtherSectionsCount: number;
  footnoteCount: number;
  children: HierarchyNavItem[];
}

export interface HierarchySectionItem extends HierarchyNavItem {}

export interface HierarchySubsectionItem extends HierarchyNavItem {}

export interface HierarchyClauseItem extends HierarchyNavItem {}

/** A run of parentless provisions grouped for display, keyed by page band. */
export interface UnattributedGroup {
  id: string;
  page: number;
  items: HierarchyNavItem[];
}

/**
 * The reader's structure model.
 *
 * `sections` contains ONLY genuine document-level units. The 237 orphaned
 * provisions the parser lost track of (sections 1-31's sub-sections) are NOT
 * promoted to sections any more; they live in `unattributedGroups`.
 */
export interface HierarchyIndex {
  sections: HierarchySectionItem[];
  /**
   * Every top-level card in reading order, detached provisions included and
   * interleaved by page. Drives the canvas; `sections` drives the index.
   */
  documentOrder: HierarchyNavItem[];
  /** eid -> the top-level unit containing it. Absent for detached provisions. */
  eidToSectionMap: Map<string, HierarchySectionItem>;
  /**
   * eid -> the section to SHOW in the header while reading it.
   *
   * Detached provisions belong to no section, but the Section dropdown must not
   * blank every time the reader passes one. It falls back to the nearest
   * preceding section for display only; the index is left honest.
   */
  eidToDisplaySectionMap: Map<string, HierarchySectionItem>;
  /** eid -> deepest nav item whose depth === 1, else null. */
  eidToSubsectionMap: Map<string, HierarchySubsectionItem>;
  /** eid -> deepest nav item whose depth === 2, else null. */
  eidToClauseMap: Map<string, HierarchyClauseItem>;
  /** eid -> the nav item for that exact eid, at any depth. */
  eidToNavItemMap: Map<string, HierarchyNavItem>;
  /** Path of nav items from the section down to (and including) an eid. */
  pathToEid: Map<string, HierarchyNavItem[]>;
  unattributedGroups: UnattributedGroup[];
  unattributedCount: number;
}

// ---------------------------------------------------------------------------
// UI-only types
// ---------------------------------------------------------------------------

export type ThemeMode = 'parchment' | 'slate' | 'dark';
export type FontSize = 'sm' | 'base' | 'lg' | 'xl';
export type SideViewTab = 'provision' | 'nest' | 'backlinks';

export interface ReaderSettings {
  theme: ThemeMode;
  fontSize: FontSize;
  serifFont: boolean;
  isSideViewPinned: boolean;
  isSideViewOpen: boolean;
  isTocOpen: boolean;
  sideViewTab: SideViewTab;
}