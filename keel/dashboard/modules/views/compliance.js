import { mk, mkEmpty, mkCopyBtn, mkMetaRow } from '../dom.js';
import { state } from '../state.js';
import { go, setActiveView, setBread, mainEl, rightEl } from '../nav.js';
import { fwLabel } from '../constants.js';

function findPolicyForStd(fm) {
  if (!fm.related || !fm.related.policies || !fm.related.policies.length) return null;
  const polId = fm.related.policies[0];
  let polPath = null;
  Object.keys(state.fmCache).forEach(function(p) { if (state.fmCache[p].id === polId) polPath = p; });
  if (!polPath) return null;
  const polFm = state.fmCache[polPath];
  return { id: polId, path: polPath, title: polFm ? (polFm.title || polId) : polId };
}

export function renderCompliance() {
  setActiveView('compliance'); mainEl.textContent = ''; rightEl.textContent = ''; setBread([{ label: 'Compliance Matrix' }]);
  mainEl.appendChild(mk('h1', '', 'Compliance Matrix'));
  mainEl.appendChild(mk('p', '', 'Framework controls mapped to standard requirements. Click a row to view the standard.'));

  // Collect requirements with framework mappings from all STD-*
  (function() {
    const fwData = {};
    let stdCount = 0, reqCount = 0;
    const stdFmByPath = {};

    Object.keys(state.fmCache).forEach(function(p) {
      const fm = state.fmCache[p];
      if (!fm || fm.type !== 'standard' || !fm.requirements) return;
      stdCount++;
      stdFmByPath[p] = fm;
      const reqs = fm.requirements;
      if (!Array.isArray(reqs)) return;
      reqs.forEach(function(req) {
        if (!req.ref || !req.frameworks) return;
        reqCount++;
        Object.keys(req.frameworks).forEach(function(fw) {
          if (!fwData[fw]) fwData[fw] = [];
          let clauses = req.frameworks[fw];
          if (!Array.isArray(clauses)) clauses = [clauses];
          const pol = findPolicyForStd(fm);
          clauses.forEach(function(clause) {
            fwData[fw].push({ clause: String(clause), stdId: fm.id, stdTitle: fm.title || fm.id, ref: String(req.ref), summary: req.summary || '', status: fm.status || 'unknown', path: p, policy: pol });
          });
        });
      });
    });

    const fwKeys = Object.keys(fwData).sort();

    if (!fwKeys.length) {
      mainEl.appendChild(mkEmpty('standard', 'No framework mappings', 'Add requirements with frameworks: to STD-* frontmatter to populate this matrix.'));
      return;
    }

    // Visual overview — framework bars
    const overview = mk('div', 'compliance-overview');
    fwKeys.forEach(function(fw) {
      const count = fwData[fw].length;
      const row = mk('div', 'compliance-fw-row');
      const label = mk('span', 'compliance-fw-label', fwLabel(fw));
      row.appendChild(label);
      const barOuter = mk('div', 'compliance-fw-bar-outer');
      const barInner = mk('div', 'compliance-fw-bar-inner');
      const maxCount = Math.max.apply(null, fwKeys.map(function(k) { return fwData[k].length; }));
      barInner.style.width = (count / maxCount * 100) + '%';
      barOuter.appendChild(barInner);
      row.appendChild(barOuter);
      row.appendChild(mk('span', 'compliance-fw-count', count + ' controls'));
      overview.appendChild(row);
    });
    mainEl.appendChild(overview);

    // Per-framework collapsible tables
    fwKeys.forEach(function(fw) {
      const entries = fwData[fw].sort(function(a, b) { return a.clause.localeCompare(b.clause, undefined, { numeric: true }); });

      const wrap = mk('div', 'std-collapse');
      const header = mk('div', 'std-collapse-header');
      header.appendChild(mk('span', 'std-collapse-arrow', '\u25B8'));
      header.appendChild(mk('span', '', fwLabel(fw)));
      header.appendChild(mk('span', 'std-collapse-summary', entries.length + ' control' + (entries.length > 1 ? 's' : '')));

      const body = mk('div', 'std-collapse-body');
      body.style.display = 'none';
      header.addEventListener('click', function() {
        const open = body.style.display !== 'none';
        body.style.display = open ? 'none' : 'block';
        header.querySelector('.std-collapse-arrow').textContent = open ? '\u25B8' : '\u25BE';
      });
      wrap.appendChild(header);

      const table = mk('table', 'compliance-table');
      const thead = mk('thead');
      const hrow = mk('tr');
      ['Control', 'Policy', 'Standard', 'Requirement'].forEach(function(h) { hrow.appendChild(mk('th', '', h)); });
      thead.appendChild(hrow);
      table.appendChild(thead);

      const tbody = mk('tbody');
      entries.forEach(function(e) {
        const row = mk('tr'); row.style.cursor = 'pointer';
        row.addEventListener('click', function(ev) { go('doc/' + e.path, ev); });
        row.appendChild(mk('td', 'compliance-clause', e.clause));
        const polCell = mk('td');
        if (e.policy) {
          const polLink = mk('span', 'compliance-link', e.policy.title);
          polLink.style.fontSize = '11px';
          polLink.addEventListener('click', function(ev) { ev.stopPropagation(); go('doc/' + e.policy.path, ev); });
          polCell.appendChild(polLink);
        } else { polCell.textContent = '-'; }
        row.appendChild(polCell);
        const stdCell = mk('td', 'compliance-ctl');
        stdCell.appendChild(mk('span', 'compliance-link', e.stdId));
        row.appendChild(stdCell);
        const reqCell = mk('td');
        reqCell.appendChild(mk('span', '', e.ref));
        if (e.summary) { const sum = mk('span', '', ' \u2014 ' + e.summary); sum.style.color = 'var(--fg3)'; sum.style.fontSize = '11px'; reqCell.appendChild(sum); }
        row.appendChild(reqCell);
        tbody.appendChild(row);
      });
      table.appendChild(tbody);
      body.appendChild(table);
      wrap.appendChild(body);
      mainEl.appendChild(wrap);
    });

    // Right panel
    rightEl.appendChild(mk('h3', '', 'Summary'));
    const stats = [['Standards', stdCount], ['Mapped requirements', reqCount], ['Frameworks', fwKeys.length]];
    fwKeys.forEach(function(fw) { stats.push([fwLabel(fw), fwData[fw].length + ' controls']); });
    stats.forEach(function(s) {
      rightEl.appendChild(mkMetaRow(s[0], String(s[1])));
    });
  })();
}
