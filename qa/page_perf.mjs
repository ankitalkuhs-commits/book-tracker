// qa/page_perf.mjs
// Page load time of every web route, as a reader experiences it.
//
// Default target is production. It is READ-ONLY: every non-GET request to the API is aborted,
// as in qa/a11y_audit.mjs (qa/RULES_OF_ENGAGEMENT.md). Signed-in pages use review.reader
// through /auth/review-login.
//
// Per page, per profile:
//   TTFB      the HTML document's first byte
//   FCP       first contentful paint
//   LCP       largest contentful paint (Google's main loading metric: good <= 2.5 s, poor > 4 s)
//   ready     the page's data has arrived: the last API response of the initial burst, i.e.
//             the API has been idle for 1 s. In this SPA the content appears here, so this is
//             "loaded" as a reader feels it.
//   api       the number of API calls in that burst, and the slowest one
// Run 1 starts with an empty cache (first visit). Runs 2..N reuse it (return visit).
// Profiles:
//   desktop   1280x800, no throttling
//   mobile    390x844, slow 4G (150 ms RTT, ~1.6 Mbps down) and 4x CPU slowdown,
//             roughly a mid-range Android phone
//
//   node qa/page_perf.mjs [--runs 3] [--profiles desktop,mobile] [--only /home]
//                         [--web URL] [--api URL] [--secret-file .env.review]
// Writes qa/reports/page-perf-<date>.md and .json
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const WEB = arg('web', 'https://www.trackmyread.com').replace(/\/$/, '');
const API = arg('api', 'https://book-tracker-stitch.onrender.com').replace(/\/$/, '');
const RUNS = Math.max(1, parseInt(arg('runs', '3'), 10));
const PROFILES = arg('profiles', 'desktop,mobile').split(',');
const ONLY = arg('only', null);
const SECRET_FILE = arg('secret-file', path.join(REPO, '.env.review'));
const IDLE_MS = 1000, READY_CAP_MS = 30000;

// ---------------------------------------------------------------------------
// Waterfall verdict (K-05, section 6.1). Pure functions — unit-tested by
// qa/unit/pagePerfWaterfall.test.mjs — so the release gate is itself tested.
// ---------------------------------------------------------------------------

// Today's check was `/blockedbyclient/i`, which never matches Chromium's real abort text
// `net::ERR_BLOCKED_BY_CLIENT` (the word is split by underscores), so a blocked write was never
// actually counted. Matches both spellings.
export function isBlocked(errorText) {
  return /blocked_?by_?client/i.test(errorText || '');
}

// calls: [{method, path, start, end, status}], path is the pathname only, status may be the
// string 'blocked' for a write the read-only guard aborted (it still counts as a page call).
// ME = the GET /profile/me with the lowest start. Own calls = every other call except
// GET /notifications/unread-count.
export function waterfallVerdict(calls) {
  const mes = (calls || []).filter(c => c.method === 'GET' && c.path === '/profile/me');
  if (!mes.length) return '—';
  const me = mes.slice().sort((a, b) => a.start - b.start)[0];
  const own = calls.filter(c => c !== me && !(c.method === 'GET' && c.path === '/notifications/unread-count'));
  if (own.length) return own.some(c => c.start < me.end) ? 'parallel' : 'SERIAL';
  const unread = calls.filter(c => c.method === 'GET' && c.path === '/notifications/unread-count').sort((a, b) => a.start - b.start);
  if (!unread.length) return '—';
  return unread[0].start < me.end ? 'parallel (nav)' : 'SERIAL (nav)';
}

// rows: [{page, profile, meStart, meEnd, ownStart, verdict, meTotalMs, meQueries}]. Never a token,
// secret or Authorization value — paths and timings only.
export function renderWaterfall(rows) {
  const lines = ['## Waterfall (first visit)', '',
    'Note: `/admin` and `/onboarding` are expected to read `SERIAL` / `—` (own gates, never parallel).', '',
    '| page | profile | profile/me | first own call | verdict | profile/me total | profile/me queries |',
    '|---|---|---:|---:|---|---:|---:|'];
  for (const r of (rows || [])) {
    const me = r.meStart != null && r.meEnd != null ? `${r.meStart}–${r.meEnd} ms` : '—';
    const own = r.ownStart == null ? '—' : `${r.ownStart} ms`;
    const total = r.meTotalMs == null ? '—' : `${r.meTotalMs} ms`;
    const queries = r.meQueries == null ? '—' : `${r.meQueries}`;
    lines.push(`| ${r.page} | ${r.profile} | ${me} | ${own} | ${r.verdict} | ${total} | ${queries} |`);
  }
  return lines.join('\n') + '\n';
}

// Server-Timing: `db;dur=12.3;desc="5 queries", total;dur=45.6`
function parseServerTiming(header) {
  if (!header) return null;
  const parts = {};
  for (const chunk of header.split(',')) {
    const [namePart, ...paramParts] = chunk.trim().split(';');
    const name = namePart.trim();
    if (!name) continue;
    const entry = { name };
    for (const p of paramParts) {
      const [k, ...vRest] = p.split('=');
      const v = vRest.join('=').trim().replace(/^"(.*)"$/, '$1');
      entry[k.trim()] = v;
    }
    parts[name] = entry;
  }
  const db = parts.db, total = parts.total;
  const queries = db && db.desc ? parseInt((db.desc.match(/(\d+)/) || [])[1], 10) : null;
  return {
    dbMs: db ? parseFloat(db.dur) : null,
    queries: Number.isFinite(queries) ? queries : null,
    totalMs: total ? parseFloat(total.dur) : null,
  };
}

function readSecret() {
  if (process.env.REVIEW_LOGIN_SECRET) return process.env.REVIEW_LOGIN_SECRET.trim();
  if (!fs.existsSync(SECRET_FILE)) return null;
  const m = fs.readFileSync(SECRET_FILE, 'utf8').match(/^(?:export\s+)?REVIEW_LOGIN_SECRET=["']?([^"'\r\n]+)/m);
  return m ? m[1].trim() : null;
}

async function reviewLogin(email, secret) {
  const r = await fetch(`${API}/auth/review-login`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, secret }) });
  if (!r.ok) throw new Error(`review-login ${email}: HTTP ${r.status}`);
  return r.json();
}

const median = xs => { const s = xs.filter(x => x != null).sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };
const sec = ms => (ms == null ? '—' : (ms / 1000).toFixed(2) + ' s');

async function newContext(browser, profile, token) {
  const ctx = await browser.newContext(profile === 'mobile'
    ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
    : { viewport: { width: 1280, height: 800 } });
  await ctx.route('**/*', r => {
    const q = r.request();
    return q.url().startsWith(API) && !['GET', 'OPTIONS', 'HEAD'].includes(q.method()) ? r.abort('blockedbyclient') : r.continue();
  });
  await ctx.addInitScript(() => {
    window.__lcp = null;
    try {
      new PerformanceObserver(l => { const e = l.getEntries(); if (e.length) window.__lcp = e[e.length - 1].startTime; })
        .observe({ type: 'largest-contentful-paint', buffered: true });
    } catch { /* not supported */ }
  });
  if (token) await ctx.addInitScript(t => { localStorage.setItem('bt_token', t); localStorage.setItem('bt_onboarding_v1', 'done'); }, token);
  return ctx;
}

async function throttle(page, profile) {
  if (profile !== 'mobile') return;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
}

async function measure(page, url) {
  const inflight = new Map(), done = [];
  let blocked = 0, lastActivity = Date.now();
  const onReq = q => { if (q.url().startsWith(API)) { inflight.set(q, Date.now()); lastActivity = Date.now(); } };
  const onEnd = q => {
    if (!inflight.has(q)) return;
    const start = inflight.get(q); inflight.delete(q); lastActivity = Date.now();
    const failure = q.failure();
    const nowAbs = Date.now();
    const pathname = new URL(q.url()).pathname;
    if (failure && isBlocked(failure.errorText)) {
      // A write the read-only guard aborted still counts as a page call for the waterfall (K-05).
      blocked++;
      done.push({ method: q.method(), path: pathname, ms: nowAbs - start, end: nowAbs, relStart: start - navStart, relEnd: nowAbs - navStart, failed: false, status: 'blocked', st: null });
      return;
    }
    done.push({ method: q.method(), path: pathname, ms: nowAbs - start, end: nowAbs, relStart: start - navStart, relEnd: nowAbs - navStart, failed: !!failure, status: q.__status, st: q.__st || null });
  };
  // A response arrives before its request is marked finished, so record the status (and any
  // Server-Timing header) on the request object here and read it in onEnd.
  const onResp = resp => {
    const q = resp.request();
    if (!q.url().startsWith(API)) return;
    q.__status = resp.status();
    q.__st = parseServerTiming(resp.headers()['server-timing']);
  };
  page.on('request', onReq); page.on('requestfinished', onEnd); page.on('requestfailed', onEnd); page.on('response', onResp);
  const navStart = Date.now();
  let error = null;
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });
    // The idle window starts at load, not at navigation. On a throttled phone the load event
    // itself can take over 1 s, so measuring idle from navigation declared the page "ready"
    // before the app had issued a single API call (the first mobile run reported 0 calls on
    // every page). Now the page must be quiet for 1 s after load.
    lastActivity = Math.max(lastActivity, Date.now());
    const capAt = Date.now() + READY_CAP_MS;
    while (Date.now() < capAt && (inflight.size > 0 || Date.now() - lastActivity < IDLE_MS)) await page.waitForTimeout(100);
  } catch (e) { error = String(e.message || e).split('\n')[0]; }
  page.off('request', onReq); page.off('requestfinished', onEnd); page.off('requestfailed', onEnd); page.off('response', onResp);
  const t = await page.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0] || {};
    const fcp = performance.getEntriesByName('first-contentful-paint')[0];
    const js = performance.getEntriesByType('resource').filter(r => r.initiatorType === 'script').reduce((a, r) => a + (r.transferSize || 0), 0)
             + 0;
    return { ttfb: n.responseStart ?? null, dcl: n.domContentLoadedEventEnd ?? null, load: n.loadEventEnd ?? null,
             fcp: fcp ? fcp.startTime : null, lcp: window.__lcp, jsBytes: js, finalPath: location.pathname };
  }).catch(() => ({}));
  const apiEnd = done.length ? Math.max(...done.map(d => d.end)) : null;
  const slowest = done.slice().sort((a, b) => b.ms - a.ms)[0] || null;
  return {
    ...t, error, blocked,
    ready: apiEnd ? Math.max(apiEnd - navStart, t.load ?? 0) : (t.load ?? null),
    apiCalls: done.length, apiFailed: done.filter(d => d.failed || (d.status >= 400)).map(d => `${d.method} ${d.path}${d.status ? ' ' + d.status : ''}`),
    slowest: slowest ? { call: `${slowest.method} ${slowest.path}`, ms: slowest.ms } : null,
    calls: done.map(d => ({ method: d.method, path: d.path, start: d.relStart, end: d.relEnd, status: d.status, st: d.st })),
  };
}

async function main() {
  if (/localhost|127\.0\.0\.1/.test(API) === false && !/onrender\.com|trackmyread\.com/.test(API + WEB)) {
    console.error('unexpected target; pass --web and --api explicitly'); process.exit(2);
  }
  const secret = readSecret();
  if (!secret) { console.error('REVIEW_LOGIN_SECRET not found'); process.exit(2); }

  // Wake the API first, so Render's free-tier cold start is reported once, not smeared across pages.
  const w0 = Date.now(); let wake = null;
  for (let i = 0; i < 12 && !wake; i++) { try { const r = await fetch(API + '/version'); if (r.ok) wake = { ms: Date.now() - w0, version: await r.json() }; } catch { await new Promise(r => setTimeout(r, 5000)); } }
  console.log(`API awake after ${sec(wake?.ms)}; serving ${wake?.version?.commit?.slice(0, 7) || '?'}`);

  const reader = await reviewLogin('review.reader@trackmyread.com', secret);
  const friend = await reviewLogin('review.friend@trackmyread.com', secret);
  const token = reader.access_token;
  const get = p => fetch(API + p, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
  const [ubs, groups] = await Promise.all([get('/userbooks/'), get('/groups/my')]);
  const circle = (groups || []).find(g => g.name === 'Review Circle') || (groups || [])[0];
  const ub = (ubs || [])[0];

  const PAGES = [
    { p: '/', auth: false, name: 'Landing' }, { p: '/about', auth: false, name: 'About' },
    { p: '/privacy', auth: false, name: 'Privacy' }, { p: '/terms', auth: false, name: 'Terms' },
    { p: '/blog', auth: false, name: 'Blog index' }, { p: '/blog/goodreads-alternative', auth: false, name: 'Blog post' },
    { p: '/this-page-does-not-exist', auth: false, name: '404' },
    { p: '/home', auth: true, name: 'Home feed' }, { p: '/library', auth: true, name: 'Library' },
    ub && { p: `/library/book/${ub.id}`, auth: true, name: 'Book detail' },
    { p: '/search', auth: true, name: 'Search' }, { p: '/groups', auth: true, name: 'Circles' },
    circle && { p: `/groups/${circle.id}`, auth: true, name: 'Circle detail' },
    { p: '/groups/new', auth: true, name: 'New circle' },
    circle?.invite_code && { p: `/join/${circle.invite_code}`, auth: true, name: 'Join via invite' },
    { p: '/insights', auth: true, name: 'Insights' }, { p: '/notifications', auth: true, name: 'Notifications' },
    { p: '/profile', auth: true, name: 'My profile' }, { p: `/profile/${friend.user.id}`, auth: true, name: "Friend's profile" },
    { p: '/settings', auth: true, name: 'Settings' }, { p: '/onboarding', auth: true, name: 'Onboarding' },
    { p: '/admin', auth: true, name: 'Admin (non-admin user)' },
  ].filter(Boolean).filter(x => !ONLY || x.p === ONLY || x.p === '/' + ONLY.replace(/^\/+/, ''));
  if (!PAGES.length) {
    // Git Bash rewrites "/home" to "C:/Program Files/Git/home" (MSYS path conversion), which
    // matched nothing and produced an empty, "successful" run. Fail loudly instead.
    console.error(`--only ${ONLY} matches no page (in Git Bash pass it without the leading slash, or set MSYS_NO_PATHCONV=1)`);
    process.exit(2);
  }

  const browser = await chromium.launch();
  // One untimed visit first, so DNS and TLS setup is not billed to whichever page happens to be
  // measured first. A real first-time visitor pays that extra once.
  { const c = await browser.newContext(); const pg0 = await c.newPage(); await pg0.goto(WEB, { waitUntil: 'load', timeout: 60000 }).catch(() => {}); await c.close(); }
  const results = [];
  for (const profile of PROFILES) {
    for (const pg of PAGES) {
      const ctx = await newContext(browser, profile, pg.auth ? token : null);
      const runs = [];
      for (let i = 0; i < RUNS; i++) {
        const page = await ctx.newPage();            // same context: run 1 cold cache, later runs warm
        await throttle(page, profile);
        runs.push(await measure(page, WEB + pg.p));
        await page.close();
      }
      await ctx.close();
      const cold = runs[0], warm = runs.slice(1);
      const row = {
        profile, page: pg.p, name: pg.name, finalPath: cold.finalPath,
        cold: { ttfb: cold.ttfb, fcp: cold.fcp, lcp: cold.lcp, ready: cold.ready, jsBytes: cold.jsBytes },
        warm: warm.length ? { fcp: median(warm.map(r => r.fcp)), lcp: median(warm.map(r => r.lcp)), ready: median(warm.map(r => r.ready)) } : null,
        apiCalls: cold.apiCalls, slowest: cold.slowest, apiFailed: [...new Set(runs.flatMap(r => r.apiFailed))],
        blockedWrites: cold.blocked, errors: runs.map(r => r.error).filter(Boolean),
        calls: pg.auth ? cold.calls : undefined,
      };
      results.push(row);
      console.log(`${profile.padEnd(7)} ${pg.p.padEnd(34)} ready cold ${sec(row.cold.ready).padStart(8)} warm ${sec(row.warm?.ready).padStart(8)}  LCP ${sec(row.cold.lcp).padStart(8)}  api ${String(row.apiCalls).padStart(2)}  slowest ${row.slowest ? row.slowest.call + ' ' + sec(row.slowest.ms) : '—'}${row.errors.length ? '  ERROR ' + row.errors[0] : ''}`);
    }
  }
  await browser.close();

  const date = new Date().toISOString().slice(0, 10);
  const dir = path.join(REPO, 'qa', 'reports'); fs.mkdirSync(dir, { recursive: true });
  const meta = { date, web: WEB, api: API, runs: RUNS, apiWake: wake };
  fs.writeFileSync(path.join(dir, `page-perf-${date}.json`), JSON.stringify({ meta, results }, null, 2));

  const flag = (ms, good, poor) => (ms == null ? '' : ms <= good ? '' : ms <= poor ? ' ⚠️' : ' 🔴');
  const md = [`# Page load times — ${date}`, '',
    `\`${WEB}\` against API \`${API}\` serving \`${wake?.version?.commit?.slice(0, 7) || '?'}\`. ${RUNS} loads per page per profile. The first load has an empty cache and later loads reuse it. The API was woken before measuring, which took ${sec(wake?.ms)} (includes any Render cold start).`, '',
    '**ready** means the page\'s data has arrived: the API has been idle for 1 s after load. In this single-page app that is when the content actually appears.',
    '**LCP**: good ≤ 2.5 s, ⚠️ ≤ 4 s, 🔴 > 4 s. **ready**: ⚠️ > 3 s, 🔴 > 6 s.', ''];
  for (const profile of PROFILES) {
    md.push(`## ${profile === 'mobile' ? 'Mobile — slow 4G, 4× CPU slowdown' : 'Desktop — no throttling'}`, '',
      '| page | ready (first visit) | ready (return) | LCP | FCP | TTFB | API calls | slowest API call | notes |', '|---|---:|---:|---:|---:|---:|---:|---|---|');
    for (const r of results.filter(x => x.profile === profile)) {
      const notes = [r.finalPath && r.finalPath !== r.page ? `redirected to ${r.finalPath}` : '', r.apiFailed.length ? `API errors: ${r.apiFailed.join(', ')}` : '',
                     r.blockedWrites ? `${r.blockedWrites} write(s) blocked` : '', r.errors.length ? `error: ${r.errors[0]}` : ''].filter(Boolean).join('; ');
      md.push(`| ${r.name} \`${r.page.replace(/\/join\/.+/, '/join/…')}\` | ${sec(r.cold.ready)}${flag(r.cold.ready, 3000, 6000)} | ${sec(r.warm?.ready)}${flag(r.warm?.ready, 3000, 6000)} | ${sec(r.cold.lcp)}${flag(r.cold.lcp, 2500, 4000)} | ${sec(r.cold.fcp)} | ${sec(r.cold.ttfb)} | ${r.apiCalls} | ${r.slowest ? `\`${r.slowest.call}\` ${sec(r.slowest.ms)}` : '—'} | ${notes} |`);
    }
    md.push('');
  }

  const waterfallRows = results.filter(r => r.calls).map(r => {
    const mes = r.calls.filter(c => c.method === 'GET' && c.path === '/profile/me');
    const me = mes.length ? mes.slice().sort((a, b) => a.start - b.start)[0] : null;
    const own = me ? r.calls.filter(c => c !== me && !(c.method === 'GET' && c.path === '/notifications/unread-count')) : [];
    const ownStart = own.length ? Math.min(...own.map(c => c.start)) : null;
    return {
      page: `${r.name} \`${r.page.replace(/\/join\/.+/, '/join/…')}\``, profile: r.profile,
      meStart: me?.start ?? null, meEnd: me?.end ?? null, ownStart,
      verdict: waterfallVerdict(r.calls),
      meTotalMs: me?.st?.totalMs ?? null, meQueries: me?.st?.queries ?? null,
    };
  });
  md.push(renderWaterfall(waterfallRows));

  fs.writeFileSync(path.join(dir, `page-perf-${date}.md`), md.join('\n') + '\n');
  console.log(`\nwrote qa/reports/page-perf-${date}.md`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch(e => { console.error(e.message); process.exit(1); });
}
