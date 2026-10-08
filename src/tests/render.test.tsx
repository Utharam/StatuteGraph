/**
 * Render smoke tests.
 *
 * Typechecking cannot catch a crash during render, and almost every component
 * was rewritten against a new data shape. These render the real components with
 * the real 1,692-provision dataset and assert they produce markup.
 *
 * Server rendering (`renderToStaticMarkup`) is used deliberately: no DOM is
 * needed, and effects such as the IntersectionObserver never run.
 */

import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import raw from '../../public/data/cgst-act.json';
import { AknDataset, Citation, SideViewTab } from '../types/akn';
import { buildIndex } from '../services/aknLoader';
import { buildHierarchyIndex } from '../services/hierarchyBuilder';
import { ContinuousReader } from '../components/ContinuousReader';
import { SidebarTOC } from '../components/SidebarTOC';
import { NavigationPicker } from '../components/NavigationPicker';
import { SideViewPanel } from '../components/SideViewPanel';
import { StatuteTextRenderer } from '../components/StatuteTextRenderer';
import { Header } from '../components/Header';

const index = buildIndex(raw as unknown as AknDataset);
const hierarchy = buildHierarchyIndex(index);

const section = index.provisionsByEid.get('sec_44')!;
const internalCitation = index.citations.find(
  (c) => c.target.scope === 'internal' && c.target.targetEid
)!;
const externalCitation = index.citations.find((c) => c.target.scope === 'external')!;

import { StatuteDocument } from '../services/documentLibrary';
import { BUILTIN_DOCUMENTS } from '../services/documentLibrary';
import { HomePage } from '../components/HomePage';
import {
  PRODUCT_NAME,
  PRODUCT_TAGLINE,
  AUTHOR_NAME,
  AUTHOR_URL,
  PARSER_NAME,
  PARSER_URL,
} from '../branding';

const noop = () => {};

/** Stands in for the library entry that opened this document. */
const TEST_DOCUMENT: StatuteDocument = {
  id: 'test:doc',
  title: 'The Central Goods and Services Tax Act, 2017',
  shortTitle: 'CGST Act, 2017',
  subtitle: 'Act No. 12 of 2017',
  source: 'India Code',
  origin: 'builtin',
};

describe('ContinuousReader', () => {
  it('renders the statute in reading order without crashing', () => {
    const html = renderToStaticMarkup(
      React.createElement(ContinuousReader, {
        indexData: index,
        document: TEST_DOCUMENT,
        onCitationClick: noop,
        onShowBacklinks: noop,
        fontSize: 'base',
        serifFont: true,
      })
    );

    expect(html).toContain('statute-continuous-canvas');
    expect(html).toContain('Central Goods and Services Tax Act');
    // Section 44 is rendered with its marginal note.
    expect(html).toContain('Annual return');
  });

it('interleaves the unattributed provisions instead of appending them', () => {
    const html = renderToStaticMarkup(
      React.createElement(ContinuousReader, {
        indexData: index,
        document: TEST_DOCUMENT,
        onCitationClick: noop,
        onShowBacklinks: noop,
        fontSize: 'base',
        serifFont: true,
      })
    );

    expect(index.unattributed.length).toBeGreaterThan(200);
    expect(html).toContain('could not be attached to a section');
    // A single collapsed disclosure, not a paragraph of prose per card.
    expect(html).toContain('Not attached to a section');
    expect(html).not.toContain('Possible parsing error');
    expect(html).not.toContain('Orphaned provision');
    // They must no longer sit in a trailing "Unattributed text" block.
    expect(html).not.toContain('unattributed provisions (pages');
  });

  it('gives an unattributed provision no section number', () => {
    const html = renderToStaticMarkup(
      React.createElement(ContinuousReader, {
        indexData: index,
        document: TEST_DOCUMENT,
        onCitationClick: noop,
        onShowBacklinks: noop,
        fontSize: 'base',
        serifFont: true,
      })
    );

    // "UNPLACED" replaces the SEC/SCH badge, so nothing reads as a section.
    expect(html).toContain('UNPLACED');
    expect(html).not.toMatch(/>\s*SEC\s*<\//);
  });

  it('flags the suspect sections', () => {
    const html = renderToStaticMarkup(
      React.createElement(ContinuousReader, {
        indexData: index,
        document: TEST_DOCUMENT,
        onCitationClick: noop,
        onShowBacklinks: noop,
        fontSize: 'base',
        serifFont: true,
      })
    );

    expect(index.quality.suspectSectionEids).toContain('sec_6');
    expect(html).toContain('Numbering looks wrong');
  });

it('shows an inbound-citation count for a heavily cited section', () => {
    const html = renderToStaticMarkup(
      React.createElement(ContinuousReader, {
        indexData: index,
        document: TEST_DOCUMENT,
        onCitationClick: noop,
        onShowBacklinks: noop,
        fontSize: 'base',
        serifFont: true,
      })
    );

    expect(html).toMatch(/Cited in \d+ other/);
  });

  it('shows a subtree character count on every provision', () => {
    const html = renderToStaticMarkup(
      React.createElement(ContinuousReader, {
        indexData: index,
        document: TEST_DOCUMENT,
        onCitationClick: noop,
        onShowBacklinks: noop,
        fontSize: 'base',
        serifFont: true,
      })
    );

    expect(html).toMatch(/\d+ ch/);
    expect(html).toContain('ch</span>');
  });

  it('flags structurally empty provisions', () => {
    const html = renderToStaticMarkup(
      React.createElement(ContinuousReader, {
        indexData: index,
        document: TEST_DOCUMENT,
        onCitationClick: noop,
        onShowBacklinks: noop,
        fontSize: 'base',
        serifFont: true,
      })
    );

    // The phantom schedules carry no text anywhere in their subtrees.
    expect(html).toContain('empty subtree');
    expect(html).toContain('No text anywhere in this subtree');
  });

  it('marks orphaned root provisions with their page', () => {
    const html = renderToStaticMarkup(
      React.createElement(ContinuousReader, {
        indexData: index,
        document: TEST_DOCUMENT,
        onCitationClick: noop,
        onShowBacklinks: noop,
        fontSize: 'base',
        serifFont: true,
      })
    );

    expect(html).toContain('Not attached to a section');
    // Collapsed by default, so the explanation costs one short line rather than
    // a paragraph. It appears only when the reader opens it.
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toMatch(/The parser recorded no parent section/);
  });

  it('no longer claims a provision with descendant text is empty', () => {
    const html = renderToStaticMarkup(
      React.createElement(ContinuousReader, {
        indexData: index,
        document: TEST_DOCUMENT,
        onCitationClick: noop,
        onShowBacklinks: noop,
        fontSize: 'base',
        serifFont: true,
      })
    );

    // The old blanket message is gone.
    expect(html).not.toContain('No text was extracted for this provision');
    expect(html).toMatch(/own text is empty; \d+ descendant/);
  });
});

describe('SidebarTOC', () => {
  it('renders section entries with backlink badges', () => {
    const html = renderToStaticMarkup(
      React.createElement(SidebarTOC, {
        hierarchyIndex: hierarchy,
        activeSectionEid: 'sec_44',
        isOpen: true,
        onClose: noop,
        onSelectProvision: noop,
        onShowBacklinks: noop,
      })
    );

    expect(html).toContain('Table of Contents');
    expect(html).toContain('Unattributed text');
    expect(index.quality.sectionCount).toBe(150);
  });

  it('renders nothing when closed', () => {
    const html = renderToStaticMarkup(
      React.createElement(SidebarTOC, {
        hierarchyIndex: hierarchy,
        activeSectionEid: null,
        isOpen: false,
        onClose: noop,
        onSelectProvision: noop,
        onShowBacklinks: noop,
      })
    );

    expect(html).toBe('');
  });
});

describe('NavigationPicker', () => {
  it('renders the tier dropdowns', () => {
    const html = renderToStaticMarkup(
      React.createElement(NavigationPicker, {
        hierarchyIndex: hierarchy,
        activeItem: hierarchy.eidToNavItemMap.get('sec_44') ?? null,
        onSelectProvision: noop,
      })
    );

    expect(html).toContain('Provision Navigation Hierarchy');
    expect(html).toContain('Section 44');
  });

  it('renders without an index', () => {
    const html = renderToStaticMarkup(
      React.createElement(NavigationPicker, {
        hierarchyIndex: null,
        activeItem: null,
        onSelectProvision: noop,
      })
    );

    expect(html).toContain('Provision Navigation Hierarchy');
  });
});

describe('StatuteTextRenderer', () => {
  it('renders text with citation pills', () => {
    const html = renderToStaticMarkup(
      React.createElement(StatuteTextRenderer, {
        text: section.text,
        citations: section.citations,
        footnotesByNumber: index.footnotesByNumber,
        onCitationClick: noop,
      })
    );

    expect(html).toContain('statute-text');
    expect(html.length).toBeGreaterThan(0);
  });

  it('renders nothing for empty text', () => {
    const html = renderToStaticMarkup(
      React.createElement(StatuteTextRenderer, {
        text: '',
        citations: [],
        onCitationClick: noop,
      })
    );

    expect(html).toBe('');
  });
});

describe('SideViewPanel', () => {
  const renderPanel = (citation: Citation, tab: SideViewTab = 'provision') =>
    renderToStaticMarkup(
      React.createElement(SideViewPanel, {
        isOpen: true,
        isPinned: false,
        activeCitation: citation,
        indexData: index,

        activeTab: tab,
        onTabChange: noop,
        onClose: noop,
        onTogglePin: noop,
        onJumpToMain: noop,
        onSelectCitation: noop,
      })
    );

  it('renders an internal reference and offers Cited Elsewhere', () => {
    const html = renderPanel(internalCitation);

    expect(html).toContain('Cited Elsewhere');
    expect(html).toContain('This Act');
    // The verbatim statutory words are always shown, never a paraphrase.
    expect(html).toContain('Cited as');
    expect(html).toContain(internalCitation.rawText.replace(/"/g, '\u201d\u201c'));
  });

  it('renders the backlinks tab with citing provisions', () => {
    const sectionEid = internalCitation.target.scope === 'internal' ? internalCitation.target.targetEid : null;
    const provision = sectionEid ? index.provisionsByEid.get(sectionEid) : null;
    const html = renderPanel(internalCitation, 'backlinks');

    expect(html).toContain('Cited Elsewhere');
    if (provision && (index.incomingBySection.get(provision.topLevelEid ?? provision.eid)?.length ?? 0) > 0) {
      expect(html).toContain('is referred to from');
    }
  });

it('never presents another Act as a provision of this one', () => {
    const html = renderPanel(externalCitation);

    expect(html).toContain('Reference to another Act');
    expect(html).not.toContain('Jump to in Main View');
  });

it('names the open Act when showing a foreign reference', () => {
    // Regression: this read "This is not a provision of the CGST Act" whatever
    // document was open, which is false for every other statute.
    const foreign = index.citations.find((c) => c.target.scope === 'external');
    expect(foreign).toBeDefined();

    const render = (doc: StatuteDocument) =>
      renderToStaticMarkup(
        React.createElement(SideViewPanel, {
          isOpen: true,
          isPinned: false,
          activeCitation: foreign!,
          indexData: index,
          document: doc,
          activeTab: 'provision',
          onTabChange: noop,
          onClose: noop,
          onTogglePin: noop,
          onJumpToMain: noop,
          onSelectCitation: noop,
        })
      );

    const incomeTax: StatuteDocument = {
      id: 't',
      title: 'The Income-tax Act, 2025',
      shortTitle: 'Income-tax Act, 2025',
      origin: 'local',
    };

    const forIncomeTax = render(incomeTax);
    expect(forIncomeTax).toContain('not a provision of Income-tax Act, 2025');
    expect(forIncomeTax).not.toContain('CGST');

    const forCgst = render(TEST_DOCUMENT);
    expect(forCgst).toContain('not a provision of CGST Act, 2017');
  });

  it('labels the reader chrome with the open document', () => {
    const incomeTax: StatuteDocument = {
      id: 't',
      title: 'The Income-tax Act, 2025',
      shortTitle: 'Income-tax Act, 2025',
      origin: 'local',
    };

    const footerOf = (doc: StatuteDocument) => {
      const html = renderToStaticMarkup(
        React.createElement(ContinuousReader, {
          indexData: index,
          document: doc,
          onCitationClick: noop,
          onShowBacklinks: noop,
          fontSize: 'base',
          serifFont: true,
        })
      );
      return html.slice(html.lastIndexOf('<footer'));
    };

    // The chrome must name whichever Act is open. It must not claim a
    // built-in Act regardless of the document being read.
    const footer = footerOf(incomeTax);
    expect(footer).toContain('The Income-tax Act, 2025');
    expect(footer).not.toContain('CGST');

    expect(footerOf(TEST_DOCUMENT)).toContain(TEST_DOCUMENT.title);
  });

  it('renders the nest view without crashing', () => {
    const html = renderPanel(internalCitation, 'nest');
    expect(html.length).toBeGreaterThan(0);
  });

  it('renders nothing when closed', () => {
    const html = renderToStaticMarkup(
      React.createElement(SideViewPanel, {
        isOpen: false,
        isPinned: false,
activeCitation: internalCitation,
        indexData: index,
        activeTab: 'provision',
        onTabChange: noop,
        onClose: noop,
        onTogglePin: noop,
        onJumpToMain: noop,
        onSelectCitation: noop,
      })
    );

    expect(html).toBe('');
  });
});

describe('HomePage', () => {
  const localDoc: StatuteDocument = {
    id: 'local:customs-tariff:1234',
    title: 'The Customs Tariff Act, 1975',
    shortTitle: 'Customs Tariff Act, 1975',
    subtitle: 'Opened from customs-tariff.json',
    source: 'Opened locally',
    origin: 'local',
    fileName: 'customs-tariff.json',
    sizeBytes: 1234,
    lastOpenedAt: Date.now(),
    summary: { provisions: 100, sections: 20, citations: 5, footnotes: 1, containers: 0 },
  };

  const renderHome = (overrides: Partial<React.ComponentProps<typeof HomePage>> = {}) =>
    renderToStaticMarkup(
      React.createElement(HomePage, {
        documents: [...BUILTIN_DOCUMENTS, localDoc],
        isLoadingLibrary: false,
        storageAvailable: true,
        isOpeningId: null,
        error: null,
        onOpen: noop,
        onAddFiles: noop,
        onRemove: noop,
        onDismissError: noop,
        ...overrides,
      })
    );

  it('renders the library with built-in and local documents', () => {
    const html = renderHome();

    expect(html).toContain(PRODUCT_NAME);
    expect(html).toContain('Open a statute document');
    expect(html).toContain('Legislation');
    expect(html).toContain('Your documents');
    expect(html).toContain('The Customs Tariff Act, 1975');
  });

  it('brands itself from a single source of truth', () => {
    // A rename should be one edit in branding.ts, never a hunt through
    // components. These assertions exist to fail loudly if that stops being so.
    const html = renderHome();

    expect(html).toContain(PRODUCT_NAME);
    expect(html).toContain(PRODUCT_TAGLINE);
    expect(html).not.toContain('AKN Legal Reader');

    const readerChrome = renderToStaticMarkup(
      React.createElement(Header, {
        document: TEST_DOCUMENT,
        hierarchyIndex: hierarchy,
        activeItem: null,
        onSelectProvision: noop,
        theme: 'parchment',
        onThemeChange: noop,
        fontSize: 'base',
        onFontSizeChange: noop,
        serifFont: true,
        onToggleSerif: noop,
        onToggleToc: noop,
        isTocOpen: true,
        onOpenSearch: noop,
        onToggleSideView: noop,
        isSideViewOpen: false,
        onHome: noop,
      })
    );
    expect(readerChrome).toContain(PRODUCT_NAME);

    // The reading canvas has its own footer, which is exactly where an old
    // hardcoded name survived a rename. Cover every surface that names us.
    const canvas = renderToStaticMarkup(
      React.createElement(ContinuousReader, {
        indexData: index,
        document: TEST_DOCUMENT,
        onCitationClick: noop,
        onShowBacklinks: noop,
        fontSize: 'base',
        serifFont: true,
      })
    );

    // Attribution lives in the two surfaces that have a footer. The reader
    // header is a four-tier control bar and has no room for it.
    for (const [label, markup] of [
      ['library', html],
      ['reading canvas', canvas],
    ] as const) {
      expect(markup, `${label} must credit the author`).toContain(AUTHOR_URL);
      expect(markup, `${label} must name the author`).toContain(AUTHOR_NAME);
      expect(markup, `${label} must link the PDF converter`).toContain(PARSER_URL);
      expect(markup, `${label} must name the PDF converter`).toContain(PARSER_NAME);
    }

    // The product name belongs on every surface, header included, so a reader
    // always knows what they are using.
    for (const [label, markup] of [
      ['library', html],
      ['header', readerChrome],
      ['reading canvas', canvas],
    ] as const) {
      expect(markup, `${label} must name the product`).toContain(PRODUCT_NAME);
      expect(markup, `${label} must not carry the old name`).not.toContain(
        'AKN Legal Reader'
      );
    }

    // External links must not leak the opener or hand over referrer data.
    for (const markup of [html, canvas]) {
      expect(markup).toContain('rel="noreferrer noopener"');
      expect(markup).not.toMatch(/target="_blank"(?![^>]*rel="noreferrer)/);
    }
  });

  it('offers a file picker restricted to JSON', () => {
    const html = renderHome();
    expect(html).toContain('type="file"');
    expect(html).toContain('accept=".json,application/json"');
  });

  it('shows an empty state when nothing has been opened', () => {
    const html = renderHome({ documents: BUILTIN_DOCUMENTS });
    expect(html).toContain('Nothing here yet');
  });

  it('surfaces a load error', () => {
    const html = renderHome({
      error: { title: 'broken.json is not valid JSON.', detail: 'Unexpected token }' },
    });

    expect(html).toContain('broken.json is not valid JSON.');
    expect(html).toContain('Unexpected token }');
  });

  it('warns when browser storage is unavailable', () => {
    const html = renderHome({ storageAvailable: false });
    expect(html).toContain('Browser storage is unavailable');
  });

  it('confirms persistence when storage works', () => {
    const html = renderHome();
    expect(html).toContain('stored locally in this browser only');
  });
});