import { mk, mkIcon, mkEmpty, th, makeSortable, mkMetaRow, onActivate,
         mkStatStrip, mkSegmentMeter } from '../dom.js';
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
 * The meter is one mark per capability rather than a bar, and that is the
 * whole design of this lens. What is being counted is a small discrete set —
 * three to ten — and each one is written about or it is not, so a continuous
 * fill claims a precision the data does not have. It also fixes the row that
 * used to look broken: a domain nobody has written about drew an empty track,
 * which reads as a failure of the page rather than as a fact about the
 * program. Three empty marks read as a fact.
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

/* "6 of 7 capabilities written about", said once, so the lens and the domain
   page cannot word it differently. */
function capabilityLabel(stats) {
  return stats.written + ' of ' + stats.caps.length + ' capabilit'
    + (stats.caps.length === 1 ? 'y' : 'ies') + ' written about';
}

function countLabel(n, one, many) {
  return n + ' ' + (n === 1 ? one : many);
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

  const all = domains.map(statsOf);
  const written = all.reduce(function(n, s) { return n + s.written; }, 0);
  const capabilities = all.reduce(function(n, s) { return n + s.caps.length; }, 0);
  const openGaps = all.reduce(function(n, s) { return n + s.gaps; }, 0);
  /* Documents are counted once even when they carry two domains, which is why
     this is a set and not a sum of the rows. */
  const documents = {};
  all.forEach(function(s) { s.docs.forEach(function(fm) { documents[fm.path] = true; }); });

  mainEl.appendChild(mkStatStrip({
    value: written + ' / ' + capabilities,
    label: 'capabilities written about',
    fill: capabilities ? written / capabilities : 0,
    counters: [
      { value: Object.keys(documents).length, label: 'documents' },
      { value: openGaps, label: openGaps === 1 ? 'open gap' : 'open gaps', color: 'var(--sev-high)' },
      { value: domains.length, label: 'domains' },
    ],
  }));

  mainEl.appendChild(mk('p', 'section-note',
    'The areas a program is written about, and how much of each one has been. A '
    + 'filled mark is a capability somebody has written about — not one that is '
    + 'deployed, and not one that is deployed well. That is measured in the estate.'));

  const rows = mk('div', 'domain-rows');
  domains.forEach(function(domain) {
    const stats = statsOf(domain);
    const color = domainColor(domain.id);
    const row = mk('div', 'domain-row');
    row.setAttribute('tabindex', '0');
    row.setAttribute('role', 'button');
    row.title = domain.name + ' — ' + capabilityLabel(stats);

    const name = mk('span', 'domain-row-name');
    const icon = mkIcon(domainIcon(domain.id), 'doc-type-icon');
    icon.style.color = color;
    name.appendChild(icon);
    name.appendChild(mk('span', '', domain.name));
    row.appendChild(name);

    row.appendChild(mkSegmentMeter(stats.written, stats.caps.length, color,
      capabilityLabel(stats)));
    row.appendChild(mk('span', 'domain-row-ratio',
      stats.written + ' / ' + stats.caps.length));

    /* A domain nobody has touched says so in words rather than printing three
       zeroes: the reader should be able to tell "nothing here yet" from "some
       of this is done". */
    const counts = mk('span', 'domain-row-counts');
    if (!stats.docs.length) {
      counts.appendChild(mk('span', 'domain-row-empty', 'not written about yet'));
    } else {
      counts.appendChild(mk('span', '', countLabel(stats.docs.length, 'document', 'documents')));
      if (stats.gaps) {
        counts.appendChild(mk('span', 'domain-row-gaps',
          countLabel(stats.gaps, 'open gap', 'open gaps')));
      }
    }
    row.appendChild(counts);

    function open(e) { go('domain/' + domain.id, e); }
    row.addEventListener('click', open);
    onActivate(row, open);
    rows.appendChild(row);
  });
  mainEl.appendChild(rows);
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
  const color = domainColor(domain.id);

  const head = mk('div', 'domain-head');
  const icon = mkIcon(domainIcon(domain.id), 'domain-head-icon');
  icon.style.color = color;
  head.appendChild(icon);
  head.appendChild(mk('h1', '', domain.name));
  mainEl.appendChild(head);
  if (domain.description) mainEl.appendChild(mk('p', 'domain-description', domain.description));

  /* The same meter the lens drew, and below it the rows it counts: a reader
     who clicked a domain because five of its eight marks were empty should
     land on the five. */
  const summary = mk('div', 'domain-summary');
  summary.appendChild(mkSegmentMeter(stats.written, stats.caps.length, color,
    capabilityLabel(stats)));
  const facts = mk('span', 'domain-summary-facts');
  facts.appendChild(mk('span', '', capabilityLabel(stats)));
  facts.appendChild(mk('span', '', countLabel(stats.docs.length, 'document', 'documents')));
  if (stats.gaps) {
    facts.appendChild(mk('span', 'domain-row-gaps',
      countLabel(stats.gaps, 'open gap', 'open gaps')));
  } else {
    facts.appendChild(mk('span', '', 'no open gaps'));
  }
  summary.appendChild(facts);
  mainEl.appendChild(summary);

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
      capIcon.style.color = about.length ? color : 'var(--fg3)';
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
        /* An invitation, not a defect report — and the description beside it
           stays at full contrast, because this is the row where knowing what
           the capability *is* matters most. */
        docsCell.appendChild(mk('span', 'capability-nothing', 'not written about yet'));
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
  rightEl.appendChild(mk('h2', '', 'Domain'));
  rightEl.appendChild(mkMetaRow('Id', domain.id));
  rightEl.appendChild(mkMetaRow('Documents', String(stats.docs.length)));
  rightEl.appendChild(mkMetaRow('Capabilities', stats.written + ' / ' + stats.caps.length + ' written about'));
  const gapsRow = mkMetaRow('Open gaps', String(stats.gaps));
  if (stats.gaps) gapsRow.querySelector('.meta-val').style.color = 'var(--sev-high)';
  rightEl.appendChild(gapsRow);
  rightEl.appendChild(mk('div', 'right-note-sm',
    'Source: program/model/domains.yml and capabilities.yml — the closed lists the '
    + 'domains and capabilities facets are validated against.'));
}
