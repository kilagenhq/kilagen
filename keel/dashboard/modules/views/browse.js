import { mk, mkIcon, mkMetaRow, roleTitle } from '../dom.js';
import { state } from '../state.js';
import { go, setActiveView, setBread, fadeMain, mainEl, rightEl } from '../nav.js';
import { DOMAINS, DOC_TYPE_COLORS, FRAMEWORK_LABELS, fwLabel, CRIT_COLORS } from '../constants.js';

var DOC_TYPES = [
  { key: 'policy', label: 'Policies' }, { key: 'standard', label: 'Standards' },
  { key: 'process', label: 'Processes' }, { key: 'runbook', label: 'Runbooks' },
  { key: 'guideline', label: 'Guidelines' }, { key: 'playbook', label: 'Playbooks' },
  { key: 'threat-model', label: 'Threat Models' }, { key: 'threat', label: 'Threats' },
  { key: 'risk', label: 'Risks' }, { key: 'exception', label: 'Exceptions' },
  { key: 'vendor', label: 'Vendors' }, { key: 'system', label: 'Systems' },
  { key: 'adr', label: 'ADRs' }, { key: 'incident', label: 'Incidents' },
  { key: 'data-asset', label: 'Data Assets' }, { key: 'business-process', label: 'Business Processes' },
  { key: 'role', label: 'Roles' }
];
var STATUS_LIST = ['active', 'draft', 'deprecated', 'expired', 'revoked'];
var CAT_LABELS = { 'security-tool': 'Security Tool', 'business-app': 'Business App', 'infrastructure': 'Infrastructure' };
var DEPLOY_LABELS = { saas: 'SaaS', iaas: 'IaaS', 'self-hosted': 'Self-hosted', hybrid: 'Hybrid' };

function domainFromPath(p) {
  var m = p.match(/^(\d{2}-[^/]+)\//);
  if (m) return m[1];
  if (p.startsWith('systems/')) return 'systems';
  if (p.startsWith('adr/')) return 'adr';
  if (p.startsWith('data-assets/')) return 'data-assets';
  if (p.startsWith('business-processes/')) return 'business-processes';
  if (p.startsWith('roles/')) return 'roles';
  return 'root';
}

function domainLabel(dir) {
  var d = DOMAINS.find(function(dd) { return dd.dir === dir; });
  if (d) return d.label;
  if (dir === 'systems') return 'Systems';
  if (dir === 'adr') return 'ADRs';
  if (dir === 'data-assets') return 'Data Assets';
  if (dir === 'business-processes') return 'Business Processes';
  return dir;
}

function reviewClass(dateStr) {
  if (!dateStr) return '';
  var d = new Date(dateStr);
  var now = new Date();
  if (d < now) return 'browse-overdue';
  if (d < new Date(now.getTime() + 30 * 86400000)) return 'browse-soon';
  return '';
}

function collectDocs() {
  var docs = [];
  Object.keys(state.fmCache).forEach(function(p) {
    if (p.startsWith('templates/') || p.startsWith('schemas/') || p.startsWith('dashboard/')) return;
    if (/\/README\.md$/.test(p) || /\/capabilities\.yml$/.test(p)) return;
    var fm = state.fmCache[p];
    if (!fm || !fm.type) return;
    var frameworks = {};
    if (fm.requirements && Array.isArray(fm.requirements)) {
      fm.requirements.forEach(function(r) { if (r.frameworks) Object.keys(r.frameworks).forEach(function(fw) { frameworks[fw] = true; }); });
    }
    if (fm.frameworks) Object.keys(fm.frameworks).forEach(function(fw) { frameworks[fw] = true; });
    var gov = fm.governance || {};
    var cia = gov.cia || {};
    docs.push({
      path: p, type: fm.type,
      title: fm.title || fm.id || p.split('/').pop().replace(/\.(?:md|yml)$/, ''),
      id: fm.id || '', status: fm.status || 'active', owner: fm.owner || '',
      second_owner: fm.second_owner || '',
      domain: domainFromPath(p), next_review: fm.next_review || '',
      description: fm.description || '', frameworks: Object.keys(frameworks),
      category: fm.category || '', deployment: fm.deployment || '',
      criticality: gov.criticality || fm.criticality || '', confidentiality: cia.confidentiality || fm.confidentiality || '',
      integrity: cia.integrity || fm.integrity || '', availability: cia.availability || fm.availability || '',
      rto: gov.rto || fm.rto || '', rpo: gov.rpo || fm.rpo || '', auth: gov.auth || '',
      data_assets: gov.data_assets || [],
      domains_arr: fm.domains || [],
      // Data asset fields
      classification: fm.classification || '', pii: fm.pii,
      retention_years: fm.retention_years,
      // Business process fields
      business_function: fm.business_function || '',
      customer_facing: fm.customer_facing, managed_externally: fm.managed_externally || '',
      // Exception fields
      standard: fm.standard || '', requirement_ref: fm.requirement_ref || '',
      risk_severity: fm.risk_severity || '', expires: fm.expires || '',
      requested_by: fm.requested_by || '', approved_by: fm.approved_by || '',
      // Vendor fields
      vendor_name: fm.vendor_name || '', tier: fm.tier || '',
      certifications: fm.certifications || [], system_ref: fm.system || '',
      // Risk/threat fields
      severity: fm.severity || '', likelihood: fm.likelihood || '', impact: fm.impact || '', priority: fm.priority || null,
      treatment: fm.treatment || '', control_effectiveness: fm.control_effectiveness || '',
      risk_category2: (fm.risk_category && fm.risk_category.category2) || '',
      root_causes: fm.root_causes || [],
      // Standard fields
      req_count: fm.requirements ? fm.requirements.length : 0,
      applies_to: fm.applies_to || [],
      fw_count: Object.keys(frameworks).length,
      // Related
      related_threats: (fm.related && fm.related.threats) || [],
      related_risks: (fm.related && fm.related.risks) || [],
      related_policies: (fm.related && fm.related.policies) || [],
      policy: (fm.related && fm.related.policies && fm.related.policies.length) ? fm.related.policies[0] : ''
    });
  });
  return docs;
}

// === Default columns ===
var DEFAULT_COLUMNS = [
  { key: 'title', label: 'Document', render: function(d) {
    var cell = mk('td', 'browse-name-cell');
    var wrap = mk('div', '');
    wrap.appendChild(mkIcon(d.type, 'browse-type-icon'));
    wrap.appendChild(mk('span', 'compliance-link', d.title));
    if (d.id) wrap.appendChild(mk('span', 'browse-doc-id', d.id));
    cell.appendChild(wrap);
    return cell;
  }},
  { key: 'type', label: 'Type', render: function(d) {
    var cell = mk('td', '');
    var badge = mk('span', 'browse-type-badge');
    badge.style.borderLeftColor = DOC_TYPE_COLORS[d.type] || DOC_TYPE_COLORS['default'];
    badge.appendChild(mkIcon(d.type, 'browse-chip-icon'));
    badge.appendChild(document.createTextNode(d.type));
    cell.appendChild(badge);
    return cell;
  }},
  { key: 'domain', label: 'Domain', render: function(d) { return mk('td', '', domainLabel(d.domain)); } },
  { key: 'status', label: 'Status', render: function(d) {
    var cell = mk('td', '');
    cell.appendChild(mk('span', 'browse-status-dot browse-status-' + d.status));
    cell.appendChild(document.createTextNode(' ' + d.status));
    return cell;
  }},
  { key: 'owner', label: 'Owner', render: function(d) { return mk('td', 'browse-owner', roleTitle(d.owner) || '-'); } },
  { key: 'next_review', label: 'Next Review', render: function(d) { var cell = mk('td', reviewClass(d.next_review)); cell.textContent = d.next_review || '-'; return cell; } }
];

// === Systems columns ===
var SYSTEMS_COLUMNS = [
  { key: 'title', label: 'System', render: function(d) {
    var cell = mk('td', 'browse-name-cell');
    var wrap = mk('div', '');
    wrap.appendChild(mkIcon('system', 'browse-type-icon'));
    wrap.appendChild(mk('span', 'compliance-link', d.title));
    cell.appendChild(wrap);
    return cell;
  }},
  { key: 'category', label: 'Category', render: function(d) { return mk('td', '', CAT_LABELS[d.category] || d.category || '-'); } },
  { key: 'deployment', label: 'Deployment', render: function(d) { return mk('td', '', DEPLOY_LABELS[d.deployment] || d.deployment || '-'); } },
  { key: 'owner', label: 'Owner', render: function(d) { return mk('td', '', roleTitle(d.owner) || '-'); } },
  { key: 'second_owner', label: 'Second Owner', render: function(d) { return mk('td', '', roleTitle(d.second_owner) || '-'); } },
  { key: 'criticality', label: 'Criticality', render: function(d) {
    var cell = mk('td');
    if (d.criticality) { cell.textContent = d.criticality; cell.style.color = CRIT_COLORS[d.criticality] || 'var(--fg)'; cell.style.fontWeight = '600'; }
    else { cell.textContent = '-'; cell.style.color = 'var(--fg3)'; }
    return cell;
  }},
  { key: 'confidentiality', label: 'C', render: function(d) {
    var cell = mk('td'); var v = d.confidentiality;
    if (v) { cell.textContent = v.charAt(0).toUpperCase(); cell.title = 'Confidentiality: ' + v; cell.style.color = CRIT_COLORS[v] || 'var(--fg)'; cell.style.fontWeight = '600'; }
    else { cell.textContent = '-'; cell.style.color = 'var(--fg3)'; }
    return cell;
  }},
  { key: 'integrity', label: 'I', render: function(d) {
    var cell = mk('td'); var v = d.integrity;
    if (v) { cell.textContent = v.charAt(0).toUpperCase(); cell.title = 'Integrity: ' + v; cell.style.color = CRIT_COLORS[v] || 'var(--fg)'; cell.style.fontWeight = '600'; }
    else { cell.textContent = '-'; cell.style.color = 'var(--fg3)'; }
    return cell;
  }},
  { key: 'availability', label: 'A', render: function(d) {
    var cell = mk('td'); var v = d.availability;
    if (v) { cell.textContent = v.charAt(0).toUpperCase(); cell.title = 'Availability: ' + v; cell.style.color = CRIT_COLORS[v] || 'var(--fg)'; cell.style.fontWeight = '600'; }
    else { cell.textContent = '-'; cell.style.color = 'var(--fg3)'; }
    return cell;
  }},
  { key: 'rto', label: 'RTO', render: function(d) { return mk('td', '', d.rto || '-'); } },
  { key: 'rpo', label: 'RPO', render: function(d) { return mk('td', '', d.rpo || '-'); } },
  { key: 'auth', label: 'Auth', render: function(d) { return mk('td', '', d.auth || '-'); } },
  { key: 'domains_arr', label: 'Domains', sortKey: 'domain', render: function(d) {
    var cell = mk('td');
    (d.domains_arr || []).forEach(function(dom, i) { var dObj = DOMAINS.find(function(dd) { return dd.dir === dom || dd.dir.endsWith('-' + dom); }); if (i) cell.appendChild(document.createTextNode(', ')); cell.appendChild(document.createTextNode(dObj ? dObj.label : dom)); });
    return cell;
  }},
  { key: 'data_assets', label: 'Data Assets', render: function(d) {
    var cell = mk('td');
    if (d.data_assets.length) {
      d.data_assets.forEach(function(daId, i) {
        if (i) cell.appendChild(document.createTextNode(', '));
        var daPath = state.idToPath[daId];
        var link = mk('span', 'compliance-link', daId.replace('DA-', ''));
        if (daPath) { link.addEventListener('click', function(e) { e.stopPropagation(); go('doc/' + daPath, e); }); }
        else { link.style.color = 'var(--fg3)'; link.title = 'Not found in the program'; }
        cell.appendChild(link);
      });
    } else { cell.textContent = '-'; cell.style.color = 'var(--fg3)'; }
    return cell;
  }}
];

// === Filter definitions ===
function buildFilterDefs(allDocs) {
  return {
    type: { label: 'Type', getKey: function(d) { return d.type; }, getLabel: function(k) { return (DOC_TYPES.find(function(t) { return t.key === k; }) || {}).label || k; }, getIcon: function(k) { return k; }, colorFn: function(k) { return DOC_TYPE_COLORS[k] || DOC_TYPE_COLORS['default']; }, allKeys: function() { var s = {}; allDocs.forEach(function(d) { s[d.type] = true; }); var items = []; DOC_TYPES.forEach(function(t) { if (s[t.key]) items.push(t.key); }); return items; } },
    domain: { label: 'Domain', getKey: function(d) { return d.domain; }, getLabel: function(k) { return domainLabel(k); }, allKeys: function() { var s = {}; allDocs.forEach(function(d) { s[d.domain] = true; }); return Object.keys(s).sort(); } },
    status: { label: 'Status', getKey: function(d) { return d.status; }, getLabel: function(k) { return k; }, allKeys: function() { var s = {}; allDocs.forEach(function(d) { s[d.status] = true; }); var items = []; STATUS_LIST.forEach(function(v) { if (s[v]) items.push(v); }); return items; } },
    framework: { label: 'Framework', getKey: null, getKeys: function(d) { return d.frameworks; }, getLabel: function(k) { return FRAMEWORK_LABELS[k] ? FRAMEWORK_LABELS[k].split(' — ')[0] : fwLabel(k); }, allKeys: function() { var s = {}; allDocs.forEach(function(d) { d.frameworks.forEach(function(fw) { s[fw] = true; }); }); return Object.keys(s).sort(); } },
    owner: { label: 'Owner', getKey: function(d) { return d.owner; }, getLabel: function(k) { return roleTitle(k); }, allKeys: function() { var s = {}; allDocs.forEach(function(d) { if (d.owner) s[d.owner] = true; }); return Object.keys(s).sort(); } },
    category: { label: 'Category', getKey: function(d) { return d.category; }, getLabel: function(k) { return CAT_LABELS[k] || k; }, allKeys: function() { var s = {}; allDocs.forEach(function(d) { if (d.category) s[d.category] = true; }); return Object.keys(s).sort(); } },
    deployment: { label: 'Deployment', getKey: function(d) { return d.deployment; }, getLabel: function(k) { return DEPLOY_LABELS[k] || k; }, allKeys: function() { var s = {}; allDocs.forEach(function(d) { if (d.deployment) s[d.deployment] = true; }); return Object.keys(s).sort(); } },
    criticality: { label: 'Criticality', getKey: function(d) { return d.criticality; }, getLabel: function(k) { return k; }, colorFn: function(k) { return CRIT_COLORS[k] || 'var(--fg3)'; }, allKeys: function() { var s = {}; allDocs.forEach(function(d) { if (d.criticality) s[d.criticality] = true; }); var items = []; ['critical', 'high', 'medium', 'low', 'negligible'].forEach(function(v) { if (s[v]) items.push(v); }); return items; } },
    backup: { label: 'Backup', getKey: function(d) { return d.backup; }, getLabel: function(k) { return k; }, allKeys: function() { var s = {}; allDocs.forEach(function(d) { if (d.backup) s[d.backup] = true; }); return Object.keys(s).sort(); } },
    auth: { label: 'Auth', getKey: function(d) { return d.auth; }, getLabel: function(k) { return k; }, allKeys: function() { var s = {}; allDocs.forEach(function(d) { if (d.auth) s[d.auth] = true; }); return Object.keys(s).sort(); } },
    classification: { label: 'Classification', getKey: function(d) { return d.classification; }, getLabel: function(k) { return k; }, allKeys: function() { var s = {}; allDocs.forEach(function(d) { if (d.classification) s[d.classification] = true; }); var items = []; ['public', 'internal', 'confidential', 'restricted'].forEach(function(v) { if (s[v]) items.push(v); }); return items; } },
    pii: { label: 'PII', getKey: function(d) { return d.pii === true ? 'yes' : d.pii === false ? 'no' : ''; }, getLabel: function(k) { return k; }, allKeys: function() { var s = {}; allDocs.forEach(function(d) { if (d.pii === true) s['yes'] = true; if (d.pii === false) s['no'] = true; }); return Object.keys(s).sort(); } },
    business_function: { label: 'Function', getKey: function(d) { return d.business_function; }, getLabel: function(k) { return k; }, allKeys: function() { var s = {}; allDocs.forEach(function(d) { if (d.business_function) s[d.business_function] = true; }); return Object.keys(s).sort(); } },
    customer_facing: { label: 'Customer facing', getKey: function(d) { return d.customer_facing === true ? 'yes' : d.customer_facing === false ? 'no' : ''; }, getLabel: function(k) { return k; }, allKeys: function() { var s = {}; allDocs.forEach(function(d) { if (d.customer_facing === true) s['yes'] = true; if (d.customer_facing === false) s['no'] = true; }); return Object.keys(s).sort(); } },
    tier: { label: 'Tier', getKey: function(d) { return d.tier; }, getLabel: function(k) { return k; }, colorFn: function(k) { return CRIT_COLORS[k] || 'var(--fg3)'; }, allKeys: function() { var s = {}; allDocs.forEach(function(d) { if (d.tier) s[d.tier] = true; }); var items = []; ['critical', 'high', 'medium', 'low', 'negligible'].forEach(function(v) { if (s[v]) items.push(v); }); return items; } },
    risk_severity: { label: 'Residual risk', getKey: function(d) { return d.risk_severity; }, getLabel: function(k) { return k; }, colorFn: function(k) { return CRIT_COLORS[k] || 'var(--fg3)'; }, allKeys: function() { var s = {}; allDocs.forEach(function(d) { if (d.risk_severity) s[d.risk_severity] = true; }); var items = []; ['critical', 'high', 'medium', 'low', 'negligible'].forEach(function(v) { if (s[v]) items.push(v); }); return items; } },
    severity: { label: 'Severity', getKey: function(d) { return d.severity; }, getLabel: function(k) { return k; }, colorFn: function(k) { return CRIT_COLORS[k] || 'var(--fg3)'; }, allKeys: function() { var s = {}; allDocs.forEach(function(d) { if (d.severity) s[d.severity] = true; }); var items = []; ['critical', 'high', 'medium', 'low', 'negligible'].forEach(function(v) { if (s[v]) items.push(v); }); return items; } },
    likelihood: { label: 'Likelihood', getKey: function(d) { return d.likelihood; }, getLabel: function(k) { return k; }, colorFn: function(k) { return CRIT_COLORS[k] || 'var(--fg3)'; }, allKeys: function() { var s = {}; allDocs.forEach(function(d) { if (d.likelihood) s[d.likelihood] = true; }); var items = []; ['critical', 'high', 'medium', 'low', 'negligible'].forEach(function(v) { if (s[v]) items.push(v); }); return items; } },
    impact: { label: 'Impact', getKey: function(d) { return d.impact; }, getLabel: function(k) { return k; }, colorFn: function(k) { return CRIT_COLORS[k] || 'var(--fg3)'; }, allKeys: function() { var s = {}; allDocs.forEach(function(d) { if (d.impact) s[d.impact] = true; }); var items = []; ['critical', 'high', 'medium', 'low', 'negligible'].forEach(function(v) { if (s[v]) items.push(v); }); return items; } },
    treatment: { label: 'Treatment', getKey: function(d) { return d.treatment; }, getLabel: function(k) { return k; }, allKeys: function() { var s = {}; allDocs.forEach(function(d) { if (d.treatment) s[d.treatment] = true; }); var items = []; ['mitigate', 'avoid', 'transfer', 'accept', 'tbd'].forEach(function(v) { if (s[v]) items.push(v); }); return items; } },
    control_effectiveness: { label: 'Control effectiveness', getKey: function(d) { return d.control_effectiveness; }, getLabel: function(k) { return k; }, allKeys: function() { var s = {}; allDocs.forEach(function(d) { if (d.control_effectiveness) s[d.control_effectiveness] = true; }); var items = []; ['fully', 'substantially', 'partially', 'largely-ineffective', 'none', 'not-evaluated'].forEach(function(v) { if (s[v]) items.push(v); }); return items; } },
    risk_category2: { label: 'Risk category', getKey: function(d) { return d.risk_category2; }, getLabel: function(k) { return k; }, allKeys: function() { var s = {}; allDocs.forEach(function(d) { if (d.risk_category2) s[d.risk_category2] = true; }); return Object.keys(s).sort(); } },
    standard_ref: { label: 'Standard', getKey: function(d) { return d.standard; }, getLabel: function(k) { return k; }, allKeys: function() { var s = {}; allDocs.forEach(function(d) { if (d.standard) s[d.standard] = true; }); return Object.keys(s).sort(); } },
    policy: { label: 'Policy', getKey: function(d) { return d.policy; }, getLabel: function(k) { var fm = state.fmCache[state.idToPath[k]]; return fm ? (fm.title || k) : k; }, allKeys: function() { var s = {}; allDocs.forEach(function(d) { if (d.policy) s[d.policy] = true; }); return Object.keys(s).sort(); } }
  };
}

var DEFAULT_FILTERS = ['type', 'domain', 'status', 'framework', 'owner'];
var SYSTEMS_FILTERS = ['category', 'deployment', 'owner', 'criticality', 'auth', 'domain', 'status'];

// === Systems config ===
export var SYSTEMS_CONFIG = {
  columns: SYSTEMS_COLUMNS,
  filters: SYSTEMS_FILTERS,
  title: 'Systems',
  breadcrumb: [{ label: 'Systems' }],
  viewId: 'systems',
  rowRoute: function(d) { return 'sys/' + d.path.replace('systems/', ''); }
};

// === Data Assets config ===
var DA_COLUMNS = [
  DEFAULT_COLUMNS[0],
  { key: 'classification', label: 'Classification', render: function(d) { return mk('td', '', d.classification || '-'); } },
  { key: 'pii', label: 'PII', render: function(d) { var cell = mk('td'); if (d.pii === true) { cell.textContent = 'Yes'; cell.style.color = 'var(--sev-high)'; } else if (d.pii === false) { cell.textContent = 'No'; } else { cell.textContent = '-'; cell.style.color = 'var(--fg3)'; } return cell; } },
  { key: 'owner', label: 'Owner', render: function(d) { return mk('td', '', roleTitle(d.owner) || '-'); } },
  { key: 'criticality', label: 'Criticality', render: function(d) { var cell = mk('td'); if (d.criticality) { cell.textContent = d.criticality; cell.style.color = CRIT_COLORS[d.criticality] || 'var(--fg)'; cell.style.fontWeight = '600'; } else { cell.textContent = '-'; cell.style.color = 'var(--fg3)'; } return cell; } },
  { key: 'confidentiality', label: 'C', render: function(d) { var cell = mk('td'); var v = d.confidentiality; if (v) { cell.textContent = v.charAt(0).toUpperCase(); cell.title = 'Confidentiality: ' + v; cell.style.color = CRIT_COLORS[v] || 'var(--fg)'; cell.style.fontWeight = '600'; } else { cell.textContent = '-'; cell.style.color = 'var(--fg3)'; } return cell; } },
  { key: 'integrity', label: 'I', render: function(d) { var cell = mk('td'); var v = d.integrity; if (v) { cell.textContent = v.charAt(0).toUpperCase(); cell.title = 'Integrity: ' + v; cell.style.color = CRIT_COLORS[v] || 'var(--fg)'; cell.style.fontWeight = '600'; } else { cell.textContent = '-'; cell.style.color = 'var(--fg3)'; } return cell; } },
  { key: 'availability', label: 'A', render: function(d) { var cell = mk('td'); var v = d.availability; if (v) { cell.textContent = v.charAt(0).toUpperCase(); cell.title = 'Availability: ' + v; cell.style.color = CRIT_COLORS[v] || 'var(--fg)'; cell.style.fontWeight = '600'; } else { cell.textContent = '-'; cell.style.color = 'var(--fg3)'; } return cell; } },
  { key: 'retention_years', label: 'Retention', render: function(d) { return mk('td', '', d.retention_years != null ? d.retention_years + 'y' : '-'); } },
  DEFAULT_COLUMNS[3]
];
export var DATA_ASSETS_CONFIG = { columns: DA_COLUMNS, filters: ['classification', 'criticality', 'pii', 'status'], title: 'Data Assets', breadcrumb: [{ label: 'Governance', action: function() { go('standards'); } }, { label: 'Data Assets' }] };

// === Business Processes config ===
// Business processes use a name-only column (no BP-* id chip) — the title alone is sufficient context.
var BP_NAME_COLUMN = { key: 'title', label: 'Document', render: function(d) {
  var cell = mk('td', 'browse-name-cell');
  var wrap = mk('div', '');
  wrap.appendChild(mkIcon(d.type, 'browse-type-icon'));
  wrap.appendChild(mk('span', 'compliance-link', d.title));
  cell.appendChild(wrap);
  return cell;
}};
var BP_COLUMNS = [
  BP_NAME_COLUMN,
  { key: 'business_function', label: 'Function', render: function(d) { return mk('td', '', d.business_function || '-'); } },
  { key: 'owner', label: 'Owner', render: function(d) { return mk('td', '', roleTitle(d.owner) || '-'); } },
  { key: 'customer_facing', label: 'Customer', render: function(d) { var cell = mk('td'); if (d.customer_facing === true) cell.textContent = 'Yes'; else if (d.customer_facing === false) cell.textContent = 'No'; else { cell.textContent = '-'; cell.style.color = 'var(--fg3)'; } return cell; } },
  { key: 'criticality', label: 'Criticality', render: function(d) { var cell = mk('td'); if (d.criticality) { cell.textContent = d.criticality; cell.style.color = CRIT_COLORS[d.criticality] || 'var(--fg)'; cell.style.fontWeight = '600'; } else { cell.textContent = '-'; cell.style.color = 'var(--fg3)'; } return cell; } },
  { key: 'rto', label: 'RTO', render: function(d) { return mk('td', '', d.rto || '-'); } },
  { key: 'managed_externally', label: 'External', render: function(d) { var cell = mk('td'); if (d.managed_externally) { var link = mk('a', 'compliance-link', 'external \u2197'); link.href = d.managed_externally; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.addEventListener('click', function(e) { e.stopPropagation(); }); cell.appendChild(link); } else { cell.textContent = '-'; cell.style.color = 'var(--fg3)'; } return cell; } },
  DEFAULT_COLUMNS[3]
];
export var BUSINESS_PROCESSES_CONFIG = { columns: BP_COLUMNS, filters: ['business_function', 'criticality', 'customer_facing', 'status'], title: 'Business Processes', breadcrumb: [{ label: 'Governance', action: function() { go('standards'); } }, { label: 'Business Processes' }] };

// === Exceptions config ===
var EXC_COLUMNS = [
  DEFAULT_COLUMNS[0],
  { key: 'standard', label: 'Standard', render: function(d) { var cell = mk('td'); if (d.standard) { var link = mk('span', 'compliance-link', d.standard); var sp = state.idToPath[d.standard]; if (sp) link.addEventListener('click', function(e) { e.stopPropagation(); go('doc/' + sp, e); }); cell.appendChild(link); } else { cell.textContent = '-'; } return cell; } },
  { key: 'requirement_ref', label: 'Req', render: function(d) { return mk('td', '', d.requirement_ref || '-'); } },
  { key: 'risk_severity', label: 'Residual Risk', render: function(d) { var cell = mk('td'); if (d.risk_severity) { cell.textContent = d.risk_severity; cell.style.color = CRIT_COLORS[d.risk_severity] || 'var(--fg)'; cell.style.fontWeight = '600'; } else { cell.textContent = '-'; cell.style.color = 'var(--fg3)'; } return cell; } },
  { key: 'expires', label: 'Expires', render: function(d) { var cell = mk('td', reviewClass(d.expires)); cell.textContent = d.expires || '-'; return cell; } },
  { key: 'requested_by', label: 'Requested by', render: function(d) { return mk('td', '', d.requested_by || '-'); } },
  DEFAULT_COLUMNS[3]
];
export var EXCEPTIONS_CONFIG = { columns: EXC_COLUMNS, filters: ['risk_severity', 'standard_ref', 'status'], title: 'Exceptions', breadcrumb: [{ label: 'Governance', action: function() { go('standards'); } }, { label: 'Exceptions' }] };

// === Vendors config ===
var VEN_COLUMNS = [
  { key: 'vendor_name', label: 'Vendor', render: function(d) {
    var cell = mk('td', 'browse-name-cell');
    var wrap = mk('div', '');
    wrap.appendChild(mkIcon('vendor', 'browse-type-icon'));
    wrap.appendChild(mk('span', 'compliance-link', d.vendor_name || d.title));
    cell.appendChild(wrap);
    return cell;
  }},
  { key: 'tier', label: 'Tier', render: function(d) { var cell = mk('td'); if (d.tier) { cell.textContent = d.tier; cell.style.color = CRIT_COLORS[d.tier] || 'var(--fg)'; cell.style.fontWeight = '600'; } else { cell.textContent = '-'; cell.style.color = 'var(--fg3)'; } return cell; } },
  { key: 'certifications', label: 'Certifications', render: function(d) { return mk('td', '', d.certifications.length ? d.certifications.join(', ') : '-'); } },
  { key: 'system_ref', label: 'System', render: function(d) { var cell = mk('td'); if (d.system_ref) { var link = mk('span', 'compliance-link', d.system_ref.replace('SYS-', '')); var sp = state.idToPath[d.system_ref]; if (sp) link.addEventListener('click', function(e) { e.stopPropagation(); go('sys/' + sp.replace('systems/', ''), e); }); cell.appendChild(link); } else { cell.textContent = '-'; cell.style.color = 'var(--fg3)'; } return cell; } },
  DEFAULT_COLUMNS[3], DEFAULT_COLUMNS[4]
];
export var VENDORS_CONFIG = { columns: VEN_COLUMNS, filters: ['tier', 'status'], title: 'Vendors', breadcrumb: [{ label: 'Governance', action: function() { go('standards'); } }, { label: 'Vendors' }] };

// === Standards config ===
var STD_COLUMNS = [
  { key: 'policy', label: 'Policy', render: function(d) { var cell = mk('td'); if (d.policy) { var fm = state.fmCache[state.idToPath[d.policy]]; var link = mk('span', 'compliance-link', fm ? (fm.title || d.policy) : d.policy); var sp = state.idToPath[d.policy]; if (sp) link.addEventListener('click', function(e) { e.stopPropagation(); go('doc/' + sp, e); }); cell.appendChild(link); } else { cell.textContent = '-'; cell.style.color = 'var(--fg3)'; } return cell; } },
  DEFAULT_COLUMNS[0],
  { key: 'req_count', label: 'Requirements', render: function(d) { return mk('td', '', d.req_count ? String(d.req_count) : '-'); } },
  { key: 'applies_to', label: 'Applies to', render: function(d) { return mk('td', '', d.applies_to.length ? d.applies_to.join(', ') : '-'); } },
  { key: 'fw_count', label: 'Frameworks', render: function(d) { return mk('td', '', d.fw_count ? String(d.fw_count) : '-'); } },
  DEFAULT_COLUMNS[3], DEFAULT_COLUMNS[4], DEFAULT_COLUMNS[5]
];
export var STANDARDS_CONFIG = { columns: STD_COLUMNS, filters: ['policy', 'framework', 'status', 'owner'], title: 'Standards', breadcrumb: [{ label: 'Governance', action: function() { go('standards'); } }, { label: 'Standards' }] };

// === Risks config ===
var RISK_COLUMNS = [
  DEFAULT_COLUMNS[0],
  { key: 'severity', label: 'Severity', render: function(d) { var cell = mk('td'); if (d.severity) { cell.textContent = d.severity; cell.style.color = CRIT_COLORS[d.severity] || 'var(--fg)'; cell.style.fontWeight = '600'; } else { cell.textContent = '-'; cell.style.color = 'var(--fg3)'; } return cell; } },
  { key: 'likelihood', label: 'Likelihood', render: function(d) { var cell = mk('td'); if (d.likelihood) { cell.textContent = d.likelihood; cell.style.color = CRIT_COLORS[d.likelihood] || 'var(--fg)'; cell.style.fontWeight = '600'; } else { cell.textContent = '-'; cell.style.color = 'var(--fg3)'; } return cell; } },
  { key: 'impact', label: 'Impact', render: function(d) { var cell = mk('td'); if (d.impact) { cell.textContent = d.impact; cell.style.color = CRIT_COLORS[d.impact] || 'var(--fg)'; cell.style.fontWeight = '600'; } else { cell.textContent = '-'; cell.style.color = 'var(--fg3)'; } return cell; } },
  { key: 'related_threats', label: 'Linked Threats', render: function(d) { return mk('td', '', d.related_threats.length ? d.related_threats.join(', ') : '-'); } },
  DEFAULT_COLUMNS[3]
];
export var RISKS_CONFIG = { columns: RISK_COLUMNS, filters: ['severity', 'likelihood', 'impact', 'treatment', 'control_effectiveness', 'risk_category2', 'status'], title: 'Risks', breadcrumb: [{ label: 'Governance', action: function() { go('standards'); } }, { label: 'Risks' }] };

// === Threats config ===
var THREAT_COLUMNS = [
  { key: 'priority', label: '#', render: function(d) { var cell = mk('td'); if (d.priority != null) { cell.textContent = String(d.priority); cell.style.fontWeight = '600'; cell.style.textAlign = 'center'; } else { cell.textContent = '-'; cell.style.color = 'var(--fg3)'; } return cell; } },
  DEFAULT_COLUMNS[0],
  { key: 'severity', label: 'Severity', render: function(d) { var cell = mk('td'); if (d.severity) { cell.textContent = d.severity; cell.style.color = CRIT_COLORS[d.severity] || 'var(--fg)'; cell.style.fontWeight = '600'; } else { cell.textContent = '-'; cell.style.color = 'var(--fg3)'; } return cell; } },
  { key: 'related_risks', label: 'Linked Risks', render: function(d) { return mk('td', '', d.related_risks.length ? d.related_risks.join(', ') : '-'); } },
  DEFAULT_COLUMNS[3]
];
export var THREATS_CONFIG = { columns: THREAT_COLUMNS, filters: ['severity', 'status'], title: 'Threats', breadcrumb: [{ label: 'Governance', action: function() { go('standards'); } }, { label: 'Threats' }] };

// === Main render ===
export function renderBrowse(presetType, presetDomain, config) {
  var viewId = (config && config.viewId) || (presetType || presetDomain ? '' : 'browse');
  setActiveView(viewId);
  fadeMain(); mainEl.textContent = ''; rightEl.textContent = '';

  var columns = (config && config.columns) || DEFAULT_COLUMNS;
  var filterKeys = (config && config.filters) || DEFAULT_FILTERS;
  var rowRoute = (config && config.rowRoute) || function(d) { return d.type === 'system' ? 'sys/' + d.path.replace('systems/', '') : 'doc/' + d.path; };

  // Context-aware breadcrumb and title
  var typeLabel = presetType ? (DOC_TYPES.find(function(t) { return t.key === presetType; }) || {}).label || presetType : null;
  var domObj = presetDomain ? DOMAINS.find(function(d) { return d.dir === presetDomain; }) : null;
  var pageTitle = (config && config.title) || 'Document Browser';
  var bread = (config && config.breadcrumb) || [{ label: 'Tools' }, { label: 'Browse' }];
  if (!config) {
    if (presetType && presetDomain) {
      if (presetDomain === '01-grc') { bread = [{ label: 'Governance', action: function() { go('standards'); } }, { label: typeLabel }]; }
      else if (domObj) { bread = [{ label: 'Domains', action: function() { go('domains'); } }, { label: domObj.label, action: function() { go('domain/' + presetDomain); } }, { label: typeLabel }]; }
      pageTitle = typeLabel;
    } else if (presetType) {
      if (presetType === 'adr') { bread = [{ label: typeLabel }]; }
      else { bread = [{ label: 'Governance', action: function() { go('standards'); } }, { label: typeLabel }]; }
      pageTitle = typeLabel;
    }
  }
  setBread(bread);

  var allDocs = collectDocs();
  var filterDefs = buildFilterDefs(allDocs);
  var activeFilters = {};
  filterKeys.forEach(function(k) { activeFilters[k] = {}; });
  if (presetType) { if (!activeFilters.type) activeFilters.type = {}; activeFilters.type[presetType] = true; }
  if (presetDomain) { if (!activeFilters.domain) activeFilters.domain = {}; activeFilters.domain[presetDomain] = true; }
  var searchQuery = '';
  var sortKey = columns[0] ? columns[0].key : 'title';
  var sortAsc = true;

  // Header
  var header = mk('div', 'browse-header');
  header.appendChild(mk('h1', '', pageTitle));
  var countEl = mk('span', 'browse-count', '');
  header.appendChild(countEl);
  mainEl.appendChild(header);

  var filterContainer = mk('div', '');
  mainEl.appendChild(filterContainer);

  var searchBox = mk('input', 'browse-search');
  searchBox.type = 'text'; searchBox.placeholder = 'Search by title, ID, or description...';
  searchBox.addEventListener('input', function() { searchQuery = searchBox.value.toLowerCase().trim(); render(); });
  mainEl.appendChild(searchBox);

  var tableContainer = mk('div', 'browse-table-wrap');
  mainEl.appendChild(tableContainer);

  function matchesFilter(d, exclude) {
    // Always apply preset filters even if not in filterKeys
    if (presetType && exclude !== 'type' && d.type !== presetType) return false;
    if (presetDomain && exclude !== 'domain' && d.domain !== presetDomain) return false;
    for (var i = 0; i < filterKeys.length; i++) {
      var fk = filterKeys[i];
      if (fk === exclude) continue;
      var active = activeFilters[fk];
      if (!active || !Object.keys(active).length) continue;
      var def = filterDefs[fk];
      if (def.getKeys) { if (!def.getKeys(d).some(function(v) { return active[v]; })) return false; }
      else { if (!active[def.getKey(d)]) return false; }
    }
    if (searchQuery && d.title.toLowerCase().indexOf(searchQuery) === -1 && d.id.toLowerCase().indexOf(searchQuery) === -1 && d.description.toLowerCase().indexOf(searchQuery) === -1) return false;
    return true;
  }

  function getFiltered() {
    return allDocs.filter(function(d) { return matchesFilter(d, null); });
  }

  function buildFilterBar(filtered) {
    filterContainer.textContent = '';
    var toolbar = mk('div', 'browse-toolbar');
    var filtersRendered = 0;

    filterKeys.forEach(function(fk) {
      var def = filterDefs[fk];
      if (!def) return;
      var isPreset = (fk === 'type' && presetType) || (fk === 'domain' && presetDomain);

      if (isPreset) {
        // Locked row — only preset value
        var presetKey = fk === 'type' ? presetType : presetDomain;
        var sec = mk('div', 'browse-filter-section');
        sec.appendChild(mk('span', 'browse-filter-label', def.label));
        var chips = mk('div', 'cap-res-chips');
        var chip = mk('button', 'cap-res-chip active locked');
        if (def.getIcon) { chip.appendChild(mkIcon(def.getIcon(presetKey), 'browse-chip-icon')); chip.appendChild(document.createTextNode(' ')); }
        chip.appendChild(document.createTextNode(def.getLabel(presetKey)));
        if (def.colorFn) chip.style.setProperty('--chip-color', def.colorFn(presetKey));
        chip.disabled = true;
        chips.appendChild(chip);
        sec.appendChild(chips);
        toolbar.appendChild(sec);
        filtersRendered++;
        return;
      }

      // Count excluding this filter
      var countSrc = allDocs.filter(function(d) { return matchesFilter(d, fk); });
      var countMap = {};
      countSrc.forEach(function(d) {
        if (def.getKeys) { def.getKeys(d).forEach(function(v) { countMap[v] = (countMap[v] || 0) + 1; }); }
        else { var k = def.getKey(d); if (k) countMap[k] = (countMap[k] || 0) + 1; }
      });

      var allKeys = def.allKeys();
      if (!allKeys.length) return;

      var sec = mk('div', 'browse-filter-section');
      sec.appendChild(mk('span', 'browse-filter-label', def.label));
      var chips = mk('div', 'cap-res-chips');
      allKeys.forEach(function(k) {
        var count = countMap[k] || 0;
        var isOn = !!activeFilters[fk][k];
        var isDisabled = count === 0 && !isOn;
        var chip = mk('button', 'cap-res-chip' + (isOn ? ' active' : '') + (isDisabled ? ' disabled' : ''));
        if (def.getIcon) { chip.appendChild(mkIcon(def.getIcon(k), 'browse-chip-icon')); chip.appendChild(document.createTextNode(' ')); }
        chip.appendChild(document.createTextNode(def.getLabel(k) + ' (' + count + ')'));
        if (def.colorFn) chip.style.setProperty('--chip-color', def.colorFn(k));
        if (isDisabled) { chip.disabled = true; }
        else { chip.addEventListener('click', function() { if (activeFilters[fk][k]) delete activeFilters[fk][k]; else activeFilters[fk][k] = true; render(); }); }
        chips.appendChild(chip);
      });
      sec.appendChild(chips);
      toolbar.appendChild(sec);
      filtersRendered++;
    });

    if (filtersRendered > 0) {
      var userFilters = 0;
      filterKeys.forEach(function(fk) { Object.keys(activeFilters[fk] || {}).forEach(function(k) { if ((fk === 'type' && k === presetType) || (fk === 'domain' && k === presetDomain)) return; userFilters++; }); });
      if (userFilters > 0 || searchQuery) {
        var clearBtn = mk('button', 'browse-clear-btn', 'Clear filters');
        clearBtn.addEventListener('click', function() {
          filterKeys.forEach(function(fk) { activeFilters[fk] = {}; });
          if (presetType) activeFilters.type[presetType] = true;
          if (presetDomain) activeFilters.domain[presetDomain] = true;
          searchQuery = ''; searchBox.value = '';
          render();
        });
        toolbar.appendChild(clearBtn);
      }
      filterContainer.appendChild(toolbar);
    }
  }

  function render() {
    var filtered = getFiltered();
    buildFilterBar(filtered);
    countEl.textContent = filtered.length + ' documents';

    filtered.sort(function(a, b) {
      var sk = sortKey;
      var va = a[sk], vb = b[sk];
      if (typeof va === 'number' && typeof vb === 'number') { return sortAsc ? va - vb : vb - va; }
      if (typeof va === 'number') return sortAsc ? -1 : 1;
      if (typeof vb === 'number') return sortAsc ? 1 : -1;
      va = (va || '').toString().toLowerCase();
      vb = (vb || '').toString().toLowerCase();
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });

    tableContainer.textContent = '';
    if (!filtered.length) { tableContainer.appendChild(mk('p', 'grc-empty', 'No documents match the active filters.')); renderStats(filtered); return; }

    var tbl = mk('table', 'compliance-table browse-table');
    var thead = mk('thead');
    var hr = mk('tr');
    columns.forEach(function(col) {
      var th = mk('th', 'sortable-th', col.label);
      var sk = col.sortKey || col.key;
      if (sk === sortKey) th.appendChild(mk('span', 'sort-arrow', sortAsc ? '\u25B2' : '\u25BC'));
      th.addEventListener('click', function() { if (sortKey === sk) sortAsc = !sortAsc; else { sortKey = sk; sortAsc = true; } render(); });
      hr.appendChild(th);
    });
    thead.appendChild(hr); tbl.appendChild(thead);

    var tbody = mk('tbody');
    filtered.forEach(function(d) {
      var tr = mk('tr'); tr.style.cursor = 'pointer';
      columns.forEach(function(col) { tr.appendChild(col.render(d)); });
      tr.addEventListener('click', function(e) { go(rowRoute(d), e); });
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    tableContainer.appendChild(tbl);
    renderStats(filtered);
  }

  function renderStats(filtered) {
    rightEl.textContent = '';
    rightEl.appendChild(mk('h3', '', 'Summary'));
    rightEl.appendChild(mkMetaRow('Total', String(filtered.length)));
    // Type breakdown
    var tc = {};
    filtered.forEach(function(d) { tc[d.type] = (tc[d.type] || 0) + 1; });
    DOC_TYPES.forEach(function(t) {
      if (!tc[t.key]) return;
      var row = mk('div', 'meta-row');
      var key = mk('span', 'meta-key');
      key.appendChild(mkIcon(t.key, 'browse-chip-icon'));
      key.appendChild(document.createTextNode(' ' + t.label));
      row.appendChild(key);
      row.appendChild(mk('span', 'meta-val', String(tc[t.key])));
      rightEl.appendChild(row);
    });
    // Status
    rightEl.appendChild(mk('h3', '', 'By status'));
    var sc = {};
    filtered.forEach(function(d) { sc[d.status] = (sc[d.status] || 0) + 1; });
    Object.keys(sc).sort().forEach(function(s) {
      var row = mk('div', 'meta-row');
      var label = mk('span', 'meta-key');
      label.appendChild(mk('span', 'browse-status-dot browse-status-' + s));
      label.appendChild(document.createTextNode(' ' + s));
      row.appendChild(label);
      row.appendChild(mk('span', 'meta-val', String(sc[s])));
      rightEl.appendChild(row);
    });
    // Owner
    rightEl.appendChild(mk('h3', '', 'By owner'));
    var oc = {};
    filtered.forEach(function(d) { if (d.owner) oc[d.owner] = (oc[d.owner] || 0) + 1; });
    Object.keys(oc).sort(function(a, b) { return oc[b] - oc[a]; }).forEach(function(o) { rightEl.appendChild(mkMetaRow(roleTitle(o), String(oc[o]))); });
  }

  render();
}
