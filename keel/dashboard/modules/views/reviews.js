import { mk, mkEmpty, mkMetaRow, mkIcon } from '../dom.js';
import { state } from '../state.js';
import { go, setActiveView, setBread, mainEl, rightEl } from '../nav.js';
import { DOMAINS, DOC_TYPE_COLORS } from '../constants.js';
var REVIEW_DOC_TYPES = [
  { key: 'policy', label: 'Policies' }, { key: 'standard', label: 'Standards' },
  { key: 'process', label: 'Processes' }, { key: 'runbook', label: 'Runbooks' },
  { key: 'guideline', label: 'Guidelines' }, { key: 'playbook', label: 'Playbooks' },
  { key: 'system', label: 'Systems' }, { key: 'vendor', label: 'Vendors' },
  { key: 'data-asset', label: 'Data Assets' }, { key: 'business-process', label: 'Business Processes' }
];
export function renderReviews() {
  setActiveView('reviews'); mainEl.textContent = ''; rightEl.textContent = ''; setBread([{ label: 'Tools' }, { label: 'Reviews' }]);
  mainEl.appendChild(mk('h1', '', 'Review timeline'));

  const today = new Date().toISOString().substring(0, 10);
    const soon = new Date(Date.now() + 30 * 86400000).toISOString().substring(0, 10);

    // Collect items from documents
    const items = [];
    Object.keys(state.fmCache).forEach(function(p) {
      const fm = state.fmCache[p];
      const domain = p.split('/')[0];
      if (fm.next_review) items.push({ path: p, date: fm.next_review, title: fm.title || fm.id || p, source: 'doc', domain: domain });
    });

    // Collect items from capabilities
    DOMAINS.forEach(function(d) {
      const dc = state.domainCaps[d.dir];
      if (!dc) return;
      Object.keys(dc).forEach(function(c) {
        const cap = dc[c];
        if (cap.last_reviewed) {
          items.push({ path: 'cap/' + d.dir + '/' + cap.id, date: cap.last_reviewed, title: (cap.name || cap.id) + ' (capability)', source: 'cap', domain: d.dir, isCap: true });
        }
      });
    });

    items.sort(function(a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });

    if (!items.length) { mainEl.appendChild(mkEmpty('calendar', 'No review dates', 'Add next_review / last_reviewed to document frontmatter or capabilities to track reviews.')); return; }

    // Filter state
    var activeDomain = {};
    var activeDocTypes = {};
    var showCaps = true;

    // Collect domain labels
    var domains = {};
    items.forEach(function(i) {
      var dObj = DOMAINS.find(function(dd) { return dd.dir === i.domain; });
      domains[i.domain] = dObj ? dObj.label : i.domain;
    });

    // Collect doc type counts
    var docTypeCounts = {};
    items.filter(function(i) { return !i.isCap; }).forEach(function(i) {
      var fm = state.fmCache[i.path];
      var t = fm && fm.type ? fm.type : 'unknown';
      docTypeCounts[t] = (docTypeCounts[t] || 0) + 1;
    });

    // Domain filter row
    var domBar = mk('div', 'browse-filter-section');
    domBar.appendChild(mk('span', 'browse-filter-label', 'Domain'));
    var domChips = mk('div', 'cap-res-chips');
    Object.keys(domains).sort().forEach(function(d) {
      var btn = mk('button', 'cap-res-chip', domains[d]);
      btn.addEventListener('click', function() {
        if (activeDomain[d]) { delete activeDomain[d]; btn.classList.remove('active'); }
        else { activeDomain[d] = true; btn.classList.add('active'); }
        renderList();
      });
      domChips.appendChild(btn);
    });
    domBar.appendChild(domChips);
    mainEl.appendChild(domBar);

    // Document type filter row
    var typeBar = mk('div', 'browse-filter-section');
    typeBar.appendChild(mk('span', 'browse-filter-label', 'Document type'));
    var typeChips = mk('div', 'cap-res-chips');
    REVIEW_DOC_TYPES.forEach(function(t) {
      if (!docTypeCounts[t.key]) return;
      var btn = mk('button', 'cap-res-chip');
      btn.appendChild(mkIcon(t.key, 'browse-chip-icon'));
      btn.appendChild(document.createTextNode(' ' + t.label + ' (' + docTypeCounts[t.key] + ')'));
      btn.style.setProperty('--chip-color', DOC_TYPE_COLORS[t.key] || DOC_TYPE_COLORS['default']);
      btn.addEventListener('click', function() {
        if (activeDocTypes[t.key]) { delete activeDocTypes[t.key]; btn.classList.remove('active'); }
        else { activeDocTypes[t.key] = true; btn.classList.add('active'); }
        renderList();
      });
      typeChips.appendChild(btn);
    });
    // Capabilities toggle
    var capBtn = mk('button', 'cap-res-chip active');
    capBtn.appendChild(mkIcon('capability', 'browse-chip-icon'));
    capBtn.appendChild(document.createTextNode(' Capabilities'));
    capBtn.addEventListener('click', function() {
      showCaps = !showCaps;
      capBtn.classList.toggle('active', showCaps);
      renderList();
    });
    typeChips.appendChild(capBtn);
    typeBar.appendChild(typeChips);
    mainEl.appendChild(typeBar);

    const listContainer = mk('div');
    mainEl.appendChild(listContainer);

    function filterItems() {
      var hasDomain = Object.keys(activeDomain).length > 0;
      var hasDocType = Object.keys(activeDocTypes).length > 0;
      return items.filter(function(i) {
        if (hasDomain && !activeDomain[i.domain]) return false;
        if (i.isCap) return showCaps;
        if (hasDocType) {
          var fm = state.fmCache[i.path];
          var t = fm && fm.type ? fm.type : 'unknown';
          if (!activeDocTypes[t]) return false;
        }
        return true;
      });
    }

    function renderList() {
      listContainer.textContent = '';
      const filtered = filterItems();

      // Recently reviewed (from documents + capabilities with last_reviewed)
      var recent = [];
      var hasDomFilter = Object.keys(activeDomain).length > 0;
      var hasTypeFilter = Object.keys(activeDocTypes).length > 0;
      Object.keys(state.fmCache).forEach(function(p) {
        var fm = state.fmCache[p];
        var domain = p.split('/')[0];
        if (hasDomFilter && !activeDomain[domain]) return;
        if (hasTypeFilter && fm.type && !activeDocTypes[fm.type]) return;
        if (fm.last_reviewed) recent.push({ path: p, date: fm.last_reviewed, title: fm.title || fm.id || p, source: 'doc' });
      });
      if (showCaps) {
        DOMAINS.forEach(function(d) {
          var dc = state.domainCaps[d.dir]; if (!dc) return;
          if (hasDomFilter && !activeDomain[d.dir]) return;
          Object.keys(dc).forEach(function(c) {
            var cap = dc[c];
            if (cap.last_reviewed) recent.push({ path: 'cap/' + d.dir + '/' + cap.id, date: cap.last_reviewed, title: (cap.name || cap.id) + ' (capability)', source: 'cap', isCap: true });
          });
        });
      }
      recent.sort(function(a, b) { return a.date > b.date ? -1 : a.date < b.date ? 1 : 0; });
      if (recent.length) {
        listContainer.appendChild(mk('h2', '', 'Recently reviewed'));
        recent.slice(0, 10).forEach(function(i) { addReviewRow(listContainer, i, ''); });
      }

      // For next_review buckets, only use doc items that have next_review
      const nextItems = filtered.filter(function(i) { return !i.isCap; });
      const over = nextItems.filter(function(i) { return i.date < today; });
      const up = nextItems.filter(function(i) { return i.date >= today && i.date <= soon; });
      const fut = nextItems.filter(function(i) { return i.date > soon; });

      if (over.length) { listContainer.appendChild(mk('h2', 'review-overdue-header', 'Overdue (' + over.length + ')')); over.forEach(function(i) { addReviewRow(listContainer, i, 'overdue'); }); }
      if (up.length) { listContainer.appendChild(mk('h2', '', 'Due within 30 days (' + up.length + ')')); up.forEach(function(i) { addReviewRow(listContainer, i, 'upcoming'); }); }
      if (fut.length) { listContainer.appendChild(mk('h2', '', 'Future (' + fut.length + ')')); fut.forEach(function(i) { addReviewRow(listContainer, i, ''); }); }

      // Right panel stats
      rightEl.textContent = '';
      rightEl.appendChild(mk('h3', '', 'Summary'));
      const allFiltered = filterItems();
      const stats = [['Total items', allFiltered.length], ['Documents', allFiltered.filter(function(i) { return i.source === 'doc'; }).length], ['Capabilities', allFiltered.filter(function(i) { return i.source === 'cap'; }).length], ['Overdue', over.length]];
      stats.forEach(function(s) {
        rightEl.appendChild(mkMetaRow(s[0], String(s[1])));
      });
    }

    renderList();
}

function addReviewRow(container, item, cls) {
  const r = mk('div', 'review-item ' + cls);
  r.appendChild(mk('span', 'review-date', item.date));
  if (item.isCap) {
    const badge = mk('span', 'review-cap-badge', 'CAP');
    r.appendChild(badge);
  }
  const l = mk('span', '', item.title); l.style.cursor = 'pointer'; l.style.color = 'var(--accent)';
  l.addEventListener('click', function(e) { go(item.isCap ? item.path : 'doc/' + item.path, e); });
  r.appendChild(l);
  container.appendChild(r);
}
