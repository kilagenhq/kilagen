/* Contrast, measured rather than asserted.
 *
 * axe cannot judge colour in jsdom — it has no layout, so it cannot tell what
 * sits on what. The palette can be checked directly, and that is the half that
 * actually drifts: a token changes, and the theme nobody uses daily is the one
 * that goes under 4.5:1.
 *
 * WCAG 2.1 AA: 4.5:1 for body text, 3:1 for large text and for the boundary of
 * a user interface component.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/* Vitest runs from the dashboard root, and under jsdom import.meta.url is not
   a file URL. */
const CSS = readFileSync(resolve(process.cwd(), 'app.css'), 'utf8');

function tokens(selector) {
  const block = CSS.slice(CSS.indexOf(selector + ' {'));
  const body = block.slice(0, block.indexOf('}'));
  const found = {};
  body.replace(/(--[a-z0-9-]+):\s*([^;]+);/g, (_, key, value) => { found[key] = value.trim(); });
  return found;
}

/* The internal tokens point at the nine public ones, so a value has to be
   followed before it can be measured. One hop is all the palette uses, and
   more would be a palette nobody can read. */
function follow(palette) {
  const flat = {};
  Object.keys(palette).forEach((key) => {
    const value = palette[key];
    const ref = /^var\((--[a-z0-9-]+)\)$/.exec(value.trim());
    flat[key] = ref ? (palette[ref[1]] || value) : value;
  });
  return flat;
}

const LIGHT = follow(tokens(':root'));
const DARK = follow({ ...tokens(':root'), ...tokens(':root.dark') });

function channel(value) {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminance(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`not a hex colour: ${hex}`);
  const n = parseInt(m[1], 16);
  return 0.2126 * channel((n >> 16) & 255)
    + 0.7152 * channel((n >> 8) & 255)
    + 0.0722 * channel(n & 255);
}

function ratio(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/* Text tokens, on each of the two surfaces they are drawn on. `--fg3` is in
   here rather than with the chrome because it carries real prose — section
   notes, the audit caveat — and 4.5:1 is what prose owes a reader. */
const TEXT = ['--fg', '--fg2', '--fg3', '--accent'];
const SURFACES = ['--bg', '--bg2'];

/* Drawn small but never as prose: badges, pills, axis labels. AA asks 3:1 of
   a component boundary, and these carry a word next to a number that repeats
   the same fact. */
const UI = ['--sev-critical', '--sev-high', '--sev-medium', '--sev-low',
            '--cov-partial', '--cov-missing', '--cov-deprecated'];

describe.each([['light', LIGHT], ['dark', DARK]])('%s theme', (name, palette) => {
  it('reads every token it needs', () => {
    [...TEXT, ...UI, ...SURFACES].forEach((token) => {
      expect(palette[token], `${name}: ${token}`).toBeDefined();
    });
  });

  TEXT.forEach((token) => {
    SURFACES.forEach((surface) => {
      it(`${token} on ${surface} meets 4.5:1`, () => {
        const measured = ratio(palette[token], palette[surface]);
        expect(measured, `${measured.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
      });
    });
  });

  UI.forEach((token) => {
    it(`${token} meets 3:1 against both surfaces`, () => {
      SURFACES.forEach((surface) => {
        const measured = ratio(palette[token], palette[surface]);
        expect(measured, `${token} on ${surface}: ${measured.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);
      });
    });
  });
});
