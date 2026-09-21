import { state } from './state.js';
import { missingLibraries } from './parsers.js';
import { go, getHash, splitHash, fadeMain, initRouter, mainEl } from './nav.js';
import { rebuildSidebar } from './sidebar.js';
import { loadRegistry } from './data.js';
import { mk } from './dom.js';
import { focusFilterSearch } from './filters.js';

import { renderHome } from './views/home.js';
import { renderBrowse } from './views/browse.js';
import { renderDomains, renderDomain } from './views/domains.js';
import { renderCompliance } from './views/compliance.js';
import { renderEvidenceLens } from './views/evidence.js';
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
  if (h === 'search') return renderSearchResults((splitHash(hash || '').params.q || '').toLowerCase());
  if (h === 'program') return renderBrowse(null);
  if (h.indexOf('program/') === 0) return renderBrowse(h.substring(8));
  if (h === 'domains') return renderDomains();
  if (h.indexOf('domain/') === 0) return renderDomain(h.substring(7));
  if (h === 'compliance') return renderCompliance(null);
  /* Before the framework branch: `evidence` is the other half of the lens,
     not a framework id, and coverage would never resolve it. */
  if (h === 'compliance/evidence') return renderEvidenceLens();
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

const helpBtn = document.getElementById('help-btn');
if (helpBtn) helpBtn.addEventListener('click', function(e) { go('reference', e); });

/* ===== Dark mode =====
 * The class goes on <html>, not <body>, and that is not cosmetic: the palette
 * declares its internal tokens in terms of the public ones on the same
 * element, and a custom property is substituted where it is *declared*. With
 * the class one element lower, :root would keep resolving the light values
 * and half the page would stay light. */
const darkBtn = document.getElementById('dark-toggle');
const root = document.documentElement;
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');

/* The glyph is read back off the class rather than from whatever just
   happened, so the button cannot end up describing a mode the page is not in. */
function syncDarkGlyph() {
  darkBtn.textContent = root.classList.contains('dark') ? '☀' : '☾';
}

if (prefersDark.matches) root.classList.add('dark');
syncDarkGlyph();
prefersDark.addEventListener('change', function(e) {
  root.classList.toggle('dark', e.matches);
  syncDarkGlyph();
});
darkBtn.addEventListener('click', function() {
  root.classList.toggle('dark');
  syncDarkGlyph();
});

/* ===== Keyboard ===== */
const kbdModal = document.getElementById('kbd-modal');

/* Open and close the shortcuts dialog, moving the focus with it. Without that
   a screen reader gets no indication anything happened, and on close the
   focus is left wherever it was when the dialog took over. */
let shortcutsOpener = null;
function toggleShortcuts(force) {
  const show = force == null ? !kbdModal.classList.contains('show') : force;
  if (show) {
    shortcutsOpener = document.activeElement;
    kbdModal.classList.add('show');
    const dialog = kbdModal.querySelector('.kbd-modal');
    if (dialog) dialog.focus();
  } else {
    kbdModal.classList.remove('show');
    if (shortcutsOpener && shortcutsOpener.focus) shortcutsOpener.focus();
    shortcutsOpener = null;
  }
}
kbdModal.addEventListener('click', function(e) { if (e.target === kbdModal) toggleShortcuts(false); });
const searchEl = document.getElementById('search');
const treeEl = document.getElementById('tree');
document.addEventListener('keydown', function(e) {
  // Cmd/Ctrl/Alt belong to the browser: without this, Cmd+D flipped the theme
  // while the bookmark dialog opened.
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target.tagName === 'INPUT') {
    if (e.key === 'Escape') { searchEl.blur(); searchEl.value = ''; rebuildSidebar(); }
    if (e.key === 'Enter' && searchEl.value.trim()) go('search?q=' + encodeURIComponent(searchEl.value.trim()));
    return;
  }
  if (e.key === '?') { e.preventDefault(); toggleShortcuts(); return; }
  if (kbdModal.classList.contains('show')) { if (e.key === 'Escape') toggleShortcuts(false); return; }
  if (e.key === '/') { e.preventDefault(); if (!focusFilterSearch()) searchEl.focus(); }
  else if (e.key === 'Escape') go('home');
  else if (e.key === 'd' || e.key === 'D') darkBtn.click();
  else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight')
           && (e.target === document.body || treeEl.contains(e.target))) {
    // Only from the tree or from nothing in particular. Otherwise an arrow
    // press while a sort button or a heading had focus navigated the app away.
    const items = treeEl.querySelectorAll('.tree-item');
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
if (missingLibraries.length) {
  const msg = mk('div', 'empty-state');
  msg.appendChild(mk('h2', '', 'Dashboard libraries failed to load'));
  msg.appendChild(mk('p', '', 'Run ./scripts/vendor-libs.sh, then kilagen build.'));
  msg.appendChild(mk('p', 'nist-cat-notes', 'Missing: ' + missingLibraries.join(', ')));
  mainEl.appendChild(msg);
} else loadRegistry().then(function() {
  document.title = state.config.name;
  const nameEl = document.querySelector('.app-title-name');
  if (nameEl) nameEl.textContent = state.config.name;
  /* A build that skipped its own checks must not be able to look like one
     that did. It sits above the content, on every view, until it is rebuilt. */
  if (!state.validated) {
    const banner = mk('div', 'unvalidated-banner');
    banner.setAttribute('role', 'status');
    banner.textContent = 'Built without validation — run kilagen build to check this content.';
    document.body.insertBefore(banner, document.body.firstChild);
  }
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
