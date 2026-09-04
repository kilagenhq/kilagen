import { mk, matDot, matLvl, mkCopyBtn, mkIcon, mkFlipIcon, mkCollapsible, mkMetaRow, ghUrl, mkSourcePanel } from '../dom.js';
import { state } from '../state.js';
import { go, setActiveView, setBread, fadeMain, mainEl, rightEl } from '../nav.js';
import { DOMAINS, SUBFOLDER_LABELS, fwLabel, DOC_TYPE_COLORS } from '../constants.js';
import { safeUrl } from '../security.js';

export function appShowCapDetail(cap, dir) {
  fadeMain(); mainEl.textContent = ''; rightEl.textContent = '';
  const domObj = DOMAINS.find(function(dd) { return dd.dir === dir; });
  setBread([{ label: domObj ? domObj.label : dir, action: function() { go('domain/' + dir); } }, { label: cap.name || cap.id }]);

  // === Hero ===
  const hero = mk('div', 'cap-hero');
  const titleRow = mk('div', 'doc-title-row'); titleRow.appendChild(mkIcon('capability')); const capH1 = mk('h1', '', cap.name || cap.id); capH1.appendChild(mkCopyBtn()); titleRow.appendChild(capH1); hero.appendChild(titleRow);

  // Badges: domain, maturity
  const badges = mk('div', 'cap-badges');
  if (domObj) { var domChip = mk('span', 'domain-chip'); domChip.style.fontSize = '11px'; domChip.style.padding = '2px 10px'; domChip.style.cursor = 'pointer'; domChip.style.display = 'inline-flex'; domChip.style.alignItems = 'center'; domChip.style.gap = '4px'; domChip.appendChild(mkIcon('domain', 'doc-badge-icon')); domChip.appendChild(document.createTextNode(domObj.label)); domChip.addEventListener('click', function(e) { go('domain/' + dir, e); }); badges.appendChild(domChip); }
  badges.appendChild(matDot(cap.maturity));
  badges.appendChild(mk('span', '', cap.maturity || 'L0-none'));
  if (cap.backlog_link) { const safeBlUrl = safeUrl(cap.backlog_link); if (safeBlUrl) { const blBadge = mk('a', 'cap-pill cap-pill-ext'); blBadge.href = safeBlUrl; blBadge.target = '_blank'; blBadge.rel = 'noopener noreferrer'; blBadge.textContent = 'Backlog \u2197'; badges.appendChild(blBadge); } }
  hero.appendChild(badges);

  // Summary as quote + why as tooltip
  if (cap.summary) {
    const summaryRow = mk('div', 'cap-quote-row');
    const quote = mk('blockquote', 'cap-quote', String(cap.summary).trim());
    summaryRow.appendChild(quote);
    if (cap.why) {
      const whyTip = mk('span', 'cap-why-tip', '?');
      whyTip.title = String(cap.why).trim();
      summaryRow.appendChild(whyTip);
    }
    hero.appendChild(summaryRow);
  }
  mainEl.appendChild(hero);

  // === Scope card with meta pills ===
  const scopeCard = mk('div', 'cap-scope-card');
  // Top row: label left, pills right
  const scopeTop = mk('div', 'cap-scope-top');
  scopeTop.appendChild(mk('span', 'cap-scope-label', 'Scope'));
  const metaPills = mk('div', 'cap-scope-pills');
  if (cap.owner) { metaPills.appendChild(mk('span', 'cap-pill', cap.owner)); }
  if (cap.last_reviewed) { metaPills.appendChild(mk('span', 'cap-pill', cap.last_reviewed)); }
  scopeTop.appendChild(metaPills);
  scopeCard.appendChild(scopeTop);
  // Scope text
  if (cap.scope) {
    scopeCard.appendChild(mk('p', 'cap-scope-text', String(cap.scope).trim()));
  } else {
    scopeCard.appendChild(mk('p', 'cap-scope-text grc-empty', 'No scope defined.'));
  }
  mainEl.appendChild(scopeCard);

  // === Supporting resources (systems, guidelines, processes, threat-models) ===
  const RESOURCE_TYPES = [
    { key: 'system', label: 'Systems' },
    { key: 'guideline', label: 'Guidelines' },
    { key: 'process', label: 'Processes' },
    { key: 'runbook', label: 'Runbooks' },
    { key: 'playbook', label: 'Playbooks' },
    { key: 'threat-model', label: 'Threat Models' }
  ];

  // Collect all resource items grouped by type
  const resourcesByType = {};
  RESOURCE_TYPES.forEach(function(rt) { resourcesByType[rt.key] = []; });

  // Systems from capability definition
  (cap.systems || []).forEach(function(sid) {
    const sysFm = state.fmCache['systems/' + sid + '.md'];
    resourcesByType['system'].push({ path: 'systems/' + sid + '.md', fm: sysFm || { id: sid, type: 'system' }, id: sid });
  });

  // Domain docs: guidelines, processes, threat-models
  // If a doc declares capability: <id>, match on that. Otherwise fall back to
  // domain-based matching (doc lives in same dir) or system-ref matching.
  const capSysIds = (cap.systems || []).slice();
  Object.keys(state.fmCache).forEach(function(p) {
    if (p === dir + '/README.md' || p === dir + '/capabilities.yml') return;
    const fm = state.fmCache[p];
    if (!fm || !fm.type) return;
    if (fm.type === 'standard') return; // standards go in their own section
    const typeKey = fm.type === 'threat-model' ? 'threat-model' : fm.type;
    if (!resourcesByType[typeKey]) return; // skip types not in our filter list

    var matched = false;
    if (fm.capability) {
      // Explicit capability link — match only if it targets this capability
      matched = String(fm.capability) === cap.id;
    } else {
      // Legacy fallback: domain-based or system-ref matching
      var dominated = p.startsWith(dir + '/');
      var refsSys = false;
      if (fm.related && fm.related.systems && Array.isArray(fm.related.systems)) {
        fm.related.systems.forEach(function(sid) { if (capSysIds.indexOf(sid) !== -1) refsSys = true; });
      }
      var isSys = false;
      if (fm.type === 'system' && fm.capabilities) {
        var domKey = domObj ? domObj.dir.replace(/^\d+-/, '') : '';
        var sysCaps = fm.capabilities[domKey];
        if (Array.isArray(sysCaps) && sysCaps.indexOf(cap.id) !== -1) isSys = true;
      }
      matched = dominated || refsSys || isSys;
    }
    if (matched) {
      // Avoid duplicating systems already added from cap.systems
      if (fm.type === 'system') {
        var already = resourcesByType['system'].some(function(r) { return r.path === p; });
        if (already) return;
      }
      resourcesByType[typeKey].push({ path: p, fm: fm, id: fm.id || p });
    }
  });

  // Documents (collapsible, open by default)
  var resTotalCount = 0;
  RESOURCE_TYPES.forEach(function(rt) { resTotalCount += resourcesByType[rt.key].length; });
  var resCollapse = mkCollapsible('Documents (' + resTotalCount + ')', '', true);
  mainEl.appendChild(resCollapse.wrap);
  const resToolbar = mk('div', 'cap-res-toolbar');
  const chipBar = mk('div', 'cap-res-chips');
  const activeFilters = {};
  let resViewMode = 'cards';
  const resContainer = mk('div', '');

  RESOURCE_TYPES.forEach(function(rt) {
    const count = resourcesByType[rt.key].length;
    const defaultOn = count > 0 && rt.key !== 'threat-model';
    const chip = mk('button', 'cap-res-chip' + (defaultOn ? ' active' : ''), rt.label + ' (' + count + ')');
    const chipColor = DOC_TYPE_COLORS[rt.key] || DOC_TYPE_COLORS['default'];
    chip.style.setProperty('--chip-color', chipColor);
    if (!count) { chip.disabled = true; chip.classList.add('disabled'); }
    activeFilters[rt.key] = defaultOn;
    chip.addEventListener('click', function() {
      if (!count) return;
      activeFilters[rt.key] = !activeFilters[rt.key];
      chip.classList.toggle('active', activeFilters[rt.key]);
      renderResources();
    });
    chipBar.appendChild(chip);
  });
  resToolbar.appendChild(chipBar);

  const resFlip = mk('button', 'cap-res-flip');
  resFlip.appendChild(mkFlipIcon('grid'));
  resFlip.title = 'Switch to table';
  resFlip.addEventListener('click', function() {
    resFlip.textContent = '';
    if (resViewMode === 'cards') { resViewMode = 'table'; resFlip.appendChild(mkFlipIcon('list')); resFlip.title = 'Switch to cards'; }
    else { resViewMode = 'cards'; resFlip.appendChild(mkFlipIcon('grid')); resFlip.title = 'Switch to table'; }
    renderResources();
  });
  resToolbar.appendChild(resFlip);
  resCollapse.body.appendChild(resToolbar);
  resCollapse.body.appendChild(resContainer);

  function getFilteredResources() {
    const items = [];
    RESOURCE_TYPES.forEach(function(rt) {
      if (!activeFilters[rt.key]) return;
      resourcesByType[rt.key].forEach(function(r) { items.push({ typeKey: rt.key, typeLabel: rt.label, path: r.path, fm: r.fm, id: r.id }); });
    });
    return items;
  }

  function renderResources() {
    resContainer.textContent = '';
    const items = getFilteredResources();
    if (!items.length) { resContainer.appendChild(mk('p', 'grc-empty', 'No resources match the active filters.')); return; }
    if (resViewMode === 'cards') { renderResCards(items); } else { renderResTable(items); }
  }

  function renderResCards(items) {
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
    resContainer.appendChild(grid);
  }

  function renderResTable(items) {
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
    resContainer.appendChild(tbl);
  }

  renderResources();

  // === Applicable standards (collapsible, open by default) ===
  const domShort = domObj ? domObj.dir.replace(/^\d+-/, '') : '';
  const capReqData = [];
  Object.keys(state.fmCache).forEach(function(p) {
    const fm = state.fmCache[p];
    if (!fm || fm.type !== 'standard' || !fm.requirements) return;
    const matchedReqs = fm.requirements.filter(function(r) {
      if (!r.capabilities) return false;
      const domCaps = r.capabilities[domShort];
      return Array.isArray(domCaps) && domCaps.indexOf(cap.id) !== -1;
    });
    if (matchedReqs.length) capReqData.push({ path: p, fm: fm, reqs: matchedReqs });
  });
  let capTotalReqs = 0;
  capReqData.forEach(function(s) { capTotalReqs += s.reqs.length; });
  var capStdCollapse = mkCollapsible('Applicable standards (' + capTotalReqs + ' requirements)', '', true);
  mainEl.appendChild(capStdCollapse.wrap);
  if (!capReqData.length) {
    capStdCollapse.body.appendChild(mk('p', 'grc-empty', 'No standard requirements reference this capability yet.'));
  } else {
    capReqData.sort(function(a, b) { return (a.fm.title || a.fm.id || '').localeCompare(b.fm.title || b.fm.id || '', undefined, { numeric: true }); });
    capReqData.forEach(function(s) {
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
      capStdCollapse.body.appendChild(wrap);
    });
  }


  // === Right panel ===
  rightEl.appendChild(mk('h3', '', 'Quick reference'));
  [['ID', cap.id], ['Maturity', cap.maturity], ['Owner', cap.owner], ['Domain', domObj ? domObj.label : ''], ['Systems', cap.systems ? cap.systems.join(', ') : 'none']].forEach(function(f) {
    if (!f[1]) return; rightEl.appendChild(mkMetaRow(f[0], f[1]));
  });

  const capPath = dir + '/capabilities.yml';
  mkSourcePanel(rightEl, capPath);
}
