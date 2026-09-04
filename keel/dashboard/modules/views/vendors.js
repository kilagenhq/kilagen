import { mk, mkEmpty, mkMetaRow } from '../dom.js';
import { state } from '../state.js';
import { go, setActiveView, setBread, mainEl, rightEl } from '../nav.js';
const TIER_COLORS = { critical: 'var(--sev-critical)', high: 'var(--sev-high)', medium: 'var(--sev-medium)', low: 'var(--sev-low)' };
const TIER_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

export function renderVendors() {
  setActiveView('vendors'); mainEl.textContent = ''; rightEl.textContent = ''; setBread([{ label: 'Vendor Registry' }]);
  mainEl.appendChild(mk('h1', '', 'Vendor Registry'));
  mainEl.appendChild(mk('p', '', 'Third-party risk profiles. Click a card to view the full vendor assessment.'));

  const vendors = [];
    Object.keys(state.fmCache).forEach(function(p) {
      const fm = state.fmCache[p];
      if (fm && fm.type === 'vendor') vendors.push({ path: p, fm: fm });
    });

    if (!vendors.length) {
      mainEl.appendChild(mkEmpty('vendor', 'No vendor profiles found', 'Create VEN-*.md files in 01-grc/vendors/ to populate this registry.'));
      return;
    }

    vendors.sort(function(a, b) {
      const ta = TIER_ORDER[a.fm.tier] !== undefined ? TIER_ORDER[a.fm.tier] : 99;
      const tb = TIER_ORDER[b.fm.tier] !== undefined ? TIER_ORDER[b.fm.tier] : 99;
      return ta - tb;
    });

    // Filter by tier
    const activeTier = {};
    const tiers = {};
    vendors.forEach(function(v) { const t = v.fm.tier || 'unknown'; tiers[t] = (tiers[t] || 0) + 1; });
    if (Object.keys(tiers).length > 1) {
      const filterBar = mk('div', 'graph-filter-bar');
      filterBar.appendChild(mk('span', 'filter-label', 'Tier: '));
      Object.keys(tiers).sort(function(a, b) { return (TIER_ORDER[a] || 99) - (TIER_ORDER[b] || 99); }).forEach(function(t) {
        const btn = mk('button', '', t + ' (' + tiers[t] + ')');
        btn.addEventListener('click', function() {
          if (activeTier[t]) { delete activeTier[t]; btn.classList.remove('active'); }
          else { activeTier[t] = true; btn.classList.add('active'); }
          renderCards();
        });
        filterBar.appendChild(btn);
      });
      mainEl.appendChild(filterBar);
    }

    const grid = mk('div', 'vendor-grid');
    mainEl.appendChild(grid);

    function renderCards() {
      grid.textContent = '';
      const hasFilter = Object.keys(activeTier).length > 0;
      const filtered = hasFilter ? vendors.filter(function(v) { return activeTier[v.fm.tier || 'unknown']; }) : vendors;

      filtered.forEach(function(v) {
        const card = mk('div', 'vendor-card');
        card.style.cursor = 'pointer';
        card.addEventListener('click', function(e) { go('doc/' + v.path, e); });

        // Tier stripe
        const stripe = mk('div', 'vendor-stripe');
        stripe.style.background = TIER_COLORS[v.fm.tier] || 'var(--fg3)';
        card.appendChild(stripe);

        const body = mk('div', 'vendor-body');
        body.appendChild(mk('h3', '', v.fm.vendor_name || v.fm.title || v.fm.id));

        // Tier badge
        if (v.fm.tier) {
          const tierBadge = mk('span', 'vendor-tier');
          tierBadge.textContent = v.fm.tier;
          tierBadge.style.color = TIER_COLORS[v.fm.tier] || 'var(--fg3)';
          body.appendChild(tierBadge);
        }

        // Status
        if (v.fm.status) {
          const statusBadge = mk('span', 'vendor-status');
          statusBadge.textContent = v.fm.status;
          body.appendChild(statusBadge);
        }

        // Description
        if (v.fm.description) {
          body.appendChild(mk('p', 'vendor-desc', String(v.fm.description).trim().substring(0, 120)));
        }

        // Certifications
        if (v.fm.certifications && v.fm.certifications.length) {
          const certs = mk('div', 'vendor-certs');
          v.fm.certifications.forEach(function(c) { certs.appendChild(mk('span', 'vendor-cert-badge', String(c))); });
          body.appendChild(certs);
        }

        card.appendChild(body);
        grid.appendChild(card);
      });
    }
    renderCards();

    // Right panel
    rightEl.appendChild(mk('h3', '', 'Summary'));
    const stats = [['Total vendors', vendors.length]];
    Object.keys(tiers).sort(function(a, b) { return (TIER_ORDER[a] || 99) - (TIER_ORDER[b] || 99); }).forEach(function(t) {
      stats.push([t + ' tier', tiers[t]]);
    });
    // Systems without vendor profile
    const vendorIds = {};
    vendors.forEach(function(v) { if (v.fm.id) vendorIds[v.fm.id.replace('VEN-', '')] = true; });
    const sysWithoutVendor = [];
    Object.keys(state.fmCache).forEach(function(p) {
      const fm = state.fmCache[p];
      if (fm && fm.type === 'system' && fm.vendor && !vendorIds[fm.vendor]) sysWithoutVendor.push(fm.id || p);
    });
    stats.push(['Systems missing VEN-*', sysWithoutVendor.length]);
    stats.forEach(function(s) {
      rightEl.appendChild(mkMetaRow(s[0], String(s[1])));
    });

    if (sysWithoutVendor.length) {
      rightEl.appendChild(mk('h3', '', 'Missing profiles'));
      sysWithoutVendor.forEach(function(id) {
        const row = mk('div', 'meta-row');
        row.appendChild(mk('span', 'meta-val', id));
        rightEl.appendChild(row);
      });
    }
}
