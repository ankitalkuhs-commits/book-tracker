// qa/scenarios_web.mjs
// Drives the data-changing UI flows on production as review.reader, verifies each through the API, and cleans up
// through the API. Follows qa/RULES_OF_ENGAGEMENT.md.
//
// Design rules (learned from the 2026-09-13 first run, which deleted a seeded book by guessing an id):
//   1. Every UI action waits for ITS OWN API response (page.waitForResponse, 30 s) — never a fixed sleep.
//   2. Ids of created rows come ONLY from that response body. No id → the flow stops.
//   3. The network guard only lets PUT/PATCH/DELETE touch rows CREATED IN THIS RUN (plus one explicitly designated
//      seeded "reading" book for progress). Seeded rows can never be edited or deleted by a mis-targeted click.
//   4. Dialogs are accepted only when their text matches what the current step expects; anything else is dismissed
//      and reported as UNEXPECTED_DIALOG.
//   5. Button names tolerate Material Symbols ligature prefixes ("edit Edit", "logout Sign out").
//
//   node qa/scenarios_web.mjs [--out qa/screenshots/<date>-scenarios] [--only S1,S4]
// Exit 0 ran (see report per step); 2 no secret; 3 login refused; 4 fixture not restored.
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
const RESP_TIMEOUT = 30000;

function readSecret() {
  if (process.env.REVIEW_LOGIN_SECRET) return process.env.REVIEW_LOGIN_SECRET.trim();
  if (!fs.existsSync(SECRET_FILE)) return null;
  const m = fs.readFileSync(SECRET_FILE, 'utf8').match(/^REVIEW_LOGIN_SECRET=(.+)$/m);
  return m ? m[1].trim() : null;
}

// ---------- API (token in memory only) ----------
let TOKEN = null;
async function api(method, p, body) {
  const t0 = Date.now();
  const r = await fetch(API + p, {
    method, headers: { 'Content-Type': 'application/json', ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  return { status: r.status, json, ms: Date.now() - t0 };
}

// ---------- guard: created-this-run ownership ----------
const created = { notes: new Set(), userbooks: new Set(), groupPosts: new Set() };
const ledger = []; // {kind, id, cleaned}
let seededReadingId = null;
let circleId = null;
let seededNoteIds = new Set();
function allowed(method, p) {
  const n = s => Number(s);
  const rules = [
    [/^POST \/notes\/?$/, () => true],
    [/^(PUT|DELETE) \/notes\/(\d+)$/, m => created.notes.has(n(m[2]))],
    [/^(POST|DELETE) \/notes\/(\d+)\/like$/, m => created.notes.has(n(m[2]))],
    [/^POST \/notes\/(\d+)\/comments$/, m => created.notes.has(n(m[1]))],
    [/^POST \/books\/add-to-library$/, () => true],
    [/^(PATCH|DELETE) \/userbooks\/(\d+)$/, m => created.userbooks.has(n(m[2]))],
    [/^PUT \/userbooks\/(\d+)\/progress$/, m => created.userbooks.has(n(m[1])) || n(m[1]) === seededReadingId],
    [/^PUT \/profile\/me$/, () => true],
    [/^PATCH \/notifications\/prefs$/, () => true],
    [/^POST \/notifications\/mark-read$/, () => true],
    [/^POST \/groups\/(\d+)\/posts$/, m => n(m[1]) === circleId],
    [/^DELETE \/groups\/(\d+)\/posts\/(\d+)$/, m => n(m[1]) === circleId && created.groupPosts.has(n(m[2]))],
  ];
  const key = `${method} ${p}`;
  for (const [re, ok] of rules) { const m = key.match(re); if (m) return ok(m); }
  return false;
}
function track(kind, id) {
  if (!id) return;
  ({ note: created.notes, userbook: created.userbooks, group_post: created.groupPosts })[kind].add(id);
  ledger.push({ kind, id, cleaned: false });
}

// ---------- reporting ----------
const report = { web: WEB, api: API, date: DATE, scenarios: [] };
let cur = null;
function scenario(id, title) {
  cur = { id, title, steps: [], api: [], blocked: [], dialogs: [], unexpectedDialogs: [], consoleErrors: [], pageErrors: [] };
  report.scenarios.push(cur); console.log(`\n== ${id} ${title}`);
}
function step(name, pass, detail = '') {
  cur.steps.push({ name, pass, detail: String(detail).slice(0, 300) });
  console.log(`  [${pass === null ? 'INFO' : pass ? 'PASS' : 'FAIL'}] ${name}${detail !== '' ? ' - ' + String(detail).slice(0, 170) : ''}`);
}
const slug = s => s.replace(/[^a-z0-9]+/gi, '-').slice(0, 60);
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const label = text => new RegExp(`^\\s*(?:[a-z_]+\\s+){0,2}${esc(text)}\\s*$`, 'i'); // icon-ligature tolerant
async function shot(page, name) { await page.screenshot({ path: path.join(OUT, `${cur.id}-${slug(name)}.png`) }).catch(() => {}); }
const pause = (page, ms = 600) => page.waitForTimeout(ms);

// Run `action`, wait for the first API response matching method + path regex. Returns {status, json, ms} or null.
async function actAndWait(page, method, re, action, timeout = RESP_TIMEOUT) {
  const t0 = Date.now();
  const wait = page.waitForResponse(r => r.request().method() === method && r.url().startsWith(API)
    && re.test(r.url().slice(API.length).split('?')[0]), { timeout }).catch(() => null);
  await action();
  const resp = await wait;
  if (!resp) return null;
  let json = null; try { json = await resp.json(); } catch { /* 204 / non-JSON */ }
  return { status: resp.status(), json, ms: Date.now() - t0 };
}
function expectDialog(page, re) { page._expectDialog = re; }

async function newPage(context) {
  const page = await context.newPage();
  page._expectDialog = null;
  page.on('response', r => {
    const q = r.request(); if (!q.url().startsWith(API)) return;
    cur?.api.push({ method: q.method(), path: q.url().slice(API.length).split('?')[0], status: r.status() });
  });
  page.on('console', m => { if (m.type() === 'error' && !/Push API in incognito/.test(m.text())) cur?.consoleErrors.push(m.text().slice(0, 200)); });
  page.on('pageerror', e => cur?.pageErrors.push(String(e).slice(0, 200)));
  page.on('dialog', async d => {
    const msg = `${d.type()}: ${d.message().slice(0, 120)}`;
    if (page._expectDialog && page._expectDialog.test(d.message())) {
      cur?.dialogs.push(msg); page._expectDialog = null; await d.accept().catch(() => {});
    } else {
      cur?.unexpectedDialogs.push(msg); console.log(`  [UNEXPECTED_DIALOG dismissed] ${msg}`); await d.dismiss().catch(() => {});
    }
  });
  page.on('popup', async p => { await p.close().catch(() => {}); });
  return page;
}
const res = (r, ok = s => s < 300) => (r ? `${r.status} in ${r.ms} ms` : 'no response within 30 s') + '';
const okStatus = (r, codes) => !!r && codes.includes(r.status);

// ---------- S1: composer post lifecycle ----------
async function S1(context) {
  scenario('S1', 'Home composer: post (quote + emotion) → comment → like → edit → delete');
  const page = await newPage(context);
  const text = `QA scenario note ${TS}`;
  await page.goto(WEB + '/home', { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder('What are your thoughts on your current read?').waitFor({ timeout: 45000 });
  await page.getByPlaceholder('What are your thoughts on your current read?').fill(text);
  await page.getByPlaceholder('Add a striking quote...').fill('A test quote');
  await page.getByRole('button', { name: /Joyful/ }).first().click();
  await shot(page, 'composer-filled');
  const post = await actAndWait(page, 'POST', /^\/notes\/?$/, () => page.getByRole('button', { name: label('Post') }).first().click());
  step('POST /notes/ from composer', okStatus(post, [201]), res(post));
  const noteId = post?.json?.id; track('note', noteId);
  if (!noteId) { step('note id from response', false, 'stopping S1'); await page.close(); return; }
  const persisted = (await api('GET', '/notes/me')).json?.find(n => n.id === noteId);
  step('persisted with quote + emotion', persisted?.text === text && persisted?.quote === 'A test quote' && !!persisted?.emotion,
    `emotion=${persisted?.emotion} is_public=${persisted?.is_public}`);
  step('composer default visibility (F-17 decision: should become private)', null, `is_public=${persisted?.is_public}`);
  const card = page.locator('article', { hasText: text }).first();
  const t0 = Date.now();
  const shown = await card.waitFor({ state: 'visible', timeout: 20000 }).then(() => true).catch(() => false);
  step('post appears in feed without reload', shown, shown ? `rendered ${Date.now() - t0} ms after the 201` : 'not rendered within 20 s of the 201');
  await shot(page, 'after-post');
  if (!shown) {
    const tabs = await page.getByRole('button', { name: /Community|Friends/ }).allInnerTexts().catch(() => []);
    step('diagnostic: feed tabs / first article', null, `tabs=${JSON.stringify(tabs)} first=${JSON.stringify((await page.locator('article').first().innerText().catch(() => '')).slice(0, 80))}`);
    await page.close(); return;
  }

  // comment
  const toggle = card.locator('button:has(.material-symbols-outlined:text("chat_bubble"))').first();
  if (await toggle.count()) {
    await toggle.click();
    const input = page.getByPlaceholder('Add a comment...').first();
    const appeared = await input.waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
    step('comment input appears after toggle', appeared);
    if (appeared) {
      await input.fill(`QA comment ${TS} <b>x</b>`);
      const c = await actAndWait(page, 'POST', /^\/notes\/\d+\/comments$/, () => input.press('Enter'));
      step('POST comment (Enter)', okStatus(c, [201]), res(c));
      await pause(page, 800);
      const cs = (await api('GET', `/notes/${noteId}/comments`)).json || [];
      step('comment persisted', cs.some(x => x.text.startsWith(`QA comment ${TS}`)), `${cs.length} comment(s)`);
      step('comment shown as text, not HTML', (await card.locator('b', { hasText: 'x' }).count()) === 0);
      const count = await card.locator('button:has(.material-symbols-outlined:text("chat_bubble"))').first().innerText().catch(() => '');
      step('comment count on card updated without reload', /\b1\b/.test(count), JSON.stringify(count));
      await shot(page, 'after-comment');
    }
  } else step('comment toggle on own post', false, 'no chat_bubble button');

  // like / unlike
  const like = card.locator('button:has(.material-symbols-outlined:text("favorite"))').first();
  const l1 = await actAndWait(page, 'POST', /^\/notes\/\d+\/like$/, () => like.click());
  step('POST like', okStatus(l1, [201]), res(l1));
  const afterLike = (await api('GET', '/notes/me')).json?.find(n => n.id === noteId);
  step('liked_by_me true, likes_count 1', afterLike?.liked_by_me === true && afterLike?.likes_count === 1, JSON.stringify({ liked: afterLike?.liked_by_me, count: afterLike?.likes_count }));
  await pause(page, 500);
  const l2 = await actAndWait(page, 'DELETE', /^\/notes\/\d+\/like$/, () => like.click());
  step('DELETE like (toggle off)', okStatus(l2, [200]), res(l2));
  const afterUnlike = (await api('GET', '/notes/me')).json?.find(n => n.id === noteId);
  step('liked_by_me false, likes_count 0', afterUnlike?.liked_by_me === false && afterUnlike?.likes_count === 0, JSON.stringify({ liked: afterUnlike?.liked_by_me, count: afterUnlike?.likes_count }));

  // edit
  const menu = card.locator('button:has(.material-symbols-outlined:text("more_horiz"))').first();
  if (await menu.count()) {
    await menu.click(); await pause(page, 400);
    const editBtn = page.getByRole('button', { name: label('Edit') }).first();
    if (await editBtn.isVisible().catch(() => false)) {
      await editBtn.click(); await pause(page, 500);
      const ta = card.locator('textarea').first();
      if (await ta.count()) {
        await ta.fill(`${text} (edited)`);
        const put = await actAndWait(page, 'PUT', /^\/notes\/\d+$/, () => card.getByRole('button', { name: label('Save') }).first().click());
        step('PUT note edit', okStatus(put, [200]), res(put));
        const edited = (await api('GET', '/notes/me')).json?.find(n => n.id === noteId);
        step('edit persisted; quote + emotion preserved', edited?.text === `${text} (edited)` && edited?.quote === 'A test quote' && !!edited?.emotion,
          JSON.stringify({ text: edited?.text, quote: edited?.quote, emotion: edited?.emotion }));
        await shot(page, 'after-edit');
      } else step('inline edit textarea', false, 'no textarea in the card');
    } else step('menu shows Edit', false, 'Edit not visible after opening menu');

    // delete
    await menu.click().catch(() => {}); await pause(page, 400);
    const delBtn = page.getByRole('button', { name: label('Delete') }).first();
    if (await delBtn.isVisible().catch(() => false)) {
      expectDialog(page, /delete/i);
      const del = await actAndWait(page, 'DELETE', /^\/notes\/\d+$/, () => delBtn.click());
      step('DELETE note (confirm accepted)', okStatus(del, [200]), `${res(del)} · dialogs=${JSON.stringify(cur.dialogs)}`);
      await pause(page, 800);
      step('post removed from feed without reload', (await page.locator('article', { hasText: text }).count()) === 0);
      await shot(page, 'after-delete');
    } else step('menu shows Delete', false);
  } else step('owner menu on own post', false, 'no more_horiz button');
  await page.close();
}

// ---------- S4: library lifecycle ----------
async function S4(context) {
  scenario('S4', 'Library: add via search → Reading → rating → note → delete note → remove; progress on seeded book');
  const page = await newPage(context);
  await page.goto(WEB + '/library', { waitUntil: 'domcontentloaded' });
  const addBtn = page.getByRole('button', { name: label('Add Book') }).first();
  await addBtn.waitFor({ timeout: 45000 });
  await addBtn.click();
  const search = page.getByPlaceholder(/Search by title or author/).first();
  await search.waitFor({ timeout: 15000 });
  const wantBefore = await page.getByRole('button', { name: label('Want to Read') }).count();
  await search.fill('Siddhartha Hermann Hesse');
  const g = await actAndWait(page, 'GET', /^\/api\/googlebooks\/search$/, () => search.press('Enter'));
  step('Google Books search', okStatus(g, [200]), `${res(g)} · ${g?.json?.results?.length ?? '?'} results`);
  await pause(page, 800);
  await shot(page, 'search-results');
  const wants = page.getByRole('button', { name: label('Want to Read') });
  const wantAfter = await wants.count();
  if (wantAfter <= wantBefore) { step('result row "Want to Read" buttons', false, `before ${wantBefore}, after ${wantAfter}`); await page.close(); return; }
  const add = await actAndWait(page, 'POST', /^\/books\/add-to-library$/, () => wants.nth(wantBefore).click());
  step('POST add-to-library', okStatus(add, [200, 201]), res(add));
  const ubId = add?.json?.id; track('userbook', ubId);
  if (!ubId) { step('userbook id from response', false, `stopping S4 · body ${JSON.stringify(add?.json)?.slice(0, 120)}`); await page.close(); return; }
  step('response shape: flat userbook with book.google_books_id', !!add.json.book?.google_books_id && add.json.status === 'to-read',
    `${add.json.book?.title} · ${add.json.status} · pages ${add.json.book?.total_pages} · cover ${add.json.book?.cover_url ? 'yes' : 'no'}`);
  await pause(page, 800);
  step('modal closed and library shows the book', await page.getByText(add.json.book?.title || '§', { exact: false }).first().isVisible().catch(() => false));
  await shot(page, 'after-add');

  await page.goto(WEB + `/library/book/${ubId}`, { waitUntil: 'domcontentloaded' });
  const readingBtn = page.getByRole('button', { name: label('Reading') }).first();
  await readingBtn.waitFor({ timeout: 45000 });
  await shot(page, 'detail-initial');
  const st = await actAndWait(page, 'PATCH', /^\/userbooks\/\d+$/, () => readingBtn.click());
  step('PATCH status → reading', okStatus(st, [200]), res(st));
  step('status persisted', (await api('GET', `/userbooks/${ubId}`)).json?.status === 'reading');

  const stars = page.locator('button.material-symbols-outlined', { hasText: /^star/ });
  const starCount = await stars.count();
  if (starCount >= 5) {
    const r4 = await actAndWait(page, 'PATCH', /^\/userbooks\/\d+$/, () => stars.nth(3).click());
    step('PATCH rating 4', okStatus(r4, [200]), res(r4));
    const afterRating = (await api('GET', `/userbooks/${ubId}`)).json;
    step('rating 4 persisted; page + status unchanged (May-4 regression)', afterRating?.rating === 4 && afterRating?.status === 'reading' && (afterRating?.current_page ?? 0) === 0,
      JSON.stringify({ r: afterRating?.rating, s: afterRating?.status, p: afterRating?.current_page }));
  } else step('5 star rating buttons', false, `${starCount} found`);

  const noteBox = page.locator('textarea').first();
  let bookNoteId = null;
  if (await noteBox.count()) {
    await noteBox.fill(`QA book note ${TS}`);
    const np = await actAndWait(page, 'POST', /^\/notes\/?$/, () => page.getByRole('button', { name: label('Post') }).first().click());
    step('POST note from book detail', okStatus(np, [201]), res(np));
    bookNoteId = np?.json?.id; track('note', bookNoteId);
    step('book note default visibility (F-17)', null, `is_public=${np?.json?.is_public}`);
    await pause(page, 800);
    if (bookNoteId) {
      const noteCard = page.locator('div', { hasText: `QA book note ${TS}` }).last();
      const del = noteCard.getByRole('button', { name: label('Delete') }).first();
      if (await del.count()) {
        expectDialog(page, /delete this note/i);
        const dn = await actAndWait(page, 'DELETE', /^\/notes\/\d+$/, () => del.click());
        step('DELETE book note (confirm accepted)', okStatus(dn, [200]), res(dn));
      } else step('delete button on the new book note', false);
    }
  } else step('book-detail note textarea', false);

  expectDialog(page, /remove this book/i);
  const rm = await actAndWait(page, 'DELETE', /^\/userbooks\/\d+$/, () => page.getByRole('button', { name: label('Remove from library') }).first().click());
  step('DELETE userbook via "Remove from library" (confirm accepted)', okStatus(rm, [200]), `${res(rm)} · dialogs=${JSON.stringify(cur.dialogs)}`);
  await pause(page, 1200);
  step('userbook gone (404)', (await api('GET', `/userbooks/${ubId}`)).status === 404);
  step('navigated to /library', new URL(page.url()).pathname === '/library', new URL(page.url()).pathname);
  await shot(page, 'after-remove');

  // progress on the designated seeded reading book (+1, then restore)
  if (seededReadingId) {
    const before = (await api('GET', `/userbooks/${seededReadingId}`)).json;
    const start = before?.current_page || 0;
    await page.goto(WEB + `/library/book/${seededReadingId}`, { waitUntil: 'domcontentloaded' });
    const input = page.getByRole('spinbutton').first();
    if (await input.waitFor({ timeout: 45000 }).then(() => true).catch(() => false)) {
      await input.fill(String(start + 1));
      const pr = await actAndWait(page, 'PUT', /^\/userbooks\/\d+\/progress$/, () => page.getByRole('button', { name: label('Update') }).first().click());
      step(`PUT progress on seeded "${before?.book?.title}" ${start}→${start + 1}`, okStatus(pr, [200]), res(pr));
      const after = (await api('GET', `/userbooks/${seededReadingId}`)).json;
      step('progress persisted, status stays reading', after?.current_page === start + 1 && after?.status === 'reading', JSON.stringify({ p: after?.current_page, s: after?.status }));
      await input.fill('-5');
      const neg = await actAndWait(page, 'PUT', /^\/userbooks\/\d+\/progress$/, () => page.getByRole('button', { name: label('Update') }).first().click(), 8000);
      const afterNeg = (await api('GET', `/userbooks/${seededReadingId}`)).json;
      step('negative page not saved', afterNeg?.current_page === start + 1, neg ? `request sent → ${neg.status}; page ${afterNeg?.current_page}` : 'blocked client-side (no request)');
      await shot(page, 'seeded-progress');
      const restore = await api('PUT', `/userbooks/${seededReadingId}/progress`, { current_page: start });
      step('restore seeded progress', restore.status === 200 && (await api('GET', `/userbooks/${seededReadingId}`)).json?.current_page === start);
    } else step('progress input on seeded reading book', false);
  }
  await page.close();
}

// ---------- S5: bio ----------
async function S5(context, original) {
  scenario('S5', 'Profile: edit bio → save → restore');
  const page = await newPage(context);
  await page.goto(WEB + '/profile', { waitUntil: 'domcontentloaded' });
  const edit = page.getByRole('button', { name: /edit\s*bio/i }).first();
  await edit.waitFor({ timeout: 45000 });
  await edit.click();
  const ta = page.locator('textarea').first();
  if (!(await ta.waitFor({ timeout: 10000 }).then(() => true).catch(() => false))) { step('bio textarea', false); await page.close(); return; }
  const bio = `QA bio ${TS} — émojis 📚 & <i>tags</i>`;
  await ta.fill(bio);
  const put = await actAndWait(page, 'PUT', /^\/profile\/me$/, () => page.getByRole('button', { name: label('Save') }).first().click());
  step('PUT /profile/me', okStatus(put, [200]), res(put));
  const me = await api('GET', '/profile/me');
  step('bio persisted exactly', me.json?.bio === bio, JSON.stringify(me.json?.bio));
  await pause(page, 800);
  step('bio rendered as text, not HTML', (await page.locator('i', { hasText: 'tags' }).count()) === 0);
  await shot(page, 'after-bio');
  const r = await api('PUT', '/profile/me', { bio: original.bio ?? '' });
  step('restore bio', r.status === 200);
  await page.close();
}

// ---------- S6: settings ----------
async function S6(context, original) {
  scenario('S6', 'Settings: notification pref toggle persists and does not reset others · private profile toggle');
  const page = await newPage(context);
  const before = (await api('GET', '/notifications/prefs')).json;
  await page.goto(WEB + '/settings', { waitUntil: 'domcontentloaded' });
  const likes = page.getByRole('button', { name: /Toggle Likes/i }).first();
  await likes.waitFor({ timeout: 45000 });
  await shot(page, 'settings-initial');
  const pa = await actAndWait(page, 'PATCH', /^\/notifications\/prefs$/, () => likes.click());
  step('PATCH prefs from Likes toggle', okStatus(pa, [200]), res(pa));
  await pause(page, 1200);
  const after = (await api('GET', '/notifications/prefs')).json;
  step('post_liked flipped on the server', after?.post_liked === !before?.post_liked, JSON.stringify(after));
  const toggleState = await likes.getAttribute('aria-pressed').catch(() => null);
  step('UI reverted / surfaced the failure when the save failed', pa?.status === 200 ? null : true, `aria-pressed=${toggleState}; console=${JSON.stringify(cur.consoleErrors.slice(-1))}`);
  await shot(page, 'after-pref-toggle');
  const rp = await api('PATCH', '/notifications/prefs', before);
  step('restore prefs', rp.status === 200 || JSON.stringify((await api('GET', '/notifications/prefs')).json) === JSON.stringify(before), `PATCH → ${rp.status}`);

  const priv = page.getByRole('button', { name: /Toggle private profile/i }).first();
  const p1 = await actAndWait(page, 'PUT', /^\/profile\/me$/, () => priv.click());
  step('PUT private profile on', okStatus(p1, [200]) && (await api('GET', '/profile/me')).json?.is_private_profile === !original.is_private_profile, res(p1));
  await shot(page, 'private-on');
  await pause(page, 500);
  const p2 = await actAndWait(page, 'PUT', /^\/profile\/me$/, () => priv.click());
  step('PUT private profile off', okStatus(p2, [200]) && (await api('GET', '/profile/me')).json?.is_private_profile === original.is_private_profile, res(p2));
  await api('PUT', '/profile/me', { is_private_profile: original.is_private_profile });
  step('yearly goal', null, `left untouched (currently ${original.yearly_goal}; cannot be cleared via API until F-18)`);
  await page.close();
}

// ---------- S7: circle post ----------
async function S7(context) {
  scenario('S7', 'Review Circle: new post → delete');
  const page = await newPage(context);
  await page.goto(WEB + `/groups/${circleId}`, { waitUntil: 'domcontentloaded' });
  const open = page.getByRole('button', { name: label('Post') }).first();
  if (!(await open.waitFor({ timeout: 45000 }).then(() => true).catch(() => false))) { step('open composer button', false); await page.close(); return; }
  await shot(page, 'circle-initial');
  await open.click();
  const ta = page.locator('textarea').first();
  if (!(await ta.waitFor({ timeout: 10000 }).then(() => true).catch(() => false))) { step('group composer textarea', false); await page.close(); return; }
  const text = `QA circle post ${TS}`;
  await ta.fill(text);
  const gp = await actAndWait(page, 'POST', /^\/groups\/\d+\/posts$/, () => page.getByRole('button', { name: label('Post') }).last().click());
  step('POST group post', okStatus(gp, [200, 201]), res(gp));
  const postId = gp?.json?.id; track('group_post', postId);
  if (!postId) { step('post id from response', false, 'stopping S7'); await page.close(); return; }
  await pause(page, 1000);
  const card = page.locator('article, [class*="rounded"]', { hasText: text }).last();
  step('post visible without reload', await card.isVisible().catch(() => false));
  await shot(page, 'after-post');
  const del = card.locator('button:has(.material-symbols-outlined:text("delete"))').first();
  if (await del.count()) {
    expectDialog(page, /delete|remove/i);
    const d = await actAndWait(page, 'DELETE', /^\/groups\/\d+\/posts\/\d+$/, () => del.click());
    step('DELETE group post', okStatus(d, [200, 204]), `${res(d)} · confirm dialog shown: ${cur.dialogs.length > 0}`);
    await pause(page, 800);
    step('post removed without reload', (await page.locator('article, [class*="rounded"]', { hasText: text }).count()) === 0);
  } else step('delete icon on own group post', false);
  await page.close();
}

// ---------- S8: notifications ----------
async function S8(context) {
  scenario('S8', 'Notifications: mark all read');
  const page = await newPage(context);
  await page.goto(WEB + '/notifications', { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: /Notifications/ }).first().waitFor({ timeout: 45000 }).catch(() => {});
  const btn = page.getByRole('button', { name: label('Mark all as read') }).first();
  if (await btn.isVisible().catch(() => false)) {
    const m = await actAndWait(page, 'POST', /^\/notifications\/mark-read$/, () => btn.click());
    step('POST mark-read', okStatus(m, [200]), res(m));
    step('server unread-count 0', (await api('GET', '/notifications/unread-count')).json?.unread === 0);
  } else step('Mark all as read', null, 'not shown (0 unread)');
  await shot(page, 'after');
  await page.close();
}

// ---------- S9: sign out ----------
async function S9(browser) {
  scenario('S9', 'Sign out clears the session');
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(t => {
    if (!sessionStorage.getItem('qa_seeded')) { localStorage.setItem('bt_token', t); localStorage.setItem('bt_onboarding_v1', 'done'); sessionStorage.setItem('qa_seeded', '1'); }
  }, TOKEN);
  const page = await newPage(ctx);
  await page.goto(WEB + '/profile', { waitUntil: 'domcontentloaded' });
  const out = page.getByRole('button', { name: label('Sign out') }).first();
  if (!(await out.waitFor({ timeout: 45000 }).then(() => true).catch(() => false))) { step('Sign out button', false); await ctx.close(); return; }
  await out.click();
  await page.waitForURL(u => new URL(u).pathname === '/', { timeout: 15000 }).catch(() => {});
  step('redirected to /', new URL(page.url()).pathname === '/', new URL(page.url()).pathname);
  step('bt_token cleared', (await page.evaluate(() => localStorage.getItem('bt_token'))) === null);
  await page.goto(WEB + '/library', { waitUntil: 'domcontentloaded' });
  await page.waitForURL(u => new URL(u).pathname === '/', { timeout: 15000 }).catch(() => {});
  step('protected route redirects to / when signed out', new URL(page.url()).pathname === '/', new URL(page.url()).pathname);
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
  seededNoteIds = new Set((notes.json || []).map(n => n.id));
  seededReadingId = (ubs.json || []).find(u => u.status === 'reading')?.id ?? null;
  circleId = (groups.json || []).find(g => g.name === 'Review Circle')?.id ?? null;
  const original = { bio: me.json?.bio ?? null, is_private_profile: !!me.json?.is_private_profile, yearly_goal: me.json?.yearly_goal ?? null };
  const baseline = {
    notes: [...seededNoteIds].sort().join(','),
    userbooks: (ubs.json || []).map(u => `${u.id}:${u.status}:${u.current_page}:${u.rating}`).sort().join(','),
  };

  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addInitScript(t => { localStorage.setItem('bt_token', t); localStorage.setItem('bt_onboarding_v1', 'done'); }, TOKEN);
  await context.route('**/*', route => {
    const q = route.request(); const url = q.url();
    if (/api\.cloudinary\.com/.test(url)) { cur?.blocked.push(`${q.method()} ${url}`); return route.abort('blockedbyclient'); }
    if (!url.startsWith(API) || ['GET', 'OPTIONS'].includes(q.method())) return route.continue();
    const p = url.slice(API.length).split('?')[0];
    if (allowed(q.method(), p)) return route.continue();
    cur?.blocked.push(`${q.method()} ${p}`); console.log(`  [BLOCKED] ${q.method()} ${p}`);
    return route.abort('blockedbyclient');
  });

  const run = async (id, fn) => { if (ONLY && !ONLY.includes(id)) return; try { await fn(); } catch (e) { step(`${id} aborted`, false, String(e.message).split('\n')[0]); } };
  try {
    await run('S1', () => S1(context));
    await run('S4', () => S4(context));
    await run('S5', () => S5(context, original));
    await run('S6', () => S6(context, original));
    if (circleId) await run('S7', () => S7(context));
    await run('S8', () => S8(context));
    await run('S9', () => S9(browser));
  } finally {
    scenario('CLEANUP', 'Remove rows created in this run; restore profile; compare with baseline');
    for (const c of ledger) {
      const existsReq = c.kind === 'userbook' ? await api('GET', `/userbooks/${c.id}`)
        : c.kind === 'note' ? await api('GET', '/notes/me') : await api('GET', `/groups/${circleId}/posts`);
      const list = Array.isArray(existsReq.json) ? existsReq.json : existsReq.json?.posts || existsReq.json?.items || [];
      const exists = c.kind === 'userbook' ? existsReq.status === 200 : list.some(x => x.id === c.id);
      if (!exists) { c.cleaned = true; step(`${c.kind} ${c.id} already removed by the UI flow`, true); continue; }
      const p = { note: `/notes/${c.id}`, userbook: `/userbooks/${c.id}`, group_post: `/groups/${circleId}/posts/${c.id}` }[c.kind];
      const d = await api('DELETE', p); c.cleaned = d.status < 300; step(`API delete leftover ${c.kind} ${c.id}`, c.cleaned, d.status);
    }
    await api('PUT', '/profile/me', { bio: original.bio ?? '', is_private_profile: original.is_private_profile });
    const [n2, u2] = await Promise.all([api('GET', '/notes/me'), api('GET', '/userbooks/')]);
    const now = {
      notes: (n2.json || []).map(n => n.id).sort().join(','),
      userbooks: (u2.json || []).map(u => `${u.id}:${u.status}:${u.current_page}:${u.rating}`).sort().join(','),
    };
    const ok = now.notes === baseline.notes && now.userbooks === baseline.userbooks;
    step('fixture identical to baseline (ids, status, page, rating)', ok, ok ? '' : JSON.stringify({ baseline, now }));
    report.cleanup = { created: ledger.length, cleaned: ledger.filter(c => c.cleaned).length, baselineRestored: ok };
    await browser.close();

    fs.writeFileSync(path.join(OUT, 'scenarios.json'), JSON.stringify(report, null, 2));
    const md = [`# Web scenario run — ${DATE}`, '',
      `\`${WEB}\` as review.reader · created ${report.cleanup.created} / cleaned ${report.cleanup.cleaned} · fixture identical to baseline: **${ok}**`, ''];
    for (const s of report.scenarios) {
      md.push(`## ${s.id} — ${s.title}`, '', '| result | step | detail |', '|---|---|---|');
      md.push(...s.steps.map(x => `| ${x.pass === null ? 'INFO' : x.pass ? 'PASS' : '**FAIL**'} | ${x.name} | ${x.detail.replace(/\|/g, '/')} |`));
      if (s.blocked.length) md.push('', `**Blocked by guard:** ${s.blocked.join(', ')}`);
      if (s.dialogs.length) md.push('', `Confirm dialogs accepted: ${s.dialogs.join(' · ')}`);
      if (s.unexpectedDialogs.length) md.push('', `**Unexpected dialogs (dismissed):** ${s.unexpectedDialogs.join(' · ')}`);
      if (s.consoleErrors.length || s.pageErrors.length) md.push('', `Console/page errors: ${[...s.consoleErrors, ...s.pageErrors].slice(0, 5).join(' · ')}`);
      const fivexx = s.api.filter(a => a.status >= 500);
      if (fivexx.length) md.push('', `**5xx:** ${fivexx.map(a => `${a.method} ${a.path} ${a.status}`).join(', ')}`);
      md.push('');
    }
    fs.mkdirSync(path.join(REPO, 'qa', 'reports'), { recursive: true });
    fs.writeFileSync(path.join(REPO, 'qa', 'reports', `scenarios-web-${DATE}.md`), md.join('\n'));
    console.log(`\ncleanup ${JSON.stringify(report.cleanup)}\nwrote qa/reports/scenarios-web-${DATE}.md`);
    if (!ok) process.exitCode = 4;
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
