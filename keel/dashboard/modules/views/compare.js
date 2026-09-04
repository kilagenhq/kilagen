import { mk, matLvl, mkEmpty, mkMetaRow } from '../dom.js';
import { state } from '../state.js';
import { go, setActiveView, setBread, mainEl, rightEl } from '../nav.js';
import { DOMAINS } from '../constants.js';
import { renderRadar } from '../svg.js';

const MAT_KEYS = ['L0', 'L1', 'L2', 'L3', 'L4', 'L5'];
const MAT_COLORS = { L0: 'var(--mat0)', L1: 'var(--mat1)', L2: 'var(--mat2)', L3: 'var(--mat3)', L4: 'var(--mat4)', L5: 'var(--mat5)' };

function domainStats(dir) {
  const dc = state.domainCaps[dir];
  if (!dc) return null;
  const caps = Object.keys(dc);
  const total = caps.length; let matSum = 0; const matCounts = { L0: 0, L1: 0, L2: 0, L3: 0, L4: 0, L5: 0 };
  caps.forEach(function(c) {
    const lvl = matLvl(dc[c].maturity);
    matSum += lvl;
    matCounts['L' + lvl] = (matCounts['L' + lvl] || 0) + 1;
  });
  return { total: total, avgMat: total ? Math.round(matSum / total * 10) / 10 : 0, matCounts: matCounts };
}

export function renderCompare() {
  setActiveView('compare'); mainEl.textContent = ''; rightEl.textContent = ''; setBread([{ label: 'Domains', action: function() { go('domains'); } }, { label: 'Compare' }]);
  mainEl.appendChild(mk('h1', '', 'Compare domains'));
  mainEl.appendChild(mk('p', '', 'Select 2-3 domains to compare. Domains with fewer than 3 capabilities cannot render radars.'));
  const sel = mk('div', 'compare-selector'); const selected = [];
    DOMAINS.forEach(function(d) { const dc = state.domainCaps[d.dir]; if (!dc || !Object.keys(dc).length) return;
      const btn = mk('button', '', d.label);
      btn.addEventListener('click', function() {
        const idx = selected.indexOf(d.dir); if (idx !== -1) { selected.splice(idx, 1); btn.classList.remove('selected'); } else if (selected.length < 3) { selected.push(d.dir); btn.classList.add('selected'); }
        renderCompareContent(selected);
      }); sel.appendChild(btn);
    });
    if (!sel.children.length) { mainEl.appendChild(mkEmpty('chart', 'No domains with capabilities', 'Add capabilities.yml files to domain directories.')); return; }
    mainEl.appendChild(sel);
    mainEl.appendChild(mk('div', 'compare-content'));
}

function renderCompareContent(dirs) {
  const cont = mainEl.querySelector('.compare-content'); if (!cont) return; cont.textContent = '';
  if (dirs.length < 2) { cont.appendChild(mk('p', '', 'Select at least 2 domains.')); return; }

  // Comparison table
  const table = mk('table', 'compliance-table');
  const thead = mk('thead');
  const hrow = mk('tr');
  hrow.appendChild(mk('th', '', 'Metric'));
  dirs.forEach(function(dir) {
    const d = DOMAINS.find(function(dd) { return dd.dir === dir; });
    const th = mk('th', ''); th.style.cursor = 'pointer';
    th.textContent = d ? d.label : dir;
    th.addEventListener('click', function(e) { go('domain/' + dir, e); });
    hrow.appendChild(th);
  });
  thead.appendChild(hrow);
  table.appendChild(thead);

  const tbody = mk('tbody');
  const stats = dirs.map(function(dir) { return domainStats(dir); });

  // Total capabilities
  const row1 = mk('tr'); row1.appendChild(mk('td', '', 'Capabilities'));
  stats.forEach(function(s) { row1.appendChild(mk('td', '', s ? String(s.total) : '-')); });
  tbody.appendChild(row1);

  // Avg maturity
  const row2 = mk('tr'); row2.appendChild(mk('td', '', 'Avg maturity'));
  stats.forEach(function(s) { row2.appendChild(mk('td', '', s ? 'L' + s.avgMat : '-')); });
  tbody.appendChild(row2);

  // Maturity distribution rows
  MAT_KEYS.forEach(function(lvl) {
    const row = mk('tr'); row.appendChild(mk('td', '', lvl));
    stats.forEach(function(s) {
      const cell = mk('td');
      if (s) {
        cell.textContent = String(s.matCounts[lvl] || 0);
      } else { cell.textContent = '-'; }
      row.appendChild(cell);
    });
    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  cont.appendChild(table);

  // Maturity distribution bars
  cont.appendChild(mk('h2', '', 'Maturity distribution'));
  const barSection = mk('div', 'compare-bars');
  dirs.forEach(function(dir, i) {
    const s = stats[i]; if (!s) return;
    const d = DOMAINS.find(function(dd) { return dd.dir === dir; });
    const barRow = mk('div', 'compare-bar-row');
    barRow.appendChild(mk('span', 'compare-bar-label', d ? d.label : dir));
    const bar = mk('div', 'compare-bar');
    MAT_KEYS.forEach(function(lvl) {
      const count = s.matCounts[lvl] || 0;
      if (!count) return;
      const seg = mk('div', 'compare-bar-seg');
      seg.style.width = (count / s.total * 100) + '%';
      seg.style.background = MAT_COLORS[lvl];
      seg.title = lvl + ': ' + count;
      bar.appendChild(seg);
    });
    barRow.appendChild(bar);
    barSection.appendChild(barRow);
  });
  cont.appendChild(barSection);

  // Maturity legend
  const legend = mk('div', 'graph-legend');
  MAT_KEYS.forEach(function(lvl) {
    const item = mk('span', 'graph-legend-item');
    const dot = mk('span', 'graph-legend-dot');
    dot.style.background = MAT_COLORS[lvl];
    item.appendChild(dot);
    item.appendChild(document.createTextNode(lvl));
    legend.appendChild(item);
  });
  cont.appendChild(legend);

  // Radar charts (only for domains with 3+ caps)
  const radarDirs = dirs.filter(function(dir) { const dc = state.domainCaps[dir]; return dc && Object.keys(dc).length >= 3; });
  if (radarDirs.length >= 2) {
    cont.appendChild(mk('h2', '', 'Maturity radars'));
    const radarGrid = mk('div', 'compare-radars');
    radarDirs.forEach(function(dir) {
      const d = DOMAINS.find(function(dd) { return dd.dir === dir; });
      const dc = state.domainCaps[dir]; if (!dc) return;
      const caps = Object.keys(dc).map(function(c) { return dc[c]; });
      const wrap = mk('div', ''); wrap.appendChild(mk('h3', '', d ? d.label : dir)); renderRadar(caps, wrap, '100%'); radarGrid.appendChild(wrap);
    });
    cont.appendChild(radarGrid);
  }

  // Right panel
  rightEl.textContent = '';
  rightEl.appendChild(mk('h3', '', 'Comparison'));
  // Find best/worst
  let bestMat = null, worstMat = null;
  dirs.forEach(function(dir, i) {
    const s = stats[i]; if (!s) return;
    const d = DOMAINS.find(function(dd) { return dd.dir === dir; });
    const label = d ? d.label : dir;
    if (!bestMat || s.avgMat > bestMat.avg) bestMat = { label: label, avg: s.avgMat };
    if (!worstMat || s.avgMat < worstMat.avg) worstMat = { label: label, avg: s.avgMat };
  });
  if (bestMat) { rightEl.appendChild(mkMetaRow('Highest maturity', bestMat.label + ' (L' + bestMat.avg + ')')); }
  if (worstMat) { rightEl.appendChild(mkMetaRow('Lowest maturity', worstMat.label + ' (L' + worstMat.avg + ')')); }

}
