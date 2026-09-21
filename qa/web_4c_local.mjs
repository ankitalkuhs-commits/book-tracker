// qa/web_4c_local.mjs
// Sprint 4C (F-62) local web test harness. Implements the 5 `L-4C-` cases from
// features/reading-stats/sprint-4c-local-day/tests.md section 3.2 (L-4C-01..05).
//
// Deviation from the tests.md sketch (recorded in build-notes-4c-web.md, "Diverged From Brief"):
// this worktree has no live 4C backend (the API package is a separate Builder package, built in
// parallel — see architecture.md "Execution Plan — three Builder packages, disjoint file sets").
// The task brief's "Environment for the harness" note explicitly allows this: "stub API responses
// with page.route". So every request to --api is intercepted in-process; nothing is sent over the
// network. A single in-memory `storedZone` variable simulates the server's persisted `user.timezone`
// column (architecture D-1: "a valid header is persisted first, then used"), which is enough to
// prove the WEB CLIENT's own contract (every apiFetch request carries X-Timezone; a raw fetch
// without the header reads back whatever zone was last persisted) without needing app/localday.py.
//
// Never production (K-21 of 4A, restated for 4C): refuses --web / --api pointing at
// trackmyread.com or onrender.com.
// Precondition (this harness's own, since there is no real API to review-login against): the web
// dev server is up and its served src/services/api.js references --api (proves --mode localapi).
//
// Usage (from repo root; qa/node_modules has playwright already installed via `npm ci` in qa/):
//   npm --prefix book-tracker-frontend-stitch run dev -- --mode localapi --port 5275   (separate shell)
//   node qa/web_4c_local.mjs --web http://127.0.0.1:5275 --api http://127.0.0.1:8865
//
// Output: one line per case, "PASS <id> <title>" or "FAIL <id> <title> — <first failing detail>",
//         then "4C web local: <n> passed, <m> failed".
// Exit: 0 all ran cases passed; 1 some FAILED; 5 a production host was passed; 6 a precondition is missing.
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const WEB = arg('web', 'http://127.0.0.1:5275').replace(/\/$/, '');
const API = arg('api', 'http://127.0.0.1:8865').replace(/\/$/, '');
const ONLY = arg('only', null)?.split(',').map(s => s.trim()).filter(Boolean) || null;
const FAKE_TOKEN = 'qa-4c-fake-token';

// ---------- never production ----------
for (const [name, url] of [['--web', WEB], ['--api', API]]) {
  if (/trackmyread\.com|onrender\.com/i.test(url)) {
    console.error(`refusing to run: ${name}=${url} looks like a production host (qa/RULES_OF_ENGAGEMENT.md)`);
    process.exit(5);
  }
}

// ---------- precondition (exit 6 with the missing thing named) ----------
async function checkPreconditions() {
  const missing = [];
  const apiJsText = await fetch(`${WEB}/src/services/api.js`).then(r => r.ok ? r.text() : '').catch(() => '');
  if (!apiJsText) {
    missing.push(`GET ${WEB}/src/services/api.js did not respond — is the web dev server running (npm --prefix book-tracker-frontend-stitch run dev -- --mode localapi --port <port>)?`);
  } else if (!apiJsText.includes(API)) {
    missing.push(`served src/services/api.js does not reference ${API} (VITE_API_BASE_URL) — start it with --mode localapi against an .env.localapi that sets VITE_API_BASE_URL=${API}, or pass --api to match`);
  }
  return { missing };
}

// ---------- reporting ----------
let passed = 0, failed = 0;
function report(id, title, ok, detail) {
  if (ok) { console.log(`PASS ${id} ${title}`); passed++; }
  else { console.log(`FAIL ${id} ${title} — ${String(detail).split('\n')[0].slice(0, 300)}`); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

// ---------- shared page/browser helpers ----------
let browser;
async function withPage(fn, ctxOpts = {}) {
  const context = await browser.newContext(ctxOpts);
  const page = await context.newPage();
  try { return await fn(page, context); }
  finally { await context.close(); }
}
async function seedToken(context) {
  await context.addInitScript(t => {
    localStorage.setItem('bt_token', t);
    localStorage.setItem('bt_onboarding_v1', 'done');
  }, FAKE_TOKEN);
}

// A single in-process mock standing in for the (not-yet-built) 4C backend. `storedZone` simulates
// the server's persisted user.timezone column: any request carrying a valid-looking X-Timezone
// updates it (D-1 "persisted first, then used"); GET /profile/me reads it back.
function makeMockApi() {
  let storedZone = null;
  const seen = [];
  const handler = async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    const headers = req.headers();
    if (method === 'OPTIONS') {
      const reqHeaders = headers['access-control-request-headers'] || '*';
      return route.fulfill({
        status: 200,
        headers: {
          'access-control-allow-origin': headers['origin'] || '*',
          'access-control-allow-methods': '*',
          'access-control-allow-headers': reqHeaders,
          'access-control-allow-credentials': 'true',
        },
        body: '',
      });
    }
    seen.push({ method, path: url.pathname, headers });
    if (headers['x-timezone']) storedZone = headers['x-timezone'];
    if (url.pathname === '/profile/me' && method === 'GET') {
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ id: 1, name: 'QA Reader', username: 'qa_reader', timezone: storedZone }),
      });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  };
  return { handler, seen, get storedZone() { return storedZone; } };
}

const FIXTURE_INSIGHTS = {
  total_books: 1, total_finished: 0, total_pages_read: 100, avg_rating: null,
  avg_pages_per_day: 5, finished_this_year: 0, total_reading: 1,
  current_streak: 0, longest_streak: 0, yearly_goal: null,
  monthly_pages: [{ month: '2026-09', pages_read: 50 }, { month: '2026-10', pages_read: 20 }],
  projected_finishes: [{
    userbook_id: 1, title: 'QA 4C Projected Book', cover_url: null,
    current_page: 100, total_pages: 300, pct: 33,
    projected_finish: '2026-10-03', days_left: 14,
  }],
};

// Cross-origin (different port) responses need CORS headers or the browser blocks them outright,
// same as production's CORSMiddleware(allow_headers=["*"]) (architecture "depends_on").
function corsFulfill(route, opts) {
  const origin = route.request().headers()['origin'] || '*';
  return route.fulfill({ ...opts, headers: { 'access-control-allow-origin': origin, ...(opts.headers || {}) } });
}
function corsPreflight(route) {
  const headers = route.request().headers();
  return route.fulfill({
    status: 200,
    headers: {
      'access-control-allow-origin': headers['origin'] || '*',
      'access-control-allow-methods': '*',
      'access-control-allow-headers': headers['access-control-request-headers'] || '*',
      'access-control-allow-credentials': 'true',
    },
    body: '',
  });
}

async function withInsightsFixture(page) {
  // Registered in reverse-precedence order: Playwright checks the LAST-registered route first, so
  // the catch-all (registered first) yields to these two overrides.
  await page.route(u => u.href.startsWith(API), route => {
    if (route.request().method() === 'OPTIONS') return corsPreflight(route);
    return corsFulfill(route, { status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.route(u => u.href.startsWith(API) && new URL(u).pathname === '/profile/me', route => {
    if (route.request().method() === 'OPTIONS') return corsPreflight(route);
    return corsFulfill(route, { status: 200, contentType: 'application/json', body: JSON.stringify({ id: 1, name: 'QA Reader' }) });
  });
  await page.route(u => u.href.startsWith(API) && new URL(u).pathname === '/reading-activity/insights', route => {
    if (route.request().method() === 'OPTIONS') return corsPreflight(route);
    return corsFulfill(route, { status: 200, contentType: 'application/json', body: JSON.stringify(FIXTURE_INSIGHTS) });
  });
}

// ============================================================================================
// L-4C cases
// ============================================================================================

async function L_4C_01() {
  const mock = makeMockApi();
  const failedRequests = [];
  const corsErrors = [];
  await withPage(async (page, context) => {
    await page.route(u => u.href.startsWith(API), mock.handler);
    await seedToken(context);
    page.on('requestfailed', r => failedRequests.push(r.url()));
    page.on('console', m => { if (m.type() === 'error' && /cors/i.test(m.text())) corsErrors.push(m.text()); });
    for (const route of ['/home', '/library', '/insights', '/profile']) {
      await page.goto(WEB + route, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1200);
    }
  }, { timezoneId: 'America/Los_Angeles' });

  const nonOptions = mock.seen;
  assert(nonOptions.length >= 8, `expected >= 8 non-OPTIONS requests to the API, saw ${nonOptions.length}`);
  const wrong = nonOptions.filter(r => r.headers['x-timezone'] !== 'America/Los_Angeles');
  assert(wrong.length === 0,
    `${wrong.length}/${nonOptions.length} request(s) missing or wrong x-timezone (e.g. ${wrong[0]?.method} ${wrong[0]?.path} -> "${wrong[0]?.headers['x-timezone']}")`);
  assert(failedRequests.length === 0, `requestfailed fired for: ${failedRequests.join(', ')}`);
  assert(corsErrors.length === 0, `CORS console error: ${corsErrors[0]}`);
}

async function L_4C_02() {
  const mock = makeMockApi();

  await withPage(async (page, context) => {
    await page.route(u => u.href.startsWith(API), mock.handler);
    await seedToken(context);
    await page.goto(WEB + '/home', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    assert(mock.storedZone === 'America/Los_Angeles', `arrange: stored zone after LA visit was "${mock.storedZone}"`);
    // A raw fetch with no X-Timezone header (still intercepted by the same page.route inside this
    // context) must read back the persisted zone, not the fallback or the absent one.
    const first = await page.evaluate(async ({ api, token }) => {
      const r = await fetch(api + '/profile/me', { headers: { Authorization: `Bearer ${token}` } });
      return (await r.json()).timezone;
    }, { api: API, token: FAKE_TOKEN });
    assert(first === 'America/Los_Angeles', `no-header /profile/me returned "${first}", expected the persisted America/Los_Angeles`);
  }, { timezoneId: 'America/Los_Angeles' });

  await withPage(async (page, context) => {
    await page.route(u => u.href.startsWith(API), mock.handler);
    await seedToken(context);
    await page.goto(WEB + '/home', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    const second = await page.evaluate(async ({ api, token }) => {
      const r = await fetch(api + '/profile/me', { headers: { Authorization: `Bearer ${token}` } });
      return (await r.json()).timezone;
    }, { api: API, token: FAKE_TOKEN });
    assert(['Asia/Kolkata', 'Asia/Calcutta'].includes(second), `expected an India zone after switching the browser to Asia/Kolkata, got "${second}" (K-06)`);
  }, { timezoneId: 'Asia/Kolkata' });
}

async function L_4C_03() {
  await withPage(async (page, context) => {
    await seedToken(context);
    await withInsightsFixture(page);
    const controlDate = await page.evaluate(() => new Date('2026-10-03').getDate());
    assert(controlDate === 2, `control failed: new Date('2026-10-03').getDate() was ${controlDate}, expected 2 (else the bug this fix removes cannot be observed)`);
    const controlTz = await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
    assert(controlTz === 'America/Los_Angeles', `control failed: Intl reports "${controlTz}", the timezoneId did not take effect`);

    await page.goto(WEB + '/insights', { waitUntil: 'domcontentloaded' });
    await page.getByText('QA 4C Projected Book').waitFor({ timeout: 15000 });
    // Scoped to <main>, not document.body: the fixed <nav> occasionally makes Chromium's
    // body.innerText computation collapse to just the nav's own text (observed empirically —
    // <main>'s own innerText is unaffected and is the actual page content anyway).
    const text = await page.evaluate(() => document.querySelector('main')?.innerText || '');
    // Locale-agnostic: don't assume word order ("Oct 3" vs "3 Oct") — compute what the browser's own
    // 'default' locale renders for the right day (Oct 3) and the wrong one (Oct 2, the bug this fix
    // removes), then check which one actually appears.
    const [right, wrong] = await page.evaluate(() => [
      new Date(2026, 9, 3).toLocaleDateString('default', { month: 'short', day: 'numeric' }),
      new Date(2026, 9, 2).toLocaleDateString('default', { month: 'short', day: 'numeric' }),
    ]);
    assert(text.includes(right), `expected the projected-finish date to show "${right}" (Oct 3), body text: ${text.slice(0, 400)}`);
    assert(!text.includes(wrong), `the projected-finish date shows "${wrong}" (Oct 2) — off by one day west of UTC`);
    assert(text.includes('Oct'), 'the monthly-chart month label "Oct" is missing');
  }, { timezoneId: 'America/Los_Angeles' });
}

async function L_4C_04() {
  await withPage(async (page, context) => {
    await seedToken(context);
    await withInsightsFixture(page);
    const controlDate = await page.evaluate(() => new Date('2026-10-03').getDate());
    assert(controlDate === 3, `control failed: expected 3 east of UTC, got ${controlDate}`);

    await page.goto(WEB + '/insights', { waitUntil: 'domcontentloaded' });
    await page.getByText('QA 4C Projected Book').waitFor({ timeout: 15000 });
    const text = await page.evaluate(() => document.querySelector('main')?.innerText || '');
    const right = await page.evaluate(() => new Date(2026, 9, 3).toLocaleDateString('default', { month: 'short', day: 'numeric' }));
    assert(text.includes(right), `expected "${right}" (Oct 3) east of UTC too, body text: ${text.slice(0, 400)}`);
  }, { timezoneId: 'Asia/Kathmandu' });
}

async function L_4C_05() {
  await withPage(async page => {
    await page.goto(WEB + '/privacy', { waitUntil: 'domcontentloaded' });
    await page.getByText('Privacy Policy').waitFor({ timeout: 15000 });
    const text = await page.evaluate(() => document.querySelector('main')?.innerText || '');
    const sentence = "We store your device's time zone to work out your reading days and when to send reminders.";
    const count = text.split(sentence).length - 1;
    assert(count === 1, `expected the E-4 sentence exactly once on /privacy, found ${count}`);
  });
}

// ============================================================================================
// main
// ============================================================================================
async function main() {
  const pre = await checkPreconditions();
  if (pre.missing.length) {
    console.error('Precondition(s) not met:');
    for (const m of pre.missing) console.error(`  - ${m}`);
    process.exit(6);
  }

  browser = await chromium.launch();

  const CASES = [
    ['L-4C-01', 'every app request carries the device zone', L_4C_01],
    ['L-4C-02', 'the stored zone follows the browser', L_4C_02],
    ['L-4C-03', 'Insights dates are calendar days west of UTC', L_4C_03],
    ['L-4C-04', 'the same east of UTC', L_4C_04],
    ['L-4C-05', 'the Privacy sentence renders', L_4C_05],
  ];

  for (const [id, title, fn] of CASES) {
    if (ONLY && !ONLY.includes(id)) continue;
    try { await fn(); report(id, title, true); }
    catch (e) { report(id, title, false, e?.message || String(e)); }
  }

  await browser.close();
  console.log(`4C web local: ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}

main().catch(e => { console.error(e.stack || e.message); process.exit(1); });
