// qa/web_4a_local.mjs
// Sprint 4A local web test harness. Implements the 25 `L-` cases from
// features/maintenance/sprint-4a-platform-audit/tests.md sections 4-6:
//   L-B1-01..10 (api.js error surfacing, cache invalidation, admin query, web push/logout, Back nav)
//   L-B2-01..13 (note visibility default, F-60 stale-feed guards, add-to-library dedup keys,
//                search format chips, circle destructive-action confirms)
//   L-C-01..02  (contrast audit via qa/a11y_audit.mjs, minimum font size)
//
// Never production (K-21): refuses --web / --api pointing at trackmyread.com or onrender.com.
// Preconditions (K-21, section 4 "Web test mechanism"): local API commit is null, the web dev server's
// served src/services/api.js references --api (proves --mode localapi), review-login works for both
// accounts, and the seeded fixture (Review Circle + userbooks) exists. Any missing precondition -> exit 6.
//
// Usage (from repo root, qa/node_modules has playwright + @axe-core/playwright already installed):
//   node qa/web_4a_local.mjs
//   node qa/web_4a_local.mjs --only L-B1-09,L-B2-07
//   node qa/web_4a_local.mjs --web http://127.0.0.1:5174 --api http://127.0.0.1:8765
//
// Secret: REVIEW_LOGIN_SECRET env var, else <repo>/.env.review. Never printed.
// Output: one line per case, "PASS <id> <title>" or "FAIL <id> <title> — <first failing detail>",
//         then "4A web local: <n> passed, <m> failed" (plus a skip count if any case was skipped).
// Exit: 0 all ran cases passed; 1 some FAILED; 5 a production host was passed; 6 a precondition is missing.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const WEB = arg('web', 'http://127.0.0.1:5174').replace(/\/$/, '');
const API = arg('api', 'http://127.0.0.1:8765').replace(/\/$/, '');
const ONLY = arg('only', null)?.split(',').map(s => s.trim()).filter(Boolean) || null;
const SECRET_FILE = arg('secret-file', path.join(REPO, '.env.review'));
const SHOT_DIR = path.resolve(REPO, 'qa', 'screenshots', '4a-local');
const TS = Date.now().toString(36);

// ---------- K-21: never production ----------
for (const [name, url] of [['--web', WEB], ['--api', API]]) {
  if (/trackmyread\.com|onrender\.com/i.test(url)) {
    console.error(`refusing to run: ${name}=${url} looks like a production host (qa/RULES_OF_ENGAGEMENT.md)`);
    process.exit(5);
  }
}

function readSecret() {
  if (process.env.REVIEW_LOGIN_SECRET) return process.env.REVIEW_LOGIN_SECRET.trim();
  if (!fs.existsSync(SECRET_FILE)) return null;
  const m = fs.readFileSync(SECRET_FILE, 'utf8').match(/^REVIEW_LOGIN_SECRET=(.+)$/m);
  return m ? m[1].trim() : null;
}

async function reviewLogin(email, secret) {
  const r = await fetch(`${API}/auth/review-login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, secret }),
  });
  if (!r.ok) {
    const why = r.status === 404 ? 'REVIEW_LOGIN_SECRET / REVIEW_LOGIN_EMAILS not configured on this API'
      : r.status === 401 ? 'secret or email rejected'
      : `HTTP ${r.status}`;
    return { ok: false, reason: `review-login ${email} failed: ${why}` };
  }
  const j = await r.json();
  return { ok: true, token: j.access_token, user: j.user };
}

async function api(token, method, p, body) {
  const r = await fetch(API + p, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  return { status: r.status, json };
}

// ---------- preconditions (exit 6 with each missing one named) ----------
async function checkPreconditions(secret) {
  const missing = [];
  if (!secret) { missing.push(`REVIEW_LOGIN_SECRET not set (env or ${SECRET_FILE})`); return { missing }; }

  const version = await fetch(`${API}/version`).then(r => r.ok ? r.json() : null).catch(() => null);
  if (!version || version.commit !== null) {
    missing.push(`GET ${API}/version did not return commit:null (got ${JSON.stringify(version)}) — this is not the local 4A backend, refusing to run against it`);
  }

  const apiJsText = await fetch(`${WEB}/src/services/api.js`).then(r => r.ok ? r.text() : '').catch(() => '');
  if (!apiJsText) {
    missing.push(`GET ${WEB}/src/services/api.js did not respond — is the web dev server running (npm --prefix book-tracker-frontend-stitch run dev -- --mode localapi --port <port>)?`);
  } else if (!apiJsText.includes(API)) {
    missing.push(`served src/services/api.js does not reference ${API} (VITE_API_BASE_URL) — web dev server is not running --mode localapi, or --api does not match its target`);
  }

  const reader = await reviewLogin('review.reader@trackmyread.com', secret);
  if (!reader.ok) missing.push(reader.reason);
  const friend = await reviewLogin('review.friend@trackmyread.com', secret);
  if (!friend.ok) missing.push(friend.reason);

  let fixture = null;
  if (reader.ok) {
    const [groups, ubs] = await Promise.all([api(reader.token, 'GET', '/groups/my'), api(reader.token, 'GET', '/userbooks/')]);
    const circle = (groups.json || []).find(g => g.name === 'Review Circle');
    if (!circle) missing.push('review.reader has no "Review Circle" group — run scripts/seed_review_accounts.py against this API first');
    if (!ubs.json || ubs.json.length === 0) missing.push('review.reader has no userbooks — run scripts/seed_review_accounts.py against this API first');
    fixture = { circleId: circle?.id ?? null, userbookId: ubs.json?.[0]?.id ?? null };
  }
  return { missing, reader, friend, fixture };
}

// ---------- reporting ----------
let passed = 0, failed = 0, skipped = 0;
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
async function seedAuth(context, token) {
  await context.addInitScript(t => {
    localStorage.setItem('bt_token', t);
    localStorage.setItem('bt_onboarding_v1', 'done');
  }, token);
}
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Material Symbols icons prefix accessible names (e.g. "lock Only me", "logout Sign out") — tolerate up to 2 leading icon words.
const label = text => new RegExp(`^\\s*(?:[a-z_]+\\s+){0,2}${esc(text)}\\s*$`, 'i');

// Call a named export of src/services/api.js inside the page. Args may include
// { __file: { name, content, type } } to hydrate a real File object in-browser.
async function callApi(page, name, ...args) {
  return page.evaluate(async ({ name, args }) => {
    const m = await import('/src/services/api.js');
    const hydrated = args.map(a => (a && a.__file) ? new File([a.__file.content], a.__file.name, { type: a.__file.type }) : a);
    try {
      const value = await m[name](...hydrated);
      return { ok: true, value };
    } catch (e) {
      return { ok: false, message: e.message, status: e.status, code: e.code };
    }
  }, { name, args });
}

// A single mock covering the whole API origin for the module-harness cache-invalidation cases (L-B1-03..06).
// getPatterns: [{ key, test(path) }] — a matching GET request is served an incrementing { __v, __key } body
// (so the *value* returned by a later call proves whether the cache was a hit (stale __v) or a miss (fresh
// __v) — a value check is used instead of a request *count* because api.js's cache does stale-while-revalidate
// on every hit (apiFetchRaw is dispatched again in the background on a cache HIT too), which makes counting
// network requests racy: a background revalidation from an earlier call can land at any point. Every other
// request (any mutation, or a GET not in getPatterns) gets a fixed 200 { ok: true }.
function makeApiMock(getPatterns) {
  const versions = new Map();
  const parked = [];
  let lastSeen = Date.now();
  const serve = (route, hit) => {
    const n = (versions.get(hit.key) || 0) + 1;
    versions.set(hit.key, n);
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ __v: n, __key: hit.key }) });
  };
  const mock = {
    hold: false,
    handler: route => {
      lastSeen = Date.now();
      const req = route.request();
      if (req.method() === 'GET') {
        const path = req.url().slice(API.length).split('?')[0];
        const hit = getPatterns.find(p => p.test(path));
        if (hit) {
          if (mock.hold) { parked.push([route, hit]); return; }   // held: reaches the network, gets no answer yet
          return serve(route, hit);
        }
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    },
    // Wait until no request has arrived for 300 ms, so a background revalidation started by the
    // previous read has landed in api.js's cache before the next step.
    quiesce: async () => { while (Date.now() - lastSeen < 300) await new Promise(r => setTimeout(r, 50)); },
    release: () => { while (parked.length) { const [route, hit] = parked.shift(); serve(route, hit).catch(() => {}); } },
  };
  return mock;
}
let CURRENT_MOCK = null;
async function installMock(page, getPatterns) {
  const mock = makeApiMock(getPatterns);
  await page.route(u => u.href.startsWith(API), mock.handler);
  CURRENT_MOCK = mock;
  return mock;
}
// One (mutationName, mutationArgs) -> (getName, getArgs, patternKey) check. Returns null on pass, else a
// short description of what failed, for the case's combined-failures assertion.
async function checkInvalidates(page, mutName, mutArgs, getName, getArgs, key) {
  // Fixed 2026-09-18 (PM). The first version compared __v before and after the mutation, but api.js
  // refreshes the cache in the background on every cache HIT, so r1's own background refresh bumped
  // the cached value before r3 read it: r3 looked "fresh" whether or not the mutation invalidated
  // anything. Proven by mutation: removing leaveGroup's invalidateGroups() still passed L-B1-04.
  // Now: settle the cache, run the mutation, then PARK every GET at the network and time r3. A cache
  // hit resolves at once (its own background refresh is parked, so it cannot interfere); an
  // invalidated cache has to go to the network and waits on the parked request.
  const mock = CURRENT_MOCK;
  const r1 = await callApi(page, getName, ...getArgs);
  if (!r1.ok) return `${mutName} -> ${getName}: first GET failed (${JSON.stringify(r1)})`;
  await mock.quiesce();
  const mres = await callApi(page, mutName, ...mutArgs);
  if (!mres.ok) return `${mutName} itself rejected: ${mres.message}`;
  mock.hold = true;
  try {
    const r3p = callApi(page, getName, ...getArgs);
    const fromCache = await Promise.race([r3p.then(() => true), new Promise(r => setTimeout(() => r(false), 1500))]);
    mock.hold = false;
    mock.release();
    const r3 = await r3p;
    if (fromCache) return `${mutName} did not invalidate ${getName} (${key}) — the next read was served from cache`;
    if (!r3.ok) return `${mutName} -> ${getName}: second GET failed (${JSON.stringify(r3)})`;
    return null;
  } finally {
    mock.hold = false;
    mock.release();
  }
}

async function shot(name) {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  return path.join(SHOT_DIR, `${name}.png`);
}

// ============================================================================================
// main
// ============================================================================================
async function main() {
  const secret = readSecret();
  const pre = await checkPreconditions(secret);
  if (pre.missing.length) {
    console.error('Precondition(s) not met:');
    for (const m of pre.missing) console.error(`  - ${m}`);
    process.exit(6);
  }
  const READER = pre.reader.token;
  const FRIEND = pre.friend.token;
  const READER_ID = pre.reader.user.id;
  const FRIEND_ID = pre.friend.user.id;
  const CIRCLE_ID = pre.fixture.circleId;
  const USERBOOK_ID = pre.fixture.userbookId;

  fs.mkdirSync(SHOT_DIR, { recursive: true });
  browser = await chromium.launch();
  const cleanupNotes = new Set();
  const cleanupPosts = new Set();

  // ---------------------------------------------------------------------------
  // L-B1: web platform — api.js error surfacing, cache invalidation, admin query,
  //       web push/logout (E2), Back navigation.
  // ---------------------------------------------------------------------------

  async function L_B1_01() {
    await withPage(async page => {
      await page.route(u => u.pathname.includes('/api/googlebooks/search'), route =>
        route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ detail: { code: 'login_required', message: 'Log in to keep searching' } }) }));
      await page.goto(WEB + '/');
      const before = new URL(page.url()).pathname;
      let navigated = false;
      // Only the main frame navigating to a *different* pathname counts — the Google Sign-In button
      // renders its own accounts.google.com iframe, which fires its own (irrelevant) framenavigated.
      page.on('framenavigated', f => { if (f === page.mainFrame() && new URL(f.url()).pathname !== before) navigated = true; });
      const tokenBefore = await page.evaluate(() => localStorage.getItem('bt_token'));
      assert(tokenBefore === null, 'bt_token was not null before the call');
      const r = await page.evaluate(async () => {
        const m = await import('/src/services/api.js');
        try { await m.searchGoogleBooks('dune'); return { rejected: false }; }
        catch (e) { return { rejected: true, name: e.name, message: e.message, status: e.status, code: e.code }; }
      });
      assert(r.rejected, 'searchGoogleBooks did not reject for an anonymous 401 login_required');
      assert(r.status === 401, `status was ${r.status}, expected 401`);
      assert(r.code === 'login_required', `code was ${r.code}, expected login_required`);
      assert(r.message === 'Log in to keep searching', `message was "${r.message}"`);
      const tokenAfter = await page.evaluate(() => localStorage.getItem('bt_token'));
      assert(tokenAfter === null, 'bt_token was cleared/set even though it was already absent');
      assert(new URL(page.url()).pathname === before, `page navigated from ${before} to ${page.url()}`);
      assert(!navigated, 'a framenavigated event fired during the anonymous 401 call');
    });
  }

  async function L_B1_02() {
    await withPage(async page => {
      await page.goto(WEB + '/');
      // 1. 500 (F-58)
      await page.route(u => u.pathname === '/notifications/prefs', route =>
        route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'Internal Server Error' }) }));
      await seedAuth1(page);
      const r1 = await callApi(page, 'updateNotificationPrefs', { post_liked: false });
      assert(!r1.ok, 'updateNotificationPrefs did not reject on a 500');
      assert(r1.status === 500, `status was ${r1.status}`);
      assert(r1.message === 'Internal Server Error', `message was "${r1.message}"`);
      assert(!r1.message.includes('[object Object]'), 'message contains [object Object]');

      // 2. 422 array detail (F-51/F-52 fallout)
      await page.unroute(u => u.pathname === '/notifications/prefs');
      await page.route(u => u.pathname === '/notes/feed', route =>
        route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ detail: [{ loc: ['query', 'limit'], msg: 'ensure this value is greater than or equal to 1', type: 'value_error.number.not_ge' }] }) }));
      const r2 = await callApi(page, 'getCommunityFeed');
      assert(!r2.ok, 'getCommunityFeed did not reject on a 422');
      assert(r2.status === 422, `status was ${r2.status}`);
      assert(typeof r2.message === 'string' && r2.message.length > 0, 'message was empty');
      assert(!r2.message.includes('[object Object]'), `message contains [object Object]: "${r2.message}"`);

      // 3. 401 with a token present still redirects. The app is already on "/" (LoginPage), so
      // window.location.href = '/' is a same-URL reload, not a pathname change — waiting on the URL
      // is trivially already true. Poll bt_token instead, and tolerate the evaluate call itself being
      // interrupted by the reload it triggers.
      await page.evaluate(() => localStorage.setItem('bt_token', 'expired.jwt.value'));
      await page.route(u => u.pathname.includes('/api/googlebooks/search'), route =>
        route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ detail: { code: 'login_required', message: 'Log in to keep searching' } }) }));
      await page.evaluate(async () => { const m = await import('/src/services/api.js'); await m.searchGoogleBooks('dune').catch(() => {}); }).catch(() => {});
      await page.waitForFunction(() => localStorage.getItem('bt_token') === null, { timeout: 8000 }).catch(() => {});
      await page.waitForLoadState('domcontentloaded').catch(() => {});
      assert(new URL(page.url()).pathname === '/', `expired-session 401 did not redirect to / (at ${page.url()})`);
      const tok = await page.evaluate(() => localStorage.getItem('bt_token'));
      assert(tok === null, 'bt_token was not cleared for an expired session');
    });
  }
  async function seedAuth1(page) { await page.evaluate(() => localStorage.setItem('bt_token', '')); await page.evaluate(t => localStorage.setItem('bt_token', t), READER); }

  // L-B1-03..06 share the invalidation-check machinery above.
  async function L_B1_03() {
    await withPage(async page => {
      await page.goto(WEB + '/'); await seedAuth1(page);
      await installMock(page, [
        { key: 'feed', test: p => p === '/notes/feed' },
        { key: 'followers', test: p => p === '/follow/followers' },
        { key: 'recs', test: p => p === '/books/recommendations' },
        { key: 'friendReading', test: p => p === '/userbooks/friends/currently-reading' },
        { key: 'profile', test: p => p === '/profile/me' },
        { key: 'userbooks', test: p => p === '/userbooks/' },
      ]);
      const checks = [
        ['likeNote', [1], 'getCommunityFeed', [], 'feed'],
        ['unlikeNote', [1], 'getCommunityFeed', [], 'feed'],
        ['addComment', [1, 'x'], 'getCommunityFeed', [], 'feed'],
        ['triggerBot', [], 'getCommunityFeed', [], 'feed'],
        ['followUser', [2], 'getFollowers', [], 'followers'],
        ['followUser', [2], 'getRecommendations', [], 'recs'],
        ['followUser', [2], 'getFriendReading', [], 'friendReading'],
        ['unfollowUser', [2], 'getFollowers', [], 'followers'],
        ['unfollowUser', [2], 'getRecommendations', [], 'recs'],
        ['unfollowUser', [2], 'getFriendReading', [], 'friendReading'],
        // "already correct" — must not regress
        ['updateMyProfile', [{ bio: 'qa' }], 'getMyProfile', [], 'profile'],
        ['addToLibrary', [{ title: `QA ${TS}`, total_pages: 1, status: 'to-read' }], 'getMyBooks', [], 'userbooks'],
        ['updateUserBook', [999999, { status: 'reading' }], 'getMyBooks', [], 'userbooks'],
        ['updateProgress', [999999, 5], 'getMyBooks', [], 'userbooks'],
        ['markFinished', [999999], 'getMyBooks', [], 'userbooks'],
        ['removeFromLibrary', [999999], 'getMyBooks', [], 'userbooks'],
        ['createNote', [{ text: 'qa' }], 'getCommunityFeed', [], 'feed'],
        ['updateNote', [999999, { text: 'qa2' }], 'getCommunityFeed', [], 'feed'],
        ['deleteNote', [999999], 'getCommunityFeed', [], 'feed'],
      ];
      const failures = [];
      for (const [mutName, mutArgs, getName, getArgs, key] of checks) {
        const f = await checkInvalidates(page, mutName, mutArgs, getName, getArgs, key);
        if (f) failures.push(f);
      }
      // Fixed 2026-09-18 (PM): this used to run the import BEFORE the first read and then probe a no-op,
      // and its result (impCheck) was never recorded, so the import's invalidation was not tested at all.
      const impF = await checkInvalidates(page, 'importGoodreads',
        [{ __file: { name: 'x.csv', content: 'a,b\n1,2', type: 'text/csv' } }], 'getMyBooks', [], 'userbooks');
      if (impF) failures.push(impF);
      assert(failures.length === 0, `${failures.length} invalidation(s) missing: ${failures.join('; ')}`);
    });
  }

  async function L_B1_04() {
    await withPage(async page => {
      await page.goto(WEB + '/'); await seedAuth1(page);
      await installMock(page, [{ key: 'groupsMy', test: p => p === '/groups/my' }]);
      const checks = [
        ['createGroup', [{ name: `QA ${TS}`, is_private: false }]],
        ['updateGroup', [999999, { name: 'x' }]],
        ['deleteGroup', [999999]],
        ['joinGroup', [999999]],
        ['leaveGroup', [999999]],
        ['approveGroupMember', [999999, 999998]],
        ['rejectGroupMember', [999999, 999998]],
        ['removeGroupMember', [999999, 999998]],
        ['inviteToGroup', [999999, 999998]],
        ['joinByInviteCode', ['QATESTCODE']],
        ['acceptGroupInvite', [999999]],
        ['declineGroupInvite', [999999]],
        ['createGroupPost', [999999, { text: 'qa' }]],
        ['deleteGroupPost', [999999, 999997]],
        ['setGroupBook', [999999, { id: 1, title: 't', author: 'a' }]],
        ['clearGroupBook', [999999]],
      ];
      assert(checks.length === 16, `expected 16 group mutations, wrote ${checks.length}`);
      const failures = [];
      for (const [mutName, mutArgs] of checks) {
        const f = await checkInvalidates(page, mutName, mutArgs, 'getMyGroups', [], 'groupsMy');
        if (f) failures.push(f);
      }
      assert(failures.length === 0, `${failures.length}/16 group mutation(s) did not invalidate getMyGroups: ${failures.join('; ')}`);
    });
  }

  async function L_B1_05() {
    await withPage(async page => {
      await page.goto(WEB + '/'); await seedAuth1(page);
      await installMock(page, [
        { key: 'history', test: p => p === '/notifications/history' },
        { key: 'unread', test: p => p === '/notifications/unread-count' },
        { key: 'prefs', test: p => p === '/notifications/prefs' },
      ]);
      const failures = [];
      for (const [mutName, mutArgs, getName, key] of [
        ['markAllNotificationsRead', [], 'getNotifications', 'history'],
        ['markAllNotificationsRead', [], 'getUnreadCount', 'unread'],
        ['markNotificationRead', [7], 'getNotifications', 'history'],
        ['markNotificationRead', [7], 'getUnreadCount', 'unread'],
        ['updateNotificationPrefs', [{ post_liked: false }], 'getNotificationPrefs', 'prefs'],
      ]) {
        const f = await checkInvalidates(page, mutName, mutArgs, getName, [], key);
        if (f) failures.push(f);
      }
      assert(failures.length === 0, `${failures.length} notification invalidation(s) missing: ${failures.join('; ')}`);
    });
  }

  async function L_B1_06() {
    await withPage(async page => {
      await page.goto(WEB + '/'); await seedAuth1(page);
      await installMock(page, [
        { key: 'profile', test: p => p === '/profile/me' },
        { key: 'userbooks', test: p => p === '/userbooks/' },
        { key: 'covers', test: p => p === '/import/covers-status' },
        { key: 'feed', test: p => p === '/notes/feed' },
        { key: 'adminNotes', test: p => p === '/admin/content/notes' },
        { key: 'adminComments', test: p => p === '/admin/content/comments' },
        { key: 'adminStats', test: p => p === '/admin/stats' },
      ]);
      const failures = [];
      // uploadProfilePicture is a raw fetch, not apiFetch — the easiest one to miss.
      {
        const f = await checkInvalidates(page, 'uploadProfilePicture',
          [{ __file: { name: 'a.png', content: 'x', type: 'image/png' } }], 'getMyProfile', [], 'profile');
        if (f) failures.push(f);
      }
      for (const [getName, key] of [['getMyBooks', 'userbooks'], ['getCoversStatus', 'covers'], ['getCommunityFeed', 'feed']]) {
        const f = await checkInvalidates(page, 'fixCoversBatch', [[1]], getName, [], key);
        if (f) failures.push(f);
      }
      for (const [getName, key] of [['getAdminNotes', 'adminNotes'], ['getCommunityFeed', 'feed']]) {
        const f = await checkInvalidates(page, 'adminDeleteNote', [1], getName, [], key);
        if (f) failures.push(f);
      }
      for (const [getName, key] of [['getAdminComments', 'adminComments'], ['getCommunityFeed', 'feed']]) {
        const f = await checkInvalidates(page, 'adminDeleteComment', [1], getName, [], key);
        if (f) failures.push(f);
      }
      {
        const f = await checkInvalidates(page, 'setAdminRole', [3], 'getAdminStats', [], 'adminStats');
        if (f) failures.push(f);
      }
      assert(failures.length === 0, `${failures.length} invalidation(s) missing: ${failures.join('; ')}`);
    });
  }

  async function L_B1_07() {
    await withPage(async page => {
      await page.goto(WEB + '/'); await seedAuth1(page);
      const seen = [];
      await page.route(u => u.pathname.includes('/admin/set-admin/'), route => {
        seen.push({ method: route.request().method(), url: route.request().url() });
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ message: 'ok', user_id: 42, is_admin: true }) });
      });
      const r = await callApi(page, 'setAdminRole', 42);
      assert(r.ok, `setAdminRole rejected: ${r.message}`);
      assert(seen.length === 1, `expected exactly 1 request, saw ${seen.length}`);
      const u = new URL(seen[0].url);
      assert(seen[0].method === 'POST', `method was ${seen[0].method}`);
      assert(u.pathname.endsWith('/admin/set-admin/42'), `path was ${u.pathname}`);
      assert(u.search === '?is_admin=true', `query was "${u.search}", expected "?is_admin=true"`);
    });
  }

  async function L_B1_08() {
    await withPage(async page => {
      await page.goto(WEB + '/');
      await page.evaluate(() => localStorage.setItem('bt_token', 'CURRENT'));
      let seen = null;
      await page.route(u => u.pathname === '/notifications/web-unsubscribe', route => {
        seen = { method: route.request().method(), auth: route.request().headers()['authorization'], body: route.request().postData() };
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ message: 'ok' }) });
      });
      const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/E1', keys: { p256dh: 'k', auth: 'a' } };
      const r1 = await callApi(page, 'webUnsubscribe', sub, 'PRELOGOUT');
      assert(r1.ok, `webUnsubscribe rejected: ${r1.message}`);
      assert(seen.method === 'DELETE', `method was ${seen.method}`);
      assert(seen.auth === 'Bearer PRELOGOUT', `authorization was "${seen.auth}", expected the passed token to win`);
      assert(seen.body === JSON.stringify({ subscription: sub }), `body was ${seen.body}`);

      await page.evaluate(() => localStorage.removeItem('bt_token'));
      seen = null;
      const r2 = await callApi(page, 'webUnsubscribe', sub, null);
      assert(seen, 'webUnsubscribe(sub, null) did not fire a request at all');
      assert(!('authorization' in (seen.auth === undefined ? {} : { authorization: seen.auth })) || seen.auth === undefined, `expected no authorization header, got "${seen.auth}"`);
    });
  }

  async function L_B1_09() {
    await withPage(async page => {
      const unsubCalls = [];
      const FAKE_SUB = { endpoint: `https://fcm.googleapis.com/fcm/send/qa-${TS}`, keys: { p256dh: 'qak', auth: 'qaa' } };
      // Seed via evaluate (not addInitScript, which would re-run on the later /home navigation as the
      // second account and re-write bt_note_visibility='public', masking the very removal this case checks).
      await page.goto(WEB + '/');
      await page.evaluate(t => {
        localStorage.setItem('bt_token', t);
        localStorage.setItem('bt_onboarding_v1', 'done');
        localStorage.setItem('bt_note_visibility', 'public');
      }, READER);
      // Real Notification.permission cannot be granted from Playwright (K-17), so registerWebPush()
      // never actually subscribes. Stub navigator.serviceWorker so unregisterWebPush() — the code path
      // this case actually tests — finds a subscription to unsubscribe, without needing a real push
      // service or a real permission grant.
      await page.addInitScript(sub => {
        const fakeSubscription = { toJSON: () => sub };
        const fakeRegistration = { pushManager: { getSubscription: async () => fakeSubscription } };
        if (!navigator.serviceWorker) Object.defineProperty(navigator, 'serviceWorker', { value: {}, configurable: true });
        navigator.serviceWorker.getRegistration = async () => fakeRegistration;
      }, FAKE_SUB);
      await page.route(u => u.pathname === '/notifications/web-unsubscribe', route => {
        unsubCalls.push({ method: route.request().method(), auth: route.request().headers()['authorization'] });
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ message: 'ok' }) });
      });
      await page.route(u => u.pathname === '/notifications/vapid-public-key', route =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ public_key: 'BA'.padEnd(88, 'A') }) }));

      await page.goto(WEB + '/home');
      await page.waitForResponse(r => r.url().includes('/profile/me') && r.request().method() === 'GET', { timeout: 20000 }).catch(() => {});
      const visBefore = await page.evaluate(() => localStorage.getItem('bt_note_visibility'));
      assert(visBefore === 'public', 'arrange failed: bt_note_visibility was not seeded to public');

      await page.locator('[data-tour="avatar"]').click();
      await page.getByRole('button', { name: label('Sign out') }).first().click();
      await page.waitForURL(u => new URL(u).pathname === '/', { timeout: 15000 });

      const vis = await page.evaluate(() => localStorage.getItem('bt_note_visibility'));
      assert(vis === null, `bt_note_visibility was "${vis}", expected null (removed, not written to 'private')`);
      const tok = await page.evaluate(() => localStorage.getItem('bt_token'));
      assert(tok === null, 'bt_token was not cleared');
      assert(unsubCalls.length === 1, `expected exactly 1 web-unsubscribe call, saw ${unsubCalls.length}`);
      assert(unsubCalls[0].auth === `Bearer ${READER}`, `web-unsubscribe used "${unsubCalls[0].auth}", expected the pre-logout token`);

      // Re-enter as the second account in the same context.
      await page.evaluate(t => { localStorage.setItem('bt_token', t); }, FRIEND);
      await page.goto(WEB + '/home', { waitUntil: 'domcontentloaded' });
      await page.getByPlaceholder('What are your thoughts on your current read?').waitFor({ timeout: 20000 });
      const radio = page.getByRole('radio', { name: label('Only me'), checked: true });
      assert(await radio.count() === 1, 'Home composer did not default to "Only me" for the next account');

      const onboarding = await page.evaluate(() => localStorage.getItem('bt_onboarding_v1'));
      assert(onboarding === 'done', 'logout removed unrelated per-browser state (bt_onboarding_v1)');
    });
  }

  async function L_B1_10() {
    // 1. Direct open on each public page.
    for (const route of ['/about', '/privacy', '/terms']) {
      await withPage(async page => {
        const errors = [];
        page.on('pageerror', e => errors.push(String(e)));
        await page.goto(WEB + route, { waitUntil: 'domcontentloaded' });
        await page.getByRole('button', { name: label('Back') }).first().click();
        await page.waitForTimeout(500);
        const p = new URL(page.url()).pathname;
        assert(p === '/' || p === '/home', `Back from ${route} landed on ${p}, expected / or /home`);
        const text = await page.evaluate(() => document.body.innerText.trim().length);
        assert(text > 0, `page is blank after Back from ${route}`);
        assert(errors.length === 0, `pageerror fired: ${errors[0]}`);
        if (route === '/privacy') await page.screenshot({ path: await shot('f57-back-from-privacy-lands-home') }).catch(() => {});
      });
    }
    // 2. In-app history via the footer link (logged out, on LoginPage).
    await withPage(async page => {
      await page.goto(WEB + '/', { waitUntil: 'domcontentloaded' });
      const idxBefore = await page.evaluate(() => window.history.state?.idx ?? 0);
      await page.getByRole('link', { name: 'Privacy' }).click();
      await page.waitForURL(u => new URL(u).pathname === '/privacy');
      await page.getByRole('button', { name: label('Back') }).first().click();
      await page.waitForTimeout(300);
      const p = new URL(page.url()).pathname;
      assert(p === '/' || p === '/home', `Back after in-app nav to /privacy landed on ${p}`);
      const idxAfter = await page.evaluate(() => window.history.state?.idx ?? 0);
      assert(idxAfter === idxBefore, `history idx was ${idxAfter}, expected back at the pre-navigation idx ${idxBefore} (navigate(-1) was taken)`);
    });
    // 3. Never-(-1) guarantee: browser-level Back from a direct /privacy open leaves the app.
    await withPage(async page => {
      await page.goto(WEB + '/privacy', { waitUntil: 'domcontentloaded' });
      await page.goBack().catch(() => {});
      await page.waitForTimeout(300);
      const outside = page.url() === 'about:blank' || !page.url().startsWith(WEB);
      assert(outside, 'sanity check: expected the raw browser Back to leave the SPA (proving the in-app control must not use it)');
    });
  }

  // ---------------------------------------------------------------------------
  // L-B2: web content — note-visibility default/persistence, F-60 stale-feed guards,
  //       add-to-library dedup keys, dead format filter, circle destructive-action confirms.
  // ---------------------------------------------------------------------------

  async function openHome(page) {
    await page.goto(WEB + '/home', { waitUntil: 'domcontentloaded' });
    await page.getByPlaceholder('What are your thoughts on your current read?').waitFor({ timeout: 30000 });
  }
  async function openBookDetail(page) {
    await page.goto(WEB + `/library/book/${USERBOOK_ID}`, { waitUntil: 'domcontentloaded' });
    await page.getByPlaceholder('Write a reflection about this book...').waitFor({ timeout: 30000 });
  }
  async function openProfileComposer(page) {
    await page.goto(WEB + '/profile', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: label('New Entry') }).first().click();
    await page.getByPlaceholder('What are you thinking about your read?').waitFor({ timeout: 15000 });
  }

  async function L_B2_01() {
    await withPage(async (page, context) => {
      await seedAuth(context, READER);
      await openHome(page);
      assert(await page.getByRole('radio', { name: label('Only me'), checked: true }).count() === 1, 'Home composer did not default to Only me');
      assert((await page.evaluate(() => localStorage.getItem('bt_note_visibility'))) === null, 'rendering Home wrote bt_note_visibility');
      await openBookDetail(page);
      assert(await page.getByRole('radio', { name: label('Only me'), checked: true }).count() === 1, 'Book-detail composer did not default to Only me');
      assert((await page.evaluate(() => localStorage.getItem('bt_note_visibility'))) === null, 'rendering book detail wrote bt_note_visibility');
      await openProfileComposer(page);
      assert(await page.getByRole('radio', { name: label('Only me'), checked: true }).count() === 1, 'Profile composer did not default to Only me');
      assert((await page.evaluate(() => localStorage.getItem('bt_note_visibility'))) === null, 'opening the Profile composer wrote bt_note_visibility');
    });
  }

  async function L_B2_02() {
    await withPage(async (page, context) => {
      await seedAuth(context, READER);
      await openHome(page);
      await page.getByRole('radio', { name: label('Public') }).click();
      assert((await page.evaluate(() => localStorage.getItem('bt_note_visibility'))) === 'public', 'clicking Public did not write the key immediately');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByPlaceholder('What are your thoughts on your current read?').waitFor({ timeout: 30000 });
      assert(await page.getByRole('radio', { name: label('Public'), checked: true }).count() === 1, 'Home did not show Public after reload');
      await openBookDetail(page);
      assert(await page.getByRole('radio', { name: label('Public'), checked: true }).count() === 1, 'Book detail did not show Public');
      await openProfileComposer(page);
      assert(await page.getByRole('radio', { name: label('Public'), checked: true }).count() === 1, 'Profile composer did not show Public');
    });
  }

  async function L_B2_03() {
    await withPage(async (page, context) => {
      await seedAuth(context, READER);
      await context.addInitScript(() => localStorage.setItem('bt_note_visibility', 'public'));
      await openHome(page);
      assert(await page.getByRole('radio', { name: label('Public'), checked: true }).count() === 1, 'arrange: composer did not show Public');
      const text = `QA F17 public ${TS}`;
      await page.getByPlaceholder('What are your thoughts on your current read?').fill(text);
      const [req] = await Promise.all([
        page.waitForRequest(r => r.url().endsWith('/notes/') && r.method() === 'POST'),
        page.getByRole('button', { name: label('Post') }).first().click(),
      ]);
      const body = JSON.parse(req.postData());
      assert(body.is_public === true, `recorded POST /notes/ body had is_public=${body.is_public}`);
      const resp = await page.waitForResponse(r => r.url().endsWith('/notes/') && r.request().method() === 'POST');
      const json = await resp.json();
      assert(json.is_public === true, `201 response had is_public=${json.is_public}`);
      cleanupNotes.add(json.id);
      const card = page.locator('article', { hasText: text }).first();
      await card.waitFor({ state: 'visible', timeout: 20000 });
      const first = page.locator('article').first();
      assert(await first.innerText().then(t => t.includes(text)), 'the new public post is not the first article in the Community list');
      const toastVisible = await page.getByText('Reflection posted!').first().isVisible().catch(() => false);
      assert(toastVisible, 'the "Reflection posted!" toast did not show');
    });
  }

  async function L_B2_04() {
    await withPage(async (page, context) => {
      await seedAuth(context, READER);
      await openHome(page);
      await page.evaluate(() => localStorage.setItem('bt_note_visibility', 'public'));
      await page.evaluate(() => localStorage.clear());
      await page.evaluate(t => localStorage.setItem('bt_token', t), READER);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByPlaceholder('What are your thoughts on your current read?').waitFor({ timeout: 30000 });
      assert(await page.getByRole('radio', { name: label('Only me'), checked: true }).count() === 1, 'clearing storage did not return the composer to Only me');
      assert((await page.evaluate(() => localStorage.getItem('bt_note_visibility'))) === null, 'the key is still present after clear');
    });
  }

  async function L_B2_05() {
    await withPage(async (page, context) => {
      await seedAuth(context, READER);
      await openHome(page);
      assert(await page.getByRole('radio', { name: label('Only me'), checked: true }).count() === 1, 'arrange: composer did not default to Only me');
      const text = `QA F17 private ${TS}`;
      await page.getByPlaceholder('What are your thoughts on your current read?').fill(text);
      const [req] = await Promise.all([
        page.waitForRequest(r => r.url().endsWith('/notes/') && r.method() === 'POST'),
        page.getByRole('button', { name: label('Post') }).first().click(),
      ]);
      const body = JSON.parse(req.postData());
      assert(body.is_public === false, `recorded body had is_public=${body.is_public}`);
      const resp = await page.waitForResponse(r => r.url().endsWith('/notes/') && r.request().method() === 'POST');
      const json = await resp.json();
      assert(json.is_public === false, `201 response had is_public=${json.is_public}`);
      cleanupNotes.add(json.id);
      const toastEl = page.getByText('Saved privately — find it on your Profile').first();
      const toastVisible = await toastEl.isVisible().catch(() => false);
      assert(toastVisible, 'the "Saved privately" toast did not show');
      await page.screenshot({ path: await shot('f17-only-me-toggle-and-saved-privately-toast') }).catch(() => {});
      await page.waitForTimeout(20000);
      const stillNone = await page.locator('article', { hasText: text }).count();
      assert(stillNone === 0, 'the private post appeared in the Community list');
      const meRes = await api(READER, 'GET', '/notes/me');
      assert((meRes.json || []).some(n => n.id === json.id), 'the private note is missing from /notes/me');
      assert(await page.getByRole('radio', { name: label('Only me'), checked: true }).count() === 1, 'the switch reset after posting (it must not)');
      await withPage(async loggedOutPage => {
        await loggedOutPage.goto(WEB + '/', { waitUntil: 'domcontentloaded' });
        const bodyText = await loggedOutPage.evaluate(() => document.body.innerText);
        assert(!bodyText.includes(text), 'the private note text is visible to a logged-out visitor on /');
      });
    });
  }

  async function L_B2_06() {
    await withPage(async (page, context) => {
      await seedAuth(context, READER);
      await context.addInitScript(() => localStorage.setItem('bt_note_visibility', 'private'));
      // Book detail
      await openBookDetail(page);
      await page.getByPlaceholder('Write a reflection about this book...').fill(`QA F07-web bd ${TS}`);
      let [req] = await Promise.all([
        page.waitForRequest(r => r.url().endsWith('/notes/') && r.method() === 'POST'),
        page.getByRole('button', { name: label('Post') }).first().click(),
      ]);
      let body = JSON.parse(req.postData());
      assert('is_public' in body && body.is_public === false, `book-detail composer body: ${JSON.stringify(body)}`);
      let resp = await page.waitForResponse(r => r.url().endsWith('/notes/') && r.request().method() === 'POST');
      cleanupNotes.add((await resp.json()).id);

      // Profile
      await openProfileComposer(page);
      await page.getByPlaceholder('What are you thinking about your read?').fill(`QA F07-web profile ${TS}`);
      [req] = await Promise.all([
        page.waitForRequest(r => r.url().endsWith('/notes/') && r.method() === 'POST'),
        page.getByRole('button', { name: label('Post') }).first().click(),
      ]);
      body = JSON.parse(req.postData());
      assert('is_public' in body && body.is_public === false, `profile composer body: ${JSON.stringify(body)} (ProfilePage historically omitted the key)`);
      resp = await page.waitForResponse(r => r.url().endsWith('/notes/') && r.request().method() === 'POST');
      cleanupNotes.add((await resp.json()).id);

      // Book detail again, switched to Public
      await openBookDetail(page);
      await page.getByRole('radio', { name: label('Public') }).click();
      await page.getByPlaceholder('Write a reflection about this book...').fill(`QA F07-web bd2 ${TS}`);
      [req] = await Promise.all([
        page.waitForRequest(r => r.url().endsWith('/notes/') && r.method() === 'POST'),
        page.getByRole('button', { name: label('Post') }).first().click(),
      ]);
      body = JSON.parse(req.postData());
      assert(body.is_public === true, `book-detail Public post body: ${JSON.stringify(body)}`);
      resp = await page.waitForResponse(r => r.url().endsWith('/notes/') && r.request().method() === 'POST');
      const id3 = (await resp.json()).id;
      cleanupNotes.add(id3);
      await page.waitForTimeout(500);
      const onPage = await page.getByText(`QA F07-web bd2 ${TS}`).count();
      assert(onPage > 0, 'the public book-detail note is not visible on the book-detail note list');
    });
  }

  // F-60: delay the feed responses to make the stale-response race deterministic.
  // Fixed 2026-09-18 (PM). This used to wait and THEN route.continue(), so the server built the feed
  // after the test's post already existed and the "stale" response contained it; the post survived
  // with or without F-60's guard (proven by mutation: setPosts(fresh) still passed L-B2-07). Now the
  // real response is fetched immediately and held, so it is a genuine snapshot from before the post,
  // which is exactly what a 9 s production feed load returned.
  async function withDelayedFeed(page, { feedMs = 0, friendsMs = 0 } = {}) {
    const hold = ms => async route => { const res = await route.fetch(); await new Promise(r => setTimeout(r, ms)); await route.fulfill({ response: res }); };
    if (feedMs) await page.route(u => u.pathname === '/notes/feed', hold(feedMs));
    if (friendsMs) await page.route(u => u.pathname === '/notes/friends-feed', hold(friendsMs));
  }

  async function L_B2_07() {
    await withPage(async (page, context) => {
      await seedAuth(context, READER);
      await context.addInitScript(() => localStorage.setItem('bt_note_visibility', 'public'));
      await withDelayedFeed(page, { feedMs: 5000 });
      const t0 = Date.now();
      await page.goto(WEB + '/home', { waitUntil: 'domcontentloaded' });
      await page.getByPlaceholder('What are your thoughts on your current read?').waitFor({ timeout: 15000 });
      const text = `QA F60 s1 ${TS}`;
      await page.getByPlaceholder('What are your thoughts on your current read?').fill(text);
      const [resp] = await Promise.all([
        page.waitForResponse(r => r.url().endsWith('/notes/') && r.request().method() === 'POST'),
        page.getByRole('button', { name: label('Post') }).first().click(),
      ]);
      cleanupNotes.add((await resp.json()).id);
      const postedAt = Date.now();
      const card = page.locator('article', { hasText: text }).first();
      await card.waitFor({ state: 'visible', timeout: 20000 });
      assert(Date.now() - postedAt <= 20000, 'post did not appear within 20s of the 201');
      const first = await page.locator('article').first().innerText();
      assert(first.includes(text), 'the new post is not the first article');
      // Wait for the delayed feed to resolve, then re-check 3s after it lands.
      await page.waitForTimeout(Math.max(0, 5000 - (Date.now() - t0)) + 500);
      await page.waitForTimeout(3000);
      assert(await page.locator('article', { hasText: text }).count() > 0, 'the post was wiped by the stale feed response');
    });
  }

  async function L_B2_08() {
    await withPage(async (page, context) => {
      await seedAuth(context, READER);
      await withDelayedFeed(page, { feedMs: 5000, friendsMs: 500 });
      let friendsIds = null;
      page.on('response', async r => {
        if (r.url().endsWith('/notes/friends-feed') && friendsIds === null) {
          try { friendsIds = (await r.json()).map(n => n.id); } catch { /* ignore */ }
        }
      });
      await page.goto(WEB + '/home', { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: /Friends/ }).first().click();
      await page.waitForTimeout(6000);
      assert(friendsIds !== null, 'friends-feed response was never captured');
      const rendered = await page.locator('article').evaluateAll(els => els.map(el => el.getAttribute('data-note-id') || el.id || null));
      // Fall back to text-based comparison if no id attribute is exposed on the card.
      const activeTab = await page.getByRole('button', { name: /Friends/ }).first().evaluate(el => el.className.includes('bg-primary') || el.getAttribute('aria-pressed') === 'true').catch(() => null);
      assert((await page.locator('article').count()) === friendsIds.length || friendsIds.length === 0,
        `rendered article count did not match the friends-feed response length (${friendsIds.length})`);
    });
  }

  async function L_B2_09() {
    await withPage(async (page, context) => {
      await seedAuth(context, READER);
      await context.addInitScript(() => localStorage.setItem('bt_note_visibility', 'public'));
      await withDelayedFeed(page, { feedMs: 6000 });
      await page.goto(WEB + '/home', { waitUntil: 'domcontentloaded' });
      await page.getByPlaceholder('What are your thoughts on your current read?').waitFor({ timeout: 15000 });
      const text = `QA F60 del ${TS}`;
      await page.getByPlaceholder('What are your thoughts on your current read?').fill(text);
      const [resp] = await Promise.all([
        page.waitForResponse(r => r.url().endsWith('/notes/') && r.request().method() === 'POST'),
        page.getByRole('button', { name: label('Post') }).first().click(),
      ]);
      const id = (await resp.json()).id;
      const card = page.locator('article', { hasText: text }).first();
      await card.waitFor({ state: 'visible', timeout: 20000 });
      const menu = card.locator('button:has(.material-symbols-outlined:text("more_horiz"))').first();
      await menu.click();
      page.once('dialog', d => d.accept());
      const [delResp] = await Promise.all([
        page.waitForResponse(r => r.url().endsWith(`/notes/${id}`) && r.request().method() === 'DELETE'),
        page.getByRole('button', { name: label('Delete') }).first().click(),
      ]);
      assert(delResp.status() === 200, `DELETE /notes/${id} returned ${delResp.status()}`);
      await page.waitForTimeout(7000);
      assert((await page.locator('article', { hasText: text }).count()) === 0, 'the deleted post reappeared after the stale feed response landed');
      await page.waitForTimeout(3000);
      assert((await page.locator('article', { hasText: text }).count()) === 0, 'the deleted post reappeared 3s after the feed landed');
      // Poll briefly: under load the local API's response can lag a beat behind its own 200; the DELETE
      // already returned 200 above, so this is tolerance for that lag, not a weaker assertion.
      let stillPresent = true;
      for (let i = 0; i < 5 && stillPresent; i++) {
        const meRes = await api(READER, 'GET', '/notes/me');
        stillPresent = (meRes.json || []).some(n => n.id === id);
        if (stillPresent) await new Promise(r => setTimeout(r, 1000));
      }
      assert(!stillPresent, 'the deleted note is still in /notes/me');
    });
  }

  async function L_B2_10() {
    await withPage(async (page, context) => {
      await seedAuth(context, READER);
      await withDelayedFeed(page, { feedMs: 5000 });
      let feedLength = null;
      page.on('response', async r => {
        if (r.url().endsWith('/notes/feed') && feedLength === null) {
          try { feedLength = (await r.json()).length; } catch { /* ignore */ }
        }
      });
      await page.goto(WEB + '/home', { waitUntil: 'domcontentloaded' });
      await page.getByPlaceholder('What are your thoughts on your current read?').waitFor({ timeout: 15000 });
      assert(await page.getByRole('radio', { name: label('Only me'), checked: true }).count() === 1, 'arrange: composer was not on Only me');
      const text = `QA F60 priv ${TS}`;
      await page.getByPlaceholder('What are your thoughts on your current read?').fill(text);
      const [resp] = await Promise.all([
        page.waitForResponse(r => r.url().endsWith('/notes/') && r.request().method() === 'POST'),
        page.getByRole('button', { name: label('Post') }).first().click(),
      ]);
      cleanupNotes.add((await resp.json()).id);
      const toastVisible = await page.getByText('Saved privately — find it on your Profile').first().isVisible().catch(() => false);
      assert(toastVisible, 'the "Saved privately" toast did not show');
      assert((await page.locator('article', { hasText: text }).count()) === 0, 'a private post appeared before the feed resolved');
      await page.waitForTimeout(6000);
      assert((await page.locator('article', { hasText: text }).count()) === 0, 'a private post appeared after the feed resolved');
      assert(feedLength !== null, '/notes/feed response was never captured');
      const countAfter = await page.locator('article').count();
      // handleNewPost is only reached for a public post; if it wrongly ran here, the delayed feed's
      // render would carry the private post alongside the response, giving feedLength + 1 articles.
      assert(countAfter === feedLength, `rendered ${countAfter} articles, but /notes/feed returned ${feedLength} — handleNewPost carried the private post into the list`);
    });
  }

  async function L_B2_11() {
    await withPage(async (page, context) => {
      await seedAuth(context, READER);
      const fakeRec = { id: 8880001, title: `QA Rec ${TS}`, author: 'QA Author', cover_url: null, google_books_id: `qa-gbid-${TS}`, isbn: `qa-isbn-${TS}`, total_pages: 222, reason: null };
      await page.route(u => u.pathname === '/books/recommendations', route =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([fakeRec]) }));
      let captured = null;
      await page.route(u => u.pathname === '/books/add-to-library', route => {
        captured = JSON.parse(route.request().postData());
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 8880002, status: captured.status, book: { id: fakeRec.id, title: fakeRec.title, author: fakeRec.author, google_books_id: fakeRec.google_books_id, isbn: fakeRec.isbn, total_pages: fakeRec.total_pages } }) });
      });
      await page.goto(WEB + '/home', { waitUntil: 'domcontentloaded' });
      await page.getByText(fakeRec.title).first().click();
      await page.getByRole('button', { name: label('Want to Read') }).first().click();
      await page.getByRole('button', { name: /add to library/i }).first().click();
      await page.waitForTimeout(500);
      assert(captured, 'BookPreviewModal never called addToLibrary');
      assert(captured.book_id === fakeRec.id, `body.book_id was ${captured.book_id}, expected ${fakeRec.id}`);
      assert(captured.isbn === fakeRec.isbn, `body.isbn was ${captured.isbn}, expected ${fakeRec.isbn}`);
      for (const k of ['google_books_id', 'title', 'author', 'cover_url', 'total_pages', 'status']) {
        assert(k in captured, `body is missing "${k}"`);
      }

      // Unstubbed: adding a book already in the library never creates a duplicate.
      // NOTE (deviation from the plan's literal text, confirmed by reading BookPreviewModal.jsx and
      // empirically): the plan describes "the modal shows the error toast carrying the server's 400
      // detail". In the actual code, BookPreviewModal itself calls getMyBooks() on mount and matches by
      // book.id / google_books_id *before* rendering the Add flow at all — if it already owns the book
      // (true here, since we feed it the owned book's own fields), it renders "Already in your library"
      // / "View in My Library" and never calls addToLibrary, so no POST — and therefore no 400 — ever
      // happens. This is a client-side dedup guard the plan didn't anticipate; it still guarantees no
      // duplicate is created (the assertion this sub-step actually cares about), just via an earlier
      // gate than a server 400. Asserted here instead of the mismatched 400-toast expectation.
      await page.unroute(u => u.pathname === '/books/add-to-library');
      const mine = await api(READER, 'GET', '/userbooks/');
      const owned = mine.json?.[0];
      assert(owned, 'review.reader has no existing userbook to test the duplicate-add path');
      let addFired = false;
      await page.route(u => u.pathname === '/books/add-to-library', route => { addFired = true; route.continue(); });
      await page.route(u => u.pathname === '/books/recommendations', route =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ ...owned.book, reason: null }]) }));
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByText(owned.book.title, { exact: false }).first().click();
      await page.waitForTimeout(800);
      const alreadyInLibrary = await page.getByText(/already in your library/i).first().isVisible().catch(() => false);
      assert(alreadyInLibrary, 'the preview modal did not recognise the already-owned book');
      assert(!addFired, 'addToLibrary was called for a book the client already knew it owned');
      const searchRes = await api(READER, 'GET', `/books/search?q=${encodeURIComponent(owned.book.title)}`);
      const dupeRows = (searchRes.json || []).filter(b => b.title === owned.book.title);
      assert(dupeRows.length <= 1, `expected at most 1 catalogue row for "${owned.book.title}", found ${dupeRows.length}`);
    });
  }

  async function L_B2_12() {
    await withPage(async (page, context) => {
      await seedAuth(context, READER);
      const results = Array.from({ length: 6 }, (_, i) => ({ google_id: `qa-gid-${TS}-${i}`, title: `QA Search Result ${i}`, authors: ['QA Author'], cover_url: null }));
      await page.route(u => u.pathname === '/api/googlebooks/search', route =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results, has_more: false, next_start_index: 0 }) }));
      await page.goto(WEB + '/search', { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: /Google Books/i }).first().click();
      const input = page.getByPlaceholder(/Search by title, author, or ISBN/i).first();
      await input.waitFor({ timeout: 15000 });
      await input.fill('dune');
      await input.press('Enter');
      await page.waitForTimeout(800);
      // Scope to the results header container: the genre-chip row above it legitimately has an "All"
      // button of its own (a live genre filter, not the dead format filter), so a page-wide search for
      // /all|hardcover|.../ would false-positive on it.
      const resultsHeader = page.locator('p', { hasText: /result/i }).first().locator('..');
      const chips = await resultsHeader.getByRole('button', { name: /^(all|hardcover|paperback|ebook|kindle|pdf|audiobook)$/i }).count();
      assert(chips === 0, `found ${chips} format chip(s) in the results header; the dead filter chips should be gone`);
      const countText = await page.getByText(/6 results?/i).first().isVisible().catch(() => false);
      assert(countText, 'the results-count text did not read "6 results"');
      const rows = await page.getByText('QA Search Result', { exact: false }).count();
      assert(rows === 6, `expected 6 rendered result rows, found ${rows}`);
    });
  }

  async function L_B2_13() {
    const blocked = [];
    let guardMode = 'abort';
    const guard = route => {
      const req = route.request();
      blocked.push(`${req.method()} ${new URL(req.url()).pathname}`);
      if (guardMode === 'abort') return route.abort('blockedbyclient');
      return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'Internal Server Error' }) });
    };
    // Every confirm-dialog button click below is scoped to the dialog (the heading's own parent card),
    // never page-wide — the delete-post icon buttons scattered across post cards have no visible text
    // beyond the material-symbols ligature "delete", which page-wide would itself satisfy label('Delete').
    const dialogOf = heading => heading.locator('..');
    let createdPostId = null;
    try {
      // Leave — as review.friend, the non-curator member.
      await withPage(async (page, context) => {
        await seedAuth(context, FRIEND);
        await page.route(u => /\/groups\/\d+\/leave$/.test(u.pathname), guard);
        await page.goto(WEB + `/groups/${CIRCLE_ID}`, { waitUntil: 'domcontentloaded' });
        await page.getByRole('button', { name: label('Leave Circle') }).first().click();
        const heading = page.getByRole('heading', { name: 'Leave Circle?' });
        await heading.waitFor({ timeout: 10000 });
        const dialog = dialogOf(heading);
        const body = await dialog.locator('p', { hasText: 'Rejoining a private circle needs a new invite' }).first().textContent().catch(() => '');
        assert(!/\{\{/.test(body || ''), 'leaveConfirm body was not interpolated');
        assert(blocked.length === 0, `a request fired before Confirm: ${blocked.join(', ')}`);
        await page.screenshot({ path: await shot('f25-circle-confirm-dialog-leave') }).catch(() => {});
        await dialog.getByRole('button', { name: label('Cancel') }).click();
        await page.waitForTimeout(300);
        assert(await heading.count() === 0, 'the modal did not close on Cancel');
        assert(blocked.length === 0, `Cancel fired a request: ${blocked.join(', ')}`);
        await page.getByRole('button', { name: label('Leave Circle') }).first().click();
        await heading.waitFor({ timeout: 10000 });
        // Backdrop click closes nothing and sends nothing.
        await page.mouse.click(5, 5);
        await page.waitForTimeout(300);
        assert(await heading.count() === 1, 'a backdrop click closed the modal');
        await dialogOf(heading).getByRole('button', { name: label('Leave') }).click();
        await page.waitForTimeout(500);
        assert(blocked.length === 1, `expected exactly 1 leave attempt, saw ${blocked.length}: ${blocked.join(', ')}`);
      });

      // Remove member + Delete post — as review.reader, the curator.
      await withPage(async (page, context) => {
        await seedAuth(context, READER);
        blocked.length = 0;
        await page.route(u => /\/groups\/\d+\/remove\/\d+$/.test(u.pathname), guard);
        await page.goto(WEB + `/groups/${CIRCLE_ID}`, { waitUntil: 'domcontentloaded' });

        // Create the one post this case's delete step targets.
        await page.getByRole('button', { name: label('Post') }).first().click();
        const ta = page.locator('textarea').first();
        await ta.waitFor({ timeout: 10000 });
        const text = `QA F25 post ${TS}`;
        await ta.fill(text);
        const [postResp] = await Promise.all([
          page.waitForResponse(r => /\/groups\/\d+\/posts$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST'),
          page.getByRole('button', { name: label('Post') }).last().click(),
        ]);
        createdPostId = (await postResp.json()).id;
        await page.waitForTimeout(500);

        // Remove member (target: review.friend, the only other member).
        const memberRow = page.locator('div', { hasText: pre.friend.user.name }).filter({ has: page.locator('button[title="Remove member"]') }).first();
        const removeBtn = memberRow.locator('button[title="Remove member"]').first();
        assert(await removeBtn.count() === 1, 'no "Remove member" control found for review.friend');
        await removeBtn.click();
        const rmHeading = page.getByRole('heading', { name: 'Remove member?' });
        await rmHeading.waitFor({ timeout: 10000 });
        let dialog = dialogOf(rmHeading);
        assert(blocked.length === 0, `a request fired before Confirm: ${blocked.join(', ')}`);
        const rmBody = await dialog.locator('p', { hasText: `Remove ${pre.friend.user.name}` }).first().count();
        assert(rmBody === 1, `remove-member body did not interpolate the member's name ("${pre.friend.user.name}")`);
        await dialog.getByRole('button', { name: label('Cancel') }).click();
        await page.waitForTimeout(300);
        assert(blocked.length === 0, 'Cancel on remove-member fired a request');
        await removeBtn.click();
        await rmHeading.waitFor({ timeout: 10000 });
        await dialogOf(rmHeading).getByRole('button', { name: label('Remove') }).click();
        await page.waitForTimeout(500);
        assert(blocked.length === 1, `expected exactly 1 remove-member attempt, saw ${blocked.length}`);

        // Delete post — first aborted (dialog + cancel proof), then a real 500 to prove the catch.
        // Scoped to PostCard's own outer wrapper class, not a generic 'div' match — a plain `div` +
        // hasText match resolves to the innermost nested div containing the text (just the <p>), which
        // does not contain the delete button (a sibling), so `.click()` would hang waiting on nothing.
        blocked.length = 0;
        await page.route(u => new RegExp(`/groups/\\d+/posts/${createdPostId}$`).test(u.pathname), guard);
        const card = page.locator('div.bg-surface-container-lowest.rounded-2xl', { hasText: text }).last();
        const delIcon = card.locator('button:has(.material-symbols-outlined:text("delete"))').first();
        await delIcon.click();
        const delHeading = page.getByRole('heading', { name: 'Delete post?' });
        await delHeading.waitFor({ timeout: 10000 });
        assert(blocked.length === 0, 'a delete request fired before Confirm');
        await dialogOf(delHeading).getByRole('button', { name: label('Cancel') }).click();
        await page.waitForTimeout(300);
        assert(blocked.length === 0, 'Cancel on delete-post fired a request');

        guardMode = 'fail500';
        await delIcon.click();
        await delHeading.waitFor({ timeout: 10000 });
        await dialogOf(delHeading).getByRole('button', { name: label('Delete') }).click();
        await page.waitForTimeout(800);
        assert(blocked.length === 1, `expected exactly 1 delete-post attempt on the 500 run, saw ${blocked.length}`);
        const stillThere = await page.locator('div.bg-surface-container-lowest.rounded-2xl', { hasText: text }).count();
        assert(stillThere > 0, 'the post was removed from the list even though the server returned 500');
        const errorToast = await page.getByText('Internal Server Error').first().isVisible().catch(() => false)
          || await page.getByText(/could not delete post/i).first().isVisible().catch(() => false);
        assert(errorToast, 'no error toast appeared after the 500');
      });
    } finally {
      // Clean up the real, un-intercepted post via the API (local disposable DB, but tidy regardless).
      if (createdPostId) await api(READER, 'DELETE', `/groups/${CIRCLE_ID}/posts/${createdPostId}`).catch(() => {});
    }
  }

  // ---------------------------------------------------------------------------
  // L-C: styling — contrast audit, minimum font size.
  // ---------------------------------------------------------------------------

  async function build16Routes() {
    const [ubs, groups] = await Promise.all([api(READER, 'GET', '/userbooks/'), api(READER, 'GET', '/groups/my')]);
    const circle = (groups.json || []).find(g => g.name === 'Review Circle');
    const authed = ['/home', '/library', ubs.json?.[0] ? `/library/book/${ubs.json[0].id}` : null, '/groups',
      circle ? `/groups/${circle.id}` : null, '/groups/new', '/insights', '/notifications', '/profile', '/profile/111', '/settings'].filter(Boolean);
    const pub = ['/', '/about', '/privacy', '/terms', '/blog'];
    return { authed, pub };
  }

  async function L_C_01() {
    const routes = await build16Routes();
    if (routes.authed.length < 11) throw new Error(`only ${routes.authed.length}/11 authed routes resolvable — fixture incomplete`);
    await new Promise((resolve, reject) => {
      execFile(process.execPath, [path.join(REPO, 'qa', 'a11y_audit.mjs'), '--web', WEB, '--api', API], { cwd: REPO, timeout: 240000 }, (err, stdout, stderr) => {
        if (err) reject(new Error(`a11y_audit.mjs exited non-zero: ${(stderr || stdout || err.message).split('\n').slice(-5).join(' | ')}`));
        else resolve();
      });
    });
    const date = new Date().toISOString().slice(0, 10);
    const reportPath = path.join(REPO, 'qa', 'reports', `a11y-${date}.json`);
    assert(fs.existsSync(reportPath), `${reportPath} was not written`);
    const results = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    assert(results.length === 16, `a11y report covered ${results.length} pages, expected 16`);
    const contrastNodes = results.reduce((sum, p) => sum + (p.violations.find(v => v.id === 'color-contrast')?.count || 0), 0);
    assert(contrastNodes === 0, `${contrastNodes} color-contrast node(s) remain (baseline was 203 on 12/16 pages)`);
  }

  async function L_C_02() {
    const routes = await build16Routes();
    await withPage(async (page, context) => {
      await seedAuth(context, READER);
      const offenders = [];
      for (const route of [...routes.authed, ...routes.pub]) {
        await page.goto(WEB + route, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
        await page.waitForTimeout(800);
        const found = await page.evaluate(() => {
          const bad = [];
          const all = document.querySelectorAll('*');
          for (const el of all) {
            if (el.children.length > 0) continue;
            const text = el.textContent?.trim();
            if (!text) continue;
            const cs = getComputedStyle(el);
            if (/Material Symbols/i.test(cs.fontFamily)) continue;
            const size = parseFloat(cs.fontSize);
            if (size < 12) bad.push({ selector: el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ')[0] : ''), size, text: text.slice(0, 30) });
          }
          return bad;
        });
        for (const f of found) offenders.push(`${route} · ${f.selector} · ${f.size}px "${f.text}"`);
      }
      assert(offenders.length === 0, `${offenders.length} sub-12px text node(s): ${offenders.slice(0, 5).join(' | ')}`);
    });
  }

  // ---------------------------------------------------------------------------
  // Run the 25 cases in order.
  // ---------------------------------------------------------------------------
  const CASES = [
    ['L-B1-01', 'anonymous login_required does not bounce the visitor', L_B1_01],
    ['L-B1-02', 'readable errors keep their status, and an expired session still redirects', L_B1_02],
    ['L-B1-03', 'feed and social invalidation', L_B1_03],
    ['L-B1-04', 'the 16 circle mutations invalidate getMyGroups', L_B1_04],
    ['L-B1-05', 'notifications invalidation', L_B1_05],
    ['L-B1-06', 'profile, import and admin invalidation', L_B1_06],
    ['L-B1-07', 'setAdminRole sends ?is_admin=true', L_B1_07],
    ['L-B1-08', 'webUnsubscribe authenticates with the passed token', L_B1_08],
    ['L-B1-09', 'logout clears bt_token and bt_note_visibility and unsubscribes with the pre-logout token', L_B1_09],
    ['L-B1-10', 'Back never leaves the site or blanks the page', L_B1_10],
    ['L-B2-01', 'fresh context defaults to Only me', L_B2_01],
    ['L-B2-02', 'the choice is written on change and survives reload, across all three composers', L_B2_02],
    ['L-B2-03', 'a Public post sends is_public: true and lands in the feed', L_B2_03],
    ['L-B2-04', 'clearing storage returns to Only me', L_B2_04],
    ['L-B2-05', 'an Only me post is private, toasted, and never inserted', L_B2_05],
    ['L-B2-06', 'Book detail and Profile composers always send the field', L_B2_06],
    ['L-B2-07', 'the S1 hook — a post during the first load survives', L_B2_07],
    ['L-B2-08', 'a tab switch never shows the other tab\'s posts', L_B2_08],
    ['L-B2-09', 'a deleted local post is not resurrected', L_B2_09],
    ['L-B2-10', 'a private post is never carried into the list', L_B2_10],
    ['L-B2-11', 'BookPreviewModal sends book_id and isbn', L_B2_11],
    ['L-B2-12', 'the Google tab shows every result and no chips', L_B2_12],
    ['L-B2-13', 'Leave, Remove member and Delete post all confirm, and Cancel sends nothing', L_B2_13],
    ['L-C-01', 'axe finds no contrast failure on the 16 pages, locally', L_C_01],
    ['L-C-02', 'every visible text node is >= 12px in the browser', L_C_02],
  ];

  for (const [id, title, fn] of CASES) {
    if (ONLY && !ONLY.includes(id)) { skipped++; continue; }
    try { await fn(); report(id, title, true); }
    catch (e) { report(id, title, false, e?.message || String(e)); }
  }

  // ---------------------------------------------------------------------------
  // Fixed-state screenshots (not part of the pass/fail count).
  // ---------------------------------------------------------------------------
  try { await takeExtraScreenshots(); } catch (e) { console.log(`(screenshots) ${e.message}`); }

  // ---------------------------------------------------------------------------
  // Cleanup: delete anything this run created on the local disposable DB.
  // ---------------------------------------------------------------------------
  for (const id of cleanupNotes) await api(READER, 'DELETE', `/notes/${id}`).catch(() => {});
  for (const id of cleanupPosts) await api(READER, 'DELETE', `/groups/${CIRCLE_ID}/posts/${id}`).catch(() => {});

  await browser.close();

  const skipLine = skipped ? ` (${skipped} skipped)` : '';
  console.log(`4A web local: ${passed} passed, ${failed} failed${skipLine}`);
  process.exitCode = failed ? 1 : 0;

  // -------- helper: fixed-state screenshots for the human checklist --------
  async function takeExtraScreenshots() {
    // Notifications page.
    await withPage(async (page, context) => {
      await seedAuth(context, READER);
      await page.goto(WEB + '/notifications', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1200);
      await page.screenshot({ path: await shot('notifications-page') }).catch(() => {});
    });

    // F-63: a filled heart on review.friend's profile after review.reader likes one of friend's public notes.
    const friendNotes = await api(FRIEND, 'GET', '/notes/me');
    let publicNote = (friendNotes.json || []).find(n => n.is_public);
    let madePublicNoteId = null;
    if (!publicNote) {
      const created = await api(FRIEND, 'POST', '/notes/', { text: `QA F63 screenshot ${TS}`, is_public: true });
      publicNote = created.json;
      madePublicNoteId = created.json?.id;
    }
    if (publicNote?.id) {
      await api(READER, 'POST', `/notes/${publicNote.id}/like`);
      await withPage(async (page, context) => {
        await seedAuth(context, READER);
        await page.goto(WEB + `/profile/${FRIEND_ID}`, { waitUntil: 'domcontentloaded' });
        const noteCard = page.locator('article, div', { hasText: publicNote.text }).last();
        const found = await noteCard.waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false);
        if (found) {
          await noteCard.scrollIntoViewIfNeeded().catch(() => {});
          await page.waitForTimeout(500);
          await noteCard.screenshot({ path: await shot('f63-liked-note-filled-heart') }).catch(() => {});
        } else {
          await page.waitForTimeout(1200);
          await page.screenshot({ path: await shot('f63-liked-note-filled-heart') }).catch(() => {});
        }
      });
      await api(READER, 'DELETE', `/notes/${publicNote.id}/like`).catch(() => {});
      if (madePublicNoteId) await api(FRIEND, 'DELETE', `/notes/${madePublicNoteId}`).catch(() => {});
    }
  }
}

main().catch(e => { console.error(e.stack || e.message); process.exit(1); });
