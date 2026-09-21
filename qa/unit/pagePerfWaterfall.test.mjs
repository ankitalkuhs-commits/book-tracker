// qa/unit/pagePerfWaterfall.test.mjs
// K-05 / section 6.1: the production release gate (parallel vs SERIAL) is itself untested code
// today, which is how the 2026-09-18 regression shipped unnoticed. W-4D-01..06 exercise
// qa/page_perf.mjs's three exported pure functions with no browser and no network:
//   isBlocked(errorText)       — matches Chromium's real abort text, not just the old literal
//   waterfallVerdict(calls)    — parallel / SERIAL / SERIAL (nav) / parallel (nav) / —
//   renderWaterfall(rows)      — the "## Waterfall (first visit)" Markdown section
// Run: node --test qa/unit/pagePerfWaterfall.test.mjs (or node --test qa/unit/)
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { isBlocked, waterfallVerdict, renderWaterfall } =
  await import(pathToFileURL(path.join(REPO, 'qa', 'page_perf.mjs')));

// W-4D-01: serial_home_2026_09_19 — ME 298-1833, the first own call (the 2026-09-19 report's
// /home) starts at 1917, after ME answered -> SERIAL.
test('W-4D-01 serial_home_2026_09_19: own call after ME.end -> SERIAL', () => {
  const calls = [
    { method: 'GET', path: '/profile/me', start: 298, end: 1833 },
    { method: 'GET', path: '/notes/feed', start: 1917, end: 2201 },
  ];
  assert.equal(waterfallVerdict(calls), 'SERIAL');
});

// W-4D-02: parallel_home — ME 300-1800, /notes/feed starts at 310 (well before ME answers) -> parallel.
test('W-4D-02 parallel_home: own call before ME.end -> parallel', () => {
  const calls = [
    { method: 'GET', path: '/profile/me', start: 300, end: 1800 },
    { method: 'GET', path: '/notes/feed', start: 310, end: 640 },
  ];
  assert.equal(waterfallVerdict(calls), 'parallel');
});

// W-4D-03: nav_fallback_search — no own call on this page (/search, /groups/new): fall back to
// the Nav's unread count. Early unread -> parallel (nav); late unread -> SERIAL (nav). Once a real
// page call exists (even a late one), the unread count is ignored entirely and the page call decides.
test('W-4D-03 nav_fallback_search: fallback to the unread count, ignored once a page call exists', () => {
  const earlyUnreadOnly = [
    { method: 'GET', path: '/profile/me', start: 300, end: 1800 },
    { method: 'GET', path: '/notifications/unread-count', start: 320, end: 480 },
  ];
  assert.equal(waterfallVerdict(earlyUnreadOnly), 'parallel (nav)');

  const lateUnreadOnly = [
    { method: 'GET', path: '/profile/me', start: 300, end: 1800 },
    { method: 'GET', path: '/notifications/unread-count', start: 1850, end: 2010 },
  ];
  assert.equal(waterfallVerdict(lateUnreadOnly), 'SERIAL (nav)');

  const pageCallPresent = [
    { method: 'GET', path: '/profile/me', start: 300, end: 1800 },
    { method: 'GET', path: '/notifications/unread-count', start: 320, end: 480 }, // early, but must be ignored
    { method: 'GET', path: '/search/results', start: 1900, end: 2050 }, // late page call decides
  ];
  assert.equal(waterfallVerdict(pageCallPresent), 'SERIAL');
});

// W-4D-04: blocked_post_counts_join — the corrected regex matches both spellings Chromium and the
// old literal use; a blocked write (status 'blocked') still counts as an own call for the verdict.
test('W-4D-04 blocked_post_counts_join: isBlocked matches Chromium\'s real text, and a blocked write counts', () => {
  assert.equal(isBlocked('net::ERR_BLOCKED_BY_CLIENT'), true);
  assert.equal(isBlocked('blockedbyclient'), true);
  assert.equal(isBlocked('net::ERR_FAILED'), false);

  const calls = [
    { method: 'GET', path: '/profile/me', start: 300, end: 1800 },
    { method: 'POST', path: '/groups/join/x', start: 330, end: 345, status: 'blocked' },
  ];
  assert.equal(waterfallVerdict(calls), 'parallel');
});

// W-4D-05: boundaries_and_no_me — only ME (no own calls, no unread count) -> —; no ME at all -> —;
// an own call starting exactly at ME.end is not < ME.end (strict), so it reads SERIAL, not parallel.
test('W-4D-05 boundaries_and_no_me: —, — and the strict "<" boundary', () => {
  assert.equal(waterfallVerdict([{ method: 'GET', path: '/profile/me', start: 0, end: 1000 }]), '—');
  assert.equal(waterfallVerdict([{ method: 'GET', path: '/notes/feed', start: 0, end: 100 }]), '—');
  assert.equal(waterfallVerdict([]), '—');
  const equalBoundary = [
    { method: 'GET', path: '/profile/me', start: 0, end: 1000 },
    { method: 'GET', path: '/notes/feed', start: 1000, end: 1200 },
  ];
  assert.equal(waterfallVerdict(equalBoundary), 'SERIAL');
});

// W-4D-06: render_has_section_rows_no_secrets — the Markdown has the heading, one row per input,
// and the /admin + /onboarding note; and never leaks a query string ("?") or an Authorization value.
test('W-4D-06 render_has_section_rows_no_secrets', () => {
  const rows = [
    { page: 'Home `/home`', profile: 'desktop', meStart: 298, meEnd: 1833, ownStart: 1917, verdict: 'SERIAL', meTotalMs: 210, meQueries: 5 },
    { page: 'Admin (non-admin user) `/admin`', profile: 'desktop', meStart: 300, meEnd: 1800, ownStart: null, verdict: 'SERIAL', meTotalMs: null, meQueries: null },
  ];
  const out = renderWaterfall(rows);
  assert.match(out, /## Waterfall \(first visit\)/);
  const dataRows = out.split('\n').filter(l => l.startsWith('| Home') || l.startsWith('| Admin'));
  assert.equal(dataRows.length, 2, `expected 2 data rows, got: ${JSON.stringify(dataRows)}`);
  assert.match(out, /\/admin/);
  assert.match(out, /\/onboarding/);
  assert.ok(!out.includes('?'), 'output must not contain a "?" (no query string leaked)');
  assert.ok(!out.includes('Bearer'), 'output must not contain "Bearer" (no Authorization value leaked)');
});
