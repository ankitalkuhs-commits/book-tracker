---
screen: sprint-4i-report-block
feature: safety
package: 4I P5 — report and block in the Expo / React Native app
builder: Builder (4i-mobile worktree, branch `builder-4i-mobile`)
built: 2026-10-11
android __tests__: 140 collected / 139 passed + 1 pre-existing failure before -> 152 passed after (+12)
pytest: unchanged — no Python file is touched by this package
---

# Sprint 4I P5 build notes — the mobile client

What shipped: Report on all six surfaces of spec R-05, Block from the public profile and the
user-search row, a blocked-readers list in Settings with Unblock, the "Also block this person"
checkbox checked by default on a **single** `POST /reports`, copy in all six locales, the
`content_reported` notification row, and the version bump for the one store release that carries
both halves of this sprint.

**The thing that had to not go wrong:** the per-post menu was gated owner-or-admin, so opening it
for everybody is a privilege escalation waiting to happen. It is open now and Delete is still
behind its own gate, and that is asserted from two directions by one case whose detector is proved
in both directions first.

---

## 1. What was built, file by file

| File | Change |
|---|---|
| `src/services/api.js` | `+ userAPI.reportContent`, `blockUser`, `unblockUser`, `getBlocks`. **On `userAPI`, not a new `safetyAPI`** — see §5 item 1. |
| `src/components/ReportDialog.js` (new, 196 lines) | The report sheet: the server's seven reasons in the server's order, an optional detail capped at the model's 1000, "Also block this person" at `useState(true)`, and **one** request. `useWindowDimensions()`, never a module-scope `Dimensions.get` (A-15). |
| `src/utils/safety.js` (new, 50 lines) | `confirmBlock` — the one copy of the block confirmation, so the promise is the same at both Block sites. Cancel first and with no `onPress`, the `handleReject` precedent. |
| `src/screens/FeedScreen.js` | R-05 sites **1, 2, 6**. The post menu's **outer gate removed**, Delete re-gated inside it; a Report control on the comment row; a `···` menu on the search-result row carrying Block and Report. `menuUserId` and `reportTarget` state, `openReport`/`handleBlock`/`afterBlock`, one `<ReportDialog>`. |
| `src/screens/UserProfileScreen.js` | R-05 sites **3, 4** and Block site 1. A `···` menu beside Follow carrying **Unfollow, then Block, then Report**; a Report control in the public-note header; one `<ReportDialog>`. |
| `src/screens/GroupDetailScreen.js` | R-05 site **5**: a Report control in the circle-post header, beside the curator's trash. One `<ReportDialog>`. |
| `src/screens/SettingsScreen.js` | R-28: a "Blocked readers" row **in the Privacy section**, and a sheet listing `GET /blocks` with an Unblock per row. |
| `src/screens/NotificationsScreen.js` | `+ content_reported` in `EVENT_CONFIG`. **This fixes a red that was already on the merged tree** — see §5 item 2. |
| `src/i18n/locales/{en,de,es,fr,pt,ru}.json` | `+ safety.*` (30 keys, one nested `reasons` object) and `+ a11y.*` (7 keys), in all six. 42 added lines per file, 1 changed (a trailing comma). |
| `app.json` | `version` 2.2.4 -> **2.2.5**, `ios.buildNumber` "5" -> **"6"**, `android.versionCode` 63 -> **64**. `android.package` and `ios.bundleIdentifier` untouched, and a case asserts they stayed. |
| `__tests__/reportAffordance.test.mjs` (new) | **12 collected.** |
| `__tests__/appleSignIn.test.mjs` | One edit: a named, bounded `SPRINT_4I_FILES` set in the 4G file-ownership rule — see §5 item 3. |
| `.github/workflows/ci-tests.yml` | Android floor 140 -> **152**, measured, with the reason in the comment block. |

### The six surfaces, and how each is anchored

Every anchor is an element that **existed before this sprint**, so the assertion is "the Report
item is here", not "the thing I added is the thing I added".

| # | Surface | File | Anchor |
|---|---|---|---|
| 1 | Feed post | `FeedScreen.js` | the menu root `<View>`, located from its own trigger's `setMenuPostId` handler |
| 2 | Feed comment | `FeedScreen.js` | `<View style={styles.commentRow}>` |
| 3 | Public-profile note | `UserProfileScreen.js` | `<View style={styles.noteHeader}>` |
| 4 | Public profile (the reader) | `UserProfileScreen.js` | `<View style={styles.actionCluster}>` (the follow button's cluster) |
| 5 | Circle post | `GroupDetailScreen.js` | `<View style={styles.postHeader}>` |
| 6 | User search result | `FeedScreen.js` | `<View style={styles.userCard}>` |

Block lives at **two** of those, 4 and 6 (C-05m). It is deliberately not on every surface: "Also
block this person" in the report dialog covers the rest, and a Block button on every card is the
opposite of what pm-decisions E-1 asks for.

### Why site 1 is not anchored by a style

`styles.menuDropdown` **is no longer unique in `FeedScreen.js`** — the post menu and the new
search-result menu share it — so the anchor resolved to two elements. The "each anchor resolves to
exactly one line" rule is what caught that, on the first run, which is the whole reason the rule
exists. Site 1 is anchored by `setMenuPostId` instead, the post menu's own state setter, shared
through one `POST_MENU_TRIGGER` constant with C-04m so the two cases cannot drift onto different
menus.

---

## 2. The menu gate, and the escalation it could have been

Before: `FeedScreen.js:669` wrapped the whole menu in `{(isOwnPost || isAdmin) && (…)}`. A
non-owner saw no `···` at all, so Report had nowhere to live.

After: the outer gate is **gone**, and the single owner-only item inside it — Delete — carries
`{(isOwnPost || isAdmin) && (…)}` of its own. Report is `{!isOwnPost && (…)}`.

`the_post_menu_is_open_to_everyone_and_leaks_no_owner_action` asserts both halves and is proved in
both directions **before** it looks at the real source: the same detector is run over a synthetic
menu with the inner guard present (must report zero violations) and over one without it (must
report exactly one). The owner-only item count is asserted against a literal **first**, so adding a
second destructive item without guarding it cannot read as "nothing to check".

The two mutations that matter are both in the table: **MUT-P5-01** restores the outer gate (Report
becomes unreachable) and **MUT-P5-02** opens it without wrapping Delete (every reader gets a Delete
button on every post). Both bite, each on one case, with the real line.

---

## 3. Copy that carries a decision

`safety.blockConfirmBody`, `en`:

> You and {{name}} will no longer see each other anywhere in TrackMyRead, and neither of you can
> follow, like or comment on the other. Any follow between you is removed now and will not come
> back if you unblock later. This does not unpublish public posts — anyone who is signed out can
> still read them on the open web.

Three things, each one asserted as a **regex** rather than as a sentence, because the anchors are
what make the copy accurate and the wording is the PM's:

1. mutual invisibility (`/stop seeing|no longer see|hidden from each other/i`);
2. the follow is gone **and does not come back** (`/follow/i` **and**
   `/not come back|removed|permanent/i`) — R-21 is irreversible and a reader must not find that
   out afterwards;
3. **E-8's limit**: a block does not unpublish public posts, which a signed-out visitor can still
   read (`/public|signed out|open web|does not unpublish/i`). pm-decisions says "say this plainly
   in the UI copy", so it is in the sentence a reader reads before the tap, not in a help page.

Dropping (2) or (3) is MUT-P5-08 and MUT-P5-09; both bite.

**Unfollow is the first item in the profile menu, above Block**, and that has its own case —
`unfollow_sits_above_block_in_the_profile_menu` — because tests.md has none and "a menu offering
only the nuclear option pushes people into it" is a decision with no other proof. On the
search-result row the softer option is the Follow/Following button already sitting beside the menu.

### The six locales

`safety` is 30 keys (including a nested `reasons` object of 7) and `a11y` gains 7, in every one of
`en, de, es, fr, pt, ru`. Register follows each file's existing choice — `du` in German, `tú` in
Spanish, `vous` in French, `você` in Portuguese.

`__tests__/i18nParity.test.mjs` is the gate for parity: its key-set comparison goes red on a key
present in one locale and absent from another. It does **not** notice a key absent from *all six*,
so `every_new_4i_string_is_in_all_six_locales` adds that half — an explicit 37-key list with the
count asserted first, non-empty values, no value equal to its own key, placeholders matching `en`,
and a non-vacuity sweep that every listed key is actually rendered by the product.

The locale edit was made by a script that **round-trips each file and asserts the dump is
byte-identical before touching anything**, so the diff is 42 added lines and one comma per file
rather than a reformat nobody can review.

---

## 4. Mutation-proof table

House rule, applied to every row: the named node was run **green**, the one-line change applied,
the same node run again and required to be **RED** with the first failing line recorded, the change
reverted, and the node re-run **green**. Run by an apply -> run -> revert -> re-run harness kept in
the session scratchpad and deliberately not committed. **24 mutations. Every `green_before` and
`green_after` was True, and the whole suite was re-measured at 152 passed after every revert.**

| MUT | One-line change | File | Node that must go red | Measured first RED line | Mutated run |
|---|---|---|---|---|---|
| P5-01 | restore the outer `(isOwnPost \|\| isAdmin)` gate around the whole post menu | `FeedScreen.js` | `the_post_menu_is_open_to_everyone_and_leaks_no_owner_action` | ``the feed post menu is still gated owner-or-admin (`isOwnPost \|\| isAdmin`) — a non-owner sees no menu, so Report is unreachable`` | 1 failed, 151 passed |
| P5-02 | open the outer gate without wrapping Delete | `FeedScreen.js` | same | `owner-only action(s) leaked to every reader: onPress={() => handleDeletePost(post)}` | 1 failed, 151 passed |
| P5-03 | delete site 5's Report item | `GroupDetailScreen.js` | `report_reachable_at_every_r05_mobile_site` | `5 of 6 R-05 sites carry Report; missing: 5 circle post` | 2 failed, 150 passed |
| P5-04 | make the report detector match nothing | `reportAffordance.test.mjs` | same | `detector missed a Report item that is there` | 1 failed, 151 passed |
| P5-05 | make C-03m's strip a no-op | `reportAffordance.test.mjs` | `the_detector_reports_zero_on_a_stripped_copy` | `the strip removed 0 Report items, expected 6 — it is too greedy or too narrow either way` | 1 failed, 151 passed |
| P5-06 | set `R05_SITE_COUNT` below the list length | `reportAffordance.test.mjs` | `report_reachable_at_every_r05_mobile_site` | `expected 5 R-05 anchors, found 6` | 2 failed, 150 passed |
| P5-07 | remove Block from the user-search row | `FeedScreen.js` | `block_reachable_from_the_profile_and_from_a_search_result` | `1 of 2 Block sites carry Block; missing: user search result row` | 1 failed, 151 passed |
| P5-08 | drop the follow warning from the confirm copy | `en.json` | `the_block_confirm_says_what_it_cannot_undo` | `the confirm does not say the follow is gone for good — unblocking restores nothing, and a reader must not discover that afterwards` | 1 failed, 151 passed |
| P5-09 | drop E-8's public-posts limit from the confirm copy | `en.json` | same | `the confirm does not state E-8's limit: a block does not unpublish public posts, which a signed-out visitor can still read` | 1 failed, 151 passed |
| P5-10 | remove the Unblock control | `SettingsScreen.js` | `settings_has_a_blocked_list_with_unblock` | `each blocked row must carry exactly one Unblock control` | 1 failed, 151 passed |
| P5-11 | initialise "Also block" to `false` | `ReportDialog.js` | `also_block_is_checked_by_default` | `the "Also block this person" checkbox must start CHECKED (pm-decisions E-3) — a report changes nothing anyone else sees, so the block is the reader's only relief in the moment` | 1 failed, 151 passed |
| P5-12 | render the checkbox but drop `alsoBlock` from the call | `ReportDialog.js` | `the_report_submit_sends_one_request_not_two` | `reportContent is called without alsoBlock (keys: targetType, targetId, reason, detail)` | 1 failed, 151 passed |
| P5-13 | send the block as a **second** request | `ReportDialog.js` | same | `ReportDialog calls blockUser, reportContent — the report and the block are ONE transaction on the server (pm-decisions Q-3); a second request re-opens "what if the block half fails"` | 1 failed, 151 passed |
| P5-14 | add an eighth client reason | `ReportDialog.js` | `the_reason_picker_offers_exactly_the_apis_closed_set` | `the client offers 8 reasons, not 7` | 1 failed, 151 passed |
| P5-15 | ship `en` only (remove one key from `de`) | `de.json` | `every_new_4i_string_is_in_all_six_locales` **and** `i18nParity::key_sets_match_en_except_ru_few_many` | `de:safety.blockConfirmBody is missing` | 2 failed, 150 passed |
| P5-16 | leave a locale value equal to its own key | `fr.json` | `every_new_4i_string_is_in_all_six_locales` | `fr:safety.block is its own key` | 1 failed, 151 passed |
| P5-17a | hide Unfollow behind a gate that is never true | `UserProfileScreen.js` | `unfollow_sits_above_block_in_the_profile_menu` | ``the Unfollow item is gated on `false` — it must be shown exactly when the viewer follows this reader`` | 1 failed, 151 passed |
| P5-17b | move Block **above** Unfollow | `UserProfileScreen.js` | same | `Unfollow is at index 1 and Block at 0 — Unfollow must come first` | 1 failed, 151 passed |
| P5-18 | skip the iOS build-number bump | `app.json` | `the_version_is_bumped_for_the_one_release_that_carries_both_halves` | `ios.buildNumber is 5; TestFlight already has build 5, and App Store Connect rejects a repeat` | 1 failed, 151 passed |
| P5-19 | freeze the sheet's width with a module-scope `Dimensions.get` | `ReportDialog.js` | `appleSignIn::layout_width_is_not_frozen_at_module_scope` (A-15) | `Dimensions.get() at module scope freezes the width — wrong on iPad and after rotation: src/components/ReportDialog.js` | 1 failed, 151 passed |
| P5-20 | remove `content_reported` from `EVENT_CONFIG` | `NotificationsScreen.js` | `notificationEvents::event_config_covers_every_active_backend_event` | `EVENT_CONFIG is missing backend event "content_reported"` | 1 failed, 151 passed |
| P5-21 | point `getBlocks` at a route the server does not register | `api.js` | `apiContract::every_api_js_call_matches_a_backend_route` (RG-4I-04) | `unexpected unmatched api.js calls: GET /blocks/mine` | 1 failed, 151 passed |
| P5-22 | drop the `accessibilityLabel` from the new comment-report button | `FeedScreen.js` | `a11yTouchables::unlabeled_touchables_only_in_allowlisted_dead_code` | `Expected values to be strictly deep-equal` (the allowlist gains `FeedScreen.js: 2`) | 2 failed, 150 passed |
| P5-23 | touch a mobile file outside **both** allowlists | `BookDetailScreen.js` | `appleSignIn::the_mobile_diff_touches_only_the_named_files` | `P4 touched files it does not own: book-tracker-mobile-stitch/src/screens/BookDetailScreen.js` | 1 failed, 151 passed |

### Mutations that did not bite first time, reported rather than replaced

**1. MUT-P5-17a stayed GREEN, and it found a real hole in my own case.** The ordering case is a
source-order scan, so `{false && (<TouchableOpacity … toggleFollow() …>)}` satisfied every
assertion in it — the element is still in the AST, still before the Block item — while **no reader
would ever see Unfollow**. A menu whose softer option is unreachable is exactly the failure
pm-decisions E-1 is about, and the case could not see it. Fixed by also asserting the Unfollow
item's nearest enclosing condition **names `following`**, and the mutation then bites with its own
line. Non-vacuity rule 14, caught by running the mutation rather than by reading the test — the
same class of hole 4I-A found in its S-12 and 4I-B in its B-35.

**2. MUT-P5-01 as first written turned 12 cases red on the PARSER, not one on the assertion.**
Wrapping the menu in `{(isOwnPost || isAdmin) && (` without the matching `)}` leaves the file
unparseable, and `node --test` then reports a dozen failures that have nothing to do with the gate.
A mutation that breaks the parser proves the parser works. Re-done as a balanced two-part edit
(open **and** close), and it then bites exactly one case with the real line, recorded above. Worth
stating because the same trap waits for anyone mutating JSX by hand.

**3. MUT-P5-23 as first written stayed GREEN, for a reason that is not about this sprint.** It
touched `src/screens/LibraryScreen.js`, which is **already** in Sprint 4G's own `allowed` set (it
was one of the seven files that sprint's frozen-`Dimensions` sweep converted). A file in neither
list was needed; `BookDetailScreen.js` is one, and the rule bites.

---

## 5. Problems found — in the brief, the plan and the tree

1. **`apiContract.test.mjs`'s `API_OBJECT_NAMES` is a hand-written list, so a new `safetyAPI`
   object would have been swept by nothing.** `every_xAPI_member_access_is_a_defined_key` and
   `every_api_js_call_matches_a_backend_route` only look at the ten names in that literal. A new
   object is not *wrong* — it is **invisible**, which is worse, because a detector that matches
   nothing looks exactly like one that matches everything. The four new functions therefore live on
   **`userAPI`**, which is already in the list, keeps `blockUser`/`unblockUser` beside
   `followUser`/`unfollowUser` (the relationship they tear down), and needed no edit to an existing
   test's inventory. The reason is in a comment in `api.js` so the next person does not "tidy" it
   into a new object.

2. **The merged 4I-A + 4I-B tree was already RED on a mobile case, and neither API package noticed
   because neither runs the Node suites.** `notificationEvents.test.mjs::event_config_covers_every_active_backend_event`
   greps `app/notifications/config.py` for its event names and requires every one to be in the
   mobile `EVENT_CONFIG`; 4I-A added `content_reported` to the Python and there was no mobile entry,
   so the Android suite was **140 collected / 139 passed** on arrival. That is this package's
   measured "before", and the fix is one line in `NotificationsScreen.js`. **The cross-client gate
   works; what is missing is anyone running it.** An API-half Builder changing
   `app/notifications/config.py` or `app/routers/*.py` moves two Node suites
   (`notificationEvents` and `apiContract`) and should run them.

3. **Sprint 4G's `the_mobile_diff_touches_only_the_named_files` is pinned to a fixed `BASE`
   (`5fc8ccc`), so it bounds every later sprint that touches this tree, for ever.** It is the exact
   shape of problem 4I-B reported for 4G's `test_no_existing_test_file_was_edited`, and it gets the
   same answer: a **named, reasoned `SPRINT_4I_FILES` set bounded by its own literal count**, not a
   widened `allowed` (which would read as a claim that Sprint 4G owned these files) and not a
   deleted rule. MUT-P5-23 proves anything outside both lists is still an offender.
   **The permitted-exception list in pm-decisions' amendment to done-checklist item 7 is therefore
   one file longer still** — add `book-tracker-mobile-stitch/__tests__/appleSignIn.test.mjs`.

4. **The same rule reads `git status --porcelain`, which on Windows flags a line-ending-only
   difference as a touched file.** My mutation harness rewrote two files with LF where the working
   tree had CRLF; `git diff --numstat` reported `0 0` for both — no content change at all — while
   the rule named them as unowned files. Restored with `git checkout --` and the harness now
   preserves newlines. Recorded because a reviewer on Windows will hit it, and because the fix is
   not in this sprint's scope: the rule wants `git diff --name-only` semantics rather than
   `status --porcelain`.

5. **tests.md's C-06b cannot hold as written, and it is inverted rather than dropped.** It asks
   that "the `POST /blocks` call's rejection is handled on its **own** path and reaches a distinct
   i18n key". There is no `POST /blocks` call in the report flow: pm-decisions **Q-3** replaced the
   two requests with one `POST /reports` carrying `also_block`, written in one server transaction,
   precisely so that "what if the block half fails" has no answer to specify. The case is now
   `the_report_submit_sends_one_request_not_two` and asserts the opposite property — that the
   second request did not come back — with MUT-P5-13 (add a `blockUser` call) as its mutation.
   **C-13m carries the same stale clause** ("the control is wired to the `POST /blocks` call"); it
   is wired to the `also_block` field of the one `POST /reports` call, and the case asserts that,
   plus that `api.js` actually sends `also_block` and that the **server default is still `False`**
   (read out of `reports_router.py`) so an old client cannot start blocking people.

6. **tests.md has no mobile case for the Unfollow-above-Block ordering**, although pm-decisions E-1
   states it twice and the brief calls it out. Written as
   `unfollow_sits_above_block_in_the_profile_menu`. See §4 finding 1 for the hole its first version
   had.

7. **tests.md's C-16 is web-only by construction and leaves a mobile gap.** It reasons that mobile
   is covered by `i18nParity.test.mjs` — true for *parity*, and parity cannot see a key that is
   missing from all six files at once. `every_new_4i_string_is_in_all_six_locales` closes that, with
   the key count asserted against a literal first and a non-vacuity sweep that every key is
   rendered.

8. **`styles.menuDropdown` stopped being a unique anchor the moment this sprint added a second
   menu to `FeedScreen.js`.** Caught by the "exactly one" rule on the first run, which is what that
   rule is for; site 1 is now anchored by `setMenuPostId`. Worth stating because the obvious
   instinct on seeing `found 2` is to relax the assertion to `>= 1`, and that would have made the
   case unable to tell the post menu from the search-result menu for ever.

9. **`a11yTouchables.test.mjs` is a tighter constraint than it looks.**
   `unlabeled_touchables_only_in_allowlisted_dead_code` is a `deepEqual` against an exact map, so
   every icon-only control added here needs an `accessibilityLabel`, and
   `icon_labels_use_i18n_not_literals` requires it to be a `t()` call rather than a string. Both
   satisfied; MUT-P5-22 shows the sweep bites. The new controls are `TouchableOpacity`, so they are
   visible to that sweep — 4G's K-17 found that a different primitive makes it silently stop
   looking.

10. **pytest was not runnable in this worktree as checked out** (`No module named pytest`) until
    `pytest` and `pyyaml` were installed, which the CI workflow does explicitly for the same
    reason. No Python file is touched by this package, so the 952 and its floor are unchanged; the
    measured run is in §6.

---

## 6. Counts

| Suite | Before | After |
|---|---|---|
| `book-tracker-mobile-stitch/__tests__` (`node --test "__tests__/*.test.mjs"`) | **140 collected / 139 passed, 1 failed** — the failure is §5 item 2, pre-existing on the merged 4I-A+4I-B tree | **152 collected / 152 passed, 0 failed** |
| `pytest tests -q` | 952 | **952 — unchanged, no Python file touched** |

152 = 140 + 12, all twelve in the new `__tests__/reportAffordance.test.mjs`. No test id was
removed; one existing case (`the_mobile_diff_touches_only_the_named_files`) was edited in place and
its reason is in a comment beside the change.

tests.md §1 predicted 149 for nine cases. The three extra are named in the CI comment and in §5
items 6 and 7, plus `the_version_is_bumped_for_the_one_release_that_carries_both_halves` — there is
no OTA channel, and `release/last-released.json` is a **Play** record (2.2.3 / 62) that does not
know iOS already shipped **2.2.4 build 5** to TestFlight, so `ios.buildNumber` is checked against
that known value rather than against the file.

**`NODE_PATH` must point at `book-tracker-mobile-stitch/node_modules`**, not the repo root.
Measured on this branch: with the root path the run reports **32 collected / 21 passed / 11 failed**
instead of 152 / 152 / 0. CI gets this right (`working-directory: book-tracker-mobile-stitch` plus
`npm ci`); a human running it by hand from the repo root does not, and the shape of the wrong
answer — a collapsed count — is the exact failure mode the CI count check exists to catch.

---

## 7. What this package does NOT do

- **No EAS build and no push.** The commit sits on `builder-4i-mobile`.
- **No admin Reports tab.** That is `AdminPage.jsx`, web, P4. Until it lands, "a human looks at it"
  means the PM making an authenticated `GET /admin/reports`. pm-decisions calls the tab a
  requirement of the client package, not a nicety — it is **not in this half**, and the
  2-working-day commitment published on trackmyread.com/support depends on it.
- **Nothing for a signed-out reader** (E-8). Stated in the confirm copy rather than worked around.
- **No ejection from circles** (E-2). Each still sees the other in Members and on the leaderboard.
- **No second-account defence** (F2).
- **The affordances are proved as source shape only** (tests.md §15 item 11). These cases do not
  prove the item renders, that the touch target is reachable, that the sheet opens or that the
  request is sent. The substitute proof is one manual pass per surface on both builds, screenshotted
  for the submission notes — **D-4I-01, D-4I-02, D-4I-04 and P-4I-09, still outstanding**, and on
  **iPad** as well as phone, because `supportsTablet: true` means every screen here is reviewed
  there.
