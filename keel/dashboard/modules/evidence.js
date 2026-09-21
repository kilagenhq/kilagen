import { state, docById } from './state.js';
import { FRESHNESS_DAYS, today } from './constants.js';

/* Evidence, read the same way everywhere.
 *
 * `evidence:` belongs to a requirement, never to a document — nobody asks for
 * "the evidence of the Access Control Standard", they ask for the evidence
 * that entitlements are certified. So everything here walks standards ->
 * requirements -> evidence, and a row is always the three of them together.
 *
 * The rules that decide whether a piece of evidence still proves anything are
 * the ones `kilagen check evidence` applies, restated once in this module so
 * the page and the check cannot disagree: an artefact with no `collected` date
 * is undated, one past `collected + freshness` is stale, and one with a date
 * but no `freshness` has no expiry anybody declared. The dashboard adds one
 * state the check has no use for — `due soon` — because a page can warn and a
 * command can only pass or fail.
 */

/* Close enough to expiry to be worth chasing before it lapses. The check has
   no equivalent: it reports what *is* stale, which is the honest thing for a
   CI to do. A screen can afford to point at next month. */
export const DUE_SOON_DAYS = 30;

/* Order matters: it is the order the states are worth looking at, which is
   what the summary strip and the status filter both follow. */
export const EVIDENCE_STATES = [
  ['unproven', 'unproven', 'var(--fg3)'],
  ['stale', 'stale', 'var(--sev-high)'],
  ['undated', 'undated', 'var(--sev-high)'],
  ['due-soon', 'due soon', 'var(--sev-medium)'],
  ['unscheduled', 'no expiry set', 'var(--fg3)'],
  ['fresh', 'fresh', 'var(--cov-deployed)'],
];

const STATE_BY_KEY = {};
EVIDENCE_STATES.forEach(function(s) { STATE_BY_KEY[s[0]] = { key: s[0], label: s[1], color: s[2] }; });

export function evidenceStateInfo(key) {
  return STATE_BY_KEY[key] || { key: key, label: key, color: 'var(--fg3)' };
}

/* Whole days from `from` (default today) to an ISO date. Positive is future.
   Local to this module rather than constants.daysUntil because every rule
   here has to be testable against a fixed day. */
function dayDiff(iso, from) {
  const a = Date.parse(String(iso) + 'T00:00:00Z');
  const b = Date.parse(String(from || today()) + 'T00:00:00Z');
  if (isNaN(a) || isNaN(b)) return null;
  return Math.round((a - b) / 86400000);
}

/* The day this artefact stops proving anything, from the day it was produced
   and how often it has to be renewed. Empty when either half is missing —
   an expiry nobody can compute is better absent than invented. */
export function expiresOn(item) {
  if (!item || !item.collected) return '';
  const window = FRESHNESS_DAYS[item.freshness];
  if (!window) return '';
  const collected = Date.parse(String(item.collected) + 'T00:00:00Z');
  if (isNaN(collected)) return '';
  return new Date(collected + window * 86400000).toISOString().slice(0, 10);
}

export function evidenceState(item, when) {
  if (!item || !item.collected) return 'undated';
  const expires = expiresOn(item);
  if (!expires) return 'unscheduled';
  const days = dayDiff(expires, when);
  if (days === null) return 'unscheduled';
  if (days < 0) return 'stale';
  return days <= DUE_SOON_DAYS ? 'due-soon' : 'fresh';
}

function standards() {
  return Object.keys(state.fmCache)
    .map(function(path) { return state.fmCache[path]; })
    .filter(function(fm) { return fm && fm.type === 'standard'; })
    .sort(function(a, b) { return String(a.id || '').localeCompare(String(b.id || '')); });
}

/* Every requirement in the program, with whatever is attached to it. One walk,
   because each of the three views below wants a different slice of the same
   thing and walking it three times is how they drift apart. */
export function requirementRows(when) {
  const rows = [];
  standards().forEach(function(fm) {
    (fm.requirements || []).forEach(function(req) {
      if (!req) return;
      const evidence = (req.evidence || []).map(function(item) {
        return { item: item, state: evidenceState(item, when), expires: expiresOn(item) };
      });
      rows.push({
        standard: fm,
        req: req,
        key: String(fm.id || '') + '#' + String(req.ref || ''),
        evidence: evidence,
      });
    });
  });
  return rows;
}

/* Flattened to one row per artefact, which is what the table wants. */
export function evidenceRows(when) {
  const rows = [];
  requirementRows(when).forEach(function(row) {
    row.evidence.forEach(function(found) {
      rows.push({
        standard: row.standard, req: row.req, key: row.key,
        item: found.item, state: found.state, expires: found.expires,
      });
    });
  });
  return rows;
}

/* What a program can say about its own proof, in the numbers `check evidence`
   prints. `proven` counts requirements with something attached — not
   requirements whose evidence is any good, which is the next column along and
   deliberately a separate number. */
export function evidenceSummary(when) {
  const requirements = requirementRows(when);
  const counts = {};
  EVIDENCE_STATES.forEach(function(s) { counts[s[0]] = 0; });
  let artefacts = 0;
  requirements.forEach(function(row) {
    row.evidence.forEach(function(found) { counts[found.state] += 1; artefacts += 1; });
  });
  const proven = requirements.filter(function(row) { return row.evidence.length; }).length;
  const unproven = requirements.length - proven;
  counts.unproven = unproven;
  return {
    requirements: requirements.length,
    proven: proven,
    unproven: unproven,
    artefacts: artefacts,
    counts: counts,
  };
}

/* One row per thing that either proves a requirement or fails to.
 *
 * A requirement with nothing attached is a row too, with the state `unproven`.
 * That is the whole reason the table works: "what can we prove" and "what can
 * we not" are the same question asked of one list, so the second is a filter
 * rather than a second page somebody has to know exists.
 */
export function proofRows(when) {
  const rows = [];
  requirementRows(when).forEach(function(row) {
    if (!row.evidence.length) {
      rows.push({ standard: row.standard, req: row.req, key: row.key,
                  item: null, state: 'unproven', expires: '' });
      return;
    }
    row.evidence.forEach(function(found) {
      rows.push({ standard: row.standard, req: row.req, key: row.key,
                  item: found.item, state: found.state, expires: found.expires });
    });
  });
  return rows;
}

/* The collectors this program can run, and who runs them.
 *
 * The inventory comes from the build, which is the only thing that can see
 * both `collectors/` beside program/ and the ones shipped in the package. A
 * registry written before this existed simply has none, so the names actually
 * used by evidence entries are folded in as a fallback: a page that cannot
 * describe a collector should still admit it exists.
 */
export function collectorRows(when) {
  const declared = state.collectors || {};
  const found = {};
  Object.keys(declared).forEach(function(name) {
    const entry = declared[name] || {};
    found[name] = {
      name: name,
      source: entry.source || '',
      summary: entry.summary || '',
      path: entry.path || '',
      template: !!entry.template,
      uses: [],
    };
  });
  evidenceRows(when).forEach(function(row) {
    const name = row.item && row.item.collector;
    if (!name) return;
    if (!found[name]) {
      found[name] = { name: name, source: '', summary: '', path: '', template: false, uses: [] };
    }
    found[name].uses.push(row);
  });
  return Object.keys(found).sort().map(function(name) { return found[name]; });
}

/* Evidence attached to one standard's requirements. The standard's own tab
   and the whole-program page are the same two functions with a filter. */
export function requirementRowsOf(standardId, when) {
  return requirementRows(when).filter(function(row) {
    return row.standard && row.standard.id === standardId;
  });
}

/* How many of these requirement keys can be proven, and how many of those
   proofs have lapsed. Compliance prints it as a cell and the audit pack as a
   sentence; both used to walk it themselves, and a fix to one would not have
   reached the other. */
export function provenTally(keys) {
  let attached = 0;
  let lapsed = 0;
  keys.forEach(function(key) {
    const entry = state.requirements[key];
    const standard = entry && docById(entry.standard);
    const requirement = standard && (standard.requirements || [])
      .find(function(r) { return entry.ref && String(r.ref) === String(entry.ref); });
    const evidence = (requirement && requirement.evidence) || [];
    if (!evidence.length) return;
    attached += 1;
    if (evidence.some(function(item) {
      const verdict = evidenceState(item);
      return verdict === 'stale' || verdict === 'undated';
    })) lapsed += 1;
  });
  return { total: keys.length, attached: attached, lapsed: lapsed };
}
