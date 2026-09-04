import { mk, mkEmpty, mkMetaRow } from '../dom.js';
import { state } from '../state.js';
import { go, setActiveView, setBread, mainEl, rightEl } from '../nav.js';
import { CRIT_ORDER, CRIT_COLORS } from '../constants.js';
var CLASS_COLORS = { confidential: 'var(--sev-critical)', restricted: 'var(--sev-high)', internal: 'var(--sev-medium)', public: 'var(--sev-low)' };

export function renderDataAssets() {
  setActiveView('data-assets'); mainEl.textContent = ''; rightEl.textContent = ''; setBread([{ label: 'Data Assets' }]);
  mainEl.appendChild(mk('h1', '', 'Data Assets'));
  mainEl.appendChild(mk('p', '', 'Information asset inventory. Click a card to view the full assessment.'));

  var assets = [];
  Object.keys(state.fmCache).forEach(function(p) {
    var fm = state.fmCache[p];
    if (fm && fm.type === 'data-asset') assets.push({ path: p, fm: fm });
  });

  if (!assets.length) {
    mainEl.appendChild(mkEmpty('data-asset', 'No data assets found', 'Create DA-*.md files in data-assets/ to populate this inventory.'));
    return;
  }

  assets.sort(function(a, b) {
    var ca = CRIT_ORDER[a.fm.criticality] !== undefined ? CRIT_ORDER[a.fm.criticality] : 99;
    var cb = CRIT_ORDER[b.fm.criticality] !== undefined ? CRIT_ORDER[b.fm.criticality] : 99;
    return ca - cb;
  });

  // Filter bar
  var activeClass = {};
  var activeCrit = {};
  var classes = {};
  var crits = {};
  assets.forEach(function(a) {
    var c = a.fm.classification || 'unknown';
    classes[c] = (classes[c] || 0) + 1;
    var cr = a.fm.criticality || 'unknown';
    crits[cr] = (crits[cr] || 0) + 1;
  });

  var filterBar = mk('div', 'graph-filter-bar');
  filterBar.appendChild(mk('span', 'filter-label', 'Classification: '));
  Object.keys(classes).sort().forEach(function(c) {
    var btn = mk('button', '', c + ' (' + classes[c] + ')');
    btn.addEventListener('click', function() {
      if (activeClass[c]) { delete activeClass[c]; btn.classList.remove('active'); }
      else { activeClass[c] = true; btn.classList.add('active'); }
      renderCards();
    });
    filterBar.appendChild(btn);
  });
  mainEl.appendChild(filterBar);

  var critBar = mk('div', 'graph-filter-bar');
  critBar.appendChild(mk('span', 'filter-label', 'Criticality: '));
  Object.keys(crits).sort(function(a, b) { return (CRIT_ORDER[a] || 99) - (CRIT_ORDER[b] || 99); }).forEach(function(c) {
    var btn = mk('button', '', c + ' (' + crits[c] + ')');
    btn.addEventListener('click', function() {
      if (activeCrit[c]) { delete activeCrit[c]; btn.classList.remove('active'); }
      else { activeCrit[c] = true; btn.classList.add('active'); }
      renderCards();
    });
    critBar.appendChild(btn);
  });
  mainEl.appendChild(critBar);

  var grid = mk('div', 'vendor-grid');
  mainEl.appendChild(grid);

  function renderCards() {
    grid.textContent = '';
    var hasClassFilter = Object.keys(activeClass).length > 0;
    var hasCritFilter = Object.keys(activeCrit).length > 0;
    var filtered = assets.filter(function(a) {
      return (!hasClassFilter || activeClass[a.fm.classification || 'unknown']) && (!hasCritFilter || activeCrit[a.fm.criticality || 'unknown']);
    });

    filtered.forEach(function(a) {
      var card = mk('div', 'vendor-card');
      card.style.cursor = 'pointer';
      card.addEventListener('click', function(e) { go('doc/' + a.path, e); });

      var stripe = mk('div', 'vendor-stripe');
      stripe.style.background = CLASS_COLORS[a.fm.classification] || 'var(--fg3)';
      card.appendChild(stripe);

      var body = mk('div', 'vendor-body');
      body.appendChild(mk('h3', '', a.fm.title || a.fm.id));

      var badges = mk('div', 'vendor-certs');
      if (a.fm.classification) {
        var classBadge = mk('span', 'vendor-cert-badge');
        classBadge.textContent = a.fm.classification;
        classBadge.style.color = CLASS_COLORS[a.fm.classification] || 'var(--fg3)';
        badges.appendChild(classBadge);
      }
      if (a.fm.criticality) {
        var critBadge = mk('span', 'vendor-cert-badge');
        critBadge.textContent = a.fm.criticality;
        critBadge.style.color = CRIT_COLORS[a.fm.criticality] || 'var(--fg3)';
        badges.appendChild(critBadge);
      }
      if (a.fm.pii) {
        var piiBadge = mk('span', 'vendor-cert-badge');
        piiBadge.textContent = 'PII';
        piiBadge.style.color = 'var(--sev-high)';
        badges.appendChild(piiBadge);
      }
      body.appendChild(badges);

      if (a.fm.description) {
        body.appendChild(mk('p', 'vendor-desc', String(a.fm.description).trim().substring(0, 120)));
      }

      card.appendChild(body);
      grid.appendChild(card);
    });
  }
  renderCards();

  // Right panel — stats
  rightEl.appendChild(mk('h3', '', 'Summary'));
  var stats = [['Total assets', assets.length]];
  var piiCount = assets.filter(function(a) { return a.fm.pii; }).length;
  stats.push(['PII assets', piiCount]);
  Object.keys(classes).sort().forEach(function(c) { stats.push([c, classes[c]]); });
  stats.forEach(function(s) { rightEl.appendChild(mkMetaRow(s[0], String(s[1]))); });

  rightEl.appendChild(mk('h3', '', 'By criticality'));
  Object.keys(crits).sort(function(a, b) { return (CRIT_ORDER[a] || 99) - (CRIT_ORDER[b] || 99); }).forEach(function(c) {
    rightEl.appendChild(mkMetaRow(c, String(crits[c])));
  });
}
