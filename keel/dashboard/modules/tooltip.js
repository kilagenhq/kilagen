import { purCfg } from './parsers.js';

const DOMPurify = window.DOMPurify;
const tipEl = document.getElementById('tooltip');

export function showTip(e, html) {
  // Clear previous content safely
  while (tipEl.firstChild) tipEl.removeChild(tipEl.firstChild);
  const d = document.createElement('div');
  // html is always built from DOMPurify.sanitize() calls at the call site
  // and sanitized again here for defense-in-depth
  d.innerHTML = DOMPurify.sanitize(html, purCfg);
  tipEl.appendChild(d);
  tipEl.classList.add('show');
  moveTip(e);
}

export function moveTip(e) {
  let x = e.clientX + 12, y = e.clientY + 12;
  if (x + 280 > window.innerWidth) x = e.clientX - 290;
  if (y + 100 > window.innerHeight) y = e.clientY - 110;
  tipEl.style.left = x + 'px';
  tipEl.style.top = y + 'px';
}

export function hideTip() { tipEl.classList.remove('show'); }

export function addCapTip(el, cap) {
  el.addEventListener('mouseenter', function(e) {
    let h = '<div class="tip-title">' + DOMPurify.sanitize(cap.name || cap.id, { ALLOWED_TAGS: [] }) + '</div>';
    h += '<div class="tip-row"><span class="tip-key">Maturity</span>' + DOMPurify.sanitize(cap.maturity || 'L0-none', { ALLOWED_TAGS: [] }) + '</div>';
    if (cap.systems && cap.systems.length) h += '<div class="tip-row"><span class="tip-key">Systems</span>' + DOMPurify.sanitize(cap.systems.join(', '), { ALLOWED_TAGS: [] }) + '</div>';
    showTip(e, h);
  });
  el.addEventListener('mousemove', moveTip);
  el.addEventListener('mouseleave', hideTip);
}
