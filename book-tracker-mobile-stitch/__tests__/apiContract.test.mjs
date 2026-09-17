// T-22 (A) — every api.js call against the backend, plus the new 4B client
// functions (T-02, T-04, T-09, T-13, T-15).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  REPO_ROOT, MOBILE_ROOT, parseMobileFile, readMobile, walk, findAll,
  literalToPath, normalizePath, listMobileFiles,
} from './_ast.mjs';

const API_OBJECT_NAMES = [
  'authAPI', 'booksAPI', 'userbooksAPI', 'notesAPI', 'userAPI',
  'notificationsAPI', 'groupsAPI', 'profileAPI', 'activityAPI', 'importAPI',
];

function routerFiles() {
  const dirs = [
    ['app', 'routers'],
    ['app', 'notifications'],
  ];
  const files = [];
  for (const parts of dirs) {
    const abs = path.join(REPO_ROOT, ...parts);
    for (const f of fs.readdirSync(abs)) {
      if (f.endsWith('.py')) files.push(path.join(...parts, f).split(path.sep).join('/'));
    }
  }
  return files;
}

function backendRoutes() {
  const routes = new Set();
  for (const rel of routerFiles()) {
    const text = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
    const prefixMatch = text.match(/APIRouter\([^)]*prefix\s*=\s*["']([^"']*)["']/);
    const prefix = prefixMatch ? prefixMatch[1] : '';
    const re = /@router\.(get|post|put|patch|delete)\(\s*["']([^"']*)["']/g;
    let m;
    while ((m = re.exec(text))) {
      routes.add(`${m[1].toUpperCase()} ${normalizePath(prefix + m[2])}`);
    }
  }
  return routes;
}

function clientCalls() {
  const ast = parseMobileFile('src/services/api.js');
  return findAll(ast, (node) => node.type === 'CallExpression'
    && node.callee.type === 'MemberExpression'
    && node.callee.object.type === 'Identifier' && node.callee.object.name === 'api'
    && !node.callee.computed
    && node.callee.property.type === 'Identifier'
    && ['get', 'post', 'put', 'patch', 'delete'].includes(node.callee.property.name))
    .map((node) => {
      const rawPath = literalToPath(node.arguments[0]);
      return {
        method: node.callee.property.name.toUpperCase(),
        path: rawPath == null ? null : normalizePath(rawPath),
        node,
      };
    });
}

function apiObjectKeys() {
  const ast = parseMobileFile('src/services/api.js');
  const map = {};
  findAll(ast, (node) => node.type === 'VariableDeclarator'
    && node.id.type === 'Identifier' && API_OBJECT_NAMES.includes(node.id.name)
    && node.init && node.init.type === 'ObjectExpression')
    .forEach((node) => {
      const keys = node.init.properties
        .filter((p) => p.type === 'ObjectProperty' || p.type === 'ObjectMethod')
        .map((p) => (p.key.type === 'Identifier' ? p.key.name : p.key.value));
      map[node.id.name] = new Set(keys);
    });
  return map;
}

function findApiProperty(objName, propName) {
  const ast = parseMobileFile('src/services/api.js');
  let found = null;
  findAll(ast, (node) => node.type === 'VariableDeclarator' && node.id.name === objName && node.init?.type === 'ObjectExpression')
    .forEach((decl) => {
      for (const p of decl.init.properties) {
        const key = p.key.type === 'Identifier' ? p.key.name : p.key.value;
        if (key === propName) found = p;
      }
    });
  return found;
}

function firstApiCall(node) {
  let call = null;
  walk(node, (n) => {
    if (!call && n.type === 'CallExpression' && n.callee.type === 'MemberExpression'
      && n.callee.object.type === 'Identifier' && n.callee.object.name === 'api'
      && n.callee.property.type === 'Identifier') {
      call = n;
    }
  });
  return call;
}

function hasDataAccess(node) {
  let found = false;
  walk(node, (n) => {
    if (n.type === 'MemberExpression' && !n.computed && n.property.type === 'Identifier' && n.property.name === 'data') found = true;
  });
  return found;
}

function objectProps(objExpr) {
  const out = {};
  for (const p of objExpr.properties) out[p.key.name] = p.value;
  return out;
}

function resolveRelativeImport(fromRel, source) {
  const fromDir = path.dirname(fromRel);
  const target = path.join(fromDir, source).split(path.sep).join('/');
  for (const c of [target, `${target}.js`, `${target}/index.js`]) {
    const abs = path.join(MOBILE_ROOT, c);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return c;
  }
  return null;
}

function exportedNames(relPath) {
  const ast = parseMobileFile(relPath);
  const names = new Set();
  for (const node of ast.program.body) {
    if (node.type === 'ExportNamedDeclaration') {
      if (node.declaration) {
        const decl = node.declaration;
        if (decl.type === 'VariableDeclaration') {
          for (const d of decl.declarations) if (d.id.type === 'Identifier') names.add(d.id.name);
        } else if ((decl.type === 'FunctionDeclaration' || decl.type === 'ClassDeclaration') && decl.id) {
          names.add(decl.id.name);
        }
      }
      for (const spec of node.specifiers || []) {
        if (spec.type === 'ExportSpecifier') names.add(spec.exported.name);
      }
    } else if (node.type === 'ExportDefaultDeclaration') {
      names.add('default');
    }
  }
  return names;
}

test('every_api_js_call_matches_a_backend_route', () => {
  const routes = backendRoutes();
  const calls = clientCalls().filter((c) => c.path != null);
  const unmatchedKeys = [...new Set(
    calls.filter((c) => !routes.has(`${c.method} ${c.path}`)).map((c) => `${c.method} ${c.path}`)
  )];

  // The 4B contract for F-23 is frozen (T-13) even though the 4A backend
  // route it targets isn't merged into every checked-out tree — see S51.
  const markReadExists = routes.has('POST /notifications/{}/read');
  const allowlist = new Set(['GET /users/{}']);
  if (!markReadExists) allowlist.add('POST /notifications/{}/read');

  const reallyUnmatched = unmatchedKeys.filter((k) => !allowlist.has(k));
  assert.deepEqual(reallyUnmatched, [], `unexpected unmatched api.js calls: ${reallyUnmatched.join(', ')}`);
});

test('every_xAPI_member_access_is_a_defined_key', () => {
  const map = apiObjectKeys();
  const files = ['App.js', ...listMobileFiles('src')].filter((f) => f !== 'src/services/api.js');
  for (const rel of files) {
    let ast;
    try { ast = parseMobileFile(rel); } catch { continue; }
    findAll(ast, (node) => node.type === 'MemberExpression'
      && node.object.type === 'Identifier' && API_OBJECT_NAMES.includes(node.object.name)
      && !node.computed && node.property.type === 'Identifier')
      .forEach((node) => {
        const objName = node.object.name;
        const propName = node.property.name;
        const keys = map[objName];
        assert.ok(keys && keys.has(propName), `${rel}: ${objName}.${propName}`);
      });
  }
});

test('named_imports_resolve_to_real_exports', () => {
  const files = ['App.js', ...listMobileFiles('src')];
  for (const rel of files) {
    let ast;
    try { ast = parseMobileFile(rel); } catch { continue; }
    for (const node of ast.program.body) {
      if (node.type !== 'ImportDeclaration') continue;
      const source = node.source.value;
      if (!source.startsWith('.') || source.endsWith('.json')) continue;
      const target = resolveRelativeImport(rel, source);
      assert.ok(target, `${rel}: cannot resolve import '${source}'`);
      const exported = exportedNames(target);
      for (const spec of node.specifiers) {
        if (spec.type !== 'ImportSpecifier') continue;
        assert.ok(exported.has(spec.imported.name), `${rel}: '${spec.imported.name}' not exported by ${target} (from '${source}')`);
      }
    }
  }
});

test('no_usersAPI_identifier_anywhere', () => {
  const files = ['App.js', ...listMobileFiles('src')];
  for (const rel of files) {
    assert.ok(!/\busersAPI\b/.test(readMobile(rel)), rel);
  }
});

test('new_4b_client_functions_exact_method_and_path', () => {
  const deleteGroup = findApiProperty('groupsAPI', 'deleteGroup');
  assert.ok(deleteGroup, 'groupsAPI.deleteGroup missing');
  const dgCall = firstApiCall(deleteGroup.value);
  assert.equal(dgCall.callee.property.name, 'delete');
  assert.equal(normalizePath(literalToPath(dgCall.arguments[0])), '/groups/{}');
  assert.equal(hasDataAccess(deleteGroup.value), false, '204 has no body — deleteGroup must not read .data');

  const getGroupGoal = findApiProperty('groupsAPI', 'getGroupGoal');
  assert.ok(getGroupGoal, 'groupsAPI.getGroupGoal missing');
  const ggCall = firstApiCall(getGroupGoal.value);
  assert.equal(ggCall.callee.property.name, 'get');
  assert.equal(normalizePath(literalToPath(ggCall.arguments[0])), '/groups/{}/goal');

  const deregister = findApiProperty('userAPI', 'deregisterPushToken');
  assert.ok(deregister, 'userAPI.deregisterPushToken missing');
  const drCall = firstApiCall(deregister.value);
  assert.equal(drCall.callee.property.name, 'delete');
  assert.equal(literalToPath(drCall.arguments[0]), '/push-tokens/');

  const markRead = findApiProperty('notificationsAPI', 'markRead');
  assert.ok(markRead, 'notificationsAPI.markRead missing');
  const mrCall = firstApiCall(markRead.value);
  assert.equal(mrCall.callee.property.name, 'post');
  assert.equal(normalizePath(literalToPath(mrCall.arguments[0])), '/notifications/{}/read');
});

test('deregister_uses_10s_timeout_and_skipAuthExpired', () => {
  const deregister = findApiProperty('userAPI', 'deregisterPushToken');
  const call = firstApiCall(deregister.value);
  const opts = objectProps(call.arguments[1]);
  assert.equal(opts.timeout.value, 10000);
  assert.equal(opts.skipAuthExpired.value, true);
});

test('warmUp_targets_version_with_cold_start_timeout', () => {
  const ast = parseMobileFile('src/services/api.js');
  let warmUpDecl = null;
  findAll(ast, (n) => n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.id.name === 'warmUp')
    .forEach((n) => { warmUpDecl = n; });
  assert.ok(warmUpDecl, 'warmUp not found');
  const catchCall = warmUpDecl.init.body;
  assert.equal(catchCall.type, 'CallExpression');
  assert.equal(catchCall.callee.property.name, 'catch');
  const thenCall = catchCall.callee.object;
  assert.equal(thenCall.callee.property.name, 'then');
  const getCall = thenCall.callee.object;
  assert.equal(getCall.callee.object.name, 'api');
  assert.equal(getCall.callee.property.name, 'get');
  assert.equal(literalToPath(getCall.arguments[0]), '/version');
  const opts = objectProps(getCall.arguments[1]);
  assert.equal(opts.timeout.type, 'Identifier');
  assert.equal(opts.timeout.name, 'COLD_START_TIMEOUT');
  assert.equal(opts.skipAuthExpired.value, true);
});

test('mark_read_present_iff_backend_route_exists', (t) => {
  const exists = backendRoutes().has('POST /notifications/{}/read');
  if (!exists) {
    t.skip('F-23 route missing: 4A not merged');
    return;
  }
  const markRead = findApiProperty('notificationsAPI', 'markRead');
  assert.ok(markRead, 'notificationsAPI.markRead must exist once 4A ships the route');
  const call = firstApiCall(markRead.value);
  assert.equal(call.callee.property.name, 'post');
  assert.equal(normalizePath(literalToPath(call.arguments[0])), '/notifications/{}/read');
  assert.equal(call.arguments.length, 1, 'no body');
});
