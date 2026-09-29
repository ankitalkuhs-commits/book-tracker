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
  // Only the build workflows are this test's business. The directory also holds unrelated
  // workflows (keep-oregon-awake.yml, and since Sprint 4F tmr-bots.yml and ci-tests.yml),
  // so matching the whole listing made an operational change fail an Android build test —
  // it went red on master when keep-oregon-awake.yml landed. The `build-` filter is what
  // fixed that, and adding the 4F workflows needs no change to it: neither is a build.
  // The set of workflows that may build this app is pinned by the next test instead.
  const builds = fs.readdirSync(WORKFLOWS_DIR).filter((f) => f.startsWith('build-')).sort();
  assert.deepEqual(builds, [AAB_FILE, APK_FILE].sort());
});

// C-20 (tests.md, Sprint 4F K-02). The listing assertion above is deliberately scoped to
// `build-*`, so a new unrelated workflow cannot fail an Android test. What still must not
// happen is a workflow OUTSIDE that pair building or submitting the app — that is the
// thing the old whole-directory deepEqual was really protecting, and this is the version
// of it that survives an operational file landing in the same folder.
test('only_the_two_build_workflows_build_the_app', () => {
  const offenders = [];
  for (const file of fs.readdirSync(WORKFLOWS_DIR).sort()) {
    if (!file.endsWith('.yml') && !file.endsWith('.yaml')) continue;
    if (file === APK_FILE || file === AAB_FILE) continue;
    const text = fs.readFileSync(path.join(WORKFLOWS_DIR, file), 'utf8');
    if (/eas\s+(build|submit)|expo\s+(build|publish)/i.test(text)) offenders.push(file);
  }
  assert.deepEqual(offenders, []);
  // Control: the detector is not vacuous — the two real build workflows do match it.
  for (const file of [APK_FILE, AAB_FILE]) {
    const text = fs.readFileSync(path.join(WORKFLOWS_DIR, file), 'utf8');
    assert.match(text, /eas\s+build/i, file);
  }
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
