// qa/web_4d_local.mjs
// Sprint 4D local web test harness — page-load-order cases from
// features/maintenance/sprint-4d-page-speed/tests.md sections 2-3 (26 cases: L-4D-01..17, 10b, 10c,
// 02b, 06b, 06c, 08b, 11b, 13b, 13c, 14b).
//
// The point of this harness (section 0/appendix "the red-first gate"): run it against TODAY'S
// unmodified web app and prove it goes red for the right reasons — every "order" case fails because
// the app blocks on identity before starting its own data, not because of a selector typo. WEB-A and
// WEB-B then write the product code that turns these green; this file is not touched by them.
//
// Never production (K-13/ST-4D-09): refuses --web / --api pointing at trackmyread.com or onrender.com.
// Never "localhost" (K-13): refuses if --web / --api literally say localhost — use 127.0.0.1.
// Preconditions (section 2.1): local API commit is null, the web dev server's served
// src/services/api.js references --api (proves --mode localapi), review-login works for both
// accounts, a token minted with this shell's SECRET_KEY gets 200 on /profile/me (K-11), and the
// review.reader / review.friend fixture (Review Circle, userbooks) exists. Any missing precondition
// -> exit 6.
//
// Usage (from repo root):
//   node qa/web_4d_local.mjs --web http://127.0.0.1:5178 --api http://127.0.0.1:8766
//   node qa/web_4d_local.mjs --only L-4D-09,L-4D-16 --web http://127.0.0.1:5178 --api http://127.0.0.1:8766
//
// Secret: REVIEW_LOGIN_SECRET env var, else <repo>/.env.review. SECRET_KEY must also be in this
// shell's env (same value the local API was started with) to mint the tokens K-11 needs. Neither is
// ever printed.
// Output: one line per case, "PASS <id> <title> [<labels>]" or "FAIL <id> <title> — <first failing
// detail>", then "4D web local: <n> passed, <m> failed" (plus a skip count with --only).
// Evidence: qa/reports/web-4d-local-<date>.json — paths and timings only, never a token/secret.
// Exit: 0 all ran cases passed; 1 some FAILED; 5 a production host was passed; 6 a precondition
// is missing. Exit 5 and 6 are never a pass.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const WEB = arg('web', 'http://127.0.0.1:5174').replace(/\/$/, '');
const API = arg('api', 'http://127.0.0.1:8765').replace(/\/$/, '');
const API_ORIGIN = new URL(API).origin;
// Route predicates must match the API origin, never the app's own origin. Several SPA routes have
// the same path as an API endpoint (`/groups/1`, `/profile/123`), so a path-only predicate also
// caught the page's own HTML navigation and held it: L-4D-11 and L-4D-14 then could not pass
// however correct the product was, and mutating the product changed nothing (PM, 2026-09-20).
const isApi = u => { try { return new URL(u).origin === API_ORIGIN; } catch { return false; } };
const ONLY = arg('only', null)?.split(',').map(s => s.trim()).filter(Boolean) || null;
const SECRET_FILE = arg('secret-file', path.join(REPO, '.env.review'));
const TS = Date.now().toString(36);

// ---------- never production (K-13 / ST-4D-09) ----------
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

// ---------- K-11: mint a real HS256 JWT with this shell's SECRET_KEY, no dependency added ----------
const b64url = buf => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function signHS256(payload, secret) {
  const seg1 = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const seg2 = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', secret).update(`${seg1}.${seg2}`).digest();
  return `${seg1}.${seg2}.${b64url(sig)}`;
}
function mintToken(email, secret, expiresInSec) {
  return signHS256({ sub: email, exp: Math.floor(Date.now() / 1000) + expiresInSec }, secret);
}

// ---------- preconditions (exit 6 with each missing one named) ----------
async function checkPreconditions(secret) {
  const missing = [];
  for (const [name, url] of [['--web', WEB], ['--api', API]]) {
    if (/^https?:\/\/localhost(?::|\/|$)/i.test(url)) missing.push(`${name}=${url} uses "localhost" — use 127.0.0.1 (K-13)`);
  }
  if (!secret) { missing.push(`REVIEW_LOGIN_SECRET not set (env or ${SECRET_FILE})`); return { missing }; }

  const version = await fetch(`${API}/version`).then(r => r.ok ? r.json() : null).catch(() => null);
  if (!version || version.commit !== null) {
    missing.push(`GET ${API}/version did not return commit:null (got ${JSON.stringify(version)}) — this is not the local 4D backend, refusing to run against it`);
  }

  const apiJsText = await fetch(`${WEB}/src/services/api.js`).then(r => r.ok ? r.text() : '').catch(() => '');
  if (!apiJsText) {
    missing.push(`GET ${WEB}/src/services/api.js did not respond — is the web dev server running (npm --prefix book-tracker-frontend-stitch run dev -- --mode localapi --port <port> --host 127.0.0.1)?`);
  } else if (!apiJsText.includes(API)) {
    missing.push(`served src/services/api.js does not reference ${API} (VITE_API_BASE_URL) — web dev server is not running --mode localapi, or --api does not match its target`);
  }

  const reader = await reviewLogin('review.reader@trackmyread.com', secret);
  if (!reader.ok) missing.push(reader.reason);
  const friend = await reviewLogin('review.friend@trackmyread.com', secret);
  if (!friend.ok) missing.push(friend.reason);

  let mintedReaderToken = null, mintedExpiredToken = null;
  const SECRET_KEY = process.env.SECRET_KEY;
  if (!SECRET_KEY) {
    missing.push('SECRET_KEY not set in this shell\'s env — needed to mint a 2-minute reader token and an expired one (K-11)');
  } else if (reader.ok) {
    mintedReaderToken = mintToken('review.reader@trackmyread.com', SECRET_KEY, 120);
    const r = await api(mintedReaderToken, 'GET', '/profile/me');
    if (r.status !== 200) {
      missing.push(`a token minted with this shell's SECRET_KEY did not get 200 on GET /profile/me (got ${r.status}) — SECRET_KEY does not match the running local API`);
    }
    mintedExpiredToken = mintToken('review.reader@trackmyread.com', SECRET_KEY, -3600);
  }

  let fixture = null;
  if (reader.ok && friend.ok) {
    const [groups, ubs, friendGroups, friendUbs, friendMe] = await Promise.all([
      api(reader.token, 'GET', '/groups/my'), api(reader.token, 'GET', '/userbooks/'),
      api(friend.token, 'GET', '/groups/my'), api(friend.token, 'GET', '/userbooks/'),
      api(friend.token, 'GET', '/profile/me'),
    ]);
    const circle = (groups.json || []).find(g => g.name === 'Review Circle');
    if (!circle) missing.push('review.reader has no "Review Circle" — run scripts/seed_review_accounts.py against this API first');
    else if (circle.membership_role !== 'curator') missing.push('review.reader is not the curator of Review Circle');
    if (!ubs.json || ubs.json.length === 0) missing.push('review.reader has no userbooks — run scripts/seed_review_accounts.py against this API first');
    const friendCircle = circle ? (friendGroups.json || []).find(g => g.id === circle.id) : null;
    if (circle && !friendCircle) missing.push('review.friend is not a member of Review Circle');
    else if (friendCircle && (friendCircle.membership_role === 'curator' || friendCircle.membership_status !== 'active')) {
      missing.push('review.friend must be an active, non-curator member of Review Circle');
    }
    if (friendMe.json?.is_admin) missing.push('review.friend has is_admin:true — L-4D-06/06b/06c need a non-admin friend');
    fixture = {
      circleId: circle?.id ?? null,
      inviteCode: circle?.invite_code ?? null,
      userbookId: ubs.json?.[0]?.id ?? null,
      friendUserbookId: friendUbs.json?.[0]?.id ?? null,
    };
  }
  return { missing, reader, friend, fixture, mintedReaderToken, mintedExpiredToken };
}

// ---------- reporting ----------
let passed = 0, failed = 0, skipped = 0;
const evidence = {};
function report(id, title, ok, detail, labels) {
  if (ok) { console.log(`PASS ${id} ${title}${labels ? ` [${labels.join(' ')}]` : ''}`); passed++; }
  else { console.log(`FAIL ${id} ${title} — ${String(detail).split('\n')[0].slice(0, 300)}`); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

// ---------- browser / page helpers ----------
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
// K-12: a per-document init script re-plants the token on every load, including the reload api.js
// makes after a 401 — that would make a bad token come back forever. These cases seed once instead:
// open a public, token-free page, THEN write the token via evaluate, THEN goto the real route.
async function seedOnce(page, token) {
  await page.goto(WEB + '/about', { waitUntil: 'domcontentloaded' });
  await page.evaluate(t => {
    localStorage.setItem('bt_token', t);
    localStorage.setItem('bt_onboarding_v1', 'done');
  }, token);
}

async function callApi(page, name, ...args) {
  return page.evaluate(async ({ name, args }) => {
    const m = await import('/src/services/api.js');
    const hydrated = args.map(a => (a && a.__file) ? new File([a.__file.content], a.__file.name, { type: a.__file.type }) : a);
    try { const value = await m[name](...hydrated); return { ok: true, value }; }
    catch (e) { return { ok: false, message: e.message, status: e.status, code: e.code }; }
  }, { name, args });
}

async function avatarValue(page) {
  const el = page.locator('[data-tour="avatar"]').first();
  if (await el.count() === 0) return null;
  const img = el.locator('img');
  if (await img.count() > 0) return (await img.getAttribute('alt')) || '';
  return (await el.innerText()).trim();
}
async function fullScreenLoadingVisible(page) {
  return (await page.getByText('Loading...', { exact: true }).count()) > 0;
}
async function loginPageVisible(page) {
  const title = await page.title().catch(() => '');
  return title.startsWith('TrackMyRead — Social Book Tracker');
}
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const label = text => new RegExp(`^\\s*(?:[a-z_]+\\s+){0,2}${esc(text)}\\s*$`, 'i');

// ---------- timeline: every request/response to <api>, start/end in ms from t0 ----------
function makeTimeline(page, t0) {
  const rows = [];
  const byReq = new Map();
  const onReq = req => {
    if (!req.url().startsWith(API)) return;
    const u = new URL(req.url());
    const row = { method: req.method(), path: u.pathname + u.search, start: Date.now() - t0, end: null, status: null, auth: !!req.headers()['authorization'] };
    byReq.set(req, row); rows.push(row);
  };
  const onResp = resp => { const row = byReq.get(resp.request()); if (row) row.status = resp.status(); };
  const onDone = req => { const row = byReq.get(req); if (row && row.end == null) row.end = Date.now() - t0; };
  const onFail = req => { const row = byReq.get(req); if (row && row.end == null) { row.end = Date.now() - t0; row.failed = true; } };
  page.on('request', onReq); page.on('response', onResp); page.on('requestfinished', onDone); page.on('requestfailed', onFail);
  return {
    rows,
    firstStart(pathname) { const m = rows.filter(r => r.path.split('?')[0] === pathname); return m.length ? Math.min(...m.map(r => r.start)) : null; },
    startsMatching(test) { const m = rows.filter(r => test(r.path)); return m.map(r => r.start); },
    countMatching(test) { return rows.filter(r => test(r.path)).length; },
    stop() { page.off('request', onReq); page.off('response', onResp); page.off('requestfinished', onDone); page.off('requestfailed', onFail); },
  };
}

// ---------- hold: fetch-first, deliver late. Returns a handle the case asserts H1-H3 on. ----------
async function hold(context, test, ms, { modify } = {}) {
  const h = { entries: [] };
  await context.route(u => isApi(u) && test(new URL(u)), async route => {
    if (route.request().method() !== 'GET') return route.continue();
    const e = { url: route.request().url(), enteredAt: Date.now() };
    h.entries.push(e);
    const resp = await route.fetch();
    e.fetchedAt = Date.now();
    let body;
    if (modify) { try { body = JSON.stringify(modify(await resp.json())); } catch { /* non-JSON body */ } }
    await new Promise(r => setTimeout(r, ms));
    await route.fulfill({ response: resp, ...(body !== undefined ? { body } : {}) });
    e.fulfilledAt = Date.now();
  });
  return h;
}
function holdT(h, t0) { return Math.min(...h.entries.map(e => e.fulfilledAt - t0)); }
function assertHoldControls(h, ms) {
  assert(h.entries.length >= 1, 'hold matched no request');
  for (const e of h.entries) {
    assert(e.fulfilledAt != null, 'hold entry never fulfilled');
    assert(e.fulfilledAt - e.enteredAt >= ms - 100, `held response was not actually held (${e.fulfilledAt - e.enteredAt}ms, wanted >= ${ms - 100}ms)`);
    assert(e.fetchedAt != null, 'hold entry missing fetchedAt (delay-then-continue, not fetch-then-delay)');
    assert(e.fetchedAt - e.enteredAt < ms - 500, `hold looks like delay-then-continue: fetchedAt-enteredAt=${e.fetchedAt - e.enteredAt}ms`);
  }
}

// park: like hold, but released by the case. release(n) releases oldest n; releaseAll releases every
// currently-parked request. Used by L-4D-09 and L-4D-10b.
function makePark() {
  const parked = [];
  return {
    handler: async route => {
      if (route.request().method() !== 'GET') return route.continue();
      const resp = await route.fetch();
      parked.push({ route, resp, enteredAt: Date.now() });
    },
    count: () => parked.length,
    release(n = 1) {
      const batch = parked.splice(0, Math.min(n, parked.length));
      for (const { route, resp } of batch) route.fulfill({ response: resp }).catch(() => {});
      return batch.length;
    },
    releaseAll() { return this.release(parked.length); },
  };
}

function makeIdleTracker(page) {
  let inflight = 0, last = Date.now();
  const onReq = r => { if (r.url().startsWith(API)) { inflight++; last = Date.now(); } };
  const onDone = r => { if (r.url().startsWith(API)) { inflight = Math.max(0, inflight - 1); last = Date.now(); } };
  page.on('request', onReq); page.on('requestfinished', onDone); page.on('requestfailed', onDone);
  return {
    async waitIdle(ms, capMs = 15000) {
      const cap = Date.now() + capMs;
      while (Date.now() < cap && (inflight > 0 || Date.now() - last < ms)) await new Promise(r => setTimeout(r, 50));
    },
    stop() { page.off('request', onReq); page.off('requestfinished', onDone); page.off('requestfailed', onDone); },
  };
}

// ---------- observers: "never shown" checks with a positive control, per case ----------
// detectors: [{ id, type: 'regexText'|'iconInContainer'|'textAnywhere', ... }]. Also always records
// an avatar-value history (value + first-seen timestamp) for the pending-identity cases.
async function installWatcher(page, detectors) {
  await page.addInitScript(dets => {
    window.__qa = { installed: true, hits: {}, avatarHistory: [] };
    for (const d of dets) window.__qa.hits[d.id] = null;
    const textOf = el => (el.innerText || el.textContent || '').trim();
    function check() {
      for (const d of dets) {
        if (window.__qa.hits[d.id] != null) continue;
        let found = false;
        if (d.type === 'regexText') {
          const re = new RegExp(d.pattern, d.flags || '');
          const all = document.querySelectorAll(d.within || 'button, a, span');
          for (const el of all) { if (re.test(textOf(el))) { found = true; break; } }
        } else if (d.type === 'iconInContainer') {
          let containers = [...document.querySelectorAll(d.containerSelector || 'article')]
            .filter(c => textOf(c).includes(d.containerText));
          // Innermost matches only. A selector like 'div, article' also matches ancestors that wrap
          // several posts, so a sibling post's own delete icon was attributed to this one and the
          // case failed identically whether the product was broken or not (PM, 2026-09-20).
          containers = containers.filter(c => !containers.some(o => o !== c && c.contains(o)));
          for (const c of containers) {
            const icons = c.querySelectorAll('.material-symbols-outlined');
            for (const ic of icons) { if (textOf(ic) === d.icon) { found = true; break; } }
            if (found) break;
          }
        } else if (d.type === 'textAnywhere') {
          found = !!(document.body && document.body.innerText.includes(d.text));
        }
        if (found) window.__qa.hits[d.id] = Date.now();
      }
      const av = document.querySelector('[data-tour="avatar"]');
      if (av) {
        const img = av.querySelector('img');
        const val = img ? (img.getAttribute('alt') || '') : textOf(av);
        const hist = window.__qa.avatarHistory;
        if (!hist.length || hist[hist.length - 1].value !== val) hist.push({ value: val, at: Date.now() });
      }
    }
    const mo = new MutationObserver(check);
    const start = () => { if (document.documentElement) { mo.observe(document.documentElement, { childList: true, subtree: true, characterData: true }); check(); } };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
    setInterval(check, 100);
  }, detectors);
}
async function watcherState(page) { return page.evaluate(() => window.__qa || null); }

function evidenceFor(id) { return (evidence[id] = evidence[id] || {}); }

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
  const CIRCLE = pre.fixture.circleId;
  const CODE = pre.fixture.inviteCode;
  const UB = pre.fixture.userbookId;
  let FUB = pre.fixture.friendUserbookId;
  const SECRET_KEY = process.env.SECRET_KEY;

  browser = await chromium.launch();
  const cleanupNotes = new Set();       // reader note ids
  const cleanupFriendNotes = new Set(); // friend note ids
  const cleanupPosts = new Set();       // {circleId, postId}
  const cleanupGroups = new Set();      // private circle ids created during a case

  // If the friend has no userbook (L-4D-13b / 14 need one), seed one directly (no Google Books call).
  let seededFUB = false;
  if (!FUB) {
    const created = await api(FRIEND, 'POST', '/books/add-to-library', { title: `QA 4D seed ${TS}`, total_pages: 100, status: 'to-read' });
    if (created.status === 200) { FUB = created.json.id; seededFUB = true; }
  }

  // ---- fixtures created up-front, removed in finally ----
  const feedNote = await api(READER, 'POST', '/notes/', { text: `QA 4D feed ${TS}`, is_public: true });
  if (feedNote.status === 201) cleanupNotes.add(feedNote.json.id);
  const bdNote = await api(READER, 'POST', '/notes/', { userbook_id: UB, text: `QA 4D bd ${TS}`, is_public: false });
  if (bdNote.status === 201) cleanupNotes.add(bdNote.json.id);
  const circlePost = await api(READER, 'POST', `/groups/${CIRCLE}/posts`, { text: `QA 4D circle ${TS}` });
  if (circlePost.status === 201) cleanupPosts.add({ circleId: CIRCLE, postId: circlePost.json.id });
  const foreignNote = await api(FRIEND, 'POST', '/notes/', { userbook_id: FUB, text: `QA 4D foreign ${TS}`, is_public: false });
  if (foreignNote.status === 201) cleanupFriendNotes.add(foreignNote.json.id);

  // Original values to restore (K-01/09/16/14b).
  const readerProfileBefore = (await api(READER, 'GET', '/profile/me')).json;
  const friendProfileBefore = (await api(FRIEND, 'GET', '/profile/me')).json;
  const followBefore = (await api(READER, 'GET', '/users/following')).json || [];
  const readerFollowsFriend = followBefore.some(u => u.id === FRIEND_ID);

  async function restoreReaderProfile() {
    await api(READER, 'PUT', '/profile/me', {
      name: readerProfileBefore.name, bio: readerProfileBefore.bio, yearly_goal: readerProfileBefore.yearly_goal,
    }).catch(() => {});
  }
  async function restoreFriendPrivacy() {
    await api(FRIEND, 'PUT', '/profile/me', { is_private_profile: !!friendProfileBefore.is_private_profile }).catch(() => {});
  }
  async function restoreFollow(shouldFollow) {
    if (shouldFollow) await api(READER, 'POST', `/follow/${FRIEND_ID}`).catch(() => {});
    else await api(READER, 'DELETE', `/follow/${FRIEND_ID}`).catch(() => {});
  }

  // ===========================================================================================
  // R-01 — signed-in pages start their own data at once (F-69)
  // ===========================================================================================

  async function L_4D_01() {
    await withPage(async (page, context) => {
      await seedAuth(context, READER);
      const t0 = Date.now();
      const tl = makeTimeline(page, t0);
      const h = await hold(context, u => u.pathname === '/profile/me', 2000);
      await page.goto(WEB + '/home', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(900);
      const s1 = Date.now() - t0;
      const avatar1 = await avatarValue(page);
      const loadingVisible = await fullScreenLoadingVisible(page);
      const articleCount = await page.locator('article').count();
      await page.waitForResponse(r => new URL(r.url()).pathname === '/profile/me', { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(700); // let requests the resolved identity triggers actually fire before we look
      const T = holdT(h, t0);
      assertHoldControls(h, 2000);
      assert(s1 <= T - 500, `sampled too late: s1=${s1} T=${T}`);
      for (const p of ['/notes/feed', '/books/recommendations', '/userbooks/', '/users/following', '/userbooks/friends/currently-reading', '/notifications/unread-count']) {
        const fs_ = tl.firstStart(p);
        assert(fs_ !== null, `${p} was never requested`);
        assert(fs_ <= T - 1000, `${p} first started at ${fs_} ms; held /profile/me answered at T=${T} ms (needs <= ${T - 1000})`);
      }
      assert(avatar1 === '?', `avatar read "${avatar1}" at s1=${s1} ms, expected "?"`);
      assert(!loadingVisible, 'full-screen Loading... visible while identity was pending');
      assert(articleCount >= 1, `no feed article visible at s1=${s1} ms`);
      await page.waitForTimeout(Math.max(0, (T + 500) - (Date.now() - t0)));
      const avatar2 = await avatarValue(page);
      assert(avatar2 !== '?', `avatar still reads "?" at T+500, expected the reader's initials`);
      const bad = tl.rows.find(r => r.status && r.status >= 400);
      assert(!bad, `response >= 400: ${JSON.stringify(bad)}`);
    });
  }

  const ROUTE_ROWS = () => ([
    { route: '/home', early: ['/notes/feed', '/userbooks/', '/books/recommendations', '/users/following', '/userbooks/friends/currently-reading'], kind: 'private', finalPath: '/home' },
    { route: '/library', early: ['/userbooks/', '/reading-activity/daily'], kind: 'private', finalPath: '/library' },
    { route: `/library/book/${UB}`, early: ['/userbooks/', `/notes/userbook/${UB}`], kind: 'private', finalPath: `/library/book/${UB}` },
    { route: '/search', early: [], kind: 'private', finalPath: '/search' },
    { route: '/groups', early: ['/groups/my', '/groups/discover', '/groups/invites/pending', '/groups/my/pending'], kind: 'private', finalPath: '/groups' },
    { route: `/groups/${CIRCLE}`, early: [`/groups/${CIRCLE}`, `/groups/${CIRCLE}/members`, `/groups/${CIRCLE}/leaderboard`, `/groups/${CIRCLE}/goal`, `/groups/${CIRCLE}/posts`, `/groups/${CIRCLE}/activity`], kind: 'private', finalPath: `/groups/${CIRCLE}` },
    { route: '/groups/new', early: [], kind: 'private', finalPath: '/groups/new' },
    { route: `/join/${CODE}`, early: [], kind: 'join', finalPath: `/groups/${CIRCLE}` },
    { route: '/insights', early: ['/reading-activity/insights'], kind: 'private', finalPath: '/insights' },
    { route: '/notifications', early: ['/notifications/history'], kind: 'private', finalPath: '/notifications' },
    { route: '/profile', early: ['/notes/me', '/userbooks/', '/reading-activity/daily', '/reading-activity/insights'], kind: 'private', finalPath: '/profile' },
    { route: `/profile/${FRIEND_ID}`, early: [`/profile/${FRIEND_ID}`, `/userbooks/user/${FRIEND_ID}`, `/notes/user/${FRIEND_ID}`, `/reading-activity/user/${FRIEND_ID}/daily`, `/users/${FRIEND_ID}/stats`], kind: 'private', finalPath: `/profile/${FRIEND_ID}` },
    { route: '/settings', early: ['/notifications/prefs'], kind: 'private', finalPath: '/settings' },
    { route: '/', early: [], kind: 'root', finalPath: '/home' },
    { route: '/about', early: [], kind: 'public', finalPath: '/about' },
    { route: '/privacy', early: [], kind: 'public', finalPath: '/privacy' },
    { route: '/terms', early: [], kind: 'public', finalPath: '/terms' },
    { route: '/blog', early: [], kind: 'public', finalPath: '/blog' },
  ]);

  async function L_4D_02() {
    const failures = [];
    for (const row of ROUTE_ROWS()) {
      try {
        await withPage(async (page, context) => {
          await seedAuth(context, READER);
          const t0 = Date.now();
          const tl = makeTimeline(page, t0);
          const h = await hold(context, u => u.pathname === '/profile/me', 2000);
          await page.goto(WEB + row.route, { waitUntil: 'domcontentloaded' });
          await page.waitForResponse(r => new URL(r.url()).pathname === '/profile/me', { timeout: 8000 }).catch(() => {});
          await page.waitForTimeout(700); // let requests the resolved identity triggers actually fire before we look
          assertHoldControls(h, 2000);
          const T = holdT(h, t0);
          for (const p of row.early) {
            const fs_ = tl.firstStart(p);
            assert(fs_ !== null, `${row.route}: ${p} was never requested`);
            assert(fs_ <= T - 1000, `${row.route}: ${p} first started at ${fs_} ms (T=${T})`);
          }
          if (row.kind === 'join') {
            const joinStart = tl.startsMatching(p => p === `/groups/join/${CODE}`)[0];
            assert(joinStart !== undefined, `${row.route}: POST /groups/join/${CODE} was never sent`);
            assert(joinStart <= T - 1000, `${row.route}: join POST first started at ${joinStart} ms (T=${T})`);
          }
          for (const p of row.early) {
            const starts = tl.startsMatching(pp => pp.split('?')[0] === p);
            assert(!starts.some(s => s > T), `${row.route}: ${p} re-fired at ${starts.find(s => s > T)} ms (T=${T})`);
          }
          await page.waitForTimeout(1500);
          const path1 = new URL(page.url()).pathname;
          if (row.kind === 'root') {
            const s1 = Date.now() - t0;
            assert(s1 <= T + 1500, `sample window elapsed before redirect check`);
            assert(path1 === '/home', `still on / (final path ${path1}), expected /home`);
          } else if (row.kind === 'join') {
            await page.waitForTimeout(200);
            const path2 = new URL(page.url()).pathname;
            assert(path2 === row.finalPath, `final path ${path2}, expected ${row.finalPath} after the join success view`);
          } else if (row.kind === 'public') {
            const bodyLen = await page.evaluate(() => document.body.innerText.length);
            const stillLoading = await fullScreenLoadingVisible(page);
            assert(bodyLen > 200, `${row.route}: body innerText length ${bodyLen}, expected > 200`);
            assert(!stillLoading, `${row.route}: full-screen Loading... still visible`);
            assert(path1 === row.route, `${row.route}: path changed to ${path1}`);
          } else {
            assert(path1 === row.finalPath, `${row.route}: final path ${path1}, expected ${row.finalPath}`);
          }
          const bad = tl.rows.find(r => r.status && r.status >= 400);
          assert(!bad, `${row.route}: response >= 400: ${JSON.stringify(bad)}`);
        });
      } catch (e) { failures.push(`[${row.route}] ${e.message}`); }
    }
    assert(failures.length === 0, failures.join(' | '));
  }

  async function L_4D_02b() {
    await withPage(async (page, context) => {
      await seedAuth(context, READER);
      const t0 = Date.now();
      const h = await hold(context, u => u.pathname === '/profile/me', 2000);
      await page.goto(WEB + '/onboarding', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(900);
      const s1 = Date.now() - t0;
      const loadingVisible = await fullScreenLoadingVisible(page);
      const hasAvatar = (await page.locator('[data-tour="avatar"]').count()) > 0;
      await page.waitForResponse(r => new URL(r.url()).pathname === '/profile/me', { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(300);
      const T = holdT(h, t0);
      assertHoldControls(h, 2000);
      assert(s1 <= T - 500, `sampled too late: s1=${s1} T=${T}`);
      assert(loadingVisible, 'full-screen Loading... was not visible during the deliberate onboarding wait');
      assert(!hasAvatar, 'Nav avatar was present during the deliberate onboarding wait');
      await page.waitForTimeout(Math.max(0, (T + 500) - (Date.now() - t0)));
      const path = new URL(page.url()).pathname;
      const hasAvatar2 = (await page.locator('[data-tour="avatar"]').count()) > 0;
      assert(path === '/onboarding', `final path ${path}, expected /onboarding`);
      assert(!hasAvatar2, 'Nav avatar present on /onboarding (OnboardingPage has no AppLayout)');
    });
  }

  // ===========================================================================================
  // R-02 — sign-in outcomes do not change
  // ===========================================================================================

  async function L_4D_03() {
    const failures = [];
    for (const route of ['/', '/home', '/library', `/groups/${CIRCLE}`, '/profile', '/settings', '/admin', '/onboarding', `/join/${CODE}`]) {
      try {
        await withPage(async (page, context) => {
          const docLoads = [];
          page.on('load', () => docLoads.push(Date.now()));
          const authRequests = [];
          const apiRequests = [];
          page.on('request', r => { if (r.url().startsWith(API)) { apiRequests.push(r.url()); if (r.headers()['authorization']) authRequests.push(r.url()); } });
          await installWatcher(page, []);
          await page.goto(WEB + route, { waitUntil: 'domcontentloaded' }).catch(() => {});
          await page.waitForTimeout(5000);
          assert(docLoads.length <= 2, `${route}: ${docLoads.length} document loads in 5s (<= 2)`);
          const p = new URL(page.url()).pathname;
          assert(p === '/', `${route}: final path ${p}, expected /`);
          assert(await loginPageVisible(page), `${route}: login page not visible (title was not TrackMyRead — Social Book Tracker...)`);
          assert(authRequests.length === 0, `${route}: ${authRequests.length} request(s) carried Authorization`);
          assert(apiRequests.length === 0, `${route}: ${apiRequests.length} request(s) to <api> were made with no token`);
          const w = await watcherState(page);
          const sawAvatar = await page.evaluate(() => !!document.querySelector('[data-tour="avatar"]'));
          assert(!sawAvatar, `${route}: a signed-in page rendered without a token (Nav avatar appeared)`);
        });
      } catch (e) { failures.push(`[${route}] ${e.message}`); }
    }
    assert(failures.length === 0, failures.join(' | '));
  }

  async function L_4D_04() {
    const failures = [];
    for (const [label_, token] of [['invalid.token.value', 'invalid.token.value'], ['expired JWT', pre.mintedExpiredToken]]) {
      for (const route of ['/', '/home', `/groups/${CIRCLE}`, `/join/${CODE}`]) {
        try {
          await withPage(async (page) => {
            await seedOnce(page, token);
            const docLoads = [];
            page.on('load', () => docLoads.push(Date.now()));
            await page.goto(WEB + route, { waitUntil: 'domcontentloaded' }).catch(() => {});
            await page.waitForTimeout(8000);
            const p = new URL(page.url()).pathname;
            assert(p === '/', `(${label_}) ${route}: final path ${p}, expected /`);
            assert(await loginPageVisible(page), `(${label_}) ${route}: login page not visible`);
            const tok = await page.evaluate(() => localStorage.getItem('bt_token'));
            assert(tok === null, `(${label_}) ${route}: bt_token was "${tok}", expected null`);
            assert(docLoads.length <= 3, `(${label_}) ${route}: ${docLoads.length} document loads in 8s (<= 3)`);
            const visible = await page.evaluate(() => ({
              article: !!document.querySelector('article'),
              avatar: !!document.querySelector('[data-tour="avatar"]'),
            }));
            assert(!visible.article && !visible.avatar, `(${label_}) ${route}: signed-in content still visible at the end`);
          });
        } catch (e) { failures.push(`[${label_} ${route}] ${e.message}`); }
      }
    }
    assert(failures.length === 0, failures.join(' | '));
  }

  async function L_4D_05() {
    const failures = [];
    for (const variant of ['500', 'offline']) {
      for (const route of ['/home', '/library', `/join/${CODE}`]) {
        try {
          await withPage(async (page, context) => {
            await seedOnce(page, READER);
            let joinStatus = null;
            await context.route(u => isApi(u) && new URL(u).pathname === '/profile/me', route_ => {
              if (variant === '500') return route_.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'Internal Server Error' }) });
              return route_.abort('failed');
            });
            await context.route(u => isApi(u) && new URL(u).pathname === `/groups/join/${CODE}`, async route_ => {
              const resp = await route_.fetch().catch(() => null);
              if (resp) joinStatus = resp.status();
              if (resp) await route_.fulfill({ response: resp }); else await route_.continue();
            });
            await page.goto(WEB + route, { waitUntil: 'domcontentloaded' }).catch(() => {});
            await page.waitForTimeout(6000);
            const p = new URL(page.url()).pathname;
            assert(p === '/', `(${variant}) ${route}: final path ${p}, expected /`);
            assert(await loginPageVisible(page), `(${variant}) ${route}: login page not visible`);
            const tok = await page.evaluate(() => localStorage.getItem('bt_token'));
            assert(tok === null, `(${variant}) ${route}: bt_token was "${tok}", expected null`);
            evidenceFor('L-4D-05')[`${variant}-${route}`] = { joinStatus };
          });
        } catch (e) { failures.push(`[${variant} ${route}] ${e.message}`); }
      }
    }
    assert(failures.length === 0, failures.join(' | '));
  }

  // ===========================================================================================
  // R-03 — nothing shows the wrong identity while the answer is pending
  // ===========================================================================================

  async function L_4D_06() {
    await withPage(async (page, context) => {
      await seedAuth(context, FRIEND);
      const t0 = Date.now();
      const tl = makeTimeline(page, t0);
      await installWatcher(page, [{ id: 'admin-link', type: 'regexText', pattern: '^Admin$', within: 'nav a, nav button', flags: '' }]);
      const h = await hold(context, u => u.pathname === '/profile/me', 2000);
      await page.goto(WEB + '/admin', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(8000);
      assertHoldControls(h, 2000);
      const adminHits = tl.rows.filter(r => r.path.startsWith('/admin/'));
      assert(adminHits.length === 0, `GET ${adminHits[0]?.path} requested at ${adminHits[0]?.start} ms`);
      const path = new URL(page.url()).pathname;
      assert(path === '/home', `final path ${path}, expected /home`);
      const w = await watcherState(page);
      assert(w && w.hits['admin-link'] == null, 'the Nav showed an Admin link for a non-admin friend');
    });
  }

  async function L_4D_06b() {
    await withPage(async (page, context) => {
      await seedAuth(context, FRIEND);
      const t0 = Date.now();
      const tl = makeTimeline(page, t0);
      const h = await hold(context, u => u.pathname === '/profile/me', 2000, { modify: j => ({ ...j, is_admin: true }) });
      await page.goto(WEB + '/admin', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);
      assertHoldControls(h, 2000);
      const T = holdT(h, t0);
      const adminStarts = tl.startsMatching(p => p.startsWith('/admin/'));
      assert(!adminStarts.some(s => s < T), `an /admin/ request started before T=${T} (starts: ${adminStarts})`);
      assert(adminStarts.some(s => s > T), `no /admin/ request started after T=${T} — the admin page never mounted`);
      const path = new URL(page.url()).pathname;
      assert(path === '/admin', `final path ${path}, expected /admin`);
      await page.waitForTimeout(500);
      const adminLinkVisible = await page.getByRole('link', { name: 'Admin' }).count();
      assert(adminLinkVisible > 0, 'the Nav did not show the Admin link for an admin user after T+500');
    });
  }

  async function L_4D_06c() {
    await withPage(async (page, context) => {
      await seedAuth(context, FRIEND);
      let h1 = await hold(context, u => u.pathname === '/profile/me', 2000, { modify: j => ({ ...j, is_admin: true }) });
      await page.goto(WEB + '/admin', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2500);

      const storageScan = await page.evaluate(email => {
        const hay = [];
        for (const store of [localStorage, sessionStorage]) {
          for (let i = 0; i < store.length; i++) { const k = store.key(i); hay.push(String(store.getItem(k))); }
        }
        const blob = hay.join('\n');
        return { hasIsAdmin: blob.includes('is_admin'), hasEmail: blob.includes(email) };
      }, pre.friend.user.email);
      assert(!storageScan.hasIsAdmin, 'localStorage/sessionStorage holds an is_admin field');
      assert(!storageScan.hasEmail, 'localStorage/sessionStorage holds the friend\'s email');

      await context.unroute(u => new URL(u).pathname === '/profile/me').catch(() => {});
      const t0b = Date.now();
      const tl = makeTimeline(page, t0b);
      const h2 = await hold(context, u => u.pathname === '/profile/me', 2000);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(6000);
      assertHoldControls(h2, 2000);
      const adminHits = tl.rows.filter(r => r.path.startsWith('/admin/'));
      assert(adminHits.length === 0, `after reload, GET ${adminHits[0]?.path} was requested`);
      const path = new URL(page.url()).pathname;
      assert(path === '/home', `after reload, final path ${path}, expected /home`);
      const adminLinkVisible = await page.getByRole('link', { name: 'Admin' }).count();
      assert(adminLinkVisible === 0, 'the Admin link appeared after reload for a non-admin friend');
    });
  }

  async function L_4D_07() {
    await withPage(async (page, context) => {
      await seedAuth(context, READER);
      await installWatcher(page, [{ id: 'follow-own', type: 'regexText', pattern: '^\\s*(person_add|person_check)?\\s*(Follow|Follow Back|Following)\\s*$', flags: 'i', within: 'button' }]);
      const h = await hold(context, u => u.pathname === '/profile/me', 2000);
      await page.goto(WEB + `/profile/${READER_ID}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(5000);
      assertHoldControls(h, 2000);
      const w = await watcherState(page);
      assert(w && w.hits['follow-own'] == null, `Follow button visible at ${w?.hits['follow-own']} ms on the reader's own profile`);
      const path = new URL(page.url()).pathname;
      assert(path === '/profile', `final path ${path}, expected /profile within 5s`);
    });
    // Positive control: the same detector must fire on the friend's profile.
    await withPage(async (page, context) => {
      await seedAuth(context, READER);
      await installWatcher(page, [{ id: 'follow-control', type: 'regexText', pattern: '^\\s*(person_add|person_check)?\\s*(Follow|Follow Back|Following)\\s*$', flags: 'i', within: 'button' }]);
      await page.goto(WEB + `/profile/${FRIEND_ID}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);
      const w = await watcherState(page);
      assert(w && w.hits['follow-control'] != null, 'control failed: no Follow button ever recorded on the friend\'s profile');
    });
  }

  async function L_4D_08() {
    await withPage(async (page, context) => {
      await seedAuth(context, READER);
      const feedRes = await api(READER, 'GET', '/notes/feed');
      const template = (feedRes.json || [])[0] || { id: 1, text: 'x', created_at: new Date().toISOString(), likes_count: 0, comments_count: 0, liked_by_me: false };
      const A = { ...template, id: 990000001, text: `QA 4D authorless ${TS}`, user: null, user_id: 999999 };
      const B = { ...template, id: 990000002, text: `QA 4D own ${TS}`, user: { id: READER_ID, name: pre.reader.user.name }, user_id: READER_ID };
      const C = { ...template, id: 990000003, text: `QA 4D other ${TS}`, user: { id: FRIEND_ID, name: pre.friend.user.name }, user_id: FRIEND_ID };
      await context.route(u => isApi(u) && new URL(u).pathname === '/notes/feed', route_ => route_.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([A, B, C]) }));
      await installWatcher(page, [
        { id: 'menu-A', type: 'iconInContainer', containerSelector: 'article', containerText: A.text, icon: 'more_horiz' },
        { id: 'menu-C', type: 'iconInContainer', containerSelector: 'article', containerText: C.text, icon: 'more_horiz' },
      ]);
      const t0 = Date.now();
      const h = await hold(context, u => u.pathname === '/profile/me', 2000);
      await page.goto(WEB + '/home', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(900);
      await page.waitForTimeout(1300);
      assertHoldControls(h, 2000);
      const visible = await page.evaluate(({ a, b, c }) => {
        const body = document.body.innerText;
        return { a: body.includes(a), b: body.includes(b), c: body.includes(c) };
      }, { a: A.text, b: B.text, c: C.text });
      assert(visible.a && visible.b && visible.c, `not all three stub posts rendered (${JSON.stringify(visible)})`);
      const w = await watcherState(page);
      assert(w && w.hits['menu-A'] == null, `authorless post A showed more_horiz at ${w?.hits['menu-A']} ms`);
      assert(w && w.hits['menu-C'] == null, `another user's post C showed more_horiz at ${w?.hits['menu-C']} ms`);
    });
  }

  async function L_4D_08b() {
    await withPage(async (page, context) => {
      await seedAuth(context, FRIEND);
      const postsRes = await api(FRIEND, 'GET', `/groups/${CIRCLE}/posts`);
      const template = (postsRes.json || [])[0] || { id: 1, text: 'x', created_at: new Date().toISOString() };
      const A = { ...template, id: 990000011, text: `QA 4D circle-authorless ${TS}`, user: null, user_id: 999999 };
      const B = { ...template, id: 990000012, text: `QA 4D circle-own ${TS}`, user: { id: FRIEND_ID, name: pre.friend.user.name }, user_id: FRIEND_ID };
      await context.route(u => isApi(u) && new URL(u).pathname === `/groups/${CIRCLE}/posts`, route_ => route_.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([A, B]) }));
      await installWatcher(page, [
        { id: 'delete-A', type: 'iconInContainer', containerSelector: 'div, article', containerText: A.text, icon: 'delete' },
      ]);
      const t0 = Date.now();
      const h = await hold(context, u => u.pathname === '/profile/me', 2000);
      await page.goto(WEB + `/groups/${CIRCLE}`, { waitUntil: 'domcontentloaded' });
      await page.waitForResponse(r => new URL(r.url()).pathname === '/profile/me', { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(1200); // let the circle page's own load() chain (getGroup, then the sections) settle
      assertHoldControls(h, 2000);
      const visible = await page.evaluate(({ a, b }) => ({ a: document.body.innerText.includes(a), b: document.body.innerText.includes(b) }), { a: A.text, b: B.text });
      assert(visible.a && visible.b, `not both stub posts rendered (${JSON.stringify(visible)})`);
      const w = await watcherState(page);
      const hitAt = w?.hits['delete-A'];
      assert(w && hitAt == null, `authorless circle post showed a delete control at ${hitAt != null ? hitAt - t0 : hitAt} ms`);
    });
  }

  // ===========================================================================================
  // R-04 — a profile edit saved in the first seconds is not lost
  // ===========================================================================================

  async function L_4D_09() {
    try {
      await withPage(async (page, context) => {
        await api(READER, 'PUT', '/profile/me', { name: 'Qa Reader', bio: '4d-09 bio', yearly_goal: 24 });
        await seedAuth(context, READER);
        const park = makePark();
        await context.route(u => isApi(u) && new URL(u).pathname === '/profile/me', park.handler);
        await page.goto(WEB + '/settings', { waitUntil: 'domcontentloaded' });
        const nameInput = page.locator('input').first();
        let releases = 0;
        while (releases < 8) {
          const val = await nameInput.inputValue().catch(() => '');
          if (val === 'Qa Reader') break;
          const av = await avatarValue(page);
          assert(av === '?' || av === null, `Nav avatar read "${av}" before the Settings form was usable (released ${releases})`);
          park.release(1); releases++;
          await page.waitForTimeout(250);
        }
        const finalVal = await nameInput.inputValue().catch(() => '');
        assert(finalVal === 'Qa Reader', `setup: identity landed before the Settings form was usable (released ${releases})`);
        assert(park.count() >= 1, 'setup: no /profile/me was still parked when the form became usable');

        await nameInput.fill('Zed Quill');
        const [putResp] = await Promise.all([
          page.waitForResponse(r => new URL(r.url()).pathname === '/profile/me' && r.request().method() === 'PUT'),
          page.getByRole('button', { name: /Save/i }).first().click(),
        ]);
        assert(putResp.status() === 200, `PUT /profile/me returned ${putResp.status()}`);
        const putBody = JSON.parse(putResp.request().postData());
        assert(putBody.yearly_goal === 24, `PUT body had yearly_goal=${putBody.yearly_goal}, expected 24 (the form was loaded)`);
        await page.waitForTimeout(300);
        const avMid = await avatarValue(page);
        assert(avMid === '?' || avMid === null, `avatar read "${avMid}" 300ms after the PUT, expected still unknown (no partial user object)`);
        park.releaseAll();
        await page.waitForTimeout(1000);
        const avFinal = await avatarValue(page);
        assert(avFinal === 'ZQ', `avatar read "${avFinal}" after all /profile/me answered, expected "ZQ"`);
        const me = await api(READER, 'GET', '/profile/me');
        assert(me.json.name === 'Zed Quill', `server name is "${me.json.name}", expected "Zed Quill"`);
        assert(me.json.yearly_goal === 24, `server yearly_goal is ${me.json.yearly_goal}, expected 24`);
        assert(me.json.bio === '4d-09 bio', `server bio is "${me.json.bio}", expected "4d-09 bio"`);
      });
    } finally { await restoreReaderProfile(); }
  }

  async function L_4D_16() {
    try {
      await withPage(async (page, context) => {
        await api(READER, 'PUT', '/profile/me', { name: 'Qa Reader', bio: '4d-09 bio', yearly_goal: 24 });
        await seedAuth(context, READER);
        const t0 = Date.now();
        const h = await hold(context, u => u.pathname === '/profile/me', 3000);
        await page.goto(WEB + '/settings', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(200);
        assert(h.entries.length >= 1, 'hold matched no request');
        const estT = Math.min(...h.entries.map(e => e.enteredAt)) - t0 + 3000;
        await page.waitForTimeout(Math.max(0, (estT - 1300) - (Date.now() - t0)));
        const s1 = Date.now() - t0;
        assert(s1 <= estT - 1000, `sampled too late: s1=${s1} estT=${estT}`);
        const nameInput = page.locator('input').first();
        const nameCount = await nameInput.count();
        assert(nameCount > 0, 'the name input did not exist during the pending window');
        const disabledStates = await page.evaluate(() => {
          const inputs = Array.from(document.querySelectorAll('input')).slice(0, 3);
          const btn = Array.from(document.querySelectorAll('button')).find(b => /save/i.test(b.textContent || ''));
          const toggle = document.querySelector('button[aria-label="Toggle private profile"]');
          return {
            inputs: inputs.map(i => i.disabled),
            save: btn ? btn.disabled : null,
            toggle: toggle ? toggle.disabled : null,
          };
        });
        assert(disabledStates.inputs.every(Boolean), `not every profile input was disabled during the pending window: ${JSON.stringify(disabledStates)}`);
        assert(disabledStates.save === true, `Save was not disabled during the pending window: ${JSON.stringify(disabledStates)}`);
        assert(disabledStates.toggle === true, `the privacy toggle was not disabled during the pending window: ${JSON.stringify(disabledStates)}`);
        await nameInput.press('Enter').catch(() => {});
        await page.waitForResponse(r => new URL(r.url()).pathname === '/profile/me', { timeout: 6000 }).catch(() => {});
        await page.waitForTimeout(400);
        const T = holdT(h, t0);
        assertHoldControls(h, 3000);
        await page.waitForTimeout(Math.max(0, (T + 500) - (Date.now() - t0)));
        const values = await page.evaluate(() => {
          const inputs = Array.from(document.querySelectorAll('input'));
          const btn = Array.from(document.querySelectorAll('button')).find(b => /save/i.test(b.textContent || ''));
          return { name: inputs[0]?.value, bio: inputs[1]?.value, goal: inputs[2]?.value, saveDisabled: btn ? btn.disabled : null };
        });
        assert(values.name === 'Qa Reader', `name field shows "${values.name}", expected "Qa Reader"`);
        assert(String(values.goal) === '24', `goal field shows "${values.goal}", expected "24"`);
        assert(values.saveDisabled === false, 'Save is still disabled after the profile loaded');
        const me = await api(READER, 'GET', '/profile/me');
        assert(me.json.yearly_goal === 24, `server yearly_goal is ${me.json.yearly_goal}, expected 24 (unchanged)`);
      });
    } finally { await restoreReaderProfile(); }
  }

  async function L_4D_17() {
    try {
      await withPage(async (page, context) => {
        await seedAuth(context, READER);
        await context.addInitScript(() => {
          Object.defineProperty(Notification, 'permission', { get: () => 'granted', configurable: true });
          const fakeReg = { pushManager: { getSubscription: async () => ({ toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/qa4d17', keys: { p256dh: 'k', auth: 'a' } }) }) }, ready: Promise.resolve() };
          if (!navigator.serviceWorker) Object.defineProperty(navigator, 'serviceWorker', { value: {}, configurable: true });
          // A plain assignment silently no-ops: register/ready are getter-only on the native
          // ServiceWorkerContainer, so `ready` would stay the real (never-resolving, no worker
          // installed) promise and registerWebPush() would hang forever. defineProperty replaces them.
          Object.defineProperty(navigator.serviceWorker, 'register', { value: async () => fakeReg, configurable: true });
          Object.defineProperty(navigator.serviceWorker, 'ready', { value: Promise.resolve(fakeReg), configurable: true });
        });
        let webSubscribeCount = 0;
        await context.route(u => isApi(u) && new URL(u).pathname === '/notifications/vapid-public-key', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ public_key: 'BA'.padEnd(88, 'A') }) }));
        await context.route(u => isApi(u) && new URL(u).pathname === '/notifications/web-subscribe', r => { webSubscribeCount++; return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ message: 'ok' }) }); });
        await page.goto(WEB + '/settings', { waitUntil: 'domcontentloaded' });
        await page.waitForResponse(r => new URL(r.url()).pathname === '/profile/me', { timeout: 20000 }).catch(() => {});
        await page.waitForTimeout(1500);
        const n0 = webSubscribeCount;
        assert(n0 >= 1, `web-subscribe never fired on sign-in/page-load (n0=${n0})`);
        const bioInput = page.locator('textarea').first();
        await bioInput.fill(`4d-17 bio ${TS}`);
        await Promise.all([
          page.waitForResponse(r => new URL(r.url()).pathname === '/profile/me' && r.request().method() === 'PUT'),
          page.getByRole('button', { name: /Save/i }).first().click(),
        ]);
        await page.waitForTimeout(1500);
        assert(webSubscribeCount === n0, `web-subscribe POSTed after the save: ${webSubscribeCount}, expected ${n0}`);
      });
    } finally { await restoreReaderProfile(); }
  }

  // ===========================================================================================
  // R-05 — signing out forgets the previous account's data (F-71)
  // ===========================================================================================

  async function L_4D_10() {
    await withPage(async (page, context) => {
      await seedOnce(page, READER);
      const idle = makeIdleTracker(page);
      await page.goto(WEB + '/library', { waitUntil: 'domcontentloaded' });
      await page.locator('article, div', { hasText: /./ }).first().waitFor({ timeout: 15000 }).catch(() => {});
      await idle.waitIdle(500);
      await page.locator('[data-tour="avatar"]').click();
      await page.getByRole('button', { name: label('Sign out') }).first().click();
      await page.waitForURL(u => new URL(u).pathname === '/', { timeout: 15000 });
      const tok = await page.evaluate(() => localStorage.getItem('bt_token'));
      assert(tok === null, `bt_token was "${tok}" right after sign-out, expected null`);
      const readerBooks = await api(READER, 'GET', '/userbooks/');
      const rSet = await callApi(page, 'setToken', FRIEND);
      const r = await callApi(page, 'getMyBooks');
      assert(r.ok, `getMyBooks after sign-out failed: ${r.message}`);
      const friendIds = (await api(FRIEND, 'GET', '/userbooks/')).json.map(b => b.id).sort();
      const gotIds = (r.value || []).map(b => b.id).sort();
      assert(JSON.stringify(gotIds) === JSON.stringify(friendIds), `getMyBooks after sign-out returned ${JSON.stringify(gotIds)}, expected the friend's ${JSON.stringify(friendIds)}`);
      const readerIds = (readerBooks.json || []).map(b => b.id).sort();
      assert(JSON.stringify(readerIds) !== JSON.stringify(friendIds), 'control failed: reader and friend have the same userbook ids');
    });
  }

  async function L_4D_10b() {
    await withPage(async (page, context) => {
      let gsiStubHits = 0;
      await context.route(u => u.href.startsWith('https://accounts.google.com/gsi/client'), route_ => {
        gsiStubHits++;
        return route_.fulfill({ status: 200, contentType: 'application/javascript', body: `
          window.google = window.google || {};
          window.google.accounts = { id: {
            initialize: (opts) => { window.__gsi = (cred) => opts.callback(cred); },
            renderButton: (el) => { el.innerHTML = '<div>Sign in with Google</div>'; },
            prompt: () => {}, cancel: () => {}, disableAutoSelect: () => {},
          } };
        ` });
      });
      await context.route(u => isApi(u) && new URL(u).pathname === '/auth/google', route_ => route_.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ access_token: FRIEND, is_new: false, user: { id: pre.friend.user.id, name: pre.friend.user.name, email: pre.friend.user.email } }),
      }));
      await seedOnce(page, READER);
      await page.goto(WEB + '/library', { waitUntil: 'domcontentloaded' });
      const idle = makeIdleTracker(page);
      await idle.waitIdle(500);

      const park1 = makePark();
      await context.route(u => isApi(u) && new URL(u).pathname === '/userbooks/', park1.handler);
      const p1 = callApi(page, 'getMyBooks');
      await page.waitForTimeout(300);
      assert(park1.count() === 1, `expected exactly 1 request parked in step 3, saw ${park1.count()}`);
      const r1 = await p1;
      assert(r1.ok && (r1.value || []).length >= 0, 'the cache-hit getMyBooks call did not resolve at once');

      await page.locator('[data-tour="avatar"]').click();
      await page.getByRole('button', { name: label('Sign out') }).first().click();
      await page.waitForURL(u => new URL(u).pathname === '/', { timeout: 15000 });
      const tokAfterLogout = await page.evaluate(() => localStorage.getItem('bt_token'));
      assert(tokAfterLogout === null, `bt_token was "${tokAfterLogout}" after sign-out, expected null`);

      park1.releaseAll();
      await page.waitForTimeout(300);

      await context.unroute(u => new URL(u).pathname === '/userbooks/').catch(() => {});
      const park2 = makePark();
      await context.route(u => isApi(u) && new URL(u).pathname === '/userbooks/', park2.handler);

      await page.evaluate(() => window.__gsi && window.__gsi({ credential: 'qa-fake', select_by: 'btn' }));
      const p2 = callApi(page, 'getMyBooks');
      const resolvedEarly = await Promise.race([p2.then(() => true), new Promise(r => setTimeout(() => r(false), 1500))]);
      assert(!resolvedEarly, `getMyBooks after signing in as the friend resolved from memory within 1500ms (it should have gone to the network)`);
      await page.waitForTimeout(500);
      const pathAfterLogin = new URL(page.url()).pathname;
      const tokAfterLogin = await page.evaluate(() => localStorage.getItem('bt_token'));
      assert(gsiStubHits >= 1, 'the Google Identity Services stub was never served');
      assert(pathAfterLogin === '/home', `final path after sign-in ${pathAfterLogin}, expected /home`);
      assert(tokAfterLogin === FRIEND, 'bt_token after sign-in does not equal the friend\'s token');
      park2.releaseAll();
      const r2 = await p2;
      const friendIds = (await api(FRIEND, 'GET', '/userbooks/')).json.map(b => b.id).sort();
      const gotIds = (r2.value || []).map(b => b.id).sort();
      assert(JSON.stringify(gotIds) === JSON.stringify(friendIds), `getMyBooks after sign-in resolved to ${JSON.stringify(gotIds)}, expected the friend's ${JSON.stringify(friendIds)}`);
    });
  }

  async function L_4D_10c() {
    const readerBooks = (await api(READER, 'GET', '/userbooks/')).json || [];
    const friendBooks = (await api(FRIEND, 'GET', '/userbooks/')).json || [];
    const friendTitles = new Set(friendBooks.map(b => b.book?.title));
    let readerOnlyTitles = readerBooks.map(b => b.book?.title).filter(t => t && !friendTitles.has(t));
    let addedReaderOnly = null;
    if (readerOnlyTitles.length === 0) {
      const created = await api(READER, 'POST', '/books/add-to-library', { title: `QA 4D reader-only ${TS}`, total_pages: 50, status: 'to-read' });
      if (created.status === 200) { addedReaderOnly = created.json.id; readerOnlyTitles = [created.json.book.title]; }
    }
    try {
      await withPage(async (page, context) => {
        await seedOnce(page, READER);
        await page.goto(WEB + '/home', { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => document.querySelector('[data-tour="avatar"]')?.textContent.trim() !== '?', { timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(500); // let /home settle before touching storage
        const staleUser = (await api(READER, 'GET', '/profile/me')).json;
        await page.evaluate(({ u, friendToken }) => {
          localStorage.setItem('bt_user', JSON.stringify(u));
          sessionStorage.setItem('bt_user', JSON.stringify(u));
          localStorage.setItem('bt_token', friendToken);
        }, { u: staleUser, friendToken: FRIEND });
        const t0 = Date.now();
        const h = await hold(context, u => u.pathname === '/profile/me', 2000);
        await installWatcher(page, readerOnlyTitles.map((title, i) => ({ id: `title-${i}`, type: 'textAnywhere', text: title })));
        await page.goto(WEB + '/library', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2500);
        assertHoldControls(h, 2000);
        const T = holdT(h, t0);
        const w = await watcherState(page);
        assert(w && w.installed, 'observer failed to install');
        const preT = w.avatarHistory.filter(e => e.at - t0 < T);
        const relHistory = w.avatarHistory.map(e => ({ value: e.value, at: e.at - t0 }));
        assert(preT.some(e => e.value === '?'), `control failed: no avatar value recorded before T=${T} (${JSON.stringify(relHistory)})`);
        const wrongPre = preT.find(e => e.value !== '?');
        assert(!wrongPre, `avatar read "${wrongPre?.value}" (reader) before T=${T}`);
        for (let i = 0; i < readerOnlyTitles.length; i++) assert(w.hits[`title-${i}`] == null, `reader-only title "${readerOnlyTitles[i]}" appeared in the DOM`);
        await page.waitForTimeout(Math.max(0, (T + 500) - (Date.now() - t0)));
        const after = await avatarValue(page);
        assert(after !== null && after !== '?', `avatar still reads "?" after T+500, expected the friend's identity`);
      });
    } finally {
      if (addedReaderOnly) await api(READER, 'DELETE', `/userbooks/${addedReaderOnly}`).catch(() => {});
    }
  }

  // ===========================================================================================
  // R-06 — circle page (F-70)
  // ===========================================================================================

  async function L_4D_11() {
    const failures = [];
    for (const [tag, token] of [['reader/curator', READER], ['friend/member', FRIEND]]) {
      try {
        await withPage(async (page, context) => {
          await seedAuth(context, token);
          const t0 = Date.now();
          const tl = makeTimeline(page, t0);
          const h = await hold(context, u => u.pathname === `/groups/${CIRCLE}`, 2000);
          await page.goto(WEB + `/groups/${CIRCLE}`, { waitUntil: 'domcontentloaded' });
          await page.waitForTimeout(2500);
          assertHoldControls(h, 2000);
          const T = holdT(h, t0);
          for (const p of [`/groups/${CIRCLE}/members`, `/groups/${CIRCLE}/leaderboard`, `/groups/${CIRCLE}/goal`, `/groups/${CIRCLE}/posts`, `/groups/${CIRCLE}/activity`]) {
            const fs_ = tl.firstStart(p);
            assert(fs_ !== null, `(${tag}) ${p} was never requested`);
            assert(fs_ <= T - 1000, `(${tag}) ${p} first started at ${fs_} ms (T=${T})`);
          }
          const pendingCount = tl.countMatching(p => p === `/groups/${CIRCLE}/pending`);
          const pendingStarts = tl.startsMatching(p => p === `/groups/${CIRCLE}/pending`);
          if (tag === 'reader/curator') {
            assert(pendingCount >= 1, '(reader/curator) /pending was never requested');
            assert(Math.min(...pendingStarts) >= T, `(reader/curator) /pending first start ${Math.min(...pendingStarts)} was before T=${T}`);
            await page.waitForTimeout(500);
            const bodyText = await page.evaluate(() => document.body.innerText);
            assert(bodyText.includes('Review Circle'), 'circle name not visible after T');
          } else {
            assert(pendingCount === 0, `(friend/member) /pending requested ${pendingCount} time(s), expected 0`);
          }
        });
      } catch (e) { failures.push(`[${tag}] ${e.message}`); }
    }
    assert(failures.length === 0, failures.join(' | '));
  }

  async function L_4D_11b() {
    await withPage(async (page, context) => {
      await seedAuth(context, READER);
      const t0 = Date.now();
      const tl = makeTimeline(page, t0);
      const h = await hold(context, u => u.pathname === `/groups/${CIRCLE}/posts`, 2000);
      await page.goto(WEB + `/groups/${CIRCLE}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2500);
      assertHoldControls(h, 2000);
      const T = holdT(h, t0);
      const pendingStart = tl.firstStart(`/groups/${CIRCLE}/pending`);
      assert(pendingStart !== null, '/pending was never requested');
      assert(pendingStart <= T - 1000, `/pending started at ${pendingStart} ms (T=${T})`);
    });
  }

  async function L_4D_12() {
    const priv = await api(READER, 'POST', '/groups/', { name: `QA 4D private ${TS}`, description: 'x', is_private: true, cover_preset: 'teal' });
    assert(priv.status === 201, `arrange: could not create the private circle (${priv.status})`);
    const P = priv.json.id;
    const post = await api(READER, 'POST', `/groups/${P}/posts`, { text: `QA 4D secret ${TS}` });
    try {
      // (i) non-member friend
      await withPage(async (page, context) => {
        await seedAuth(context, FRIEND);
        const t0 = Date.now();
        const tl = makeTimeline(page, t0);
        await installWatcher(page, [
          { id: 'circle-name', type: 'textAnywhere', text: `QA 4D private ${TS}` },
          { id: 'secret-text', type: 'textAnywhere', text: `QA 4D secret ${TS}` },
        ]);
        await page.goto(WEB + `/groups/${P}`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(6000);
        const w = await watcherState(page);
        assert(w && w.hits['circle-name'] == null, 'the private circle\'s name appeared for a non-member');
        assert(w && w.hits['secret-text'] == null, 'the private circle\'s secret post appeared for a non-member');
        const path = new URL(page.url()).pathname;
        assert(path === '/groups', `final path ${path} after 6s, expected /groups`);
        const parentRow = tl.rows.find(r => r.path === `/groups/${P}`);
        assert(parentRow && parentRow.status === 403, `parent GET /groups/${P} returned ${parentRow?.status}, expected 403`);
        const sectionPaths = [`/groups/${P}/members`, `/groups/${P}/leaderboard`, `/groups/${P}/goal`, `/groups/${P}/posts`, `/groups/${P}/activity`];
        const sectionResults = sectionPaths.map(p => tl.rows.find(r => r.path.split('?')[0] === p));
        const requested = sectionResults.filter(Boolean).length;
        const all403 = sectionResults.every(r => r && r.status === 403);
        assert(requested === 5 && all403, `expected 5 of 5 section requests all 403; got ${requested} requested, statuses ${JSON.stringify(sectionResults.map(r => r?.status))}`);
      });
      // (ii) unknown circle
      await withPage(async (page, context) => {
        await seedAuth(context, FRIEND);
        const tl = makeTimeline(page, Date.now());
        await page.goto(WEB + '/groups/99999999', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(4000);
        const path = new URL(page.url()).pathname;
        assert(path === '/groups', `(unknown circle) final path ${path}, expected /groups`);
        const parentRow = tl.rows.find(r => r.path === '/groups/99999999');
        assert(parentRow && parentRow.status === 404, `(unknown circle) parent returned ${parentRow?.status}, expected 404`);
      });
      // (iii) control: the owner does see the name
      await withPage(async (page, context) => {
        await seedAuth(context, READER);
        await installWatcher(page, [{ id: 'circle-name-control', type: 'textAnywhere', text: `QA 4D private ${TS}` }]);
        await page.goto(WEB + `/groups/${P}`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000);
        const w = await watcherState(page);
        assert(w && w.hits['circle-name-control'] != null, 'control failed: the owner never saw the private circle\'s own name');
      });
    } finally {
      await api(READER, 'DELETE', `/groups/${P}`).catch(() => {});
    }
  }

  // ===========================================================================================
  // R-07 — book detail (F-70b)
  // ===========================================================================================

  async function L_4D_13() {
    await withPage(async (page, context) => {
      await seedAuth(context, READER);
      const t0 = Date.now();
      const tl = makeTimeline(page, t0);
      const h = await hold(context, u => u.pathname === '/userbooks/', 2000);
      await page.goto(WEB + `/library/book/${UB}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(5500);
      assertHoldControls(h, 2000);
      const T = holdT(h, t0);
      const fs_ = tl.firstStart(`/notes/userbook/${UB}`);
      assert(fs_ !== null, `/notes/userbook/${UB} was never requested`);
      assert(fs_ <= T - 1000, `/notes/userbook/${UB} first started at ${fs_} ms (T=${T})`);
      const bodyText = await page.evaluate(() => document.body.innerText);
      assert(bodyText.includes(`QA 4D bd ${TS}`), 'the note is not visible within T+5000');
      const bad = tl.rows.find(r => r.status && r.status >= 400);
      assert(!bad, `response >= 400: ${JSON.stringify(bad)}`);
    });
  }

  async function L_4D_13b() {
    await withPage(async (page, context) => {
      await seedAuth(context, READER);
      await installWatcher(page, [{ id: 'foreign-note', type: 'textAnywhere', text: `QA 4D foreign ${TS}` }]);
      const tl = makeTimeline(page, Date.now());
      await page.goto(WEB + `/library/book/${FUB}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(5000);
      const path = new URL(page.url()).pathname;
      assert(path === '/library', `final path ${path} within 5s, expected /library`);
      const notesRow = tl.rows.find(r => r.path === `/notes/userbook/${FUB}`);
      assert(notesRow, `/notes/userbook/${FUB} was never requested`);
      assert(notesRow.status === 404, `/notes/userbook/${FUB} returned ${notesRow.status}, expected 404`);
      const w = await watcherState(page);
      assert(w && w.hits['foreign-note'] == null, 'the foreign note text appeared');
    });
    // control: the friend sees their own note.
    await withPage(async (page, context) => {
      await seedAuth(context, FRIEND);
      await page.goto(WEB + `/library/book/${FUB}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);
      const bodyText = await page.evaluate(() => document.body.innerText);
      assert(bodyText.includes(`QA 4D foreign ${TS}`), 'control failed: the friend does not see their own note');
    });
  }

  async function L_4D_13c() {
    await withPage(async (page, context) => {
      await seedAuth(context, READER);
      await page.goto(WEB + '/library', { waitUntil: 'domcontentloaded' });
      const card = page.locator(`text=${(await api(READER, 'GET', '/userbooks/')).json.find(b => b.id === UB).book.title}`).first();
      await card.click();
      await page.waitForURL(u => new URL(u).pathname === `/library/book/${UB}`, { timeout: 10000 });
      await page.waitForTimeout(1500);
      const bodyText = await page.evaluate(() => document.body.innerText);
      assert(bodyText.includes(`QA 4D bd ${TS}`), 'the note is not visible after opening from Library');
    });
  }

  // ===========================================================================================
  // R-08 — a friend's profile (F-70c)
  // ===========================================================================================

  async function L_4D_14() {
    await withPage(async (page, context) => {
      await seedAuth(context, READER);
      const t0 = Date.now();
      const tl = makeTimeline(page, t0);
      const h = await hold(context, u => u.pathname === `/profile/${FRIEND_ID}`, 2000);
      await page.goto(WEB + `/profile/${FRIEND_ID}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2500);
      assertHoldControls(h, 2000);
      const T = holdT(h, t0);
      for (const p of [`/userbooks/user/${FRIEND_ID}`, `/notes/user/${FRIEND_ID}`, `/reading-activity/user/${FRIEND_ID}/daily`, `/users/${FRIEND_ID}/stats`]) {
        const fs_ = tl.firstStart(p);
        assert(fs_ !== null, `${p} was never requested`);
        assert(fs_ <= T - 1000, `${p} first started at ${fs_} ms (T=${T})`);
      }
      const days90 = tl.startsMatching(p => p.startsWith(`/reading-activity/user/${FRIEND_ID}/daily?days=90`));
      assert(days90.length >= 1 && Math.min(...days90) <= T - 1000, `days=90 activity call not early`);
      const bodyText = await page.evaluate(() => document.body.innerText);
      assert(bodyText.includes(pre.friend.user.name), 'the friend\'s name is not visible after T');
      const bad = tl.rows.find(r => r.status && r.status >= 400);
      assert(!bad, `response >= 400: ${JSON.stringify(bad)}`);
    });
  }

  async function L_4D_14b() {
    try {
      if (readerFollowsFriend) await api(READER, 'DELETE', `/follow/${FRIEND_ID}`);
      await api(FRIEND, 'PUT', '/profile/me', { is_private_profile: true });
      await withPage(async (page, context) => {
        await seedAuth(context, READER);
        const tl = makeTimeline(page, Date.now());
        const bookTitles = ((await api(FRIEND, 'GET', '/userbooks/')).json || []).map(b => b.book?.title).filter(Boolean);
        const noteTexts = ((await api(FRIEND, 'GET', '/notes/me')).json || []).filter(n => n.is_public).map(n => n.text);
        await installWatcher(page, [...bookTitles, ...noteTexts].map((t, i) => ({ id: `content-${i}`, type: 'textAnywhere', text: t })));
        await page.goto(WEB + `/profile/${FRIEND_ID}`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(5000);
        const bodyText = await page.evaluate(() => document.body.innerText);
        assert(bodyText.includes('This profile is private') || /private/i.test(bodyText), 'no "profile is private" message shown');
        const contentPaths = [`/userbooks/user/${FRIEND_ID}`, `/notes/user/${FRIEND_ID}`, `/users/${FRIEND_ID}/stats`];
        const rows = contentPaths.map(p => tl.rows.find(r => r.path.split('?')[0] === p));
        // Count each distinct request once: React StrictMode double-invokes effects in dev, so the
        // same days=30 / days=90 call appears twice and the count read 7 instead of 5 (PM, 2026-09-20).
        const seen90 = new Map();
        for (const r of tl.rows.filter(r => r.path.split('?')[0] === `/reading-activity/user/${FRIEND_ID}/daily`)) {
          if (!seen90.has(r.path)) seen90.set(r.path, r);
        }
        const rows90 = [...seen90.values()];
        const requested = rows.filter(Boolean).length + rows90.length;
        assert(requested === 5, `expected 5 requests (K-09: 3 endpoints + reading-activity called for both days=30 and days=90); got ${requested} (rows=${JSON.stringify(rows.map(r => !!r))}, days90 count=${rows90.length})`);
        const all403 = rows.every(r => r && r.status === 403) && rows90.every(r => r.status === 403);
        assert(all403, `not every content request answered 403: ${JSON.stringify(rows.map(r => r?.status))} / days=${JSON.stringify(rows90.map(r => r.status))}`);
        const w = await watcherState(page);
        for (let i = 0; i < bookTitles.length + noteTexts.length; i++) assert(w.hits[`content-${i}`] == null, 'locked-profile content leaked into the DOM');
        const bad = tl.rows.find(r => r.status >= 400 && !contentPaths.some(p => r.path.split('?')[0] === p) && !r.path.startsWith(`/reading-activity/user/${FRIEND_ID}/daily`) && r.path !== `/profile/${FRIEND_ID}`);
        assert(!bad, `unexpected >=400 response outside the 5 content calls: ${JSON.stringify(bad)}`);
      });
    } finally {
      await restoreFriendPrivacy();
      await restoreFollow(readerFollowsFriend);
    }
  }

  // ===========================================================================================
  // Run the 26 cases, in the plan's order.
  // ===========================================================================================
  const CASES = [
    ['L-4D-01', 'home starts its own data at once while identity is pending', L_4D_01],
    ['L-4D-02', 'every signed-in route (and public/root ones) starts early, does not re-fire, and lands right', L_4D_02],
    ['L-4D-02b', 'onboarding keeps its deliberate wait', L_4D_02b],
    ['L-4D-03', 'no token: never a signed-in request, never a flash of one', L_4D_03],
    ['L-4D-04', 'invalid / expired token: signs out cleanly, no reload loop', L_4D_04],
    ['L-4D-05', 'a failed /profile/me still signs the reader out', L_4D_05],
    ['L-4D-06', 'admin route never fetches /admin/* while identity is pending', L_4D_06],
    ['L-4D-06b', 'admin route renders once identity resolves to an admin', L_4D_06b],
    ['L-4D-06c', 'no identity is persisted; a reload never shows the old identity', L_4D_06c],
    ['L-4D-07', 'your own profile never shows a Follow button while pending', L_4D_07],
    ['L-4D-08', 'an authorless / foreign feed post never shows the own-post menu', L_4D_08],
    ['L-4D-08b', 'an authorless circle post never shows the delete control', L_4D_08b],
    ['L-4D-09', 'an edit saved in the first seconds is not lost to a stale answer', L_4D_09],
    ['L-4D-16', 'Settings stays disabled until its own profile has loaded (K-01)', L_4D_16],
    ['L-4D-17', 'a profile edit does not re-register web push', L_4D_17],
    ['L-4D-10', 'sign-out clears the previous account out of memory (F-71)', L_4D_10],
    ['L-4D-10b', 'sign-in clears memory too, before the next read', L_4D_10b],
    ['L-4D-10c', 'a stale identity blob in storage is never drawn', L_4D_10c],
    ['L-4D-11', "the circle page's five sections start early; pending is curator-only and never blocks them", L_4D_11],
    ['L-4D-11b', "the curator's pending call does not wait for the five", L_4D_11b],
    ['L-4D-12', 'a private / unknown circle never leaks, and 403s every section', L_4D_12],
    ['L-4D-13', 'book detail notes start early on a direct open', L_4D_13],
    ['L-4D-13b', "a foreign userbook id 404s and never shows the other reader's note", L_4D_13b],
    ['L-4D-13c', 'opening from the Library card still shows the note', L_4D_13c],
    ['L-4D-14', "a friend's profile content starts early", L_4D_14],
    ['L-4D-14b', 'a locked profile 403s every content call and leaks nothing', L_4D_14b],
  ];

  for (const [id, title, fn] of CASES) {
    if (ONLY && !ONLY.includes(id)) { skipped++; continue; }
    try { await fn(); report(id, title, true); }
    catch (e) { report(id, title, false, e?.message || String(e)); }
  }

  // ---------------------------------------------------------------------------
  // Cleanup: delete anything this run created on the local disposable DB.
  // ---------------------------------------------------------------------------
  for (const id of cleanupNotes) await api(READER, 'DELETE', `/notes/${id}`).catch(() => {});
  for (const id of cleanupFriendNotes) await api(FRIEND, 'DELETE', `/notes/${id}`).catch(() => {});
  for (const { circleId, postId } of cleanupPosts) await api(READER, 'DELETE', `/groups/${circleId}/posts/${postId}`).catch(() => {});
  for (const id of cleanupGroups) await api(READER, 'DELETE', `/groups/${id}`).catch(() => {});
  await restoreReaderProfile().catch(() => {});
  if (seededFUB && FUB) await api(FRIEND, 'DELETE', `/userbooks/${FUB}`).catch(() => {});

  await browser.close();

  const date = new Date().toISOString().slice(0, 10);
  const dir = path.join(REPO, 'qa', 'reports'); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `web-4d-local-${date}.json`), JSON.stringify({ date, web: WEB, api: API, passed, failed, skipped, evidence }, null, 2));

  const skipLine = skipped ? ` (${skipped} skipped)` : '';
  console.log(`4D web local: ${passed} passed, ${failed} failed${skipLine}`);
  process.exitCode = failed ? 1 : 0;
}

main().catch(e => { console.error(e.stack || e.message); process.exit(1); });
