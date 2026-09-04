import { mk, matLvl } from './dom.js';

/** Add zoom (wheel + buttons) and pan (drag on background or edge lines) to an SVG element. */
export function addZoomPan(svg) {
  // Clean up previous listeners if re-attaching
  if (svg._zoomPanAbort) svg._zoomPanAbort.abort();
  const ac = new AbortController();
  svg._zoomPanAbort = ac;
  const sig = { signal: ac.signal };

  const vbStr = svg.getAttribute('viewBox') || '0 0 700 500';
  const vb = vbStr.split(' ').map(Number);
  const origVb = vb.slice();
  const minZoom = 0.3, maxZoom = 5;
  let scale = 1;
  let panning = false, panStart = { x: 0, y: 0 }, vbStart = [];

  // delta is a viewBox scale multiplier:
  //   delta < 1 = shrink viewBox = zoom in (things appear bigger)
  //   delta > 1 = grow viewBox = zoom out (things appear smaller)
  function applyZoom(delta) {
    const newScale = scale * delta;
    if (newScale < minZoom || newScale > maxZoom) return;
    const cx = vb[0] + vb[2] / 2, cy = vb[1] + vb[3] / 2;
    scale = newScale;
    const newW = origVb[2] * scale;
    const newH = origVb[3] * scale;
    vb[0] = cx - newW / 2;
    vb[1] = cy - newH / 2;
    vb[2] = newW;
    vb[3] = newH;
    svg.setAttribute('viewBox', vb.join(' '));
  }

  svg.addEventListener('mousedown', function(e) {
    if (e.target === svg || e.target.tagName === 'line') {
      panning = true;
      panStart = { x: e.clientX, y: e.clientY };
      vbStart = vb.slice();
      svg.style.cursor = 'grabbing';
      e.preventDefault();
    }
  }, sig);

  document.addEventListener('mousemove', function(e) {
    if (!panning) return;
    const rect = svg.getBoundingClientRect();
    const dx = (e.clientX - panStart.x) / rect.width * vb[2];
    const dy = (e.clientY - panStart.y) / rect.height * vb[3];
    vb[0] = vbStart[0] - dx;
    vb[1] = vbStart[1] - dy;
    svg.setAttribute('viewBox', vb.join(' '));
  }, sig);

  document.addEventListener('mouseup', function() {
    if (panning) { panning = false; svg.style.cursor = ''; }
  }, sig);

  // Add zoom buttons over the SVG's parent container
  const parent = svg.parentElement;
  if (parent) {
    parent.style.position = 'relative';
    const controls = mk('div', 'zoom-controls');
    const zoomIn = mk('button', 'zoom-btn', '+');
    const zoomOut = mk('button', 'zoom-btn', '\u2212');
    zoomIn.addEventListener('click', function(e) { e.stopPropagation(); applyZoom(0.75); });
    zoomOut.addEventListener('click', function(e) { e.stopPropagation(); applyZoom(1.35); });
    controls.appendChild(zoomIn);
    controls.appendChild(zoomOut);
    parent.appendChild(controls);
  }
}

export function renderRadar(caps, container, w) {
  if (!caps || caps.length < 3) { container.appendChild(mk('p', '', 'Need 3+ caps for radar.')); return; }
  const n = caps.length, cx = 200, cy = 200, r = 150;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 400 400'); svg.setAttribute('width', w || '100%'); svg.style.display = 'block'; svg.style.margin = '0 auto';
  for (let g = 1; g <= 5; g++) { const ci = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); ci.setAttribute('cx', cx); ci.setAttribute('cy', cy); ci.setAttribute('r', r * g / 5); ci.setAttribute('fill', 'none'); ci.setAttribute('stroke', 'var(--border)'); ci.setAttribute('stroke-width', '0.8'); svg.appendChild(ci); }
  const pts = [];
  caps.forEach(function(cap, i) {
    const a = -Math.PI / 2 + (2 * Math.PI * i / n);
    const ax = cx + r * Math.cos(a), ay = cy + r * Math.sin(a);
    const li = document.createElementNS('http://www.w3.org/2000/svg', 'line'); li.setAttribute('x1', cx); li.setAttribute('y1', cy); li.setAttribute('x2', ax); li.setAttribute('y2', ay); li.setAttribute('stroke', 'var(--border)'); li.setAttribute('stroke-width', '0.8'); svg.appendChild(li);
    const lvl = matLvl(cap.maturity); const px = cx + (r * lvl / 5) * Math.cos(a), py = cy + (r * lvl / 5) * Math.sin(a); pts.push(px + ',' + py);
    const lx = cx + (r + 25) * Math.cos(a), ly = cy + (r + 25) * Math.sin(a);
    const tx = document.createElementNS('http://www.w3.org/2000/svg', 'text'); tx.setAttribute('x', lx); tx.setAttribute('y', ly); tx.setAttribute('text-anchor', 'middle'); tx.setAttribute('dominant-baseline', 'middle'); tx.setAttribute('font-size', '10'); tx.setAttribute('fill', 'var(--fg2)'); tx.textContent = cap.id.length > 14 ? cap.id.substring(0, 12) + '..' : cap.id; svg.appendChild(tx);
  });
  const po = document.createElementNS('http://www.w3.org/2000/svg', 'polygon'); po.setAttribute('points', pts.join(' ')); po.setAttribute('fill', 'var(--accent)'); po.setAttribute('fill-opacity', '0.2'); po.setAttribute('stroke', 'var(--accent)'); po.setAttribute('stroke-width', '2'); svg.appendChild(po);
  pts.forEach(function(pt) { const xy = pt.split(','); const d = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); d.setAttribute('cx', xy[0]); d.setAttribute('cy', xy[1]); d.setAttribute('r', '5'); d.setAttribute('fill', 'var(--accent)'); svg.appendChild(d); });
  const wrap = mk('div', 'radar-wrap');
  wrap.appendChild(svg);
  container.appendChild(wrap);
}
