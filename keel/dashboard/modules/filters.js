import { mk, mkIcon, roleTitle } from './dom.js';
import { state, statusOf, docById, standardIdOf } from './state.js';
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
  /* A gap names the requirement it contests as `<standard-id>#<ref>`, so
     slicing gaps, exceptions and standards by the standard they belong to
     costs one derivation and no new field. It is the facet the auditor and
     the standard's owner both reach for first. */
  { key: 'standard', name: 'Standard', get: standardIdOf, label: docTitle },
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

/* An id resolves to the document's own title, and to the bare id when no
   document carries it — a filter must not hide a value it can still match. */
function docTitle(id) {
  const fm = docById(id);
  return (fm && fm.title) ? fm.title : id;
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

/* ===== The facet control =====
 *
 * A button that opens the values of one facet with their counts. It is
 * exported because the Compliance clause table needs exactly this control
 * over a set that is *not* documents — it filters clauses against the
 * framework's vocabulary — and a second popover that merely looked the same
 * would drift from this one inside a release.
 *
 * Every open picker registers here and one document listener closes them all.
 * That listener used to be added per mount, so every re-render left another
 * one behind holding the previous render's closure.
 */
const openPickers = [];

export function closeAllFacetPickers(except, refocus) {
  for (let i = openPickers.length - 1; i >= 0; i--) {
    if (openPickers[i] !== except) openPickers[i].close(refocus);
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('click', function() { closeAllFacetPickers(null, false); });
}

/**
 * Mount one facet button, and return a handle to it.
 *
 * @param {HTMLElement} container Where the button goes.
 * @param {object} opts
 *   - name: what the button says, and what the popover is labelled by.
 *   - entries: [{ value, label, count }], already ordered.
 *   - selected: the values currently chosen. Read, never written.
 *   - onToggle: function(value, checked) — the caller owns the selection.
 *   - onClear: function() — offered only when something is selected.
 */
export function mkFacetPicker(container, opts) {
  const selected = opts.selected || [];
  const wrap = mk('div', 'filter-facet');
  const btn = mk('button', 'filter-facet-btn' + (selected.length ? ' selected' : ''));
  btn.type = 'button';
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-label', 'Filter by ' + opts.name);
  btn.appendChild(mk('span', '', opts.name));
  btn.appendChild(mk('span', 'filter-facet-caret',
    selected.length ? String(selected.length) : '▾'));
  wrap.appendChild(btn);
  container.appendChild(wrap);

  let pop = null;

  const picker = {
    el: wrap,
    close: function(refocus) {
      const at = openPickers.indexOf(picker);
      if (at !== -1) openPickers.splice(at, 1);
      if (pop) { pop.remove(); pop = null; }
      btn.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
      if (refocus) btn.focus();
    },
    open: function() {
      closeAllFacetPickers();
      btn.classList.add('open');
      btn.setAttribute('aria-expanded', 'true');
      pop = mk('div', 'filter-popover');
      pop.setAttribute('role', 'group');
      pop.setAttribute('aria-label', 'Filter by ' + opts.name);
      /* Escape closes it and puts the focus back on the button that opened
         it, which is where a keyboard user expects to be. */
      pop.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') { e.stopPropagation(); picker.close(true); }
      });
      (opts.entries || []).forEach(function(entry) {
        const row = mk('label', 'filter-popover-row');
        const box = mk('input');
        box.type = 'checkbox';
        box.checked = selected.indexOf(entry.value) !== -1;
        box.addEventListener('change', function() { opts.onToggle(entry.value, box.checked); });
        row.appendChild(box);
        row.appendChild(mk('span', 'filter-popover-label',
          entry.label == null ? entry.value : entry.label));
        row.appendChild(mk('span', 'filter-popover-count', String(entry.count)));
        pop.appendChild(row);
      });
      if (selected.length && opts.onClear) {
        const clear = mk('button', 'filter-popover-clear', 'Clear ' + opts.name);
        clear.type = 'button';
        clear.addEventListener('click', function() { opts.onClear(); });
        pop.appendChild(clear);
      }
      pop.addEventListener('click', function(e) { e.stopPropagation(); });
      wrap.appendChild(pop);
      openPickers.push(picker);
    },
  };

  btn.addEventListener('click', function(e) {
    e.stopPropagation();
    if (btn.classList.contains('open')) picker.close();
    else picker.open();
  });
  btn.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && btn.classList.contains('open')) {
      e.stopPropagation();
      picker.close(true);
    }
  });

  return picker;
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
 *   - match: function(row, query) — how the search box matches a row. The
 *     default reads a document's id, title and description; rows that are not
 *     documents pass their own.
 */
export function mountFilters(container, docs, opts) {
  /* A facet is named by key when it is one of the document facets above, or
     passed whole when the rows are not documents at all — which is how the
     Evidence page filters artefacts through this same bar instead of growing
     a second one that would drift. */
  const facets = (opts.facets || FACETS.map(function(f) { return f.key; }))
    .map(function(k) { return typeof k === 'string' ? BY_KEY[k] : k; })
    .filter(Boolean);
  /* Which query-string keys this bar owns, and may therefore rewrite. Every
     document facet counts, offered here or not, so navigating between views
     does not carry a stale slice along; a caller's own facets are added. */
  const owned = Object.assign({}, BY_KEY);
  facets.forEach(function(f) { owned[f.key] = f; });
  const matches = opts.match || matchesQuery;
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
      if (!matches(fm, query)) return false;
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
      if (k !== 'q' && !owned[k]) next[k] = current[k];
    });
    if (query) next.q = query;
    facets.forEach(function(f) {
      if (selection[f.key].length) next[f.key] = selection[f.key].join(',');
    });
    setParams(route, next);
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
      const entries = Object.keys(tally).sort().map(function(v) {
        return { value: v, count: tally[v], label: facet.label ? facet.label(v) : v };
      });
      // Nothing to offer: do not draw an empty dropdown.
      if (!entries.length) return;

      mkFacetPicker(facetRow, {
        name: facet.name,
        entries: entries,
        selected: selection[facet.key],
        onToggle: function(value, checked) {
          const at = selection[facet.key].indexOf(value);
          if (checked && at === -1) selection[facet.key].push(value);
          else if (!checked && at !== -1) selection[facet.key].splice(at, 1);
          apply();
        },
        onClear: function() { selection[facet.key] = []; apply(); },
      });
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
    closeAllFacetPickers();
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

  apply();
  return { apply: apply, input: input };
}
