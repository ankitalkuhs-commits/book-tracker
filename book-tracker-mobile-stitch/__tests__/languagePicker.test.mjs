// The mobile language control for readers who have not signed in.
//
// src/i18n/index.js chooses with `savedLang || detectLanguage()`, and detectLanguage reads the
// device locale. The only switcher used to live in SettingsScreen, behind the auth gate, so a
// reader whose phone is in a language they do not read had to sign in - in that language - to
// find it. Same defect the web had; fixed there in 4725863.
//
// Source assertions, not render assertions: JSX cannot be imported by Node. What they prove is
// that the control exists, that it is on LoginScreen (the pre-auth side), and that its list is
// i18n's own rather than a re-typed copy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readMobile, existsInMobile, parseMobileFile, findAll } from './_ast.mjs';

const PICKER = 'src/components/LanguagePicker.js';
const LOGIN = 'src/screens/LoginScreen.js';
const I18N = 'src/i18n/index.js';
const SETTINGS = 'src/screens/SettingsScreen.js';

test('the_language_picker_is_on_the_pre_auth_login_screen', () => {
  assert.ok(existsInMobile(PICKER), `${PICKER} is missing`);
  const login = readMobile(LOGIN);

  assert.match(login, /import LanguagePicker from '\.\.\/components\/LanguagePicker';/,
    'LoginScreen does not import LanguagePicker');
  assert.match(login, /<LanguagePicker\s*\/>/,
    'LanguagePicker is imported but never rendered');

  // It must be rendered by LoginScreen itself, which is the screen shown before auth.
  // Asserted from the AST so a commented-out or string occurrence cannot satisfy it.
  const ast = parseMobileFile(LOGIN);
  const used = findAll(ast, (n) => n.type === 'JSXElement'
    && n.openingElement?.name?.name === 'LanguagePicker');
  assert.equal(used.length, 1, `expected exactly one <LanguagePicker/>, found ${used.length}`);
});

test('the_mobile_picker_uses_i18n_own_language_list_and_persists', () => {
  const picker = readMobile(PICKER);
  const i18n = readMobile(I18N);

  const block = i18n.match(/export const SUPPORTED_LANGUAGES\s*=\s*\[([\s\S]*?)\];/);
  assert.ok(block, 'SUPPORTED_LANGUAGES was not found in i18n/index.js');
  const codes = [...block[1].matchAll(/code:\s*'([a-z-]+)'/g)].map((m) => m[1]);
  assert.equal(codes.length, 6, `expected 6 languages, found ${codes.length}: ${codes}`);
  for (const c of codes) {
    assert.match(i18n, new RegExp(`import ${c} from '\\./locales/${c}\\.json'`),
      `language '${c}' is offered but ./locales/${c}.json is never imported`);
  }

  assert.match(picker, /import \{ changeLanguage, SUPPORTED_LANGUAGES \} from '\.\.\/i18n';/,
    'the picker does not import SUPPORTED_LANGUAGES from i18n');
  assert.match(picker, /SUPPORTED_LANGUAGES\.map\(/, 'the picker does not render the supported list');
  assert.doesNotMatch(picker, /code:\s*'(en|ru|es|pt|de|fr)'/,
    'the picker declares its own language list instead of using i18n\'s');

  // The choice has to outlive the process, or the reader fixes it once per launch.
  assert.match(picker, /changeLanguage\(/, 'the picker never calls changeLanguage');
  assert.match(i18n, /AsyncStorage\.setItem\(LANGUAGE_KEY, code\)/,
    'changeLanguage does not persist the choice to AsyncStorage');
  assert.match(i18n, /AsyncStorage\.getItem\(LANGUAGE_KEY\)/,
    'initI18n never reads the saved language back');

  // SettingsScreen keeps its own switcher: this ADDS a pre-auth control, it does not move
  // the one signed-in readers already use.
  assert.match(readMobile(SETTINGS), /SUPPORTED_LANGUAGES\.map\(/,
    'the Settings language switcher was removed - signed-in readers lost their control');
});

test('the_mobile_picker_is_sized_per_render_not_at_module_scope', () => {
  // A-15's rule, and the reason seven files were rewritten on 2026-10-11: Dimensions.get() at
  // module scope freezes the first value, so the sheet comes out phone-shaped on an iPad and
  // never recovers on rotation. The picker renders a Modal, so it is subject to the same trap.
  const picker = readMobile(PICKER);
  assert.doesNotMatch(picker, /Dimensions\.get\(/,
    'LanguagePicker calls Dimensions.get() - use useWindowDimensions() so it re-measures');
  assert.match(picker, /useWindowDimensions\(\)/,
    'the picker does not measure the window per render');
});
