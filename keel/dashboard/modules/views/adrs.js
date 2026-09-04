import { mk, mkEmpty, mkMetaRow } from '../dom.js';
import { state } from '../state.js';
import { go, setActiveView, setBread, mainEl, rightEl } from '../nav.js';
export function renderAdrs() {
  setActiveView('adrs'); mainEl.textContent = ''; rightEl.textContent = ''; setBread([{ label: 'ADRs' }]);
  mainEl.appendChild(mk('h1', '', 'Architecture Decision Records'));

  const adrs = [];
    Object.keys(state.fmCache).forEach(function(p) {
      const fm = state.fmCache[p];
      if (fm && fm.type === 'adr') adrs.push({ path: p, fm: fm });
    });

    if (!adrs.length) {
      mainEl.appendChild(mkEmpty('adr', 'No ADRs found', 'Create ADR-*.md files in adr/ to populate this view.'));
      return;
    }

    // Sort by decision_date descending (newest first)
    adrs.sort(function(a, b) {
      const da = a.fm.decision_date || '0000';
      const db = b.fm.decision_date || '0000';
      return da > db ? -1 : da < db ? 1 : 0;
    });

    const table = mk('table', 'compliance-table');
    const thead = mk('thead');
    const hrow = mk('tr');
    ['ID', 'Title', 'Date', 'Domain', 'Status'].forEach(function(h) { hrow.appendChild(mk('th', '', h)); });
    thead.appendChild(hrow);
    table.appendChild(thead);

    const tbody = mk('tbody');
    adrs.forEach(function(a) {
      const row = mk('tr');
      row.style.cursor = 'pointer';
      row.addEventListener('click', function(e) { go('doc/' + a.path, e); });
      row.appendChild(mk('td', 'compliance-link', a.fm.id || ''));
      row.appendChild(mk('td', '', a.fm.title || ''));
      row.appendChild(mk('td', 'compliance-clause', a.fm.decision_date || ''));
      row.appendChild(mk('td', '', a.fm.domain || ''));
      const statusCell = mk('td');
      const sb = mk('span', 'compliance-status');
      sb.textContent = a.fm.status || '';
      sb.style.color = a.fm.status === 'active' ? 'var(--cov-deployed)' : 'var(--cov-partial)';
      statusCell.appendChild(sb);
      row.appendChild(statusCell);
      tbody.appendChild(row);
    });
    table.appendChild(tbody);
    mainEl.appendChild(table);

    // Right panel
    rightEl.appendChild(mk('h3', '', 'Summary'));
    const stats = [['Total ADRs', adrs.length]];
    const byDomain = {};
    adrs.forEach(function(a) { const d = a.fm.domain || 'unknown'; byDomain[d] = (byDomain[d] || 0) + 1; });
    Object.keys(byDomain).sort().forEach(function(d) { stats.push([d, byDomain[d]]); });
    stats.forEach(function(s) {
      rightEl.appendChild(mkMetaRow(s[0], String(s[1])));
    });
}
