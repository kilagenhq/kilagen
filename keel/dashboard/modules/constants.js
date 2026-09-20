import { state } from './state.js';

/* Labels and colors. Everything structural — what types exist, what domains
   exist — comes from registry.json, so this file cannot drift from the law. */

export const TYPE_PLURALS = {
  policy: 'Policies', standard: 'Standards', process: 'Processes',
  runbook: 'Runbooks', playbook: 'Playbooks', guideline: 'Guidelines',
  role: 'Roles', vendor: 'Vendors', threat: 'Threats',
  'threat-model': 'Threat models', 'data-asset': 'Data assets',
  'business-process': 'Business processes', risk: 'Risks',
  exception: 'Exceptions', gap: 'Gaps', decision: 'Decisions', incident: 'Incidents',
};

export function typePlural(name) { return TYPE_PLURALS[name] || name; }

/* The five shelves of the model, in the order a program is built.
 *
 * Seventeen types in one flat list is an index, not a navigation. The grouping
 * is the shape the content model already has — a policy authorises a standard,
 * the standard is carried out by a process, both are about things in the
 * inventory, and what is actually true about them is the position. It is used
 * by the sidebar and by the Browse landing page, so the tree and the page can
 * never say different things.
 */
export const TYPE_GROUPS = [
  { key: 'rules', label: 'Rules', note: 'What we say we do',
    types: ['policy', 'standard', 'guideline'] },
  { key: 'practice', label: 'Practice', note: 'How it is done',
    types: ['process', 'runbook', 'playbook'] },
  { key: 'inventory', label: 'Inventory', note: 'What we have',
    types: ['role', 'vendor', 'data-asset', 'business-process'] },
  { key: 'position', label: 'Position', note: 'Where we actually stand',
    types: ['risk', 'threat', 'threat-model', 'gap', 'exception', 'incident'] },
  { key: 'record', label: 'Record', note: 'Why',
    types: ['decision'] },
];

/* Types the registry knows, in group order, with anything the groups do not
   name falling into a last bucket rather than disappearing from the tree. */
export function groupedTypes(names) {
  const seen = {};
  const groups = TYPE_GROUPS.map(function(g) {
    const types = g.types.filter(function(t) { return names.indexOf(t) !== -1; });
    types.forEach(function(t) { seen[t] = true; });
    return { key: g.key, label: g.label, note: g.note, types: types };
  }).filter(function(g) { return g.types.length; });
  const rest = names.filter(function(t) { return !seen[t]; });
  if (rest.length) groups.push({ key: 'other', label: 'Other', note: '', types: rest });
  return groups;
}

export function typeLabel(name) {
  if (!name) return '';
  return name.charAt(0).toUpperCase() + name.slice(1).replace(/-/g, ' ');
}

/* Framework material the dashboard can deep-link. Site paths under keel/ are
   namespaced by that prefix, which is what keeps a program's documents and
   the framework's own material from colliding in the flattened site layout. */
export const KEEL_ROOT_FILES = ['design.md', 'README.md', 'glossary.md',
  'compliance.md', 'instantiation.md'];

export const FRAMEWORK_LABELS = { nist_csf: 'NIST CSF 2.0', iso_27001: 'ISO/IEC 27001:2022', soc2: 'SOC 2', pci_dss: 'PCI DSS' };

/* The framework's own name, as the vocabulary publishes it.
 *
 * The id is the edition — `pci_dss_4_0_1` is a different list from `pci_dss` —
 * so a static table of labels is a table that goes stale the first time a
 * regulator publishes a revision: the card read "PCI DSS v4.0.1" from the
 * vocabulary while the tree beside it spelled the id out as "PCI DSS 4 0 1".
 * The shipped name wins, the table is the fallback for a framework that
 * carries none, and the prettifier is the last resort.
 */
export function fwLabel(key) {
  if (!key) return '';
  const meta = (state.frameworks || {})[key];
  if (meta && meta.name) return meta.name;
  return FRAMEWORK_LABELS[key] || key.replace(/_/g, ' ')
    .replace(/\b(iso|soc|nist|csf|pci|dss|ccss|bcm)\b/gi, function(m) { return m.toUpperCase(); })
    .replace(/\b([a-z])/g, function(m) { return m.toUpperCase(); });
}

export const DOC_TYPE_COLORS = {
  policy: 'var(--accent)', standard: 'var(--cov-partial)', process: 'var(--mat2)',
  runbook: 'var(--mat4)', playbook: 'var(--cov-missing)', guideline: 'var(--fg2)',
  role: 'var(--mat3)', vendor: 'var(--mat3)', threat: 'var(--sev-high)',
  'threat-model': 'var(--mat5)', 'data-asset': 'var(--mat3)',
  'business-process': 'var(--cov-partial)', risk: 'var(--mat1)',
  exception: 'var(--sev-medium)', gap: 'var(--sev-high)', decision: 'var(--mat5)',
  incident: 'var(--sev-critical)', capability: 'var(--accent)', default: 'var(--fg3)',
};

export function typeColor(type) { return DOC_TYPE_COLORS[type] || DOC_TYPE_COLORS.default; }

/* The two types whose state is computed, never declared. They carry no
   `status` field at all, so a column showing one could only be empty or
   wrong — the views draw the derived state instead. */
export const STATE_IS_DERIVED = { gap: true, exception: true };

/* What a binding level means, which is the half that makes it useful: who
   checks. Shown on the badge itself. */
export const BINDING_NOTE = {
  mandatory: 'a law, a regulator or a contract requires it',
  voluntary: 'audited by choice, conformity asserted',
  reference: 'used as guidance, nothing asserted',
};

/* Document status only — never a tracker's state. */
export function statusColor(s) {
  if (s === 'active') return 'var(--cov-deployed)';
  if (s === 'draft') return 'var(--cov-partial)';
  if (s === 'superseded') return 'var(--cov-deprecated)';
  return 'var(--fg3)';
}

/* How long evidence stays good, in the same closed set schedule.yml uses for
   recurrence — one vocabulary of periodicity, not two. */
export const FRESHNESS_DAYS = {
  monthly: 31, quarterly: 92, 'semi-annually': 183, annually: 366,
  'every-2-years': 731, 'every-3-years': 1096,
};

/* A domain gets a face, drawn from the icons the product already ships.
 *
 * The ids are the ones `kilagen init` seeds, so a stock program gets them for
 * free and anything else falls back to the generic mark rather than to
 * nothing. Colour is identity, not score: these are hues to tell one row from
 * another, and none of them means good or bad. */
export const DOMAIN_ICONS = {
  grc: 'policy', iam: 'role', infra: 'system', appsec: 'standard',
  secops: 'chart', ir: 'incident', offensive: 'threat',
  'digital-assets': 'vendor', awareness: 'book', 'data-security': 'gap',
};

const DOMAIN_HUES = {
  grc: 200, iam: 265, infra: 25, appsec: 150, secops: 320,
  ir: 5, offensive: 45, 'digital-assets': 240, awareness: 100, 'data-security': 180,
};

/* What a type is for, where the answer is not obvious from its name.
 *
 * Two of these exist because somebody keeps asking whether they should: the
 * work happens outside the repository, so why is there a document? Because
 * the document is not the work. It is the record of what the work changed,
 * and it is the only thing that can answer a question across time. */
export const TYPE_NOTES = {
  incident: 'The research lives outside — the timeline, the SIEM exports, the '
    + 'forensic notes. What is here is the record of what the incident changed: '
    + 'the decision it forced, the standard it moved, the gap it opened. It is '
    + 'what answers "what changed after the phishing run in January?".',
  'threat-model': 'The model lives outside — the data flow, the STRIDE table, '
    + 'the workshop notes. What is here is the record: what it covers, who owns '
    + 'it, what it found, and when it was last looked at. It is what answers '
    + '"when was the portal model last reviewed?".',
};

export function domainIcon(id) { return DOMAIN_ICONS[id] || 'domain'; }

/* Deterministic from the id, so a domain the product never heard of still gets
   a stable colour instead of a different one on every load. */
export function domainColor(id) {
  let hue = DOMAIN_HUES[id];
  if (hue === undefined) {
    hue = 0;
    for (let i = 0; i < String(id).length; i++) hue = (hue * 31 + String(id).charCodeAt(i)) % 360;
  }
  return 'hsl(' + hue + ' 42% 45%)';
}

export const SEVERITY_COLORS = {
  critical: 'var(--sev-critical)', high: 'var(--sev-high)', medium: 'var(--sev-medium)',
  low: 'var(--sev-low)', negligible: 'var(--sev-info)',
};
export const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3, negligible: 4 };

export function today() { return new Date().toISOString().slice(0, 10); }

export function daysUntil(iso) {
  if (!iso) return null;
  const then = Date.parse(iso + 'T00:00:00Z');
  if (isNaN(then)) return null;
  return Math.round((then - Date.parse(today() + 'T00:00:00Z')) / 86400000);
}
