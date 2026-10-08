import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import {
  buildHierarchyIndex,
  tierChildren,
  sectionLabel,
  firstChildOfTier,
} from '../services/hierarchyBuilder';
import { buildIndex } from '../services/aknLoader';
import { NavigationPicker } from '../components/NavigationPicker';
import { AknDataset, Provision } from '../types/akn';

function makeProvision(eid: string, kind: Provision['kind'], num: string, parent: string | null): Provision {
  return {
    eid,
    kind,
    num,
    parent_eid: parent,
    text: '',
    citations: [],
    footnotes: [],
    children: [],
    sourceIndex: 0,
    subtreeCitations: [],
    subtreeFootnotes: [],
    subtreeTextLength: 0,
    topLevelEid: null,
    isUnattributed: false,
    isDetached: false,
    title: num,
  };
}

/** Builds a tiny Act-shaped dataset and indexes it. */
function indexOf(roots: Provision[]) {
  const provisions = roots;
  // Link children up front, since buildIndex derives ancestry from parent_eid.
  const byEid = new Map(provisions.map((p) => [p.eid, p]));
  const dataset = {
    schema_version: 'test',
    akomaNtoso: { act: { meta: { title: 'Test', act_year: '2017' }, body: [] } },
    provisions,
    citations: [],
    footnotes: [],
  } as unknown as AknDataset;

  for (const provision of provisions) {
    const parent = provision.parent_eid ? byEid.get(provision.parent_eid) : undefined;
    if (parent) parent.children.push(provision);
  }

  return buildHierarchyIndex(buildIndex(dataset));
}

describe('buildHierarchyIndex', () => {
  it('nests section > sub-section > clause > sub-clause', () => {
    const index = indexOf([
      makeProvision('sec_1', 'section', '1', null),
      makeProvision('sec_1__subsec_1', 'subsection', '(1)', 'sec_1'),
      makeProvision('sec_1__subsec_1__cl_a', 'clause', '(a)', 'sec_1__subsec_1'),
      makeProvision('sec_1__subsec_1__cl_a__subcl_i', 'subclause', '(i)', 'sec_1__subsec_1__cl_a'),
    ]);

    expect(index.sections).toHaveLength(1);
    const section = index.sections[0];
    const subsection = section.children[0];
    const clause = subsection.children[0];
    const subclause = clause.children[0];

    expect(section.depth).toBe(0);
    expect(subsection.depth).toBe(1);
    expect(clause.depth).toBe(2);
    // Regression: sub-clauses used to be mapped but never listed anywhere.
    expect(subclause.depth).toBe(3);
    expect(index.eidToNavItemMap.get('sec_1__subsec_1__cl_a__subcl_i')?.depth).toBe(3);
  });

  it('assigns tiers by kind, not by depth', () => {
    const index = indexOf([
      makeProvision('sec_1', 'section', '1', null),
      makeProvision('sec_1__subsec_1', 'subsection', '(1)', 'sec_1'),
      makeProvision('sec_1__proviso_1', 'proviso', '', 'sec_1'),
    ]);

    const section = index.sections[0];
    // A proviso is a direct child but must not be offered as a sub-section.
    expect(tierChildren(section, 'subsection').map((i) => i.eid)).toEqual(['sec_1__subsec_1']);
    expect(tierChildren(section, 'proviso').map((i) => i.eid)).toEqual(['sec_1__proviso_1']);
  });

  it('never promotes an orphan to a section', () => {
    // Regression: 237 parentless subsections were rendered as tier-1 sections.
    const index = indexOf([
      makeProvision('sec_1', 'section', '1', null),
      makeProvision('sec_unknown__subsec_2', 'subsection', '(2)', null),
    ]);

    expect(index.sections.map((s) => s.eid)).toEqual(['sec_1']);
    expect(index.unattributedCount).toBe(1);
    expect(index.unattributedGroups).toHaveLength(1);
    expect(index.unattributedGroups[0].items[0].eid).toBe('sec_unknown__subsec_2');
  });

  it('groups orphans by adjacent page', () => {
    const a = makeProvision('orphan_a', 'subsection', '(1)', null);
    const b = makeProvision('orphan_b', 'subsection', '(2)', null);
    const far = makeProvision('orphan_c', 'subsection', '(3)', null);
    a.page_numbers = [10];
    b.page_numbers = [11];
    far.page_numbers = [90];

    const index = indexOf([a, b, far]);

    expect(index.unattributedGroups).toHaveLength(2);
    expect(index.unattributedGroups[0].items).toHaveLength(2);
    expect(index.unattributedGroups[1].items).toHaveLength(1);
  });

  it('records the path from section to any descendant', () => {
    const index = indexOf([
      makeProvision('sec_1', 'section', '1', null),
      makeProvision('sec_1__subsec_1', 'subsection', '(1)', 'sec_1'),
      makeProvision('sec_1__subsec_1__cl_a', 'clause', '(a)', 'sec_1__subsec_1'),
    ]);

    const path = index.pathToEid.get('sec_1__subsec_1__cl_a');
    expect(path?.map((i) => i.eid)).toEqual([
      'sec_1',
      'sec_1__subsec_1',
      'sec_1__subsec_1__cl_a',
    ]);
  });

  it('labels sections and schedules distinctly', () => {
    const index = indexOf([
      makeProvision('sec_31a', 'section', '31A', null),
      makeProvision('schedule_5', 'schedule', 'I', null),
      makeProvision('act_preamble', 'chapter', 'PREAMBLE', null),
    ]);

    const labels = Object.fromEntries(index.sections.map((s) => [s.eid, sectionLabel(s)]));
    expect(labels.sec_31a).toBe('Section 31A');
    expect(labels.schedule_5).toBe('Schedule I');
    expect(labels.act_preamble).toBe('Preamble');
  });

  it('counts outgoing references per node', () => {
    const index = indexOf([
      makeProvision('sec_1', 'section', '1', null),
      makeProvision('sec_1__subsec_1', 'subsection', '(1)', 'sec_1'),
    ]);

    const subsection = index.sections[0].children[0];
    expect(subsection.outgoingCount).toBe(0);
  });
});

/**
 * A miniature of the reported bug: a section full of sub-sections, each holding
 * clauses. Reads like CGST section 2 (Definitions).
 */
function definitionsAct() {
  const provisions: Provision[] = [makeProvision('sec_2', 'section', '2', null)];
  for (let i = 1; i <= 3; i++) {
    const subsec = `sec_2__subsec_${i}`;
    provisions.push(makeProvision(subsec, 'subsection', `(${i})`, 'sec_2'));
    provisions.push(makeProvision(`${subsec}__cl_a`, 'clause', '(a)', subsec));
    provisions.push(makeProvision(`${subsec}__cl_b`, 'clause', '(b)', subsec));
  }
  return provisions;
}

describe('NavigationPicker tiering', () => {
  const render = (activeEid: string | null) => {
    const provisions = definitionsAct();
    const byEid = new Map(provisions.map((p) => [p.eid, p]));
    const dataset = {
      schema_version: 'test',
      akomaNtoso: { act: { meta: { title: 'Test', act_year: '2017' }, body: [] } },
      provisions,
      citations: [],
      footnotes: [],
    } as unknown as AknDataset;
    for (const provision of provisions) {
      const parent = provision.parent_eid ? byEid.get(provision.parent_eid) : undefined;
      if (parent) parent.children.push(provision);
    }
    const index = buildHierarchyIndex(buildIndex(dataset));

    const html = renderToStaticMarkup(
      React.createElement(NavigationPicker, {
        hierarchyIndex: index,
        activeItem: activeEid ? index.eidToNavItemMap.get(activeEid) ?? null : null,
        onSelectProvision: () => {},
      })
    );

    return { index, html };
  };

  it('lists sub-sections when reading a clause, not the section root', () => {
    // Regression: the active clause was used as the sub-section tier, so a
    // clause's children (sub-clauses, explanations) were searched for
    // sub-sections, always finding none, and the dropdown read "No Sub-section"
    // while the sidebar showed the section full of them.
    const { html } = render('sec_2__subsec_3__cl_a');

    expect(html).not.toContain('No Sub-section');
    expect(html).toContain('Sub-section (1)');
    expect(html).toContain('Sub-section (3)');
  });

  it('lists clauses when reading a clause', () => {
    const { html } = render('sec_2__subsec_3__cl_a');
    expect(html).toContain('Clause (a)');
    expect(html).toContain('Clause (b)');
  });

  it('shows the sub-section actually being read', () => {
    const { html } = render('sec_2__subsec_3__cl_a');
    expect(html).toMatch(/<option value="sec_2__subsec_3" selected=""/);
  });

  it('shows the clause actually being read', () => {
    const { html } = render('sec_2__subsec_3__cl_a');
    expect(html).toMatch(/<option value="sec_2__subsec_3__cl_a" selected=""/);
  });

  it('shows the section actually being read', () => {
    const { html } = render('sec_2__subsec_3__cl_a');
    expect(html).toContain('value="sec_2"');
  });

  it('still offers sub-sections when reading the section itself', () => {
    const { html } = render('sec_2');
    expect(html).not.toContain('No Sub-section');
  });

  it('handles a sub-clause at the deepest tier', () => {
    const provisions = definitionsAct();
    provisions.push(makeProvision('sec_2__subsec_1__cl_a__subcl_i', 'subclause', '(i)', 'sec_2__subsec_1__cl_a'));
    const byEid = new Map(provisions.map((p) => [p.eid, p]));
    const dataset = {
      schema_version: 'test',
      akomaNtoso: { act: { meta: { title: 'Test', act_year: '2017' }, body: [] } },
      provisions,
      citations: [],
      footnotes: [],
    } as unknown as AknDataset;
    for (const provision of provisions) {
      const parent = provision.parent_eid ? byEid.get(provision.parent_eid) : undefined;
      if (parent) parent.children.push(provision);
    }
    const index = buildHierarchyIndex(buildIndex(dataset));

    const html = renderToStaticMarkup(
      React.createElement(NavigationPicker, {
        hierarchyIndex: index,
        activeItem: index.eidToNavItemMap.get('sec_2__subsec_1__cl_a__subcl_i') ?? null,
        onSelectProvision: () => {},
      })
    );

    // Tiers 1-3 must still line up with the ancestors, not with the leaf.
    expect(html).not.toContain('No Sub-section');
    expect(html).toContain('Clause (a)');
  });

  it('always renders all four tiers, whatever the content', () => {
    // Regression: tiers used to be omitted when empty, so the header controls
    // appeared and vanished while scrolling and the reader's place shifted.
    const index = indexOf([
      makeProvision('sec_1', 'section', '1', null),
      makeProvision('sec_1__cl_a', 'clause', '(a)', 'sec_1'),
    ]);
    const section = index.sections[0];

    expect(tierChildren(section, 'subsection')).toHaveLength(0);
    expect(firstChildOfTier(section, 'subsection')).toBeNull();

    const html = renderToStaticMarkup(
      React.createElement(NavigationPicker, {
        hierarchyIndex: index,
        activeItem: section,
        onSelectProvision: () => {},
      })
    );

    // One section with no sub-sections still gets four controls.
    expect(html.match(/<select/g)).toHaveLength(4);
    expect(html).toContain('No Sub-section');
    expect(html).toContain('No Clause');
    expect(html).toContain('No Proviso');
  });

  it('renders the same four controls whatever is being read', () => {
    // Stationarity: the header must not change shape as the reader scrolls.
    const atSection = render('sec_2').html;
    const atSubsec = render('sec_2__subsec_1').html;
    const atClause = render('sec_2__subsec_1__cl_a').html;

    expect(atSection.match(/<select/g)).toHaveLength(4);
    expect(atSubsec.match(/<select/g)).toHaveLength(4);
    expect(atClause.match(/<select/g)).toHaveLength(4);
  });

  it('carries no floating count badge in the header', () => {
    // The inbound-count pill appeared and vanished with scroll position, which
    // is exactly the movement the reader asked to be rid of.
    const { html } = render('sec_2__subsec_3__cl_a');
    expect(html).not.toContain('Cited from');
    expect(html).not.toContain('rounded-full');
  });

  it('never sizes the picker bar to its content', () => {
    // Regression: a native <select>'s intrinsic width is its longest <option>,
    // so `min-w-max` stretched the bar to fit the Act's longest sub-section
    // title. It overflowed the header and pushed the Clause and Proviso tiers
    // out of sight on narrower windows.
    const { html } = render('sec_2__subsec_3__cl_a');
    expect(html).not.toContain('min-w-max');
    expect(html).toContain('w-full min-w-0 flex items-center gap-1');
  });

  it('keeps a usable minimum on each tier but lets them grow', () => {
    const { html } = render('sec_2__subsec_3__cl_a');
    expect(html).toContain('flex-grow:1.25');
    expect(html).toContain('flex-basis:0');
    expect(html).toContain('min-w-[8rem]');
    expect(html).toContain('min-w-[6rem]');
  });

  it('does not let the picker push the surrounding controls off screen', () => {
    // The picker must be the only shrinkable element in the header, so the
    // search and theme controls cannot be squeezed out by a long option title.
    const { html } = render('sec_2__subsec_3__cl_a');
    expect(html).toContain('flex-1 min-w-0 flex items-center');
  });
});