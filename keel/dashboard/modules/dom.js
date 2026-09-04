// SVG icons based on Lucide (https://lucide.dev) — MIT License.
export function mk(tag, cls, txt) { const e = document.createElement(tag); if (cls) e.className = cls; if (txt) e.textContent = txt; return e; }
export function matLvl(m) { if (!m) return 0; var n = parseInt(m.charAt(1)); return isNaN(n) ? 0 : n; }
export function matDot(m) { const l = matLvl(m); const s = mk('span', 'mat-dot mat-L' + l); s.title = m || 'L0-none'; return s; }
export function mkEmpty(iconType, title, desc) {
  const el = mk('div', 'empty-state');
  el.appendChild(mkIcon(iconType, 'empty-state-icon'));
  el.appendChild(mk('div', 'empty-state-title', title));
  if (desc) el.appendChild(mk('div', 'empty-state-desc', desc));
  return el;
}
const NS = 'http://www.w3.org/2000/svg';
export function svgEl(tag, attrs) { const e = document.createElementNS(NS, tag); if (attrs) Object.keys(attrs).forEach(function(k) { e.setAttribute(k, attrs[k]); }); return e; }
const TYPE_SVG_BUILDERS = {
  policy: function(s) { s.appendChild(svgEl('path', { d: 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z' })); s.appendChild(svgEl('path', { d: 'm9 12 2 2 4-4' })); },
  standard: function(s) { s.appendChild(svgEl('path', { d: 'M3 5h18v14H3z' })); s.appendChild(svgEl('path', { d: 'M3 10h4M3 14h2M11 5v4M15 5v2M19 5v4' })); },
  process: function(s) { s.appendChild(svgEl('rect', { x: '3', y: '3', width: '6', height: '6', rx: '1' })); s.appendChild(svgEl('rect', { x: '15', y: '3', width: '6', height: '6', rx: '1' })); s.appendChild(svgEl('rect', { x: '9', y: '15', width: '6', height: '6', rx: '1' })); s.appendChild(svgEl('path', { d: 'M6 9v3a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9' })); s.appendChild(svgEl('path', { d: 'M12 12v3' })); },
  runbook: function(s) { s.appendChild(svgEl('path', { d: 'm7 11 2-2-2-2' })); s.appendChild(svgEl('path', { d: 'M11 13h4' })); s.appendChild(svgEl('rect', { x: '3', y: '3', width: '18', height: '18', rx: '2' })); },
  playbook: function(s) { s.appendChild(svgEl('circle', { cx: '12', cy: '12', r: '10' })); s.appendChild(svgEl('path', { d: 'M18 12H6' })); s.appendChild(svgEl('path', { d: 'm9 9 3 3-3 3' })); },
  guideline: function(s) { s.appendChild(svgEl('path', { d: 'M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z' })); s.appendChild(svgEl('path', { d: 'M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z' })); },
  threat: function(s) { s.appendChild(svgEl('path', { d: 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z' })); s.appendChild(svgEl('path', { d: 'M12 8v4M12 16h.01' })); },
  'threat-model': function(s) { s.appendChild(svgEl('circle', { cx: '12', cy: '12', r: '10' })); s.appendChild(svgEl('circle', { cx: '12', cy: '12', r: '6' })); s.appendChild(svgEl('circle', { cx: '12', cy: '12', r: '2' })); s.appendChild(svgEl('path', { d: 'M12 2v4M12 18v4M2 12h4M18 12h4' })); },
  vendor: function(s) { s.appendChild(svgEl('rect', { x: '2', y: '7', width: '20', height: '14', rx: '2' })); s.appendChild(svgEl('path', { d: 'M16 7V3a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v4' })); s.appendChild(svgEl('path', { d: 'M12 12h.01' })); },
  risk: function(s) { s.appendChild(svgEl('path', { d: 'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3' })); s.appendChild(svgEl('path', { d: 'M12 9v4M12 17h.01' })); },
  adr: function(s) { s.appendChild(svgEl('path', { d: 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z' })); s.appendChild(svgEl('path', { d: 'M14 2v4a2 2 0 0 0 2 2h4' })); s.appendChild(svgEl('path', { d: 'm9 15 2 2 4-4' })); },
  incident: function(s) { s.appendChild(svgEl('polygon', { points: '13 2 3 14 12 14 11 22 21 10 12 10 13 2' })); },
  system: function(s) { s.appendChild(svgEl('rect', { x: '2', y: '2', width: '20', height: '8', rx: '2' })); s.appendChild(svgEl('rect', { x: '2', y: '14', width: '20', height: '8', rx: '2' })); s.appendChild(svgEl('path', { d: 'M6 6h.01M6 18h.01' })); },
  exception: function(s) { s.appendChild(svgEl('line', { x1: '6', y1: '3', x2: '6', y2: '15' })); s.appendChild(svgEl('circle', { cx: '18', cy: '6', r: '3' })); s.appendChild(svgEl('circle', { cx: '6', cy: '18', r: '3' })); s.appendChild(svgEl('path', { d: 'M18 9a9 9 0 0 1-9 9' })); },
  'dom-grc': function(s) { s.appendChild(svgEl('path', { d: 'M9 2h6v4H9z' })); s.appendChild(svgEl('rect', { x: '4', y: '4', width: '16', height: '18', rx: '1' })); s.appendChild(svgEl('path', { d: 'M9 12h6M9 16h4' })); },
  'dom-iam': function(s) { s.appendChild(svgEl('circle', { cx: '7.5', cy: '15.5', r: '5.5' })); s.appendChild(svgEl('path', { d: 'M21 2l-9.6 9.6' })); s.appendChild(svgEl('path', { d: 'M15.5 7.5l3 3L22 7l-3-3' })); },
  'dom-infra': function(s) { s.appendChild(svgEl('rect', { x: '2', y: '2', width: '20', height: '8', rx: '2' })); s.appendChild(svgEl('rect', { x: '2', y: '14', width: '20', height: '8', rx: '2' })); s.appendChild(svgEl('path', { d: 'M6 6h.01M6 18h.01' })); },
  'dom-appsec': function(s) { s.appendChild(svgEl('path', { d: 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z' })); s.appendChild(svgEl('path', { d: 'm8 12 3 3 5-5' })); },
  'dom-secops': function(s) { s.appendChild(svgEl('path', { d: 'M22 12h-4l-3 9L9 3l-3 9H2' })); },
  'dom-ir': function(s) { s.appendChild(svgEl('polygon', { points: '13 2 3 14 12 14 11 22 21 10 12 10 13 2' })); },
  'dom-offensive': function(s) { s.appendChild(svgEl('circle', { cx: '12', cy: '12', r: '10' })); s.appendChild(svgEl('circle', { cx: '12', cy: '12', r: '6' })); s.appendChild(svgEl('circle', { cx: '12', cy: '12', r: '2' })); },
  'dom-tprm': function(s) { s.appendChild(svgEl('rect', { x: '2', y: '7', width: '20', height: '14', rx: '2' })); s.appendChild(svgEl('path', { d: 'M16 7V3a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v4' })); s.appendChild(svgEl('path', { d: 'M12 12h.01' })); },
  'dom-digital-assets': function(s) { s.appendChild(svgEl('rect', { x: '3', y: '11', width: '18', height: '11', rx: '2' })); s.appendChild(svgEl('path', { d: 'M7 11V7a5 5 0 0 1 10 0v4' })); },
  'dom-awareness': function(s) { s.appendChild(svgEl('path', { d: 'M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5' })); s.appendChild(svgEl('path', { d: 'M9 18h6' })); s.appendChild(svgEl('path', { d: 'M10 22h4' })); },
  'dom-data-security': function(s) { s.appendChild(svgEl('ellipse', { cx: '12', cy: '5', rx: '9', ry: '3' })); s.appendChild(svgEl('path', { d: 'M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5' })); s.appendChild(svgEl('path', { d: 'M3 12c0 1.7 4 3 9 3s9-1.3 9-3' })); },
  capability: function(s) { s.appendChild(svgEl('path', { d: 'M21 8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z' })); s.appendChild(svgEl('path', { d: 'M12 22V12' })); s.appendChild(svgEl('path', { d: 'm3.3 7 8.7 5 8.7-5' })); },
  search: function(s) { s.appendChild(svgEl('circle', { cx: '11', cy: '11', r: '8' })); s.appendChild(svgEl('path', { d: 'm21 21-4.3-4.3' })); },
  calendar: function(s) { s.appendChild(svgEl('path', { d: 'M8 2v4M16 2v4' })); s.appendChild(svgEl('rect', { x: '3', y: '4', width: '18', height: '18', rx: '2' })); s.appendChild(svgEl('path', { d: 'M3 10h18' })); },
  schedule: function(s) { s.appendChild(svgEl('path', { d: 'M8 2v4M16 2v4' })); s.appendChild(svgEl('rect', { x: '3', y: '4', width: '18', height: '18', rx: '2' })); s.appendChild(svgEl('path', { d: 'M3 10h18' })); s.appendChild(svgEl('path', { d: 'M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01' })); },
  chart: function(s) { s.appendChild(svgEl('path', { d: 'M3 3v18h18' })); s.appendChild(svgEl('path', { d: 'm7 16 4-8 4 4 4-6' })); },
  link: function(s) { s.appendChild(svgEl('path', { d: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71' })); s.appendChild(svgEl('path', { d: 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71' })); },
  book: function(s) { s.appendChild(svgEl('path', { d: 'M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20' })); },
  file: function(s) { s.appendChild(svgEl('path', { d: 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z' })); s.appendChild(svgEl('path', { d: 'M14 2v4a2 2 0 0 0 2 2h4' })); },
  domain: function(s) { s.appendChild(svgEl('rect', { x: '3', y: '3', width: '7', height: '7', rx: '1' })); s.appendChild(svgEl('rect', { x: '14', y: '3', width: '7', height: '7', rx: '1' })); s.appendChild(svgEl('rect', { x: '3', y: '14', width: '7', height: '7', rx: '1' })); s.appendChild(svgEl('rect', { x: '14', y: '14', width: '7', height: '7', rx: '1' })); },
  'data-asset': function(s) { s.appendChild(svgEl('ellipse', { cx: '12', cy: '5', rx: '9', ry: '3' })); s.appendChild(svgEl('path', { d: 'M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5' })); s.appendChild(svgEl('path', { d: 'M3 12c0 1.7 4 3 9 3s9-1.3 9-3' })); s.appendChild(svgEl('path', { d: 'M12 8v4M12 16h.01' })); },
  'business-process': function(s) { s.appendChild(svgEl('rect', { x: '3', y: '3', width: '7', height: '7', rx: '1' })); s.appendChild(svgEl('rect', { x: '14', y: '3', width: '7', height: '7', rx: '1' })); s.appendChild(svgEl('rect', { x: '3', y: '14', width: '7', height: '7', rx: '1' })); s.appendChild(svgEl('rect', { x: '14', y: '14', width: '7', height: '7', rx: '1' })); s.appendChild(svgEl('path', { d: 'M10 6.5h4M10 17.5h4M6.5 10v4M17.5 10v4' })); }
};
export function mkIcon(type, cls) {
  const svg = svgEl('svg', { viewBox: '0 0 24 24', 'class': cls || 'doc-type-icon' });
  const build = TYPE_SVG_BUILDERS[type];
  if (build) build(svg); else { svg.appendChild(svgEl('rect', { x: '3', y: '3', width: '18', height: '18', rx: '2' })); if (typeof console !== 'undefined') console.warn('[mkIcon] No icon for type: ' + type); }
  return svg;
}
const GH_KEEL_FILES = ['design.md', 'README.md', 'glossary.md', 'maturity.md', 'compliance.md', 'lenses.md', 'instantiation.md'];
const GH_KEEL_DIRS = ['lenses/', 'schemas/', 'templates/'];
function ghRepoPath(path) {
  if (path.indexOf('keel/') === 0 || path.indexOf('program/') === 0) return path;
  if (GH_KEEL_FILES.indexOf(path) !== -1) return 'keel/' + path;
  if (GH_KEEL_DIRS.some(function(d) { return path.indexOf(d) === 0; })) return 'keel/' + path;
  return 'program/' + path;
}
export function ghUrl(path) {
  const state = window.__keelState;
  const repo = (state && state.config && state.config.repo) ? state.config.repo : '';
  if (!repo) return '';
  return 'https://github.com/' + repo + '/blob/main/' + ghRepoPath(path);
}
export function ghTreeUrl(path) {
  const state = window.__keelState;
  const repo = (state && state.config && state.config.repo) ? state.config.repo : '';
  if (!repo) return '';
  return 'https://github.com/' + repo + '/tree/main/' + ghRepoPath(path);
}
export function mkFlipIcon(type) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('width', '16'); svg.setAttribute('height', '16'); svg.setAttribute('viewBox', '0 0 16 16'); svg.setAttribute('fill', 'currentColor');
  if (type === 'grid') {
    [[1,1,6,6],[9,1,6,6],[1,9,6,6],[9,9,6,6]].forEach(function(r) {
      const rect = document.createElementNS(ns, 'rect');
      rect.setAttribute('x', r[0]); rect.setAttribute('y', r[1]); rect.setAttribute('width', r[2]); rect.setAttribute('height', r[3]); rect.setAttribute('rx', '1');
      svg.appendChild(rect);
    });
  } else {
    [[1,2,14,2.5],[1,6.75,14,2.5],[1,11.5,14,2.5]].forEach(function(r) {
      const rect = document.createElementNS(ns, 'rect');
      rect.setAttribute('x', r[0]); rect.setAttribute('y', r[1]); rect.setAttribute('width', r[2]); rect.setAttribute('height', r[3]); rect.setAttribute('rx', '1');
      svg.appendChild(rect);
    });
  }
  return svg;
}
export function mkMetaRow(label, value) { const row = mk('div', 'meta-row'); row.appendChild(mk('span', 'meta-key', label)); row.appendChild(mk('span', 'meta-val', value)); return row; }
export function mkCollapsible(title, summaryText, startOpen) {
  const wrap = mk('div', 'std-collapse');
  const header = mk('div', 'std-collapse-header');
  header.appendChild(mk('span', 'std-collapse-arrow', startOpen ? '\u25BE' : '\u25B8'));
  header.appendChild(mk('span', '', title));
  header.appendChild(mk('span', 'std-collapse-summary', summaryText));
  const body = mk('div', 'std-collapse-body');
  body.style.display = startOpen ? 'block' : 'none';
  if (startOpen) wrap.classList.add('open');
  header.addEventListener('click', function() {
    const isOpen = body.style.display !== 'none';
    body.style.display = isOpen ? 'none' : 'block';
    wrap.classList.toggle('open', !isOpen);
    header.querySelector('.std-collapse-arrow').textContent = isOpen ? '\u25B8' : '\u25BE';
  });
  wrap.appendChild(header);
  wrap.appendChild(body);
  return { wrap: wrap, header: header, body: body };
}
export function mkExpandAllBtn(bodyCard) {
  var expanded = false;
  var btn = mk('button', 'app-sys-expand-btn');
  btn.title = 'Expand all';
  var svg = svgEl('svg', { viewBox: '0 0 24 24', width: '16', height: '16', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  svg.appendChild(svgEl('polyline', { points: '7 13 12 18 17 13' }));
  svg.appendChild(svgEl('polyline', { points: '7 6 12 11 17 6' }));
  btn.appendChild(svg);
  btn.addEventListener('click', function() {
    expanded = !expanded;
    bodyCard.querySelectorAll(':scope > .std-collapse').forEach(function(col) {
      var hdr = col.querySelector('.std-collapse-header');
      var bdy = col.querySelector('.std-collapse-body');
      if (!hdr || !bdy) return;
      bdy.style.display = expanded ? 'block' : 'none';
      col.classList.toggle('open', expanded);
      hdr.querySelector('.std-collapse-arrow').textContent = expanded ? '\u25BE' : '\u25B8';
    });
    btn.title = expanded ? 'Collapse all' : 'Expand all';
    svg.style.transform = expanded ? 'rotate(180deg)' : '';
  });
  return btn;
}
export function mkSourcePanel(container, filePath) {
  container.appendChild(mk('h3', '', 'Source'));
  var pathRow = mk('div', 'meta-row');
  pathRow.appendChild(mk('span', 'meta-key', 'File'));
  var pathVal = mk('span', 'meta-val', filePath);
  pathVal.style.fontFamily = "'SF Mono',SFMono-Regular,Consolas,monospace";
  pathVal.style.fontSize = '11px';
  pathRow.appendChild(pathVal);
  container.appendChild(pathRow);
  var href = ghUrl(filePath);
  if (href) { var link = mk('a', 'source-link', 'View in GitHub'); link.href = href; link.target = '_blank'; link.rel = 'noopener noreferrer'; container.appendChild(link); }
}
export function mkTocFromCollapsibles(container, sourceEl) {
  sourceEl.querySelectorAll(':scope > .std-collapse > .std-collapse-header').forEach(function(header) {
    var spans = header.querySelectorAll('span:not(.std-collapse-arrow):not(.std-collapse-summary)');
    var label = spans.length ? spans[0].textContent.trim() : '';
    if (!label) return;
    var tocItem = mk('div', 'toc-item');
    tocItem.textContent = label;
    tocItem.addEventListener('click', function() { header.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    container.appendChild(tocItem);
  });
}
// Resolve a role slug (e.g. "role-cto") to its human-readable title from the
// registry. When no matching role doc is loaded (e.g. typo, stale registry,
// or referent removed), the slug is returned with a " (unknown role)" suffix
// so users can distinguish unresolved slugs from intentional titles.
// Returns '' for empty input.
export function roleTitle(slug) {
  if (!slug || typeof slug !== 'string') return '';
  const state = window.__keelState;
  if (!state || !state.fmCache) return slug + ' (unknown role)';
  // Prefer O(1) lookup via idToPath; fall back to a scan if the index is
  // missing (e.g. registry only partially loaded).
  if (state.idToPath && state.idToPath[slug]) {
    const fm = state.fmCache[state.idToPath[slug]];
    if (fm && fm.title) return fm.title;
  }
  const cache = state.fmCache;
  const keys = Object.keys(cache);
  for (let i = 0; i < keys.length; i++) {
    const fm = cache[keys[i]];
    if (fm && fm.id === slug && fm.title) return fm.title;
  }
  return slug + ' (unknown role)';
}

// Format a role reference (scalar slug, array of slugs, or empty) as a
// human-readable string. Single slug -> title; multi-slug -> ", " joined.
export function formatRoles(value) {
  if (!value) return '';
  if (Array.isArray(value)) {
    return value.map(roleTitle).filter(Boolean).join(', ');
  }
  return roleTitle(value);
}

export function mkCopyBtn() {
  const btn = mk('button', 'copy-link-btn');
  btn.appendChild(mkIcon('link', 'copy-link-icon'));
  btn.title = 'Copy link';
  btn.addEventListener('click', function(e) {
    e.stopPropagation();
    navigator.clipboard.writeText(window.location.href).then(function() {
      btn.textContent = '\u2713'; btn.classList.add('copied');
      setTimeout(function() { btn.textContent = ''; btn.appendChild(mkIcon('link', 'copy-link-icon')); btn.classList.remove('copied'); }, 1500);
    }).catch(function() { btn.textContent = '!'; btn.title = 'Copy failed — clipboard requires HTTPS or page focus'; setTimeout(function() { btn.textContent = ''; btn.appendChild(mkIcon('link', 'copy-link-icon')); btn.title = 'Copy link'; }, 1500); });
  });
  return btn;
}
