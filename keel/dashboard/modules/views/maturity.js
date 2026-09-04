import { mk, matDot, matLvl } from '../dom.js';
import { state } from '../state.js';
import { go, setActiveView, setBread, mainEl, rightEl } from '../nav.js';
import { DOMAINS } from '../constants.js';
import { addCapTip } from '../tooltip.js';

export function renderMaturity() {
  setActiveView('maturity'); mainEl.textContent = ''; rightEl.textContent = ''; setBread([{ label: 'Domains', action: function() { go('domains'); } }, { label: 'Maturity' }]);
  mainEl.appendChild(mk('h1', '', 'Maturity by Domain'));
  mainEl.appendChild(mk('p', '', 'How well each capability works \u2014 from L0 (nothing in place) to L5 (optimizing with feedback loops).'));

    // === Domain comparison bar chart ===
    var domChart = mk('div', 'mat-domain-chart');
    DOMAINS.forEach(function(d) {
      var dc = state.domainCaps[d.dir];
      if (!dc) return;
      var keys = Object.keys(dc);
      if (!keys.length) return;
      var sum = 0;
      keys.forEach(function(c) { sum += matLvl(dc[c].maturity); });
      var avg = Math.round(sum / keys.length * 10) / 10;
      var maxLvl = 5;
      var pct = (avg / maxLvl) * 100;
      var colorLvl = Math.round(avg);

      var row = mk('div', 'mat-chart-row');
      row.style.cursor = 'pointer';
      row.addEventListener('click', function() {
        var target = document.getElementById('mat-domain-' + d.dir);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });

      var label = mk('span', 'mat-chart-label', d.label);
      row.appendChild(label);

      var track = mk('div', 'mat-chart-track');
      var bar = mk('div', 'mat-chart-bar');
      bar.style.width = pct + '%';
      bar.style.background = 'var(--mat' + colorLvl + ')';
      track.appendChild(bar);
      row.appendChild(track);

      var val = mk('span', 'mat-chart-val', 'L' + avg);
      val.style.color = 'var(--mat' + colorLvl + ')';
      row.appendChild(val);

      domChart.appendChild(row);
    });
    mainEl.appendChild(domChart);

    // Filter buttons
    let activeFilter = -1;
    const filterRow = mk('div', 'view-toggle'); filterRow.style.marginBottom = '16px'; filterRow.style.justifyContent = 'center';
    const allBtn = mk('button', 'active', 'All');
    allBtn.addEventListener('click', function() { activeFilter = -1; applyFilter(); });
    filterRow.appendChild(allBtn);
    for (let fi = 0; fi <= 5; fi++) { (function(lvl) { const btn = mk('button', '', 'L' + lvl); btn.addEventListener('click', function() { activeFilter = lvl; applyFilter(); }); filterRow.appendChild(btn); })(fi); }
    mainEl.appendChild(filterRow);
    const domContainer = mk('div', ''); mainEl.appendChild(domContainer);

    function applyFilter() {
      filterRow.querySelectorAll('button').forEach(function(b, idx) { if (idx === 0) { b.className = activeFilter === -1 ? 'active' : ''; } else { b.className = (activeFilter === idx - 1) ? 'active' : ''; } });
      renderDomains();
    }

    function renderDomains() {
    domContainer.textContent = '';
    // Per-domain cards
    DOMAINS.forEach(function(d) {
      const dc = state.domainCaps[d.dir];
      if (!dc) return;
      let capKeys = Object.keys(dc);
      if (activeFilter !== -1) capKeys = capKeys.filter(function(c) { return matLvl(dc[c].maturity) === activeFilter; });
      if (!capKeys.length) return;

      // Domain card
      const card = mk('div', 'ref-card');
      card.id = 'mat-domain-' + d.dir;
      const header = mk('div', '');
      header.style.display = 'flex'; header.style.alignItems = 'center'; header.style.gap = '12px'; header.style.marginBottom = '12px';
      const title = mk('h3', '', d.label); title.style.margin = '0'; title.style.cursor = 'pointer';
      title.addEventListener('click', function(e) { go('domain/' + d.dir, e); });
      header.appendChild(title);

      // Avg maturity for domain
      let matSum = 0;
      capKeys.forEach(function(c) { matSum += matLvl(dc[c].maturity); });
      const avgMat = Math.round(matSum / capKeys.length * 10) / 10;
      const avgLabel = mk('span', '', 'Avg L' + avgMat);
      avgLabel.style.fontSize = '12px'; avgLabel.style.color = 'var(--fg2)'; avgLabel.style.fontWeight = '600';
      header.appendChild(avgLabel);
      header.appendChild(mk('span', '', capKeys.length + ' capabilities'));
      card.appendChild(header);

      // Capability rows
      capKeys.forEach(function(c) {
        const cap = dc[c];
        const row = mk('div', '');
        row.style.display = 'flex'; row.style.alignItems = 'center'; row.style.gap = '10px'; row.style.padding = '6px 0'; row.style.borderBottom = '1px solid var(--border)'; row.style.cursor = 'pointer';

        // Maturity bar (visual)
        const barWrap = mk('div', 'cap-maturity-visual'); barWrap.style.width = '80px'; barWrap.style.flexShrink = '0';
        const lvl = matLvl(cap.maturity);
        for (let i = 0; i < 5; i++) { const step = mk('div', 'cap-mat-step' + (i < lvl ? ' filled' : '')); if (i < lvl) step.style.background = 'var(--mat' + lvl + ')'; barWrap.appendChild(step); }
        row.appendChild(barWrap);

        // Maturity dot
        const dot = matDot(cap.maturity);
        addCapTip(dot, cap);
        row.appendChild(dot);

        // Level text
        const lvlText = mk('span', '', cap.maturity || 'L0-none');
        lvlText.style.fontSize = '11px'; lvlText.style.color = 'var(--fg3)'; lvlText.style.minWidth = '85px';
        row.appendChild(lvlText);

        // Capability name
        const name = mk('span', '', cap.name || c);
        name.style.fontWeight = '500'; name.style.flex = '1';
        row.appendChild(name);

        row.addEventListener('click', function(e) { go('cap/' + d.dir + '/' + cap.id, e); });
        card.appendChild(row);
      });

      domContainer.appendChild(card);
    });
    } // end renderDomains
    renderDomains();

    // Right panel — summary
    rightEl.appendChild(mk('h3', '', 'Summary'));
    let totalCaps = 0, totalMat = 0;
    DOMAINS.forEach(function(d) { const dc = state.domainCaps[d.dir]; if (!dc) return; Object.keys(dc).forEach(function(c) { totalCaps++; totalMat += matLvl(dc[c].maturity); }); });
    const overallAvg = totalCaps ? Math.round(totalMat / totalCaps * 10) / 10 : 0;
    [['Total capabilities', String(totalCaps)], ['Overall avg maturity', 'L' + overallAvg], ['Domains', String(DOMAINS.filter(function(d) { return state.domainCaps[d.dir] && Object.keys(state.domainCaps[d.dir]).length; }).length)]].forEach(function(s) {
      const r = mk('div', 'meta-row'); r.appendChild(mk('span', 'meta-key', s[0])); r.appendChild(mk('span', 'meta-val', s[1])); rightEl.appendChild(r);
    });

    // Maturity distribution
    rightEl.appendChild(mk('h3', '', 'Distribution'));
    const dist = [0, 0, 0, 0, 0, 0];
    DOMAINS.forEach(function(d) { const dc = state.domainCaps[d.dir]; if (!dc) return; Object.keys(dc).forEach(function(c) { dist[matLvl(dc[c].maturity)]++; }); });
    for (let i = 0; i <= 5; i++) {
      const r = mk('div', 'meta-row'); r.appendChild(mk('span', 'meta-key', 'L' + i)); r.appendChild(mk('span', 'meta-val', dist[i] + ' capabilities')); rightEl.appendChild(r);
    }

    // Maturity explanation
    rightEl.appendChild(mk('h3', '', 'What is maturity?'));
    rightEl.appendChild(mk('p', '', 'Maturity measures how well a capability works \u2014 from L0 (missing) to L5 (optimizing with feedback loops).'));
    const levels = [
      ['L0', 'None', 'Nothing in place.'],
      ['L1', 'Ad-hoc', 'Depends on one person.'],
      ['L2', 'Defined', 'Documented but inconsistent.'],
      ['L3', 'Integrated', 'Automated in CI/pipelines.'],
      ['L4', 'Measured', 'Metrics and alerts.'],
      ['L5', 'Optimizing', 'Feedback loop from incidents.']
    ];
    levels.forEach(function(l) {
      const r = mk('div', 'meta-row');
      const key = mk('span', 'meta-key', l[0]); key.style.color = 'var(--mat' + l[0].replace('L', '') + ')';
      r.appendChild(key);
      const val = mk('span', 'meta-val', l[1] + ' \u2014 ' + l[2]); val.style.fontSize = '11px';
      r.appendChild(val);
      rightEl.appendChild(r);
    });
    const refLink = mk('a', 'source-link', '\u2192 Full maturity reference');
    refLink.href = '#matref';
    refLink.addEventListener('click', function(e) { go('matref', e); });
    rightEl.appendChild(refLink);
}
