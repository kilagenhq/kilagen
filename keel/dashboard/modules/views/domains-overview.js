import { mk, matLvl, mkMetaRow } from '../dom.js';
import { state } from '../state.js';
import { go, setActiveView, setBread, mainEl, rightEl } from '../nav.js';
import { DOMAINS } from '../constants.js';

export function renderDomainsOverview() {
  setActiveView('domains'); mainEl.textContent = ''; rightEl.textContent = '';
  setBread([{ label: 'Domains' }]);
  mainEl.appendChild(mk('h1', '', 'Security Domains'));
  var domChart = mk('div', 'mat-domain-chart');
  DOMAINS.filter(function(d) { return d.dir !== '01-grc'; }).forEach(function(d) {
    var dc = state.domainCaps[d.dir];
    if (!dc) return;
    var keys = Object.keys(dc);
    if (!keys.length) return;
    var sum = 0;
    keys.forEach(function(c) { sum += matLvl(dc[c].maturity); });
    var avg = Math.round(sum / keys.length * 10) / 10;
    var pct = (avg / 5) * 100;
    var colorLvl = Math.round(avg);

    var row = mk('div', 'mat-chart-row');
    row.style.cursor = 'pointer';
    row.addEventListener('click', function(e) { go('domain/' + d.dir, e); });
    row.appendChild(mk('span', 'mat-chart-label', d.label));
    var track = mk('div', 'mat-chart-track');
    var bar = mk('div', 'mat-chart-bar');
    bar.style.width = pct + '%'; bar.style.background = 'var(--mat' + colorLvl + ')';
    track.appendChild(bar); row.appendChild(track);
    var val = mk('span', 'mat-chart-val', 'L' + avg);
    val.style.color = 'var(--mat' + colorLvl + ')';
    row.appendChild(val);
    domChart.appendChild(row);
  });
  mainEl.appendChild(domChart);

  // === Analytical view cards (3-col row) ===
  var linksGrid = mk('div', 'doc-info-grid'); linksGrid.style.gridTemplateColumns = 'repeat(3, 1fr)';

  var cards = [
    { title: 'Lenses', desc: 'NIST CSF 2.0 coverage wheel \u2014 categories covered, partial, or gaps.', route: 'nist-csf' },
    { title: 'Maturity detail', desc: 'Per-capability maturity levels across all domains with level filter.', route: 'maturity' },
    { title: 'Compare domains', desc: 'Side-by-side radar charts and maturity distributions for 2-3 domains.', route: 'compare' }
  ];
  cards.forEach(function(c) {
    var card = mk('div', 'doc-info-card'); card.style.cursor = 'pointer';
    card.appendChild(mk('h4', '', c.title));
    card.appendChild(mk('p', '', c.desc));
    card.addEventListener('click', function(e) { go(c.route, e); });
    linksGrid.appendChild(card);
  });
  mainEl.appendChild(linksGrid);

  // === Right panel ===
  rightEl.appendChild(mk('h3', '', 'Summary'));
  var totalCaps = 0, totalMat = 0, domCount = 0;
  DOMAINS.filter(function(d) { return d.dir !== '01-grc'; }).forEach(function(d) {
    var dc = state.domainCaps[d.dir]; if (!dc) return;
    var keys = Object.keys(dc); if (!keys.length) return;
    domCount++;
    keys.forEach(function(c) { totalCaps++; totalMat += matLvl(dc[c].maturity); });
  });
  var overallAvg = totalCaps ? Math.round(totalMat / totalCaps * 10) / 10 : 0;
  [['Domains', String(domCount)], ['Total capabilities', String(totalCaps)], ['Avg maturity', 'L' + overallAvg]].forEach(function(s) {
    rightEl.appendChild(mkMetaRow(s[0], s[1]));
  });

  rightEl.appendChild(mk('h3', '', 'Maturity distribution'));
  var dist = [0, 0, 0, 0, 0, 0];
  DOMAINS.filter(function(d) { return d.dir !== '01-grc'; }).forEach(function(d) {
    var dc = state.domainCaps[d.dir]; if (!dc) return;
    Object.keys(dc).forEach(function(c) { dist[matLvl(dc[c].maturity)]++; });
  });
  for (var i = 0; i <= 5; i++) {
    var r = mk('div', 'meta-row');
    var key = mk('span', 'meta-key', 'L' + i); key.style.color = 'var(--mat' + i + ')';
    r.appendChild(key); r.appendChild(mk('span', 'meta-val', String(dist[i]))); rightEl.appendChild(r);
  }
}
