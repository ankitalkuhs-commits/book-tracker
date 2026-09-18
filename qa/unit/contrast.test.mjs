// qa/unit/contrast.test.mjs
// ST-C-06: a pure-Node WCAG 2.1 relative-luminance / contrast-ratio computation over the two new
// F-10 tokens (tailwind.config.js: on-surface-muted #586060, on-surface-faint #636a6a) against the
// five surface backgrounds, reproducing the architecture's table to 2 decimals, plus the guard case
// the brief calls out (on-surface-faint on #e4e2dd falls under 4.5) and a grep that no text node
// pairs on-surface-faint with a background it fails against.
// Run: node --test qa/unit/contrast.test.mjs (or node --test qa/unit/)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FRONTEND_SRC = path.join(REPO, 'book-tracker-frontend-stitch', 'src');
const TAILWIND_CONFIG = path.join(REPO, 'book-tracker-frontend-stitch', 'tailwind.config.js');

function relativeLuminance(hex) {
  hex = hex.replace('#', '');
  const [r, g, b] = [hex.slice(0, 2), hex.slice(2, 4), hex.slice(4, 6)].map(h => parseInt(h, 16) / 255);
  const f = c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrastRatio(hexA, hexB) {
  const la = relativeLuminance(hexA), lb = relativeLuminance(hexB);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

const ON_SURFACE_MUTED = '#586060';
const ON_SURFACE_FAINT = '#636a6a';
const BACKGROUNDS = ['#ffffff', '#fbf9f4', '#f5f3ee', '#f0eee9', '#eae8e3'];
const EXPECTED_MUTED = [6.45, 6.13, 5.81, 5.56, 5.27];
const EXPECTED_FAINT = [5.53, 5.25, 4.98, 4.77, 4.51];

test('tailwind.config.js has the exact approved hexes', () => {
  const src = fs.readFileSync(TAILWIND_CONFIG, 'utf8');
  assert.match(src, /"on-surface-muted":\s*"#586060"/);
  assert.match(src, /"on-surface-faint":\s*"#636a6a"/);
});

test('on-surface-muted contrast ratios match the architecture table to 2 decimals, all >= 4.5', () => {
  BACKGROUNDS.forEach((bg, i) => {
    const ratio = contrastRatio(ON_SURFACE_MUTED, bg);
    assert.equal(ratio.toFixed(2), EXPECTED_MUTED[i].toFixed(2), `muted vs ${bg}`);
    assert.ok(ratio >= 4.5, `muted vs ${bg} = ${ratio} is below 4.5`);
  });
});

test('on-surface-faint contrast ratios match the architecture table to 2 decimals, all >= 4.5', () => {
  BACKGROUNDS.forEach((bg, i) => {
    const ratio = contrastRatio(ON_SURFACE_FAINT, bg);
    assert.equal(ratio.toFixed(2), EXPECTED_FAINT[i].toFixed(2), `faint vs ${bg}`);
    assert.ok(ratio >= 4.5, `faint vs ${bg} = ${ratio} is below 4.5`);
  });
});

test('guard: on-surface-faint on #e4e2dd falls under 4.5 (~4.3) — that background must never be paired with it', () => {
  const ratio = contrastRatio(ON_SURFACE_FAINT, '#e4e2dd');
  assert.ok(ratio < 4.5, `expected < 4.5, got ${ratio}`);
  assert.equal(ratio.toFixed(1), '4.3');
});

test('no source line pairs text-on-surface-faint with bg-surface-container-highest or bg-surface-variant', () => {
  const offenders = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (/\.(jsx?|tsx?)$/.test(entry.name)) {
        const lines = fs.readFileSync(p, 'utf8').split('\n');
        lines.forEach((line, i) => {
          if (line.includes('text-on-surface-faint') && (line.includes('bg-surface-container-highest') || line.includes('bg-surface-variant'))) {
            offenders.push(`${path.relative(REPO, p)}:${i + 1}`);
          }
        });
      }
    }
  };
  walk(FRONTEND_SRC);
  assert.deepEqual(offenders, []);
});
