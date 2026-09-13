// qa/scenarios_web.mjs
// Drives the data-changing UI flows on production as review.reader, verifies each through the API, and
// cleans up through the API. Follows qa/RULES_OF_ENGAGEMENT.md.
//
// GUARD: every non-GET API request is checked against an allowlist of review-owned resources (ids fetched up
// front + ids created during this run). Anything else is aborted and reported as BLOCKED.
//
//   node qa/scenarios_web.mjs [--out qa/screenshots/<date>-scenarios] [--only S1,S4]
// Exit 0 = all scenarios ran (see report for PASS/FAIL per step); 2 no secret; 3 login refused; 4 cleanup failed.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const WEB = arg('web', 'https://www.trackmyread.com').replace(/\/$/, '');
const API = arg('api', 'https://book-tracker-stitch.onrender.com').replace(/\/$/, '');
const DATE = new Date().toISOString().slice(0, 10);
const OUT = path.resolve(arg('out', path.join(REPO, 'qa', 'screenshots', `${DATE}-scenarios`)));
const ONLY = arg('only', null)?.split(',');
const TS = Date.now().toString(36);
const SECRET_FILE = path.join(REPO, '.env.review');

function readSecret() {
  if (process.env.REVIEW_LOGIN_SECRET) return process.env.REVIEW_LOGIN_SECRET.trim();
  if (!fs.existsSync(SECRET_FILE)) return null;
  const m = fs.readFileSync(SECRET_FILE, 'utf8').match(/^REVIEW_LOGIN_SECRET=(.+)$/m);
  return m ? m[1].trim() : null;
}

// ---------- API helpers (token held in memory only) ----------
let TOKEN = null;
async function api(method, p, body) {
  const t0 = Date.now();
  const r = await fetch(API + p, {
    method, headers: { 'Content-Type': 'application/json', ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  return { status: r.status, json, text: text.slice(0, 200), ms: Date.now() - t0 };
}

// ---------- ownership allowlist ----------
const owned = { notes: new Set(), userbooks: new Set(), groupPosts: new Set(), circle: null };
const created = []; // {kind, id, cleaned}
function allowed(method, p) {
  const id = s => Number(s);
  const rules = [
    [/^POST \/notes\/?$/, () => true],
    [/^POST \/notes\/upload-image$/, () => false],                       // no uploads from scenarios
    [/^(PUT|DELETE) \/notes\/(\d+)$/, m => owned.notes.has(id(m[2]))],
    [/^(POST|DELETE) \/notes\/(\d+)\/like$/, m => owned.notes.has(id(m[2]))],
    [/^POST \/notes\/(\d+)\/comments$/, m => owned.notes.has(id(m[1]))],
    [/^POST \/books\/add-to-library$/, () => true],
    [/^(PATCH|DELETE) \/userbooks\/(\d+)$/, m => owned.userbooks.has(id(m[2]))],
    [/^PUT \/userbooks\/(\d+)\/progress$/, m => owned.userbooks.has(id(m[1]))],
    [/^POST \/userbooks\/(\d+)\/finish$/, m => owned.userbooks.has(id(m[1]))],
    [/^PUT \/profile\/me$/, () => true],
    [/^PATCH \/notifications\/prefs$/, () => true],
    [/^POST \/notifications\/mark-read$/, () => true],
    [/^POST \/groups\/(\d+)\/posts$/, m => id(m[1]) === owned.circle],
    [/^DELETE \/groups\/(\d+)\/posts\/(\d+)$/, m => id(m[1]) === owned.circle && owned.groupPosts.has(id(m[2]))],
  ];
  const key = `${method} ${p.split('?')[0]}`;
  for (const [re, ok] of rules) { const m = key.match(re); if (m) return ok(m); }
  return false;
}

// ---------- reporting ----------
const report = { web: WEB, api: API, date: DATE, scenarios: [] };
let cur = null;
function scenario(id, title) { cur = { id, title, steps: [], api: [], blocked: [], dialogs: [], consoleErrors: [], pageErrors: [] }; report.scenarios.push(cur); console.log(`\n== ${id} ${title}`); }
function step(name, pass, detail = '') { cur.steps.push({ name, pass, detail: String(detail).slice(0, 300) }); console.log(`  [${pass === null ? 'INFO' : pass ? 'PASS' : 'FAIL'}] ${name}${detail ? ' - ' + String(detail).slice(0, 160) : ''}`); }
const slug = s => s.replace(/[^a-z0-9]+/gi, '-').slice(0, 60);
async function shot(page, name) { await page.screenshot({ path: path.join(OUT, `${cur.id}-${slug(name)}.png`) }).catch(() => {}); }
async function settle(page, ms = 900) { await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {}); await page.waitForTimeout(ms); }
function lastCall(method, re) { return [...cur.api].reverse().find(a => a.method === method && re.test(a.path)); }

async function newPage(context) {
  const page = await context.newPage();
  const started = new Map();
  page.on('request', r => { if (r.url().startsWith(API)) started.set(r, Date.now()); });
  page.on('response', async r => {
    const q = r.request(); if (!q.url().startsWith(API)) return;
    const pth = q.url().replace(API, '').split('?')[0];
    const entry = { method: q.method(), path: pth, status: r.status(), ms: started.has(q) ? Date.now() - started.get(q) : null };
    cur?.api.push(entry);
    // Track ids created through the UI so later steps (and cleanup) may touch them.
    if (q.method() === 'POST' && r.status() < 300) {
      try {
        const j = await r.json();
        if (/^\/notes\/?$/.test(pth) && j?.id) { owned.notes.add(j.id); created.push({ kind: 'note', id: j.id, cleaned: false }); }
        if (/^\/books\/add-to-library$/.test(pth) && j?.id) { owned.userbooks.add(j.id); created.push({ kind: 'userbook', id: j.id, cleaned: false }); }
        if (/^\/groups\/\d+\/posts$/.test(pth) && j?.id) { owned.groupPosts.add(j.id); created.push({ kind: 'group_post', id: j.id, cleaned: false }); }
      } catch { /* ignore */ }
    }
  });
  page.on('console', m => { if (m.type() === 'error' && !/Push API in incognito/.test(m.text())) cur?.consoleErrors.push(m.text().slice(0, 200)); });
  page.on('pageerror', e => cur?.pageErrors.push(String(e).slice(0, 200)));
  page.on('dialog', async d => { cur?.dialogs.push(`${d.type()}: ${d.message().slice(0, 120)}`); await d.accept().catch(() => {}); });
  page.on('popup', async p => { await p.close().catch(() => {}); });
  return page;
}

// ---------- scenarios ----------
async function S1_postLifecycle(context) {
  scenario('S1', 'Home composer: post (quote + emotion) → comment → like → edit → delete');
  const page = await newPage(context);
  const text = `QA scenario note ${TS}`;
  await page.goto(WEB + '/home', { waitUntil: 'networkidle' }); await settle(page);
  await page.getByPlaceholder('What are your thoughts on your current read?').fill(text);
  await page.getByPlaceholder('Add a striking quote...').fill('A test quote');
  await page.getByRole('button', { name: /Joyful/ }).first().click().catch(e => step('select emotion chip', false, e.message));
  await shot(page, 'composer-filled');
  await page.getByRole('button', { name: 'Post', exact: true }).first().click();
  await settle(page, 1500);
  const post = lastCall('POST', /^\/notes\/?$/);
  step('POST /notes/ from composer', post?.status === 201, post ? `${post.status} in ${post.ms} ms` : 'no request');
  const mine = await api('GET', '/notes/me');
  const note = (mine.json || []).find(n => n.text === text);
  step('note persisted with quote + emotion', !!note && note.quote === 'A test quote' && !!note.emotion, note ? `id ${note.id} emotion=${note.emotion} public=${note.is_public}` : 'not found in /notes/me');
  await shot(page, 'after-post');
  if (!note) return;
  owned.notes.add(note.id);

  const card = page.locator('article', { hasText: text }).first();
  step('new post visible in feed without reload', await card.isVisible().catch(() => false));

  // Comment
  const commentBtn = card.locator('button:has(.material-symbols-outlined:text("chat_bubble")), button:has(.material-symbols-outlined:text("mode_comment"))').first();
  if (await commentBtn.count()) {
    await commentBtn.click(); await settle(page, 600);
    const input = page.getByPlaceholder('Add a comment...').first();
    if (await input.count()) {
      await input.fill(`QA comment ${TS} <b>bold?</b>`);
      await input.press('Enter');
      await settle(page, 1200);
      let c = lastCall('POST', /^\/notes\/\d+\/comments$/);
      if (!c) { await page.getByRole('button', { name: 'Post', exact: true }).last().click().catch(() => {}); await settle(page, 1200); c = lastCall('POST', /^\/notes\/\d+\/comments$/); }
      step('POST comment', c?.status === 201, c ? `${c.status} in ${c.ms} ms` : 'no request (Enter and Post both tried)');
      const cs = await api('GET', `/notes/${note.id}/comments`);
      step('comment persisted', (cs.json || []).some(x => x.text.startsWith(`QA comment ${TS}`)), `${(cs.json || []).length} comments`);
      const shownCount = await card.innerText().catch(() => '');
      step('comment count on card updated without reload', /\b1\b/.test(shownCount), 'card text checked for "1"');
      await shot(page, 'after-comment');
    } else step('comment input appears', false, 'placeholder "Add a comment..." not found');
  } else step('comment button on own post', false, 'no chat_bubble/mode_comment icon button');

  // Like own post
  const likeBtn = card.locator('button:has(.material-symbols-outlined:text("favorite"))').first();
  if (await likeBtn.count()) {
    await likeBtn.click(); await settle(page, 1000);
    const l = lastCall('POST', /^\/notes\/\d+\/like$/);
    step('POST like', l?.status === 201, l ? `${l.status} in ${l.ms} ms` : 'no request');
    const after = (await api('GET', '/notes/me')).json?.find(n => n.id === note.id);
    step('liked_by_me true + likes_count 1', after?.liked_by_me === true && after?.likes_count === 1, JSON.stringify({ liked: after?.liked_by_me, count: after?.likes_count }));
    await likeBtn.click(); await settle(page, 1000);
    const u = lastCall('DELETE', /^\/notes\/\d+\/like$/);
    step('DELETE like (toggle off)', u?.status === 200, u ? `${u.status} in ${u.ms} ms` : 'no request');
  } else step('like button on own post', false, 'no favorite icon button');

  // Edit via card menu
  const menu = card.locator('button:has(.material-symbols-outlined:text("more_horiz")), button:has(.material-symbols-outlined:text("more_vert"))').first();
  if (await menu.count()) {
    await menu.click(); await settle(page, 400);
    await page.getByRole('button', { name: /^Edit$/ }).first().click().catch(e => step('menu → Edit', false, e.message));
    await settle(page, 500);
    const editor = page.locator(`textarea:has-text("${text}")`).first();
    const ta = (await editor.count()) ? editor : page.locator('textarea').filter({ hasText: text }).first();
    if (await ta.count()) {
      await ta.fill(`${text} (edited)`);
      await page.getByRole('button', { name: /^Save$/ }).first().click();
      await settle(page, 1200);
      const put = lastCall('PUT', /^\/notes\/\d+$/);
      step('PUT note edit', put?.status === 200, put ? `${put.status} in ${put.ms} ms` : 'no request');
      const edited = (await api('GET', '/notes/me')).json?.find(n => n.id === note.id);
      step('edit persisted, quote/emotion preserved', edited?.text === `${text} (edited)` && edited?.quote === 'A test quote' && !!edited?.emotion,
        JSON.stringify({ text: edited?.text, quote: edited?.quote, emotion: edited?.emotion }));
      await shot(page, 'after-edit');
    } else step('edit textarea appears', false, 'no textarea containing the post text');
    // Delete
    await menu.click().catch(() => {}); await settle(page, 400);
    await page.getByRole('button', { name: /^Delete$/ }).first().click().catch(e => step('menu → Delete', false, e.message));
    await settle(page, 600);
    const confirmBtn = page.getByRole('button', { name: /^(Delete|Delete Post|Yes)$/ }).last();
    if (await confirmBtn.isVisible().catch(() => false)) { await confirmBtn.click(); await settle(page, 1200); }
    const del = lastCall('DELETE', /^\/notes\/\d+$/);
    step('DELETE note from UI', del?.status === 200, del ? `${del.status} in ${del.ms} ms; dialogs=${JSON.stringify(cur.dialogs)}` : 'no request');
    step('post gone from feed without reload', !(await page.locator('article', { hasText: text }).count()));
    await shot(page, 'after-delete');
  } else step('post menu (edit/delete) on own post', false, 'no more_horiz/more_vert icon button');
  await page.close();
}

async function S4_libraryLifecycle(context) {
  scenario('S4', 'Library: add via search → status Reading → progress → rating → note → remove');
  const page = await newPage(context);
  await page.goto(WEB + '/library', { waitUntil: 'networkidle' }); await settle(page);
  await page.getByRole('button', { name: /Add Book/ }).first().click();
  await settle(page, 500);
  const search = page.getByPlaceholder(/Search by title or author/).first();
  await search.fill('Siddhartha Hermann Hesse');
  await search.press('Enter');
  await settle(page, 2500);
  const g = lastCall('GET', /^\/api\/googlebooks\/search$/);
  step('Google Books search', g?.status === 200, g ? `${g.status} in ${g.ms} ms` : 'no request');
  await shot(page, 'search-results');
  const wantBtn = page.getByRole('button', { name: /Want to Read/ });
  const n = await wantBtn.count();
  if (!n) { step('result "Want to Read" button', false, 'none visible'); await page.close(); return; }
  await wantBtn.nth(n > 1 ? 1 : 0).click();   // index 0 may be the library filter tab
  await settle(page, 2000);
  const add = lastCall('POST', /^\/books\/add-to-library$/);
  step('POST add-to-library', add?.status === 200, add ? `${add.status} in ${add.ms} ms` : 'no request');
  const ubId = [...owned.userbooks].pop();
  if (!ubId) { await page.close(); return; }
  const ub = await api('GET', `/userbooks/${ubId}`);
  step('userbook created as to-read with google_books_id', ub.json?.status === 'to-read' && !!ub.json?.book?.google_books_id, `${ub.json?.book?.title} · ${ub.json?.status} · pages ${ub.json?.book?.total_pages}`);
  await shot(page, 'after-add');

  await page.goto(WEB + `/library/book/${ubId}`, { waitUntil: 'networkidle' }); await settle(page);
  await shot(page, 'detail-initial');
  await page.getByRole('button', { name: /^Reading$/ }).first().click().catch(e => step('click status Reading', false, e.message));
  await settle(page, 1500);
  step('status → reading', (await api('GET', `/userbooks/${ubId}`)).json?.status === 'reading');

  const num = page.locator('input[type="number"]').first();
  if (await num.count()) {
    await num.fill('10');
    await page.getByRole('button', { name: /^Update$/ }).first().click();
    await settle(page, 1500);
    const pr = lastCall('PUT', /^\/userbooks\/\d+\/progress$/);
    step('PUT progress 10', pr?.status === 200, pr ? `${pr.status} in ${pr.ms} ms` : 'no request');
    const after = (await api('GET', `/userbooks/${ubId}`)).json;
    step('current_page 10 + status reading', after?.current_page === 10 && after?.status === 'reading', JSON.stringify({ p: after?.current_page, s: after?.status }));
    await num.fill('-5');
    await page.getByRole('button', { name: /^Update$/ }).first().click();
    await settle(page, 1200);
    const neg = (await api('GET', `/userbooks/${ubId}`)).json;
    step('negative page rejected (page stays 10)', neg?.current_page === 10, JSON.stringify({ p: neg?.current_page, s: neg?.status, lastPut: lastCall('PUT', /progress$/)?.status }));
  } else step('progress number input', false, 'no input[type=number]');

  const stars = page.locator('button:has(.material-symbols-outlined:text("star"))');
  if ((await stars.count()) >= 4) {
    await stars.nth(3).click(); await settle(page, 1200);
    step('rating 4 persisted via PATCH', (await api('GET', `/userbooks/${ubId}`)).json?.rating === 4, lastCall('PATCH', /^\/userbooks\/\d+$/)?.status);
    step('rating did not reset progress (May-4 regression)', (await api('GET', `/userbooks/${ubId}`)).json?.current_page === 10);
  } else step('star rating buttons', false, `${await stars.count()} star buttons`);
  await shot(page, 'after-progress-rating');

  const ta = page.locator('textarea').first();
  if (await ta.count()) {
    await ta.fill(`QA book note ${TS}`);
    await page.getByRole('button', { name: 'Post', exact: true }).first().click();
    await settle(page, 1500);
    const np = lastCall('POST', /^\/notes\/?$/);
    step('POST note from book detail', np?.status === 201, np ? `${np.status} in ${np.ms} ms` : 'no request');
    const bn = (await api('GET', `/notes/userbook/${ubId}`)).json || [];
    step('book note listed for userbook', bn.some(x => x.text === `QA book note ${TS}`), `${bn.length} notes; public=${bn[0]?.is_public}`);
  } else step('book detail note textarea', false, 'none');

  await page.getByRole('button', { name: /Remove from library/ }).first().click().catch(e => step('click Remove from library', false, e.message));
  await settle(page, 800);
  const confirm = page.getByRole('button', { name: /^(Remove|Yes|Delete|Confirm)$/ }).last();
  if (await confirm.isVisible().catch(() => false)) { await confirm.click(); await settle(page, 1500); }
  const del = lastCall('DELETE', /^\/userbooks\/\d+$/);
  step('DELETE userbook (has note + reading_activity)', del?.status === 200, del ? `${del.status} in ${del.ms} ms; dialogs=${JSON.stringify(cur.dialogs)}` : 'no request');
  const gone = await api('GET', `/userbooks/${ubId}`);
  step('userbook gone', gone.status === 404, `GET → ${gone.status}`);
  step('navigated away from deleted book', !new URL(page.url()).pathname.includes(String(ubId)), new URL(page.url()).pathname);
  await shot(page, 'after-remove');
  await page.close();
}

async function S5_profileBio(context, original) {
  scenario('S5', 'Profile: edit bio → save → restore');
  const page = await newPage(context);
  await page.goto(WEB + '/profile', { waitUntil: 'networkidle' }); await settle(page);
  await page.getByRole('button', { name: /edit bio/i }).first().click().catch(e => step('click Edit Bio', false, e.message));
  await settle(page, 500);
  const ta = page.locator('textarea').first();
  if (!(await ta.count())) { step('bio textarea appears', false); await page.close(); return; }
  const bio = `QA bio ${TS} — émojis 📚 & <i>tags</i>`;
  await ta.fill(bio);
  await page.getByRole('button', { name: /^Save$/ }).first().click();
  await settle(page, 1500);
  const put = lastCall('PUT', /^\/profile\/me$/);
  step('PUT /profile/me', put?.status === 200, put ? `${put.status} in ${put.ms} ms` : 'no request');
  const me = await api('GET', '/profile/me');
  step('bio persisted exactly (unicode + tags kept as text)', me.json?.bio === bio, JSON.stringify(me.json?.bio));
  step('bio rendered as text, not HTML', (await page.locator('i', { hasText: 'tags' }).count()) === 0);
  await shot(page, 'after-bio');
  const restore = await api('PUT', '/profile/me', { bio: original.bio ?? '' });
  step('restore bio via API', restore.status === 200, `was ${JSON.stringify(original.bio)}`);
  await page.close();
}

async function S6_settings(context, original) {
  scenario('S6', 'Settings: one notification pref toggle must not reset the others · private profile toggle');
  const page = await newPage(context);
  const before = (await api('GET', '/notifications/prefs')).json;
  await page.goto(WEB + '/settings', { waitUntil: 'networkidle' }); await settle(page);
  await shot(page, 'settings-initial');
  // Make the test meaningful: set two prefs false via API first, then toggle a third in the UI.
  await api('PATCH', '/notifications/prefs', { ...before, new_follower: false, group_invite: false });
  await page.reload({ waitUntil: 'networkidle' }); await settle(page);
  const likes = page.getByRole('button', { name: /Toggle Likes/i }).first();
  if (await likes.count()) {
    await likes.click(); await settle(page, 1500);
    const pa = lastCall('PATCH', /^\/notifications\/prefs$/);
    step('PATCH prefs from Likes toggle', pa?.status === 200, pa ? `${pa.status} in ${pa.ms} ms` : 'no request');
    const after = (await api('GET', '/notifications/prefs')).json;
    step('post_liked flipped', after?.post_liked === !before.post_liked, JSON.stringify(after));
    step('other prefs NOT reset (new_follower + group_invite stay false)', after?.new_follower === false && after?.group_invite === false, JSON.stringify({ new_follower: after?.new_follower, group_invite: after?.group_invite }));
  } else step('Likes notification toggle', false, 'aria name "Toggle Likes" not found');
  const restorePrefs = await api('PATCH', '/notifications/prefs', before);
  step('restore prefs', restorePrefs.status === 200 && JSON.stringify((await api('GET', '/notifications/prefs')).json) === JSON.stringify(before));

  const priv = page.getByRole('button', { name: /Toggle private profile/i }).first();
  if (await priv.count()) {
    await priv.click(); await settle(page, 1500);
    step('private profile on', (await api('GET', '/profile/me')).json?.is_private_profile === !original.is_private_profile, lastCall('PUT', /^\/profile\/me$/)?.status);
    await shot(page, 'private-on');
    await priv.click(); await settle(page, 1500);
    step('private profile back off', (await api('GET', '/profile/me')).json?.is_private_profile === original.is_private_profile);
  } else step('private profile toggle', false, 'aria name not found');
  await api('PUT', '/profile/me', { is_private_profile: original.is_private_profile });
  step('yearly goal clear-to-empty', null, original.yearly_goal == null
    ? 'NOT RUN: PUT /profile/me ignores yearly_goal=null, so a set goal could not be removed again (finding)'
    : `unchanged (${original.yearly_goal})`);
  await page.close();
}

async function S7_circlePost(context) {
  scenario('S7', 'Review Circle: new post → delete');
  const page = await newPage(context);
  await page.goto(WEB + `/groups/${owned.circle}`, { waitUntil: 'networkidle' }); await settle(page);
  await shot(page, 'circle-initial');
  await page.getByRole('button', { name: 'Post', exact: true }).first().click().catch(e => step('open new post', false, e.message));
  await settle(page, 600);
  const ta = page.locator('textarea').first();
  if (!(await ta.count())) { step('group composer textarea', false); await page.close(); return; }
  const text = `QA circle post ${TS}`;
  await ta.fill(text);
  await page.getByRole('button', { name: 'Post', exact: true }).last().click();
  await settle(page, 1500);
  const gp = lastCall('POST', /^\/groups\/\d+\/posts$/);
  step('POST group post', gp?.status === 201, gp ? `${gp.status} in ${gp.ms} ms` : 'no request');
  const posts = (await api('GET', `/groups/${owned.circle}/posts`)).json;
  const list = Array.isArray(posts) ? posts : posts?.posts || posts?.items || [];
  const mine = list.find(p => p.text === text);
  if (mine) owned.groupPosts.add(mine.id);
  step('group post persisted', !!mine, mine ? `id ${mine.id}` : `${list.length} posts`);
  await shot(page, 'after-post');
  const card = page.locator('article, div', { hasText: text }).last();
  const delBtn = card.locator('button:has(.material-symbols-outlined:text("delete"))').first();
  if (await delBtn.count()) {
    await delBtn.click(); await settle(page, 1500);
    const d = lastCall('DELETE', /^\/groups\/\d+\/posts\/\d+$/);
    step('DELETE group post (no confirmation expected per inventory)', d?.status === 204 || d?.status === 200, d ? `${d.status} in ${d.ms} ms; dialogs=${JSON.stringify(cur.dialogs)}` : 'no request');
  } else step('group post delete button', false, 'no delete icon on own post');
  await page.close();
}

async function S8_notifications(context) {
  scenario('S8', 'Notifications: mark all read');
  const page = await newPage(context);
  await page.goto(WEB + '/notifications', { waitUntil: 'networkidle' }); await settle(page);
  const btn = page.getByRole('button', { name: /Mark all as read/ }).first();
  if (await btn.isVisible().catch(() => false)) {
    await btn.click(); await settle(page, 1200);
    const m = lastCall('POST', /^\/notifications\/mark-read$/);
    step('POST mark-read', m?.status === 200, m ? `${m.status} in ${m.ms} ms` : 'no request');
    step('unread-count 0', (await api('GET', '/notifications/unread-count')).json?.unread === 0);
    step('nav badge cleared without reload', (await page.locator('nav').innerText().catch(() => '')).match(/Notifications\s*1/) === null);
  } else step('Mark all as read', null, 'not visible (0 unread) — nothing to test');
  await shot(page, 'after');
  await page.close();
}

async function S9_signOut(browser) {
  scenario('S9', 'Sign out clears the session');
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(t => { if (!sessionStorage.getItem('qa_seeded')) { localStorage.setItem('bt_token', t); localStorage.setItem('bt_onboarding_v1', 'done'); sessionStorage.setItem('qa_seeded', '1'); } }, TOKEN);
  const page = await newPage(ctx);
  await page.goto(WEB + '/profile', { waitUntil: 'networkidle' }); await settle(page);
  await page.getByRole('button', { name: /^Sign out$/ }).first().click().catch(e => step('click Sign out', false, e.message));
  await settle(page, 1500);
  step('redirected to landing', new URL(page.url()).pathname === '/', new URL(page.url()).pathname);
  step('bt_token removed', (await page.evaluate(() => localStorage.getItem('bt_token'))) === null);
  await page.goto(WEB + '/library', { waitUntil: 'networkidle' }); await settle(page);
  step('protected route redirects when signed out', new URL(page.url()).pathname === '/', new URL(page.url()).pathname);
  await shot(page, 'signed-out');
  await ctx.close();
}

// ---------- main ----------
async function main() {
  const secret = readSecret();
  if (!secret) { console.error('REVIEW_LOGIN_SECRET not set'); process.exit(2); }
  const login = await api('POST', '/auth/review-login', { email: 'review.reader@trackmyread.com', secret });
  if (login.status !== 200) { console.error(`review-login failed: ${login.status}`); process.exit(3); }
  TOKEN = login.json.access_token;

  const [notes, ubs, groups, me] = await Promise.all([api('GET', '/notes/me'), api('GET', '/userbooks/'), api('GET', '/groups/my'), api('GET', '/profile/me')]);
  (notes.json || []).forEach(n => owned.notes.add(n.id));
  (ubs.json || []).forEach(u => owned.userbooks.add(u.id));
  owned.circle = (groups.json || []).find(g => g.name === 'Review Circle')?.id ?? null;
  const original = { bio: me.json?.bio ?? null, is_private_profile: !!me.json?.is_private_profile, yearly_goal: me.json?.yearly_goal ?? null };
  const baseline = { notes: owned.notes.size, userbooks: owned.userbooks.size };

  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addInitScript(t => { localStorage.setItem('bt_token', t); localStorage.setItem('bt_onboarding_v1', 'done'); }, TOKEN);
  await context.route('**/*', route => {
    const q = route.request(); const url = q.url();
    if (/api\.cloudinary\.com/.test(url)) { cur?.blocked.push(`${q.method()} ${url}`); return route.abort('blockedbyclient'); }
    if (!url.startsWith(API) || ['GET', 'OPTIONS'].includes(q.method())) return route.continue();
    const p = url.replace(API, '').split('?')[0];
    if (allowed(q.method(), p)) return route.continue();
    cur?.blocked.push(`${q.method()} ${p}`);
    console.log(`  [BLOCKED] ${q.method()} ${p}`);
    return route.abort('blockedbyclient');
  });

  const run = async (id, fn) => {
    if (ONLY && !ONLY.includes(id)) return;
    try { await fn(); } catch (e) { step(`${id} aborted`, false, e.message.split('\n')[0]); }
  };
  try {
    await run('S1', () => S1_postLifecycle(context));
    await run('S4', () => S4_libraryLifecycle(context));
    await run('S5', () => S5_profileBio(context, original));
    await run('S6', () => S6_settings(context, original));
    if (owned.circle) await run('S7', () => S7_circlePost(context));
    await run('S8', () => S8_notifications(context));
    await run('S9', () => S9_signOut(browser));
  } finally {
    // ---------- cleanup (API) ----------
    scenario('CLEANUP', 'Delete everything this run created; restore profile + prefs');
    for (const c of created) {
      const pathFor = { note: `/notes/${c.id}`, userbook: `/userbooks/${c.id}`, group_post: `/groups/${owned.circle}/posts/${c.id}` }[c.kind];
      const r = await api('GET', c.kind === 'userbook' ? `/userbooks/${c.id}` : c.kind === 'note' ? '/notes/me' : `/groups/${owned.circle}/posts`);
      const exists = c.kind === 'userbook' ? r.status === 200
        : c.kind === 'note' ? (r.json || []).some(n => n.id === c.id)
        : (Array.isArray(r.json) ? r.json : r.json?.posts || []).some(p => p.id === c.id);
      if (exists) { const d = await api('DELETE', pathFor); c.cleaned = d.status < 300; step(`delete leftover ${c.kind} ${c.id}`, c.cleaned, d.status); }
      else { c.cleaned = true; step(`${c.kind} ${c.id} already removed by UI`, true); }
    }
    await api('PUT', '/profile/me', { bio: original.bio ?? '', is_private_profile: original.is_private_profile });
    const after = await Promise.all([api('GET', '/notes/me'), api('GET', '/userbooks/'), api('GET', '/profile/me')]);
    const ok = (after[0].json || []).length === baseline.notes && (after[1].json || []).length === baseline.userbooks
      && (after[2].json?.bio ?? '') === (original.bio ?? '') && !!after[2].json?.is_private_profile === original.is_private_profile;
    step('fixture back to baseline', ok, `notes ${(after[0].json || []).length}/${baseline.notes} · userbooks ${(after[1].json || []).length}/${baseline.userbooks}`);
    report.cleanup = { created: created.length, cleaned: created.filter(c => c.cleaned).length, baselineRestored: ok };
    await browser.close();
    fs.writeFileSync(path.join(OUT, 'scenarios.json'), JSON.stringify(report, null, 2));
    const md = [`# Web scenario run — ${DATE}`, '', `\`${WEB}\` as review.reader · cleanup: created ${report.cleanup.created} / cleaned ${report.cleanup.cleaned} · baseline restored: ${ok}`, ''];
    for (const s of report.scenarios) {
      md.push(`## ${s.id} — ${s.title}`, '', '| result | step | detail |', '|---|---|---|');
      md.push(...s.steps.map(x => `| ${x.pass === null ? 'INFO' : x.pass ? 'PASS' : '**FAIL**'} | ${x.name} | ${x.detail.replace(/\|/g, '/')} |`));
      const slow = s.api.filter(a => a.ms > 2000).map(a => `${a.method} ${a.path} ${a.ms}ms`);
      if (s.blocked.length) md.push('', `**Blocked by guard:** ${s.blocked.join(', ')}`);
      if (s.dialogs.length) md.push('', `Dialogs: ${s.dialogs.join(' · ')}`);
      if (s.consoleErrors.length || s.pageErrors.length) md.push('', `Console/page errors: ${[...s.consoleErrors, ...s.pageErrors].slice(0, 5).join(' · ')}`);
      if (slow.length) md.push('', `API calls > 2 s: ${slow.slice(0, 8).join(' · ')}`);
      if (s.api.some(a => a.status >= 500)) md.push('', `**5xx:** ${s.api.filter(a => a.status >= 500).map(a => `${a.method} ${a.path} ${a.status}`).join(', ')}`);
      md.push('');
    }
    fs.mkdirSync(path.join(REPO, 'qa', 'reports'), { recursive: true });
    fs.writeFileSync(path.join(REPO, 'qa', 'reports', `scenarios-web-${DATE}.md`), md.join('\n'));
    console.log(`\ncleanup ${JSON.stringify(report.cleanup)}\nwrote qa/reports/scenarios-web-${DATE}.md`);
    if (!ok) process.exitCode = 4;
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
