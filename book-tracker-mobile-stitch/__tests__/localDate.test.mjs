// Sprint 4C (F-62) — src/services/localDate.js: a reader's day is their own
// local day. M-01..M-12, tests.md section 4.1. Mirrors qa/unit/localDate.test.mjs
// (WEB, W-01..W-06) plus the Android-only daysUntil / interceptor / screen cases.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseMobileFile, readMobile, walk, findAll, parseJS,
} from './_ast.mjs';
import { deviceTimeZone, parseDayLabel, daysUntil } from '../src/services/localDate.js';

// ── Import guard (same shape as the WEB unit file) ──────────────────────────
assert.equal(typeof deviceTimeZone, 'function');
assert.equal(typeof parseDayLabel, 'function');
assert.equal(typeof daysUntil, 'function');

function withTZ(tz, fn) {
  const saved = process.env.TZ;
  try {
    process.env.TZ = tz;
    return fn();
  } finally {
    if (saved === undefined) delete process.env.TZ; else process.env.TZ = saved;
  }
}

// ── M-01 ─────────────────────────────────────────────────────────────────────
test('device_zone_is_a_string_under_node', () => {
  const z = deviceTimeZone();
  assert.equal(typeof z, 'string');
  assert.ok(z.length >= 1 && z.length <= 64, `unexpected zone length: ${JSON.stringify(z)}`);
});

// ── M-02 ─────────────────────────────────────────────────────────────────────
test('device_zone_null_for_bad_intl', () => {
  const badStubs = [
    { DateTimeFormat: () => ({ resolvedOptions: () => ({ timeZone: undefined }) }) },
    { DateTimeFormat: () => ({ resolvedOptions: () => ({ timeZone: '' }) }) },
    { DateTimeFormat: () => ({ resolvedOptions: () => ({ timeZone: 'A'.repeat(65) }) }) },
    { DateTimeFormat: () => ({ resolvedOptions: () => { throw new Error('boom'); } }) },
  ];
  for (const stub of badStubs) {
    assert.equal(deviceTimeZone(stub), null);
  }
  // Control: a working stub must come back through, else the badStubs above prove nothing.
  const control = { DateTimeFormat: () => ({ resolvedOptions: () => ({ timeZone: 'Asia/Tokyo' }) }) };
  assert.equal(deviceTimeZone(control), 'Asia/Tokyo');
});

// ── M-03 ─────────────────────────────────────────────────────────────────────
test('parse_day_label_is_local_west_of_utc', () => {
  withTZ('America/Los_Angeles', () => {
    assert.equal(new Date('2026-10-03').getDate(), 2, 'TZ injection did not take effect');
    const d = parseDayLabel('2026-10-03');
    assert.ok(d);
    assert.equal(d.getFullYear(), 2026);
    assert.equal(d.getMonth(), 9);
    assert.equal(d.getDate(), 3);
    assert.equal(d.getHours(), 0);
  });
});

// ── M-04 ─────────────────────────────────────────────────────────────────────
test('parse_month_label_is_first_of_month_local', () => {
  withTZ('America/Los_Angeles', () => {
    assert.equal(new Date('2026-10').getMonth(), 8, 'TZ injection did not take effect');
    const d = parseDayLabel('2026-10');
    assert.ok(d);
    assert.equal(d.getFullYear(), 2026);
    assert.equal(d.getMonth(), 9);
    assert.equal(d.getDate(), 1);
    assert.equal(d.getHours(), 0);
  });
});

// ── M-05 ─────────────────────────────────────────────────────────────────────
test('parse_day_label_rejects_bad_input', () => {
  for (const bad of [null, undefined, 20261003, '', '2026-1-3', '2026-10-03T00:00:00Z', '03/10/2026', ' 2026-10-03']) {
    assert.equal(parseDayLabel(bad), null, JSON.stringify(bad));
  }
});

// ── M-06 ─────────────────────────────────────────────────────────────────────
test('days_until_fall_back_25_hour_day', () => {
  withTZ('America/New_York', () => {
    const now = new Date(2026, 10, 1, 23, 0);
    // Control: the old UTC-parse formula is wrong (<=0) at this instant — proves this case bites.
    const oldFormula = Math.ceil((new Date('2026-11-02') - now) / 86_400_000);
    assert.ok(oldFormula <= 0, `control: expected the old formula to be <=0, got ${oldFormula}`);
    assert.equal(daysUntil('2026-11-02', now), 1);
  });
});

// ── M-07 ─────────────────────────────────────────────────────────────────────
test('days_until_spring_forward_23_hour_day', () => {
  withTZ('America/New_York', () => {
    const hours = (new Date(2026, 2, 9) - new Date(2026, 2, 8)) / 36e5;
    assert.equal(hours, 23, 'control: expected a 23-hour spring-forward day between Mar 8 and Mar 9, 2026');
    assert.equal(daysUntil('2026-03-09', new Date(2026, 2, 8, 12, 0)), 1);
  });
});

// ── M-08 ─────────────────────────────────────────────────────────────────────
test('days_until_today_past_and_bad', () => {
  const now = new Date(2026, 8, 18, 10, 0);
  const label = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  assert.equal(daysUntil(label(now), now), 0);
  const yesterday = new Date(2026, 8, 17, 10, 0);
  assert.equal(daysUntil(label(yesterday), now), -1);
  assert.equal(daysUntil('x', now), null);
});

// ── M-09 ─────────────────────────────────────────────────────────────────────
function findInterceptorUseCalls(ast, kind) {
  return findAll(ast, (n) => n.type === 'CallExpression'
    && n.callee.type === 'MemberExpression'
    && n.callee.property.type === 'Identifier' && n.callee.property.name === 'use'
    && n.callee.object.type === 'MemberExpression'
    && n.callee.object.property.type === 'Identifier' && n.callee.object.property.name === kind
    && n.callee.object.object.type === 'MemberExpression'
    && n.callee.object.object.property.type === 'Identifier' && n.callee.object.object.property.name === 'interceptors'
    && n.callee.object.object.object.type === 'Identifier' && n.callee.object.object.object.name === 'api');
}

function setsXTimezoneFromDeviceZone(fnNode) {
  if (!fnNode || !fnNode.body) return false;
  const tzVars = findAll(fnNode.body, (n) => n.type === 'VariableDeclarator'
    && n.id.type === 'Identifier'
    && n.init && n.init.type === 'CallExpression'
    && n.init.callee.type === 'Identifier' && n.init.callee.name === 'deviceTimeZone'
    && n.init.arguments.length === 0);
  for (const decl of tzVars) {
    const varName = decl.id.name;
    const ifs = findAll(fnNode.body, (n) => n.type === 'IfStatement'
      && n.test.type === 'Identifier' && n.test.name === varName);
    for (const ifStmt of ifs) {
      let assigns = false;
      walk(ifStmt.consequent, (n) => {
        if (n.type === 'AssignmentExpression'
          && n.left.type === 'MemberExpression' && n.left.computed
          && n.left.property.type === 'StringLiteral' && n.left.property.value === 'X-Timezone'
          && n.left.object.type === 'MemberExpression'
          && n.left.object.property.type === 'Identifier' && n.left.object.property.name === 'headers') {
          assigns = true;
        }
      });
      if (assigns) return true;
    }
  }
  return false;
}

test('request_interceptor_sets_x_timezone_per_request', () => {
  const src = readMobile('src/services/api.js');
  assert.match(src, /import \{ deviceTimeZone \} from '\.\/localDate';/);

  const ast = parseMobileFile('src/services/api.js');
  const requestCalls = findInterceptorUseCalls(ast, 'request');
  assert.equal(requestCalls.length, 1, 'expected exactly 1 api.interceptors.request.use(...) call');
  assert.ok(setsXTimezoneFromDeviceZone(requestCalls[0].arguments[0]),
    'the request interceptor must set config.headers[\'X-Timezone\'] from deviceTimeZone(), inside an if guarding that value');

  // Control: the same walker over a synthetic snippet that only touches the
  // RESPONSE interceptor finds no request interceptor at all.
  const synthetic = `
    api.interceptors.response.use(
      (response) => response,
      async (error) => {
        const tz = deviceTimeZone();
        if (tz) { config.headers['X-Timezone'] = tz; }
        return Promise.reject(error);
      }
    );
  `;
  const synthAst = parseJS(synthetic);
  assert.equal(findInterceptorUseCalls(synthAst, 'request').length, 0);
});

// ── M-10 ─────────────────────────────────────────────────────────────────────
test('insights_screen_parses_labels_locally', () => {
  const ast = parseMobileFile('src/screens/InsightsScreen.js');
  const fnNames = ['shortMonth', 'shortDate', 'daysLeft'];
  const fns = findAll(ast, (n) => n.type === 'FunctionDeclaration' && n.id && fnNames.includes(n.id.name));
  assert.equal(fns.length, 3, `expected shortMonth, shortDate and daysLeft; found ${fns.map((f) => f.id.name).join(', ')}`);

  let newDateWithArgViolations = 0;
  for (const fn of fns) {
    const paramName = fn.params[0]?.type === 'Identifier' ? fn.params[0].name : null;
    walk(fn.body, (n) => {
      if (n.type === 'NewExpression' && n.callee.type === 'Identifier' && n.callee.name === 'Date'
        && n.arguments.some((a) => a.type === 'Identifier' && a.name === paramName)) {
        newDateWithArgViolations++;
      }
    });
    const wantFn = fn.id.name === 'daysLeft' ? 'daysUntil' : 'parseDayLabel';
    let callsExpected = false;
    walk(fn.body, (n) => {
      if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === wantFn) callsExpected = true;
    });
    assert.ok(callsExpected, `${fn.id.name} must call ${wantFn}`);
  }
  assert.strictEqual(newDateWithArgViolations, 0, 'shortMonth/shortDate/daysLeft must not parse the label with new Date(<argument>)');
});

// ── M-11 ─────────────────────────────────────────────────────────────────────
test('local_date_module_is_import_free', () => {
  const src = readMobile('src/services/localDate.js');
  assert.ok(!/\brequire\(/.test(src));
  const ast = parseMobileFile('src/services/localDate.js');
  assert.equal(findAll(ast, (n) => n.type === 'ImportDeclaration').length, 0);
  const exportNames = findAll(ast, (n) => n.type === 'ExportNamedDeclaration'
    && n.declaration?.type === 'FunctionDeclaration' && n.declaration.id)
    .map((n) => n.declaration.id.name);
  assert.ok(exportNames.length >= 3, `expected >= 3 named function exports, found ${exportNames.join(', ')}`);
});

// ── M-12 ─────────────────────────────────────────────────────────────────────
test('app_json_is_2_2_3_62', () => {
  const appJson = JSON.parse(readMobile('app.json'));
  assert.equal(appJson.expo.version, '2.2.3');
  assert.equal(appJson.expo.android.versionCode, 62);
});
