import { mk, mkMetaRow } from '../dom.js';
import { state } from '../state.js';
import { setActiveView, setBread, mainEl, rightEl } from '../nav.js';

/**
 * Upstream attribution, required by Apache-2.0 section 4(d).
 *
 * This site is a redistribution: the build copies the framework's schemas,
 * lenses and reference documents into _site/keel/ and the instance publishes
 * it. Rendered into the right panel rather than the main column so it is
 * present on every About page without competing with the program's own
 * content — including the empty state, which is what a new instance shows.
 */
function appendAttribution() {
  rightEl.appendChild(mk('h3', '', 'Framework'));
  var link = mk('a', 'about-fw-link', 'Kilagen');
  link.href = 'https://kilagen.com';
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  var row = mk('div', 'meta-row');
  row.appendChild(link);
  row.appendChild(document.createTextNode(' · Apache-2.0'));
  rightEl.appendChild(row);
}

export function renderAbout() {
  setActiveView('about'); mainEl.textContent = ''; rightEl.textContent = '';
  setBread([{ label: 'Reference' }, { label: 'About' }]);

  mainEl.appendChild(mk('h1', '', 'About'));

  var org = state.config.organization;
  if (!org) {
    var empty = mk('div', 'empty-state');
    empty.appendChild(mk('h2', '', 'No organization data'));
    empty.appendChild(mk('p', '', 'Add an organization section to program/config.yml.'));
    mainEl.appendChild(empty);
    appendAttribution();
    return;
  }

  // Org card
  var card = mk('div', 'home-org-card');
  card.appendChild(mk('div', 'home-org-title', org.legal_name || state.config.name));

  var tags = [];
  if (Array.isArray(org.jurisdictions) && org.jurisdictions.length) tags.push(org.jurisdictions.map(function(j) { return j.charAt(0).toUpperCase() + j.slice(1); }).join(', '));
  if (org.regulator) tags.push(org.regulator + '-regulated');
  if (org.industry) tags.push(org.industry);
  if (org.headcount) tags.push('~' + org.headcount + ' people');
  if (tags.length) card.appendChild(mk('div', 'home-org-meta', tags.join(' \u00B7 ')));

  if (org.description) card.appendChild(mk('div', 'home-org-desc', org.description.trim()));

  var fws = state.config.frameworks;
  if (fws && fws.length) {
    var fwRow = mk('div', 'home-org-frameworks');
    fws.forEach(function(fw) {
      if (!fw || !fw.id || !fw.name) return;
      var badge = mk('span', 'home-org-fw-badge');
      if (fw.binding === 'mandatory') badge.classList.add('home-org-fw-mandatory');
      badge.textContent = fw.id.replace(/_/g, ' ').toUpperCase();
      badge.title = fw.name + (fw.binding ? ' (' + fw.binding + ')' : '');
      if (fw.url) {
        badge.style.cursor = 'pointer';
        badge.addEventListener('click', function() { window.open(fw.url, '_blank', 'noopener,noreferrer'); });
      }
      fwRow.appendChild(badge);
    });
    card.appendChild(fwRow);
  }
  mainEl.appendChild(card);

  // Frameworks detail table
  if (fws && fws.length) {
    mainEl.appendChild(mk('h2', '', 'Applicable Frameworks'));
    var table = document.createElement('table');
    table.className = 'about-fw-table';
    var thead = document.createElement('thead');
    var hrow = mk('tr', '');
    hrow.appendChild(mk('th', '', 'Framework'));
    hrow.appendChild(mk('th', '', 'Binding'));
    thead.appendChild(hrow);
    table.appendChild(thead);
    var tbody = document.createElement('tbody');
    fws.forEach(function(fw) {
      if (!fw || !fw.id || !fw.name) return;
      var row = mk('tr', '');
      var nameCell = mk('td', '');
      if (fw.url) {
        var link = mk('a', 'about-fw-link', fw.name);
        link.href = fw.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        nameCell.appendChild(link);
      } else {
        nameCell.textContent = fw.name;
      }
      row.appendChild(nameCell);
      var bindCell = mk('td', '');
      var bindBadge = mk('span', 'about-binding-badge about-binding-' + (fw.binding || 'unknown'), fw.binding || '');
      bindCell.appendChild(bindBadge);
      row.appendChild(bindCell);
      tbody.appendChild(row);
    });
    table.appendChild(tbody);
    mainEl.appendChild(table);
  }

  // Right panel
  rightEl.appendChild(mk('h3', '', 'Instance'));
  rightEl.appendChild(mkMetaRow('Program', state.config.name));
  if (state.config.repo) rightEl.appendChild(mkMetaRow('Repository', state.config.repo));
  if (org.license) rightEl.appendChild(mkMetaRow('License', org.license));
  if (org.remote_first) rightEl.appendChild(mkMetaRow('Remote-first', 'Yes'));
  rightEl.appendChild(mkMetaRow('Source', 'program/config.yml'));

  appendAttribution();
}
