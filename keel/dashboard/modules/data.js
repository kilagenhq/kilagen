import { state, resetDerived } from './state.js';

/*
 * Load registry.json, built by `kilagen build`. One fetch populates every
 * lookup the views use; document bodies are fetched on demand.
 */
export function loadRegistry() {
  return fetch('../registry.json', { cache: 'no-store' }).then(function(r) {
    if (!r.ok) throw new Error(r.status === 404 ? 'registry.json not found — run kilagen build first' : 'Failed to load registry.json: HTTP ' + r.status);
    return r.json().catch(function(err) { throw new Error('registry.json is not valid JSON: ' + err.message); });
  }).then(function(reg) {
    if (reg.config) {
      if (reg.config.name) state.config.name = reg.config.name;
      if (reg.config.repo && /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(reg.config.repo)) state.config.repo = reg.config.repo;
      if (reg.config.organization && typeof reg.config.organization === 'object' && !Array.isArray(reg.config.organization)) state.config.organization = reg.config.organization;
      if (Array.isArray(reg.config.frameworks)) state.config.frameworks = reg.config.frameworks;
    }

    if (Array.isArray(reg.types)) state.types = reg.types;

    if (Array.isArray(reg.documents)) {
      reg.documents.forEach(function(doc) {
        state.fmCache[doc.path] = doc;
        state.allDocs.push({ path: doc.path, name: doc.path.split('/').pop() });
        if (doc.id) state.idToPath[doc.id] = doc.path;
      });
    }

    if (reg.model) {
      ['domains', 'capabilities', 'systems'].forEach(function(key) {
        if (Array.isArray(reg.model[key])) state.model[key] = reg.model[key];
      });
      if (reg.model.risk_taxonomy && typeof reg.model.risk_taxonomy === 'object') {
        state.model.risk_taxonomy = reg.model.risk_taxonomy;
      }
    }

    if (reg.coverage) state.coverage = reg.coverage;
    if (reg.requirements) state.requirements = reg.requirements;
    if (reg.publish) state.publish = reg.publish;
    if (Array.isArray(reg.schedule)) state.schedule = reg.schedule;
    if (Array.isArray(reg.framework_adrs)) state.frameworkAdrs = reg.framework_adrs;
    if (reg.frameworks && typeof reg.frameworks === 'object') state.frameworks = reg.frameworks;
    if (reg.tools && typeof reg.tools === 'object') state.tools = reg.tools;
    if (reg.collectors && typeof reg.collectors === 'object') state.collectors = reg.collectors;

    state.fullDiscoveryDone = true;
  });
}
