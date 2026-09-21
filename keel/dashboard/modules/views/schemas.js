import { mk, mkEmpty, th } from '../dom.js';
import { setActiveView, mainEl, rightEl, showRightPanel } from '../nav.js';
import { safeFetch } from '../security.js';

/* The machine-readable law, rendered. Everything here is read from the shipped
   schema files, so the page cannot describe a rule the validators do not
   enforce. */

/* All ten shipped schemas, not a selection: the page says it renders the
   machine-readable law, and a rule that is enforced but not shown is the one a
   reader trips over. Keep in step with keel/schemas/. */
const SCHEMAS = [
  ['frontmatter.schema.json', 'Every document in program/'],
  ['config.schema.json', 'program/config.yml'],
  ['model-domains.schema.json', 'program/model/domains.yml'],
  ['model-capabilities.schema.json', 'program/model/capabilities.yml'],
  ['model-systems.schema.json', 'program/model/systems.yml'],
  ['model-risk-taxonomy.schema.json', 'program/model/risk-taxonomy.yml'],
  ['framework-vocab.schema.json', 'program/model/frameworks/<id>.yml'],
  ['schedule.schema.json', 'program/schedule.yml'],
  ['publish.schema.json', 'program/publish.yml'],
  ['tools.schema.json', 'program/model/tools/<id>.yml'],
];

function renderProperties(container, properties, required) {
  const table = mk('table', 'schema-table');
  const head = mk('tr');
  ['Field', 'Type', 'Required', 'Notes'].forEach(function(h) { head.appendChild(th(h)); });
  table.appendChild(head);
  Object.keys(properties).forEach(function(name) {
    const spec = properties[name] || {};
    const row = mk('tr');
    row.appendChild(mk('td', 'schema-field', name));
    let type = spec.type || (spec.$ref ? spec.$ref.split('/').pop() : '');
    if (spec.const !== undefined) type = 'const ' + JSON.stringify(spec.const);
    if (spec.enum) type = spec.enum.join(' | ');
    row.appendChild(mk('td', 'schema-type', Array.isArray(type) ? type.join(' | ') : String(type)));
    row.appendChild(mk('td', '', (required || []).indexOf(name) !== -1 ? 'yes' : ''));
    row.appendChild(mk('td', 'schema-note', spec.description || ''));
    table.appendChild(row);
  });
  container.appendChild(table);
}

export function renderSchemas() {
  setActiveView('schemas');
  mainEl.textContent = ''; rightEl.textContent = ''; showRightPanel();
  mainEl.appendChild(mk('h1', '', 'Schemas'));
  mainEl.appendChild(mk('p', 'section-note',
    'What `kilagen check` enforces. A field that is not declared here is refused, '
    + 'which is what keeps deleted concepts from creeping back one convenient '
    + 'field at a time.'));

  Promise.all(SCHEMAS.map(function(s) {
    return safeFetch('keel/schemas/' + s[0]).then(function(t) { return JSON.parse(t); })
      .catch(function(err) {
        // Not silently: one missing schema used to vanish from the page, and
        // the empty state only appeared when every single one failed.
        console.warn('Schema not loaded: ' + s[0] + ' — ' + err.message);
        return null;
      });
  })).then(function(loaded) {
    const missing = [];
    loaded.forEach(function(schema, i) {
      if (!schema) { missing.push(SCHEMAS[i][0]); return; }
      const name = SCHEMAS[i][0], applies = SCHEMAS[i][1];
      mainEl.appendChild(mk('h2', '', schema.title || name));
      mainEl.appendChild(mk('p', 'section-note', applies + ' · ' + name));
      if (schema.description) mainEl.appendChild(mk('p', 'schema-desc', schema.description));

      const common = (schema.$defs && schema.$defs.common) || null;
      if (common) {
        mainEl.appendChild(mk('h3', '', 'Every document'));
        renderProperties(mainEl, common.properties || {}, common.required || []);
      }
      if (schema.oneOf) {
        mainEl.appendChild(mk('h3', '', 'Per type'));
        schema.oneOf.forEach(function(branch) {
          const props = Object.assign({}, branch.properties || {});
          delete props.type; delete props.id;
          if (!Object.keys(props).length) return;
          mainEl.appendChild(mk('h4', '', branch.title || ''));
          renderProperties(mainEl, props, branch.required || []);
        });
      }
      if (schema.properties && !common) {
        renderProperties(mainEl, schema.properties, schema.required || []);
      }
    });
    if (!loaded.filter(Boolean).length) {
      mainEl.appendChild(mkEmpty('file', 'Schemas unavailable', 'Run kilagen build.'));
    } else if (missing.length) {
      mainEl.appendChild(mk('p', 'section-note',
        missing.length + ' schema(s) could not be loaded: ' + missing.join(', ')
        + ' — run kilagen build.'));
    }
  });

  rightEl.appendChild(mk('h2', '', 'Files'));
  SCHEMAS.forEach(function(s) {
    const row = mk('div', 'right-item');
    row.appendChild(mk('div', 'right-item-title', s[0]));
    row.appendChild(mk('div', 'right-item-note', s[1]));
    rightEl.appendChild(row);
  });
}
