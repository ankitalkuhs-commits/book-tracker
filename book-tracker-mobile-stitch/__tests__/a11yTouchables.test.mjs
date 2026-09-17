// Package C (T-22). Static a11y sweep for F-38: every icon-only touchable in
// App.js + src/**/*.js has an accessibilityLabel, minimums per file are met,
// no touchable lacks a press handler, labels go through i18n (not literals),
// every a11y.* key from architecture §0.1 is used, counts use
// accessibilityValue, and VisibilityToggle is an accessible switch.
//
// Imports Package A's __tests__/_ast.mjs for the shared @babel/parser
// loader (see build notes: not present in this worktree; a temporary local
// copy was used to verify locally and is deleted before commit).
//
// This sweep spans every package's files by design (T-22, tests.md S58-S61):
// it is the gate for the FULL merged A+B+C tree. Written against a
// Package-C-only worktree, rows owned by Package A (components/AppTour.js)
// and Package B (screens/GroupDetailScreen.js, screens/GroupsScreen.js) are
// not yet edited here, so several assertions below are expected to FAIL
// until A and B merge — architecture T-22 calls this out explicitly
// ("Assertions about other packages' files ... are expected to fail until
// all three packages merge"). See build-notes-C.md for the current run
// output and which failures are attributable to missing A/B content.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parser, MOBILE_ROOT } from './_ast.mjs';

const TOUCHABLE_TAGS = new Set(['TouchableOpacity', 'Pressable', 'TouchableHighlight', 'TouchableWithoutFeedback']);
const DEAD_FILES = new Set(['SearchScreen.js', 'OnboardingScreen.js']);

// file (relative to MOBILE_ROOT) -> minimum labeled-touchable count (S59)
const MIN_LABELED = {
  'src/components/AppTour.js': 1,
  'src/components/AppHeader.js': 2,
  'src/components/VisibilityToggle.js': 1,
  'src/screens/GroupDetailScreen.js': 6,
  'src/screens/GroupsScreen.js': 1,
  'src/screens/FeedScreen.js': 8,
  'src/screens/BookDetailScreen.js': 3,
  'src/screens/BookPreviewScreen.js': 1,
  'src/screens/LibraryScreen.js': 2,
  'src/screens/ProfileScreen.js': 8,
  'src/screens/UserProfileScreen.js': 4,
  'src/screens/SettingsScreen.js': 3,
  'src/screens/NotificationsScreen.js': 1,
};

// Expected allowlisted unlabeled touchables in the FULL merged tree (S58).
const EXPECTED_ALLOWLIST = {
  'src/screens/SearchScreen.js': 2,
  'src/screens/FeedScreen.js': 1,
  'src/screens/UserProfileScreen.js': 1,
};

const A11Y_KEYS = [
  'back', 'close', 'openSettings', 'openProfile', 'openUserProfile', 'notifications',
  'changePhoto', 'addPhoto', 'removePhoto', 'removeTaggedBook', 'postOptions', 'deletePost',
  'deleteComment', 'editNote', 'deleteNote', 'like', 'comments', 'sendComment', 'share',
  'searchBooks', 'clearSearch', 'rateStars', 'chooseAvatar', 'coverPreset', 'postVisibility',
];

function toRel(p) { return p.split(path.sep).join('/'); }

function listSourceFiles() {
  const files = [{ rel: 'App.js', abs: path.join(MOBILE_ROOT, 'App.js') }];
  const walkDir = (dirRel) => {
    const dirAbs = path.join(MOBILE_ROOT, dirRel);
    for (const entry of fs.readdirSync(dirAbs, { withFileTypes: true })) {
      const rel = `${dirRel}/${entry.name}`;
      if (entry.isDirectory()) walkDir(rel);
      else if (entry.name.endsWith('.js')) files.push({ rel, abs: path.join(MOBILE_ROOT, rel) });
    }
  };
  walkDir('src');
  return files;
}

function parseFile(abs) {
  const code = fs.readFileSync(abs, 'utf8');
  return { code, ast: parser.parse(code, { sourceType: 'module', plugins: ['jsx'] }) };
}

function walk(node, visit) {
  if (!node || typeof node.type !== 'string') return;
  visit(node);
  for (const key of Object.keys(node)) {
    if (['loc', 'start', 'end', 'range', 'leadingComments', 'trailingComments', 'extra', 'comments'].includes(key)) continue;
    const val = node[key];
    if (Array.isArray(val)) {
      for (const item of val) walk(item, visit);
    } else if (val && typeof val === 'object' && typeof val.type === 'string') {
      walk(val, visit);
    }
  }
}

function jsxAttr(openingElement, name) {
  return openingElement.attributes.find(a => a.type === 'JSXAttribute' && a.name?.name === name);
}

// "no <Text> descendant" (S58) means anywhere in the subtree, not only
// direct children — real screens nest Text inside wrapper Views.
function hasTextDescendant(el) {
  let found = false;
  walk(el, (node) => {
    if (found) return;
    if (node.type === 'JSXText' && node.value.trim().length > 0) { found = true; return; }
    if (node.type === 'JSXElement') {
      const n = node.openingElement.name;
      const tag = n?.type === 'JSXIdentifier' ? n.name : null;
      if (tag === 'Text' || tag === 'TextInput') found = true;
    }
  });
  return found;
}

function findTouchables(ast) {
  const found = [];
  walk(ast.program, (node) => {
    if (node.type !== 'JSXElement') return;
    const nameNode = node.openingElement.name;
    const tag = nameNode?.type === 'JSXIdentifier' ? nameNode.name : null;
    if (tag && TOUCHABLE_TAGS.has(tag)) found.push(node);
  });
  return found;
}

// Collect once so every test shares the same parse pass.
const FILES = listSourceFiles().map(f => ({ ...f, ...parseFile(f.abs) }));

test('unlabeled_touchables_only_in_allowlisted_dead_code', () => {
  const offenders = [];
  for (const f of FILES) {
    for (const el of findTouchables(f.ast)) {
      if (jsxAttr(el.openingElement, 'accessibilityLabel')) continue;
      if (hasTextDescendant(el)) continue;
      offenders.push(f.rel);
    }
  }
  const counts = {};
  for (const rel of offenders) counts[rel] = (counts[rel] || 0) + 1;

  // Exactly the allowlisted dead code, nothing else, in the FULL merged tree.
  assert.deepEqual(counts, EXPECTED_ALLOWLIST);
});

test('labeled_touchable_minimums_per_file', () => {
  const failures = [];
  for (const [rel, min] of Object.entries(MIN_LABELED)) {
    const f = FILES.find(x => x.rel === rel);
    if (!f) { failures.push(`${rel}: file not found`); continue; }
    const count = findTouchables(f.ast).filter(el => jsxAttr(el.openingElement, 'accessibilityLabel')).length;
    if (count < min) failures.push(`${rel}: ${count} labeled touchables, need >= ${min}`);
  }
  assert.deepEqual(failures, []);
});

test('no_touchable_without_press_handler', () => {
  const offenders = [];
  for (const f of FILES) {
    if (DEAD_FILES.has(path.basename(f.rel))) continue;
    for (const el of findTouchables(f.ast)) {
      const hasHandler = ['onPress', 'onLongPress', 'onPressIn'].some(n => jsxAttr(el.openingElement, n));
      if (!hasHandler) offenders.push(f.rel);
    }
  }
  assert.deepEqual(offenders, []);
});

test('icon_labels_use_i18n_not_literals', () => {
  const offenders = [];
  for (const f of FILES) {
    if (DEAD_FILES.has(path.basename(f.rel))) continue;
    walk(f.ast.program, (node) => {
      if (node.type !== 'JSXAttribute') return;
      if (node.name?.name !== 'accessibilityLabel' && node.name?.name !== 'accessibilityHint') return;
      if (node.value?.type === 'StringLiteral') offenders.push(`${f.rel}: ${node.name.name}="${node.value.value}"`);
    });
  }
  assert.deepEqual(offenders, []);
});

test('all_brief_a11y_keys_used', () => {
  const used = new Set();
  for (const f of FILES) {
    walk(f.ast.program, (node) => {
      if (node.type !== 'CallExpression') return;
      const callee = node.callee;
      const isTCall = callee.type === 'Identifier' && callee.name === 't';
      const isI18nTCall = callee.type === 'MemberExpression' && callee.object?.name === 'i18n' && callee.property?.name === 't';
      if (!isTCall && !isI18nTCall) return;
      const arg = node.arguments[0];
      if (arg?.type === 'StringLiteral' && arg.value.startsWith('a11y.')) used.add(arg.value.slice('a11y.'.length));
    });
  }
  const missing = A11Y_KEYS.filter(k => !used.has(k));
  assert.deepEqual(missing, []);
});

test('counts_passed_via_accessibilityValue', () => {
  // AppHeader bell, Feed like/comments, Profile like/comments, UserProfile like.
  const targets = [
    { file: 'src/components/AppHeader.js', label: 'a11y.notifications' },
    { file: 'src/screens/FeedScreen.js', label: 'a11y.like' },
    { file: 'src/screens/FeedScreen.js', label: 'a11y.comments' },
    { file: 'src/screens/ProfileScreen.js', label: 'a11y.like' },
    { file: 'src/screens/ProfileScreen.js', label: 'a11y.comments' },
    { file: 'src/screens/UserProfileScreen.js', label: 'a11y.like' },
  ];
  for (const { file, label } of targets) {
    const f = FILES.find(x => x.rel === file);
    assert.ok(f, `${file} not found`);
    const matches = findTouchables(f.ast).filter(el => {
      const attr = jsxAttr(el.openingElement, 'accessibilityLabel');
      if (!attr || attr.value?.type !== 'JSXExpressionContainer') return false;
      const expr = attr.value.expression;
      return expr.type === 'CallExpression' && expr.arguments[0]?.type === 'StringLiteral' && expr.arguments[0].value === label;
    });
    assert.ok(matches.length > 0, `${file}: no touchable labeled ${label}`);
    for (const el of matches) {
      assert.ok(jsxAttr(el.openingElement, 'accessibilityValue'), `${file}: ${label} touchable missing accessibilityValue`);
      const labelAttr = jsxAttr(el.openingElement, 'accessibilityLabel');
      const expr = labelAttr.value.expression;
      assert.equal(expr.arguments.length, 1, `${file}: ${label} label call should take no count argument`);
    }
  }
});

test('visibility_toggle_is_accessible_switch', () => {
  const f = FILES.find(x => x.rel === 'src/components/VisibilityToggle.js');
  assert.ok(f, 'VisibilityToggle.js not found');
  const touchables = findTouchables(f.ast);
  const switchEl = touchables.find(el => {
    const role = jsxAttr(el.openingElement, 'accessibilityRole');
    return role?.value?.type === 'StringLiteral' && role.value.value === 'switch';
  });
  assert.ok(switchEl, 'VisibilityToggle default export touchable has no accessibilityRole="switch"');
  assert.ok(jsxAttr(switchEl.openingElement, 'accessibilityState'), 'missing accessibilityState');
  assert.ok(jsxAttr(switchEl.openingElement, 'accessibilityLabel'), 'missing accessibilityLabel');
  assert.ok(jsxAttr(switchEl.openingElement, 'accessibilityHint'), 'missing accessibilityHint');

  // No storage call inside the presentational default export itself — only
  // the useNoteVisibility hook (same file) may touch AsyncStorage.
  let defaultExportFn = null;
  walk(f.ast.program, (node) => {
    if (defaultExportFn) return;
    if (node.type === 'ExportDefaultDeclaration' && node.declaration.type === 'FunctionDeclaration') {
      defaultExportFn = node.declaration;
    }
  });
  assert.ok(defaultExportFn, 'no default export function found in VisibilityToggle.js');
  const defaultExportSrc = f.code.slice(defaultExportFn.start, defaultExportFn.end);
  assert.ok(!defaultExportSrc.includes('AsyncStorage'), 'VisibilityToggle default export references AsyncStorage — only the hook may');
});
