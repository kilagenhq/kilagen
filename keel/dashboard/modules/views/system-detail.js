import { mk, svgEl, matDot, mkCopyBtn, mkIcon, mkFlipIcon, mkCollapsible, mkMetaRow, ghUrl, mkExpandAllBtn, mkSourcePanel, mkTocFromCollapsibles, roleTitle } from '../dom.js';
import { state } from '../state.js';
import { go, setActiveView, setBread, fadeMain, mainEl, rightEl } from '../nav.js';
import { DOMAINS, DOC_TYPE_COLORS, fwLabel, CRIT_COLORS } from '../constants.js';
import { safeFetch, hookLinks } from '../security.js';
import { parseFM, renderMd, safeHtmlNode } from '../parsers.js';

export function appNavigateSystem(path) {
  setActiveView('systems'); fadeMain(); mainEl.textContent = ''; rightEl.textContent = ''; setBread([{ label: 'Systems', action: function() { go('systems'); } }, { label: path.split('/').pop().replace('.md', '') }]);
  safeFetch(path).then(function(text) {
    const p = parseFM(text), fm = p.fm || {};

    // === Hero ===
    const hero = mk('div', 'app-sys-hero');
    const titleRow = mk('div', 'doc-title-row'); titleRow.appendChild(mkIcon('system')); const sysH1 = mk('h1', '', fm.title || fm.id || path); sysH1.appendChild(mkCopyBtn()); titleRow.appendChild(sysH1); hero.appendChild(titleRow);

    // Badges: domain chips + capability chips with maturity dot
    const badges = mk('div', 'cap-badges');
    if (fm.domains && fm.domains.length) {
      fm.domains.forEach(function(dom) {
        var dObj = DOMAINS.find(function(dd) { return dd.dir === dom || dd.dir.endsWith('-' + dom); });
        var ch = mk('span', 'domain-chip');
        ch.style.fontSize = '11px'; ch.style.padding = '2px 10px'; ch.style.cursor = 'pointer'; ch.style.display = 'inline-flex'; ch.style.alignItems = 'center'; ch.style.gap = '4px';
        ch.appendChild(mkIcon('domain', 'doc-badge-icon'));
        ch.appendChild(document.createTextNode(dObj ? dObj.label : dom));
        ch.addEventListener('click', function() { if (dObj) go('domain/' + dObj.dir); });
        badges.appendChild(ch);
      });
    }
    if (fm.capabilities) {
      Object.keys(fm.capabilities).forEach(function(dom) {
        const dObj = DOMAINS.find(function(dd) { return dd.dir === dom || dd.dir.endsWith('-' + dom); });
        var ids = fm.capabilities[dom]; if (!Array.isArray(ids)) return;
        ids.forEach(function(cid) {
          var dc = state.domainCaps[dObj ? dObj.dir : ''];
          var capObj = dc && dc[cid];
          var capChip = mk('span', 'cap-pill');
          capChip.style.cursor = 'pointer'; capChip.style.display = 'inline-flex'; capChip.style.alignItems = 'center'; capChip.style.gap = '4px';
          capChip.appendChild(mkIcon('capability', 'doc-badge-icon'));
          capChip.appendChild(document.createTextNode(cid));
          capChip.addEventListener('click', function() { if (dObj) go('cap/' + dObj.dir + '/' + cid); });
          badges.appendChild(capChip);
        });
      });
    }
    hero.appendChild(badges);
    if (fm.description) {
      const summaryRow = mk('div', 'cap-quote-row');
      summaryRow.appendChild(mk('blockquote', 'cap-quote', String(fm.description).trim()));
      hero.appendChild(summaryRow);
    }
    mainEl.appendChild(hero);

    // === Governance (info-grid cards) ===
    function mkDetailsCard() {
      var card = mk('div', 'doc-info-card');
      card.appendChild(mk('h4', '', 'Details'));
      [['Category', fm.category], ['Status', fm.status], ['Vendor', fm.vendor], ['Deployment', fm.deployment], ['Owner', roleTitle(fm.owner)], ['Second owner', roleTitle(fm.second_owner)], ['Last reviewed', fm.last_reviewed], ['Next review', fm.next_review]].forEach(function(f) {
        if (!f[1]) return;
        var dr = mk('div', 'doc-info-row'); dr.appendChild(mk('span', 'doc-info-key', f[0])); dr.appendChild(mk('span', 'doc-info-val', String(f[1]))); card.appendChild(dr);
      });
      return card;
    }
    var gov = fm.governance;
    var hasGovContent = gov && (gov.criticality || gov.cia || gov.rto || gov.rpo || gov.auth || (gov.used_by && gov.used_by.length) || (gov.data_assets && gov.data_assets.length));
    if (hasGovContent) {
      var govGrid = mk('div', 'doc-info-grid');
      // Card 1: Risk profile
      var riskCard = mk('div', 'doc-info-card');
      riskCard.appendChild(mk('h4', '', 'Risk profile'));
      if (gov.criticality) { var cr = mk('div', 'doc-info-row'); cr.appendChild(mk('span', 'doc-info-key', 'Criticality')); var cv = mk('span', 'doc-info-val'); cv.textContent = gov.criticality; cv.style.color = CRIT_COLORS[gov.criticality] || 'var(--fg)'; cv.style.fontWeight = '600'; cr.appendChild(cv); riskCard.appendChild(cr); }
      if (gov.cia) {
        ['confidentiality', 'integrity', 'availability'].forEach(function(dim) {
          if (!gov.cia[dim]) return;
          var r = mk('div', 'doc-info-row'); r.appendChild(mk('span', 'doc-info-key', dim.charAt(0).toUpperCase() + dim.slice(1))); var v = mk('span', 'doc-info-val'); v.textContent = gov.cia[dim]; v.style.color = CRIT_COLORS[gov.cia[dim]] || 'var(--fg)'; r.appendChild(v); riskCard.appendChild(r);
        });
      }
      if (gov.rto) { var rr = mk('div', 'doc-info-row'); rr.appendChild(mk('span', 'doc-info-key', 'RTO')); rr.appendChild(mk('span', 'doc-info-val', gov.rto)); riskCard.appendChild(rr); }
      if (gov.rpo) { var rp = mk('div', 'doc-info-row'); rp.appendChild(mk('span', 'doc-info-key', 'RPO')); rp.appendChild(mk('span', 'doc-info-val', gov.rpo)); riskCard.appendChild(rp); }
      govGrid.appendChild(riskCard);
      // Card 2: Operations
      var opsCard = mk('div', 'doc-info-card');
      opsCard.appendChild(mk('h4', '', 'Operations'));
      if (gov.auth) { var au = mk('div', 'doc-info-row'); au.appendChild(mk('span', 'doc-info-key', 'Auth')); au.appendChild(mk('span', 'doc-info-val', gov.auth)); opsCard.appendChild(au); }
      if (gov.used_by && gov.used_by.length) { var ub = mk('div', 'doc-info-row'); ub.appendChild(mk('span', 'doc-info-key', 'Used by')); ub.appendChild(mk('span', 'doc-info-val', gov.used_by.join(', '))); opsCard.appendChild(ub); }
      if (gov.data_assets && gov.data_assets.length) {
        var daR = mk('div', 'doc-info-row'); daR.appendChild(mk('span', 'doc-info-key', 'Data assets'));
        var daV = mk('span', 'doc-info-val');
        gov.data_assets.forEach(function(daId, i) {
          if (i) daV.appendChild(document.createTextNode(', '));
          var daPath = state.idToPath[daId];
          var link = mk('span', 'compliance-link', daId.replace('DA-', ''));
          if (daPath) {
            link.addEventListener('click', function(e) { e.stopPropagation(); go('doc/' + daPath, e); });
          } else {
            link.style.color = 'var(--fg3)';
            link.title = 'Not found in the program';
          }
          daV.appendChild(link);
        });
        daR.appendChild(daV); opsCard.appendChild(daR);
      }
      govGrid.appendChild(opsCard);
      govGrid.appendChild(mkDetailsCard());
      govGrid.style.gridTemplateColumns = 'repeat(3, 1fr)';
      mainEl.appendChild(govGrid);
    } else {
      // No governance — still show details card
      var detGrid = mk('div', 'doc-info-grid'); detGrid.style.gridTemplateColumns = '1fr';
      detGrid.appendChild(mkDetailsCard());
      mainEl.appendChild(detGrid);
    }

    // === Markdown body sections (collapsible, inside a card) ===
    if (p.body) {
      var bodySections = p.body.split(/^## /m);
      var sections = bodySections.slice(1).filter(function(s) { return s.trim(); });
      if (sections.length) {
        var bodyCard = mk('div', 'app-sys-body-card');
        bodyCard.appendChild(mkExpandAllBtn(bodyCard));
        sections.forEach(function(s) {
          var lines = s.split('\n'), title = lines[0].trim(), body = lines.slice(1).join('\n').trim();
          if (!body) return;
          var col = mkCollapsible(title, '', false);
          var bd = safeHtmlNode(renderMd(body));
          col.body.appendChild(bd); hookLinks(col.body, go);
          bodyCard.appendChild(col.wrap);
        });
        mainEl.appendChild(bodyCard);
      }
    }

    // === Collect related document paths from frontmatter ===
    var relatedSysIds = [fm.id];
    var explicitRelated = {};
    if (fm.related) {
      Object.keys(fm.related).forEach(function(relType) {
        if (!Array.isArray(fm.related[relType])) return;
        explicitRelated[relType] = fm.related[relType];
      });
    }

    // === Related documents (collapsible + filter chips) ===
    var RESOURCE_TYPES = [
      { key: 'process', label: 'Processes' },
      { key: 'runbook', label: 'Runbooks' },
      { key: 'playbook', label: 'Playbooks' },
      { key: 'guideline', label: 'Guidelines' },
      { key: 'threat-model', label: 'Threat Models' },
      { key: 'policy', label: 'Policies' },
      { key: 'risk', label: 'Risks' },
      { key: 'vendor', label: 'Vendors' },
      { key: 'data-asset', label: 'Data Assets' },
      { key: 'business-process', label: 'Business Processes' }
    ];
    var resourcesByType = {};
    RESOURCE_TYPES.forEach(function(rt) { resourcesByType[rt.key] = []; });

    var explicitIds = {};
    Object.keys(explicitRelated).forEach(function(relType) {
      explicitRelated[relType].forEach(function(rid) { explicitIds[rid] = true; });
    });

    Object.keys(state.fmCache).forEach(function(pp) {
      var docFm = state.fmCache[pp];
      if (!docFm || !docFm.type) return;
      if (docFm.type === 'system' || docFm.type === 'standard') return;
      var typeKey = docFm.type === 'threat-model' ? 'threat-model' : docFm.type;
      if (!resourcesByType[typeKey]) return;

      var matched = false;
      if (docFm.related && docFm.related.systems && Array.isArray(docFm.related.systems)) {
        docFm.related.systems.forEach(function(sid) { if (relatedSysIds.indexOf(sid) !== -1) matched = true; });
      }
      if (docFm.id && explicitIds[docFm.id]) matched = true;

      if (matched) {
        var already = resourcesByType[typeKey].some(function(r) { return r.path === pp; });
        if (!already) resourcesByType[typeKey].push({ path: pp, fm: docFm, id: docFm.id || pp });
      }
    });

    var resTotalCount = 0;
    RESOURCE_TYPES.forEach(function(rt) { resTotalCount += resourcesByType[rt.key].length; });

    if (resTotalCount > 0) {
      var resCollapse = mkCollapsible('Related documents (' + resTotalCount + ')', '', false);
      mainEl.appendChild(resCollapse.wrap);
      var resToolbar = mk('div', 'cap-res-toolbar');
      var chipBar = mk('div', 'cap-res-chips');
      var activeFilters = {};
      var resViewMode = 'cards';
      var resContainer = mk('div', '');

      RESOURCE_TYPES.forEach(function(rt) {
        var count = resourcesByType[rt.key].length;
        var defaultOn = count > 0;
        var chip = mk('button', 'cap-res-chip' + (defaultOn ? ' active' : ''), rt.label + ' (' + count + ')');
        var chipColor = DOC_TYPE_COLORS[rt.key] || DOC_TYPE_COLORS['default'];
        chip.style.setProperty('--chip-color', chipColor);
        if (!count) { chip.disabled = true; chip.classList.add('disabled'); }
        activeFilters[rt.key] = defaultOn;
        chip.addEventListener('click', function() {
          if (!count) return;
          activeFilters[rt.key] = !activeFilters[rt.key];
          chip.classList.toggle('active', activeFilters[rt.key]);
          renderResources();
        });
        chipBar.appendChild(chip);
      });
      resToolbar.appendChild(chipBar);

      var resFlip = mk('button', 'cap-res-flip');
      resFlip.appendChild(mkFlipIcon('grid'));
      resFlip.title = 'Switch to table';
      resFlip.addEventListener('click', function() {
        resFlip.textContent = '';
        if (resViewMode === 'cards') { resViewMode = 'table'; resFlip.appendChild(mkFlipIcon('list')); resFlip.title = 'Switch to cards'; }
        else { resViewMode = 'cards'; resFlip.appendChild(mkFlipIcon('grid')); resFlip.title = 'Switch to table'; }
        renderResources();
      });
      resToolbar.appendChild(resFlip);
      resCollapse.body.appendChild(resToolbar);
      resCollapse.body.appendChild(resContainer);

      function getFilteredResources() {
        var items = [];
        RESOURCE_TYPES.forEach(function(rt) {
          if (!activeFilters[rt.key]) return;
          resourcesByType[rt.key].forEach(function(r) { items.push({ typeKey: rt.key, typeLabel: rt.label, path: r.path, fm: r.fm, id: r.id }); });
        });
        return items;
      }

      function renderResources() {
        resContainer.textContent = '';
        var items = getFilteredResources();
        if (!items.length) { resContainer.appendChild(mk('p', 'grc-empty', 'No resources match the active filters.')); return; }
        if (resViewMode === 'cards') { renderResCards(items); } else { renderResTable(items); }
      }

      function renderResCards(items) {
        var grid = mk('div', 'app-sys-caps-grid');
        items.forEach(function(item) {
          var card = mk('div', 'cap-sys-card');
          var color = DOC_TYPE_COLORS[item.typeKey] || DOC_TYPE_COLORS['default'];
          var bar = mk('div', 'sys-icon'); bar.style.background = color; card.appendChild(bar);
          var info = mk('div', 'sys-info');
          info.appendChild(mk('h5', '', item.fm.title || item.fm.id || item.id));
          var desc = item.fm.description ? String(item.fm.description).trim().substring(0, 100) : '';
          info.appendChild(mk('p', '', desc || item.typeLabel));
          card.appendChild(info);
          card.addEventListener('click', function(e) { go('doc/' + item.path, e); });
          grid.appendChild(card);
        });
        resContainer.appendChild(grid);
      }

      function renderResTable(items) {
        var tbl = mk('table', 'compliance-table');
        var thead = mk('thead'); var hr = mk('tr');
        ['Name', 'Type', 'Description'].forEach(function(h) { hr.appendChild(mk('th', '', h)); });
        thead.appendChild(hr); tbl.appendChild(thead);
        var tbody = mk('tbody');
        items.forEach(function(item) {
          var tr = mk('tr'); tr.style.cursor = 'pointer';
          tr.addEventListener('click', function(e) { go('doc/' + item.path, e); });
          var nameCell = mk('td'); nameCell.appendChild(mk('span', 'compliance-link', item.fm.title || item.fm.id || item.id)); tr.appendChild(nameCell);
          tr.appendChild(mk('td', '', item.typeLabel));
          tr.appendChild(mk('td', '', item.fm.description ? String(item.fm.description).trim().substring(0, 120) : '-'));
          tbody.appendChild(tr);
        });
        tbl.appendChild(tbody);
        resContainer.appendChild(tbl);
      }

      renderResources();
    }

    // === Applicable standards (collapsible with requirement tables) ===
    var stdReqData = [];
    var explicitStdIds = (fm.related && fm.related.standards) ? fm.related.standards : [];
    var sysCaps = {};
    if (fm.capabilities) {
      Object.keys(fm.capabilities).forEach(function(dom) {
        var dObj = DOMAINS.find(function(dd) { return dd.dir === dom || dd.dir.endsWith('-' + dom); });
        var domShort = dObj ? dObj.dir.replace(/^\d+-/, '') : dom;
        sysCaps[domShort] = fm.capabilities[dom];
      });
    }

    Object.keys(state.fmCache).forEach(function(pp) {
      var stdFm = state.fmCache[pp];
      if (!stdFm || stdFm.type !== 'standard') return;
      var isExplicit = explicitStdIds.indexOf(stdFm.id) !== -1;
      var matchedReqs = [];
      if (stdFm.requirements) {
        matchedReqs = stdFm.requirements.filter(function(r) {
          if (!r.capabilities) return false;
          var found = false;
          Object.keys(sysCaps).forEach(function(domShort) {
            var domCaps = r.capabilities[domShort];
            if (!Array.isArray(domCaps)) return;
            sysCaps[domShort].forEach(function(cid) { if (domCaps.indexOf(cid) !== -1) found = true; });
          });
          return found;
        });
      }
      if (isExplicit || matchedReqs.length) {
        stdReqData.push({ path: pp, fm: stdFm, reqs: matchedReqs, explicit: isExplicit });
      }
    });

    var stdCollapse = mkCollapsible('Applicable standards (' + stdReqData.length + ')', '', false);
    mainEl.appendChild(stdCollapse.wrap);

    if (!stdReqData.length) {
      stdCollapse.body.appendChild(mk('p', 'grc-empty', 'No standards reference this system yet.'));
    } else {
      stdReqData.sort(function(a, b) { return (a.fm.title || a.fm.id || '').localeCompare(b.fm.title || b.fm.id || '', undefined, { numeric: true }); });
      stdReqData.forEach(function(s) {
        var mappedCount = s.reqs.filter(function(r) { return r.frameworks && Object.keys(r.frameworks).length; }).length;
        var wrap = mk('div', 'std-collapse');
        var header = mk('div', 'std-collapse-header');
        header.appendChild(mk('span', 'std-collapse-arrow', '\u25B8'));
        var titleLink = mk('span', 'compliance-link', s.fm.title || s.fm.id);
        titleLink.addEventListener('click', function(e) { e.stopPropagation(); go('doc/' + s.path, e); });
        header.appendChild(titleLink);
        var summary = s.reqs.length ? s.reqs.length + ' req' + (s.reqs.length > 1 ? 's' : '') + ' (' + mappedCount + ' mapped)' : 'related';
        header.appendChild(mk('span', 'std-collapse-summary', summary));
        var body = mk('div', 'std-collapse-body');
        body.style.display = 'none';
        header.addEventListener('click', function() {
          var open = body.style.display !== 'none';
          body.style.display = open ? 'none' : 'block';
          header.querySelector('.std-collapse-arrow').textContent = open ? '\u25B8' : '\u25BE';
        });
        wrap.appendChild(header);
        if (s.reqs.length) {
          var tbl = mk('table', 'compliance-table');
          var thead = mk('thead'); var hr = mk('tr');
          ['Req', 'Summary', 'Frameworks'].forEach(function(h) { hr.appendChild(mk('th', '', h)); });
          thead.appendChild(hr); tbl.appendChild(thead);
          var tbody = mk('tbody');
          s.reqs.slice().sort(function(a, b) { return (a.ref || '').localeCompare(b.ref || '', undefined, { numeric: true }); }).forEach(function(r) {
            var tr = mk('tr');
            tr.appendChild(mk('td', '', r.ref));
            tr.appendChild(mk('td', '', r.summary || ''));
            var fwCell = mk('td');
            if (r.frameworks && Object.keys(r.frameworks).length) {
              Object.keys(r.frameworks).forEach(function(fw) {
                var cls = r.frameworks[fw];
                if (Array.isArray(cls)) cls.forEach(function(c) { fwCell.appendChild(mk('span', 'req-fw-badge', fwLabel(fw) + ' ' + c)); });
              });
            } else {
              fwCell.appendChild(mk('span', 'req-fw-badge req-fw-internal', 'internal'));
            }
            tr.appendChild(fwCell);
            tbody.appendChild(tr);
          });
          tbl.appendChild(tbody);
          body.appendChild(tbl);
        } else {
          body.appendChild(mk('p', 'grc-empty', 'No capability-mapped requirements. Standard is explicitly related.'));
        }
        wrap.appendChild(body);
        stdCollapse.body.appendChild(wrap);
      });
    }

    // === Right panel ===
    // On this page — body card sections first, then related/standards (indented)
    rightEl.appendChild(mk('h3', '', 'On this page'));
    var bodyCardEl = mainEl.querySelector('.app-sys-body-card');
    if (bodyCardEl) {
      mkTocFromCollapsibles(rightEl, bodyCardEl);
    }
    mkTocFromCollapsibles(rightEl, mainEl);
    mkSourcePanel(rightEl, path);
  }).catch(function(err) { mainEl.textContent = ''; rightEl.textContent = ''; mainEl.appendChild(mk('div', 'error-msg', 'Unable to load: ' + path + (err && err.message ? ' (' + err.message + ')' : ''))); });
}
