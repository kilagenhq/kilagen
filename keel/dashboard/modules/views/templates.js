import { safeFetch } from '../security.js';
import { mk, ghTreeUrl } from '../dom.js';
import { go, setActiveView, setBread, fadeMain, fadeRight, mainEl, rightEl } from '../nav.js';
import { parseFM } from '../parsers.js';
import { DOC_TYPE_COLORS } from '../constants.js';

const TEMPLATES = [
  { file: 'policy.md', label: 'Policy', prefix: 'POL-', type: 'policy' },
  { file: 'standard.md', label: 'Standard', prefix: 'STD-', type: 'standard' },
  { file: 'process.md', label: 'Process', prefix: 'PRO-', type: 'process' },
  { file: 'runbook.md', label: 'Runbook', prefix: 'RB-', type: 'runbook' },
  { file: 'playbook.md', label: 'Playbook', prefix: 'PB-', type: 'playbook' },
  { file: 'guideline.md', label: 'Guideline', prefix: 'GL-', type: 'guideline' },
  { file: 'threat-model.md', label: 'Threat Model', prefix: 'TM-', type: 'threat-model' },
  { file: 'system.md', label: 'System', prefix: 'SYS-', type: 'system' },
  { file: 'vendor.md', label: 'Vendor', prefix: 'VEN-', type: 'vendor' },
  { file: 'data-asset.md', label: 'Data Asset', prefix: 'DA-', type: 'data-asset' },
  { file: 'business-process.md', label: 'Business Process', prefix: 'BP-', type: 'business-process' },
  { file: 'risk.md', label: 'Risk', prefix: 'RSK-', type: 'risk' },
  { file: 'incident.md', label: 'Incident', prefix: 'INC-', type: 'incident' },
  { file: 'adr.md', label: 'ADR', prefix: 'ADR-', type: 'adr' },
  { file: 'domain-readme.md', label: 'Domain README', prefix: '', type: 'guideline' },
  { file: 'capabilities.yml', label: 'Capabilities', prefix: '', type: '' },
];

export function renderTemplates() {
  setActiveView('templates');
  mainEl.textContent = '';
  rightEl.textContent = '';
  setBread([{ label: 'Reference' }, { label: 'Templates' }]);
  fadeMain();

  mainEl.appendChild(mk('h1', '', 'Document Templates'));
  mainEl.appendChild(mk('p', 'templates-intro', 'Starter templates from keel/templates/. Copy the appropriate template when creating a new document.'));

  Promise.all(TEMPLATES.map(function(t) {
    return safeFetch('templates/' + t.file).then(function(text) {
      return { meta: t, text: text };
    }).catch(function(err) { console.warn('Template load failed:', t.file, err); return null; });
  })).then(function(results) {
    const grid = mk('div', 'tpl-grid');
    results.forEach(function(r) {
      if (!r) return;
      const card = mk('div', 'tpl-card');
      card.setAttribute('data-file', r.meta.file);

      // Header
      const header = mk('div', 'tpl-card-header');
      const color = DOC_TYPE_COLORS[r.meta.type] || 'var(--fg3)';
      const indicator = mk('span', 'tpl-indicator');
      indicator.style.background = color;
      header.appendChild(indicator);
      header.appendChild(mk('span', 'tpl-label', r.meta.label));
      if (r.meta.prefix) {
        header.appendChild(mk('code', 'tpl-prefix', r.meta.prefix));
      }
      card.appendChild(header);

      // File name
      card.appendChild(mk('div', 'tpl-filename', r.meta.file));

      // Frontmatter preview
      const parsed = r.meta.file.endsWith('.yml') ? { fm: null, body: r.text } : parseFM(r.text);
      if (parsed.fm) {
        const fmDiv = mk('div', 'tpl-fm-preview');
        const keys = Object.keys(parsed.fm);
        const shown = keys.slice(0, 6);
        shown.forEach(function(k) {
          const row = mk('div', 'tpl-fm-row');
          row.appendChild(mk('span', 'tpl-fm-key', k));
          const val = parsed.fm[k];
          let display = typeof val === 'object' ? (Array.isArray(val) ? '[' + val.join(', ') + ']' : '{...}') : String(val);
          if (display.length > 40) display = display.substring(0, 37) + '...';
          row.appendChild(mk('span', 'tpl-fm-val', display));
          fmDiv.appendChild(row);
        });
        if (keys.length > 6) {
          fmDiv.appendChild(mk('div', 'tpl-fm-more', '+' + (keys.length - 6) + ' more fields'));
        }
        card.appendChild(fmDiv);
      }

      // Click → expand in detail panel
      card.style.cursor = 'pointer';
      card.addEventListener('click', function() {
        showTemplateDetail(r.meta, r.text);
        grid.querySelectorAll('.tpl-card').forEach(function(c) { c.classList.remove('selected'); });
        card.classList.add('selected');
      });

      grid.appendChild(card);
    });
    mainEl.appendChild(grid);

    // Right panel — source only
    fadeRight();
    rightEl.appendChild(mk('h3', '', 'Source'));
    const pathRow = mk('div', 'meta-row');
    pathRow.appendChild(mk('span', 'meta-key', 'Directory'));
    const pathVal = mk('span', 'meta-val', 'keel/templates/');
    pathVal.style.fontFamily = 'var(--mono)'; pathVal.style.fontSize = '11px';
    pathRow.appendChild(pathVal);
    rightEl.appendChild(pathRow);
    const ghHref = ghTreeUrl('keel/templates');
    if (ghHref) { const ghLink = mk('a', 'source-link', 'View in GitHub'); ghLink.href = ghHref; ghLink.target = '_blank'; ghLink.rel = 'noopener noreferrer'; rightEl.appendChild(ghLink); }
  }).catch(function(err) {
    console.warn('Templates load error:', err);
    mainEl.appendChild(mk('div', 'error-msg', 'Unable to load templates: ' + (err.message || err)));
  });
}

function showTemplateDetail(meta, text) {
  rightEl.textContent = '';
  fadeRight();

  // Header
  const color = DOC_TYPE_COLORS[meta.type] || 'var(--fg3)';
  rightEl.appendChild(mk('h3', '', meta.label + ' Template'));
  const badge = mk('div', 'tpl-detail-badge');
  badge.style.borderLeft = '3px solid ' + color;
  badge.textContent = meta.file;
  rightEl.appendChild(badge);

  if (meta.prefix) {
    const prefixRow = mk('div', 'meta-row');
    prefixRow.appendChild(mk('span', 'meta-key', 'Prefix'));
    prefixRow.appendChild(mk('code', 'meta-val', meta.prefix));
    rightEl.appendChild(prefixRow);
  }

  // Full source
  rightEl.appendChild(mk('h3', '', 'Full source'));
  const pre = mk('pre', 'tpl-source');
  const code = mk('code', '', text);
  pre.appendChild(code);
  rightEl.appendChild(pre);

  // Expand button → modal
  const expandBtn = mk('button', 'graph-nav-btn', 'View full template');
  expandBtn.addEventListener('click', function() {
    const overlay = mk('div', 'graph-modal-overlay');
    const modal = mk('div', 'graph-modal');
    const closeBtn = mk('button', 'graph-modal-close', '\u2715');
    closeBtn.addEventListener('click', function() { overlay.remove(); });
    overlay.addEventListener('click', function(ev) { if (ev.target === overlay) overlay.remove(); });
    modal.appendChild(closeBtn);
    modal.appendChild(mk('h2', '', meta.label + ' Template'));
    const modalPre = mk('pre', 'tpl-source tpl-source-modal');
    modalPre.appendChild(mk('code', '', text));
    modal.appendChild(modalPre);
    const copyBtn = mk('button', 'graph-nav-btn', 'Copy to clipboard');
    copyBtn.addEventListener('click', function() {
      navigator.clipboard.writeText(text).then(function() { copyBtn.textContent = 'Copied!'; setTimeout(function() { copyBtn.textContent = 'Copy to clipboard'; }, 1500); }).catch(function(err) { console.warn('Clipboard write failed:', err); copyBtn.textContent = 'Copy failed'; setTimeout(function() { copyBtn.textContent = 'Copy to clipboard'; }, 1500); });
    });
    modal.appendChild(copyBtn);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  });
  rightEl.appendChild(expandBtn);
}
