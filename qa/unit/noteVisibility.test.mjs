// qa/unit/noteVisibility.test.mjs
// ST-B2-08: readNoteVisibility / writeNoteVisibility behave under every storage state, including
// localStorage being entirely absent (private mode / site data disabled) — the module's own try/catch
// must swallow that ReferenceError rather than let it crash the composer.
// Run: node --test qa/unit/noteVisibility.test.mjs (or node --test qa/unit/)
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { NOTE_VISIBILITY_KEY, readNoteVisibility, writeNoteVisibility } =
  await import(pathToFileURL(path.join(REPO, 'book-tracker-frontend-stitch', 'src', 'utils', 'noteVisibility.js')));

assert.equal(NOTE_VISIBILITY_KEY, 'bt_note_visibility');

function fakeStorage(initial = null) {
  const store = new Map();
  if (initial !== null) store.set(NOTE_VISIBILITY_KEY, initial);
  return {
    getItem: key => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, value),
    _store: store,
  };
}

test.afterEach(() => { delete globalThis.localStorage; });

test('(a) localStorage undefined -> "private", and write does not throw', () => {
  delete globalThis.localStorage;
  assert.equal(readNoteVisibility(), 'private');
  assert.doesNotThrow(() => writeNoteVisibility('public'));
});

test('(b) getItem returns null -> "private"', () => {
  globalThis.localStorage = fakeStorage(null);
  assert.equal(readNoteVisibility(), 'private');
});

test('(c) getItem returns "public" -> "public"', () => {
  globalThis.localStorage = fakeStorage('public');
  assert.equal(readNoteVisibility(), 'public');
});

test('(d) only the exact string "public" counts', () => {
  for (const v of ['PUBLIC', 'yes', '']) {
    globalThis.localStorage = fakeStorage(v);
    assert.equal(readNoteVisibility(), 'private', `value "${v}" should read as private`);
  }
});

test('(e) writeNoteVisibility normalizes to public/private under the one key', () => {
  const storage = fakeStorage(null);
  globalThis.localStorage = storage;
  writeNoteVisibility('anything-else');
  assert.equal(storage._store.get(NOTE_VISIBILITY_KEY), 'private');
  writeNoteVisibility('public');
  assert.equal(storage._store.get(NOTE_VISIBILITY_KEY), 'public');
  assert.deepEqual([...storage._store.keys()], [NOTE_VISIBILITY_KEY]);
});
