import { mk, mkEmpty } from '../dom.js';
import { state } from '../state.js';
import { go, setActiveView, mainEl, hideRightPanel } from '../nav.js';

function highlightText(text, query) {
  const el = document.createElement('span');
  const lower = text.toLowerCase();
  const idx = lower.indexOf(query);
  if (idx === -1) { el.textContent = text; return el; }
  el.appendChild(document.createTextNode(text.substring(0, idx)));
  const mark = document.createElement('mark');
  mark.textContent = text.substring(idx, idx + query.length);
  el.appendChild(mark);
  el.appendChild(document.createTextNode(text.substring(idx + query.length)));
  return el;
}

export function renderSearchResults(q) {
  setActiveView(''); mainEl.textContent = ''; hideRightPanel();
  mainEl.appendChild(mk('h1', '', 'Search: "' + q + '"'));
  /* The body counts only when it has already been fetched: this searches what
     the session has loaded, and never goes and gets the rest. */
  const results = [];
  Object.keys(state.fmCache).forEach(function(p) {
    const fm = state.fmCache[p];
    const body = state.bodyCache[p] || '';
    const haystack = (p + ' ' + (fm.id || '') + ' ' + (fm.title || '') + ' '
      + (fm.description || '') + ' ' + body).toLowerCase();
    if (haystack.indexOf(q) === -1) return;
    results.push({ path: p, fm: fm, bodyMatch: body.toLowerCase().indexOf(q) !== -1 });
  });
  if (!results.length) { mainEl.appendChild(mkEmpty('search', 'No results found', 'Try a different search term or check spelling.')); return; }
  mainEl.appendChild(mk('p', '', results.length + ' results'));
  results.forEach(function(r) {
    const item = mk('div', 'search-result');
    const titleEl = mk('div', 'sr-title');
    titleEl.appendChild(highlightText(r.fm.title || r.fm.id || r.path, q));
    item.appendChild(titleEl);
    const pathEl = mk('div', 'sr-path');
    pathEl.appendChild(highlightText(r.path, q));
    item.appendChild(pathEl);
    if (r.bodyMatch && state.bodyCache[r.path]) {
      const body = state.bodyCache[r.path];
      const idx = body.toLowerCase().indexOf(q);
      const start = Math.max(0, idx - 60);
      const end = Math.min(body.length, idx + q.length + 60);
      const snippet = (start > 0 ? '...' : '') + body.substring(start, end).replace(/\n/g, ' ') + (end < body.length ? '...' : '');
      const descEl = mk('div', 'sr-desc sr-body-match');
      descEl.appendChild(highlightText(snippet, q));
      item.appendChild(descEl);
    } else if (r.fm.description) {
      const descEl = mk('div', 'sr-desc');
      descEl.appendChild(highlightText(String(r.fm.description).trim().substring(0, 150), q));
      item.appendChild(descEl);
    }
    item.addEventListener('click', function(e) { go('doc/' + r.path, e); });
    mainEl.appendChild(item);
  });
}
