import { mk, matLvl, mkMetaRow, ghUrl } from '../dom.js';
import { state } from '../state.js';
import { setActiveView, setBread, mainEl, rightEl } from '../nav.js';
import { DOMAINS } from '../constants.js';
export function renderMatRef() {
  setActiveView('matref'); mainEl.textContent = ''; rightEl.textContent = ''; setBread([{ label: 'Reference' }, { label: 'Maturity Reference' }]);
  mainEl.appendChild(mk('h1', '', 'Maturity Reference'));
  mainEl.appendChild(mk('p', '', 'This page explains the maturity model used across all capabilities.yml files in the program. Definitions are from maturity.md.'));
  const matCard = mk('div', 'ref-card'); matCard.appendChild(mk('h3', '', 'Maturity levels (L0\u2013L5)'));
  matCard.appendChild(mk('p', '', 'Adapted from CMM. Generic scale across all capabilities. Values are stored with both the ordinal and the name so they are self-describing everywhere they appear (L3-integrated is readable on its own; L3 is not).'));
  [{ level: 'L0-none', num: 0, meaning: 'No tooling or process exists.', indicators: 'Nothing in place. Capability is acknowledged as a gap.', color: '--mat0' }, { level: 'L1-ad-hoc', num: 1, meaning: 'Exists but depends on human memory. Scripts unmaintained.', indicators: 'Someone knows how to do it, but it is not documented or reliable. Ad-hoc scripts may exist.', color: '--mat1' }, { level: 'L2-defined', num: 2, meaning: 'Process documented, tool chosen, executes but unreliably.', indicators: 'A tool has been selected and configured. Documentation exists. Execution is inconsistent or manual.', color: '--mat2' }, { level: 'L3-integrated', num: 3, meaning: 'Wired into CI/pipelines, runs on every relevant change.', indicators: 'Automated execution on every PR or deploy. No manual trigger needed. Results are visible.', color: '--mat3' }, { level: 'L4-measured', num: 4, meaning: 'Continuous metrics (MTTR, FP rate, coverage), alerts on degradation.', indicators: 'Dashboards track effectiveness. Alerts fire on regression. Data-driven decisions.', color: '--mat4' }, { level: 'L5-optimizing', num: 5, meaning: 'Active feedback loop from incidents and threat models.', indicators: 'Postmortems drive detection improvements. Threat models inform new rules. Continuous improvement loop.', color: '--mat5' }].forEach(function(m) {
    const item = mk('div', ''); item.style.display = 'flex'; item.style.gap = '14px'; item.style.alignItems = 'flex-start'; item.style.padding = '12px 0'; item.style.borderBottom = '1px solid var(--border)';
    const left = mk('div', ''); left.style.minWidth = '100px'; left.style.textAlign = 'center';
    const bar = mk('div', 'cap-maturity-visual'); bar.style.width = '100px';
    for (let i = 0; i < 5; i++) { const step = mk('div', 'cap-mat-step' + (i < m.num ? ' filled' : '')); if (i < m.num) step.style.background = 'var(' + m.color + ')'; bar.appendChild(step); }
    left.appendChild(bar); const dot = mk('span', 'mat-dot mat-L' + m.num); dot.style.width = '16px'; dot.style.height = '16px'; left.appendChild(dot);
    left.appendChild(mk('div', '', m.level)); left.style.fontWeight = '600'; left.style.fontSize = '13px'; item.appendChild(left);
    const right = mk('div', ''); right.style.flex = '1'; right.appendChild(mk('p', '', m.meaning));
    const ind = mk('p', '', 'Indicators: ' + m.indicators); ind.style.fontSize = '12px'; ind.style.color = 'var(--fg3)'; right.appendChild(ind);
    item.appendChild(right); matCard.appendChild(item);
  }); mainEl.appendChild(matCard);
  const progCard = mk('div', 'ref-card'); progCard.appendChild(mk('h3', '', 'Program maturity progression'));
  progCard.appendChild(mk('p', '', 'Typical capability lifecycle from none to optimizing:'));
  [['1. Identify', 'Acknowledge the capability in capabilities.yml. maturity: L0-none.'], ['2. Bootstrap', 'Choose a tool or build a script. maturity: L1-ad-hoc.'], ['3. Document', 'Write standards, processes, and runbooks. maturity: L2-defined.'], ['4. Integrate', 'Wire into CI/CD pipelines. maturity: L3-integrated.'], ['5. Measure', 'Add metrics, dashboards, and alerts. maturity: L4-measured.'], ['6. Optimize', 'Feedback loop from incidents and threat models. maturity: L5-optimizing.']].forEach(function(s) {
    const step = mk('div', ''); step.style.display = 'flex'; step.style.gap = '12px'; step.style.padding = '8px 0'; step.style.borderBottom = '1px solid var(--border)';
    const label = mk('span', '', s[0]); label.style.fontWeight = '700'; label.style.minWidth = '100px'; label.style.color = 'var(--accent)'; step.appendChild(label);
    step.appendChild(mk('span', '', s[1])); progCard.appendChild(step);
  }); mainEl.appendChild(progCard);
  rightEl.appendChild(mk('h3', '', 'Source'));
  var pathRow = mk('div', 'meta-row'); pathRow.appendChild(mk('span', 'meta-key', 'File')); var pathVal = mk('span', 'meta-val', 'keel/maturity.md'); pathVal.style.fontFamily = "'SF Mono',SFMono-Regular,Consolas,monospace"; pathVal.style.fontSize = '11px'; pathRow.appendChild(pathVal); rightEl.appendChild(pathRow);
  var ghHref = ghUrl('maturity.md'); if (ghHref) { var ghLink = mk('a', 'source-link', 'View in GitHub'); ghLink.href = ghHref; ghLink.target = '_blank'; ghLink.rel = 'noopener noreferrer'; rightEl.appendChild(ghLink); }
}
