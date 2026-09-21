import { mk, mkEmpty } from '../dom.js';
import { state } from '../state.js';
import { setActiveView, setBread, mainEl, rightEl, showRightPanel } from '../nav.js';
import { safeUrl } from '../security.js';

/* What exists in a capability's space — not what this organisation runs.
 *
 * Reference material, vendored from its own repository. The line it must not
 * cross is the one every other view respects: this says nothing about your
 * estate, and nothing about which tool is better. The notice is not decoration;
 * it is the contract, and it stays visible.
 */

const NOTICE = 'Not exhaustive, and not a recommendation. What a tool does changes '
  + 'faster than any list — verify with the vendor. Nothing here says what this '
  + 'organisation runs.';

function domainOf(capabilityId) {
  return String(capabilityId).split('.')[0];
}

function capabilityName(id) {
  const found = (state.model.capabilities || []).find(function(c) { return c.id === id; });
  return found ? found.name : id;
}

function domainName(id) {
  const found = (state.model.domains || []).find(function(d) { return d.id === id; });
  return found ? found.name : id;
}

export function renderTools() {
  setActiveView('tools');
  mainEl.textContent = ''; rightEl.textContent = ''; showRightPanel();
  setBread([{ label: 'Reference' }, { label: 'Tools' }]);

  mainEl.appendChild(mk('h1', '', 'Tools'));
  mainEl.appendChild(mk('p', 'tools-notice', NOTICE));

  const inventory = state.tools || {};
  const capabilities = Object.keys(inventory).sort();
  if (!capabilities.length) {
    mainEl.appendChild(mkEmpty('capability', 'No inventory in this release',
      'The tool inventory ships with the package. A release that carries none '
      + 'shows none rather than fetching anything.'));
    return;
  }

  const byDomain = {};
  capabilities.forEach(function(id) {
    const domain = domainOf(id);
    (byDomain[domain] = byDomain[domain] || []).push(id);
  });

  Object.keys(byDomain).sort().forEach(function(domain) {
    mainEl.appendChild(mk('h2', '', domainName(domain)));
    byDomain[domain].forEach(function(capability) {
      const entry = inventory[capability];
      const block = mk('section', 'tools-capability');
      const head = mk('div', 'tools-capability-head');
      head.appendChild(mk('span', 'tools-capability-name', capabilityName(capability)));
      head.appendChild(mk('code', 'tools-capability-id', capability));
      if (entry.updated) head.appendChild(mk('span', 'tools-updated', 'reviewed ' + entry.updated));
      block.appendChild(head);

      const list = mk('div', 'tools-list');
      (entry.tools || []).forEach(function(tool) {
        const row = mk('div', 'tools-row');
        /* This inventory is maintained by pull request in another repository,
           partly by the vendors themselves. Its schema requires https, but the
           schema is asserted by the test suite rather than at build time, so
           the rendering guards it too. */
        const href = safeUrl(tool.url);
        if (href) {
          const link = mk('a', 'tools-name', tool.name);
          link.href = href;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          row.appendChild(link);
        } else {
          row.appendChild(mk('span', 'tools-name', tool.name));
        }
        row.appendChild(mk('span', 'tools-licence', tool.license || ''));
        row.appendChild(mk('span', 'tools-note', tool.note || ''));
        list.appendChild(row);
      });
      block.appendChild(list);
      mainEl.appendChild(block);
    });
  });

  rightEl.appendChild(mk('h2', '', 'Where this comes from'));
  rightEl.appendChild(mk('p', 'right-note',
    'Maintained in its own repository and snapshotted into each release, the '
    + 'way the dashboard’s libraries are. Upgrading the package is how a '
    + 'newer list arrives; nothing is fetched at build time.'));
}
