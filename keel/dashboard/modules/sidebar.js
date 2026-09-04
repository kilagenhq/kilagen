import { mk, mkIcon } from './dom.js';
import { DOMAINS, SUBFOLDER_LABELS, SUBFOLDER_ICONS } from './constants.js';
import { state } from './state.js';
import { go } from './nav.js';

var treeEl = document.getElementById('tree');
var searchEl = document.getElementById('search');

function getDocsForDomain(dir) {
  return state.allDocs.filter(function(d) {
    return d.path.startsWith(dir + '/') && d.path !== dir + '/README.md' && d.path !== dir + '/capabilities.yml';
  });
}

function groupBySubfolder(docs, dir) {
  var groups = {};
  docs.forEach(function(d) {
    var rest = d.path.substring(dir.length + 1);
    var parts = rest.split('/');
    if (parts.length >= 2) {
      var subfolder = parts[0];
      if (!groups[subfolder]) groups[subfolder] = [];
      groups[subfolder].push(d);
    }
  });
  return groups;
}

function docLabel(doc) {
  var fm = state.fmCache[doc.path];
  if (fm) return fm.title || fm.id || doc.name;
  return doc.name.replace(/\.(?:md|yml)$/, '');
}

// --- Reusable builders ---

function mkItem(parent, label, iconType, route) {
  var item = mk('div', 'app-nav-item');
  if (state.currentDoc === route) item.classList.add('active');
  var lbl = mk('span', 'sidebar-label-inner');
  if (iconType) lbl.appendChild(mkIcon(iconType, 'sidebar-icon'));
  lbl.appendChild(document.createTextNode(label));
  item.appendChild(lbl);
  item.addEventListener('click', function(e) { go(route, e); });
  parent.appendChild(item);
  return item;
}

function mkSection(label, iconType, stateKey, defaultOpen, onHeaderClick) {
  var isExpanded = state.expandedDomains[stateKey] !== undefined ? !!state.expandedDomains[stateKey] : !!defaultOpen;
  var filter = searchEl.value.toLowerCase().trim();
  if (filter) isExpanded = true;

  var header = mk('div', 'app-nav-item section-header');
  var arrow = mk('span', '', isExpanded ? '\u25BE' : '\u25B8');
  arrow.style.fontSize = '9px'; arrow.style.minWidth = '10px'; arrow.style.color = 'var(--fg3)'; arrow.style.cursor = 'pointer';
  arrow.addEventListener('click', function(e) {
    e.stopPropagation();
    state.expandedDomains[stateKey] = !isExpanded;
    rebuildSidebar();
  });
  header.appendChild(arrow);
  var lbl = mk('span', 'sidebar-label-inner');
  if (iconType) lbl.appendChild(mkIcon(iconType, 'sidebar-icon'));
  lbl.appendChild(document.createTextNode(label));
  header.appendChild(lbl);
  header.addEventListener('click', function(e) {
    if (!isExpanded) { state.expandedDomains[stateKey] = true; rebuildSidebar(); }
    if (onHeaderClick) onHeaderClick(e);
  });
  treeEl.appendChild(header);

  if (!isExpanded) return null;
  var children = mk('div', 'sidebar-children');
  treeEl.appendChild(children);
  return children;
}

var SUBFOLDER_BROWSE = { policies: 'policy', standards: 'standard', processes: 'process', runbooks: 'runbook', guidelines: 'guideline', playbooks: 'playbook', 'threat-models': 'threat-model', vendors: 'vendor', risks: 'risk', threats: 'threat', exceptions: 'exception' };

function mkSubfolderLinks(parent, dir, docs) {
  var filter = searchEl.value.toLowerCase().trim();
  var groups = groupBySubfolder(docs, dir);
  Object.keys(groups).sort().forEach(function(subfolder) {
    var sfDocs = groups[subfolder];
    var label = SUBFOLDER_LABELS[subfolder] || subfolder;
    var count = filter ? sfDocs.filter(function(d) { return docLabel(d).toLowerCase().indexOf(filter) !== -1; }).length : sfDocs.length;
    if (!count) return;
    var typeKey = SUBFOLDER_BROWSE[subfolder];
    var route = typeKey ? 'browse/' + typeKey + '/' + dir : null;
    if (!route) return;
    var subIcon = SUBFOLDER_ICONS[subfolder];
    mkItem(parent, label + ' (' + count + ')', subIcon, route);
  });
}

// ================================================================
export function rebuildSidebar() {
  treeEl.textContent = '';
  var filter = searchEl.value.toLowerCase().trim();

  // ── GOVERNANCE ──
  var govChildren = mkSection('Governance', 'dom-grc', '_governance', false, function(e) { go('standards', e); });
  if (govChildren) {
    // Collect all governance items into a single array, then sort alphabetically
    var govAllItems = [];

    // GRC subfolders
    var grcDocs = getDocsForDomain('01-grc');
    if (grcDocs.length) {
      var groups = groupBySubfolder(grcDocs, '01-grc');
      Object.keys(groups).forEach(function(subfolder) {
        var sfDocs = groups[subfolder];
        var label = SUBFOLDER_LABELS[subfolder] || subfolder;
        var count = filter ? sfDocs.filter(function(d) { return docLabel(d).toLowerCase().indexOf(filter) !== -1; }).length : sfDocs.length;
        if (!count) return;
        var typeKey = SUBFOLDER_BROWSE[subfolder];
        if (!typeKey) return;
        var subIcon = SUBFOLDER_ICONS[subfolder];
        govAllItems.push({ label: label, count: count, icon: subIcon, route: 'browse/' + typeKey + '/01-grc' });
      });
    }

    // Data Assets
    var daCount = state.allDocs.filter(function(d) { return d.path.startsWith('data-assets/DA-'); }).length;
    if (daCount) govAllItems.push({ label: 'Data Assets', count: daCount, icon: 'data-asset', route: 'browse/data-asset' });

    // Business Processes
    var bpCount = state.allDocs.filter(function(d) { return d.path.startsWith('business-processes/BP-'); }).length;
    if (bpCount) govAllItems.push({ label: 'Business Processes', count: bpCount, icon: 'business-process', route: 'browse/business-process' });

    // Sort and render
    govAllItems.sort(function(a, b) { return a.label.localeCompare(b.label); });
    govAllItems.forEach(function(item) {
      if (filter && item.label.toLowerCase().indexOf(filter) === -1) return;
      mkItem(govChildren, item.label + ' (' + item.count + ')', item.icon, item.route);
    });
  }

  // ── DOMAINS ──
  var domChildren = mkSection('Domains', 'domain', '_domains', true, function(e) { go('domains', e); });
  if (domChildren) {
    DOMAINS.filter(function(dd) { return dd.dir !== '01-grc'; }).forEach(function(dd) {
      var dc = state.domainCaps[dd.dir];
      var capKeys = dc ? Object.keys(dc) : [];
      var domDocs = getDocsForDomain(dd.dir);
      var isDomExpanded = !!state.expandedDomains[dd.dir] || !!filter;

      if (filter) {
        var domainMatch = dd.label.toLowerCase().indexOf(filter) !== -1 || dd.dir.indexOf(filter) !== -1;
        var capMatch = capKeys.some(function(c) { return (dc[c].name || c).toLowerCase().indexOf(filter) !== -1; });
        var docMatch = domDocs.some(function(d) { return docLabel(d).toLowerCase().indexOf(filter) !== -1; });
        if (!domainMatch && !capMatch && !docMatch) return;
      }

      // Domain row (L2) — collapsible
      var row = mk('div', 'app-nav-item');
      if (state.currentDoc === dd.dir) row.classList.add('active');
      var dArrow = mk('span', '', isDomExpanded ? '\u25BE' : '\u25B8');
      dArrow.style.fontSize = '9px'; dArrow.style.minWidth = '10px'; dArrow.style.color = 'var(--fg3)'; dArrow.style.cursor = 'pointer';
      dArrow.addEventListener('click', function(e) { e.stopPropagation(); state.expandedDomains[dd.dir] = !state.expandedDomains[dd.dir]; rebuildSidebar(); });
      row.appendChild(dArrow);
      var dLabel = mk('span', 'sidebar-label-inner'); dLabel.appendChild(mkIcon(dd.iconType, 'sidebar-icon')); dLabel.appendChild(document.createTextNode(dd.label)); row.appendChild(dLabel);
      row.addEventListener('click', function(e) { if (!state.expandedDomains[dd.dir]) { state.expandedDomains[dd.dir] = true; rebuildSidebar(); } go('domain/' + dd.dir, e); });
      domChildren.appendChild(row);

      if (!isDomExpanded) return;

      // Domain children (L3) — subfolder links only
      var domInner = mk('div', 'sidebar-children');
      domChildren.appendChild(domInner);
      if (domDocs.length) mkSubfolderLinks(domInner, dd.dir, domDocs);
    });
  }

  // ── SCHEDULE ──
  if (state.schedule && state.schedule.length) {
    var schedHeader = mk('div', 'app-nav-item section-header');
    schedHeader.style.cursor = 'pointer';
    if (state.currentView === 'schedule') schedHeader.classList.add('active');
    var schedLbl = mk('span', 'sidebar-label-inner');
    schedLbl.appendChild(mkIcon('schedule', 'sidebar-icon'));
    schedLbl.appendChild(document.createTextNode('Schedule (' + state.schedule.length + ')'));
    schedHeader.appendChild(schedLbl);
    schedHeader.addEventListener('click', function(e) { go('schedule', e); });
    treeEl.appendChild(schedHeader);
  }

  // ── SYSTEMS ──
  var sysCount = state.allDocs.filter(function(d) { return d.path.startsWith('systems/SYS-'); }).length;
  var sysHeader = mk('div', 'app-nav-item section-header');
  sysHeader.style.cursor = 'pointer';
  if (state.currentView === 'systems') sysHeader.classList.add('active');
  var sysLbl = mk('span', 'sidebar-label-inner');
  sysLbl.appendChild(mkIcon('system', 'sidebar-icon'));
  sysLbl.appendChild(document.createTextNode('Systems (' + sysCount + ')'));
  sysHeader.appendChild(sysLbl);
  sysHeader.addEventListener('click', function(e) { go('systems', e); });
  treeEl.appendChild(sysHeader);

  // ── ADRs ──
  var adrCount = state.allDocs.filter(function(d) { return d.path.startsWith('adr/'); }).length;
  if (adrCount) {
    var adrHeader = mk('div', 'app-nav-item section-header');
    adrHeader.style.cursor = 'pointer';
    if (state.currentView === 'adrs') adrHeader.classList.add('active');
    var adrLbl = mk('span', 'sidebar-label-inner');
    adrLbl.appendChild(mkIcon('adr', 'sidebar-icon'));
    adrLbl.appendChild(document.createTextNode('ADRs (' + adrCount + ')'));
    adrHeader.appendChild(adrLbl);
    adrHeader.addEventListener('click', function(e) { go('adrs', e); });
    treeEl.appendChild(adrHeader);
  }
}
