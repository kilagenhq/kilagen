import { describe, it, expect, vi } from 'vitest';
import { isSafePath, safeUrl, resolveBase, resolvePath, hookLinks, safeFetch } from '../modules/security.js';

describe('isSafePath', () => {
  it('allows valid domain doc paths', () => {
    expect(isSafePath('01-grc/policies/POL-info-sec.md')).toBe(true);
    expect(isSafePath('04-appsec/runbooks/RB-rotate-key.md')).toBe(true);
  });

  it('allows system paths', () => {
    expect(isSafePath('systems/SYS-crowdstrike.md')).toBe(true);
  });

  it('allows capabilities.yml', () => {
    expect(isSafePath('02-iam/capabilities.yml')).toBe(true);
  });

  it('allows schema JSON', () => {
    expect(isSafePath('schemas/frontmatter.schema.json')).toBe(true);
  });

  it('allows root-level known files', () => {
    expect(isSafePath('config.yml')).toBe(true);
    expect(isSafePath('design.md')).toBe(true);
    expect(isSafePath('glossary.md')).toBe(true);
  });

  it('blocks path traversal with ..', () => {
    expect(isSafePath('../etc/passwd')).toBe(false);
    expect(isSafePath('01-grc/../../../etc/passwd')).toBe(false);
    expect(isSafePath('systems/..%2F..%2Fetc/passwd.md')).toBe(false);
  });

  it('blocks double slashes', () => {
    expect(isSafePath('01-grc//policies/test.md')).toBe(false);
  });

  it('blocks backslashes', () => {
    expect(isSafePath('01-grc\\policies\\test.md')).toBe(false);
  });

  it('blocks absolute paths', () => {
    expect(isSafePath('/etc/passwd')).toBe(false);
  });

  it('blocks null bytes', () => {
    expect(isSafePath('01-grc/test\x00.md')).toBe(false);
  });

  it('blocks control characters', () => {
    expect(isSafePath('01-grc/test\n.md')).toBe(false);
  });

  it('blocks paths without allowed extensions', () => {
    expect(isSafePath('01-grc/test.html')).toBe(false);
    expect(isSafePath('01-grc/test.js')).toBe(false);
    expect(isSafePath('01-grc/test')).toBe(false);
  });

  it('blocks unknown top-level directories', () => {
    expect(isSafePath('unknown/test.md')).toBe(false);
    expect(isSafePath('.git/config.yml')).toBe(false);
  });

  it('blocks unknown root files', () => {
    expect(isSafePath('secret.md')).toBe(false);
    expect(isSafePath('.env.yml')).toBe(false);
  });

  it('rejects non-string input', () => {
    expect(isSafePath(null)).toBe(false);
    expect(isSafePath(undefined)).toBe(false);
    expect(isSafePath(42)).toBe(false);
  });
});

describe('safeUrl', () => {
  it('allows http URLs', () => {
    expect(safeUrl('http://example.com')).toBe('http://example.com');
  });

  it('allows https URLs', () => {
    expect(safeUrl('https://tickets.example.com/browse/SEC-123')).toBe('https://tickets.example.com/browse/SEC-123');
  });

  it('blocks javascript URLs', () => {
    expect(safeUrl('javascript:alert(1)')).toBeNull();
  });

  it('blocks data URLs', () => {
    expect(safeUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
  });

  it('blocks relative paths', () => {
    expect(safeUrl('../foo')).toBeNull();
  });

  it('rejects non-string input', () => {
    expect(safeUrl(null)).toBeNull();
    expect(safeUrl(undefined)).toBeNull();
  });
});

describe('safeUrl edge cases', () => {
  it('blocks protocol smuggling', () => {
    expect(safeUrl('javascript:alert(1)//http://')).toBeNull();
  });

  it('is case insensitive for protocol', () => {
    expect(safeUrl('HTTPS://example.com')).toBe('HTTPS://example.com');
    expect(safeUrl('Http://example.com')).toBe('Http://example.com');
  });

  it('blocks ftp and other schemes', () => {
    expect(safeUrl('ftp://files.example.com')).toBeNull();
    expect(safeUrl('blob:http://example.com')).toBeNull();
    expect(safeUrl('file:///etc/passwd')).toBeNull();
  });

  it('handles empty string', () => {
    expect(safeUrl('')).toBeNull();
  });
});

describe('resolvePath', () => {
  it('strips hash fragments', () => {
    expect(resolvePath('01-grc/test.md#section')).toBe('01-grc/test.md');
  });

  it('strips query strings', () => {
    expect(resolvePath('01-grc/test.md?q=1')).toBe('01-grc/test.md');
  });

  it('returns empty string for paths with ..', () => {
    expect(resolvePath('../etc/passwd')).toBe('');
    expect(resolvePath('foo/../bar.md')).toBe('');
    expect(resolvePath('01-grc/../../../etc/passwd')).toBe('');
  });

  it('normalizes . segments', () => {
    expect(resolvePath('./foo/bar.md')).toBe('foo/bar.md');
  });

  it('removes empty segments', () => {
    expect(resolvePath('foo//bar.md')).toBe('foo/bar.md');
  });

  it('handles simple paths', () => {
    expect(resolvePath('01-grc/policies/POL-test.md')).toBe('01-grc/policies/POL-test.md');
  });

  it('handles empty input', () => {
    expect(resolvePath('')).toBe('');
  });
});

describe('hookLinks', () => {
  it('leaves external http links alone', () => {
    const container = document.createElement('div');
    const a = document.createElement('a');
    a.setAttribute('href', 'https://example.com');
    container.appendChild(a);
    hookLinks(container, function() {});
    expect(a.getAttribute('href')).toBe('https://example.com');
  });

  it('leaves mailto links alone', () => {
    const container = document.createElement('div');
    const a = document.createElement('a');
    a.setAttribute('href', 'mailto:test@example.com');
    container.appendChild(a);
    hookLinks(container, function() {});
    expect(a.getAttribute('href')).toBe('mailto:test@example.com');
  });

  it('strips href from javascript: links', () => {
    const container = document.createElement('div');
    const a = document.createElement('a');
    a.setAttribute('href', 'javascript:alert(1)');
    container.appendChild(a);
    hookLinks(container, function() {});
    expect(a.hasAttribute('href')).toBe(false);
  });

  it('strips href from unknown protocol links', () => {
    const container = document.createElement('div');
    const a = document.createElement('a');
    a.setAttribute('href', 'vbscript:msgbox(1)');
    container.appendChild(a);
    hookLinks(container, function() {});
    expect(a.hasAttribute('href')).toBe(false);
  });

  it('routes safe internal .md links through goFn', () => {
    const container = document.createElement('div');
    const a = document.createElement('a');
    a.setAttribute('href', '01-grc/policies/POL-test.md');
    container.appendChild(a);
    const goFn = vi.fn();
    hookLinks(container, goFn);
    a.click();
    expect(goFn).toHaveBeenCalledWith('doc/01-grc/policies/POL-test.md', expect.anything());
  });

  it('blocks click on unsafe internal paths', () => {
    const container = document.createElement('div');
    const a = document.createElement('a');
    a.setAttribute('href', '../etc/passwd');
    container.appendChild(a);
    const goFn = vi.fn();
    hookLinks(container, goFn);
    const event = new Event('click', { cancelable: true });
    a.dispatchEvent(event);
    expect(goFn).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
  });
});

describe('safeFetch', () => {
  it('rejects blocked paths', async () => {
    await expect(safeFetch('../etc/passwd')).rejects.toThrow('Path blocked by security policy');
  });

  it('rejects non-string paths', async () => {
    await expect(safeFetch(null)).rejects.toThrow('Path blocked by security policy');
  });
});

describe('resolveBase', () => {
  it('returns program base for domain paths', () => {
    expect(resolveBase('01-grc/policies/test.md')).toBe('../program/');
  });

  it('returns keel base for lens paths', () => {
    expect(resolveBase('lenses/nist-csf.yml')).toBe('../keel/');
  });

  it('returns keel base for glossary', () => {
    expect(resolveBase('glossary.md')).toBe('../keel/');
  });

  it('returns keel base for templates', () => {
    expect(resolveBase('templates/policy.md')).toBe('../keel/');
  });

  it('returns program base for system paths', () => {
    expect(resolveBase('systems/SYS-okta.md')).toBe('../program/');
  });
});
