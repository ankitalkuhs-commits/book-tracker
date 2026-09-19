// qa/unit/localDate.test.mjs
// Sprint 4C (F-62), Package WEB. W-01..W-11 from
// features/reading-stats/sprint-4c-local-day/tests.md section 3.1.
// Imports book-tracker-frontend-stitch/src/utils/localDate.js via pathToFileURL, like navigation.test.mjs.
// Run: node --test qa/unit/localDate.test.mjs (or node --test "qa/unit/*.test.mjs")
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const LOCAL_DATE_PATH = path.join(REPO, 'book-tracker-frontend-stitch', 'src', 'utils', 'localDate.js');
const API_JS_PATH = path.join(REPO, 'book-tracker-frontend-stitch', 'src', 'services', 'api.js');
const PRIVACY_PAGE_PATH = path.join(REPO, 'book-tracker-frontend-stitch', 'src', 'pages', 'PrivacyPage.jsx');
const INSIGHTS_PAGE_PATH = path.join(REPO, 'book-tracker-frontend-stitch', 'src', 'pages', 'InsightsPage.jsx');

const { deviceTimeZone, parseDayLabel } = await import(pathToFileURL(LOCAL_DATE_PATH));

// Import guard (per tests.md "the file starts with an import guard").
assert.equal(typeof parseDayLabel, 'function');
assert.equal(typeof deviceTimeZone, 'function');

function withTz(zone, fn) {
  const saved = process.env.TZ;
  try {
    process.env.TZ = zone;
    return fn();
  } finally {
    if (saved === undefined) delete process.env.TZ;
    else process.env.TZ = saved;
  }
}

// ---------------------------------------------------------------------------
// W-01
// ---------------------------------------------------------------------------
test('device_zone_is_a_string_under_node', () => {
  const z = deviceTimeZone();
  assert.equal(typeof z, 'string');
  assert.ok(z.length >= 1 && z.length <= 64, `zone length ${z.length} out of range`);
});

// ---------------------------------------------------------------------------
// W-02
// ---------------------------------------------------------------------------
test('device_zone_null_for_bad_intl', () => {
  const stubReturning = (timeZone) => ({ DateTimeFormat: () => ({ resolvedOptions: () => ({ timeZone }) }) });
  assert.equal(deviceTimeZone(stubReturning(undefined)), null);
  assert.equal(deviceTimeZone(stubReturning('')), null);
  assert.equal(deviceTimeZone(stubReturning('A'.repeat(65))), null);
  const throwing = { DateTimeFormat: () => ({ resolvedOptions: () => { throw new Error('boom'); } }) };
  assert.equal(deviceTimeZone(throwing), null);
  // Control: a valid stub must NOT be swallowed by the same code path.
  assert.equal(deviceTimeZone(stubReturning('Asia/Tokyo')), 'Asia/Tokyo');
});

// ---------------------------------------------------------------------------
// W-03 — Critical: proves the TZ injection actually took effect before trusting the fix.
// ---------------------------------------------------------------------------
test('parse_day_label_is_local_west_of_utc', () => {
  withTz('America/Los_Angeles', () => {
    // Control: the bug this fix removes must reproduce under this injection, or the test proves nothing.
    assert.equal(new Date('2026-10-03').getDate(), 2, 'TZ injection did not take effect');
    const d = parseDayLabel('2026-10-03');
    assert.equal(d.getFullYear(), 2026);
    assert.equal(d.getMonth(), 9);
    assert.equal(d.getDate(), 3);
    assert.equal(d.getHours(), 0);
  });
});

// ---------------------------------------------------------------------------
// W-04
// ---------------------------------------------------------------------------
test('parse_month_label_is_first_of_month_local', () => {
  withTz('America/Los_Angeles', () => {
    assert.equal(new Date('2026-10').getMonth(), 8, 'TZ injection did not take effect');
    const d = parseDayLabel('2026-10');
    assert.equal(d.getFullYear(), 2026);
    assert.equal(d.getMonth(), 9);
    assert.equal(d.getDate(), 1);
    assert.equal(d.getHours(), 0);
  });
});

// ---------------------------------------------------------------------------
// W-05
// ---------------------------------------------------------------------------
test('parse_day_label_rejects_bad_input', () => {
  for (const bad of [null, undefined, 20261003, '', '2026-1-3', '2026-10-03T00:00:00Z', '03/10/2026', ' 2026-10-03']) {
    assert.equal(parseDayLabel(bad), null, `expected null for ${JSON.stringify(bad)}`);
  }
});

// ---------------------------------------------------------------------------
// W-06
// ---------------------------------------------------------------------------
test('api_fetch_raw_sends_x_timezone_per_request', () => {
  const src = fs.readFileSync(API_JS_PATH, 'utf8');
  const start = src.indexOf('async function apiFetchRaw');
  assert.ok(start >= 0, 'apiFetchRaw not found');
  const closeMatch = /\r?\n\}\r?\n/.exec(src.slice(start));
  assert.ok(closeMatch, 'apiFetchRaw closing brace not found');
  const closeIdx = start + closeMatch.index;
  const slice = src.slice(start, closeIdx);
  assert.ok(slice.length > 200, 'apiFetchRaw not found (slice too short)');
  assert.ok(slice.includes('deviceTimeZone()'), 'apiFetchRaw does not call deviceTimeZone()');
  assert.ok(slice.includes("'X-Timezone'"), "apiFetchRaw does not set 'X-Timezone'");
  assert.ok(src.includes("import { deviceTimeZone } from '../utils/localDate'"), 'localDate import missing');
  const outside = src.slice(0, start) + src.slice(closeIdx);
  assert.ok(!outside.includes('deviceTimeZone('), 'deviceTimeZone() is called outside apiFetchRaw');
});

// ---------------------------------------------------------------------------
// W-07
// ---------------------------------------------------------------------------
test('device_zone_nepal_and_legacy_ids', () => {
  withTz('Asia/Kathmandu', () => {
    assert.notEqual(new Date(0).getTimezoneOffset(), 0, 'TZ injection did not take effect');
    const z = deviceTimeZone();
    assert.ok(['Asia/Kathmandu', 'Asia/Katmandu'].includes(z), `got ${z}`);
  });
  withTz('Asia/Kolkata', () => {
    const z = deviceTimeZone();
    assert.ok(['Asia/Kolkata', 'Asia/Calcutta'].includes(z), `got ${z}`);
  });
});

// ---------------------------------------------------------------------------
// W-08
// ---------------------------------------------------------------------------
test('device_zone_read_at_call_time', () => {
  const savedIntl = globalThis.Intl;
  try {
    const stub = (timeZone) => ({ DateTimeFormat: () => ({ resolvedOptions: () => ({ timeZone }) }) });
    globalThis.Intl = stub('Europe/London');
    const first = deviceTimeZone();
    globalThis.Intl = stub('Asia/Tokyo');
    const second = deviceTimeZone();
    assert.notEqual(first, second, 'zone appears cached at module load');
    assert.equal(first, 'Europe/London');
    assert.equal(second, 'Asia/Tokyo');
  } finally {
    globalThis.Intl = savedIntl;
  }
});

// ---------------------------------------------------------------------------
// W-09 (K-07)
// ---------------------------------------------------------------------------
test('raw_fetch_sites_are_exactly_three', () => {
  const src = fs.readFileSync(API_JS_PATH, 'utf8');
  const count = (src.match(/\bfetch\(/g) || []).length;
  assert.equal(count, 4, `expected exactly 4 fetch( calls (apiFetchRaw + 3 raw uploads/import), found ${count}`);
});

// ---------------------------------------------------------------------------
// W-10 (E-4)
// ---------------------------------------------------------------------------
test('privacy_page_states_zone_sentence', () => {
  const src = fs.readFileSync(PRIVACY_PAGE_PATH, 'utf8');
  const normalised = src.replace(/\s+/g, ' ');
  const sentence = "We store your device's time zone to work out your reading days and when to send reminders.";
  const count = normalised.split(sentence).length - 1;
  assert.equal(count, 1, `expected the E-4 sentence exactly once, found ${count}`);
});

// ---------------------------------------------------------------------------
// W-11
// ---------------------------------------------------------------------------
test('insights_page_parses_projected_finish_locally', () => {
  const src = fs.readFileSync(INSIGHTS_PAGE_PATH, 'utf8');
  assert.ok(src.includes("import { parseDayLabel } from '../utils/localDate'"), 'parseDayLabel import missing');
  assert.ok(src.includes('projected_finish'), 'file does not reference projected_finish — read the wrong file?');
  assert.ok(src.includes('parseDayLabel(p.projected_finish)'), 'InsightsPage does not call parseDayLabel(p.projected_finish)');
  assert.ok(!src.includes('new Date(p.projected_finish'), 'InsightsPage still calls new Date(p.projected_finish...)');
});
