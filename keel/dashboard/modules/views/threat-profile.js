import { mk, mkEmpty, mkMetaRow, svgEl } from '../dom.js';
import { state } from '../state.js';
import { go, setActiveView, setBread, mainEl, rightEl } from '../nav.js';
import { CRIT_COLORS } from '../constants.js';

var SEV_ORDER = { critical: 0, high: 1, medium: 2, low: 3, negligible: 4 };
var SEV_RAMP = ['critical', 'high', 'medium', 'low', 'negligible'];

function sevColor(sev) {
  return CRIT_COLORS[String(sev || '').toLowerCase()] || 'var(--fg3)';
}

function shortId(id) {
  return String(id || '').replace(/^THR-/, '');
}

function pad2(n) {
  return n < 10 ? '0' + n : String(n);
}

// Current ranking from the live frontmatter cache (the working-tree state).
function currentThreats() {
  var out = [];
  Object.keys(state.fmCache).forEach(function(p) {
    var fm = state.fmCache[p];
    if (!fm || fm.type !== 'threat') return;
    out.push({
      id: fm.id,
      path: p,
      title: fm.title || fm.id,
      priority: (fm.priority === undefined || fm.priority === null) ? null : Number(fm.priority),
      severity: fm.severity,
      rationale: fm.priority_rationale ? String(fm.priority_rationale).trim() : null,
      risks: (fm.related && Array.isArray(fm.related.risks)) ? fm.related.risks : []
    });
  });
  // Ranked by priority asc (1 = top); unprioritised threats sink to the bottom.
  out.sort(function(a, b) {
    if (a.priority === null && b.priority === null) return a.id.localeCompare(b.id);
    if (a.priority === null) return 1;
    if (b.priority === null) return -1;
    return a.priority - b.priority;
  });
  return out;
}

// A ranking "key" used to tell whether two snapshots differ.
function rankKey(threatsById) {
  return Object.keys(threatsById).sort().map(function(id) {
    return id + ':' + threatsById[id].priority;
  }).join('|');
}

export function renderThreatProfile() {
  setActiveView('threat-profile');
  mainEl.textContent = ''; rightEl.textContent = '';
  setBread([{ label: 'Governance', action: function() { go('standards'); } }, { label: 'Threats' }]);

  var current = currentThreats();
  if (!current.length) {
    mainEl.appendChild(mkEmpty('threat', 'No threats found', 'Create THR-*.md files in 01-grc/threats/ to populate this view.'));
    return;
  }

  var history = Array.isArray(state.threatHistory) ? state.threatHistory : [];
  var curMap = {};
  current.forEach(function(t) { if (t.priority !== null) curMap[t.id] = { priority: t.priority, severity: t.severity, title: t.title }; });
  var curKey = rankKey(curMap);

  // Previous ranking = the most recent historical snapshot that differs from now.
  var prev = null;
  for (var i = history.length - 1; i >= 0; i--) {
    if (rankKey(history[i].threats) !== curKey) { prev = history[i]; break; }
  }

  // ── Masthead ──
  var head = mk('div', 'tp-masthead');
  head.appendChild(mk('div', 'tp-eyebrow', 'Governance'));
  head.appendChild(mk('h1', 'tp-title', 'Threat Profile'));
  head.appendChild(mk('p', 'tp-intro', 'The active threat catalog ranked by priority, with each position’s board-level justification and how the ranking has shifted across quarterly reviews.'));
  head.appendChild(buildPostureBar(current));
  mainEl.appendChild(head);

  // ── Ranking stack ──
  var rankCard = mk('div', 'tp-card');
  var rankHead = mk('div', 'tp-card-head');
  rankHead.appendChild(mk('h2', '', 'Current ranking'));
  rankHead.appendChild(mk('span', 'tp-card-meta', prev ? ('Δ vs ' + prev.date) : 'baseline cycle'));
  rankCard.appendChild(rankHead);
  rankCard.appendChild(buildRanking(current, prev));

  // Retired threats (present in previous cycle, gone now)
  var retired = [];
  if (prev) Object.keys(prev.threats).forEach(function(id) { if (!curMap[id]) retired.push(id); });
  if (retired.length) {
    var ret = mk('div', 'tp-retired');
    ret.appendChild(mk('span', 'tp-retired-label', 'Retired since ' + prev.date + ' · '));
    ret.appendChild(document.createTextNode(retired.map(shortId).join(', ')));
    rankCard.appendChild(ret);
  }
  mainEl.appendChild(rankCard);

  // ── Priority trend ──
  // Chart points = historical snapshots, plus a "now" point when it differs
  // from the latest snapshot. Need >= 2 distinct points to draw a trend.
  var points = history.slice();
  var lastHist = points.length ? points[points.length - 1] : null;
  if (!lastHist || rankKey(lastHist.threats) !== curKey) {
    points.push({ date: 'now', threats: curMap });
  }

  var trendCard = mk('div', 'tp-card');
  var trendHead = mk('div', 'tp-card-head');
  trendHead.appendChild(mk('h2', '', 'Priority trend'));
  trendHead.appendChild(mk('span', 'tp-card-meta', 'rank · 1 highest → ' + Object.keys(curMap).length + ' lowest'));
  trendCard.appendChild(trendHead);
  if (points.length < 2) {
    trendCard.appendChild(mk('p', 'tp-note', 'Only a baseline ranking exists so far. The trend appears once a quarterly review changes the ranking — it then builds automatically from git history.'));
  } else {
    trendCard.appendChild(buildBumpChart(points, current));
  }
  mainEl.appendChild(trendCard);

  // ── Right rail ──
  rightEl.appendChild(mk('h3', '', 'At a glance'));
  rightEl.appendChild(mkMetaRow('Threats', String(current.length)));
  rightEl.appendChild(mkMetaRow('Cycles tracked', String(history.length)));
  if (prev) rightEl.appendChild(mkMetaRow('Compared to', prev.date));

  if (prev) {
    var movers = current.filter(function(t) { return t.priority !== null && prev.threats[t.id]; })
      .map(function(t) { return { id: t.id, title: t.title, path: t.path, sev: t.severity, d: prev.threats[t.id].priority - t.priority }; })
      .filter(function(m) { return m.d !== 0; })
      .sort(function(a, b) { return Math.abs(b.d) - Math.abs(a.d); })
      .slice(0, 3);
    if (movers.length) {
      rightEl.appendChild(mk('h3', '', 'Biggest movers'));
      movers.forEach(function(m) {
        var row = mk('div', 'tp-mover');
        var dot = mk('span', 'tp-sev-dot'); dot.style.background = sevColor(m.sev);
        row.appendChild(dot);
        var link = mk('span', 'tp-mover-name', shortId(m.id));
        if (m.path) { link.style.cursor = 'pointer'; link.addEventListener('click', function(e) { go('doc/' + m.path, e); }); }
        row.appendChild(link);
        row.appendChild(mk('span', 'tp-delta ' + (m.d > 0 ? 'tp-delta-up' : 'tp-delta-down'), (m.d > 0 ? '▲ ' : '▼ ') + Math.abs(m.d)));
        rightEl.appendChild(row);
      });
    }
  }
}

// Stacked severity posture bar across the current catalog.
function buildPostureBar(current) {
  var counts = {};
  current.forEach(function(t) { var s = String(t.severity || 'unknown').toLowerCase(); counts[s] = (counts[s] || 0) + 1; });
  var total = current.length || 1;

  var wrap = mk('div', 'tp-posture');
  var bar = mk('div', 'tp-posture-bar');
  SEV_RAMP.forEach(function(s) {
    if (!counts[s]) return;
    var seg = mk('div', 'tp-posture-seg');
    seg.style.width = (counts[s] / total * 100) + '%';
    seg.style.background = sevColor(s);
    seg.title = counts[s] + ' ' + s;
    bar.appendChild(seg);
  });
  if (counts.unknown) {
    var u = mk('div', 'tp-posture-seg'); u.style.width = (counts.unknown / total * 100) + '%'; u.style.background = 'var(--fg3)';
    bar.appendChild(u);
  }
  wrap.appendChild(bar);

  var legend = mk('div', 'tp-posture-legend');
  SEV_RAMP.forEach(function(s) {
    if (!counts[s]) return;
    var item = mk('span', 'tp-legend-item');
    var dot = mk('span', 'tp-sev-dot'); dot.style.background = sevColor(s);
    item.appendChild(dot);
    item.appendChild(mk('span', 'tp-legend-count', String(counts[s])));
    item.appendChild(mk('span', 'tp-legend-label', s));
    legend.appendChild(item);
  });
  wrap.appendChild(legend);
  return wrap;
}

// The ranking stack — a semantic table styled as a severity-spined briefing.
function buildRanking(current, prev) {
  var table = mk('table', 'tp-table');
  var thead = mk('thead'); var hr = mk('tr');
  [['tp-h-rank', '#'], ['tp-h-threat', 'Threat'], ['tp-h-delta', 'Δ'], ['tp-h-risks', 'Linked risks'], ['tp-h-just', 'Justification']]
    .forEach(function(h) { hr.appendChild(mk('th', h[0], h[1])); });
  thead.appendChild(hr); table.appendChild(thead);

  var tbody = mk('tbody');
  current.forEach(function(t, idx) {
    var tr = mk('tr', 'tp-row');
    tr.style.setProperty('--sev', sevColor(t.severity));
    tr.style.animationDelay = (idx * 45) + 'ms';
    if (t.path) {
      tr.style.cursor = 'pointer';
      tr.addEventListener('click', function(e) { go('doc/' + t.path, e); });
    }

    // Rank numeral (severity-tinted spine carried by the row's --sev)
    var rankCell = mk('td', 'tp-c-rank');
    rankCell.appendChild(mk('span', 'tp-rank-num', t.priority === null ? '—' : pad2(t.priority)));
    tr.appendChild(rankCell);

    // Threat name + severity tag
    var nameCell = mk('td', 'tp-c-threat');
    nameCell.appendChild(mk('span', 'tp-name', t.title));
    var tag = mk('span', 'tp-sev-tag', t.severity || 'n/a');
    nameCell.appendChild(tag);
    tr.appendChild(nameCell);

    // Δ chip
    var deltaCell = mk('td', 'tp-c-delta');
    deltaCell.appendChild(deltaChip(t, prev));
    tr.appendChild(deltaCell);

    // Linked risks
    var riskCell = mk('td', 'tp-c-risks');
    if (t.risks.length) {
      t.risks.forEach(function(rid) {
        var rPath = state.idToPath[rid];
        var rLink = mk('span', 'tp-risk-tag', rid.replace(/^RSK-/, ''));
        rLink.title = rid;
        if (rPath) {
          rLink.classList.add('is-link');
          rLink.addEventListener('click', function(e) { e.stopPropagation(); go('doc/' + rPath, e); });
        }
        riskCell.appendChild(rLink);
      });
    } else {
      riskCell.appendChild(mk('span', 'tp-empty', '—'));
    }
    tr.appendChild(riskCell);

    // Justification (board-level sentence)
    var justCell = mk('td', 'tp-c-just');
    if (t.rationale) { justCell.textContent = t.rationale; justCell.title = t.rationale; }
    else justCell.appendChild(mk('span', 'tp-empty', '—'));
    tr.appendChild(justCell);

    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  return table;
}

function deltaChip(t, prev) {
  if (!prev || t.priority === null) return mk('span', 'tp-delta tp-delta-flat', '—');
  var before = prev.threats[t.id];
  if (!before) return mk('span', 'tp-delta tp-delta-new', 'NEW');
  var d = before.priority - t.priority; // +ve => moved up the ranking
  if (d > 0) return mk('span', 'tp-delta tp-delta-up', '▲ ' + d);
  if (d < 0) return mk('span', 'tp-delta tp-delta-down', '▼ ' + Math.abs(d));
  return mk('span', 'tp-delta tp-delta-flat', '—');
}

// Smooth (Catmull-Rom -> cubic bezier) path through ranked points.
function smoothPath(coords) {
  if (coords.length < 2) return '';
  if (coords.length === 2) return 'M' + coords[0].x + ',' + coords[0].y + 'L' + coords[1].x + ',' + coords[1].y;
  var t = 0.16;
  var d = 'M' + coords[0].x + ',' + coords[0].y;
  for (var i = 0; i < coords.length - 1; i++) {
    var p0 = coords[i - 1] || coords[i];
    var p1 = coords[i];
    var p2 = coords[i + 1];
    var p3 = coords[i + 2] || p2;
    var c1x = p1.x + (p2.x - p0.x) * t, c1y = p1.y + (p2.y - p0.y) * t;
    var c2x = p2.x - (p3.x - p1.x) * t, c2y = p2.y - (p3.y - p1.y) * t;
    d += 'C' + c1x + ',' + c1y + ' ' + c2x + ',' + c2y + ' ' + p2.x + ',' + p2.y;
  }
  return d;
}

// Bump chart: one smooth curve per threat, y = priority rank (1 at top).
function buildBumpChart(points, current) {
  var titleById = {};
  current.forEach(function(t) { titleById[t.id] = { title: t.title, severity: t.severity, path: t.path }; });

  var maxRank = 1;
  points.forEach(function(pt) { Object.keys(pt.threats).forEach(function(id) { maxRank = Math.max(maxRank, Number(pt.threats[id].priority) || 1); }); });

  var padL = 46, padR = 240, padT = 30, padB = 38;
  var rowH = 30;
  var plotW = Math.max(260, (points.length - 1) * 190);
  var W = padL + plotW + padR;
  var H = padT + (maxRank - 1) * rowH + padB;

  var svg = svgEl('svg', { class: 'tp-bump', viewBox: '0 0 ' + W + ' ' + H, width: '100%', preserveAspectRatio: 'xMinYMin meet' });

  function xAt(i) { return padL + (points.length === 1 ? 0 : (plotW * i / (points.length - 1))); }
  function yAt(rank) { return padT + (rank - 1) * rowH; }

  // Emphasis band behind the current (last) column
  var lastX = xAt(points.length - 1);
  svg.appendChild(svgEl('rect', { x: lastX - 13, y: padT - 16, width: 26, height: (maxRank - 1) * rowH + 32, rx: 6, class: 'tp-col-now' }));

  // Rank rails + #NN labels
  for (var r = 1; r <= maxRank; r++) {
    svg.appendChild(svgEl('line', { x1: padL, y1: yAt(r), x2: padL + plotW, y2: yAt(r), class: 'tp-rail' }));
    var yl = svgEl('text', { x: padL - 12, y: yAt(r) + 3.5, class: 'tp-rail-label', 'text-anchor': 'end' });
    yl.textContent = pad2(r);
    svg.appendChild(yl);
  }

  // Date axis: an uppercase caption (PREVIOUS / CURRENT) above each column's date.
  points.forEach(function(pt, i) {
    var anchor = i === 0 ? 'start' : (i === points.length - 1 ? 'end' : 'middle');
    var isNow = i === points.length - 1;
    var cap = isNow ? 'CURRENT' : (i === 0 ? 'PREVIOUS' : '');
    if (cap) {
      var ct = svgEl('text', { x: xAt(i), y: H - 22, class: 'tp-axis-cap' + (isNow ? ' tp-axis-now' : ''), 'text-anchor': anchor });
      ct.textContent = cap;
      svg.appendChild(ct);
    }
    var xl = svgEl('text', { x: xAt(i), y: H - 9, class: 'tp-axis' + (isNow ? ' tp-axis-now' : ''), 'text-anchor': anchor });
    xl.textContent = pt.date;
    svg.appendChild(xl);
  });

  var latest = points[points.length - 1];
  var order = Object.keys(latest.threats).sort(function(a, b) { return latest.threats[a].priority - latest.threats[b].priority; });

  order.forEach(function(id, gi) {
    var meta = titleById[id] || { title: shortId(id), severity: latest.threats[id].severity, path: null };
    var color = sevColor(meta.severity);
    var coords = [];
    points.forEach(function(pt, i) {
      var entry = pt.threats[id];
      if (entry && entry.priority != null) coords.push({ x: xAt(i), y: yAt(Number(entry.priority)) });
    });
    if (coords.length < 1) return;

    var g = svgEl('g', { class: 'tp-line-group' });

    if (coords.length >= 2) {
      var path = svgEl('path', { d: smoothPath(coords), fill: 'none', class: 'tp-line' });
      path.style.stroke = color;
      path.style.animationDelay = (gi * 55) + 'ms';
      g.appendChild(path);
    }
    coords.forEach(function(c, ci) {
      var node = svgEl('circle', { cx: c.x, cy: c.y, r: ci === coords.length - 1 ? 4.5 : 3.5, class: 'tp-node' });
      node.style.fill = color;
      node.style.animationDelay = (gi * 55 + ci * 90 + 250) + 'ms';
      g.appendChild(node);
    });

    // Leading dot + end label
    var end = coords[coords.length - 1];
    var dot = svgEl('circle', { cx: end.x + 12, cy: end.y, r: 3, class: 'tp-label-dot' });
    dot.style.fill = color;
    g.appendChild(dot);
    var lbl = svgEl('text', { x: end.x + 20, y: end.y + 3.5, class: 'tp-line-label' });
    var labelText = shortId(id);
    lbl.textContent = labelText.length > 26 ? labelText.slice(0, 25) + '…' : labelText;
    g.appendChild(lbl);

    g.style.cursor = meta.path ? 'pointer' : 'default';
    g.addEventListener('mouseenter', function() { svg.classList.add('tp-dim'); g.classList.add('tp-active'); });
    g.addEventListener('mouseleave', function() { svg.classList.remove('tp-dim'); g.classList.remove('tp-active'); });
    if (meta.path) g.addEventListener('click', function(e) { go('doc/' + meta.path, e); });

    svg.appendChild(g);
  });

  var wrap = mk('div', 'tp-bump-wrap');
  wrap.appendChild(svg);
  return wrap;
}
