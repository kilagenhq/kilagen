export const DOMAINS = [{ dir: '01-grc', label: 'GRC', iconType: 'dom-grc' }, { dir: '02-iam', label: 'IAM', iconType: 'dom-iam' }, { dir: '03-infra', label: 'Infrastructure', iconType: 'dom-infra' }, { dir: '04-appsec', label: 'AppSec', iconType: 'dom-appsec' }, { dir: '05-secops', label: 'SecOps', iconType: 'dom-secops' }, { dir: '06-ir', label: 'Incident Response', iconType: 'dom-ir' }, { dir: '07-offensive', label: 'Offensive', iconType: 'dom-offensive' }, { dir: '08-digital-assets', label: 'Digital Assets', iconType: 'dom-digital-assets' }, { dir: '09-awareness', label: 'Awareness', iconType: 'dom-awareness' }, { dir: '10-data-security', label: 'Data Security', iconType: 'dom-data-security' }];
export const TOP_DIRS = ['01-grc', '02-iam', '03-infra', '04-appsec', '05-secops', '06-ir', '07-offensive', '08-digital-assets', '09-awareness', '10-data-security', 'systems', 'roles', 'data-assets', 'business-processes', 'adr', 'lenses', 'schemas', 'templates'];
export const ROOT_FILES = ['config.yml', 'design.md', 'README.md', 'glossary.md', 'maturity.md', 'compliance.md', 'lenses.md', 'instantiation.md', 'risk-taxonomy.yml'];
export const SUBFOLDER_LABELS = { 'policies': 'Policies', 'standards': 'Standards', 'processes': 'Processes', 'runbooks': 'Runbooks', 'guidelines': 'Guidelines', 'playbooks': 'Playbooks', 'threat-models': 'Threat Models', 'vendors': 'Vendors', 'risks': 'Risks', 'threats': 'Threats', 'compliance': 'Compliance', 'exceptions': 'Exceptions', 'postmortems': 'Postmortems', 'ceremonies': 'Ceremonies', 'wallet-operations': 'Wallet Ops', 'smart-contracts': 'Smart Contracts', 'systems': 'Systems', 'data-assets': 'Data Assets', 'business-processes': 'Business Processes' };
export const SUBFOLDER_ICONS = { 'policies': 'policy', 'standards': 'standard', 'processes': 'process', 'runbooks': 'runbook', 'guidelines': 'guideline', 'playbooks': 'playbook', 'threat-models': 'threat-model', 'vendors': 'vendor', 'risks': 'risk', 'threats': 'threat', 'compliance': 'standard', 'exceptions': 'exception', 'postmortems': 'incident', 'ceremonies': 'dom-digital-assets', 'wallet-operations': 'dom-digital-assets', 'smart-contracts': 'runbook', 'data-assets': 'data-asset', 'business-processes': 'business-process' };
// Example labels for well-known frameworks. Instances extend this with their own
// framework keys (matching program/frameworks/<key>.yml); unlisted keys fall back to fwLabel().
export const FRAMEWORK_LABELS = { nist_csf: 'NIST CSF 2.0', iso_27001: 'ISO/IEC 27001:2022', soc2: 'SOC 2' };
export function fwLabel(key) { return FRAMEWORK_LABELS[key] || key.replace(/_/g, ' ').replace(/\b(iso|soc|nist|csf|pci|dss|ccss|bcm|aml|cft)\b/gi, function(m) { return m.toUpperCase(); }).replace(/([a-z])(\d)/gi, function(_, l, d) { return l.toUpperCase() + '-' + d; }).replace(/\b([a-z])/g, function(m) { return m.toUpperCase(); }); }
export const DOC_TYPE_COLORS = { policy: 'var(--accent)', standard: 'var(--cov-partial)', runbook: 'var(--mat4)', process: 'var(--mat2)', guideline: 'var(--fg2)', playbook: 'var(--cov-missing)', vendor: 'var(--mat3)', risk: 'var(--mat1)', adr: 'var(--mat5)', incident: 'var(--sev-critical)', 'threat-model': 'var(--mat5)', system: 'var(--cov-diy)', exception: 'var(--sev-medium)', capability: 'var(--accent)', 'data-asset': 'var(--mat3)', 'business-process': 'var(--cov-partial)', default: 'var(--fg3)' };
// Handles the union of all status enums: general (draft/active/deprecated/superseded)
// and exception-specific (active/expired/revoked). Fallback covers superseded + unknown.
export function statusColor(s) {
  if (s === 'active') return 'var(--cov-deployed)';
  if (s === 'draft') return 'var(--cov-partial)';
  if (s === 'expired' || s === 'revoked') return 'var(--sev-high)';
  return 'var(--cov-deprecated)';
}
export function stdNum(s) { const m = (s.fm.title || s.fm.id || '').match(/^(\d+)/); return m ? parseInt(m[1], 10) : 9999; }
export const HEAT_LEVELS = ['negligible', 'low', 'medium', 'high', 'critical'];
export const HEAT_LEVEL_LABELS = { negligible: 'Negligible', low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical' };
// 5x5 cell colors keyed by "severity_idx,likelihood_idx" (both 0..4 → negligible..critical).
// Derived from the criticality matrix in program/01-grc/standards/STD-risk-framework.md: score = (si+1) * (li+1),
// tier bands Low 1-2, Medium 3-7, High 8-14, Critical 15-25.
export const HEAT_COLORS = {
  '0,0': 'var(--heat-green)',  '0,1': 'var(--heat-green)',  '0,2': 'var(--heat-yellow)', '0,3': 'var(--heat-yellow)', '0,4': 'var(--heat-yellow)',
  '1,0': 'var(--heat-green)',  '1,1': 'var(--heat-yellow)', '1,2': 'var(--heat-yellow)', '1,3': 'var(--heat-orange)', '1,4': 'var(--heat-orange)',
  '2,0': 'var(--heat-yellow)', '2,1': 'var(--heat-yellow)', '2,2': 'var(--heat-orange)', '2,3': 'var(--heat-orange)', '2,4': 'var(--heat-red)',
  '3,0': 'var(--heat-yellow)', '3,1': 'var(--heat-orange)', '3,2': 'var(--heat-orange)', '3,3': 'var(--heat-red)',    '3,4': 'var(--heat-red)',
  '4,0': 'var(--heat-yellow)', '4,1': 'var(--heat-orange)', '4,2': 'var(--heat-red)',    '4,3': 'var(--heat-red)',    '4,4': 'var(--heat-darkred)'
};
// Criticality band → color, for the framework view's matrix cells and tier badges.
export const CRIT_BAND_COLORS = { Negligible: 'var(--heat-green)', Low: 'var(--heat-green)', Medium: 'var(--heat-yellow)', High: 'var(--heat-orange)', Critical: 'var(--heat-red)' };
// score (1..25) → tier band, mirrors the framework doc
// (Negligible 1, Low 2, Medium 3-7, High 8-14, Critical 15-25).
export function critBand(score) {
  if (score <= 1) return 'Negligible';
  if (score <= 2) return 'Low';
  if (score <= 7) return 'Medium';
  if (score <= 14) return 'High';
  return 'Critical';
}
export var CRIT_COLORS = { critical: 'var(--sev-critical)', high: 'var(--sev-high)', medium: 'var(--sev-medium)', low: 'var(--sev-low)', negligible: 'var(--sev-info)' };
export var CRIT_ORDER = { critical: 0, high: 1, medium: 2, low: 3, negligible: 4 };

