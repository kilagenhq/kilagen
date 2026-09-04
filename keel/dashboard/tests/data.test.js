import { describe, it, expect, beforeEach } from 'vitest';
import { buildGraph } from '../modules/data.js';
import { state } from '../modules/state.js';

beforeEach(() => {
  state.fmCache = {};
  state.domainCaps = {};
  state.graphNodes = {};
  state.graphEdges = [];
  state.allCapIds = [];
});

describe('buildGraph', () => {
  it('creates nodes from fmCache entries with IDs', () => {
    state.fmCache = {
      '01-grc/policies/POL-info-sec.md': { id: 'POL-info-sec', title: 'Info Security Policy', type: 'policy', related: {} },
      '04-appsec/runbooks/RB-sast-triage.md': { id: 'RB-sast-triage', title: 'SAST Triage', type: 'runbook', related: {} },
    };

    buildGraph();

    expect(Object.keys(state.graphNodes)).toHaveLength(2);
    expect(state.graphNodes['POL-info-sec']).toBeDefined();
    expect(state.graphNodes['POL-info-sec'].type).toBe('policy');
    expect(state.graphNodes['RB-sast-triage'].title).toBe('SAST Triage');
  });

  it('skips entries without id', () => {
    state.fmCache = {
      '01-grc/README.md': { title: 'GRC' },
    };

    buildGraph();

    expect(Object.keys(state.graphNodes)).toHaveLength(0);
  });

  it('creates edges from related fields', () => {
    state.fmCache = {
      '01-grc/policies/POL-info-sec.md': { id: 'POL-info-sec', title: 'Policy', type: 'policy', related: { standards: ['STD-vuln-mgmt'] } },
      '01-grc/standards/STD-vuln-mgmt.md': { id: 'STD-vuln-mgmt', title: 'Vuln Mgmt', type: 'standard', related: { policies: ['POL-info-sec'] } },
    };

    buildGraph();

    expect(state.graphEdges.length).toBeGreaterThan(0);
    const edge = state.graphEdges.find(e => e.source === 'POL-info-sec' && e.target === 'STD-vuln-mgmt');
    expect(edge).toBeDefined();
    expect(edge.label).toBe('standards');
  });

  it('deduplicates edges', () => {
    state.fmCache = {
      'a.md': { id: 'A', title: 'A', type: 'policy', related: { standards: ['B'] } },
      'b.md': { id: 'B', title: 'B', type: 'standard', related: { policies: ['A'] } },
    };

    buildGraph();

    // A→B:standards and B→A:policies have different labels, so dedup keeps both.
    // Same-label duplicates (e.g. two A→B:standards) are collapsed to one.
    const edgeCount = state.graphEdges.filter(e => (e.source === 'A' && e.target === 'B') || (e.source === 'B' && e.target === 'A')).length;
    expect(edgeCount).toBe(2);
  });

  it('handles empty fmCache', () => {
    buildGraph();

    expect(Object.keys(state.graphNodes)).toHaveLength(0);
    expect(state.graphEdges).toHaveLength(0);
  });
});
