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
