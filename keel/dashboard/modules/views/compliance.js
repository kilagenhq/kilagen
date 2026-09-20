import { mk, mkEmpty, mkIcon, th } from '../dom.js';
import { state, docById } from '../state.js';
import { go, setActiveView, setBread, mainEl, rightEl, showRightPanel, hideRightPanel } from '../nav.js';
import { frameworkWheel, frameworkBars, wheelCaption, barsCaption } from '../wheel.js';
import { fwLabel, BINDING_NOTE } from '../constants.js';

/* The auditor's lens: clause to requirement to what still stands against it.
 *
 * This is the only coverage the program computes, because it is the only one
 * with an external, finite denominator — the framework publishes its clause
 * list, and "which requirement covers clause 8" has a true answer in here.
 * What it never says is whether a clause is *met*.
 *
 * Two pages. The entry compares every framework in scope; the detail is one
 * framework, drawn in its own published structure.
 */

function chip(text, color, route) {
  const el = mk('span', 'pill', text);
  if (color) { el.style.borderColor = color; el.style.color = color; }
  if (route) { el.classList.add('clickable'); el.addEventListener('click', function(e) { e.stopPropagation(); go(route, e); }); }
  return el;
}

function docChip(id, color) {
  const fm = docById(id);
  const chipEl = chip(id, color, fm ? 'doc/' + fm.path : null);
  if (fm && fm.title) chipEl.title = fm.title;
  return chipEl;
}

function frameworkSummary(fw) {
  const clauses = state.coverage[fw] || {};
  const refs = Object.keys(clauses);
  return {
    total: refs.length,
    mapped: refs.filter(function(r) { return clauses[r].coverage === 'mapped'; }).length,
    gaps: refs.filter(function(r) { return clauses[r].gaps.length; }).length,
    exceptions: refs.filter(function(r) { return clauses[r].exceptions.length; }).length,
  };
}

function configEntry(fw) {
  return (state.config.frameworks || []).find(function(f) { return f && f.id === fw; }) || {};
}

function meta(fw) { return (state.frameworks && state.frameworks[fw]) || {}; }

/* Documents that declare this framework in their own frontmatter. This is how
   an instance says "why PCI applies to us and since when" without any new
   mechanism: the frameworks facet already exists on every type. Standards are
   excluded — they map at requirement level, which is the table below. */
function documentsTagged(fw) {
  return state.allDocs.map(function(d) { return state.fmCache[d.path]; })
    .filter(function(fm) {
      return fm && fm.type !== 'standard' && fm.frameworks
        && Object.prototype.hasOwnProperty.call(fm.frameworks, fw);
    })
    .sort(function(a, b) { return (a.id || '').localeCompare(b.id || ''); });
}

function bar(mapped, total) {
  const wrap = mk('div', 'fw-bar');
  const fill = mk('div', 'fw-bar-fill');
  fill.style.width = (total ? Math.round((mapped / total) * 100) : 0) + '%';
  wrap.appendChild(fill);
  return wrap;
}

/* ===== Entry: every framework in scope, side by side ===== */

function renderDashboard(frameworks) {
  mainEl.appendChild(mk('h1', '', 'Compliance'));

  const grid = mk('div', 'fw-card-grid');
  frameworks.forEach(function(fw) {
    const s = frameworkSummary(fw);
    const cfg = configEntry(fw);
    const m = meta(fw);

    const card = mk('div', 'fw-card');
    const head = mk('div', 'fw-card-head');
    head.appendChild(mk('span', 'fw-card-name', m.name || cfg.name || fwLabel(fw)));
    if (cfg.binding) {
      const badge = mk('span', 'fw-binding fw-binding-' + cfg.binding, cfg.binding);
      badge.title = BINDING_NOTE[cfg.binding] || '';
      head.appendChild(badge);
    }
    card.appendChild(head);

    const ratio = mk('div', 'fw-card-ratio');
    ratio.appendChild(mk('span', 'fw-card-ratio-value', s.mapped + ' / ' + s.total));
    ratio.appendChild(mk('span', 'fw-card-ratio-label', 'clauses mapped'));
    card.appendChild(ratio);
    card.appendChild(bar(s.mapped, s.total));

    const stats = mk('div', 'fw-card-stats');
    [['unmapped', s.total - s.mapped, s.total - s.mapped ? 'var(--fg2)' : null],
     ['with an open gap', s.gaps, s.gaps ? 'var(--sev-high)' : null],
     ['with a live exception', s.exceptions, s.exceptions ? 'var(--sev-medium)' : null]]
      .forEach(function(row) {
        const el = mk('div', 'fw-card-stat');
        const value = mk('span', 'fw-card-stat-value', String(row[1]));
        if (row[2]) value.style.color = row[2];
        el.appendChild(value);
        el.appendChild(mk('span', 'fw-card-stat-label', row[0]));
        stats.appendChild(el);
      });
    card.appendChild(stats);

    if (m.granularity) card.appendChild(mk('div', 'fw-card-granularity', m.granularity));

    card.addEventListener('click', function(e) { go('compliance/' + fw, e); });
    grid.appendChild(card);
  });
  mainEl.appendChild(grid);
}

/* ===== Detail: one framework, in its own structure ===== */

function clauseTable(container, refs, clauseNames) {
  const table = mk('table', 'compliance-table');
  const head = mk('tr');
  ['Clause', 'Requirement', 'Open gaps', 'Live exceptions'].forEach(function(h) {
    head.appendChild(th(h));
  });
  table.appendChild(head);

  refs.forEach(function(item) {
    const entry = item.entry;
    const row = mk('tr', entry.coverage === 'unmapped' ? 'clause-unmapped' : '');

    const clauseCell = mk('td', 'clause-ref');
    clauseCell.appendChild(mk('code', '', item.ref));
    const named = clauseNames[item.ref];
    if (named && named.name) clauseCell.appendChild(mk('span', 'clause-name', named.name));
    if (named && named.description) clauseCell.title = named.description;
    row.appendChild(clauseCell);

    const reqCell = mk('td');
    if (!entry.requirements.length) {
      reqCell.appendChild(chip('unmapped', 'var(--fg3)'));
    } else {
      entry.requirements.forEach(function(key) {
        const req = state.requirements[key];
        const fm = docById(key.split('#')[0]);
        const el = chip(key, 'var(--accent)', fm ? 'doc/' + fm.path : null);
        if (req && req.text) el.title = req.text;
        reqCell.appendChild(el);
      });
    }
    row.appendChild(reqCell);

    const gapCell = mk('td');
    entry.gaps.forEach(function(id) { gapCell.appendChild(docChip(id, 'var(--sev-high)')); });
    row.appendChild(gapCell);

    const excCell = mk('td');
    entry.exceptions.forEach(function(id) { excCell.appendChild(docChip(id, 'var(--sev-medium)')); });
    row.appendChild(excCell);

    table.appendChild(row);
  });
  const scroller = mk('div', 'table-scroll');
  scroller.appendChild(table);
  container.appendChild(scroller);
}

function renderDetail(fw) {
  const clauses = state.coverage[fw];
  const m = meta(fw);
  const cfg = configEntry(fw);
  const s = frameworkSummary(fw);

  setBread([{ label: 'Compliance', action: function(e) { go('compliance', e); } },
            { label: fwLabel(fw) }]);

  rightEl.textContent = '';
  showRightPanel();

  const title = mk('h1', 'fw-title');
  title.appendChild(mk('span', '', m.name || cfg.name || fwLabel(fw)));
  if (cfg.binding) {
    const badge = mk('span', 'fw-binding fw-binding-' + cfg.binding, cfg.binding);
    badge.title = BINDING_NOTE[cfg.binding] || '';
    title.appendChild(badge);
  }
  const pack = mk('button', 'audit-open-btn', 'Audit pack');
  pack.title = 'Every clause, its requirement, what stands against it — on one printable page';
  pack.addEventListener('click', function(e) { go('audit/' + fw, e); });
  title.appendChild(pack);
  mainEl.appendChild(title);

  /* The centre column is the clauses. Everything that describes the framework
     rather than listing it — what it is, what the denominator means, what
     coverage does not claim, and where the real text lives — is metadata about
     the thing you are looking at, and that is the panel. */
  rightEl.appendChild(mk('h3', '', 'Framework'));
  if (m.description) rightEl.appendChild(mk('p', 'fw-intro', m.description));
  rightEl.appendChild(mk('h3', '', 'Coverage'));
  rightEl.appendChild(mk('p', 'section-note',
    s.mapped + ' of ' + s.total + ' clauses have a requirement mapped to them.'
    + (m.granularity ? ' ' + m.granularity : '')));
  rightEl.appendChild(mk('p', 'section-note',
    'Coverage records whether a clause is addressed by a written requirement — '
    + 'never whether it is met. Sufficiency is a human judgement, and this view '
    + 'refuses to fake it.'));

  /* Where to read the normative text. This is the other half of
     reference-not-copy: we hold the references, the publisher holds the words. */
  const resources = (m.resources || []).filter(function(r) { return r && r.url && /^https:\/\//.test(r.url); });
  if (resources.length) {
    rightEl.appendChild(mk('h3', '', 'The text'));
    const box = mk('div', 'fw-resources');
    resources.forEach(function(r) {
      const a = mk('a', 'fw-resource-link', r.name || r.url);
      a.href = r.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      box.appendChild(a);
    });
    rightEl.appendChild(box);
  }

  /* The instance's own prose about this framework — scope, applicability,
     the AOC — is a normal document that tagged itself. No new mechanism. */
  const tagged = documentsTagged(fw);
  if (tagged.length) {
    const box = mk('div', 'fw-tagged');
    box.appendChild(mk('span', 'fw-tagged-label', 'In this program'));
    tagged.forEach(function(fm) {
      const row = mk('span', 'fw-tagged-doc');
      const icon = mkIcon(fm.type, 'doc-type-icon');
      row.appendChild(icon);
      row.appendChild(mk('span', '', fm.title || fm.id));
      row.addEventListener('click', function(e) { go('doc/' + fm.path, e); });
      box.appendChild(row);
    });
    mainEl.appendChild(box);
  }

  const clauseNames = {};
  const groups = m.groups || [];
  groups.forEach(function(g) {
    (g.clauses || []).forEach(function(c) { clauseNames[c.ref] = c; });
  });
  (m.clauses || []).forEach(function(c) { clauseNames[c.ref] = c; });

  const entriesFor = function(refs) {
    return refs.filter(function(ref) { return clauses[ref]; })
      .map(function(ref) { return { ref: ref, entry: clauses[ref] }; });
  };

  if (groups.length) {
    const statsOf = function(group) {
      const refs = (group.clauses || []).map(function(c) { return c.ref; });
      const present = refs.filter(function(r) { return clauses[r]; });
      return {
        total: present.length,
        mapped: present.filter(function(r) { return clauses[r].coverage === 'mapped'; }).length,
      };
    };
    /* The wheel only where the framework publishes a radial figure — a group
       marked center: true. Everywhere else, bars: a list is a list. */
    const radial = groups.some(function(g) { return g.center; });
    const jump = function(groupId) {
      const target = document.getElementById('fw-group-' + groupId);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    const figure = radial
      ? frameworkWheel(groups, statsOf, jump)
      : frameworkBars(groups, statsOf, jump);
    if (figure) {
      const wrap = mk('div', radial ? 'fw-wheel-wrap' : 'fw-bars-wrap');
      wrap.appendChild(figure);
      mainEl.appendChild(wrap);
      mainEl.appendChild(radial ? wheelCaption() : barsCaption());
    }

    groups.forEach(function(group) {
      const refs = (group.clauses || []).map(function(c) { return c.ref; });
      const rows = entriesFor(refs);
      if (!rows.length) return;
      const gs = statsOf(group);
      const section = mk('div', 'fw-group');
      section.id = 'fw-group-' + group.id;
      const head = mk('h2', 'fw-group-head');
      const swatch = mk('span', 'fw-group-swatch');
      if (group.color) swatch.style.background = group.color;
      head.appendChild(swatch);
      head.appendChild(mk('span', '', group.name));
      head.appendChild(mk('span', 'fw-group-count', gs.mapped + ' / ' + gs.total + ' mapped'));
      section.appendChild(head);
      if (group.description) section.appendChild(mk('p', 'section-note', group.description));
      clauseTable(section, rows, clauseNames);
      mainEl.appendChild(section);
    });
  } else {
    /* No published structure, so none is invented: the flat list it is. */
    clauseTable(mainEl, entriesFor(Object.keys(clauses)), clauseNames);
  }
}

export function renderCompliance(framework) {
  setActiveView('compliance');
  mainEl.textContent = ''; hideRightPanel();

  const frameworks = Object.keys(state.coverage);
  if (!frameworks.length) {
    mainEl.appendChild(mk('h1', '', 'Compliance'));
    mainEl.appendChild(mkEmpty('standard', 'No framework coverage',
      'A framework is measured when it is declared in program/config.yml. '
      + 'Kilagen ships the clause vocabularies, so the id is all it needs.'));
    return;
  }

  if (framework && state.coverage[framework]) renderDetail(framework);
  else renderDashboard(frameworks);
}
