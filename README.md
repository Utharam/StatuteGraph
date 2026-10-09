# StatuteGraph (v1.1.1)

**Statutory structure reader** — by [Utharam](https://utharam.in/)

An in-browser reader for dense statutes, acts and cross-referenced PDFs. It turns
a parsed statute document into a navigable **graph**: the provision hierarchy on
one axis, every cross-reference resolved in both directions on the other.

Nothing is uploaded. Documents are opened from your disk, indexed in memory, and
stored only in your browser. Closing the tab clears the working set.

```
StatuteGraph  ·  by Utharam  ·  free · no signup · zero cloud uploads
```

---

## Why it exists

Statutes are not flat text. A single 1,700-provision Act contains hundreds of
cross-references, and the references are where the reading difficulty lives: a
reader has to answer "what does this provision actually point at?" on every
mention, and a PDF or a naive text dump cannot.

StatuteGraph answers that question from the statutory words themselves, and it is
willing to tell you when the source document cannot support an answer.

---

## Quick start

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # 156 tests
npm run build    # tsc + vite build
npm run preview
```

Stack: React 18, TypeScript, Vite, Tailwind. No backend, no network calls at
runtime, no accounts, no telemetry.

---

## Using it

### 1. Open a document

The app opens on a library page.

- **Open** — file picker restricted to `.json`.
- **Drop** — drag a JSON file anywhere in the window, on the library or on an
  open document. The reader switches to it immediately.
- **Remembered** — documents you open are kept in IndexedDB, so the library
  survives a refresh. Delete them from the card when you want them gone.

### 2. Read it

- **Continuous canvas** — provisions in page order, with proviso and explanation
  framing and interactive amendment footnotes.
- **Header tiers** — four chained dropdowns (section → sub-section → clause →
  proviso) that follow your scroll position. Each tier only offers children of
  its own kind, so a "Sub-section" list never contains sections.
- **Sidebar index** — collapsible tree to full depth, with a filter that searches
  numbers, titles and every descendant.
- **Search** — Ctrl/Cmd+K full-text search across all provisions.
- **Appearance** — three reading themes (Parchment / Slate / Dark), four font
  sizes, serif toggle.

### 3. Follow references

- **Outgoing** — every in-text reference is a clickable pill that opens the side
  panel without moving your scroll position.
- **Incoming** — the **Cited Elsewhere** tab answers "which provisions refer to
  this one?", grouped by the citing section. Sections carry inbound count badges.
- **Nest view** — a six-level recursive cascade with cycle detection and fan-out
  caps, so a circular reference cannot hang the page.

Reference *semantics* are modelled rather than flattened, because
`subject_to` and `notwithstanding` are opposite legal operations:

| Relation | Rendering |
|---|---|
| `reference` | indigo pill |
| `subject_to` | violet pill — "operates subject to" |
| `notwithstanding` | rose pill — "overrides" |

---

## Accepted format

The reader expects the export produced by **[LexParser](https://lexparser.utharam.in/)**,
the PDF-to-JSON converter built for it: a JSON object with top-level
`provisions`, `citations` and `footnotes` arrays, where each provision carries at
least `eid`, `kind`, `num` and `text`.

Have a PDF and no JSON? Convert it with LexParser first, then drop the result
onto the library or the reading canvas.

```jsonc
{
  "provisions": [
    {
      "eid": "sec_44",              // unique; also the anchor id
      "kind": "section",            // chapter | section | schedule | subsection | ...
      "num": "44",
      "title": "Apprenticeship registration",
      "text": "...",
      "parent_eid": null,           // this is the hierarchy source of truth
      "citations": [
        { "text": "section 13", "start": 88, "end": 99, "target_eid": "sec_13",
          "relation": "reference" }
      ],
      "footnotes": [],
      "amendments": []
    }
  ]
}
```

Hierarchy comes from `parent_eid`. Generic Akoma Ntoso XML/JSON is deliberately
**not** accepted: guessing at an unknown schema produces a reader that silently
shows the wrong thing, which is worse than a clear rejection.

Files are validated before anything is indexed, and failures name the file and
say what is wrong:

| Problem | Message |
|---|---|
| Not JSON | `broken.json is not valid JSON.` + the parser's own error |
| No `provisions` array | `… has no "provisions" array.` |
| Empty `provisions` | `… contains no provisions.` |
| Missing `eid` / `kind` / `num` / `text` | `… is missing the "text" field on its first provision.` |
| Duplicate provision ids | `… contains duplicate provision ids (sec_7).` |
| Citation pointing at a missing provision | `… has 12 citation(s) pointing at provisions that do not exist.` |
| Larger than 128 MB | `… is 200 MB, larger than the 128 MB limit.` |

Nothing enters the library until it validates.

---

## Correctness guarantees

The reader's most important property is that it never claims a reference points
at a provision it does not.

**Reference scope is decided from the statutory words, never from `target_eid`.**
In the bundled dataset, many references flagged `external: true` carry a
`target_eid` that collides with a real section of this Act:

| Cited as | Parser's `target_eid` | What this reader shows |
|---|---|---|
| "section 148 of the Companies Act, 2013" | `sec_148` | The Companies Act, 2013 |
| "section 6 of the Registration Act, 1908" | `sec_6` | The Registration Act, 1908 |
| "section 136 of the Finance Act, 2001" | `sec_136` | The Finance Act, 2001 |

Trusting `target_eid` opened the wrong statute. Conversely, references to "the
said Act" that the parser flagged external are correctly treated as internal.

Other enforced invariants, all covered by `src/tests/dataset.test.ts`:

- Every citation span indexes its own parent's raw text **exactly**. Text is
  sliced raw and cleaned per segment, because cleaning first would shift every
  offset.
- A provision is only ever given its **own** citations when rendering its text.
  Passing a descendant's citations against a parent's text is what previously
  scattered citation pills over unrelated prose.
- Top-level index entries are only genuine `section` / `schedule` / `chapter`
  nodes. Provisions whose parent section the parser lost are never presented as
  sections.
- When a citation names a sub-provision the parser never extracted, the reader
  steps down to the parent section **and says so**, rather than silently opening
  the wrong node.
- Citation trees halt on cycles, cap fan-out, and report what they trimmed.

---

## Honest about the data

Real parser output is imperfect, and the reader says so rather than papering
over it. Open **Data quality** in the bottom-left for live figures.

| Situation | How it is handled |
|---|---|
| Provision has no `parent_eid` | Shown in page order with an `UNPLACED` badge and a collapsed "Not attached to a section" disclosure. Excluded from the index, because guessing a parent would be a fabrication. |
| Provision has empty own-text but non-empty descendants | Reported by the subtree character count, not as empty. "No text" and "no content" are different facts. |
| Sub-provision not extracted by the parser | Citation degrades to the parent section with a visible notice. |
| Citation target does not exist | Dashed pill, marked as unresolved. |
| Footnote with no `associated_eid` | Re-homed from the provision's inline `amendments`, else reachable from its in-text marker. |

Detached provisions are interleaved into the reading stream by page position
rather than dumped at the end, so page order still matches the source.

---

## Privacy

| | |
|---|---|
| Cloud transmit | **0 bytes** — documents never leave the browser |
| Storage | IndexedDB, this browser only |
| Accounts / signup | none |
| Trackers / analytics / ads | none |
| Offline | works after first load; no network needed to read |

---

## Architecture

```
src/branding.ts                    Product name, author credit and the LexParser
                                   link. Single source of truth; a rename is one
                                   edit.

src/types/akn.ts                   Raw* shapes vs. normalised model.
                                   Citation.target is a discriminated union on
                                   scope (internal / external / unresolved).

src/services/
  documentStore.ts                 IndexedDB persistence for opened documents.
  documentLibrary.ts               Catalogue, validation, metadata derivation,
                                   opening. Built-ins live in BUILTIN_DOCUMENTS.
  citationScope.ts                 Decides internal vs. external from the
                                   statutory words.
  aknLoader.ts                     Normalise, build the tree, build the citation
                                   graph BOTH ways, split detached provisions
                                   from real sections, produce a quality report.
  hierarchyBuilder.ts              Nav tree; tiers by kind; backlink counts.
  citationEngine.ts                6-level cascade, cycle detection, fan-out
                                   caps, text slicing, relation styling.

src/hooks/
  useDocumentLibrary.ts            Library state; add/remove; storage probing.
  useScrollSpy.ts                  One IntersectionObserver. A previous rAF loop
                                   forced hundreds of synchronous layouts per frame.
  useReaderSettings.ts             Theme, font, layout; validates localStorage.

src/components/
  HomePage.tsx                     Document library: open, recents, drop zone.
  GlobalDropZone.tsx               Window-level drop target with a drag counter.
  Header.tsx                       Home, document identity, tier picker,
                                   typography and theme controls.
  NavigationPicker.tsx             Kind-aware tiered index dropdowns.
  SidebarTOC.tsx                   Full-depth collapsible index with badges.
  ContinuousReader.tsx             Reading canvas, marginalia, provisos.
  SideViewPanel.tsx                Provision Text / Cited Elsewhere / Nest.
  StatuteTextRenderer.tsx          Citation pills and amendment footnotes.
  CitationNodeCard.tsx             Chromatic level cards with cycle badges.
  NestedCitationTree.tsx           6-level cascade with metrics.
  FootnotePopover.tsx              Amendment details.
  SearchModal.tsx                  Ctrl+K full-text search.

src/tests/                         156 tests, mostly against the real JSON
```

### Performance notes

The 8,699-provision Income-tax Act is the stress case. What keeps it workable:

- `React.memo` on the reader canvas and side panel, with stable callbacks, so
  theme and font changes do not re-render 8,699 provision cards.
- The bulk raw `provisions` / `citations` arrays are released after indexing;
  only the normalised index is retained.
- `content-visibility: auto` with `contain-intrinsic-size` on provision cards, so
  off-screen cards cost layout only as they approach the viewport.

---

### Notes for future work

- **Do not "fix" the loader to prefer `akomaNtoso.act.body`.** That tree is
  incomplete and disagrees with `parent_eid`; adopting it silently deletes edges.
- The loader is document-agnostic. Nothing in `src/` may branch on a particular
  Act — the title in the header comes from the document's own metadata.
- `EXTERNAL_ACTS` in `citationScope.ts` is optional description data only. Scope
  is decided purely by pattern, so an unfamiliar Act is still correctly reported
  as another statute. Never let it decide scope.
- Citation identity is `parentEid#start-end`. Two genuine references in one
  provision cannot share a span, so this is a safe dedupe key — but any synthetic
  fixture must respect it.
- To ship another statute as a built-in, add its JSON to `public/data/` and one
  entry to `BUILTIN_DOCUMENTS`.
- `fix-loader.cjs` and `fix-soft-hyphens.cjs` in the repo root are inert
  one-shot scripts that rewrote the loader in place. Prefer deleting them over
  running them.

---

## Related Utharam tools

- [LexParser](https://lexparser.utharam.in/) — the PDF-to-JSON converter that
  produces the documents this reader opens
- [LexHop Reader](https://lexhop.utharam.in/) — jump to any word while reading,
  with KWIC concordance and a clause comparison tray
- [GST Interactive](https://gstinteractive.netlify.app/) — statutory simulator
  and study notes
- [All tools](https://utharam.in/) — every free, offline-first utility

## Licence

Open source. See the repository for details.