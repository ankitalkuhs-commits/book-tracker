// qa/unit/languagePicker.test.mjs
// The language control for signed-out visitors.
//
// The bug: i18n/index.js detects with `order: ['localStorage', 'navigator']`, so a first-time
// visitor is put into whatever language their browser reports. The only switcher in the web app
// lived in SettingsPage, which is behind PrivateRoute - so a visitor auto-detected into a
// language they could not read had to sign in, in that language, to find the control. Reported
// from production: trackmyread.com rendered in Russian for an English-speaking visitor.
//
// These are source assertions, not render assertions - JSX cannot be imported by Node. What they
// prove is that the control exists, that it is on the PUBLIC side of the auth boundary, and that
// its list of languages is the one i18n actually supports rather than a re-typed copy.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = path.join(REPO, 'book-tracker-frontend-stitch', 'src');
const P = {
  picker: path.join(SRC, 'components', 'LanguagePicker.jsx'),
  login: path.join(SRC, 'pages', 'LoginPage.jsx'),
  i18n: path.join(SRC, 'i18n', 'index.js'),
  app: path.join(SRC, 'App.jsx'),
  settings: path.join(SRC, 'pages', 'SettingsPage.jsx'),
};
for (const [k, p] of Object.entries(P)) {
  assert.ok(fs.existsSync(p), `${k} missing - expected ${p}`);
}
const S = Object.fromEntries(Object.entries(P).map(([k, p]) => [k, fs.readFileSync(p, 'utf8')]));

test('the_language_picker_is_rendered_on_the_signed_out_login_page', () => {
  assert.match(S.login, /import LanguagePicker from '\.\.\/components\/LanguagePicker'/,
    'LoginPage does not import LanguagePicker');
  assert.match(S.login, /<LanguagePicker\s*\/>/,
    'LanguagePicker is imported but never rendered');

  // It must be in the header, which is above the fold and present before any sign-in.
  const header = S.login.match(/<header[\s\S]*?<\/header>/);
  assert.ok(header, 'LoginPage has no <header> - this positional check is stale');
  assert.match(header[0], /<LanguagePicker\s*\/>/,
    'LanguagePicker is rendered somewhere other than the header');

  // And the route that renders LoginPage must NOT be wrapped in PrivateRoute, or the whole
  // point is lost: the control would again be unreachable to the people who need it.
  const route = S.app.split('\n').find((l) => l.includes('<LoginPage'));
  assert.ok(route, 'no route renders LoginPage');
  assert.doesNotMatch(route, /PrivateRoute/,
    'LoginPage is behind PrivateRoute - a signed-out visitor could not reach the picker');
});

test('the_picker_offers_exactly_the_languages_i18n_supports', () => {
  // Read from the i18n module, never re-typed here: a list that agrees only with itself would
  // let the picker offer a language with no bundle, or hide one that exists.
  const block = S.i18n.match(/export const SUPPORTED_LANGUAGES\s*=\s*\[([\s\S]*?)\];/);
  assert.ok(block, 'SUPPORTED_LANGUAGES was not found in i18n/index.js');
  const codes = [...block[1].matchAll(/code:\s*'([a-z-]+)'/g)].map((m) => m[1]);
  assert.equal(codes.length, 6, `expected 6 supported languages, found ${codes.length}: ${codes}`);

  // every advertised code has a bundle imported
  for (const c of codes) {
    assert.match(S.i18n, new RegExp(`import ${c} from '\\./locales/${c}\\.json'`),
      `language '${c}' is offered but ./locales/${c}.json is never imported`);
  }

  // the picker maps that same array rather than declaring its own
  assert.match(S.picker, /import \{ changeLanguage, SUPPORTED_LANGUAGES \} from '\.\.\/i18n'/,
    'LanguagePicker does not import SUPPORTED_LANGUAGES from i18n');
  assert.match(S.picker, /SUPPORTED_LANGUAGES\.map\(/,
    'LanguagePicker does not render the supported list');
  assert.doesNotMatch(S.picker, /code:\s*'(en|ru|es|pt|de|fr)'/,
    'LanguagePicker declares its own language list instead of using i18n\'s');

  // and selecting one must persist, or the choice is lost on the next page load
  assert.match(S.picker, /changeLanguage\(/, 'the picker never calls changeLanguage');
  assert.match(S.i18n, /localStorage\.setItem\(LANGUAGE_KEY, code\)/,
    'changeLanguage does not persist the choice');
});

test('the_picker_is_not_put_on_pages_that_are_not_translated', () => {
  // /privacy, /support, /terms and /about carry no t() calls, so a picker there would restyle
  // the chrome and leave the page in English - a control that visibly does nothing. This is a
  // deliberate scope boundary, so it is pinned.
  const untranslated = ['PrivacyPage', 'SupportPage', 'TermsPage', 'AboutPage'];
  for (const name of untranslated) {
    const f = path.join(SRC, 'pages', `${name}.jsx`);
    if (!fs.existsSync(f)) continue;
    const src = fs.readFileSync(f, 'utf8');
    const calls = (src.match(/\bt\('/g) || []).length;
    if (calls === 0) {
      assert.doesNotMatch(src, /<LanguagePicker/,
        `${name} has no t() calls but renders the picker - it would change nothing on that page`);
    }
  }
  // Non-vacuity: at least one of them must actually exist and be untranslated today, or this
  // case is asserting about an empty set.
  const checked = untranslated
    .map((n) => path.join(SRC, 'pages', `${n}.jsx`))
    .filter((f) => fs.existsSync(f) && (fs.readFileSync(f, 'utf8').match(/\bt\('/g) || []).length === 0);
  assert.ok(checked.length >= 1,
    'every public page is translated now - re-scope this case rather than leaving it vacuous');

  // SettingsPage keeps its own switcher: this adds a public one, it does not move the private one.
  assert.match(S.settings, /SUPPORTED_LANGUAGES\.map\(/,
    'the Settings language switcher was removed - signed-in readers lost their control');
});
