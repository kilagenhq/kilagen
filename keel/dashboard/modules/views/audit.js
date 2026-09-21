import { mk, mkEmpty, formatRoles } from '../dom.js';
import { state, docById, isOpenGap, isLiveException } from '../state.js';
import { go, setActiveView, setBread, mainEl, hideRightPanel } from '../nav.js';
import { fwLabel, BINDING_NOTE, today } from '../constants.js';
import { evidenceState } from '../evidence.js';
import { mkRecord, mkRecordHead, mkRecordRow, mkEvidenceEntry } from '../requirement.js';

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

/* What this framework's own requirements can be shown to be true.
 *
 * Scoped to the clauses in this pack rather than to the whole program: the
 * reader is holding one framework, and a number about a different question
 * would be worse than no number. A requirement reached by two clauses is
 * counted once.
 */
function provability(clauses) {
  const seen = {};
  Object.keys(clauses).forEach(function(ref) {
    (clauses[ref].requirements || []).forEach(function(key) { seen[key] = true; });
  });
  const keys = Object.keys(seen);
  if (!keys.length) return '';

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

  return keys.length + ' requirements answer this framework, ' + attached
    + ' with evidence attached'
    + (lapsed ? ', ' + lapsed + ' of those past its renewal period or undated' : '')
    + '.';
}

/* The requirement behind a reference, with the standard that holds it.
 *
 * The same record the standard's own page draws. It used to be its own layout
 * — a key, a paragraph, then a run-on line of middle-dot-joined metadata and
 * two more unlabelled rows — and the two had drifted into disagreeing about
 * everything. One shape, so a reader who has seen the page recognises the
 * printout, and so a change to either lands in both.
 */
function requirementBlock(container, ref) {
  const entry = state.requirements[ref];
  if (!entry) {
    const orphan = mkRecord();
    orphan.appendChild(mkRecordHead(ref, ref, ''));
    orphan.appendChild(mkRecordRow('Requirement',
      mk('span', 'id-link-missing', 'This requirement does not resolve.')));
    container.appendChild(orphan);
    return;
  }

  const standard = docById(entry.standard);
  const requirement = standard && (standard.requirements || [])
    .find(function(r) { return entry.ref && String(r.ref) === String(entry.ref); });

  const record = mkRecord();
  record.classList.add('audit-req');
  record.appendChild(mkRecordHead(String(entry.ref || ref), ref, entry.text));

  /* Which document this came from, and whether anybody has looked at it
     lately — the two things an auditor asks before reading the requirement. */
  const source = mk('div', 'audit-req-source');
  const title = mk('span', 'audit-req-standard',
    (standard && standard.title) ? standard.title : entry.standard);
  source.appendChild(title);
  source.appendChild(mk('code', 'audit-req-id', entry.standard));
  if (standard && standard.owner) {
    source.appendChild(mk('span', '', 'owner ' + formatRoles(standard.owner)));
  }
  if (standard && standard.last_reviewed) {
    source.appendChild(mk('span', '', 'last reviewed ' + standard.last_reviewed));
  }
  record.appendChild(mkRecordRow('From', source));

  /* What an auditor asks in two moves: how do you show it, then show me. */
  const how = requirement && requirement.how_demonstrated;
  if (how) {
    record.appendChild(mkRecordRow('Demonstrated by', String(how).trim(), 'req-row-prose'));
  }

  const evidence = (requirement && requirement.evidence) || [];
  if (!evidence.length) {
    /* Said out loud rather than left blank. A requirement with nothing
       attached and a requirement nobody rendered look identical when the
       answer is an absence, and in a document somebody signs, the explicit
       admission is the more credible of the two. */
    record.appendChild(mkRecordRow('Evidence',
      mk('span', 'req-ev-none', 'No evidence attached.'), 'req-row-prose'));
  } else {
    const list = mk('div', 'req-ev-list');
    evidence.forEach(function(item) { list.appendChild(mkEvidenceEntry(item)); });
    record.appendChild(mkRecordRow('Evidence', list));
  }

  container.appendChild(record);
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
  line(meta, 'Evidence', provability(clauses));
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
