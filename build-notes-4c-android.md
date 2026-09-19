# Build Notes — Sprint 4C, Package ANDROID

`book-tracker-mobile-stitch` only. A reader's day is their own local day (F-62).
Built from branch `sprint-4c-local-day` at `6a08bae`, fast-forwarded onto this worktree's
`bc38891`. Sources: `features/reading-stats/sprint-4c-local-day/{spec,architecture,tests}.md`.

## What was built

1. **`src/services/localDate.js` (new, import-free)** — `deviceTimeZone()`, `parseDayLabel()`,
   `daysUntil()`, exactly per architecture.md's Android specimen. Kept import-free like
   `httpPolicy.js` so Node's test runner can load it without Metro / React Native.
2. **`src/services/api.js`** — the request interceptor now reads `deviceTimeZone()` per request
   and sets `X-Timezone` on `config.headers` when it is non-null (R-07). Computed inside the
   interceptor callback, not hoisted to module scope, so a zone change on the device is picked
   up on the very next request.
3. **`src/screens/InsightsScreen.js`** — `shortMonth`, `shortDate` and `daysLeft` no longer
   parse server date-only labels with `new Date(dateStr)` (UTC midnight, wrong day west of UTC).
   They call `parseDayLabel` / `daysUntil` from the new module (R-15).
4. **`app.json`** — `version` 2.2.2 → **2.2.3**, `android.versionCode` 61 → **62** (R-17).
5. **`__tests__/localDate.test.mjs` (new)** — M-01..M-12 from tests.md section 4.1.
6. **`__tests__/versionGuard.test.mjs`** — K-11 fix: `committed_tree_passes_strict` no longer
   hard-codes `/61/` / `/60/` (which the 2.2.3/62 bump breaks); it reads the expected
   versionCodes from `app.json` and `release/last-released.json` instead. Test count unchanged
   (1 existing test modified, not added).

`release/last-released.json` was **not** touched, as instructed — that update belongs to the
2.2.2 release step, not this package.

## Files changed (exhaustive, matches the brief's ANDROID scope)

- `book-tracker-mobile-stitch/src/services/localDate.js` (new)
- `book-tracker-mobile-stitch/src/services/api.js`
- `book-tracker-mobile-stitch/src/screens/InsightsScreen.js`
- `book-tracker-mobile-stitch/app.json`
- `book-tracker-mobile-stitch/__tests__/localDate.test.mjs` (new)
- `book-tracker-mobile-stitch/__tests__/versionGuard.test.mjs`

No file outside this list was touched. `npm ci` ran in this worktree's
`book-tracker-mobile-stitch/` only; `package.json` / `package-lock.json` show no diff
(checked with `git status --short` before committing).

## Migration

None. This package touches no server code, no `models.py`, no SQL.

## Gate output — `node --test "__tests__/*.test.mjs"` (from `book-tracker-mobile-stitch/`, after `npm ci`)

Final run, verbatim tail:

```
1..113
# tests 113
# suites 0
# pass 113
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 3530.726
```

Matches gate G-4C-10 exactly (`# pass 113`, `# fail 0`, `# skipped 0`; baseline 101 + 12 new
M-01..M-12, skip count unchanged at 0, per K-10). All pre-existing suites stayed green,
including the RG-15 regression set (`sourceRules` interceptor rules, `apiContract` named
imports, `preload_keys_unchanged`, `insights_profile_read_canonical_fields`) and the fixed
`versionGuard.test.mjs::committed_tree_passes_strict`.

## Bundle check — `npx expo export --platform android`

Bundled cleanly: 1247 modules, `_expo/static/js/android/index-*.hbc` (3.88 MB), no errors.
`dist/` was deleted immediately after, per instructions — it is not part of this commit.

## Mutation-proof table (section 9 of tests.md, Android rows)

Procedure per row: apply the one-line change → run the named test → record the first red
line → `git diff` shows only the mutation → restore the original line → confirm green again.
(`localDate.js` and the new `__tests__/localDate.test.mjs` are new, untracked files this
sprint, so restoration was done by re-applying the original text via the same edit tool,
not `git checkout --`, which only works on tracked files. Each restoration was verified by
re-reading the file and by the full suite going back to 113/0/0.)

| MUT | File | One-line change | Test | Expected first red line | Observed | Caught | Restored |
|---|---|---|---|---|---|---|---|
| M1 | `localDate.js` | `parseDayLabel` → `return new Date(s)` | M-03 `parse_day_label_is_local_west_of_utc` | `2 !== 3` | `Expected values to be strictly equal: 2 !== 3` | yes | yes |
| M2 | `localDate.js` | `daysUntil`: `Math.round` → `Math.ceil` | M-06 `days_until_fall_back_25_hour_day` | `2 !== 1` | `Expected values to be strictly equal: 2 !== 1` | yes | yes |
| M3 | `localDate.js` | `daysUntil`: `Math.round` → `Math.floor` | M-07 `days_until_spring_forward_23_hour_day` | `0 !== 1` | `Expected values to be strictly equal: 0 !== 1` | yes | yes |
| M4 | `api.js` | delete the `X-Timezone` header assignment (and the `tz` line) | M-09 `request_interceptor_sets_x_timezone_per_request` | `0 !== 1` | `AssertionError: the request interceptor must set config.headers['X-Timezone'] ... (expected true, actual false)` | yes | yes |
| M5 | `api.js` | `const tz = deviceTimeZone()` hoisted to module scope | M-09 `request_interceptor_sets_x_timezone_per_request` | `0 !== 1` | same assertion as M4 (the `deviceTimeZone()` call is no longer inside the request-interceptor body, so the AST check finds nothing) | yes | yes |
| M6 | `InsightsScreen.js` | `shortDate` reverted to `new Date(dateStr)` | M-10 `insights_screen_parses_labels_locally` | `1 !== 0` | `AssertionError: shortDate must call parseDayLabel (expected true, actual false)` | yes | yes |
| M7 | `localDate.js` | added `import { Platform } from 'react-native';` | M-11 `local_date_module_is_import_free` | `1 !== 0` | module load crash: `SyntaxError: Unexpected token 'typeof'` while parsing `react-native/index.js` — the whole test file fails to load (`# pass 0`, `# fail 1`) instead of a clean per-assertion failure, because the test file also imports `localDate.js` directly at the top for the functional M-01..M-08 cases. This is a stronger, unambiguous red (the mutation is caught, just via a load-time crash rather than an assertion line) | yes (via crash) | yes |
| M8 | `app.json` | `2.2.3`/`62` → `2.2.2`/`61` | M-12 `app_json_is_2_2_3_62` | `'2.2.2' !== '2.2.3'` | `Expected values to be strictly equal: '2.2.2' !== '2.2.3'` | yes | yes |

All 8 rows: **caught = yes**, **restored = yes**. After every revert the file diff against the
pre-mutation content was re-read to confirm an exact restore, and the full suite was re-run
at the end (`node --test "__tests__/*.test.mjs"` → `# pass 113`, `# fail 0`, `# skipped 0`).

### K-11 (the changed, not-new, `versionGuard.test.mjs` row)

No dedicated MUT row is listed for this in tests.md's Android section (it is a "(changed, K-11)"
row in section 4.1, not a mutation row). It is nonetheless verified: reverting my fix (restoring
the hard-coded `/61/` / `/60/`) reproduces exactly the regression K-11 describes — `assert.match(r.stdout, /61/)`
fails because the post-bump script prints only `62` and `60`, never `61`. Confirmed by inspection;
not re-recorded as a separate mutation row since tests.md does not ask for one.

## Diverged From Brief

None. Scope, file list and package boundary matched the brief exactly, including the K-11
addition of `versionGuard.test.mjs` to this package's file list (already reflected in the
brief's own instructions).

## Assumptions

- The web and API packages (Package WEB / API) are being built separately and are out of scope
  here; nothing in this package depends on their code at edit time (per architecture.md,
  cross-package dependencies are runtime-only, and the 4C header is harmless against a pre-4C
  backend).
- `release/last-released.json` reflects the *last Play-released* version (2.2.1 / 60) and is
  intentionally left untouched; the 2.2.2 → 2.2.3 gap between what's released and what's in
  `app.json` is expected and matches the existing `check-version-bump.js` semantics (it only
  compares against the *last released* version, not the immediately preceding one).

## Explicitly Not Built

- No change to `book-tracker-mobile-stitch/App.js`, `release/`, or any file outside the six
  listed above — out of the ANDROID package's scope per the brief.
- No manual device verification (D-4C-01..04) — those are PM/device steps per tests.md section 7,
  not part of this automated package.
- No AAB build ("Build Stitch AAB (Production)", gate G-4C-14) — that runs only after the 4C
  backend is live on Render (G-4C-13), which is outside this package's control.

## Follow-ups

- None identified beyond what tests.md already tracks in section 0 (K-01..K-22), all of which
  are either accepted-as-resolved or owned by other packages/roles.

## Ready-for-QA checklist

- [x] all screen states implemented (no new screen state; InsightsScreen renders identically,
      only the date parsing underneath changed — per spec.md's Screen States table)
- [x] `node --test "__tests__/*.test.mjs"` → `# pass 113`, `# fail 0`, `# skipped 0` (G-4C-10)
- [x] `npx expo export --platform android` bundles cleanly; `dist/` deleted after
- [ ] migration appended + flagged — **N/A**, no server/DB change in this package
- [x] `app.json` bumped (2.2.3 / versionCode 62)
- [ ] notification: config entry + placeholders + `fire_event` — **N/A**, no notification change
      in this package (that's the API package's `scheduler.py` / `dispatcher.py`)
- [x] mutation-proof table filled in (section 9 Android rows, all caught and restored)
- [x] no lockfile churn (`git status --short` shows no diff in `package.json` / `package-lock.json`)
