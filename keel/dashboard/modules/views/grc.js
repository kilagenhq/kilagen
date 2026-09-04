import { mk, mkEmpty, mkIcon } from '../dom.js';
import { state } from '../state.js';
import { go, setActiveView, setBread, mainEl, rightEl } from '../nav.js';
import { SUBFOLDER_LABELS, statusColor, stdNum, HEAT_LEVELS, HEAT_LEVEL_LABELS, HEAT_COLORS, fwLabel } from '../constants.js';

const SEV_COLORS = { critical: 'var(--sev-critical)', high: 'var(--sev-high)', medium: 'var(--sev-medium)', low: 'var(--sev-low)' };

function mkClickRow(cells, route) {
  const tr = mk('tr', '');
  tr.style.cursor = 'pointer';
  cells.forEach(function(c) { tr.appendChild(c); });
  tr.addEventListener('click', function(e) { go(route, e); });
  return tr;
}

function renderStdTable(stds, container) {
  const tbl = mk('table', 'compliance-table');
  const thead = mk('thead'); const hr = mk('tr');
  ['Standard', 'Domains', 'Capabilities', 'Requirements', 'Gaps', 'Exceptions'].forEach(function(h) { hr.appendChild(mk('th', '', h)); });
  thead.appendChild(hr); tbl.appendChild(thead);
  const tbody = mk('tbody');
  stds.forEach(function(s) {
    const nameCell = mk('td', ''); nameCell.appendChild(mk('span', 'compliance-link', s.fm.title || s.fm.id));
    const domCell = mk('td', '', (s.fm.applies_to && s.fm.applies_to.length) ? s.fm.applies_to.join(', ') : '-');
    const reqs = s.fm.requirements || [];
    const capSet = {};
    reqs.forEach(function(r) { if (r.capabilities) Object.keys(r.capabilities).forEach(function(dom) { const caps = r.capabilities[dom]; if (Array.isArray(caps)) caps.forEach(function(c) { capSet[c] = true; }); }); });
    const capCount = Object.keys(capSet).length;
    const capCell = mk('td', '', capCount ? String(capCount) : '-');
    const mappedReqs = reqs.filter(function(r) { return r.frameworks && Object.keys(r.frameworks).length; }).length;
    const reqCell = mk('td', '', reqs.length ? reqs.length + ' (' + mappedReqs + ' mapped)' : '-');
    const gapCell = mk('td', '');
    if (s.fm.gap_link) { gapCell.appendChild(mk('span', 'grc-gap-badge', 'has gaps')); } else { const ng = mk('span', '', 'No gaps'); ng.style.color = 'var(--cov-deployed)'; ng.style.fontSize = '11px'; gapCell.appendChild(ng); }
    const excCell = mk('td', '');
    const excList = (s.fm.related && s.fm.related.exceptions && Array.isArray(s.fm.related.exceptions)) ? s.fm.related.exceptions : [];
    if (excList.length) { excCell.appendChild(mk('span', 'grc-exc-badge', excList.length + ' exception' + (excList.length > 1 ? 's' : ''))); } else { const ne = mk('span', '', 'None'); ne.style.color = 'var(--cov-deployed)'; ne.style.fontSize = '11px'; excCell.appendChild(ne); }
    tbody.appendChild(mkClickRow([nameCell, domCell, capCell, reqCell, gapCell, excCell], 'doc/' + s.path));
  });
  tbl.appendChild(tbody);
  container.appendChild(tbl);
}

export function renderGrc() {
  setActiveView('standards'); mainEl.textContent = ''; rightEl.textContent = ''; setBread([{ label: 'Governance' }]);
  mainEl.appendChild(mk('h1', '', 'Governance'));

  (function() {
    var policies = {}, standards = [], threats = [], risks = [], processes = [], exceptions = [];

    Object.keys(state.fmCache).forEach(function(p) {
      var fm = state.fmCache[p];
      if (!fm || !fm.type) return;
      if (fm.type === 'policy') policies[fm.id] = { path: p, fm: fm };
      else if (fm.type === 'standard') standards.push({ path: p, fm: fm });
      else if (fm.type === 'threat') threats.push({ path: p, fm: fm });
      else if (fm.type === 'risk') risks.push({ path: p, fm: fm });
      else if (fm.type === 'exception') exceptions.push({ path: p, fm: fm });
      else if (fm.type === 'process' && p.startsWith('01-grc/')) processes.push({ path: p, fm: fm });
    });

    // === Risk Heatmap ===
    const riskItems = [];
    Object.keys(state.fmCache).forEach(function(p) { const fm = state.fmCache[p]; if (fm && fm.type === 'risk') riskItems.push({ path: p, fm: fm }); });
    if (riskItems.length) {
      mainEl.appendChild(mk('h2', '', 'Risk Heatmap'));
      const heatGrid = {};
      riskItems.forEach(function(r) {
        let li = HEAT_LEVELS.indexOf(String(r.fm.likelihood).toLowerCase()); if (li === -1) li = 2;
        let si = HEAT_LEVELS.indexOf(String(r.fm.severity).toLowerCase()); if (si === -1) si = 2;
        const key = si + ',' + li; if (!heatGrid[key]) heatGrid[key] = []; heatGrid[key].push(r);
      });
      const heatWrapper = mk('div', 'heatmap-wrapper');
      heatWrapper.appendChild(mk('div', 'heatmap-y-label', 'Severity'));
      const heatTableBox = mk('div');
      const heatTable = mk('table', 'heatmap-table');
      const heatThead = mk('thead'); const heatHrow = mk('tr');
      heatHrow.appendChild(mk('th', 'heatmap-corner', ''));
      HEAT_LEVELS.forEach(function(l) { heatHrow.appendChild(mk('th', 'heatmap-header', HEAT_LEVEL_LABELS[l])); });
      heatThead.appendChild(heatHrow); heatTable.appendChild(heatThead);
      const heatTbody = mk('tbody');
      for (let hsi = HEAT_LEVELS.length - 1; hsi >= 0; hsi--) {
        const hrow = mk('tr');
        hrow.appendChild(mk('td', 'heatmap-row-label', HEAT_LEVEL_LABELS[HEAT_LEVELS[hsi]]));
        for (let hli = 0; hli < HEAT_LEVELS.length; hli++) {
          const hkey = hsi + ',' + hli;
          const hcell = mk('td', 'heatmap-cell');
          hcell.style.background = HEAT_COLORS[hkey] || 'var(--bg2)';
          const hitems = heatGrid[hkey] || [];
          if (hitems.length) {
            hcell.appendChild(mk('span', 'heatmap-count', String(hitems.length)));
            hcell.style.cursor = 'pointer';
            (function(cellItems) { hcell.addEventListener('click', function() { showHeatRisks(cellItems); }); })(hitems);
          }
          hrow.appendChild(hcell);
        }
        heatTbody.appendChild(hrow);
      }
      heatTable.appendChild(heatTbody); heatTableBox.appendChild(heatTable);
      heatTableBox.appendChild(mk('div', 'heatmap-x-label', 'Likelihood \u2192'));
      heatWrapper.appendChild(heatTableBox);
      mainEl.appendChild(heatWrapper);

      // Treatment status rollup
      var tCounts = { mitigate: 0, avoid: 0, transfer: 0, accept: 0, tbd: 0, unset: 0 };
      riskItems.forEach(function(r) { var t = r.fm.treatment; if (tCounts[t] != null) tCounts[t]++; else tCounts.unset++; });
      var rollupWrap = mk('div', '');
      rollupWrap.style.margin = '12px 0 4px';
      rollupWrap.style.display = 'flex';
      rollupWrap.style.gap = '14px';
      rollupWrap.style.flexWrap = 'wrap';
      rollupWrap.style.alignItems = 'center';
      var rollupLabel = mk('span', '', 'Treatment:');
      rollupLabel.style.fontSize = '11px';
      rollupLabel.style.fontWeight = '700';
      rollupLabel.style.textTransform = 'uppercase';
      rollupLabel.style.letterSpacing = '0.5px';
      rollupLabel.style.color = 'var(--fg3)';
      rollupWrap.appendChild(rollupLabel);
      ['mitigate', 'avoid', 'transfer', 'accept', 'tbd', 'unset'].forEach(function(k) {
        var chip = mk('span', '');
        chip.style.fontSize = '12px';
        chip.style.color = (k === 'unset' || k === 'tbd') ? 'var(--fg3)' : 'var(--fg2)';
        chip.appendChild(document.createTextNode(k + ': '));
        var cnt = mk('strong', '', String(tCounts[k]));
        chip.appendChild(cnt);
        rollupWrap.appendChild(chip);
      });
      mainEl.appendChild(rollupWrap);
    }

    // === Threat Profile link ===
    if (threats.length) {
      const tpRow = mk('p', 'grc-tp-link');
      const tpLink = mk('span', 'compliance-link', 'View threat ranking & trend →');
      tpLink.addEventListener('click', function(e) { go('browse/threat/01-grc', e); });
      tpRow.appendChild(mk('span', '', threats.length + ' threats ranked by priority. '));
      tpRow.appendChild(tpLink);
      mainEl.appendChild(tpRow);
    }

    function showHeatRisks(items) {
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

    // === Compliance Matrix ===
    var fwData = {};
    standards.forEach(function(s) {
      var reqs = s.fm.requirements;
      if (!Array.isArray(reqs)) return;
      reqs.forEach(function(req) {
        if (!req.ref || !req.frameworks) return;
        Object.keys(req.frameworks).forEach(function(fw) {
          if (!fwData[fw]) fwData[fw] = [];
          var clauses = req.frameworks[fw];
          if (!Array.isArray(clauses)) clauses = [clauses];
          clauses.forEach(function(clause) {
            fwData[fw].push({ clause: String(clause), stdId: s.fm.id, stdTitle: s.fm.title || s.fm.id, ref: String(req.ref), summary: req.summary || '', path: s.path });
          });
        });
      });
    });
    var fwKeys = Object.keys(fwData).sort();
    if (fwKeys.length) {
      mainEl.appendChild(mk('h2', '', 'Compliance Matrix'));
      var fwOverview = mk('div', 'compliance-overview');
      var fwMax = Math.max.apply(null, fwKeys.map(function(k) { return fwData[k].length; }));
      fwKeys.forEach(function(fw) {
        var count = fwData[fw].length;
        var fwRow = mk('div', 'compliance-fw-row');
        fwRow.appendChild(mk('span', 'compliance-fw-label', fwLabel(fw)));
        var barOuter = mk('div', 'compliance-fw-bar-outer');
        var barInner = mk('div', 'compliance-fw-bar-inner');
        barInner.style.width = (count / fwMax * 100) + '%';
        barOuter.appendChild(barInner);
        fwRow.appendChild(barOuter);
        fwRow.appendChild(mk('span', 'compliance-fw-count', count + ' controls'));
        fwOverview.appendChild(fwRow);
      });
      mainEl.appendChild(fwOverview);
      fwKeys.forEach(function(fw) {
        var entries = fwData[fw].sort(function(a, b) { return a.clause.localeCompare(b.clause, undefined, { numeric: true }); });
        var wrap = mk('div', 'std-collapse');
        var header = mk('div', 'std-collapse-header');
        header.appendChild(mk('span', 'std-collapse-arrow', '\u25B8'));
        header.appendChild(mk('span', '', fwLabel(fw)));
        header.appendChild(mk('span', 'std-collapse-summary', entries.length + ' control' + (entries.length > 1 ? 's' : '')));
        var body = mk('div', 'std-collapse-body'); body.style.display = 'none';
        header.addEventListener('click', function() { var open = body.style.display !== 'none'; body.style.display = open ? 'none' : 'block'; header.querySelector('.std-collapse-arrow').textContent = open ? '\u25B8' : '\u25BE'; });
        wrap.appendChild(header);
        var tbl = mk('table', 'compliance-table');
        var thead = mk('thead'); var hrow = mk('tr');
        ['Control', 'Standard', 'Requirement'].forEach(function(h) { hrow.appendChild(mk('th', '', h)); });
        thead.appendChild(hrow); tbl.appendChild(thead);
        var tbody = mk('tbody');
        entries.forEach(function(e) {
          var tr = mk('tr'); tr.style.cursor = 'pointer';
          tr.addEventListener('click', function(ev) { go('doc/' + e.path, ev); });
          tr.appendChild(mk('td', 'compliance-clause', e.clause));
          var stdCell = mk('td', 'compliance-ctl'); stdCell.appendChild(mk('span', 'compliance-link', e.stdId)); tr.appendChild(stdCell);
          var reqCell = mk('td'); reqCell.appendChild(mk('span', '', e.ref)); if (e.summary) { var sum = mk('span', '', ' \u2014 ' + e.summary); sum.style.color = 'var(--fg3)'; sum.style.fontSize = '11px'; reqCell.appendChild(sum); } tr.appendChild(reqCell);
          tbody.appendChild(tr);
        });
        tbl.appendChild(tbody); body.appendChild(tbl); wrap.appendChild(body);
        mainEl.appendChild(wrap);
      });
    }

    // Right panel
    rightEl.appendChild(mk('h3', '', 'Summary'));
    var activeExc = exceptions.filter(function(e) { return e.fm.status === 'active'; }).length;
    var excVal = activeExc ? activeExc + ' active' : 'None';
    [['Policies', String(Object.keys(policies).length)], ['Standards', String(standards.length)], ['Processes', String(processes.length)], ['Threats', String(threats.length)], ['Risks', String(risks.length)], ['Exceptions', excVal]].forEach(function(s) {
      var row = mk('div', 'meta-row');
      row.appendChild(mk('span', 'meta-key', s[0]));
      var val = mk('span', 'meta-val', s[1]);
      if (s[0] === 'Exceptions' && activeExc) val.style.color = 'var(--sev-medium)';
      row.appendChild(val);
      rightEl.appendChild(row);
    });
  })();
}
