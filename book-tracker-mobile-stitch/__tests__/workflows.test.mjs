// T-01 / T-22 — the two build workflows and the removed third one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT, parseYAML } from './_ast.mjs';

const WORKFLOWS_DIR = path.join(REPO_ROOT, '.github', 'workflows');
const APK_FILE = 'build-stitch-apk.yml';
const AAB_FILE = 'build-stitch-aab.yml';

function loadWorkflow(file) {
  return parseYAML(fs.readFileSync(path.join(WORKFLOWS_DIR, file), 'utf8'));
}

function steps(doc) {
  return doc.jobs.build.steps;
}

function stepNamed(doc, name) {
  return steps(doc).find((s) => s.name === name);
}

function stepIndex(doc, name) {
  return steps(doc).findIndex((s) => s.name === name);
}

test('workflows_parse_as_yaml', () => {
  assert.doesNotThrow(() => loadWorkflow(APK_FILE));
  assert.doesNotThrow(() => loadWorkflow(AAB_FILE));
});

test('both_install_with_npm_ci', () => {
  for (const file of [APK_FILE, AAB_FILE]) {
    const doc = loadWorkflow(file);
    const install = stepNamed(doc, 'Install dependencies');
    assert.ok(install, file);
    assert.equal(install.run, 'npm ci', file);
  }
});

test('no_npm_install_step', () => {
  for (const file of [APK_FILE, AAB_FILE]) {
    const doc = loadWorkflow(file);
    for (const step of steps(doc)) {
      assert.ok(!(step.run || '').includes('npm install'), `${file}: ${step.name}`);
    }
  }
});

test('version_guard_step_between_setup_node_and_install', () => {
  for (const file of [APK_FILE, AAB_FILE]) {
    const doc = loadWorkflow(file);
    const setupNode = stepIndex(doc, 'Setup Node.js');
    const guard = stepIndex(doc, 'Check version bump');
    const install = stepIndex(doc, 'Install dependencies');
    assert.ok(setupNode >= 0 && guard >= 0 && install >= 0, file);
    assert.ok(setupNode < guard, file);
    assert.ok(guard < install, file);
  }
});

test('aab_guard_strict_apk_guard_warn_only', () => {
  const aab = stepNamed(loadWorkflow(AAB_FILE), 'Check version bump');
  const apk = stepNamed(loadWorkflow(APK_FILE), 'Check version bump');
  assert.equal(aab.run, 'node scripts/check-version-bump.js --strict');
  assert.equal(apk.run, 'node scripts/check-version-bump.js');
});

test('build_android_yml_absent', () => {
  assert.equal(fs.existsSync(path.join(WORKFLOWS_DIR, 'build-android.yml')), false);
  const files = fs.readdirSync(WORKFLOWS_DIR).sort();
  assert.deepEqual(files, [AAB_FILE, APK_FILE].sort());
});

test('workflows_manual_dispatch_only_and_checkout_master', () => {
  for (const file of [APK_FILE, AAB_FILE]) {
    const doc = loadWorkflow(file);
    assert.deepEqual(Object.keys(doc.on), ['workflow_dispatch'], file);
    const checkout = stepNamed(doc, 'Checkout repository');
    assert.equal(checkout.with.ref, 'master', file);
  }
});

test('aab_production_bundle_apk_preview', () => {
  const aabBuild = stepNamed(loadWorkflow(AAB_FILE), 'Build Android AAB');
  assert.match(aabBuild.run, /--profile production/);
  assert.match(aabBuild.run, /\.\/build\.aab/);
  const apkBuild = stepNamed(loadWorkflow(APK_FILE), 'Build Android APK');
  assert.match(apkBuild.run, /--profile preview/);
  assert.match(apkBuild.run, /\.\/build\.apk/);
});
