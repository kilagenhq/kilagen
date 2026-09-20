import { mk, mkEmpty } from '../dom.js';
import { state, docById, isOpenGap, isLiveException } from '../state.js';
import { go, setActiveView, setBread, mainEl, hideRightPanel } from '../nav.js';
import { fwLabel, BINDING_NOTE, today } from '../constants.js';

/* The audit pack: one framework, one page, printable.
 *
 * What an auditor asks for, clause by clause: what you require, what stands
 * against it, and where the evidence is. Assembling that by hand is a week of
 * somebody's life and it is the same answer every year — and it is already in
 * here, in five different views.
 *
 * Saving it as PDF is printing it: same page, same template, `@media print`
 * drops the chrome. A second renderer would be a second thing to keep true.
 */

function line(container, label, value) {
  if (!value) return;
  const row = mk('div', 'audit-meta-row');
  row.appendChild(mk('span', 'audit-meta-key', label));
  row.appendChild(mk('span', 'audit-meta-val', String(value)));
  container.appendChild(row);
}

function howDemonstrated(req) {
  return req && req.how_demonstrated ? String(req.how_demonstrated).trim() : '';
}

function evidenceOf(fm, req) {
  const items = [];
  (req && req.evidence || []).forEach(function(item) { items.push(item); });
  return items;
}

/* The requirement behind a reference, with the standard that holds it. */
function requirementBlock(container, ref) {
  const entry = state.requirements[ref];
  const block = mk('div', 'audit-req');
  block.appendChild(mk('code', 'audit-req-ref', ref));
  if (!entry) {
    block.appendChild(mk('div', 'audit-req-text id-link-missing',
      'This requirement does not resolve.'));
    container.appendChild(block);
    return;
  }
  block.appendChild(mk('div', 'audit-req-text', String(entry.text || '').trim()));

  const standard = docById(entry.standard);
  const source = mk('div', 'audit-req-source');
  source.appendChild(mk('span', '', 'From '));
  source.appendChild(mk('span', 'audit-req-standard',
    (standard && standard.title ? standard.title + ' · ' : '') + entry.standard));
  if (standard && standard.owner) {
    source.appendChild(mk('span', '', ' · owner ' + (Array.isArray(standard.owner)
      ? standard.owner.join(', ') : standard.owner)));
  }
  if (standard && standard.last_reviewed) {
    source.appendChild(mk('span', '', ' · last reviewed ' + standard.last_reviewed));
  }
  block.appendChild(source);

  const requirement = standard && (standard.requirements || [])
    .find(function(r) { return entry.ref && String(r.ref) === String(entry.ref); });
  /* What an auditor asks in two moves: how do you show it, then show me. */
  const how = howDemonstrated(requirement);
  if (how) {
    const line = mk('div', 'audit-evidence');
    line.appendChild(mk('span', 'audit-evidence-label', 'How demonstrated'));
    line.appendChild(mk('span', 'audit-evidence-note', how));
    block.appendChild(line);
  }

  const evidence = evidenceOf(standard, requirement);
  if (evidence.length) {
    const list = mk('div', 'audit-evidence');
    list.appendChild(mk('span', 'audit-evidence-label', 'Evidence'));
    evidence.forEach(function(item) {
      if (item.url) {
        const link = mk('a', 'audit-evidence-link', item.name || item.url);
        link.href = item.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        list.appendChild(link);
      } else {
        list.appendChild(mk('span', 'audit-evidence-note', item.name));
      }
      if (item.collected) {
        list.appendChild(mk('span', 'audit-evidence-note', 'collected ' + item.collected));
      }
    });
    block.appendChild(list);
  }
  container.appendChild(block);
}

function contestBlock(container, id, kind) {
  const fm = docById(id);
  const block = mk('div', 'audit-contest audit-contest-' + kind);
  block.appendChild(mk('span', 'audit-contest-kind', kind === 'gap' ? 'Open gap' : 'Live exception'));
  block.appendChild(mk('span', 'audit-contest-id', id));
  if (!fm) { container.appendChild(block); return; }

  block.appendChild(mk('span', 'audit-contest-title', fm.title || ''));
  const facts = [];
  if (fm.severity) facts.push('severity ' + fm.severity);
  if (fm.found) facts.push('found ' + fm.found);
  if (fm.expires) facts.push('expires ' + fm.expires);
  if (fm.approved_by) {
    facts.push('approved by ' + (Array.isArray(fm.approved_by) ? fm.approved_by.join(', ') : fm.approved_by));
  }
  if (fm.owner) facts.push('owner ' + (Array.isArray(fm.owner) ? fm.owner.join(', ') : fm.owner));
  if (facts.length) block.appendChild(mk('span', 'audit-contest-facts', facts.join(' · ')));
  if (fm.description) block.appendChild(mk('div', 'audit-contest-desc', String(fm.description).trim()));
  container.appendChild(block);
}

export function renderAudit(fw) {
  setActiveView('compliance');
  mainEl.textContent = ''; hideRightPanel();

  const clauses = state.coverage[fw];
  if (!clauses) {
    setBread([{ label: 'Compliance', action: function(e) { go('compliance', e); } }]);
    mainEl.appendChild(mkEmpty('standard', 'No such framework',
      'The audit pack is built from the coverage of a framework in scope.'));
    return;
  }

  setBread([
    { label: 'Compliance', action: function(e) { go('compliance', e); } },
    { label: fwLabel(fw), action: function(e) { go('compliance/' + fw, e); } },
    { label: 'Audit pack' },
  ]);

  /* Screen only: on paper the page is the document. */
  const actions = mk('div', 'audit-actions');
  const print = mk('button', 'audit-print-btn', 'Print or save as PDF');
  print.addEventListener('click', function() { window.print(); });
  actions.appendChild(print);
  mainEl.appendChild(actions);

  const org = state.config.organization || {};
  const cfg = (state.config.frameworks || []).find(function(f) { return f && f.id === fw; }) || {};
  const header = mk('header', 'audit-header');
  header.appendChild(mk('h1', '', (org.legal_name || state.config.name) + ' — ' + fwLabel(fw)));
  const meta = mk('div', 'audit-meta');
  line(meta, 'Framework', cfg.name || fwLabel(fw));
  if (cfg.binding) line(meta, 'Binding', cfg.binding + ' — ' + (BINDING_NOTE[cfg.binding] || ''));
  line(meta, 'Generated', today());
  line(meta, 'Source', 'This repository. Every clause below links to the document it came from.');
  header.appendChild(meta);
  mainEl.appendChild(header);

  mainEl.appendChild(mk('p', 'audit-caveat',
    'Coverage records whether a clause is addressed by a written requirement — '
    + 'never whether it is met. Sufficiency is a human judgement, and this page '
    + 'refuses to fake it.'));

  const refs = Object.keys(clauses);
  const names = {};
  const m = (state.frameworks && state.frameworks[fw]) || {};
  (m.groups || []).forEach(function(g) {
    (g.clauses || []).forEach(function(c) { names[c.ref] = c; });
  });
  (m.clauses || []).forEach(function(c) { names[c.ref] = c; });

  refs.forEach(function(ref) {
    const entry = clauses[ref];
    const section = mk('section', 'audit-clause');

    const head = mk('div', 'audit-clause-head');
    head.appendChild(mk('span', 'audit-clause-ref', ref));
    const named = names[ref];
    if (named && named.name) head.appendChild(mk('span', 'audit-clause-name', named.name));
    section.appendChild(head);
    if (named && named.description) {
      section.appendChild(mk('p', 'audit-clause-desc', String(named.description).trim()));
    }

    const requirements = entry.requirements || [];
    if (!requirements.length) {
      section.appendChild(mk('div', 'audit-unmapped',
        'No requirement in this program maps to this clause.'));
    } else {
      requirements.forEach(function(ref_) { requirementBlock(section, ref_); });
    }

    (entry.gaps || []).filter(function(id) {
      const fm = docById(id);
      return !fm || isOpenGap(fm);
    }).forEach(function(id) { contestBlock(section, id, 'gap'); });

    (entry.exceptions || []).filter(function(id) {
      const fm = docById(id);
      return !fm || isLiveException(fm);
    }).forEach(function(id) { contestBlock(section, id, 'exception'); });

    mainEl.appendChild(section);
  });
}
