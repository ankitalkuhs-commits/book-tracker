// qa/unit/botBadge.test.mjs
// Sprint 4F package P3, cases W-04..W-07 (features/community/sprint-4f-activity-engine/tests.md §4.1).
//
// BotBadge.jsx is JSX, so Node cannot import it. These cases are therefore text assertions over the
// source; the *rendered* proof that the pill appears for a bot, does not appear for a reader, and
// costs a reader no height is L-4F-01/02/04 in qa/web_4f_local.mjs.
//
// Run: node --test qa/unit/botBadge.test.mjs   (or node --test "qa/unit/*.test.mjs")
//
// The trap this file is written against (non-vacuity rules 3 and 4): a source scan for `<BotBadge`
// that matches NOTHING looks exactly like one that matches everything. So the walker
//   (a) resolves each site by an anchor drawn from the surrounding JSX, never by a line number,
//   (b) asserts each anchor resolves to exactly ONE line — a stale anchor is a failure, not a skip,
//   (c) asserts `found === EXPECTED` against a literal BEFORE any per-site assertion, and
//   (d) is run in the same test over a synthetic zero-badge copy of the same sources and must
//       report 0 there.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = path.join(REPO, 'book-tracker-frontend-stitch', 'src');

const PATHS = {
  badge: path.join(SRC, 'components', 'BotBadge.jsx'),
  home: path.join(SRC, 'pages', 'HomePage.jsx'),
  profile: path.join(SRC, 'pages', 'UserProfilePage.jsx'),
  group: path.join(SRC, 'pages', 'GroupDetailPage.jsx'),
  admin: path.join(SRC, 'pages', 'AdminPage.jsx'),
  api: path.join(SRC, 'services', 'api.js'),
};

// ---------- import guard (non-vacuity rule 5 / K-07): a missing file is one loud failure here,
// not four tests that quietly assert nothing about nothing. ----------
for (const [key, p] of Object.entries(PATHS)) {
  assert.ok(fs.existsSync(p), `${key} missing — expected ${p}`);
}
const readSource = key => fs.readFileSync(PATHS[key], 'utf8');
const SOURCES = Object.fromEntries(Object.keys(PATHS).map(k => [k, readSource(k)]));

// ---------- the site map ----------
// spec R-03 lists seven web sites, and tests.md §4.1 W-04 repeats them. architecture.md:113 lists an
// eighth, HomePage.jsx:704 — the "friends are reading" strip. It is deliberately NOT here (K-05):
// that strip is fed by /userbooks/friends/currently-reading, which is not one of R-02's endpoints,
// so `item.user.is_bot` is `undefined` there and always will be. A badge at that site would render
// `null` for ever and the case asserting it would be structurally vacuous. DROPPED_SITE below pins
// that decision so nobody quietly adds it back.
const EXPECTED_SITES = 7;

const SITES = [
  {
    id: 'home:feed-post-header',
    file: 'home',
    // spec R-03 calls this HomePage.jsx:175 — one PostCard serves both the community and the
    // friends tab, so this single site covers both.
    anchor: "{post.user?.name || 'User'}",
  },
  {
    id: 'home:comment-author',
    file: 'home',
    // R-03's HomePage.jsx:291
    anchor: '<span className="font-bold text-on-surface text-xs">{c.user?.name}',
  },
  {
    id: 'home:sidebar-user-search-result',
    file: 'home',
    // R-03's HomePage.jsx:641
    anchor: '<p className="text-sm font-bold text-on-surface">{u.name}',
  },
  {
    id: 'home:sidebar-following-list',
    file: 'home',
    // R-03's HomePage.jsx:655. The name is on the line after this one, and the badge with it.
    anchor: 'text-sm font-medium text-on-surface group-hover:text-primary transition-colors',
  },
  {
    id: 'profile:display-name',
    file: 'profile',
    // R-03's UserProfilePage.jsx:386
    anchor: '<h1 className="font-serif text-3xl md:text-4xl font-bold text-primary">{profile.name}',
  },
  {
    id: 'group:post-author',
    file: 'group',
    // R-03's GroupDetailPage.jsx:111 — defence in depth; a bot can never post to a circle (R-05).
    anchor: 'className="font-bold text-sm text-on-surface hover:text-primary transition-colors">{post.user?.name}',
  },
  {
    id: 'group:member-row',
    file: 'group',
    // R-03's GroupDetailPage.jsx:965, the row that already carries the Curator pill.
    anchor: '<p className="text-sm font-bold text-on-surface truncate">{m.name}</p>',
  },
];

// The site architecture.md lists and this package deliberately does not badge (K-05).
const DROPPED_SITE = { id: 'home:friends-currently-reading', file: 'home', anchor: '{item.user?.name}' };

const BADGE_TAG = '<BotBadge';
const LOOKAHEAD = 2;   // the anchor's own line or one of the two after it

// ---------- the detector, as a pure function of the sources, so it can be run over a synthetic
// zero-badge copy in the same test (non-vacuity rule 3) ----------
function locateAnchor(source, anchor) {
  const lines = source.split(/\r?\n/);
  const hits = [];
  lines.forEach((line, i) => { if (line.includes(anchor)) hits.push(i); });
  return { lines, hits };
}

function walkSites(sources, sites) {
  const badged = [];
  const unbadged = [];
  const anchorProblems = [];
  for (const site of sites) {
    const source = sources[site.file];
    const { lines, hits } = locateAnchor(source, site.anchor);
    if (hits.length !== 1) {
      anchorProblems.push(`${site.id}: anchor matched ${hits.length} lines, expected exactly 1 — the anchor is stale, fix it rather than the count`);
      continue;
    }
    const window = lines.slice(hits[0], hits[0] + 1 + LOOKAHEAD).join('\n');
    if (window.includes(BADGE_TAG)) badged.push(site.id); else unbadged.push(site.id);
  }
  return { found: badged.length, badged, unbadged, anchorProblems };
}

// A synthetic copy of the real sources with every badge element removed. Same anchors, same shape,
// zero badges — the detector must report 0 over it, or it is not a detector.
function stripBadges(sources) {
  const out = {};
  for (const [k, v] of Object.entries(sources)) out[k] = v.replace(/<BotBadge[^>]*\/>/g, '');
  return out;
}

test('W-04 badge_rendered_at_every_r03_site', () => {
  const real = walkSites(SOURCES, SITES);

  // (b) anchors first: a stale anchor must be a failure, never a silent skip.
  assert.deepEqual(real.anchorProblems, [], real.anchorProblems.join('\n'));

  // (d) prove the detector can report zero, over sources that really do contain the anchors.
  const synthetic = walkSites(stripBadges(SOURCES), SITES);
  assert.deepEqual(synthetic.anchorProblems, [], 'the synthetic copy lost an anchor — the strip is too greedy');
  assert.equal(synthetic.found, 0,
    `the detector reported ${synthetic.found} badges on a copy with every <BotBadge /> removed — it cannot fail, so its pass means nothing`);
  assert.equal(synthetic.unbadged.length, EXPECTED_SITES, 'the synthetic copy should report every site unbadged');

  // (c) the count, against the literal, before anything per-site.
  assert.equal(real.found, EXPECTED_SITES,
    `${real.found} of ${EXPECTED_SITES} R-03 sites carry ${BADGE_TAG}; missing: ${real.unbadged.join(', ') || '(none)'}`);
  assert.deepEqual(real.unbadged, []);

  // the three files that host a site each import the component
  for (const key of ['home', 'profile', 'group']) {
    assert.match(SOURCES[key], /^import BotBadge from '\.\.\/components\/BotBadge'$/m,
      `${key} renders a badge but does not import BotBadge`);
  }

  // K-05: the architecture's eighth site stays unbadged, and HomePage carries exactly its four.
  const dropped = walkSites(SOURCES, [DROPPED_SITE]);
  assert.deepEqual(dropped.anchorProblems, []);
  assert.equal(dropped.found, 0,
    'HomePage.jsx:704 (/userbooks/friends/currently-reading) was badged — that endpoint carries no is_bot (K-05), so the badge can only ever render null there');
  const homeBadges = (SOURCES.home.match(/<BotBadge/g) || []).length;
  assert.equal(homeBadges, 4, `HomePage.jsx has ${homeBadges} badges, expected exactly 4`);
});

test('W-05 badge_copies_the_curator_pill_classes', () => {
  // Read the pill out of GroupDetailPage.jsx at test time — never re-typed here, or this test would
  // be comparing BotBadge against a copy of itself.
  const curator = SOURCES.group.match(/<span className="([^"]+)">\{t\('groups\.curatorBadge'\)\}<\/span>/);
  assert.ok(curator, "Curator pill not found in GroupDetailPage.jsx — this test is comparing against nothing");
  const pillClasses = curator[1];
  assert.ok(pillClasses.length > 40, `the captured Curator pill is suspiciously short: "${pillClasses}"`);

  assert.ok(SOURCES.badge.includes(pillClasses),
    `BotBadge.jsx does not contain the Curator pill classes byte-for-byte.\n  curator: ${pillClasses}\n  badge:   ${(SOURCES.badge.match(/className="([^"]+)"/) || [null, '(none)'])[1]}`);

  // and the pill says BOT
  assert.match(SOURCES.badge, /\bBOT\b/, 'BotBadge.jsx does not render the text BOT');
});

test('W-06 badge_returns_null_when_not_a_bot', () => {
  const src = SOURCES.badge;

  // exactly one component function in the file
  const components = src.match(/function\s+[A-Z]\w*\s*\(/g) || [];
  assert.equal(components.length, 1, `expected exactly one component function in BotBadge.jsx, found ${components.length}: ${components.join(', ')}`);

  // the guard, and it is the first return in the file
  const guard = src.match(/if\s*\(\s*!\s*user\?\.is_bot\s*\)\s*return null/);
  assert.ok(guard, 'BotBadge.jsx has no `if (!user?.is_bot) return null` guard');

  const firstReturn = src.indexOf('return');
  assert.equal(firstReturn, guard.index + guard[0].indexOf('return'),
    'something returns before the is_bot guard — the guard must be the first thing the component does');

  // the test is truthiness on an optional chain, so a `user` object with no is_bot key (a stale
  // 60 s cache, R-03/W-03) renders nothing rather than crashing or badging everyone.
  assert.ok(!/is_bot\s*\?\?\s*true/.test(src), 'BotBadge.jsx defaults is_bot to true');
  assert.ok(!/user\.is_bot/.test(src.replace(/user\?\.is_bot/g, '')), 'BotBadge.jsx reads user.is_bot without the optional chain');
});

test('W-07 trigger_bot_control_removed', () => {
  // control: both files were actually read and are not stubs
  assert.ok(SOURCES.admin.length > 1024, `AdminPage.jsx is only ${SOURCES.admin.length} bytes — this test is reading the wrong file`);
  assert.ok(SOURCES.api.length > 1024, `api.js is only ${SOURCES.api.length} bytes — this test is reading the wrong file`);

  const adminHits = (SOURCES.admin.match(/triggerBot/g) || []).length;
  assert.equal(adminHits, 0, `AdminPage.jsx still references triggerBot ${adminHits} time(s)`);
  assert.ok(!/editorial bot/i.test(SOURCES.admin), 'AdminPage.jsx still shows an editorial-bot trigger control');
  assert.ok(!/bot\/trigger/.test(SOURCES.admin), 'AdminPage.jsx still calls /admin/bot/trigger');

  const apiExports = (SOURCES.api.match(/export\s+(?:const|function|async function)\s+triggerBot\b/g) || []).length;
  assert.equal(apiExports, 0, `src/services/api.js still exports triggerBot (${apiExports})`);
  assert.ok(!/bot\/trigger/.test(SOURCES.api), 'src/services/api.js still calls /admin/bot/trigger');

  // control for the two greps above: the same detectors find the endpoints that DO still exist,
  // so "no match" is a fact about the file and not about a broken pattern.
  assert.match(SOURCES.api, /export\s+const\s+sendTestPush\b/, 'the export detector found nothing at all — it is broken');
  assert.match(SOURCES.admin, /sendTestPush/, 'the AdminPage detector found nothing at all — it is broken');
});
