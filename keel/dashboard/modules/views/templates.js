import { mk, mkIcon, mkEmpty } from '../dom.js';
import { state } from '../state.js';
import { go, setActiveView, mainEl, rightEl, showRightPanel } from '../nav.js';
import { safeFetch } from '../security.js';
import { typeLabel, typePlural, typeColor } from '../constants.js';

/* One template per type, read from the shipped files. The type registry is
   what drives the list, so a new type cannot ship without its template. */

export function renderTemplates() {
  setActiveView('templates');
  mainEl.textContent = ''; rightEl.textContent = ''; showRightPanel();
  mainEl.appendChild(mk('h1', '', 'Templates'));
  mainEl.appendChild(mk('p', 'section-note',
    'A starting point for every document type. Copy one into the folder of its '
    + 'type, keep the filename equal to the id, and replace every REPLACE ME.'));

  if (!state.types.length) {
    mainEl.appendChild(mkEmpty('file', 'No type registry', 'Run kilagen build.'));
    return;
  }

  state.types.forEach(function(t) {
    const block = mk('div', 'template-block');
    const head = mk('div', 'template-head');
    const icon = mkIcon(t.name, 'doc-type-icon');
    icon.style.color = typeColor(t.name);
    head.appendChild(icon);
    head.appendChild(mk('span', 'template-name', typeLabel(t.name)));
    head.appendChild(mk('code', 'template-path',
      'program/' + t.folder + '/' + (t.dated ? '<year>/' : '') + t.prefix + '-<slug>.md'));
    block.appendChild(head);

    const pre = mk('pre', 'template-body');
    pre.textContent = 'Loading…';
    block.appendChild(pre);
    safeFetch('keel/templates/' + t.name + '.md').then(function(text) {
      pre.textContent = text;
    }).catch(function() {
      pre.textContent = 'Template unavailable.';
    });
    mainEl.appendChild(block);
  });

  rightEl.appendChild(mk('h2', '', 'Types'));
  state.types.forEach(function(t) {
    const row = mk('div', 'right-item');
    row.appendChild(mk('div', 'right-item-title', typePlural(t.name)));
    row.appendChild(mk('div', 'right-item-note',
      t.prefix + '- · ' + (t.dated ? 'partitioned by year' : 'flat')
      + (t.immutable ? ' · immutable' : '')));
    row.addEventListener('click', function(e) { go('browse/' + t.name, e); });
    rightEl.appendChild(row);
  });
}
