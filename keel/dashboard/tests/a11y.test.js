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
  ['One document', () => import('../modules/views/doc.js').then((m) => m.navigateDoc('standards/std-access-control.md'))],
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
