import { mk, matLvl, mkIcon, mkMetaRow } from '../dom.js';
import { state } from '../state.js';
import { go, setActiveView, setBread, mainEl, rightEl } from '../nav.js';
import { DOMAINS, stdNum } from '../constants.js';

export function renderHome() {
  setActiveView('home'); mainEl.textContent = ''; rightEl.textContent = ''; setBread([]);

  // Domains — card grid
  mainEl.appendChild(mk('h2', '', 'Domains'));
  var domGrid = mk('div', 'home-domain-grid');
  DOMAINS.filter(function(d) { return d.dir !== '01-grc'; }).forEach(function(d) {
    var dc = state.domainCaps[d.dir]; if (!dc || !Object.keys(dc).length) return;
    var total = Object.keys(dc).length;
    var ms = 0;
    Object.keys(dc).forEach(function(c) { ms += matLvl(dc[c].maturity); });
    var domAvg = Math.round(ms / total * 10) / 10;

    var card = mk('div', 'home-domain-card');
    card.addEventListener('click', function(e) { go('domain/' + d.dir, e); });

    var header = mk('div', 'home-domain-header');
    header.appendChild(mkIcon(d.iconType, 'home-domain-icon'));
    header.appendChild(mk('span', 'home-domain-name', d.label));
    card.appendChild(header);

    var stats = mk('div', 'home-domain-stats');
    var capStat = mk('span', '', total + ' caps');
    capStat.style.fontSize = '11px'; capStat.style.color = 'var(--fg3)';
    stats.appendChild(capStat);
    var matStat = mk('span', '', 'L' + domAvg);
    matStat.style.fontSize = '11px'; matStat.style.fontWeight = '600'; matStat.style.color = 'var(--mat' + Math.round(domAvg) + ')';
    stats.appendChild(matStat);
    card.appendChild(stats);

    domGrid.appendChild(card);
  });
  mainEl.appendChild(domGrid);

  // Policies & Standards
  var stds = [], pols = {};
  Object.keys(state.fmCache).forEach(function(p) {
    var fm = state.fmCache[p];
    if (!fm) return;
    if (fm.type === 'standard') stds.push({ path: p, fm: fm });
    if (fm.type === 'policy') pols[fm.id] = { path: p, fm: fm };
  });

  var grouped = {};
  var ungrouped = [];
  stds.forEach(function(s) {
    var polRef = (s.fm.related && s.fm.related.policies && s.fm.related.policies.length) ? s.fm.related.policies[0] : null;
    if (polRef && pols[polRef]) {
      if (!grouped[polRef]) grouped[polRef] = [];
      grouped[polRef].push(s);
    } else {
      ungrouped.push(s);
    }
  });

  mainEl.appendChild(mk('h2', '', 'Policies & Standards'));

  Object.keys(grouped).forEach(function(polId) {
    var pol = pols[polId];
    var polStds = grouped[polId].slice().sort(function(a, b) { return stdNum(a) - stdNum(b); });

    var group = mk('div', 'home-policy-group');
    var polHeader = mk('div', 'home-policy-header');
    polHeader.style.cursor = 'pointer';
    polHeader.addEventListener('click', function(e) { go('doc/' + pol.path, e); });
    polHeader.appendChild(mkIcon('policy', 'home-policy-icon'));
    var polInfo = mk('div', 'home-policy-info');
    polInfo.appendChild(mk('span', 'home-policy-title', pol.fm.title || polId));
    polInfo.appendChild(mk('span', 'home-policy-count', polStds.length + ' standard' + (polStds.length > 1 ? 's' : '')));
    polHeader.appendChild(polInfo);
    group.appendChild(polHeader);

    var stdList = mk('div', 'home-std-list');
    polStds.forEach(function(s) {
      var item = mk('div', 'home-std-item');
      item.addEventListener('click', function(e) { go('doc/' + s.path, e); });
      item.appendChild(mk('span', 'compliance-link', s.fm.title || s.fm.id));
      var reqs = s.fm.requirements || [];
      if (reqs.length) { var badge = mk('span', 'home-std-reqs', reqs.length + ' req'); item.appendChild(badge); }
      stdList.appendChild(item);
    });
    group.appendChild(stdList);
    mainEl.appendChild(group);
  });

  if (ungrouped.length) {
    var group = mk('div', 'home-policy-group');
    var polHeader = mk('div', 'home-policy-header');
    polHeader.appendChild(mkIcon('standard', 'home-policy-icon'));
    var polInfo = mk('div', 'home-policy-info');
    polInfo.appendChild(mk('span', 'home-policy-title', 'Other Standards'));
    polInfo.appendChild(mk('span', 'home-policy-count', ungrouped.length + ' standard' + (ungrouped.length > 1 ? 's' : '')));
    polHeader.appendChild(polInfo);
    group.appendChild(polHeader);
    var stdList = mk('div', 'home-std-list');
    ungrouped.sort(function(a, b) { return stdNum(a) - stdNum(b); }).forEach(function(s) {
      var item = mk('div', 'home-std-item');
      item.addEventListener('click', function(e) { go('doc/' + s.path, e); });
      item.appendChild(mk('span', 'compliance-link', s.fm.title || s.fm.id));
      var reqs = s.fm.requirements || [];
      if (reqs.length) { var badge = mk('span', 'home-std-reqs', reqs.length + ' req'); item.appendChild(badge); }
      stdList.appendChild(item);
    });
    group.appendChild(stdList);
    mainEl.appendChild(group);
  }

  // Right panel — Quick stats only
  rightEl.appendChild(mk('h3', '', 'Quick stats'));
  var totalCaps = 0, matSum = 0, matCount = 0, overdueReviews = 0;
  var today = new Date().toISOString().substring(0, 10);
  DOMAINS.filter(function(d) { return d.dir !== '01-grc'; }).forEach(function(d) {
    var dc = state.domainCaps[d.dir]; if (!dc) return;
    Object.keys(dc).forEach(function(c) {
      totalCaps++;
      matSum += matLvl(dc[c].maturity); matCount++;
    });
  });
  Object.keys(state.fmCache).forEach(function(p) {
    var fm = state.fmCache[p];
    if (!fm) return;
    if (fm.next_review && fm.next_review < today) overdueReviews++;
  });
  var avgMat = matCount ? Math.round(matSum / matCount * 10) / 10 : 0;
  var domCount = DOMAINS.filter(function(d) { return d.dir !== '01-grc' && state.domainCaps[d.dir] && Object.keys(state.domainCaps[d.dir]).length; }).length;
  [['Domains', String(domCount)], ['Capabilities', String(totalCaps)], ['Avg maturity', 'L' + avgMat], ['Policies', String(Object.keys(pols).length)], ['Standards', String(stds.length)], ['Overdue reviews', String(overdueReviews)]].forEach(function(s) {
    rightEl.appendChild(mkMetaRow(s[0], s[1]));
  });
}
