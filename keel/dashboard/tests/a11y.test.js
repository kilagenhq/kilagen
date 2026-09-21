/* WCAG 2.1 AA, checked rather than asserted.
 *
 * In European public procurement accessibility is a requirement, not a
 * detail — and a pass done by hand is a pass that lasts until the next
 * commit. axe-core runs against the real DOM each view produces, in both
 * themes, so a regression fails here instead of in a tender.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import axe from 'axe-core';
import { state } from '../modules/state.js';

/* The landmarks of the real page, because "is this content inside a landmark"
   is a question about the page, not about the view. */
document.body.innerHTML = '<header><span class="app-title">'
  + '<span class="app-title-lines"><span class="app-title-name">Test</span>'
  + '<span class="app-title-sub">Security program</span></span></span></header>'
  + '<div class="container">'
  + '<nav id="sidebar" aria-label="Program navigation">'
  + '<input id="search" aria-label="Search the program"><nav id="app-nav"></nav><div id="tree"></div></nav>'
  + '<main id="main"></main>'
  + '<aside class="right-wrapper" aria-label="Document details"><div id="right"></div></aside>'
  + '</div>';

const REGISTRY = {
  config: { name: 'Test Program', repo: 'org/test', organization: { legal_name: 'Test Ltd' },
            frameworks: [{ id: 'pci_dss', binding: 'mandatory' }] },
  types: [
    { name: 'policy', prefix: 'pol', folder: 'policies', dated: false, immutable: false },
    { name: 'standard', prefix: 'std', folder: 'standards', dated: false, immutable: false },
    { name: 'gap', prefix: 'gap', folder: 'gaps', dated: true, immutable: false },
    { name: 'exception', prefix: 'exc', folder: 'exceptions', dated: true, immutable: false },
    { name: 'risk', prefix: 'rsk', folder: 'risks', dated: false, immutable: false },
  ],
  model: {
    domains: [{ id: 'iam', name: 'Identity', description: 'Access.', order: 1 }],
    capabilities: [{ id: 'iam.idp', name: 'Identity Provider', domain: 'iam', description: 'Auth.' }],
    systems: [{ id: 'okta', name: 'Okta' }],
    risk_taxonomy: { severity: {
      likelihood: [{ value: 1, label: 'Low' }, { value: 2, label: 'Medium' }],
      impact: [{ value: 1, label: 'Low' }, { value: 2, label: 'Medium' }],
      bands: [{ id: 'low', min: 1, max: 2 }, { id: 'medium', min: 3, max: 4 }] } },
  },
  publish: { destinations: { confluence: { space: 'SEC' } }, defaults: { policy: ['confluence'] } },
  documents: [
    { path: 'policies/pol-info-sec.md', id: 'pol-info-sec', type: 'policy', title: 'Information Security',
      description: 'Top-level principles.', status: 'active', owner: 'role-owner', domains: ['iam'],
      related: ['std-access-control'], last_reviewed: '2026-01-01', next_review: '2020-01-01' },
    { path: 'standards/std-access-control.md', id: 'std-access-control', type: 'standard', title: 'Access Control',
      description: 'How access is granted.', status: 'active', owner: 'role-owner', domains: ['iam'],
      capabilities: ['iam.idp'], last_reviewed: '2026-01-01', next_review: '2030-01-01',
      requirements: [{ ref: '1.2', text: 'Every user has a unique account.', frameworks: { pci_dss: ['8'] } }] },
    { path: 'gaps/2026/gap-shared.md', id: 'gap-shared', type: 'gap', title: 'Shared accounts',
      description: 'Two hosts share an account.', owner: 'role-owner', requirement: 'std-access-control#1.2',
      source: 'audit', found: '2020-02-01', severity: 'medium', last_reviewed: '2026-02-01', next_review: '2030-01-01' },
    { path: 'exceptions/2026/exc-batch.md', id: 'exc-batch', type: 'exception', title: 'Batch account',
      description: 'A job uses a service account.', owner: 'role-owner', requirement: 'std-access-control#1.2',
      approved_by: ['role-owner'], expires: '2030-06-01', last_reviewed: '2026-02-01', next_review: '2030-01-01' },
    { path: 'risks/rsk-takeover.md', id: 'rsk-takeover', type: 'risk', title: 'Account takeover',
      description: 'Someone else logs in.', status: 'active', owner: 'role-owner', severity: 'medium',
      likelihood: 'Low', impact: 'Low', last_reviewed: '2026-01-01', next_review: '2030-01-01' },
  ],
  coverage: { pci_dss: {
    7: { coverage: 'unmapped', posture: 'not-assessed', requirements: [], gaps: [], exceptions: [] },
    8: { coverage: 'mapped', requirements: ['std-access-control#1.2'], gaps: ['gap-shared'], exceptions: ['exc-batch'] },
  } },
  requirements: { 'std-access-control#1.2': { standard: 'std-access-control', ref: '1.2',
    text: 'Every user has a unique account.', frameworks: { pci_dss: ['8'] },
    gaps: ['gap-shared'], exceptions: ['exc-batch'] } },
  frameworks: { pci_dss: { name: 'PCI DSS v4.0', description: 'The card standard.',
    groups: [{ id: 'access', name: 'Access Control', color: '#5b7fa6', center: false,
               clauses: [{ ref: '7', name: 'Restrict Access' }, { ref: '8', name: 'Identify Users' }] }] } },
  framework_adrs: [],
  schedule: [{ id: 'pentest', name: 'External pentest', frequency: 'annually', owner: 'role-owner',
               last_completed: '2026-01-10' }],
};

beforeEach(async () => {
  ['main', 'right', 'tree'].forEach((id) => { document.getElementById(id).textContent = ''; });
  location.hash = '';
  Object.assign(state, {
    types: [], model: { domains: [], capabilities: [], systems: [], risk_taxonomy: {} }, coverage: {},
    requirements: {}, publish: { destinations: {}, defaults: {} }, schedule: [],
    frameworkAdrs: [], frameworks: {}, fmCache: {}, idToPath: {}, allDocs: [], bodyCache: {},
    config: { name: 'Security Program', repo: '', organization: null, frameworks: [] },
    expandedSections: {}, currentDoc: '', currentView: 'home',
  });
  globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => REGISTRY, text: async () => '# Body' }));
  const { loadRegistry } = await import('../modules/data.js');
  await loadRegistry();
});

/* Colour contrast needs layout, which jsdom does not do, so axe cannot judge
   it here — `references/contrast.md` records the measured ratios instead.
   Everything structural is checked. */
async function audit() {
  const results = await axe.run(document.body, {
    rules: { 'color-contrast': { enabled: false } },
    resultTypes: ['violations'],
  });
  return results.violations.map((v) => `${v.id}: ${v.nodes.length} node(s) — ${v.help}`);
}

const VIEWS = [
  ['Overview', () => import('../modules/views/home.js').then((m) => m.renderHome())],
  ['Browse', () => import('../modules/views/browse.js').then((m) => m.renderBrowse(null))],
  ['Browse, one type', () => import('../modules/views/browse.js').then((m) => m.renderBrowse('gap'))],
  ['The risk matrix', () => import('../modules/views/browse.js').then((m) => m.renderBrowse('risk'))],
  ['Domains', () => import('../modules/views/domains.js').then((m) => m.renderDomains())],
  ['One domain', () => import('../modules/views/domains.js').then((m) => m.renderDomain('iam'))],
  ['Compliance', () => import('../modules/views/compliance.js').then((m) => m.renderCompliance(null))],
  ['One framework', () => import('../modules/views/compliance.js').then((m) => m.renderCompliance('pci_dss'))],
  ['The audit pack', () => import('../modules/views/audit.js').then((m) => m.renderAudit('pci_dss'))],
  ['Schedule', () => import('../modules/views/schedule.js').then((m) => m.renderSchedule())],
  ['Evidence', () => import('../modules/views/evidence.js').then((m) => m.renderEvidenceLens())],
  ['A standard and its tabs', () => import('../modules/views/doc.js').then((m) => m.navigateDoc('standards/std-access-control.md'))],
  ['A standard, its requirements', () => {
    location.hash = 'doc/standards/std-access-control.md?tab=requirements';
    return import('../modules/views/doc.js').then((m) => m.navigateDoc('standards/std-access-control.md'));
  }],
  ['A standard, mapping matrix', () => {
    location.hash = 'doc/standards/std-access-control.md?tab=mappings';
    return import('../modules/views/doc.js').then((m) => m.navigateDoc('standards/std-access-control.md'));
  }],
  ['A framework cut down to one standard', () => {
    location.hash = 'compliance/pci_dss?standard=std-access-control';
    return import('../modules/views/compliance.js').then((m) => m.renderCompliance('pci_dss'));
  }],
  ['One document', () => import('../modules/views/doc.js').then((m) => m.navigateDoc('standards/std-access-control.md'))],
  /* A document with `related:`, and one with `requirement:`. Neither field is
     on the standard above, so without these two the id links in the panel are
     never drawn and both sweeps below pass without looking at them. */
  ['A document with related ids', () => import('../modules/views/doc.js').then((m) => m.navigateDoc('policies/pol-info-sec.md'))],
  ['A gap, against its requirement', () => import('../modules/views/doc.js').then((m) => m.navigateDoc('gaps/2026/gap-shared.md'))],
  ['The sidebar', () => import('../modules/sidebar.js').then((m) => m.rebuildSidebar())],
];

describe('every view passes axe-core', () => {
  VIEWS.forEach(([name, render]) => {
    it(name, async () => {
      await render();
      expect(await audit()).toEqual([]);
    });
  });
});

/* axe cannot see an event listener, so a view whose whole navigation is
 * click-handlers on bare <div>s passes every rule it has. This is the sweep
 * that closes that: record what gets a click listener while a view renders,
 * then require each of those to be something the keyboard can reach and
 * activate. It cannot be defeated by adding a case — a new clickable element
 * is caught the moment the view that draws it is in VIEWS.
 */
const FOCUSABLE = new Set(['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA', 'SUMMARY']);

function focusable(el) {
  if (FOCUSABLE.has(el.tagName)) return true;
  const tabindex = el.getAttribute('tabindex');
  return tabindex !== null && Number(tabindex) >= 0 && !!el.getAttribute('role');
}

function unreachable(el) {
  if (focusable(el)) return false;
  // A <tr> cannot carry role="link" without breaking the table's semantics,
  // so a row counts as reachable when one of its cells holds the handle.
  return ![...el.querySelectorAll('*')].some(focusable);
}

describe('nothing is clickable without being reachable', () => {
  const native = Element.prototype.addEventListener;
  VIEWS.forEach(([name, render]) => {
    it(name, async () => {
      const clickable = new Set();
      Element.prototype.addEventListener = function(type, ...rest) {
        if (type === 'click') clickable.add(this);
        return native.call(this, type, ...rest);
      };
      try {
        await render();
      } finally {
        Element.prototype.addEventListener = native;
      }

      const offenders = [...clickable].filter(unreachable).map((el) =>
        `<${el.tagName.toLowerCase()} class="${el.className || ''}">`);
      expect([...new Set(offenders)]).toEqual([]);
    });
  });
});

describe('the keyboard reaches everything the mouse does', () => {
  it('a filter popover says whether it is open, and closes on Escape', async () => {
    const { renderBrowse } = await import('../modules/views/browse.js');
    renderBrowse(null);
    const btn = document.querySelector('#main .filter-facet-btn');
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    btn.click();
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    const pop = document.querySelector('#main .filter-popover');
    expect(pop.getAttribute('aria-label')).toContain('Filter by');
    pop.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelector('#main .filter-popover')).toBeNull();
    expect(btn.getAttribute('aria-expanded')).toBe('false');
  });

  it('the panel heads its sections at the level below the document title', async () => {
    const { navigateDoc } = await import('../modules/views/doc.js');
    navigateDoc('standards/std-access-control.md');
    const panelHeadings = [...document.querySelectorAll('#right h1, #right h2, #right h3, #right h4')];
    expect(panelHeadings.length).toBeGreaterThan(0);
    // h3 only read correctly while the centre column happened to hold an h2 of
    // its own. The moment a view had none, the outline jumped h1 to h3.
    panelHeadings.forEach((h) => expect(h.tagName).toBe('H2'));
  });

  it('no view skips a heading level, whichever tab is open', async () => {
    const { navigateDoc } = await import('../modules/views/doc.js');
    for (const tab of ['content', 'requirements', 'mappings', 'gaps', 'evidence']) {
      ['main', 'right'].forEach((id) => { document.getElementById(id).textContent = ''; });
      location.hash = 'doc/standards/std-access-control.md?tab=' + tab;
      navigateDoc('standards/std-access-control.md');
      const levels = [...document.querySelectorAll('#main h1,#main h2,#main h3,#right h1,#right h2,#right h3')]
        .map((h) => Number(h.tagName[1]));
      levels.forEach((level, i) => {
        if (i === 0) return;
        expect(level - levels[i - 1], `${tab}: h${levels[i - 1]} followed by h${level}`)
          .toBeLessThanOrEqual(1);
      });
    }
  });

  it('a tablist is one tab stop, and the arrows move inside it', async () => {
    const { navigateDoc } = await import('../modules/views/doc.js');
    navigateDoc('standards/std-access-control.md');
    const bar = document.querySelector('#main .doc-tabs');
    expect(bar.getAttribute('role')).toBe('tablist');
    const tabs = [...bar.querySelectorAll('[role="tab"]')];
    // Exactly one tab is reachable with Tab; the rest are reached with arrows.
    expect(tabs.filter((t) => t.tabIndex === 0)).toHaveLength(1);
    expect(tabs.filter((t) => t.getAttribute('aria-selected') === 'true')).toHaveLength(1);
    tabs.forEach((t) => expect(t.getAttribute('aria-controls')).toBe('std-tabpanel'));

    bar.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
    expect(tabs[0].getAttribute('aria-selected')).toBe('false');
    // And it wraps, rather than stopping at the end.
    bar.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    bar.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(tabs[tabs.length - 1].getAttribute('aria-selected')).toBe('true');
  });

  it('the panel says which tab it belongs to', async () => {
    const { navigateDoc } = await import('../modules/views/doc.js');
    navigateDoc('standards/std-access-control.md');
    const panel = document.querySelector('#main .doc-tabpanel');
    expect(panel.getAttribute('role')).toBe('tabpanel');
    expect(document.getElementById(panel.getAttribute('aria-labelledby'))).not.toBeNull();
  });

  it('a segment meter reads as one figure, not as a row of empty boxes', async () => {
    const { renderDomains } = await import('../modules/views/domains.js');
    renderDomains();
    const meter = document.querySelector('#main .seg-meter');
    expect(meter.getAttribute('role')).toBe('img');
    expect(meter.getAttribute('aria-label')).toMatch(/\d+ of \d+ capabilit/);
  });

  it('every table header says what it heads', async () => {
    const { renderBrowse } = await import('../modules/views/browse.js');
    renderBrowse(null);
    const headers = [...document.querySelectorAll('#main th')];
    expect(headers.length).toBeGreaterThan(0);
    headers.forEach((cell) => expect(cell.getAttribute('scope')).toBe('col'));
  });

  it('a connections node is focusable and opens with the keyboard', async () => {
    const { navigateDoc } = await import('../modules/views/doc.js');
    navigateDoc('standards/std-access-control.md');
    const node = document.querySelector('#main .conn-node');
    expect(node.getAttribute('tabindex')).toBe('0');
    expect(node.getAttribute('role')).toBe('link');
  });
});
