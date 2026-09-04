import { describe, it, expect, beforeEach } from 'vitest';
import { state } from '../modules/state.js';
import { mk, matLvl, matDot, ghUrl, ghTreeUrl, roleTitle, formatRoles } from '../modules/dom.js';

beforeEach(() => {
  state.config.repo = '';
  // Reset fmCache and idToPath between tests; role lookups read from both.
  Object.keys(state.fmCache).forEach(k => delete state.fmCache[k]);
  Object.keys(state.idToPath).forEach(k => delete state.idToPath[k]);
});

describe('mk', () => {
  it('creates an element with tag', () => {
    const el = mk('div');
    expect(el.tagName).toBe('DIV');
  });

  it('sets className when provided', () => {
    const el = mk('span', 'meta-key');
    expect(el.className).toBe('meta-key');
  });

  it('sets textContent when provided', () => {
    const el = mk('p', '', 'Hello');
    expect(el.textContent).toBe('Hello');
  });

  it('handles all three parameters', () => {
    const el = mk('div', 'card', 'Title');
    expect(el.tagName).toBe('DIV');
    expect(el.className).toBe('card');
    expect(el.textContent).toBe('Title');
  });

  it('handles empty class', () => {
    const el = mk('span', '', 'text');
    expect(el.className).toBe('');
    expect(el.textContent).toBe('text');
  });
});

describe('matLvl', () => {
  it('extracts numeric level from maturity string', () => {
    expect(matLvl('L0-none')).toBe(0);
    expect(matLvl('L1-ad-hoc')).toBe(1);
    expect(matLvl('L3-integrated')).toBe(3);
    expect(matLvl('L5-optimizing')).toBe(5);
  });

  it('returns 0 for null/undefined', () => {
    expect(matLvl(null)).toBe(0);
    expect(matLvl(undefined)).toBe(0);
    expect(matLvl('')).toBe(0);
  });
});

describe('matDot', () => {
  it('creates a span with correct maturity class', () => {
    const dot = matDot('L3-integrated');
    expect(dot.tagName).toBe('SPAN');
    expect(dot.className).toBe('mat-dot mat-L3');
    expect(dot.title).toBe('L3-integrated');
  });

  it('handles null maturity', () => {
    const dot = matDot(null);
    expect(dot.className).toBe('mat-dot mat-L0');
    expect(dot.title).toBe('L0-none');
  });
});

describe('ghUrl', () => {
  it('returns empty string when no repo configured', () => {
    state.config.repo = '';
    expect(ghUrl('01-grc/policies/test.md')).toBe('');
  });

  it('constructs GitHub blob URL for program content', () => {
    state.config.repo = 'org/kilagen';
    expect(ghUrl('01-grc/policies/test.md')).toBe('https://github.com/org/kilagen/blob/main/program/01-grc/policies/test.md');
  });

  it('constructs GitHub blob URL for keel content', () => {
    state.config.repo = 'org/kilagen';
    expect(ghUrl('design.md')).toBe('https://github.com/org/kilagen/blob/main/keel/design.md');
  });
});

describe('ghTreeUrl', () => {
  it('returns empty string when no repo configured', () => {
    state.config.repo = '';
    expect(ghTreeUrl('01-grc')).toBe('');
  });

  it('constructs GitHub tree URL', () => {
    state.config.repo = 'org/kilagen';
    expect(ghTreeUrl('01-grc')).toBe('https://github.com/org/kilagen/tree/main/program/01-grc');
  });
});

describe('roleTitle', () => {
  it('returns empty string for empty or non-string input', () => {
    expect(roleTitle('')).toBe('');
    expect(roleTitle(null)).toBe('');
    expect(roleTitle(undefined)).toBe('');
    expect(roleTitle(['role-cto'])).toBe('');
  });

  it('marks the slug as unknown when no matching role is in fmCache', () => {
    expect(roleTitle('role-cto')).toBe('role-cto (unknown role)');
  });

  it('returns the title from fmCache when the role is loaded', () => {
    state.fmCache['roles/role-cto.md'] = { id: 'role-cto', type: 'role', title: 'Chief Technology Officer' };
    state.idToPath['role-cto'] = 'roles/role-cto.md';
    expect(roleTitle('role-cto')).toBe('Chief Technology Officer');
  });

  it('uses the idToPath index for O(1) lookup when available', () => {
    state.fmCache['roles/role-cto.md'] = { id: 'role-cto', type: 'role', title: 'Chief Technology Officer' };
    state.idToPath['role-cto'] = 'roles/role-cto.md';
    expect(roleTitle('role-cto')).toBe('Chief Technology Officer');
  });

  it('marks the slug as unknown when a role exists but has no title', () => {
    state.fmCache['roles/role-x.md'] = { id: 'role-x', type: 'role' };
    state.idToPath['role-x'] = 'roles/role-x.md';
    expect(roleTitle('role-x')).toBe('role-x (unknown role)');
  });
});

describe('formatRoles', () => {
  beforeEach(() => {
    state.fmCache['roles/role-cto.md'] = { id: 'role-cto', type: 'role', title: 'Chief Technology Officer' };
    state.idToPath['role-cto'] = 'roles/role-cto.md';
    state.fmCache['roles/role-coo.md'] = { id: 'role-coo', type: 'role', title: 'Chief Operating Officer' };
    state.idToPath['role-coo'] = 'roles/role-coo.md';
  });

  it('returns empty string for empty input', () => {
    expect(formatRoles('')).toBe('');
    expect(formatRoles(null)).toBe('');
    expect(formatRoles([])).toBe('');
  });

  it('resolves a single slug to its title', () => {
    expect(formatRoles('role-cto')).toBe('Chief Technology Officer');
  });

  it('joins an array of slugs with commas', () => {
    expect(formatRoles(['role-cto', 'role-coo'])).toBe('Chief Technology Officer, Chief Operating Officer');
  });

  it('marks unknown slugs in an array', () => {
    expect(formatRoles(['role-cto', 'role-unknown'])).toBe('Chief Technology Officer, role-unknown (unknown role)');
  });
});
