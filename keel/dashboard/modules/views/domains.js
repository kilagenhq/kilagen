import { mk, mkIcon, mkEmpty, th, makeSortable } from '../dom.js';
import { state, docsWithFacet, isOpenGap } from '../state.js';
import { go, setActiveView, setBread, mainEl, rightEl, showRightPanel, hideRightPanel } from '../nav.js';
import { typeColor, statusColor, domainIcon, domainColor } from '../constants.js';

/* Domains is the engineer's lens: "what do we have written about IAM?".
 *
 * It is navigation and a checklist, and deliberately not a scorecard. A
 * capability with no documents means nobody has written anything about it —
 * not that the capability is missing from the organization. What is actually
 * deployed is measured in the estate; this repository cannot know.
 *
 * It reads like Compliance on purpose: a row per domain, a bar, a ratio. The
 * bar is how much of the capability menu has been written about, which is a
 * count of documents and not a measure of anything deployed — the same shape
 * as a coverage bar, carrying the same warning.
 */

function capabilitiesOf(domainId) {
  return state.model.capabilities
    .filter(function(c) { return c.domain === domainId; })
    .sort(function(a, b) { return a.id.localeCompare(b.id); });
}

function statsOf(domain) {
  const docs = docsWithFacet('domains', domain.id);
  const caps = capabilitiesOf(domain.id);
  const written = caps.filter(function(c) { return docsWithFacet('capabilities', c.id).length; });
  return { docs: docs, caps: caps, written: written.length, gaps: docs.filter(isOpenGap).length };
}

function sortedDomains() {
  return state.model.domains.slice().sort(function(a, b) {
    return (a.order || 999) - (b.order || 999);
  });
}

function docRow(fm) {
  const row = mk('div', 'domain-doc');
  const icon = mkIcon(fm.type, 'doc-type-icon');
  icon.style.color = typeColor(fm.type);
  row.appendChild(icon);
  row.appendChild(mk('span', 'domain-doc-id', fm.id || ''));
  row.appendChild(mk('span', 'domain-doc-title', fm.title || ''));
  const status = mk('span', 'pill', fm.status || '');
  status.style.borderColor = statusColor(fm.status);
  status.style.color = statusColor(fm.status);
  row.appendChild(status);
  row.addEventListener('click', function(e) { go('doc/' + fm.path, e); });
  return row;
}

export function renderDomains() {
  setActiveView('domains');
  mainEl.textContent = '';
  hideRightPanel();

  mainEl.appendChild(mk('h1', '', 'Domains'));

  const domains = sortedDomains();
  if (!domains.length) {
    mainEl.appendChild(mkEmpty('domain', 'No domain vocabulary',
      'program/model/domains.yml is what the domains facet is validated against.'));
    return;
  }

  mainEl.appendChild(mk('p', 'section-note',
    'The ten areas a program is written about, and how much of each one has been. '
    + 'The bar counts capabilities somebody has written about, not the status.'));

  const bars = mk('div', 'fw-bars');
  domains.forEach(function(domain) {
    const stats = statsOf(domain);
    const row = mk('div', 'fw-bar-row domain-bar-row');
    row.setAttribute('tabindex', '0');
    row.setAttribute('role', 'button');
    row.title = domain.name + ' — ' + stats.written + ' of ' + stats.caps.length
      + ' capabilities written about';

    const name = mk('span', 'fw-bar-name domain-bar-name');
    const icon = mkIcon(domainIcon(domain.id), 'doc-type-icon');
    icon.style.color = domainColor(domain.id);
    name.appendChild(icon);
    name.appendChild(mk('span', '', domain.name));
    row.appendChild(name);

    const track = mk('span', 'fw-bar-track');
    const fill = mk('span', 'fw-bar-fill');
    fill.style.width = (stats.caps.length
      ? Math.round(stats.written / stats.caps.length * 100) : 0) + '%';
    fill.style.background = domainColor(domain.id);
    track.appendChild(fill);
    row.appendChild(track);

    row.appendChild(mk('span', 'fw-bar-ratio', stats.written + ' / ' + stats.caps.length));

    const counts = mk('span', 'domain-bar-counts');
    counts.appendChild(mk('span', 'domain-bar-docs',
      stats.docs.length + (stats.docs.length === 1 ? ' doc' : ' docs')));
    if (stats.gaps) {
      const gaps = mk('span', 'domain-bar-gaps', stats.gaps + ' open');
      counts.appendChild(gaps);
    }
    row.appendChild(counts);

    function open(e) { go('domain/' + domain.id, e); }
    row.addEventListener('click', open);
    row.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(e); }
    });
    bars.appendChild(row);
  });
  mainEl.appendChild(bars);
}

export function renderDomain(domainId) {
  setActiveView('domains');
  mainEl.textContent = '';
  rightEl.textContent = '';
  showRightPanel();

  const domain = state.model.domains.find(function(d) { return d.id === domainId; });
  if (!domain) { renderDomains(); return; }

  setBread([{ label: 'Domains', action: function(e) { go('domains', e); } }, { label: domain.name }]);

  const stats = statsOf(domain);

  const head = mk('div', 'domain-head');
  const icon = mkIcon(domainIcon(domain.id), 'domain-head-icon');
  icon.style.color = domainColor(domain.id);
  head.appendChild(icon);
  head.appendChild(mk('h1', '', domain.name));
  mainEl.appendChild(head);
  if (domain.description) mainEl.appendChild(mk('p', 'section-note', domain.description));

  /* Capabilities first: they are the menu, and the documents hang off them.
     One table, so a reader can see the whole shape of the domain at once
     rather than scrolling a stack of blocks. */
  if (stats.caps.length) {
    mainEl.appendChild(mk('h2', '', 'Capabilities'));
    mainEl.appendChild(mk('p', 'section-note',
      'What a program in this domain can build. Whether each one is deployed, and how '
      + 'well, is measured in the estate — not here.'));

    const table = mk('table', 'browse-table capability-table');
    const header = mk('tr');
    ['Capability', 'What it is', 'Written'].forEach(function(label) { header.appendChild(th(label)); });
    table.appendChild(header);

    stats.caps.forEach(function(cap) {
      const about = docsWithFacet('capabilities', cap.id);
      const row = mk('tr', about.length ? '' : 'capability-blank');

      const nameCell = mk('td');
      const capIcon = mkIcon('capability', 'doc-type-icon');
      capIcon.style.color = about.length ? domainColor(domain.id) : 'var(--fg3)';
      nameCell.appendChild(capIcon);
      nameCell.appendChild(mk('span', 'capability-name', cap.name));
      nameCell.appendChild(mk('div', 'capability-id', cap.id));
      row.appendChild(nameCell);

      const whatCell = mk('td', 'capability-desc');
      whatCell.appendChild(mk('div', '', cap.description || ''));
      if (cap.why) whatCell.appendChild(mk('div', 'capability-why', cap.why));
      row.appendChild(whatCell);

      const docsCell = mk('td', 'capability-docs');
      if (!about.length) {
        docsCell.appendChild(mk('span', 'capability-nothing', 'nothing written'));
      } else {
        about.forEach(function(fm) {
          const link = mk('span', 'capability-doc', fm.id);
          link.title = fm.title || '';
          link.addEventListener('click', function(e) { go('doc/' + fm.path, e); });
          docsCell.appendChild(link);
        });
      }
      row.appendChild(docsCell);
      table.appendChild(row);
    });
    makeSortable(table);
    const scroller = mk('div', 'table-scroll');
    scroller.appendChild(table);
    mainEl.appendChild(scroller);
  }

  /* And then everything tagged with the domain, whether or not a capability
     caught it. Last, because it is the long list and not the shape. */
  const docs = stats.docs.slice()
    .sort(function(a, b) { return (a.type + a.id).localeCompare(b.type + b.id); });
  mainEl.appendChild(mk('h2', '', 'Documents'));
  if (!docs.length) {
    mainEl.appendChild(mkEmpty('file', 'Nothing tagged with this domain yet',
      'Add "' + domainId + '" to a document’s domains: list.'));
  } else {
    docs.forEach(function(fm) { mainEl.appendChild(docRow(fm)); });
  }

  /* The panel is metadata about the thing you are looking at, and here that
     thing is the domain. */
  rightEl.appendChild(mk('h3', '', 'Domain'));
  rightEl.appendChild(mkMeta('Id', domain.id));
  rightEl.appendChild(mkMeta('Documents', String(stats.docs.length)));
  rightEl.appendChild(mkMeta('Capabilities', stats.written + ' / ' + stats.caps.length + ' written about'));
  const gapsRow = mkMeta('Open gaps', String(stats.gaps));
  if (stats.gaps) gapsRow.querySelector('.meta-val').style.color = 'var(--sev-high)';
  rightEl.appendChild(gapsRow);
  rightEl.appendChild(mk('div', 'right-note-sm',
    'Source: program/model/domains.yml and capabilities.yml — the closed lists the '
    + 'domains and capabilities facets are validated against.'));
}

function mkMeta(key, value) {
  const row = mk('div', 'meta-row');
  row.appendChild(mk('span', 'meta-key', key));
  row.appendChild(mk('span', 'meta-val', value));
  return row;
}
