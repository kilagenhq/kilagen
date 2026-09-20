/* The rules that decide whether a piece of evidence still proves anything.
 *
 * They are stated twice on purpose — once in `check_evidence.py` for the
 * command line and once in `modules/evidence.js` for the page — so these
 * tests exist to pin the second copy to the first. Every case here is written
 * against an explicit `when` rather than today, because a rule about expiry
 * tested on a moving date is a rule that passes for the wrong reason.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { state } from '../modules/state.js';
import {
  evidenceState, expiresOn, evidenceStateInfo, proofRows, evidenceRows,
  evidenceSummary, collectorRows, requirementRowsOf, DUE_SOON_DAYS,
} from '../modules/evidence.js';

const TODAY = '2026-09-20';

function standard(requirements) {
  return {
    path: 'standards/std-x.md', id: 'std-x', type: 'standard', title: 'Standard X',
    requirements: requirements,
  };
}

function load(documents) {
  state.fmCache = {};
  state.idToPath = {};
  state.allDocs = [];
  state.collectors = {};
  documents.forEach((fm) => {
    state.fmCache[fm.path] = fm;
    state.idToPath[fm.id] = fm.path;
    state.allDocs.push({ path: fm.path, name: fm.path.split('/').pop() });
  });
}

beforeEach(() => { load([]); });

describe('when a piece of evidence stops proving anything', () => {
  it('is fresh while it is well inside its own renewal period', () => {
    expect(evidenceState({ collected: '2026-09-01', freshness: 'quarterly' }, TODAY)).toBe('fresh');
  });

  it('is stale once collected plus freshness is behind us', () => {
    expect(evidenceState({ collected: '2025-09-01', freshness: 'annually' }, TODAY)).toBe('stale');
  });

  it('is due soon inside the last month of its period', () => {
    // Collected 2026-06-25, quarterly: good until 2026-09-25, five days away.
    expect(evidenceState({ collected: '2026-06-25', freshness: 'quarterly' }, TODAY)).toBe('due-soon');
  });

  it('is not yet stale on the day it expires, which is how the check reads it', () => {
    // check_evidence.py compares `expires < today`, so the day itself still counts.
    const item = { collected: '2026-06-20', freshness: 'quarterly' };
    expect(expiresOn(item)).toBe(TODAY);
    expect(evidenceState(item, TODAY)).toBe('due-soon');
  });

  it('is undated when nobody wrote down the day it was produced', () => {
    expect(evidenceState({ url: 'https://example.com/x.pdf' }, TODAY)).toBe('undated');
  });

  it('has no expiry when it carries a date but no renewal period', () => {
    expect(evidenceState({ collected: '2026-02-10' }, TODAY)).toBe('unscheduled');
  });

  it('refuses to compute an expiry it cannot know', () => {
    expect(expiresOn({ freshness: 'quarterly' })).toBe('');
    expect(expiresOn({ collected: '2026-01-01' })).toBe('');
    expect(expiresOn({ collected: 'not a date', freshness: 'annually' })).toBe('');
  });

  it('adds the renewal period to the day it was collected', () => {
    expect(expiresOn({ collected: '2026-01-01', freshness: 'monthly' })).toBe('2026-02-01');
    expect(expiresOn({ collected: '2026-01-01', freshness: 'annually' })).toBe('2027-01-02');
  });

  it('gives every state a word and a colour', () => {
    ['unproven', 'stale', 'undated', 'due-soon', 'unscheduled', 'fresh'].forEach((key) => {
      const info = evidenceStateInfo(key);
      expect(info.label).toBeTruthy();
      expect(info.color).toMatch(/^var\(--/);
    });
  });

  it('warns a month ahead, which the command line deliberately does not', () => {
    expect(DUE_SOON_DAYS).toBe(30);
  });
});

describe('what the program can and cannot prove', () => {
  beforeEach(() => {
    load([standard([
      { ref: '1.1', text: 'One', how_demonstrated: 'An export.',
        evidence: [{ name: 'Export', url: 'https://example.com/a.csv', collected: '2026-09-01', freshness: 'quarterly', collector: 'manual' }] },
      { ref: '1.2', text: 'Two' },
      { ref: '1.3', text: 'Three',
        evidence: [
          { name: 'One', url: 'https://example.com/b.csv', collected: '2026-09-01', freshness: 'quarterly' },
          { name: 'Two', url: 'https://example.com/c.csv', collected: '2020-01-01', freshness: 'annually' },
        ] },
    ])]);
  });

  it('gives a requirement with nothing attached a row of its own', () => {
    const rows = proofRows(TODAY);
    const unproven = rows.filter((r) => r.state === 'unproven');
    expect(unproven).toHaveLength(1);
    expect(unproven[0].req.ref).toBe('1.2');
    expect(unproven[0].item).toBeNull();
  });

  it('gives each artefact its own row, so two proofs of one requirement both show', () => {
    expect(proofRows(TODAY)).toHaveLength(4);
    expect(evidenceRows(TODAY)).toHaveLength(3);
  });

  it('counts requirements with something attached, not requirements that are proven well', () => {
    const summary = evidenceSummary(TODAY);
    expect(summary.requirements).toBe(3);
    expect(summary.proven).toBe(2);
    expect(summary.unproven).toBe(1);
    expect(summary.artefacts).toBe(3);
    expect(summary.counts.stale).toBe(1);
    expect(summary.counts.unproven).toBe(1);
  });

  it('reads only the standard asked for', () => {
    expect(requirementRowsOf('std-x', TODAY)).toHaveLength(3);
    expect(requirementRowsOf('std-nothing', TODAY)).toHaveLength(0);
  });

  it('ignores a document that is not a standard', () => {
    load([standard([{ ref: '1.1', text: 'One' }]),
          { path: 'policies/pol-y.md', id: 'pol-y', type: 'policy', title: 'Policy Y',
            requirements: [{ ref: '9.9', text: 'Not a real requirement' }] }]);
    expect(proofRows(TODAY)).toHaveLength(1);
  });
});

describe('the collectors a program can run', () => {
  beforeEach(() => {
    load([standard([
      { ref: '1.1', text: 'One',
        evidence: [{ name: 'A', url: 'https://example.com/a.csv', collected: '2026-09-01', collector: 'manual' }] },
      { ref: '1.2', text: 'Two',
        evidence: [{ name: 'B', url: 'https://example.com/b.csv', collected: '2026-09-01', collector: 'nowhere' }] },
    ])]);
    state.collectors = {
      manual: { source: 'framework', path: 'keel/collectors/manual.py', summary: 'A person did it.', template: false },
      spare: { source: 'program', path: 'collectors/spare.py', summary: 'Nothing names it yet.', template: false },
    };
  });

  it('lists a collector nothing has been wired to, which is the one worth finding', () => {
    const spare = collectorRows(TODAY).find((c) => c.name === 'spare');
    expect(spare).toBeDefined();
    expect(spare.uses).toHaveLength(0);
    expect(spare.source).toBe('program');
  });

  it('says which evidence entries each collector refreshes', () => {
    const manual = collectorRows(TODAY).find((c) => c.name === 'manual');
    expect(manual.uses).toHaveLength(1);
    expect(manual.uses[0].key).toBe('std-x#1.1');
  });

  it('still admits a collector the content names but the build never found', () => {
    const ghost = collectorRows(TODAY).find((c) => c.name === 'nowhere');
    expect(ghost).toBeDefined();
    expect(ghost.summary).toBe('');
    expect(ghost.uses).toHaveLength(1);
  });

  it('survives a registry built before collectors were indexed', () => {
    state.collectors = {};
    const rows = collectorRows(TODAY);
    expect(rows.map((c) => c.name).sort()).toEqual(['manual', 'nowhere']);
  });
});
