import { mk } from './dom.js';

/* The 5x5 risk heatmap.
 *
 * Honest, unlike the wheel it sits next to in spirit: likelihood, impact and
 * the bands are data the repository genuinely owns — somebody assessed each
 * risk and wrote the two scores down, and the bands come from the risk
 * taxonomy rather than from a table parsed out of a standard's prose.
 *
 * The colour here *is* a rating, and that is correct: severity is the
 * organisation's own published judgement, not something this code inferred.
 */

const BAND_COLOR = {
  negligible: 'var(--sev-info)',
  low: 'var(--heat-green)',
  medium: 'var(--heat-yellow)',
  high: 'var(--heat-orange)',
  critical: 'var(--heat-red)',
};

/* The value of an axis point, named by its label. */
function pointValue(name, axis) {
  if (typeof name === 'number') return name;   // a program may score numerically
  if (typeof name !== 'string') return null;
  const wanted = name.trim().toLowerCase();
  for (let i = 0; i < (axis || []).length; i++) {
    const point = axis[i];
    if (point && String(point.label || '').trim().toLowerCase() === wanted) {
      return typeof point.value === 'number' ? point.value : null;
    }
  }
  return null;
}

function bandOf(score, bands) {
  for (let i = 0; i < bands.length; i++) {
    if (score >= bands[i].min && score <= bands[i].max) return bands[i].id;
  }
  return null;
}

/**
 * @param {Array} risks Risk documents, each with likelihood, impact, id, title.
 * @param {object} severity The `severity` block of the risk taxonomy.
 * @param {function} onSelect (risk) => void
 * @returns {HTMLElement|null} null when the taxonomy declares no matrix.
 */
export function riskHeatmap(risks, severity, onSelect) {
  const likelihood = severity && severity.likelihood;
  const impact = severity && severity.impact;
  const bands = (severity && severity.bands) || [];
  if (!Array.isArray(likelihood) || !Array.isArray(impact) || !likelihood.length || !impact.length) {
    return null;
  }

  /* Risks land in the cell their own two scores name. A risk names a point by
     its label — `likelihood: low` — because that is what the schema allows,
     and the axis is where a label is bound to a number. A risk missing either
     score is not placed: it is listed underneath, because dropping it
     silently would understate the register. */
  const cells = {};
  const unplaced = [];
  risks.forEach(function(fm) {
    const l = pointValue(fm.likelihood, likelihood);
    const i = pointValue(fm.impact, impact);
    if (l === null || i === null) { unplaced.push(fm); return; }
    const key = l + 'x' + i;
    (cells[key] = cells[key] || []).push(fm);
  });

  const wrap = mk('div', 'heatmap-wrap');
  const table = mk('table', 'heatmap');
  const caption = mk('caption', 'heatmap-caption',
    'Likelihood down, impact across, banded by program/model/risk-taxonomy.yml. '
    + 'A cell holds the risks that scored it.');
  table.appendChild(caption);

  const head = mk('tr');
  // The corner cell heads nothing: a th with no text is a header a screen
  // reader announces as blank.
  head.appendChild(mk('td', 'heatmap-corner', ''));
  impact.forEach(function(point) {
    const col = mk('th', 'heatmap-axis heatmap-axis-col');
    col.setAttribute('scope', 'col');
    col.appendChild(mk('span', 'heatmap-axis-label', point.label));
    head.appendChild(col);
  });
  table.appendChild(head);

  // Highest likelihood at the top, the way every risk matrix is drawn.
  likelihood.slice().reverse().forEach(function(lPoint) {
    const row = mk('tr');
    const axis = mk('th', 'heatmap-axis heatmap-axis-row');
    axis.setAttribute('scope', 'row');
    axis.appendChild(mk('span', 'heatmap-axis-label', lPoint.label));
    if (lPoint.note) axis.appendChild(mk('span', 'heatmap-axis-note', lPoint.note));
    row.appendChild(axis);
    impact.forEach(function(iPoint) {
      const score = lPoint.value * iPoint.value;
      const band = bandOf(score, bands);
      const td = mk('td', 'heatmap-cell');
      td.style.background = BAND_COLOR[band] || 'var(--bg3)';
      td.title = lPoint.label + ' likelihood x ' + iPoint.label + ' impact = ' + score
        + (band ? ' (' + band + ')' : '');
      const here = cells[lPoint.value + 'x' + iPoint.value] || [];
      here.forEach(function(fm) {
        const dot = mk('div', 'heatmap-risk', fm.id);
        dot.title = fm.title || fm.id;
        dot.addEventListener('click', function(e) { e.stopPropagation(); onSelect(fm, e); });
        td.appendChild(dot);
      });
      row.appendChild(td);
    });
    table.appendChild(row);
  });

  const scroller = mk('div', 'table-scroll');
  scroller.appendChild(table);
  wrap.appendChild(scroller);

  if (unplaced.length) {
    const note = mk('div', 'heatmap-unplaced');
    note.appendChild(mk('span', '', unplaced.length + ' risk'
      + (unplaced.length === 1 ? '' : 's') + ' not on the matrix — no likelihood or impact score: '));
    unplaced.forEach(function(fm) {
      const link = mk('span', 'heatmap-risk-inline', fm.id);
      link.addEventListener('click', function(e) { onSelect(fm, e); });
      note.appendChild(link);
    });
    wrap.appendChild(note);
  }
  return wrap;
}
