// Sprint 4I package P5 (tests.md §10) — the mobile client's report and block
// affordances, proved as source shape.
//
// There is no device and no emulator here, so every case below is an AST or
// anchored-text assertion over the committed source. What that does NOT prove
// is written down in tests.md §15 item 11: it does not prove the item renders,
// that the touch target is reachable, or that the request is sent. The
// substitute proof is one manual pass per surface on a device.
//
// The structure is `__tests__/botBadge.test.mjs`'s, deliberately and exactly,
// because an AST scan that matches NOTHING looks identical to one that matches
// everything:
//   * anchors are drawn from surrounding JSX, never from line numbers;
//   * every anchor is asserted to resolve to EXACTLY ONE element, so a stale
//     site map is a loud failure rather than a silent zero;
//   * `found === EXPECTED_SITES` is asserted against a literal BEFORE any
//     per-site assertion;
//   * every detector is run over a synthetic source in both directions, so a
//     detector that can no longer see anything fails here instead of passing
//     everywhere.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  MOBILE_ROOT, parseJS, parseMobileFile, readMobile, readRepo, walk, findAll,
  existsInMobile, existsInRepo,
} from './_ast.mjs';

// ── Import guard (non-vacuity rule 5) ───────────────────────────────────────
// A test file that fails to LOAD is reported as one error while every
// assertion in it silently stops running. These make that one error loud.
for (const [name, fn] of Object.entries({ parseJS, parseMobileFile, readMobile, readRepo, walk, findAll, existsInMobile, existsInRepo })) {
  assert.equal(typeof fn, 'function', `_ast.mjs does not export ${name}`);
}
assert.ok(existsInMobile('src/components/ReportDialog.js'), 'src/components/ReportDialog.js does not exist — P5 is not built');
assert.ok(existsInMobile('src/utils/safety.js'), 'src/utils/safety.js does not exist — P5 is not built');
assert.ok(existsInRepo('app/routers/reports_router.py'), 'app/routers/reports_router.py is missing — 4I-A is not merged, and C-14m compares against it');
assert.match(readMobile('src/services/api.js'), /reportContent/, 'src/services/api.js has no reportContent — P5 is not built');

const FEED = 'src/screens/FeedScreen.js';
const PROFILE = 'src/screens/UserProfileScreen.js';
const GROUP = 'src/screens/GroupDetailScreen.js';
const SETTINGS = 'src/screens/SettingsScreen.js';
const DIALOG = 'src/components/ReportDialog.js';
const LOCALES_DIR = path.join(MOBILE_ROOT, 'src', 'i18n', 'locales');
const LOCALE_CODES = ['en', 'de', 'es', 'fr', 'pt', 'ru'];

const TOUCHABLE_TAGS = new Set(['TouchableOpacity', 'Pressable', 'TouchableHighlight', 'TouchableWithoutFeedback']);

// ── Shared AST helpers ──────────────────────────────────────────────────────
function jsxName(el) {
  const n = el.openingElement && el.openingElement.name;
  return n && n.type === 'JSXIdentifier' ? n.name : null;
}

function jsxAttr(el, name) {
  return (el.openingElement.attributes || []).find(
    (a) => a.type === 'JSXAttribute' && a.name.type === 'JSXIdentifier' && a.name.name === name,
  );
}

// `styles.postHeader` must not match `styles.postHeaderRow`.
function styleRe(key) {
  return new RegExp(`styles\\.${key}(?![A-Za-z0-9_$])`);
}

// Every JSX element of `tag` whose OPENING tag carries styles.<styleKey>.
// Located by content, so a refactor moves a site instead of voiding the case.
function elementsStyled(code, tag, styleKey, ast = parseJS(code)) {
  const out = [];
  walk(ast, (node) => {
    if (node.type !== 'JSXElement' || jsxName(node) !== tag) return;
    const open = code.slice(node.openingElement.start, node.openingElement.end);
    if (!styleRe(styleKey).test(open)) return;
    out.push(node);
  });
  return out;
}

function touchablesIn(root) {
  return findAll(root, (n) => n.type === 'JSXElement' && TOUCHABLE_TAGS.has(jsxName(n)));
}

function pressSource(code, el) {
  const a = jsxAttr(el, 'onPress');
  return a ? code.slice(a.start, a.end) : '';
}

// A Report affordance: a touchable whose press handler opens the report
// dialog. Named by what it DOES, not by its icon or its label — a label is the
// easiest thing to get right while the button does nothing.
const OPENS_REPORT = /\bopenReport\s*\(|\bsetReportTarget\s*\(/;
// Referenced OR called: the profile menu passes `handleBlock` by name, the
// search row calls it with arguments. Both are the Block affordance.
const OPENS_BLOCK = /\bhandleBlock\b|\bconfirmBlock\s*\(/;

function reportTouchables(code, root) {
  return touchablesIn(root).filter((el) => OPENS_REPORT.test(pressSource(code, el)));
}

function blockTouchables(code, root) {
  return touchablesIn(root).filter((el) => OPENS_BLOCK.test(pressSource(code, el)));
}

// parent map, so a node can be walked back up to its nearest gate
function parentsOf(ast) {
  const parents = new Map();
  walk(ast, (node, parent) => { if (parent) parents.set(node, parent); });
  return parents;
}

function ancestors(node, parents) {
  const out = [];
  let cur = parents.get(node);
  while (cur) { out.push(cur); cur = parents.get(cur); }
  return out;
}

// The nearest enclosing `cond && (<jsx/>)` or `cond ? a : b`, as source text.
function nearestGate(code, node, parents) {
  for (const a of ancestors(node, parents)) {
    if (a.type === 'LogicalExpression' && a.operator === '&&') return code.slice(a.left.start, a.left.end);
    if (a.type === 'ConditionalExpression') return code.slice(a.test.start, a.test.end);
  }
  return null;
}

const OWNER_GATE = /\bisOwnPost\b|\bisOwn\b|\bisAdmin\b/;

// ── The site map: spec R-05's six mobile surfaces ───────────────────────────
// Each anchor is an element that existed BEFORE this sprint, so the assertion
// is "the Report item is here", not "the thing I just added is the thing I
// just added".
// Site 1 cannot be anchored by `styles.menuDropdown`: the post menu and the
// search-result menu share that style, so the anchor resolved to TWO elements
// and the "exactly one" rule is what caught it. It is anchored by its own
// state setter instead — `setMenuPostId` belongs to the post menu alone.
const R05_SITES = [
  { file: FEED,    locate: postMenuRootFrom,                label: '1 feed post overflow menu' },
  { file: FEED,    tag: 'View', styleKey: 'commentRow',    label: '2 feed comment row' },
  { file: PROFILE, tag: 'View', styleKey: 'noteHeader',    label: '3 public-profile note' },
  { file: PROFILE, tag: 'View', styleKey: 'actionCluster', label: '4 public profile (the reader)' },
  { file: GROUP,   tag: 'View', styleKey: 'postHeader',    label: '5 circle post' },
  { file: FEED,    tag: 'View', styleKey: 'userCard',      label: '6 user search result' },
];
const R05_SITE_COUNT = 6;

// C-05m: where Block itself lives. Two, not six — "Also block this person" in
// the report dialog covers the rest, and a Block button on every surface would
// be the opposite of pm-decisions E-1.
const BLOCK_SITES = [
  { file: PROFILE, tag: 'View', styleKey: 'actionCluster', label: 'public profile action cluster' },
  { file: FEED,    tag: 'View', styleKey: 'userCard',      label: 'user search result row' },
];
const BLOCK_SITE_COUNT = 2;

const SYNTHETIC_WITH_REPORT = `
  const X = () => (
    <View style={styles.postHeader}>
      <Text>{post.user.name}</Text>
      <TouchableOpacity onPress={() => openReport({ type: 'note', id: post.id })}>
        <Ionicons name="flag-outline" />
      </TouchableOpacity>
    </View>
  );
`;
const SYNTHETIC_WITHOUT_REPORT = `
  const X = () => (
    <View style={styles.postHeader}>
      <Text>{post.user.name}</Text>
    </View>
  );
`;

// `setMenuPostId` is the post menu's OWN state setter; the search-result
// menu uses `setMenuUserId`. One constant, shared by the site-1 locator and
// C-04m, so the two cases cannot drift onto different menus.
const POST_MENU_TRIGGER = /\bsetMenuPostId\s*\(/;

// The post menu's root <View>, found from its own trigger's handler rather
// than from a shared style. Returns a LIST so it is interchangeable with the
// style locator, and so "exactly one" is asserted the same way at every site.
function postMenuRootFrom(code) {
  const ast = parseJS(code);
  const parents = parentsOf(ast);
  return touchablesIn(ast)
    .filter((el) => POST_MENU_TRIGGER.test(pressSource(code, el)))
    .map((el) => parents.get(el))
    .filter((n) => n && n.type === 'JSXElement' && jsxName(n) === 'View');
}

function anchorsForSites(sites, sourceFor = readMobile) {
  const sources = new Map();
  for (const s of sites) if (!sources.has(s.file)) sources.set(s.file, sourceFor(s.file));
  const anchors = [];
  for (const site of sites) {
    const code = sources.get(site.file);
    const hits = site.locate ? site.locate(code) : elementsStyled(code, site.tag, site.styleKey);
    const what = site.locate ? 'anchor element' : `<${site.tag} style={styles.${site.styleKey}}>`;
    assert.equal(hits.length, 1,
      `${site.label}: expected exactly 1 ${what} in ${site.file}, found ${hits.length} — the anchor is stale, fix it rather than the count`);
    anchors.push({ site, code, node: hits[0] });
  }
  return anchors;
}

// ── C-02 ────────────────────────────────────────────────────────────────────
test('report_reachable_at_every_r05_mobile_site', () => {
  // The detector proves it can both find and miss a Report item (rule 3)
  // before it is trusted about the real source.
  const pos = elementsStyled(SYNTHETIC_WITH_REPORT, 'View', 'postHeader');
  assert.equal(pos.length, 1, 'detector failed to locate the anchor in the synthetic source');
  assert.equal(reportTouchables(SYNTHETIC_WITH_REPORT, pos[0]).length, 1, 'detector missed a Report item that is there');
  const neg = elementsStyled(SYNTHETIC_WITHOUT_REPORT, 'View', 'postHeader');
  assert.equal(neg.length, 1, 'detector failed to locate the anchor in the stripped synthetic source');
  assert.equal(reportTouchables(SYNTHETIC_WITHOUT_REPORT, neg[0]).length, 0, 'detector reported a Report item in a source that has none');

  // Inventory first (rule 4): every anchor findable, exactly once.
  const anchors = anchorsForSites(R05_SITES);
  assert.equal(anchors.length, R05_SITE_COUNT, `expected ${R05_SITE_COUNT} R-05 anchors, found ${anchors.length}`);

  // Then the Report item, counted against the literal before it is described.
  const missing = anchors.filter(({ code, node }) => reportTouchables(code, node).length === 0).map(({ site }) => site.label);
  const found = R05_SITE_COUNT - missing.length;
  assert.equal(found, R05_SITE_COUNT,
    `${found} of ${R05_SITE_COUNT} R-05 sites carry Report; missing: ${missing.join(', ') || '(none)'}`);

  // Each screen must actually mount the dialog it opens — an openReport() that
  // reaches no <ReportDialog> is a button that does nothing.
  for (const file of [FEED, PROFILE, GROUP]) {
    const code = readMobile(file);
    assert.match(code, /import\s+ReportDialog\s+from\s+'\.\.\/components\/ReportDialog'/, `${file} does not import ReportDialog`);
    assert.equal(findAll(parseJS(code), (n) => n.type === 'JSXElement' && jsxName(n) === 'ReportDialog').length, 1,
      `${file} must render exactly one <ReportDialog>`);
  }
});

// ── C-03m ───────────────────────────────────────────────────────────────────
// The synthetic negative over the REAL sources. Without it this suite could
// not fail, which G-4I-07 treats as an uncaught mutation.
test('the_detector_reports_zero_on_a_stripped_copy', () => {
  // Non-greedy, and bounded by the first closing tag: these are leaf
  // touchables. Replaced by <View /> rather than deleted, because a removed
  // element inside `{cond && ( … )}` leaves `{cond && ()}`, which does not
  // parse — and an unparseable "stripped copy" would make this case error
  // rather than assert.
  const STRIP = /<TouchableOpacity\b(?:(?!<\/TouchableOpacity>)[\s\S])*?(?:openReport\s*\(|setReportTarget\s*\()(?:(?!<\/TouchableOpacity>)[\s\S])*?<\/TouchableOpacity>/g;

  let stripped = 0;
  const copies = new Map();
  for (const file of [FEED, PROFILE, GROUP]) {
    const code = readMobile(file);
    const out = code.replace(STRIP, () => { stripped += 1; return '<View />'; });
    copies.set(file, out);
  }
  assert.equal(stripped, R05_SITE_COUNT,
    `the strip removed ${stripped} Report items, expected ${R05_SITE_COUNT} — it is too greedy or too narrow either way`);

  // The strip must not have taken the anchors with it: a copy with no anchors
  // reports 0 sites for the wrong reason, which is a false pass. Same locators
  // as C-02, run against the stripped text.
  const anchors = anchorsForSites(R05_SITES, (f) => copies.get(f));
  assert.equal(anchors.length, R05_SITE_COUNT);

  const stillFound = anchors.filter(({ code, node }) => reportTouchables(code, node).length > 0).map(({ site }) => site.label);
  assert.deepEqual(stillFound, [],
    `the detector still reports Report at ${stillFound.join(', ')} in a copy that has none — it is not looking at what it claims to`);
});

// ── C-04m (K-4I-11) — the largest client change in the sprint ───────────────
// Two-sided on purpose. "Open the gate" and "do not leak Delete" are opposite
// failures and only one of them is obvious.
const DESTRUCTIVE = /\bhandleDeletePost\s*\(|\bhandleDeleteComment\s*\(|\bhandleAdminDeleteNote\s*\(|\bsetEditing\w*\s*\(/;
const MENU_OWNER_ITEM_COUNT = 1;   // today, mobile: Delete. Web has two (edit + delete).

// Locates the feed post menu by its TRIGGER's handler — `setMenuPostId` is the
// post menu's own state and is not shared with the search-result menu.
function postMenuRoot(code, ast, parents) {
  const triggers = touchablesIn(ast).filter((el) => POST_MENU_TRIGGER.test(pressSource(code, el)));
  assert.equal(triggers.length, 1, `expected exactly one setMenuPostId trigger, found ${triggers.length}`);
  const root = parents.get(triggers[0]);
  assert.ok(root && root.type === 'JSXElement' && jsxName(root) === 'View', 'the post-menu trigger has no wrapping <View>');
  return root;
}

function menuViolations(code) {
  const ast = parseJS(code);
  const parents = parentsOf(ast);
  const root = postMenuRoot(code, ast, parents);

  const outerGate = nearestGate(code, root, parents);
  const items = touchablesIn(root).filter((el) => DESTRUCTIVE.test(pressSource(code, el)));
  const unguarded = items
    .map((el) => {
      const gate = nearestGate(code, el, parents);
      return (gate && OWNER_GATE.test(gate)) ? null : pressSource(code, el).slice(0, 60);
    })
    .filter(Boolean);
  return { outerGate, items, unguarded };
}

const SYN_MENU_GUARDED = `
  const X = () => (
    <View>
      <TouchableOpacity onPress={() => setMenuPostId(showMenu ? null : post.id)}><Text>...</Text></TouchableOpacity>
      {showMenu && (
        <View>
          {(isOwnPost || isAdmin) && (
            <TouchableOpacity onPress={() => handleDeletePost(post)}><Text>Delete</Text></TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
`;
const SYN_MENU_LEAKY = `
  const X = () => (
    <View>
      <TouchableOpacity onPress={() => setMenuPostId(showMenu ? null : post.id)}><Text>...</Text></TouchableOpacity>
      {showMenu && (
        <View>
          <TouchableOpacity onPress={() => handleDeletePost(post)}><Text>Delete</Text></TouchableOpacity>
        </View>
      )}
    </View>
  );
`;

test('the_post_menu_is_open_to_everyone_and_leaks_no_owner_action', () => {
  // CONTROL (rule 3), both directions: the detector must report exactly one
  // violation on a copy with the inner guard stripped, and none with it.
  assert.deepEqual(menuViolations(SYN_MENU_GUARDED).unguarded, [], 'the detector invented a violation in a correctly guarded menu');
  assert.equal(menuViolations(SYN_MENU_LEAKY).unguarded.length, 1, 'the detector cannot see an unguarded destructive item, so its pass proves nothing');

  const code = readMobile(FEED);
  const { outerGate, items, unguarded } = menuViolations(code);

  // (a) The menu is open to every reader. Before Sprint 4I the whole block was
  // wrapped in `(isOwnPost || isAdmin)`, so a non-owner saw no menu and Report
  // had nowhere to live.
  if (outerGate !== null) {
    assert.doesNotMatch(outerGate, OWNER_GATE,
      `the feed post menu is still gated owner-or-admin (\`${outerGate.trim()}\`) — a non-owner sees no menu, so Report is unreachable`);
  }

  // (b) Inventory first, then the guard, item by item.
  assert.equal(items.length, MENU_OWNER_ITEM_COUNT,
    `expected ${MENU_OWNER_ITEM_COUNT} owner-only item(s) inside the post menu, found ${items.length} — if an item was added, guard it and move this literal`);
  assert.deepEqual(unguarded, [],
    `owner-only action(s) leaked to every reader: ${unguarded.join(' | ')}`);
});

// ── C-05m ───────────────────────────────────────────────────────────────────
test('block_reachable_from_the_profile_and_from_a_search_result', () => {
  const anchors = anchorsForSites(BLOCK_SITES);
  assert.equal(anchors.length, BLOCK_SITE_COUNT);
  const missing = anchors.filter(({ code, node }) => blockTouchables(code, node).length === 0).map(({ site }) => site.label);
  const found = BLOCK_SITE_COUNT - missing.length;
  assert.equal(found, BLOCK_SITE_COUNT,
    `${found} of ${BLOCK_SITE_COUNT} Block sites carry Block; missing: ${missing.join(', ') || '(none)'}`);

  // Both reach the same confirmation, so the copy below is the copy a reader
  // sees at either site.
  for (const file of [PROFILE, FEED]) {
    assert.match(readMobile(file), /import\s+\{\s*confirmBlock\s*\}\s+from\s+'\.\.\/utils\/safety'/, `${file} does not import confirmBlock`);
  }
});

// ── pm-decisions E-1: the softer option is FIRST ────────────────────────────
// Not in tests.md. "A menu offering only the nuclear option pushes people into
// it" is a product decision with no other proof, so it gets one.
test('unfollow_sits_above_block_in_the_profile_menu', () => {
  const code = readMobile(PROFILE);
  const ast = parseJS(code);
  const parents = parentsOf(ast);
  const anchors = elementsStyled(code, 'View', 'safetyMenu', ast);
  assert.equal(anchors.length, 1, `expected exactly one <View style={styles.safetyMenu}>, found ${anchors.length}`);
  const items = touchablesIn(anchors[0]);
  const unfollow = items.findIndex((el) => /\btoggleFollow\s*\(/.test(pressSource(code, el)));
  const block = items.findIndex((el) => OPENS_BLOCK.test(pressSource(code, el)));
  assert.notEqual(unfollow, -1, 'the profile menu has no Unfollow item — a menu whose only exit is Block pushes readers into it (pm-decisions E-1)');
  assert.notEqual(block, -1, 'the profile menu has no Block item');
  assert.ok(unfollow < block, `Unfollow is at index ${unfollow} and Block at ${block} — Unfollow must come first`);

  // This case is a SOURCE-ORDER scan, so an Unfollow item behind a gate that
  // is never true would satisfy everything above while no reader ever sees it.
  // Found by running MUT-P5-17a, which replaced `{following && (` with
  // `{false && (` and stayed GREEN. The gate must be about the follow itself.
  const gate = nearestGate(code, items[unfollow], parents);
  assert.ok(gate, 'the Unfollow item has no enclosing condition at all');
  assert.match(gate, /\bfollowing\b/,
    `the Unfollow item is gated on \`${gate.trim()}\` — it must be shown exactly when the viewer follows this reader`);
});

// ── C-06m ───────────────────────────────────────────────────────────────────
function loadLocale(code) {
  return JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, `${code}.json`), 'utf8'));
}
function get(obj, dotted) {
  return dotted.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}

test('the_block_confirm_says_what_it_cannot_undo', () => {
  // The key the product actually uses, not a key this test invented.
  assert.match(readMobile('src/utils/safety.js'), /t\('safety\.blockConfirmBody'/,
    'confirmBlock does not use safety.blockConfirmBody');

  const value = get(loadLocale('en'), 'safety.blockConfirmBody');
  assert.equal(typeof value, 'string');

  // Three anchors, as regexes rather than as a sentence: the anchors are what
  // make the copy accurate, the wording is the PM's.
  assert.match(value, /stop seeing|no longer see|hidden from each other/i,
    'the confirm does not say the two of you stop seeing each other');
  assert.match(value, /follow/i, 'the confirm does not mention the follow at all (R-21 deletes it)');
  assert.match(value, /not come back|removed|permanent/i,
    'the confirm does not say the follow is gone for good — unblocking restores nothing, and a reader must not discover that afterwards');
  assert.match(value, /public|signed out|open web|does not unpublish/i,
    "the confirm does not state E-8's limit: a block does not unpublish public posts, which a signed-out visitor can still read");
});

// ── C-06b, corrected ────────────────────────────────────────────────────────
// tests.md's C-06b asks that "the POST /blocks call's rejection is handled on
// its own path". There is no POST /blocks call in the report flow: pm-decisions
// Q-3 replaced the two requests with one, so the failure it describes cannot
// happen. The case is INVERTED rather than dropped — what has to be proved now
// is that the second request did not come back.
test('the_report_submit_sends_one_request_not_two', () => {
  const code = readMobile(DIALOG);
  const ast = parseJS(code);

  const apiCalls = findAll(ast, (n) => n.type === 'CallExpression'
    && n.callee.type === 'MemberExpression'
    && n.callee.object.type === 'Identifier' && n.callee.object.name === 'userAPI');
  const names = apiCalls.map((n) => n.callee.property.name).sort();
  assert.deepEqual(names, ['reportContent'],
    `ReportDialog calls ${names.join(', ')} — the report and the block are ONE transaction on the server (pm-decisions Q-3); a second request re-opens "what if the block half fails"`);

  // ...and the one call carries the flag, so "one request" is not "the block
  // was quietly dropped".
  const arg = apiCalls[0].arguments[0];
  assert.equal(arg.type, 'ObjectExpression', 'reportContent must be called with an options object');
  const keys = arg.properties.map((p) => (p.key.type === 'Identifier' ? p.key.name : p.key.value));
  assert.ok(keys.includes('alsoBlock'), `reportContent is called without alsoBlock (keys: ${keys.join(', ')})`);

  // The wire field is what the server reads. api.js maps one to the other.
  assert.match(readMobile('src/services/api.js'), /also_block:\s*!!alsoBlock/,
    'api.js does not send also_block — the checkbox would be decorative');
});

// ── C-12m ───────────────────────────────────────────────────────────────────
test('settings_has_a_blocked_list_with_unblock', () => {
  const code = readMobile(SETTINGS);
  const ast = parseJS(code);

  // Three anchors, each exactly one.
  const entryRows = findAll(ast, (n) => n.type === 'JSXElement' && jsxName(n) === 'Row'
    && /\bopenBlocked\b/.test(code.slice(n.openingElement.start, n.openingElement.end)));
  assert.equal(entryRows.length, 1, `expected exactly one <Row onPress={openBlocked}>, found ${entryRows.length}`);

  const lists = elementsStyled(code, 'View', 'blockedRow');
  assert.equal(lists.length, 1, `expected exactly one <View style={styles.blockedRow}>, found ${lists.length}`);

  const unblockBtns = touchablesIn(lists[0]).filter((el) => /\bhandleUnblock\s*\(/.test(pressSource(code, el)));
  assert.equal(unblockBtns.length, 1, 'each blocked row must carry exactly one Unblock control');

  // The entry row is in the PRIVACY section (R-28), not somewhere it will
  // never be found.
  const privacyIdx = code.indexOf("t('settings.sectionPrivacy')");
  const notifIdx = code.indexOf("t('settings.sectionNotifications')");
  assert.ok(privacyIdx >= 0 && notifIdx > privacyIdx, 'the Privacy and Notifications section headers moved — this positional check is stale');
  assert.ok(entryRows[0].start > privacyIdx && entryRows[0].start < notifIdx,
    'the blocked-readers row is not inside the Privacy section');

  // And the handlers reach the real endpoints.
  assert.match(code, /userAPI\.getBlocks\(\)/, 'openBlocked does not call userAPI.getBlocks');
  assert.match(code, /userAPI\.unblockUser\(/, 'handleUnblock does not call userAPI.unblockUser');
});

// ── C-13m (pm-decisions E-3) ────────────────────────────────────────────────
test('also_block_is_checked_by_default', () => {
  const ast = parseMobileFile(DIALOG);
  const decls = findAll(ast, (n) => n.type === 'VariableDeclarator'
    && n.id.type === 'ArrayPattern'
    && n.id.elements[0] && n.id.elements[0].name === 'alsoBlock');
  assert.equal(decls.length, 1, `expected exactly one \`const [alsoBlock, …] = useState(…)\`, found ${decls.length}`);

  const init = decls[0].init;
  assert.equal(init.type, 'CallExpression');
  assert.equal(init.callee.name, 'useState', 'alsoBlock must come from useState');
  assert.equal(init.arguments.length, 1, 'useState must be given an explicit initial value');
  assert.equal(init.arguments[0].type, 'BooleanLiteral');
  assert.equal(init.arguments[0].value, true,
    'the "Also block this person" checkbox must start CHECKED (pm-decisions E-3) — a report changes nothing anyone else sees, so the block is the reader\'s only relief in the moment');

  // Asserted from the AST, never from a comment: the wire default stays false
  // so an old client that does not know the field cannot start blocking people.
  assert.match(readMobile('src/services/api.js'), /also_block:\s*!!alsoBlock/);
  assert.match(readRepo('app/routers/reports_router.py'), /also_block:\s*bool\s*=\s*False/,
    'the server default for also_block is no longer False — an old client would start blocking people');
});

// ── C-14m ───────────────────────────────────────────────────────────────────
// The client's reason list is COMPARED against the server's, read from the
// Python source at test time. Never re-typed: the server answers anything
// outside its closed set with a 422, so an invented reason is a dead button.
test('the_reason_picker_offers_exactly_the_apis_closed_set', () => {
  const py = readRepo('app/routers/reports_router.py');
  const m = py.match(/^REASONS\s*=\s*\(([^)]*)\)/m);
  assert.ok(m, 'could not find the REASONS tuple in app/routers/reports_router.py');
  const server = [...m[1].matchAll(/"([a-z_]+)"/g)].map((x) => x[1]);
  assert.equal(server.length, 7, `the server now has ${server.length} reasons, not 7 — move this literal deliberately`);

  const ast = parseMobileFile(DIALOG);
  const decls = findAll(ast, (n) => n.type === 'VariableDeclarator'
    && n.id.type === 'Identifier' && n.id.name === 'REPORT_REASONS');
  assert.equal(decls.length, 1, 'expected exactly one REPORT_REASONS declaration');
  assert.equal(decls[0].init.type, 'ArrayExpression');
  const client = decls[0].init.elements.map((e) => {
    assert.equal(e.type, 'StringLiteral', 'every REPORT_REASONS member must be a plain string literal');
    return e.value;
  });
  assert.equal(client.length, 7, `the client offers ${client.length} reasons, not 7`);
  assert.deepEqual(client, server, 'the client reason list is not the server\'s closed set');

  // Each one must have copy, or the picker renders a blank row.
  const en = loadLocale('en');
  for (const r of client) {
    const v = get(en, `safety.reasons.${r}`);
    assert.equal(typeof v, 'string', `safety.reasons.${r} is missing from en.json`);
    assert.ok(v.length > 0, `safety.reasons.${r} is empty`);
  }
});

// ── The six locales ─────────────────────────────────────────────────────────
// __tests__/i18nParity.test.mjs already fails on any key present in one locale
// and not another, which is the gate. This adds the half parity cannot give:
// that these particular keys EXIST at all, with real values.
const NEW_KEYS = [
  'safety.report', 'safety.block', 'safety.blockAction', 'safety.unfollow', 'safety.unblock',
  'safety.reportTitle', 'safety.reportSubtitle',
  'safety.reasons.spam', 'safety.reasons.harassment', 'safety.reasons.hate', 'safety.reasons.sexual',
  'safety.reasons.violence', 'safety.reasons.self_harm', 'safety.reasons.other',
  'safety.detailPlaceholder', 'safety.alsoBlock', 'safety.alsoBlockHint', 'safety.sendReport',
  'safety.reviewPromise', 'safety.reportFailed', 'safety.thisReader',
  'safety.blockTitle', 'safety.blockConfirmBody', 'safety.blockFailed',
  'safety.blockedReaders', 'safety.blockedReadersDesc', 'safety.blockedEmpty',
  'safety.blockedLoadFailed', 'safety.unblockFailed', 'safety.unblockHint',
  'a11y.reportPost', 'a11y.reportComment', 'a11y.reportReader',
  'a11y.blockReader', 'a11y.unfollowReader', 'a11y.readerOptions', 'a11y.alsoBlock',
];

function placeholders(str) {
  return [...String(str).matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).sort();
}

test('every_new_4i_string_is_in_all_six_locales', () => {
  assert.equal(NEW_KEYS.length, 37, 'the new-key list changed size — move this literal deliberately');
  assert.equal(LOCALE_CODES.length, 6);

  const en = loadLocale('en');
  for (const code of LOCALE_CODES) {
    const data = loadLocale(code);
    for (const key of NEW_KEYS) {
      const value = get(data, key);
      assert.equal(typeof value, 'string', `${code}:${key} is missing`);
      assert.ok(value.trim().length > 0, `${code}:${key} is empty`);
      assert.notEqual(value, key, `${code}:${key} is its own key`);
      assert.deepEqual(placeholders(value), placeholders(get(en, key)), `${code}:${key} placeholders differ from en`);
    }
  }

  // Non-vacuity: every key above must actually be used by the product, or this
  // case is pinning copy nothing renders.
  const sources = [FEED, PROFILE, GROUP, SETTINGS, DIALOG, 'src/utils/safety.js'].map(readMobile).join('\n');
  const unused = NEW_KEYS.filter((k) => {
    if (k.startsWith('safety.reasons.')) return !/safety\.reasons\.\$\{r\}/.test(sources);
    return !sources.includes(`'${k}'`);
  });
  assert.deepEqual(unused, [], `new keys that nothing renders: ${unused.join(', ')}`);
});

// ── The store release ───────────────────────────────────────────────────────
// There is no OTA channel, so this client change reaches a reader only through
// a store release. A build that is not ahead of the last one is rejected.
test('the_version_is_bumped_for_the_one_release_that_carries_both_halves', () => {
  const appJson = JSON.parse(readMobile('app.json'));
  const released = JSON.parse(readMobile('release/last-released.json'));

  // iOS ships at 2.2.4 build 5 in TestFlight, which release/last-released.json
  // (a Play record) does not know about — so buildNumber is checked against
  // that known value rather than against the file.
  assert.equal(typeof appJson.expo.ios.buildNumber, 'string');
  assert.ok(Number(appJson.expo.ios.buildNumber) > 5,
    `ios.buildNumber is ${appJson.expo.ios.buildNumber}; TestFlight already has build 5, and App Store Connect rejects a repeat`);
  assert.ok(appJson.expo.android.versionCode > released.versionCode);

  // Explicitly NOT changed: changing it orphans every installed Android app.
  assert.equal(appJson.expo.android.package, 'com.bookpulse.mobile');
  assert.equal(appJson.expo.ios.bundleIdentifier, 'com.bookpulse.mobile');
});
