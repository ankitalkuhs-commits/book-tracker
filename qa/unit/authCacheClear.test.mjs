// F-71: the in-memory GET cache must be emptied on sign-out AND on sign-in, so a second reader on
// the same tab cannot be served the first reader's library or notes from cache (60 s TTL).
//
// This is a static guard on purpose. The browser case that covers the same ground (L-4D-10b) could
// not be made to fail reliably when the calls were removed (mutations M-12 and M-24 were
// inconclusive, 2026-09-20), so a privacy fix would have had no test that provably fails when it is
// broken. Removing either call turns this red.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = path.join(REPO, 'book-tracker-frontend-stitch', 'src');
const authContext = fs.readFileSync(path.join(SRC, 'context', 'AuthContext.jsx'), 'utf8');

/** The body of `const <name> = (...) => { ... }`, up to the matching closing brace. */
function arrowBody(source, name) {
  const start = source.indexOf(`const ${name} = `);
  assert.notEqual(start, -1, `${name} not found in AuthContext.jsx`);
  const open = source.indexOf('{', start);
  assert.notEqual(open, -1, `${name} has no block body`);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) return source.slice(open, i + 1);
  }
  assert.fail(`unbalanced braces in ${name}`);
}

for (const fn of ['logout', 'login']) {
  test(`${fn} clears the whole GET cache (F-71)`, () => {
    const body = arrowBody(authContext, fn);
    const calls = [...body.matchAll(/cacheClear\(([^)]*)\)/g)].map(m => m[1].trim());
    assert.ok(calls.length >= 1, `${fn}() does not call cacheClear(): a second reader on this tab could be served the previous reader's cached GETs`);
    assert.ok(calls.includes(''), `${fn}() calls cacheClear(${calls.join(', ')}) with a prefix; F-71 needs the whole cache cleared, not one prefix`);
  });
}

test('cacheClear() with no prefix really empties every entry', () => {
  const api = fs.readFileSync(path.join(SRC, 'services', 'api.js'), 'utf8');
  const body = api.slice(api.indexOf('export function cacheClear'));
  const end = body.indexOf('\n}');
  const fnSource = body.slice(0, end);
  assert.match(fnSource, /!prefix \|\|/, 'cacheClear must delete every key when called without a prefix');
  assert.match(fnSource, /_cache\.delete\(key\)/, 'cacheClear must delete the matched keys');
});
