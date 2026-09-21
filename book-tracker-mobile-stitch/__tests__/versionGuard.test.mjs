// T-01 / T-22 — scripts/check-version-bump.js behaves per architecture.md T-01.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MOBILE_ROOT, readMobile } from './_ast.mjs';

const SCRIPT_SRC = path.join(MOBILE_ROOT, 'scripts', 'check-version-bump.js');

function makeFixture(versionCode) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bt-version-guard-'));
  fs.mkdirSync(path.join(tmp, 'scripts'));
  fs.mkdirSync(path.join(tmp, 'release'));
  fs.copyFileSync(SCRIPT_SRC, path.join(tmp, 'scripts', 'check-version-bump.js'));
  return tmp;
}

function writeFixture(tmp, { version, versionCode, lastVersion, lastVersionCode }) {
  fs.writeFileSync(path.join(tmp, 'app.json'), JSON.stringify({ expo: { version, android: { versionCode } } }));
  fs.writeFileSync(path.join(tmp, 'release', 'last-released.json'), JSON.stringify({ version: lastVersion, versionCode: lastVersionCode }));
}

function fixture(opts) {
  const tmp = makeFixture();
  writeFixture(tmp, opts);
  return tmp;
}

function run(cwd, args = []) {
  return spawnSync(process.execPath, ['scripts/check-version-bump.js', ...args], { cwd, encoding: 'utf8' });
}

test('strict_exits_1_when_versionCode_equals_last', () => {
  const tmp = fixture({ version: '2.2.2', versionCode: 61, lastVersion: '2.2.1', lastVersionCode: 61 });
  const r = run(tmp, ['--strict']);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /::error::/);
});

test('strict_exits_1_when_versionCode_below_last', () => {
  const tmp = fixture({ version: '2.2.2', versionCode: 60, lastVersion: '2.2.1', lastVersionCode: 61 });
  const r = run(tmp, ['--strict']);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /::error::/);
});

test('strict_exits_1_when_version_string_unchanged', () => {
  const tmp = fixture({ version: '2.2.1', versionCode: 61, lastVersion: '2.2.1', lastVersionCode: 60 });
  const r = run(tmp, ['--strict']);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /::error::/);
});

test('strict_exits_1_when_versionCode_not_integer', () => {
  for (const versionCode of ['61', 61.5]) {
    const tmp = fixture({ version: '2.2.2', versionCode, lastVersion: '2.2.1', lastVersionCode: 60 });
    const r = run(tmp, ['--strict']);
    assert.equal(r.status, 1, `versionCode=${JSON.stringify(versionCode)}`);
  }
});

test('strict_exits_0_when_both_bumped', () => {
  const tmp = fixture({ version: '2.2.2', versionCode: 61, lastVersion: '2.2.1', lastVersionCode: 60 });
  const r = run(tmp, ['--strict']);
  assert.equal(r.status, 0);
  assert.doesNotMatch(r.stdout, /::error::/);
  assert.doesNotMatch(r.stdout, /::warning::/);
});

test('non_strict_exits_0_with_warning_when_not_bumped', () => {
  const tmp = fixture({ version: '2.2.1', versionCode: 60, lastVersion: '2.2.1', lastVersionCode: 60 });
  const r = run(tmp);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /::warning::/);
});

test('non_strict_exits_0_without_warning_when_bumped', () => {
  const tmp = fixture({ version: '2.2.2', versionCode: 61, lastVersion: '2.2.1', lastVersionCode: 60 });
  const r = run(tmp);
  assert.equal(r.status, 0);
  assert.doesNotMatch(r.stdout, /::warning::/);
});

test('always_prints_compared_values', () => {
  const tmp = fixture({ version: '2.2.2', versionCode: 61, lastVersion: '2.2.1', lastVersionCode: 60 });
  const r = run(tmp, ['--strict']);
  assert.match(r.stdout, /61/);
  assert.match(r.stdout, /60/);
});

test('committed_tree_passes_strict', () => {
  const r = spawnSync(process.execPath, ['scripts/check-version-bump.js', '--strict'], { cwd: MOBILE_ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  // Sprint 4C (K-11): the committed versionCode/lastVersionCode move with every
  // release, so read the expected numbers from the two committed JSON files
  // instead of hard-coding them.
  const appJson = JSON.parse(readMobile('app.json'));
  const lastReleased = JSON.parse(readMobile('release/last-released.json'));
  assert.match(r.stdout, new RegExp(String(appJson.expo.android.versionCode)));
  assert.match(r.stdout, new RegExp(String(lastReleased.versionCode)));
});

test('script_uses_no_network_env_or_child_process', () => {
  const src = readMobile('scripts/check-version-bump.js');
  for (const forbidden of ["require('http", 'require("http', "require('https", 'require("https', "require('net", 'require("net', "require('child_process", 'require("child_process', 'process.env']) {
    assert.ok(!src.includes(forbidden), forbidden);
  }
});
