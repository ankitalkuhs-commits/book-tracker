---
screen: sprint-4b-android-audit
feature: android
repo: mobile (book-tracker-mobile-stitch/) + .github/workflows
status: in-progress
last_verified: 2026-09-13
approved_by: PM — Android build 2.2.2 approved 2026-09-13; audit triage 4B list
pm_decisions: 2026-09-13 — Gate 2 approved; Play rollout 100% after the PM device check (hard gate before the AAB); composer remembers the last Public/Private choice (AsyncStorage `bt_note_visibility`); "Saved privately" message confirmed; SearchScreen/OnboardingScreen deleted in a later build, not 2.2.2
source: qa/reports/triage-2026-09-13.md (Sprint 4B list + "PM decisions — 2026-09-13"), qa/android/review-a.md, qa/android/review-b.md
---

## What It Does
One Android release, 2.2.2 (versionCode 61), that fixes the Android half of the 2026-09-13 audit. Broken circle actions work again (Disband, Invite Friends, reading goal, Reject confirmation, curator badge). The first-run tour finds books. An expired login returns to the sign-in screen instead of an empty app. Insights and Profile show the real goal and stats. Every note composer gets a Public/Private switch, private by default. Tapping a join-approved or join-rejected notification goes somewhere useful. Push notifications follow the account that is signed in, not the device. The first launch after the server has been asleep no longer fails. TalkBack reads every icon button. The build pipeline becomes reproducible and refuses a Play build with an unbumped versionCode.

## Appetite
Max complexity: medium (3–5 days across three parallel Builder packages), plus one PM device session (a hard gate before the AAB).

Not building:
- Deleting the unreachable `SearchScreen.js` / `OnboardingScreen.js`: PM-approved for a later build; 2.2.2 does not touch them
- F-30 own-comment delete (deferred by PM)
- F-35's "cover fix at most once a day" half (only the FlatList half is in scope)
- F-44 polish beyond `__DEV__` gating (expo-secure-store, New Architecture, KeyboardAvoidingView, Clipboard, unmount guards, AppTour.finish rejection, Linking catch)
- F-40 dead code: the never-opened shelf modals in `FeedScreen.js` / `UserProfileScreen.js`
- A mobile Friends-feed tab, curator-invites list, or group edit screen (parity gaps, not defects)
- Re-arming the 45 s cold-start window after the app returns from a long background
- Any backend, web, schema or `dependency-map.md` change (Sprint 4A owns those)

## Requirements
Each requirement cites its triage id. Items marked **PENDING-4A-CONTRACT** are built against the stated assumption and re-checked against 4A's architecture "Contracts for 4B" section before the build (re-checked 2026-09-13: 4A has spec.md only, no architecture yet).

- [ ] **R1 — Build prep (F-32).**
  - `package.json` pins `"react-native-svg": "15.15.4"` exactly, and `package-lock.json` is in sync.
  - Both `build-stitch-apk.yml` and `build-stitch-aab.yml` run `npm ci`.
  - `.github/workflows/build-android.yml` is deleted.
  - A version guard compares `app.json` with the last Play-released version. It fails the AAB workflow when `versionCode` is not greater, and warns in the APK workflow.
  - *Accept:* the AAB workflow log shows the guard passing at 61 and `npm ci`. Running the guard locally with `versionCode` 60 exits non-zero.
- [ ] **R2 — Push follows the account (F-03 mobile).**
  - Logout and account delete call `deregisterPushToken` while the token is still valid, and reset the module-level registration guard.
  - Session expiry resets the guard.
  - `NotificationService` makes every request through `api.js`, with no own base URL and no `fetch`.
  - *Accept:* on one device, A signs in and out, then B signs in. `POST /push-tokens/` is sent for B, and B receives B's pushes. A's server row is removed at A's logout.
- [ ] **R3 — Disband Circle works (F-04).** `groupsAPI.deleteGroup` exists and treats 204 as success. Disband is shown only to the circle's creator. After Disband the circle is gone from My Circles without a manual refresh. *Accept:* the creator disbands a throwaway private circle and it disappears. A non-creator curator sees no Disband button.
- [ ] **R4 — Invite Friends search works (F-05).** `GroupDetailScreen` uses `userAPI.searchUsers`. *Accept:* typing "review" in Review Circle's invite box lists review.friend.
- [ ] **R5 — Expired session returns to Login (F-11).** Any 401 on an authenticated request clears the token and shows Login with a "Session expired" message. This includes a 401 during `preloadData` at launch, after login, and mid-session. No state leaves the tabs rendered without a valid token. *Accept:* delete a throwaway account from another device and relaunch the app. Login shows with the message, not empty tabs.
- [ ] **R6 — Tour book search returns results (F-12).** AppTour reads `res.results` and maps `google_id → google_books_id` and `authors → author`. *Accept:* the tour search for "hobbit" lists 1–5 books.
- [ ] **R7 — Yearly goal is correct (F-13 mobile).** Insights and Profile read `yearly_goal.completed`. *Accept:* a user with goal 12 and 5 finished books sees "5 / 12 books" and a 42% ring on both screens. "undefined" never appears.
- [ ] **R8 — Insights stats are correct (F-14 mobile).** Insights reads `avg_rating`, `finished_this_year`, `projected_finish` (and `total_finished`), the canonical backend names. *Accept:* with a rated finished book and an in-progress book, the Avg Rating, This Year and projected finish date all render real values.
- [ ] **R9 — Circle reading goal works (F-15 mobile) — PENDING-4A-CONTRACT (goal shape).** Create sends `goal_pages`, plus `goal_period` only when a goal is set. GroupDetail fetches `GET /groups/{id}/goal` and renders the card from `goal_pages`, `pages_read` and `pct`. *Accept:* create a circle with goal 1000 and the goal card shows "0 of 1,000 pages".
- [ ] **R10 — No duplicate books from Feed/circle previews (F-07 mobile) — PENDING-4A-CONTRACT.** `BookPreviewScreen` add sends the local `book_id` (only when the object is a Book, never a userbook) and `isbn` when present. *Accept:* adding an already-owned book from a friend's currently-reading card creates no second library entry (4A pytest proves the server match; device confirms the "already in library" path).
- [ ] **R11 — Public/Private switch on every note composer, remembering the last choice (F-17 mobile; PM decision 2026-09-13).**
  - Feed, BookDetail and Profile (new and edit) show the switch and send `is_public` explicitly on every create, and on Profile edit.
  - New-note composers start from one remembered choice shared by all of them: AsyncStorage key `bt_note_visibility`, value `'private'` or `'public'`. The key is written when the switch changes. A user who has never chosen (or any unreadable value) starts on Private. Web uses the same key name in localStorage.
  - Profile edit shows that note's own visibility and does not change the remembered choice.
  - The remembered choice is cleared on sign-out and session expiry, so the next account on a shared phone starts on Private.
  - A private post from Home shows "Saved privately — find it on your Profile" (`notes.savedPrivately`, all 6 locales).
  - *Accept:* a fresh install starts on Private. A Private Home post shows the message, is absent from the Community feed and is on Profile. After flipping to Public, a new post appears in Community, and the BookDetail and Profile composers also show Public, surviving a relaunch. After sign-out and sign-in the switch is Private again.
- [ ] **R12 — Notification taps route (F-22 mobile).** `group_join_approved` opens that circle. `group_join_rejected` opens the Circles tab. `admin_broadcast` has its own icon and no navigation. *Accept:* tapping each row lands as described.
- [ ] **R13 — Tapping a notification marks it read on the server (F-23) — PENDING-4A-CONTRACT.** An unread row tap calls the 4A per-notification endpoint and refreshes the bell badge. Mark All Read also refreshes the badge. If 4A ships no endpoint, the single-row behaviour stays local-only and this is recorded. *Accept:* tap one unread notification, relaunch, and it is still read with the badge one lower.
- [ ] **R14 — Reject asks first (F-25 mobile).** Reject on a pending join request shows a confirm dialog. Cancel leaves the request. *Accept:* Cancel keeps the row, and confirm removes it.
- [ ] **R15 — Cold start doesn't fail first use (F-31).**
  - The first requests after launch (until one succeeds) get a 45 s timeout instead of 30 s.
  - An idempotent GET that times out or hits a network error is retried once after 2 s. POST/PUT/PATCH/DELETE are never retried.
  - The Login screen warms the backend with `GET /version`.
  - *Accept:* after the backend has been idle 20+ minutes, launch and sign in. It succeeds on the first attempt, and no tab is blank.
- [ ] **R16 — Curator badge shows (F-34).** GroupsScreen reads `membership_role`. *Accept:* My Circles shows the Curator badge on Review Circle for review.reader.
- [ ] **R17 — TalkBack names every icon button (F-38).** Every icon- or image-only touchable in reachable screens has an `accessibilityLabel` and `accessibilityRole`. The UserProfile stat pills stop being touchables. *Accept:* the static check finds zero unlabeled icon-only touchables outside the dead screens and modals, and the TalkBack pass on Profile, Settings, GroupDetail and Feed announces names.
- [ ] **R18 — No ungated console output (review A #10 / F-44).** Every `console.*` in `App.js` and `src/` is inside `if (__DEV__)`. *Accept:* `grep -rn "console\." App.js src | grep -v __DEV__` is empty.
- [ ] **R19 — Feed list is virtualised (review A #8 / F-35 FlatList half, size M).** The Community tab renders posts with `FlatList`, with the composer and recommendations as the list header. Typing in the composer or a comment box never drops the keyboard. *Accept:* on-device, a 50-post feed scrolls smoothly, and typing 20+ characters in the composer and in a comment box keeps focus.
- [ ] **R20 — Version and release.** `app.json` `version` 2.2.2, `android.versionCode` 61. The build happens only after 4A's backend is live. The PM's device check of the test APK is a hard gate before the AAB is built: sign-out and expired session, push on a shared phone, the Home Public/Private flow and its message, Disband, Invite search, and keyboard behaviour in the feed list. After the PM's final go, the Play release goes to 100% of users (PM decision 2026-09-13). Rollback is a hotfix build (2.2.3 / 62).
- [ ] Empty state handled — unchanged per screen. The new goal card is hidden when `goal_pages` is null.
- [ ] Loading state handled — no new spinner over PreloadContext data. The goal card appears when its fetch resolves.
- [ ] Error state handled — Render cold start is covered by R15. The session-expired path is R5. A failed deregister never blocks sign-out.

## Screen States
| State | Trigger | What User Sees |
|---|---|---|
| session-expired | any 401 on an authenticated request (launch, login preload, mid-session poll) | Login screen + "Session expired — please sign in again" alert |
| cold-start | first requests after launch while Render wakes | the existing splash carousel for up to ~45 s, then normal tabs; no timeout alert |
| composer default | Feed / BookDetail / Profile new-note composer opened | switch shows the remembered choice (`bt_note_visibility`); **Private** if never chosen or after sign-out |
| private post (Feed) | posted with switch on Private | toast "Saved privately — find it on your Profile"; post not in Community feed |
| goal card empty | circle has no `goal_pages` or `/goal` failed | no Reading Goal card (unchanged behaviour) |
| disband hidden | viewer is a curator but not the creator | no Disband button |
| notification rejected tap | `group_join_rejected` row tapped | Circles tab |

## Parity
- [ ] Web — Sprint 4A (F-03 web, F-17 web, F-22 web, F-23 web, F-25 web). No web change here.
- [x] Mobile — every item above.
- [x] Deliberately mobile-only: build pipeline (R1), cold-start retry (R15), FlatList (R19), TalkBack labels (R17).
- Known parity difference: Android routes `group_join_rejected` to the Circles tab, because `GET /groups/{id}` is 403 for a private circle the user is not in (`groups_router.py:422-433`). Web may open the group page.
