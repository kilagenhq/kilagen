import { mk, mkIcon } from './dom.js';
import { state, docsOfType, docsWithFacet } from './state.js';
import { go, getHash, splitHash } from './nav.js';
import { typeColor, typePlural, fwLabel, groupedTypes, domainIcon, domainColor } from './constants.js';

/* The sidebar is the whole navigation.
 *
 * The lens is chosen in the header; this is what is inside it.
 *
 * Both used to live here, which put everything one level deeper than it needed
 * to be: a type sat under Browse, which sat in a list of five. Now the header
 * says which lens you are in and the tree starts at the things themselves —
 * the types under Program, the domains under Domains, the frameworks under
 * Compliance. One level, and the tree is the only way into any of them, which
 * is also the only navigation that survives at phone width.
 *
 * Reference is not here and neither is Overview. Reference is documentation
 * about Kilagen rather than about this program; Overview is the program's own
 * front page and lives on the mark in the corner.
 *
 * Only the active lens's subtree is open, which is what keeps seven entries
 * from becoming forty.
 *
 * The active item is derived from the hash rather than pushed by a view,
 * because the sidebar is rebuilt before the view renders and would otherwise
 * always be one navigation behind.
 */

const treeEl = document.getElementById('tree');
const searchEl = document.getElementById('search');
const navEl = document.getElementById('app-nav');

/* The four lenses that hold something. Overview is the mark in the corner —
   it is the program itself rather than a view of part of it. */
export const LENSES = [
  ['program', 'Program'],
  ['domains', 'Domains'],
  ['compliance', 'Compliance'],
  ['schedule', 'Schedule'],
];

/* Which lens a hash belongs to, so a detail page keeps its lens lit. */
export function lensOf(hash) {
  const head = hash.split('/')[0];
  if (head === 'domain') return 'domains';
  if (head === 'doc') return '';
  if (head === '') return 'home';
  return head;
}

function item(label, route, opts) {
  const o = opts || {};
  const el = mk('div', 'tree-item' + (o.active ? ' active' : '') + (o.nested ? ' tree-item-nested' : ''));
  if (o.icon) {
    const icon = mkIcon(o.icon, 'doc-type-icon');
    if (o.color) icon.style.color = o.color;
    el.appendChild(icon);
  }
  el.appendChild(mk('span', 'tree-item-label', label));
  if (o.count != null) {
    el.appendChild(mk('span', 'tree-count' + (o.count ? '' : ' tree-count-zero'), String(o.count)));
  }
  if (o.title) el.title = o.title;
  el.addEventListener('click', function(e) { go(route, e); });
  return el;
}

/* What is inside the lens you are looking at, at the top level of the tree. */
function subtree(lens, hash) {
  const rows = [];
  if (lens === 'program') {
    groupedTypes(state.types.map(function(t) { return t.name; })).forEach(function(group) {
      const label = mk('div', 'tree-group-label');
      label.appendChild(mk('span', '', group.label));
      if (group.note) label.appendChild(mk('span', 'tree-group-note', group.note));
      rows.push(label);
      group.types.forEach(function(name) {
        rows.push(item(typePlural(name), 'program/' + name, {
          icon: name, color: typeColor(name),
          count: docsOfType(name).length, active: hash === 'program/' + name,
        }));
      });
    });
  } else if (lens === 'domains') {
    (state.model.domains || []).forEach(function(d) {
      rows.push(item(d.name, 'domain/' + d.id, {
        icon: domainIcon(d.id), color: domainColor(d.id), title: d.id,
        count: docsWithFacet('domains', d.id).length,
        active: hash === 'domain/' + d.id,
      }));
    });
  } else if (lens === 'compliance') {
    Object.keys(state.coverage).forEach(function(fw) {
      const row = item(fwLabel(fw), 'compliance/' + fw, { active: hash === 'compliance/' + fw });
      row.appendChild(mk('span', 'tree-count', frameworkCount(fw)));
      rows.push(row);
    });
  } else if (lens === 'schedule') {
    /* The two clocks the lens keeps, so the tree is not empty here either. */
    const params = splitHash(getHash()).params;
    rows.push(item('Activities', 'schedule', { active: params.tab !== 'reviews' }));
    rows.push(item('Reviews', 'schedule?tab=reviews', { active: params.tab === 'reviews' }));
  }
  return rows;
}

function frameworkCount(fw) {
  const clauses = state.coverage[fw] || {};
  const refs = Object.keys(clauses);
  const mapped = refs.filter(function(r) { return clauses[r].coverage === 'mapped'; }).length;
  return mapped + ' / ' + refs.length;
}

function renderSearchMatches(query) {
  const hits = [];
  Object.keys(state.fmCache).forEach(function(path) {
    const fm = state.fmCache[path];
    const haystack = (path + ' ' + (fm.id || '') + ' ' + (fm.title || '') + ' ' + (fm.description || '')).toLowerCase();
    if (haystack.indexOf(query) !== -1) hits.push(fm);
  });
  treeEl.appendChild(mk('div', 'tree-group-label', hits.length + ' matches'));
  hits.slice(0, 80).forEach(function(fm) {
    treeEl.appendChild(item(fm.id, 'doc/' + fm.path,
      { icon: fm.type, color: typeColor(fm.type), active: state.currentDoc === fm.path }));
  });
}

/* The lens bar in the header. Rebuilt with the tree so the two cannot disagree
   about which lens is lit. */
function rebuildNav(lens) {
  if (!navEl) return;
  navEl.textContent = '';
  LENSES.forEach(function(pair) {
    const el = mk('button', 'app-nav-btn' + (lens === pair[0] ? ' active' : ''), pair[1]);
    el.type = 'button';
    if (lens === pair[0]) el.setAttribute('aria-current', 'page');
    el.addEventListener('click', function(e) { go(pair[0], e); });
    navEl.appendChild(el);
  });
}

/* Overview has no subtree, so the tree would be an empty column beside it.
   Every other lens has one and needs it open. The panel follows the lens
   rather than a preference, because the preference would be wrong half the
   time — there is nothing to remember about a sidebar with nothing in it. */
function setCollapsed(collapsed) {
  const sidebar = document.getElementById('sidebar');
  const btn = document.getElementById('sidebar-toggle');
  if (!sidebar) return;
  sidebar.classList.toggle('collapsed', collapsed);
  if (btn) btn.textContent = collapsed ? '\u203A' : '\u2039';
}

export function rebuildSidebar() {
  treeEl.textContent = '';

  const hash = splitHash(getHash()).route;
  const lens = lensOf(hash);
  /* A document belongs to the lens it was opened from, and the hash does not
     carry that — so the bar keeps whatever was lit. */
  if (lens) rebuildNav(lens);

  const query = (searchEl && searchEl.value || '').trim().toLowerCase();
  if (query) { setCollapsed(false); renderSearchMatches(query); return; }

  const rows = subtree(lens || state.currentView, hash);
  rows.forEach(function(row) { treeEl.appendChild(row); });
  setCollapsed(hash === 'home' || hash === '');
}
