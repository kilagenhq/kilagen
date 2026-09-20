import { state } from './state.js';
import { go, getHash, splitHash, fadeMain, initRouter, mainEl } from './nav.js';
import { rebuildSidebar } from './sidebar.js';
import { loadRegistry } from './data.js';
import { mk } from './dom.js';
import { focusFilterSearch } from './filters.js';

import { renderHome } from './views/home.js';
import { renderBrowse } from './views/browse.js';
import { renderDomains, renderDomain } from './views/domains.js';
import { renderCompliance } from './views/compliance.js';
import { renderAudit } from './views/audit.js';
import { renderSchedule } from './views/schedule.js';
import { navigateDoc } from './views/doc.js';
import { renderReference } from './views/reference.js';
import { renderGlossary } from './views/glossary.js';
import { renderSchemas } from './views/schemas.js';
import { renderTemplates } from './views/templates.js';
import { renderTools } from './views/tools.js';
import { renderSearchResults } from './views/search.js';

window.addEventListener('unhandledrejection', function(event) {
  console.error('Unhandled promise rejection:', event.reason);
});

/* ===== Router =====
 * Five lenses plus the reference pages. Every route is <lens> or <lens>/<key>,
 * so adding a lens is one line and a document's URL is its path.
 */
function route(hash) {
  const h = splitHash(hash || 'home').route || 'home';
  state.currentDoc = h.indexOf('doc/') === 0 ? h.substring(4) : '';
  rebuildSidebar();
  fadeMain();

  if (h === 'home') return renderHome();
  if (h === 'program') return renderBrowse(null);
  if (h.indexOf('program/') === 0) return renderBrowse(h.substring(8));
  if (h === 'domains') return renderDomains();
  if (h.indexOf('domain/') === 0) return renderDomain(h.substring(7));
  if (h === 'compliance') return renderCompliance(null);
  if (h.indexOf('compliance/') === 0) return renderCompliance(h.substring(11));
  if (h.indexOf('audit/') === 0) return renderAudit(h.substring(6));
  if (h === 'schedule') return renderSchedule();
  if (h === 'reference') return renderReference();
  if (h === 'glossary') return renderGlossary();
  if (h === 'schemas') return renderSchemas();
  if (h === 'templates') return renderTemplates();
  if (h === 'tools') return renderTools();
  if (h.indexOf('doc/') === 0) return navigateDoc(h.substring(4));
  return renderHome();
}

initRouter(route);
window.addEventListener('hashchange', function() { route(getHash()); });

document.querySelector('.app-title').addEventListener('click', function(e) { go('home', e); });

/* ===== Dark mode =====
 * The class goes on <html>, not <body>, and that is not cosmetic: the palette
 * declares its internal tokens in terms of the public ones on the same
 * element, and a custom property is substituted where it is *declared*. With
 * the class one element lower, :root would keep resolving the light values
 * and half the page would stay light. */
const helpBtn = document.getElementById('help-btn');
if (helpBtn) helpBtn.addEventListener('click', function(e) { go('reference', e); });

const darkBtn = document.getElementById('dark-toggle');
const root = document.documentElement;
(function() {
  if (window.matchMedia('(prefers-color-scheme: dark)').matches) root.classList.add('dark');
  darkBtn.textContent = root.classList.contains('dark') ? '☀' : '☾';
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(e) {
    root.classList.toggle('dark', e.matches);
    darkBtn.textContent = e.matches ? '☀' : '☾';
  });
})();
darkBtn.addEventListener('click', function() {
  root.classList.toggle('dark');
  darkBtn.textContent = root.classList.contains('dark') ? '☀' : '☾';
});

/* ===== Keyboard ===== */
const kbdModal = document.getElementById('kbd-modal');
kbdModal.addEventListener('click', function(e) { if (e.target === kbdModal) kbdModal.classList.remove('show'); });
const searchEl = document.getElementById('search');
const treeEl = document.getElementById('tree');
document.addEventListener('keydown', function(e) {
  if (e.target.tagName === 'INPUT') {
    if (e.key === 'Escape') { searchEl.blur(); searchEl.value = ''; rebuildSidebar(); }
    if (e.key === 'Enter' && searchEl.value.trim()) renderSearchResults(searchEl.value.trim().toLowerCase());
    return;
  }
  if (e.key === '?') { e.preventDefault(); kbdModal.classList.toggle('show'); return; }
  if (kbdModal.classList.contains('show')) { if (e.key === 'Escape') kbdModal.classList.remove('show'); return; }
  if (e.key === '/') { e.preventDefault(); if (!focusFilterSearch()) searchEl.focus(); }
  else if (e.key === 'Escape') go('home');
  else if (e.key === 'd' || e.key === 'D') darkBtn.click();
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    const items = treeEl.querySelectorAll('.tree-item,.app-nav-item');
    if (!items.length) return;
    let idx = -1;
    for (let i = 0; i < items.length; i++) if (items[i].classList.contains('active')) { idx = i; break; }
    idx = e.key === 'ArrowRight' ? Math.min(idx + 1, items.length - 1) : Math.max(idx - 1, 0);
    items[idx].click();
  }
});

/* ===== Panels ===== */
function makeResizer(handleId, elId, min, max, fromRight) {
  const el = document.getElementById(elId);
  const handle = document.getElementById(handleId);
  if (!el || !handle) return;
  let dragging = false;
  handle.addEventListener('mousedown', function(e) {
    e.preventDefault(); dragging = true; handle.classList.add('active');
    document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none';
  });
  document.addEventListener('mousemove', function(e) {
    if (!dragging) return;
    const w = fromRight ? window.innerWidth - e.clientX : e.clientX;
    el.style.width = Math.max(min, Math.min(max, w)) + 'px';
  });
  document.addEventListener('mouseup', function() {
    if (!dragging) return;
    dragging = false; handle.classList.remove('active');
    document.body.style.cursor = ''; document.body.style.userSelect = '';
  });
}
makeResizer('sidebar-resize', 'sidebar', 180, 500, false);
makeResizer('right-resize', 'right-wrapper', 180, 600, true);

(function() {
  const sidebar = document.getElementById('sidebar');
  const btn = document.getElementById('sidebar-toggle');
  btn.addEventListener('click', function() {
    btn.textContent = sidebar.classList.toggle('collapsed') ? '›' : '‹';
  });
})();

(function() {
  const rightWrapper = document.getElementById('right-wrapper');
  const btn = document.getElementById('right-toggle');
  const overlay = document.createElement('div');
  overlay.className = 'right-overlay';
  document.body.appendChild(overlay);
  btn.addEventListener('click', function() {
    if (window.innerWidth <= 1024) {
      const open = rightWrapper.classList.toggle('drawer-open');
      overlay.classList.toggle('show', open);
      btn.textContent = open ? '›' : '‹';
    } else {
      const collapsed = rightWrapper.classList.toggle('hidden');
      document.body.classList.toggle('right-hidden', collapsed);
      btn.textContent = collapsed ? '‹' : '›';
    }
  });
  overlay.addEventListener('click', function() {
    rightWrapper.classList.remove('drawer-open'); overlay.classList.remove('show'); btn.textContent = '‹';
  });
})();

(function() {
  const overlay = document.createElement('div');
  overlay.className = 'sidebar-overlay';
  document.body.appendChild(overlay);
  const sidebar = document.getElementById('sidebar');
  const hamburger = document.getElementById('hamburger');
  if (!hamburger) return;
  hamburger.addEventListener('click', function() {
    sidebar.classList.add('sidebar-open'); overlay.classList.add('show');
  });
  overlay.addEventListener('click', function() {
    sidebar.classList.remove('sidebar-open'); overlay.classList.remove('show');
  });
})();

searchEl.addEventListener('input', function() { rebuildSidebar(); });

(function() {
  const btn = document.getElementById('scroll-top');
  if (!btn) return;
  mainEl.addEventListener('scroll', function() { btn.classList.toggle('show', mainEl.scrollTop > 200); });
  btn.addEventListener('click', function() { mainEl.scrollTo({ top: 0, behavior: 'smooth' }); });
})();

/* ===== Init ===== */
loadRegistry().then(function() {
  document.title = state.config.name;
  const nameEl = document.querySelector('.app-title-name');
  if (nameEl) nameEl.textContent = state.config.name;
  rebuildSidebar();
  const h = getHash();
  if (h && h !== 'home') route(h); else renderHome();
}).catch(function(err) {
  const msg = mk('div', 'empty-state');
  msg.appendChild(mk('h2', '', 'Build required'));
  msg.appendChild(mk('p', '', 'Run kilagen build from the repo root, then refresh.'));
  msg.appendChild(mk('p', 'nist-cat-notes', err.message));
  mainEl.appendChild(msg);
});
