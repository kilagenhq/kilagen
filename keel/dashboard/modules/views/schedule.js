import { mk, mkMetaRow, mkIcon } from '../dom.js';
import { state } from '../state.js';
import { go, setActiveView, setBread, mainEl, rightEl } from '../nav.js';
import { DOMAINS } from '../constants.js';

var FREQ_LABELS = { 'annually': 'Annual', 'every-2-years': 'Biennial', 'semi-annually': 'Semi-annual', 'quarterly': 'Quarterly' };
var FREQ_MONTHS = { 'annually': 12, 'every-2-years': 24, 'semi-annually': 6, 'quarterly': 3 };
var QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'];
var Q_MONTHS = ['Jan\u2013Mar', 'Apr\u2013Jun', 'Jul\u2013Sep', 'Oct\u2013Dec'];

function parseDate(val) {
  if (!val) return null;
  var m = String(val).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
  return null;
}

function dateToQuarter(d) {
  if (!d) return null;
  return { year: d.getFullYear(), q: Math.ceil((d.getMonth() + 1) / 3) };
}

function formatDate(d) {
  if (!d) return '';
  var mm = String(d.getMonth() + 1).padStart(2, '0');
  var dd = String(d.getDate()).padStart(2, '0');
  return d.getFullYear() + '-' + mm + '-' + dd;
}

function computeNextPlanned(activity) {
  var lastDate = parseDate(activity.last_completed);
  if (!lastDate) return null;
  var months = FREQ_MONTHS[activity.frequency];
  if (!months) {
    if (typeof console !== 'undefined') console.warn('[schedule] Unrecognized frequency "' + activity.frequency + '" for "' + activity.name + '". Valid: ' + Object.keys(FREQ_MONTHS).join(', '));
    return null;
  }
  var next = new Date(lastDate.getFullYear(), lastDate.getMonth() + months, 1);
  var lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(lastDate.getDate(), lastDay));
  return next;
}

function getStatus(activity) {
  var now = new Date();
  var next = computeNextPlanned(activity);
  if (!next) {
    if (typeof console !== 'undefined') {
      if (!activity.last_completed) console.warn('[schedule] No last_completed for "' + activity.name + '" — cannot compute next date. Add last_completed to schedule.yml.');
      else console.warn('[schedule] Cannot compute next_planned for "' + activity.name + '": last_completed=' + activity.last_completed + ', frequency=' + activity.frequency);
    }
    return 'unknown';
  }
  var currentQ = dateToQuarter(now);
  var nextQ = dateToQuarter(next);
  if (next < now) return 'overdue';
  if (nextQ.year === currentQ.year && nextQ.q === currentQ.q) return 'due-now';
  return 'planned';
}

function findDomain(dir) {
  return DOMAINS.find(function(dd) { return dd.dir === dir || dd.dir.replace(/^\d+-/, '') === dir; });
}

function domainLabel(dir) {
  var d = findDomain(dir);
  return d ? d.label : dir;
}

function domainIconType(dir) {
  var d = findDomain(dir);
  return d ? d.iconType : 'dom-grc';
}

export function renderSchedule() {
  setActiveView('schedule'); mainEl.textContent = ''; rightEl.textContent = '';
  setBread([{ label: 'Schedule' }]);

  var activities = (state.schedule || []).filter(function(a) {
    if (!a || typeof a !== 'object' || !a.name) {
      if (typeof console !== 'undefined') console.warn('[schedule] Skipping malformed activity entry:', a);
      return false;
    }
    return true;
  });
  if (!activities.length) {
    var empty = mk('div', 'empty-state');
    empty.appendChild(mk('h2', '', 'No scheduled activities'));
    empty.appendChild(mk('p', '', 'Add activities to program/schedule.yml to see them here.'));
    mainEl.appendChild(empty);
    return;
  }

  var now = new Date();
  var displayYear = now.getFullYear();
  var currentQ = Math.ceil((now.getMonth() + 1) / 3);

  mainEl.appendChild(mk('h1', 'sched-title', 'Activity Schedule'));

  // ── Compute status once per activity ──
  var statusMap = {};
  activities.forEach(function(a) { statusMap[a.id] = getStatus(a); });

  // ── Status cards ──
  var cardsRow = mk('div', 'sched-cards');
  function countByStatus(s) { return activities.filter(function(a) { return statusMap[a.id] === s; }).length; }
  var unknownCount = countByStatus('unknown');
  var cardData = [
    { label: 'Overdue', count: countByStatus('overdue'), cls: 'sched-card-overdue' },
    { label: 'Due now', count: countByStatus('due-now'), cls: 'sched-card-due' },
    { label: 'Planned', count: countByStatus('planned'), cls: 'sched-card-planned' },
    { label: 'Total', count: activities.length, cls: 'sched-card-total' }
  ];
  if (unknownCount) cardData.splice(3, 0, { label: 'No date', count: unknownCount, cls: 'sched-card-unknown' });
  cardData.forEach(function(cd) {
    var card = mk('div', 'sched-card ' + cd.cls);
    card.appendChild(mk('div', 'sched-card-count', String(cd.count)));
    card.appendChild(mk('div', 'sched-card-label', cd.label));
    cardsRow.appendChild(card);
  });
  mainEl.appendChild(cardsRow);

  // ── Controls: domain filter ──
  var controls = mk('div', 'sched-controls');
  var activeDomains = {};
  var domChips = mk('div', 'sched-dom-chips');
  var seenDomains = {};
  activities.forEach(function(a) { if (a.domain) seenDomains[a.domain] = true; });
  Object.keys(seenDomains).sort().forEach(function(d) {
    var btn = mk('button', 'sched-dom-chip', domainLabel(d));
    btn.addEventListener('click', function() {
      if (activeDomains[d]) { delete activeDomains[d]; btn.classList.remove('active'); }
      else { activeDomains[d] = true; btn.classList.add('active'); }
      renderGrid();
    });
    domChips.appendChild(btn);
  });
  controls.appendChild(domChips);
  mainEl.appendChild(controls);

  // ── Grid ──
  var gridContainer = mk('div', 'sched-grid-wrap');
  mainEl.appendChild(gridContainer);

  function renderGrid() {
    gridContainer.textContent = '';
    var hasDomFilter = Object.keys(activeDomains).length > 0;
    var filtered = activities.filter(function(a) {
      return !hasDomFilter || activeDomains[a.domain];
    });

    var table = document.createElement('table');
    table.className = 'sched-table';

    // Header
    var thead = document.createElement('thead');
    var headerRow = mk('tr', 'sched-thead-row');
    headerRow.appendChild(mk('th', 'sched-th sched-th-name', 'Activity'));
    headerRow.appendChild(mk('th', 'sched-th sched-th-freq', 'Freq'));
    QUARTERS.forEach(function(q, qi) {
      var th = mk('th', 'sched-th sched-th-q');
      th.appendChild(mk('div', 'sched-q-label', q));
      th.appendChild(mk('div', 'sched-q-months', Q_MONTHS[qi]));
      if (qi + 1 === currentQ) th.classList.add('sched-current-q');
      headerRow.appendChild(th);
    });
    headerRow.appendChild(mk('th', 'sched-th sched-th-owner', 'Owner'));
    headerRow.appendChild(mk('th', 'sched-th sched-th-tracker', 'Ticket'));
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Body
    var tbody = document.createElement('tbody');
    filtered.forEach(function(a, idx) {
      var status = statusMap[a.id];
      var nextDate = computeNextPlanned(a);
      var nextQ = nextDate ? dateToQuarter(nextDate) : null;
      var lastDate = parseDate(a.last_completed);
      var lastQ = lastDate ? dateToQuarter(lastDate) : null;
      var row = mk('tr', 'sched-row sched-st-' + status);
      row.style.animationDelay = (idx * 30) + 'ms';

      // Name + domain icon
      var nameCell = mk('td', 'sched-td sched-td-name');
      var nameWrap = mk('div', 'sched-name-wrap');
      var domBadge = mk('span', 'sched-domain-badge');
      domBadge.appendChild(mkIcon(domainIconType(a.domain), 'sched-domain-icon'));
      domBadge.title = domainLabel(a.domain);
      nameWrap.appendChild(domBadge);
      var relDoc = a.related && a.related.length ? a.related[0] : null;
      var nameEl = mk('span', 'sched-name', a.name);
      if (relDoc && state.idToPath[relDoc]) {
        nameEl.style.cursor = 'pointer';
        nameEl.title = relDoc;
        nameEl.addEventListener('click', function() { go('doc/' + state.idToPath[relDoc]); });
        nameEl.classList.add('sched-name-link');
      }
      nameWrap.appendChild(nameEl);
      // Runbook chip — the executable procedure for this activity, if any
      if (a.runbook && state.idToPath[a.runbook]) {
        var rbId = a.runbook;
        var rbChip = mk('span', 'sched-runbook-chip');
        rbChip.appendChild(mkIcon('runbook', 'sched-runbook-icon'));
        rbChip.appendChild(document.createTextNode(rbId));
        rbChip.title = 'Runbook: ' + rbId;
        rbChip.addEventListener('click', function() { go('doc/' + state.idToPath[rbId]); });
        nameWrap.appendChild(rbChip);
      }
      nameCell.appendChild(nameWrap);
      row.appendChild(nameCell);

      // Freq
      var freqCell = mk('td', 'sched-td sched-td-freq');
      freqCell.appendChild(mk('span', 'sched-freq-tag', FREQ_LABELS[a.frequency] || a.frequency));
      row.appendChild(freqCell);

      // Quarter cells
      QUARTERS.forEach(function(q, qi) {
        var td = mk('td', 'sched-td sched-td-q');
        var qNum = qi + 1;
        if (qNum === currentQ) td.classList.add('sched-current-q');

        // Completed
        if (lastQ && lastQ.year === displayYear && lastQ.q === qNum) {
          var doneLabel = mk('span', 'sched-q-date sched-date-done', a.last_completed);
          doneLabel.title = 'Completed: ' + a.last_completed;
          td.appendChild(doneLabel);
        }

        // Unknown — show "?" in current quarter
        if (status === 'unknown' && qNum === currentQ) {
          var unkLabel = mk('span', 'sched-q-date sched-date-unknown', '?');
          unkLabel.title = 'No date set — check last_completed and frequency in schedule.yml';
          td.appendChild(unkLabel);
        }

        // Next planned
        if (nextQ && nextQ.year === displayYear && nextQ.q === qNum) {
          var dateStr = nextDate ? formatDate(nextDate) : '';
          var planLabel = mk('span', 'sched-q-date sched-date-' + status, dateStr);
          if (status === 'overdue') planLabel.title = 'Overdue: ' + dateStr;
          else if (status === 'due-now') planLabel.title = 'Due: ' + dateStr;
          else planLabel.title = 'Planned: ' + dateStr;
          td.appendChild(planLabel);
        }

        row.appendChild(td);
      });

      // Owner
      row.appendChild(mk('td', 'sched-td sched-td-owner', a.owner || ''));

      // Tracker
      var trackerCell = mk('td', 'sched-td sched-td-tracker');
      if (a.tracker) {
        var ticketId = a.tracker.split('/').filter(Boolean).pop() || a.tracker;
        var link = mk('a', 'sched-ticket-link', ticketId);
        link.href = a.tracker;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        trackerCell.appendChild(link);
      }
      row.appendChild(trackerCell);

      tbody.appendChild(row);
    });
    table.appendChild(tbody);
    gridContainer.appendChild(table);

    // ── Right panel ──
    rightEl.textContent = '';
    rightEl.appendChild(mk('h3', '', 'Legend'));
    var legend = mk('div', 'sched-legend');
    var legendItems = [
      { cls: 'sched-date-done', label: 'Completed', sample: '2025-10-01' },
      { cls: 'sched-date-due-now', label: 'Due this quarter', sample: '2026-06-16' },
      { cls: 'sched-date-planned', label: 'Planned', sample: '2026-10-01' },
      { cls: 'sched-date-overdue', label: 'Overdue', sample: '2026-04-30' },
      { cls: 'sched-date-unknown', label: 'No date set', sample: '?' }
    ];
    legendItems.forEach(function(item) {
      var r = mk('div', 'sched-legend-row');
      r.appendChild(mk('span', 'sched-q-date ' + item.cls, item.sample));
      r.appendChild(mk('span', 'sched-legend-label', item.label));
      legend.appendChild(r);
    });
    rightEl.appendChild(legend);

    rightEl.appendChild(mk('h3', '', 'Summary'));
    var overdue = filtered.filter(function(a) { return statusMap[a.id] === 'overdue'; }).length;
    var dueNow = filtered.filter(function(a) { return statusMap[a.id] === 'due-now'; }).length;
    var planned = filtered.filter(function(a) { return statusMap[a.id] === 'planned'; }).length;
    rightEl.appendChild(mkMetaRow('Showing', String(filtered.length) + ' of ' + activities.length));
    rightEl.appendChild(mkMetaRow('Overdue', String(overdue)));
    rightEl.appendChild(mkMetaRow('Due now', String(dueNow)));
    rightEl.appendChild(mkMetaRow('Planned', String(planned)));
    rightEl.appendChild(mkMetaRow('Current quarter', now.getFullYear() + '-Q' + currentQ));
  }

  renderGrid();
}
