// SVG icons based on Lucide (https://lucide.dev) — MIT License.
export function mk(tag, cls, txt) { const e = document.createElement(tag); if (cls) e.className = cls; if (txt) e.textContent = txt; return e; }
/* A header cell that says what it heads. Without scope a screen reader has to
   guess which cells a header belongs to, and it guesses wrong on wide tables. */
export function th(label, scope) {
  const cell = mk('th', '', label);
  cell.setAttribute('scope', scope || 'col');
  return cell;
}
/* Enter and Space activate a thing that is only a button or a link by role.
   A real <button> gets this from the browser; anything wearing role="button"
   or role="link" has to implement it, and six hand-written copies of the same
   two keys is six chances for one of them to be forgotten. */
export function onActivate(el, run) {
  el.addEventListener('keydown', function(e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    run(e);
  });
}
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
  decision: function(s) { s.appendChild(svgEl('path', { d: 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z' })); s.appendChild(svgEl('path', { d: 'M14 2v4a2 2 0 0 0 2 2h4' })); s.appendChild(svgEl('path', { d: 'm9 15 2 2 4-4' })); },
  incident: function(s) { s.appendChild(svgEl('polygon', { points: '13 2 3 14 12 14 11 22 21 10 12 10 13 2' })); },
  system: function(s) { s.appendChild(svgEl('rect', { x: '2', y: '2', width: '20', height: '8', rx: '2' })); s.appendChild(svgEl('rect', { x: '2', y: '14', width: '20', height: '8', rx: '2' })); s.appendChild(svgEl('path', { d: 'M6 6h.01M6 18h.01' })); },
  gap: function(s) { s.appendChild(svgEl('path', { d: 'M12 2v6M12 16v6' })); s.appendChild(svgEl('path', { d: 'M4.9 4.9l4.2 4.2M14.9 14.9l4.2 4.2' })); s.appendChild(svgEl('circle', { cx: '12', cy: '12', r: '3' })); },
  role: function(s) { s.appendChild(svgEl('path', { d: 'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2' })); s.appendChild(svgEl('circle', { cx: '12', cy: '7', r: '4' })); },
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
  /* Two chevrons pointing apart, and two pointing together. They need real
     space between them: at 15px a pair that meets in the middle reads as a
     diamond and an X rather than as a direction. */
  expand: function(s) { s.appendChild(svgEl('polyline', { points: '6 9 12 3 18 9' })); s.appendChild(svgEl('polyline', { points: '6 15 12 21 18 15' })); },
  collapse: function(s) { s.appendChild(svgEl('polyline', { points: '6 3 12 9 18 3' })); s.appendChild(svgEl('polyline', { points: '6 21 12 15 18 21' })); },
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
/* A site path already says which tree it came from: framework material is
   prefixed keel/, program content is not. */
function ghRepoPath(path) {
  if (path.indexOf('keel/') === 0) return 'keel/content/' + path.substring(5);
  return 'program/' + path;
}
export function ghUrl(path) {
  const state = window.__keelState;
  const repo = (state && state.config && state.config.repo) ? state.config.repo : '';
  if (!repo) return '';
  return 'https://github.com/' + repo + '/blob/main/' + ghRepoPath(path);
}
export function mkMetaRow(label, value) { const row = mk('div', 'meta-row'); row.appendChild(mk('span', 'meta-key', label)); row.appendChild(mk('span', 'meta-val', value)); return row; }
export function mkSourcePanel(container, filePath) {
  container.appendChild(mk('h3', '', 'Source'));
  const pathRow = mk('div', 'meta-row');
  pathRow.appendChild(mk('span', 'meta-key', 'File'));
  const pathVal = mk('span', 'meta-val', filePath);
  pathVal.style.fontFamily = "'SF Mono',SFMono-Regular,Consolas,monospace";
  pathVal.style.fontSize = '11px';
  pathRow.appendChild(pathVal);
  container.appendChild(pathRow);
  const href = ghUrl(filePath);
  if (href) { const link = mk('a', 'source-link', 'View in GitHub'); link.href = href; link.target = '_blank'; link.rel = 'noopener noreferrer'; container.appendChild(link); }
}

/* Upstream attribution, required by Apache-2.0 section 4(d): this site is a
   redistribution of the framework's schemas and reference documents. Drawn by
   both the landing page and Reference, so the licence notice cannot come to
   read two different ways on two pages. */
export function appendAttribution(container) {
  container.appendChild(mk('h3', '', 'Framework'));
  const link = mk('a', 'about-fw-link', 'Kilagen');
  link.href = 'https://github.com/kilagenhq/kilagen';
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  const row = mk('div', 'meta-row');
  row.appendChild(link);
  row.appendChild(document.createTextNode(' · Apache-2.0'));
  container.appendChild(row);
}
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

/* A strip of figures: one headline ratio with its bar, then the counters that
 * break it down. Compliance's Evidence page and the Domains lens both open
 * with one, and a console where two pages state their numbers in two different
 * shapes reads as two products.
 *
 * A counter is a button when it is also the filter it describes, and a plain
 * figure when there is nothing to filter — a number you can click and a number
 * you cannot must not look the same.
 *
 * @param {object} spec
 *   - value: the headline, e.g. "19 / 49"
 *   - label: what it counts
 *   - fill: 0..1, the proportion the bar shows. Omit for no bar.
 *   - counters: [{ value, label, color, onClick }]
 */
export function mkStatStrip(spec) {
  const strip = mk('div', 'stat-strip');

  const headline = mk('div', 'stat-headline');
  const ratio = mk('div', 'stat-headline-ratio');
  ratio.appendChild(mk('span', 'stat-value', String(spec.value)));
  ratio.appendChild(mk('span', 'stat-label', spec.label));
  headline.appendChild(ratio);
  if (typeof spec.fill === 'number') {
    const bar = mk('div', 'fw-bar');
    const fill = mk('div', 'fw-bar-fill');
    fill.style.width = Math.round(Math.max(0, Math.min(1, spec.fill)) * 100) + '%';
    bar.appendChild(fill);
    headline.appendChild(bar);
  }
  strip.appendChild(headline);

  const counters = mk('div', 'stat-counters');
  (spec.counters || []).forEach(function(entry) {
    const cell = mk(entry.onClick ? 'button' : 'div', 'stat-counter');
    if (entry.onClick) {
      cell.type = 'button';
      cell.addEventListener('click', entry.onClick);
    }
    const value = mk('span', 'stat-counter-value', String(entry.value));
    if (entry.color && entry.value) value.style.color = entry.color;
    cell.appendChild(value);
    cell.appendChild(mk('span', 'stat-counter-label', entry.label));
    counters.appendChild(cell);
  });
  strip.appendChild(counters);
  return strip;
}

/* One mark per capability, filled when something is written about it.
 *
 * Not a percentage bar. What is being counted is a small set of discrete
 * things — three to ten — and each one is written about or it is not, so a
 * continuous fill implies a precision the data does not have. It also fixes
 * the row nobody had written anything in: `0 / 3` as an empty track read as a
 * broken page, while three empty marks read as a fact.
 */
export function mkSegmentMeter(filled, total, color, label) {
  const meter = mk('span', 'seg-meter');
  meter.setAttribute('role', 'img');
  meter.setAttribute('aria-label', label || (filled + ' of ' + total));
  if (!total) {
    meter.appendChild(mk('span', 'seg-meter-none', '\u2014'));
    return meter;
  }
  for (let i = 0; i < total; i++) {
    const seg = mk('span', 'seg' + (i < filled ? ' seg-on' : ''));
    if (i < filled && color) seg.style.background = color;
    meter.appendChild(seg);
  }
  return meter;
}

/* Fold a rendered markdown body into collapsible sections.
 *
 * A policy is not read top to bottom: somebody arrives looking for one clause
 * and scrolls past four screens of preamble to find it. Folding every heading
 * but the first turns the body into its own table of contents, and the first
 * section stays open because in this model it is almost always the description
 * of what the document is for.
 *
 * Only h2 and h3 fold. An h1 is the document, and folding it would hide
 * everything; anything deeper is inside a section that already folds.
 */
export function makeCollapsible(body, container) {
  const headings = Array.from(body.querySelectorAll('h2, h3'));
  if (headings.length < 2) return null;

  const sections = [];
  headings.forEach(function(heading, index) {
    const section = document.createElement('div');
    section.className = 'doc-section-body';
    let node = heading.nextSibling;
    while (node && !(node.nodeType === 1 && /^H[123]$/.test(node.tagName))) {
      const next = node.nextSibling;
      section.appendChild(node);
      node = next;
    }
    heading.after(section);
    heading.classList.add('doc-section-head');
    heading.setAttribute('role', 'button');
    heading.setAttribute('tabindex', '0');

    const open = index === 0;
    heading.setAttribute('aria-expanded', open ? 'true' : 'false');
    section.hidden = !open;

    function toggle() {
      const expanded = heading.getAttribute('aria-expanded') === 'true';
      heading.setAttribute('aria-expanded', expanded ? 'false' : 'true');
      section.hidden = expanded;
    }
    heading.addEventListener('click', toggle);
    onActivate(heading, toggle);
    sections.push({ heading: heading, section: section });
  });

  function setAll(open) {
    sections.forEach(function(pair) {
      pair.heading.setAttribute('aria-expanded', open ? 'true' : 'false');
      pair.section.hidden = !open;
    });
  }

  /* Two icons beside the copy-link button, not two words above the text: the
     controls are chrome and the document is the page. */
  const controls = mk('div', 'doc-section-controls');
  [['expand', 'Expand all', true], ['collapse', 'Collapse all', false]].forEach(function(spec) {
    const btn = mk('button', 'icon-btn');
    btn.type = 'button';
    btn.title = spec[1];
    btn.setAttribute('aria-label', spec[1]);
    btn.appendChild(mkIcon(spec[0], 'icon-btn-glyph'));
    btn.addEventListener('click', function() { setAll(spec[2]); });
    controls.appendChild(btn);
  });
  const home = document.querySelector('.doc-header-actions');
  if (home) home.insertBefore(controls, home.firstChild);
  else if (container) container.insertBefore(controls, body);
  return { setAll: setAll, count: sections.length };
}

/* The body repeats the title as its own h1 more often than not, because the
   file is readable on its own in a Git forge. On the page the title is already
   above it, so the same sentence twice is the document introducing itself
   twice. */
export function dropRepeatedTitle(body, title) {
  const first = body.querySelector('h1');
  if (!first || !title) return;
  const a = first.textContent.trim().toLowerCase();
  if (a === String(title).trim().toLowerCase()) first.remove();
}

/* Make an already-built table sortable by clicking its headers.
 *
 * It sorts on what the cell *says*, not on a parallel copy of the data, which
 * is the only way one helper can serve every table in the program without each
 * of them declaring its columns twice. Dates are ISO, so lexical order is
 * chronological; numbers are detected and compared as numbers; everything else
 * is compared with the locale collator.
 *
 * Sorting is a view of the same rows, so it deliberately does not go in the
 * URL: the filters are the thing worth linking to, and a link that also pinned
 * a sort order would be a link about how somebody was reading rather than
 * about what they were reading.
 */
const NUMERIC = /^-?\d+(\.\d+)?$/;

function sortKey(row, index) {
  const cell = row.children[index];
  return cell ? cell.textContent.trim() : '';
}

export function makeSortable(table) {
  if (!table) return;
  const header = table.querySelector('tr');
  if (!header) return;
  const headers = Array.from(header.children);
  if (headers.length < 2) return;

  let sortedBy = -1;
  let ascending = true;

  headers.forEach(function(cell, index) {
    if (cell.tagName !== 'TH') return;
    /* The control goes *inside* the header, not on it. A `th` is already a
       columnheader, which is the only role `aria-sort` is allowed on; giving
       it role="button" would take that away and make the attribute invalid. */
    cell.classList.add('sortable');
    cell.setAttribute('aria-sort', 'none');
    const label = cell.textContent;
    cell.textContent = '';
    const button = mk('button', 'sort-btn', label);
    button.type = 'button';
    cell.appendChild(button);

    function sort() {
      ascending = sortedBy === index ? !ascending : true;
      sortedBy = index;
      const rows = Array.from(table.querySelectorAll('tr')).slice(1);
      rows.sort(function(a, b) {
        const x = sortKey(a, index);
        const y = sortKey(b, index);
        /* An empty cell is not a small value, it is an absent one, so it sorts
           to the bottom whichever way the column is pointing. */
        if (x === '' && y !== '') return 1;
        if (y === '' && x !== '') return -1;
        let result;
        if (NUMERIC.test(x) && NUMERIC.test(y)) result = Number(x) - Number(y);
        else result = x.localeCompare(y, undefined, { numeric: true });
        return ascending ? result : -result;
      });
      rows.forEach(function(row) { table.appendChild(row); });
      headers.forEach(function(other, i) {
        if (i !== index) { other.setAttribute('aria-sort', 'none'); return; }
        other.setAttribute('aria-sort', ascending ? 'ascending' : 'descending');
      });
    }

    button.addEventListener('click', sort);
  });
}
