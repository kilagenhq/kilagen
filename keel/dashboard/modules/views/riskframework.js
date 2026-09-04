import { safeFetch, hookLinks } from '../security.js';
import { mk, ghUrl } from '../dom.js';
import { state } from '../state.js';
import { go, setActiveView, setBread, mainEl, rightEl } from '../nav.js';
import { renderMd, safeHtmlNode, parseYml, parseFM } from '../parsers.js';
import { HEAT_LEVELS, HEAT_LEVEL_LABELS, CRIT_BAND_COLORS, critBand } from '../constants.js';

// All framework tables (probability scale, BIRT, control taxonomy, effectiveness
// scale, test frequency, treatment options, acceptance criteria, 3LoD, sources)
// live in program/01-grc/standards/STD-risk-framework.md — the single source. This view renders
// the markdown body (frontmatter stripped), then appends a colored heatmap visualization of the
// criticality matrix (computed from constants.js so it stays in sync with
// critBand()) and the data-driven taxonomy tree (loaded from risk-taxonomy.yml).

export function renderRiskFramework() {
  setActiveView('riskframework');
  mainEl.textContent = '';
  rightEl.textContent = '';
  setBread([{ label: 'Reference' }, { label: 'Risk Framework' }]);

  renderFrameworkDoc();
  renderCriticalityMatrix();
  renderTaxonomy();

  // Right panel — sources
  rightEl.appendChild(mk('h3', '', 'Source'));
  ['program/01-grc/standards/STD-risk-framework.md', 'program/risk-taxonomy.yml'].forEach(function(f) {
    var row = mk('div', 'meta-row');
    row.appendChild(mk('span', 'meta-key', 'File'));
    var val = mk('span', 'meta-val', f);
    val.style.fontFamily = "'SF Mono',SFMono-Regular,Consolas,monospace";
    val.style.fontSize = '11px';
    row.appendChild(val);
    rightEl.appendChild(row);
  });
  var ghHref = ghUrl('program/01-grc/standards/STD-risk-framework.md');
  if (ghHref) {
    var ghLink = mk('a', 'source-link', 'View in GitHub');
    ghLink.href = ghHref;
    ghLink.target = '_blank';
    ghLink.rel = 'noopener noreferrer';
    rightEl.appendChild(ghLink);
  }
}

function renderFrameworkDoc() {
  const card = mk('div', 'ref-card');
  const placeholder = mk('p', '', 'Loading framework…');
  card.appendChild(placeholder);
  mainEl.appendChild(card);

  safeFetch('01-grc/standards/STD-risk-framework.md').then(function(md) {
    placeholder.remove();
    const body = safeHtmlNode(renderMd(parseFM(md).body));
    hookLinks(body, go);
    while (body.firstChild) card.appendChild(body.firstChild);
  }).catch(function(err) {
    placeholder.textContent = 'Failed to load STD-risk-framework.md — run kilagen build site to refresh.';
    console.warn('Risk framework load error:', err);
  });
}

function renderCriticalityMatrix() {
  const card = mk('div', 'ref-card');
  card.appendChild(mk('h3', '', 'Criticality matrix (visualization)'));
  card.appendChild(mk('p', '', 'Color-coded view of the matrix above. Score = Likelihood × Impact (1–25); bands per critBand(): Low 1–2, Medium 3–7, High 8–14, Critical 15–25.'));

  const wrapper = mk('div', 'heatmap-wrapper');
  wrapper.appendChild(mk('div', 'heatmap-y-label', 'Likelihood'));
  const tableBox = mk('div');
  const tbl = mk('table', 'heatmap-table');
  const thead = mk('thead');
  const hrow = mk('tr');
  hrow.appendChild(mk('th', 'heatmap-corner', ''));
  HEAT_LEVELS.forEach(function(l, i) { hrow.appendChild(mk('th', 'heatmap-header', (i + 1) + ' ' + HEAT_LEVEL_LABELS[l])); });
  thead.appendChild(hrow);
  tbl.appendChild(thead);
  const tbody = mk('tbody');
  for (let li = HEAT_LEVELS.length - 1; li >= 0; li--) {
    const row = mk('tr');
    row.appendChild(mk('td', 'heatmap-row-label', (li + 1) + ' ' + HEAT_LEVEL_LABELS[HEAT_LEVELS[li]]));
    for (let ii = 0; ii < HEAT_LEVELS.length; ii++) {
      const score = (li + 1) * (ii + 1);
      const band = critBand(score);
      const cell = mk('td', 'heatmap-cell');
      cell.style.background = CRIT_BAND_COLORS[band];
      const label = mk('div', '', score + ' ' + band);
      label.style.fontSize = '13px';
      label.style.fontWeight = '700';
      label.style.color = '#fff';
      label.style.textShadow = '0 1px 3px rgba(0,0,0,0.4)';
      cell.appendChild(label);
      row.appendChild(cell);
    }
    tbody.appendChild(row);
  }
  tbl.appendChild(tbody);
  tableBox.appendChild(tbl);
  tableBox.appendChild(mk('div', 'heatmap-x-label', 'Impact →'));
  wrapper.appendChild(tableBox);
  card.appendChild(wrapper);
  mainEl.appendChild(card);
}

function renderTaxonomy() {
  const card = mk('div', 'ref-card');
  card.appendChild(mk('h3', '', 'Risk taxonomy'));
  const placeholder = mk('p', '', 'Loading taxonomy…');
  card.appendChild(placeholder);
  mainEl.appendChild(card);

  // Count RSKs per category2 for badges
  const rskByCat2 = {};
  Object.keys(state.fmCache).forEach(function(p) {
    const fm = state.fmCache[p];
    if (fm && fm.type === 'risk' && fm.risk_category && fm.risk_category.category2) {
      const c = fm.risk_category.category2;
      rskByCat2[c] = (rskByCat2[c] || 0) + 1;
    }
  });

  safeFetch('risk-taxonomy.yml').then(function(text) {
    const taxonomy = parseYml(text);
    if (taxonomy && taxonomy.ok === false) {
      placeholder.textContent = 'Failed to parse risk-taxonomy.yml: ' + taxonomy.error;
      return;
    }
    if (!taxonomy || !taxonomy.categories || !taxonomy.causes) {
      placeholder.textContent = 'risk-taxonomy.yml is missing required top-level keys (categories, causes).';
      return;
    }
    placeholder.remove();
    renderTaxonomyTree(card, taxonomy.categories, rskByCat2);
    renderCausesGrid(card, taxonomy.causes);
  }).catch(function(err) {
    placeholder.textContent = 'Failed to load risk-taxonomy.yml — run kilagen build site to regenerate.';
    console.warn('Risk taxonomy load error:', err);
  });
}

function renderTaxonomyTree(card, categories, rskByCat2) {
  card.appendChild(mk('h4', '', 'Enterprise Risk Categories'));
  Object.keys(categories).forEach(function(principleKey) {
    const principle = categories[principleKey];
    const block = mk('div', '');
    block.style.margin = '10px 0';
    const title = mk('div', '');
    title.style.fontWeight = '700';
    title.style.fontSize = '13px';
    title.style.color = 'var(--accent)';
    title.textContent = principle.label;
    block.appendChild(title);
    if (principle.description) {
      const d = mk('div', '', principle.description);
      d.style.fontSize = '11px';
      d.style.color = 'var(--fg2)';
      d.style.margin = '2px 0 6px';
      block.appendChild(d);
    }
    const childList = mk('div', '');
    childList.style.marginLeft = '14px';
    Object.keys(principle.children || {}).forEach(function(cat1Key) {
      const cat1 = principle.children[cat1Key];
      const row = mk('div', '');
      row.style.margin = '4px 0';
      const label = mk('span', '', cat1.label || cat1Key);
      label.style.fontWeight = '600';
      label.style.fontSize = '12px';
      row.appendChild(label);
      let cat1Count = 0;
      Object.keys(cat1.children || {}).forEach(function(cat2Key) { cat1Count += (rskByCat2[cat2Key] || 0); });
      if (cat1Count) {
        const badge = mk('span', '', ' ' + cat1Count);
        badge.style.fontSize = '10px';
        badge.style.color = 'var(--fg3)';
        badge.style.marginLeft = '6px';
        row.appendChild(badge);
      }
      childList.appendChild(row);
      const leafList = mk('div', '');
      leafList.style.marginLeft = '14px';
      leafList.style.fontSize = '11px';
      leafList.style.color = 'var(--fg2)';
      Object.keys(cat1.children || {}).forEach(function(cat2Key) {
        const v = cat1.children[cat2Key];
        const leaf = mk('div', '');
        leaf.style.margin = '2px 0';
        const slug = mk('code', '', cat2Key);
        slug.style.marginRight = '6px';
        leaf.appendChild(slug);
        const text = typeof v === 'string' ? v : (v.label || cat2Key);
        leaf.appendChild(document.createTextNode(text));
        const c = rskByCat2[cat2Key] || 0;
        if (c) {
          const cnt = mk('span', '', ' (' + c + ' risk' + (c === 1 ? '' : 's') + ')');
          cnt.style.color = 'var(--accent)';
          cnt.style.fontWeight = '600';
          cnt.style.cursor = 'pointer';
          cnt.addEventListener('click', function(e) { go('browse/risks', e); });
          leaf.appendChild(cnt);
        }
        leafList.appendChild(leaf);
      });
      childList.appendChild(leafList);
    });
    block.appendChild(childList);
    card.appendChild(block);
  });
}

function renderCausesGrid(card, causes) {
  card.appendChild(mk('h4', '', 'Operational risk causes'));
  const grid = mk('div', '');
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(220px, 1fr))';
  grid.style.gap = '10px';
  grid.style.marginTop = '8px';
  Object.keys(causes).forEach(function(bucketKey) {
    const bucket = causes[bucketKey];
    const item = mk('div', 'ref-enum-item');
    item.style.display = 'block';
    const label = mk('div', 'enum-label', bucket.label);
    label.style.marginBottom = '6px';
    item.appendChild(label);
    Object.keys(bucket.items || {}).forEach(function(itemKey) {
      const line = mk('div', '');
      line.style.fontSize = '11px';
      line.style.margin = '2px 0';
      const slug = mk('code', '', itemKey);
      slug.style.marginRight = '4px';
      line.appendChild(slug);
      line.appendChild(document.createTextNode(bucket.items[itemKey]));
      item.appendChild(line);
    });
    grid.appendChild(item);
  });
  card.appendChild(grid);
}
