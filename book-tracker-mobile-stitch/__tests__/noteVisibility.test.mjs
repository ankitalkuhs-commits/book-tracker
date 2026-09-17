// Package C (T-22). Tests src/utils/noteVisibility.js — the zero-import
// parse/serialize helpers behind the Public/Private toggle (T-11).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseStoredVisibility, serializeVisibility } from '../src/utils/noteVisibility.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_PATH = path.join(__dirname, '..', 'src', 'utils', 'noteVisibility.js');

test('null_or_undefined_is_private', () => {
  assert.strictEqual(parseStoredVisibility(null), false);
  assert.strictEqual(parseStoredVisibility(undefined), false);
});

test('public_string_is_public', () => {
  assert.strictEqual(parseStoredVisibility('public'), true);
});

test('private_string_is_private', () => {
  assert.strictEqual(parseStoredVisibility('private'), false);
});

test('unexpected_values_are_private', () => {
  for (const v of ['PUBLIC', ' public', 'true', '1', '', '{"v":"public"}', true]) {
    assert.strictEqual(parseStoredVisibility(v), false, `expected false for ${JSON.stringify(v)}`);
  }
});

test('serialize_true_is_public_false_is_private', () => {
  assert.strictEqual(serializeVisibility(true), 'public');
  assert.strictEqual(serializeVisibility(false), 'private');
});

test('round_trip_preserves_choice', () => {
  assert.strictEqual(parseStoredVisibility(serializeVisibility(true)), true);
  assert.strictEqual(parseStoredVisibility(serializeVisibility(false)), false);
});

test('helper_has_no_imports_and_no_key_literal', () => {
  const src = fs.readFileSync(SOURCE_PATH, 'utf8');
  const codeOnly = src.split('\n').filter(line => !line.trim().startsWith('//')).join('\n');
  assert.ok(!/\bimport\s/.test(codeOnly), 'noteVisibility.js must not import anything');
  assert.ok(!/require\(/.test(codeOnly), 'noteVisibility.js must not require anything');
  assert.ok(!src.includes('bt_note_visibility'), 'noteVisibility.js must not contain the storage key literal');
});
