import { mk, mkEmpty, formatRoles, th, makeSortable } from '../dom.js';
import { safeUrl } from '../security.js';
import { state, isOpenGap } from '../state.js';
import { go, setActiveView, setParams, splitHash, getHash, mainEl, hideRightPanel } from '../nav.js';
import { mountFilters } from '../filters.js';
import { daysUntil } from '../constants.js';

/* The owner's lens: what is coming, and what has slipped.
 *
 * Two tabs, because they answer different questions with different clocks.
 * **Activities** is the year's recurring work — pentests, DR tests, audits —
 * which recurs on a calendar and belongs to no document. **Reviews** is what
 * expires: a document past its review date, an exception about to become an
 * unapproved deviation again, a gap nobody has closed.
 *
 * It informs. Nothing here is a failure — that distinction is the same one
 * `kilagen check` draws between an error and a deadline.
 */

/* How long a gap may stay open before it is stale. The instance may say so in
   config.yml; the default is the framework's. Read through a function so the
   dashboard and `kilagen check` cannot drift apart on what "stale" means. */
const DEFAULT_STALE_GAP_DAYS = 90;

function staleGapDays() {
  const value = (state.config || {}).stale_gap_days;
  return (typeof value === 'number' && value > 0) ? value : DEFAULT_STALE_GAP_DAYS;
}

/* How far apart the recurrences are. The schema keeps this set closed, which
   is what lets the next date be computed instead of typed. */
const FREQUENCY_MONTHS = {
  monthly: 1, quarterly: 3, 'semi-annually': 6, annually: 12,
  'every-2-years': 24, 'every-3-years': 36,
};

/* The horizon: how far ahead to look. `overdue` is the past only. */
const WINDOWS = [
  ['overdue', 'Overdue', -1],
  ['30', '30 days', 30],
  ['60', '60 days', 60],
  ['90', '90 days', 90],
  ['180', '6 months', 180],
];

/* last_completed + frequency, in calendar months. Returns '' when either
   half is missing — an activity nobody has done yet has no due date to
   compute, and saying so is better than inventing one. */
function nextDue(lastCompleted, frequency) {
  const months = FREQUENCY_MONTHS[frequency];
  if (!lastCompleted || !months) return '';
  const parts = String(lastCompleted).split('-');
  if (parts.length !== 3) return '';
  const d = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1 + months, Number(parts[2])));
  if (isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

export function dueCell(iso) {
  const days = daysUntil(iso);
  const el = mk('span', 'pill', iso || '');
  if (days === null) return el;
  if (days < 0) {
    el.style.borderColor = 'var(--sev-high)'; el.style.color = 'var(--sev-high)';
    el.textContent = iso + ' · ' + (-days) + 'd ago';
  } else if (days <= 30) {
    el.style.borderColor = 'var(--sev-medium)'; el.style.color = 'var(--sev-medium)';
    el.textContent = iso + ' · in ' + days + 'd';
  }
  return el;
}

/* What each kind of row is waiting on, as one date.
 *
 * A gap has no deadline of its own, so it gets the one the check already
 * applies: it is due attention staleGapDays() after it was found. Computed,
 * never typed — there is no field to plan in, because a plan nobody updates
 * becomes a lie. */
export function dueDate(fm) {
  if (fm.type === 'gap') {
    if (!fm.found) return '';
    const parts = String(fm.found).split('-');
    if (parts.length !== 3) return '';
    const d = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]) + staleGapDays()));
    return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
  }
  if (fm.type === 'exception') return fm.expires || '';
  return fm.next_review || '';
}

function inWindow(iso, horizon) {
  const days = daysUntil(iso);
  if (days === null) return false;
  if (horizon < 0) return days < 0;
  return days <= horizon;
}

/* The three things that expire, each with the rule that puts a document in it. */
export const KINDS = [
  {
    key: 'reviews',
    label: 'Document reviews',
    holds: function(fm) { return !!fm.next_review; },
  },
  {
    key: 'exceptions',
    label: 'Exceptions expiring',
    holds: function(fm) { return fm.type === 'exception' && !!fm.expires && !fm.revoked; },
  },
  {
    key: 'gaps',
    label: 'Open gaps',
    holds: function(fm) { return isOpenGap(fm) && !!fm.found; },
  },
];

function renderActivities(container) {
  if (!state.schedule.length) {
    container.appendChild(mkEmpty('schedule', 'No recurring activities',
      'program/schedule.yml holds the work that recurs on a calendar rather than '
      + 'against a document: pentests, DR tests, audits.'));
    return;
  }

  const table = mk('table', 'schedule-table');
  const head = mk('tr');
  ['Activity', 'Frequency', 'Owner', 'Last completed', 'Next due', 'Tracker']
    .forEach(function(h) { head.appendChild(th(h)); });
  table.appendChild(head);

  state.schedule.forEach(function(a) {
    const tr = mk('tr');
    tr.appendChild(mk('td', '', String(a.name || a.id)));
    tr.appendChild(mk('td', '', String(a.frequency || '')));
    tr.appendChild(mk('td', '', formatRoles(a.owner)));
    tr.appendChild(mk('td', '', String(a.last_completed || '—')));

    const due = mk('td');
    const when = nextDue(a.last_completed, a.frequency);
    if (when) due.appendChild(dueCell(when));
    else due.textContent = 'never done';
    tr.appendChild(due);

    /* A link out, never a mirror of the ticket's state. */
    const tracker = mk('td');
    if (safeUrl(a.tracker)) {
      const link = mk('a', 'source-link', 'open');
      link.href = a.tracker;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.title = a.tracker;
      tracker.appendChild(link);
    }
    tr.appendChild(tracker);
    table.appendChild(tr);
  });

  makeSortable(table);
  const scroller = mk('div', 'table-scroll');
  scroller.appendChild(table);
  container.appendChild(scroller);
}

function renderReviews(container) {
  const params = splitHash(getHash()).params;
  const chosen = WINDOWS.find(function(w) { return w[0] === params.window; }) || WINDOWS[3];

  const picker = mk('div', 'window-picker');
  WINDOWS.forEach(function(w) {
    const btn = mk('button', 'window-btn' + (w[0] === chosen[0] ? ' active' : ''), w[1]);
    btn.addEventListener('click', function() {
      if (w[0] === chosen[0]) return;
      const next = splitHash(getHash()).params;
      if (w[0] === '90') delete next.window; else next.window = w[0];
      setParams('schedule', next);
      renderSchedule();
    });
    picker.appendChild(btn);
  });
  container.appendChild(picker);

  /* One set, filtered once: a document may be due for review *and* be an
     exception about to expire, and it belongs in both counts. */
  const docs = Object.values(state.fmCache).filter(function(fm) {
    return KINDS.some(function(kind) { return kind.holds(fm) && inWindow(dueDate(fm), chosen[2]); });
  });

  if (!docs.length) {
    container.appendChild(mkEmpty('calendar', 'Nothing falls due in this window',
      'Widen the window, or take the quiet week.'));
    return;
  }

  mountFilters(container, docs, {
    route: 'schedule',
    facets: ['type', 'domain'],
    noun: 'documents',
    render: function(filtered, el) {
      KINDS.forEach(function(kind) {
        const rows = filtered
          .filter(function(fm) { return kind.holds(fm) && inWindow(dueDate(fm), chosen[2]); })
          .sort(function(a, b) { return dueDate(a).localeCompare(dueDate(b)); });
        if (!rows.length) return;

        const block = mk('div', 'review-group');
        const head = mk('div', 'review-group-head');
        head.appendChild(mk('span', 'review-group-label', kind.label));
        head.appendChild(mk('span', 'review-group-count', String(rows.length)));
        block.appendChild(head);

        rows.forEach(function(fm) {
          const row = mk('div', 'review-row');
          row.appendChild(mk('span', 'review-row-id', fm.id || ''));
          row.appendChild(mk('span', 'review-row-title', fm.title || ''));
          row.appendChild(mk('span', 'review-row-owner', formatRoles(fm.owner)));
          const when = mk('span', 'review-row-when');
          when.appendChild(dueCell(dueDate(fm)));
          row.appendChild(when);
          row.addEventListener('click', function(e) { go('doc/' + fm.path, e); });
          block.appendChild(row);
        });
        el.appendChild(block);
      });
    },
  });
}

export function renderSchedule() {
  setActiveView('schedule');
  mainEl.textContent = ''; hideRightPanel();

  const tab = splitHash(getHash()).params.tab === 'reviews' ? 'reviews' : 'activities';

  /* The two clocks are entries in the tree, so the page does not repeat them
     as tabs: one navigation, not two. */
  mainEl.appendChild(mk('h1', '', tab === 'reviews' ? 'Reviews' : 'Activities'));
  mainEl.appendChild(mk('p', 'section-note', tab === 'reviews'
    ? 'What expires: a document past its review date, an exception about to become an '
      + 'unapproved deviation again, a gap nobody has closed.'
    : 'The year\u2019s recurring work — pentests, DR tests, audits — which recurs on a '
      + 'calendar and belongs to no document.'));

  if (tab === 'reviews') renderReviews(mainEl);
  else renderActivities(mainEl);
}
