import { mk, mkMetaRow } from '../dom.js';
import { state } from '../state.js';
import { go, setActiveView, setBread, mainEl, rightEl } from '../nav.js';
import { DOMAINS, DOC_TYPE_COLORS } from '../constants.js';
import { buildGraph } from '../data.js';
import { addZoomPan } from '../svg.js';

function typeColor(type) { return DOC_TYPE_COLORS[type] || DOC_TYPE_COLORS.default; }

function forceLayout(nodes, edges, w, h) {
  const n = nodes.length;
  if (!n) return;
  nodes.forEach(function(nd, i) {
    const angle = (2 * Math.PI * i) / n;
    nd.x = w / 2 + (w * 0.3) * Math.cos(angle);
    nd.y = h / 2 + (h * 0.3) * Math.sin(angle);
    nd.vx = 0; nd.vy = 0;
  });
  const idxMap = {};
  nodes.forEach(function(nd, i) { idxMap[nd.id] = i; });
  const iterations = 150;
  const repulsion = 4000;
  const attraction = 0.004;
  const damping = 0.85;
  const centerForce = 0.008;
  for (let iter = 0; iter < iterations; iter++) {
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = nodes[i].x - nodes[j].x;
        const dy = nodes[i].y - nodes[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = repulsion / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        nodes[i].vx += fx; nodes[i].vy += fy;
        nodes[j].vx -= fx; nodes[j].vy -= fy;
      }
    }
    edges.forEach(function(e) {
      const si = idxMap[e.source], ti = idxMap[e.target];
      if (si === undefined || ti === undefined) return;
      const dx = nodes[ti].x - nodes[si].x;
      const dy = nodes[ti].y - nodes[si].y;
      nodes[si].vx += dx * attraction; nodes[si].vy += dy * attraction;
      nodes[ti].vx -= dx * attraction; nodes[ti].vy -= dy * attraction;
    });
    nodes.forEach(function(nd) {
      nd.vx += (w / 2 - nd.x) * centerForce;
      nd.vy += (h / 2 - nd.y) * centerForce;
      nd.vx *= damping; nd.vy *= damping;
      nd.x += nd.vx; nd.y += nd.vy;
      nd.x = Math.max(50, Math.min(w - 50, nd.x));
      nd.y = Math.max(50, Math.min(h - 50, nd.y));
    });
  }
}

function renderSVG(nodes, edges, container, w, h, graphAllNodes, graphAllEdges) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
  svg.setAttribute('width', '100%'); svg.setAttribute('height', h);
  svg.style.display = 'block'; svg.style.cursor = 'default';

  const idxMap = {};
  nodes.forEach(function(nd, i) { idxMap[nd.id] = i; });

  // Create edge elements
  const edgeEls = [];
  edges.forEach(function(e) {
    const si = idxMap[e.source], ti = idxMap[e.target];
    if (si === undefined || ti === undefined) return;
    const line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', nodes[si].x); line.setAttribute('y1', nodes[si].y);
    line.setAttribute('x2', nodes[ti].x); line.setAttribute('y2', nodes[ti].y);
    line.setAttribute('class', 'graph-edge');
    svg.appendChild(line);
    edgeEls.push({ el: line, source: si, target: ti });
    if (e.label) {
      const mx = (nodes[si].x + nodes[ti].x) / 2;
      const my = (nodes[si].y + nodes[ti].y) / 2;
      const elbl = document.createElementNS(NS, 'text');
      elbl.setAttribute('x', mx); elbl.setAttribute('y', my - 4);
      elbl.setAttribute('class', 'graph-label');
      elbl.style.fontSize = '8px'; elbl.style.opacity = '0.5';
      elbl.textContent = e.label;
      svg.appendChild(elbl);
      edgeEls[edgeEls.length - 1].labelEl = elbl;
    }
  });

  // Track selected node for focus mode
  let selectedId = null;

  function applyFocus(focusId) {
    if (!focusId) {
      nodes.forEach(function(nd) { nd._g.style.opacity = '1'; });
      edgeEls.forEach(function(ee) { ee.el.style.opacity = '0.4'; if (ee.labelEl) ee.labelEl.style.opacity = '0.5'; });
      return;
    }
    const neighborIds = {};
    neighborIds[focusId] = true;
    edges.forEach(function(e) {
      if (e.source === focusId) neighborIds[e.target] = true;
      if (e.target === focusId) neighborIds[e.source] = true;
    });
    nodes.forEach(function(other) { other._g.style.opacity = neighborIds[other.id] ? '1' : '0.15'; });
    edgeEls.forEach(function(ee) {
      const s = nodes[ee.source], t = nodes[ee.target];
      const connected = (s.id === focusId || t.id === focusId);
      ee.el.style.opacity = connected ? '0.8' : '0.05';
      if (ee.labelEl) ee.labelEl.style.opacity = connected ? '0.8' : '0.05';
    });
  }

  // Create node elements with drag + click-to-select + dblclick-to-navigate
  nodes.forEach(function(nd, idx) {
    const g = document.createElementNS(NS, 'g');
    g.style.cursor = 'pointer';
    nd._g = g;

    const circle = document.createElementNS(NS, 'circle');
    circle.setAttribute('cx', nd.x); circle.setAttribute('cy', nd.y);
    circle.setAttribute('r', 14);
    circle.setAttribute('fill', nd.placeholder ? 'none' : typeColor(nd.type));
    circle.setAttribute('stroke', nd.placeholder ? typeColor(nd.type) : 'var(--bg)');
    circle.setAttribute('stroke-width', nd.placeholder ? '2' : '2');
    if (nd.placeholder) circle.setAttribute('stroke-dasharray', '4 3');
    circle.setAttribute('class', 'graph-node');
    nd._circle = circle;
    g.appendChild(circle);

    const prefix = document.createElementNS(NS, 'text');
    prefix.setAttribute('x', nd.x); prefix.setAttribute('y', nd.y + 4);
    prefix.setAttribute('text-anchor', 'middle');
    prefix.style.fontSize = '8px'; prefix.style.fontWeight = '700'; prefix.style.fill = nd.placeholder ? typeColor(nd.type) : '#fff'; prefix.style.pointerEvents = 'none';
    prefix.textContent = (nd.id.split('-')[0] || '').substring(0, 3);
    nd._prefix = prefix;
    g.appendChild(prefix);

    const text = document.createElementNS(NS, 'text');
    text.setAttribute('x', nd.x); text.setAttribute('y', nd.y + 28);
    text.setAttribute('class', 'graph-label');
    text.textContent = nd.title.length > 28 ? nd.title.substring(0, 26) + '..' : nd.title;
    nd._text = text;
    g.appendChild(text);

    // Drag support — click (no drag) selects, double-click navigates
    let dragging = false;
    let dragMoved = false;

    g.addEventListener('mousedown', function(e) {
      e.preventDefault();
      dragging = true;
      dragMoved = false;
      g.style.cursor = 'grabbing';
      const startX = e.clientX, startY = e.clientY;
      const origX = nd.x, origY = nd.y;
      const svgRect = svg.getBoundingClientRect();
      const vbParts = (svg.getAttribute('viewBox') || '0 0 ' + w + ' ' + h).split(' ').map(Number);
      const scaleX = vbParts[2] / svgRect.width;
      const scaleY = vbParts[3] / svgRect.height;

      function onMove(me) {
        if (!dragging) return;
        dragMoved = true;
        const dx = (me.clientX - startX) * scaleX;
        const dy = (me.clientY - startY) * scaleY;
        nd.x = Math.max(50, Math.min(w - 50, origX + dx));
        nd.y = Math.max(50, Math.min(h - 50, origY + dy));
        updateNodePosition(nd);
        updateEdgePositions(nodes, edgeEls, idxMap);
      }
      function onUp() {
        dragging = false;
        g.style.cursor = 'pointer';
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        if (!dragMoved) {
          // Click = select node, show focus + mini-graph
          selectedId = nd.id;
          applyFocus(nd.id);
          showNodeInfo(nd, graphAllNodes || nodes, graphAllEdges || edges);
        }
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    // Double-click = navigate to document
    g.addEventListener('dblclick', function(e) {
      e.preventDefault();
      if (nd.path) go(nd.path.startsWith('cap/') ? nd.path : 'doc/' + nd.path);
    });

    svg.appendChild(g);
  });

  // Click on background = deselect, reset focus
  svg.addEventListener('click', function(e) {
    if (e.target === svg) {
      selectedId = null;
      applyFocus(null);
    }
  });

  container.textContent = '';
  container.appendChild(svg);
  addZoomPan(svg);
}

function updateNodePosition(nd) {
  nd._circle.setAttribute('cx', nd.x); nd._circle.setAttribute('cy', nd.y);
  nd._prefix.setAttribute('x', nd.x); nd._prefix.setAttribute('y', nd.y + 4);
  nd._text.setAttribute('x', nd.x); nd._text.setAttribute('y', nd.y + 28);
}

function updateEdgePositions(nodes, edgeEls, idxMap) {
  edgeEls.forEach(function(e) {
    const s = nodes[e.source], t = nodes[e.target];
    e.el.setAttribute('x1', s.x); e.el.setAttribute('y1', s.y);
    e.el.setAttribute('x2', t.x); e.el.setAttribute('y2', t.y);
    if (e.labelEl) {
      e.labelEl.setAttribute('x', (s.x + t.x) / 2);
      e.labelEl.setAttribute('y', (s.y + t.y) / 2 - 4);
    }
  });
}

function showNodeInfo(nd, allNodes, allEdges) {
  rightEl.textContent = '';
  rightEl.appendChild(mk('h3', '', nd.type === 'capability' ? 'Selected capability' : 'Selected document'));
  [['ID', nd.id], ['Title', nd.title], ['Type', nd.type], ['Domain', nd.domain]].forEach(function(r) {
    rightEl.appendChild(mkMetaRow(r[0], r[1]));
  });
  if (nd.path) {
    const navBtn = mk('button', 'graph-nav-btn', nd.type === 'capability' ? 'Open capability \u2192' : 'Open document \u2192');
    navBtn.addEventListener('click', function(e) { go(nd.path.startsWith('cap/') ? nd.path : 'doc/' + nd.path); });
    rightEl.appendChild(navBtn);
  }
  // Mini detail graph: this node + its neighbors
  const neighborIds = {};
  neighborIds[nd.id] = true;
  allEdges.forEach(function(e) {
    if (e.source === nd.id) neighborIds[e.target] = true;
    if (e.target === nd.id) neighborIds[e.source] = true;
  });
  const neighborCount = Object.keys(neighborIds).length - 1;
  if (neighborCount > 0) {
    rightEl.appendChild(mk('h3', '', 'Neighborhood (' + neighborCount + ')'));
    const miniNodes = allNodes.filter(function(n) { return neighborIds[n.id]; });
    const miniEdges = allEdges.filter(function(e) { return neighborIds[e.source] && neighborIds[e.target]; });
    const miniContainer = mk('div', 'graph-mini');
    rightEl.appendChild(miniContainer);
    const mw = 260, mh = Math.max(180, miniNodes.length * 30);
    const layoutNodes = miniNodes.map(function(n) { return { id: n.id, title: n.title, type: n.type, domain: n.domain, path: n.path, placeholder: n.placeholder, x: 0, y: 0, vx: 0, vy: 0 }; });
    forceLayout(layoutNodes, miniEdges, mw, mh);
    renderMiniSVG(layoutNodes, miniEdges, miniContainer, mw, mh, nd.id);
    // Expand button — opens modal with larger graph
    const expandBtn = mk('button', 'graph-nav-btn', 'Expand graph');
    expandBtn.addEventListener('click', function() {
      const overlay = mk('div', 'graph-modal-overlay');
      const modal = mk('div', 'graph-modal');
      const closeBtn = mk('button', 'graph-modal-close', '\u2715');
      closeBtn.addEventListener('click', function() { overlay.remove(); });
      overlay.addEventListener('click', function(ev) { if (ev.target === overlay) overlay.remove(); });
      modal.appendChild(closeBtn);
      modal.appendChild(mk('h2', '', nd.title + ' — Neighborhood'));
      const modalContainer = mk('div', 'graph-modal-content');
      modal.appendChild(modalContainer);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);
      const modalW = Math.min(900, window.innerWidth - 80);
      const modalH = Math.max(400, Math.min(600, miniNodes.length * 50));
      const modalNodes = miniNodes.map(function(n) { return { id: n.id, title: n.title, type: n.type, domain: n.domain, path: n.path, placeholder: n.placeholder, x: 0, y: 0, vx: 0, vy: 0 }; });
      forceLayout(modalNodes, miniEdges, modalW, modalH);
      renderMiniSVG(modalNodes, miniEdges, modalContainer, modalW, modalH, nd.id);
    });
    rightEl.appendChild(expandBtn);
  }

  const fm = state.fmCache[nd.path];
  if (fm && fm.related) {
    rightEl.appendChild(mk('h3', '', 'Related'));
    Object.keys(fm.related).forEach(function(relType) {
      const targets = fm.related[relType];
      if (!Array.isArray(targets) || !targets.length) return;
      const label = mk('div', 'meta-row');
      label.appendChild(mk('span', 'meta-key', relType));
      label.appendChild(mk('span', 'meta-val', targets.join(', ')));
      rightEl.appendChild(label);
    });
  }
}

function renderMiniSVG(nodes, edges, container, w, h, centerId) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
  svg.setAttribute('width', '100%'); svg.setAttribute('height', h);
  svg.style.display = 'block'; svg.style.cursor = 'default';

  const idxMap = {};
  nodes.forEach(function(nd, i) { idxMap[nd.id] = i; });

  const edgeEls = [];
  edges.forEach(function(e) {
    const si = idxMap[e.source], ti = idxMap[e.target];
    if (si === undefined || ti === undefined) return;
    const line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', nodes[si].x); line.setAttribute('y1', nodes[si].y);
    line.setAttribute('x2', nodes[ti].x); line.setAttribute('y2', nodes[ti].y);
    line.setAttribute('stroke', 'var(--fg3)'); line.setAttribute('stroke-width', '1.5'); line.setAttribute('opacity', '0.4');
    svg.appendChild(line);
    edgeEls.push({ el: line, source: si, target: ti });
    if (e.label) {
      const mx = (nodes[si].x + nodes[ti].x) / 2;
      const my = (nodes[si].y + nodes[ti].y) / 2;
      const lbl = document.createElementNS(NS, 'text');
      lbl.setAttribute('x', mx); lbl.setAttribute('y', my - 3);
      lbl.setAttribute('text-anchor', 'middle');
      lbl.style.fontSize = '7px'; lbl.style.fill = 'var(--fg3)'; lbl.style.pointerEvents = 'none';
      lbl.textContent = e.label;
      svg.appendChild(lbl);
      edgeEls[edgeEls.length - 1].labelEl = lbl;
    }
  });

  nodes.forEach(function(nd) {
    const g = document.createElementNS(NS, 'g');
    g.style.cursor = 'pointer';
    nd._g = g;
    const r = nd.id === centerId ? 16 : 10;
    const circle = document.createElementNS(NS, 'circle');
    circle.setAttribute('cx', nd.x); circle.setAttribute('cy', nd.y); circle.setAttribute('r', r);
    circle.setAttribute('fill', nd.placeholder ? 'none' : typeColor(nd.type));
    circle.setAttribute('stroke', nd.id === centerId ? 'var(--accent)' : (nd.placeholder ? typeColor(nd.type) : 'var(--bg)'));
    circle.setAttribute('stroke-width', nd.id === centerId ? '3' : '2');
    if (nd.placeholder) circle.setAttribute('stroke-dasharray', '4 3');
    nd._circle = circle;
    g.appendChild(circle);

    const prefix = document.createElementNS(NS, 'text');
    prefix.setAttribute('x', nd.x); prefix.setAttribute('y', nd.y + 4);
    prefix.setAttribute('text-anchor', 'middle');
    prefix.style.fontSize = '7px'; prefix.style.fontWeight = '700'; prefix.style.fill = nd.placeholder ? typeColor(nd.type) : '#fff'; prefix.style.pointerEvents = 'none';
    prefix.textContent = (nd.id.split('-')[0] || '').substring(0, 3);
    nd._prefix = prefix;
    g.appendChild(prefix);

    const text = document.createElementNS(NS, 'text');
    text.setAttribute('x', nd.x); text.setAttribute('y', nd.y + r + 12);
    text.setAttribute('text-anchor', 'middle');
    text.style.fontSize = '8px'; text.style.fill = 'var(--fg2)'; text.style.pointerEvents = 'none';
    text.textContent = nd.title.length > 20 ? nd.title.substring(0, 18) + '..' : nd.title;
    nd._text = text;
    g.appendChild(text);

    // Drag support for mini-graph nodes
    let dragging = false, dragMoved = false;
    g.addEventListener('mousedown', function(e) {
      e.preventDefault(); e.stopPropagation();
      dragging = true; dragMoved = false;
      const startX = e.clientX, startY = e.clientY, origX = nd.x, origY = nd.y;
      const svgRect = svg.getBoundingClientRect();
      const miniVb = (svg.getAttribute('viewBox') || '0 0 ' + w + ' ' + h).split(' ').map(Number);
      const scaleX = miniVb[2] / svgRect.width, scaleY = miniVb[3] / svgRect.height;
      function onMove(me) {
        if (!dragging) return; dragMoved = true;
        nd.x = Math.max(20, Math.min(w - 20, origX + (me.clientX - startX) * scaleX));
        nd.y = Math.max(20, Math.min(h - 20, origY + (me.clientY - startY) * scaleY));
        nd._circle.setAttribute('cx', nd.x); nd._circle.setAttribute('cy', nd.y);
        nd._prefix.setAttribute('x', nd.x); nd._prefix.setAttribute('y', nd.y + 4);
        nd._text.setAttribute('x', nd.x); nd._text.setAttribute('y', nd.y + r + 12);
        edgeEls.forEach(function(ee) {
          const s = nodes[ee.source], t = nodes[ee.target];
          ee.el.setAttribute('x1', s.x); ee.el.setAttribute('y1', s.y);
          ee.el.setAttribute('x2', t.x); ee.el.setAttribute('y2', t.y);
          if (ee.labelEl) { ee.labelEl.setAttribute('x', (s.x + t.x) / 2); ee.labelEl.setAttribute('y', (s.y + t.y) / 2 - 3); }
        });
      }
      function onUp() {
        dragging = false;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        if (!dragMoved && nd.path) go(nd.path.startsWith('cap/') ? nd.path : 'doc/' + nd.path);
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    svg.appendChild(g);
  });

  container.appendChild(svg);
  addZoomPan(svg);
}

export function renderGraph() {
  setActiveView('graph'); mainEl.textContent = ''; rightEl.textContent = ''; setBread([{ label: 'Tools' }, { label: 'Dependencies' }]);
  mainEl.appendChild(mk('h1', '', 'Document Dependency Graph'));
  mainEl.appendChild(mk('p', '', 'Click a node to select it and see its neighborhood. Double-click to navigate. Drag to rearrange.'));

  const loading = mk('p', '', 'Loading graph data...');
  mainEl.appendChild(loading);

  buildGraph();
  loading.remove();
  (function() {

    const allNodes = Object.keys(state.graphNodes).map(function(id) { return state.graphNodes[id]; });
    const allEdges = state.graphEdges;

    if (!allNodes.length) {
      mainEl.appendChild(mk('p', 'error-msg', 'No documents with related: frontmatter found.'));
      return;
    }

    // Multi-select filter state
    const activeTypes = {};
    const activeDomains = {};

    // Filter bar
    const filterBar = mk('div', 'graph-filter-bar');

    const typeLabel = mk('span', '', 'Type: ');
    typeLabel.style.fontSize = '11px'; typeLabel.style.fontWeight = '600'; typeLabel.style.color = 'var(--fg3)';
    filterBar.appendChild(typeLabel);

    const types = {};
    allNodes.forEach(function(nd) { types[nd.type] = (types[nd.type] || 0) + 1; });
    Object.keys(types).sort().forEach(function(t) {
      const btn = mk('button', '', t + ' (' + types[t] + ')');
      btn.addEventListener('click', function() {
        if (activeTypes[t]) { delete activeTypes[t]; btn.classList.remove('active'); }
        else { activeTypes[t] = true; btn.classList.add('active'); }
        updateGraph();
      });
      filterBar.appendChild(btn);
    });

    const sep = mk('span', '', ' | Domain: ');
    sep.style.fontSize = '11px'; sep.style.fontWeight = '600'; sep.style.color = 'var(--fg3)'; sep.style.marginLeft = '8px';
    filterBar.appendChild(sep);

    const domains = {};
    allNodes.forEach(function(nd) { domains[nd.domain] = (domains[nd.domain] || 0) + 1; });
    Object.keys(domains).sort().forEach(function(d) {
      const dObj = DOMAINS.find(function(dd) { return dd.dir === d; });
      const label = dObj ? dObj.label : d;
      const btn = mk('button', '', label + ' (' + domains[d] + ')');
      btn.addEventListener('click', function() {
        if (activeDomains[d]) { delete activeDomains[d]; btn.classList.remove('active'); }
        else { activeDomains[d] = true; btn.classList.add('active'); }
        updateGraph();
      });
      filterBar.appendChild(btn);
    });

    mainEl.appendChild(filterBar);

    // Legend
    const legend = mk('div', 'graph-legend');
    Object.keys(types).sort().forEach(function(t) {
      const item = mk('span', 'graph-legend-item');
      const dot = mk('span', 'graph-legend-dot');
      dot.style.background = typeColor(t);
      item.appendChild(dot);
      item.appendChild(document.createTextNode(t));
      legend.appendChild(item);
    });
    mainEl.appendChild(legend);

    const container = mk('div', 'graph-container');
    mainEl.appendChild(container);

    function updateGraph() {
      const hasTypeFilter = Object.keys(activeTypes).length > 0;
      const hasDomainFilter = Object.keys(activeDomains).length > 0;

      const filteredNodes = allNodes.filter(function(nd) {
        const typeOk = !hasTypeFilter || activeTypes[nd.type];
        const domainOk = !hasDomainFilter || activeDomains[nd.domain];
        return typeOk && domainOk;
      });
      const nodeIds = {};
      filteredNodes.forEach(function(nd) { nodeIds[nd.id] = true; });
      const filteredEdges = allEdges.filter(function(e) { return nodeIds[e.source] && nodeIds[e.target]; });

      const w = container.clientWidth || 700;
      const h = Math.max(500, filteredNodes.length * 15);
      const layoutNodes = filteredNodes.map(function(nd) { return { id: nd.id, title: nd.title, type: nd.type, domain: nd.domain, path: nd.path, placeholder: nd.placeholder, x: 0, y: 0, vx: 0, vy: 0 }; });
      forceLayout(layoutNodes, filteredEdges, w, h);
      renderSVG(layoutNodes, filteredEdges, container, w, h, allNodes, allEdges);
    }

    updateGraph();

    let resizeTimer;
    function onResize() { clearTimeout(resizeTimer); resizeTimer = setTimeout(updateGraph, 200); }
    window.addEventListener('resize', onResize);
    const cleanupObs = new MutationObserver(function() { if (!container.isConnected) { window.removeEventListener('resize', onResize); cleanupObs.disconnect(); } });
    cleanupObs.observe(document.body, { childList: true, subtree: true });

    rightEl.appendChild(mk('h3', '', 'Graph'));
    rightEl.appendChild(mk('p', '', allNodes.length + ' documents, ' + allEdges.length + ' relationships'));
    rightEl.appendChild(mk('h3', '', 'Instructions'));
    rightEl.appendChild(mk('p', '', 'Click a node to select it — focus mode highlights its neighbors and shows a mini-graph here. Double-click a node to navigate to it. Drag nodes to rearrange. Click the background to deselect.'));
  })();
}
