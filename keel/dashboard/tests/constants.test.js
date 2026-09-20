import { describe, it, expect } from 'vitest';
import { typePlural, typeLabel, typeColor, statusColor, fwLabel, daysUntil, KEEL_ROOT_FILES } from '../modules/constants.js';

describe('type labels', () => {
  it('pluralises the types that need it', () => {
    expect(typePlural('policy')).toBe('Policies');
    expect(typePlural('gap')).toBe('Gaps');
    expect(typePlural('threat-model')).toBe('Threat models');
  });

  it('falls back to the raw name for an unknown type', () => {
    expect(typePlural('sonnet')).toBe('sonnet');
  });

  it('humanises a hyphenated type name', () => {
    expect(typeLabel('business-process')).toBe('Business process');
  });
});

describe('colors', () => {
  it('gives every known type a colour', () => {
    ['policy', 'standard', 'gap', 'exception', 'decision', 'incident'].forEach(t => {
      expect(typeColor(t)).not.toBe(typeColor('__nothing__'));
    });
  });

  it('falls back for an unknown type', () => {
    expect(typeColor('__nothing__')).toBe('var(--fg3)');
  });

  it('colours document status, and knows nothing of tracker states', () => {
    expect(statusColor('active')).toBe('var(--cov-deployed)');
    expect(statusColor('draft')).toBe('var(--cov-partial)');
    // "in progress" is a tracker's word; the dashboard has no colour for it.
    expect(statusColor('in-progress')).toBe('var(--fg3)');
  });
});

describe('fwLabel', () => {
  it('uses the known label when there is one', () => {
    expect(fwLabel('nist_csf')).toBe('NIST CSF 2.0');
    expect(fwLabel('pci_dss')).toBe('PCI DSS');
  });

  it('humanises an unknown framework id', () => {
    expect(fwLabel('my_framework')).toBe('My Framework');
  });
});

describe('daysUntil', () => {
  it('returns null for a missing or malformed date', () => {
    expect(daysUntil(null)).toBeNull();
    expect(daysUntil('soon')).toBeNull();
  });

  it('is negative in the past and positive in the future', () => {
    const past = new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10);
    const future = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
    expect(daysUntil(past)).toBeLessThan(0);
    expect(daysUntil(future)).toBeGreaterThan(0);
  });
});

describe('KEEL_ROOT_FILES', () => {
  it('names only framework prose, never a program file', () => {
    expect(KEEL_ROOT_FILES).toContain('design.md');
    expect(KEEL_ROOT_FILES).not.toContain('config.yml');
    // maturity.md and lenses.md went with the concepts they documented.
    expect(KEEL_ROOT_FILES).not.toContain('maturity.md');
    expect(KEEL_ROOT_FILES).not.toContain('lenses.md');
  });
});
