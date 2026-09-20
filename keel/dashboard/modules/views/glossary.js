import { mk, mkEmpty } from '../dom.js';
import { state } from '../state.js';
import { go, setActiveView, mainEl, rightEl, showRightPanel } from '../nav.js';
import { renderMd, safeHtmlNode, parseFM } from '../parsers.js';
import { safeFetch, hookLinks } from '../security.js';

export function renderGlossary() {
  setActiveView('glossary');
  mainEl.textContent = ''; rightEl.textContent = ''; showRightPanel();
  mainEl.appendChild(mk('h1', '', 'Glossary'));

  const path = 'keel/glossary.md';
  const cached = state.bodyCache[path];
  (cached ? Promise.resolve(cached) : safeFetch(path).then(function(text) {
    const body = parseFM(text).body;
    state.bodyCache[path] = body;
    return body;
  })).then(function(body) {
    const node = safeHtmlNode(renderMd(body));
    hookLinks(node, go, path);
    const card = mk('div', 'doc-body');
    card.appendChild(node);
    mainEl.appendChild(card);
  }).catch(function(err) {
    mainEl.appendChild(mkEmpty('book', 'Glossary unavailable', err.message));
  });
}
