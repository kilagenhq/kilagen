import { mk, makeCollapsible, dropRepeatedTitle } from './dom.js';
import { state } from './state.js';
import { renderMd, safeHtmlNode } from './parsers.js';
import { safeFetch, hookLinks } from './security.js';
import { go } from './nav.js';

/* The document's own words, fetched once.
 *
 * Three callers want this: a program document, the framework's own material,
 * and a standard's Content tab — and the tab can be left and come back to, so
 * without the cache every switch would refetch a file the browser already has.
 * `state.bodyCache` is that cache; it was written on every load and read by
 * nobody until the tabs arrived.
 */

export function stripFrontmatter(text) {
  return text.indexOf('---') === 0 ? text.substring(text.indexOf('---', 3) + 3) : text;
}

/**
 * Render a document body into its own card.
 *
 * @param {HTMLElement} container Where the card goes.
 * @param {string} path The site path of the document.
 * @param {string} [title] The title to drop from the body when it repeats it.
 * @returns {HTMLElement} The card, which fills in when the fetch resolves.
 */
export function renderDocBody(container, path, title) {
  const card = mk('div', 'doc-body');
  container.appendChild(card);

  function draw(text) {
    state.bodyCache[path] = text;
    const node = safeHtmlNode(renderMd(stripFrontmatter(text)));
    hookLinks(node, go, path);
    if (title) dropRepeatedTitle(node, title);
    card.appendChild(node);
    makeCollapsible(node, card);
  }

  if (typeof state.bodyCache[path] === 'string') {
    draw(state.bodyCache[path]);
    return card;
  }
  safeFetch(path).then(draw).catch(function(err) {
    card.appendChild(mk('p', 'right-empty', 'Body unavailable: ' + err.message));
  });
  return card;
}
