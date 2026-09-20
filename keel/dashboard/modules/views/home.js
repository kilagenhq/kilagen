import { mk, mkMetaRow, th } from '../dom.js';
import { state, isOpenGap, isLiveException, docsOfType } from '../state.js';
import { go, setActiveView, mainEl, rightEl, showRightPanel } from '../nav.js';
import { fwLabel, daysUntil, BINDING_NOTE } from '../constants.js';
import { riskHeatmap } from '../heatmap.js';

/* The landing page answers "what is this program, what is in it, and what
 * needs attention" — and nothing else. It carries no score: there is no honest
 * number to put on a security program that can be computed from its own
 * documents.
 *
 * The program's name is in the header already, so there is no h1 here: the
 * same string twice in eighty pixels is chrome, not information. What the
 * reader does not know is *whose* program this is, and that is the panel.
 */

/* Four counts, read as one line. Boxing each of them turns a sentence into a
   grid of unrelated facts, and a number in a card reads as a KPI — which is
   the one thing this program refuses to be. What they get instead is a rule
   between them and room to breathe. */
function tile(label, value, route, tone) {
  const el = mk('div', 'home-tile');
  const number = mk('div', 'home-tile-value', String(value));
  if (tone && Number(value) > 0) number.classList.add('home-tile-' + tone);
  el.appendChild(number);
  el.appendChild(mk('div', 'home-tile-label', label));
  if (route) { el.classList.add('clickable'); el.addEventListener('click', function(e) { go(route, e); }); }
  return el;
}

/* Coverage is the one computed number this program is entitled to, because the
   denominator is published by somebody else. The binding is shown beside it,
   because 8/12 of something a contract requires and 8/12 of something you read
   for ideas are not the same fact. */
function renderCoverage(container) {
  const frameworks = Object.keys(state.coverage);
  if (!frameworks.length) return;

  const bindings = {};
  (state.config.frameworks || []).forEach(function(fw) {
    if (fw && fw.id) bindings[fw.id] = fw.binding;
  });

  container.appendChild(mk('h2', '', 'Framework coverage'));
  container.appendChild(mk('p', 'section-note', 'Clauses with a requirement mapped to them.'));

  const table = mk('table', 'home-coverage');
  const head = mk('tr');
  ['Framework', 'Binding', 'Coverage', 'Mapped'].forEach(function(label) { head.appendChild(th(label)); });
  table.appendChild(head);

  frameworks.forEach(function(fw) {
    const clauses = state.coverage[fw];
    const refs = Object.keys(clauses);
    const mapped = refs.filter(function(r) { return clauses[r].coverage === 'mapped'; }).length;
    const row = mk('tr');
    row.appendChild(mk('td', 'home-cov-name', fwLabel(fw)));

    const bindCell = mk('td');
    const binding = bindings[fw];
    if (binding) {
      const badge = mk('span', 'pill', binding);
      if (binding === 'mandatory') { badge.style.borderColor = 'var(--accent)'; badge.style.color = 'var(--accent)'; }
      badge.title = BINDING_NOTE[binding] || '';
      bindCell.appendChild(badge);
    }
    row.appendChild(bindCell);

    const barCell = mk('td', 'home-cov-bar-cell');
    const bar = mk('div', 'home-cov-bar');
    const fill = mk('div', 'home-cov-fill');
    fill.style.width = (refs.length ? Math.round(mapped / refs.length * 100) : 0) + '%';
    bar.appendChild(fill);
    barCell.appendChild(bar);
    row.appendChild(barCell);

    row.appendChild(mk('td', 'home-cov-num', mapped + ' / ' + refs.length));
    row.addEventListener('click', function(e) { go('compliance/' + fw, e); });
    table.appendChild(row);
  });
  container.appendChild(table);
}

/* The matrix is the one honest shape a risk register has: two axes somebody
   assessed, not a score somebody computed. */
function renderRisks(container) {
  const severity = (state.model.risk_taxonomy || {}).severity;
  if (!severity || !severity.likelihood || !severity.bands) return;
  const risks = docsOfType('risk');
  if (!risks.length) return;

  const head = mk('div', 'home-section-head');
  head.appendChild(mk('h2', '', 'Risk'));
  const all = mk('span', 'home-section-link clickable', risks.length + ' risks');
  all.addEventListener('click', function(e) { go('program/risk', e); });
  head.appendChild(all);
  container.appendChild(head);

  const map = riskHeatmap(risks, severity, function(fm, e) { go('doc/' + fm.path, e); });
  if (map) container.appendChild(map);
}

/* Whose program this is. It used to be a Reference page called About, which
   put instance data behind a menu of framework documentation — the one thing
   Reference is not. The panel is metadata about the thing you are looking at,
   and on the landing page that thing is the instance. */
function renderOrganisation() {
  const org = state.config.organization;
  rightEl.appendChild(mk('h3', '', 'Organization'));
  if (!org) {
    rightEl.appendChild(mk('div', 'right-note-sm',
      'Add an organization section to program/config.yml.'));
    appendAttribution();
    return;
  }

  rightEl.appendChild(mk('div', 'home-org-title', org.legal_name || state.config.name));

  const tags = [];
  if (Array.isArray(org.jurisdictions) && org.jurisdictions.length) {
    tags.push(org.jurisdictions.map(function(j) {
      /* The value is an id — `united-states` — and printing it with one capital
         letter reads as a typo rather than as a country. */
      return String(j).split('-').map(function(word) {
        return word.charAt(0).toUpperCase() + word.slice(1);
      }).join(' ');
    }).join(', '));
  }
  if (org.regulator) tags.push(org.regulator + '-regulated');
  if (org.industry) tags.push(org.industry);
  if (org.headcount) tags.push('~' + org.headcount + ' people');
  if (tags.length) rightEl.appendChild(mk('div', 'home-org-meta', tags.join(' · ')));
  if (org.description) rightEl.appendChild(mk('div', 'home-org-desc', org.description.trim()));

  const fws = state.config.frameworks;
  if (fws && fws.length) {
    rightEl.appendChild(mk('h3', '', 'In scope'));
    fws.forEach(function(fw) {
      if (!fw || !fw.id || !fw.name) return;
      const row = mk('div', 'home-org-fw clickable');
      row.appendChild(mk('span', 'home-org-fw-name', fw.name));
      if (fw.binding) {
        const badge = mk('span', 'pill', fw.binding);
        if (fw.binding === 'mandatory') { badge.style.borderColor = 'var(--accent)'; badge.style.color = 'var(--accent)'; }
        badge.title = BINDING_NOTE[fw.binding] || '';
        row.appendChild(badge);
      }
      row.addEventListener('click', function(e) { go('compliance/' + fw.id, e); });
      rightEl.appendChild(row);
    });
  }

  rightEl.appendChild(mk('h3', '', 'Instance'));
  if (state.config.repo) rightEl.appendChild(mkMetaRow('Repository', state.config.repo));
  if (org.license) rightEl.appendChild(mkMetaRow('License', org.license));
  rightEl.appendChild(mkMetaRow('Source', 'program/config.yml'));
  appendAttribution();
}

/* Upstream attribution, required by Apache-2.0 section 4(d): this site is a
   redistribution of the framework's schemas and reference documents. */
function appendAttribution() {
  rightEl.appendChild(mk('h3', '', 'Framework'));
  const link = mk('a', 'about-fw-link', 'Kilagen');
  link.href = 'https://github.com/kilagenhq/kilagen';
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  const row = mk('div', 'meta-row');
  row.appendChild(link);
  row.appendChild(document.createTextNode(' · Apache-2.0'));
  rightEl.appendChild(row);
}

export function renderHome() {
  setActiveView('home');
  mainEl.textContent = '';
  rightEl.textContent = '';
  showRightPanel();

  const docs = Object.values(state.fmCache);
  const openGaps = docs.filter(isOpenGap);
  const liveExceptions = docs.filter(function(fm) { return isLiveException(fm); });
  const overdue = docs.filter(function(fm) {
    const d = daysUntil(fm.next_review);
    return d !== null && d < 0;
  });

  const tiles = mk('div', 'home-tiles');
  tiles.appendChild(tile('Documents', docs.length, 'program'));
  tiles.appendChild(tile('Open gaps', openGaps.length, 'program/gap', 'warn'));
  tiles.appendChild(tile('Live exceptions', liveExceptions.length, 'program/exception'));
  tiles.appendChild(tile('Overdue reviews', overdue.length, 'schedule?tab=reviews', 'bad'));
  mainEl.appendChild(tiles);

  renderCoverage(mainEl);
  renderRisks(mainEl);
  renderOrganisation();
}
