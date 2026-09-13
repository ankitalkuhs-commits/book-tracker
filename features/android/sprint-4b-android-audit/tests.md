---
screen: sprint-4b-android-audit
feature: android
test_plan_written: 2026-09-13
last_run: not run
pass_rate: 0/0 (not run)
written_by: Senior QA (before Builder; no build code read)
code_baseline: master @ 8c44198 (app.json 2.2.1 / 60). Baseline counts below were measured on that working tree.
sources: spec.md (PM-approved, round-2 decisions), architecture.md (architecture-complete), qa/reports/triage-2026-09-13.md (4B list + PM decisions rounds 1 and 2), qa/android/review-a.md, qa/android/review-b.md, qa/inventory/mobile-a.json, qa/inventory/mobile-b.json, repos/mobile/index.md, dependency-map.md (curated + android "UI actions → API"), qa/RULES_OF_ENGAGEMENT.md, features/security/sprint-1-hardening/tests.md (house style)
---

## How to read this plan

Every case gives an exact command or assertion and an exact expected result. "Expected" is what spec.md and architecture.md promise, not what the code does.

- **Severity:** **Critical** = crash, privacy, auth, data loss. **Major** = core flow broken. **Minor** = cosmetic or defensive. Every privacy and auth case is Critical and must never be downgraded.
- **Priority:** P0 = ship blocker (every Critical, and every device hard-gate item). P1 = fix within sprint (Major). P2 = Minor.
- **IDs:** `S` static (automatable now), `C` contract, `D` device (PM, on the test APK), `RG` regression, `RC` release checklist.
- **4A contracts (resolved 2026-09-13).** `features/maintenance/sprint-4a-platform-audit/architecture.md` → "Contracts for 4B" (lines 1635–1748) now defines F-07, F-15, F-23 and the F-03 server half. All four match the 4B brief's assumptions. The cases that were BLOCKED-ON-4A are now **real contract tests tagged `[4A]`**, and they assume the 4A backend is live (Release gate RC01). Differences between that section and the 4B brief are listed under **Contract conflicts** below. Until 4A is deployed, a `[4A]` case run against production is expected to fail and is recorded SKIP (4A not live), not FAIL.
- **No emulator or device on this machine.** Junior QA runs only S, C and RG-static cases. Everything needing a running app is a D case for the PM.

**Command prefixes** (every shell command starts with one):
- `[R]` = `cd /c/Users/sonal/Documents/projects/book-tracker &&`
- `[M]` = `cd /c/Users/sonal/Documents/projects/book-tracker/book-tracker-mobile-stitch &&`

Scratch output only in `C:\Users\sonal\AppData\Local\Temp\claude\C--Users-sonal-Documents-projects-biodata\f99ba33a-3623-411e-9505-2b847ae0b8af\scratchpad\`, named `qa-4b-*`.

---

## Preconditions and process notes (read before building)

1. **Testability extraction (request to Architect/orchestrator; not in the brief).** Node cannot load `api.js`, `App.js` or `VisibilityToggle.js`: they import axios, AsyncStorage and React Native. Unit-testing the 401 rule, the retry rule and the visibility parsing needs two **zero-import** ESM helpers. The files import them, and Metro resolves them normally.
   - `book-tracker-mobile-stitch/src/services/httpPolicy.js` (Package A) exports `isAuthExpiredError(error)` and `isRetryableRequest(error)`. It implements exactly the T-03 condition (`status 401 && config.headers.Authorization && !config.skipAuthExpired`) and the T-15 condition (`config` present, method `get` case-insensitive, defaulting to `get`, transient = `ECONNABORTED` or `ETIMEDOUT` or `ERR_NETWORK` or no `response`, and not `__retried`). `api.js` must call both helpers and must not re-implement either condition inline.
   - `book-tracker-mobile-stitch/src/utils/noteVisibility.js` (Package C) exports `parseStoredVisibility(value)` (returns `true` only for the exact string `'public'`) and `serializeVisibility(isPublic)` (returns `'public'` or `'private'`). It must **not** contain the key literal. `useNoteVisibility` calls both.
   - If the extraction is refused, S26, S48 and S53 lose behavioural coverage and fall back to their AST parts only. Record that in `code-map.md`.
2. **Test runner.** Use Node's built-in `node:test`, with no new dependency.
   - Test files are `book-tracker-mobile-stitch/__tests__/*.test.mjs`. A shared non-test helper `__tests__/_ast.mjs` loads `@babel/parser` and `js-yaml` from `node_modules` via `createRequire`; both are already present.
   - Run: `[M] node --test "__tests__/*.test.mjs"`. Expected last lines: `# fail 0` and `# pass <n>`.
   - Needs Node ≥ 22.7 for ESM syntax detection of the `src/` helper `.js` files. Local is v22.14.0, and Senior QA verified the pattern in a scratch probe. A `MODULE_TYPELESS_PACKAGE_JSON` warning is expected and harmless.
   - **Do not** add `"type": "module"` to `package.json`: that changes how Metro, Babel and Expo config files load.
   - Adding `"test": "node --test \"__tests__/*.test.mjs\""` to `package.json` scripts is optional (Package A). It does not affect `package-lock.json`.
3. **Offline tooling, as actually measured on this machine:**
   - `npx expo-doctor`: **not used.** It is not in `node_modules/.bin`, so `npx` would download it, which is not offline.
   - `[M] EXPO_OFFLINE=1 npx --no-install expo install --check` **runs offline but is informational only.** It prints `Dependency validation is unreliable in offline-mode` and exits **1 at baseline**. It lists `expo-document-picker`, `expo-splash-screen`, `react-native-gesture-handler` and `react-native-svg@15.15.4 - expected version: 15.12.1`. The svg expectation contradicts the project pin (LOAD_ME_FIRST gotcha), so this is never a gate (see S70).
   - `npx expo export --platform android`: offline behaviour **not verified** by Senior QA. Junior QA runs it (S68). If it needs the network, record SKIP with the error text.
4. **Device accounts precondition (PM).**
   - D cases use `review.reader@trackmyread.com` (id 110) and `review.friend@trackmyread.com` (id 111) per `qa/RULES_OF_ENGAGEMENT.md`. The Android app has **Google Sign-In only**, so this needs both addresses to be signable with Google on the phone.
   - If they are not, stop and ask the PM. The fallback is two PM-owned Google accounts for D08–D12, and a throwaway circle for D21/D23. Never use a real user's content.
   - Forced-expiry cases (D05–D07) need **one throwaway PM-owned Google account "T"**, because deleting a review account is forbidden.
5. **Prototype scripts.** Senior QA's baseline prototypes, which the Builder may port into the Node tests, are in the scratchpad: `qa-4b-ast-sweep.cjs` (unlabeled touchables) and `qa-4b-contract-exact.cjs` (api.js vs routers). They are session-scoped and may be gone.

### Baseline measured at 8c44198 (before any 4B change)
| Check | Baseline | Expected after 4B |
|---|---|---|
| `grep -rn "console\." App.js src \| grep -v __DEV__` | 3 lines (NotificationService.js:56, :74, :98) | 0 |
| `grep -rn "usersAPI" App.js src \| wc -l` | 2 | 0 |
| `grep -rn "user_role" src \| wc -l` | 1 | 0 |
| `grep -rn "is_public: true" src` | 3 (FeedScreen.js:214, :229; ProfileScreen.js:223) | 0 |
| `grep -rn "reading_goal" src \| wc -l` | 5 | 0 |
| stale insights names in InsightsScreen/ProfileScreen | 9 | 0 |
| `grep -rn "accessibilityLabel" App.js src \| wc -l` | 0 | ≥ 41 (S59 per-file minimums) |
| AST: touchables with no label and no Text descendant | 35 | 4, all allowlisted dead code (S58) |
| api.js calls with no backend route (exact path match) | 1: `userAPI.getUser GET /users/{id}` | the same 1, plus nothing new |
| locale key parity | en/de/es/fr/pt 468 keys; ru 478 (10 `_few`/`_many` extras) | 468+32 each; ru 478+32 |

---

## Node test files the Builder must create

All files live in `book-tracker-mobile-stitch/__tests__/`, and every one runs with `[M] node --test "__tests__/*.test.mjs"`.

| File | Owner | Test names | Cases |
|---|---|---|---|
| `versionGuard.test.mjs` | A | `strict_exits_1_when_versionCode_equals_last`, `strict_exits_1_when_versionCode_below_last`, `strict_exits_1_when_version_string_unchanged`, `strict_exits_1_when_versionCode_not_integer`, `strict_exits_0_when_both_bumped`, `non_strict_exits_0_with_warning_when_not_bumped`, `non_strict_exits_0_without_warning_when_bumped`, `always_prints_compared_values`, `committed_tree_passes_strict`, `script_uses_no_network_env_or_child_process` | S08, S66 |
| `httpPolicy.test.mjs` | A | `auth_expired_for_401_with_authorization_header`, `not_auth_expired_for_401_without_authorization_header`, `not_auth_expired_when_skipAuthExpired`, `not_auth_expired_for_403_404_500_or_network_error`, `not_auth_expired_when_config_missing`, `retryable_get_on_ECONNABORTED`, `retryable_get_on_ETIMEDOUT`, `retryable_get_on_ERR_NETWORK_or_no_response`, `missing_method_treated_as_get`, `method_match_is_case_insensitive`, `not_retryable_for_post_put_patch_delete`, `not_retryable_when_already_retried`, `not_retryable_for_get_with_http_error_response`, `not_retryable_when_config_missing` | S26, S53 |
| `noteVisibility.test.mjs` | C | `null_or_undefined_is_private`, `public_string_is_public`, `private_string_is_private`, `unexpected_values_are_private`, `serialize_true_is_public_false_is_private`, `round_trip_preserves_choice`, `helper_has_no_imports_and_no_key_literal` | S48 |
| `i18nParity.test.mjs` | A | `all_locales_parse_as_json`, `key_sets_match_en_except_ru_few_many`, `ru_plural_extras_have_base_key_in_en`, `new_4b_keys_present_in_every_locale`, `new_4b_values_non_empty_and_not_the_key`, `placeholders_match_en_for_new_keys`, `saved_privately_en_text_exact`, `every_4b_t_key_used_in_src_exists_in_en` | S67 |
| `apiContract.test.mjs` | A | `every_api_js_call_matches_a_backend_route`, `every_xAPI_member_access_is_a_defined_key`, `named_imports_resolve_to_real_exports`, `no_usersAPI_identifier_anywhere`, `new_4b_client_functions_exact_method_and_path`, `deregister_uses_10s_timeout_and_skipAuthExpired`, `warmUp_targets_version_with_cold_start_timeout`, `mark_read_present_iff_backend_route_exists` | C01, S12, S21, S24, S25, S51, S55 |
| `notificationEvents.test.mjs` | C | `event_config_covers_every_active_backend_event`, `join_approved_navigates_to_group`, `join_rejected_navigates_to_circles`, `admin_broadcast_has_own_icon_and_no_nav`, `circles_case_navigates_to_CircTab`, `existing_event_targets_unchanged`, `row_mark_read_guarded_by_unread_and_caught`, `mark_all_read_refreshes_badge` | S49, S50, S51, RG11 |
| `a11yTouchables.test.mjs` | C (runs after A+B+C merge) | `unlabeled_touchables_only_in_allowlisted_dead_code`, `labeled_touchable_minimums_per_file`, `no_touchable_without_press_handler`, `icon_labels_use_i18n_not_literals`, `all_brief_a11y_keys_used`, `counts_passed_via_accessibilityValue`, `visibility_toggle_is_accessible_switch` | S47, S58–S61, S73 |
| `sourceRules.test.mjs` | A creates; B and C must keep it green | `console_calls_all_inside_dev_guard`, `note_visibility_key_literal_once_in_api_js`, `notification_service_has_no_fetch_or_base_url`, `deregister_resets_guard_before_network_call`, `register_guard_armed_only_when_epoch_unchanged`, `push_functions_take_no_arguments`, `handleLogout_deregisters_before_clearing_token`, `logout_and_expiry_remove_note_visibility_key`, `handleSessionExpired_resets_push_guard_and_state`, `screens_never_clear_token_directly`, `settings_delete_order_deregister_delete_logout`, `interceptor_uses_policy_helpers_and_notifies_once`, `saveToken_resets_authExpiredNotified_first`, `preload_followed_by_isLoggedIn_recheck`, `retry_block_precedes_401_block`, `cold_start_timeout_only_upgrades_default`, `every_note_create_and_update_sends_is_public`, `use_note_visibility_defaults_private_and_rereads_on_focus`, `no_visibility_reset_after_posting`, `profile_edit_uses_local_editPublic`, `feed_saved_privately_toast_on_both_create_paths`, `disband_gated_on_created_by`, `groups_focus_effect_reloads_mine`, `group_detail_load_arity_matches`, `reject_requires_confirm_with_cancel_first`, `apptour_reads_results_and_maps_fields`, `book_preview_book_id_never_from_userbook`, `goal_card_reads_goal_endpoint_fields`, `insights_profile_read_canonical_fields`, `feed_flatlist_header_is_element_and_extraData_complete`, `preload_keys_unchanged` | S10–S20, S22, S23, S26–S31, S33–S46, S52, S54, S56, S62–S64, RG02, RG09 |
| `workflows.test.mjs` | A | `workflows_parse_as_yaml`, `both_install_with_npm_ci`, `no_npm_install_step`, `version_guard_step_between_setup_node_and_install`, `aab_guard_strict_apk_guard_warn_only`, `build_android_yml_absent`, `workflows_manual_dispatch_only_and_checkout_master`, `aab_production_bundle_apk_preview` | S03–S06 |

**`versionGuard.test.mjs` fixture.**
- Each test makes a temp dir under `os.tmpdir()` containing `app.json` (`{ "expo": { "version", "android": { "versionCode" } } }`), `release/last-released.json` and a copy of `scripts/check-version-bump.js` at `scripts/`.
- It runs `spawnSync(process.execPath, ['scripts/check-version-bump.js', ...flags], { cwd: tmp })`. That works whether the script resolves paths from `__dirname/..` or from the cwd.
- `committed_tree_passes_strict` runs against the real tree instead of a fixture.
- Architecture does not define non-strict behaviour for a non-integer versionCode, so only the strict case is asserted.

---

## Part 1 — Static test cases (automatable now)

"AST" means the named Node test in `__tests__/sourceRules.test.mjs` (or the file given), which parses with `@babel/parser` (`sourceType: 'module'`, `plugins: ['jsx']`). Greps are exact commands. Where a grep and an AST test both exist, the AST test is authoritative, because greps are line-based.

### R1 — Build prep (F-32)

**S01 · P0 · Critical (crash: svg drift is why the pin exists)** — `react-native-svg` is pinned exactly.
- Run: `[M] grep -c '"react-native-svg": "15.15.4"' package.json; grep -c '"react-native-svg": "[\^~]' package.json`
- Expect: `1` then `0`.

**S02 · P0 · Critical** — the lockfile agrees with the pin, so `npm ci` cannot fail or drift.
- Run: `[M] node -e "const l=require('./package-lock.json');const r=l.packages[''].dependencies['react-native-svg'];const v=l.packages['node_modules/react-native-svg'].version;console.log(r,v);process.exit(r==='15.15.4'&&v==='15.15.4'?0:1)"`
- Expect: prints `15.15.4 15.15.4`, exit 0.
- Secondary check (the architecture's; needs the npm registry, so SKIP if offline): `[M] npm install --package-lock-only --ignore-scripts && git diff --exit-code package-lock.json`. Expect exit 0.

**S03 · P1 · Major** — both workflows install with `npm ci`.
- AST/YAML: `workflows.test.mjs :: both_install_with_npm_ci`, `no_npm_install_step`. For `build-stitch-apk.yml` and `build-stitch-aab.yml`, the step named `Install dependencies` has `run` exactly `npm ci`, and no step's `run` contains `npm install`.
- Grep equivalent: `[R] grep -c "run: npm ci" .github/workflows/build-stitch-apk.yml .github/workflows/build-stitch-aab.yml; grep -c "npm install" .github/workflows/build-stitch-apk.yml .github/workflows/build-stitch-aab.yml`
- Expect: `:1` for each file, then `:0` for each file.

**S04 · P1 · Major** — the dead workflow is deleted.
- Run: `[R] test ! -e .github/workflows/build-android.yml && echo GONE; git ls-files .github/workflows`
- Expect: `GONE`, and exactly the two files `build-stitch-aab.yml` and `build-stitch-apk.yml`.
- Node: `workflows.test.mjs :: build_android_yml_absent`.

**S05 · P1 · Major** — the version guard step is placed and flagged correctly.
- Node: `workflows.test.mjs :: version_guard_step_between_setup_node_and_install`, `aab_guard_strict_apk_guard_warn_only`. In each file's `jobs.build.steps`:
  - index(`Setup Node.js`) < index(`Check version bump`) < index(`Install dependencies`)
  - AAB `run` is exactly `node scripts/check-version-bump.js --strict`
  - APK `run` is exactly `node scripts/check-version-bump.js`, with no `--strict`
- Also `workflows_manual_dispatch_only_and_checkout_master`: `on` has only `workflow_dispatch`, and the checkout step has `ref: master`.
- Also `aab_production_bundle_apk_preview`: the AAB build step runs `--profile production` and outputs `./build.aab`; the APK build step runs `--profile preview`.

**S06 · P1 · Major** — workflow YAML is valid.
- Node: `workflows.test.mjs :: workflows_parse_as_yaml` (js-yaml `load` on both files, no throw).
- Grep fallback: `[R] node -e "const y=require('./book-tracker-mobile-stitch/node_modules/js-yaml');for(const f of ['build-stitch-apk.yml','build-stitch-aab.yml'])y.load(require('fs').readFileSync('.github/workflows/'+f,'utf8'));console.log('ok')"`
- Expect: `ok`.

**S07 · P1 · Major** — the baseline for the guard is the last Play-accepted build.
- Run: `[M] node -e "console.log(JSON.stringify(require('./release/last-released.json')))"`
- Expect: exactly `{"version":"2.2.1","versionCode":60}` until Play accepts 2.2.2 (then RC09).

**S08 · P1 · Major** — the guard script behaves as specified.
- Node: `versionGuard.test.mjs`, all ten tests, with fixtures:

| test | app.json (version / code) | last-released | flags | exit | stdout must contain |
|---|---|---|---|---|---|
| `strict_exits_1_when_versionCode_equals_last` | 2.2.2 / 61 | 2.2.1 / 61 | `--strict` | 1 | `::error::` |
| `strict_exits_1_when_versionCode_below_last` | 2.2.2 / 60 | 2.2.1 / 61 | `--strict` | 1 | `::error::` |
| `strict_exits_1_when_version_string_unchanged` | 2.2.1 / 61 | 2.2.1 / 60 | `--strict` | 1 | `::error::` |
| `strict_exits_1_when_versionCode_not_integer` | 2.2.2 / `"61"` (string) and 61.5 | 2.2.1 / 60 | `--strict` | 1 (both) | — |
| `strict_exits_0_when_both_bumped` | 2.2.2 / 61 | 2.2.1 / 60 | `--strict` | 0 | neither `::error::` nor `::warning::` |
| `non_strict_exits_0_with_warning_when_not_bumped` | 2.2.1 / 60 | 2.2.1 / 60 | none | 0 | `::warning::` |
| `non_strict_exits_0_without_warning_when_bumped` | 2.2.2 / 61 | 2.2.1 / 60 | none | 0 | no `::warning::` |
| `always_prints_compared_values` | any of the above | | | | `61` and `60` (or the fixture's values) on every run |
| `committed_tree_passes_strict` | the real `app.json` | the real file | `--strict` | 0 | `61` and `60` |
| `script_uses_no_network_env_or_child_process` | — | — | — | — | script source matches none of `require('http`, `https`, `net`, `child_process`, `process.env` |

### R2 — Push follows the account (F-03 mobile) — every case Critical (privacy)

**S10 · P0 · Critical** — NotificationService has no network of its own.
- Run: `[M] grep -nE "fetch\(|API_BASE_URL|onrender\.com|https?://" src/services/NotificationService.js`
- Expect: empty (baseline: `:7`, `:64`, `:93`).
- AST: `notification_service_has_no_fetch_or_base_url` (no `fetch` identifier call and no string literal starting `http`).

**S11 · P0 · Critical** — NotificationService goes through `api.js`.
- Run: `[M] grep -nE "from '\./api'" src/services/NotificationService.js; grep -c "userAPI.registerPushToken(" src/services/NotificationService.js; grep -c "userAPI.deregisterPushToken(" src/services/NotificationService.js`
- Expect: one import line naming `userAPI` and `authAPI`; `1`; `1`.

**S12 · P0 · Critical** — deregister is bounded and never raises a second expiry.
- Node: `apiContract.test.mjs :: deregister_uses_10s_timeout_and_skipAuthExpired`. `userAPI.deregisterPushToken` calls `api.delete('/push-tokens/', {...})`, and the options object has `timeout: 10000` and `skipAuthExpired: true`.

**S13 · P0 · Critical** — deregister resets the guard before any network call.
- AST: `deregister_resets_guard_before_network_call`.
  - `export function resetPushRegistration` exists; its body assigns `lastRegisteredExpoToken = null` and increments `registrationEpoch`.
  - In `deregisterPushToken`, the first statement is `resetPushRegistration()`, and it comes before the `userAPI.deregisterPushToken()` call.
  - That call sits inside a `try` whose `catch` rethrows nothing.

**S14 · P0 · Critical** — an in-flight registration for A cannot re-arm the guard after A signs out.
- AST: `register_guard_armed_only_when_epoch_unchanged`.
  - `registerExpoPushToken` declares `const epoch = registrationEpoch` before its first `await`.
  - The only assignment `lastRegisteredExpoToken = <token>` is inside `if (epoch === registrationEpoch)`.
  - That assignment comes after `await userAPI.registerPushToken(...)`.

**S15 · P1 · Major** — the push functions take no token argument.
- AST: `push_functions_take_no_arguments`. `registerExpoPushToken.params.length === 0` and `deregisterPushToken.params.length === 0`; every call site in `App.js` and `src/` passes zero arguments.
- Grep: `[M] grep -rnE "(registerExpoPushToken|deregisterPushToken)\([^)]" App.js src/screens` → empty.
- Also `grep -n "!authToken" src/services/NotificationService.js` → empty, and `authAPI.isLoggedIn()` is awaited in `registerExpoPushToken`.

**S16 · P0 · Critical** — sign-out deregisters while the token is still valid.
- AST: `handleLogout_deregisters_before_clearing_token`. In `App.js` `handleLogout`:
  - The parameter is the destructured `{ alreadyDeregistered = false } = {}`.
  - The `deregisterPushToken()` call (in the branch where `!alreadyDeregistered` and `isLoggedIn`) precedes `await authAPI.logout()` in source order.
  - The `else` branch calls `resetPushRegistration()`.
  - `clearInterval(pollRef.current)`, `setPreloaded(null)`, `setUnreadCount(0)`, `setShowTour(false)` and `setIsLoggedIn(false)` all appear after `authAPI.logout()`.

**S17 · P0 · Critical** — session expiry resets the push guard.
- AST: `handleSessionExpired_resets_push_guard_and_state`. `handleSessionExpired` calls `resetPushRegistration()` and does **not** call `deregisterPushToken` (the token is already invalid).

**S18 · P0 · Critical** — no screen clears the session by itself.
- Run: `[M] grep -rnE "authAPI\.logout|removeItem\(['\"]bt_token" src/screens src/components; grep -n "authAPI" src/screens/ProfileScreen.js src/screens/SettingsScreen.js`
- Expect: both empty (baseline: `ProfileScreen.js:394`, `SettingsScreen.js:288`, `:297`).
- AST: `screens_never_clear_token_directly`.

**S19 · P0 · Critical** — account delete order is deregister → delete → logout.
- AST: `settings_delete_order_deregister_delete_logout`. In `SettingsScreen.js`, the destructive delete handler contains, in source order and inside one `try`:
  1. `await deregisterPushToken()`
  2. `await profileAPI.deleteAccount()`
  3. `onLogout?.({ alreadyDeregistered: true })`, with that exact object literal
- `import { deregisterPushToken } from '../services/NotificationService'` is present.

**S20 · P0 · Critical** — both sign-out buttons route through `onLogout`.
- Run: `[M] grep -n "onLogout" src/screens/ProfileScreen.js src/screens/SettingsScreen.js`
- Expect: ProfileScreen's destructive Sign Out handler awaits `onLogout?.()`; SettingsScreen's Sign Out calls `onLogout?.()` with no arguments; the delete path passes `{ alreadyDeregistered: true }`.

### R3 — Disband Circle works (F-04)

**S21 · P1 · Major** — `groupsAPI.deleteGroup` exists.
- Node: `apiContract.test.mjs :: new_4b_client_functions_exact_method_and_path`. The key `deleteGroup` exists in `groupsAPI` and calls `api.delete` with the template `/groups/${id}`. Its body returns no `.data` (204 has no body).
- Node: `every_xAPI_member_access_is_a_defined_key`. Every `groupsAPI.X`, `userAPI.X`, `notesAPI.X`, … member access in `App.js` and `src/` names a key that exists on that exported object. This is the class of bug that killed Disband.

**S22 · P1 · Major** — Disband is shown only to the creator.
- AST: `disband_gated_on_created_by`. In `GroupDetailScreen.js`, the JSX element whose `onPress` references `handleDisband` sits under a `LogicalExpression` whose left side mentions both `created_by` and `currentUser` (with `!= null` / `===`). No ancestor condition consisting only of `isCurator` gates it.
- Device cannot cover the negative (see D22), so this is the evidence for "a non-creator curator sees no Disband".

**S23 · P1 · Major** — My Circles reloads on focus.
- AST: `groups_focus_effect_reloads_mine`. In `GroupsScreen.js`, the `useFocusEffect(useCallback(fn, deps))` body calls both `loadMine()` and `loadPending()`, and `deps` contains `loadMine`.

### R4 — Invite Friends search works (F-05)

**S24 · P1 · Major** — the undefined `usersAPI` is gone.
- Run: `[M] grep -rn "usersAPI" App.js src; grep -c "userAPI.searchUsers(" src/screens/GroupDetailScreen.js`
- Expect: empty (baseline 2); `1`.
- Node: `apiContract.test.mjs :: no_usersAPI_identifier_anywhere`.

**S25 · P0 · Critical (crash class)** — every named import resolves.
- Node: `apiContract.test.mjs :: named_imports_resolve_to_real_exports`. For every `ImportDeclaration` in `App.js` and `src/**/*.js` whose source is relative (`./…` or `../…`), each `ImportSpecifier` name exists as a named export of the resolved file. This covers `services/api`, `services/NotificationService`, `services/httpPolicy`, `components/VisibilityToggle`, `utils/noteVisibility` and `context/NotificationContext`. Metro does not catch this (F-05).

### R5 — Expired session returns to Login (F-11) — every case Critical (auth)

**S26 · P0 · Critical** — the 401 rule.
- Node: `httpPolicy.test.mjs`. `isAuthExpiredError`:

| test | input | expect |
|---|---|---|
| `auth_expired_for_401_with_authorization_header` | `{response:{status:401}, config:{headers:{Authorization:'Bearer x'}}}` | `true` |
| `not_auth_expired_for_401_without_authorization_header` | `{response:{status:401}, config:{headers:{}}}` (Google login failure) | `false` |
| `not_auth_expired_when_skipAuthExpired` | 401 + Authorization + `config.skipAuthExpired: true` | `false` |
| `not_auth_expired_for_403_404_500_or_network_error` | status 403 / 404 / 500 with Authorization; `{code:'ERR_NETWORK', config:{headers:{Authorization:'Bearer x'}}}` | `false` each |
| `not_auth_expired_when_config_missing` | `{response:{status:401}}` | `false` |

- AST: `interceptor_uses_policy_helpers_and_notifies_once`. In `api.js`'s response error handler:
  - the `if (isAuthExpiredError(error))` block awaits `AsyncStorage.removeItem('bt_token')`, then runs `if (!authExpiredNotified) { authExpiredNotified = true; authExpiredHandler?.(); }`, with the flag set before the call
  - the handler then returns `Promise.reject(error)`
  - `export const setAuthExpiredHandler` exists
  - no other `status === 401` comparison exists in `api.js`

**S27 · P0 · Critical** — a second expiry in the same app process still fires.
- AST: `saveToken_resets_authExpiredNotified_first`. In `authAPI.saveToken`, `authExpiredNotified = false` precedes `AsyncStorage.setItem('bt_token', …)`.

**S28 · P0 · Critical** — the handler is registered and cleaned up.
- Run: `[M] grep -n "setAuthExpiredHandler" App.js src/services/api.js`
- Expect: the export in `api.js`, and in `App.js` a `useEffect` that calls `setAuthExpiredHandler(handleSessionExpired)` and returns a cleanup calling `setAuthExpiredHandler(null)`.

**S29 · P0 · Critical** — expiry resets every piece of session state.
- AST: `handleSessionExpired_resets_push_guard_and_state`. `handleSessionExpired` calls:
  - `resetPushRegistration()`
  - `clearInterval(pollRef.current)`
  - `setPreloaded(null)`, `setUnreadCount(0)`, `setShowTour(false)`, `setTransitioning(false)`, `setIsLoggedIn(false)`, `setAuthChecked(true)`
  - `AsyncStorage.removeItem(NOTE_VISIBILITY_KEY)`
  - `Alert.alert(i18n.t('auth.sessionExpiredTitle'), i18n.t('auth.sessionExpiredBody'))`

**S30 · P0 · Critical** — no zombie session after an expiring preload.
- AST: `preload_followed_by_isLoggedIn_recheck`. In both the mount auth-check effect and `handleLoginSuccess`:
  - the statement immediately after `await preloadData()` is an `IfStatement` whose test contains `!(await authAPI.isLoggedIn())`, and whose consequent returns
  - the mount effect's consequent also calls `setAuthChecked(true)`; `handleLoginSuccess`'s calls `setTransitioning(false)`
  - every `setIsLoggedIn(true)` in those two functions comes after the re-check
- This is the only evidence for "401 during the post-login preload". It cannot be forced on a release APK (see D-section note).

**S31 · P0 · Critical** — only two code paths touch `bt_token`.
- Run: `[M] grep -rn "bt_token" App.js src`
- Expect: every hit is in `src/services/api.js`: the request interceptor read, the 401 removal, and `authAPI` `saveToken` / `getToken` / `logout` / `isLoggedIn`. No hit in `App.js` or any screen.

### R6 — Tour book search returns results (F-12)

**S33 · P1 · Major** — AppTour reads `results` and maps fields.
- Run: `[M] grep -nE "res\.books|res\.items|\(res \|\| \[\]\)" src/components/AppTour.js`
- Expect: empty (baseline `:187`).
- AST: `apptour_reads_results_and_maps_fields`.
  - The search handler reads `res?.results` guarded by `Array.isArray` and calls `.slice(0, 5)`.
  - The mapped object sets `google_books_id: b.google_id`, `author` from `b.authors?.join(', ')`, and `isbn` from `b.isbn_13 || b.isbn_10 || null`.
  - The `handleAddBook` payload includes `total_pages` and `isbn`.

### R7 — Yearly goal is correct (F-13 mobile)

**S34 · P1 · Major**
- Run: `[M] grep -rn "yearGoal\.finished" src; grep -c "yearGoal.completed ?? 0" src/screens/InsightsScreen.js; grep -c "yearGoal.completed ?? 0" src/screens/ProfileScreen.js`
- Expect: empty; `≥1`; `≥2`.
- AST: part of `insights_profile_read_canonical_fields`.

### R8 — Insights stats are correct (F-14 mobile)

**S35 · P1 · Major**
- Run: `[M] grep -nE "average_rating|books_this_year|books_finished_this_year|projected_finish_date|finished_books" src/screens/InsightsScreen.js src/screens/ProfileScreen.js`
- Expect: empty (baseline, together with S34: 9 hits).
- Run: `[M] grep -cE "insights\?\.(total_finished|avg_rating|finished_this_year)" src/screens/InsightsScreen.js; grep -c "projected_finish\b" src/screens/InsightsScreen.js`
- Expect: `3`; `≥3`.
- Reading 4A's `finished` alias on 2.2.2 is a FAIL: aliases exist only for ≤2.2.1 and will be removed.

### R9 — Circle reading goal works (F-15 mobile) `[4A]`

**S36 · P1 · Major** — the create payload uses the canonical key.
- Run: `[M] grep -rnE "reading_goal|pages_read_total" src`
- Expect: empty (baseline 5).
  - 4A now also *returns* `reading_goal` and `pages_read_total` on `GET /groups/{id}` for 2.2.1 (Contracts §2), so a stale read would silently appear to work. This grep is the only guard.
- AST: in `GroupsScreen.js`, the `createGroup` argument object has `goal_pages: readingGoal ? parseInt(readingGoal, 10) : null` and `goal_period: readingGoal ? goalPeriod : null`, with radix 10 present.

**S37 · P1 · Major** — the goal card reads the `/goal` endpoint.
- AST: `goal_card_reads_goal_endpoint_fields`. In `GroupDetailScreen.js`:
  - `load()`'s `Promise.all` array contains `safe(groupsAPI.getGroupGoal(groupId), …)`
  - the card condition is `goal?.goal_pages > 0`
  - the card reads `goal.pages_read ?? 0`, `goal.goal_pages.toLocaleString()` and `Math.min(100, goal.pct ?? 0)`
  - the card does not read `goal.goal_period` (absent from the no-goal response, Contracts §2)
- Node: `group_detail_load_arity_matches`. The destructuring pattern has exactly as many elements as the `Promise.all` array (RG09).

### R10 — No duplicate books (F-07 mobile) `[4A]`

**S38 · P0 · Critical (data integrity: a userbook id sent as `book_id` adds an unrelated catalogue book)**
- AST: `book_preview_book_id_never_from_userbook`. In `BookPreviewScreen.js`:
  - a declaration equals `rawBook.book ? rawBook.book.id : (rawBook.status == null ? rawBook.id : null)`
  - the `addToLibrary` payload has `book_id: localBookId ?? null` and `isbn: book.isbn || null`
  - no other expression assigns `book_id`
- Contracts §1 confirms `book_id` must be a Book id and that this guard is correct.

### R11 — Public/Private switch that remembers the last choice (F-17 mobile) — every case Critical (privacy)

**S39 · P0 · Critical** — the storage key literal exists once.
- Run: `[M] grep -rn "bt_note_visibility" App.js src`
- Expect: exactly 1 line, in `src/services/api.js`: `export const NOTE_VISIBILITY_KEY = 'bt_note_visibility';`.
- AST: `note_visibility_key_literal_once_in_api_js`, which also checks that `src/utils/noteVisibility.js` does not contain the literal.

**S40 · P0 · Critical** — no hard-coded public post.
- Run: `[M] grep -rnE "is_public:\s*true" src`
- Expect: empty (baseline: `FeedScreen.js:214`, `:229`, `ProfileScreen.js:223`).

**S41 · P0 · Critical** — every note write sends `is_public` explicitly.
- AST: `every_note_create_and_update_sends_is_public`. Every `notesAPI.createNote(obj)` and `notesAPI.updateNote(id, obj)` call in `src/screens/*.js`, excluding `SearchScreen.js` and `OnboardingScreen.js`, has an object literal with an `is_public` property whose value is an Identifier, not a literal:
  - `FeedScreen.js`: 2 createNote calls → `isPublic`
  - `BookDetailScreen.js`: 1 createNote → `noteIsPublic`
  - `ProfileScreen.js`: createNote → `rememberedPublic`; updateNote → `editPublic`
- Expected total: 5 calls, 5 `is_public` properties.

**S42 · P0 · Critical** — the hook defaults to Private and re-reads on focus.
- AST: `use_note_visibility_defaults_private_and_rereads_on_focus`. In `src/components/VisibilityToggle.js`:
  - `export function useNoteVisibility` has `useState(false)`
  - its `useEffect` deps are exactly `[isFocused]`, and it returns early when `!isFocused`
  - the read is `AsyncStorage.getItem(NOTE_VISIBILITY_KEY)`, and its `.then` sets state via `parseStoredVisibility(v)`
  - `.catch` sets `false`
  - the setter calls `AsyncStorage.setItem(NOTE_VISIBILITY_KEY, serializeVisibility(next))` with `.catch`
  - `NOTE_VISIBILITY_KEY` is imported from `../services/api`
  - `useIsFocused` is imported from `@react-navigation/native`

**S43 · P1 · Major** — no reset after posting (PM decision: remember the choice).
- Run: `[M] grep -rnE "set(IsPublic|NoteIsPublic|RememberedPublic)\((false|true)\)" src/screens`
- Expect: empty. AST: `no_visibility_reset_after_posting`.

**S44 · P0 · Critical** — editing shows the note's own visibility and never changes the remembered choice.
- AST: `profile_edit_uses_local_editPublic`. In `ProfileScreen.js` NewNoteModal:
  - `const [editPublic, setEditPublic] = useState(false)`
  - the edit effect calls `setEditPublic(!!editNote?.is_public)`
  - `updateNote` sends `is_public: editPublic`
  - the `<VisibilityToggle>` props are `isPublic={editNote ? editPublic : rememberedPublic}` and `onChange={editNote ? setEditPublic : setRememberedPublic}`
  - `setRememberedPublic` is never called inside the edit branch

**S45 · P0 · Critical** — the next account on a shared phone starts on Private.
- Run: `[M] grep -n "NOTE_VISIBILITY_KEY" App.js`
- Expect: the import plus exactly 2 `AsyncStorage.removeItem(NOTE_VISIBILITY_KEY)` lines.
- AST: `logout_and_expiry_remove_note_visibility_key`. One removal is inside `handleLogout`, the other inside `handleSessionExpired`.

**S46 · P1 · Major** — the "Saved privately" toast on both Home create paths.
- AST: `feed_saved_privately_toast_on_both_create_paths`. In `FeedScreen.js`, for each of the 2 `createNote` calls:
  - `const postedPublic = isPublic` (or equivalent) is captured before the `await`
  - after the awaited create, `if (!postedPublic)` guards `ToastAndroid.show(t('notes.savedPrivately'), ToastAndroid.SHORT)`, inside `Platform.OS === 'android'`
- `ToastAndroid` is imported from `react-native`.
- Run: `[M] grep -c "notes.savedPrivately" src/screens/FeedScreen.js; grep -rn "notes.savedPrivately" src/screens/BookDetailScreen.js src/screens/ProfileScreen.js`
- Expect: `≥1` (2 if not factored into a helper), and empty for the other screens (no toast there per T-11).

**S47 · P1 · Major** — the switch is rendered where specified and is accessible.
- Run: `[M] grep -c "<VisibilityToggle" src/screens/FeedScreen.js src/screens/BookDetailScreen.js src/screens/ProfileScreen.js src/screens/GroupDetailScreen.js`
- Expect: `1`, `1`, `1`, `0`. The group post is not a note.
- Node: `a11yTouchables.test.mjs :: visibility_toggle_is_accessible_switch`. The toggle's touchable has `accessibilityRole="switch"`, `accessibilityState` with `checked: isPublic`, `accessibilityLabel={t('a11y.postVisibility')}`, and an `accessibilityHint` choosing between `notes.visibilityHintPublic` and `notes.visibilityHintPrivate`. It does no storage (no `AsyncStorage` call inside the default export).

**S48 · P0 · Critical** — the stored value parses safely.
- Node: `noteVisibility.test.mjs`:

| test | input → expect |
|---|---|
| `null_or_undefined_is_private` | `parseStoredVisibility(null)` → `false`; `(undefined)` → `false` |
| `public_string_is_public` | `('public')` → `true` |
| `private_string_is_private` | `('private')` → `false` |
| `unexpected_values_are_private` | `'PUBLIC'`, `' public'`, `'true'`, `'1'`, `''`, `'{"v":"public"}'`, boolean `true` → `false` each |
| `serialize_true_is_public_false_is_private` | `serializeVisibility(true)` → `'public'`; `(false)` → `'private'` |
| `round_trip_preserves_choice` | `parseStoredVisibility(serializeVisibility(x)) === x` for `true` and `false` |
| `helper_has_no_imports_and_no_key_literal` | the source has no `import`, no `require(` and no `bt_note_visibility` |

### R12 — Notification taps route (F-22 mobile)

**S49 · P1 · Major**
- Node: `notificationEvents.test.mjs`:
  - `event_config_covers_every_active_backend_event`. Parse `app/notifications/config.py` for non-commented lines matching `^\s{4}"([a-z_]+)": \{`. Expected set (11): `new_follower, post_liked, post_commented, book_completed, book_added, reading_streak_reminder, group_invite, group_join_request, group_join_approved, group_join_rejected, admin_broadcast`. Every name is a key of `EVENT_CONFIG` in `NotificationsScreen.js`; `default` still exists.
  - `join_approved_navigates_to_group`: `navTarget: 'group'`.
  - `join_rejected_navigates_to_circles`: `navTarget: 'circles'`.
  - `admin_broadcast_has_own_icon_and_no_nav`: `navTarget: null`, and `icon` is not `'notifications'` (the default icon).
  - `circles_case_navigates_to_CircTab`: the `handleNotifPress` switch has `case 'circles'`, calling `navigation?.navigate('Tabs', { screen: 'CircTab' })`.
  - `existing_event_targets_unchanged` (RG11): `new_follower`→`user`; `post_liked`, `post_commented`, `book_added`, `book_completed`→`feed`; `reading_streak_reminder`→`insights`; `group_invite`, `group_join_request`→`group`.

### R13 — Tapping a notification marks it read (F-23) `[4A]`

**S50 · P1 · Major** — the badge refreshes.
- Run: `[M] grep -n "refreshUnread" src/context/NotificationContext.js App.js src/screens/NotificationsScreen.js`
- Expect:
  - the context default value contains `refreshUnread: () => {}`
  - `App.js` provider value contains `refreshUnread: fetchUnread`
  - NotificationsScreen reads it from `useContext(NotificationContext)` and calls `refreshUnread()` after a successful `markAllRead`
- Node: `notificationEvents.test.mjs :: mark_all_read_refreshes_badge`.

**S51 · P1 · Major** — per-row mark-read is wired (4A defines the route; Contracts §3).
- Node: `apiContract.test.mjs :: mark_read_present_iff_backend_route_exists`. With 4A merged, `app/notifications/router.py` has `@router.post("/{…}/read")`, so `notificationsAPI.markRead` **must** exist and call `api.post` with `` `/notifications/${id}/read` `` and no body.
- Node: `notificationEvents.test.mjs :: row_mark_read_guarded_by_unread_and_caught`. In `handleNotifPress`, the `markRead(item.id)` call is inside `if (!item.is_read)`, chained `.then(() => refreshUnread())` and `.catch(...)`, and is not awaited before navigation.
- If the route is absent from the checked-out `app/` (4A not merged into this tree), the test fails with the message `F-23 route missing: 4A not merged` → record SKIP, not FAIL.

### R14 — Reject asks first (F-25 mobile)

**S52 · P1 · Major**
- AST: `reject_requires_confirm_with_cancel_first`. In `GroupDetailScreen.js`:
  - `handleReject`'s body is (or immediately calls) `Alert.alert(t('groups.rejectRequestTitle'), t('groups.rejectRequestConfirm', { name: member.name }), [...])`
  - element 0 has `style: 'cancel'` and no `onPress` that calls the API
  - element 1 has `style: 'destructive'`, and its `onPress` calls `groupsAPI.rejectGroupMember(groupId, member.user_id)`
  - no call to `rejectGroupMember` exists outside that `onPress`
  - the Reject button's `onPress` passes the member object `m`, not `m.user_id`

### R15 — Cold start doesn't fail first use (F-31)

**S53 · P0 · Critical (a replayed POST duplicates data)** — the retry rule.
- Node: `httpPolicy.test.mjs`. `isRetryableRequest`:

| test | input | expect |
|---|---|---|
| `retryable_get_on_ECONNABORTED` | `{code:'ECONNABORTED', config:{method:'get'}}` | `true` |
| `retryable_get_on_ETIMEDOUT` | `{code:'ETIMEDOUT', config:{method:'get'}}` | `true` |
| `retryable_get_on_ERR_NETWORK_or_no_response` | `{code:'ERR_NETWORK', config:{method:'get'}}`; `{config:{method:'get'}}` (no response) | `true` each |
| `missing_method_treated_as_get` | `{code:'ECONNABORTED', config:{}}` | `true` |
| `method_match_is_case_insensitive` | `config.method: 'GET'` | `true` |
| `not_retryable_for_post_put_patch_delete` | each of `post`, `put`, `patch`, `delete` with `ECONNABORTED` and with no response | `false` each |
| `not_retryable_when_already_retried` | GET timeout with `config.__retried: true` | `false` |
| `not_retryable_for_get_with_http_error_response` | GET with `response:{status:500}`; `response:{status:401}` | `false` each |
| `not_retryable_when_config_missing` | `{code:'ECONNABORTED'}` | `false` |

**S54 · P1 · Major** — the 45 s window applies only before the first success, and only to default-timeout requests.
- AST: `cold_start_timeout_only_upgrades_default`. In `api.js`:
  - `DEFAULT_TIMEOUT = 30000`, `COLD_START_TIMEOUT = 45000`, `let coldStart = true`
  - `axios.create` uses `timeout: DEFAULT_TIMEOUT`
  - the request interceptor's only timeout mutation is guarded by `coldStart && config.timeout === DEFAULT_TIMEOUT`
  - the response success handler sets `coldStart = false` and returns the response
  - the retry block sets `cfg.__retried = true` and `cfg.timeout = DEFAULT_TIMEOUT`, awaits a 2000 ms sleep, and returns `api(cfg)`
- Run: `[M] grep -n "timeout: 120000" src/services/api.js`
- Expect: 1 hit, in `importAPI.importGoodreads` (untouched).

**S55 · P1 · Major** — the warm-up ping.
- Node: `apiContract.test.mjs :: warmUp_targets_version_with_cold_start_timeout`. `export const warmUp` calls `api.get('/version', { timeout: COLD_START_TIMEOUT, skipAuthExpired: true })`, then `.then(() => true)` and `.catch(() => false)`.
- Run: `[M] grep -n "warmUp" src/screens/LoginScreen.js`
- Expect: an import from `../services/api`, and one un-awaited `warmUp()` call inside the effect that calls `GoogleSignin.configure`.

**S56 · P1 · Major** — handler order.
- AST: `retry_block_precedes_401_block`. The response interceptor's error function is `async`. The `isRetryableRequest` check comes before the `isAuthExpiredError` check in source order, so a timed-out GET is retried rather than treated as an auth event.

### R16 — Curator badge shows (F-34)

**S57 · P2 · Minor**
- Run: `[M] grep -rn "user_role" src; grep -c "membership_role === 'curator'" src/screens/GroupsScreen.js`
- Expect: empty (baseline 1); `1`.

### R17 — TalkBack names every icon button (F-38)

**S58 · P1 · Major** — the sweep finds only allowlisted dead code.
- Node: `a11yTouchables.test.mjs :: unlabeled_touchables_only_in_allowlisted_dead_code`. Find every `TouchableOpacity`, `Pressable`, `TouchableHighlight` and `TouchableWithoutFeedback` JSX element in `App.js` + `src/**/*.js` that has no `accessibilityLabel` attribute and no `Text`/`TextInput`/non-blank JSXText descendant.
- Expect exactly 4:
  - `SearchScreen.js` ×2 (unreachable; PM: deleted in a later build)
  - `FeedScreen.js` ×1 (never-opened shelf modal backdrop, F-40)
  - `UserProfileScreen.js` ×1 (same)
- Baseline: 35. The allowlist is by file and count, so line drift does not break it.

**S59 · P1 · Major** — labels exist where the sweep cannot see them. The sweep misses touchables with a Text child: count badges, initials and like counts.
- Node: `labeled_touchable_minimums_per_file`. The count of touchable elements with an `accessibilityLabel` must be ≥:

| File | min | Rows (T-17) |
|---|---|---|
| `components/AppTour.js` | 1 | avatar tile |
| `components/AppHeader.js` | 2 | bell, avatar |
| `components/VisibilityToggle.js` | 1 | switch |
| `screens/GroupDetailScreen.js` | 6 | book-modal search, back, post avatar, post trash, remove tagged book, remove photo |
| `screens/GroupsScreen.js` | 1 | cover preset tile |
| `screens/FeedScreen.js` | 8 | composer avatar, remove tagged book, remove image, image picker, ···, like, comments, admin delete comment |
| `screens/BookDetailScreen.js` | 3 | star (mapped), back, delete note |
| `screens/BookPreviewScreen.js` | 1 | back |
| `screens/LibraryScreen.js` | 2 | modal search, clear search |
| `screens/ProfileScreen.js` | 8 | edit note, delete note, like, comments, send comment, back, gear, camera |
| `screens/UserProfileScreen.js` | 4 | back, admin delete note, share, like |
| `screens/SettingsScreen.js` | 3 | picker close, picker tile, back |
| `screens/NotificationsScreen.js` | 1 | back |

- Every labelled touchable in those rows also has `accessibilityRole` (`button`, or `switch` for the toggle).
- `counts_passed_via_accessibilityValue`: the bell, both Feed like and comments touchables, Profile like and comments, and UserProfile like each have `accessibilityValue`, and the label call has no count argument.
- Inventory cross-reference: all 22 inventory ids named in T-17 exist in `qa/inventory/mobile-a.json` / `mobile-b.json` (verified by Senior QA). The rows `mobile.bookdetail.starRating`, `mobile.feed.commentToggle`, `mobile.feed.deleteComment` and `mobile.userprofile.statPills` are the inventory's names for the "inventory …" rows.

**S60 · P2 · Minor** — the stat pills are no longer fake buttons.
- Node: `no_touchable_without_press_handler`. No touchable element in `App.js` + `src/` (excluding `SearchScreen.js` and `OnboardingScreen.js`) lacks all of `onPress`, `onLongPress` and `onPressIn`.
- Baseline hits are `UserProfileScreen.js:310,315,320`. In `UserProfileScreen.js`, the elements containing the Followers, Following and Books labels have tag `View`.

**S61 · P2 · Minor** — label strings are translated and every key is used.
- Node: `icon_labels_use_i18n_not_literals`. No `accessibilityLabel` or `accessibilityHint` attribute whose value is a plain string literal (outside `SearchScreen.js` and `OnboardingScreen.js`).
- Node: `all_brief_a11y_keys_used`. Each of the 25 `a11y.*` keys in architecture §0.1 appears at least once as a `t('a11y.…'` or `i18n.t('a11y.…'` argument in `App.js` + `src/`.

### R18 — No ungated console output

**S62 · P2 · Minor**
- Run: `[M] grep -rn "console\." App.js src | grep -v __DEV__`
- Expect: empty (baseline 3).
- AST, authoritative because the grep is line-based: `console_calls_all_inside_dev_guard`. Every `console.*` CallExpression has an ancestor `IfStatement` whose test is `__DEV__`, or is the right operand of `__DEV__ && …`.

### R19 — Feed list is virtualised (FlatList half)

**S63 · P1 · Major** — the FlatList props that protect keyboard focus.
- AST: `feed_flatlist_header_is_element_and_extraData_complete`. `FeedScreen.js` imports `FlatList` from `react-native` and renders exactly one `<FlatList>` for the Community tab, with:
  - `keyExtractor`, returning `String(p.id)`
  - `ListHeaderComponent` whose value is a `JSXElement` or `JSXFragment`, **not** an `ArrowFunctionExpression`, `FunctionExpression` or `Identifier` bound to a function
  - `extraData`, an object literal that includes `expandedComments` and `menuPostId`
  - `removeClippedSubviews={false}`
  - `keyboardShouldPersistTaps="handled"`
  - `refreshControl`
  - `ListEmptyComponent`
- Run: `[M] grep -n "Math.random" src/screens/FeedScreen.js` → empty (baseline `:598`).

**S64 · P2 · Minor** — the Friends tab keeps its ScrollView.
- AST: the Friends-tab branch still renders a `ScrollView`. The FlatList is in the Community branch only.

### R20 — Version and release

**S65 · P1 · Major** — the version is bumped.
- Run: `[M] node -e "const a=require('./app.json').expo;console.log(a.version,a.android.versionCode,Number.isInteger(a.android.versionCode))"`
- Expect: `2.2.2 61 true`.

**S66 · P1 · Major** — the committed tree passes the strict guard.
- Run: `[M] node scripts/check-version-bump.js --strict; echo exit=$?`
- Expect: output shows `61` and `60` and contains no `::error::`; `exit=0`.
- Node: `versionGuard.test.mjs :: committed_tree_passes_strict`.

### Whole app

**S67 · P1 · Major** — i18n: six valid locales with matching keys.
- Node: `i18nParity.test.mjs`:
  - `all_locales_parse_as_json`: `en`, `de`, `es`, `fr`, `pt`, `ru` under `src/i18n/locales/`.
  - `key_sets_match_en_except_ru_few_many`: the flattened key sets of `de`, `es`, `fr` and `pt` equal `en`; `ru` equals `en` plus keys ending `_few` or `_many`.
  - `ru_plural_extras_have_base_key_in_en`: each ru extra `x_few` or `x_many` has `x_one` or `x` in en. Baseline: 10 extras.
  - `new_4b_keys_present_in_every_locale`. All 32 keys:
    - `auth.sessionExpiredTitle`, `auth.sessionExpiredBody`
    - `notes.visibilityHintPrivate`, `notes.visibilityHintPublic`, `notes.savedPrivately`
    - `groups.rejectRequestTitle`, `groups.rejectRequestConfirm`
    - `a11y.back`, `close`, `openSettings`, `openProfile`, `openUserProfile`, `notifications`, `changePhoto`, `addPhoto`, `removePhoto`, `removeTaggedBook`, `postOptions`, `deletePost`, `deleteComment`, `editNote`, `deleteNote`, `like`, `comments`, `sendComment`, `share`, `searchBooks`, `clearSearch`, `rateStars`, `chooseAvatar`, `coverPreset`, `postVisibility`
  - `new_4b_values_non_empty_and_not_the_key`: no value is empty or equal to its own key path.
  - `placeholders_match_en_for_new_keys`: the `{{name}}` / `{{count}}` sets are equal per key in all locales. The keys with placeholders are `groups.rejectRequestConfirm`, `a11y.openUserProfile`, `a11y.chooseAvatar` and `a11y.coverPreset` (`{{name}}`), and `a11y.rateStars` (`{{count}}`).
  - `saved_privately_en_text_exact`: `en.notes.savedPrivately === "Saved privately — find it on your Profile"` (em dash U+2014).
  - `every_4b_t_key_used_in_src_exists_in_en`: every string-literal `t()` / `i18n.t()` argument under the `auth.sessionExpired*`, `notes.visibility*`, `notes.savedPrivately`, `groups.rejectRequest*` and `a11y.*` prefixes resolves in `en` (base key, or `_one`/`_other`).
- Expected totals: en/de/es/fr/pt 500 keys each; ru 510.

**S68 · P0 · Critical (crash)** — Metro bundles the app.
- Run: `[M] npx expo export --platform android --output-dir "C:/Users/sonal/AppData/Local/Temp/claude/C--Users-sonal-Documents-projects-biodata/f99ba33a-3623-411e-9505-2b847ae0b8af/scratchpad/qa-4b-export"; echo exit=$?`
- Expect: `exit=0` and a bundle under `_expo/static/js/android/`. Offline behaviour is unverified: if it fails with a network error, record SKIP with the text.

**S70 · P2 · Minor (informational)** — Expo dependency drift.
- Run: `[M] EXPO_OFFLINE=1 npx --no-install expo install --check; echo exit=$?`
- Expect: `exit=1` with the same four packages as baseline (`expo-document-picker`, `expo-splash-screen`, `react-native-gesture-handler`, `react-native-svg`). Any **additional** package is a Minor finding. The `react-native-svg expected 15.12.1` line is expected and must **not** be "fixed".

**S71 · P2 · Minor** — gotchas from LOAD_ME_FIRST stay absent.
- Run: `[M] grep -rnE "adjustsFontSizeToFit|Alert\.prompt" App.js src`
- Expect: empty.

**S73 · P2 · Minor** — no English literals in new user-visible strings.
- Run: `[M] grep -rnE "(accessibilityLabel|accessibilityHint)=\"" App.js src | grep -v SearchScreen`
- Expect: empty.
- Known pre-existing exception (not a failure): the literal `'Could not reject member'` inside the T-14 catch is quoted verbatim by the brief.

---

## Part 2 — Contract tests

Each case compares one Android call the sprint touches against its backend handler: method, path, body keys sent, response fields read.

- **Static:** `apiContract.test.mjs` plus AST reads of the consuming screen, against `app/` **with 4A merged**.
- **Backend:** the named pytest, run with `[R] pytest tests/<file> -q -k "<names>"` from the repo root with `.venv` active. Expect `N passed`, `0 failed`.
- `[4A]` = defined by `features/maintenance/sprint-4a-platform-audit/architecture.md` → "Contracts for 4B". Every `[4A]` case was formerly BLOCKED-ON-4A and is now a real test that assumes 4A is live.
- If the checked-out tree predates the 4A merge, a `[4A]` pytest does not exist yet → record SKIP (4A not merged), never PASS.

**C01 · P0 · Critical** — every mobile `api.js` call has a backend route.
- Node: `apiContract.test.mjs :: every_api_js_call_matches_a_backend_route`.
  - Extract every `api.<verb>(path)` in `src/services/api.js`: string or template literal, `${…}` → `{}`, query string stripped.
  - Extract every `@router.<verb>("…")` in `app/routers/*.py` and `app/notifications/*.py`, prefixed with that file's `APIRouter(prefix=…)`.
  - Match method + path **exactly**, including the trailing slash. FastAPI's slash redirect is not relied on.
- Expect: exactly one unmatched entry, the pre-existing allowlisted `userAPI.getUser GET /users/{}` (baseline measured). Any other unmatched call fails.

**C02 · P0 · Critical** — `POST /push-tokens/` registers the device.
- Android: `userAPI.registerPushToken(token)` → `api.post('/push-tokens/', { token })`. The body key set is exactly `{token}`. The response is ignored.
- Backend: `push_router.py register_push_token`, body `PushTokenRegister{token: str}` → `200 {"message": "Push token registered"}`. An invalid prefix gets `200 {"message": "Invalid token format — …"}` and creates no row. Android ignores both messages.
- Verify: AST, the body object has only the `token` key; backend `class PushTokenRegister` has exactly `token: str`.

**C03 · P0 · Critical** `[4A]` — registering a token owned by another user moves it (Contracts §4).
- Expect: `POST /push-tokens/ {"token": T}` by B, where A holds an `expo` row with `token == T`, returns `200 {"message": "Push token registered"}`. Afterwards A has **no** `expo` row with T, and B has **exactly one** `expo` row, with T. Web rows of any user are untouched.
- Backend: `[R] pytest tests/test_push_tokens.py -q -k "test_register_token_owned_by_other_user_moves_row or test_register_expo_does_not_touch_other_users_web_rows"` → `2 passed`.
- Android dependency: this closes the offline-sign-out and session-expiry residual in T-02. Device proof: D12.

**C04 · P0 · Critical** — `DELETE /push-tokens/` removes only the caller's expo rows.
- Android: `userAPI.deregisterPushToken()` → `api.delete('/push-tokens/', { timeout: 10000, skipAuthExpired: true })`. No body; the response is ignored.
- Backend: `deregister_push_token` → `200 {"message": "Push token removed"}`. It deletes rows where `user_id == me AND token_type == "expo"` and keeps `web` rows (sprint-1 T24/T27).
- Verify: `[R] pytest tests/test_push_tokens.py -q` → `0 failed`.

**C05 · P0 · Critical** — account delete removes push rows and invalidates the token.
- Android: `profileAPI.deleteAccount()` → `api.post('/auth/delete-account/me')`, with no body, **after** `deregisterPushToken()` (S19).
- Backend: `auth_router.py delete_own_account` deletes the user and their push tokens. Any later request carrying that token → `get_current_user` → `401 {"detail": "User not found"}`.
- Verify: static, the docstring and delete block in `delete_own_account` include `PushToken`, and `deps.py` raises 401 when `user is None`. Device: D05, D06, D07.

**C06 · P0 · Critical** — 401 semantics that the F-11 interceptor keys on.
- Backend `get_current_user`: missing token → 401; undecodable or expired → 401; no `sub` → 401; unknown or deleted user → 401. It never returns 403 for an authentication failure.
- 4A: `[R] pytest tests/test_auth.py -q -k test_no_token_on_protected_endpoint` → `1 passed`.
- Android contract: the interceptor treats a 401 as expiry **only** when the request carried `Authorization`. `POST /auth/google` from Login carries none, so its failures stay login errors (S26; D03).

**C07 · P1 · Major** — `GET /version` is the warm-up ping.
- Android: `warmUp()` → `api.get('/version', { timeout: 45000, skipAuthExpired: true })`. The body is ignored.
- Backend: `meta_router.py get_version`, no auth, no DB → `200 {"commit", "service", "branch"}`.
- Verify: static, the route has no `Depends(`, and the returned dict keys are exactly those three.

**C08 · P1 · Major** — `DELETE /groups/{id}` for Disband.
- Android: `groupsAPI.deleteGroup(id)` → `api.delete(`/groups/${id}`)`. Returns nothing. `handleDisband` treats a resolved promise as success and calls `navigation.goBack()`.
- Backend: `groups_router.py delete_group`, `status_code=204` with no body. Non-creator → `403 "Only the group creator can delete it"`; unknown → 404.
  - 4A F-50 deletes `GroupActivity` first. Before 4A, a circle with activity returned 500.
- Verify: `[R] pytest tests/test_groups.py -q -k test_delete_group_with_activity_leaves_no_rows` → `1 passed` (4A); static, the decorator has `status_code=204`.

**C09 · P1 · Major** — group shape fields Android reads.
- Android reads `created_by` (compared with `/profile/me` `id`, for Disband) and `membership_role === 'curator'` (badge and curator actions).
- Backend: `_serialize_group` returns `created_by: int` and `membership_role: "curator" | "member" | null`. It is used by `GET /groups/{id}`, `/groups/my`, `/groups/my/pending`, `/groups/discover` and `POST /groups/`.
- Verify: static, both keys are in the `_serialize_group` return dict, and no Android file reads `user_role` (S57).

**C10 · P1 · Major** — `GET /users/search` for Invite.
- Android: `userAPI.searchUsers(q)` → `api.get('/users/search?q=' + encodeURIComponent(q))`, called only when `q.trim().length >= 2`. Results are filtered by `u.id` against `members[].user_id`.
- Backend: `users_router.py search_users` → `List[UserSearchResult]`, where `UserSearchResult = {id, name, username, bio, is_following, follows_you, is_mutual}`. The current user is excluded.
- Verify: AST, every `u.<field>` access in the invite-results render and filter is one of those 7 fields. Reading `profile_picture` here is a Minor finding: it is always undefined.

**C11 · P1 · Major** `[4A]` — `POST /groups/` with a reading goal (Contracts §2).
- Android sends `{name, description, is_private, cover_preset, goal_pages: int|null, goal_period: "monthly"|"yearly"|null}`, and never `reading_goal`. `goal_period` is non-null only when `goal_pages` is.
- Expect:
  - 201 with the full group object, `goal_pages` equal to the sent integer
  - `goal_start_date` non-null only when `goal_period` was sent
  - with `goal_pages: null` and `goal_period: null`, the created group has `goal_pages: null` and `goal_start_date: null`
- Verify: AST, the `createGroup` argument keys are ⊆ `CreateGroupBody` fields `{name, description, is_private, cover_preset, goal_pages, goal_period, invite_user_ids}`.
- Backend: `[R] pytest tests/test_groups.py -q -k "test_create_accepts_reading_goal_alias or test_goal_pages_wins_over_alias"` → `2 passed`.

**C12 · P1 · Major** `[4A]` — `GET /groups/{id}/goal` shape unchanged (Contracts §2).
- Expect:
  - with a goal: `{"goal_pages": int, "goal_period": str, "pages_read": int, "pct": int 0..100}`
  - without: exactly `{"goal_pages": null, "pages_read": 0, "pct": 0}`, with **no** `goal_period` key
  - a private group requires active membership, otherwise 403
- Android: `groupsAPI.getGroupGoal(id)` → `api.get(`/groups/${id}/goal`)`, wrapped in `safe()`, so a 403 becomes `null` and there is no card. It reads only `goal_pages`, `pages_read`, `pct` (S37).
- Backend: `[R] pytest tests/test_groups.py -q -k test_goal_endpoint_shape_unchanged` → `1 passed`.

**C13 · P1 · Major** — `GET /reading-activity/insights` canonical names.
- Expect these keys in the response: `total_finished: int`, `finished_this_year: int`, `avg_rating: float|null`, `yearly_goal: {goal, completed, pct, on_track} | null`, and `projected_finishes: [{userbook_id, title, author, cover_url, current_page, total_pages, pct, pages_left, days_left, projected_finish: "YYYY-MM-DD"}]`.
- 4A adds aliases (`finished`, `average_rating`, `books_this_year`, `projected_finish_date`) for ≤2.2.1 only. Android 2.2.2 must read **only** canonical names (S34, S35).
- Verify: static, the return dict in `reading_activity_router.py get_reading_insights` has the canonical keys; `[R] pytest tests/test_reading_activity.py -q -k "test_yearly_goal_has_completed_and_finished_alias or test_mobile_alias_keys_present"` → `2 passed`.

**C14 · P1 · Major** — `GET /api/googlebooks/search` for AppTour.
- Android: `booksAPI.search(query)` → `GET /api/googlebooks/search?query=…`, carrying the Bearer token. It reads `results[].{google_id, title, authors, cover_url, total_pages, isbn_13, isbn_10}`.
- Backend: `GoogleBooksSearchResponse{results: List[GoogleBookResult], total_items, query_used, has_more, next_start_index}`.
  - 4A F-19: `cover_url` may now be `null`.
  - 4A F-29: authenticated callers are unlimited. An invalid or expired token counts as anonymous: 2 free calls per 24 h, then `401 {"detail": {"code": "login_required", …}}`. Because the Bearer header was sent, 4B's interceptor then shows "Session expired". That is the correct outcome for an invalid token.
- Verify: static, the `GoogleBookResult` fields include all seven names read. AST: AppTour's render tolerates `cover_url == null` (K1).

**C15 · P1 · Major** — `POST /books/add-to-library` from AppTour.
- Android sends `{title, author, isbn, google_books_id, cover_url, total_pages, status, …}`. Expect 200 flat userbook; on duplicate, `400 {"detail": "This book is already in your library in the '<tab>' tab."}`.
- Verify: AST, the payload keys are ⊆ `AddBookFromGooglePayload` fields (with 4A: plus `book_id`).

**C16 · P0 · Critical** `[4A]` — `book_id` matched first (Contracts §1).
- Android (BookPreviewScreen) sends `book_id` (a Book id or `null`), `google_books_id`, `isbn`, `title`, `author`, `cover_url`, `total_pages`, `status`, `format`, `ownership_status`.
- Expect:
  - Match order is `book_id` (an existing Book) → `google_books_id` → `isbn` → create.
  - An unknown `book_id` falls through with no 404.
  - Response `200` flat userbook with `book_id` equal to the matched Book id and nested `book.google_books_id`.
  - Already in the caller's library → `400 "This book is already in your library in the '…' tab."`, including under a race.
- Verify static: after the 4A merge, `grep -n "book_id: Optional\[int\] = None" app/routers/books_router.py` → 1 hit, inside `AddBookFromGooglePayload`.
- Backend: `[R] pytest tests/test_books.py -q -k test_add_to_library_race_returns_400` → `1 passed`.
- **Coverage gap (K8):** 4A names no test for the match order. Before RC01, 4A must add and pass: `test_add_by_book_id_reuses_catalogue_row`, `test_unknown_book_id_falls_through_to_google_books_id`, `test_book_id_wins_over_google_books_id`.

**C17 · P1 · Major** `[4A]` — book sub-shapes carry the dedup keys (Contracts §1).
- Expect `google_books_id`, `isbn`, `total_pages` (nullable) on:
  - `GET /books/recommendations` items
  - `GET /userbooks/friends/currently-reading` `[i].book`, plus `[i].user.profile_picture`
  - `GET /notes/feed`, `/notes/friends-feed`, `/notes/me`, `/notes/user/{id}` `[i].book` (or `null`)
  - `GET /groups/{id}`, `POST /groups/`, `PUT /groups/{id}` `.current_book`
  - the `PUT /groups/{id}/book` body
- `GET /notes/userbook/{id}` `.book` stays `{id, title, author}`. AST: `BookDetailScreen.js` never navigates to `BookPreview`.
- Backend: `[R] pytest tests/test_notes.py tests/test_groups.py -q -k "test_note_card_book_has_dedup_keys or test_current_book_has_dedup_keys or test_set_group_book_response_has_dedup_keys"` → `3 passed`.
- Coverage gap (K8): no named test for recommendations or friends-reading. 4A must add `test_recommendations_items_have_dedup_keys` and `test_friends_reading_book_has_dedup_keys_and_user_profile_picture`.

**C18 · P0 · Critical** — `POST /notes/` always sends `is_public`.
- Android sends `is_public` as a boolean on every create (S41), with `text`, `quote`, `emotion`, `image_url`, `userbook_id`.
- Backend: `NoteCreateSchema.is_public` (4A: default `None` → private when omitted) → `201` `NoteOutSchema` including `is_public: bool`.
  - A note created with `is_public: false` never appears in `GET /notes/feed` or `/notes/friends-feed`.
- Backend: `[R] pytest tests/test_notes.py -q -k "test_create_without_is_public_is_private or test_explicit_public_still_in_feed"` → `2 passed`.

**C19 · P0 · Critical** — `PUT /notes/{id}` from the Profile edit.
- Android sends `{text, quote, is_public: editPublic}`, where `editPublic` is initialised from `editNote.is_public`.
- Backend:
  - `update_note` applies `is_public` only when it is not None
  - non-owner → `403 "Not authorized to edit this note"`
  - `GET /notes/me` returns `is_public` for each note, and is the source of `editNote`
- Verify: AST, ProfileScreen's note list comes only from `notesAPI.getMyNotes()` or PreloadContext `notes` (both `/notes/me`).
- Backend: `[R] pytest tests/test_notes.py -q -k "test_update_without_is_public_keeps_private or test_update_without_is_public_keeps_public"` → `2 passed`.
- Pre-existing data-loss finding (not 4B scope): `update_note` overwrites `emotion`, `page_number` and `chapter` with the payload, which omits them. See Findings F3.

**C20 · P1 · Major** `[4A]` — `POST /notifications/{id}/read` (Contracts §3).
- Android: `notificationsAPI.markRead(id)` → `api.post(`/notifications/${id}/read`)`, no body. It is called only for an unread row, and errors are swallowed.
- Expect:
  - `200 {"id": <id>, "is_read": true}` for the caller's row; an already-read row also returns 200
  - `404 {"detail": "Notification not found"}` for another user's id or an unknown id, indistinguishable from each other
  - after success, `GET /notifications/unread-count` → `{"unread": n-1}` and history shows `is_read: true`
  - `POST /notifications/mark-read` (mark all) still resolves to its own route
- Backend: `[R] pytest tests/test_notifications_api.py -q -k "test_mark_one_read_only_that_row or test_mark_one_read_idempotent or test_mark_other_users_notification_404 or test_unread_count_drops_after_mark_one"` → `4 passed`.

**C21 · P2 · Minor** — unread count.
- `GET /notifications/unread-count` → `{"unread": int}`. `App.js` reads `data?.unread ?? 0` in both preload and poll.

**C22 · P2 · Minor** — mark all read.
- `POST /notifications/mark-read`, no body → 200. Android ignores the body, then calls `refreshUnread()` (S50).

**C23 · P1 · Major** — notification history data for routing.
- `GET /notifications/history` items are `{id, event_type, title, body, data, is_read, sent_at (ends "Z")}`.
  - `data.group_id` is present for `group_join_approved` (`approve_member` extra) and `group_join_rejected` (`reject_member` extra `{"group_name", "group_id"}`).
  - `event_type` strings equal the `EVENT_CONFIG` keys (S49).
  - 4A F-51 bounds `limit` to 1..200; Android sends none (default 50).
- Verify: static, both `fire_event` calls in `groups_router.py` pass `extra` containing `"group_id"`.

**C24 · P1 · Major** — reject a pending request.
- `POST /groups/{id}/reject/{user_id}`, no body, `status_code=204`. Curator only, otherwise `403 "Curator only"`.
- Pending rows from `GET /groups/{id}/pending` are `{user_id, name, username, profile_picture, invited_by, …}`. Android reads `m.user_id` and `m.name`.
- Verify: static, both keys are in the pending serializer; `rejectGroupMember` path template is `/groups/${id}/reject/${userId}`.

**C25 · P1 · Major** — why a rejected notification routes to Circles.
- `GET /groups/{id}` for a private group the caller is not an active member of → `403 "This is a private group"` (`get_group`).
- Android therefore routes `group_join_rejected` to the Circles tab. If 4A relaxed this 403, the route stays valid but the rationale is void; record it.

---

## Contract conflicts

Differences between `sprint-4a-platform-audit/architecture.md` ("Contracts for 4B" and the "Sprint 4B handoff" table) and the 4B brief. The four core contracts (F-07, F-15, F-23, F-03) have **no field-level conflict** with any Android call in the 4B brief. The items below are scope, wording or coverage gaps that the orchestrator must route.

| # | Where | 4A says | 4B brief says | Impact | Route to |
|---|---|---|---|---|---|
| K1 | 4A handoff row F-19; Contracts C14 | 4A returns `cover_url: null` for imageless Google results. The handoff lists an Android cover fallback at `LibraryScreen.js:341,375` for 4B | Not in the 4B spec or architecture. LibraryScreen only gets a11y rows | After 4A, the Library add modal (and AppTour / GroupDetail book-search rows reading `cover_url`) show blank tiles for imageless books. No crash expected, but D29 checks it | PM/Architect: add F-19 to 2.2.2 or accept blank tiles until a later build |
| K2 | 4A F-17 web (`feed.visibilityPrivate` "Only me"); handoff row "Public / Only me" | Private option labelled **Only me** | Android uses `common.private` **Private** | Wording parity only; the stored value `'private'` / `'public'` and key name `bt_note_visibility` match | PM: accept, or rename the Android label |
| K3 | 4A handoff row F-17 | Toggle on book-detail notes; mirror the remembered choice "if the 4B brief agrees" | Toggle on Feed, BookDetail and Profile (new + edit), remembered, cleared on sign-out | 4B is a superset (PM round-2 decision). No API conflict | Doc Sync: update the handoff row |
| K4 | Contracts §2 `GET /groups/{id}` | Adds `reading_goal` and `pages_read_total` aliases for 2.2.1 | Reads `GET /groups/{id}/goal` only | No conflict, but a leftover alias read would silently "work". S36 is the guard | Builder B: keep S36 green |
| K5 | Spec R4 accept; architecture device step 5 (spec, not 4A) | — | "Typing 'review' in Review Circle's invite box lists review.friend" | review.friend is already a Review Circle member, and `GroupDetailScreen` filters members out of invite results, so the criterion cannot pass even with a correct fix. D23 uses a throwaway circle instead | PM Helper/Architect: amend the R4 accept wording |
| K6 | 4A F-29 ("an expired token counts as anonymous") | An invalid token gets 2 anonymous searches, then `401 login_required` | The interceptor treats any 401 carrying `Authorization` as expiry | Correct outcome (the token is invalid). A user with a dead token may see 2 searches succeed before the "Session expired" alert | Note only |
| K7 | Contracts §4 | Reassignment happens on `POST /push-tokens/` | T-02 residual: offline sign-out or expiry leaves A's row until someone registers | Closed once B registers. **Still open** while nobody signs in after an offline sign-out, or if B denies notification permission (no registration happens). D12 step 7 records it | PM: accept residual |
| K8 | 4A named tests | Only `test_add_to_library_race_returns_400` for add-to-library; dedup-key tests for note card, current_book and set-book only | 4B relies on the `book_id` match order and on the recommendation / friends-reading keys | Contract defined but unproven by pytest | 4A Senior QA: add the tests named in C16 and C17 before RC01 |

---

## Part 3 — Device hard-gate checklist (PM, on a phone with the test APK)

### Setup (do once)
1. **4A is live:** `curl -s https://book-tracker-stitch.onrender.com/version` → `commit` equals the 4A merge SHA (RC01). Every `[4A]` step below assumes it.
2. **APK:** the `TrackMyRead-stitch-preview` artifact from the "Build Stitch APK (Preview)" run for the 4B commit (RC05). The preview signing may differ from Play, so use a phone **without** the Play install, or uninstall it first (this loses only local app data).
3. **Accounts:**
   - `review.reader` (110) and `review.friend` (111), signed in with Google on the phone (Preconditions §4).
   - One throwaway PM-owned Google account **T**, for forced-expiry steps only. It is never a review account and never a real user.
4. **Second actor:** some steps need "the other review account" to act from outside the phone. Use either:
   - the web (`https://www.trackmyread.com`), signed in as that account, or
   - the orchestrator on the dev machine, calling the API as that account via `POST /auth/review-login`. The token is never printed.
   Only notes, circles and requests owned by 110/111 are touched (RULES_OF_ENGAGEMENT).
5. **Test content:** prefix every text with `QA-4B`. Record every id created, and do Cleanup (D40) before reporting.
6. **What a release APK cannot do:**
   - **Edit the stored token.** A release APK is not debuggable, so `adb shell run-as` is refused and there is no dev menu.
   - **Use a short-lived token.** Every JWT, including review-login tokens, lives 30 days (`ACCESS_TOKEN_EXPIRE_MINUTES`, `app/auth.py:17`).
   - **Rotate `SECRET_KEY`.** That signs out every real user, and changing Render is forbidden.
   - **The only safe forced 401** is to delete account T's TrackMyRead account from the web while the phone still holds T's token. `get_current_user` then returns 401 "User not found" (`deps.py`).
   - A 401 during the **post-login** preload cannot be forced; S30 is the evidence.
7. **Report:** for each step, write PASS, FAIL (with what you saw and a screenshot under `qa/screenshots/`) or SKIP (with the reason).
   - Any FAIL in D01–D27 blocks the AAB.
   - A fix means a new APK, and then **all** of D01–D27 again (architecture Build & release step 9).

### Gate 1 — Sign-out and expired session (F-03, F-11) · all P0 / Critical

**D01 · Sign out from Profile.**
1. Signed in as reader: Profile → Sign Out → confirm.
2. Expected:
   - Login screen appears within 3 s, with **no** "Session expired" alert.
   - Android Back from Login does not return to any tab.
3. Tap Continue with Google → reader. Expected: Home loads with reader's data.

**D02 · Sign out from Settings.**
1. Profile → gear → Settings → Sign Out → confirm.
2. Expected: the same as D01. There is no second alert, and signing back in works.

**D03 · A failed Google sign-in is not an expiry.**
1. On Login, tap Continue with Google, then dismiss the account picker (Back).
2. Tap Continue with Google again and pick reader.
3. Expected:
   - step 1 leaves Login with at most a sign-in error, and **no** "Session expired" alert
   - step 2 signs in normally

**D04 · A network failure is not an expiry.**
1. Signed in as reader, kill the app and turn on airplane mode.
2. Relaunch and wait up to 90 s. The worst case is 45 s + 2 s + 30 s ≈ 77 s on the splash.
3. Expected:
   - the app opens to the tabs, possibly empty, **still signed in**, with no "Session expired" alert and no Login screen
4. Turn airplane mode off and pull to refresh on Home. Expected: data loads, and there is no sign-out.

**D05 · Expired at launch, which also clears the remembered visibility.**
1. Sign in on the phone as **T**.
2. On Home, set the composer switch to **Public**. Do not post.
3. Kill the app.
4. On the web, sign in as T → Settings → Delete account → confirm.
5. Relaunch the app on the phone.
6. Expected:
   - Login screen with **exactly one** alert, "Session expired" / "Please sign in again."
   - no tab content flashes before Login
7. Sign in as reader. Expected: the Home composer shows **Private** (lock icon).

**D06 · Expired mid-session.**
1. Sign out reader, then sign in as **T** again. This creates a fresh T account.
2. Leave the app open on Home, in the foreground.
3. On the web, delete T's account again.
4. Wait up to 75 s without touching the phone (60 s unread poll + request time).
5. Expected:
   - Login screen with exactly one "Session expired" alert, and no blank tabs
   - after dismissing it, Android Back does not return to the tabs

**D07 · Delete account from the phone.**
1. Sign in as **T** (fresh account).
2. Settings → Delete Account → confirm.
3. Expected: Login screen with **no** "Session expired" alert.
4. Sign in as T again. Expected: a brand-new empty account (no books, no notes), which proves the deletion.
5. Delete it again from Settings (cleanup).

### Gate 2 — Push on a shared phone (F-03 + 4A reassignment) · all P0 / Critical (privacy)

Allow push up to 2 minutes to arrive (F-59 latency). A negative check waits 3 minutes. Background the app for each push check. Also check the phone's notification shade, not only the in-app inbox.

**D08 · Baseline: A receives A's push.**
1. Sign in on the phone as **reader** and allow notifications when prompted.
2. Background the app.
3. As friend (second actor), like one of reader's own notes.
4. Expected: the phone shows the "liked" push for reader.
5. As friend, unlike (cleanup).

**D09 · After A signs out and B signs in, B gets B's push and never A's.**
1. Phone: reader → Profile → Sign Out. Then sign in as **friend** and allow notifications.
2. Background the app.
3. As reader (second actor), like one of friend's notes. Expected: the phone shows that push within 2 min.
4. As friend (second actor, from the web or the orchestrator, not the phone), like one of **reader's** notes.
   - Expected: **no** push on the phone within 3 min.
   - Opening the phone's in-app Notifications (as friend) does not list it.
5. Unlike both (cleanup).

**D10 · Swap back.**
1. Phone: friend → Sign Out → sign in as **reader**.
2. As friend (second actor), like reader's note. Expected: push shown.
3. As reader (second actor), like friend's note. Expected: **no** push within 3 min.
4. Unlike both.

**D11 · Server row check (optional, read-only, PM in the Supabase SQL Editor).** Never select the `token` column.
1. Right after reader's sign-out in D09 step 1, **before** friend signs in, run:
   `SELECT user_id, token_type, updated_at FROM pushtoken WHERE user_id IN (110,111) AND token_type='expo';`
   Expected: no row for 110 (removed at sign-out).
2. After friend signs in, run the same query. Expected: exactly one `expo` row for 111, and none for 110.

**D12 · Offline sign-out leaves no leak once B signs in** `[4A]` (Contracts §4: registering a token owned by another user moves it).
1. Phone signed in as reader, with notifications allowed.
2. Turn on airplane mode, then Profile → Sign Out.
   Expected: Login appears within about 12 s (the deregister has a 10 s timeout and never blocks sign-out).
3. Turn airplane mode off. Sign in as **friend** and allow notifications. Wait 30 s.
4. As friend (second actor), like reader's note. Expected: **no** push on the phone within 3 min.
5. As reader (second actor), like friend's note. Expected: push shown.
6. Optional D11 query after step 3: exactly one expo row, owned by 111; none for 110.
7. Known residual, not a failure: between steps 2 and 3, while nobody is signed in, reader's pushes may still reach the phone. Record whether one arrived.

### Gate 3 — Home Public/Private flow and its message (F-17) · P0 / Critical unless noted

**D13 · Fresh install starts on Private.**
1. Android Settings → Apps → TrackMyRead → Storage → Clear storage. Open the app and sign in as reader (skip the tour).
2. Expected:
   - Home composer shows **Private** (lock icon)
   - a book's page (Library → any book → note composer) shows **Private**
   - Profile → New Entry shows **Private**

**D14 · Private post from Home.**
1. On Home, with the switch on Private, write `QA-4B private <hh:mm>` and tap Post.
2. Expected:
   - a toast reads exactly **"Saved privately — find it on your Profile"**
   - only one note is created, even after a slow response
3. Pull to refresh Community on the phone. Expected: the post is **absent**.
4. As friend on the web, check the Community feed. Expected: **absent**.
5. Open Profile on the phone. Expected: the note is listed.

**D15 · Public post from Home.**
1. Flip the Home switch to **Public** and post `QA-4B public <hh:mm>`.
2. Expected:
   - **no** toast
   - after a refresh, the post appears in Community on the phone, and for friend on the web
3. **Delete this note immediately** from its ··· menu. The RULES forbid leaving public test content.

**D16 · The choice is remembered across composers and relaunch** · P1 / Major.
1. Without posting: Library → a book → note composer. Expected: **Public**.
2. Profile → New Entry. Expected: **Public**. Close without saving.
3. Kill and relaunch. Expected: the Home composer shows **Public**.

**D17 · Editing a private note keeps it private and doesn't touch the remembered choice.**
1. Profile → the `QA-4B private` note → pencil.
   Expected: its switch shows **Private**, even though the remembered choice is Public.
2. Change the text to `QA-4B private edited` and Save.
3. Expected:
   - Profile shows the edited text
   - friend on the web still does **not** see it in Community
   - the Home composer still shows **Public**

**D18 · Sign-out resets the choice.**
1. Profile → Sign Out, then sign in as reader again.
2. Expected: the Home, book-page and New Entry composers all show **Private**. (D05 covered the session-expiry variant.)

**D19 · The switch survives language change** · P2 / Minor.
1. Settings → Language → Русский.
2. On Home, on Private, post `QA-4B ru`.
3. Expected: a translated toast, not the raw key `notes.savedPrivately`.
4. Switch back to English and delete the note.

### Gate 4 — Disband (F-04) · P1 / Major

**D20 · Setup: a throwaway circle.** As reader on the phone: Circles → Create New Group:
- name `QA-4B circle <hh:mm>`
- **Private**
- no reading goal
- Expected: it appears in My Circles.

**D21 · The creator disbands it.**
1. Open `QA-4B circle` → Disband Circle → confirm.
2. Expected:
   - the app returns to Circles
   - the circle is **gone from My Circles without pull-to-refresh**
   - no "Could not disband group" alert
   - on the web as reader, the circle is not listed

   Do D23 **before** this step.

**D22 · A non-creator sees no Disband.**
- Open **Review Circle** as **friend**, who is a member but neither creator nor curator. Expected: no Disband button.
- Open Review Circle as **reader** (the creator). Expected: Disband is visible. **Do not tap it.**
- A curator who is not the creator: **SKIP on device.** No such account can be produced within policy: `invite_user` always creates `role="member"`, and there is no promote route. S22 is the evidence.

### Gate 5 — Invite Friends search (F-05) · P1 / Major

**D23 · Search lists a non-member.**
1. As reader, in `QA-4B circle` from D20 (no other members): Invite Friends → type `review`.
2. Expected: the result list includes **review.friend** within 3 s, and the app does not crash. **Do not tap Invite.**
3. Negative check, not a bug: in **Review Circle**, the same search does **not** list review.friend, because `GroupDetailScreen` filters out existing members (see Contract conflicts K5).
4. Type 1 character. Expected: the results clear (fewer than 2 characters).

### Gate 6 — Keyboard in the feed list (T-19) · P1 / Major

**D24 · Scrolling.**
1. Home → Community with a full feed (up to 50 posts).
2. Fling from top to bottom and back.
3. Expected:
   - no blank rows that stay blank for more than 1 s, no duplicated posts, no crash
   - pull-to-refresh works
   - the For You recommendations and the composer scroll away as the list header

**D25 · Typing in the composer.**
1. Tap the reflection box and type `QA 4B keyboard focus test` (25 characters) at normal speed.
   Expected: the keyboard stays open, and all 25 characters are present.
2. Tap the quote box and type 20 characters. Expected: the same.
3. With the keyboard open, tap an emotion chip once. Expected: the chip toggles on the first tap.
4. Clear both boxes. Don't post.

**D26 · Typing in a comment box, plus list interactions.**
1. In Community, find a **review.friend** public seed note and tap its comment toggle.
2. Type 25 characters in its comment box. Expected: focus stays, no characters are lost, and the expansion stays open. Clear it without sending.
3. On a **reader**-owned post, open the ··· menu. Expected: it opens; tap ··· again and it closes.
4. On friend's note, tap Like. Expected: the count increments. Tap again: it decrements. The net result is unchanged.
5. With the keyboard open in a comment box, scroll the list slightly. Expected: no crash. Losing focus when the row scrolls fully off-screen is acceptable; losing it while the row is still visible is a FAIL.

**D27 · The header search and the Friends tab.**
1. In the feed's find-friends search, type `review`. Expected: focus stays and results list review accounts. **Do not** tap Follow on anyone.
2. Switch to the Friends tab. Expected: currently-reading cards render. The friend avatar shows the photo if one is set (4A adds `profile_picture`).

### Also check on the same APK (report findings; the PM decides whether each blocks the AAB)

**D28 · Cold start (F-31)** · Major.
1. Check the backend is asleep: `curl -s -o /dev/null -w "%{time_total}" https://book-tracker-stitch.onrender.com/version`. A time over 10 s means it was asleep. This is opportunistic: you can't force idleness.
2. When it's asleep, kill and relaunch the app. Expected: the tabs show data, with no timeout alert and no blank tab.
3. After another 20+ minutes idle: sign out, then sign in. Expected: success on the first tap.

**D29 · Tour book search (F-12)** · Major.
1. Clear storage, sign in as reader, and go through the tour to the book step.
2. Type `hobbit`. Expected: 1–5 results, each with title and author. A missing cover must not crash (see K1).
3. Don't add, and skip the tour.

**D30 · Circle goal (F-15)** `[4A]` · Major.
1. Create a private `QA-4B goal` circle with reading goal 1000.
2. Expected: the Reading Goal card shows "0 of 1,000 pages" and a 0% bar.
3. A circle with no goal (from D20) shows no card.
4. Disband `QA-4B goal`.

**D31 · Curator badge (F-34)** · Minor. As reader, Circles → My Circles: Review Circle shows the Curator badge.

**D32 · Reject confirmation (F-25)** · Major.
1. Reader creates a private `QA-4B reject` circle.
2. Friend requests to join (web or orchestrator: `POST /groups/{id}/join`).
3. Phone as reader: open the circle → the pending request → Reject → **Cancel**. Expected: the row stays.
4. Reject → **Reject**. Expected: the row disappears.
5. Friend requests again; reader taps **Approve** (this produces D34's approved notification).

**D33 · Insights and Profile numbers (F-13, F-14)** · Major.
1. As reader, Settings → set yearly goal 12 → Save.
2. Expected on both Insights and Profile:
   - "X / 12 books", where X is reader's books finished this year, never "undefined"
   - a ring percentage of round(X/12 × 100)
3. Also on Insights:
   - Avg Rating shows a number (the seed has a rated finished book)
   - This Year shows X
   - Projected Finish shows a date for reader's in-progress book
4. Restore reader's yearly goal to its previous value.

**D34 · Notification taps (F-22)** · Major.
1. Sign out and sign in on the phone as **friend**, then open Notifications.
2. Tap "join request approved" (from D32). Expected: the `QA-4B reject` circle opens.
3. Tap "join request rejected". Expected: the Circles tab opens.
4. `admin_broadcast`: **SKIP** unless a broadcast row already exists in friend's 30-day history (sending one is forbidden). If one exists: its icon is not the generic bell, and a tap does nothing.
5. Afterwards, disband `QA-4B reject` as reader.

**D35 · Mark one read (F-23)** `[4A]` · Major.
1. As friend, with at least two unread rows: note the bell badge N.
2. Tap one unread row, go back, kill the app and relaunch.
3. Expected: that row still shows read, and the badge is N−1.
4. Mark All Read. Expected: the badge drops to 0 immediately, with no 60 s wait.

**D36 · No duplicate book (F-07)** `[4A]` · Critical (data integrity).
1. As reader, note the Library count.
2. In Home → Friends, open friend's currently-reading book that reader **already owns**. If none overlap, use a For You recommendation reader owns. If neither exists, SKIP.
3. Expected: BookPreview shows the already-in-library state ("View in My Library").
4. If an Add button is shown and tapped: an error saying it is already in the library (4A 400) appears, and the Library count is unchanged.

**D37 · TalkBack (F-38)** · Major.
1. Enable TalkBack. On Profile, Settings, GroupDetail (Review Circle) and Home, swipe through every icon.
2. Expected:
   - each icon button announces a name: Back, Settings, Change profile photo, Edit note, Delete note, Like (with its count), Comments (with its count), Post options, Add photo, Notifications (with its count)
   - the visibility control announces "Post visibility, switch, off/on" and its hint
   - the UserProfile Followers/Following/Books pills are **not** announced as buttons

**D38 · Build identity** · Minor. Settings footer shows version **2.2.2** and the build number equal to the APK workflow's run number.

**D39 · Other regressions on this APK:** RG-device items RG06, RG07, RG08, RG09, RG12, RG13 and RG20 (Part 4).

**D40 · Cleanup (mandatory)** · Critical.
1. Delete every `QA-4B` note.
2. Disband every `QA-4B` circle.
3. Unlike every like.
4. Restore reader's yearly goal.
5. Delete throwaway account T if it still exists.
6. Re-read and confirm, then report `created N / cleaned N`. If cleanup fails, stop and report.

---

## Part 4 — Regression

These are the screens and flows that share `api.js` (interceptors, timeouts, retry), `App.js` (auth state, preload, sign-out), NotificationContext and the touched screens (from the `dependency-map.md` android "UI actions → API" rows). For each: what a static check proves, and what only the device can cover.

| # | Pri / Sev | Area | Static proof (Junior QA) | Device (PM, same APK) |
|---|---|---|---|---|
| RG01 | P0 / Critical | Login: `POST /auth/google` errors stay login errors | S26 `not_auth_expired_for_401_without_authorization_header`; request interceptor still attaches the token only when one is stored | D03 |
| RG02 | P0 / Critical | `preloadData()` → PreloadContext seeds every tab | AST `sourceRules :: preload_keys_unchanged`: `Promise.allSettled` has 9 entries; `setPreloaded` object keys exactly `profile, library, feed, insights, activity, notes, groups, pendingGroups`; count read via `.unread` | After sign-in, Home, Library, Circles, Insights and Profile show data with no spinner over preloaded content |
| RG03 | P1 / Major | 60 s unread poll + bell badge | `App.js` still has `setInterval` calling `notificationsAPI.getUnreadCount`; `clearInterval(pollRef.current)` in both sign-out paths (S16, S29) | D35 step 4; badge changes within 60 s after a like from the second actor |
| RG04 | P1 / Major | Goodreads import keeps its 120 s timeout | S54: `timeout: 120000` present; cold-start upgrade only when `config.timeout === DEFAULT_TIMEOUT` | Not run (import mutates the library). Static only |
| RG05 | P0 / Critical | No non-GET is ever replayed (like, comment, post, join, delete, `/auth/google`) | S53 `not_retryable_for_post_put_patch_delete`; S56 | D14: exactly one note created |
| RG06 | P1 / Major | Library AddBookModal search + add | `git diff <4B range> -- src/screens/LibraryScreen.js` adds only `accessibility*` attributes (no logic lines) | As reader: Library → Add Book → search `siddhartha` → add as To Read → appears → remove it (it has no progress, so no F-50 500) |
| RG07 | P1 / Major | BookDetail rating PATCH vs progress PUT (May-2026 regression) | `grep -n "patchUserbook" src/screens/BookDetailScreen.js` still inside `handleRating`; `updateProgress` still inside the progress save | Change one seed book's rating by one star and restore it; status unchanged |
| RG08 | P1 / Major | UserProfileScreen after stat pills become `View` | S60; like and share touchables still have `onPress` | Open review.friend's profile: Follow button state correct (don't toggle), like and unlike a friend note, share sheet opens; pills are not tappable |
| RG09 | P1 / Major | GroupDetailScreen other sections after `load()` gains an 8th call | `sourceRules :: group_detail_load_arity_matches`; `handleLeave`, `handleRemove`, `handleDeletePost`, `handleApprove`, set-book and Copy Invite Link handlers unchanged in the diff apart from a11y attributes | Review Circle as reader: posts, leaderboard, members, activity and pending sections render; Copy Invite Link copies. Don't leave or remove anyone |
| RG10 | P1 / Major | GroupsScreen lists | S23; the Discover search call is unchanged | My Circles, Pending and Discover render; pull-to-refresh; Discover search `review` lists Review Circle (don't join others) |
| RG11 | P1 / Major | NotificationsScreen existing routes | `notificationEvents :: existing_event_targets_unchanged` | Tap one existing `post_liked` row → Home tab; one `new_follower` row (if any) → that user's profile |
| RG12 | P2 / Minor | Mark All Read | S50 | D35 step 4 |
| RG13 | P1 / Major | Settings rows next to the changed a11y elements | S59 SettingsScreen minimum 3; avatar picker still calls `profileAPI.updateMe` | Avatar picker opens and closes (Close is labelled); language switch works; Private Profile switch shows current state (don't toggle); notification prefs **not** toggled (F-49 is 4A's) |
| RG14 | P1 / Major | AppTour goal step, Skip, finish | `TOUR_KEY` literal unchanged (`git diff` shows no change to its value); goal step handler unchanged | D29 plus: the goal chip selects, Skip closes the tour, and it does not reappear on relaunch |
| RG15 | P2 / Minor | Friends tab still a ScrollView | S64 | D27 step 2 |
| RG16 | P1 / Major | Feed header find-friends search inside the FlatList header | S63: header is an element | D27 step 1 |
| RG17 | P0 / Critical | Files NOT to touch | `[R] git diff --stat <first-4B-commit>^..<last-4B-commit> -- book-tracker-mobile-stitch/src/navigation/AppNavigator.js book-tracker-mobile-stitch/src/screens/SearchScreen.js book-tracker-mobile-stitch/src/screens/OnboardingScreen.js book-tracker-mobile-stitch/src/theme.js book-tracker-mobile-stitch/src/buildInfo.js book-tracker-mobile-stitch/eas.json book-tracker-mobile-stitch/google-services.json` → empty (the Builder records the commit range in `code-map.md`) | — |
| RG18 | P0 / Critical | 4B changes no backend, web, schema or map | `[R] git diff --stat <4B range> -- app tests book-tracker-frontend-stitch context/supabase_migration.sql dependency-map.md features/maintenance/sprint-4a-platform-audit` → empty | — |
| RG19 | P0 / Critical | App bundles and imports resolve | S68 and S25 | Any crash anywhere in D01–D38 is a FAIL of this row |
| RG20 | P1 / Major | BookPreviewScreen from its other callers (Feed recommendation, friend card, tagged-post cover, UserProfile tile, GroupDetail current book) | S38; the `navigate('BookPreview'` call sites are unchanged in the diff | As reader, open BookPreview from a For You card and from Review Circle's current book: the screen renders title and cover; Back works. Don't add |
| RG21 | P0 / Critical | Shipped 2.2.1 unaffected by 4B | RG18 (4B ships no server change) | — |

---

## Part 5 — Release checklist cross-check

| # | Pri | Check | Exact evidence | Expected |
|---|---|---|---|---|
| RC01 | P0 | 4A backend live before any 4B build | `curl -s https://book-tracker-stitch.onrender.com/version`; `grep -n "## Contracts for 4B" features/maintenance/sprint-4a-platform-audit/architecture.md`; the C03, C11, C12, C16, C17 and C20 pytests plus the K8 additions | `commit` equals the 4A merge SHA; section present; all named pytests pass on that SHA |
| RC02 | P0 | Guard baseline equals Play's last accepted build | PM reads Play Console → App bundle explorer: highest versionCode | `60` / `2.2.1`, matching `release/last-released.json` (S07). If different, seed the real value and bump `app.json` above it (architecture Assumption 1) |
| RC03 | P0 | Version | S65; `eas.json` `appVersionSource: "local"` unchanged (RG17) | `2.2.2` / `61` |
| RC04 | P0 | Code on master before dispatch (workflows check out `ref: master`) | `[R] git fetch && git log origin/master --oneline -n 20` shows every 4B commit, including T-20's version bump as the last Package A commit; `git status` clean | Present |
| RC05 | P0 | Test APK build | "Build Stitch APK (Preview)" run log for that SHA | "Check version bump" prints 61 and 60 with no `::warning::`; "Install dependencies" runs `npm ci` and succeeds. The log does not print the svg version, so S01 + S02 + a successful `npm ci` are the evidence. Artifact `TrackMyRead-stitch-preview` (APK, `--profile preview`) downloaded within its 14-day retention |
| RC06 | P0 | Hard gate | D01–D27 results | All PASS (D22's curator sub-step SKIP is expected). Any rebuild → D01–D27 again in full |
| RC07 | P0 | Production AAB | "Build Stitch AAB (Production)" run log | Strict guard passes (61 > 60); `npm ci`; artifact `TrackMyRead-stitch-production` = `build.aab` (`--profile production`, app-bundle). The APK is **never** uploaded to Play |
| RC08 | P0 | Release | PM final go, recorded in `triage-2026-09-13.md` or the sprint retro | Play production release at **100%** (PM decision 2026-09-13), not staged. There is no partial rollout, so the gate in RC06 is the only safety net |
| RC09 | P1 | Guard re-armed for the next release | After Play accepts 2.2.2: commit `release/last-released.json` = `{"version":"2.2.2","versionCode":61}`; then `[M] node scripts/check-version-bump.js --strict; echo exit=$?` | `exit=1` with `::error::`. This is **expected**: it proves the next release must bump |
| RC10 | P0 | Hotfix path (rollback = new build) | If 2.2.2 misbehaves: fix on master → `app.json` `2.2.3` / `62` → APK → re-run D01–D07 plus the D items the fix touches → AAB (strict guard passes 62 > 61) → PM go → 100% → `last-released.json` = 2.2.3 / 62 | Never lower a versionCode; never rely on "halt rollout" as rollback |
| RC11 | P1 | Signing caveat | Setup §2 of Part 3 | Gate run on a phone without the Play build, or after uninstalling it |
| RC12 | P1 | Backward compatibility for 2.2.1 users | `grep -n "finished\|average_rating\|books_this_year\|projected_finish_date\|reading_goal\|pages_read_total" app/routers/reading_activity_router.py app/routers/groups_router.py` still returns the aliases | Aliases stay until 2.2.2 is the minimum supported version (4A handoff "Alias removal") |
| RC13 | P2 | Docs | Doc Sync diff | `repos/mobile/index.md` shows 2.2.2 / 61, `react-native-svg` exact pin, `npm ci`, guard step, NotificationService via `api.js`; LOAD_ME_FIRST "Recently Shipped" updated; the 12 dependency-map items in architecture "Dependency-map updates" applied; K3 handoff row updated |

---

## Test Cases

Summary index. Details for every ID are in Parts 1–5 above. Status is empty until Junior QA and the PM run them.

| IDs | Requirement / area | Count | Priority / severity |
|---|---|---|---|
| S01–S08 | R1 build prep (F-32) | 8 | S01, S02 P0/Critical; rest P1/Major |
| S10–S20 | R2 push follows account (F-03) | 11 | P0/Critical, except S15 P1/Major |
| S21–S23 | R3 Disband (F-04) | 3 | P1/Major |
| S24–S25 | R4 Invite search (F-05) | 2 | S24 P1/Major; S25 P0/Critical |
| S26–S31 | R5 expired session (F-11) | 6 | P0/Critical |
| S33 | R6 tour search (F-12) | 1 | P1/Major |
| S34 | R7 yearly goal (F-13) | 1 | P1/Major |
| S35 | R8 insights names (F-14) | 1 | P1/Major |
| S36–S37 | R9 circle goal (F-15) `[4A]` | 2 | P1/Major |
| S38 | R10 book_id (F-07) `[4A]` | 1 | P0/Critical |
| S39–S48 | R11 visibility switch (F-17) | 10 | P0/Critical, except S43, S46, S47 P1/Major |
| S49 | R12 notification routing (F-22) | 1 | P1/Major |
| S50–S51 | R13 mark read (F-23) `[4A]` for S51 | 2 | P1/Major |
| S52 | R14 reject confirm (F-25) | 1 | P1/Major |
| S53–S56 | R15 cold start (F-31) | 4 | S53 P0/Critical; rest P1/Major |
| S57 | R16 curator badge (F-34) | 1 | P2/Minor |
| S58–S61 | R17 TalkBack (F-38) | 4 | S58, S59 P1/Major; S60, S61 P2/Minor |
| S62 | R18 console gating | 1 | P2/Minor |
| S63–S64 | R19 FlatList | 2 | S63 P1/Major; S64 P2/Minor |
| S65–S66 | R20 version | 2 | P1/Major |
| S67, S68, S70, S71, S73 | Whole app | 5 | S68 P0/Critical; S67 P1/Major; rest P2/Minor |
| C01–C25 | Contract | 25 | C01–C06, C16, C18, C19 P0/Critical; C21, C22 P2/Minor; rest P1/Major |
| D01–D27 | Device hard gate | 27 | P0 (gate), severity per case |
| D28–D40 | Device also-check + cleanup | 13 | per case |
| RG01–RG21 | Regression | 21 | per row |
| RC01–RC13 | Release checklist | 13 | per row |

IDs S09, S32, S69 and S72 are intentionally unused: their checks were merged into S08, S26, C01 and RG17.

**Totals:** static 69 · contract 25 · `[4A]`-dependent (formerly BLOCKED-ON-4A) 14 (C03, C11, C12, C16, C17, C20; S36, S37, S38, S51; D12, D30, D35, D36) · device 40 (hard gate 27) · regression 21 · release 13.

## Priority Guide
- P0: Ship blocker. Must pass before the AAB is dispatched (device) or before the APK is dispatched (static and contract).
- P1: Important. Fix within the sprint.
- P2: Nice to have.

## Automated
Run in this order after A → B → C merge, before dispatching the APK (architecture Build & release step 5):
1. `[M] node --test "__tests__/*.test.mjs"` → `# fail 0`. This covers the nine files listed in "Node test files the Builder must create".
2. Every grep and `node -e` command in Part 1 → the stated output.
3. `[R] pytest tests -q` on the 4A-merged tree → `0 failed`, including the C-case pytests named above (these are 4A's tests; 4B adds none).
4. `[M] npx expo export --platform android --output-dir "<scratchpad>/qa-4b-export"` (S68).
5. `[M] EXPO_OFFLINE=1 npx --no-install expo install --check` (S70, informational).

## Failing Tests
None run yet. Junior QA records each failure here with its reason and disposition: fix now / deferred to sprint N / accepted risk.

## Findings for the orchestrator (found while writing; not fixed here)

| # | Severity | Finding | Evidence | Suggested route |
|---|---|---|---|---|
| F1 | Major | Spec R4 / architecture device step 5 accept criterion cannot pass (K5) | `GroupDetailScreen.js` `handleInviteSearch` filters `members[].user_id`; review.friend is a seeded Review Circle member | PM Helper / Architect |
| F2 | Minor | "Non-creator curator sees no Disband" has no in-policy device path | `groups_router.py invite_user` always sets `role="member"`; no role-change route exists | Accept; S22 is the evidence |
| F3 | Major (data loss, pre-existing, backend) | Editing a note clears its `emotion`, `page_number` and `chapter` | `notes_router.py update_note` assigns `note.emotion = payload.emotion`, `page_number` and `chapter` unconditionally; Android Profile edit sends only `text`, `quote` (plus `is_public` in 4B); 4A leaves `update_note` unchanged apart from the `is_public` default | Next backend sprint (not 4B) |
| F4 | Process | Two zero-import helpers requested for unit tests (Preconditions §1) | `api.js` and `VisibilityToggle.js` import RN / axios, so Node cannot load them | Architect sign-off before the Builder starts |
| F5 | Process | Offline tooling limits | `expo-doctor` not installed; `expo install --check` offline is unreliable, exits 1 at baseline and wants svg 15.12.1; `expo export` offline unverified | Accept; S68 / S70 as written |
| F6 | Process | A post-login-preload 401 cannot be forced on a release APK; no short-TTL token exists | `app/auth.py:17` 30-day TTL; release APK not debuggable | Accept; S30 is the evidence |
| F7 | Minor | `a11y.rateStars` uses `{{count}}`, which i18next treats as a plural trigger, while the brief says counts avoid interpolation | architecture §0.1 | Accept (falls back to the base key); S67 allows it |
| F8 | Process | 4A pytest coverage gap for the F-07 match order and two sub-shapes (K8) | 4A architecture test lists | 4A Senior QA before RC01 |
| F9 | Major (scope) | F-19 Android cover fallback is in the 4A handoff but not in the 4B brief (K1) | 4A handoff table row F-19 | PM / Architect decision before the build |
