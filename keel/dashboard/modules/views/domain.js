import { mk, matDot, mkCopyBtn, mkFlipIcon, mkCollapsible, ghTreeUrl } from '../dom.js';
import { state } from '../state.js';
import { go, setActiveView, setBread, fadeMain, mainEl, rightEl } from '../nav.js';
import { DOMAINS, SUBFOLDER_LABELS, fwLabel, DOC_TYPE_COLORS } from '../constants.js';
import { safeFetch, safeUrl, hookLinks } from '../security.js';
import { parseFM, parseYml, renderMd, safeHtmlNode } from '../parsers.js';
import { renderRadar } from '../svg.js';

export function appNavigateDomain(dir) {
  const safeDir = String(dir).replace(/[^a-zA-Z0-9_\-\/]/g, '');
  if (safeDir !== String(dir)) console.warn('Domain path sanitized:', dir, '->', safeDir);
  setActiveView(''); const d = DOMAINS.find(function(dd) { return dd.dir === safeDir; }); fadeMain(); mainEl.textContent = ''; rightEl.textContent = ''; setBread([{ label: d ? d.label : safeDir }]);
  Promise.all([safeFetch(safeDir + '/README.md').catch(function(err) { console.warn('README.md load failed for', safeDir, err.message); return null; }), safeFetch(safeDir + '/capabilities.yml').catch(function(err) { console.warn('capabilities.yml load failed for', safeDir, err.message); return null; })]).then(function(res) {
    const parsed = res[0] ? parseFM(res[0]) : null, capData = res[1] ? parseYml(res[1]) : null;
    if (capData && capData.ok === false) { mainEl.appendChild(mk('div', 'error-msg', 'YAML parse error in capabilities.yml: ' + capData.error)); }
    const caps = capData && capData.capabilities ? capData.capabilities : [];

    // === Hero ===
    const hero = mk('div', 'app-domain-hero');
    const heroTitleRow = mk('div', 'domain-title-row'); const h1 = mk('h1', '', d ? d.label : safeDir); h1.appendChild(mkCopyBtn()); heroTitleRow.appendChild(h1);
    hero.appendChild(heroTitleRow);

    // Badges: maturity + backlog (same layout as capability)
    var heroBadges = mk('div', 'cap-badges');
    if (caps.length) {
      var matSum = 0;
      caps.forEach(function(c) { var m = (c.maturity || 'L0').match(/^L(\d)/); matSum += m ? parseInt(m[1], 10) : 0; });
      var matAvg = (matSum / caps.length).toFixed(1);
      heroBadges.appendChild(matDot('L' + Math.round(matSum / caps.length)));
      heroBadges.appendChild(mk('span', '', 'L' + matAvg + ' avg maturity'));
    }
    if (capData && capData.backlog_link) { var safeBlUrl = safeUrl(capData.backlog_link); if (safeBlUrl) { var blBadge = mk('a', 'cap-pill cap-pill-ext'); blBadge.href = safeBlUrl; blBadge.target = '_blank'; blBadge.rel = 'noopener noreferrer'; blBadge.textContent = 'Backlog \u2197'; heroBadges.appendChild(blBadge); } }
    hero.appendChild(heroBadges);

    // Description as quote (same style as capability summary)
    if (parsed && parsed.fm && parsed.fm.description) {
      const quoteRow = mk('div', 'cap-quote-row');
      quoteRow.appendChild(mk('blockquote', 'cap-quote', String(parsed.fm.description).trim()));
      hero.appendChild(quoteRow);
    }
    mainEl.appendChild(hero);

    // Scope — collapsible card, closed by default
    if (parsed && parsed.body) {
      const scopeMatch = parsed.body.match(/## Scope[\s\S]*?(?=## |$)/);
      if (scopeMatch) {
        const scopeCard = mk('div', 'cap-scope-card');
        const scopeTop = mk('div', 'cap-scope-top');
        const scopeLeft = mk('div', 'domain-scope-toggle');
        scopeLeft.appendChild(mk('span', 'std-collapse-arrow', '\u25B8'));
        scopeLeft.appendChild(mk('span', 'cap-scope-label', 'Scope'));
        scopeTop.appendChild(scopeLeft);
        var scopePills = mk('div', 'cap-scope-pills');
        if (parsed.fm && parsed.fm.owner) scopePills.appendChild(mk('span', 'cap-pill', parsed.fm.owner));
        if (parsed.fm && parsed.fm.last_reviewed) scopePills.appendChild(mk('span', 'cap-pill', parsed.fm.last_reviewed));
        scopeTop.appendChild(scopePills);
        scopeTop.style.cursor = 'pointer';
        scopeCard.appendChild(scopeTop);
        const scopeBody = mk('div', 'domain-scope-body');
        scopeBody.style.display = 'none';
        const scopeHtml = renderMd(scopeMatch[0].replace('## Scope', '').trim());
        const scopeEl = safeHtmlNode(scopeHtml);
        scopeEl.className = 'domain-scope';
        scopeBody.appendChild(scopeEl);
        // Cross-domain notes inside scope card
        var crossMatch = parsed.body.match(/## Cross-domain notes[\s\S]*?(?=## |$)/);
        if (crossMatch) {
          scopeBody.appendChild(mk('h4', 'domain-scope-subhead', 'Cross-domain notes'));
          var crossEl = safeHtmlNode(renderMd(crossMatch[0].replace('## Cross-domain notes', '').trim()));
          crossEl.className = 'domain-scope';
          scopeBody.appendChild(crossEl);
        }
        hookLinks(scopeBody, go);
        scopeTop.addEventListener('click', function() {
          const open = scopeBody.style.display !== 'none';
          scopeBody.style.display = open ? 'none' : 'block';
          scopeCard.classList.toggle('scope-open', !open);
          scopeLeft.querySelector('.std-collapse-arrow').textContent = open ? '\u25B8' : '\u25BE';
        });
        scopeCard.appendChild(scopeBody);
        mainEl.appendChild(scopeCard);
      }
    }

    // === Capabilities (collapsible, open by default) ===
    if (!caps.length) { mainEl.appendChild(mk('p', '', 'No capabilities.')); return; }
    var capCollapse = mkCollapsible('Capabilities (' + caps.length + ')', '', true);
    let capViewMode = 'cards';
    const capFlip = mk('button', 'cap-res-flip');
    capFlip.appendChild(mkFlipIcon('grid'));
    capFlip.title = 'Switch to table';
    capFlip.addEventListener('click', function(e) {
      e.stopPropagation();
      capFlip.textContent = '';
      if (capViewMode === 'cards') { capViewMode = 'table'; capFlip.appendChild(mkFlipIcon('list')); capFlip.title = 'Switch to cards'; renderTable(); }
      else { capViewMode = 'cards'; capFlip.appendChild(mkFlipIcon('grid')); capFlip.title = 'Switch to table'; renderCards(); }
    });
    capCollapse.header.appendChild(capFlip);
    mainEl.appendChild(capCollapse.wrap);
    const capContainer = mk('div', ''); capCollapse.body.appendChild(capContainer);

    function renderCards() {
      capContainer.textContent = '';
      const grid = mk('div', 'app-cap-grid'); caps.forEach(function(cap) {
        const tile = mk('div', 'app-cap-tile');
        tile.appendChild(mk('h4', '', cap.name || cap.id));
        const br = mk('div', 'tile-row'); br.appendChild(matDot(cap.maturity)); br.appendChild(mk('span', '', cap.maturity || 'L0-none')); tile.appendChild(br);
        if (cap.summary) tile.appendChild(mk('div', 'tile-summary', String(cap.summary).trim()));
        if (cap.systems && cap.systems.length) {
          const sr = mk('div', 'tile-systems');
          cap.systems.forEach(function(sid) {
            const chip = mk('span', 'tile-sys-chip', sid.replace('SYS-', ''));
            chip.addEventListener('click', function(e) { e.stopPropagation(); go('sys/' + sid + '.md', e); });
            sr.appendChild(chip);
          });
          tile.appendChild(sr);
        }
        tile.addEventListener('click', function(e) { go('cap/' + safeDir + '/' + cap.id, e); }); grid.appendChild(tile);
      });
      grid.classList.add('stagger-in');
      capContainer.appendChild(grid);
    }

    function renderTable() {
      capContainer.textContent = '';
      let sortKey = 'name', sortAsc = true;
      function build() {
        capContainer.textContent = '';
        const sorted = caps.slice().sort(function(a, b) {
          let va, vb;
          if (sortKey === 'name') { va = (a.name || a.id).toLowerCase(); vb = (b.name || b.id).toLowerCase(); }
          else if (sortKey === 'maturity') { va = a.maturity || 'L0'; vb = b.maturity || 'L0'; }
          else { va = (a.systems || []).length; vb = (b.systems || []).length; }
          if (va < vb) return sortAsc ? -1 : 1;
          if (va > vb) return sortAsc ? 1 : -1;
          return 0;
        });
        const tbl = mk('table', 'cap-table');
        const thead = mk('thead', ''); const hr = mk('tr', '');
        ['Name', 'Maturity', 'Systems'].forEach(function(col, i) {
          const keys = ['name', 'maturity', 'systems'];
          const th = mk('th', 'sortable-th', col);
          if (keys[i] === sortKey) { const arrow = mk('span', 'sort-arrow', sortAsc ? '\u25B2' : '\u25BC'); th.appendChild(arrow); }
          th.addEventListener('click', function() { if (sortKey === keys[i]) sortAsc = !sortAsc; else { sortKey = keys[i]; sortAsc = true; } build(); });
          hr.appendChild(th);
        });
        thead.appendChild(hr); tbl.appendChild(thead);
        const tbody = mk('tbody', '');
        sorted.forEach(function(cap) {
          const tr = mk('tr', '');
          tr.appendChild(mk('td', '', cap.name || cap.id));
          const matTd = mk('td', ''); matTd.appendChild(matDot(cap.maturity)); matTd.appendChild(document.createTextNode(' ' + (cap.maturity || 'L0-none'))); tr.appendChild(matTd);
          tr.appendChild(mk('td', '', (cap.systems || []).length ? cap.systems.map(function(s) { return s.replace('SYS-', ''); }).join(', ') : '-'));
          tr.addEventListener('click', function(e) { go('cap/' + safeDir + '/' + cap.id, e); });
          tbody.appendChild(tr);
        });
        tbl.appendChild(tbody); capContainer.appendChild(tbl);
      }
      build();
    }

    renderCards();

    // === Documents (collapsible, open by default) ===
    const DOM_RESOURCE_TYPES = [
      { key: 'system', label: 'Systems' },
      { key: 'guideline', label: 'Guidelines' },
      { key: 'process', label: 'Processes' },
      { key: 'runbook', label: 'Runbooks' },
      { key: 'playbook', label: 'Playbooks' },
      { key: 'threat-model', label: 'Threat Models' }
    ];
    const domResourcesByType = {};
    DOM_RESOURCE_TYPES.forEach(function(rt) { domResourcesByType[rt.key] = []; });

    // Systems linked to this domain's capabilities
    const domSysIds = {};
    caps.forEach(function(cap) { (cap.systems || []).forEach(function(sid) { domSysIds[sid] = true; }); });
    Object.keys(domSysIds).forEach(function(sid) {
      const sysFm = state.fmCache['systems/' + sid + '.md'];
      domResourcesByType['system'].push({ path: 'systems/' + sid + '.md', fm: sysFm || { id: sid, type: 'system' }, id: sid });
    });

    // Domain docs: guidelines, processes, threat-models
    Object.keys(state.fmCache).forEach(function(p) {
      if (!p.startsWith(safeDir + '/')) return;
      if (p === safeDir + '/README.md' || p === safeDir + '/capabilities.yml') return;
      const fm = state.fmCache[p];
      if (!fm || !fm.type) return;
      if (fm.type === 'standard') return;
      const typeKey = fm.type === 'threat-model' ? 'threat-model' : fm.type;
      if (!domResourcesByType[typeKey]) return;
      domResourcesByType[typeKey].push({ path: p, fm: fm, id: fm.id || p });
    });

    var totalResCount = 0;
    DOM_RESOURCE_TYPES.forEach(function(rt) { totalResCount += domResourcesByType[rt.key].length; });
    var docCollapse = mkCollapsible('Documents (' + totalResCount + ')', '', true);
    mainEl.appendChild(docCollapse.wrap);
    const domResToolbar = mk('div', 'cap-res-toolbar');
    const domChipBar = mk('div', 'cap-res-chips');
    const domActiveFilters = {};
    let domResViewMode = 'cards';
    const domResContainer = mk('div', '');

    DOM_RESOURCE_TYPES.forEach(function(rt) {
      const count = domResourcesByType[rt.key].length;
      const defaultOn = count > 0 && rt.key !== 'threat-model';
      const chip = mk('button', 'cap-res-chip' + (defaultOn ? ' active' : ''), rt.label + ' (' + count + ')');
      const chipColor = DOC_TYPE_COLORS[rt.key] || DOC_TYPE_COLORS['default'];
      chip.style.setProperty('--chip-color', chipColor);
      if (!count) { chip.disabled = true; chip.classList.add('disabled'); }
      domActiveFilters[rt.key] = defaultOn;
      chip.addEventListener('click', function() {
        if (!count) return;
        domActiveFilters[rt.key] = !domActiveFilters[rt.key];
        chip.classList.toggle('active', domActiveFilters[rt.key]);
        renderDomResources();
      });
      domChipBar.appendChild(chip);
    });
    domResToolbar.appendChild(domChipBar);

    const domResFlip = mk('button', 'cap-res-flip');
    domResFlip.appendChild(mkFlipIcon('grid'));
    domResFlip.title = 'Switch to table';
    domResFlip.addEventListener('click', function() {
      domResFlip.textContent = '';
      if (domResViewMode === 'cards') { domResViewMode = 'table'; domResFlip.appendChild(mkFlipIcon('list')); domResFlip.title = 'Switch to cards'; }
      else { domResViewMode = 'cards'; domResFlip.appendChild(mkFlipIcon('grid')); domResFlip.title = 'Switch to table'; }
      renderDomResources();
    });
    domResToolbar.appendChild(domResFlip);
    docCollapse.body.appendChild(domResToolbar);
    docCollapse.body.appendChild(domResContainer);

    function getDomFilteredResources() {
      const items = [];
      DOM_RESOURCE_TYPES.forEach(function(rt) {
        if (!domActiveFilters[rt.key]) return;
        domResourcesByType[rt.key].forEach(function(r) { items.push({ typeKey: rt.key, typeLabel: rt.label, path: r.path, fm: r.fm, id: r.id }); });
      });
      return items;
    }

    function renderDomResources() {
      domResContainer.textContent = '';
      const items = getDomFilteredResources();
      if (!items.length) { domResContainer.appendChild(mk('p', 'grc-empty', 'No resources match the active filters.')); return; }
      if (domResViewMode === 'cards') { renderDomResCards(items); } else { renderDomResTable(items); }
    }

    function renderDomResCards(items) {
      const grid = mk('div', 'app-sys-caps-grid');
      items.forEach(function(item) {
        const card = mk('div', 'cap-sys-card');
        const color = DOC_TYPE_COLORS[item.typeKey] || DOC_TYPE_COLORS['default'];
        const bar = mk('div', 'sys-icon');
        bar.style.background = color;
        card.appendChild(bar);
        const info = mk('div', 'sys-info');
        info.appendChild(mk('h5', '', item.fm.title || item.fm.id || item.id));
        const desc = item.fm.description ? String(item.fm.description).trim().substring(0, 100) : '';
        info.appendChild(mk('p', '', desc || item.typeLabel));
        card.appendChild(info);
        card.addEventListener('click', function(e) {
          if (item.typeKey === 'system') go('sys/' + item.id + '.md', e);
          else go('doc/' + item.path, e);
        });
        grid.appendChild(card);
      });
      domResContainer.appendChild(grid);
    }

    function renderDomResTable(items) {
      const tbl = mk('table', 'compliance-table');
      const thead = mk('thead'); const hr = mk('tr');
      ['Name', 'Type', 'Description'].forEach(function(h) { hr.appendChild(mk('th', '', h)); });
      thead.appendChild(hr); tbl.appendChild(thead);
      const tbody = mk('tbody');
      items.forEach(function(item) {
        const tr = mk('tr'); tr.style.cursor = 'pointer';
        tr.addEventListener('click', function(e) {
          if (item.typeKey === 'system') go('sys/' + item.id + '.md', e);
          else go('doc/' + item.path, e);
        });
        const nameCell = mk('td'); nameCell.appendChild(mk('span', 'compliance-link', item.fm.title || item.fm.id || item.id)); tr.appendChild(nameCell);
        tr.appendChild(mk('td', '', item.typeLabel));
        tr.appendChild(mk('td', '', item.fm.description ? String(item.fm.description).trim().substring(0, 120) : '-'));
        tbody.appendChild(tr);
      });
      tbl.appendChild(tbody);
      domResContainer.appendChild(tbl);
    }

    renderDomResources();

    // === Applicable standards (collapsible, open by default) ===
    const domShort = d ? d.dir.replace(/^\d+-/, '') : '';
    const applicableStds = [];
    Object.keys(state.fmCache).forEach(function(p) {
      const fm = state.fmCache[p];
      if (!fm || fm.type !== 'standard' || !fm.requirements) return;
      const domReqs = fm.requirements.filter(function(r) { return r.domains && r.domains.indexOf(domShort) !== -1; });
      if (domReqs.length) applicableStds.push({ path: p, fm: fm, reqs: domReqs });
    });
    let totalReqCount = 0;
    applicableStds.forEach(function(s) { totalReqCount += s.reqs.length; });
    var stdCollapse = mkCollapsible('Applicable standards (' + totalReqCount + ' requirements)', '', true);
    mainEl.appendChild(stdCollapse.wrap);
    if (!applicableStds.length) {
      stdCollapse.body.appendChild(mk('p', 'grc-empty', 'No standard requirements reference this domain yet.'));
    } else {
      applicableStds.sort(function(a, b) { return (a.fm.title || a.fm.id || '').localeCompare(b.fm.title || b.fm.id || '', undefined, { numeric: true }); });
      applicableStds.forEach(function(s) {
        const mappedCount = s.reqs.filter(function(r) { return r.frameworks && Object.keys(r.frameworks).length; }).length;
        const wrap = mk('div', 'std-collapse');
        const header = mk('div', 'std-collapse-header');
        header.appendChild(mk('span', 'std-collapse-arrow', '\u25B8'));
        const titleLink = mk('span', 'compliance-link', s.fm.title || s.fm.id);
        titleLink.addEventListener('click', function(e) { e.stopPropagation(); go('doc/' + s.path, e); });
        header.appendChild(titleLink);
        header.appendChild(mk('span', 'std-collapse-summary', s.reqs.length + ' req' + (s.reqs.length > 1 ? 's' : '') + ' (' + mappedCount + ' mapped)'));
        const body = mk('div', 'std-collapse-body');
        body.style.display = 'none';
        header.addEventListener('click', function() {
          const open = body.style.display !== 'none';
          body.style.display = open ? 'none' : 'block';
          header.querySelector('.std-collapse-arrow').textContent = open ? '\u25B8' : '\u25BE';
        });
        wrap.appendChild(header);
        const tbl = mk('table', 'compliance-table');
        const thead = mk('thead'); const hr = mk('tr');
        ['Req', 'Summary', 'Frameworks'].forEach(function(h) { hr.appendChild(mk('th', '', h)); });
        thead.appendChild(hr); tbl.appendChild(thead);
        const tbody = mk('tbody');
        s.reqs.slice().sort(function(a, b) { return (a.ref || '').localeCompare(b.ref || '', undefined, { numeric: true }); }).forEach(function(r) {
          const tr = mk('tr');
          tr.appendChild(mk('td', '', r.ref));
          tr.appendChild(mk('td', '', r.summary || ''));
          const fwCell = mk('td');
          if (r.frameworks && Object.keys(r.frameworks).length) {
            Object.keys(r.frameworks).forEach(function(fw) {
              const cls = r.frameworks[fw];
              if (Array.isArray(cls)) cls.forEach(function(c) { fwCell.appendChild(mk('span', 'req-fw-badge', fwLabel(fw) + ' ' + c)); });
            });
          } else {
            fwCell.appendChild(mk('span', 'req-fw-badge req-fw-internal', 'internal'));
          }
          tr.appendChild(fwCell);
          tbody.appendChild(tr);
        });
        tbl.appendChild(tbody);
        body.appendChild(tbl);
        wrap.appendChild(body);
        stdCollapse.body.appendChild(wrap);
      });
    }

    // === Right panel ===
    rightEl.appendChild(mk('h3', '', 'Maturity radar')); renderRadar(caps, rightEl, '100%');
    rightEl.appendChild(mk('h3', '', 'Source'));
    const srcRow = mk('div', 'meta-row');
    srcRow.appendChild(mk('span', 'meta-key', 'README'));
    const srcVal = mk('span', 'meta-val', safeDir + '/README.md');
    srcVal.style.fontFamily = "'SF Mono',SFMono-Regular,Consolas,monospace"; srcVal.style.fontSize = '11px';
    srcRow.appendChild(srcVal);
    rightEl.appendChild(srcRow);
    const capRow = mk('div', 'meta-row');
    capRow.appendChild(mk('span', 'meta-key', 'Capabilities'));
    const capVal = mk('span', 'meta-val', safeDir + '/capabilities.yml');
    capVal.style.fontFamily = "'SF Mono',SFMono-Regular,Consolas,monospace"; capVal.style.fontSize = '11px';
    capRow.appendChild(capVal);
    rightEl.appendChild(capRow);
    const ghHref = ghTreeUrl(safeDir);
    if (ghHref) { const ghLink = mk('a', 'source-link', 'View in GitHub'); ghLink.href = ghHref; ghLink.target = '_blank'; ghLink.rel = 'noopener noreferrer'; rightEl.appendChild(ghLink); }
  }).catch(function(err) { mainEl.appendChild(mk('div', 'error-msg', 'Unable to load domain: ' + err.message)); });
}
