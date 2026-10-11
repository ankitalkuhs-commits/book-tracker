// qa/unit/reportAffordance.test.mjs
// Sprint 4I package P4 — the web client's Report and Block affordances, the opened per-post menu,
// the blocked-readers list and the admin Reports tab.
// Cases C-01, C-03, C-04, C-05, C-06, C-10, C-12, C-13, C-14, C-16
// (features/safety/sprint-4i-report-block/tests.md §10).
//
// Run: node --test "qa/unit/reportAffordance.test.mjs"   (or node --test "qa/unit/*.test.mjs")
//
// These are source assertions, not render assertions: JSX cannot be imported by Node. What they
// prove is that the affordance EXISTS at each surface, outside a closed gate, and that the
// owner-only actions still carry their own gate. That it renders, that the modal opens and that
// the request is sent are D-4I-01/02/04 and P-4I-09, by hand, on the real build (tests.md §15.11).
//
// The trap this file is written against, which this project has shipped before: a source scan that
// matches NOTHING is indistinguishable from one that matches EVERYTHING. So, copying
// qa/unit/botBadge.test.mjs structurally:
//   (a) every site is resolved by an anchor drawn from the surrounding JSX, never a line number,
//   (b) every anchor must resolve to exactly ONE line — a stale anchor is a failure, not a skip,
//   (c) `found === EXPECTED_SITES` is asserted against a literal BEFORE any per-site assertion, and
//   (d) the same detector is run over a synthetic stripped copy of the same sources and must report
//       0 there, in the same test.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = path.join(REPO, 'book-tracker-frontend-stitch', 'src');
const LOCALES = path.join(SRC, 'i18n', 'locales');

const PATHS = {
  home: path.join(SRC, 'pages', 'HomePage.jsx'),
  profile: path.join(SRC, 'pages', 'UserProfilePage.jsx'),
  group: path.join(SRC, 'pages', 'GroupDetailPage.jsx'),
  settings: path.join(SRC, 'pages', 'SettingsPage.jsx'),
  admin: path.join(SRC, 'pages', 'AdminPage.jsx'),
  api: path.join(SRC, 'services', 'api.js'),
  report: path.join(SRC, 'components', 'ReportButton.jsx'),
  block: path.join(SRC, 'components', 'BlockButton.jsx'),
};

// The API side, read rather than re-typed (C-14). A client reason list the server does not accept
// is a 422 the reader cannot act on, and a copy of the tuple in this file would agree with itself
// for ever.
const REPORTS_ROUTER = path.join(REPO, 'app', 'routers', 'reports_router.py');

// ---------- import guard (non-vacuity rule 5 / K-4I-07): an unbuilt P4 is ONE loud failure here,
// not ten tests that quietly assert nothing about nothing. ----------
for (const [key, p] of Object.entries(PATHS)) {
  assert.ok(fs.existsSync(p), `${key} missing — expected ${p}`);
}
assert.ok(fs.existsSync(REPORTS_ROUTER), `the report API is missing — expected ${REPORTS_ROUTER}`);
const SOURCES = Object.fromEntries(Object.entries(PATHS).map(([k, p]) => [k, fs.readFileSync(p, 'utf8')]));
// tests.md §10 words this guard as `assert.match(SOURCES.home, /reportContent|blockUser/)`. P4 put
// the two API calls in the shared ReportButton/BlockButton components the architecture's P4 note
// licenses ("P4 extracts one small menu component and one small modal"), so HomePage reaches them
// through the components. Both halves are asserted — the page wires the affordance, the client
// wires the route — which is what the plan's one-liner was standing in for.
assert.match(SOURCES.home, /<ReportButton|<BlockButton/, 'HomePage.jsx carries no Report or Block affordance — P4 is unbuilt');
assert.match(SOURCES.api, /export const reportContent\b/, 'src/services/api.js has no reportContent — P4 is unbuilt');
assert.match(SOURCES.api, /export const blockUser\b/, 'src/services/api.js has no blockUser — P4 is unbuilt');

const REPORT_TAG = '<ReportButton';
const BLOCK_TAG = '<BlockButton';

// ---------- the site maps ----------
// spec R-05's six web surfaces. `lookahead` is the number of lines after the anchor that belong to
// that site, chosen per site as the smallest window that reaches its affordance — a window wide
// enough to catch a NEIGHBOUR's affordance would make the count meaningless.
const EXPECTED_SITES = 6;

const SITES = [
  {
    id: 'home:feed-post-menu',
    file: 'home',
    // R-05 site 1: the per-post overflow menu. This is the gate that was (isOwn || isAdmin) — C-04.
    anchor: '<span className="material-symbols-outlined text-lg">more_horiz</span>',
    lookahead: 5,
  },
  {
    id: 'home:comment-author',
    file: 'home',
    // R-05 site 2: the feed comment row, beside the admin trash.
    anchor: '<span className="text-on-surface-variant">{c.text}</span>',
    lookahead: 5,
  },
  {
    id: 'profile:public-note',
    file: 'profile',
    // R-05 site 3: PublicNoteCard's top-right action cluster, beside Share.
    anchor: '<div className="absolute top-4 right-4 flex items-center gap-1">',
    lookahead: 1,
  },
  {
    id: 'profile:reader-actions',
    file: 'profile',
    // R-05 site 4: the cluster beside the follow button. The anchor is the cluster's own menu
    // trigger; the window is the whole menu, which is the site (Unfollow, Report, Block).
    anchor: "aria-label={t('safety.moreActions')}",
    lookahead: 30,
  },
  {
    id: 'group:circle-post',
    file: 'group',
    // R-05 site 5: the circle-post action cluster. The delete gate used to wrap all of it.
    anchor: '<div className="shrink-0 flex items-center gap-1">',
    lookahead: 2,
  },
  {
    id: 'home:sidebar-user-search-result',
    file: 'home',
    // R-05 site 6: the sidebar user-search row.
    anchor: '<p className="text-sm font-bold text-on-surface">{u.name}',
    lookahead: 6,
  },
];

// C-05: Block is reachable from the public profile and from a user-search result. Both are sites
// above, reused with the other marker.
const EXPECTED_BLOCK_SITES = 2;
const BLOCK_SITES = SITES.filter(s => ['profile:reader-actions', 'home:sidebar-user-search-result'].includes(s.id));

// ---------- the detector, a pure function of the sources so the same code can be run over a
// synthetic stripped copy in the same test (non-vacuity rule 3) ----------
function locateAnchor(source, anchor) {
  const lines = source.split(/\r?\n/);
  const hits = [];
  lines.forEach((line, i) => { if (line.includes(anchor)) hits.push(i); });
  return { lines, hits };
}

function walkSites(sources, sites, tag) {
  const found = [];
  const missing = [];
  const anchorProblems = [];
  for (const site of sites) {
    const { lines, hits } = locateAnchor(sources[site.file], site.anchor);
    if (hits.length !== 1) {
      anchorProblems.push(`${site.id}: anchor matched ${hits.length} lines, expected exactly 1 — the anchor is stale, fix it rather than the count`);
      continue;
    }
    const window = lines.slice(hits[0], hits[0] + 1 + site.lookahead).join('\n');
    if (window.includes(tag)) found.push(site.id); else missing.push(site.id);
  }
  return { count: found.length, found, missing, anchorProblems };
}

// A synthetic copy of the real sources with every affordance element removed. Same files, same
// anchors, zero affordances — the detector must report 0 over it, or it is not a detector.
function stripAffordance(sources, tag) {
  const re = new RegExp(`${tag}[\\s\\S]*?\\/>`, 'g');
  const out = {};
  for (const [k, v] of Object.entries(sources)) out[k] = v.replace(re, '');
  return out;
}

test('C-01 report_reachable_at_every_r05_web_site', () => {
  const real = walkSites(SOURCES, SITES, REPORT_TAG);

  // (b) anchors first: a stale anchor is a failure, never a silent skip.
  assert.deepEqual(real.anchorProblems, [], real.anchorProblems.join('\n'));

  // (c) the count, against the literal, before anything per-site.
  assert.equal(real.count, EXPECTED_SITES,
    `${real.count} of ${EXPECTED_SITES} R-05 sites carry ${REPORT_TAG}; missing: ${real.missing.join(', ') || '(none)'}`);
  assert.deepEqual(real.missing, []);

  // the five pages that host a site each import the component
  for (const key of ['home', 'profile', 'group']) {
    assert.match(SOURCES[key], /^import ReportButton from '\.\.\/components\/ReportButton'$/m,
      `${key} renders a Report affordance but does not import ReportButton`);
  }

  // the four target_type values the API accepts are each reachable from some surface — a Report
  // item that names a type the server rejects is a 422 the reader cannot act on
  const types = [...SOURCES.home.matchAll(/targetType="(\w+)"/g), ...SOURCES.profile.matchAll(/targetType="(\w+)"/g), ...SOURCES.group.matchAll(/targetType="(\w+)"/g)]
    .map(m => m[1]);
  assert.deepEqual([...new Set(types)].sort(), ['comment', 'group_post', 'note', 'user']);
});

test('C-03 the_detector_reports_zero_on_a_stripped_copy', () => {
  // (d) prove the detector CAN report zero, over sources that really do still contain the anchors.
  const strippedReport = stripAffordance(SOURCES, REPORT_TAG);
  const synthetic = walkSites(strippedReport, SITES, REPORT_TAG);
  assert.deepEqual(synthetic.anchorProblems, [], 'the synthetic copy lost an anchor — the strip is too greedy');
  assert.equal(synthetic.count, 0,
    `the detector reported ${synthetic.count} Report affordances on a copy with every ${REPORT_TAG} removed — it cannot fail, so its pass means nothing`);
  assert.equal(synthetic.missing.length, EXPECTED_SITES, 'the synthetic copy should report every site missing');

  // the same for the Block marker and C-05's two sites
  const strippedBlock = stripAffordance(SOURCES, BLOCK_TAG);
  const syntheticBlock = walkSites(strippedBlock, BLOCK_SITES, BLOCK_TAG);
  assert.deepEqual(syntheticBlock.anchorProblems, []);
  assert.equal(syntheticBlock.count, 0,
    'the Block detector reported a hit on a copy with every <BlockButton /> removed');
  assert.equal(syntheticBlock.missing.length, EXPECTED_BLOCK_SITES);
});

// ---------- C-04: the opened menu, and the owner-only actions it must not leak ----------

const MENU_TRIGGER = '<span className="material-symbols-outlined text-lg">more_horiz</span>';
const MENU_CONTAINER = /^\s*<div className="relative">\s*$/;
const CONDITIONAL = /\{([^}]*&&)\s*\(\s*$/;

// Every item inside the per-post menu, with whether it acts on the POST (owner-or-admin only) or on
// the reader's own relationship to its author (open to a non-owner). The list is an exact
// inventory: a fifth item, or a removed one, fails the count before any per-item assertion
// (non-vacuity rule 14 — "at most one" would pass against deleting the subject).
const MENU_ITEMS = [
  { id: 'report', anchor: '<ReportButton', ownerOnly: false },
  { id: 'block', anchor: '<BlockButton', ownerOnly: false },
  { id: 'edit', anchor: 'setEditing(true)', ownerOnly: true },
  { id: 'delete', anchor: 'onClick={handleDelete}', ownerOnly: true },
];

// The nearest conditional that ENCLOSES this line — not merely the nearest one above it. A naive
// upward scan walks straight out of a closed sibling block and lands on ITS condition, which is how
// a leaked Delete can look guarded: with Delete's own `{(isOwn || isAdmin) && (` deleted, the next
// `&& (` above it is the Edit item's `{isOwn && (`, and the detector would read that as a guard.
// So closings are counted and matching openers skipped.
const CLOSER = /^\s*\)\}\s*$/;
function nearestEnclosingCondition(lines, idx) {
  let closed = 0;
  for (let i = idx - 1; i >= 0; i--) {
    if (CLOSER.test(lines[i])) { closed++; continue; }
    const m = lines[i].match(CONDITIONAL);
    if (m) {
      if (closed > 0) { closed--; continue; }    // a sibling block that already closed
      return { cond: m[1], line: i };
    }
  }
  return null;
}

// -> { gateViolations, unguarded, items } over a source, so the same code runs over the synthetic
// negatives below.
function inspectPostMenu(source) {
  const lines = source.split(/\r?\n/);
  const triggerHits = [];
  lines.forEach((l, i) => { if (l.includes(MENU_TRIGGER)) triggerHits.push(i); });
  if (triggerHits.length !== 1) {
    return { anchorProblem: `the post-menu trigger matched ${triggerHits.length} lines, expected exactly 1` };
  }
  let containerIdx = -1;
  for (let i = triggerHits[0]; i >= 0; i--) {
    if (MENU_CONTAINER.test(lines[i])) { containerIdx = i; break; }
  }
  if (containerIdx < 0) return { anchorProblem: 'the menu container <div className="relative"> was not found above the trigger' };

  // (a) the WHOLE menu must not be wrapped in an owner-or-admin conditional. Look at the three
  // source lines immediately above the container, skipping blanks and comments.
  const gateViolations = [];
  let seen = 0;
  for (let i = containerIdx - 1; i >= 0 && seen < 3; i--) {
    const l = lines[i].trim();
    if (!l || l.startsWith('//') || l.startsWith('{/*') || l.startsWith('*') || l.endsWith('*/')) continue;
    seen++;
    if (/\{\s*\(?\s*(isOwn|isAdmin)[^}]*&&\s*\(\s*$/.test(lines[i])) {
      gateViolations.push(`the whole post menu is gated on line ${i + 1}: ${l}`);
    }
  }

  // the dropdown itself, bounded at both ends: HomePage holds three ReportButtons and two
  // BlockButtons, so an item search that ran to the end of the file would find the comment row's
  // and the sidebar's and report "3 matches, expected 1".
  let dropStart = -1;
  for (let i = containerIdx; i < lines.length; i++) {
    if (/^\s*\{showMenu && \(\s*$/.test(lines[i])) { dropStart = i; break; }
  }
  if (dropStart < 0) return { anchorProblem: 'the {showMenu && ( dropdown was not found inside the menu container' };
  const indent = lines[dropStart].match(/^\s*/)[0];
  let dropEnd = -1;
  for (let i = dropStart + 1; i < lines.length; i++) {
    if (lines[i] === `${indent})}`) { dropEnd = i; break; }
  }
  if (dropEnd < 0) return { anchorProblem: 'the dropdown has no closing )} at its own indentation' };

  // (b) every item inside it, and the nearest conditional enclosing each one.
  const items = [];
  const unguarded = [];
  const itemProblems = [];
  for (const item of MENU_ITEMS) {
    const hits = [];
    lines.forEach((l, i) => { if (i > dropStart && i < dropEnd && l.includes(item.anchor)) hits.push(i); });
    if (hits.length !== 1) {
      itemProblems.push(`${item.id}: matched ${hits.length} lines inside the post menu, expected exactly 1`);
      continue;
    }
    const enclosing = nearestEnclosingCondition(lines, hits[0]);
    items.push(item.id);
    const cond = enclosing ? enclosing.cond : '(none)';
    if (item.ownerOnly && !/isOwn|isAdmin/.test(cond)) unguarded.push(item.id);
    if (!item.ownerOnly && !/!isOwn/.test(cond)) unguarded.push(item.id);
  }
  return { gateViolations, unguarded, items, itemProblems };
}

test('C-04 the_post_menu_is_open_to_everyone_and_leaks_no_owner_action', () => {
  const real = inspectPostMenu(SOURCES.home);
  assert.equal(real.anchorProblem, undefined, real.anchorProblem);
  assert.deepEqual(real.itemProblems, [], (real.itemProblems || []).join('\n'));

  // the inventory, exact and first (rule 2 / rule 14)
  assert.equal(MENU_ITEMS.length, 4);
  assert.deepEqual(real.items, ['report', 'block', 'edit', 'delete']);

  // (a) a non-owner sees a menu at all
  assert.deepEqual(real.gateViolations, [],
    (real.gateViolations || []).join('\n') + '\n— the menu is gated again, so a non-owner has nowhere to report from');

  // (b) and opening it leaked nothing: every item that acts on the POST still carries its own
  // isOwn/isAdmin condition, and every item open to a non-owner carries !isOwn.
  assert.deepEqual(real.unguarded, [],
    `these menu items are not guarded by their own condition: ${(real.unguarded || []).join(', ')}`);

  // ---- control (rule 3), part (a): put the outer gate back and the detector must see it ----
  const lines = SOURCES.home.split(/\r?\n/);
  const containerIdx = lines.findIndex(l => MENU_CONTAINER.test(l));
  assert.ok(containerIdx > 0, 'the control could not find the menu container');
  const regated = [...lines];
  regated.splice(containerIdx, 0, '          {(isOwn || isAdmin) && (');
  const withGate = inspectPostMenu(regated.join('\n'));
  assert.equal(withGate.gateViolations.length, 1,
    'the gate detector reported no violation on a copy where the owner-or-admin gate was put back — it cannot fail');

  // ---- control (rule 3), part (b): strip Delete's own guard and the detector must name it ----
  const deleteIdx = lines.findIndex((l, i) => i > containerIdx && l.includes('onClick={handleDelete}'));
  const deleteGuard = nearestEnclosingCondition(lines, deleteIdx);
  assert.ok(deleteGuard, 'the control could not find the guard around Delete');
  assert.match(deleteGuard.cond, /isOwn|isAdmin/);
  const ungated = [...lines];
  ungated.splice(deleteGuard.line, 1);
  const leaked = inspectPostMenu(ungated.join('\n'));
  assert.deepEqual(leaked.unguarded, ['delete'],
    'the leak detector reported nothing on a copy where Delete lost its own guard — it cannot fail');
});

test('C-05 block_reachable_from_the_profile_and_from_a_search_result', () => {
  const real = walkSites(SOURCES, BLOCK_SITES, BLOCK_TAG);
  assert.deepEqual(real.anchorProblems, [], real.anchorProblems.join('\n'));
  assert.equal(real.count, EXPECTED_BLOCK_SITES,
    `${real.count} of ${EXPECTED_BLOCK_SITES} Block sites carry ${BLOCK_TAG}; missing: ${real.missing.join(', ') || '(none)'}`);
  assert.deepEqual(real.missing, []);

  for (const key of ['home', 'profile']) {
    assert.match(SOURCES[key], /^import BlockButton from '\.\.\/components\/BlockButton'$/m,
      `${key} renders a Block affordance but does not import BlockButton`);
  }

  // pm-decisions E-1: Unfollow is the FIRST item of the profile menu, ABOVE Block. A menu whose
  // only option is the nuclear one pushes people into choosing it.
  const unfollow = SOURCES.profile.indexOf("{t('safety.unfollow')}");
  const block = SOURCES.profile.indexOf(BLOCK_TAG);
  assert.ok(unfollow > 0, 'the profile menu offers no Unfollow — Block is its only option');
  assert.ok(unfollow < block, 'Block appears above Unfollow in the profile menu (pm-decisions E-1)');
});

test('C-06 the_block_confirm_says_what_it_cannot_undo', () => {
  const en = JSON.parse(fs.readFileSync(path.join(LOCALES, 'en.json'), 'utf8'));
  const value = en.safety?.blockConfirm;
  assert.ok(typeof value === 'string' && value.length > 80,
    `safety.blockConfirm is missing or suspiciously short: ${JSON.stringify(value)}`);

  // Three content anchors, as regexes rather than as a sentence: the anchors are what make the copy
  // accurate, the wording is the PM's.
  assert.match(value, /stop seeing|no longer see|hidden from each other/i,
    'the confirm does not say the two of you stop seeing each other');
  // R-21 is irreversible, and a reader must not discover that afterwards.
  assert.match(value, /follow/i, 'the confirm does not mention the follow at all');
  assert.match(value, /not come back|removed|permanent/i,
    'the confirm does not warn that the follow is removed and does not come back');
  // pm-decisions E-8: say plainly that a block does not unpublish public posts.
  assert.match(value, /public|signed out|open web|does not unpublish/i,
    'the confirm does not state E-8 — a reader could believe they are hidden from the open web');

  // and the copy is actually what the Block control shows
  assert.match(SOURCES.block, /window\.confirm\(t\('safety\.blockConfirm'/,
    'BlockButton.jsx does not show safety.blockConfirm before blocking');
  assert.match(SOURCES.block, /\{ name:/, 'the confirm is rendered without the {{name}} interpolation');

  // the same limit is stated in the report dialog, where "Also block" is checked by default
  assert.match(en.safety?.blockEffect || '', /public|signed out|open web|does not unpublish/i,
    'safety.blockEffect does not state E-8 beside the checked-by-default "Also block"');
  assert.match(SOURCES.report, /safety\.blockEffect/,
    'the report dialog does not render safety.blockEffect');
});

test('C-10 the_reports_tab_is_registered_and_lazy_loaded', () => {
  const tabs = SOURCES.admin.match(/const TABS = \[([^\]]*)\]/);
  assert.ok(tabs, 'AdminPage.jsx has no `const TABS = [...]`');
  const names = tabs[1].split(',').map(s => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
  assert.ok(names.includes('reports'), `TABS is ${JSON.stringify(names)} — the Reports tab is not registered`);

  // the queue is fetched from the tab handler…
  assert.match(SOURCES.admin, /if \(tab === 'reports'\) loadReports\(\)/,
    'the Reports tab does not lazy-load its queue from the tab click handler');

  // …and NOT on mount: the mount effect swallows its failure (`.catch(() => {})`), so a queue
  // loaded there would fail silently and the tab would read "nothing in this queue" after a 403.
  const mount = SOURCES.admin.match(/useEffect\(\(\) => \{[\s\S]*?\}, \[\]\)/);
  assert.ok(mount, 'AdminPage.jsx has no mount effect — this assertion is reading nothing');
  assert.doesNotMatch(mount[0], /getAdminReports|loadReports/,
    'the Reports queue is loaded on mount, where a failed fetch is swallowed');

  // the two routes the queue needs exist in the client
  assert.match(SOURCES.api, /apiFetch\(`\/admin\/reports\?status=\$\{status\}`\)/, 'getAdminReports does not call GET /admin/reports');
  assert.match(SOURCES.api, /apiFetch\(`\/admin\/reports\/\$\{reportId\}`, \{ method: 'PATCH'/, 'resolveReport does not PATCH /admin/reports/{id}');
  // resolving is not deleting (R-07): the tab must be able to show a resolved row again
  assert.match(SOURCES.admin, /'actioned'/, 'the Reports tab cannot action a report');
  assert.match(SOURCES.admin, /'dismissed'/, 'the Reports tab cannot dismiss a report');
});

test('C-12 settings_has_a_blocked_list_with_unblock', () => {
  // three anchors, each resolving to exactly one line
  const anchors = [
    'getBlocks().then(',
    'onClick={() => handleUnblock(b.user_id)}',
    'await unblockUser(userId)',
  ];
  const problems = [];
  for (const a of anchors) {
    const { hits } = locateAnchor(SOURCES.settings, a);
    if (hits.length !== 1) problems.push(`${a}: matched ${hits.length} lines, expected exactly 1`);
  }
  assert.deepEqual(problems, [], problems.join('\n'));

  assert.match(SOURCES.settings, /^import \{[^}]*\bgetBlocks\b[^}]*\bunblockUser\b[^}]*\} from '\.\.\/services\/api'$/m,
    'SettingsPage.jsx does not import getBlocks and unblockUser');
  assert.match(SOURCES.settings, /t\('safety\.unblock'\)/, 'the blocked list has no Unblock label');
  assert.match(SOURCES.settings, /\{t\('safety\.blockedReaders'\)\}/, 'the blocked list has no heading');

  // it lives in the Privacy section, beside the private-profile toggle (R-28)
  const privacy = SOURCES.settings.indexOf("{t('settings.sectionPrivacy')}");
  const list = SOURCES.settings.indexOf("{t('safety.blockedReaders')}");
  const notifications = SOURCES.settings.indexOf("{t('settings.sectionNotifications')}");
  assert.ok(privacy > 0 && list > privacy && list < notifications,
    'the blocked-readers list is not inside the Privacy section');

  // GET /blocks is the viewer's OUTBOUND blocks only — the client must not invent a second source
  assert.match(SOURCES.api, /export const getBlocks = \(\) => apiFetch\('\/blocks'\)/);
});

test('C-13 also_block_is_checked_by_default', () => {
  // pm-decisions E-3. Read from the state initialiser, never from a comment.
  const init = SOURCES.report.match(/const \[alsoBlock, setAlsoBlock\] = useState\((\w+)\)/);
  assert.ok(init, 'ReportButton.jsx has no alsoBlock state');
  assert.equal(init[1], 'true', `"Also block this person" initialises to ${init[1]}, not true`);

  // the control is rendered and bound to that state
  assert.match(SOURCES.report, /type="checkbox"[\s\S]{0,120}checked=\{alsoBlock\}/,
    'the "Also block" checkbox is not bound to alsoBlock');
  assert.match(SOURCES.report, /\{t\('safety\.alsoBlock'\)\}/, 'the checkbox has no label');

  // …and wired to the request. pm-decisions Q-3 made this ONE request with an `also_block` field,
  // not a second POST /blocks — tests.md C-13's "wired to the POST /blocks call" predates that
  // decision and is recorded as a finding in the build notes.
  assert.match(SOURCES.report, /also_block: alsoBlock/,
    'the checkbox state never reaches the request — it renders and does nothing');
  assert.match(SOURCES.api, /also_block: !!also_block/,
    'api.js drops also_block on the way to POST /reports');
  assert.doesNotMatch(SOURCES.report, /blockUser\(/,
    'the report dialog calls POST /blocks separately — pm-decisions Q-3 makes it one transaction');
});

test('C-14 the_reason_picker_offers_exactly_the_apis_closed_set', () => {
  // the server's tuple, read at test time from the Python source — never re-typed here, or this
  // test would be comparing the client against a copy of itself.
  const py = fs.readFileSync(REPORTS_ROUTER, 'utf8');
  const serverLiteral = py.match(/^REASONS\s*=\s*\(([^)]*)\)/m);
  assert.ok(serverLiteral, 'REASONS was not found in app/routers/reports_router.py — this test is comparing against nothing');
  const server = serverLiteral[1].split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
  assert.equal(server.length, 7, `the server offers ${server.length} reasons, expected 7: ${server.join(', ')}`);

  const clientLiteral = SOURCES.report.match(/export const REPORT_REASONS = \[([^\]]*)\]/);
  assert.ok(clientLiteral, 'ReportButton.jsx has no REPORT_REASONS list');
  const client = clientLiteral[1].split(',').map(s => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
  assert.equal(client.length, 7, `the client offers ${client.length} reasons, expected 7: ${client.join(', ')}`);

  assert.deepEqual(client, server,
    `the client's reason list differs from the API's closed set.\n  client: ${client.join(', ')}\n  server: ${server.join(', ')}`);

  // every reason has a label in en.json — a picker row rendering a raw key is not a choice
  const en = JSON.parse(fs.readFileSync(path.join(LOCALES, 'en.json'), 'utf8'));
  for (const r of server) {
    assert.ok(en.safety?.reason?.[r], `safety.reason.${r} has no English label`);
  }

  // and the target_type set the client sends is the server's four
  const serverTypes = py.match(/^TARGET_TYPES\s*=\s*\(([^)]*)\)/m);
  assert.ok(serverTypes, 'TARGET_TYPES was not found in reports_router.py');
  const types = serverTypes[1].split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
  assert.equal(types.length, 4);
});

// C-16: every new string in all six locales. There is no other web i18n-parity test — the seven
// pre-existing qa/unit files are authCacheClear, botBadge, contrast, localDate, navigation,
// noteVisibility and pagePerfWaterfall — so this case is the only thing standing between the web
// client and English-only safety copy.
const NEW_KEYS = [
  'safety.alsoBlock',
  'safety.block',
  'safety.blockConfirm',
  'safety.blockEffect',
  'safety.blockFailed',
  'safety.blocked',
  'safety.blockedReaders',
  'safety.blockedReadersDesc',
  'safety.detailLabel',
  'safety.detailPlaceholder',
  'safety.moreActions',
  'safety.noBlockedReaders',
  'safety.reason.harassment',
  'safety.reason.hate',
  'safety.reason.other',
  'safety.reason.self_harm',
  'safety.reason.sexual',
  'safety.reason.spam',
  'safety.reason.violence',
  'safety.reasonLabel',
  'safety.report',
  'safety.reportFailed',
  'safety.reportSubtitle',
  'safety.reportSubtitleNamed',
  'safety.reportTitle',
  'safety.reported',
  'safety.reportedAndBlocked',
  'safety.submitReport',
  'safety.thisReader',
  'safety.unblock',
  'safety.unblockFailed',
  'safety.unblocked',
  'safety.unfollow',
];
const LOCALE_NAMES = ['de', 'en', 'es', 'fr', 'pt', 'ru'];

test('C-16 every_new_web_string_is_in_all_six_locales', () => {
  assert.equal(NEW_KEYS.length, 33, `NEW_KEYS lists ${NEW_KEYS.length} keys, expected 33`);
  assert.equal(LOCALE_NAMES.length, 6);

  const read = (loc) => JSON.parse(fs.readFileSync(path.join(LOCALES, `${loc}.json`), 'utf8'));
  const dig = (obj, key) => key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  const placeholders = (s) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]).sort();

  const en = read('en');
  for (const loc of LOCALE_NAMES) {
    const data = read(loc);
    for (const key of NEW_KEYS) {
      const value = dig(data, key);
      assert.notEqual(value, undefined, `${loc}:${key} is missing`);
      assert.equal(typeof value, 'string', `${loc}:${key} is not a string`);
      assert.ok(value.trim().length > 0, `${loc}:${key} is empty`);
      assert.notEqual(value, key, `${loc}:${key} is its own key`);
      assert.notEqual(value, key.split('.').pop(), `${loc}:${key} is its own leaf name`);
      assert.deepEqual(placeholders(value), placeholders(dig(en, key)),
        `${loc}:${key} has different {{placeholders}} from en`);
    }
  }

  // every key this package added is one the source actually renders, and vice versa: a key nobody
  // uses rots, and a t('safety.…') call with no key renders the key to the reader.
  const used = new Set();
  for (const key of ['home', 'profile', 'group', 'settings', 'report', 'block']) {
    for (const m of SOURCES[key].matchAll(/t\('(safety\.[\w.]+)'/g)) used.add(m[1]);
  }
  // the picker builds its labels at runtime: t(`safety.reason.${r}`)
  for (const r of ['spam', 'harassment', 'hate', 'sexual', 'violence', 'self_harm', 'other']) {
    if (/safety\.reason\.\$\{r\}/.test(SOURCES.report)) used.add(`safety.reason.${r}`);
  }
  const unused = NEW_KEYS.filter(k => !used.has(k));
  assert.deepEqual(unused, [], `these new keys are never rendered: ${unused.join(', ')}`);
  const undeclared = [...used].filter(k => !NEW_KEYS.includes(k));
  assert.deepEqual(undeclared, [], `these safety keys are rendered but not in NEW_KEYS: ${undeclared.join(', ')}`);
});
