// qa/web_4f_local.mjs
// Sprint 4F package P3 — the *rendered* half of the badge cases:
// L-4F-01..04 from features/community/sprint-4f-activity-engine/tests.md §4.2, plus L-4F-06.
// L-4F-05 asserted R-05a's in-text line and is GONE: the PM withdrew R-05a on 2026-09-29.
// L-4F-06 replaces it and covers the second thing the PM asked for on the same day — a bot's
// card must carry the cover and title a reader's does.
//
// W-04..W-07 in qa/unit/botBadge.test.mjs prove the badge is written at the seven R-03 sites. A
// source scan cannot prove that the pill actually paints, that a reader's card gains no height, or
// that a `user` object with no `is_bot` key does not crash the page. That is this file.
//
// TWO FIXTURE SOURCES, one set of cases:
//
//   --mock  (no backend)  every request to the API origin is served by page.route from the fixtures
//           below. Needs only the web dev server. This is what a Builder can run on a branch where
//           package P2 has not merged yet — the API does not serialise `is_bot` until it does, so
//           the API mode below cannot produce a badged post at all.
//   --api   (the plan's shape, same as qa/web_4d_local.mjs) the fixtures come from a local backend.
//           Refuses to run unless GET /notes/feed already carries `is_bot` on its `user` objects
//           AND the feed holds one bot-authored and one reader-authored post — a bot account cannot
//           be created through the API (R-05/R-08), so it is seeded in the local SQLite DB by hand.
//
// Never production (qa/RULES_OF_ENGAGEMENT.md): refuses --web / --api pointing at trackmyread.com
// or onrender.com (exit 5). Never the literal "localhost" — use 127.0.0.1 (exit 6).
// No token or secret is ever printed.
//
// Read --web off the dev server's own "Local:" line, not off the --port you asked for: Vite
// prints "Port N is in use, trying another one..." and binds N+1 when N is taken, and N may
// then belong to a different checkout. The harness refuses to run if that has happened
// (see treeMismatchReason below) — it used to run anyway, and reported a wrong answer.
//
// Usage (from the repo root):
//   node qa/web_4f_local.mjs --mock --web http://127.0.0.1:5178
//   node qa/web_4f_local.mjs --web http://127.0.0.1:5178 --api http://127.0.0.1:8766
//   node qa/web_4f_local.mjs --mock --web http://127.0.0.1:5178 --only L-4F-02
//
// Output: one line per case, then "4F web local: <n> passed, <m> failed".
// Exit: 0 every run case passed; 1 some FAILED; 5 a production host was passed; 6 a precondition is
// missing. Exit 5 and 6 are never a pass.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const flag = n => argv.includes(`--${n}`);
const WEB = arg('web', 'http://127.0.0.1:5174').replace(/\/$/, '');
const API = arg('api', 'http://127.0.0.1:8765').replace(/\/$/, '');
const API_ORIGIN = new URL(API).origin;
const MOCK = flag('mock');
const ONLY = arg('only', null)?.split(',').map(s => s.trim()).filter(Boolean) || null;
const SECRET_FILE = arg('secret-file', path.join(REPO, '.env.review'));

// R-05a is WITHDRAWN (PM decision, 2026-09-29). There is no in-text line to look for any more,
// and L-4F-05 — which asserted it — is gone with it. L-4F-06 below replaces it: the bot's card
// must carry the same book furniture a reader's does, which is the second thing the PM asked for.
// The cover is an inline data: URI on purpose. `page.route` only intercepts the API origin, so a
// real https cover URL would be fetched for real: it fails to resolve offline, the card's onError
// handler hides the thumbnail, and the failed request also lands in L-4F-04's console-error check.
// A data: URI keeps both cases about rendering rather than about the network.
const COVER_DATA_URI = 'data:image/svg+xml;utf8,'
  + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="120"><rect width="80" height="120" fill="#00695c"/></svg>');
const BOT_BOOK = {
  id: 4401, title: 'The Wager', author: 'David Grann',
  cover_url: COVER_DATA_URI,
  google_books_id: null, isbn: '9780385534260', total_pages: 352,
};

// ---------- never production ----------
for (const [name, url] of [['--web', WEB], ['--api', MOCK ? WEB : API]]) {
  if (/trackmyread\.com|onrender\.com/i.test(url)) {
    console.error(`refusing to run: ${name}=${url} looks like a production host (qa/RULES_OF_ENGAGEMENT.md)`);
    process.exit(5);
  }
}

// ---------- the mock fixture: one bot post, one reader post ----------
const BOT = { id: 901, name: 'TrackMyRead Bestsellers', username: 'TMRBot', profile_picture: null, is_bot: true };
const READER = { id: 110, name: 'Review Reader', username: 'review.reader', profile_picture: null, is_bot: false };
const NOW = new Date().toISOString();

const FIXTURE_FEED = [
  {
    id: 9001, text: "The Wager by David Grann\n\n#1 NYT Hardcover Nonfiction - 4 weeks\n\nA shipwreck, a mutiny, and two irreconcilable stories of what happened.",
    quote: null, image_url: null,
    created_at: NOW, updated_at: null, is_public: true, user_id: BOT.id, user: { ...BOT },
    book: { ...BOT_BOOK }, likes_count: 0, comments_count: 0, liked_by_me: false,
  },
  {
    id: 9002, text: 'Finished this on the train and sat with it for a while.', quote: null, image_url: null,
    created_at: NOW, updated_at: null, is_public: true, user_id: READER.id, user: { ...READER },
    book: null, likes_count: 0, comments_count: 0, liked_by_me: false,
  },
];

// `strip` removes `is_bot` from every user object, which is exactly what the pre-4F API returned and
// exactly what a stale 60-second GET cache can still serve (api.js:10-44) — L-4F-04.
const stripIsBot = value => JSON.parse(JSON.stringify(value), function (k, v) { return k === 'is_bot' ? undefined : v; });

function mockBody(pathname, search, { strip }) {
  const q = new URLSearchParams(search);
  const give = v => (strip ? stripIsBot(v) : v);
  if (pathname === '/profile/me') return give({ ...READER, email: 'review.reader@trackmyread.com', bio: null, is_admin: false, created_at: NOW });
  if (pathname === `/profile/${BOT.id}`) return give({ ...BOT, bio: 'Automated account. Weekly bestsellers.', created_at: NOW, followers_count: 0, following_count: 0, is_following: false });
  if (pathname === '/notes/feed' || pathname === '/notes/friends-feed') return give(FIXTURE_FEED);
  if (pathname === `/notes/user/${BOT.id}`) return give([FIXTURE_FEED[0]]);
  if (pathname === '/users/search') return give(q.get('q') ? [{ ...BOT }] : []);
  if (pathname === '/users/following') return give([{ ...BOT }]);
  if (pathname === '/userbooks/friends/currently-reading') return [];
  if (/^\/users\/\d+\/stats$/.test(pathname)) return {};
  if (/^\/notes\/\d+\/comments$/.test(pathname)) return [];
  if (pathname === '/notifications/unread-count') return { count: 0 };
  // everything else the page happens to ask for: a list, so nothing hangs and nothing throws.
  return [];
}

async function installMock(context, { strip = false } = {}) {
  await context.route(`${API_ORIGIN}/**`, async route => {
    const u = new URL(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(mockBody(u.pathname, u.search, { strip })),
    });
  });
}

// ---------- API-mode plumbing (the plan's shape; mirrors qa/web_4d_local.mjs:33-60) ----------
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
  }).catch(() => null);
  if (!r || !r.ok) {
    const why = !r ? 'no response' : r.status === 404 ? 'REVIEW_LOGIN_SECRET / REVIEW_LOGIN_EMAILS not configured on this API'
      : r.status === 401 ? 'secret or email rejected' : `HTTP ${r.status}`;
    return { ok: false, reason: `review-login ${email} failed: ${why}` };
  }
  const j = await r.json();
  return { ok: true, token: j.access_token, user: j.user };
}
const b64url = buf => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function mintToken(email, secret, ttl) {
  const seg1 = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const seg2 = b64url(JSON.stringify({ sub: email, exp: Math.floor(Date.now() / 1000) + ttl }));
  const sig = crypto.createHmac('sha256', secret).update(`${seg1}.${seg2}`).digest();
  return `${seg1}.${seg2}.${b64url(sig)}`;
}

// ---------- is `--web` actually serving THIS tree, at THIS moment? ----------
//
// Why this exists (found on 2026-09-29, and it produced a wrong answer before it was caught):
// `npm run dev -- --port 5178` prints "Port 5178 is in use, trying another one..." and binds
// 5179 when something already holds 5178. The operator then runs this harness against 5178 —
// the port they asked for — and every case happily measures *another checkout's* dev server.
// A mutation applied to this worktree did not bite, and the harness reported PASS.
//
// The check has two halves, because there are two ways to measure the wrong thing and they
// need different remedies:
//
//   IDENTITY — Vite's dev transform of a .jsx module names the module's ABSOLUTE path (the
//     react-refresh registration, and the sourcemap). If that path is not inside this
//     harness's own repo root, the server belongs to a different checkout. Content alone is
//     not enough here: sibling worktrees usually hold byte-identical files, so a content
//     check passes right up to the moment the trees diverge — which is exactly when it
//     matters. Measured on 2026-09-29, :5178 named `…/worktrees/4f-p3/…` while this tree is
//     `…/worktrees/4f-fix/…`.
//
//   FRESHNESS — the same sourcemap's `sourcesContent[0]` is the ORIGINAL file text, so
//     comparing it with the file on disk proves the server is serving the CURRENT contents
//     and not a stale transform.
//
// No writes and no nonce. `HomePage.jsx` is the witness because it is the file every
// rendering case in this harness depends on.
//
// If the check cannot identify the tree at all, the run is REFUSED. A harness that cannot
// see what it is measuring must not report a pass; that is the whole lesson of the bug above.
const WITNESS_REL = 'book-tracker-frontend-stitch/src/pages/HomePage.jsx';
const WITNESS_URL = '/src/pages/HomePage.jsx';
const norm = s => s.replace(/\r\n/g, '\n');
const slash = s => s.replace(/\\/g, '/');

async function treeMismatchReason() {
  const diskPath = path.join(REPO, WITNESS_REL);
  if (!fs.existsSync(diskPath)) return `${WITNESS_REL} is missing from ${REPO} — this harness is not in a checkout it can verify`;

  let res;
  try { res = await fetch(`${WEB}${WITNESS_URL}`); }
  catch (e) { return `GET ${WEB}${WITNESS_URL} failed (${e.message}) — is a dev server listening on ${WEB}?`; }
  if (!res.ok) return `GET ${WEB}${WITNESS_URL} returned HTTP ${res.status} — ${WEB} is not a Vite dev server for this app`;

  const body = await res.text();
  const mine = slash(diskPath);
  const hint = '\n      Most likely: the dev server you started printed "Port ... is in use, trying another one..." and bound a\n'
    + '      DIFFERENT port, while the port you passed to --web belongs to another checkout. Read the port off the\n'
    + '      dev server\'s own "Local:" line and pass that one.';

  // ── identity ──
  const served = (body.match(/[A-Za-z]:[/\\][^\s"'`]*?book-tracker-frontend-stitch[/\\]src[/\\]pages[/\\]HomePage\.jsx/)
               || body.match(/\/[^\s"'`]*?book-tracker-frontend-stitch\/src\/pages\/HomePage\.jsx/) || [])[0];
  if (!served) {
    return `the module served at ${WEB}${WITNESS_URL} names no source path, so this harness cannot prove which tree `
      + 'it came from and refuses to report a result. Run it against `npm run dev` (a Vite dev server), not a '
      + 'preview or a static build.';
  }
  if (slash(served).toLowerCase() !== mine.toLowerCase()) {
    return `${WEB} is serving a DIFFERENT checkout.\n`
      + `      served from: ${slash(served)}\n`
      + `      expected:    ${mine}${hint}`;
  }

  // ── freshness ──
  const m = body.match(/sourceMappingURL=data:application\/json;base64,([A-Za-z0-9+/=]+)/);
  if (!m) return `the module served at ${WEB}${WITNESS_URL} carries no inline sourcemap — cannot prove the server is not serving stale code`;
  let sourcesContent;
  try {
    const map = JSON.parse(Buffer.from(m[1], 'base64').toString('utf8'));
    sourcesContent = (map.sourcesContent || [])[0];
  } catch (e) { return `could not decode the sourcemap served at ${WEB}${WITNESS_URL}: ${e.message}`; }
  if (typeof sourcesContent !== 'string') return `the sourcemap served at ${WEB}${WITNESS_URL} carries no sourcesContent — cannot prove freshness`;

  if (norm(sourcesContent) !== norm(fs.readFileSync(diskPath, 'utf8'))) {
    return `${WEB} is serving the right tree (${mine}) but STALE contents of it — the served ${WITNESS_REL} `
      + 'does not match the file on disk. Restart the dev server.';
  }
  return null;
}

async function checkPreconditions() {
  const missing = [];
  for (const [name, url] of [['--web', WEB], ...(MOCK ? [] : [['--api', API]])]) {
    if (/^https?:\/\/localhost(?::|\/|$)/i.test(url)) missing.push(`${name}=${url} uses "localhost" — use 127.0.0.1`);
  }

  // Both modes need the dev server, and it must be pointed at API_ORIGIN — in --mock that is the
  // origin this harness intercepts, so a dev server built against any other base URL would sail
  // straight past every route handler and the cases would measure nothing.
  const apiJsText = await fetch(`${WEB}/src/services/api.js`).then(r => r.ok ? r.text() : '').catch(() => '');
  if (!apiJsText) {
    missing.push(`GET ${WEB}/src/services/api.js did not respond — is the web dev server running (npm --prefix book-tracker-frontend-stitch run dev -- --mode localapi --port <port> --host 127.0.0.1)?`);
  } else if (!apiJsText.includes(API)) {
    missing.push(`served src/services/api.js does not reference ${API} (VITE_API_BASE_URL) — the dev server is not running --mode localapi, or --api does not match its target`);
  }

  // ...and it must be THIS tree's dev server, not whatever else holds that port.
  if (apiJsText) {
    const wrongTree = await treeMismatchReason();
    if (wrongTree) missing.push(wrongTree);
  }

  if (MOCK) return { missing, token: 'mock.token.not-a-real-jwt' };

  const secret = readSecret();
  if (!secret) { missing.push(`REVIEW_LOGIN_SECRET not set (env or ${SECRET_FILE})`); return { missing }; }

  const version = await fetch(`${API}/version`).then(r => r.ok ? r.json() : null).catch(() => null);
  if (!version || version.commit !== null) {
    missing.push(`GET ${API}/version did not return commit:null (got ${JSON.stringify(version)}) — this is not a local backend, refusing to run against it`);
  }

  const reader = await reviewLogin('review.reader@trackmyread.com', secret);
  if (!reader.ok) { missing.push(reader.reason); return { missing }; }

  // The extra precondition §4.2 names, plus the fixture it implies.
  const feed = await fetch(`${API}/notes/feed`, { headers: { Authorization: `Bearer ${reader.token}` } })
    .then(r => r.ok ? r.json() : null).catch(() => null);
  if (!Array.isArray(feed) || feed.length === 0) {
    missing.push(`GET ${API}/notes/feed returned no posts — seed the local DB first`);
  } else if (!feed.some(p => p.user && Object.prototype.hasOwnProperty.call(p.user, 'is_bot'))) {
    missing.push('the local API\'s GET /notes/feed does not carry is_bot on the user object — run P2 first, or apply the two SQLite ALTERs');
  } else {
    const bot = feed.find(p => p.user?.is_bot === true);
    const human = feed.find(p => p.user?.is_bot === false);
    if (!bot) missing.push('no bot-authored post in the local feed — flag a local-only account `is_bot = true` in the LOCAL SQLite DB (never production) and have it post');
    if (!human) missing.push('no reader-authored post in the local feed — have review.reader post one');
    // L-4F-06 needs the bot post to carry a linked book, which is what a real bestseller post
    // has had since 2026-09-29: the bot POSTs /books/add-to-library and passes the userbook_id.
    if (bot && !bot.book?.title) {
      missing.push('the bot-authored post in the local feed has no linked book — post it with a userbook_id (see bots/bestsellers.py) so L-4F-06 has something to measure');
    }
    return { missing, token: reader.token, botUserId: bot?.user?.id ?? null, botTitle: bot?.book?.title ?? null };
  }
  return { missing, token: reader.token };
}

// ---------- reporting ----------
let passed = 0, failed = 0, skipped = 0;
function report(id, title, ok, detail) {
  if (ok) { console.log(`PASS ${id} ${title}`); passed++; }
  else { console.log(`FAIL ${id} ${title} — ${String(detail).split('\n')[0].slice(0, 300)}`); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

let browser;
async function withPage(fn, { strip = false } = {}) {
  // A fresh context per case (4D lesson): the 60-second GET cache in api.js lives in the page, so a
  // reused context can serve one case's response to the next one.
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addInitScript(t => {
    localStorage.setItem('bt_token', t);
    localStorage.setItem('bt_onboarding_v1', 'done');
  }, TOKEN);
  if (MOCK) await installMock(context, { strip });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => consoleErrors.push(String(e)));
  try { return await fn(page, { consoleErrors }); }
  finally { await context.close(); }
}

// The badge is a <span> whose text is exactly BOT and which carries the Curator pill's classes.
const BADGE = 'span.rounded-full';
async function badgesIn(scope) {
  return await scope.evaluate(el =>
    [...el.querySelectorAll('span')].filter(s => s.textContent.trim() === 'BOT').map(s => s.className));
}

// The class string every BOT pill must carry, read from the component at run time so this harness
// and W-05 cannot drift apart.
const BADGE_CLASSES = fs
  .readFileSync(path.join(REPO, 'book-tracker-frontend-stitch', 'src', 'components', 'BotBadge.jsx'), 'utf8')
  .match(/className="([^"]+)"/)?.[1] ?? '';

async function feedCards(page) {
  await page.goto(`${WEB}/home`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('article', { timeout: 15000 });
  return page.locator('article');
}
async function cardFor(page, name) {
  const cards = await feedCards(page);
  const n = await cards.count();
  for (let i = 0; i < n; i++) {
    const card = cards.nth(i);
    if ((await card.innerText()).includes(name)) return card;
  }
  throw new Error(`no feed card whose text contains "${name}" (${n} cards on the page)`);
}

let TOKEN = null;
let BOT_USER_ID = BOT.id;
// --api mode fills this from the seeded bot post's own book; --mock leaves it null and L-4F-06
// falls back to the fixture's title.
let BOT_TITLE = null;

const CASES = {
  'L-4F-01': ['a bot post is badged in the community feed', async () => {
    await withPage(async page => {
      const card = await cardFor(page, BOT.name);
      const classes = await badgesIn(card);
      assert(classes.length === 1, `expected exactly one BOT pill on the bot's card, found ${classes.length}`);
      assert(BADGE_CLASSES && classes[0] === BADGE_CLASSES,
        `the rendered pill's classes do not match BotBadge.jsx\n  rendered: ${classes[0]}\n  source:   ${BADGE_CLASSES}`);
      // control: the pill sits beside the name, in the card's header, not somewhere else entirely.
      const header = card.locator('h4').first();
      assert((await header.innerText()).trim().endsWith('BOT'), `the pill is not beside the name: "${await header.innerText()}"`);
    });
  }],

  'L-4F-02': ['a reader post is not badged, and the card gains no height', async () => {
    let badgedHeight = null, readerName = null;
    await withPage(async page => {
      const card = await cardFor(page, READER.name);
      const classes = await badgesIn(card);
      assert(classes.length === 0, `the reader's card carries ${classes.length} BOT pill(s)`);
      assert(!(await card.innerText()).includes('BOT'), 'the text "BOT" appears somewhere in the reader\'s card');
      badgedHeight = (await card.boundingBox()).height;
      readerName = READER.name;
      // control, in the same run: the bot's card in the same feed IS badged, so "no pill" is a fact
      // about this card and not about a selector that matches nothing.
      const botCard = await cardFor(page, BOT.name);
      assert((await badgesIn(botCard)).length === 1, 'no pill on the bot card either — the detector matches nothing');
    });
    // the pre-4F comparison: the same page fed user objects with no `is_bot` key at all, which is
    // exactly what the API returned before R-02. The reader's card must be the same height.
    await withPage(async page => {
      const card = await cardFor(page, readerName);
      const h = (await card.boundingBox()).height;
      assert(Math.abs(h - badgedHeight) <= 2,
        `the reader's card is ${h}px with the badge shipped and ${badgedHeight}px without it — R-03 says a reader's card gains no extra whitespace`);
    }, { strip: true });
  }],

  'L-4F-03': ['profile header and user search carry the badge', async () => {
    await withPage(async page => {
      await page.goto(`${WEB}/profile/${BOT_USER_ID}`, { waitUntil: 'domcontentloaded' });
      const h1 = page.locator('h1').first();
      await h1.waitFor({ timeout: 15000 });
      const onHeader = await badgesIn(h1);
      assert(onHeader.length === 1, `expected one BOT pill in the profile <h1>, found ${onHeader.length} (h1 reads "${await h1.innerText()}")`);
    });
    await withPage(async page => {
      await page.goto(`${WEB}/home`, { waitUntil: 'domcontentloaded' });
      const aside = page.locator('aside').first();
      const search = aside.getByPlaceholder(/search users/i).first();
      await search.waitFor({ timeout: 15000 });
      await search.fill(BOT.name.slice(0, 6));
      await page.waitForTimeout(1500);           // the sidebar search is debounced
      const hits = await badgesIn(aside);
      assert(hits.length >= 1, `no BOT pill in the sidebar search results for "${BOT.name.slice(0, 6)}" — the sidebar reads ${JSON.stringify((await aside.innerText()).slice(0, 200))}`);
    });
  }],

  'L-4F-04': ['a user object with no is_bot renders no badge and does not crash', async () => {
    let fullCount = null;
    await withPage(async page => { fullCount = await (await feedCards(page)).count(); });
    await withPage(async (page, { consoleErrors }) => {
      const cards = await feedCards(page);
      assert(await cards.count() === fullCount,
        `the stripped feed rendered ${await cards.count()} cards, the unmodified one ${fullCount}`);
      const body = page.locator('body');
      assert((await badgesIn(body)).length === 0, 'a BOT pill rendered for a user object that has no is_bot key');
      assert(consoleErrors.length === 0, `console errors on the stripped feed: ${consoleErrors[0]}`);
    }, { strip: true });
  }],

  // L-4F-05 asserted the R-05a in-text line. The PM withdrew R-05a on 2026-09-29; the case is
  // deleted rather than reworded, because there is no weaker version of it that is still true.

  'L-4F-06': ['the bot\'s card carries a book cover and title, like a reader\'s', async () => {
    await withPage(async page => {
      const card = await cardFor(page, BOT.name);
      const title = BOT_TITLE || BOT_BOOK.title;
      assert((await card.innerText()).includes(title),
        `the bot's card does not print the book title "${title}" — it reads: ${JSON.stringify((await card.innerText()).slice(0, 200))}`);
      const covers = card.locator(`img[alt="${title}"]`);
      assert(await covers.count() === 1,
        `expected one cover <img alt="${title}"> on the bot's card, found ${await covers.count()}`);
      const box = await covers.first().boundingBox();
      assert(box && box.width > 0 && box.height > 0, 'the cover img is present but paints nothing');

      // CONTROL: a card with no book still renders — that is the ordinary shape for three
      // of the four voices, so the fix must not have made a book mandatory.
      const readerCard = await cardFor(page, READER.name);
      assert(!(await readerCard.innerText()).includes(title),
        'the reader fixture post carries the same book — this control proves nothing');
      assert(await readerCard.locator(`img[alt="${title}"]`).count() === 0, 'a cover leaked onto the bookless card');
      assert((await readerCard.boundingBox()).height > 0, 'the bookless card did not render');
    });
  }],
};

// ---------- run ----------
const pre = await checkPreconditions();
if (pre.missing.length) {
  console.error('missing preconditions:');
  for (const m of pre.missing) console.error(`  - ${m}`);
  process.exit(6);
}
TOKEN = pre.token;
if (!MOCK && pre.botUserId) BOT_USER_ID = pre.botUserId;
if (!MOCK && pre.botTitle) BOT_TITLE = pre.botTitle;

browser = await chromium.launch();
try {
  for (const [id, [title, fn]] of Object.entries(CASES)) {
    if (ONLY && !ONLY.includes(id)) { skipped++; continue; }
    try { await fn(); report(id, title, true); }
    catch (e) { report(id, title, false, e.message); }
  }
} finally {
  await browser.close();
}
console.log(`4F web local: ${passed} passed, ${failed} failed${ONLY ? `, ${skipped} skipped` : ''}`);
process.exit(failed ? 1 : 0);
