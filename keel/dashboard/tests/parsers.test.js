import { describe, it, expect } from 'vitest';
import { parseFM, parseYml, renderMd } from '../modules/parsers.js';

describe('parseFM', () => {
  it('parses valid frontmatter', () => {
    const text = '---\nid: STD-test\ntitle: Test\n---\nBody here';
    const result = parseFM(text);
    expect(result.fm).toEqual({ id: 'STD-test', title: 'Test' });
    expect(result.body).toBe('\nBody here');
  });

  it('returns null fm when no frontmatter delimiters', () => {
    const text = 'Just a plain document';
    const result = parseFM(text);
    expect(result.fm).toBeNull();
    expect(result.body).toBe('Just a plain document');
  });

  it('returns null fm when only opening delimiter', () => {
    const text = '---\nid: broken';
    const result = parseFM(text);
    expect(result.fm).toBeNull();
    expect(result.body).toBe('---\nid: broken');
  });

  it('returns null fm and parseError on invalid YAML', () => {
    const text = '---\n: :\n---\nBody';
    const result = parseFM(text);
    expect(result.fm).toBeNull();
    expect(result.body).toBe('\nBody');
    expect(result.parseError).toBeTruthy();
  });

  it('handles empty frontmatter', () => {
    const text = '---\n---\nBody only';
    const result = parseFM(text);
    expect(result.fm).toBeUndefined();
    expect(result.body).toBe('\nBody only');
  });

  it('parses arrays in frontmatter as strings (FAILSAFE_SCHEMA)', () => {
    const text = '---\ndomains:\n  - infra\n  - secops\n---\nBody';
    const result = parseFM(text);
    expect(result.fm.domains).toEqual(['infra', 'secops']);
  });

  it('treats numbers as strings under FAILSAFE_SCHEMA', () => {
    const text = '---\nversion: 2\n---\n';
    const result = parseFM(text);
    expect(result.fm.version).toBe('2');
  });
});

describe('renderMd', () => {
  it('renders markdown to sanitized HTML', () => {
    const html = renderMd('**bold** text');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('text');
  });

  it('strips script tags', () => {
    const html = renderMd('<script>alert(1)</script>Safe text');
    expect(html).not.toContain('<script>');
    expect(html).toContain('Safe text');
  });

  it('strips event handler attributes', () => {
    const html = renderMd('<img onload="alert(1)" src="x">');
    expect(html).not.toContain('onload');
  });

  it('blocks javascript: in img src', () => {
    const html = renderMd('<img src="javascript:alert(1)">');
    expect(html).not.toContain('javascript:');
  });

  it('blocks external https: in img src', () => {
    const html = renderMd('<img src="https://evil.com/track.gif">');
    expect(html).not.toContain('https://evil.com');
    expect(html).toContain('[blocked]');
  });

  it('blocks data: in img src', () => {
    const html = renderMd('<img src="data:image/png;base64,abc">');
    expect(html).not.toContain('data:image');
    expect(html).toContain('[blocked]');
  });

  it('adds target _blank and noopener to external links', () => {
    const html = renderMd('[link](https://example.com)');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('strips disallowed tags', () => {
    const html = renderMd('<iframe src="https://evil.com"></iframe>');
    expect(html).not.toContain('<iframe');
  });
});

describe('parseYml', () => {
  it('parses valid YAML', () => {
    const result = parseYml('domain: appsec\ncapabilities:\n  - id: sast');
    expect(result.domain).toBe('appsec');
    expect(result.capabilities).toEqual([{ id: 'sast' }]);
  });

  it('returns error object on invalid YAML', () => {
    const result = parseYml(': :');
    expect(result).toBeTruthy();
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('returns undefined on empty input', () => {
    const result = parseYml('');
    expect(result).toBeUndefined();
  });
});

/* The tests that were missing, and whose absence hid a real breakage.
 *
 * DOMPurify sat pinned on a version with an open advisory because three
 * sanitisation tests "broke" on the upgrade. They had not: the sanitiser was
 * fine and the *test DOM* was what could not keep up — under it DOMPurify
 * silently degraded to stripping every element. Nothing noticed, because
 * every test here asserted what must be REMOVED and none asserted what must
 * SURVIVE. A sanitiser that deletes everything passes that suite perfectly
 * while being useless.
 *
 * These are the other half of the contract. They go through renderMd, which
 * is the path the dashboard actually uses.
 */
describe('sanitisation keeps what it is supposed to keep', () => {
  [
    ['a paragraph', 'hi', '<p>'],
    ['a link', '[hi](https://example.com)', '<a'],
    ['emphasis', '**b**', '<strong>'],
    ['a list', '- one', '<li>'],
    ['a heading', '# Title', '<h1'],
    ['a table', '| a |\n|---|\n| b |', '<td>'],
    ['a code block', '```\nx\n```', '<code>'],
    ['a local image', '![A diagram](diagram.png)', '<img'],
  ].forEach(([what, md, fragment]) => {
    it('keeps ' + what, () => {
      expect(renderMd(md)).toContain(fragment);
    });
  });

  it('keeps the text inside what it keeps', () => {
    expect(renderMd('hello **there**').trim()).toBe('<p>hello <strong>there</strong></p>');
  });

  it('keeps an external link clickable, with the opener sealed', () => {
    const html = renderMd('[x](https://example.com)');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('target="_blank"');
  });
});
