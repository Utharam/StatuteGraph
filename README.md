# AKN Legal Reader & Citation Cascade (v1.0.0)

> A modern, high-performance legal reading web application for Akoma Ntoso (AKN) statutory legislation, featuring continuous reading, frictionless side-view citation peeking, recursive citation cascades up to 6 levels with cycle detection, and dynamic 3-tier index scroll synchronization. Built with React 18, TypeScript, Vite, and Tailwind CSS.

---

## 🌟 Key Features

### 1. Aspiring Continuous Legal Reading
- **Statutory Typography**: Specially tailored with elegant serif legal typography (Newsreader, Charter, Merriweather) with proportional line spacing, balanced margins, and legible font size controls (`SM`, `BASE`, `LG`, `XL`).
- **Semantic Legal Elements**:
  - **Marginalia Section Badges**: Left-side statutory section identifiers (`§ 37`, `Sch I`).
  - **Provisos**: Styled with legal amber left-accent borders, "Provided that" header tags, and distinct blockquote styling.
  - **Explanations**: Dedicated teal banners and distinct typographic framing.
  - **Amendment Footnotes**: Interactive markers (`[1]`, `[2]`, etc.) with popovers detailing the amending act, action (`Substituted`, `Omitted`, `Inserted`), and official enforcement date.
- **Three Reading Themes**:
  - **Parchment**: Warm sepia and ivory palette (`#FAF7EE` / `#2A2315`) mirroring physical legal codices.
  - **Slate**: Clean neutral white and slate palette (`#F8FAFC` / `#0F172A`) for high-contrast clarity.
  - **Obsidian Dark**: Low-fatigue dark palette (`#090D16` / `#F1F5F9`) designed for night reading.

### 2. Frictionless Side View (Peeking Drawer)
- **Zero Scroll Position Loss**: Clicking any in-text citation instantly opens the referenced section in a side panel without shifting or losing your current reading scroll location.
- **Side-by-Side Pinning**: Pin the side view open on wider displays to compare sections side by side.
- **Breadcrumb History**: Internal navigation trail with Back (`←`) and Forward (`→`) buttons to trace statutory lineage without losing your reading context.
- **Direct Jump**: One-click "Jump to Section in Main Canvas" smoothly scrolls the main reading canvas to that provision with an anchor flash animation.

### 3. Recursive Citation Cascade (Nest View up to 6 Levels)
- **Multi-Level Auto-Fetching**: Explores statutory dependencies from Level 1 direct citations through Levels 2, 3, 4, 5, up to Level 6 deep authority cross-references.
- **Cycle Detection**: Automatically halts recursion when provision cycles are encountered (e.g., Provision A cites Provision B and B cites A), displaying an alert badge: `[Cycle Detected: Target at Level X]` with zero crashes.
- **Chromatic Level Badging**:
  - `Level 1`: Royal Indigo (`bg-indigo-100 text-indigo-800`) - Direct reference
  - `Level 2`: Bright Cyan (`bg-cyan-100 text-cyan-800`) - Secondary cascade
  - `Level 3`: Emerald Green (`bg-emerald-100 text-emerald-800`) - Tertiary cross-reference
  - `Level 4`: Warm Amber (`bg-amber-100 text-amber-800`) - Quaternary dependency
  - `Level 5`: Crimson Rose (`bg-rose-100 text-rose-800`) - Quinary sub-chain
  - `Level 6`: Regal Violet (`bg-purple-100 text-purple-800`) - Deepest authority
- **Metrics Dashboard**: Displays total nodes, max depth reached, cycle halts, and external statute references.

### 4. Index-Based Browsing & Dynamic Scroll Synchronization
- **3-Tier Synchronized Top-Bar Dropdown**:
  - `Section` > `Sub-section` > `Clause`
  - Real-time `useScrollSpy` hook dynamically updates the active tier dropdowns as you scroll through the statutory provisions.
  - Selecting any dropdown tier smoothly jumps directly to that provision.
- **Collapsible Table of Contents (TOC)**:
  - Instant filter search across section titles and numbers.
  - Collapsible tree revealing subsections and clauses.
  - Real-time active provision indicator matching document position.
  - Quick badges showing outgoing citation counts and amendment notes.

### 5. Instant Global Quick Search (Ctrl + K)
- Full-text search across 1,692 provisions, 555 cross-citations, and 113 amendment footnotes.
- Instant keyboard navigation (Arrow Up/Down, Enter to jump, Esc to close).

---

## 🏛️ Dataset Details

- **Act Title**: The Central Goods and Services Tax Act, 2017 (Act No. 12 of 2017)
- **Source**: Updated up to 30th September, 2020 (Akoma Ntoso JSON format)
- **Provisions**: 1,692 statutory sections, subsections, clauses, sub-clauses, provisos, and explanations.
- **Citations**: 555 statutory cross-references (both internal CGST sections and external acts such as the Transfer of Property Act, Information Technology Act, Chartered Accountants Act).
- **Footnotes**: 113 statutory amendment notes.

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18 or higher)
- npm (v9 or higher)

### Installation
```bash
# Clone or navigate to the repository
cd "d:/Projects/AKN reader"

# Install dependencies
npm install
```

### Running Development Server
```bash
npm run dev
```
The application will launch at `http://localhost:3000`.

### Production Build
```bash
npm run build
```
Build output will be bundled into `dist/`.

### Preview Production Build
```bash
npm run preview
```

---

## 🏗️ Project Architecture

```
d:/Projects/AKN reader/
├── public/
│   └── data/
│       └── cgst-act.json            # AKN JSON statutory dataset (2.37 MB)
├── src/
│   ├── types/
│   │   └── akn.ts                   # TypeScript schemas for provisions, citations, footnotes, tree
│   ├── services/
│   │   ├── aknLoader.ts             # Dataset ingestion, normalization, text sanitation, citation resolver
│   │   ├── citationEngine.ts        # 6-level recursive citation cascade & cycle detection
│   │   └── hierarchyBuilder.ts      # 3-tier Section > Sub-section > Clause index constructor
│   ├── hooks/
│   │   ├── useScrollSpy.ts          # Synchronized continuous reading viewport observer
│   │   └── useReaderSettings.ts     # Theme, font-size, layout & persistence management
│   ├── components/
│   │   ├── Header.tsx               # Sticky header with 3-tier dropdowns, theme & typography controls
│   │   ├── ContinuousReader.tsx     # Continuous legal statute layout with marginalia & provisos
│   │   ├── SidebarTOC.tsx           # Hierarchical collapsible Table of Contents with live filter
│   │   ├── SideViewPanel.tsx        # Frictionless peeking drawer with citation history navigation
│   │   ├── StatuteTextRenderer.tsx  # In-text citation pills and amendment popover span slicer
│   │   ├── FootnotePopover.tsx      # Amendment details card (Amending Act, action, date)
│   │   ├── NestedCitationTree.tsx   # 6-level recursive tree visualizer with summary metrics
│   │   ├── CitationNodeCard.tsx     # Chromatic level cards with branch collapse and cycle badges
│   │   └── SearchModal.tsx          # Ctrl+K global quick search
│   ├── App.tsx                      # Root coordinator
│   ├── main.tsx                     # Entry point
│   └── index.css                    # Design tokens, themes, custom scrollbars, typography
├── index.html                       # HTML template with Google Fonts (Newsreader, Inter)
├── package.json                     # v1.0.0 SemVer manifest
├── tailwind.config.js               # Tailwind configuration
├── tsconfig.json                    # TypeScript compiler configuration
└── vite.config.ts                   # Vite bundler configuration
```

---

## 📜 License
Released under the MIT License.
