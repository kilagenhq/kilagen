import { svgEl, mk, onActivate } from './dom.js';

/* How a framework's published structure is drawn.
 *
 * Two shapes, and which one is used is the framework's decision, not ours: a
 * wheel only where the framework publishes a radial figure — a group marked
 * `center: true`, which today means NIST CSF and its GOVERN hub — and grouped
 * bars everywhere else. Drawing a wheel for a framework that publishes a list
 * invents a shape for it, and eleven slices read worse than eleven rows.
 *
 * What it is: navigation and identity. A slice is a group the framework
 * itself publishes — a CSF function, a PCI goal, an Annex A theme — carrying
 * that framework's own colour and the count of clauses with a requirement
 * mapped to them.
 *
 * What it is emphatically NOT: a maturity picture. The wheel this replaces
 * coloured each cell by a computed "coverage" that blended capability
 * maturity with document status, which is the assessment the framework
 * refuses to make. Here colour carries identity and nothing else, and the
 * real state — contested clauses, open gaps, live exceptions — is written in
 * words in the cards below, where there is room to be precise.
 */

/* Used only when a framework publishes no colours of its own. Deliberately
   desaturated and non-sequential: no reading of "green good, red bad". */
const FALLBACK = ['#5b7fa6', '#7a6a9c', '#4f8f84', '#9c7b4f', '#8c6076', '#5f8a5c',
                  '#6f7f93', '#93707f', '#4f7f9c', '#8a8250', '#6a8f9c'];

function polar(cx, cy, r, angle) {
  const a = (angle - 90) * Math.PI / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

function arcPath(cx, cy, rInner, rOuter, from, to) {
  const [x1, y1] = polar(cx, cy, rOuter, from);
  const [x2, y2] = polar(cx, cy, rOuter, to);
  const [x3, y3] = polar(cx, cy, rInner, to);
  const [x4, y4] = polar(cx, cy, rInner, from);
  const large = to - from > 180 ? 1 : 0;
  return 'M' + x1 + ' ' + y1
    + 'A' + rOuter + ' ' + rOuter + ' 0 ' + large + ' 1 ' + x2 + ' ' + y2
    + 'L' + x3 + ' ' + y3
    + 'A' + rInner + ' ' + rInner + ' 0 ' + large + ' 0 ' + x4 + ' ' + y4
    + 'Z';
}

/**
 * Draw the wheel.
 *
 * @param {Array} groups Group metadata, each with id, name, color, center and clauses.
 * @param {function} statsOf (group) => {mapped, total}
 * @param {function} onSelect (groupId) => void, called when a slice is clicked.
 * @returns {SVGElement}
 */
export function frameworkWheel(groups, statsOf, onSelect) {
  /* A group none of whose clauses are in scope gets no slice. It would take
     wheel area and read as "0/0 mapped", which says nothing and is exactly
     the kind of empty denominator this lens exists to avoid. */
  const present = groups.filter(function(g) { return statsOf(g).total > 0; });
  if (!present.length) return null;
  const centre = present.filter(function(g) { return g.center; });
  const rim = present.filter(function(g) { return !g.center; });
  // A framework that marks every group as central has no rim to draw; treat
  // them all as rim rather than rendering an empty circle.
  const ring = rim.length ? rim : present;
  const hub = rim.length ? centre[0] : null;

  const size = 320, cx = size / 2, cy = size / 2;
  const rOuter = 150, rInner = 92;

  const svg = svgEl('svg', {
    viewBox: '0 0 ' + size + ' ' + size,
    'class': 'fw-wheel',
    role: 'img',
    'aria-label': 'Clauses mapped, by ' + (hub ? 'function' : 'group'),
  });

  const totalClauses = ring.reduce(function(sum, g) { return sum + g.clauses.length; }, 0) || 1;
  let angle = 0;

  ring.forEach(function(group, i) {
    const span = (group.clauses.length / totalClauses) * 360;
    const stats = statsOf(group);
    const color = group.color || FALLBACK[i % FALLBACK.length];

    const slice = svgEl('path', {
      d: arcPath(cx, cy, rInner, rOuter, angle + 0.6, angle + span - 0.6),
      fill: color,
      'class': 'fw-wheel-slice',
      tabindex: '0',
      role: 'button',
    });
    const title = svgEl('title');
    title.textContent = group.name + ' — ' + stats.mapped + ' of ' + stats.total + ' clauses mapped';
    slice.appendChild(title);
    slice.addEventListener('click', function() { onSelect(group.id); });
    onActivate(slice, function() { onSelect(group.id); });
    svg.appendChild(slice);

    /* The label sits on the band. Only the short id and the ratio fit at this
       size; the full name is in the tooltip and in the card below. */
    const mid = angle + span / 2;
    const [lx, ly] = polar(cx, cy, (rInner + rOuter) / 2, mid);
    if (span >= 22) {
      const label = svgEl('text', { x: lx, y: ly - 3, 'class': 'fw-wheel-label', 'text-anchor': 'middle' });
      label.textContent = group.id;
      svg.appendChild(label);
      const ratio = svgEl('text', { x: lx, y: ly + 11, 'class': 'fw-wheel-ratio', 'text-anchor': 'middle' });
      ratio.textContent = stats.mapped + '/' + stats.total;
      svg.appendChild(ratio);
    }
    angle += span;
  });

  if (hub) {
    const stats = statsOf(hub);
    const disc = svgEl('circle', {
      cx: cx, cy: cy, r: rInner - 8,
      fill: hub.color || FALLBACK[FALLBACK.length - 1],
      'class': 'fw-wheel-slice fw-wheel-hub',
      tabindex: '0',
      role: 'button',
    });
    const title = svgEl('title');
    title.textContent = hub.name + ' — ' + stats.mapped + ' of ' + stats.total + ' clauses mapped';
    disc.appendChild(title);
    disc.addEventListener('click', function() { onSelect(hub.id); });
    onActivate(disc, function() { onSelect(hub.id); });
    svg.appendChild(disc);

    const label = svgEl('text', { x: cx, y: cy - 4, 'class': 'fw-wheel-hub-label', 'text-anchor': 'middle' });
    label.textContent = hub.name;
    svg.appendChild(label);
    const ratio = svgEl('text', { x: cx, y: cy + 16, 'class': 'fw-wheel-hub-ratio', 'text-anchor': 'middle' });
    ratio.textContent = stats.mapped + '/' + stats.total;
    svg.appendChild(ratio);
  }

  return svg;
}

/**
 * The same data as a row per group: the name, a bar, and the ratio.
 *
 * @param {Array} groups Group metadata, each with id, name, color and clauses.
 * @param {function} statsOf (group) => {mapped, total}
 * @param {function} onSelect (groupId) => void
 * @returns {HTMLElement|null}
 */
export function frameworkBars(groups, statsOf, onSelect) {
  const present = groups.filter(function(g) { return statsOf(g).total > 0; });
  if (!present.length) return null;

  const list = mk('div', 'fw-bars');
  present.forEach(function(group, i) {
    const stats = statsOf(group);
    const row = mk('div', 'fw-bar-row');
    row.setAttribute('tabindex', '0');
    row.setAttribute('role', 'button');
    row.title = group.name + ' — ' + stats.mapped + ' of ' + stats.total + ' clauses mapped';

    row.appendChild(mk('span', 'fw-bar-name', group.name));
    const track = mk('span', 'fw-bar-track');
    const fill = mk('span', 'fw-bar-fill');
    fill.style.width = (stats.total ? Math.round(stats.mapped / stats.total * 100) : 0) + '%';
    fill.style.background = group.color || FALLBACK[i % FALLBACK.length];
    track.appendChild(fill);
    row.appendChild(track);
    row.appendChild(mk('span', 'fw-bar-ratio', stats.mapped + ' / ' + stats.total));

    row.addEventListener('click', function() { onSelect(group.id); });
    onActivate(row, function() { onSelect(group.id); });
    list.appendChild(row);
  });
  return list;
}

/* What the picture is, said next to the picture. A wheel invites being read
   as a score; this is the sentence that says what it actually encodes. */
export function wheelCaption() {
  const note = mk('p', 'fw-wheel-caption');
  note.textContent = 'Each slice is a group the framework publishes, in its own colour, '
    + 'sized by how many clauses it holds and labelled with how many of them have a '
    + 'requirement mapped. Colour is identity, not score.';
  return note;
}

export function barsCaption() {
  const note = mk('p', 'fw-wheel-caption');
  note.textContent = 'One row per group the framework publishes, showing how many of its '
    + 'clauses have a requirement mapped. Colour is identity, not score.';
  return note;
}
