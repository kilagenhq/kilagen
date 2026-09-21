import { mk, mkClickable } from './dom.js';
import { safeUrl } from './security.js';
import { fwLabel } from './constants.js';
import { evidenceState, evidenceStateInfo, expiresOn } from './evidence.js';

/* One requirement, laid out as the record it is.
 *
 * A requirement carries five different kinds of fact — what it says, how it is
 * shown, what shows it, what it answers, and what stands against it — and all
 * three views that render one were stacking them as an undifferentiated column
 * of chips. The framework mappings ended up the largest thing on screen, which
 * is exactly backwards: they matter least while you are reading what the
 * requirement *says*.
 *
 * So the record has a shape. The text is the headline. Everything under it is
 * a labelled row against a fixed label column, which is the same key-and-value
 * idiom the right-hand panel already uses — a reader who has used one page of
 * this console can skip a whole category with their eye.
 *
 * Built here rather than in a view because the standard's Content tab and the
 * audit pack render the same record, and they had drifted into two layouts
 * that agreed about nothing.
 */

/* Clause references grouped under the framework that publishes them.
 *
 * Seven pills each repeating "ISO/IEC 27001:2022" is the framework's name said
 * seven times and the clause said once. The name belongs in the gutter, once,
 * with its clauses beside it. */
export function mkMappingRows(frameworks, onClause) {
  const keys = Object.keys(frameworks || {}).sort();
  if (!keys.length) return null;
  const wrap = mk('div', 'req-maps');
  keys.forEach(function(key) {
    const clauses = frameworks[key] || [];
    if (!clauses.length) return;
    const row = mk('div', 'req-map');
    row.appendChild(mk('span', 'req-map-fw', fwLabel(key)));
    const list = mk('span', 'req-map-clauses');
    clauses.forEach(function(clause) {
      const el = mk('span', 'req-clause', String(clause));
      if (onClause) {
        el.classList.add('clickable');
        mkClickable(el, function(e) { onClause(key, clause, e); });
      }
      list.appendChild(el);
    });
    row.appendChild(list);
    wrap.appendChild(row);
  });
  return wrap;
}

/* One artefact: what it is on the first line, and what is known about it on
   the second. The state is a word, not only a colour — this block is printed
   as well as displayed. */
export function mkEvidenceEntry(item, when) {
  const entry = mk('div', 'req-ev');
  const head = mk('div', 'req-ev-head');
  const href = safeUrl(item.url);
  if (href) {
    const link = mk('a', 'req-ev-name', item.name || item.url);
    link.href = href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.title = item.url;
    head.appendChild(link);
  } else {
    head.appendChild(mk('span', 'req-ev-name', item.name || ''));
  }
  const info = evidenceStateInfo(evidenceState(item, when));
  const state = mk('span', 'req-ev-state', info.label);
  state.style.color = info.color;
  head.appendChild(state);
  entry.appendChild(head);

  const facts = [];
  if (item.collected) facts.push('collected ' + item.collected);
  const expires = expiresOn(item);
  if (expires) facts.push('good until ' + expires);
  if (item.collector) facts.push('via ' + item.collector);
  if (facts.length) {
    const line = mk('div', 'req-ev-facts');
    facts.forEach(function(text) { line.appendChild(mk('span', '', text)); });
    entry.appendChild(line);
  }
  return entry;
}

/**
 * A labelled row inside the record.
 *
 * @param {string} label What this row is. Written once, in the gutter.
 * @param {Node|string} value
 * @param {string} [cls] Extra class on the value cell.
 */
export function mkRecordRow(label, value, cls) {
  const row = mk('div', 'req-row');
  row.appendChild(mk('span', 'req-row-label', label));
  const cell = mk('div', 'req-row-value' + (cls ? ' ' + cls : ''));
  if (value instanceof Node) cell.appendChild(value);
  else cell.textContent = value == null ? '' : String(value);
  row.appendChild(cell);
  return row;
}

/**
 * The record's head: the reference in the gutter, the text as the headline.
 *
 * @param {string} ref The short reference, e.g. `1.2`.
 * @param {string} key The full key, `std-x#1.2`, which is what a gap cites —
 *   kept reachable by click rather than printed on every block.
 * @param {string} text What the requirement says.
 * @param {Array<Node>} [badges] What stands against it.
 */
export function mkRecordHead(ref, key, text, badges) {
  const head = mk('div', 'req-head');

  const marker = mk('button', 'req-ref');
  marker.type = 'button';
  marker.textContent = ref;
  marker.title = key + ' — click to copy';
  marker.setAttribute('aria-label', 'Copy ' + key);
  marker.addEventListener('click', function() {
    /* The full key is what somebody pastes into a gap's `requirement:`, and
       until now the only way to get it was to select it by hand. */
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(key).then(function() {
      marker.classList.add('copied');
      setTimeout(function() { marker.classList.remove('copied'); }, 1200);
    }).catch(function() { /* a denied clipboard is not worth a message here */ });
  });
  head.appendChild(marker);

  head.appendChild(mk('p', 'req-text', String(text || '').trim()));
  if (badges && badges.length) {
    const row = mk('div', 'req-badges');
    badges.forEach(function(badge) { row.appendChild(badge); });
    head.appendChild(row);
  }
  return head;
}

export function mkRecord() { return mk('div', 'req-record'); }

/* Where a clause reference goes when it is clicked: the framework, already
   narrowed to the standard that answers it. */
export function clauseRoute(framework, standardId) {
  return 'compliance/' + framework + '?standard=' + encodeURIComponent(standardId);
}

