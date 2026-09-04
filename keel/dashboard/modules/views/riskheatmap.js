import { mk, mkEmpty, mkMetaRow } from '../dom.js';
import { state } from '../state.js';
import { go, setActiveView, setBread, mainEl, rightEl } from '../nav.js';
import { HEAT_LEVELS as LEVELS, HEAT_LEVEL_LABELS as LEVEL_LABELS, HEAT_COLORS, CRIT_COLORS } from '../constants.js';

export function renderRiskHeatmap() {
  setActiveView('riskheatmap'); mainEl.textContent = ''; rightEl.textContent = ''; setBread([{ label: 'Risk Heatmap' }]);
  mainEl.appendChild(mk('h1', '', 'Risk Heatmap'));
  mainEl.appendChild(mk('p', '', 'Severity × Likelihood matrix. Click a cell to see its risks.'));

  const risks = [];
    Object.keys(state.fmCache).forEach(function(p) {
      const fm = state.fmCache[p];
      if (fm && fm.type === 'risk') risks.push({ path: p, fm: fm });
    });

    if (!risks.length) {
      mainEl.appendChild(mkEmpty('risk', 'No risks found', 'Create RSK-*.md files in 01-grc/risks/ to populate this heatmap.'));
      return;
    }

    // Build grid: likelihood (x) × severity (y), both from low to critical
    const grid = {};
    risks.forEach(function(r) {
      let li = LEVELS.indexOf(String(r.fm.likelihood).toLowerCase());
      let si = LEVELS.indexOf(String(r.fm.severity).toLowerCase());
      if (li === -1) li = LEVELS.indexOf('medium');
      if (si === -1) si = LEVELS.indexOf('medium');
      const key = si + ',' + li;
      if (!grid[key]) grid[key] = [];
      grid[key].push(r);
    });

    // Render heatmap table inside a flex wrapper with axis labels
    const wrapper = mk('div', 'heatmap-wrapper');
    const yLabel = mk('div', 'heatmap-y-label', 'Severity');
    wrapper.appendChild(yLabel);

    const tableBox = mk('div');
    const table = mk('table', 'heatmap-table');
    const thead = mk('thead');
    const hrow = mk('tr');
    hrow.appendChild(mk('th', 'heatmap-corner', ''));
    LEVELS.forEach(function(l) { hrow.appendChild(mk('th', 'heatmap-header', LEVEL_LABELS[l])); });
    thead.appendChild(hrow);
    table.appendChild(thead);

    const tbody = mk('tbody');
    for (let si = LEVELS.length - 1; si >= 0; si--) {
      const row = mk('tr');
      row.appendChild(mk('td', 'heatmap-row-label', LEVEL_LABELS[LEVELS[si]]));
      for (let li = 0; li < LEVELS.length; li++) {
        const key = si + ',' + li;
        const cell = mk('td', 'heatmap-cell');
        cell.style.background = HEAT_COLORS[key] || 'var(--bg2)';
        const items = grid[key] || [];
        if (items.length) {
          cell.appendChild(mk('span', 'heatmap-count', String(items.length)));
          cell.style.cursor = 'pointer';
          (function(cellItems) {
            cell.addEventListener('click', function() { showCellRisks(cellItems); });
          })(items);
        }
        row.appendChild(cell);
      }
      tbody.appendChild(row);
    }
    table.appendChild(tbody);
    tableBox.appendChild(table);
    tableBox.appendChild(mk('div', 'heatmap-x-label', 'Likelihood \u2192'));
    wrapper.appendChild(tableBox);
    mainEl.appendChild(wrapper);

    // Risk list below
    const listSection = mk('div', 'risk-list-section');
    listSection.appendChild(mk('h2', '', 'All risks'));
    risks.sort(function(a, b) {
      const sa = LEVELS.indexOf(String(a.fm.severity).toLowerCase());
      const sb = LEVELS.indexOf(String(b.fm.severity).toLowerCase());
      return sb - sa;
    });
    risks.forEach(function(r) {
      const item = mk('div', 'gap-item');
      item.style.cursor = 'pointer';
      const h = mk('h4', '', (r.fm.title || r.fm.id));
      const sevBadge = mk('span', 'severity-badge');
      sevBadge.textContent = ' ' + (r.fm.severity || '');
      sevBadge.style.color = CRIT_COLORS[r.fm.severity] || 'var(--fg3)';
      h.appendChild(sevBadge);
      item.appendChild(h);
      if (r.fm.description) item.appendChild(mk('p', '', String(r.fm.description).trim().substring(0, 150)));
      item.addEventListener('click', function(e) { go('doc/' + r.path, e); });
      listSection.appendChild(item);
    });
    mainEl.appendChild(listSection);

    // Right panel
    rightEl.appendChild(mk('h3', '', 'Summary'));
    const stats = [['Total risks', risks.length]];
    const bySev = {};
    risks.forEach(function(r) { const s = r.fm.severity || 'unknown'; bySev[s] = (bySev[s] || 0) + 1; });
    LEVELS.slice().reverse().forEach(function(l) { if (bySev[l]) stats.push([LEVEL_LABELS[l], bySev[l]]); });
    stats.forEach(function(s) {
      rightEl.appendChild(mkMetaRow(s[0], String(s[1])));
    });

    function showCellRisks(items) {
      rightEl.textContent = '';
      rightEl.appendChild(mk('h3', '', items.length + ' risk(s) in cell'));
      items.forEach(function(r) {
        const card = mk('div', 'meta-row');
        const link = mk('span', 'compliance-link', r.fm.title || r.fm.id);
        link.addEventListener('click', function(e) { go('doc/' + r.path, e); });
        card.appendChild(link);
        rightEl.appendChild(card);
      });
    }
}
