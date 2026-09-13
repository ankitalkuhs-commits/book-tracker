// qa/interaction_audit.mjs
// Clicks / types / toggles every inventoried web element whose side_effect is "none" (read-only or
// navigation) on production, as review.reader, and records for each one:
//   API calls fired (method, path, status, ms) · console errors · page errors · URL change · dialogs ·
//   popups/external links · whether the element was found/visible/enabled · before/after screenshots.
//
// SAFETY NET (qa/RULES_OF_ENGAGEMENT.md): every non-GET request to the API is ABORTED at the network
// layer and recorded as BLOCKED_MUTATION. A mislabelled inventory entry therefore cannot change prod.
// confirm() dialogs are dismissed; popups are closed immediately; uploads never happen (file inputs skipped).
//
// Usage (repo root, after `npm --prefix qa install`):
//   node qa/interaction_audit.mjs --out qa/screenshots/2026-09-13-interactions [--route /library] [--inventory qa/inventory/web-a.json]
// Exit: 0 ran; 2 no secret; 3 login refused.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

const WEB = arg('web', 'https://www.trackmyread.com').replace(/\/$/, '');
const API = arg('api', 'https://book-tracker-stitch.onrender.com').replace(/\/$/, '');
const OUT = path.resolve(arg('out', path.join(REPO, 'qa', 'screenshots', 'interactions')));
const ROUTE_FILTER = arg('route', null);
const INVENTORY = arg('inventory', null);
const SECRET_FILE = arg('secret-file', path.join(REPO, '.env.review'));
const FRIEND_ID = 111;

function readSecret() {
  if (process.env.REVIEW_LOGIN_SECRET) return process.env.REVIEW_LOGIN_SECRET.trim();
  if (!fs.existsSync(SECRET_FILE)) return null;
  const m = fs.readFileSync(SECRET_FILE, 'utf8').match(/^REVIEW_LOGIN_SECRET=(.+)$/m);
  return m ? m[1].trim() : null;
}

function loadInventory() {
  const files = INVENTORY ? [INVENTORY] : fs.readdirSync(path.join(REPO, 'qa', 'inventory'))
    .filter(f => /^web-.*\.json$/.test(f)).map(f => path.join(REPO, 'qa', 'inventory', f));
  return files.flatMap(f => JSON.parse(fs.readFileSync(f, 'utf8')).map(e => ({ ...e, _source: path.basename(f) })));
}

const slug = s => String(s).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 80);

function locate(page, loc = {}) {
  if (loc.testid) return page.getByTestId(loc.testid);
  if (loc.role) return page.getByRole(loc.role, loc.name ? { name: loc.name, exact: false } : {});
  if (loc.label || loc['aria-label']) return page.getByLabel(loc.label || loc['aria-label']);
  if (loc.placeholder) return page.getByPlaceholder(loc.placeholder);
  if (loc.text) return page.getByText(loc.text, { exact: false });
  if (loc.css) return page.locator(loc.css);
  return null;
}

async function main() {
  const secret = readSecret();
  if (!secret) { console.error(`REVIEW_LOGIN_SECRET not set (env or ${SECRET_FILE})`); process.exit(2); }
  const res = await fetch(`${API}/auth/review-login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'review.reader@trackmyread.com', secret }),
  });
  if (!res.ok) { console.error(`review-login failed: HTTP ${res.status}`); process.exit(3); }
  const { access_token: token } = await res.json();
  const authed = p => fetch(API + p, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());

  // Resolve route params to review-owned ids only.
  const [ubs, groups] = await Promise.all([authed('/userbooks/'), authed('/groups/my')]);
  const circle = (groups || []).find(g => g.name === 'Review Circle');
  const params = {
    ':userbookId': ubs?.[0]?.id, ':groupId': circle?.id, ':userId': FRIEND_ID, ':slug': null, ':inviteCode': null,
  };
  const resolveRoute = r => {
    // Inventory routes can be "*" (shared component), "a, b (via X)" (rendered on several pages) or "n/a …".
    if (!r || /^n\/a/i.test(r)) return null;
    let out = r === '*' ? '/home' : String(r).split(',')[0].replace(/\(.*?\)/g, '').trim();
    if (!out.startsWith('/')) return null;
    for (const [k, v] of Object.entries(params)) {
      if (out.includes(k)) { if (v == null) return null; out = out.replace(k, v); }
    }
    return out;
  };

  const inventory = loadInventory().filter(e => !ROUTE_FILTER || e.route === ROUTE_FILTER);
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addInitScript(t => {
    localStorage.setItem('bt_token', t);
    localStorage.setItem('bt_onboarding_v1', 'done');
  }, token);

  // Network safety net + API call capture.
  let current = null;
  await context.route('**/*', async route => {
    const req = route.request();
    const url = req.url();
    const isApi = url.startsWith(API);
    const isCloudinaryUpload = /api\.cloudinary\.com/.test(url);
    if ((isApi && req.method() !== 'GET' && req.method() !== 'OPTIONS') || isCloudinaryUpload) {
      current?.blocked.push(`${req.method()} ${url.replace(API, '')}`);
      return route.abort('blockedbyclient');
    }
    return route.continue();
  });

  const results = [];
  const shotRoutes = new Set();
  const tagEarly = ROUTE_FILTER ? `-${slug(ROUTE_FILTER)}` : '';
  const partialPath = path.join(OUT, `interaction-results${tagEarly}.partial.json`);
  // Flush after every element so a runner timeout never loses completed results.
  const flush = () => fs.writeFileSync(partialPath, JSON.stringify({ web: WEB, api: API, done: results.length, total: inventory.length, results }, null, 2));

  for (const e of inventory) {
    if (results.length) flush();
    const rec = {
      id: e.id, route: e.route, element: e.element, kind: e.kind, trigger: e.trigger, source: e._source,
      side_effect: e.side_effect, status: null, api: [], blocked: [], consoleErrors: [], pageErrors: [],
      dialogs: [], popups: [], urlBefore: null, urlAfter: null, ms: null, note: null,
    };
    results.push(rec);

    if (e.side_effect !== 'none') { rec.status = 'SKIPPED_SIDE_EFFECT'; continue; }
    if (e.kind === 'file-input') { rec.status = 'SKIPPED_UPLOAD'; continue; }
    const route = resolveRoute(e.route || '/');
    if (!route) { rec.status = 'SKIPPED_UNRESOLVED_ROUTE'; continue; }
    const loc0 = e.locator || {};
    if (!Object.keys(loc0).length) { rec.status = 'NO_LOCATOR'; continue; }

    const page = await context.newPage();
    current = rec;
    const pending = new Map();
    page.on('request', r => { if (r.url().startsWith(API)) pending.set(r, Date.now()); });
    page.on('response', r => {
      const q = r.request();
      if (!q.url().startsWith(API)) return;
      rec.api.push({ method: q.method(), path: q.url().replace(API, '').split('?')[0], status: r.status(),
                     ms: pending.has(q) ? Date.now() - pending.get(q) : null });
    });
    page.on('console', m => { if (m.type() === 'error' && !/Push API in incognito/.test(m.text())) rec.consoleErrors.push(m.text().slice(0, 240)); });
    page.on('pageerror', err => rec.pageErrors.push(String(err).slice(0, 240)));
    page.on('dialog', async d => { rec.dialogs.push(`${d.type()}: ${d.message().slice(0, 160)}`); await d.dismiss().catch(() => {}); });
    page.on('popup', async p => { rec.popups.push(p.url()); await p.close().catch(() => {}); });

    try {
      await page.goto(WEB + route, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(800);
      if (!shotRoutes.has(route)) {
        shotRoutes.add(route);
        await page.screenshot({ path: path.join(OUT, `route-${slug(route)}.png`), fullPage: false });
      }
      rec.api = []; // only count calls caused by the action
      rec.urlBefore = new URL(page.url()).pathname;

      const loc = locate(page, loc0);
      const target = loc ? loc.first() : null;
      if (!target || !(await target.count())) { rec.status = 'NOT_FOUND'; rec.note = e.visible_when || ''; continue; }
      if (!(await target.isVisible().catch(() => false))) { rec.status = 'NOT_VISIBLE'; rec.note = e.visible_when || ''; continue; }
      if (!(await target.isEnabled().catch(() => true))) { rec.status = 'DISABLED'; continue; }

      const t0 = Date.now();
      const trig = e.trigger || 'click';
      if (['input', 'textarea'].includes(e.kind)) {
        await target.fill('qa audit 🔍 <b>x</b>');
        if (trig === 'enter' || trig === 'submit') await target.press('Enter');
      } else if (e.kind === 'select') {
        const opts = await target.locator('option').allTextContents();
        if (opts.length > 1) await target.selectOption({ index: 1 });
      } else if (trig === 'escape') {
        await page.keyboard.press('Escape');
      } else if (trig === 'hover') {
        await target.hover();
      } else if (trig === 'scroll') {
        await page.mouse.wheel(0, 4000);
      } else {
        await target.click({ timeout: 8000 });
      }
      await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(700);
      rec.ms = Date.now() - t0;
      rec.urlAfter = new URL(page.url()).pathname;
      await page.screenshot({ path: path.join(OUT, `after-${slug(e.id)}.png`), fullPage: false });

      const bodyText = (await page.locator('body').innerText().catch(() => '')).trim();
      const crashed = bodyText.length < 20 || /something went wrong|unexpected error|cannot read prop/i.test(bodyText);
      const apiFail = rec.api.some(a => a.status >= 500);
      rec.status = rec.blocked.length ? 'BLOCKED_MUTATION'
        : crashed ? 'CRASH'
        : rec.pageErrors.length ? 'PAGE_ERROR'
        : apiFail ? 'API_5XX'
        : rec.urlAfter === '/' && rec.urlBefore !== '/' ? 'LOGGED_OUT'
        : 'OK';
    } catch (err) {
      rec.status = 'ACTION_ERROR';
      rec.note = String(err.message || err).split('\n')[0].slice(0, 200);
    } finally {
      current = null;
      await page.close().catch(() => {});
    }
    process.stdout.write(`${rec.status.padEnd(26)} ${String(rec.route).padEnd(24)} ${e.id}\n`);
  }

  await browser.close();

  const byStatus = results.reduce((a, r) => ((a[r.status] = (a[r.status] || 0) + 1), a), {});
  const tag = ROUTE_FILTER ? `-${slug(ROUTE_FILTER)}` : '';
  fs.writeFileSync(path.join(OUT, `interaction-results${tag}.json`), JSON.stringify({ web: WEB, api: API, byStatus, results }, null, 2));
  console.log(`\n${JSON.stringify(byStatus)}\nout: ${OUT}`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
