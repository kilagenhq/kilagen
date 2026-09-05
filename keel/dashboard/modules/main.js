import { state } from './state.js';
import { go, getHash, fadeMain, initRouter, registerViewBtns, mainEl, rightEl } from './nav.js';
import { rebuildSidebar } from './sidebar.js';
import { loadRegistry } from './data.js';
import { renderHome } from './views/home.js';
import { renderMaturity } from './views/maturity.js';
import { SYSTEMS_CONFIG, DATA_ASSETS_CONFIG, BUSINESS_PROCESSES_CONFIG, EXCEPTIONS_CONFIG, VENDORS_CONFIG, STANDARDS_CONFIG, RISKS_CONFIG } from './views/browse.js';
import { renderReviews } from './views/reviews.js';
import { renderAbout } from './views/about.js';
import { renderSchedule } from './views/schedule.js';
import { renderCompare } from './views/compare.js';
import { renderSchemas } from './views/schemas.js';
import { renderTemplates } from './views/templates.js';
import { renderGlossary } from './views/glossary.js';
import { renderMatRef } from './views/matref.js';
import { appNavigateDomain } from './views/domain.js';
import { appShowCapDetail } from './views/cap-detail.js';
import { appNavigateSystem } from './views/system-detail.js';
import { navigateDoc } from './views/doc.js';
import { renderSearchResults } from './views/search.js';
import { renderGraph } from './views/graph.js';
import { renderCompliance } from './views/compliance.js';
import { renderRiskHeatmap } from './views/riskheatmap.js';
import { renderRiskFramework } from './views/riskframework.js';
import { renderThreatProfile } from './views/threat-profile.js';
import { renderGrc } from './views/grc.js';
import { renderBrowse } from './views/browse.js';
import { renderNistCsf } from './views/nist-csf.js';
import { renderDomainsOverview } from './views/domains-overview.js';
import { mk } from './dom.js';

/* ===== Global error handling ===== */
window.addEventListener('unhandledrejection', function(event) {
  console.error('Unhandled promise rejection:', event.reason);
});

/* ===== Router ===== */
function route(hash) {
  const h = hash || 'home';
  if (h.startsWith('domain/')) state.currentDoc = h.substring(7);
  else if (h.startsWith('doc/')) state.currentDoc = h.substring(4);
  else if (h.startsWith('cap/')) state.currentDoc = h.substring(4);
  else if (h.startsWith('sys/')) state.currentDoc = 'systems/' + h.substring(4);
  else if (h === 'schemas' || h === 'templates' || h === 'glossary' || h === 'matref' || h === 'riskframework' || h === 'compliance' || h === 'riskheatmap' || h === 'threat-profile' || h === 'vendors' || h === 'adrs' || h === 'standards' || h === 'browse' || h.startsWith('browse/') || h === 'nist-csf' || h === 'data-assets' || h === 'business-processes' || h === 'domains') state.currentDoc = h;
  else state.currentDoc = '';
  // Auto-expand the target section in the sidebar
  let autoDir = '';
  if (h.startsWith('domain/')) autoDir = h.substring(7);
  else if (h.startsWith('cap/')) autoDir = h.substring(4).split('/')[0];
  else if (h.startsWith('doc/')) autoDir = h.substring(4).split('/')[0];
  if (autoDir && !state.expandedDomains[autoDir]) state.expandedDomains[autoDir] = true;
  // Auto-expand governance for browse routes targeting GRC or global types
  if (h.startsWith('browse/') || h === 'standards' || h === 'vendors' || h === 'adrs' || h === 'data-assets' || h === 'business-processes') {
    var browseDomain = h.startsWith('browse/') ? h.split('/')[2] : null;
    if (!browseDomain || browseDomain === '01-grc') {
      state.expandedDomains['_governance'] = true;
    } else if (browseDomain) {
      state.expandedDomains['_domains'] = true;
      state.expandedDomains[browseDomain] = true;
    }
  }
  if (h === 'systems') state.expandedDomains['_systems'] = true;
  rebuildSidebar();
  fadeMain();
  if (h === 'home') renderHome();
  else if (h === 'maturity') renderMaturity();
  else if (h === 'systems') renderBrowse('system', null, SYSTEMS_CONFIG);
  else if (h === 'reviews') renderReviews();
  else if (h === 'schedule') renderSchedule();
  else if (h === 'about') renderAbout();
  else if (h === 'health') renderHome();
  else if (h === 'compare') renderCompare();
  else if (h === 'schemas') renderSchemas();
  else if (h === 'templates') renderTemplates();
  else if (h === 'glossary') renderGlossary();
  else if (h === 'matref') renderMatRef();
  else if (h === 'riskframework') renderRiskFramework();
  else if (h === 'graph') renderGraph();
  else if (h === 'compliance') renderCompliance();
  else if (h === 'riskheatmap') renderRiskHeatmap();
  else if (h === 'threat-profile') renderThreatProfile();
  else if (h === 'vendors') renderBrowse('vendor', '01-grc', VENDORS_CONFIG);
  else if (h === 'adrs') renderBrowse('adr');
  else if (h === 'standards' || h === 'grc') renderGrc();
  else if (h === 'browse') renderBrowse();
  else if (h === 'browse/threat' || h.startsWith('browse/threat/')) renderThreatProfile();
  else if (h.startsWith('browse/')) { var browseParts = h.substring(7).split('/'); var bType = browseParts[0] || null; var bDom = browseParts[1] || null; var bConfig = { 'data-asset': DATA_ASSETS_CONFIG, 'business-process': BUSINESS_PROCESSES_CONFIG, exception: EXCEPTIONS_CONFIG, vendor: VENDORS_CONFIG, standard: STANDARDS_CONFIG, risk: RISKS_CONFIG, system: SYSTEMS_CONFIG }[bType] || null; renderBrowse(bType, bDom, bConfig); }
  else if (h === 'nist-csf') renderNistCsf();
  else if (h === 'data-assets') renderBrowse('data-asset', null, DATA_ASSETS_CONFIG);
  else if (h === 'business-processes') renderBrowse('business-process', null, BUSINESS_PROCESSES_CONFIG);
  else if (h === 'domains') renderDomainsOverview();
  else if (h.startsWith('cap/')) { const parts = h.substring(4).split('/'); if (parts.length >= 2) { const cDir = parts[0], cId = parts[1]; const dc = state.domainCaps[cDir]; if (dc && dc[cId]) appShowCapDetail(dc[cId], cDir); else renderHome(); return; } }
  else if (h.startsWith('domain/')) appNavigateDomain(h.substring(7));
  else if (h.startsWith('sys/')) { const p = 'systems/' + h.substring(4); appNavigateSystem(p); }
  else if (h.startsWith('doc/')) { navigateDoc(h.substring(4)); }
  else renderHome();
}

initRouter(route);
window.addEventListener('hashchange', function() { route(getHash()); });

/* ===== App title -> home ===== */
document.querySelector('.app-title').addEventListener('click', function(e) { go('home', e); });

/* ===== Dark mode — auto-detect + manual toggle ===== */
const darkBtn = document.getElementById('dark-toggle');
(function() {
  var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (prefersDark) document.body.classList.add('dark');
  darkBtn.textContent = document.body.classList.contains('dark') ? '\u2600' : '\u263E';
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(e) {
    document.body.classList.toggle('dark', e.matches);
    darkBtn.textContent = e.matches ? '\u2600' : '\u263E';
  });
})();
darkBtn.addEventListener('click', function() {
  document.body.classList.toggle('dark');
  darkBtn.textContent = document.body.classList.contains('dark') ? '\u2600' : '\u263E';
});

/* ===== View buttons (toolbar: Tools + Reference dropdowns) ===== */
const viewBtns = {};
// 'domains', 'maturity' and 'nist-csf' are the coverage views. Their routes
// always existed; without a button the only way in was to type the hash.
['browse', 'graph', 'reviews', 'about', 'schemas', 'templates', 'glossary', 'matref', 'riskframework',
 'domains', 'maturity', 'nist-csf'].forEach(function(v) {
  var el = document.getElementById('view-' + v);
  if (!el) return;
  viewBtns[v] = el;
  el.addEventListener('click', function() { closeAllDropdowns(); go(v); });
});
// Reference doc buttons (navigate to doc/ routes)
[{ id: 'doc-design', route: 'doc/design.md' }, { id: 'doc-compliance', route: 'doc/compliance.md' }, { id: 'doc-lenses', route: 'doc/lenses.md' }, { id: 'doc-instantiation', route: 'doc/instantiation.md' }].forEach(function(d) {
  var el = document.getElementById('view-' + d.id);
  if (!el) return;
  el.addEventListener('click', function() { closeAllDropdowns(); go(d.route); });
});
registerViewBtns(viewBtns);

/* ===== Toolbar dropdowns ===== */
function closeAllDropdowns() {
  document.querySelectorAll('.toolbar-menu').forEach(function(m) { m.classList.remove('show'); });
  document.querySelectorAll('.toolbar-trigger').forEach(function(t) { t.classList.remove('open'); });
}
document.querySelectorAll('.toolbar-trigger').forEach(function(trigger) {
  trigger.addEventListener('click', function(e) {
    e.stopPropagation();
    const menu = trigger.nextElementSibling;
    const wasOpen = menu.classList.contains('show');
    closeAllDropdowns();
    if (!wasOpen) { menu.classList.add('show'); trigger.classList.add('open'); }
  });
});
document.addEventListener('click', function() { closeAllDropdowns(); });

/* ===== Keyboard shortcuts modal ===== */
const kbdModal = document.getElementById('kbd-modal');
function toggleKbdModal() { kbdModal.classList.toggle('show'); }
kbdModal.addEventListener('click', function(e) { if (e.target === kbdModal) kbdModal.classList.remove('show'); });

/* ===== Keyboard ===== */
const searchEl = document.getElementById('search');
const treeEl = document.getElementById('tree');
document.addEventListener('keydown', function(e) {
  if (e.target.tagName === 'INPUT') { if (e.key === 'Escape') { searchEl.blur(); searchEl.value = ''; rebuildSidebar(); } if (e.key === 'Enter' && searchEl.value.trim()) { renderSearchResults(searchEl.value.trim().toLowerCase()); } return; }
  if (e.key === '?') { e.preventDefault(); toggleKbdModal(); return; }
  if (kbdModal.classList.contains('show')) { if (e.key === 'Escape') kbdModal.classList.remove('show'); return; }
  if (e.key === '/') { e.preventDefault(); searchEl.focus(); }
  else if (e.key === 'Escape') go('home');
  else if (e.key === 'd' || e.key === 'D') { darkBtn.click(); }
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { const items = treeEl.querySelectorAll('.tree-item,.app-nav-item'); if (!items.length) return; let idx = -1; for (let i = 0; i < items.length; i++) if (items[i].classList.contains('active')) { idx = i; break; } if (e.key === 'ArrowRight') idx = Math.min(idx + 1, items.length - 1); else idx = Math.max(idx - 1, 0); items[idx].click(); }
});

/* ===== Sidebar resize ===== */
(function() {
  const sidebar = document.getElementById('sidebar');
  const handle = document.getElementById('sidebar-resize');
  let dragging = false;
  handle.addEventListener('mousedown', function(e) {
    e.preventDefault();
    dragging = true;
    handle.classList.add('active');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });
  document.addEventListener('mousemove', function(e) {
    if (!dragging) return;
    const newW = Math.max(180, Math.min(500, e.clientX));
    sidebar.style.width = newW + 'px';
  });
  document.addEventListener('mouseup', function() {
    if (dragging) { dragging = false; handle.classList.remove('active'); document.body.style.cursor = ''; document.body.style.userSelect = ''; }
  });
})();

/* ===== Sidebar toggle (edge button) ===== */
(function() {
  const sidebar = document.getElementById('sidebar');
  const btn = document.getElementById('sidebar-toggle');
  btn.addEventListener('click', function() {
    const collapsed = sidebar.classList.toggle('collapsed');
    btn.textContent = collapsed ? '\u203A' : '\u2039';
  });
})();

/* ===== Right panel resize ===== */
(function() {
  const rightWrapper = document.getElementById('right-wrapper');
  const handle = document.getElementById('right-resize');
  let dragging = false;
  handle.addEventListener('mousedown', function(e) {
    e.preventDefault();
    dragging = true;
    handle.classList.add('active');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });
  document.addEventListener('mousemove', function(e) {
    if (!dragging) return;
    const newW = Math.max(180, Math.min(600, window.innerWidth - e.clientX));
    rightWrapper.style.width = newW + 'px';
  });
  document.addEventListener('mouseup', function() {
    if (dragging) { dragging = false; handle.classList.remove('active'); document.body.style.cursor = ''; document.body.style.userSelect = ''; }
  });
})();

/* ===== Right panel toggle (edge button + tablet drawer) ===== */
(function() {
  const rightWrapper = document.getElementById('right-wrapper');
  const btn = document.getElementById('right-toggle');
  const rightOverlay = document.createElement('div');
  rightOverlay.className = 'right-overlay';
  document.body.appendChild(rightOverlay);
  function isTablet() { return window.innerWidth <= 1024; }
  function closeDrawer() { rightWrapper.classList.remove('drawer-open'); rightOverlay.classList.remove('show'); }
  btn.addEventListener('click', function() {
    if (isTablet()) {
      var open = rightWrapper.classList.toggle('drawer-open');
      rightOverlay.classList.toggle('show', open);
      btn.textContent = open ? '\u203A' : '\u2039';
    } else {
      var collapsed = rightWrapper.classList.toggle('hidden');
      document.body.classList.toggle('right-hidden', collapsed);
      btn.textContent = collapsed ? '\u2039' : '\u203A';
    }
  });
  rightOverlay.addEventListener('click', function() { closeDrawer(); btn.textContent = '\u2039'; });
})();

/* ===== Hamburger (mobile) ===== */
(function() {
  const overlay = document.createElement('div');
  overlay.className = 'sidebar-overlay';
  document.body.appendChild(overlay);
  const sidebar = document.getElementById('sidebar');
  const hamburger = document.getElementById('hamburger');
  if (hamburger) {
    hamburger.addEventListener('click', function() {
      sidebar.classList.add('sidebar-open');
      overlay.classList.add('show');
    });
    overlay.addEventListener('click', function() {
      sidebar.classList.remove('sidebar-open');
      overlay.classList.remove('show');
    });
  }
})();

/* ===== Search ===== */
searchEl.addEventListener('input', function() { rebuildSidebar(); });

/* ===== Scroll to top ===== */
(function() {
  const btn = document.getElementById('scroll-top');
  const mainContent = mainEl;
  if (btn && mainContent) {
    mainContent.addEventListener('scroll', function() {
      btn.classList.toggle('show', mainContent.scrollTop > 200);
    });
    btn.addEventListener('click', function() {
      mainContent.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }
})();

/* ===== Sidebar auto-scroll to active item (debounced) ===== */
let scrollTimer;
const sidebarObserver = new MutationObserver(function() {
  clearTimeout(scrollTimer);
  scrollTimer = setTimeout(function() {
    const activeItem = treeEl.querySelector('.app-nav-item.active, .tree-item.active');
    if (activeItem) activeItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, 80);
});
sidebarObserver.observe(treeEl, { childList: true, subtree: true });

/* ===== Init ===== */
loadRegistry().then(function() {
  document.title = state.config.name;
  const titleEl = document.querySelector('.app-title');
  if (titleEl) { const txt = titleEl.lastChild; if (txt && txt.nodeType === 3) txt.textContent = ' ' + state.config.name; }
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
