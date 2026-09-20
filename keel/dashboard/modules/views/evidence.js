import { mk, mkEmpty, mkIcon, th, makeSortable, mkStatStrip } from '../dom.js';
import { state } from '../state.js';
import { go, setActiveView, setBread, setParams, splitHash, getHash, mainEl, rightEl, showRightPanel } from '../nav.js';
import { chip } from '../doclink.js';
import { safeUrl } from '../security.js';
import { mountFilters } from '../filters.js';
import { renderComplianceTabs } from './compliance.js';
import {
  proofRows, evidenceSummary, collectorRows, evidenceStateInfo,
  EVIDENCE_STATES, DUE_SOON_DAYS,
} from '../evidence.js';

/* The proof, all of it, in one place.
 *
 * Evidence is the part of the model with the most machinery behind it and the
 * least of it visible: a `collected` date, a renewal period, a collector that
 * goes and refreshes the pointer, and a check that reports what has gone
 * stale. Until this page it surfaced as two lines under a requirement, which
 * meant the only way to ask "what can this program actually prove?" was to
 * open every standard in turn.
 *
 * It lives under Compliance rather than beside it, because the question is the
 * auditor's: coverage says a clause is addressed by a written requirement, and
 * this says whether that requirement can be shown to be true. The two halves
 * of the same interrogation.
 *
 * One table. A requirement with nothing attached is a row in it with the state
 * `unproven`, not a second list — so "what can we not prove" is a filter, and
 * nobody has to know a second page exists.
 */

/* Facets over evidence rows. They are passed whole rather than by key because
   these are not documents: the bar's own facets all read a frontmatter, and
   a row here is a requirement and an artefact together. */
const EVIDENCE_FACETS = [
  {
    key: 'standard',
    name: 'Standard',
    get: function(row) { return row.standard ? row.standard.id : ''; },
    label: function(id) {
      const fm = state.idToPath[id] ? state.fmCache[state.idToPath[id]] : null;
      return (fm && fm.title) ? fm.title : id;
    },
  },
  {
    key: 'status',
    name: 'Status',
    get: function(row) { return row.state; },
    label: function(key) { return evidenceStateInfo(key).label; },
  },
  {
    key: 'collector',
    name: 'Collector',
    get: function(row) { return (row.item && row.item.collector) || ''; },
  },
  {
    key: 'freshness',
    name: 'Renewed',
    get: function(row) { return (row.item && row.item.freshness) || ''; },
  },
  {
    key: 'domain',
    name: 'Domain',
    get: function(row) { return (row.standard && row.standard.domains) || []; },
  },
];

function matchesRow(row, query) {
  if (!query) return true;
  const item = row.item || {};
  return (row.key + ' ' + (row.req.text || '') + ' ' + (item.name || '')
    + ' ' + (row.req.how_demonstrated || '')).toLowerCase().indexOf(query) !== -1;
}

/* ===== The table, shared with a standard's own Evidence tab ===== */

/**
 * Draw the proof table.
 *
 * @param {HTMLElement} container Where it goes.
 * @param {Array<object>} rows From `proofRows`, filtered or not.
 * @param {object} [opts] `standardColumn` false on a page that is already one
 *   standard, where the column would repeat the title above it on every row.
 */
export function evidenceTable(container, rows, opts) {
  const o = opts || {};

  /* Declared rather than appended, so each column carries a class and the
     stylesheet can size it. Sizing by nth-child broke the moment the standard
     column became optional: the same rule then pointed at a different column
     on the two pages that draw this table. */
  const columns = [
    ['ev-standard', 'Standard', function(row) {
      const link = mk('span', 'id-link', row.standard.id || '');
      link.title = row.standard.title || '';
      link.addEventListener('click', function(e) { go('doc/' + row.standard.path, e); });
      return link;
    }],
    ['ev-req', 'Requirement', function(row) {
      const ref = mk('code', 'req-ref clickable', String(row.req.ref || ''));
      ref.title = String(row.req.text || '');
      ref.addEventListener('click', function(e) { go('doc/' + row.standard.path, e); });
      return ref;
    }],
    ['ev-how', 'How demonstrated', function(row) {
      const text = String(row.req.how_demonstrated || '').trim();
      if (!text) return '';
      /* Clamped to three lines in the stylesheet, so the whole sentence has to
         stay reachable somewhere. */
      const el = mk('span', 'evidence-how-text', text);
      el.title = text;
      return el;
    }],
    ['ev-artefact', 'Artefact', function(row) {
      if (!row.item) return mk('span', 'evidence-none', 'nothing attached');
      const href = safeUrl(row.item.url);
      if (!href) return row.item.name || '';
      const link = mk('a', 'source-link', row.item.name || row.item.url);
      link.href = href; link.target = '_blank'; link.rel = 'noopener noreferrer';
      link.title = row.item.url;
      return link;
    }],
    /* One column, not two. The centre column is under 800px with both panels
       open, and two date columns of eight characters each were the pair that
       pushed the table into a scrollbar on a 1440px screen. They are one fact
       anyway: when it was produced, and how long that lasts. */
    ['ev-dates', 'Collected \u2192 good until', function(row) {
      const collected = (row.item && row.item.collected) || '';
      if (!collected) return '';
      const wrap = mk('span', 'evidence-dates');
      wrap.appendChild(mk('span', 'evidence-dates-from', collected));
      if (row.expires) {
        wrap.appendChild(mk('span', 'evidence-dates-to', '\u2192 ' + row.expires));
      } else {
        wrap.appendChild(mk('span', 'evidence-dates-open', 'no expiry set'));
      }
      return wrap;
    }],
    ['ev-status', 'Status', function(row) {
      const info = evidenceStateInfo(row.state);
      return chip(info.label, info.color);
    }],
    ['ev-collector', 'Collector', function(row) {
      if (!row.item || !row.item.collector) return '';
      return chip(row.item.collector, null,
        'compliance/evidence?collector=' + encodeURIComponent(row.item.collector));
    }],
  ].filter(function(column) {
    /* On a standard's own page the column would repeat the title above it on
       every single row. */
    return column[0] !== 'ev-standard' || o.standardColumn !== false;
  });

  const table = mk('table', 'browse-table evidence-table');
  const head = mk('tr');
  columns.forEach(function(column) {
    const cell = th(column[1]);
    cell.classList.add(column[0]);
    head.appendChild(cell);
  });
  table.appendChild(head);

  rows.forEach(function(row) {
    const tr = mk('tr', row.state === 'unproven' ? 'evidence-row-unproven' : '');
    columns.forEach(function(column) {
      const cell = mk('td', column[0]);
      const value = column[2](row);
      if (value instanceof Node) cell.appendChild(value);
      else cell.textContent = value == null ? '' : String(value);
      tr.appendChild(cell);
    });
    table.appendChild(tr);
  });

  makeSortable(table);
  const scroller = mk('div', 'table-scroll');
  scroller.appendChild(table);
  container.appendChild(scroller);
  return table;
}

/* ===== The summary strip ===== */

function renderSummary(container, summary) {
  /* Each counter is the filter it describes. A number you cannot click is a
     number you have to go and reproduce by hand. */
  container.appendChild(mkStatStrip({
    value: summary.proven + ' / ' + summary.requirements,
    label: 'requirements with evidence attached',
    fill: summary.requirements ? summary.proven / summary.requirements : 0,
    counters: EVIDENCE_STATES.map(function(entry) {
      const key = entry[0];
      const info = evidenceStateInfo(key);
      return {
        value: summary.counts[key] || 0,
        label: info.label,
        color: info.color,
        onClick: function() {
          const next = splitHash(getHash()).params;
          next.status = key;
          setParams('compliance/evidence', next);
          renderEvidenceLens();
        },
      };
    }),
  }));
}

/* ===== Collectors ===== */

function renderCollectors(container) {
  const rows = collectorRows();
  container.appendChild(mk('h2', '', 'Collectors'));
  if (!rows.length) {
    container.appendChild(mkEmpty('runbook', 'No collectors',
      'A collector refreshes one piece of evidence: it fetches the artefact, '
      + 'puts it where the organisation keeps such things, and returns where it '
      + 'now lives and the day it was produced. Add collectors/<name>.py beside '
      + 'program/, then name it in an evidence entry.'));
    return;
  }

  container.appendChild(mk('p', 'section-note',
    'What can refresh the proof without anybody opening a console. A collector '
    + 'returns two facts — where the artefact now lives and the day it was '
    + 'produced — and those two facts are the only thing written back. The '
    + 'artefact never enters the repository.'));

  const grid = mk('div', 'collector-grid');
  rows.forEach(function(row) {
    const card = mk('div', 'collector-card');

    const head = mk('div', 'collector-head');
    const icon = mkIcon('runbook', 'collector-icon');
    head.appendChild(icon);
    head.appendChild(mk('span', 'collector-name', row.name));
    if (row.source) {
      const badge = mk('span', 'collector-source', row.source === 'program' ? 'this repository' : 'shipped');
      badge.title = row.source === 'program'
        ? 'collectors/' + row.name + '.py, beside program/ — it wins over a shipped one of the same name'
        : 'Shipped with the framework, overridable by a file of the same name in this repository';
      head.appendChild(badge);
    }
    if (row.template) {
      const badge = mk('span', 'collector-template', 'template');
      badge.title = 'The shape of a collector rather than one: it raises NotImplementedError until somebody writes it';
      head.appendChild(badge);
    }
    card.appendChild(head);

    if (row.summary) card.appendChild(mk('p', 'collector-summary', row.summary));
    if (row.path) card.appendChild(mk('code', 'collector-path', row.path));

    const uses = mk('div', 'collector-uses');
    if (!row.uses.length) {
      uses.appendChild(mk('span', 'collector-uses-none', 'Not named by any evidence entry'));
    } else {
      uses.appendChild(mk('span', 'collector-uses-label',
        'Refreshes ' + row.uses.length + (row.uses.length === 1 ? ' entry' : ' entries')));
      row.uses.forEach(function(use) {
        uses.appendChild(chip(use.key, 'var(--accent)', 'doc/' + use.standard.path));
      });
    }
    card.appendChild(uses);
    grid.appendChild(card);
  });
  container.appendChild(grid);

  container.appendChild(mk('p', 'section-note',
    'Run them with  kilagen update evidence  to see what would change, and '
    + 'kilagen update evidence --apply  to record the new pointers. Only entries '
    + 'that name a collector are run; evidence somebody attached by hand stays '
    + 'exactly as it is.'));
}

/* ===== The page ===== */

export function renderEvidenceLens() {
  setActiveView('compliance');
  mainEl.textContent = '';
  rightEl.textContent = '';
  showRightPanel();

  setBread([{ label: 'Compliance', action: function(e) { go('compliance', e); } },
            { label: 'Evidence' }]);

  mainEl.appendChild(mk('h1', '', 'Evidence'));
  renderComplianceTabs(mainEl, 'evidence');

  const rows = proofRows();
  if (!rows.length) {
    mainEl.appendChild(mkEmpty('standard', 'No requirements to prove',
      'Evidence hangs off a requirement, and a requirement lives inside a '
      + 'standard. Write one, and what proves it has somewhere to go.'));
    renderPanel(0);
    return;
  }

  renderSummary(mainEl, evidenceSummary());

  mountFilters(mainEl, rows, {
    route: 'compliance/evidence',
    facets: EVIDENCE_FACETS,
    match: matchesRow,
    noun: 'requirements and artefacts',
    render: function(filtered, el) { evidenceTable(el, filtered); },
  });

  renderCollectors(mainEl);
  renderPanel(rows.length);
}

function renderPanel(count) {
  rightEl.appendChild(mk('h3', '', 'What this is'));
  rightEl.appendChild(mk('p', 'section-note',
    'The repository holds the record, never the proof. An evidence entry is a '
    + 'name, a link to where the artefact actually lives, the day it was '
    + 'produced and how often it has to be renewed — and nothing else. A '
    + 'committed blob survives its own deletion, and evidence is the category '
    + 'most likely to carry personal data.'));

  rightEl.appendChild(mk('h3', '', 'When it goes off'));
  rightEl.appendChild(mk('p', 'section-note',
    'A quarterly access review proves something about its quarter and nothing '
    + 'about the next one. Past  collected + freshness  an artefact is stale; '
    + 'within ' + DUE_SOON_DAYS + ' days of that, it is due. Without a '
    + 'collected date nothing can say when it stopped being true.'));

  rightEl.appendChild(mk('h3', '', 'From the command line'));
  const commands = mk('div', 'evidence-commands');
  [['kilagen check evidence', 'reports what is missing or stale — informs, never fails'],
   ['kilagen update evidence', 'says what the collectors would change'],
   ['kilagen update evidence --apply', 'records the new pointers, then: git diff']]
    .forEach(function(pair) {
      const row = mk('div', 'evidence-command');
      row.appendChild(mk('code', '', pair[0]));
      row.appendChild(mk('span', 'right-note-sm', pair[1]));
      commands.appendChild(row);
    });
  rightEl.appendChild(commands);

  if (count) {
    rightEl.appendChild(mk('div', 'right-note-sm',
      count + ' row' + (count === 1 ? '' : 's') + ' across every standard in the program.'));
  }
}
