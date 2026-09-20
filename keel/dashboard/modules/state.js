export const state = window.__keelState = {
  // Registry-derived
  types: [],            // the type registry, as shipped in registry.json
  model: { domains: [], capabilities: [], systems: [], risk_taxonomy: {} },
  coverage: {},         // framework -> clause -> { coverage, requirements, gaps, exceptions }
  requirements: {},     // "std-x#1.1" -> { standard, ref, text, frameworks, gaps, exceptions }
  publish: { destinations: {}, defaults: {} },
  schedule: [],
  frameworkAdrs: [],   // the framework's own ADRs, indexed by the build
  frameworks: {},      // framework id -> structure and prose; never seen by coverage
  tools: {},           // capability id -> the vendored inventory of what exists
  collectors: {},      // collector name -> where it lives and what it does

  // Document index
  fmCache: {},          // path -> frontmatter
  idToPath: {},         // id -> path
  allDocs: [],

  // View state
  currentDoc: '',
  currentView: 'home',
  expandedSections: {},
  bodyCache: {},
  fullDiscoveryDone: false,
  config: { name: 'Security Program', repo: '', organization: null, frameworks: [] },
};

/* ===== Derived lookups ===== */

export function docById(id) {
  const path = state.idToPath[id];
  return path ? state.fmCache[path] : null;
}

export function docsOfType(type) {
  return state.allDocs.map(function(d) { return state.fmCache[d.path]; })
    .filter(function(fm) { return fm && fm.type === type; });
}

export function docsWithFacet(facet, value) {
  return state.allDocs.map(function(d) { return state.fmCache[d.path]; })
    .filter(function(fm) { return fm && Array.isArray(fm[facet]) && fm[facet].indexOf(value) !== -1; });
}

export function typeInfo(name) {
  for (let i = 0; i < state.types.length; i++) if (state.types[i].name === name) return state.types[i];
  return null;
}

/* A gap is open until a write-once fact closes it. There is no status to read:
   the same rule the validators use, so the two cannot disagree. */
export function isOpenGap(fm) {
  return !!fm && fm.type === 'gap' && !fm.remediated && !fm.excepted_by;
}

/* An exception is live until it is revoked or it expires — two write-once
   facts and nothing else. It has no status either. */
export function isLiveException(fm, today) {
  if (!fm || fm.type !== 'exception' || fm.revoked || !fm.expires) return false;
  return String(fm.expires) >= (today || new Date().toISOString().slice(0, 10));
}

/* The one place a derived state becomes a word and a colour.
 *
 * `gap` and `exception` have no `status` — it was removed because a declared
 * field could only contradict the write-once facts. Every view that wants to
 * show "what state is this in" asks here, so the tables cannot disagree with
 * each other or with the validators. Anything else returns null and the caller
 * falls back to the declared `status`.
 */
export function derivedState(fm, today) {
  if (!fm) return null;
  if (fm.type === 'gap') {
    if (fm.remediated) return { label: 'remediated ' + fm.remediated, color: 'var(--cov-deployed)' };
    if (fm.excepted_by) return { label: 'excepted', color: 'var(--sev-medium)' };
    return { label: 'open', color: 'var(--sev-high)' };
  }
  if (fm.type === 'exception') {
    if (fm.revoked) return { label: 'revoked', color: 'var(--fg3)' };
    if (isLiveException(fm, today)) return { label: 'live', color: 'var(--cov-deployed)' };
    return { label: 'expired', color: 'var(--sev-high)' };
  }
  return null;
}

/* Who replaced this document, worked out from the other side.
 *
 * Only the new document declares `supersedes:`. The old one used to carry a
 * `superseded_by:` of its own, which meant the same edge was written twice and
 * the two copies could disagree — and it meant reopening an approved document
 * purely to record its own death. So the back-reference is computed here, in
 * the one place, the same way Connections already computed it.
 *
 * Indexed once per document set rather than scanned per document: the naive
 * version is O(n²) and a program with a few thousand documents is exactly the
 * one that can afford it least.
 */
let supersedeIndex = null;
let supersedeIndexFor = null;

function buildSupersedeIndex() {
  const paths = Object.keys(state.fmCache);
  if (supersedeIndex && supersedeIndexFor === state.fmCache && supersedeIndex.size === undefined) {
    return supersedeIndex;
  }
  const index = {};
  paths.forEach(function(path) {
    const fm = state.fmCache[path];
    if (!fm || !fm.id) return;
    (fm.supersedes || []).forEach(function(oldId) {
      if (oldId && oldId !== fm.id && !index[oldId]) index[oldId] = fm.id;
    });
  });
  supersedeIndex = index;
  supersedeIndexFor = state.fmCache;
  return index;
}

/* Called by data.js after a load, so a rebuilt document set is never read
   through a stale index. */
export function resetDerived() {
  supersedeIndex = null;
  supersedeIndexFor = null;
}

export function supersededBy(fm) {
  if (!fm || !fm.id) return null;
  if (!supersedeIndex || supersedeIndexFor !== state.fmCache) buildSupersedeIndex();
  return supersedeIndex[fm.id] || null;
}

/* Which standard a document belongs to.
 *
 * A standard is its own. A gap or an exception belongs to the standard of the
 * requirement it contests, which it already names as `<standard-id>#<ref>` —
 * so this is a read of existing data, not a new field. Nothing else has one,
 * and returning '' is how the filter bar learns the facet does not apply.
 */
export function standardIdOf(fm) {
  if (!fm) return '';
  if (fm.type === 'standard') return fm.id || '';
  if (fm.requirement) return String(fm.requirement).split('#')[0];
  return '';
}

/* The declared status, unless something supersedes this document — in which
   case it is superseded, and that is not an opinion anybody had to type. */
export function statusOf(fm) {
  if (!fm) return '';
  return supersededBy(fm) ? 'superseded' : (fm.status || '');
}
