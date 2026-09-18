// qa/unit/navigation.test.mjs
// ST-B1-08: goBackOrHome unit-tested without a browser. Stubs globalThis.window with a fake
// history.state.idx (as React Router's BrowserRouter stores it) and a spy `navigate`.
// Run: node --test qa/unit/navigation.test.mjs (or node --test qa/unit/)
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { goBackOrHome } = await import(pathToFileURL(path.join(REPO, 'book-tracker-frontend-stitch', 'src', 'utils', 'navigation.js')));

function spy() {
  const calls = [];
  const fn = (...args) => calls.push(args);
  fn.calls = calls;
  return fn;
}

test('idx: 2 -> navigate(-1)', () => {
  globalThis.window = { history: { state: { idx: 2 } } };
  const navigate = spy();
  goBackOrHome(navigate);
  assert.equal(navigate.calls.length, 1);
  assert.deepEqual(navigate.calls[0], [-1]);
});

test('idx: 0 -> navigate("/", { replace: true })', () => {
  globalThis.window = { history: { state: { idx: 0 } } };
  const navigate = spy();
  goBackOrHome(navigate);
  assert.equal(navigate.calls.length, 1);
  assert.deepEqual(navigate.calls[0], ['/', { replace: true }]);
});

test('state: null -> the "/" branch', () => {
  globalThis.window = { history: { state: null } };
  const navigate = spy();
  goBackOrHome(navigate);
  assert.equal(navigate.calls.length, 1);
  assert.deepEqual(navigate.calls[0], ['/', { replace: true }]);
});

test('state: {} (no idx) -> the "/" branch', () => {
  globalThis.window = { history: { state: {} } };
  const navigate = spy();
  goBackOrHome(navigate);
  assert.equal(navigate.calls.length, 1);
  assert.deepEqual(navigate.calls[0], ['/', { replace: true }]);
});

test.after(() => { delete globalThis.window; });
