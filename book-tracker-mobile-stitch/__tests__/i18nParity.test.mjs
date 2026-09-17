// T-22 (A) — architecture §0.1: the 32 new 4B keys exist, with matching
// placeholders, in all six locales, and the six locale files stay in parity.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { MOBILE_ROOT, listMobileFiles } from './_ast.mjs';

const LOCALES_DIR = path.join(MOBILE_ROOT, 'src', 'i18n', 'locales');
const LOCALE_CODES = ['en', 'de', 'es', 'fr', 'pt', 'ru'];

function loadLocale(code) {
  return JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, `${code}.json`), 'utf8'));
}

function flatten(obj, prefix = '') {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' && !Array.isArray(v) ? flatten(v, `${prefix}${k}.`) : [`${prefix}${k}`]
  );
}

function get(obj, dotted) {
  return dotted.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}

function placeholders(str) {
  return [...String(str).matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).sort();
}

// architecture.md §0.1 — all 32 new keys.
const NEW_KEYS = [
  'auth.sessionExpiredTitle', 'auth.sessionExpiredBody',
  'notes.visibilityHintPrivate', 'notes.visibilityHintPublic', 'notes.savedPrivately',
  'groups.rejectRequestTitle', 'groups.rejectRequestConfirm',
  'a11y.back', 'a11y.close', 'a11y.openSettings', 'a11y.openProfile', 'a11y.openUserProfile',
  'a11y.notifications', 'a11y.changePhoto', 'a11y.addPhoto', 'a11y.removePhoto', 'a11y.removeTaggedBook',
  'a11y.postOptions', 'a11y.deletePost', 'a11y.deleteComment', 'a11y.editNote', 'a11y.deleteNote',
  'a11y.like', 'a11y.comments', 'a11y.sendComment', 'a11y.share', 'a11y.searchBooks', 'a11y.clearSearch',
  'a11y.rateStars', 'a11y.chooseAvatar', 'a11y.coverPreset', 'a11y.postVisibility',
];

test('all_locales_parse_as_json', () => {
  for (const code of LOCALE_CODES) {
    assert.doesNotThrow(() => loadLocale(code), code);
  }
});

test('key_sets_match_en_except_ru_few_many', () => {
  const en = new Set(flatten(loadLocale('en')));
  for (const code of ['de', 'es', 'fr', 'pt']) {
    const keys = new Set(flatten(loadLocale(code)));
    assert.deepEqual([...keys].sort(), [...en].sort(), code);
  }
  const ru = new Set(flatten(loadLocale('ru')));
  const ruMissing = [...en].filter((k) => !ru.has(k));
  assert.equal(ruMissing.length, 0, `ru missing: ${ruMissing.join(', ')}`);
  const ruExtra = [...ru].filter((k) => !en.has(k));
  for (const k of ruExtra) assert.match(k, /_(few|many)$/, k);
});

test('ru_plural_extras_have_base_key_in_en', () => {
  const en = new Set(flatten(loadLocale('en')));
  const ruExtra = flatten(loadLocale('ru')).filter((k) => !en.has(k) && /_(few|many)$/.test(k));
  assert.ok(ruExtra.length > 0);
  for (const k of ruExtra) {
    const base = k.replace(/_(few|many)$/, '');
    assert.ok(en.has(`${base}_one`) || en.has(base), k);
  }
});

test('new_4b_keys_present_in_every_locale', () => {
  for (const code of LOCALE_CODES) {
    const data = loadLocale(code);
    for (const key of NEW_KEYS) assert.notEqual(get(data, key), undefined, `${code}:${key}`);
  }
});

test('new_4b_values_non_empty_and_not_the_key', () => {
  for (const code of LOCALE_CODES) {
    const data = loadLocale(code);
    for (const key of NEW_KEYS) {
      const value = get(data, key);
      assert.equal(typeof value, 'string', `${code}:${key}`);
      assert.ok(value.length > 0, `${code}:${key}`);
      assert.notEqual(value, key, `${code}:${key}`);
    }
  }
});

test('placeholders_match_en_for_new_keys', () => {
  const en = loadLocale('en');
  for (const code of LOCALE_CODES) {
    const data = loadLocale(code);
    for (const key of NEW_KEYS) {
      assert.deepEqual(placeholders(get(data, key)), placeholders(get(en, key)), `${code}:${key}`);
    }
  }
});

test('saved_privately_en_text_exact', () => {
  const en = loadLocale('en');
  assert.equal(en.notes.savedPrivately, 'Saved privately — find it on your Profile');
});

test('every_4b_t_key_used_in_src_exists_in_en', () => {
  const en = loadLocale('en');
  const prefixes = ['auth.sessionExpired', 'notes.visibility', 'notes.savedPrivately', 'groups.rejectRequest', 'a11y.'];
  const files = ['App.js', ...listMobileFiles('src')];
  const used = new Set();
  const callRe = /\bt\(\s*['"]([\w.]+)['"]/g;
  for (const rel of files) {
    const abs = path.join(MOBILE_ROOT, rel);
    if (!fs.existsSync(abs)) continue;
    const src = fs.readFileSync(abs, 'utf8');
    let m;
    while ((m = callRe.exec(src))) {
      const key = m[1];
      if (prefixes.some((p) => key.startsWith(p))) used.add(key);
    }
  }
  assert.ok(used.size > 0, 'expected at least one new 4B t() call in src');
  for (const key of used) {
    const base = key.replace(/_(one|other)$/, '');
    assert.ok(get(en, key) !== undefined || get(en, base) !== undefined, key);
  }
});
