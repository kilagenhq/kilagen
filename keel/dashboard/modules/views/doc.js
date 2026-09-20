import { mk, mkIcon, mkEmpty, mkMetaRow, mkCopyBtn, mkSourcePanel, formatRoles, makeCollapsible, dropRepeatedTitle } from '../dom.js';
import { state, docById, isOpenGap, isLiveException, typeInfo, supersededBy, statusOf } from '../state.js';
import { go, setActiveView, setBread, mainEl, rightEl, showRightPanel } from '../nav.js';
import { renderMd, safeHtmlNode } from '../parsers.js';
import { safeFetch, hookLinks } from '../security.js';
import { renderConnections } from '../connections.js';
import { typeColor, typeLabel, typePlural, statusColor, SEVERITY_COLORS, fwLabel, daysUntil, FRESHNESS_DAYS } from '../constants.js';

/* One document, its metadata, its body, and what it relates to.
 *
 * `related` is a flat list of ids: the target's type comes from its prefix, so
 * the grouping you see here is computed at render time and cannot contradict
 * the data — which is exactly what the grouped mapping used to allow.
 */

function idLink(id) {
  const fm = docById(id);
  const el = mk('span', 'id-link', id);
  if (fm) {
    el.title = fm.title || '';
    el.addEventListener('click', function(e) { go('doc/' + fm.path, e); });
  } else {
    el.classList.add('id-link-missing');
    el.title = 'No document with this id';
  }
  return el;
}

function groupByPrefix(ids) {
  const groups = {};
  ids.forEach(function(id) {
    const info = (state.types || []).find(function(t) { return String(id).indexOf(t.prefix + '-') === 0; });
    const key = info ? info.name : 'other';
    (groups[key] = groups[key] || []).push(id);
  });
  return groups;
}

function relatedSection(container, title, ids) {
  if (!ids || !ids.length) return;
  container.appendChild(mk('h3', '', title));
  const groups = groupByPrefix(ids);
  Object.keys(groups).sort().forEach(function(type) {
    const block = mk('div', 'related-group');
    block.appendChild(mk('div', 'related-group-label', typePlural(type)));
    groups[type].forEach(function(id) { block.appendChild(idLink(id)); });
    container.appendChild(block);
  });
}

function requirementsBlock(container, fm) {
  const requirements = fm.requirements || [];
  if (!requirements.length) return;
  container.appendChild(mk('h2', '', 'Requirements'));
  container.appendChild(mk('p', 'section-note',
    'Each one is addressable on its own: a framework clause maps to it, and a gap '
    + 'or an exception is filed against it by id.'));

  requirements.forEach(function(req) {
    const key = fm.id + '#' + req.ref;
    const state_ = state.requirements[key] || { gaps: [], exceptions: [] };
    const block = mk('div', 'req-block');

    const head = mk('div', 'req-head');
    head.appendChild(mk('code', 'req-ref', key));
    (state_.gaps || []).forEach(function(id) {
      const pill = mk('span', 'pill clickable', 'gap: ' + id);
      pill.style.borderColor = 'var(--sev-high)'; pill.style.color = 'var(--sev-high)';
      pill.addEventListener('click', function(e) { const g = docById(id); if (g) go('doc/' + g.path, e); });
      head.appendChild(pill);
    });
    (state_.exceptions || []).forEach(function(id) {
      const pill = mk('span', 'pill clickable', 'exception: ' + id);
      pill.style.borderColor = 'var(--sev-medium)'; pill.style.color = 'var(--sev-medium)';
      pill.addEventListener('click', function(e) { const x = docById(id); if (x) go('doc/' + x.path, e); });
      head.appendChild(pill);
    });
    block.appendChild(head);

    block.appendChild(mk('div', 'req-text', String(req.text || '').trim()));
    /* Two different things an auditor asks for separately: how you show it,
       and then show me. They used to share the name `evidence` and the audit
       page listed them together, half of them clickable. */
    if (req.how_demonstrated) {
      const how = mk('div', 'req-evidence');
      how.appendChild(mk('span', 'req-evidence-label', 'How demonstrated'));
      how.appendChild(mk('span', '', String(req.how_demonstrated).trim()));
      block.appendChild(how);
    }
    (req.evidence || []).forEach(function(item) {
      const ev = mk('div', 'req-evidence');
      ev.appendChild(mk('span', 'req-evidence-label', 'Evidence'));
      const link = mk('a', 'source-link', item.name || item.url);
      link.href = item.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
      ev.appendChild(link);
      if (item.collected) {
        const age = mk('span', 'req-evidence-age', 'collected ' + item.collected);
        const days = daysUntil(item.collected);
        if (days !== null && FRESHNESS_DAYS[item.freshness] && -days > FRESHNESS_DAYS[item.freshness]) {
          age.style.color = 'var(--sev-high)';
          age.textContent += ' · overdue';
        }
        ev.appendChild(age);
      }
      block.appendChild(ev);
    });
    if (req.frameworks) {
      const maps = mk('div', 'req-frameworks');
      Object.keys(req.frameworks).forEach(function(fw) {
        (req.frameworks[fw] || []).forEach(function(clause) {
          const pill = mk('span', 'pill clickable', fwLabel(fw) + ' ' + clause);
          pill.addEventListener('click', function(e) { go('compliance/' + fw, e); });
          maps.appendChild(pill);
        });
      });
      block.appendChild(maps);
    }
    container.appendChild(block);
  });
}

/* A gap or an exception is defined by the requirement it contests. Showing
   that requirement's text here is what makes the document readable alone. */
function contestBlock(container, fm) {
  if (!fm.requirement) return;
  const req = state.requirements[fm.requirement];
  const block = mk('div', 'contest-block');
  const head = mk('div', 'contest-head');
  head.appendChild(mk('span', 'contest-label',
    fm.type === 'gap' ? 'Falls short of' : 'Deviates from'));
  head.appendChild(idLink(String(fm.requirement).split('#')[0]));
  head.appendChild(mk('code', 'req-ref', fm.requirement));
  block.appendChild(head);
  if (req && req.text) block.appendChild(mk('div', 'req-text', String(req.text).trim()));
  else block.appendChild(mk('div', 'req-text id-link-missing', 'This requirement does not resolve.'));

  const state_ = mk('div', 'contest-state');
  if (fm.type === 'gap') {
    if (fm.remediated) state_.textContent = 'Closed: remediated on ' + fm.remediated + '.';
    else if (fm.excepted_by) state_.textContent = 'Closed: authorized after the fact by ' + fm.excepted_by + '.';
    else state_.textContent = 'Open. Nobody has approved this deviation.';
  } else {
    if (fm.revoked) state_.textContent = 'Revoked on ' + fm.revoked + '.';
    else {
      const days = daysUntil(fm.expires);
      state_.textContent = isLiveException(fm)
        ? 'Live until ' + fm.expires + (days !== null && days <= 60 ? ' — ' + days + ' days left.' : '.')
        : 'Expired on ' + fm.expires + '. This is an unapproved deviation again.';
    }
  }
  block.appendChild(state_);

  if (fm.tracker) {
    const work = mk('div', 'contest-work');
    const link = mk('a', 'action-link', 'Open in tracker \u2197');
    link.href = fm.tracker; link.target = '_blank'; link.rel = 'noopener noreferrer';
    work.appendChild(link);
    work.appendChild(mk('span', 'contest-work-note',
      'The tracker owns this work\u2019s lifecycle. Nothing here mirrors its state.'));
    block.appendChild(work);
  }

  container.appendChild(block);
}

/* A list of short strings the panel had no row for. */
function pillSection(title, values) {
  if (!values || !values.length) return;
  rightEl.appendChild(mk('h3', '', title));
  const wrap = mk('div', 'facet-list');
  values.forEach(function(value) { wrap.appendChild(mk('span', 'pill', String(value))); });
  rightEl.appendChild(wrap);
}

/* A claim about a third party, with the day somebody checked it. Undated, it
   is the weakest thing in the model, so the absence is shown rather than
   hidden. */
function certificationSection(certifications) {
  if (!certifications || !certifications.length) return;
  rightEl.appendChild(mk('h3', '', 'Certifications'));
  certifications.forEach(function(cert) {
    const row = mk('div', 'meta-row');
    if (cert.url) {
      const link = mk('a', 'source-link', cert.name || '');
      link.href = cert.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
      row.appendChild(link);
    } else {
      row.appendChild(mk('span', 'meta-key', cert.name || ''));
    }
    const when = mk('span', 'meta-val', cert.verified ? 'verified ' + cert.verified : 'undated');
    if (!cert.verified) when.style.color = 'var(--sev-medium)';
    row.appendChild(when);
    rightEl.appendChild(row);
  });
}

function publishBlock(container, fm) {
  const defaults = (state.publish.defaults || {})[fm.type] || [];
  let targets = defaults;
  if (fm.publish === 'none') targets = [];
  else if (fm.publish === 'all') targets = Object.keys(state.publish.destinations || {});
  else if (Array.isArray(fm.publish)) targets = fm.publish;
  if (!targets.length && !fm.publish) return;
  container.appendChild(mk('h3', '', 'Publishing'));
  if (!targets.length) {
    container.appendChild(mk('div', 'right-note-sm', 'Not published.'));
    return;
  }
  container.appendChild(mkMetaRow('Destinations', targets.join(', ')));
  container.appendChild(mk('div', 'right-note-sm',
    'Published from git, one way. Edits belong here, not in the destination.'));
}

/* How long an incident ran, which is the number everybody looks for and the
   one the page never showed: it had the day it started and the day it ended
   and printed only the first. */
function incidentDuration(fm) {
  if (!fm.occurred || !fm.resolved) return '';
  const from = Date.parse(fm.occurred);
  const to = Date.parse(fm.resolved);
  if (isNaN(from) || isNaN(to) || to < from) return '';
  const days = Math.round((to - from) / 86400000);
  return days === 0 ? 'same day' : days + (days === 1 ? ' day' : ' days');
}

const META_FIELDS = [
  ['Status', function(fm) { return statusOf(fm); }],
  ['Owner', function(fm) { return formatRoles(fm.owner); }],
  ['Approved by', function(fm) { return formatRoles(fm.approved_by); }],
  ['Version', function(fm) { return fm.version; }],
  ['Last reviewed', function(fm) { return fm.last_reviewed; }],
  ['Next review', function(fm) { return fm.next_review; }],
  ['Decided', function(fm) { return fm.decided; }],
  ['Occurred', function(fm) { return fm.occurred; }],
  ['Resolved', function(fm) { return fm.resolved; }],
  ['Duration', incidentDuration],
  ['Found', function(fm) { return fm.found; }],
  ['Source', function(fm) { return fm.source; }],
  ['Expires', function(fm) { return fm.expires; }],
  ['Severity', function(fm) { return fm.severity; }],
  /* A risk's treatment is the decision itself — mitigate, accept, transfer,
     avoid — and the written record of who chose to live with it. It had a
     value in every risk and appeared on no page. */
  ['Treatment', function(fm) { return fm.treatment; }],
  ['Likelihood', function(fm) { return fm.likelihood; }],
  ['Impact', function(fm) { return fm.impact; }],
  ['Residual risk', function(fm) { return fm.risk_severity; }],
  ['Vendor', function(fm) { return fm.vendor_name; }],
  ['Tier', function(fm) { return fm.tier; }],
  ['Criticality', function(fm) { return fm.criticality; }],
  ['RTO', function(fm) { return fm.rto; }],
  ['RPO', function(fm) { return fm.rpo; }],
  ['Classification', function(fm) { return fm.classification; }],
  ['Priority', function(fm) { return fm.priority != null ? String(fm.priority) : ''; }],
];

export function navigateDoc(path) {
  setActiveView('');
  state.currentDoc = path;
  mainEl.textContent = ''; rightEl.textContent = ''; showRightPanel();

  const fm = state.fmCache[path];

  /* Framework material (keel/…) has no registry entry — it is prose, not a
     program document — so it renders as a plain page. */
  if (!fm) {
    safeFetch(path).then(function(text) {
      const body = text.indexOf('---') === 0 ? text.substring(text.indexOf('---', 3) + 3) : text;
      const node = safeHtmlNode(renderMd(body));
      hookLinks(node, go, path);
      const card = mk('div', 'doc-body');
      card.appendChild(node);
      makeCollapsible(node, card);
      mainEl.appendChild(card);
      rightEl.appendChild(mk('h3', '', 'Source'));
      mkSourcePanel(rightEl, path);
    }).catch(function(err) {
      mainEl.appendChild(mkEmpty('file', 'Could not load this document', err.message));
    });
    return;
  }

  const info = typeInfo(fm.type);
  setBread([
    { label: typePlural(fm.type), action: function(e) { go('browse/' + fm.type, e); } },
    { label: fm.id },
  ]);

  const header = mk('div', 'doc-header');
  const icon = mkIcon(fm.type, 'doc-header-icon');
  icon.style.color = typeColor(fm.type);
  header.appendChild(icon);
  const titles = mk('div', 'doc-header-titles');
  titles.appendChild(mk('h1', '', fm.title || fm.id));
  header.appendChild(titles);
  const actions = mk('div', 'doc-header-actions');
  actions.appendChild(mkCopyBtn());
  header.appendChild(actions);
  mainEl.appendChild(header);

  if (fm.description) mainEl.appendChild(mk('p', 'doc-description', String(fm.description).trim()));

  const replacedBy = supersededBy(fm);
  if (replacedBy) {
    const banner = mk('div', 'doc-banner');
    banner.appendChild(mk('span', '', 'Superseded by '));
    banner.appendChild(idLink(replacedBy));
    mainEl.appendChild(banner);
  }

  /* The original lives elsewhere, so say so before the reader trusts this copy. */
  if (fm.source_of_truth) {
    const banner = mk('div', 'doc-banner doc-banner-source');
    banner.appendChild(mk('span', '', 'This document is a record. The original lives at '));
    const link = mk('a', 'source-link', fm.source_of_truth);
    link.href = fm.source_of_truth; link.target = '_blank'; link.rel = 'noopener noreferrer';
    banner.appendChild(link);
    mainEl.appendChild(banner);
  }

  contestBlock(mainEl, fm);
  if (fm.retention_justification) {
    const block = mk('div', 'doc-note');
    block.appendChild(mk('span', 'doc-note-label', 'Why this retention period'));
    block.appendChild(mk('div', '', String(fm.retention_justification).trim()));
    mainEl.appendChild(block);
  }
  requirementsBlock(mainEl, fm);

  const bodyCard = mk('div', 'doc-body');
  mainEl.appendChild(bodyCard);
  safeFetch(path).then(function(text) {
    state.bodyCache[path] = text;
    const body = text.indexOf('---') === 0 ? text.substring(text.indexOf('---', 3) + 3) : text;
    const node = safeHtmlNode(renderMd(body));
    hookLinks(node, go, path);
    dropRepeatedTitle(node, fm.title);
    bodyCard.appendChild(node);
    makeCollapsible(node, bodyCard);
  }).catch(function(err) {
    bodyCard.appendChild(mk('p', 'right-empty', 'Body unavailable: ' + err.message));
  });


  /* Last in the document, after the body. It went to the panel for a while and
     came back: at panel width the ids are too small to read, and a diagram
     whose labels you cannot read is decoration. */
  renderConnections(mainEl, fm);

  /* ===== Right panel ===== */
  rightEl.appendChild(mk('h3', '', typeLabel(fm.type)));
  META_FIELDS.forEach(function(field) {
    const value = field[1](fm);
    if (!value) return;
    const row = mkMetaRow(field[0], String(value));
    if (field[0] === 'Status') row.querySelector('.meta-val').style.color = statusColor(fm.status);
    if (field[0] === 'Severity') row.querySelector('.meta-val').style.color = SEVERITY_COLORS[fm.severity] || '';
    rightEl.appendChild(row);
  });

  /* A risk's tracker has nowhere else to go: it has no requirement, so it has
     no contest block. For a gap or an exception the link is already in the
     document, beside the sentence that says what state it is in. */
  if (fm.tracker && !fm.requirement) {
    const link = mk('a', 'action-link', 'Open in tracker \u2197');
    link.href = fm.tracker; link.target = '_blank'; link.rel = 'noopener noreferrer';
    rightEl.appendChild(link);
    rightEl.appendChild(mk('div', 'right-note-sm',
      'The tracker owns this work\u2019s lifecycle. Nothing here mirrors its state.'));
  }

  ['domains', 'capabilities', 'systems'].forEach(function(facet) {
    const values = fm[facet] || [];
    if (!values.length) return;
    rightEl.appendChild(mk('h3', '', facet.charAt(0).toUpperCase() + facet.slice(1)));
    const wrap = mk('div', 'facet-list');
    values.forEach(function(value) {
      const pill = mk('span', 'pill clickable', value);
      if (facet === 'domains') pill.addEventListener('click', function(e) { go('domain/' + value, e); });
      if (facet === 'capabilities') {
        const domain = String(value).split('.')[0];
        pill.addEventListener('click', function(e) { go('domain/' + domain, e); });
      }
      wrap.appendChild(pill);
    });
    rightEl.appendChild(wrap);
  });

  if (fm.risk_category) {
    const c = fm.risk_category;
    rightEl.appendChild(mkMetaRow('Category',
      [c.principle, c.category1, c.category2].filter(Boolean).join(' \u203A ')));
  }
  pillSection('Root causes', fm.root_causes);
  pillSection('Data scope', fm.data_scope);
  pillSection('Compensating controls', fm.compensating_controls);
  certificationSection(fm.certifications);

  relatedSection(rightEl, 'Related', fm.related);
  relatedSection(rightEl, 'Supersedes', fm.supersedes);
  publishBlock(rightEl, fm);
  mkSourcePanel(rightEl, path);
}
