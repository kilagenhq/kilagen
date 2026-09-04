import { safeFetch } from '../security.js';
import { mk, matDot, ghTreeUrl } from '../dom.js';
import { setActiveView, setBread, mainEl, rightEl } from '../nav.js';

export function renderSchemas() {
  setActiveView('schemas');
  mainEl.textContent = '';
  rightEl.textContent = '';
  setBread([{ label: 'Reference' }, { label: 'Schemas' }]);
  mainEl.appendChild(mk('h1', '', 'Schema Reference'));
  mainEl.appendChild(mk('p', '', 'Live reference from keel/schemas/. Content is fetched from the actual JSON schema files.'));

  Promise.all([
    safeFetch('schemas/frontmatter.schema.json'),
    safeFetch('schemas/capabilities.schema.json'),
  ]).then(function(results) {
    let fmSchema, capSchema;
    try { fmSchema = JSON.parse(results[0]); } catch(e) { throw new Error('frontmatter.schema.json is not valid JSON: ' + e.message); }
    try { capSchema = JSON.parse(results[1]); } catch(e) { throw new Error('capabilities.schema.json is not valid JSON: ' + e.message); }
    renderSchemaCard(fmSchema);
    renderSchemaCard(capSchema);
    // Right panel — source only
    rightEl.appendChild(mk('h3', '', 'Source'));
    ['keel/schemas/frontmatter.schema.json', 'keel/schemas/capabilities.schema.json'].forEach(function(f) {
      var pathRow = mk('div', 'meta-row'); pathRow.appendChild(mk('span', 'meta-key', 'File')); var pathVal = mk('span', 'meta-val', f); pathVal.style.fontFamily = "'SF Mono',SFMono-Regular,Consolas,monospace"; pathVal.style.fontSize = '11px'; pathRow.appendChild(pathVal); rightEl.appendChild(pathRow);
    });
    var ghHref = ghTreeUrl('keel/schemas'); if (ghHref) { var ghLink = mk('a', 'source-link', 'View in GitHub'); ghLink.href = ghHref; ghLink.target = '_blank'; ghLink.rel = 'noopener noreferrer'; rightEl.appendChild(ghLink); }
  }).catch(function(err) {
    console.warn('Schema load error:', err);
    mainEl.appendChild(mk('div', 'error-msg', 'Unable to load schemas: ' + (err.message || err)));
  });
}

function renderSchemaCard(schema) {
  const card = mk('div', 'ref-card');
  card.appendChild(mk('h3', '', schema.title || 'Schema'));
  if (schema.description) card.appendChild(mk('p', '', schema.description));

  const defs = schema.$defs || {};

  // Render enum definitions as visual grids
  Object.keys(defs).forEach(function(defName) {
    const def = defs[defName];
    if (def.enum) {
      card.appendChild(mk('h4', '', defName.replace(/_/g, ' ')));
      const grid = mk('div', 'ref-enum-grid');
      def.enum.forEach(function(val) {
        const item = mk('div', 'ref-enum-item');
        // Add colored dots for maturity enum
        if (defName === 'maturity_enum') {
          item.appendChild(matDot(val));
        }
        item.appendChild(mk('span', 'enum-label', val));
        if (def.description) item.appendChild(mk('span', 'enum-desc', def.description));
        grid.appendChild(item);
      });
      card.appendChild(grid);
    }
  });

  // Render object definitions with properties
  Object.keys(defs).forEach(function(defName) {
    const def = defs[defName];
    if (!def.properties) return;
    card.appendChild(mk('h4', '', defName.replace(/_/g, ' ')));
    const required = def.required || [];
    Object.keys(def.properties).forEach(function(fieldName) {
      const fieldDef = def.properties[fieldName];
      const row = mk('div', 'ref-field');
      row.appendChild(mk('span', 'rf-name', fieldName));
      row.appendChild(mk('span', 'rf-type', resolveType(fieldDef, defs)));
      row.appendChild(mk('span', 'rf-desc', fieldDef.description || ''));
      if (required.includes(fieldName)) row.appendChild(mk('span', 'rf-req', 'required'));
      card.appendChild(row);
    });
  });

  // Render top-level properties
  if (schema.properties) {
    card.appendChild(mk('h4', '', 'Root fields'));
    const topRequired = schema.required || [];
    Object.keys(schema.properties).forEach(function(fieldName) {
      const fieldDef = schema.properties[fieldName];
      const row = mk('div', 'ref-field');
      row.appendChild(mk('span', 'rf-name', fieldName));
      row.appendChild(mk('span', 'rf-type', resolveType(fieldDef, defs)));
      row.appendChild(mk('span', 'rf-desc', fieldDef.description || ''));
      if (topRequired.includes(fieldName)) row.appendChild(mk('span', 'rf-req', 'required'));
      card.appendChild(row);
    });
  }

  // Render oneOf variants (frontmatter schema has these for document types)
  if (schema.oneOf) {
    card.appendChild(mk('h4', '', 'Document types'));
    const tbl = mk('table', 'ref-table');
    const thead = mk('thead');
    const hrow = mk('tr');
    ['Type', 'ID pattern', 'Extra fields'].forEach(function(h) { hrow.appendChild(mk('th', '', h)); });
    thead.appendChild(hrow);
    tbl.appendChild(thead);
    const tbody = mk('tbody');
    schema.oneOf.forEach(function(variant) {
      const row = mk('tr');
      row.appendChild(mk('td', '', variant.title || ''));
      const idProp = variant.properties && variant.properties.id;
      const pattern = idProp && idProp.pattern ? idProp.pattern : '';
      const patternTd = mk('td');
      patternTd.appendChild(mk('code', '', pattern));
      row.appendChild(patternTd);
      // Extra required fields beyond common
      const extras = [];
      if (variant.required && variant.required.includes('frameworks')) extras.push('frameworks object');
      if (variant.properties && variant.properties.immutable) extras.push('immutable');
      if (variant.properties && variant.properties.severity) extras.push('severity');
      if (variant.properties && variant.properties.vendor_name) extras.push('vendor_name, tier');
      const extraReq = (variant.required || []).filter(function(r) { return r !== 'frameworks'; }).join(', ');
      if (extraReq) extras.push(extraReq);
      row.appendChild(mk('td', '', extras.join(', ') || variant.description || ''));
      tbody.appendChild(row);
    });
    tbl.appendChild(tbody);
    card.appendChild(tbl);
  }

  mainEl.appendChild(card);
}

function resolveType(fieldDef, defs) {
  if (!fieldDef || fieldDef === true) return '';
  if (fieldDef.$ref) {
    const refName = fieldDef.$ref.replace('#/$defs/', '');
    const refDef = defs[refName];
    if (refDef && refDef.enum) return refDef.enum.join(' | ');
    if (refDef && refDef.type) return refDef.type;
    return refName;
  }
  if (fieldDef.const) return JSON.stringify(fieldDef.const);
  if (fieldDef.type === 'array' && fieldDef.items) return resolveType(fieldDef.items, defs) + '[]';
  if (fieldDef.enum) return fieldDef.enum.join(' | ');
  if (fieldDef.oneOf) return fieldDef.oneOf.map(function(o) { return resolveType(o, defs); }).join(' | ');
  return fieldDef.type || '';
}
