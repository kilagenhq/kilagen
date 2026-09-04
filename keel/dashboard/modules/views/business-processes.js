import { mk, mkEmpty, mkMetaRow } from '../dom.js';
import { state } from '../state.js';
import { go, setActiveView, setBread, mainEl, rightEl } from '../nav.js';
import { CRIT_ORDER, CRIT_COLORS } from '../constants.js';

export function renderBusinessProcesses() {
  setActiveView('business-processes'); mainEl.textContent = ''; rightEl.textContent = ''; setBread([{ label: 'Business Processes' }]);
  mainEl.appendChild(mk('h1', '', 'Business Processes'));
  mainEl.appendChild(mk('p', '', 'Key business process inventory with impact analysis. Click a card to view details.'));

  var procs = [];
  Object.keys(state.fmCache).forEach(function(p) {
    var fm = state.fmCache[p];
    if (fm && fm.type === 'business-process') procs.push({ path: p, fm: fm });
  });

  if (!procs.length) {
    mainEl.appendChild(mkEmpty('business-process', 'No business processes found', 'Create BP-*.md files in business-processes/ to populate this inventory.'));
    return;
  }

  procs.sort(function(a, b) {
    var ca = CRIT_ORDER[a.fm.criticality] !== undefined ? CRIT_ORDER[a.fm.criticality] : 99;
    var cb = CRIT_ORDER[b.fm.criticality] !== undefined ? CRIT_ORDER[b.fm.criticality] : 99;
    return ca - cb;
  });

  // Filter bar — by business function
  var activeFunc = {};
  var activeCrit = {};
  var funcs = {};
  var crits = {};
  procs.forEach(function(p) {
    var f = p.fm.business_function || 'unknown';
    funcs[f] = (funcs[f] || 0) + 1;
    var c = p.fm.criticality || 'unknown';
    crits[c] = (crits[c] || 0) + 1;
  });

  if (Object.keys(funcs).length > 1) {
    var funcBar = mk('div', 'graph-filter-bar');
    funcBar.appendChild(mk('span', 'filter-label', 'Function: '));
    Object.keys(funcs).sort().forEach(function(f) {
      var btn = mk('button', '', f + ' (' + funcs[f] + ')');
      btn.addEventListener('click', function() {
        if (activeFunc[f]) { delete activeFunc[f]; btn.classList.remove('active'); }
        else { activeFunc[f] = true; btn.classList.add('active'); }
        renderCards();
      });
      funcBar.appendChild(btn);
    });
    mainEl.appendChild(funcBar);
  }

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
    var hasFuncFilter = Object.keys(activeFunc).length > 0;
    var hasCritFilter = Object.keys(activeCrit).length > 0;
    var filtered = procs.filter(function(p) {
      return (!hasFuncFilter || activeFunc[p.fm.business_function || 'unknown']) && (!hasCritFilter || activeCrit[p.fm.criticality || 'unknown']);
    });

    filtered.forEach(function(p) {
      var card = mk('div', 'vendor-card');
      card.style.cursor = 'pointer';
      card.addEventListener('click', function(e) { go('doc/' + p.path, e); });

      var stripe = mk('div', 'vendor-stripe');
      stripe.style.background = CRIT_COLORS[p.fm.criticality] || 'var(--fg3)';
      card.appendChild(stripe);

      var body = mk('div', 'vendor-body');
      body.appendChild(mk('h3', '', p.fm.title || p.fm.id));

      var badges = mk('div', 'vendor-certs');
      if (p.fm.business_function) {
        badges.appendChild(mk('span', 'vendor-cert-badge', p.fm.business_function));
      }
      if (p.fm.criticality) {
        var critBadge = mk('span', 'vendor-cert-badge');
        critBadge.textContent = p.fm.criticality;
        critBadge.style.color = CRIT_COLORS[p.fm.criticality] || 'var(--fg3)';
        badges.appendChild(critBadge);
      }
      if (p.fm.customer_facing) {
        badges.appendChild(mk('span', 'vendor-cert-badge', 'customer-facing'));
      }
      if (p.fm.rto) {
        badges.appendChild(mk('span', 'vendor-cert-badge', 'RTO: ' + p.fm.rto));
      }
      if (p.fm.managed_externally) {
        var extBadge = mk('span', 'vendor-cert-badge');
        extBadge.textContent = 'external \u2197';
        extBadge.style.color = 'var(--accent)';
        badges.appendChild(extBadge);
      }
      body.appendChild(badges);

      if (p.fm.description) {
        body.appendChild(mk('p', 'vendor-desc', String(p.fm.description).trim().substring(0, 120)));
      }

      card.appendChild(body);
      grid.appendChild(card);
    });
  }
  renderCards();

  // Right panel — stats
  rightEl.appendChild(mk('h3', '', 'Summary'));
  var stats = [['Total processes', procs.length]];
  var cfCount = procs.filter(function(p) { return p.fm.customer_facing; }).length;
  stats.push(['Customer-facing', cfCount]);
  var extCount = procs.filter(function(p) { return p.fm.managed_externally; }).length;
  stats.push(['Managed externally', extCount]);
  stats.forEach(function(s) { rightEl.appendChild(mkMetaRow(s[0], String(s[1]))); });

  rightEl.appendChild(mk('h3', '', 'By criticality'));
  Object.keys(crits).sort(function(a, b) { return (CRIT_ORDER[a] || 99) - (CRIT_ORDER[b] || 99); }).forEach(function(c) {
    rightEl.appendChild(mkMetaRow(c, String(crits[c])));
  });

  rightEl.appendChild(mk('h3', '', 'By function'));
  Object.keys(funcs).sort().forEach(function(f) {
    rightEl.appendChild(mkMetaRow(f, String(funcs[f])));
  });
}
