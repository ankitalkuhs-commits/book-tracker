// qa/screenshots.mjs
// Post-deploy visual check: logs in as a review account via POST /auth/review-login,
// opens the web app with that session, screenshots the main pages, and records
// console errors + failed API calls per page.
//
// Usage (from repo root, after `npm --prefix qa install`):
//   node qa/screenshots.mjs --web https://www.trackmyread.com --api https://book-tracker-stitch.onrender.com --out qa/screenshots/2026-09-13-prod
//   node qa/screenshots.mjs                       # local: web http://localhost:5174, api http://127.0.0.1:8765
//
// Secret: REVIEW_LOGIN_SECRET env var, else --secret-file (default <repo>/.env.review). Never printed or written.
// (Not --env-file: Node 22 claims that flag for itself even after the script path.)
// Exit: 0 all pages rendered logged-in with no failed API calls; 1 some page failed; 2 no secret; 3 login refused.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const WEB = arg('web', 'http://localhost:5174').replace(/\/$/, '');
const API = arg('api', 'http://127.0.0.1:8765').replace(/\/$/, '');
const OUT = path.resolve(arg('out', path.join(REPO, 'qa', 'screenshots', 'latest')));
const EMAIL = arg('email', 'review.reader@trackmyread.com');
const ENV_FILE = arg('secret-file', path.join(REPO, '.env.review'));
const DESKTOP_PAGES = ['/home', '/library', '/groups', '/insights', '/profile', '/notifications'];
const MOBILE_PAGES = ['/home', '/library'];

function readSecret() {
  if (process.env.REVIEW_LOGIN_SECRET) return process.env.REVIEW_LOGIN_SECRET.trim();
  if (!fs.existsSync(ENV_FILE)) return null;
  const m = fs.readFileSync(ENV_FILE, 'utf8').match(/^REVIEW_LOGIN_SECRET=(.+)$/m);
  return m ? m[1].trim() : null;
}

async function main() {
  const secret = readSecret();
  if (!secret) {
    console.error(`REVIEW_LOGIN_SECRET not set (env or ${ENV_FILE})`);
    process.exit(2);
  }

  const version = await fetch(`${API}/version`)
    .then(r => (r.ok ? r.json() : { status: r.status }))
    .catch(e => ({ error: e.message }));

  const res = await fetch(`${API}/auth/review-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, secret }),
  });
  if (!res.ok) {
    const why = res.status === 404 ? 'REVIEW_LOGIN_SECRET / REVIEW_LOGIN_EMAILS not configured on this API'
      : res.status === 401 ? 'secret or email rejected'
      : (await res.text()).slice(0, 200);
    console.error(`review-login failed: HTTP ${res.status} (${why})`);
    process.exit(3);
  }
  const { access_token: token, user } = await res.json();

  fs.mkdirSync(OUT, { recursive: true });
  const report = { web: WEB, api: API, apiVersion: version, user, pages: [] };
  const browser = await chromium.launch();
  try {
    for (const [label, viewport, routes] of [
      ['desktop', { width: 1280, height: 900 }, DESKTOP_PAGES],
      ['mobile', { width: 390, height: 844 }, MOBILE_PAGES],
    ]) {
      const context = await browser.newContext({ viewport });
      // Session + skip the first-run tour (App.jsx shows it while bt_onboarding_v1 is empty).
      await context.addInitScript(t => {
        localStorage.setItem('bt_token', t);
        localStorage.setItem('bt_onboarding_v1', 'done');
      }, token);
      const page = await context.newPage();

      for (const route of routes) {
        const consoleErrors = [];
        const failedApiCalls = [];
        const onConsole = m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)); };
        const onResponse = r => {
          if (r.status() >= 400 && r.url().startsWith(API)) {
            failedApiCalls.push(`${r.status()} ${r.request().method()} ${r.url().slice(API.length)}`);
          }
        };
        page.on('console', onConsole);
        page.on('response', onResponse);

        await page.goto(WEB + route, { waitUntil: 'networkidle', timeout: 90000 })
          .catch(e => consoleErrors.push(`goto: ${e.message.split('\n')[0]}`));
        await page.waitForTimeout(1500);

        const file = `${label}-${route.slice(1) || 'root'}.png`;
        await page.screenshot({ path: path.join(OUT, file), fullPage: label === 'desktop' });
        report.pages.push({
          viewport: label,
          route,
          finalPath: new URL(page.url()).pathname,
          file,
          consoleErrors,
          failedApiCalls,
        });

        page.off('console', onConsole);
        page.off('response', onResponse);
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }

  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  for (const p of report.pages) {
    console.log(`${p.viewport.padEnd(8)}${p.route.padEnd(15)}-> ${p.finalPath.padEnd(15)} console_errors=${p.consoleErrors.length} failed_api=${p.failedApiCalls.length}`);
  }
  console.log(`api version: ${JSON.stringify(version)} | user: ${user?.email} (id ${user?.id}) | out: ${OUT}`);

  // A redirect to "/" means the session was not accepted.
  const bad = report.pages.filter(p => p.finalPath === '/' || p.failedApiCalls.length);
  process.exit(bad.length ? 1 : 0);
}

main().catch(e => {
  console.error(e.message);
  process.exit(1);
});
