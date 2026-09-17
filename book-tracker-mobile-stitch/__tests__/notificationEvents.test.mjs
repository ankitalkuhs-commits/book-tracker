// Package C (T-22). Static checks for NotificationsScreen.js (T-12/T-13):
// EVENT_CONFIG covers every active backend event, join_approved/rejected and
// admin_broadcast route correctly, the 'circles' case exists, existing
// targets are unchanged, and per-row / mark-all read wiring is correct.
//
// Imports Package A's __tests__/_ast.mjs for the shared @babel/parser +
// js-yaml loader (see build notes: not present in this worktree, a temporary
// local copy was used to verify locally and is deleted before commit).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseSource, readSource, MOBILE_ROOT, REPO_ROOT } from './_ast.mjs';

const SCREEN_REL = 'src/screens/NotificationsScreen.js';

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

function literalValue(node) {
  if (!node) return undefined;
  if (node.type === 'StringLiteral') return node.value;
  if (node.type === 'NumericLiteral') return node.value;
  if (node.type === 'BooleanLiteral') return node.value;
  if (node.type === 'NullLiteral') return null;
  if (node.type === 'Identifier' && node.name === 'undefined') return undefined;
  return undefined;
}

function findEventConfig(ast) {
  let objExpr = null;
  walk(ast.program, (node) => {
    if (objExpr) return;
    if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier' && node.id.name === 'EVENT_CONFIG') {
      objExpr = node.init;
    }
  });
  assert.ok(objExpr && objExpr.type === 'ObjectExpression', 'EVENT_CONFIG object literal not found');
  const entries = {};
  for (const prop of objExpr.properties) {
    if (prop.type !== 'ObjectProperty') continue;
    const key = prop.key.type === 'Identifier' ? prop.key.name : literalValue(prop.key);
    const fields = {};
    if (prop.value.type === 'ObjectExpression') {
      for (const p of prop.value.properties) {
        if (p.type !== 'ObjectProperty') continue;
        const fk = p.key.type === 'Identifier' ? p.key.name : literalValue(p.key);
        fields[fk] = literalValue(p.value);
      }
    }
    entries[key] = fields;
  }
  return entries;
}

function findFunctionByName(ast, name) {
  let fn = null;
  walk(ast.program, (node) => {
    if (fn) return;
    if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier' && node.id.name === name) {
      if (node.init && (node.init.type === 'ArrowFunctionExpression' || node.init.type === 'FunctionExpression')) {
        fn = node.init;
      }
    }
    if (node.type === 'FunctionDeclaration' && node.id?.name === name) fn = node;
  });
  return fn;
}

function sourceSlice(code, node) {
  return code.slice(node.start, node.end);
}

test('event_config_covers_every_active_backend_event', () => {
  const configPy = readSource('app/notifications/config.py', REPO_ROOT);
  const pyEventNames = [...configPy.matchAll(/^\s{4}"([a-z_]+)":\s*\{/gm)].map(m => m[1]);
  assert.ok(pyEventNames.length >= 11, `expected at least 11 backend events, found ${pyEventNames.length}`);

  const ast = parseSource(SCREEN_REL);
  const events = findEventConfig(ast);
  assert.ok('default' in events, 'EVENT_CONFIG must keep a default entry');
  for (const name of pyEventNames) {
    assert.ok(name in events, `EVENT_CONFIG is missing backend event "${name}"`);
  }
});

test('join_approved_navigates_to_group', () => {
  const ast = parseSource(SCREEN_REL);
  const events = findEventConfig(ast);
  assert.equal(events.group_join_approved?.navTarget, 'group');
});

test('join_rejected_navigates_to_circles', () => {
  const ast = parseSource(SCREEN_REL);
  const events = findEventConfig(ast);
  assert.equal(events.group_join_rejected?.navTarget, 'circles');
});

test('admin_broadcast_has_own_icon_and_no_nav', () => {
  const ast = parseSource(SCREEN_REL);
  const events = findEventConfig(ast);
  assert.equal(events.admin_broadcast?.navTarget, null);
  assert.notEqual(events.admin_broadcast?.icon, 'notifications');
  assert.ok(events.admin_broadcast?.icon, 'admin_broadcast must have its own icon');
});

test('circles_case_navigates_to_CircTab', () => {
  const code = readSource(SCREEN_REL);
  const ast = parseSource(SCREEN_REL);
  const fn = findFunctionByName(ast, 'handleNotifPress');
  assert.ok(fn, 'handleNotifPress not found');
  let switchStmt = null;
  walk(fn.body, (node) => { if (!switchStmt && node.type === 'SwitchStatement') switchStmt = node; });
  assert.ok(switchStmt, 'handleNotifPress has no switch statement');
  const circlesCase = switchStmt.cases.find(c => literalValue(c.test) === 'circles');
  assert.ok(circlesCase, 'no case "circles" in handleNotifPress switch');
  const caseSrc = circlesCase.consequent.map(n => sourceSlice(code, n)).join('\n');
  assert.match(caseSrc, /navigation\?\.navigate\(\s*['"]Tabs['"]\s*,\s*\{\s*screen:\s*['"]CircTab['"]/);
});

test('existing_event_targets_unchanged', () => {
  const ast = parseSource(SCREEN_REL);
  const events = findEventConfig(ast);
  const expected = {
    new_follower: 'user',
    post_liked: 'feed',
    post_commented: 'feed',
    book_added: 'feed',
    book_completed: 'feed',
    reading_streak_reminder: 'insights',
    group_invite: 'group',
    group_join_request: 'group',
  };
  for (const [name, navTarget] of Object.entries(expected)) {
    assert.equal(events[name]?.navTarget, navTarget, `${name} navTarget changed`);
  }
});

test('row_mark_read_guarded_by_unread_and_caught', () => {
  const code = readSource(SCREEN_REL);
  const ast = parseSource(SCREEN_REL);
  const fn = findFunctionByName(ast, 'handleNotifPress');
  assert.ok(fn, 'handleNotifPress not found');
  let guard = null;
  walk(fn.body, (node) => {
    if (guard) return;
    if (node.type === 'IfStatement' && node.test?.type === 'UnaryExpression' && node.test.operator === '!') {
      const arg = node.test.argument;
      if (arg?.type === 'MemberExpression' && arg.property?.name === 'is_read') guard = node;
    }
  });
  assert.ok(guard, 'no "if (!item.is_read)" guard found');
  const guardSrc = sourceSlice(code, guard);
  assert.match(guardSrc, /notificationsAPI\.markRead\(/);
  assert.match(guardSrc, /\.then\(/);
  assert.match(guardSrc, /\.catch\(/);
  // Not awaited before navigation — the markRead call is a bare expression, not part of an await.
  assert.doesNotMatch(guardSrc, /await\s+notificationsAPI\.markRead/);
});

test('mark_all_read_refreshes_badge', () => {
  const code = readSource(SCREEN_REL);
  const ast = parseSource(SCREEN_REL);
  const fn = findFunctionByName(ast, 'handleMarkAllRead');
  assert.ok(fn, 'handleMarkAllRead not found');
  const fnSrc = sourceSlice(code, fn);
  assert.match(fnSrc, /notificationsAPI\.markAllRead\(\)/);
  assert.match(fnSrc, /refreshUnread\(\)/);
  // refreshUnread must come after the markAllRead call, in source order.
  assert.ok(fnSrc.indexOf('refreshUnread()') > fnSrc.indexOf('notificationsAPI.markAllRead()'));
});
