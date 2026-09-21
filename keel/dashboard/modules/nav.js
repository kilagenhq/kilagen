import { mk, mkClickable } from './dom.js';
import { state } from './state.js';

export const mainEl = document.getElementById('main');
export const rightEl = document.getElementById('right');

let routeHandler = null;

export function initRouter(handler) { routeHandler = handler; }

export function go(r, e) {
  if (e && (e.metaKey || e.ctrlKey)) {
    window.open(location.origin + location.pathname + '#' + r, '_blank');
    if (e.preventDefault) e.preventDefault();
    return;
  }
  if (e && e.preventDefault) e.preventDefault();
  if (decodeURIComponent(location.hash.substring(1)) === r) { if (routeHandler) routeHandler(r); }
  else { location.hash = r; }
}

/* `browse` was renamed `program` when the lenses moved to the top bar: the
   corpus of documents is the program, and Browse described the verb rather
   than the thing. Old links keep working. */
export function getHash() {
  const raw = decodeURIComponent(location.hash.substring(1)) || 'home';
  if (raw === 'browse') return 'program';
  if (raw.indexOf('browse/') === 0) return 'program/' + raw.substring(7);
  if (raw.indexOf('browse?') === 0) return 'program?' + raw.substring(7);
  return raw;
}

/* A route may carry a query string — `browse/gap?status=active&domain=iam`.
 * The route is what the router dispatches on; the parameters belong to the
 * view, which is why they are split here rather than parsed in five places.
 *
 * Values are read straight from the URL, so they are attacker-supplied: every
 * consumer renders them as text nodes and matches them against known facet
 * values. Nothing here is ever interpolated into markup.
 */
export function splitHash(hash) {
  const h = hash == null ? getHash() : hash;
  const i = h.indexOf('?');
  if (i === -1) return { route: h, params: {} };
  const params = {};
  h.substring(i + 1).split('&').forEach(function(pair) {
    if (!pair) return;
    const eq = pair.indexOf('=');
    const key = decodeURIComponent(eq === -1 ? pair : pair.substring(0, eq));
    const value = eq === -1 ? '' : decodeURIComponent(pair.substring(eq + 1));
    if (key) params[key] = value;
  });
  return { route: h.substring(0, i), params: params };
}

/* Rewrite the query string of the current route without navigating.
 * replaceState does not fire hashchange, so the view that owns the filters
 * redraws itself instead of being torn down and rebuilt on every keystroke —
 * while the URL stays a link somebody can paste into a ticket. */
export function setParams(route, params) {
  const qs = Object.keys(params)
    .filter(function(k) { return params[k] !== '' && params[k] != null; })
    .map(function(k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); })
    .join('&');
  const target = '#' + route + (qs ? '?' + qs : '');
  if (location.hash === target) return;
  if (window.history && window.history.replaceState) {
    window.history.replaceState(null, '', location.pathname + location.search + target);
  } else {
    location.hash = target.substring(1);
  }
}

/* The right panel belongs to an open document. A lens fills the width: its
   old panel content is the left tree now, which is the half that survives at
   phone width. */
export function hideRightPanel() {
  rightEl.textContent = '';
  document.body.classList.add('no-right-panel');
}

export function showRightPanel() {
  document.body.classList.remove('no-right-panel');
}

export function fadeMain() { mainEl.classList.remove('fade-in'); void mainEl.offsetWidth; mainEl.classList.add('fade-in'); }

export function setBread(parts) {
  // Breadcrumbs render as first element inside #main
  if (!parts || !parts.length) return;
  const breadEl = mk('div', 'breadcrumbs-inline');
  const h = mk('span', '', 'Home');
  mkClickable(h, function(e) { go('home', e); });
  breadEl.appendChild(h);
  parts.forEach(function(p) {
    const sep = document.createTextNode(' \u203A ');
    breadEl.appendChild(sep);
    const s = mk('span', '', p.label);
    if (p.action) mkClickable(s, p.action);
    breadEl.appendChild(s);
  });
  mainEl.insertBefore(breadEl, mainEl.firstChild);
}

/* The sidebar is the only navigation, and it is rebuilt from the hash before
   a view renders — so the active lens is derived there, not pushed from here.
   This records which lens is showing, for the views that ask. */
export function setActiveView(v) {
  state.currentView = v;
  const title = document.querySelector('.app-title');
  if (title) title.classList.toggle('active', v === 'home');
}
