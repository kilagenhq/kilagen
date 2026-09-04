import { mk, svgEl, matDot, mkCopyBtn, mkIcon, mkFlipIcon, ghUrl, mkMetaRow, mkCollapsible, mkExpandAllBtn, mkSourcePanel, mkTocFromCollapsibles, roleTitle, formatRoles } from '../dom.js';
import { state } from '../state.js';
import { go, setActiveView, setBread, fadeMain, fadeRight, mainEl, rightEl } from '../nav.js';
import { DOMAINS, DOC_TYPE_COLORS, SUBFOLDER_LABELS, fwLabel, statusColor, CRIT_COLORS } from '../constants.js';
import { safeFetch, safeUrl, hookLinks } from '../security.js';
import { parseFM, parseYml, renderMd, safeHtmlNode } from '../parsers.js';

function stripTags(s) { if (typeof s !== 'string') return ''; var prev; do { prev = s; s = s.replace(/<[^>]*>/g, ''); } while (s !== prev); return s; }

function findPathById(docId) {
  return state.idToPath[docId] || null;
}

function renderDocLink(docId) {
  const path = findPathById(docId);
  const el = mk('span', 'related-link', docId);
  if (path) {
    el.style.cursor = 'pointer';
    el.style.color = 'var(--accent)';
    el.addEventListener('click', function(e) { go('doc/' + path, e); });
  } else {
    el.style.color = 'var(--fg3)';
    el.title = 'Not found in the program';
  }
  return el;
}

// Like renderDocLink but with a custom display label (e.g. a role's title) while
// still linking to the doc; caller has already resolved the path.
function renderDocLinkLabel(docId, label, path) {
  const el = mk('span', 'related-link', label);
  el.style.cursor = 'pointer';
  el.style.color = 'var(--accent)';
  el.title = docId;
  el.addEventListener('click', function(e) { go('doc/' + path, e); });
  return el;
}


function renderRichDoc(path, fm, body) {
  mainEl.textContent = ''; rightEl.textContent = '';

  const pathParts = path.split('/');
  const domDir = pathParts[0];
  const domObj = DOMAINS.find(function(dd) { return dd.dir === domDir; });
  const breadParts = [];
  if (domDir === 'adr') {
    breadParts.push({ label: 'ADRs', action: function() { go('adrs'); } });
  } else if (domDir === 'data-assets') {
    breadParts.push({ label: 'Data Assets', action: function() { go('data-assets'); } });
  } else if (domDir === 'business-processes') {
    breadParts.push({ label: 'Business Processes', action: function() { go('business-processes'); } });
  } else if (domObj) {
    breadParts.push({ label: domObj.label, action: function() { go('domain/' + domDir); } });
    if (pathParts.length >= 3) {
      var subfolder = pathParts[1];
      var subLabel = subfolder.charAt(0).toUpperCase() + subfolder.slice(1).replace(/-/g, ' ');
      breadParts.push({ label: subLabel, action: function() { go('domain/' + domDir); } });
    }
  }
  breadParts.push({ label: fm.title || fm.id || pathParts[pathParts.length - 1] });
  setBread(breadParts);

  // Hero — standards get a unified header block; other types keep the original layout
  if (fm.type === 'standard') {
    const stdHeader = mk('div', 'std-header');
    // Title
    const titleRow = mk('div', 'doc-title-row');
    titleRow.appendChild(mkIcon(fm.type));
    const h1 = mk('h1', '', fm.title || fm.id || path.split('/').pop());
    h1.appendChild(mkCopyBtn());
    titleRow.appendChild(h1);
    stdHeader.appendChild(titleRow);
    // Badges: policy + status + version
    const badges = mk('div', 'doc-badges');
    if (fm.related && fm.related.policies && fm.related.policies.length) {
      fm.related.policies.forEach(function(pid) {
        const polBadge = mk('span', 'doc-type-badge'); polBadge.style.cursor = 'pointer'; polBadge.style.borderLeft = '3px solid ' + (DOC_TYPE_COLORS['policy'] || 'var(--accent)');
        polBadge.textContent = pid;
        const polPath = findPathById(pid);
        if (polPath) polBadge.addEventListener('click', function(e) { go('doc/' + polPath, e); });
        badges.appendChild(polBadge);
      });
    }
    if (fm.status) { const sb = mk('span', 'doc-status-badge'); sb.textContent = fm.status; sb.style.color = statusColor(fm.status); sb.style.borderColor = statusColor(fm.status); badges.appendChild(sb); }
    if (fm.version) { const vb = mk('span', 'doc-status-badge', 'v' + fm.version); vb.style.color = 'var(--fg2)'; vb.style.borderColor = 'var(--fg3)'; badges.appendChild(vb); }
    stdHeader.appendChild(badges);
    // Description
    if (fm.description) stdHeader.appendChild(mk('p', 'doc-description', String(fm.description).trim()));
    // Metadata table 2x2
    const metaStrip = mk('div', 'std-header-strip');
    const fields = [];
    if (fm.owner) fields.push(['Owner', roleTitle(fm.owner)]);
    if (fm.approved_by) fields.push(['Approved', formatRoles(fm.approved_by)]);
    if (fm.last_reviewed) fields.push(['Reviewed', fm.last_reviewed]);
    if (fm.next_review) fields.push(['Next', fm.next_review]);
    fields.forEach(function(f) {
      const item = mk('span', 'std-strip-item');
      item.appendChild(mk('span', 'std-strip-label', f[0]));
      item.appendChild(mk('span', 'std-strip-value', f[1]));
      metaStrip.appendChild(item);
    });
    if (fm.applies_to && fm.applies_to.length) {
      const domItem = mk('span', 'std-strip-item std-strip-domains');
      domItem.appendChild(mk('span', 'std-strip-label', 'Domains'));
      fm.applies_to.forEach(function(d) {
        const chip = mk('span', 'std-strip-domain', d);
        const dd = DOMAINS.find(function(x) { return x.dir === d || x.dir.endsWith('-' + d); });
        if (dd) chip.addEventListener('click', function(e) { e.stopPropagation(); go('domain/' + dd.dir, e); });
        domItem.appendChild(chip);
      });
      metaStrip.appendChild(domItem);
    }
    stdHeader.appendChild(metaStrip);
    mainEl.appendChild(stdHeader);
    // Status pills — Gaps & Exceptions
    const safeGapUrl = safeUrl(fm.gap_link);
    const excIds = (fm.related && fm.related.exceptions && Array.isArray(fm.related.exceptions)) ? fm.related.exceptions : [];
    const statusRow = mk('div', 'std-status-row');
    // Gaps pill — only shown when gap_link exists (it's a ticket filter, not a confirmation of gaps)
    if (safeGapUrl) {
      const gapPill = mk('a', 'std-status-pill std-status-neutral', 'Check gaps \u2192');
      gapPill.href = safeGapUrl; gapPill.target = '_blank'; gapPill.rel = 'noopener noreferrer';
      statusRow.appendChild(gapPill);
    }
    // Exceptions pill
    if (excIds.length) {
      const excPill = mk('span', 'std-status-pill std-status-warn');
      excPill.textContent = '\u26A0 ' + excIds.length + ' exception' + (excIds.length > 1 ? 's' : '');
      const excDetail = mk('div', 'std-status-detail');
      excIds.forEach(function(eid) {
        const link = mk('div', 'cap-backlink'); link.style.cursor = 'pointer';
        link.appendChild(mk('span', 'compliance-link', eid));
        const excPath = findPathById(eid);
        if (excPath) link.addEventListener('click', function(e) { go('doc/' + excPath, e); });
        excDetail.appendChild(link);
      });
      excPill.addEventListener('click', function() { excDetail.classList.toggle('show'); });
      statusRow.appendChild(excPill);
      statusRow.appendChild(excDetail);
    } else {
      statusRow.appendChild(mk('span', 'std-status-pill std-status-ok', '\u2713 No exceptions'));
    }
    mainEl.appendChild(statusRow);
  }

  // Hero — non-standard types
  if (fm.type !== 'standard') {
  const hero = mk('div', 'doc-hero');
  const titleRow = mk('div', 'doc-title-row');
  titleRow.appendChild(mkIcon(fm.type));
  const h1 = mk('h1', '', fm.title || fm.id || path.split('/').pop());
  h1.appendChild(mkCopyBtn());
  titleRow.appendChild(h1);
  hero.appendChild(titleRow);
  const badges = mk('div', 'doc-badges');
    if (fm.type) {
      var typeBadge = mk('span', 'doc-type-badge');
      typeBadge.appendChild(mkIcon(fm.type, 'doc-badge-icon'));
      typeBadge.appendChild(document.createTextNode(fm.type));
      typeBadge.style.borderLeft = '3px solid ' + (DOC_TYPE_COLORS[fm.type] || 'var(--fg3)');
      badges.appendChild(typeBadge);
    }
    if (fm.status) {
      var sb = mk('span', 'doc-status-badge');
      sb.textContent = fm.status;
      sb.style.color = statusColor(fm.status);
      sb.style.borderColor = statusColor(fm.status);
      badges.appendChild(sb);
    }
    if (fm.domain) {
      var domBadgeObj = domObj || DOMAINS.find(function(x) { return x.dir === fm.domain || x.dir.endsWith('-' + fm.domain); });
      var db = mk('span', 'doc-domain-badge');
      db.appendChild(mkIcon('domain', 'doc-badge-icon'));
      db.appendChild(document.createTextNode(domBadgeObj ? domBadgeObj.label : fm.domain));
      if (domBadgeObj) db.addEventListener('click', function(e) { go('domain/' + domBadgeObj.dir, e); });
      badges.appendChild(db);
    }
    if (fm.capability) {
      var capLabel = String(fm.capability);
      var capClickable = false;
      if (domObj && state.domainCaps[domObj.dir] && state.domainCaps[domObj.dir][capLabel]) {
        capLabel = state.domainCaps[domObj.dir][capLabel].name || capLabel;
        capClickable = true;
      }
      var cb = mk('span', 'doc-cap-badge');
      cb.appendChild(mkIcon('capability', 'doc-badge-icon'));
      cb.appendChild(document.createTextNode(capLabel));
      if (capClickable) cb.addEventListener('click', function(e) { go('cap/' + domDir + '/' + fm.capability, e); });
      badges.appendChild(cb);
    }
    if (fm.domains && Array.isArray(fm.domains)) {
      fm.domains.forEach(function(d) {
        var dd2 = DOMAINS.find(function(x) { return x.dir === d || x.dir.endsWith('-' + d); });
        var chip = mk('span', 'doc-domain-badge');
        chip.appendChild(mkIcon('domain', 'doc-badge-icon'));
        chip.appendChild(document.createTextNode(dd2 ? dd2.label : d));
        if (dd2) chip.addEventListener('click', function(e) { go('domain/' + dd2.dir, e); });
        badges.appendChild(chip);
      });
    }
    if (fm.immutable) badges.appendChild(mk('span', 'doc-immutable-badge', 'immutable'));
    if (fm.version) { var vb = mk('span', 'doc-status-badge', 'v' + fm.version); vb.style.color = 'var(--fg2)'; vb.style.borderColor = 'var(--fg3)'; badges.appendChild(vb); }
    if (fm.approved_by) { var ab = mk('span', 'doc-status-badge', 'Approved: ' + formatRoles(fm.approved_by)); ab.style.color = 'var(--fg2)'; ab.style.borderColor = 'var(--fg3)'; badges.appendChild(ab); }
    if (fm.severity && (fm.type === 'threat' || fm.type === 'risk')) {
      var sevBadge = mk('span', 'doc-status-badge', fm.severity); sevBadge.style.color = CRIT_COLORS[fm.severity] || 'var(--fg)'; sevBadge.style.borderColor = CRIT_COLORS[fm.severity] || 'var(--fg)'; badges.appendChild(sevBadge);
    }
  hero.appendChild(badges);
  if (fm.type === 'role') {
    var rtMap = { lead: 'Leadership role', committee: 'Committee' };
    var rtLabel = rtMap[fm.role_type] || (fm.role_type ? fm.role_type.charAt(0).toUpperCase() + fm.role_type.slice(1) : '');
    var teamLabel = fm.team ? fm.team.charAt(0).toUpperCase() + fm.team.slice(1) + (fm.role_type === 'committee' ? '' : ' team') : '';
    var sub = [rtLabel, teamLabel].filter(Boolean).join(' · ');
    if (sub) hero.appendChild(mk('p', 'doc-role-subtitle', sub));
  }
  if (fm.description) hero.appendChild(mk('p', 'doc-description', String(fm.description).trim()));
  mainEl.appendChild(hero);
  }

  if (fm.type === 'standard') {
    // Requirements table
    const reqs = (fm.requirements || []).slice().sort(function(a, b) { return (a.ref || '').localeCompare(b.ref || '', undefined, { numeric: true }); });
    if (reqs.length) {
      const fwAgg = {}; let mappedCount = 0;
      reqs.forEach(function(r) {
        if (r.frameworks && Object.keys(r.frameworks).length) {
          mappedCount++;
          Object.keys(r.frameworks).forEach(function(fw) { if (!fwAgg[fw]) fwAgg[fw] = []; const cls = r.frameworks[fw]; if (Array.isArray(cls)) cls.forEach(function(c) { if (fwAgg[fw].indexOf(c) === -1) fwAgg[fw].push(c); }); });
        }
      });
      const summaryText = reqs.length + ' requirements (' + mappedCount + ' mapped, ' + (reqs.length - mappedCount) + ' internal)';
      const fwSummary = Object.keys(fwAgg).sort().map(function(fw) { return fwLabel(fw); }).join(', ');
      const _c = mkCollapsible('Requirement Compliance Matrix', summaryText + (fwSummary ? ' \u2014 ' + fwSummary : ''));
      const collapseWrap = _c.wrap;
      const collapseBody = _c.body;
      const reqTbl = mk('table', 'compliance-table');
      const rHead = mk('thead'); const rHr = mk('tr');
      ['Ref', 'Summary', 'Domains', 'Frameworks'].forEach(function(h) { rHr.appendChild(mk('th', '', h)); });
      rHead.appendChild(rHr); reqTbl.appendChild(rHead);
      const rBody = mk('tbody');
      reqs.forEach(function(r) {
        const tr = mk('tr');
        tr.appendChild(mk('td', '', r.ref));
        tr.appendChild(mk('td', '', r.summary || ''));
        tr.appendChild(mk('td', '', (r.domains || []).join(', ') || '-'));
        const fwCell = mk('td');
        if (r.frameworks && Object.keys(r.frameworks).length) {
          Object.keys(r.frameworks).forEach(function(fw) { const cls = r.frameworks[fw]; if (Array.isArray(cls)) cls.forEach(function(c) { fwCell.appendChild(mk('span', 'req-fw-badge', fwLabel(fw) + ' ' + c)); }); });
        } else { fwCell.appendChild(mk('span', 'req-fw-badge req-fw-internal', 'internal')); }
        tr.appendChild(fwCell);
        rBody.appendChild(tr);
      });
      reqTbl.appendChild(rBody);
      collapseBody.appendChild(reqTbl);
      mainEl.appendChild(collapseWrap);
    }

    // === Implementation: capabilities + related docs ===
    // 1. Extract unique capabilities from requirements
    const capsByDom = {};
    (fm.requirements || []).forEach(function(r) {
      if (!r.capabilities) return;
      Object.keys(r.capabilities).forEach(function(dom) {
        const caps = r.capabilities[dom];
        if (!Array.isArray(caps)) return;
        if (!capsByDom[dom]) capsByDom[dom] = {};
        caps.forEach(function(c) { capsByDom[dom][c] = true; });
      });
    });
    // 2. Find related docs in applies_to domains (excluding standards, README, capabilities.yml)
    const implDocs = [];
    const appliesTo = fm.applies_to || [];
    Object.keys(state.fmCache).forEach(function(p) {
      const docFm = state.fmCache[p];
      if (!docFm || !docFm.type) return;
      if (docFm.type === 'standard' || docFm.type === 'policy') return;
      if (p.endsWith('/README.md') || p.endsWith('/capabilities.yml')) return;
      // Systems live in systems/, not in a domain folder — match by related.standards
      if (docFm.type === 'system') {
        if (docFm.related && docFm.related.standards && Array.isArray(docFm.related.standards) && docFm.related.standards.indexOf(fm.id) !== -1) {
          implDocs.push({ path: p, fm: docFm });
        }
        return;
      }
      // Check if doc lives in one of the applies_to domains
      const docDom = p.split('/')[0];
      const domShortDoc = docDom.replace(/^\d+-/, '');
      if (appliesTo.indexOf(domShortDoc) !== -1 || appliesTo.indexOf(docDom) !== -1) {
        // Also check if doc references this standard or shares systems
        let isRelated = false;
        if (docFm.related && docFm.related.standards && Array.isArray(docFm.related.standards) && docFm.related.standards.indexOf(fm.id) !== -1) isRelated = true;
        // Or if doc is in a domain this standard applies to and is an operational doc type
        if (['process', 'runbook', 'guideline', 'playbook'].indexOf(docFm.type) !== -1) isRelated = true;
        if (isRelated) implDocs.push({ path: p, fm: docFm });
      }
    });

    // Build flat list of all implementation items (capabilities + docs)
    const implItems = [];
    Object.keys(capsByDom).sort().forEach(function(dom) {
      const domObj2 = DOMAINS.find(function(dd) { return dd.dir === dom || dd.dir.endsWith('-' + dom); });
      Object.keys(capsByDom[dom]).sort().forEach(function(capId) {
        let capName = capId;
        if (domObj2 && state.domainCaps[domObj2.dir] && state.domainCaps[domObj2.dir][capId]) {
          capName = state.domainCaps[domObj2.dir][capId].name || capId;
        }
        implItems.push({ type: 'capability', label: capName, domain: domObj2 ? domObj2.label : dom, route: 'cap/' + (domObj2 ? domObj2.dir : dom) + '/' + capId });
      });
    });
    implDocs.forEach(function(d) {
      const t = d.fm.type || 'other';
      const label = SUBFOLDER_LABELS[t + 's'] || SUBFOLDER_LABELS[t] || t.charAt(0).toUpperCase() + t.slice(1);
      implItems.push({ type: label, label: d.fm.title || d.fm.id || d.path.split('/').pop(), domain: d.path.split('/')[0].replace(/^\d+-/, ''), route: 'doc/' + d.path });
    });

    if (implItems.length) {
      // Collapsible wrapper
      const implCollapse = mkCollapsible('Implementation', implItems.length + ' item' + (implItems.length > 1 ? 's' : ''));
      const implWrap = implCollapse.wrap;
      const implHeader = implCollapse.header;
      const implBody = implCollapse.body;

      // Filters state
      const activeDomains = {};
      const activeTypes = {};

      // Build filter bar with flip button
      const implFilterWrap = mk('div', 'impl-filter-wrap');
      // Flip button (single toggle) — aligned right
      const implFlip = mk('button', 'cap-res-flip impl-flip');
      implFlip.appendChild(mkFlipIcon('grid'));
      implFlip.title = 'Switch to table';
      implFlip.addEventListener('click', function(e) {
        e.stopPropagation();
        implFlip.textContent = '';
        if (implViewMode === 'cards') { implViewMode = 'table'; implFlip.appendChild(mkFlipIcon('list')); implFlip.title = 'Switch to cards'; }
        else { implViewMode = 'cards'; implFlip.appendChild(mkFlipIcon('grid')); implFlip.title = 'Switch to table'; }
        renderImpl();
      });
      implFilterWrap.appendChild(implFlip);
      // Domain filters — own line
      const domSet = {}; implItems.forEach(function(it) { domSet[it.domain] = (domSet[it.domain] || 0) + 1; });
      if (Object.keys(domSet).length > 1) {
        const domLine = mk('div', 'impl-filter-line');
        domLine.appendChild(mk('span', 'impl-filter-label', 'Domain'));
        Object.keys(domSet).sort().forEach(function(d) {
          const btn = mk('button', '', d + ' (' + domSet[d] + ')');
          btn.addEventListener('click', function(e) { e.stopPropagation(); if (activeDomains[d]) { delete activeDomains[d]; btn.classList.remove('active'); } else { activeDomains[d] = true; btn.classList.add('active'); } renderImpl(); });
          domLine.appendChild(btn);
        });
        implFilterWrap.appendChild(domLine);
      }
      // Type filters — own line
      const typeSet = {}; implItems.forEach(function(it) { typeSet[it.type] = (typeSet[it.type] || 0) + 1; });
      if (Object.keys(typeSet).length > 1) {
        const typeLine = mk('div', 'impl-filter-line');
        typeLine.appendChild(mk('span', 'impl-filter-label', 'Type'));
        Object.keys(typeSet).sort().forEach(function(t) {
          const btn = mk('button', '', t + ' (' + typeSet[t] + ')');
          btn.addEventListener('click', function(e) { e.stopPropagation(); if (activeTypes[t]) { delete activeTypes[t]; btn.classList.remove('active'); } else { activeTypes[t] = true; btn.classList.add('active'); } renderImpl(); });
          typeLine.appendChild(btn);
        });
        implFilterWrap.appendChild(typeLine);
      }
      implBody.appendChild(implFilterWrap);

      const implContainer = mk('div', '');
      implBody.appendChild(implContainer);
      mainEl.appendChild(implWrap);

      let implViewMode = 'cards';
      function getFiltered() {
        const hasDom = Object.keys(activeDomains).length > 0;
        const hasType = Object.keys(activeTypes).length > 0;
        return implItems.filter(function(it) { return (!hasDom || activeDomains[it.domain]) && (!hasType || activeTypes[it.type]); });
      }

      function renderImpl() {
        if (implViewMode === 'cards') renderImplCards(); else renderImplTable();
      }

      function renderImplCards() {
        implViewMode = 'cards';
        implContainer.textContent = '';
        const filtered = getFiltered();
        const grouped = {};
        filtered.forEach(function(it) { if (!grouped[it.type]) grouped[it.type] = []; grouped[it.type].push(it); });
        const grid = mk('div', 'cap-info-grid');
        Object.keys(grouped).sort().forEach(function(t) {
          const card = mk('div', 'cap-info-card');
          card.appendChild(mk('h4', '', t + ' (' + grouped[t].length + ')'));
          grouped[t].forEach(function(it) {
            const link = mk('div', 'cap-backlink'); link.style.cursor = 'pointer';
            link.appendChild(mk('span', 'compliance-link', it.label));
            link.addEventListener('click', function(e) { go(it.route, e); });
            card.appendChild(link);
          });
          grid.appendChild(card);
        });
        implContainer.appendChild(grid);
      }

      function renderImplTable() {
        implViewMode = 'table';
        implContainer.textContent = '';
        const filtered = getFiltered();
        const tbl = mk('table', 'compliance-table');
        const thead = mk('thead'); const hr = mk('tr');
        ['Domain', 'Type', 'Name'].forEach(function(h) { hr.appendChild(mk('th', '', h)); });
        thead.appendChild(hr); tbl.appendChild(thead);
        const tbody = mk('tbody');
        filtered.sort(function(a, b) { return a.domain.localeCompare(b.domain) || a.type.localeCompare(b.type) || a.label.localeCompare(b.label); }).forEach(function(it) {
          const tr = mk('tr'); tr.style.cursor = 'pointer';
          tr.addEventListener('click', function(e) { go(it.route, e); });
          tr.appendChild(mk('td', '', it.domain));
          tr.appendChild(mk('td', '', it.type));
          const nameCell = mk('td'); nameCell.appendChild(mk('span', 'compliance-link', it.label)); tr.appendChild(nameCell);
          tbody.appendChild(tr);
        });
        tbl.appendChild(tbody);
        implContainer.appendChild(tbl);
      }

      renderImplCards();
    }

    // Body — split by ## into collapsible sections inside a card, with inline badges
    var stdBodyCard = null;
    if (body && body.trim()) {
      var stdBodySections = body.split(/^## /m);
      var stdSections = stdBodySections.slice(1).filter(function(s) { return s.trim(); });
      if (stdSections.length) {
        stdBodyCard = mk('div', 'app-sys-body-card');
        stdBodyCard.appendChild(mkExpandAllBtn(stdBodyCard));
        stdSections.forEach(function(s) {
          var lines = s.split('\n'), title = lines[0].trim(), secBody = lines.slice(1).join('\n').trim();
          if (!secBody) return;
          var col = mkCollapsible(title, '', false);
          var bd = safeHtmlNode(renderMd(secBody));
          col.body.appendChild(bd); hookLinks(col.body, go, path);
          stdBodyCard.appendChild(col.wrap);
        });
        mainEl.appendChild(stdBodyCard);
        // Inject inline requirement badges into the rendered sections
        if (fm.requirements && fm.requirements.length) {
          const reqMap = {}; fm.requirements.forEach(function(r) { reqMap[r.ref] = r; });
          const walker = document.createTreeWalker(stdBodyCard, NodeFilter.SHOW_TEXT, null, false);
          let node; const badgeMatches = [];
          while ((node = walker.nextNode())) { const txt = node.textContent; const m = txt.match(/^(\d+\.\d+)\s/); if (m && reqMap[m[1]]) badgeMatches.push({ node: node, req: reqMap[m[1]] }); }
          badgeMatches.forEach(function(match) {
            const parent = match.node.parentNode; if (!parent) return;
            const badges = document.createElement('span'); badges.className = 'req-body-badges';
            const r = match.req;
            if (r.frameworks && Object.keys(r.frameworks).length) {
              Object.keys(r.frameworks).forEach(function(fw) { const cls = r.frameworks[fw]; if (Array.isArray(cls)) cls.forEach(function(c) { const b = document.createElement('span'); b.className = 'req-fw-badge'; b.textContent = fwLabel(fw) + ' ' + c; badges.appendChild(b); }); });
            } else { const ib = document.createElement('span'); ib.className = 'req-fw-badge req-fw-internal'; ib.textContent = 'internal'; badges.appendChild(ib); }
            if (parent.tagName === 'P' || parent.tagName === 'LI') { parent.appendChild(document.createTextNode(' ')); parent.appendChild(badges); }
          });
        }
      } else {
        // No ## sections — render flat
        var stdFlatHtml = renderMd(body);
        if (stdFlatHtml) { var stdFlatBd = safeHtmlNode(stdFlatHtml); mainEl.appendChild(stdFlatBd); hookLinks(mainEl, go, path); }
      }
    }

    // Right panel
    fadeRight();
    rightEl.appendChild(mk('h3', '', 'On this page'));
    if (stdBodyCard) {
      mkTocFromCollapsibles(rightEl, stdBodyCard);
    }
    if (fm.related && fm.related.standards && fm.related.standards.length) {
      rightEl.appendChild(mk('h3', '', 'Related standards'));
      fm.related.standards.forEach(function(sid) { rightEl.appendChild(renderDocLink(sid)); });
    }
    mkSourcePanel(rightEl, path);
    return;
  }

  // Info cards (non-standard types)
  const infoGrid = mk('div', 'doc-info-grid');

  if (fm.type === 'role') {
    // Reporting line — who this role reports to and who reports into it.
    // (Role type + team live in the hero subtitle; status + domain are hero badges.)
    const roleCard = mk('div', 'doc-info-card');
    roleCard.appendChild(mk('h4', '', 'Reporting line'));
    const roleLinkRow = function(label, ids, emptyText) {
      const row = mk('div', 'doc-info-row');
      row.appendChild(mk('span', 'doc-info-key', label));
      const val = mk('span', 'doc-info-val');
      const list = Array.isArray(ids) ? ids : [];
      if (list.length) {
        list.forEach(function(rid, i) {
          if (i) val.appendChild(document.createTextNode(', '));
          const rp = findPathById(rid);
          val.appendChild(rp ? renderDocLinkLabel(rid, roleTitle(rid), rp) : document.createTextNode(roleTitle(rid)));
        });
      } else { val.appendChild(mk('span', 'grc-empty', emptyText)); }
      row.appendChild(val);
      roleCard.appendChild(row);
    };
    roleLinkRow('Reports to', fm.reports_to, '—');
    roleLinkRow('Direct reports', fm.direct_reports, 'None');
    infoGrid.appendChild(roleCard);
    mainEl.appendChild(infoGrid);
  } else {

  // Details card
  const metaCard = mk('div', 'doc-info-card');
  metaCard.appendChild(mk('h4', '', 'Details'));
  const metaFields = [['Owner', roleTitle(fm.owner)], ['Last reviewed', fm.last_reviewed], ['Next review', fm.next_review]];
  if (fm.severity) metaFields.push(['Severity', fm.severity]);
  if (fm.likelihood) metaFields.push(['Likelihood', fm.likelihood]);
  if (fm.impact) metaFields.push(['Impact', fm.impact]);
  if (fm.vendor) metaFields.push(['Vendor', fm.vendor]);
  if (fm.vendor_name) metaFields.push(['Vendor name', fm.vendor_name]);
  if (fm.deployment) metaFields.push(['Deployment', fm.deployment]);
  if (fm.tier) metaFields.push(['Tier', fm.tier]);
  if (fm.requested_by) metaFields.push(['Requested by', fm.requested_by]);
  if (fm.decision_date) metaFields.push(['Decision date', fm.decision_date]);
  if (fm.expires) metaFields.push(['Expires', fm.expires]);
  if (fm.risk_severity) metaFields.push(['Residual risk', fm.risk_severity]);
  if (fm.standard) metaFields.push(['Standard', fm.standard]);
  if (fm.requirement_ref) metaFields.push(['Requirement', fm.requirement_ref]);
  if (fm.incident_date) metaFields.push(['Incident date', fm.incident_date]);
  if (fm.resolved_date) metaFields.push(['Resolved', fm.resolved_date]);
  if (fm.regulator_reportable !== undefined) metaFields.push(['Regulator reportable', fm.regulator_reportable ? 'Yes' : 'No']);
  metaFields.forEach(function(f) {
    if (!f[1]) return;
    const row = mk('div', 'doc-info-row');
    row.appendChild(mk('span', 'doc-info-key', f[0]));
    const ownerPath = (f[0] === 'Owner' && fm.owner) ? findPathById(fm.owner) : null;
    if (ownerPath) {
      const val = mk('span', 'doc-info-val');
      val.appendChild(renderDocLinkLabel(fm.owner, String(f[1]), ownerPath));
      row.appendChild(val);
    } else {
      row.appendChild(mk('span', 'doc-info-val', String(f[1])));
    }
    metaCard.appendChild(row);
  });
  infoGrid.appendChild(metaCard);

  // Related
  const relCard = mk('div', 'doc-info-card');
  relCard.appendChild(mk('h4', '', 'Related'));
  let hasRelated = false;
  if (fm.related) {
    Object.keys(fm.related).forEach(function(relType) {
      const targets = fm.related[relType];
      if (!Array.isArray(targets) || !targets.length) return;
      hasRelated = true;
      const row = mk('div', 'doc-info-row');
      row.appendChild(mk('span', 'doc-info-key', relType));
      const val = mk('span', 'doc-info-val');
      targets.forEach(function(tid, i) { if (i) val.appendChild(document.createTextNode(', ')); val.appendChild(renderDocLink(tid)); });
      row.appendChild(val);
      relCard.appendChild(row);
    });
  }
  if (!hasRelated) relCard.appendChild(mk('span', 'grc-empty', 'No related documents'));
  infoGrid.appendChild(relCard);

  // Certifications
  if (fm.certifications && fm.certifications.length) {
    const certCard = mk('div', 'doc-info-card');
    certCard.appendChild(mk('h4', '', 'Certifications'));
    fm.certifications.forEach(function(c) { certCard.appendChild(mk('div', 'doc-cert-item', c)); });
    infoGrid.appendChild(certCard);
  }

  // Capabilities (systems)
  if (fm.capabilities && typeof fm.capabilities === 'object' && !Array.isArray(fm.capabilities)) {
    const capsCard = mk('div', 'doc-info-card');
    capsCard.appendChild(mk('h4', '', 'Capabilities'));
    Object.keys(fm.capabilities).forEach(function(domain) {
      const caps = fm.capabilities[domain];
      const row = mk('div', 'doc-info-row');
      row.appendChild(mk('span', 'doc-info-key', domain));
      row.appendChild(mk('span', 'doc-info-val', Array.isArray(caps) ? caps.join(', ') : String(caps)));
      capsCard.appendChild(row);
    });
    infoGrid.appendChild(capsCard);
  }

  mainEl.appendChild(infoGrid);
  }

  // Role docs: computed reverse index of every artifact that names this role in
  // an ownership/approver field. Built here but appended AFTER the body so the
  // Scope/mandate narrative reads before the bulk artifact list.
  var roleArtifactsWrap = null;
  if (fm.type === 'role' && fm.id) {
    var roleId = fm.id;
    var roleRefs = [];
    Object.keys(state.fmCache).forEach(function(p) {
      var dfm = state.fmCache[p];
      if (!dfm || !dfm.type || p === path) return;
      if (p.endsWith('/README.md') || p.endsWith('/capabilities.yml')) return;
      var rels = [];
      if (dfm.owner === roleId) rels.push('owner');
      if (dfm.second_owner === roleId) rels.push('2nd owner');
      if (Array.isArray(dfm.approved_by) && dfm.approved_by.indexOf(roleId) !== -1) rels.push('approver');
      if (Array.isArray(dfm.reviewed_by) && dfm.reviewed_by.indexOf(roleId) !== -1) rels.push('reviewer');
      if (rels.length) roleRefs.push({ path: p, fm: dfm, relation: rels.join(', ') });
    });
    if (roleRefs.length) {
      var rc = mkCollapsible('Owned & accountable artifacts', roleRefs.length + ' document' + (roleRefs.length > 1 ? 's' : ''));
      var grouped = {};
      roleRefs.forEach(function(r) { var t = r.fm.type || 'other'; (grouped[t] = grouped[t] || []).push(r); });
      var TYPE_PLURAL = { policy: 'Policies', process: 'Processes', adr: 'ADRs', 'data-asset': 'Data Assets', 'business-process': 'Business Processes', system: 'Systems', risk: 'Risks' };
      var grid = mk('div', 'cap-info-grid');
      Object.keys(grouped).sort().forEach(function(t) {
        var label = TYPE_PLURAL[t] || SUBFOLDER_LABELS[t + 's'] || SUBFOLDER_LABELS[t] || (t.charAt(0).toUpperCase() + t.slice(1));
        var card = mk('div', 'cap-info-card');
        card.appendChild(mk('h4', '', label + ' (' + grouped[t].length + ')'));
        grouped[t].sort(function(a, b) { return (a.fm.title || a.fm.id || '').localeCompare(b.fm.title || b.fm.id || ''); }).forEach(function(r) {
          var link = mk('div', 'cap-backlink'); link.style.cursor = 'pointer';
          link.appendChild(mk('span', 'compliance-link', r.fm.title || r.fm.id || r.path.split('/').pop()));
          if (r.relation !== 'owner') link.appendChild(mk('span', 'doc-relation-note', ' · ' + r.relation));
          link.addEventListener('click', function(e) { go('doc/' + r.path, e); });
          card.appendChild(link);
        });
        grid.appendChild(card);
      });
      rc.body.appendChild(grid);
      roleArtifactsWrap = rc.wrap;
    }
  }

  // Body — split by ## into collapsible sections inside a card
  var docBodyCard = null;
  if (body && body.trim()) {
    var docBodySections = body.split(/^## /m);
    var docSections = docBodySections.slice(1).filter(function(s) { return s.trim(); });
    if (docSections.length) {
      docBodyCard = mk('div', 'app-sys-body-card');
      docBodyCard.appendChild(mkExpandAllBtn(docBodyCard));
      docSections.forEach(function(s) {
        var lines = s.split('\n'), title = lines[0].trim(), secBody = lines.slice(1).join('\n').trim();
        if (!secBody) return;
        var col = mkCollapsible(title, '', false);
        var bd = safeHtmlNode(renderMd(secBody));
        col.body.appendChild(bd); hookLinks(col.body, go, path);
        docBodyCard.appendChild(col.wrap);
      });
      mainEl.appendChild(docBodyCard);
    } else {
      // No ## sections — render as flat body
      var flatHtml = renderMd(body);
      if (flatHtml) {
        var flatBd = safeHtmlNode(flatHtml);
        mainEl.appendChild(flatBd);
        hookLinks(mainEl, go, path);
      }
    }
  }

  if (roleArtifactsWrap) mainEl.appendChild(roleArtifactsWrap);

  // Right panel — table of contents from collapsible headers
  fadeRight();
  rightEl.appendChild(mk('h3', '', 'On this page'));
  var tocCount = 0;
  if (docBodyCard) {
    mkTocFromCollapsibles(rightEl, docBodyCard);
    tocCount = docBodyCard.querySelectorAll(':scope > .std-collapse > .std-collapse-header').length;
  }
  if (!tocCount) {
    rightEl.textContent = '';
    rightEl.appendChild(mk('h3', '', 'Metadata'));
    ['id', 'type', 'status', 'domain', 'owner'].forEach(function(k) {
      if (!fm[k]) return;
      rightEl.appendChild(mkMetaRow(k, String(fm[k])));
    });
  }

  // Source info
  mkSourcePanel(rightEl, path);
}

function renderYmlDoc(path, text) {
  mainEl.textContent = ''; rightEl.textContent = '';
  const data = parseYml(text);
  if (!data || (data.ok === false)) { mainEl.appendChild(mk('p', 'error-msg', 'YAML parse error' + (data && data.error ? ': ' + data.error : ''))); return; }
  if (data.domain && data.capabilities) {
    mainEl.appendChild(mk('h1', '', 'Capabilities: ' + data.domain));
    data.capabilities.forEach(function(cap) {
      const c = mk('div', 'yml-cap-card'); const h = mk('h5'); h.textContent = (cap.name || cap.id) + ' '; h.appendChild(matDot(cap.maturity)); c.appendChild(h);
      ['summary', 'scope', 'owner'].forEach(function(k) { if (cap[k]) { const r = mk('div', ''); r.style.fontSize = '12px'; r.style.margin = '3px 0'; r.appendChild(mk('span', 'yml-key', k + ': ')); r.appendChild(document.createTextNode(String(cap[k]).trim())); c.appendChild(r); } });
      mainEl.appendChild(c);
    }); return;
  }
  const v = mk('div', 'yml-view'); renderYmlObj(data, v, 0); mainEl.appendChild(v);
}

function renderYmlObj(o, c, d) {
  if (Array.isArray(o)) o.forEach(function(i) { if (typeof i === 'object' && i) { const s = mk('div', 'yml-section'); renderYmlObj(i, s, d + 1); c.appendChild(s); } else { const l = mk('div', ''); l.style.paddingLeft = (d * 16) + 'px'; l.appendChild(mk('span', 'yml-list-marker', '- ')); l.appendChild(document.createTextNode(String(i))); c.appendChild(l); } });
  else if (typeof o === 'object' && o) Object.keys(o).forEach(function(k) { const v = o[k], l = mk('div', ''); l.style.paddingLeft = (d * 16) + 'px'; l.style.margin = '2px 0'; if (typeof v === 'object' && v) { l.appendChild(mk('span', 'yml-key', k + ':')); c.appendChild(l); renderYmlObj(v, c, d + 1); } else { l.appendChild(mk('span', 'yml-key', k + ': ')); l.appendChild(mk('span', 'yml-str', String(v))); c.appendChild(l); } });
  else c.appendChild(document.createTextNode(String(o)));
}

export function navigateDoc(path) {
  if (path.startsWith('systems/SYS-')) { go('sys/' + path.replace('systems/', '')); return; }
  const dd = path.split('/')[0];
  if (DOMAINS.find(function(d) { return d.dir === dd; }) && (path.endsWith('README.md') || path.endsWith('capabilities.yml'))) { go('domain/' + dd); return; }
  setActiveView(''); fadeMain();
  safeFetch(path).then(function(text) {
    if (path.endsWith('.yml')) {
      renderYmlDoc(path, text);
      return;
    }
    const p = parseFM(text);
    if (p.parseError) {
      mainEl.textContent = ''; rightEl.textContent = '';
      mainEl.appendChild(mk('div', 'error-msg', 'YAML frontmatter parse error: ' + p.parseError));
      const fbHtml = renderMd(p.body || text);
      mainEl.appendChild(safeHtmlNode(fbHtml)); hookLinks(mainEl, go, path);
      return;
    }
    if (p.fm && p.fm.type) {
      renderRichDoc(path, p.fm, p.body);
    } else {
      mainEl.textContent = ''; rightEl.textContent = '';
      const fbParts = path.split('/');
      const fbDom = DOMAINS.find(function(dd) { return dd.dir === fbParts[0]; });
      const fbBread = [];
      if (fbDom) fbBread.push({ label: fbDom.label, action: function() { go('domain/' + fbParts[0]); } });
      else fbBread.push({ label: 'Reference' });
      if (fbParts.length === 3) fbBread.push({ label: fbParts[1].charAt(0).toUpperCase() + fbParts[1].slice(1).replace(/-/g, ' ') });
      fbBread.push({ label: fbParts[fbParts.length - 1] });
      setBread(fbBread);
      const fbHtml = renderMd(p.body || text);
      const bd = safeHtmlNode(fbHtml);
      mainEl.appendChild(bd); hookLinks(mainEl, go, path);
      // TOC for plain markdown docs (no frontmatter)
      rightEl.appendChild(mk('h3', '', 'On this page'));
      const fbHeadRe = /<h([23])[^>]*>(.*?)<\/h\1>/gi;
      let fbHm;
      while ((fbHm = fbHeadRe.exec(fbHtml)) !== null) {
        const fbLvl = fbHm[1]; const fbTxt = stripTags(fbHm[2]).trim(); if (!fbTxt) continue;
        const fbTi = mk('div', 'toc-item'); if (fbLvl === '3') fbTi.style.paddingLeft = '12px'; fbTi.textContent = fbTxt;
        (function(t) { fbTi.addEventListener('click', function() { var hs = mainEl.querySelectorAll('h2, h3'); for (var i = 0; i < hs.length; i++) { if (hs[i].textContent.trim() === t) { hs[i].scrollIntoView({ behavior: 'smooth', block: 'start' }); break; } } }); })(fbTxt);
        rightEl.appendChild(fbTi);
      }
      // Source info
      mkSourcePanel(rightEl, path);
    }
  }).catch(function(err) { mainEl.textContent = ''; mainEl.appendChild(mk('div', 'error-msg', 'Unable to load: ' + path + (err && err.message ? ' (' + err.message + ')' : ''))); rightEl.textContent = ''; });
}
