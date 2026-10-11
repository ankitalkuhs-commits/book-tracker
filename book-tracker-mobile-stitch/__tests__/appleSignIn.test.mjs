// Sprint 4G package P4 (tests.md §5, cases A-01..A-13).
//
// There is no device and no simulator here, so every case is an assertion over
// the committed source using the shared helpers in _ast.mjs — the pattern
// botBadge.test.mjs established for 4F's P4.
//
// Three defects this project has already paid for shape how these are written:
//   * a walk that inspected the wrong call and asserted nothing — so every walk
//     below counts its sites against a literal BEFORE asserting anything about
//     their contents, and three of them also run their detector against a
//     synthetic negative in the same test;
//   * a test file that imported a missing symbol, failed to LOAD, and silently
//     dropped its assertions — so the module-scope guard below asserts every
//     helper and every file this suite depends on;
//   * a geometry claim compared against a literal nobody could defend — so the
//     Apple button's height is RECOMPUTED here from theme.js and from
//     googleBtn's own padding/border (tests.md rule 12), never typed.
//
// Scope note, and it is a deviation from tests.md worth reading: pm-decisions
// E-6 makes iOS **Apple-only**, and the addendum's Q-2 drops the
// "both buttons above the fold" requirement with it. So the Apple and Google
// buttons are never on screen together: Apple renders when
// isAvailableAsync() is true, Google when it is false. A-02's order/size
// assertions are therefore about SOURCE shape (which still catches every
// mutation tests.md names for it), and A-02b is new: it is the assertion that
// the two renders are mutually exclusive, i.e. that there is no Google button
// on iOS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  MOBILE_ROOT, REPO_ROOT, parseJS, parseMobileFile, readMobile, walk, findAll,
  existsInMobile,
} from './_ast.mjs';

// ── Import guard (tests.md non-vacuity rule 5 / K-07) ───────────────────────
for (const [name, fn] of Object.entries({ parseJS, parseMobileFile, readMobile, walk, findAll, existsInMobile })) {
  assert.equal(typeof fn, 'function', `_ast.mjs does not export ${name}`);
}
assert.equal(typeof MOBILE_ROOT, 'string');
assert.equal(typeof REPO_ROOT, 'string');

const LOGIN = 'src/screens/LoginScreen.js';
const API = 'src/services/api.js';
const THEME = 'src/theme.js';
const LOCALES_DIR = path.join(MOBILE_ROOT, 'src', 'i18n', 'locales');
const LOCALE_CODES = ['en', 'de', 'es', 'fr', 'pt', 'ru'];

// The base this package was cut from — the same SHA tests.md names.
const BASE = '5fc8ccc';

for (const rel of [LOGIN, API, THEME]) {
  assert.ok(existsInMobile(rel), `${rel} does not exist`);
}
assert.match(readMobile(LOGIN), /from ['"]expo-apple-authentication['"]/, 'P4 is not built');
assert.match(readMobile(LOGIN), /from ['"]expo-crypto['"]/, 'P4 is not built: no expo-crypto');

const loginSrc = readMobile(LOGIN);
const loginAst = parseJS(loginSrc);
const apiSrc = readMobile(API);
const apiAst = parseJS(apiSrc);

// ── Shared helpers ──────────────────────────────────────────────────────────

// Handles both <Foo/> and <Ns.Foo/>: the namespace import style
// expo-apple-authentication documents means the Apple button's tag is a
// JSXMemberExpression, and a jsxName that only read JSXIdentifier would find
// nothing and assert nothing — which is the vacuous-walk defect.
function jsxName(el) {
  const n = el.openingElement && el.openingElement.name;
  if (!n) return null;
  if (n.type === 'JSXIdentifier') return n.name;
  if (n.type === 'JSXMemberExpression' && n.property.type === 'JSXIdentifier') return n.property.name;
  return null;
}

function src(code, node) {
  return code.slice(node.start, node.end);
}

// Every text scan below runs against the source with its COMMENTS BLANKED OUT,
// at the same byte offsets. Measured, not predicted: the first run of this file
// went red three times over because `doesNotMatch(/Platform\.OS/)` and
// `doesNotMatch(/Math\.random/)` matched the comments that explain why neither
// is used. A detector that cannot tell code from prose is a detector that
// reports defects nobody wrote.
function stripComments(code, ast) {
  const out = code.split('');
  for (const c of (ast.comments || [])) {
    for (let i = c.start; i < c.end; i++) {
      if (out[i] !== '\n' && out[i] !== '\r') out[i] = ' ';
    }
  }
  return out.join('');
}

// `b.toString(16)` contains the substring `String(`, so the "never stringify
// the name" scan needs a left-hand boundary or it reports the hex encoder.
const STRINGIFY = /(?<![.\w])String\(/;

// Parent map, built once per AST: the walk in _ast.mjs hands the immediate
// parent to the visitor, which is enough to climb an ancestor chain.
function parentsOf(ast) {
  const parents = new Map();
  walk(ast, (node, parent) => { if (parent) parents.set(node, parent); });
  return parents;
}
const loginParents = parentsOf(loginAst);
const loginCode = stripComments(loginSrc, loginAst);
const apiCode = stripComments(apiSrc, apiAst);

function ancestors(node, parents) {
  const chain = [];
  let cur = parents.get(node);
  while (cur) { chain.push(cur); cur = parents.get(cur); }
  return chain;
}

// The nearest ancestor that is a real element, skipping the expression
// containers, logical expressions and fragments a conditional render adds.
function nearestElementAncestor(node, parents) {
  return ancestors(node, parents).find((a) => a.type === 'JSXElement') || null;
}

function jsxElementsNamed(ast, name) {
  return findAll(ast, (n) => n.type === 'JSXElement' && jsxName(n) === name);
}

// `styles.googleBtn` must not match `styles.googleBtnText` — 4F's lesson.
function styleRe(key) {
  return new RegExp(`styles\\.${key}(?![A-Za-z0-9_$])`);
}

function jsxAttr(el, name) {
  return (el.openingElement.attributes || []).find(
    (a) => a.type === 'JSXAttribute' && a.name.type === 'JSXIdentifier' && a.name.name === name,
  );
}

// The StyleSheet.create({...}) argument in LoginScreen.js.
function styleSheetObject(ast) {
  const calls = findAll(ast, (n) => n.type === 'CallExpression'
    && n.callee.type === 'MemberExpression'
    && n.callee.object.type === 'Identifier' && n.callee.object.name === 'StyleSheet'
    && n.callee.property.type === 'Identifier' && n.callee.property.name === 'create');
  assert.equal(calls.length, 1, 'expected exactly one StyleSheet.create in LoginScreen.js');
  const arg = calls[0].arguments[0];
  assert.equal(arg.type, 'ObjectExpression', 'StyleSheet.create was not given an object literal');
  return arg;
}

function objProp(objectExpr, name) {
  return (objectExpr.properties || []).find((p) => p.type === 'ObjectProperty'
    && ((p.key.type === 'Identifier' && p.key.name === name)
      || (p.key.type === 'StringLiteral' && p.key.value === name)));
}

function styleEntry(objectExpr, name) {
  const p = objProp(objectExpr, name);
  assert.ok(p, `styles.${name} is not declared`);
  assert.equal(p.value.type, 'ObjectExpression', `styles.${name} is not an object literal`);
  return p.value;
}

// Module-scope `const X = <number>` declarations, so a style value written as a
// named constant still resolves to a number.
function moduleNumbers(ast) {
  const out = new Map();
  for (const node of ast.program.body) {
    if (node.type !== 'VariableDeclaration') continue;
    for (const d of node.declarations) {
      if (d.id.type === 'Identifier' && d.init && d.init.type === 'NumericLiteral') out.set(d.id.name, d.init.value);
    }
  }
  return out;
}
const loginNumbers = moduleNumbers(loginAst);

function numberOf(node, what) {
  if (node.type === 'NumericLiteral') return node.value;
  if (node.type === 'Identifier') {
    assert.ok(loginNumbers.has(node.name), `${what}: ${node.name} is not a module-scope numeric constant`);
    return loginNumbers.get(node.name);
  }
  if (node.type === 'BinaryExpression') {
    const l = numberOf(node.left, what);
    const r = numberOf(node.right, what);
    if (node.operator === '/') return l / r;
    if (node.operator === '*') return l * r;
    if (node.operator === '+') return l + r;
    if (node.operator === '-') return l - r;
  }
  assert.fail(`${what}: cannot resolve ${node.type} to a number`);
}

function styleNumber(styleObj, prop, label) {
  const p = objProp(styleObj, prop);
  assert.ok(p, `${label} does not declare ${prop}`);
  return numberOf(p.value, `${label}.${prop}`);
}

// A named export object in theme.js, read from source so that A-02's
// expectation moves when the design tokens move.
function themeObject(name) {
  const ast = parseMobileFile(THEME);
  const decls = findAll(ast, (n) => n.type === 'VariableDeclarator'
    && n.id.type === 'Identifier' && n.id.name === name && n.init && n.init.type === 'ObjectExpression');
  assert.equal(decls.length, 1, `expected exactly one \`${name}\` object in theme.js`);
  return decls[0].init;
}

function themeTypeField(group, field) {
  const g = objProp(themeObject('type'), group);
  assert.ok(g && g.value.type === 'ObjectExpression', `theme.js type.${group} is missing`);
  const f = objProp(g.value, field);
  assert.ok(f && f.value.type === 'NumericLiteral', `theme.js type.${group}.${field} is not a number`);
  return f.value.value;
}

// `radius.full` and friends, so the Google pill's radius is a number this test
// resolved rather than a token name it trusted.
function themeRadius(field) {
  const f = objProp(themeObject('radius'), field);
  assert.ok(f && f.value.type === 'NumericLiteral', `theme.js radius.${field} is not a number`);
  return f.value.value;
}

function git(args) {
  const r = spawnSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, `git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout;
}

// core.autocrlf is on for this repo on Windows, so the working tree is CRLF
// while git's object store is LF. A byte comparison between the two would be
// false for reasons that have nothing to do with anybody's edit, so both sides
// are normalised and the comparison is about CONTENT.
const lf = (s) => s.replace(/\r\n/g, '\n');

// A slice located by its content anchors, never by line number.
function sliceBetween(text, startAnchor, endAnchor, label) {
  const a = text.indexOf(startAnchor);
  assert.notEqual(a, -1, `${label}: start anchor not found: ${startAnchor}`);
  const b = text.indexOf(endAnchor, a);
  assert.notEqual(b, -1, `${label}: end anchor not found: ${endAnchor}`);
  return text.slice(a, b + endAnchor.length);
}

function loadLocale(code) {
  return JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, `${code}.json`), 'utf8'));
}

function getDotted(obj, dotted) {
  return dotted.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}

function placeholders(str) {
  return [...String(str).matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).sort();
}

// ── The copy this package ships (A-12 pins the length first) ────────────────
const APPLE_KEYS = [
  'auth.appleNoticeBeforeTap',
  'auth.appleNewAccountTitle',
  'auth.appleNewAccountBody',
  'auth.appleNewAccountRelayBody',
];

// ── The availability gate, derived from source, never assumed ───────────────
// Returns { stateVar, setter, availabilityCall } — the useState pair whose
// setter is fed by AppleAuthentication.isAvailableAsync().
function availabilityGate() {
  const calls = findAll(loginAst, (n) => n.type === 'CallExpression'
    && /^AppleAuthentication\.isAvailableAsync$/.test(src(loginSrc, n.callee)));
  assert.equal(calls.length, 1, 'expected exactly one AppleAuthentication.isAvailableAsync() call');
  const call = calls[0];

  // The whole statement the call sits in, so `.then(setX, ...)` and
  // `setX(await ...)` are both covered.
  const stmt = ancestors(call, loginParents).find((a) => a.type === 'ExpressionStatement');
  assert.ok(stmt, 'the isAvailableAsync() call is not inside a statement');
  const stmtSrc = src(loginSrc, stmt);

  const pairs = findAll(loginAst, (n) => n.type === 'VariableDeclarator'
    && n.id.type === 'ArrayPattern' && n.id.elements.length === 2
    && n.init && n.init.type === 'CallExpression'
    && n.init.callee.type === 'Identifier' && n.init.callee.name === 'useState')
    .map((d) => ({ stateVar: d.id.elements[0].name, setter: d.id.elements[1].name }));
  assert.ok(pairs.length >= 2, `expected at least two useState pairs, found ${pairs.length}`);

  const fed = pairs.filter((p) => new RegExp(`\\b${p.setter}\\b`).test(stmtSrc));
  assert.equal(fed.length, 1,
    `expected exactly one useState setter fed by isAvailableAsync(); found ${fed.length} in: ${stmtSrc}`);

  // The effect it must live in is the existing one, not a new effect.
  const effect = ancestors(call, loginParents).find((a) => a.type === 'CallExpression'
    && a.callee.type === 'Identifier' && a.callee.name === 'useEffect');
  assert.ok(effect, 'the isAvailableAsync() call is not inside a useEffect');
  assert.match(src(loginSrc, effect), /GoogleSignin\.configure/,
    'isAvailableAsync() was put in a NEW useEffect instead of the existing one');

  return { ...fed[0], call };
}

// The guard a conditionally rendered element sits behind: the LogicalExpression
// of `{cond && <El/>}`, found by climbing out of any fragment.
function guardOf(el, label) {
  const logical = ancestors(el, loginParents).find((a) => a.type === 'LogicalExpression');
  assert.ok(logical, `${label} is not behind a \`cond && ...\` guard`);
  return logical;
}

function appleButton() {
  const els = jsxElementsNamed(loginAst, 'AppleAuthenticationButton');
  assert.equal(els.length, 1, `expected exactly one <AppleAuthenticationButton>, found ${els.length}`);
  return els[0];
}

function googleButton() {
  const els = jsxElementsNamed(loginAst, 'TouchableOpacity')
    .filter((n) => styleRe('googleBtn').test(src(loginSrc, n.openingElement)));
  assert.equal(els.length, 1, `expected exactly one <TouchableOpacity style={styles.googleBtn}>, found ${els.length}`);
  return els[0];
}

// The named function declared as `const <name> = async () => {...}`.
function arrowFunction(ast, code, name) {
  const decls = findAll(ast, (n) => n.type === 'VariableDeclarator'
    && n.id.type === 'Identifier' && n.id.name === name
    && n.init && (n.init.type === 'ArrowFunctionExpression' || n.init.type === 'FunctionExpression'));
  assert.equal(decls.length, 1, `expected exactly one ${name} function, found ${decls.length}`);
  return decls[0].init;
}

// ── A-01 ────────────────────────────────────────────────────────────────────
test('availability_false_renders_one_button', () => {
  const { stateVar } = availabilityGate();
  const apple = appleButton();
  const google = googleButton();

  const appleGuard = guardOf(apple, 'the Apple button');
  assert.equal(appleGuard.operator, '&&');
  assert.equal(src(loginSrc, appleGuard.left), stateVar,
    `the Apple button is not gated on ${stateVar}`);

  const googleGuard = guardOf(google, 'the Google button');
  assert.equal(googleGuard.operator, '&&');
  assert.equal(src(loginSrc, googleGuard.left), `!${stateVar}`,
    `the Google button is not gated on !${stateVar}`);

  // Rule 11: the RENDER gate must be the capability, not the platform.
  // isAvailableAsync() is false on Android AND on an iOS build where the sheet
  // would not work, so it is the only check that can never render a dead button.
  //
  // This used to ban `Platform.OS` from the file outright. That was wider than the rule it
  // enforces, and on 2026-10-11 it blocked a legitimate use: iOS does not link the Google
  // native module at all (react-native.config.js), so `GoogleSignin.configure()` in the mount
  // effect must not run there — calling an unlinked module throws. The two assertions above
  // already pin both render gates by AST, so the ban is narrowed to what it actually means:
  // Platform.OS may not decide what is rendered.
  const platformRefs = findAll(loginAst, (n) => n.type === 'MemberExpression'
    && n.object && n.object.name === 'Platform' && n.property && n.property.name === 'OS');
  const jsxContainers = findAll(loginAst, (n) => n.type === 'JSXExpressionContainer');
  const insideJsx = platformRefs.filter(
    (n) => jsxContainers.some((c) => c.start <= n.start && n.end <= c.end));
  assert.deepEqual(insideJsx.map((n) => src(loginSrc, n)), [],
    'Platform.OS decides what is rendered — the gate must be the capability');

  // There are exactly two legitimate uses, and both must be present. Counting alone is not
  // enough: an earlier version said "at most one" and passed when the guard was deleted
  // outright, which is the failure that matters.
  //
  //   1. the conditional require of google-signin  — without it iOS CRASHES ON LAUNCH,
  //      because the package calls TurboModuleRegistry.getEnforcing at module scope (A-14)
  //   2. the guard around GoogleSignin.configure() — without it iOS calls a null module
  const requireGuard = findAll(loginAst, (n) => n.type === 'ConditionalExpression'
    && src(loginSrc, n.test).includes('Platform.OS')
    && /google-signin/.test(src(loginSrc, n)));
  assert.equal(requireGuard.length, 1,
    'the google-signin require is not behind a Platform.OS conditional — iOS would crash on launch');

  const configureGuard = findAll(loginAst, (n) => n.type === 'IfStatement'
    && src(loginSrc, n.test).includes('Platform.OS')
    && src(loginSrc, n.consequent).includes('GoogleSignin.configure'));
  assert.equal(configureGuard.length, 1,
    'GoogleSignin.configure() is not behind a Platform.OS guard');

  // Nothing else may use it, so a third one cannot drift in unnoticed.
  assert.equal(platformRefs.length, 2,
    `expected exactly two Platform.OS references (the require guard and the configure `
    + `guard), found ${platformRefs.length}`);

  // Control (rule 3): the same detector on a synthetic Platform.OS gate must
  // find a left-hand side that is NOT the state variable.
  const synthetic = parseJS(`
    const C = () => {
      const [appleAvailable, setAppleAvailable] = React.useState(false);
      return <View>{Platform.OS === 'ios' && <AppleAuthentication.AppleAuthenticationButton />}</View>;
    };
  `);
  const synLogical = findAll(synthetic, (n) => n.type === 'LogicalExpression');
  assert.equal(synLogical.length, 1, 'the synthetic negative did not parse as expected');
  assert.notEqual(synLogical[0].left.type, 'Identifier',
    'the detector would accept a Platform.OS gate — it cannot fail, so it proves nothing');
});

// ── A-02 (tests.md K-03, rule 12) ───────────────────────────────────────────
test('apple_button_is_first_and_the_same_size', () => {
  const apple = appleButton();
  const google = googleButton();

  // (a) same parent element, Apple first in source order.
  const appleParent = nearestElementAncestor(apple, loginParents);
  const googleParent = nearestElementAncestor(google, loginParents);
  assert.ok(appleParent && googleParent, 'could not find an element ancestor for both buttons');
  assert.equal(appleParent, googleParent, 'the two buttons do not share a parent element');
  assert.equal(jsxName(appleParent), 'ScrollView');
  assert.ok(apple.start < google.start,
    `the Apple button is not first: apple at ${apple.start}, google at ${google.start}`);

  const styleObj = styleSheetObject(loginAst);
  const appleBtn = styleEntry(styleObj, 'appleBtn');
  const googleBtn = styleEntry(styleObj, 'googleBtn');

  // (b) full width. The Google pill is a block child of a padded container, so
  //     the assertion on it is that it declares no competing width.
  const appleWidth = objProp(appleBtn, 'width');
  assert.ok(appleWidth && appleWidth.value.type === 'StringLiteral', 'appleBtn declares no literal width');
  assert.equal(appleWidth.value.value, '100%');
  const googleWidth = objProp(googleBtn, 'width');
  assert.ok(!googleWidth || (googleWidth.value.type === 'StringLiteral' && googleWidth.value.value === '100%'),
    'googleBtn sets an explicit width other than 100%, so A-02(b) no longer compares like with like');

  // (c) the same corner. This is a DEVIATION from tests.md's wording and the
  //     reason is in expo-apple-authentication's own documentation: style
  //     `borderRadius` and `backgroundColor` are ignored on this native view and
  //     setting them is against the App Store guidelines. The corner is the
  //     `cornerRadius` PROP, asserted below in (d2); here we assert the
  //     prohibition, and that the Google button really is a pill — i.e. that its
  //     radius exceeds half its height, so that half-the-height on the Apple side
  //     renders the same shape. Change googleBtn to a smaller token and this
  //     goes red, which is the re-derivation prompt.
  assert.ok(!objProp(appleBtn, 'borderRadius'),
    'appleBtn sets borderRadius, which expo-apple-authentication ignores and the App Store guidelines forbid');
  assert.ok(!objProp(appleBtn, 'backgroundColor'),
    'appleBtn sets backgroundColor — use the buttonStyle prop');
  const googleRadius = objProp(googleBtn, 'borderRadius');
  assert.ok(googleRadius, 'googleBtn declares no borderRadius');
  assert.equal(src(loginSrc, googleRadius.value), 'radius.full',
    'the Google button no longer uses the pill token — re-derive the Apple cornerRadius deliberately');

  // (d) the height, RECOMPUTED from the product's own tokens. googleBtn
  //     declares no height — its rendered height is lineHeight + 2*padding +
  //     2*border — and AppleAuthenticationButton is a native view with no
  //     intrinsic size, so it needs that number explicitly.
  assert.ok(!objProp(googleBtn, 'height'),
    'googleBtn now declares an explicit height — re-derive this expectation deliberately');
  const lineHeight = themeTypeField('title', 'lineHeight');
  const padding = styleNumber(googleBtn, 'paddingVertical', 'googleBtn');
  const border = styleNumber(googleBtn, 'borderWidth', 'googleBtn');
  const expected = lineHeight + (2 * padding) + (2 * border);
  assert.equal(styleNumber(appleBtn, 'height', 'appleBtn'), expected,
    `appleBtn.height must equal theme type.title.lineHeight (${lineHeight}) + 2*googleBtn.paddingVertical (${padding}) + 2*googleBtn.borderWidth (${border})`);

  // (d2) Apple's native view sets layer.cornerRadius from the prop verbatim, so
  //      the prop gets the pill's arithmetic equivalent rather than the
  //      radius.full sentinel React Native would clamp for us.
  const cornerRadius = jsxAttr(apple, 'cornerRadius');
  assert.ok(cornerRadius, 'the Apple button passes no cornerRadius prop');
  assert.equal(cornerRadius.value.type, 'JSXExpressionContainer');
  assert.equal(numberOf(cornerRadius.value.expression, 'cornerRadius'), expected / 2);
  assert.ok(themeRadius('full') >= expected / 2,
    `radius.full (${themeRadius('full')}) no longer clamps to a pill at ${expected}pt — the two corners are not the same shape`);

  // The button must be Apple's own component with Apple's own styles, not a
  // look-alike: Guideline 4.8 and the HIG both require the real control.
  const buttonType = jsxAttr(apple, 'buttonType');
  const buttonStyle = jsxAttr(apple, 'buttonStyle');
  assert.ok(buttonType && /AppleAuthenticationButtonType\./.test(src(loginSrc, buttonType)), 'no buttonType');
  assert.ok(buttonStyle && /AppleAuthenticationButtonStyle\./.test(src(loginSrc, buttonStyle)), 'no buttonStyle');

  // (e) the same gap below.
  assert.equal(styleNumber(appleBtn, 'marginBottom', 'appleBtn'),
    styleNumber(googleBtn, 'marginBottom', 'googleBtn'));

  // (f) while the request is in flight the reader gets feedback, and it occupies the
  //     SAME footprint so nothing on the screen jumps. The native button accepts no
  //     `disabled` prop and ignores styling, so the only honest way to do this is the
  //     Google button's own idiom — swap the control for a spinner. That also removes
  //     the button from the screen, which is the re-entrancy guard `disabled={loading}`
  //     gives the Google side.
  const swap = ancestors(apple, loginParents).find((a) => a.type === 'ConditionalExpression');
  assert.ok(swap, 'the Apple button is not swapped for anything while loading — a reader gets no feedback');
  assert.match(src(loginSrc, swap.test), /^loading$/, `the swap is conditioned on ${src(loginSrc, swap.test)}, not loading`);
  const spinners = findAll(swap.consequent, (n) => n.type === 'JSXElement' && jsxName(n) === 'ActivityIndicator');
  assert.equal(spinners.length, 1, `expected exactly one ActivityIndicator while loading, found ${spinners.length}`);
  const standIns = findAll(swap.consequent, (n) => n.type === 'JSXElement' && jsxName(n) === 'View')
    .filter((n) => /styles\.apple\w*/.test(src(loginSrc, n.openingElement)));
  assert.equal(standIns.length, 1, 'the spinner has no appleBtn-sized container');
  const standInStyle = /styles\.(apple\w*)/.exec(src(loginSrc, standIns[0].openingElement))[1];
  const standIn = styleEntry(styleObj, standInStyle);
  assert.equal(styleNumber(standIn, 'height', standInStyle), expected,
    'the in-flight stand-in is a different height from the button it replaces — the layout would jump');
  assert.equal(styleNumber(standIn, 'marginBottom', standInStyle),
    styleNumber(appleBtn, 'marginBottom', 'appleBtn'));

  // The Apple button must actually be wired to its own handler.
  const onPress = jsxAttr(apple, 'onPress');
  assert.ok(onPress, 'the Apple button has no onPress');
  assert.equal(src(loginSrc, onPress.value.expression), 'handleAppleSignIn');
});

// ── A-02a ───────────────────────────────────────────────────────────────────
test('the_google_block_is_byte_identical_to_the_base', () => {
  const base = lf(git(['show', `${BASE}:book-tracker-mobile-stitch/${LOGIN}`]));
  const head = lf(loginSrc);
  assert.ok(base.length > 0, 'the base revision of LoginScreen.js came back empty');

  const START = '{/* Google sign-in */}';
  const END = '</TouchableOpacity>';
  const baseSlice = sliceBetween(base, START, END, 'base');
  const headSlice = sliceBetween(head, START, END, 'head');
  assert.ok(baseSlice.includes('styles.googleBtn'), 'the anchors did not select the Google block in the base');
  assert.equal(headSlice, baseSlice, 'the Google sign-in block has been edited');

  // R-09: handleSignIn is a sibling of handleAppleSignIn, not a thing that was
  // rewritten. This is also A-11's control: the new-account message is
  // Apple-only, which is only provable if the Google handler did not change.
  const HS_START = 'const handleSignIn = async () => {';
  const HS_END = '\n  };';
  assert.equal(sliceBetween(head, HS_START, HS_END, 'head handleSignIn'),
    sliceBetween(base, HS_START, HS_END, 'base handleSignIn'),
    'handleSignIn has been edited');
});

// ── A-02b (pm-decisions E-6 — new in this package) ──────────────────────────
test('ios_is_apple_only_the_two_buttons_are_mutually_exclusive', () => {
  const { stateVar } = availabilityGate();
  const appleGuard = guardOf(appleButton(), 'the Apple button');
  const googleGuard = guardOf(googleButton(), 'the Google button');

  // Exactly one sign-in button can ever be on screen: there is no iOS Google
  // client (E-6), so a Google button where Apple is available would be dead.
  assert.equal(src(loginSrc, appleGuard.left), stateVar);
  assert.equal(googleGuard.left.type, 'UnaryExpression');
  assert.equal(googleGuard.left.operator, '!');
  assert.equal(src(loginSrc, googleGuard.left.argument), stateVar);

  // And no third sign-in button appeared.
  assert.equal(jsxElementsNamed(loginAst, 'AppleAuthenticationButton').length, 1);
  assert.equal(
    jsxElementsNamed(loginAst, 'TouchableOpacity').filter((n) => /onPress=\{handle\w*SignIn\}/.test(src(loginSrc, n.openingElement))).length,
    1, 'more than one TouchableOpacity is wired to a sign-in handler');
});

// ── A-03 ────────────────────────────────────────────────────────────────────
test('neither_button_is_behind_a_disclosure', () => {
  const apple = appleButton();
  const google = googleButton();

  // The chain compared is the ELEMENT chain. "Nested one level deeper" is a question
  // about containers a reader has to get past, so expression containers, logical
  // guards and the loading ternary are not part of it — and if they were, A-02(f)'s
  // spinner swap would read as a disclosure, which it is not. The condition scan
  // below is what catches an actual disclosure, and MUT-4G-49 is caught there.
  const upToScrollView = (el) => {
    const chain = [];
    for (const a of ancestors(el, loginParents)) {
      if (a.type !== 'JSXElement') continue;
      chain.push(`JSXElement:${jsxName(a)}`);
      if (jsxName(a) === 'ScrollView') return chain;
    }
    assert.fail('no ScrollView ancestor');
  };
  const appleChain = upToScrollView(apple);
  const googleChain = upToScrollView(google);
  assert.ok(appleChain.length > 0 && googleChain.length > 0, 'an ancestor chain came back empty');
  assert.deepEqual(appleChain, googleChain,
    'one button is nested in a container the other is not — a button behind one more tap is not an equivalent option');
  assert.deepEqual(appleChain, ['JSXElement:ScrollView'],
    `the Apple button sits inside ${appleChain.join(' > ')} rather than directly in the ScrollView`);

  for (const [label, chain, el] of [['apple', appleChain, apple], ['google', googleChain, google]]) {
    for (const bad of ['Modal', 'Collapsible', 'Accordion']) {
      assert.ok(!chain.includes(`JSXElement:${bad}`), `${label} is inside a ${bad}`);
    }
    const conditions = ancestors(el, loginParents)
      .filter((a) => a.type === 'LogicalExpression' || a.type === 'ConditionalExpression')
      .map((a) => src(loginSrc, a.type === 'LogicalExpression' ? a.left : a.test));
    assert.ok(conditions.length > 0, `${label}: no guard condition found, so this assertion would be vacuous`);
    for (const c of conditions) {
      assert.doesNotMatch(c, /expand|showMore|showOptions|moreOptions/i, `${label} is behind a disclosure: ${c}`);
    }
  }
});

// ── A-04 ────────────────────────────────────────────────────────────────────
test('a_fresh_nonce_per_attempt_from_expo_crypto', () => {
  const handler = arrowFunction(loginAst, loginSrc, 'handleAppleSignIn');
  const handlerSrc = src(loginCode, handler);

  // The nonce is declared INSIDE the handler, so every attempt makes a new one.
  const decls = findAll(handler, (n) => n.type === 'VariableDeclarator'
    && n.id.type === 'Identifier' && n.id.name === 'nonce');
  assert.equal(decls.length, 1, `expected exactly one \`nonce\` declaration inside handleAppleSignIn, found ${decls.length}`);
  const moduleScopeNonce = loginAst.program.body.some((n) => n.type === 'VariableDeclaration'
    && n.declarations.some((d) => d.id.type === 'Identifier' && d.id.name === 'nonce'));
  assert.ok(!moduleScopeNonce, 'the nonce is declared at module scope — every attempt would reuse it');

  // Its source is expo-crypto's CSPRNG, not Math.random.
  const cryptoNs = loginAst.program.body.find((n) => n.type === 'ImportDeclaration' && n.source.value === 'expo-crypto');
  assert.ok(cryptoNs, 'expo-crypto is not imported');
  const nsName = cryptoNs.specifiers[0].local.name;
  assert.match(src(loginSrc, decls[0]), new RegExp(`\\b${nsName}\\.`), 'the nonce does not come from expo-crypto');
  assert.doesNotMatch(loginCode, /Math\.random/, 'Math.random appears in LoginScreen.js');

  // Enough of it to clear apple_keys.py's 32-character floor: 32 random bytes
  // rendered as hex is 64 characters.
  assert.match(src(loginSrc, decls[0]), /getRandomBytes(Async)?\(\s*(\d+)\s*\)/);
  const bytes = Number(/getRandomBytes(?:Async)?\(\s*(\d+)\s*\)/.exec(src(loginSrc, decls[0]))[1]);
  assert.ok(bytes >= 16, `${bytes} random bytes is not enough for a 32-character nonce`);
  assert.ok(src(loginSrc, decls[0]).includes("toString(16)"), 'the nonce bytes are not hex-encoded');
  assert.ok(bytes * 2 >= 32, `a ${bytes * 2}-character nonce is below apple_keys.py's MIN_NONCE_LENGTH of 32`);

  // The SAME binding goes to Apple and to our server: the server compares the
  // body's nonce to the token's claim byte for byte, so two different values
  // would be a 401 on every sign-in.
  const signIn = findAll(handler, (n) => n.type === 'CallExpression'
    && /\.signInAsync$/.test(src(loginSrc, n.callee)));
  assert.equal(signIn.length, 1, 'expected exactly one signInAsync call');
  const signInArg = signIn[0].arguments[0];
  assert.equal(signInArg.type, 'ObjectExpression');
  const nonceProp = objProp(signInArg, 'nonce');
  assert.ok(nonceProp, 'signInAsync is not given a nonce');
  assert.equal(src(loginSrc, nonceProp.value), 'nonce');

  const appleLogin = findAll(handler, (n) => n.type === 'CallExpression'
    && /\.appleLogin$/.test(src(loginSrc, n.callee)));
  assert.equal(appleLogin.length, 1, 'expected exactly one authAPI.appleLogin call');
  assert.ok(appleLogin[0].arguments.map((a) => src(loginSrc, a)).includes('nonce'),
    'the nonce sent to the server is not the one given to Apple');

  // requestedScopes: a reader who declines either still signs in (branches 4/5).
  assert.match(handlerSrc, /AppleAuthenticationScope\.FULL_NAME/);
  assert.match(handlerSrc, /AppleAuthenticationScope\.EMAIL/);
});

// ── A-05 ────────────────────────────────────────────────────────────────────
test('cancel_is_silent_every_other_error_alerts', () => {
  // The detector: inside a catch block, which branches test the cancel code and
  // do any of them alert?
  function cancelAlerts(ast, code, fnName) {
    const handler = arrowFunction(ast, code, fnName);
    const catches = findAll(handler, (n) => n.type === 'CatchClause');
    assert.equal(catches.length, 1, `${fnName}: expected exactly one catch clause, found ${catches.length}`);
    const ifs = findAll(catches[0], (n) => n.type === 'IfStatement'
      && /ERR_REQUEST_CANCELED/.test(code.slice(n.test.start, n.test.end)));
    assert.equal(ifs.length, 1, `${fnName}: expected exactly one ERR_REQUEST_CANCELED branch, found ${ifs.length}`);
    const violations = findAll(ifs[0].consequent, (n) => n.type === 'CallExpression'
      && /^Alert\.alert$/.test(code.slice(n.callee.start, n.callee.end))).map((n) => code.slice(n.start, n.end));
    const elseAlerts = ifs[0].alternate
      ? findAll(ifs[0].alternate, (n) => n.type === 'CallExpression'
        && /^Alert\.alert$/.test(code.slice(n.callee.start, n.callee.end)))
      : [];
    return { violations, elseAlerts };
  }

  const { violations, elseAlerts } = cancelAlerts(loginAst, loginSrc, 'handleAppleSignIn');
  assert.deepEqual(violations, [],
    'the ERR_REQUEST_CANCELED branch alerts — a reader who dismisses the sheet must not be told sign-in failed');
  assert.ok(elseAlerts.length >= 1, 'no non-cancel error path alerts the reader');

  // Control (rule 3): the same detector on a synthetic handler that DOES alert
  // on cancel must report exactly one violation.
  const syntheticSrc = `
    const handleAppleSignIn = async () => {
      try { await go(); }
      catch (error) {
        if (error.code === 'ERR_REQUEST_CANCELED') Alert.alert('nope');
        else Alert.alert('other');
      }
    };
  `;
  const syn = cancelAlerts(parseJS(syntheticSrc), syntheticSrc, 'handleAppleSignIn');
  assert.equal(syn.violations.length, 1, 'the detector cannot fail — it proves nothing');

  // sourceRules.test.mjs enforces this project-wide; stated here so P4 does not
  // discover it in CI.
  const handlerSrc = src(loginCode, arrowFunction(loginAst, loginSrc, 'handleAppleSignIn'));
  assert.doesNotMatch(handlerSrc, /console\./, 'handleAppleSignIn logs to the console');
});

// ── A-06 ────────────────────────────────────────────────────────────────────
test('full_name_is_sent_only_when_the_credential_carries_it', () => {
  // The client side: the name is derived from the credential, never invented.
  const handlerSrc = src(loginCode, arrowFunction(loginAst, loginSrc, 'handleAppleSignIn'));
  assert.match(handlerSrc, /credential\.fullName\?\.givenName/, 'the name is not read from the credential');
  assert.doesNotMatch(handlerSrc, STRINGIFY, 'the client stringifies the name — "null" would reach the server');

  // The api.js side: `full_name` is set only under a conditional.
  const appleLogin = findAll(apiAst, (n) => n.type === 'ObjectProperty'
    && n.key.type === 'Identifier' && n.key.name === 'appleLogin');
  assert.equal(appleLogin.length, 1, `expected exactly one authAPI.appleLogin, found ${appleLogin.length}`);
  const fnSrc = src(apiCode, appleLogin[0].value);

  assert.match(fnSrc, /'\/auth\/apple'/, 'appleLogin does not post to /auth/apple');
  assert.match(fnSrc, /identity_token/, 'appleLogin does not send identity_token');
  assert.match(fnSrc, /\bnonce\b/, 'appleLogin does not send nonce');
  assert.doesNotMatch(fnSrc, STRINGIFY, 'appleLogin stringifies full_name');

  const writes = findAll(appleLogin[0].value, (n) => n.type === 'AssignmentExpression'
    && /full_name/.test(src(apiSrc, n.left)));
  const literals = findAll(appleLogin[0].value, (n) => n.type === 'ObjectProperty'
    && ((n.key.type === 'Identifier' && n.key.name === 'full_name')
      || (n.key.type === 'StringLiteral' && n.key.value === 'full_name')));
  assert.equal(writes.length + literals.length, 1,
    `expected exactly one place where full_name is set, found ${writes.length + literals.length}`);
  assert.equal(literals.length, 0,
    'full_name is an unconditional key of the request body — Apple sends fullName on the first authorization only');
  const guarded = ancestors(writes[0], parentsOf(apiAst))
    .some((a) => a.type === 'IfStatement' || a.type === 'ConditionalExpression' || a.type === 'LogicalExpression');
  assert.ok(guarded, 'full_name is written unconditionally');
});

// ── A-07 ────────────────────────────────────────────────────────────────────
test('the_mobile_diff_touches_only_the_named_files', () => {
  const PREFIX = 'book-tracker-mobile-stitch/';
  const committed = git(['diff', '--name-only', `${BASE}...HEAD`, '--', PREFIX])
    .split('\n').map((s) => s.trim()).filter(Boolean);
  // Also the working tree, so this bites before the commit as well as after —
  // MUT-4G-53 is a working-tree edit and a committed-state-only assertion
  // would record "caught" without having looked at it.
  const dirty = git(['status', '--porcelain', '--', PREFIX])
    .split('\n').map((s) => s.slice(3).trim()).filter(Boolean)
    .map((s) => (s.includes(' -> ') ? s.split(' -> ')[1] : s))
    .map((s) => s.replace(/^"|"$/g, ''));

  const touched = [...new Set([...committed, ...dirty])];
  assert.ok(touched.length > 0, 'nothing under book-tracker-mobile-stitch/ changed — this assertion would be vacuous');
  assert.ok(touched.includes(`${PREFIX}${LOGIN}`), `${LOGIN} is not in the change set: ${touched.join(', ')}`);

  const allowed = new Set([
    'package.json', 'package-lock.json', 'app.json', 'eas.json',
    // Added 2026-10-11: the first real iOS build failed in `pod install` because GoogleSignin
    // pulls in AppCheckCore, a Swift pod that cannot be a static library without modular
    // headers. iOS is Apple-only (E-6), so the module is not autolinked there at all.
    'react-native.config.js',
    // Added 2026-10-11: the frozen-Dimensions bug (A-15) was not unique to LoginScreen -
    // AppTour.js had it too, and its tooltip's Continue button fell off the right edge in
    // portrait on a real iPad.
    'src/components/AppTour.js',
    // 2026-10-11: the frozen-Dimensions sweep found seven files, not one. All converted.
    'src/screens/InsightsScreen.js', 'src/screens/LibraryScreen.js',
    'src/screens/OnboardingScreen.js', 'src/screens/ProfileScreen.js',
    'src/screens/UserProfileScreen.js',
    // Added 2026-10-11: release/last-released.json recorded 2.2.1/60 while Play had 2.2.3/62,
    // so the guard protecting the next release was comparing against the wrong baseline.
    'release/last-released.json', '__tests__/botBadge.test.mjs',
    LOGIN, API, '__tests__/appleSignIn.test.mjs',
    ...LOCALE_CODES.map((c) => `src/i18n/locales/${c}.json`),
  ].map((p) => `${PREFIX}${p}`));

  const unexpected = touched.filter((p) => !allowed.has(p));
  assert.deepEqual(unexpected, [], `P4 touched files it does not own: ${unexpected.join(', ')}`);
});

// ── A-08 (tests.md K-11) ────────────────────────────────────────────────────
test('app_json_enables_apple_signin_and_keeps_both_ids', () => {
  const appJson = JSON.parse(readMobile('app.json'));
  const lastReleased = JSON.parse(readMobile('release/last-released.json'));

  // What adds com.apple.developer.applesignin to the build.
  assert.equal(appJson.expo.ios.usesAppleSignIn, true);

  // pm-decisions E-2: kept knowingly, so APPLE_AUDIENCES on Render must be
  // exactly this string.
  assert.equal(appJson.expo.ios.bundleIdentifier, 'com.bookpulse.mobile');
  // architecture E-2: changing this orphans every installed Android app.
  assert.equal(appJson.expo.android.package, 'com.bookpulse.mobile');

  // What an iOS build needs beyond the entitlement.
  assert.equal(typeof appJson.expo.ios.buildNumber, 'string', 'ios.buildNumber must be a string');
  assert.match(appJson.expo.ios.buildNumber, /^\d+$/);
  assert.equal((appJson.expo.ios.config || {}).usesNonExemptEncryption, false,
    'without this, App Store Connect asks an export-compliance question on every upload');

  // The only comparison check-version-bump.js --strict can make bite (K-11).
  const asNumber = (v) => {
    const parts = String(v).split('.').map(Number);
    assert.equal(parts.length, 3, `version is not x.y.z: ${v}`);
    return (parts[0] * 1e6) + (parts[1] * 1e3) + parts[2];
  };
  assert.ok(asNumber(appJson.expo.version) > asNumber(lastReleased.version),
    `app.json version ${appJson.expo.version} is not ahead of the released ${lastReleased.version}`);
  assert.ok(appJson.expo.android.versionCode > lastReleased.versionCode,
    `versionCode ${appJson.expo.android.versionCode} is not ahead of the released ${lastReleased.versionCode}`);
});

// ── A-09 ────────────────────────────────────────────────────────────────────
test('both_new_dependencies_are_pinned', () => {
  const pkg = JSON.parse(readMobile('package.json'));
  const lock = JSON.parse(readMobile('package-lock.json'));
  const NEW = ['expo-apple-authentication', 'expo-crypto'];

  for (const dep of NEW) {
    const range = pkg.dependencies[dep];
    assert.ok(range, `${dep} is not in dependencies`);
    assert.match(range, /^[~^]?\d+\.\d+\.\d+/, `${dep} is not pinned to a concrete version: ${range}`);
  }

  // The lockfile must agree, or `npm ci` in CI fails before a single test runs.
  for (const dep of NEW) {
    assert.equal(lock.packages[''].dependencies[dep], pkg.dependencies[dep],
      `package-lock.json is out of sync with package.json for ${dep}`);
    assert.ok(lock.packages[`node_modules/${dep}`], `${dep} has no resolved entry in package-lock.json`);
  }
});

// ── A-10 (E-5, before the tap) ──────────────────────────────────────────────
test('the_login_screen_says_something_before_the_tap', () => {
  // Every <Text> whose only child is a t('auth.apple…') call.
  const notices = jsxElementsNamed(loginAst, 'Text').filter((el) => {
    const kids = (el.children || []).filter((c) => !(c.type === 'JSXText' && c.value.trim() === ''));
    if (kids.length !== 1 || kids[0].type !== 'JSXExpressionContainer') return false;
    const e = kids[0].expression;
    return e.type === 'CallExpression' && e.callee.type === 'Identifier' && e.callee.name === 't'
      && e.arguments.length >= 1 && e.arguments[0].type === 'StringLiteral'
      && e.arguments[0].value.startsWith('auth.apple');
  });
  assert.equal(notices.length, 1, `expected exactly one pre-tap auth.apple* <Text>, found ${notices.length}`);

  const key = notices[0].children.filter((c) => c.type === 'JSXExpressionContainer')[0].expression.arguments[0].value;
  assert.ok(APPLE_KEYS.includes(key), `${key} is not in APPLE_KEYS`);

  // A sibling of the buttons under the same parent, next to the Apple button,
  // and inside the POSITIVE branch of the availability gate.
  const apple = appleButton();
  assert.equal(nearestElementAncestor(notices[0], loginParents), nearestElementAncestor(apple, loginParents),
    'the notice is not a sibling of the buttons');
  const { stateVar } = availabilityGate();
  assert.equal(src(loginSrc, guardOf(notices[0], 'the notice').left), stateVar,
    'the notice is not in the positive branch of the availability gate');

  // The anchors are what make it ACCURATE; the sentence is the PM's.
  const value = getDotted(loadLocale('en'), key);
  assert.equal(typeof value, 'string');
  assert.match(value, /new account|separate account/i, 'the notice does not say a new account is created');
  assert.match(value, /different|another|address|email/i, 'the notice does not mention a differing address');
  assert.match(value, /librar|Google/i, 'the notice does not point at the existing library');

  // Control (rule 3): the detector must reject a bare string literal.
  const syntheticSrc = `const C = () => <View><Text style={styles.appleNotice}>Hard-coded copy</Text></View>;`;
  const synNotices = jsxElementsNamed(parseJS(syntheticSrc), 'Text').filter((el) => {
    const kids = (el.children || []).filter((c) => !(c.type === 'JSXText' && c.value.trim() === ''));
    return kids.length === 1 && kids[0].type === 'JSXExpressionContainer';
  });
  assert.equal(synNotices.length, 0, 'the detector would accept a hard-coded string — it proves nothing');
});

// ── A-11 (E-5, after a new account is created) ──────────────────────────────
test('is_new_from_the_apple_path_tells_the_reader', () => {
  const handler = arrowFunction(loginAst, loginSrc, 'handleAppleSignIn');
  const handlerSrc = src(loginCode, handler);

  // It reads is_new at all.
  const isNewReads = findAll(handler, (n) => n.type === 'MemberExpression'
    && !n.computed && n.property.type === 'Identifier' && n.property.name === 'is_new');
  assert.ok(isNewReads.length >= 1, 'handleAppleSignIn ignores is_new — a duplicate account would be silent');

  // And the true branch alerts, with i18n keys from APPLE_KEYS.
  const branch = findAll(handler, (n) => n.type === 'IfStatement' && /is_new/.test(src(loginSrc, n.test)));
  assert.equal(branch.length, 1, `expected exactly one is_new branch, found ${branch.length}`);
  const alerts = findAll(branch[0].consequent, (n) => n.type === 'CallExpression'
    && /^Alert\.alert$/.test(src(loginSrc, n.callee)));
  assert.equal(alerts.length, 1, `expected exactly one Alert.alert on the is_new path, found ${alerts.length}`);

  const usedKeys = findAll(alerts[0], (n) => n.type === 'CallExpression'
    && n.callee.type === 'Identifier' && n.callee.name === 't'
    && n.arguments[0] && n.arguments[0].type === 'StringLiteral')
    .map((n) => n.arguments[0].value);

  // pm-decisions addendum Q-1: private_relay is the ONE case the server can
  // identify exactly, so the relay reader gets the specific message and
  // everyone else gets wording true both for a new reader and for a duplicate
  // under another address.
  assert.match(src(loginSrc, branch[0].consequent), /private_relay/,
    'the message does not use private_relay, so the Hide My Email reader is told the generic thing');
  assert.equal(usedKeys.length, 3, `expected three i18n keys in the alert (title + two bodies), found ${usedKeys.join(', ')}`);
  for (const k of usedKeys) assert.ok(APPLE_KEYS.includes(k), `${k} is not in APPLE_KEYS`);

  const en = loadLocale('en');
  const bodies = usedKeys.filter((k) => /Body$/.test(k));
  assert.equal(bodies.length, 2, `expected two body keys, found ${bodies.join(', ')}`);
  for (const k of bodies) {
    const v = getDotted(en, k);
    assert.match(v, /support|help|contact/i, `${k} offers the reader no fallback`);
    // The route has to be one the reader can actually take. This message only ever
    // appears on iOS, and E-6 means there is no Google button on that screen — so
    // "sign in with Google" would be an instruction pointing at a control they do
    // not have, ending in a dead end. The web app is reachable from the same phone.
    // Checked in EVERY locale, because "Google" and the domain are the same string
    // in all six and a translator could reintroduce either.
    for (const code of LOCALE_CODES) {
      const localised = getDotted(loadLocale(code), k);
      assert.equal(typeof localised, 'string', `${code}:${k} is missing`);
      assert.doesNotMatch(localised, /Google/i,
        `${code}:${k} tells an iOS reader to use Google, which E-6 removed from their screen`);
      assert.match(localised, /trackmyread\.com/i,
        `${code}:${k} names no route the reader can take from this phone`);
    }
  }
  const relayBody = bodies.find((k) => /Relay/.test(k));
  assert.ok(relayBody, 'no relay-specific body key');
  assert.match(getDotted(en, relayBody), /Hide My Email|relay/i,
    'the relay message does not name Hide My Email, which is the one thing the server knows for certain');
  const plainBody = bodies.find((k) => k !== relayBody);
  assert.match(getDotted(en, plainBody), /separate|different/i,
    'the non-relay message is not true for a reader who already has an account under another address');

  // The control: the Google path says nothing new, which is only provable
  // because handleSignIn is byte-identical to the base (asserted in A-02a).
  assert.doesNotMatch(
    sliceBetween(lf(loginCode), 'const handleSignIn = async () => {', '\n  };', 'handleSignIn'),
    /auth\.apple/, 'the Google handler carries Apple copy');
  assert.match(handlerSrc, /auth\.appleNewAccount/, 'the Apple handler carries no new-account copy');
});

// ── A-12 (tests.md K-02) ────────────────────────────────────────────────────
test('the_new_i18n_keys_exist_in_all_six_locales', () => {
  // Length first: a key cannot be quietly dropped to make this green.
  assert.equal(APPLE_KEYS.length, 4);
  assert.equal(new Set(APPLE_KEYS).size, 4);

  const en = loadLocale('en');
  for (const code of LOCALE_CODES) {
    const locale = loadLocale(code);
    for (const key of APPLE_KEYS) {
      const value = getDotted(locale, key);
      assert.equal(typeof value, 'string', `${code}:${key} is missing`);
      assert.ok(value.trim().length > 0, `${code}:${key} is empty`);
      assert.notEqual(value, key, `${code}:${key} is still the key — untranslated placeholder`);
      assert.deepEqual(placeholders(value), placeholders(getDotted(en, key)),
        `${code}:${key} placeholders do not match en`);
    }
  }

  // Every key is actually used, or the copy is dead weight nobody will update.
  for (const key of APPLE_KEYS) {
    assert.ok(loginCode.includes(`'${key}'`), `${key} is in the locales but not used in ${LOGIN}`);
  }
});

// ── A-14 (added after the first TestFlight build crashed on launch) ─────────
test('google_signin_is_not_statically_imported', () => {
  // iOS does not link RNGoogleSignin. The package runs
  //   TurboModuleRegistry.getEnforcing('RNGoogleSignin')
  // at module scope (node_modules/@react-native-google-signin/google-signin/lib/module/
  // spec/NativeGoogleSignin.js), and getEnforcing THROWS when the module is absent. A
  // static `import` therefore executes on launch and kills the app before anything renders
  // — which is what build 1a931494 did on a real iPhone. Nothing in the suite caught it,
  // because every other assertion was about what the screen renders, not what it loads.
  const statics = loginAst.program.body.filter(
    (n) => n.type === 'ImportDeclaration' && /google-signin/.test(n.source.value));
  assert.deepEqual(statics.map((n) => src(loginSrc, n)), [],
    'LoginScreen statically imports google-signin — this crashes iOS on launch');

  // And it must still be reachable off-iOS, behind a platform check.
  const reqs = findAll(loginAst, (n) => n.type === 'CallExpression'
    && n.callee.name === 'require'
    && /google-signin/.test(String((n.arguments[0] || {}).value || '')));
  assert.equal(reqs.length, 1,
    `expected exactly one require() of google-signin, found ${reqs.length}`);
  const guarded = ancestors(reqs[0], parentsOf(loginAst))
    .some((a) => a.type === 'ConditionalExpression' || a.type === 'IfStatement');
  assert.ok(guarded, 'the google-signin require() is not behind a platform check');

  // CONTROL (rule 3): the detector must see a static import when there is one.
  const synthetic = parseJS("import { GoogleSignin } from '@react-native-google-signin/google-signin';");
  assert.equal(
    synthetic.program.body.filter(
      (n) => n.type === 'ImportDeclaration' && /google-signin/.test(n.source.value)).length,
    1, 'the detector cannot see a static import, so its pass proves nothing');
});

// ── A-15 (added after the iPad TestFlight build clipped the third card) ─────
test('layout_width_is_not_frozen_at_module_scope', () => {
  // Dimensions.get('window') at module scope is evaluated once, when the bundle loads. On an
  // iPad the scene is sized afterwards - and changes again on rotation and in Split View -
  // so any layout derived from it is wrong there. Build 2 cut the third feature card off the
  // right edge of an iPad because CARD_W was computed that way.
  // Swept across EVERY source file, not just this screen. The first version of this case
  // only looked at LoginScreen, and passed while AppTour.js carried the identical bug — its
  // tour tooltip pushed Continue off the right edge in portrait on a real iPad. A rule about
  // a PATTERN has to be applied everywhere the pattern can occur.
  // Known offenders, 2026-10-11. LoginScreen and AppTour are FIXED (the two that were
  // actually seen broken on an iPad). These five carry the same bug and are queued for the
  // same treatment — they are listed by name so the rule still catches a SIXTH, and so this
  // list is visibly a debt rather than a silent exception. Removing a name here without
  // fixing the file turns this case red, which is the point.
  const KNOWN_FROZEN = [];   // emptied 2026-10-11: all seven converted to useWindowDimensions
  const offenders = [];
  let swept = 0;
  const srcFiles = [];
  (function collect(dir) {
    for (const entry of fs.readdirSync(path.join(MOBILE_ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) collect(rel);
      else if (/\.jsx?$/.test(entry.name)) srcFiles.push(rel);
    }
  })('src');
  for (const rel of srcFiles) {
    swept += 1;
    const code = readMobile(rel);
    if (!code.includes('Dimensions')) continue;
    const ast = parseMobileFile(rel);
    const calls = findAll(ast, (n) => n.type === 'CallExpression'
      && /Dimensions\s*\.\s*get/.test(src(code, n.callee)));
    const parents = parentsOf(ast);
    const moduleScope = calls.filter((n) => !ancestors(n, parents)
      .some((a) => a.type === 'FunctionDeclaration' || a.type === 'ArrowFunctionExpression'
        || a.type === 'FunctionExpression'));
    if (moduleScope.length && !KNOWN_FROZEN.includes(rel)) offenders.push(rel);
  }
  assert.ok(swept > 20, `the sweep only looked at ${swept} files — it cannot be finding anything`);
  assert.deepEqual(offenders, [],
    `Dimensions.get() at module scope freezes the width — wrong on iPad and after rotation: ${offenders.join(', ')}`);

  // Every exempted file must still HAVE the bug; once fixed its name must leave the list,
  // so the debt cannot quietly outlive the problem.
  const stale = KNOWN_FROZEN.filter((rel) => !readMobile(rel).includes('Dimensions.get'));
  assert.deepEqual(stale, [],
    `fixed but still exempted — remove from KNOWN_FROZEN: ${stale.join(', ')}`);

  // and the responsive hook is what replaced it
  const hook = findAll(loginAst, (n) => n.type === 'CallExpression'
    && n.callee.name === 'useWindowDimensions');
  assert.equal(hook.length, 1,
    `expected useWindowDimensions() to supply the width, found ${hook.length} call(s)`);

  // CONTROL (rule 3): the detector must see a module-scope Dimensions.get when there is one.
  const synSrc = `const W = Dimensions.get('window').width;\nconst C = () => <View/>;`;
  const synthetic = parseJS(synSrc);
  const synFrozen = findAll(synthetic, (n) => n.type === 'CallExpression'
    && /Dimensions\s*\.\s*get/.test(src(synSrc, n.callee)))
    .filter((n) => !ancestors(n, parentsOf(synthetic))
      .some((a) => a.type === 'FunctionDeclaration' || a.type === 'ArrowFunctionExpression'
        || a.type === 'FunctionExpression'));
  assert.equal(synFrozen.length, 1,
    'the detector cannot see a module-scope Dimensions.get, so its pass proves nothing');
});

// ── A-16 (added after one book filled an entire iPad page) ─────────────────
test('library_grid_column_count_is_not_hardcoded', () => {
  // Unfreezing the width was not enough: numColumns={2} meant an iPad still drew two
  // tiles, each about 500pt, so a single book took most of the screen. The column count
  // has to come from the measured width. A literal here is the bug.
  const rel = 'src/screens/LibraryScreen.js';
  const code = readMobile(rel);
  const ast = parseMobileFile(rel);
  const attrs = findAll(ast, (n) => n.type === 'JSXAttribute'
    && n.name && n.name.name === 'numColumns');
  assert.equal(attrs.length, 1, `expected exactly one numColumns, found ${attrs.length}`);
  const expr = attrs[0].value && attrs[0].value.expression;
  assert.ok(expr, 'numColumns has no expression');
  assert.notEqual(expr.type, 'NumericLiteral',
    `numColumns is hardcoded to ${src(code, expr)} — an iPad gets two giant tiles`);

  // FlatList does not re-layout when numColumns changes unless the key changes with it.
  const keyAttr = findAll(ast, (n) => n.type === 'JSXAttribute'
    && n.name && n.name.name === 'key'
    && /cols/.test(src(code, n)));
  assert.equal(keyAttr.length, 1,
    'the FlatList needs a key that changes with the column count, or rotation will not re-lay out');
});

// ── A-13 (pm-decisions addendum K-10 — new in this package) ─────────────────
test('eas_json_has_ios_profiles_and_leaves_android_alone', () => {
  const eas = JSON.parse(readMobile('eas.json'));
  const base = JSON.parse(git(['show', `${BASE}:book-tracker-mobile-stitch/eas.json`]));

  const profiles = ['development', 'preview', 'production'];
  assert.deepEqual(Object.keys(eas.build), profiles, 'the set of build profiles changed');

  for (const name of profiles) {
    assert.ok(eas.build[name].ios, `the ${name} profile has no ios block — the sprint cannot build for iOS`);
    assert.equal(typeof eas.build[name].ios, 'object');
    assert.ok(Object.keys(eas.build[name].ios).length > 0, `the ${name} ios block is empty`);
  }

  // The simulator profiles are what let a build happen without registering a
  // device, a certificate or an app with Apple — which this package must not do.
  assert.equal(eas.build.development.ios.simulator, true);
  assert.equal(eas.build.preview.ios.simulator, true);

  // Android, byte for byte from the base: raising iOS must not change what the
  // Play build produces (workflows.test.mjs::aab_production_bundle_apk_preview
  // depends on these two).
  for (const name of profiles) {
    assert.deepEqual(eas.build[name].android, base.build[name].android, `the ${name} android block changed`);
  }
  assert.deepEqual(eas.cli, base.cli, 'eas.json cli block changed');

  // Until 2026-10-11 this asserted `eas.submit` was unchanged from the base, because at the
  // time no App Store Connect record existed and an ascAppId would have been invented. The
  // record now exists (TrackMyRead, com.bookpulse.mobile), so the assertion is inverted
  // rather than deleted: the id must be present, and it must be the real one.
  assert.equal(eas.submit.production.ios.ascAppId, '6821514742',
    'submit.production.ios.ascAppId must be the real App Store Connect app id');

  // This repository is public, so what may live here needs stating precisely rather than
  // banning the lot. `eas submit` reads the ASC key ONLY from this file — the EXPO_ASC_*
  // environment variables are for credentials operations, not submission (measured: submit
  // prompted "Generate a new App Store Connect API Key?" with all four of them set). So the
  // path, key id and issuer id are configuration and belong here; the SECRET is the .p8, and
  // it must never be in the repo.
  const ios = eas.submit.production.ios;
  const inlineKey = ['ascApiKey', 'appleId', 'appleIdPassword', 'appleAppSpecificPassword']
    .filter((k) => k in ios);
  assert.deepEqual(inlineKey, [],
    `a credential VALUE must never be in eas.json - this repo is public: ${inlineKey.join(', ')}`);

  // The path must be project-relative (an absolute C:\\Users\\... path breaks every other
  // machine and CI) and must point somewhere git ignores.
  assert.ok(ios.ascApiKeyPath.startsWith('./'),
    `ascApiKeyPath must be project-relative, got ${ios.ascApiKeyPath}`);
  const keyPath = path.join(MOBILE_ROOT, ios.ascApiKeyPath);
  const ignored = spawnSync('git', ['check-ignore', keyPath], { cwd: MOBILE_ROOT, encoding: 'utf8' });
  assert.equal(ignored.status, 0,
    `${ios.ascApiKeyPath} is NOT gitignored - the Apple private key would be published`);
  assert.equal(spawnSync('git', ['ls-files', '--error-unmatch', keyPath],
    { cwd: MOBILE_ROOT, encoding: 'utf8' }).status !== 0, true,
    'the .p8 is tracked by git');
});

// ── A-14 (Sprint 4H) ────────────────────────────────────────────────────────
test('authorization_code_travels_from_the_credential_to_the_body', () => {
  // Sprint 4H. Apple's one-time `authorizationCode` is the ONLY way the server
  // can obtain a refresh token, and a refresh token is the only value
  // `appleid.apple.com/auth/revoke` accepts. Without this field the server can
  // send nothing at deletion and the reader's Apple ID keeps listing us under
  // "Apps Using Apple ID" — which is the item App Review checks.
  //
  // MUT-4H-12: pass `null`/`undefined` instead of the credential's field; send
  // it unconditionally; read `credential.authorization_code` (the snake_case
  // spelling expo-apple-authentication does not have); stringify it.
  const handlerSrc = src(loginCode, arrowFunction(loginAst, loginSrc, 'handleAppleSignIn'));
  assert.match(handlerSrc, /credential\.authorizationCode/,
    'the handler does not read authorizationCode off the credential');
  assert.doesNotMatch(handlerSrc, /credential\.authorization_code/,
    'snake_case — expo-apple-authentication spells it authorizationCode');
  assert.doesNotMatch(handlerSrc, STRINGIFY,
    'the handler stringifies — "null" would reach the server as a code');

  // It is passed to appleLogin, and as the FOURTH argument, which is the
  // position api.js reads. A call that merely mentions the field somewhere in
  // the handler would satisfy a text scan and nothing else.
  const calls = findAll(loginAst, (n) => n.type === 'CallExpression'
    && /authAPI\.appleLogin$/.test(src(loginSrc, n.callee)));
  assert.equal(calls.length, 1, `expected exactly one authAPI.appleLogin call, found ${calls.length}`);
  const args = calls[0].arguments.map((a) => src(loginSrc, a));
  assert.equal(args.length, 4, `appleLogin is called with ${args.length} arguments: ${args.join(', ')}`);
  assert.match(args[3], /^credential\.authorizationCode$/,
    `the 4th argument is ${args[3]}, not the credential's authorizationCode`);

  // The api.js side: the parameter exists, in that position, and the body key
  // is written exactly once and under a conditional — the same rule full_name
  // lives under, for the same reason. An older build sends no code, and the
  // string "null" would be worse than sending nothing.
  const appleLogin = findAll(apiAst, (n) => n.type === 'ObjectProperty'
    && n.key.type === 'Identifier' && n.key.name === 'appleLogin');
  assert.equal(appleLogin.length, 1, `expected exactly one authAPI.appleLogin, found ${appleLogin.length}`);
  const fn = appleLogin[0].value;
  const params = (fn.params || []).map((p) => src(apiSrc, p));
  assert.deepEqual(params, ['identityToken', 'nonce', 'fullName', 'authorizationCode'],
    `appleLogin's parameters are ${params.join(', ')}`);

  const fnSrc = src(apiCode, fn);
  assert.match(fnSrc, /authorization_code/, 'appleLogin does not send authorization_code');
  assert.doesNotMatch(fnSrc, STRINGIFY, 'appleLogin stringifies authorization_code');

  const writes = findAll(fn, (n) => n.type === 'AssignmentExpression'
    && /authorization_code/.test(src(apiSrc, n.left)));
  const literals = findAll(fn, (n) => n.type === 'ObjectProperty'
    && ((n.key.type === 'Identifier' && n.key.name === 'authorization_code')
      || (n.key.type === 'StringLiteral' && n.key.value === 'authorization_code')));
  assert.equal(writes.length + literals.length, 1,
    `expected exactly one place where authorization_code is set, found ${writes.length + literals.length}`);
  assert.equal(literals.length, 0,
    'authorization_code is an unconditional key of the request body — an older build sends none');
  const guarded = ancestors(writes[0], parentsOf(apiAst))
    .some((a) => a.type === 'IfStatement' || a.type === 'ConditionalExpression' || a.type === 'LogicalExpression');
  assert.ok(guarded, 'authorization_code is written unconditionally');

  // CONTROL: the same detectors on a synthetic negative, so a green run above
  // is the source being right and not the walks finding nothing.
  const badSrc = "appleLogin: async (a, b, c) => { const body = { authorization_code: null }; }";
  const badAst = parseJS(badSrc);
  const badProp = findAll(badAst, (n) => n.type === 'ObjectProperty'
    && n.key.type === 'Identifier' && n.key.name === 'authorization_code');
  assert.equal(badProp.length, 1, 'the unconditional-literal detector found nothing to report');
});
