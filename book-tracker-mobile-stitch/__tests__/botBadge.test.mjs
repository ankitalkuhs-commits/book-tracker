// Sprint 4F package P4 (tests.md §5, cases A-01, A-01a, A-02..A-06).
//
// There is no device and no emulator here, so every case is an AST assertion
// over the committed source, using the shared helpers in _ast.mjs.
//
// Two defects this project has already shipped shape how these are written:
//   * a walk that inspected the wrong call, threw, and asserted nothing —
//     so every walk below counts its sites against a literal FIRST, and every
//     detector is also run against a synthetic source in the same test;
//   * a test file that imported a symbol which did not exist, failed to load,
//     and silently dropped its assertions — so the module-scope guard below
//     asserts every helper and every file this suite depends on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  MOBILE_ROOT, parseJS, parseMobileFile, readMobile, walk, findAll,
  existsInMobile, listMobileFiles,
} from './_ast.mjs';

// ── Import guard (tests.md non-vacuity rule 5 / K-07) ───────────────────────
for (const [name, fn] of Object.entries({ parseJS, parseMobileFile, readMobile, walk, findAll, existsInMobile, listMobileFiles })) {
  assert.equal(typeof fn, 'function', `_ast.mjs does not export ${name}`);
}
assert.equal(typeof MOBILE_ROOT, 'string');
assert.ok(existsInMobile('src/components/BotBadge.js'), 'src/components/BotBadge.js does not exist — P4 is not built');

const FEED = 'src/screens/FeedScreen.js';
const GROUP = 'src/screens/GroupDetailScreen.js';
const PROFILE = 'src/screens/UserProfileScreen.js';
const BADGE = 'src/components/BotBadge.js';

// ── Shared AST helpers ──────────────────────────────────────────────────────
function jsxName(el) {
  const n = el.openingElement && el.openingElement.name;
  return n && n.type === 'JSXIdentifier' ? n.name : null;
}

// `styles.userName` must not match `styles.userNameRow` / `styles.userNameText`.
function styleRe(key) {
  return new RegExp(`styles\\.${key}(?![A-Za-z0-9_$])`);
}

// Every <Text> whose opening tag carries styles.<styleKey>, optionally also
// requiring a literal string in the element's body. Located by content only —
// never by line number, so a refactor moves a site instead of voiding the test.
function anchorsIn(code, styleKey, contains, ast = parseJS(code)) {
  const out = [];
  walk(ast, (node, parent) => {
    if (node.type !== 'JSXElement' || jsxName(node) !== 'Text') return;
    const open = code.slice(node.openingElement.start, node.openingElement.end);
    if (!styleRe(styleKey).test(open)) return;
    if (contains && !code.slice(node.start, node.end).includes(contains)) return;
    out.push({ node, parent });
  });
  return out;
}

function badgeSiblings(anchor) {
  const p = anchor.parent;
  if (!p || p.type !== 'JSXElement') return [];
  return (p.children || []).filter((c) => c.type === 'JSXElement' && jsxName(c) === 'BotBadge');
}

function jsxAttr(el, name) {
  return (el.openingElement.attributes || []).find(
    (a) => a.type === 'JSXAttribute' && a.name.type === 'JSXIdentifier' && a.name.name === name,
  );
}

// ── A-01 ────────────────────────────────────────────────────────────────────
// The six sites of spec R-04, each named by the style key of the <Text> that
// prints the author's name.
const R04_SITES = [
  { file: FEED, styleKey: 'userName', contains: null, label: 'FeedScreen feed-post name' },
  { file: FEED, styleKey: 'emotionLineText', contains: 'is feeling', label: 'FeedScreen "is feeling" sentence' },
  { file: FEED, styleKey: 'commentName', contains: null, label: 'FeedScreen comment row' },
  { file: FEED, styleKey: 'userNameText', contains: null, label: 'FeedScreen user-search row' },
  { file: GROUP, styleKey: 'postAuthor', contains: null, label: 'GroupDetailScreen group post author' },
  { file: PROFILE, styleKey: 'userName', contains: null, label: 'UserProfileScreen profile display name' },
];
const R04_SITE_COUNT = 6;

const SYNTHETIC_BADGED = `
  const X = () => (
    <View style={styles.userNameRow}>
      <Text style={styles.userName}>{name}</Text>
      <BotBadge isBot={user.is_bot} />
    </View>
  );
`;
const SYNTHETIC_UNBADGED = `
  const X = () => (
    <View style={styles.userNameRow}>
      <Text style={styles.userName}>{name}</Text>
    </View>
  );
`;

test('badge_present_at_every_r04_site', () => {
  // The detector proves it can both find and miss a badge (rule 3), before it
  // is trusted about the real source.
  const posHits = anchorsIn(SYNTHETIC_BADGED, 'userName', null);
  assert.equal(posHits.length, 1, 'detector failed to locate the anchor in the synthetic source');
  assert.equal(badgeSiblings(posHits[0]).length, 1, 'detector missed a BotBadge that is there');
  const negHits = anchorsIn(SYNTHETIC_UNBADGED, 'userName', null);
  assert.equal(negHits.length, 1, 'detector failed to locate the anchor in the unbadged synthetic source');
  assert.equal(badgeSiblings(negHits[0]).length, 0, 'detector reported a BotBadge in a source that has none');

  // Inventory first (rule 4): every anchor must still be findable, and exactly
  // once, or the site list is stale and nothing below means anything.
  const sources = new Map();
  for (const s of R04_SITES) if (!sources.has(s.file)) sources.set(s.file, readMobile(s.file));

  const anchors = [];
  for (const site of R04_SITES) {
    const hits = anchorsIn(sources.get(site.file), site.styleKey, site.contains);
    assert.equal(hits.length, 1, `${site.label}: expected exactly 1 anchor <Text> with styles.${site.styleKey} in ${site.file}, found ${hits.length}`);
    anchors.push({ site, anchor: hits[0] });
  }
  assert.equal(anchors.length, R04_SITE_COUNT, `expected ${R04_SITE_COUNT} R-04 anchors, found ${anchors.length}`);

  // Then the badge, counted against the literal before it is described.
  const badged = anchors.filter(({ anchor }) => badgeSiblings(anchor).length > 0);
  const missing = anchors.filter(({ anchor }) => badgeSiblings(anchor).length === 0).map(({ site }) => site.label);
  assert.equal(badged.length, R04_SITE_COUNT, `unbadged R-04 site(s): ${missing.join(', ') || '(none)'}`);

  // Each of the three files must actually import the component it renders.
  for (const file of [FEED, GROUP, PROFILE]) {
    assert.match(readMobile(file), /import\s+BotBadge(?:\s*,\s*\{[^}]*\})?\s+from\s+'\.\.\/components\/BotBadge'/, `${file} does not import BotBadge`);
  }
});

// ── A-01a ───────────────────────────────────────────────────────────────────
test('feed_card_name_is_wrapped_in_a_userNameRow', () => {
  const code = readMobile(FEED);
  const ast = parseJS(code);

  // The style exists and is shared, not invented for this one card.
  const rowKeys = findAll(ast, (n) => n.type === 'ObjectProperty'
    && n.key.type === 'Identifier' && n.key.name === 'userNameRow');
  assert.equal(rowKeys.length, 1, 'FeedScreen.js must declare exactly one userNameRow style');
  const refs = code.match(/styles\.userNameRow(?![A-Za-z0-9_$])/g) || [];
  assert.ok(refs.length >= 2, `styles.userNameRow referenced ${refs.length} time(s), expected >= 2`);

  // The feed card's name now sits in a userNameRow View, and the badge is its
  // sibling. Before this change the name lived directly in a bare
  // <View style={{ flex: 1 }}> with no room beside it.
  const hits = anchorsIn(code, 'userName', null, ast);
  assert.equal(hits.length, 1, 'expected exactly one styles.userName <Text> in FeedScreen.js');
  const row = hits[0].parent;
  assert.equal(row && row.type, 'JSXElement', 'the feed-card name has no JSX parent element');
  assert.equal(jsxName(row), 'View', 'the feed-card name must be wrapped in a View');
  const rowStyle = jsxAttr(row, 'style');
  assert.ok(rowStyle, 'the wrapping View has no style');
  assert.match(code.slice(rowStyle.start, rowStyle.end), /styles\.userNameRow(?![A-Za-z0-9_$])/,
    'the View wrapping the feed-card name is not styles.userNameRow');
  assert.equal(badgeSiblings(hits[0]).length, 1, 'the badge is not a sibling of the feed-card name inside the userNameRow');

  // ...and that row is still inside the bare flex:1 column of the post header.
  let column = null;
  walk(ast, (node) => {
    if (node.type !== 'JSXElement' || jsxName(node) !== 'View') return;
    const a = jsxAttr(node, 'style');
    if (!a || !/\{\s*flex:\s*1\s*\}/.test(code.slice(a.start, a.end))) return;
    if ((node.children || []).includes(row)) column = node;
  });
  assert.ok(column, 'the userNameRow is not inside the post header\'s <View style={{ flex: 1 }}>');
});

// ── A-02 ────────────────────────────────────────────────────────────────────
// A note's text is the author's, and no screen may reshape it before rendering.
//
// This case was written for R-05a, which required a trailing "— automated post from
// @handle" line in note.text and would have been defeated by a screen that trimmed it.
// R-05a is WITHDRAWN (PM decision, 2026-09-29) and the line is gone — but the rule this
// case actually enforces never depended on it: a reader's post must reach the screen
// verbatim, not silently truncated, reflowed or stripped. The detectors below are
// unchanged; only the reason for keeping them is restated. (The regexes in the
// detector-proof block are synthetic strings, not the withdrawn label.)
const NOTE_TEXT_FILES = [FEED, GROUP, PROFILE];
const NOTE_TEXT_SITE_COUNT = 3;

function isNoteTextMember(node) {
  return !!node && node.type === 'MemberExpression' && !node.computed
    && node.property.type === 'Identifier' && node.property.name === 'text'
    && node.object.type === 'Identifier' && (node.object.name === 'post' || node.object.name === 'note');
}

function verbatimTextSites(code) {
  const ast = parseJS(code);
  const out = [];
  walk(ast, (node) => {
    if (node.type !== 'JSXElement' || jsxName(node) !== 'Text') return;
    const kids = (node.children || []).filter((c) => !(c.type === 'JSXText' && c.value.trim() === ''));
    if (kids.length !== 1) return;
    const kid = kids[0];
    if (kid.type !== 'JSXExpressionContainer') return;
    if (!isNoteTextMember(kid.expression)) return;
    out.push(node);
  });
  return out;
}

// Any call that reshapes a note's text: post.text.replace(...), note.text.slice(...),
// post.text.trim().split(...), trimTrailingLine(post.text), ...
function noteTextTransforms(code) {
  const ast = parseJS(code);
  return findAll(ast, (n) => n.type === 'CallExpression'
    && ((n.callee.type === 'MemberExpression' && isNoteTextMember(n.callee.object))
      || (n.arguments || []).some(isNoteTextMember)));
}

test('post_text_is_rendered_verbatim', () => {
  // Detector proof, both directions (rule 3).
  assert.equal(verbatimTextSites('const A = () => <Text style={s.noteText}>{post.text}</Text>;').length, 1);
  assert.equal(verbatimTextSites('const A = () => <Text style={s.noteText}>{post.text.replace(/—.*$/, \'\')}</Text>;').length, 0);
  assert.equal(noteTextTransforms('const A = () => <Text>{post.text.replace(/—.*$/, \'\')}</Text>;').length, 1);
  assert.equal(noteTextTransforms('const A = () => <Text>{post.text}</Text>;').length, 0);

  // Inventory first (rule 4).
  let found = 0;
  const perFile = [];
  for (const file of NOTE_TEXT_FILES) {
    const n = verbatimTextSites(readMobile(file)).length;
    perFile.push(`${file}=${n}`);
    found += n;
  }
  assert.equal(found, NOTE_TEXT_SITE_COUNT, `expected ${NOTE_TEXT_SITE_COUNT} verbatim note-text render sites, found ${found} (${perFile.join(', ')})`);

  // And nothing anywhere in those three screens reshapes a note's text.
  for (const file of NOTE_TEXT_FILES) {
    const code = readMobile(file);
    const hits = noteTextTransforms(code).map((n) => code.slice(n.start, Math.min(n.end, n.start + 80)));
    assert.equal(hits.length, 0, `${file} transforms a note's text: ${hits.join(' | ')}`);
  }
});

// ── A-03 ────────────────────────────────────────────────────────────────────
test('badge_reuses_the_existing_pill_styles', () => {
  // Control: the pill this badge claims to reuse must still be FeedScreen's.
  const feedAst = parseMobileFile(FEED);
  const feedKeys = new Set(findAll(feedAst, (n) => n.type === 'ObjectProperty' && n.key.type === 'Identifier').map((n) => n.key.name));
  for (const key of ['userBadge', 'userBadgeText']) {
    assert.ok(feedKeys.has(key), `${FEED} no longer has a ${key} style key — this test is comparing against nothing`);
  }

  const code = readMobile(BADGE);
  const ast = parseJS(code);
  const creates = findAll(ast, (n) => n.type === 'CallExpression'
    && n.callee.type === 'MemberExpression'
    && n.callee.object.type === 'Identifier' && n.callee.object.name === 'StyleSheet'
    && n.callee.property.type === 'Identifier' && n.callee.property.name === 'create');
  assert.equal(creates.length, 0, 'BotBadge.js must not declare a StyleSheet of its own — it reuses the Mutual pill');

  // The rendered pill is styled by those two names, not by something invented.
  const views = findAll(ast, (n) => n.type === 'JSXElement' && jsxName(n) === 'View');
  const texts = findAll(ast, (n) => n.type === 'JSXElement' && jsxName(n) === 'Text');
  assert.equal(views.length, 1, 'BotBadge renders exactly one View');
  assert.equal(texts.length, 1, 'BotBadge renders exactly one Text');
  const viewStyle = jsxAttr(views[0], 'style');
  const textStyle = jsxAttr(texts[0], 'style');
  assert.ok(viewStyle && /\buserBadge(?![A-Za-z0-9_$])/.test(code.slice(viewStyle.start, viewStyle.end)), 'the badge View is not styled with userBadge');
  assert.ok(textStyle && /\buserBadgeText\b/.test(code.slice(textStyle.start, textStyle.end)), 'the badge Text is not styled with userBadgeText');

  // Falsy is_bot renders nothing at all, so a reader's card gains no whitespace.
  assert.match(code, /if\s*\(\s*!\s*isBot\s*\)\s*return\s+null/, 'BotBadge must return null when the author is not a bot');
});

// ── A-04 ────────────────────────────────────────────────────────────────────
test('group_avatar_takes_an_isBot_prop', () => {
  const code = readMobile(GROUP);
  const ast = parseJS(code);

  const avatars = findAll(ast, (n) => n.type === 'FunctionDeclaration' && n.id && n.id.name === 'Avatar');
  assert.equal(avatars.length, 1, 'expected exactly one local Avatar function declaration in GroupDetailScreen.js');
  const param = avatars[0].params[0];
  assert.equal(param && param.type, 'ObjectPattern', 'Avatar must still destructure its props');
  const names = param.properties
    .filter((p) => p.type === 'ObjectProperty' && p.key.type === 'Identifier')
    .map((p) => p.key.name);
  assert.deepEqual(names, ['name', 'size', 'isBot'], `Avatar's param list is ${JSON.stringify(names)}`);

  // The group post header passes it. Located by the name it renders, not by line.
  const calls = findAll(ast, (n) => n.type === 'JSXElement' && jsxName(n) === 'Avatar')
    .filter((n) => {
      const a = jsxAttr(n, 'name');
      return a && /post\.user\?\.name/.test(code.slice(a.start, a.end));
    });
  assert.equal(calls.length, 1, 'expected exactly one <Avatar name={post.user?.name} ...> in GroupDetailScreen.js');
  const isBotAttr = jsxAttr(calls[0], 'isBot');
  assert.ok(isBotAttr, 'the group post <Avatar> does not pass isBot');
  assert.match(code.slice(isBotAttr.start, isBotAttr.end), /post\.user\?\.is_bot/, 'the group post <Avatar> passes the wrong isBot value');
});

// ── A-05 ────────────────────────────────────────────────────────────────────
test('app_json_is_2_2_4_63', () => {
  const appJson = JSON.parse(readMobile('app.json'));
  assert.equal(appJson.expo.version, '2.2.4');
  assert.equal(appJson.expo.android.versionCode, 63);
});

// ── A-06 ────────────────────────────────────────────────────────────────────
// The defence against the "imported a symbol that does not exist" defect:
// every BotBadge import must resolve to a real file with a real default export,
// and the committed tree must still pass the strict version guard at 2.2.4/63.
test('versionGuard_and_apiContract_still_green', () => {
  const importers = [];
  for (const rel of listMobileFiles('src')) {
    const code = readMobile(rel);
    const m = code.match(/from\s+'([^']*\/BotBadge)'/);
    if (!m) continue;
    const target = path.join(path.dirname(rel), m[1]).split(path.sep).join('/');
    const resolved = [target, `${target}.js`, `${target}/index.js`]
      .find((c) => fs.existsSync(path.join(MOBILE_ROOT, c)) && fs.statSync(path.join(MOBILE_ROOT, c)).isFile());
    assert.ok(resolved, `${rel}: cannot resolve import '${m[1]}'`);
    const targetAst = parseMobileFile(resolved);
    assert.ok(
      targetAst.program.body.some((n) => n.type === 'ExportDefaultDeclaration'),
      `${resolved} has no default export, but ${rel} imports one`,
    );
    importers.push(rel);
  }
  assert.deepEqual(importers.sort(), [FEED, GROUP, PROFILE].sort(), 'the set of screens importing BotBadge changed');

  const r = spawnSync(process.execPath, ['scripts/check-version-bump.js', '--strict'], { cwd: MOBILE_ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /versionCode=63/);
});
