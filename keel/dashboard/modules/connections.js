import { mk, svgEl, mkIcon } from './dom.js';
import { state, docById } from './state.js';
import { go } from './nav.js';
import { typeColor } from './constants.js';

/* A document and what it links to directly — with the verb written on the edge.
 *
 * This replaces the whole-program graph, which drew every node and could not
 * say what any line meant. The verbs are not invented here: each one comes
 * from a type or a field that already carries it, and an edge with no verb
 * behind it stays labelled `related`, which is what it honestly is.
 *
 * The layout is deterministic — one ring per verb, neighbours spread evenly
 * around it. With five to ten nodes a force simulation buys nothing and costs
 * a frozen tab, which is what killed the old view.
 */

/* Phrased from the centre's point of view, so the label reads as a sentence
   about the document you are looking at. Order is the ring order. */
const VERBS = [
  'authorises', 'authorised by',
  'supersedes', 'superseded by',
  'contested by', 'falls short of',
  'excepted by', 'deviates from',
  'related',
];

function typeOf(id) {
  const fm = docById(id);
  return fm ? fm.type : null;
}

/* A policy sitting in a standard's `related` (or the other way round — the
   list is flat and either side may declare it) is the policy authorising the
   standard. The verb comes from the pair of types, never from which side
   happened to write the id down. */
function relatedVerb(centre, otherId) {
  const otherType = typeOf(otherId);
  if (centre.type === 'standard' && otherType === 'policy') return 'authorised by';
  if (centre.type === 'policy' && otherType === 'standard') return 'authorises';
  return 'related';
}

/**
 * What one document is directly connected to: `[{ id, verb, type, path }]`,
 * deduplicated, in a stable order. Ids that resolve to nothing are dropped —
 * a dangling reference is the validator's business, not a node.
 */
export function connectionsOf(fm) {
  if (!fm || !fm.id) return [];
  const found = {};

  function add(id, verb) {
    if (!id || id === fm.id || found[id]) return;
    const target = docById(id);
    if (!target) return;
    found[id] = { id: id, verb: verb, type: target.type || 'unknown', path: target.path };
  }

  (fm.supersedes || []).forEach(function(id) { add(id, 'supersedes'); });
  if (fm.excepted_by) add(fm.excepted_by, 'excepted by');

  /* The requirement this document contests, when it is a gap or an exception. */
  if (fm.requirement) {
    add(String(fm.requirement).split('#')[0],
      fm.type === 'exception' ? 'deviates from' : 'falls short of');
  }

  (fm.related || []).forEach(function(id) { add(id, relatedVerb(fm, id)); });

  /* The other half of every edge: whoever points at this document. */
  Object.keys(state.fmCache).forEach(function(path) {
    const other = state.fmCache[path];
    if (!other || !other.id || other.id === fm.id) return;
    if (other.requirement && String(other.requirement).split('#')[0] === fm.id) {
      add(other.id, other.type === 'exception' ? 'excepted by' : 'contested by');
    }
    if ((other.supersedes || []).indexOf(fm.id) !== -1) add(other.id, 'superseded by');
    if (other.excepted_by === fm.id) add(other.id, 'excepts');
    if ((other.related || []).indexOf(fm.id) !== -1) add(other.id, relatedVerb(fm, other.id));
  });

  return Object.keys(found).map(function(id) { return found[id]; }).sort(function(a, b) {
    const rank = VERBS.indexOf(a.verb) - VERBS.indexOf(b.verb);
    return rank !== 0 ? rank : a.id.localeCompare(b.id);
  });
}

const RING_0 = 78;
const RING_STEP = 54;
const LABEL_ROOM = 118;
const NODE_R = 11;
const GLYPH = 13;

function ringsOf(neighbours) {
  const rings = [];
  neighbours.forEach(function(n) {
    const last = rings[rings.length - 1];
    if (last && last.verb === n.verb) last.nodes.push(n);
    else rings.push({ verb: n.verb, nodes: [n] });
  });
  return rings;
}

/**
 * Draw the connections into `container`. Returns the section element, or
 * null when the document links to nothing — an empty diagram says less than
 * no diagram.
 */
export function renderConnections(container, fm) {
  const neighbours = connectionsOf(fm);
  if (!neighbours.length) return null;

  const rings = ringsOf(neighbours);
  const maxR = RING_0 + (rings.length - 1) * RING_STEP;
  /* Ids are monospaced, so the widest label is a character count. A fixed
     margin clipped the long ones against the frame. */
  const longest = neighbours.reduce(function(n, x) { return Math.max(n, String(x.id).length); }, 0);
  const room = Math.max(LABEL_ROOM, longest * 6.2 + NODE_R + 14);
  const w = 2 * (maxR + room);
  const h = 2 * (maxR + 34);
  const cx = w / 2;
  const cy = h / 2;

  const section = mk('section', 'conn');
  section.appendChild(mk('h2', '', 'Connections'));

  const frame = mk('div', 'conn-frame');
  const svg = svgEl('svg', {
    viewBox: '0 0 ' + w + ' ' + h,
    'class': 'conn-svg',
    /* A group, not an image: its nodes are links, and an img may not hold
       interactive children. */
    role: 'group',
    'aria-label': 'Direct links from ' + (fm.title || fm.id),
  });

  /* Every node keeps its slot on a ring — that is what makes the diagram
     readable and what the deterministic layout bought. The simulation only
     lets it breathe around that slot and follow your pointer; it never decides
     where things go. */
  const nodes = [];
  rings.forEach(function(ring, g) {
    const r = RING_0 + g * RING_STEP;
    /* Odd rings start half a step round, so two nodes never sit on the same
       spoke and hide each other's label. */
    const offset = (g % 2) ? Math.PI / ring.nodes.length : 0;
    ring.nodes.forEach(function(n, i) {
      const angle = -Math.PI / 2 + offset + (2 * Math.PI * i) / ring.nodes.length;
      const homeX = cx + r * Math.cos(angle);
      const homeY = cy + r * Math.sin(angle);

      const line = svgEl('line', { x1: cx, y1: cy, x2: homeX, y2: homeY, 'class': 'conn-edge' });
      svg.appendChild(line);

      /* One label for the ring, on its first spoke: every node on a ring
         shares a verb, so repeating it once per node stacked copies of the
         same word on top of each other. */
      let verb = null;
      if (i === 0) {
        verb = svgEl('text', {
          x: cx + (r * 0.55) * Math.cos(angle),
          y: cy + (r * 0.55) * Math.sin(angle),
          'class': 'conn-verb',
        });
        verb.textContent = ring.verb;
        svg.appendChild(verb);
      }

      const node = svgEl('g', { 'class': 'conn-node', tabindex: '0', role: 'link' });

      /* The node wears the icon of what it is, so the diagram says gap or
         standard or exception without anybody reading an id. The disc behind
         it is the hit area and the handle. */
      const dot = svgEl('circle', {
        cx: homeX, cy: homeY, r: NODE_R, 'class': 'conn-dot',
      });
      dot.style.stroke = typeColor(n.type);
      node.appendChild(dot);

      const glyph = mkIcon(n.type, 'conn-glyph');
      glyph.setAttribute('x', homeX - GLYPH / 2);
      glyph.setAttribute('y', homeY - GLYPH / 2);
      glyph.setAttribute('width', GLYPH);
      glyph.setAttribute('height', GLYPH);
      glyph.style.color = typeColor(n.type);
      node.appendChild(glyph);

      const right = Math.cos(angle) >= 0;
      const label = svgEl('text', {
        x: homeX + (right ? NODE_R + 6 : -(NODE_R + 6)),
        y: homeY + 4,
        'text-anchor': right ? 'start' : 'end',
        'class': 'conn-label',
      });
      label.textContent = n.id;
      node.appendChild(label);
      const title = svgEl('title');
      title.textContent = n.id + ' — ' + ring.verb;
      node.appendChild(title);

      function open(e) { go('doc/' + n.path, e); }
      node.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(e); }
      });
      svg.appendChild(node);

      nodes.push({
        id: n.id, el: node, dot: dot, glyph: glyph, label: label, line: line, verb: verb,
        homeX: homeX, homeY: homeY, x: homeX, y: homeY, vx: 0, vy: 0,
        right: right, angle: angle, radius: r, open: open, pinned: false,
      });
    });
  });

  /* The document itself, last so it sits on top of the spokes. It does not
     move: everything else is positioned relative to it, and a centre that
     drifts makes the rings mean nothing. */
  const centre = svgEl('circle', { cx: cx, cy: cy, r: NODE_R + 3, 'class': 'conn-centre' });
  centre.style.fill = typeColor(fm.type);
  svg.appendChild(centre);
  const centreGlyph = mkIcon(fm.type, 'conn-glyph conn-centre-glyph');
  centreGlyph.setAttribute('x', cx - (GLYPH + 2) / 2);
  centreGlyph.setAttribute('y', cy - (GLYPH + 2) / 2);
  centreGlyph.setAttribute('width', GLYPH + 2);
  centreGlyph.setAttribute('height', GLYPH + 2);
  svg.appendChild(centreGlyph);
  const centreTitle = svgEl('title');
  centreTitle.textContent = (fm.title || fm.id) + ' — this document';
  svg.appendChild(centreTitle);
  const centreLabel = svgEl('text', {
    x: cx, y: cy + NODE_R + 22, 'text-anchor': 'middle', 'class': 'conn-label conn-centre-label',
  });
  centreLabel.textContent = fm.id;
  svg.appendChild(centreLabel);

  frame.appendChild(svg);
  section.appendChild(frame);
  container.appendChild(section);
  animate(svg, nodes, cx, cy, w, h);
  return section;
}

/* --- The part that moves -------------------------------------------------
 *
 * This reverses a written principle on purpose. The design rule was "nothing
 * moves unless you asked it to", and the module that came before this one said
 * a force simulation "buys nothing and costs a frozen tab" — which was true of
 * the whole-program graph it replaced, because that one drew every node in the
 * repository.
 *
 * What changed is the scope, not the opinion: a document's connections are
 * bounded, rarely more than a dozen, so the loop is cheap and can be proven to
 * stop. It settles and then sleeps, and it wakes for a pointer and nothing
 * else. Under prefers-reduced-motion it never starts, and what you get is
 * exactly the static diagram that was here before.
 */

const SPRING = 0.035;      // pull back to the slot the layout chose
const DAMPING = 0.86;      // how fast the wobble dies
const REPULSION = 900;     // keeps two nodes from sitting on each other
const SLEEP_ENERGY = 0.02; // below this, stop drawing frames
const DRIFT = 0.012;       // the breath: enough to notice, not enough to read as motion

function animate(svg, nodes, cx, cy, w, h) {
  if (!nodes.length) return;
  const reduced = typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced || typeof window.requestAnimationFrame !== 'function') {
    bindOpen(nodes);
    return;
  }

  let frame = null;
  let phase = Math.random() * Math.PI * 2;
  let dragging = null;

  function place(n) {
    n.dot.setAttribute('cx', n.x);
    n.dot.setAttribute('cy', n.y);
    n.glyph.setAttribute('x', n.x - GLYPH / 2);
    n.glyph.setAttribute('y', n.y - GLYPH / 2);
    n.label.setAttribute('x', n.x + (n.right ? NODE_R + 6 : -(NODE_R + 6)));
    n.label.setAttribute('y', n.y + 4);
    n.line.setAttribute('x2', n.x);
    n.line.setAttribute('y2', n.y);
    const t = 0.55;
    if (n.verb) {
      n.verb.setAttribute('x', cx + (n.x - cx) * t);
      n.verb.setAttribute('y', cy + (n.y - cy) * t);
    }
  }

  function step() {
    phase += DRIFT;
    let energy = 0;

    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (n === dragging) { place(n); continue; }

      /* Back towards the slot, with a breath so the diagram is alive rather
         than animated: the target itself sways by a couple of pixels. */
      const sway = n.pinned ? 0 : 2.2;
      const targetX = n.homeX + Math.cos(phase + n.angle * 2) * sway;
      const targetY = n.homeY + Math.sin(phase + n.angle * 3) * sway;
      n.vx += (targetX - n.x) * SPRING;
      n.vy += (targetY - n.y) * SPRING;

      for (let j = 0; j < nodes.length; j++) {
        if (i === j) continue;
        const o = nodes[j];
        const dx = n.x - o.x;
        const dy = n.y - o.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > 6400 || d2 === 0) continue;
        const f = REPULSION / d2;
        const d = Math.sqrt(d2);
        n.vx += (dx / d) * f;
        n.vy += (dy / d) * f;
      }

      n.vx *= DAMPING;
      n.vy *= DAMPING;
      n.x += n.vx;
      n.y += n.vy;
      /* Never off the canvas, whatever a drag did to the neighbours. */
      n.x = Math.max(12, Math.min(w - 12, n.x));
      n.y = Math.max(12, Math.min(h - 12, n.y));
      energy += Math.abs(n.vx) + Math.abs(n.vy);
      place(n);
    }

    if (energy < SLEEP_ENERGY && !dragging) { frame = null; return; }
    frame = window.requestAnimationFrame(step);
  }

  function wake() {
    if (frame === null) frame = window.requestAnimationFrame(step);
  }

  /* Pointer: a press that moves is a drag, a press that does not is a click.
     Without the distinction every drag would also navigate away. */
  nodes.forEach(function(n) {
    let downAt = null;
    /* The label is the link and the disc is the handle. Both drag, because a
       drag that only works on one half of a node is a puzzle; only the label
       navigates, because clicking a thing you are about to move should not
       take you somewhere else. */
    function navigatesOnRelease(target) {
      return target === n.label;
    }
    n.el.addEventListener('pointerdown', function(e) {
      downAt = { x: e.clientX, y: e.clientY, moved: false, fromLabel: navigatesOnRelease(e.target) };
      dragging = n;
      n.pinned = true;
      if (n.el.setPointerCapture) { try { n.el.setPointerCapture(e.pointerId); } catch (err) { /* not captureable */ } }
      wake();
    });
    n.el.addEventListener('pointermove', function(e) {
      if (dragging !== n || !downAt) return;
      if (Math.abs(e.clientX - downAt.x) + Math.abs(e.clientY - downAt.y) > 4) downAt.moved = true;
      const box = svg.getBoundingClientRect();
      if (!box.width) return;
      const scale = w / box.width;
      n.x = Math.max(12, Math.min(w - 12, (e.clientX - box.left) * scale));
      n.y = Math.max(12, Math.min(h - 12, (e.clientY - box.top) * scale));
      n.vx = 0; n.vy = 0;
      wake();
    });
    function release(e) {
      if (dragging !== n) return;
      dragging = null;
      n.pinned = false;
      if (downAt && downAt.moved) {
        /* Where you put it becomes where it belongs: the spring now holds it
           here instead of pulling it back to the slot the layout chose. It
           lasts as long as this drawing does — open another document, or come
           back to this one, and the deterministic layout returns. */
        n.homeX = n.x;
        n.homeY = n.y;
        n.right = n.x >= cx;
          n.label.setAttribute('text-anchor', n.right ? 'start' : 'end');
      } else if (downAt && downAt.fromLabel) {
        /* A click on the text opens the document. A click on the disc is a
           drag that happened not to move, and opens nothing. */
        n.open(e);
      }
      downAt = null;
      wake();
    }
    n.el.addEventListener('pointerup', release);
    n.el.addEventListener('pointercancel', function() { dragging = null; n.pinned = false; downAt = null; wake(); });
    n.el.addEventListener('pointerenter', wake);
  });

  svg.addEventListener('pointerenter', wake);
  wake();
}

/* Without the simulation the nodes still have to open. */
function bindOpen(nodes) {
  nodes.forEach(function(n) {
    n.el.addEventListener('click', function(e) { n.open(e); });
  });
}
