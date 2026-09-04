import { mk } from './dom.js';
import { hideTip } from './tooltip.js';
import { state } from './state.js';

export const mainEl = document.getElementById('main');
export const rightEl = document.getElementById('right');

let viewBtns = {};
let routeHandler = null;

export function initRouter(handler) { routeHandler = handler; }

export function go(r, e) {
  if (e && (e.metaKey || e.ctrlKey)) {
    window.open(location.origin + location.pathname + '#' + r, '_blank');
    if (e.preventDefault) e.preventDefault();
    return;
  }
  if (e && e.preventDefault) e.preventDefault();
  hideTip();
  if (decodeURIComponent(location.hash.substring(1)) === r) { if (routeHandler) routeHandler(r); }
  else { location.hash = r; }
}

export function getHash() { return decodeURIComponent(location.hash.substring(1)) || 'home'; }

export function fadeMain() { hideTip(); mainEl.classList.remove('fade-in'); void mainEl.offsetWidth; mainEl.classList.add('fade-in'); }
export function fadeRight() { rightEl.classList.remove('right-fade-in'); void rightEl.offsetWidth; rightEl.classList.add('right-fade-in'); }

export function setBread(parts) {
  // Breadcrumbs render as first element inside #main
  if (!parts || !parts.length) return;
  const breadEl = mk('div', 'breadcrumbs-inline');
  const h = mk('span', '', 'Home');
  h.addEventListener('click', function(e) { go('home', e); });
  breadEl.appendChild(h);
  parts.forEach(function(p) {
    const sep = document.createTextNode(' \u203A ');
    breadEl.appendChild(sep);
    const s = mk('span', '', p.label);
    if (p.action) s.addEventListener('click', p.action);
    breadEl.appendChild(s);
  });
  mainEl.insertBefore(breadEl, mainEl.firstChild);
}

export function setActiveView(v) {
  state.currentView = v;
  Object.keys(viewBtns).forEach(function(k) { viewBtns[k].classList.toggle('active', k === v); });
  // Highlight the trigger of the dropdown containing the active view
  document.querySelectorAll('.toolbar-trigger').forEach(function(trigger) { trigger.classList.remove('has-active'); });
  if (v && viewBtns[v]) {
    const menu = viewBtns[v].closest('.toolbar-dropdown');
    if (menu) { const trigger = menu.querySelector('.toolbar-trigger'); if (trigger) trigger.classList.add('has-active'); }
  }
  const title = document.querySelector('.app-title');
  if (title) title.classList.toggle('active', v === 'home');
}

export function registerViewBtns(btns) { viewBtns = btns; }
