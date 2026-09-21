import { mk, appendAttribution } from '../dom.js';
import { state } from '../state.js';
import { go, setActiveView, setBread, mainEl, rightEl, showRightPanel } from '../nav.js';

/* Reference is documentation about **Kilagen**, and nothing else.
 *
 * It used to hold a page called About that described the organisation — its
 * legal name, its regulator, its headcount — which is the one thing Reference
 * is not: that is the instance, and it belongs to the instance's own landing
 * page. What is left here is the framework: how it works, what the contract
 * is, and why it is the way it is.
 *
 * The four groups are the four questions somebody actually arrives with, in
 * the order they arrive with them.
 */

const GROUPS = [
  {
    label: 'How it works',
    note: 'The model, and what the pieces are for.',
    items: [
      ['Framework design', 'doc/keel/design.md', 'Types, facets and the rules that hold them together.'],
      ['Compliance model', 'doc/keel/compliance.md', 'Clause to requirement to gap: the one computed number, and what it is not.'],
      ['Instantiation', 'doc/keel/instantiation.md', 'What `kilagen init` writes, and what stays yours afterwards.'],
    ],
  },
  {
    label: 'The contract',
    note: 'What a document may say, and what the words mean.',
    items: [
      ['Schemas', 'schemas', 'Every field of every type, and which ones are required.'],
      ['Templates', 'templates', 'The starting point for each type, as it ships.'],
      ['Glossary', 'glossary', 'The vocabulary, defined once.'],
    ],
  },
  {
    label: 'Why it is this way',
    note: 'The decisions behind the model, and what each one cost.',
    items: [],
  },
  {
    label: 'Ecosystem',
    note: 'What exists outside the repository.',
    items: [
      ['Tools', 'tools', 'The inventory of what a capability can be built with.'],
    ],
  },
];

/* The three pointers, written down once. Somebody who knows the model still
   has to guess which of them a link belongs in, so the rule lives here. */
const POINTERS = [
  ['source_of_truth', 'The original', 'This document is a record; the real one lives there and wins.'],
  ['evidence', 'The proof', 'This document is the original; what is outside is the material that demonstrates a requirement.'],
  ['tracker', 'The work', 'The ticket owns the lifecycle. Nothing here mirrors its state.'],
];

function card(container, label, route, note) {
  const el = mk('div', 'ref-card clickable');
  const head = mk('div', 'ref-card-head');
  head.appendChild(mk('span', 'ref-card-name', label));
  el.appendChild(head);
  if (note) el.appendChild(mk('div', 'ref-card-note', note));
  el.addEventListener('click', function(e) { go(route, e); });
  container.appendChild(el);
}

export function renderReference() {
  setActiveView('reference');
  mainEl.textContent = '';
  rightEl.textContent = '';
  showRightPanel();
  setBread([{ label: 'Reference' }]);

  mainEl.appendChild(mk('h1', '', 'Reference'));
  mainEl.appendChild(mk('p', 'section-note',
    'How Kilagen works. Everything here is about the framework, not about this program — '
    + 'what belongs to the program is in the five lenses.'));

  GROUPS.forEach(function(group) {
    const items = group.items.slice();
    /* The framework's decisions about itself are content, not a fixed list, so
       they are read from the build rather than typed here. */
    if (group.label === 'Why it is this way') {
      (state.frameworkAdrs || []).forEach(function(entry) {
        items.push([entry.title, 'doc/' + entry.path, entry.description || '']);
      });
    }
    if (!items.length) return;

    mainEl.appendChild(mk('h2', '', group.label));
    if (group.note) mainEl.appendChild(mk('p', 'section-note', group.note));
    const grid = mk('div', 'ref-grid');
    items.forEach(function(item) { card(grid, item[0], item[1], item[2]); });
    mainEl.appendChild(grid);
  });

  mainEl.appendChild(mk('h2', '', 'The three pointers'));
  mainEl.appendChild(mk('p', 'section-note',
    'Three fields link out of the repository, and the one you want is decided by a single question: '
    + 'what is it that lives outside?'));
  const table = mk('table', 'browse-table');
  POINTERS.forEach(function(row) {
    const tr = mk('tr');
    tr.appendChild(mk('td', 'ref-pointer-field', row[0]));
    tr.appendChild(mk('td', 'ref-pointer-what', row[1]));
    tr.appendChild(mk('td', '', row[2]));
    table.appendChild(tr);
  });
  mainEl.appendChild(table);

  /* Keyboard help lives in the modal, which is one keystroke away and does not
     need a copy here — but somebody arriving through the Help button has no
     way of knowing that. */
  rightEl.appendChild(mk('h2', '', 'Keyboard'));
  const kbd = mk('div', 'right-note-sm');
  kbd.appendChild(document.createTextNode('Press '));
  kbd.appendChild(mk('span', 'kbd', '?'));
  kbd.appendChild(document.createTextNode(' anywhere for the shortcuts.'));
  rightEl.appendChild(kbd);

  appendAttribution(rightEl);
  rightEl.appendChild(mk('div', 'right-note-sm',
    'This site redistributes the framework’s schemas and reference documents, '
    + 'which is what the licence asks to be said.'));
}
