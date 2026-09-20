import { describe, it, expect, beforeEach } from 'vitest';
import { connectionsOf } from '../modules/connections.js';
import { state, isOpenGap, isLiveException, docsOfType, docsWithFacet } from '../modules/state.js';

function seed(fmCache) {
  state.fmCache = fmCache;
  state.allDocs = Object.keys(fmCache).map(p => ({ path: p, name: p.split('/').pop() }));
  state.idToPath = {};
  Object.keys(fmCache).forEach(p => { if (fmCache[p].id) state.idToPath[fmCache[p].id] = p; });
}

beforeEach(() => {
  state.fmCache = {};
  state.allDocs = [];
  state.idToPath = {};
  state.types = [
    { name: 'policy', prefix: 'pol', folder: 'policies', dated: false, immutable: false },
    { name: 'standard', prefix: 'std', folder: 'standards', dated: false, immutable: false },
    { name: 'gap', prefix: 'gap', folder: 'gaps', dated: true, immutable: false },
  ];
});

describe('what one document connects to', () => {
  it('takes the verb from the pair of types, not from who wrote the id down', () => {
    seed({
      'policies/pol-info-sec.md': { path: 'policies/pol-info-sec.md', id: 'pol-info-sec', type: 'policy', related: ['std-vuln-mgmt'] },
      'standards/std-vuln-mgmt.md': { path: 'standards/std-vuln-mgmt.md', id: 'std-vuln-mgmt', type: 'standard' },
    });
    expect(connectionsOf(state.fmCache['policies/pol-info-sec.md']))
      .toEqual([expect.objectContaining({ id: 'std-vuln-mgmt', verb: 'authorises' })]);
    // The standard never declared the link, and still knows what it is.
    expect(connectionsOf(state.fmCache['standards/std-vuln-mgmt.md']))
      .toEqual([expect.objectContaining({ id: 'pol-info-sec', verb: 'authorised by' })]);
  });

  it('shows a standard what contests it, and the gap what it falls short of', () => {
    seed({
      'standards/std-access.md': { path: 'standards/std-access.md', id: 'std-access', type: 'standard' },
      'gaps/2026/gap-mfa.md': { path: 'gaps/2026/gap-mfa.md', id: 'gap-mfa', type: 'gap', requirement: 'std-access#1.2' },
      'exceptions/2026/exc-batch.md': { path: 'exceptions/2026/exc-batch.md', id: 'exc-batch', type: 'exception', requirement: 'std-access#1.2' },
    });
    const around = connectionsOf(state.fmCache['standards/std-access.md']);
    expect(around).toEqual([
      expect.objectContaining({ id: 'gap-mfa', verb: 'contested by' }),
      expect.objectContaining({ id: 'exc-batch', verb: 'excepted by' }),
    ]);
    expect(connectionsOf(state.fmCache['gaps/2026/gap-mfa.md']))
      .toEqual([expect.objectContaining({ id: 'std-access', verb: 'falls short of' })]);
    expect(connectionsOf(state.fmCache['exceptions/2026/exc-batch.md']))
      .toEqual([expect.objectContaining({ id: 'std-access', verb: 'deviates from' })]);
  });

  it('reads both ends of a supersession', () => {
    seed({
      'standards/std-new.md': { path: 'standards/std-new.md', id: 'std-new', type: 'standard', supersedes: ['std-old'] },
      'standards/std-old.md': { path: 'standards/std-old.md', id: 'std-old', type: 'standard' },
    });
    expect(connectionsOf(state.fmCache['standards/std-new.md']))
      .toEqual([expect.objectContaining({ id: 'std-old', verb: 'supersedes' })]);
    // std-old declares nothing — the edge is still drawn from the other side.
    expect(connectionsOf(state.fmCache['standards/std-old.md']))
      .toEqual([expect.objectContaining({ id: 'std-new', verb: 'superseded by' })]);
  });

  it('leaves a link with no verb behind it as related, which is honest', () => {
    seed({
      'runbooks/rb-triage.md': { path: 'runbooks/rb-triage.md', id: 'rb-triage', type: 'runbook', related: ['std-vuln-mgmt'] },
      'standards/std-vuln-mgmt.md': { path: 'standards/std-vuln-mgmt.md', id: 'std-vuln-mgmt', type: 'standard' },
    });
    expect(connectionsOf(state.fmCache['runbooks/rb-triage.md']))
      .toEqual([expect.objectContaining({ id: 'std-vuln-mgmt', verb: 'related' })]);
  });

  it('drops an id that resolves to nothing, and never lists a document twice', () => {
    seed({
      'policies/pol-a.md': { path: 'policies/pol-a.md', id: 'pol-a', type: 'policy', related: ['std-b', 'std-b', 'std-ghost'] },
      'standards/std-b.md': { path: 'standards/std-b.md', id: 'std-b', type: 'standard', related: ['pol-a'] },
    });
    expect(connectionsOf(state.fmCache['policies/pol-a.md'])).toHaveLength(1);
  });

  it('is empty for a document that links to nothing', () => {
    seed({ 'policies/pol-lonely.md': { path: 'policies/pol-lonely.md', id: 'pol-lonely', type: 'policy' } });
    expect(connectionsOf(state.fmCache['policies/pol-lonely.md'])).toEqual([]);
    expect(connectionsOf(null)).toEqual([]);
  });
});

describe('open and live are computed, never read from a field', () => {
  it('a gap is open until a write-once fact closes it', () => {
    expect(isOpenGap({ type: 'gap' })).toBe(true);
    expect(isOpenGap({ type: 'gap', remediated: '2026-01-01' })).toBe(false);
    expect(isOpenGap({ type: 'gap', excepted_by: 'exc-x' })).toBe(false);
    // `superseded_by` used to carry this meaning as well as "a newer version
    // replaced this document". One field, two relationships; now it is neither.
    expect(isOpenGap({ type: 'gap', superseded_by: 'exc-x' })).toBe(true);
  });

  it('a status field cannot reopen a closed gap', () => {
    expect(isOpenGap({ type: 'gap', remediated: '2026-01-01', status: 'active' })).toBe(false);
  });

  it('an exception is live until it expires or is revoked, and reads no status', () => {
    const base = { type: 'exception', expires: '2030-01-01' };
    expect(isLiveException(base, '2026-01-01')).toBe(true);
    expect(isLiveException({ ...base, expires: '2025-01-01' }, '2026-01-01')).toBe(false);
    expect(isLiveException({ ...base, revoked: '2026-02-01' }, '2026-01-01')).toBe(false);
    // The field does not exist on the type any more; a stray one changes nothing.
    expect(isLiveException({ ...base, status: 'retired' }, '2026-01-01')).toBe(true);
  });
});

describe('facet lookups', () => {
  beforeEach(() => {
    seed({
      'standards/std-a.md': { id: 'std-a', type: 'standard', domains: ['iam', 'grc'], capabilities: ['iam.idp'] },
      'policies/pol-b.md': { id: 'pol-b', type: 'policy', domains: ['grc'] },
    });
  });

  it('finds documents of a type', () => {
    expect(docsOfType('standard').map(d => d.id)).toEqual(['std-a']);
  });

  it('finds a document under every domain it declares', () => {
    expect(docsWithFacet('domains', 'iam').map(d => d.id)).toEqual(['std-a']);
    expect(docsWithFacet('domains', 'grc').map(d => d.id).sort()).toEqual(['pol-b', 'std-a']);
  });

  it('returns nothing for a value no document declares', () => {
    expect(docsWithFacet('domains', 'quantum')).toEqual([]);
  });
});
