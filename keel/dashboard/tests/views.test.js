/* Every lens renders, against a registry shaped the way build writes one.
 *
 * The unit tests above prove the helpers. This proves the views: each one is
 * mounted into a real DOM and asked to draw the same small program, which is
 * what catches a view still reaching for a field the refactor deleted.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { state } from '../modules/state.js';

/* nav.js resolves #main and #right once, when it is first imported — the same
   way it does in the browser, where the page exists before the script runs. So
   the DOM is built here, at module scope, and only emptied between tests:
   replacing it would leave nav.js holding detached elements. */
document.body.innerHTML = '<div id="main"></div><div id="right"></div><nav id="app-nav"></nav><div id="tree"></div><input id="search">';

/* Evidence goes off against today, so a fixture with fixed dates would start
   failing on a date nobody chose. Every artefact below is placed relative to
   the day the suite runs. */
function daysAgo(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

const REGISTRY = {
  config: { name: 'Test Program', repo: 'org/test', frameworks: [{ id: 'pci_dss', binding: 'mandatory' }] },
  types: [
    { name: 'policy', prefix: 'pol', folder: 'policies', dated: false, immutable: false },
    { name: 'standard', prefix: 'std', folder: 'standards', dated: false, immutable: false },
    { name: 'role', prefix: 'role', folder: 'roles', dated: false, immutable: false },
    { name: 'gap', prefix: 'gap', folder: 'gaps', dated: true, immutable: false },
    { name: 'exception', prefix: 'exc', folder: 'exceptions', dated: true, immutable: false },
    { name: 'risk', prefix: 'rsk', folder: 'risks', dated: false, immutable: false },
    { name: 'vendor', prefix: 'vnd', folder: 'vendors', dated: false, immutable: false },
    { name: 'decision', prefix: 'dec', folder: 'decisions', dated: false, immutable: true },
  ],
  model: {
    domains: [{ id: 'iam', name: 'Identity', description: 'Access.', order: 1 },
              { id: 'grc', name: 'Governance', description: 'Rules.', order: 2 }],
    capabilities: [{ id: 'iam.idp', name: 'Identity Provider', domain: 'iam', description: 'Auth.' }],
    systems: [{ id: 'okta', name: 'Okta' }],
    risk_taxonomy: {
      severity: {
        likelihood: [{ value: 1, label: 'Negligible', note: 'Rare' }, { value: 2, label: 'Low' }, { value: 3, label: 'Medium' }],
        impact: [{ value: 1, label: 'Negligible' }, { value: 2, label: 'Low' }, { value: 3, label: 'Medium' }],
        bands: [{ id: 'negligible', min: 1, max: 1 }, { id: 'low', min: 2, max: 2 },
                { id: 'medium', min: 3, max: 7 }, { id: 'high', min: 8, max: 14 }],
      },
    },
  },
  publish: { destinations: { confluence: { space: 'SEC' } }, defaults: { policy: ['confluence'], decision: [] } },
  documents: [
    { path: 'roles/role-owner.md', id: 'role-owner', type: 'role', title: 'Owner', description: 'The accountable role.', status: 'active', owner: 'role-owner', last_reviewed: '2026-01-01', next_review: '2030-01-01' },
    { path: 'policies/pol-info-sec.md', id: 'pol-info-sec', type: 'policy', title: 'Information Security', description: 'Top-level principles.', status: 'active', owner: 'role-owner', domains: ['grc'], related: ['std-access-control'], last_reviewed: '2026-01-01', next_review: '2020-01-01' },
    { path: 'standards/std-access-control.md', id: 'std-access-control', type: 'standard', title: 'Access Control', description: 'How access is granted.', status: 'active', owner: 'role-owner', domains: ['iam'], capabilities: ['iam.idp'], systems: ['okta'], last_reviewed: '2026-01-01', next_review: '2030-01-01', requirements: [
      { ref: '1.2', text: 'Every user has a unique account.', frameworks: { pci_dss: ['8'] },
        how_demonstrated: 'Quarterly export of every account from the identity provider.',
        evidence: [
          { name: 'Account inventory, this quarter', url: 'https://drive.example.com/accounts.csv', collected: daysAgo(10), freshness: 'quarterly', collector: 'manual' },
          { name: 'Account inventory, last year', url: 'https://drive.example.com/accounts-old.csv', collected: daysAgo(400), freshness: 'annually' },
        ] },
      /* No frameworks and no evidence: the em dash in the mapping matrix and
         the unproven row in the evidence table both need one of these. */
      { ref: '1.3', text: 'Administrative access is time-bound and approved.' },
    ] },
    { path: 'gaps/2026/gap-shared-accounts.md', id: 'gap-shared-accounts', type: 'gap', title: 'Shared accounts', description: 'Two hosts share an account.', owner: 'role-owner', requirement: 'std-access-control#1.2', source: 'audit', found: '2020-02-01', severity: 'medium', tracker: 'https://tracker.example.com/SEC-9', last_reviewed: '2026-02-01', next_review: '2030-01-01' },
    { path: 'exceptions/2026/exc-batch-account.md', id: 'exc-batch-account', type: 'exception', title: 'Batch account', description: 'A job uses a service account.', owner: 'role-owner', requirement: 'std-access-control#1.2', approved_by: ['role-owner'], expires: '2030-06-01', last_reviewed: '2026-02-01', next_review: '2030-01-01' },
    { path: 'vendors/vnd-okta.md', id: 'vnd-okta', type: 'vendor', title: 'Okta', description: 'The identity provider.', status: 'active', owner: 'role-owner', vendor_name: 'Okta', tier: 'critical', criticality: 'critical', cia: { confidentiality: 'high', integrity: 'critical', availability: 'critical' }, rto: '4h', rpo: '1h', certifications: ['ISO/IEC 27001'], last_reviewed: '2026-05-14', next_review: '2030-05-14' },
    { path: 'risks/rsk-takeover.md', id: 'rsk-takeover', type: 'risk', title: 'Account takeover', description: 'Someone else logs in.', status: 'active', owner: 'role-owner', severity: 'medium', likelihood: 'Low', impact: 'Medium', last_reviewed: '2026-01-01', next_review: '2030-01-01' },
    { path: 'risks/rsk-unscored.md', id: 'rsk-unscored', type: 'risk', title: 'Unscored risk', description: 'Nobody scored it.', status: 'draft', owner: 'role-owner', severity: 'low', last_reviewed: '2026-01-01', next_review: '2030-01-01' },
    { path: 'decisions/dec-truth-boundaries.md', id: 'dec-truth-boundaries', type: 'decision', title: 'Truth boundaries', description: 'Who owns which truth.', status: 'active', owner: 'role-owner', decided: '2026-01-05' },
  ],
  coverage: {
    pci_dss: {
      7: { coverage: 'unmapped', posture: 'not-assessed', requirements: [], gaps: [], exceptions: [] },
      8: { coverage: 'mapped', requirements: ['std-access-control#1.2'], gaps: ['gap-shared-accounts'], exceptions: ['exc-batch-account'] },
    },
  },
  requirements: {
    'std-access-control#1.2': { standard: 'std-access-control', ref: '1.2', text: 'Every user has a unique account.', frameworks: { pci_dss: ['8'] }, gaps: ['gap-shared-accounts'], exceptions: ['exc-batch-account'] },
    'std-access-control#1.3': { standard: 'std-access-control', ref: '1.3', text: 'Administrative access is time-bound and approved.', gaps: [], exceptions: [] },
  },
  collectors: {
    manual: { source: 'framework', path: 'keel/collectors/manual.py', template: false,
              summary: 'A person refreshed this evidence; record the day and leave the link alone.' },
    'okta-access-review': { source: 'framework', path: 'keel/collectors/okta-access-review.py', template: true,
                            summary: 'Fetch the quarterly access review export from Okta. Not implemented.' },
    'quarter-end': { source: 'program', path: 'collectors/quarter-end.py', template: false,
                     summary: 'Stamp evidence with the quarter it covers.' },
  },
  frameworks: {
    pci_dss: {
      name: 'PCI DSS v4.0',
      description: 'The card industry data security standard.',
      granularity: 'The twelve top-level requirements.',
      resources: [{ name: 'PCI SSC document library', url: 'https://www.pcisecuritystandards.org/document_library/' }],
      groups: [
        { id: 'access', name: 'Implement Strong Access Control Measures', description: 'Least privilege.', color: '#5b7fa6', center: false, clauses: [{ ref: '7', name: 'Restrict Access', description: '' }, { ref: '8', name: 'Identify Users', description: '' }] },
      ],
      source: 'shipped',
    },
  },
  framework_adrs: [{ path: 'keel/adrs/adr-truth-boundaries.md', id: 'adr-truth-boundaries', title: 'Truth boundaries', decided: '2026-09-18' }],
  tools: { 'iam.idp': { updated: '2026-09-19', tools: [
    { name: 'Keycloak', url: 'https://www.keycloak.org/', license: 'open-source', note: 'Identity and access management server.' },
    { name: 'Okta Workforce Identity', url: 'https://www.okta.com/workforce-identity/', license: 'proprietary', note: 'Cloud identity provider.' },
  ] } },
  schedule: [{ id: 'pentest', name: 'External pentest', frequency: 'annually', owner: 'role-owner', last_completed: '2026-01-10', tracker: 'https://tracker.example.com/SEC-1' },
             { id: 'never-run', name: 'Tabletop exercise', frequency: 'annually', owner: 'role-owner' }],
};

let errors;

beforeEach(async () => {
  ['main', 'right', 'tree'].forEach((id) => { document.getElementById(id).textContent = ''; });
  // A leaked query string would silently filter the next test's view.
  location.hash = '';
  errors = [];
  vi.spyOn(console, 'error').mockImplementation((...a) => errors.push(a.join(' ')));

  Object.assign(state, {
    types: [], model: { domains: [], capabilities: [], systems: [], risk_taxonomy: {} }, coverage: {},
    requirements: {}, publish: { destinations: {}, defaults: {} }, schedule: [],
    frameworkAdrs: [], frameworks: {}, tools: {}, collectors: {},
    fmCache: {}, idToPath: {}, allDocs: [], bodyCache: {},
    config: { name: 'Security Program', repo: '', organization: null, frameworks: [] },
    expandedSections: {}, currentDoc: '', currentView: 'home',
  });

  globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => REGISTRY, text: async () => '# Body\n\nSome text.' }));
  const { loadRegistry } = await import('../modules/data.js');
  await loadRegistry();
});

function main() { return document.getElementById('main').textContent; }
/* The first clause row of the fixture's framework is unmapped, so a test about
   what a mapped row shows has to say which row it means. */
function mappedRow() {
  return [...document.querySelectorAll('#main .compliance-table tr')]
    .find((r) => r.querySelector('.req-map-fw'));
}
function right() { return document.getElementById('right').textContent; }

describe('the registry populates every lookup', () => {
  it('loads types, documents, model, coverage and the contract', () => {
    expect(state.types).toHaveLength(8);
    expect(state.allDocs).toHaveLength(9);
    expect(state.idToPath['gap-shared-accounts']).toBe('gaps/2026/gap-shared-accounts.md');
    expect(state.model.domains).toHaveLength(2);
    expect(state.coverage.pci_dss[8].gaps).toEqual(['gap-shared-accounts']);
    expect(state.publish.defaults.policy).toEqual(['confluence']);
  });
});

describe('Overview', () => {
  it('counts what the program holds and never scores it', async () => {
    const { renderHome } = await import('../modules/views/home.js');
    renderHome();
    // The program's name is in the header already; twice in eighty pixels is
    // chrome, not information.
    expect(document.querySelector('#main h1')).toBeNull();
    expect(main()).toContain('Open gaps');
    expect(main()).toContain('Live exceptions');
    // No maturity, no percentage of the program "done".
    expect(main()).not.toMatch(/maturity/i);
    expect(errors).toEqual([]);
  });

  it('shows framework coverage, and says only what the number is', async () => {
    const { renderHome } = await import('../modules/views/home.js');
    renderHome();
    expect(main()).toContain('PCI DSS');
    expect(main()).toContain('Clauses with a requirement mapped to them.');
    // The caveat lives in one place only: the page where somebody could draw
    // the wrong conclusion from it.
    expect(main()).not.toContain('Coverage is not compliance');
    expect(main()).not.toMatch(/contested/i);
  });

  it('drops the lens grid: the lenses are the sidebar', async () => {
    const { renderHome } = await import('../modules/views/home.js');
    renderHome();
    expect(main()).not.toContain('Lenses');
    expect(document.querySelector('#main .lens-card')).toBeNull();
  });

  it('puts whose program this is in the panel', async () => {
    // The panel is metadata about the thing you are looking at, and here that
    // thing is the instance. This used to be a Reference page called About,
    // which filed instance data behind framework documentation.
    const { renderHome } = await import('../modules/views/home.js');
    renderHome();
    expect(right()).toContain('Organization');
    expect(document.body.classList.contains('no-right-panel')).toBe(false);
    // Apache-2.0 section 4(d): this site redistributes the framework.
    expect(right()).toContain('Kilagen');
    expect(right()).toContain('Apache-2.0');
  });

  it('says what each framework binds you to, beside its coverage', async () => {
    const { renderHome } = await import('../modules/views/home.js');
    renderHome();
    // 8/12 of something a contract requires and 8/12 of something you read for
    // ideas are not the same fact.
    const head = document.querySelector('#main table.home-coverage tr').textContent;
    expect(head).toContain('Binding');
  });
});

describe('Browse', () => {
  it('puts every document in one table, with type as a column', async () => {
    const { renderBrowse } = await import('../modules/views/browse.js');
    renderBrowse(null);
    // One table, six rows — not a pile of per-type sections.
    expect(document.querySelectorAll('#main table').length).toBe(1);
    expect(document.querySelectorAll('#main table tr').length).toBe(10); // header + 9
    expect(main()).toContain('std-access-control');
    expect(main()).toContain('gap-shared-accounts');
    expect(main()).toContain('9 documents');
    expect(errors).toEqual([]);
  });

  it('keeps the id cell a real table cell', async () => {
    const { renderBrowse } = await import('../modules/views/browse.js');
    renderBrowse(null);
    const cell = document.querySelector('#main table.browse-table td');
    // The flex box goes on a span inside. On the <td> itself it takes the cell
    // out of the table box model, and the column renders short of its own row.
    expect(cell.className).toBe('');
    expect(cell.querySelector('span.browse-id')).not.toBeNull();
  });

  it('shows the computed state where a type declares no status', async () => {
    const { renderBrowse } = await import('../modules/views/browse.js');
    renderBrowse(null);
    const row = Array.from(document.querySelectorAll('#main table.browse-table tr'))
      .find(function(tr) { return tr.textContent.indexOf('gap-shared-accounts') !== -1; });
    // It used to print badge(fm.status || '') for every type, and a gap has no
    // status since schema 2 — so the column held an empty pill.
    expect(row.textContent).toContain('open');
    expect(row.querySelector('.pill').textContent).not.toBe('');
  });

  it('shows a gap as open when nothing has closed it', async () => {
    const { renderBrowse } = await import('../modules/views/browse.js');
    renderBrowse('gap');
    expect(main()).toContain('open');
    expect(main()).toContain('std-access-control#1.2');
  });

  it('offers no declared-status column where the state is computed', async () => {
    const { renderBrowse } = await import('../modules/views/browse.js');
    renderBrowse('gap');
    const head = document.querySelector('#main table tr').textContent;
    expect(head).not.toContain('Status');
    expect(head).toContain('State');
    renderBrowse('policy');
    expect(document.querySelector('#main table tr').textContent).toContain('Status');
  });

  it('names the folder a type lives in, year partition included', async () => {
    const { renderBrowse } = await import('../modules/views/browse.js');
    renderBrowse('gap');
    expect(main()).toContain('program/gaps/<year>/gap-*.md');
  });

  it('gives a type its own columns', async () => {
    const { renderBrowse } = await import('../modules/views/browse.js');
    renderBrowse('role');
    const head = document.querySelector('#main table tr').textContent;
    expect(head).toContain('Kind');
    expect(head).toContain('Reports to');
    expect(errors).toEqual([]);
  });
});

describe('Vendors', () => {
  it('reads as a third-party inventory, not a document list', async () => {
    const { renderBrowse } = await import('../modules/views/browse.js');
    renderBrowse('vendor');
    const head = document.querySelector('#main table tr').textContent;
    ['Vendor', 'Tier', 'Criticality', 'RTO', 'Certifications', 'Next reassessment']
      .forEach((col) => expect(head).toContain(col));
    expect(main()).toContain('ISO/IEC 27001');
    expect(main()).toContain('4h');
    expect(errors).toEqual([]);
  });

  it('shows the CIA rating the annual reassessment keeps alive', async () => {
    const { renderBrowse } = await import('../modules/views/browse.js');
    renderBrowse('vendor');
    const row = document.querySelectorAll('#main table tr')[1].textContent;
    expect(row).toContain('C high');
    expect(row).toContain('I critical');
    expect(row).toContain('A critical');
  });

  it('is reached as a type, with the filter bar the other types get', async () => {
    const { renderBrowse } = await import('../modules/views/browse.js');
    renderBrowse('vendor');
    expect(document.querySelector('#main .filter-bar')).not.toBeNull();
    expect(main()).toContain('program/vendors/vnd-*.md');
  });
});

describe('The risk heatmap', () => {
  it('places a scored risk in the cell its own scores name', async () => {
    const { renderBrowse } = await import('../modules/views/browse.js');
    location.hash = 'program/risk?shape=heatmap';
    renderBrowse('risk');
    const cells = [...document.querySelectorAll('#main .heatmap-cell')];
    expect(cells.length).toBe(9);
    const placed = cells.find((c) => c.textContent.includes('rsk-takeover'));
    // Low (2) x Medium (3) = 6 — the labels are what the schema allows, and
    // the axis is where each one is bound to its number. The score is in the
    // cell's title rather than printed in it: on screen a lone number in the
    // corner of a cell reads as "how many risks are in here", which is the one
    // thing it is not.
    expect(placed.title).toContain('= 6');
    expect(placed.textContent).not.toContain('6');
    expect(errors).toEqual([]);
  });

  it('says out loud that an unscored risk is not on the matrix', async () => {
    const { renderBrowse } = await import('../modules/views/browse.js');
    location.hash = 'program/risk?shape=heatmap';
    renderBrowse('risk');
    expect(main()).toContain('not on the matrix');
    expect(main()).toContain('rsk-unscored');
  });

  it('is a shape of the filtered set, so the filters still apply', async () => {
    const { renderBrowse } = await import('../modules/views/browse.js');
    location.hash = 'browse/risk?shape=heatmap&status=active';
    renderBrowse('risk');
    expect(main()).toContain('1 of 2 risks');
    expect(main()).not.toContain('rsk-unscored');
  });

  it('offers no heatmap for a type that is not risk', async () => {
    const { renderBrowse } = await import('../modules/views/browse.js');
    renderBrowse('policy');
    expect(document.querySelector('#main .shape-toggle')).toBeNull();
  });

  it('offers no heatmap when the taxonomy declares no matrix', async () => {
    const { renderBrowse } = await import('../modules/views/browse.js');
    state.model.risk_taxonomy = {};
    renderBrowse('risk');
    expect(document.querySelector('#main .shape-toggle')).toBeNull();
    expect(document.querySelector('#main table.browse-table')).not.toBeNull();
  });
});

describe('The filter bar', () => {
  it('narrows the table and says how much of the set is showing', async () => {
    const { renderBrowse } = await import('../modules/views/browse.js');
    location.hash = 'program?type=gap';
    renderBrowse(null);
    expect(main()).toContain('1 of 9 documents');
    expect(main()).toContain('gap-shared-accounts');
    expect(main()).not.toContain('pol-info-sec');
    location.hash = '';
  });

  it('reads a multi-value facet from the URL as OR', async () => {
    const { renderBrowse } = await import('../modules/views/browse.js');
    location.hash = 'browse?type=gap,policy';
    renderBrowse(null);
    expect(main()).toContain('2 of 9 documents');
    location.hash = '';
  });

  it('combines two facets as AND', async () => {
    const { renderBrowse } = await import('../modules/views/browse.js');
    location.hash = 'browse?type=gap&domain=iam';
    renderBrowse(null);
    // The gap carries no domains facet, so the intersection is empty.
    expect(main()).toContain('No documents match these filters');
    expect(main()).toContain('Clear the filters');
    location.hash = '';
  });

  it('searches id, title and description', async () => {
    const { renderBrowse } = await import('../modules/views/browse.js');
    location.hash = 'browse?q=access';
    renderBrowse(null);
    expect(main()).toContain('1 of 9 documents');
    expect(main()).toContain('std-access-control');
    expect(main()).not.toContain('gap-shared-accounts');
  });

  it('offers only facets that have values, and counts them', async () => {
    const { renderBrowse } = await import('../modules/views/browse.js');
    renderBrowse(null);
    const labels = [...document.querySelectorAll('#main .filter-facet-btn')].map((b) => b.textContent);
    expect(labels.join(' ')).toContain('Domain');
    // Nothing at this level carries a classification, so that facet is not drawn.
    expect(labels.join(' ')).not.toContain('Classification');
    expect(errors).toEqual([]);
  });

  it('ignores a facet value nobody has, rather than breaking', async () => {
    const { renderBrowse } = await import('../modules/views/browse.js');
    location.hash = 'browse?type=<img src=x onerror=alert(1)>';
    renderBrowse(null);
    expect(main()).toContain('No documents match these filters');
    expect(document.querySelector('#main img')).toBeNull();
    location.hash = '';
  });
});

describe('Domains', () => {
  it('lists every domain from the vocabulary', async () => {
    const { renderDomains } = await import('../modules/views/domains.js');
    renderDomains();
    expect(main()).toContain('Identity');
    expect(main()).toContain('Governance');
    expect(errors).toEqual([]);
  });

  it('shows a domain with its documents and its capability checklist', async () => {
    const { renderDomain } = await import('../modules/views/domains.js');
    renderDomain('iam');
    expect(main()).toContain('std-access-control');
    expect(main()).toContain('iam.idp');
    expect(main()).toContain('measured in the estate');
  });
});

describe('Compliance', () => {
  it('renders clause, requirement, open gap and live exception on one row', async () => {
    const { renderCompliance } = await import('../modules/views/compliance.js');
    renderCompliance('pci_dss');
    const text = main();
    // The standard is named once and its references sit beside it, rather than
    // one chip per requirement each repeating the standard's id.
    // Clause 7 is unmapped and comes first; the mapped one is clause 8.
    const cell = mappedRow().querySelector('.clause-reqs');
    expect(cell.querySelector('.req-map-fw').textContent).toBe('std-access-control');
    expect([...cell.querySelectorAll('.req-clause')].map((c) => c.textContent)).toEqual(['1.2']);
    expect(text).toContain('gap-shared-accounts');
    expect(text).toContain('exc-batch-account');
    expect(errors).toEqual([]);

  });

  it('says whether the requirements behind a clause can be proven', async () => {
    const { renderCompliance } = await import('../modules/views/compliance.js');
    renderCompliance('pci_dss');
    const cell = mappedRow().querySelector('.clause-ev');
    // One requirement answers clause 8, and it has evidence attached — one
    // piece of which is a year past its annual renewal.
    expect(cell.querySelector('.clause-ev-ratio').textContent).toBe('1 / 1');
    expect(cell.textContent).toContain('proven');
    expect(cell.querySelector('.clause-ev-lapsed').textContent).toContain('1 lapsed');
  });

  it('leaves the evidence column empty where no requirement maps', async () => {
    const { renderCompliance } = await import('../modules/views/compliance.js');
    renderCompliance('pci_dss');
    // Clause 7 is unmapped: a ratio there would be a number about nothing.
    const rows = [...document.querySelectorAll('#main .compliance-table tr')];
    const unmapped = rows.find((r) => r.classList.contains('clause-unmapped'));
    expect(unmapped.querySelector('.clause-ev').textContent).toBe('');
  });

  it('refuses to say a clause is met', async () => {
    const { renderCompliance } = await import('../modules/views/compliance.js');
    renderCompliance('pci_dss');
    // The caveat is metadata about the framework, so it moved to the panel
    // with the rest of what describes it. The centre column is the clauses.
    expect(right()).toContain('never whether it is met');
    expect(main()).not.toMatch(/\bcompliant\b/);
  });

  it('compares every framework on the entry page', async () => {
    const { renderCompliance } = await import('../modules/views/compliance.js');
    renderCompliance(null);
    expect(main()).toContain('PCI DSS v4.0');
    expect(main()).toContain('1 / 2');
    expect(main()).toContain('mandatory');
    expect(main()).toContain('with an open gap');
    expect(errors).toEqual([]);
  });

  it('draws bars for a framework that publishes a list, and links the text', async () => {
    const { renderCompliance } = await import('../modules/views/compliance.js');
    renderCompliance('pci_dss');
    // PCI publishes goals, not a radial figure: inventing a wheel for it would
    // be asserting a shape nobody published.
    expect(document.querySelectorAll('#main .fw-wheel-slice').length).toBe(0);
    const bars = document.querySelectorAll('#main .fw-bar-row');
    expect(bars.length).toBe(1);
    expect(bars[0].querySelector('.fw-bar-fill').style.background).toBe('rgb(91, 127, 166)');
    expect(main()).toContain('Implement Strong Access Control Measures');
    expect(main()).toContain('Colour is identity, not score');
    const link = document.querySelector('#right .fw-resource-link');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(errors).toEqual([]);
  });

  it('draws the wheel only where the framework publishes a radial figure', async () => {
    const { renderCompliance } = await import('../modules/views/compliance.js');
    // A hub group is what a published wheel looks like in the vocabulary.
    state.frameworks.pci_dss.groups[0].center = true;
    state.frameworks.pci_dss.groups.push({
      id: 'monitor', name: 'Monitor and Test Networks', color: '#7a6a9c', center: false,
      clauses: [{ ref: '7', name: 'Restrict Access', description: '' }],
    });
    renderCompliance('pci_dss');
    expect(document.querySelectorAll('#main .fw-wheel-slice').length).toBeGreaterThan(0);
    expect(document.querySelectorAll('#main .fw-bar-row').length).toBe(0);
    expect(errors).toEqual([]);
  });

  it('carries the clause name next to the reference', async () => {
    const { renderCompliance } = await import('../modules/views/compliance.js');
    renderCompliance('pci_dss');
    expect(main()).toContain('Identify Users');
  });

  it('invents no structure for a framework that publishes none', async () => {
    const { renderCompliance } = await import('../modules/views/compliance.js');
    state.frameworks = {};
    renderCompliance('pci_dss');
    expect(document.querySelectorAll('#main .fw-wheel-slice').length).toBe(0);
    expect(document.querySelectorAll('#main table.compliance-table').length).toBe(1);
    // The caveat is metadata about the framework, so it moved to the panel
    // with the rest of what describes it. The centre column is the clauses.
    expect(right()).toContain('never whether it is met');
    expect(errors).toEqual([]);
  });

  it('lists the documents that tagged themselves with the framework', async () => {
    const { renderCompliance } = await import('../modules/views/compliance.js');
    state.fmCache['guidelines/gl-pci-scope.md'] = {
      path: 'guidelines/gl-pci-scope.md', id: 'gl-pci-scope', type: 'guideline',
      title: 'PCI DSS Scope', status: 'active', owner: 'role-owner', frameworks: { pci_dss: [] },
    };
    state.allDocs.push({ path: 'guidelines/gl-pci-scope.md', name: 'gl-pci-scope.md' });
    renderCompliance('pci_dss');
    expect(main()).toContain('In this program');
    expect(main()).toContain('PCI DSS Scope');
    // A standard maps at requirement level; it belongs in the table, not here.
    expect(document.querySelector('#main .fw-tagged').textContent).not.toContain('Access Control');
    expect(errors).toEqual([]);
  });
});

describe('The audit pack', () => {
  it('lays out every clause with its requirement, its gap and its exception', async () => {
    const { renderAudit } = await import('../modules/views/audit.js');
    renderAudit('pci_dss');
    const text = main();
    expect(text).toContain('Test Program — PCI DSS');
    expect(text).toContain('mandatory');
    expect(text).toContain('Identify Users');                 // the clause name
    expect(document.querySelector('#main .audit-req .req-ref').title)
      .toContain('std-access-control#1.2');                   // the requirement
    expect(text).toContain('Every user has a unique account'); // its text
    expect(text).toContain('Open gap');
    expect(text).toContain('gap-shared-accounts');
    expect(text).toContain('Live exception');
    expect(text).toContain('exc-batch-account');
    expect(errors).toEqual([]);
  });

  it('says plainly where a clause has nothing behind it', async () => {
    const { renderAudit } = await import('../modules/views/audit.js');
    renderAudit('pci_dss');
    expect(main()).toContain('No requirement in this program maps to this clause.');
  });

  it('carries the caveat, because a printed page outlives its context', async () => {
    const { renderAudit } = await import('../modules/views/audit.js');
    renderAudit('pci_dss');
    expect(main()).toContain('never whether it is met');
  });

  it('offers the print button, which is also the PDF', async () => {
    const { renderAudit } = await import('../modules/views/audit.js');
    renderAudit('pci_dss');
    expect(document.querySelector('#main .audit-print-btn')).not.toBeNull();
  });

  it('refuses a framework that is not in scope', async () => {
    const { renderAudit } = await import('../modules/views/audit.js');
    renderAudit('ghost');
    expect(main()).toContain('No such framework');
    expect(errors).toEqual([]);
  });

  it('says what a collected date means, rather than leaving the arithmetic', async () => {
    const { renderAudit } = await import('../modules/views/audit.js');
    renderAudit('pci_dss');
    const text = main();
    // The fixture attaches one artefact inside its renewal period and one a
    // year past it. Both are shown; the second is shown as expired.
    expect(text).toContain('Account inventory, this quarter');
    expect(text).toContain('good until');
    const states = [...document.querySelectorAll('#main .req-ev-state')].map((s) => s.textContent);
    expect(states).toContain('fresh');
    expect(states).toContain('stale');
    expect(errors).toEqual([]);
  });

  it('shows stale evidence rather than hiding it', async () => {
    const { renderAudit } = await import('../modules/views/audit.js');
    renderAudit('pci_dss');
    // Hiding it would overstate what the program can prove, which is the one
    // thing this page exists not to do.
    expect(main()).toContain('Account inventory, last year');
    const states = [...document.querySelectorAll('#main .req-ev-state')].map((s) => s.textContent);
    expect(states).toContain('stale');
  });

  it('admits a requirement with nothing attached, instead of leaving a blank', async () => {
    const { renderAudit } = await import('../modules/views/audit.js');
    const requirement = state.fmCache['standards/std-access-control.md'].requirements[0];
    const kept = requirement.evidence;
    delete requirement.evidence;
    renderAudit('pci_dss');
    expect(main()).toContain('No evidence attached');
    requirement.evidence = kept;
  });

  it('opens with what this framework can be shown to be true', async () => {
    const { renderAudit } = await import('../modules/views/audit.js');
    renderAudit('pci_dss');
    // Scoped to the clauses in this pack, not to the whole program.
    expect(main()).toMatch(/1 requirements? answer this framework, 1 with evidence attached/);
    expect(main()).toContain('past its renewal period or undated');
  });

  it('leaves a closed gap out: the pack shows what stands, not what stood', async () => {
    const { renderAudit } = await import('../modules/views/audit.js');
    state.fmCache['gaps/2026/gap-shared-accounts.md'].remediated = '2026-03-01';
    renderAudit('pci_dss');
    expect(main()).not.toContain('gap-shared-accounts');
    delete state.fmCache['gaps/2026/gap-shared-accounts.md'].remediated;
  });
});

describe('Schedule', () => {
  it('computes the next due date and links the tracker', async () => {
    const { renderSchedule } = await import('../modules/views/schedule.js');
    renderSchedule();
    expect(main()).toContain('2027-01-10');          // last_completed + annually
    expect(main()).toContain('never done');          // no completion, no invented date
    const link = [...document.querySelectorAll('#main a')].find((a) => a.href.includes('SEC-1'));
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(errors).toEqual([]);
  });

  it('opens on Activities: the year’s recurring work', async () => {
    const { renderSchedule } = await import('../modules/views/schedule.js');
    renderSchedule();
    expect(main()).toContain('External pentest');
    // The deadlines are one tab away, not stacked underneath.
    expect(main()).not.toContain('Document reviews');
    expect(errors).toEqual([]);
  });

  it('groups what expires under Reviews, with a count each', async () => {
    const { renderSchedule } = await import('../modules/views/schedule.js');
    location.hash = 'schedule?tab=reviews&window=180';
    renderSchedule();
    expect(main()).toContain('Document reviews');
    expect(main()).toContain('pol-info-sec');      // review overdue since 2020
    expect(main()).toContain('Open gaps');
    expect(main()).toContain('gap-shared-accounts'); // found 2020, long stale
    location.hash = '';
    expect(errors).toEqual([]);
  });

  it('narrows to what has already slipped when the window is Overdue', async () => {
    const { renderSchedule } = await import('../modules/views/schedule.js');
    location.hash = 'schedule?tab=reviews&window=overdue';
    renderSchedule();
    expect(main()).toContain('pol-info-sec');
    // Its review is due in 2030: not overdue, not in this window.
    expect(main()).not.toContain('std-access-control');
    location.hash = '';
    expect(errors).toEqual([]);
  });

  it('filters the review list by type and by domain', async () => {
    const { renderSchedule } = await import('../modules/views/schedule.js');
    location.hash = 'schedule?tab=reviews&window=180&type=gap';
    renderSchedule();
    expect(main()).toContain('gap-shared-accounts');
    expect(main()).not.toContain('pol-info-sec');
    location.hash = '';
    expect(errors).toEqual([]);
  });


});

describe('Document', () => {
  it('renders a standard with its addressable requirements', async () => {
    const { navigateDoc } = await import('../modules/views/doc.js');
    navigateDoc('standards/std-access-control.md');
    // The reference is the marker; the full key is what a gap cites, so it is
    // reachable by click rather than repeated on every block.
    const ref = document.querySelector('#main .req-ref');
    expect(ref.textContent).toBe('1.2');
    expect(ref.title).toContain('std-access-control#1.2');
    expect(main()).toContain('Every user has a unique account');
    expect(main()).toContain('gap: gap-shared-accounts');
    expect(errors).toEqual([]);
  });

  it('renders a gap against the requirement text it falls short of', async () => {
    const { navigateDoc } = await import('../modules/views/doc.js');
    navigateDoc('gaps/2026/gap-shared-accounts.md');
    expect(main()).toContain('Falls short of');
    expect(main()).toContain('Open. Nobody has approved this deviation.');
  });

  it('says plainly when an exception is still live', async () => {
    const { navigateDoc } = await import('../modules/views/doc.js');
    navigateDoc('exceptions/2026/exc-batch-account.md');
    expect(main()).toContain('Deviates from');
    expect(main()).toContain('Live until 2030-06-01');
  });

  it('groups related ids by the type their prefix implies', async () => {
    const { navigateDoc } = await import('../modules/views/doc.js');
    navigateDoc('policies/pol-info-sec.md');
    expect(right()).toContain('Related');
    expect(right()).toContain('Standards');
    expect(right()).toContain('std-access-control');
  });

  it('resolves the publishing default for the type', async () => {
    const { navigateDoc } = await import('../modules/views/doc.js');
    navigateDoc('policies/pol-info-sec.md');
    expect(right()).toContain('confluence');
  });

  it('draws the connections with the verb on each edge', async () => {
    const { navigateDoc } = await import('../modules/views/doc.js');
    navigateDoc('standards/std-access-control.md');
    const conn = document.querySelector('#main .conn');
    expect(conn).not.toBeNull();
    const verbs = [...conn.querySelectorAll('.conn-verb')].map((t) => t.textContent);
    expect(verbs).toContain('authorised by');
    expect(verbs).toContain('contested by');
    expect(verbs).toContain('excepted by');
    expect(conn.textContent).toContain('gap-shared-accounts');
    expect(errors).toEqual([]);
  });

  it('links the tracker once, where the state is described', async () => {
    const { navigateDoc } = await import('../modules/views/doc.js');
    navigateDoc('gaps/2026/gap-shared-accounts.md');
    const links = [...document.querySelectorAll('a')]
      .filter((a) => a.textContent.indexOf('Open in tracker') !== -1);
    // It used to render in both places, each with the same note under it.
    expect(links.length).toBe(1);
    expect(document.querySelector('#main .contest-work a')).not.toBeNull();
  });

  it('draws the document itself at the centre', async () => {
    const { navigateDoc } = await import('../modules/views/doc.js');
    navigateDoc('standards/std-access-control.md');
    const conn = document.querySelector('#main .conn');
    // It was deleted once, silently, when the simulation replaced the layout
    // block it sat in — and nothing noticed, because every other node was
    // still there. Everything is positioned relative to this one.
    expect(conn.querySelector('.conn-centre')).not.toBeNull();
    expect(conn.querySelector('.conn-centre-label').textContent).toBe('std-access-control');
  });

  it('draws no connections for a document that links to nothing', async () => {
    const { navigateDoc } = await import('../modules/views/doc.js');
    navigateDoc('roles/role-owner.md');
    expect(document.querySelector('#main .conn')).toBeNull();
    expect(errors).toEqual([]);
  });

  it('shows an immutable type without a review cycle', async () => {
    const { navigateDoc } = await import('../modules/views/doc.js');
    navigateDoc('decisions/dec-truth-boundaries.md');
    expect(right()).toContain('Decided');
    expect(right()).not.toContain('Next review');
  });
});

describe('The tool inventory', () => {
  it('lists what exists in a capability, grouped by domain', async () => {
    const { renderTools } = await import('../modules/views/tools.js');
    renderTools();
    expect(main()).toContain('Identity');            // the domain
    expect(main()).toContain('Identity Provider');   // the capability
    expect(main()).toContain('Keycloak');
    expect(main()).toContain('open-source');
    expect(errors).toEqual([]);
  });

  it('carries the notice that keeps it reference material', async () => {
    const { renderTools } = await import('../modules/views/tools.js');
    renderTools();
    expect(main()).toContain('Not exhaustive, and not a recommendation');
    expect(main()).toContain('says what this organisation runs');
  });

  it('says so when a release ships no inventory, and fetches nothing', async () => {
    const { renderTools } = await import('../modules/views/tools.js');
    state.tools = {};
    renderTools();
    expect(main()).toContain('No inventory in this release');
    expect(errors).toEqual([]);
  });
});

describe('Sidebar', () => {
  it('offers the four lenses in the header, not in the tree', async () => {
    const { rebuildSidebar } = await import('../modules/sidebar.js');
    location.hash = 'home';
    rebuildSidebar();
    const nav = document.getElementById('app-nav').textContent;
    ['Program', 'Domains', 'Compliance', 'Schedule']
      .forEach((label) => expect(nav).toContain(label));
    // Overview is the mark in the corner: it is the program, not a view of a
    // part of it. Reference is documentation about Kilagen rather than about
    // this program, and lives behind the ? — where a menu of framework docs
    // cannot collect the organisation's legal name on its way past.
    expect(nav).not.toContain('Overview');
    expect(nav).not.toContain('Reference');
    const tree = document.getElementById('tree').textContent;
    expect(tree).not.toContain('Graph');
    // Overview has no subtree, so nothing else is open.
    expect(tree).not.toContain('Standards');
    expect(tree).not.toContain('Identity');
    expect(tree).not.toContain('PCI DSS');
    location.hash = '';
    expect(errors).toEqual([]);
  });

  it('puts the types, the domains and the frameworks under their own lens', async () => {
    const { rebuildSidebar } = await import('../modules/sidebar.js');
    location.hash = 'program';
    rebuildSidebar();
    let tree = document.getElementById('tree').textContent;
    // Browse is the active lens, so its subtree is open and the others are not.
    expect(tree).toContain('Standards');
    expect(tree).toContain('Gaps');
    expect(tree).not.toContain('Identity');
    expect(tree).not.toContain('PCI DSS');

    location.hash = 'compliance';
    rebuildSidebar();
    tree = document.getElementById('tree').textContent;
    expect(tree).toContain('PCI DSS');
    expect(tree).toContain('1 / 2');
    expect(tree).not.toContain('Standards');

    location.hash = 'domains';
    rebuildSidebar();
    tree = document.getElementById('tree').textContent;
    expect(tree).toContain('Identity');
    expect(tree).toContain('Governance');
    location.hash = '';
    expect(errors).toEqual([]);
  });

  it('groups the types under Program rather than listing seventeen', async () => {
    const { rebuildSidebar } = await import('../modules/sidebar.js');
    location.hash = 'program';
    rebuildSidebar();
    const tree = document.getElementById('tree').textContent;
    // The fixture has no process, runbook or playbook, so Practice is absent:
    // a shelf with nothing on it is not drawn.
    ['Rules', 'Inventory', 'Position', 'Record']
      .forEach((label) => expect(tree).toContain(label));
    expect(tree).not.toContain('Practice');
    location.hash = '';
    expect(errors).toEqual([]);
  });

  it('lists the framework decisions on the Reference page', async () => {
    const { renderReference } = await import('../modules/views/reference.js');
    state.frameworkAdrs = [{ path: 'keel/adrs/adr-truth-boundaries.md', id: 'adr-truth-boundaries', title: 'Truth boundaries' }];
    renderReference();
    expect(main()).toContain('Why it is this way');
    expect(main()).toContain('Truth boundaries');
    expect(errors).toEqual([]);
  });

  it('lights the lens a detail route belongs to', async () => {
    const { rebuildSidebar } = await import('../modules/sidebar.js');
    location.hash = 'domain/iam';
    rebuildSidebar();
    const active = document.getElementById('app-nav').querySelector('.app-nav-btn.active');
    expect(active && active.textContent).toContain('Domains');
    location.hash = '';
  });

  it('an old browse link still lands', async () => {
    const { getHash } = await import('../modules/nav.js');
    location.hash = 'browse/gap';
    expect(getHash()).toBe('program/gap');
    location.hash = '';
  });
});

/* Every route, twice: once against the fixture and once against a program
 * that has nothing in it. The second half is the one that pays — a view that
 * reaches for a field the refactor deleted, or assumes a list is non-empty,
 * fails here rather than in somebody's browser. The console assertion is the
 * actual check: a view can "render" and still have thrown. */
const ROUTES = [
  ['home', () => import('../modules/views/home.js').then((m) => m.renderHome())],
  ['browse', () => import('../modules/views/browse.js').then((m) => m.renderBrowse(null))],
  ['browse/gap', () => import('../modules/views/browse.js').then((m) => m.renderBrowse('gap'))],
  ['browse/risk', () => import('../modules/views/browse.js').then((m) => m.renderBrowse('risk'))],
  ['browse/vendor', () => import('../modules/views/browse.js').then((m) => m.renderBrowse('vendor'))],
  ['browse/policy', () => import('../modules/views/browse.js').then((m) => m.renderBrowse('policy'))],
  ['browse/unknown-type', () => import('../modules/views/browse.js').then((m) => m.renderBrowse('nope'))],
  ['domains', () => import('../modules/views/domains.js').then((m) => m.renderDomains())],
  ['domain/iam', () => import('../modules/views/domains.js').then((m) => m.renderDomain('iam'))],
  ['domain/nonexistent', () => import('../modules/views/domains.js').then((m) => m.renderDomain('nope'))],
  ['compliance', () => import('../modules/views/compliance.js').then((m) => m.renderCompliance(null))],
  ['compliance/pci_dss', () => import('../modules/views/compliance.js').then((m) => m.renderCompliance('pci_dss'))],
  ['compliance/nonexistent', () => import('../modules/views/compliance.js').then((m) => m.renderCompliance('nope'))],
  ['audit/pci_dss', () => import('../modules/views/audit.js').then((m) => m.renderAudit('pci_dss'))],
  ['audit/nonexistent', () => import('../modules/views/audit.js').then((m) => m.renderAudit('nope'))],
  ['schedule', () => import('../modules/views/schedule.js').then((m) => m.renderSchedule())],
  ['reference', () => import('../modules/views/reference.js').then((m) => m.renderReference())],
  ['glossary', () => import('../modules/views/glossary.js').then((m) => m.renderGlossary())],
  ['schemas', () => import('../modules/views/schemas.js').then((m) => m.renderSchemas())],
  ['templates', () => import('../modules/views/templates.js').then((m) => m.renderTemplates())],
  ['tools', () => import('../modules/views/tools.js').then((m) => m.renderTools())],
  ['search', () => import('../modules/views/search.js').then((m) => m.renderSearchResults('access'))],
];

describe('every route renders with a clean console', () => {
  ROUTES.forEach(([name, render]) => {
    it(name, async () => {
      await render();
      expect(errors).toEqual([]);
    });
  });
});

describe('every route survives a program with nothing in it', () => {
  ROUTES.forEach(([name, render]) => {
    it(name, async () => {
      Object.assign(state, {
        types: [], model: { domains: [], capabilities: [], systems: [], risk_taxonomy: {} },
        coverage: {}, requirements: {}, publish: { destinations: {}, defaults: {} },
        schedule: [], frameworkAdrs: [], frameworks: {}, tools: {},
        fmCache: {}, idToPath: {}, allDocs: [], bodyCache: {},
        config: { name: 'Empty', repo: '', organization: null, frameworks: [] },
        expandedSections: {}, currentDoc: '', currentView: 'home',
      });
      await render();
      expect(errors).toEqual([]);
      // An empty view must say why it is empty, never just be blank.
      expect(document.getElementById('main').textContent.trim().length).toBeGreaterThan(0);
    });
  });
});

describe('degenerate data nothing should choke on', () => {
  it('a framework in scope whose vocabulary is missing', async () => {
    const { renderCompliance } = await import('../modules/views/compliance.js');
    state.coverage = {};
    state.config.frameworks = [{ id: 'ghost', binding: 'mandatory' }];
    renderCompliance('ghost');
    expect(main()).toContain('No framework coverage');
    expect(errors).toEqual([]);
  });

  it('a program with no framework at all can still reach its evidence', async () => {
    const { rebuildSidebar } = await import('../modules/sidebar.js');
    state.coverage = {};
    location.hash = 'compliance';
    rebuildSidebar();
    // Evidence does not depend on a clause being mapped: a program can prove
    // its requirements before it maps anything.
    const labels = [...document.querySelectorAll('#tree .tree-item-label')].map((l) => l.textContent);
    expect(labels).toContain('Evidence');
    expect(errors).toEqual([]);
  });

  it('a gap whose requirement resolves to nothing', async () => {
    const { renderBrowse } = await import('../modules/views/browse.js');
    state.fmCache['gaps/2026/gap-orphan.md'] = {
      path: 'gaps/2026/gap-orphan.md', id: 'gap-orphan', type: 'gap', title: 'Orphan',
      description: '', owner: 'role-owner',
      requirement: 'std-that-does-not-exist#9.9', source: 'audit', found: '2026-01-01',
    };
    state.allDocs.push({ path: 'gaps/2026/gap-orphan.md', name: 'gap-orphan.md' });
    renderBrowse('gap');
    expect(main()).toContain('std-that-does-not-exist#9.9');
    expect(errors).toEqual([]);
  });

  it('a document with no facets at all', async () => {
    const { renderBrowse } = await import('../modules/views/browse.js');
    state.fmCache['policies/pol-bare.md'] = {
      path: 'policies/pol-bare.md', id: 'pol-bare', type: 'policy', title: 'Bare',
    };
    state.allDocs.push({ path: 'policies/pol-bare.md', name: 'pol-bare.md' });
    renderBrowse(null);
    expect(main()).toContain('pol-bare');
    expect(errors).toEqual([]);
  });

  it('a capability nobody has written about', async () => {
    const { renderDomain } = await import('../modules/views/domains.js');
    state.model.capabilities.push({ id: 'iam.orphan', name: 'Orphan capability', domain: 'iam', description: '' });
    renderDomain('iam');
    // An invitation, not a defect report: nothing is broken about a capability
    // nobody has got to yet.
    expect(main()).toContain('not written about yet');
    expect(errors).toEqual([]);
  });

  it('a clause vocabulary declaring a group whose clauses are all absent', async () => {
    const { renderCompliance } = await import('../modules/views/compliance.js');
    state.frameworks.pci_dss.groups.push({ id: 'ghost', name: 'Ghost group', clauses: [{ ref: '99' }] });
    renderCompliance('pci_dss');
    // The slice may exist, but no empty card is drawn for it.
    expect(main()).not.toContain('Ghost group');
    expect(errors).toEqual([]);
  });
});

describe('A standard, four ways', () => {
  it('opens on the document itself, and offers three views of it', async () => {
    const { navigateDoc } = await import('../modules/views/doc.js');
    navigateDoc('standards/std-access-control.md');
    const tabs = [...document.querySelectorAll('#main .doc-tab')].map((t) => t.textContent);
    expect(tabs).toHaveLength(4);
    expect(tabs[0]).toContain('Content');
    expect(tabs[1]).toContain('Mappings');
    expect(tabs[2]).toContain('Gaps');
    expect(tabs[3]).toContain('Evidence');
    expect(document.querySelector('#main .doc-tab.active').textContent).toContain('Content');
    expect(main()).toContain('Every user has a unique account');
    expect(errors).toEqual([]);
  });

  it('puts the prose and the requirements in one place, in that order', async () => {
    const { navigateDoc } = await import('../modules/views/doc.js');
    navigateDoc('standards/std-access-control.md');
    await Promise.resolve();
    const panel = document.querySelector('#main .doc-tabpanel');
    // The body card comes first: purpose and scope are what the requirements
    // below are scoped by.
    expect(panel.firstElementChild.className).toContain('doc-body');
    expect(panel.textContent).toContain('Addressable requirements');
    expect(panel.textContent).toContain('Every user has a unique account');
    // And Connections travels with the document rather than sitting under
    // every tab.
    expect(panel.querySelector('.conn')).not.toBeNull();
  });

  it('leaves the body behind when you switch to a view of it', async () => {
    const { navigateDoc } = await import('../modules/views/doc.js');
    location.hash = 'doc/standards/std-access-control.md?tab=mappings';
    navigateDoc('standards/std-access-control.md');
    const panel = document.querySelector('#main .doc-tabpanel');
    expect(panel.querySelector('.doc-body')).toBeNull();
    expect(panel.querySelector('.conn')).toBeNull();
    expect(panel.querySelector('.mapping-table')).not.toBeNull();
  });

  it('counts what is behind each tab, and evidence as a ratio', async () => {
    const { navigateDoc } = await import('../modules/views/doc.js');
    navigateDoc('standards/std-access-control.md');
    const counts = [...document.querySelectorAll('#main .doc-tab-count')].map((t) => t.textContent);
    // Two requirements, one clause reference, an open gap and a live exception
    // standing against them, and one of the two requirements proven.
    expect(counts).toEqual(['2', '1', '2', '1/2']);
  });

  it('opens straight at the view the link names', async () => {
    const { navigateDoc } = await import('../modules/views/doc.js');
    location.hash = 'doc/standards/std-access-control.md?tab=mappings';
    navigateDoc('standards/std-access-control.md');
    expect(document.querySelector('#main .doc-tab.active').textContent).toContain('Mappings');
    expect(document.querySelector('#main .mapping-table')).not.toBeNull();
    expect(errors).toEqual([]);
  });

  it('draws the requirement-by-framework matrix that exists nowhere else', async () => {
    const { navigateDoc } = await import('../modules/views/doc.js');
    location.hash = 'doc/standards/std-access-control.md?tab=mappings';
    navigateDoc('standards/std-access-control.md');
    const table = document.querySelector('#main .mapping-table');
    const headers = [...table.querySelectorAll('th')].map((h) => h.textContent);
    expect(headers[0]).toContain('Requirement');
    expect(headers[1]).toContain('PCI DSS');
    // 1.2 maps to clause 8; 1.3 maps to nothing and says so rather than going blank.
    expect(table.textContent).toContain('8');
    expect(table.querySelector('.mapping-none')).not.toBeNull();
  });

  it('shows a closed gap in the table while the badge counts only what stands', async () => {
    const { navigateDoc } = await import('../modules/views/doc.js');
    // Close the gap: the badge drops to the live exception alone, and the
    // remediated row stays in the table because the history is the point.
    state.fmCache['gaps/2026/gap-shared-accounts.md'].remediated = '2026-03-01';
    location.hash = 'doc/standards/std-access-control.md?tab=gaps';
    navigateDoc('standards/std-access-control.md');
    expect(main()).toContain('gap-shared-accounts');
    expect(main()).toContain('remediated 2026-03-01');
    const gapTab = [...document.querySelectorAll('#main .doc-tab')][2];
    expect(gapTab.querySelector('.doc-tab-count').textContent).toBe('1');
    delete state.fmCache['gaps/2026/gap-shared-accounts.md'].remediated;
  });

  it('says plainly when nothing has been filed against a standard', async () => {
    const { navigateDoc } = await import('../modules/views/doc.js');
    state.fmCache['gaps/2026/gap-shared-accounts.md'].requirement = 'std-other#1.1';
    state.fmCache['exceptions/2026/exc-batch-account.md'].requirement = 'std-other#1.1';
    location.hash = 'doc/standards/std-access-control.md?tab=gaps';
    navigateDoc('standards/std-access-control.md');
    expect(main()).toContain('Nothing is filed against this standard');
    state.fmCache['gaps/2026/gap-shared-accounts.md'].requirement = 'std-access-control#1.2';
    state.fmCache['exceptions/2026/exc-batch-account.md'].requirement = 'std-access-control#1.2';
  });

  it('shows what can be proven and what has gone stale', async () => {
    const { navigateDoc } = await import('../modules/views/doc.js');
    location.hash = 'doc/standards/std-access-control.md?tab=evidence';
    navigateDoc('standards/std-access-control.md');
    expect(main()).toContain('1 / 2');
    expect(main()).toContain('Account inventory, this quarter');
    expect(main()).toContain('stale');
    expect(main()).toContain('nothing attached');
    // The standard's own page does not repeat its own name down every row.
    const headers = [...document.querySelectorAll('#main .evidence-table th')].map((h) => h.textContent);
    expect(headers.join(' ')).not.toContain('Standard');
    expect(errors).toEqual([]);
  });

  it('leaves every other type without tabs', async () => {
    const { navigateDoc } = await import('../modules/views/doc.js');
    navigateDoc('policies/pol-info-sec.md');
    expect(document.querySelector('#main .doc-tabs')).toBeNull();
  });
});

describe('The requirement record', () => {
  it('names the framework once and puts its clauses beside it', async () => {
    const { navigateDoc } = await import('../modules/views/doc.js');
    navigateDoc('standards/std-access-control.md');
    const maps = document.querySelector('#main .req-maps');
    // Seven pills each repeating "ISO/IEC 27001:2022" is the framework's name
    // said seven times and the clause said once.
    const names = [...maps.querySelectorAll('.req-map-fw')].map((e) => e.textContent);
    expect(names).toEqual(['PCI DSS v4.0']);
    expect([...maps.querySelectorAll('.req-clause')].map((e) => e.textContent)).toEqual(['8']);
  });

  it('sends a clause to its framework, already cut to this standard', async () => {
    const { navigateDoc } = await import('../modules/views/doc.js');
    navigateDoc('standards/std-access-control.md');
    document.querySelector('#main .req-clause.clickable').click();
    expect(decodeURIComponent(location.hash))
      .toBe('#compliance/pci_dss?standard=std-access-control');
  });

  it('labels every fact, so a reader can skip a category with their eye', async () => {
    const { navigateDoc } = await import('../modules/views/doc.js');
    navigateDoc('standards/std-access-control.md');
    const record = document.querySelector('#main .req-record');
    const labels = [...record.querySelectorAll('.req-row-label')].map((e) => e.textContent);
    expect(labels).toEqual(['Demonstrated by', 'Evidence', 'Answers']);
  });

  it('says an artefact is there, when it was collected and how long that lasts', async () => {
    const { navigateDoc } = await import('../modules/views/doc.js');
    navigateDoc('standards/std-access-control.md');
    const entry = document.querySelector('#main .req-ev');
    expect(entry.querySelector('.req-ev-name').textContent).toBe('Account inventory, this quarter');
    expect(entry.querySelector('.req-ev-state').textContent).toBe('fresh');
    const facts = entry.querySelector('.req-ev-facts').textContent;
    expect(facts).toContain('collected');
    expect(facts).toContain('good until');
    expect(facts).toContain('via manual');
  });

  it('admits a requirement nobody has attached anything to', async () => {
    const { navigateDoc } = await import('../modules/views/doc.js');
    navigateDoc('standards/std-access-control.md');
    // 1.3 in the fixture has no evidence.
    expect(main()).toContain('Nothing attached yet');
  });

  it('keeps the full key on the marker, since that is what a gap cites', async () => {
    const { navigateDoc } = await import('../modules/views/doc.js');
    navigateDoc('standards/std-access-control.md');
    const refs = [...document.querySelectorAll('#main .req-ref')];
    expect(refs.map((r) => r.textContent)).toEqual(['1.2', '1.3']);
    expect(refs.map((r) => r.title)).toEqual([
      'std-access-control#1.2 — click to copy',
      'std-access-control#1.3 — click to copy',
    ]);
    expect(refs[0].getAttribute('aria-label')).toBe('Copy std-access-control#1.2');
  });
});

describe('Slicing by standard', () => {
  it('offers the standard as a facet wherever the bar is drawn', async () => {
    const { renderBrowse } = await import('../modules/views/browse.js');
    location.hash = 'program/gap';
    renderBrowse('gap');
    const names = [...document.querySelectorAll('.filter-facet-btn')].map((b) => b.textContent);
    expect(names.some((n) => n.indexOf('Standard') === 0)).toBe(true);
  });

  it('narrows gaps to the standard whose requirement they contest', async () => {
    const { renderBrowse } = await import('../modules/views/browse.js');
    location.hash = 'program/gap?standard=std-access-control';
    renderBrowse('gap');
    expect(main()).toContain('gap-shared-accounts');
    location.hash = 'program/gap?standard=std-nothing';
    renderBrowse('gap');
    expect(main()).not.toContain('gap-shared-accounts');
  });

  it('cuts a framework down to the clauses one standard reaches', async () => {
    const { renderCompliance } = await import('../modules/views/compliance.js');
    location.hash = 'compliance/pci_dss?standard=std-access-control';
    renderCompliance('pci_dss');
    // Clause 8 is reached through std-access-control#1.2; clause 7 is not reached at all.
    expect(main()).toContain('std-access-control');
    expect(main()).toContain('clauses are reached by the selected standard');
    const rows = [...document.querySelectorAll('#main .compliance-table tr')];
    expect(rows).toHaveLength(2); // the header and clause 8
    expect(errors).toEqual([]);
  });

  it('stands the figure down beside a filtered table, rather than counting two things at once', async () => {
    const { renderCompliance } = await import('../modules/views/compliance.js');
    location.hash = 'compliance/pci_dss';
    renderCompliance('pci_dss');
    expect(document.querySelector('#main .fw-bars-wrap, #main .fw-wheel-wrap')).not.toBeNull();
    location.hash = 'compliance/pci_dss?standard=std-access-control';
    renderCompliance('pci_dss');
    expect(document.querySelector('#main .fw-bars-wrap, #main .fw-wheel-wrap')).toBeNull();
  });
});

describe('Evidence, the other half of Compliance', () => {
  it('is reached from the tree, beside the frameworks rather than inside them', async () => {
    const { rebuildSidebar } = await import('../modules/sidebar.js');
    location.hash = 'compliance';
    rebuildSidebar();
    const rows = [...document.querySelectorAll('#tree .tree-item')];
    const labels = rows.map((r) => r.querySelector('.tree-item-label').textContent);
    expect(labels[0]).toBe('Frameworks');
    expect(labels).toContain('Evidence');
    // A framework is a list of clauses and nests under Frameworks; evidence
    // cuts across all of them and nests under nothing.
    const nested = rows.filter((r) => r.classList.contains('tree-item-nested'))
      .map((r) => r.querySelector('.tree-item-label').textContent);
    expect(nested).toContain('PCI DSS v4.0');
    expect(nested).not.toContain('Evidence');
  });

  it('carries the ratio the check would print, in the tree', async () => {
    const { rebuildSidebar } = await import('../modules/sidebar.js');
    location.hash = 'compliance';
    rebuildSidebar();
    const evidenceRow = [...document.querySelectorAll('#tree .tree-item')]
      .find((r) => r.querySelector('.tree-item-label').textContent === 'Evidence');
    expect(evidenceRow.querySelector('.tree-count').textContent).toBe('1 / 2');
  });

  it('opens the frameworks page with no tab bar over it', async () => {
    const { renderCompliance } = await import('../modules/views/compliance.js');
    renderCompliance(null);
    expect(document.querySelector('#main .doc-tabs')).toBeNull();
    expect(main()).toContain('PCI DSS v4.0');
  });

  it('counts what the program can prove, in the words the check uses', async () => {
    const { renderEvidenceLens } = await import('../modules/views/evidence.js');
    renderEvidenceLens();
    expect(main()).toContain('1 / 2');
    expect(main()).toContain('requirements with evidence attached');
    const labels = [...document.querySelectorAll('.stat-counter-label')].map((l) => l.textContent);
    expect(labels).toEqual(['unproven', 'stale', 'undated', 'due soon', 'no expiry set', 'fresh']);
    expect(errors).toEqual([]);
  });

  it('puts every artefact and every unproven requirement in one table', async () => {
    const { renderEvidenceLens } = await import('../modules/views/evidence.js');
    renderEvidenceLens();
    const table = document.querySelector('#main .evidence-table');
    expect(table.textContent).toContain('Account inventory, this quarter');
    expect(table.textContent).toContain('Account inventory, last year');
    expect(table.textContent).toContain('nothing attached');
    expect(table.textContent).toContain('std-access-control');
  });

  it('filters the table by status, so "what can we not prove" is a link', async () => {
    const { renderEvidenceLens } = await import('../modules/views/evidence.js');
    location.hash = 'compliance/evidence?status=unproven';
    renderEvidenceLens();
    const table = document.querySelector('#main .evidence-table');
    expect(table.textContent).toContain('nothing attached');
    expect(table.textContent).not.toContain('Account inventory, this quarter');
  });

  it('describes every collector, and marks the one that only raises', async () => {
    const { renderEvidenceLens } = await import('../modules/views/evidence.js');
    renderEvidenceLens();
    expect(main()).toContain('Collectors');
    expect(main()).toContain('manual');
    expect(main()).toContain('A person refreshed this evidence');
    expect(main()).toContain('keel/collectors/manual.py');
    // The Okta one is the shape of a collector, not one.
    expect(main()).toContain('template');
    // And one that lives in this repository rather than the package.
    expect(main()).toContain('this repository');
    expect(main()).toContain('Not named by any evidence entry');
  });

  it('says which commands produced any of this', async () => {
    const { renderEvidenceLens } = await import('../modules/views/evidence.js');
    renderEvidenceLens();
    expect(right()).toContain('kilagen check evidence');
    expect(right()).toContain('kilagen update evidence --apply');
    expect(right()).toContain('never the proof');
  });

  it('has somewhere to stand when no standard states a requirement', async () => {
    const { renderEvidenceLens } = await import('../modules/views/evidence.js');
    delete state.fmCache['standards/std-access-control.md'].requirements;
    renderEvidenceLens();
    expect(main()).toContain('No requirements to prove');
    expect(errors).toEqual([]);
  });
});
