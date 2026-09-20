import { mk, mkIcon, roleTitle } from './dom.js';
import { state, statusOf } from './state.js';
import { splitHash, setParams, getHash } from './nav.js';
import { typeLabel } from './constants.js';

/* One search-and-filter bar, shared by every view that shows a list.
 *
 * The rules it implements, and why each one:
 *
 *   - Values inside a facet are OR, facets between themselves are AND. That is
 *     what people mean by "the IAM and AppSec gaps that are still open".
 *   - A facet with no values in the current set is not drawn, and a value that
 *     would return nothing is not offered. A filter you can pick that yields an
 *     empty table is a lie about the data.
 *   - Counts are computed against the set filtered by *every other* facet, so
 *     the number on a chip is the number of rows you will get by clicking it.
 *   - The state lives in the URL, so a filtered view is a link.
 *
 * It owns its own redraw: changing a filter rewrites the query string with
 * replaceState and re-renders the results in place, rather than re-routing —
 * otherwise every keystroke would tear the view down and steal focus.
 */

/* Every facet the dashboard knows how to offer, in the order they appear.
   `get` returns a scalar or an array; anything absent simply means the facet
   does not apply to that document. `label` resolves an id to a human name at
   render time, so nothing here caches a vocabulary. */
export const FACETS = [
  { key: 'type', name: 'Type', get: function(fm) { return fm.type; }, label: typeLabel },
  { key: 'status', name: 'Status', get: statusOf },
  { key: 'owner', name: 'Owner', get: function(fm) { return fm.owner; }, label: roleTitle },
  { key: 'domain', name: 'Domain', get: function(fm) { return fm.domains; }, label: modelName('domains') },
  { key: 'capability', name: 'Capability', get: function(fm) { return fm.capabilities; }, label: modelName('capabilities') },
  { key: 'system', name: 'System', get: function(fm) { return fm.systems; }, label: modelName('systems') },
  { key: 'severity', name: 'Severity', get: function(fm) { return fm.severity; } },
  { key: 'source', name: 'Source', get: function(fm) { return fm.source; } },
  { key: 'tier', name: 'Tier', get: function(fm) { return fm.tier; } },
  { key: 'criticality', name: 'Criticality', get: function(fm) { return fm.criticality; } },
  { key: 'classification', name: 'Classification', get: function(fm) { return fm.classification; } },
  { key: 'treatment', name: 'Treatment', get: function(fm) { return fm.treatment; } },
  { key: 'cause', name: 'Root cause', get: function(fm) { return fm.root_causes; } },
  { key: 'state', name: 'State', get: derivedState },
];

const BY_KEY = {};
FACETS.forEach(function(f) { BY_KEY[f.key] = f; });

/* The lifecycle a write-once fact puts a document in. It is derived, never
   stored — the same rule the validators and the views use, so filtering by
   "open" cannot disagree with the badge in the row. */
function derivedState(fm) {
  if (fm.type === 'gap') {
    if (fm.remediated) return 'remediated';
    if (fm.excepted_by) return 'excepted';
    return 'open';
  }
  if (fm.type === 'exception') {
    if (fm.revoked) return 'revoked';
    if (!fm.expires) return '';
    return String(fm.expires) >= new Date().toISOString().slice(0, 10) ? 'live' : 'expired';
  }
  return '';
}

function modelName(collection) {
  return function(id) {
    const list = (state.model && state.model[collection]) || [];
    for (let i = 0; i < list.length; i++) if (list[i].id === id) return list[i].name || id;
    return id;
  };
}

function valuesOf(facet, fm) {
  const raw = facet.get(fm);
  if (raw == null || raw === '') return [];
  if (Array.isArray(raw)) return raw.filter(function(v) { return typeof v === 'string' && v; });
  return typeof raw === 'string' ? [raw] : [String(raw)];
}

function matchesQuery(fm, query) {
  if (!query) return true;
  return ((fm.id || '') + ' ' + (fm.title || '') + ' ' + (fm.description || ''))
    .toLowerCase().indexOf(query) !== -1;
}

function matchesFacet(fm, facet, selected) {
  if (!selected.length) return true;
  const values = valuesOf(facet, fm);
  for (let i = 0; i < selected.length; i++) if (values.indexOf(selected[i]) !== -1) return true;
  return false;
}

/* Read the selection out of the query string. A facet is a comma-separated
   list; an unknown key or value simply selects nothing, which is the right
   behaviour for a URL somebody edited by hand or was sent. */
function readSelection(params, facets) {
  const selection = {};
  facets.forEach(function(f) {
    const raw = params[f.key];
    selection[f.key] = raw ? raw.split(',').filter(Boolean) : [];
  });
  return selection;
}

/* The search box currently on screen, so the `/` shortcut lands on the filter
   the user is looking at rather than the sidebar's tree search. */
let activeInput = null;
export function focusFilterSearch() {
  if (!activeInput || !activeInput.isConnected) { activeInput = null; return false; }
  activeInput.focus();
  activeInput.select();
  return true;
}

/**
 * Mount the bar and render the results, then keep both in sync.
 *
 * @param {HTMLElement} container Where the bar and the results go.
 * @param {Array<object>} docs The unfiltered set.
 * @param {object} opts
 *   - route: the hash route the query string belongs to (`browse/gap`).
 *   - facets: facet keys to offer, in order. Absent ones are skipped anyway.
 *   - render: function(filteredDocs, resultsEl) — draws the results.
 *   - noun: what is being counted, default 'documents'.
 */
export function mountFilters(container, docs, opts) {
  const facets = (opts.facets || FACETS.map(function(f) { return f.key; }))
    .map(function(k) { return BY_KEY[k]; })
    .filter(Boolean);
  const noun = opts.noun || 'documents';
  const route = opts.route;

  const params = splitHash(getHash()).params;
  const selection = readSelection(params, facets);
  let query = (params.q || '').toLowerCase();

  const bar = mk('div', 'filter-bar');
  const searchWrap = mk('div', 'filter-search');
  searchWrap.appendChild(mkIcon('search', 'filter-search-icon'));
  const input = mk('input', 'filter-search-input');
  input.type = 'text';
  input.placeholder = 'Search ' + noun + '… (/)';
  input.value = params.q || '';
  input.setAttribute('aria-label', 'Search ' + noun);
  searchWrap.appendChild(input);
  bar.appendChild(searchWrap);
  const facetRow = mk('div', 'filter-facets');
  bar.appendChild(facetRow);
  container.appendChild(bar);

  const tokenRow = mk('div', 'filter-tokens');
  container.appendChild(tokenRow);
  const countEl = mk('div', 'filter-count');
  container.appendChild(countEl);
  const resultsEl = mk('div', 'filter-results');
  container.appendChild(resultsEl);

  activeInput = input;

  /* The set matching everything except one facet — the denominator for that
     facet's counts, and what makes them truthful. */
  function setExcluding(skipKey) {
    return docs.filter(function(fm) {
      if (!matchesQuery(fm, query)) return false;
      for (let i = 0; i < facets.length; i++) {
        const f = facets[i];
        if (f.key === skipKey) continue;
        if (!matchesFacet(fm, f, selection[f.key])) return false;
      }
      return true;
    });
  }

  function currentSet() { return setExcluding(null); }

  function syncUrl() {
    /* Parameters the view owns — a view mode, say — are not the bar's to
       drop, so whatever it does not recognise is carried through. */
    const next = {};
    const current = splitHash(getHash()).params;
    Object.keys(current).forEach(function(k) {
      if (k !== 'q' && !BY_KEY[k]) next[k] = current[k];
    });
    if (query) next.q = query;
    facets.forEach(function(f) {
      if (selection[f.key].length) next[f.key] = selection[f.key].join(',');
    });
    setParams(route, next);
  }

  function closePopovers(refocus) {
    facetRow.querySelectorAll('.filter-popover').forEach(function(el) { el.remove(); });
    facetRow.querySelectorAll('.filter-facet-btn.open').forEach(function(el) {
      el.classList.remove('open');
      el.setAttribute('aria-expanded', 'false');
      if (refocus) el.focus();
    });
  }

  function openPopover(btn, facet, counts) {
    closePopovers();
    btn.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');
    const pop = mk('div', 'filter-popover');
    pop.setAttribute('role', 'group');
    pop.setAttribute('aria-label', 'Filter by ' + facet.name);
    /* Escape closes it and puts the focus back on the button that opened it,
       which is where a keyboard user expects to be. */
    pop.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') { e.stopPropagation(); closePopovers(true); }
    });
    counts.forEach(function(entry) {
      const row = mk('label', 'filter-popover-row');
      const box = mk('input');
      box.type = 'checkbox';
      box.checked = selection[facet.key].indexOf(entry.value) !== -1;
      box.addEventListener('change', function() {
        const at = selection[facet.key].indexOf(entry.value);
        if (box.checked && at === -1) selection[facet.key].push(entry.value);
        else if (!box.checked && at !== -1) selection[facet.key].splice(at, 1);
        apply();
      });
      row.appendChild(box);
      row.appendChild(mk('span', 'filter-popover-label', facet.label ? facet.label(entry.value) : entry.value));
      row.appendChild(mk('span', 'filter-popover-count', String(entry.count)));
      pop.appendChild(row);
    });
    if (selection[facet.key].length) {
      const clear = mk('button', 'filter-popover-clear', 'Clear ' + facet.name);
      clear.addEventListener('click', function() { selection[facet.key] = []; apply(); });
      pop.appendChild(clear);
    }
    pop.addEventListener('click', function(e) { e.stopPropagation(); });
    btn.parentNode.appendChild(pop);
  }

  function drawFacets() {
    facetRow.textContent = '';
    facets.forEach(function(facet) {
      /* Counts come from the set filtered by every *other* facet, so the
         number on a value is the number of rows clicking it produces. */
      const base = setExcluding(facet.key);
      const tally = {};
      base.forEach(function(fm) {
        valuesOf(facet, fm).forEach(function(v) { tally[v] = (tally[v] || 0) + 1; });
      });
      const counts = Object.keys(tally).sort().map(function(v) { return { value: v, count: tally[v] }; });
      // Nothing to offer: do not draw an empty dropdown.
      if (!counts.length) return;

      const wrap = mk('div', 'filter-facet');
      const chosen = selection[facet.key];
      const btn = mk('button', 'filter-facet-btn' + (chosen.length ? ' selected' : ''));
      btn.setAttribute('aria-expanded', 'false');
      btn.setAttribute('aria-label', 'Filter by ' + facet.name);
      btn.appendChild(mk('span', '', facet.name));
      btn.appendChild(mk('span', 'filter-facet-caret', chosen.length ? String(chosen.length) : '▾'));
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        if (btn.classList.contains('open')) { closePopovers(); return; }
        openPopover(btn, facet, counts);
      });
      btn.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && btn.classList.contains('open')) {
          e.stopPropagation();
          closePopovers(true);
        }
      });
      wrap.appendChild(btn);
      facetRow.appendChild(wrap);
    });
  }

  function drawTokens() {
    tokenRow.textContent = '';
    let active = 0;
    facets.forEach(function(facet) {
      selection[facet.key].forEach(function(value) {
        active++;
        const token = mk('span', 'filter-token');
        token.appendChild(mk('span', 'filter-token-key', facet.name));
        token.appendChild(mk('span', 'filter-token-value', facet.label ? facet.label(value) : value));
        const x = mk('button', 'filter-token-x', '×');
        x.title = 'Remove this filter';
        x.addEventListener('click', function() {
          selection[facet.key] = selection[facet.key].filter(function(v) { return v !== value; });
          apply();
        });
        token.appendChild(x);
        tokenRow.appendChild(token);
      });
    });
    if (query) {
      active++;
      const token = mk('span', 'filter-token');
      token.appendChild(mk('span', 'filter-token-key', 'Search'));
      token.appendChild(mk('span', 'filter-token-value', query));
      const x = mk('button', 'filter-token-x', '×');
      x.title = 'Clear the search';
      x.addEventListener('click', function() { query = ''; input.value = ''; apply(); });
      token.appendChild(x);
      tokenRow.appendChild(token);
    }
    if (active > 1) {
      const clear = mk('button', 'filter-clear-all', 'Clear all');
      clear.addEventListener('click', function() {
        facets.forEach(function(f) { selection[f.key] = []; });
        query = ''; input.value = '';
        apply();
      });
      tokenRow.appendChild(clear);
    }
    return active;
  }

  function apply() {
    closePopovers();
    const filtered = currentSet();
    const active = drawTokens();
    drawFacets();
    countEl.textContent = active
      ? filtered.length + ' of ' + docs.length + ' ' + noun
      : docs.length + ' ' + noun;
    resultsEl.textContent = '';
    if (!filtered.length) {
      const empty = mk('div', 'empty-state');
      empty.appendChild(mkIcon('search', 'empty-state-icon'));
      empty.appendChild(mk('div', 'empty-state-title',
        docs.length ? 'No ' + noun + ' match these filters' : 'No ' + noun + ' yet'));
      if (docs.length) {
        const btn = mk('button', 'filter-clear-all', 'Clear the filters');
        btn.addEventListener('click', function() {
          facets.forEach(function(f) { selection[f.key] = []; });
          query = ''; input.value = '';
          apply();
        });
        empty.appendChild(btn);
      }
      resultsEl.appendChild(empty);
    } else {
      opts.render(filtered, resultsEl);
    }
    syncUrl();
  }

  let debounce = null;
  input.addEventListener('input', function() {
    clearTimeout(debounce);
    debounce = setTimeout(function() { query = input.value.trim().toLowerCase(); apply(); }, 150);
  });
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') { e.stopPropagation(); input.value = ''; query = ''; apply(); input.blur(); }
    if (e.key === 'Enter') { clearTimeout(debounce); query = input.value.trim().toLowerCase(); apply(); }
  });
  document.addEventListener('click', closePopovers);

  apply();
  return { apply: apply, input: input };
}
