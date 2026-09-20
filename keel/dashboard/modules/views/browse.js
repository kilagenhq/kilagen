import { mk, mkIcon, mkEmpty, formatRoles, th, makeSortable } from '../dom.js';
import { state, docsOfType, derivedState, isLiveException } from '../state.js';
import { go, setActiveView, setBread, splitHash, setParams, getHash, mainEl, hideRightPanel } from '../nav.js';
import { mountFilters } from '../filters.js';
import { riskHeatmap } from '../heatmap.js';
import { typePlural, typeLabel, typeColor, statusColor, SEVERITY_COLORS, STATE_IS_DERIVED, TYPE_NOTES } from '../constants.js';

/* Browse answers "what documents exist".
 *
 * The entry page is one table over everything, because the question a person
 * arrives with is "where is the thing about X", not "how many types are
 * there". Slicing by type is a filter, and so is every other slice — which is
 * why the pile of per-type sections went and the filter bar came.
 */

function badge(text, color) {
  const el = mk('span', 'pill', text);
  if (color) { el.style.borderColor = color; el.style.color = color; }
  return el;
}

function badgeList(values, color) {
  const wrap = mk('span', 'pill-row');
  (values || []).forEach(function(v) { wrap.appendChild(badge(v, color)); });
  return wrap;
}

/* Status for a type that declares one; the derived state for `gap` and
   `exception`, which do not. Without this the general table printed an empty
   pill for every gap and exception in the program. */
function stateCell(fm) {
  const derived = derivedState(fm);
  if (derived) return badge(derived.label, derived.color);
  return fm.status ? badge(fm.status, statusColor(fm.status)) : '';
}

function domainsCell(fm) {
  const names = (fm.domains || []).map(function(id) {
    const d = state.model.domains.find(function(x) { return x.id === id; });
    return d ? d.name : id;
  });
  return names.join(', ');
}

/* Columns worth showing for a given type, beyond the ones every document has.
   Each returns a cell value or a node; nothing here invents data — a column
   exists because the schema gives that type the field. */
const EXTRA_COLUMNS = {
  policy: [
    ['Approved by', function(fm) { return formatRoles(fm.approved_by); }],
  ],
  standard: [
    ['Requirements', function(fm) { return String((fm.requirements || []).length); }],
    ['Approved by', function(fm) { return formatRoles(fm.approved_by); }],
  ],
  process: [['Domains', domainsCell]],
  runbook: [['Domains', domainsCell]],
  playbook: [['Domains', domainsCell]],
  guideline: [['Domains', domainsCell]],
  role: [
    ['Kind', function(fm) { return fm.role_type || ''; }],
    ['Reports to', function(fm) { return formatRoles(fm.reports_to); }],
    ['Source of truth', function(fm) { return fm.source_of_truth ? 'external' : ''; }],
  ],
  /* The third-party inventory. Criticality, RTO, RPO and CIA are assessments,
     and they sit here rather than on a system because a vendor document has
     an owner and a next_review — the annual reassessment is what keeps them
     from going quietly stale. An internal system's are the estate's. */
  vendor: [
    ['Vendor', function(fm) { return fm.vendor_name || ''; }],
    ['Tier', function(fm) { return fm.tier ? badge(fm.tier, SEVERITY_COLORS[fm.tier] || null) : ''; }],
    ['Criticality', function(fm) { return fm.criticality ? badge(fm.criticality, SEVERITY_COLORS[fm.criticality]) : ''; }],
    ['C·I·A', function(fm) {
      if (!fm.cia) return '';
      const row = mk('span', 'pill-row');
      ['confidentiality', 'integrity', 'availability'].forEach(function(k) {
        const v = fm.cia[k];
        if (!v) return;
        const el = badge(k.charAt(0).toUpperCase() + ' ' + v, SEVERITY_COLORS[v]);
        el.title = k + ': ' + v;
        row.appendChild(el);
      });
      return row;
    }],
    ['RTO', function(fm) { return fm.rto || ''; }],
    ['Certifications', function(fm) {
      /* Objects since m003 — `{name, verified, url}`. Printing the list raw
         put [object Object] in the column. */
      return badgeList((fm.certifications || []).map(function(c) {
        return c && c.name ? c.name : String(c);
      }), 'var(--fg3)');
    }],
    ['Next reassessment', function(fm) { return fm.next_review || ''; }],
  ],
  threat: [['Severity', function(fm) { return fm.severity ? badge(fm.severity, SEVERITY_COLORS[fm.severity]) : ''; }]],
  'threat-model': [
    ['Methodology', function(fm) { return fm.methodology || ''; }],
    ['Scope', function(fm) { return fm.scope || ''; }],
  ],
  'data-asset': [
    ['Classification', function(fm) { return fm.classification || ''; }],
    ['PII', function(fm) { return fm.pii ? 'yes' : 'no'; }],
    ['Retention', function(fm) { return fm.retention_years != null ? fm.retention_years + ' years' : ''; }],
  ],
  'business-process': [
    ['Function', function(fm) { return fm.business_function || ''; }],
    ['Criticality', function(fm) { return fm.criticality || ''; }],
    ['RTO', function(fm) { return fm.rto || ''; }],
  ],
  risk: [['Severity', function(fm) { return fm.severity ? badge(fm.severity, SEVERITY_COLORS[fm.severity]) : ''; }]],
  gap: [
    ['Requirement', function(fm) { return fm.requirement || ''; }],
    ['Source', function(fm) { return fm.source || ''; }],
    ['State', stateCell],
  ],
  exception: [
    ['Requirement', function(fm) { return fm.requirement || ''; }],
    ['Expires', function(fm) { return fm.expires || ''; }],
    ['State', stateCell],
  ],
  decision: [['Decided', function(fm) { return fm.decided || ''; }]],
  incident: [
    ['Occurred', function(fm) { return fm.occurred || ''; }],
    ['Severity', function(fm) { return fm.severity ? badge(fm.severity, SEVERITY_COLORS[fm.severity]) : ''; }],
  ],
};

/* The facets each view offers, in order. The bar drops any that have no
   values in the current set, so a type-specific one costs nothing on a type
   that does not carry it. */
const ALL_FACETS = ['type', 'status', 'standard', 'owner', 'domain', 'capability', 'system', 'severity'];
const TYPE_FACETS = ['status', 'state', 'standard', 'owner', 'domain', 'capability', 'system',
                     'severity', 'treatment', 'cause', 'source', 'tier', 'criticality',
                     'classification'];

function cell(row, value) {
  const td = mk('td');
  if (value instanceof Node) td.appendChild(value);
  else td.textContent = value == null ? '' : String(value);
  row.appendChild(td);
}

/* The icon and the id live in a span inside the cell. They used to be laid out
   by making the <td> itself a flex container, which stops it being a table cell
   at all: the browser takes it out of the table box model and wraps it in an
   anonymous cell, so the column sat short of its own row and out of line with
   the header. */
function idCell(fm) {
  const td = mk('td');
  const wrap = mk('span', 'browse-id');
  const icon = mkIcon(fm.type, 'doc-type-icon');
  icon.style.color = typeColor(fm.type);
  wrap.appendChild(icon);
  wrap.appendChild(mk('span', '', fm.id || ''));
  td.appendChild(wrap);
  return td;
}

function table(container, docs, columns) {
  const el = mk('table', 'browse-table');
  const head = mk('tr');
  columns.forEach(function(c) { head.appendChild(th(c[0])); });
  el.appendChild(head);
  docs.forEach(function(fm) {
    const row = mk('tr');
    columns.forEach(function(c) {
      if (c[1] === idCell) row.appendChild(idCell(fm));
      else cell(row, c[1](fm));
    });
    row.addEventListener('click', function(e) { go('doc/' + fm.path, e); });
    el.appendChild(row);
  });
  makeSortable(el);
  const scroller = mk('div', 'table-scroll');
  scroller.appendChild(el);
  container.appendChild(scroller);
}

function byId(a, b) { return (a.id || '').localeCompare(b.id || ''); }

export function renderBrowse(type) {
  setActiveView('program');
  mainEl.textContent = ''; hideRightPanel();

  if (type) {
    const info = state.types.find(function(t) { return t.name === type; });
    setBread([{ label: 'Program', action: function(e) { go('program', e); } }, { label: typePlural(type) }]);
    mainEl.appendChild(mk('h1', '', typePlural(type)));
    if (TYPE_NOTES[type]) mainEl.appendChild(mk('p', 'section-note', TYPE_NOTES[type]));
    if (info) {
      mainEl.appendChild(mk('p', 'type-path',
        'program/' + info.folder + '/' + (info.dated ? '<year>/' : '') + info.prefix + '-*.md'));
    }

    const docs = docsOfType(type).sort(byId);
    if (!docs.length) {
      mainEl.appendChild(mkEmpty('file', 'Nothing of this type yet',
        'Documents appear here as soon as one exists in program/' + (info ? info.folder : type) + '/.'));
    } else {
      const columns = [['Id', idCell], ['Title', function(fm) { return fm.title || ''; }]]
        .concat(STATE_IS_DERIVED[type]
          ? []
          : [['Status', stateCell]])
        .concat([['Owner', function(fm) { return formatRoles(fm.owner); }]])
        .concat(EXTRA_COLUMNS[type] || []);

      /* Risk is the one type with a second honest shape: the matrix. It is a
         view of the same filtered set, not a seventh lens — the filters still
         apply, so "the IAM risks, on the matrix" is one URL. */
      const severity = (state.model.risk_taxonomy || {}).severity;
      const canHeatmap = type === 'risk' && severity && severity.likelihood && severity.bands;
      /* The matrix is what somebody wants to see first of a risk register,
         so it is the default and the table is one click away. */
      let shape = canHeatmap && splitHash(getHash()).params.shape !== 'table' ? 'heatmap' : 'table';

      const bar = mountFilters(mainEl, docs, {
        route: 'program/' + type,
        facets: TYPE_FACETS,
        noun: typePlural(type).toLowerCase(),
        render: function(filtered, el) {
          if (shape === 'heatmap') {
            const map = riskHeatmap(filtered, severity, function(fm, e) { go('doc/' + fm.path, e); });
            if (map) { el.appendChild(map); return; }
          }
          table(el, filtered, columns);
        },
      });

      if (canHeatmap) {
        const toggle = mk('div', 'shape-toggle');
        [['heatmap', 'Heatmap'], ['table', 'Table']].forEach(function(pair) {
          const btn = mk('button', 'shape-btn' + (shape === pair[0] ? ' active' : ''), pair[1]);
          btn.addEventListener('click', function() {
            if (shape === pair[0]) return;
            shape = pair[0];
            const params = splitHash(getHash()).params;
            if (shape === 'table') params.shape = 'table'; else delete params.shape;
            setParams('program/' + type, params);
            bar.apply();
            toggle.querySelectorAll('.shape-btn').forEach(function(b) {
              b.classList.toggle('active', b.textContent === pair[1]);
            });
          });
          toggle.appendChild(btn);
        });
        // The toggle belongs on the filter row, at its right edge.
        const filterBar = mainEl.querySelector('.filter-bar');
        if (filterBar) filterBar.appendChild(toggle); else mainEl.appendChild(toggle);
      }
    }
    return;
  }

  mainEl.appendChild(mk('h1', '', 'Program'));

  const all = state.allDocs.map(function(d) { return state.fmCache[d.path]; })
    .filter(Boolean).sort(byId);
  if (!all.length) {
    mainEl.appendChild(mkEmpty('file', 'No documents yet',
      'Copy a template from keel/templates/ into the folder of its type.'));
    return;
  }

  const columns = [
    ['Id', idCell],
    ['Type', function(fm) { return typeLabel(fm.type); }],
    ['Title', function(fm) { return fm.title || ''; }],
    ['Status', stateCell],
    ['Owner', function(fm) { return formatRoles(fm.owner); }],
  ];
  mountFilters(mainEl, all, {
    route: 'program',
    facets: ALL_FACETS,
    noun: 'documents',
    render: function(filtered, el) { table(el, filtered, columns); },
  });

}
