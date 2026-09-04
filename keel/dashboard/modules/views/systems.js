import { mk, mkEmpty, mkIcon, mkMetaRow, roleTitle } from '../dom.js';
import { state } from '../state.js';
import { go, setActiveView, setBread, mainEl, rightEl } from '../nav.js';
import { DOMAINS, CRIT_COLORS } from '../constants.js';

var CAT_LABELS = { 'security-tool': 'Security Tool', 'business-app': 'Business App', 'infrastructure': 'Infrastructure' };
var DEPLOY_LABELS = { saas: 'SaaS', iaas: 'IaaS', 'self-hosted': 'Self-hosted', hybrid: 'Hybrid' };

export function renderSystems() {
  setActiveView('systems'); mainEl.textContent = ''; rightEl.textContent = ''; setBread([{ label: 'Systems' }]);
  mainEl.appendChild(mk('h1', '', 'Systems'));

  var systems = [];
  state.allDocs.filter(function(d) { return d.path.startsWith('systems/SYS-'); }).forEach(function(d) {
    var fm = state.fmCache[d.path];
    if (fm) systems.push({ path: d.path, fm: fm });
  });

  if (!systems.length) { mainEl.appendChild(mkEmpty('system', 'No systems yet', 'Create SYS-*.md files in /systems/.')); return; }

  systems.sort(function(a, b) { return (a.fm.title || a.fm.id || '').localeCompare(b.fm.title || b.fm.id || ''); });

  // Filter state
  var filters = { domain: {}, category: {}, deployment: {}, criticality: {}, owner: {}, status: {}, auth: {} };

  // Collect filter counts
  var counts = { domain: {}, category: {}, deployment: {}, criticality: {}, owner: {}, status: {}, auth: {} };
  systems.forEach(function(s) {
    (s.fm.domains || []).forEach(function(d) { counts.domain[d] = (counts.domain[d] || 0) + 1; });
    if (s.fm.category) counts.category[s.fm.category] = (counts.category[s.fm.category] || 0) + 1;
    if (s.fm.deployment) counts.deployment[s.fm.deployment] = (counts.deployment[s.fm.deployment] || 0) + 1;
    if (s.fm.owner) counts.owner[s.fm.owner] = (counts.owner[s.fm.owner] || 0) + 1;
    if (s.fm.status) counts.status[s.fm.status] = (counts.status[s.fm.status] || 0) + 1;
    var gov = s.fm.governance || {};
    if (gov.criticality) counts.criticality[gov.criticality] = (counts.criticality[gov.criticality] || 0) + 1;
    if (gov.auth) counts.auth[gov.auth] = (counts.auth[gov.auth] || 0) + 1;
  });

  // Build filter bars
  var toolbar = mk('div', 'browse-toolbar');

  function addFilterRow(label, filterKey, sortedKeys, labelFn) {
    if (Object.keys(counts[filterKey]).length < 2) return;
    var sec = mk('div', 'browse-filter-section');
    sec.appendChild(mk('span', 'browse-filter-label', label));
    var chips = mk('div', 'cap-res-chips');
    sortedKeys.forEach(function(k) {
      if (!counts[filterKey][k]) return;
      var chip = mk('button', 'cap-res-chip', (labelFn ? labelFn(k) : k) + ' (' + counts[filterKey][k] + ')');
      if (filterKey === 'criticality') chip.style.setProperty('--chip-color', CRIT_COLORS[k] || 'var(--fg3)');
      chip.addEventListener('click', function() {
        if (filters[filterKey][k]) delete filters[filterKey][k]; else filters[filterKey][k] = true;
        chip.classList.toggle('active', !!filters[filterKey][k]);
        render();
      });
      chips.appendChild(chip);
    });
    sec.appendChild(chips);
    toolbar.appendChild(sec);
  }

  addFilterRow('Category', 'category', Object.keys(counts.category).sort(), function(c) { return CAT_LABELS[c] || c; });
  addFilterRow('Deployment', 'deployment', Object.keys(counts.deployment).sort(), function(d) { return DEPLOY_LABELS[d] || d; });
  addFilterRow('Owner', 'owner', Object.keys(counts.owner).sort(), roleTitle);
  addFilterRow('Criticality', 'criticality', ['critical', 'high', 'medium', 'low']);
  addFilterRow('Auth', 'auth', Object.keys(counts.auth).sort());
  addFilterRow('Domain', 'domain', Object.keys(counts.domain).sort(), function(d) { var dObj = DOMAINS.find(function(dd) { return dd.dir === d || dd.dir.endsWith('-' + d); }); return dObj ? dObj.label : d; });
  addFilterRow('Status', 'status', Object.keys(counts.status).sort());

  mainEl.appendChild(toolbar);

  var container = mk('div', '');
  mainEl.appendChild(container);

  function getFiltered() {
    return systems.filter(function(s) {
      var gov = s.fm.governance || {};
      if (Object.keys(filters.domain).length && !(s.fm.domains || []).some(function(d) { return filters.domain[d]; })) return false;
      if (Object.keys(filters.category).length && !filters.category[s.fm.category]) return false;
      if (Object.keys(filters.deployment).length && !filters.deployment[s.fm.deployment]) return false;
      if (Object.keys(filters.criticality).length && !filters.criticality[gov.criticality]) return false;
      if (Object.keys(filters.owner).length && !filters.owner[s.fm.owner]) return false;
      if (Object.keys(filters.status).length && !filters.status[s.fm.status]) return false;
      if (Object.keys(filters.auth).length && !filters.auth[gov.auth]) return false;
      return true;
    });
  }

  function render() {
    container.textContent = '';
    var filtered = getFiltered();
    if (!filtered.length) { container.appendChild(mkEmpty('search', 'No systems match filters', 'Try adjusting your filters.')); renderStats(filtered); return; }

    var tbl = mk('table', 'compliance-table browse-table');
    var thead = mk('thead'); var hr = mk('tr');
    ['System', 'Category', 'Deployment', 'Owner', 'Second Owner', 'Criticality', 'C', 'I', 'A', 'RTO', 'RPO', 'Auth', 'Domains', 'Data Assets'].forEach(function(h) { hr.appendChild(mk('th', '', h)); });
    thead.appendChild(hr); tbl.appendChild(thead);
    var tbody = mk('tbody');
    filtered.forEach(function(s) {
      var tr = mk('tr'); tr.style.cursor = 'pointer';
      tr.addEventListener('click', function(e) { go('sys/' + s.path.replace('systems/', ''), e); });
      var gov = s.fm.governance || {};
      var cia = gov.cia || {};

      // System
      var nameCell = mk('td');
      var nameWrap = mk('div', ''); nameWrap.style.display = 'flex'; nameWrap.style.alignItems = 'center'; nameWrap.style.gap = '6px';
      nameWrap.appendChild(mkIcon('system', 'browse-type-icon'));
      nameWrap.appendChild(mk('span', 'compliance-link', s.fm.title || s.fm.id));
      nameCell.appendChild(nameWrap);
      tr.appendChild(nameCell);

      // Category
      tr.appendChild(mk('td', '', CAT_LABELS[s.fm.category] || s.fm.category || '-'));

      // Deployment
      tr.appendChild(mk('td', '', DEPLOY_LABELS[s.fm.deployment] || s.fm.deployment || '-'));

      // Owner
      tr.appendChild(mk('td', '', roleTitle(s.fm.owner) || '-'));

      // Second Owner
      tr.appendChild(mk('td', '', roleTitle(s.fm.second_owner) || '-'));

      // Criticality
      var crit = gov.criticality;
      var critCell = mk('td');
      if (crit) { critCell.textContent = crit; critCell.style.color = CRIT_COLORS[crit] || 'var(--fg)'; critCell.style.fontWeight = '600'; }
      else { critCell.textContent = '-'; critCell.style.color = 'var(--fg3)'; }
      tr.appendChild(critCell);

      // CIA
      ['confidentiality', 'integrity', 'availability'].forEach(function(dim) {
        var val = cia[dim];
        var cell = mk('td');
        if (val) { cell.textContent = val.charAt(0).toUpperCase(); cell.title = dim + ': ' + val; cell.style.color = CRIT_COLORS[val] || 'var(--fg)'; cell.style.fontWeight = '600'; }
        else { cell.textContent = '-'; cell.style.color = 'var(--fg3)'; }
        tr.appendChild(cell);
      });

      // RTO / RPO
      tr.appendChild(mk('td', '', gov.rto || '-'));
      tr.appendChild(mk('td', '', gov.rpo || '-'));

      // Auth
      tr.appendChild(mk('td', '', gov.auth || '-'));

      // Domains
      var domCell = mk('td');
      (s.fm.domains || []).forEach(function(d, i) { var dObj = DOMAINS.find(function(dd) { return dd.dir === d || dd.dir.endsWith('-' + d); }); if (i) domCell.appendChild(document.createTextNode(', ')); domCell.appendChild(document.createTextNode(dObj ? dObj.label : d)); });
      tr.appendChild(domCell);

      // Data Assets
      var daCell = mk('td');
      var das = gov.data_assets || [];
      if (das.length) {
        das.forEach(function(daId, i) {
          if (i) daCell.appendChild(document.createTextNode(', '));
          var daPath = state.idToPath[daId];
          var link = mk('span', 'compliance-link', daId.replace('DA-', ''));
          if (daPath) {
            link.addEventListener('click', function(e) { e.stopPropagation(); go('doc/' + daPath, e); });
          } else {
            link.style.color = 'var(--fg3)';
            link.title = 'Not found in the program';
          }
          daCell.appendChild(link);
        });
      } else { daCell.textContent = '-'; daCell.style.color = 'var(--fg3)'; }
      tr.appendChild(daCell);

      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    container.appendChild(tbl);
    renderStats(filtered);
  }

  function renderStats(filtered) {
    rightEl.textContent = '';
    rightEl.appendChild(mk('h3', '', 'Summary'));
    rightEl.appendChild(mkMetaRow('Total', String(filtered.length)));
    rightEl.appendChild(mk('h3', '', 'By category'));
    var cc = {};
    filtered.forEach(function(s) { var c = s.fm.category || 'unknown'; cc[c] = (cc[c] || 0) + 1; });
    Object.keys(cc).sort().forEach(function(c) { rightEl.appendChild(mkMetaRow(CAT_LABELS[c] || c, String(cc[c]))); });
    rightEl.appendChild(mk('h3', '', 'By deployment'));
    var dc = {};
    filtered.forEach(function(s) { var d = s.fm.deployment || 'unknown'; dc[d] = (dc[d] || 0) + 1; });
    Object.keys(dc).sort().forEach(function(d) { rightEl.appendChild(mkMetaRow(DEPLOY_LABELS[d] || d, String(dc[d]))); });
    var hasCrit = filtered.some(function(s) { return s.fm.governance && s.fm.governance.criticality; });
    if (hasCrit) {
      rightEl.appendChild(mk('h3', '', 'By criticality'));
      var crc = {};
      filtered.forEach(function(s) { var c = s.fm.governance && s.fm.governance.criticality; if (c) crc[c] = (crc[c] || 0) + 1; });
      ['critical', 'high', 'medium', 'low'].forEach(function(c) { if (!crc[c]) return; var row = mk('div', 'meta-row'); var key = mk('span', 'meta-key', c); key.style.color = CRIT_COLORS[c] || 'var(--fg)'; row.appendChild(key); row.appendChild(mk('span', 'meta-val', String(crc[c]))); rightEl.appendChild(row); });
    }
  }

  render();
}
