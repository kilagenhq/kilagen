import { mk, matLvl, mkIcon, mkMetaRow, svgEl } from '../dom.js';
import { state } from '../state.js';
import { go, setActiveView, setBread, fadeMain, mainEl, rightEl } from '../nav.js';
import { DOMAINS, DOC_TYPE_COLORS } from '../constants.js';

const COV_CLASSES = { covered: 'nist-cov-covered', partial: 'nist-cov-partial', gap: 'nist-cov-gap' };
const COV_LABELS = { covered: 'Covered', partial: 'Partial', gap: 'Gap' };
const FN_CLASSES = { GV: 'nist-fn-gv', ID: 'nist-fn-id', PR: 'nist-fn-pr', DE: 'nist-fn-de', RS: 'nist-fn-rs', RC: 'nist-fn-rc' };

function domainLabel(dir) { const d = DOMAINS.find(function(dd) { return dd.dir === dir; }); return d ? d.label : dir; }
function domainFromPath(p) { const m = p.match(/^(\d{2}-[^/]+)\//); if (m) return m[1]; return ''; }

function buildNistData() {
  const data = {};
  Object.keys(state.fmCache).forEach(function(path) {
    const fm = state.fmCache[path];
    if (!fm || !fm.lenses) return;
    (Array.isArray(fm.lenses) ? fm.lenses : []).forEach(function(tag) {
      if (typeof tag !== 'string' || tag.indexOf('nist:') !== 0) return;
      const catId = tag.substring(5);
      if (!data[catId]) data[catId] = { docs: [], caps: [] };
      data[catId].docs.push({ path: path, fm: fm });
    });
  });
  DOMAINS.forEach(function(dom) {
    const dc = state.domainCaps[dom.dir]; if (!dc) return;
    Object.keys(dc).forEach(function(capId) {
      const cap = dc[capId];
      (Array.isArray(cap.lenses) ? cap.lenses : []).forEach(function(tag) {
        if (typeof tag !== 'string' || tag.indexOf('nist:') !== 0) return;
        const catId = tag.substring(5);
        if (!data[catId]) data[catId] = { docs: [], caps: [] };
        data[catId].caps.push({ cap: cap, dir: dom.dir, capId: capId });
      });
    });
  });
  return data;
}

function computeCoverage(catData) {
  const caps = catData.caps || [], docs = catData.docs || [];
  const levels = caps.map(function(c) { return matLvl(c.cap.maturity); });
  const activeDocs = docs.filter(function(d) { return d.fm.status === 'active'; }).length;
  const draftDocs = docs.filter(function(d) { return d.fm.status !== 'active'; }).length;
  if (levels.length > 0) {
    if (levels.every(function(l) { return l >= 2; })) return 'covered';
    if (levels.every(function(l) { return l === 0; })) return activeDocs > 0 ? 'partial' : 'gap';
    return 'partial';
  }
  if (activeDocs > 0) return 'covered';
  if (draftDocs > 0) return 'partial';
  return 'gap';
}

function getCoverage(catId, catData) {
  // Use pre-built coverage from registry if available, else compute
  const tag = 'nist:' + catId;
  if (state.coverage && state.coverage[tag]) return state.coverage[tag].status;
  return computeCoverage(catData);
}

/* ===== Collect filter options from nistData ===== */
function collectFilterOptions(nistData) {
  const domains = {}, docTypes = {}, capNames = {};
  Object.keys(nistData).forEach(function(catId) {
    const cd = nistData[catId];
    cd.caps.forEach(function(c) { domains[c.dir] = (domains[c.dir] || 0) + 1; capNames[c.capId] = { name: c.cap.name || c.capId, count: (capNames[c.capId] ? capNames[c.capId].count : 0) + 1 }; });
    cd.docs.forEach(function(d) { const dom = domainFromPath(d.path); if (dom) domains[dom] = (domains[dom] || 0) + 1; const t = d.fm.type; if (t) docTypes[t] = (docTypes[t] || 0) + 1; });
  });
  return { domains: domains, docTypes: docTypes };
}

/* ===== Filter nistData ===== */
function filterCatData(cd, filters) {
  let caps = cd.caps, docs = cd.docs;
  if (Object.keys(filters.domains).length) {
    caps = caps.filter(function(c) { return filters.domains[c.dir]; });
    docs = docs.filter(function(d) { return filters.domains[domainFromPath(d.path)]; });
  }
  if (Object.keys(filters.docTypes).length) {
    docs = docs.filter(function(d) { return filters.docTypes[d.fm.type]; });
  }
  return { caps: caps, docs: docs };
}

/* ===== SVG Wheel ===== */
function drawWheel(container, taxonomy, onSelect, activeId) {
  const w = 420, h = 420, cx = w / 2, cy = h / 2;
  const outerR = 190, innerR = 100, govR = 80;
  const svg = svgEl('svg', { viewBox: '0 0 ' + w + ' ' + h, 'class': 'nist-wheel-svg' });
  svg.appendChild(svgEl('circle', { cx: cx, cy: cy, r: outerR + 4, 'class': 'nist-wheel-bg' }));
  const outerFns = taxonomy.functions.filter(function(f) { return f.id !== 'GV'; });
  const govFn = taxonomy.functions.find(function(f) { return f.id === 'GV'; });
  const sliceAngle = (2 * Math.PI) / outerFns.length, startAngle = -Math.PI / 2;
  outerFns.forEach(function(fn, i) {
    const a1 = startAngle + i * sliceAngle, a2 = a1 + sliceAngle, pad = 0.02, sa = a1 + pad, ea = a2 - pad;
    const x1o = cx + outerR * Math.cos(sa), y1o = cy + outerR * Math.sin(sa), x2o = cx + outerR * Math.cos(ea), y2o = cy + outerR * Math.sin(ea);
    const x1i = cx + innerR * Math.cos(ea), y1i = cy + innerR * Math.sin(ea), x2i = cx + innerR * Math.cos(sa), y2i = cy + innerR * Math.sin(sa);
    const d = 'M' + x1o + ',' + y1o + ' A' + outerR + ',' + outerR + ' 0 ' + ((ea - sa > Math.PI) ? 1 : 0) + ',1 ' + x2o + ',' + y2o + ' L' + x1i + ',' + y1i + ' A' + innerR + ',' + innerR + ' 0 ' + ((ea - sa > Math.PI) ? 1 : 0) + ',0 ' + x2i + ',' + y2i + ' Z';
    const slice = svgEl('path', { d: d, 'class': 'nist-slice ' + (FN_CLASSES[fn.id] || '') + (activeId === fn.id ? ' active' : '') });
    slice.addEventListener('click', function() { onSelect(fn); });
    svg.appendChild(slice);
    const midA = (sa + ea) / 2, labelR = (outerR + innerR) / 2, lx = cx + labelR * Math.cos(midA), ly = cy + labelR * Math.sin(midA);
    svg.appendChild(Object.assign(svgEl('text', { x: lx, y: ly, 'class': 'nist-slice-label' }), { textContent: fn.name.toUpperCase() }));
    svg.appendChild(Object.assign(svgEl('text', { x: lx, y: ly + 15, 'class': 'nist-slice-id' }), { textContent: fn.id }));
  });
  if (govFn) {
    const gc = svgEl('circle', { cx: cx, cy: cy, r: govR, 'class': 'nist-gov-circle' + (activeId === 'GV' ? ' active' : '') });
    gc.addEventListener('click', function() { onSelect(govFn); });
    svg.appendChild(gc);
    svg.appendChild(Object.assign(svgEl('text', { x: cx, y: cy - 8, 'class': 'nist-gov-label' }), { textContent: 'GOVERN' }));
    svg.appendChild(Object.assign(svgEl('text', { x: cx, y: cy + 10, 'class': 'nist-gov-id' }), { textContent: 'GV' }));
  }
  container.textContent = '';
  container.appendChild(svg);
}

/* ===== Category card ===== */
function renderCatCard(cat, cd, cov) {
  const card = mk('div', 'nist-cat-card');
  const cardHeader = mk('div', 'nist-cat-header');
  cardHeader.appendChild(mk('span', 'nist-cov-dot ' + COV_CLASSES[cov]));
  cardHeader.appendChild(mk('span', 'nist-cat-id', cat.id));
  cardHeader.appendChild(mk('span', 'nist-cat-name', cat.name));
  card.appendChild(cardHeader);
  if (cd.caps.length) {
    const capRow = mk('div', 'nist-cat-row');
    capRow.appendChild(mk('span', 'nist-cat-label', 'Capabilities'));
    const capVal = mk('span', 'nist-cat-val');
    cd.caps.forEach(function(c) {
      const lvl = matLvl(c.cap.maturity);
      const chip = mk('span', 'nist-cap-chip mat-border-L' + lvl);
      chip.appendChild(mk('span', '', (c.cap.name || c.capId) + ' (L' + lvl + ')'));
      chip.appendChild(mk('span', 'nist-item-domain', domainLabel(c.dir)));
      (function(dir, id) { chip.addEventListener('click', function(e) { go('cap/' + dir + '/' + id, e); }); })(c.dir, c.capId);
      capVal.appendChild(chip);
    });
    capRow.appendChild(capVal);
    card.appendChild(capRow);
  }
  if (cd.docs.length) {
    const docRow = mk('div', 'nist-cat-row');
    docRow.appendChild(mk('span', 'nist-cat-label', 'Documents'));
    const docVal = mk('span', 'nist-cat-val');
    cd.docs.forEach(function(d) {
      const chip = mk('span', 'nist-doc-chip');
      chip.appendChild(mkIcon(d.fm.type || 'file', 'nist-doc-icon'));
      chip.appendChild(mk('span', '', d.fm.title || d.fm.id || d.path.split('/').pop()));
      const dom = domainFromPath(d.path);
      if (dom) chip.appendChild(mk('span', 'nist-item-domain', domainLabel(dom)));
      chip.addEventListener('click', function(e) {
        if (d.fm.type === 'system') go('sys/' + d.path.replace('systems/', ''), e);
        else go('doc/' + d.path, e);
      });
      docVal.appendChild(chip);
    });
    docRow.appendChild(docVal);
    card.appendChild(docRow);
  }
  if (!cd.caps.length && !cd.docs.length) card.appendChild(mk('p', 'nist-cat-notes', 'No items tagged with ' + cat.id + '.'));
  return card;
}

/* ===== Table row ===== */
function renderCatTableRow(cat, cd, cov) {
  const tr = mk('tr', 'nist-table-row');
  const tdCov = mk('td', ''); tdCov.appendChild(mk('span', 'nist-cov-dot ' + COV_CLASSES[cov])); tr.appendChild(tdCov);
  tr.appendChild(mk('td', 'nist-table-id', cat.id));
  tr.appendChild(mk('td', '', cat.name));
  tr.appendChild(mk('td', 'nist-table-num', String(cd.caps.length)));
  tr.appendChild(mk('td', 'nist-table-num', String(cd.docs.length)));
  const tdL = mk('td', ''); tdL.appendChild(mk('span', 'nist-cov-badge-sm ' + COV_CLASSES[cov], COV_LABELS[cov])); tr.appendChild(tdL);
  return tr;
}

/* ===== Filter chips ===== */
function buildFilterBar(options, filters, onChange) {
  const bar = mk('div', 'nist-filter-bar');

  // Domain chips
  const domKeys = Object.keys(options.domains).sort();
  if (domKeys.length > 1) {
    const domSection = mk('div', 'nist-filter-section');
    domSection.appendChild(mk('span', 'nist-filter-label', 'Domain'));
    const domChips = mk('div', 'cap-res-chips');
    domKeys.forEach(function(dk) {
      const chip = mk('button', 'cap-res-chip' + (filters.domains[dk] ? ' active' : ''), domainLabel(dk) + ' (' + options.domains[dk] + ')');
      chip.addEventListener('click', function() {
        if (filters.domains[dk]) delete filters.domains[dk]; else filters.domains[dk] = true;
        chip.classList.toggle('active', !!filters.domains[dk]);
        onChange();
      });
      domChips.appendChild(chip);
    });
    domSection.appendChild(domChips);
    bar.appendChild(domSection);
  }

  // Doc type chips
  const typeKeys = Object.keys(options.docTypes).sort();
  if (typeKeys.length > 1) {
    const typeSection = mk('div', 'nist-filter-section');
    typeSection.appendChild(mk('span', 'nist-filter-label', 'Type'));
    const typeChips = mk('div', 'cap-res-chips');
    typeKeys.forEach(function(tk) {
      const label = tk.charAt(0).toUpperCase() + tk.slice(1);
      const chip = mk('button', 'cap-res-chip' + (filters.docTypes[tk] ? ' active' : ''), label + ' (' + options.docTypes[tk] + ')');
      chip.addEventListener('click', function() {
        if (filters.docTypes[tk]) delete filters.docTypes[tk]; else filters.docTypes[tk] = true;
        chip.classList.toggle('active', !!filters.docTypes[tk]);
        onChange();
      });
      typeChips.appendChild(chip);
    });
    typeSection.appendChild(typeChips);
    bar.appendChild(typeSection);
  }

  // Clear button
  if (domKeys.length > 1 || typeKeys.length > 1) {
    const clearBtn = mk('button', 'browse-clear-btn', 'Clear filters');
    clearBtn.addEventListener('click', function() {
      filters.domains = {};
      filters.docTypes = {};
      bar.querySelectorAll('.cap-res-chip').forEach(function(c) { c.classList.remove('active'); });
      onChange();
    });
    bar.appendChild(clearBtn);
  }

  return bar;
}

/* ===== Main render ===== */
export function renderNistCsf() {
  setActiveView('nist-csf'); fadeMain(); mainEl.textContent = ''; rightEl.textContent = ''; setBread([{ label: 'Domains', action: function() { go('domains'); } }, { label: 'Lenses' }]);

  const taxonomy = state.lenses && state.lenses.nist;
  if (!taxonomy || !taxonomy.functions) { mainEl.appendChild(mk('p', 'grc-empty', 'NIST CSF lens not found in registry. Run kilagen build.')); return; }
  (function() {

    const nistData = buildNistData();
    const filterOptions = collectFilterOptions(nistData);
    let viewMode = 'cards';
    let activeFnId = null;
    const filters = { domains: {}, docTypes: {} };

    // Title
    mainEl.appendChild(mk('h1', '', 'NIST CSF 2.0 Lens'));
    mainEl.appendChild(mk('p', 'nist-subtitle', 'Navigate the security program through the NIST Cybersecurity Framework. Coverage is calculated automatically from capability maturity and document status.'));

    // Header row: "Show all" left, toggle right
    const headerRow = mk('div', 'nist-header-row');
    const showAllBtn = mk('button', 'nist-show-all active', 'Show all functions');
    showAllBtn.addEventListener('click', function() {
      activeFnId = null; showAllBtn.classList.add('active');
      drawWheel(wheelContainer, taxonomy, selectFn, null);
      renderDetail();
    });
    headerRow.appendChild(showAllBtn);
    const toggleBtn = mk('button', 'nist-view-toggle');
    toggleBtn.title = 'Switch to table view';
    toggleBtn.appendChild(mkIcon('standard', 'nist-toggle-icon'));
    toggleBtn.addEventListener('click', function() {
      viewMode = viewMode === 'cards' ? 'table' : 'cards';
      toggleBtn.textContent = '';
      toggleBtn.appendChild(mkIcon(viewMode === 'cards' ? 'standard' : 'capability', 'nist-toggle-icon'));
      toggleBtn.title = viewMode === 'cards' ? 'Switch to table view' : 'Switch to card view';
      renderDetail();
    });
    headerRow.appendChild(toggleBtn);
    mainEl.appendChild(headerRow);

    // Wheel + filters + detail
    const wheelSection = mk('div', 'nist-wheel-section');
    const wheelCol = mk('div', 'nist-wheel-col');
    const wheelContainer = mk('div', 'nist-wheel-container');
    wheelCol.appendChild(wheelContainer);

    // Filters below wheel
    const filterBar = buildFilterBar(filterOptions, filters, function() { renderDetail(); });
    wheelCol.appendChild(filterBar);

    const detailContainer = mk('div', 'nist-detail-container');
    wheelSection.appendChild(wheelCol);
    wheelSection.appendChild(detailContainer);
    mainEl.appendChild(wheelSection);

    function selectFn(fn) {
      activeFnId = fn.id; showAllBtn.classList.remove('active');
      drawWheel(wheelContainer, taxonomy, selectFn, fn.id);
      renderDetail();
    }

    function hasActiveFilters() { return Object.keys(filters.domains).length > 0 || Object.keys(filters.docTypes).length > 0; }

    function renderDetail() {
      detailContainer.textContent = '';
      const fns = activeFnId ? taxonomy.functions.filter(function(f) { return f.id === activeFnId; }) : taxonomy.functions;
      const filtering = hasActiveFilters();

      fns.forEach(function(fn) {
        const header = mk('div', 'nist-fn-header');
        header.appendChild(mk('span', 'nist-fn-dot ' + (FN_CLASSES[fn.id] || '')));
        header.appendChild(mk('span', 'nist-fn-name', fn.name + ' (' + fn.id + ')'));
        detailContainer.appendChild(header);

        // Coverage summary (always computed on unfiltered data)
        const counts = { covered: 0, partial: 0, gap: 0 };
        fn.categories.forEach(function(cat) { counts[computeCoverage(nistData[cat.id] || { docs: [], caps: [] })]++; });
        const summary = mk('div', 'nist-cov-summary');
        ['covered', 'partial', 'gap'].forEach(function(k) {
          if (!counts[k]) return;
          summary.appendChild(mk('span', 'nist-cov-badge ' + COV_CLASSES[k], counts[k] + ' ' + COV_LABELS[k]));
        });
        detailContainer.appendChild(summary);

        if (viewMode === 'cards') {
          const grid = mk('div', 'nist-cat-grid');
          fn.categories.forEach(function(cat) {
            const raw = nistData[cat.id] || { docs: [], caps: [] };
            const cd = filtering ? filterCatData(raw, filters) : raw;
            const cov = computeCoverage(raw); // coverage on unfiltered
            grid.appendChild(renderCatCard(cat, cd, cov));
          });
          detailContainer.appendChild(grid);
        } else {
          const tbl = mk('table', 'compliance-table nist-table');
          const thead = mk('thead'); const hr = mk('tr');
          ['', 'ID', 'Category', 'Caps', 'Docs', 'Coverage'].forEach(function(h) { hr.appendChild(mk('th', '', h)); });
          thead.appendChild(hr); tbl.appendChild(thead);
          const tbody = mk('tbody');
          fn.categories.forEach(function(cat) {
            const raw = nistData[cat.id] || { docs: [], caps: [] };
            const cd = filtering ? filterCatData(raw, filters) : raw;
            const cov = computeCoverage(raw);
            tbody.appendChild(renderCatTableRow(cat, cd, cov));
          });
          tbl.appendChild(tbody); detailContainer.appendChild(tbl);
        }
      });
    }

    drawWheel(wheelContainer, taxonomy, selectFn, null);
    renderDetail();

    // Right panel
    rightEl.appendChild(mk('h3', '', 'Coverage Overview'));
    taxonomy.functions.forEach(function(fn) {
      const fnRow = mk('div', 'nist-right-fn');
      fnRow.appendChild(mk('span', 'nist-fn-dot-sm ' + (FN_CLASSES[fn.id] || '')));
      fnRow.appendChild(mk('span', 'nist-right-fn-name', fn.name));
      rightEl.appendChild(fnRow);
      fn.categories.forEach(function(cat) {
        const cov = computeCoverage(nistData[cat.id] || { docs: [], caps: [] });
        const row = mk('div', 'meta-row nist-right-cat-row');
        row.addEventListener('click', function() { selectFn(fn); });
        row.appendChild(mk('span', 'meta-key', cat.id));
        row.appendChild(mk('span', 'nist-cov-badge-sm ' + COV_CLASSES[cov], COV_LABELS[cov]));
        rightEl.appendChild(row);
      });
    });
    rightEl.appendChild(mk('h3', '', 'Stats'));
    let covC = 0, parC = 0, gapC = 0, total = 0;
    taxonomy.functions.forEach(function(fn) { fn.categories.forEach(function(cat) {
      total++; const c = computeCoverage(nistData[cat.id] || { docs: [], caps: [] });
      if (c === 'covered') covC++; else if (c === 'partial') parC++; else gapC++;
    }); });
    [['Categories', String(total)], ['Covered', String(covC)], ['Partial', String(parC)], ['Gaps', String(gapC)]].forEach(function(s) {
      rightEl.appendChild(mkMetaRow(s[0], s[1]));
    });
  })();
}
