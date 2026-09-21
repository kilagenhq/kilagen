import { mkClickable, mk, mkEmpty, th, makeSortable, formatRoles, mkStatStrip } from '../dom.js';
import { state, derivedState, isOpenGap, isLiveException } from '../state.js';
import { go, setParams, splitHash, getHash } from '../nav.js';
import { chip, docChip } from '../doclink.js';
import { safeUrl } from '../security.js';
import { fwLabel } from '../constants.js';
import { renderConnections } from '../connections.js';
import { renderDocBody } from '../docbody.js';
import { requirementRowsOf, proofRows } from '../evidence.js';
import { mkRecord, mkRecordHead, mkRecordRow, mkEvidenceEntry, mkMappingRows,
         clauseRoute } from '../requirement.js';
import { evidenceTable } from './evidence.js';

/* A standard, five ways.
 *
 * A standard's substance is split across two places — the prose lives in the
 * markdown body, the requirements live in the frontmatter — and for a long
 * time the page showed them as two stacked blocks that did not know about each
 * other: a chaotic list of requirements and then, underneath and unrelated,
 * the standard's own words. They were merged into one tab to fix that, which
 * was right while neither half had a shape. Now that a requirement is a record
 * rather than a pile of chips it stands on its own, and the merged tab had
 * become the longest page in the console.
 *
 * So: Content is the document's own words. Requirements is the addressable
 * list. And three more are questions asked of that list, each a table that
 * exists nowhere else:
 *
 *   Mappings   requirement x framework, the matrix
 *   Gaps       everything ever filed against it, with its state
 *   Evidence   what can be proven, and what has gone stale
 *
 * The chosen tab lives in the query string, so a standard opened at its
 * mapping matrix is a link somebody can paste into a ticket. Switching redraws
 * the panel in place rather than re-routing; the body is fetched once and read
 * from `state.bodyCache` on the way back.
 */

const DEFAULT_TAB = 'content';
const TAB_KEYS = ['content', 'requirements', 'mappings', 'gaps', 'evidence'];

/* ===== What each tab counts ===== */

function requirementsOf(fm) { return (fm.requirements || []).filter(Boolean); }

/* The frameworks this standard actually carries, in a stable order. A column
   is drawn because a requirement maps to it, never because it is in scope:
   an empty column would say "this standard ignores PCI", which is a claim
   about the standard that nobody made. */
function frameworksOf(fm) {
  const seen = {};
  requirementsOf(fm).forEach(function(req) {
    Object.keys((req.frameworks) || {}).forEach(function(key) { seen[key] = true; });
  });
  return Object.keys(seen).sort();
}

function clauseCount(fm) {
  let total = 0;
  requirementsOf(fm).forEach(function(req) {
    Object.keys((req.frameworks) || {}).forEach(function(key) {
      total += ((req.frameworks[key]) || []).length;
    });
  });
  return total;
}

/* Everything ever filed against this standard's requirements — not only what
   is still open. `state.requirements` holds the live view and the badge uses
   it; the table wants the history too, because "we had this gap and closed it
   in March" is the answer to half the questions an auditor asks. */
function contested(fm) {
  const mine = {};
  requirementsOf(fm).forEach(function(req) { mine[fm.id + '#' + req.ref] = true; });
  return Object.keys(state.fmCache)
    .map(function(path) { return state.fmCache[path]; })
    .filter(function(doc) {
      return doc && (doc.type === 'gap' || doc.type === 'exception') && mine[doc.requirement];
    })
    .sort(function(a, b) {
      return String(a.requirement || '').localeCompare(String(b.requirement || ''), undefined, { numeric: true })
        || String(a.id || '').localeCompare(String(b.id || ''));
    });
}

function standing(fm) {
  return contested(fm).filter(function(doc) {
    return isOpenGap(doc) || isLiveException(doc);
  }).length;
}

function evidenceCounts(fm) {
  const rows = requirementRowsOf(fm.id);
  return { total: rows.length, proven: rows.filter(function(r) { return r.evidence.length; }).length };
}

/* ===== Requirements ===== */

function renderContent(container, fm, path) {
  renderDocBody(container, path, fm.title);
  /* Connections belongs to the document, so it lives with the document's own
     words rather than under every tab. At panel width the ids are unreadable,
     which is why it is here and not in the right-hand panel. */
  renderConnections(container, fm);
}

function renderRequirements(container, fm) {
  const rows = requirementRowsOf(fm.id);
  if (!rows.length) {
    container.appendChild(mkEmpty('standard', 'This standard states no requirements',
      'A requirement is what a framework clause maps to and what a gap is filed '
      + 'against, so a standard without them cannot be measured or contested.'));
    return;
  }

  /* The tab is called Requirements; this note is what distinguishes these from
     the body's own `## Requirements`, which the shipped template reserves for
     context a requirement cannot carry. */
  container.appendChild(mk('p', 'section-note',
    'Each one is addressable on its own: a framework clause maps to it, and a gap '
    + 'or an exception is filed against it by id.'));

  rows.forEach(function(row) {
    const req = row.req;
    const live = state.requirements[row.key] || { gaps: [], exceptions: [] };
    const record = mkRecord();

    const badges = (live.gaps || []).map(function(id) { return gapChip(id, 'gap'); })
      .concat((live.exceptions || []).map(function(id) { return gapChip(id, 'exception'); }));
    record.appendChild(mkRecordHead(String(req.ref || ''), row.key, req.text, badges));

    /* Two different things an auditor asks for separately: how you show it,
       and then show me. They used to share the name `evidence` and the audit
       page listed them together, half of them clickable. */
    if (req.how_demonstrated) {
      record.appendChild(mkRecordRow('Demonstrated by',
        String(req.how_demonstrated).trim(), 'req-row-prose'));
    }

    if (row.evidence.length) {
      const list = mk('div', 'req-ev-list');
      row.evidence.forEach(function(found) { list.appendChild(mkEvidenceEntry(found.item)); });
      record.appendChild(mkRecordRow('Evidence', list));
    } else {
      record.appendChild(mkRecordRow('Evidence',
        mk('span', 'req-ev-none', 'Nothing attached yet'), 'req-row-prose'));
    }

    const maps = mkMappingRows(req.frameworks, function(framework, clause, e) {
      go(clauseRoute(framework, fm.id), e);
    });
    if (maps) record.appendChild(mkRecordRow('Answers', maps));

    container.appendChild(record);
  });
}

/* A gap or an exception beside the requirement it contests, coloured by which
   of the two it is. */
function gapChip(id, kind) {
  const color = kind === 'gap' ? 'var(--sev-high)' : 'var(--sev-medium)';
  const el = docChip(id, color);
  el.textContent = kind + ': ' + id;
  return el;
}

/* ===== Mappings ===== */

function renderMappings(container, fm) {
  const frameworks = frameworksOf(fm);
  const rows = requirementsOf(fm);

  if (!frameworks.length) {
    container.appendChild(mkEmpty('standard', 'This standard maps to no framework',
      'A requirement carries its own `frameworks:` block. Until one does, this '
      + 'standard moves no clause of anybody’s coverage.'));
    return;
  }

  container.appendChild(mk('p', 'section-note',
    'Which clause of which framework each requirement answers. A cell says the '
    + 'clause is addressed by a written requirement — never that it is met. '
    + 'Clicking one opens that framework already filtered to this standard.'));

  const table = mk('table', 'browse-table mapping-table');
  const head = mk('tr');
  head.appendChild(th('Requirement'));
  frameworks.forEach(function(key) { head.appendChild(th(fwLabel(key))); });
  table.appendChild(head);

  rows.forEach(function(req) {
    const tr = mk('tr');
    const first = mk('td', 'mapping-req');
    first.appendChild(mk('code', 'req-ref', String(req.ref || '')));
    first.appendChild(mk('span', 'mapping-req-text', String(req.text || '').trim()));
    tr.appendChild(first);

    frameworks.forEach(function(key) {
      const cell = mk('td', 'mapping-cell');
      const clauses = ((req.frameworks) || {})[key] || [];
      if (!clauses.length) {
        /* An em dash, not an empty cell: the reader has to be able to tell
           "nothing maps here" from "the table stopped". */
        cell.appendChild(mk('span', 'mapping-none', '—'));
      } else {
        clauses.forEach(function(clause) {
          cell.appendChild(chip(String(clause), 'var(--accent)',
            'compliance/' + key + '?standard=' + encodeURIComponent(fm.id)));
        });
      }
      tr.appendChild(cell);
    });
    table.appendChild(tr);
  });

  const scroller = mk('div', 'table-scroll');
  scroller.appendChild(table);
  container.appendChild(scroller);

  const total = clauseCount(fm);
  container.appendChild(mk('p', 'section-note',
    total + ' clause reference' + (total === 1 ? '' : 's') + ' across '
    + frameworks.length + ' framework' + (frameworks.length === 1 ? '' : 's') + '.'));
}

/* ===== Gaps and exceptions ===== */

function renderGaps(container, fm) {
  const rows = contested(fm);
  if (!rows.length) {
    container.appendChild(mkEmpty('gap', 'Nothing is filed against this standard',
      'A gap says the program falls short of a requirement; an exception says '
      + 'somebody authorised the deviation. Neither exists here — which means '
      + 'nobody has written one, not that the standard is met.'));
    return;
  }

  container.appendChild(mk('p', 'section-note',
    'Everything ever filed against a requirement of this standard, closed ones '
    + 'included. State is computed from write-once facts — a gap is open until '
    + 'something closes it, an exception live until it expires or is revoked.'));

  const table = mk('table', 'browse-table');
  const head = mk('tr');
  ['Id', 'Kind', 'Requirement', 'Title', 'State', 'Owner', 'Tracker']
    .forEach(function(label) { head.appendChild(th(label)); });
  table.appendChild(head);

  rows.forEach(function(doc) {
    const tr = mk('tr');
    tr.appendChild(mk('td', '', doc.id || ''));

    const kind = mk('td');
    kind.appendChild(chip(doc.type,
      doc.type === 'gap' ? 'var(--sev-high)' : 'var(--sev-medium)'));
    tr.appendChild(kind);

    const ref = mk('td');
    ref.appendChild(mk('code', 'req-ref', String(doc.requirement || '').split('#')[1] || ''));
    tr.appendChild(ref);

    tr.appendChild(mk('td', '', doc.title || ''));

    const stateCell = mk('td');
    const derived = derivedState(doc);
    if (derived) stateCell.appendChild(chip(derived.label, derived.color));
    tr.appendChild(stateCell);

    tr.appendChild(mk('td', '', formatRoles(doc.owner)));

    const tracker = mk('td');
    const href = safeUrl(doc.tracker);
    if (href) {
      const link = mk('a', 'source-link', 'open');
      link.href = href; link.target = '_blank'; link.rel = 'noopener noreferrer';
      link.title = doc.tracker;
      link.addEventListener('click', function(e) { e.stopPropagation(); });
      tracker.appendChild(link);
    }
    tr.appendChild(tracker);

    tr.addEventListener('click', function(e) { go('doc/' + doc.path, e); });
    // The keyboard route into the row: a <tr> cannot be a link.
    const handle = tr.querySelector('.id-link, .browse-id');
    if (!handle && tr.firstChild) mkClickable(tr.firstChild, function(e) { e.stopPropagation(); go('doc/' + doc.path, e); });
    table.appendChild(tr);
  });

  makeSortable(table);
  const scroller = mk('div', 'table-scroll');
  scroller.appendChild(table);
  container.appendChild(scroller);

  const out = mk('button', 'action-link', 'See these in the Gaps lens ↗');
  out.type = 'button';
  out.addEventListener('click', function(e) {
    go('program/gap?standard=' + encodeURIComponent(fm.id), e);
  });
  container.appendChild(out);
}

/* ===== Evidence ===== */

function renderEvidence(container, fm) {
  const rows = proofRows().filter(function(row) {
    return row.standard && row.standard.id === fm.id;
  });
  if (!rows.length) {
    container.appendChild(mkEmpty('standard', 'No requirements to prove',
      'Evidence hangs off a requirement. This standard states none yet.'));
    return;
  }

  const counts = evidenceCounts(fm);
  const strip = mkStatStrip({
    value: counts.proven + ' / ' + counts.total,
    label: 'requirements with evidence attached',
    fill: counts.total ? counts.proven / counts.total : 0,
  });
  strip.classList.add('stat-strip-compact');
  container.appendChild(strip);

  container.appendChild(mk('p', 'section-note',
    'The artefact itself never lives in the repository \u2014 what is here is the '
    + 'pointer and the day it was produced. A requirement with nothing attached '
    + 'is not a broken contract; it is one nobody has been asked to prove yet.'));

  /* The same table the Evidence page draws, minus the column that would
     repeat this standard's own name on every row. One table, so the two
     cannot come to disagree about what "stale" looks like. */
  evidenceTable(container, rows, { standardColumn: false });

  const out = mk('button', 'action-link', 'See the whole programme\u2019s evidence \u2197');
  out.type = 'button';
  out.addEventListener('click', function(e) {
    go('compliance/evidence?standard=' + encodeURIComponent(fm.id), e);
  });
  container.appendChild(out);
}

const RENDERERS = {
  content: renderContent,
  requirements: renderRequirements,
  mappings: renderMappings,
  gaps: renderGaps,
  evidence: renderEvidence,
};

/* The badge on each tab: the number that says whether the tab is worth
   opening. `gaps` counts only what still stands, because that is what the
   word means — the table behind it shows the closed ones too. */
function badgeOf(key, fm) {
  /* The prose has no number worth putting on a tab, and a badge invented so
     that every tab has one is a badge nobody can read. */
  if (key === 'content') return null;
  if (key === 'requirements') return { text: String(requirementsOf(fm).length) };
  if (key === 'mappings') return { text: String(clauseCount(fm)) };
  if (key === 'gaps') {
    const open = standing(fm);
    return { text: String(open), color: open ? 'var(--sev-high)' : null };
  }
  const counts = evidenceCounts(fm);
  return {
    text: counts.proven + '/' + counts.total,
    color: counts.proven < counts.total ? 'var(--sev-medium)' : null,
  };
}

function label(key) { return key.charAt(0).toUpperCase() + key.slice(1); }

/**
 * Draw the tab bar and its panel for a standard.
 *
 * @param {HTMLElement} container Where they go, in the document's main column.
 * @param {object} fm The standard's frontmatter.
 * @param {string} path Its site path, which is the route the tab hangs off.
 */
export function renderStandardTabs(container, fm, path) {
  const params = splitHash(getHash()).params;
  let current = TAB_KEYS.indexOf(params.tab) !== -1 ? params.tab : DEFAULT_TAB;

  const bar = mk('div', 'doc-tabs');
  bar.setAttribute('role', 'tablist');
  bar.setAttribute('aria-label', 'Views of this standard');
  const panel = mk('div', 'doc-tabpanel');
  panel.setAttribute('role', 'tabpanel');
  panel.id = 'std-tabpanel';

  const buttons = {};
  TAB_KEYS.forEach(function(key) {
    const btn = mk('button', 'doc-tab');
    btn.type = 'button';
    btn.id = 'std-tab-' + key;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-controls', 'std-tabpanel');
    btn.appendChild(mk('span', 'doc-tab-label', label(key)));
    const badge = badgeOf(key, fm);
    if (badge) {
      const count = mk('span', 'doc-tab-count', badge.text);
      if (badge.color) count.style.color = badge.color;
      btn.appendChild(count);
    }
    btn.addEventListener('click', function() { select(key); });
    buttons[key] = btn;
    bar.appendChild(btn);
  });

  function select(key) {
    current = key;
    TAB_KEYS.forEach(function(other) {
      const on = other === key;
      buttons[other].classList.toggle('active', on);
      buttons[other].setAttribute('aria-selected', on ? 'true' : 'false');
      /* Only the selected tab is in the tab order: a tablist is one stop, and
         the arrow keys move within it. */
      buttons[other].tabIndex = on ? 0 : -1;
    });
    panel.setAttribute('aria-labelledby', 'std-tab-' + key);
    panel.textContent = '';
    /* The view owns other parameters — a filter somebody arrived with — so
       only `tab` is written, and the default is written as its absence. */
    const next = splitHash(getHash()).params;
    if (key === DEFAULT_TAB) delete next.tab; else next.tab = key;
    setParams('doc/' + path, next);
    RENDERERS[key](panel, fm, path);
  }

  /* Left and right move between tabs, which is what a tablist promises. */
  bar.addEventListener('keydown', function(e) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    e.stopPropagation();
    const at = TAB_KEYS.indexOf(current);
    const next = TAB_KEYS[(at + (e.key === 'ArrowRight' ? 1 : TAB_KEYS.length - 1)) % TAB_KEYS.length];
    select(next);
    buttons[next].focus();
  });

  container.appendChild(bar);
  container.appendChild(panel);
  select(current);
}
