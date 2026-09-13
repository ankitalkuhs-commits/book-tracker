// qa/a11y_audit.mjs
// Accessibility audit (axe-core, WCAG 2.1 A/AA rules) of every main web page on production, logged in as
// review.reader, plus the public pages logged out. Also a keyboard pass: Tab through the first 40 focus
// stops and record elements that take focus without a visible focus indicator or without an accessible name.
// Read-only: every non-GET API request is aborted (qa/RULES_OF_ENGAGEMENT.md).
//
//   node qa/a11y_audit.mjs [--web https://www.trackmyread.com] [--api https://book-tracker-stitch.onrender.com]
// Writes qa/reports/a11y-<date>.md and .json.
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const WEB = arg('web', 'https://www.trackmyread.com').replace(/\/$/, '');
const API = arg('api', 'https://book-tracker-stitch.onrender.com').replace(/\/$/, '');
const SECRET_FILE = arg('secret-file', path.join(REPO, '.env.review'));

function readSecret() {
  if (process.env.REVIEW_LOGIN_SECRET) return process.env.REVIEW_LOGIN_SECRET.trim();
  if (!fs.existsSync(SECRET_FILE)) return null;
  const m = fs.readFileSync(SECRET_FILE, 'utf8').match(/^REVIEW_LOGIN_SECRET=(.+)$/m);
  return m ? m[1].trim() : null;
}

async function keyboardPass(page) {
  const issues = [];
  await page.locator('body').click({ position: { x: 1, y: 1 } }).catch(() => {});
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      const outline = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0;
      const ring = /rgb|#/.test(cs.boxShadow) && cs.boxShadow !== 'none';
      const name = (el.getAttribute('aria-label') || el.innerText || el.getAttribute('title') ||
                    el.getAttribute('placeholder') || el.getAttribute('alt') || '').trim();
      return { tag: el.tagName.toLowerCase(), role: el.getAttribute('role'), name: name.slice(0, 60),
               visibleFocus: outline || ring, hasName: name.length > 0 };
    });
    if (!info) continue;
    if (!info.visibleFocus || !info.hasName) issues.push(info);
  }
  return issues;
}

async function audit(context, route, label) {
  const page = await context.newPage();
  const out = { route, label, violations: [], keyboard: [], error: null };
  try {
    await page.goto(WEB + route, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(1200);
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    out.violations = r.violations.map(v => ({
      id: v.id, impact: v.impact, help: v.help, count: v.nodes.length,
      sample: v.nodes.slice(0, 3).map(n => n.target.join(' ')).join(' | ').slice(0, 220),
    }));
    // Distinct colour pairs for contrast failures, so fixes can target design tokens, not selectors.
    out.contrastPairs = (r.violations.find(v => v.id === 'color-contrast')?.nodes || [])
      .map(n => ({ d: (n.any || []).find(c => c.id === 'color-contrast')?.data || {}, target: n.target.join(' '),
                   text: (n.html || '').replace(/<[^>]+>/g, '').trim().slice(0, 40) }))
      .map(({ d, target, text }) => ({ fg: d.fgColor, bg: d.bgColor, ratio: d.contrastRatio, expected: d.expectedContrastRatio,
                                       fontSize: d.fontSize, fontWeight: d.fontWeight, target: target.slice(0, 120), text }));
    out.keyboard = await keyboardPass(page);
  } catch (e) {
    out.error = String(e.message || e).split('\n')[0];
  } finally {
    await page.close();
  }
  console.log(`${label.padEnd(7)} ${route.padEnd(22)} violations=${out.violations.length} (nodes ${out.violations.reduce((a, v) => a + v.count, 0)}) keyboard_issues=${out.keyboard.length}${out.error ? ' ERROR ' + out.error : ''}`);
  return out;
}

async function main() {
  const secret = readSecret();
  if (!secret) { console.error('REVIEW_LOGIN_SECRET not set'); process.exit(2); }
  const res = await fetch(`${API}/auth/review-login`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'review.reader@trackmyread.com', secret }) });
  if (!res.ok) { console.error(`review-login failed: HTTP ${res.status}`); process.exit(3); }
  const { access_token: token } = await res.json();
  const get = p => fetch(API + p, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
  const [ubs, groups] = await Promise.all([get('/userbooks/'), get('/groups/my')]);
  const circle = (groups || []).find(g => g.name === 'Review Circle');

  const browser = await chromium.launch();
  const guard = async ctx => ctx.route('**/*', r => {
    const q = r.request();
    return q.url().startsWith(API) && !['GET', 'OPTIONS'].includes(q.method()) ? r.abort('blockedbyclient') : r.continue();
  });

  const authed = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await guard(authed);
  await authed.addInitScript(t => { localStorage.setItem('bt_token', t); localStorage.setItem('bt_onboarding_v1', 'done'); }, token);
  const anon = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await guard(anon);

  const results = [];
  for (const r of ['/home', '/library', ubs?.[0] ? `/library/book/${ubs[0].id}` : null, '/groups',
                   circle ? `/groups/${circle.id}` : null, '/groups/new', '/insights', '/notifications',
                   '/profile', '/profile/111', '/settings'].filter(Boolean)) {
    results.push(await audit(authed, r, 'authed'));
  }
  for (const r of ['/', '/about', '/privacy', '/terms', '/blog']) results.push(await audit(anon, r, 'public'));
  await browser.close();

  const date = new Date().toISOString().slice(0, 10);
  const dir = path.join(REPO, 'qa', 'reports');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `a11y-${date}.json`), JSON.stringify(results, null, 2));

  const agg = {};
  for (const p of results) for (const v of p.violations) {
    agg[v.id] ??= { impact: v.impact, help: v.help, pages: 0, nodes: 0, sample: v.sample };
    agg[v.id].pages += 1; agg[v.id].nodes += v.count;
  }
  const order = { critical: 0, serious: 1, moderate: 2, minor: 3 };
  const md = [`# Accessibility audit — ${date}`, '', `axe-core WCAG 2.1 A/AA on ${results.length} pages of \`${WEB}\` (authed as review.reader + public pages logged out), plus a 40-stop keyboard Tab pass per page.`, '',
    '## Violations by rule', '', '| impact | rule | pages | nodes | help | sample selector |', '|---|---|---:|---:|---|---|',
    ...Object.entries(agg).sort((a, b) => order[a[1].impact] - order[b[1].impact] || b[1].nodes - a[1].nodes)
      .map(([id, v]) => `| ${v.impact} | \`${id}\` | ${v.pages} | ${v.nodes} | ${v.help} | \`${v.sample.replace(/\|/g, '\\|')}\` |`),
    '', '## Per page', '', '| page | context | rules violated | nodes | keyboard issues (no visible focus or no name) | error |', '|---|---|---:|---:|---:|---|',
    ...results.map(p => `| \`${p.route}\` | ${p.label} | ${p.violations.length} | ${p.violations.reduce((a, v) => a + v.count, 0)} | ${p.keyboard.length} | ${p.error || ''} |`),
    '', '## Contrast failures by colour pair', '',
    '_Distinct foreground/background pairs across all pages — fix these at the design-token level._', '',
    '| fg | bg | ratio | needs | font | occurrences | pages | sample text | sample selector |', '|---|---|---:|---:|---|---:|---:|---|---|',
    ...Object.values(results.flatMap(p => (p.contrastPairs || []).map(c => ({ ...c, route: p.route })))
      .reduce((acc, c) => {
        const k = `${c.fg}|${c.bg}|${c.fontSize}|${c.fontWeight}`;
        acc[k] ??= { ...c, n: 0, routes: new Set() };
        acc[k].n += 1; acc[k].routes.add(c.route);
        return acc;
      }, {}))
      .sort((a, b) => b.n - a.n)
      .map(c => `| \`${c.fg}\` | \`${c.bg}\` | ${c.ratio} | ${c.expected} | ${c.fontSize} ${c.fontWeight} | ${c.n} | ${c.routes.size} | ${String(c.text).replace(/\|/g, '/')} | \`${String(c.target).replace(/\|/g, '\\|')}\` |`),
    '', '## Keyboard issue samples', '',
    ...results.filter(p => p.keyboard.length).map(p => `- \`${p.route}\`: ${p.keyboard.slice(0, 5).map(k => `${k.tag}${k.role ? `[role=${k.role}]` : ''} "${k.name}"${!k.visibleFocus ? ' (no focus ring)' : ''}${!k.hasName ? ' (no name)' : ''}`).join('; ')}`)];
  fs.writeFileSync(path.join(dir, `a11y-${date}.md`), md.join('\n') + '\n');
  console.log(`\nwrote qa/reports/a11y-${date}.md`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
