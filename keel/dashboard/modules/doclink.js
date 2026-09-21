import { mk, mkClickable } from './dom.js';
import { docById } from './state.js';
import { go } from './nav.js';

/* Ways to point at a document.
 *
 * Every lens draws these, and they used to be redefined in each one: the doc
 * panel had `idLink`, Compliance had `chip` and `docChip`, and the two
 * disagreed about what happens when an id resolves to nothing — one marked it
 * missing, the other rendered a pill that looked live and did nothing. There
 * is one answer to that, so there is one place for it.
 */

/* A bare id, in the panel's voice. An id nobody can resolve says so rather
   than pretending to be a link. */
export function idLink(id) {
  const fm = docById(id);
  const el = mk('span', 'id-link', id);
  if (fm) {
    el.title = fm.title || '';
    mkClickable(el, function(e) { go('doc/' + fm.path, e); });
  } else {
    el.classList.add('id-link-missing');
    el.title = 'No document with this id';
  }
  return el;
}

/* A pill, optionally one that goes somewhere. */
export function chip(text, color, route) {
  const el = mk('span', 'pill', text);
  if (color) { el.style.borderColor = color; el.style.color = color; }
  if (route) {
    el.classList.add('clickable');
    mkClickable(el, function(e) { e.stopPropagation(); go(route, e); });
  }
  return el;
}

/* A pill naming a document, which navigates when the document exists. */
export function docChip(id, color) {
  const fm = docById(id);
  const el = chip(id, color, fm ? 'doc/' + fm.path : null);
  if (fm && fm.title) el.title = fm.title;
  else if (!fm) { el.classList.add('id-link-missing'); el.title = 'No document with this id'; }
  return el;
}
