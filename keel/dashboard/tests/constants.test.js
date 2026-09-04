import { describe, it, expect } from 'vitest';
import { DOMAINS, TOP_DIRS, ROOT_FILES, fwLabel, critBand } from '../modules/constants.js';

describe('DOMAINS', () => {
  it('has 10 domains', () => {
    expect(DOMAINS).toHaveLength(10);
  });

  it('each domain has dir, label, and iconType', () => {
    DOMAINS.forEach(d => {
      expect(d.dir).toBeTruthy();
      expect(d.label).toBeTruthy();
      expect(d.iconType).toBeTruthy();
    });
  });

  it('domain dirs are sequentially numbered from 01', () => {
    DOMAINS.forEach((d, i) => {
      const num = String(i + 1).padStart(2, '0');
      expect(d.dir).toMatch(new RegExp(`^${num}-`));
    });
  });
});

describe('TOP_DIRS', () => {
  it('includes all domain dirs', () => {
    DOMAINS.forEach(d => {
      expect(TOP_DIRS).toContain(d.dir);
    });
  });

  it('includes systems, adr, lenses, schemas, templates', () => {
    ['systems', 'adr', 'lenses', 'schemas', 'templates'].forEach(d => {
      expect(TOP_DIRS).toContain(d);
    });
  });
});

describe('ROOT_FILES', () => {
  it('includes config.yml, design.md, and the program-root risk-taxonomy.yml', () => {
    expect(ROOT_FILES).toContain('config.yml');
    expect(ROOT_FILES).toContain('design.md');
    // risk-taxonomy.yml is slash-less, so safeFetch only allows it via ROOT_FILES.
    expect(ROOT_FILES).toContain('risk-taxonomy.yml');
  });
});

describe('critBand', () => {
  // Must mirror the Python _crit_band() (validate_semantic_refs.py) and the
  // framework doc (program/01-grc/standards/STD-risk-framework.md), only capitalised here.
  // Keep this vector in sync with EXPECTED_BANDS in
  // keel/scripts/tests/test_risk_validators.py.
  const EXPECTED = {
    1: 'Negligible',
    2: 'Low',
    3: 'Medium', 7: 'Medium',
    8: 'High', 14: 'High',
    15: 'Critical', 25: 'Critical',
  };

  it('maps each band edge correctly', () => {
    Object.entries(EXPECTED).forEach(([score, band]) => {
      expect(critBand(Number(score))).toBe(band);
    });
  });

  it('maps the full achievable score range (1..25) consistently', () => {
    const band = s =>
      s <= 1 ? 'Negligible' : s <= 2 ? 'Low' : s <= 7 ? 'Medium' : s <= 14 ? 'High' : 'Critical';
    for (let s = 1; s <= 25; s++) {
      expect(critBand(s)).toBe(band(s));
    }
  });
});

describe('fwLabel', () => {
  it('returns known label for NIST CSF', () => {
    expect(fwLabel('nist_csf')).toBe('NIST CSF 2.0');
  });

  it('returns known label for ISO 27001', () => {
    expect(fwLabel('iso_27001')).toBe('ISO/IEC 27001:2022');
  });

  it('generates readable label for unknown framework', () => {
    expect(fwLabel('custom_framework_2024')).toBe('Custom Framework 2024');
  });
});
