# Android Code Review B — TrackMyRead mobile

Scope: `GroupsScreen`, `GroupDetailScreen`, `InsightsScreen`, `ProfileScreen`, `UserProfileScreen`,
`SettingsScreen`, `NotificationsScreen`, `theme.js`, `src/i18n/*`, `package.json`, `eas.json`, the three
build workflows, `services/api.js`, and the backend routers each screen calls
(`groups_router.py`, `reading_activity_router.py`, `notifications/router.py`, `notifications/config.py`,
`notifications/dispatcher.py`, `users_router.py`, `profile_router.py`, `models.py`). Static read-only
review — no code changed, nothing executed against the live API per `qa/RULES_OF_ENGAGEMENT.md`.

Full per-element inventory: `qa/inventory/mobile-b.json` (70 entries).

---

## Critical

### C1 — Disband Circle crashes: `groupsAPI.deleteGroup` does not exist
`src/screens/GroupDetailScreen.js:486` calls `groupsAPI.deleteGroup(groupId)`. `services/api.js`'s
`groupsAPI` (lines 120-156) has no `deleteGroup` method at all, even though the backend route exists
(`DELETE /groups/{group_id}`, `groups_router.py:466`). **Failure scenario:** a curator taps "Disband
Circle" → confirms → `TypeError: groupsAPI.deleteGroup is not a function`, caught by the surrounding
try/catch, so the user just sees a generic "Could not disband group" alert and the group is never
deleted — the destructive action silently no-ops forever. Separately, once fixed: the button is shown to
*any* curator, but the backend restricts deletion to `created_by` only (`groups_router.py:472-474`), so a
non-creator curator will still get a 403.

### C2 — Invite Friends search crashes: `usersAPI` does not exist
`src/screens/GroupDetailScreen.js:11` imports `usersAPI` from `services/api.js`, which only exports
`userAPI` (singular, `services/api.js:97`). `handleInviteSearch` (`GroupDetailScreen.js:358`) calls
`usersAPI.searchUsers(...)`. **Failure scenario:** a curator opens a group they curate, types 2+
characters into "Invite Friends by username" → `usersAPI` is `undefined` → property access throws
before the request is even attempted → the invite feature is completely broken for every group.

---

## High

### H1 — Notification preference toggles silently reset each other
`SettingsScreen.js:218`'s `togglePref` sends a **partial** body, `{ [key]: value }`, to
`PATCH /notifications/prefs`. The backend's `NotificationPrefs` pydantic model
(`app/notifications/router.py:184-191`) defaults every field to `true` and `update_prefs`
replaces the stored JSON wholesale (`pref_dict = prefs.model_dump()`, line 223) — it does not
merge with what's already stored. **Failure scenario:** a user turns off "New Follower" (persists
`new_follower:false`, all others default-true — fine so far). They then turn off "Post Liked" — the
request body is `{"post_liked": false}`, and every *other* field including `new_follower` defaults back
to `true` in the pydantic model and gets written to the DB. The user's first opt-out is silently reverted.
Any single toggle undoes all previously-disabled preferences except the one field explicitly included.
This is invisible client-side (local React state is correct) — only the persisted server value drifts,
so it resurfaces as unexpected push notifications the user thought they'd turned off. Fix: either the
backend should merge into the existing stored dict, or the client should always PATCH the full local
`prefs` object.

### H2 — Yearly reading goal is broken everywhere it's shown (`finished` vs `completed`)
Backend `GET /reading-activity/insights` returns `yearly_goal: {goal, completed, pct, on_track}`
(`reading_activity_router.py:81-86`). Both `InsightsScreen.js:203` (`yearGoal.finished || 0`) and
`ProfileScreen.js:407,520` (`yearGoal.finished`, no fallback) read a `finished` field that does not exist.
**Failure scenario:** any user with a yearly reading goal set sees the goal ring stuck at 0% and "0 of N
books" on Insights, regardless of how many books they've actually finished. On ProfileScreen it's worse —
`ProfileScreen.js:520` has no `|| 0` guard, so it literally renders the string **"undefined / 5 books"**
to the user. `on_track` happens to be spelled the same on both sides, so the "On Track"/"Behind Pace"
badge is the only part of this feature that works correctly.

### H3 — Insights: three more field-name mismatches make stats silently wrong or blank
`InsightsScreen.js`:
- `insights.average_rating` (line 181) doesn't exist; backend field is `avg_rating`
  (`reading_activity_router.py:191`) → the Avg Rating card always shows "—" and the "rate your books"
  hint always shows, even for users who've rated many books.
- `insights.books_this_year` / `books_finished_this_year` (line 185) don't exist; backend field is
  `finished_this_year` (line 186) → the "This Year" card silently falls back to the all-time finished
  count instead of the true year-to-date count.
- `proj.projected_finish_date` (lines 349, 374, 376) doesn't exist; backend field is `projected_finish`
  (line 175) → the days-left / projected-finish-date block under "Projected Finish Dates" never renders
  for any book — the feature shows book progress bars but never the date it's named for.

(The sprint-2 `monthly_pages` fix itself is verified correct on both sides — field name matches and the
12-month backward iteration in `reading_activity_router.py:136-146` has no skipped/duplicate months.)

### H4 — Circle reading goal is fully non-functional end-to-end
Three independent breaks compound into one dead feature:
1. **Create:** `GroupsScreen.js:93` sends `reading_goal`, but `CreateGroupBody`
   (`groups_router.py:77-84`) expects `goal_pages`. Pydantic silently drops the unknown field, so the
   number a curator types into "Reading Goal" at group-creation time is never saved (`goal_pages` stays
   `null`) — while `goal_period` *is* saved, leaving a group "goal-active" with no target.
2. **Read:** `GroupDetailScreen.js:764` gates the whole "Reading Goal" card on `group?.reading_goal > 0` and
   reads `group.pages_read_total` — neither field is ever returned by `_serialize_group`
   (`groups_router.py:48-72`); the real fields are `goal_pages`/`goal_period`, and progress lives only in
   `GET /groups/{id}/goal`.
3. **Fetch:** `groupsAPI` has no `getGroupGoal()` wrapper at all, and `GroupDetailScreen`'s `load()`
   (line 302) never calls that endpoint. Per `dependency-map.md`, the web client *does* call
   `GET /groups/{id}/goal` — this is a mobile-only parity gap, not just a naming bug.
**Net effect:** the Reading Goal card can never render on mobile, and even a curator who sets a goal at
creation time gets nothing to show for it.

### H5 — `build-android.yml` targets a directory that no longer exists in the repo
`.github/workflows/build-android.yml` has `working-directory: book-tracker-mobile` and a push trigger on
`paths: ['book-tracker-mobile/**']`. `book-tracker-mobile/` does not exist anywhere in the repository —
the real app is `book-tracker-mobile-stitch/` (confirmed via `repos/mobile/index.md` and directory
listing). The push trigger can never fire (no such path), but the workflow is still listed under Actions
and can be manually dispatched, where it will fail immediately trying to `cd` into a nonexistent
directory. This is stale/dead CI left over from before the "stitch" rename — same pattern as the sibling
project's warning about dead in-repo services. Recommend deleting it to avoid a confused manual dispatch.

### H6 — `react-native-svg` is documented as pinned but is not actually pinned
`repos/mobile/index.md` and `AGENTS.md`'s Android gotchas both state `react-native-svg 15.15.4 (pinned)`.
`book-tracker-mobile-stitch/package.json:38` has `"react-native-svg": "^15.15.4"` — a **caret** range, not
an exact pin. `npm install`/`npm ci` (both build workflows run `npm install`, not `npm ci` — see L-series
below) can legally resolve to any `15.x.x` release, silently drifting away from the version the "pinned"
gotcha exists to guard against. Fix: pin to `"15.15.4"` exactly (matching the convention already used for
`@react-native-async-storage/async-storage: "2.2.0"` in the same file).

### H7 — Notification deep-links: three registered event types are unhandled
`app/notifications/config.py` registers `group_join_approved`, `group_join_rejected`, and
`admin_broadcast` as active event types, and `groups_router.py` actively fires the first two
(`approve_member` / `reject_member`, both with `group_id` in `extra`). `NotificationsScreen.js`'s
`EVENT_CONFIG` (lines 22-37) has no entries for any of the three — they fall through to
`EVENT_CONFIG.default` (generic bell icon, `navTarget: null`). **Failure scenario:** a user gets approved
into a private Circle, taps the "Join request approved ✅" push/notification-inbox row, and nothing
happens — `data.group_id` is present in the payload (`dispatcher.py`'s `data = {"type": ..., "actor_id":
..., **extra}`) exactly like `group_invite` (which *does* deep-link), but the missing config entry means
it's never used.

---

## Medium

### M1 — Curator badge never renders on Groups list (`user_role` vs `membership_role`)
`GroupsScreen.js:33` reads `group.user_role === 'curator'`. Every list-returning endpoint
(`_serialize_group`, `groups_router.py:69`) returns `membership_role`, never `user_role`. The Curator
eyebrow badge on My Groups / Discover cards is dead code — always false. (`GroupDetailScreen.js:502`
gets this right, reading `group?.membership_role`, so the bug is isolated to the list screen.)

### M2 — Per-notification "mark read" is never persisted to the server
Tapping a row in `NotificationsScreen.js:98` sets `is_read: true` only in local component state.
`app/notifications/router.py` exposes no per-item mark-read endpoint — only `POST /notifications/mark-read`,
which marks *everything* read. **Failure scenario:** user taps three individual notifications (each
correctly navigates), backgrounds the app before hitting "Mark All Read", relaunches — those three show
unread again, and the unread badge count (`GET /notifications/unread-count`, driven by the DB, not local
state) never dropped in the first place.

### M3 — Reject-member and remove-member skip confirmation inconsistently
`GroupDetailScreen.js`: Leave (461), Disband (483), Remove-member (427), and Delete-post (409) all confirm
via `Alert.alert` before the destructive call. `handleReject` (line 422) does not — one tap on "Reject"
permanently deletes a user's pending join request with no undo and no confirmation, inconsistent with
every other destructive action on the same screen.

### M4 — Build pipeline: no automatic `versionCode` bump, no CI guard
`eas.json` sets `"appVersionSource": "local"`, and `app.json`'s `android.versionCode` is a hardcoded `60`.
None of the three workflows (`build-stitch-apk.yml`, `build-stitch-aab.yml`, `build-android.yml`) contain
a step to bump or verify `versionCode`/`version` before building. A manually-dispatched AAB build that
forgets to bump `versionCode` first will build successfully and only fail at Play Console upload time
(duplicate versionCode), with no earlier CI signal. `LOAD_ME_FIRST.md` already documents this as a manual
step ("needs app.json version + versionCode bump") — there is no automated safety net for it.

### M5 — `newArchEnabled: false` on RN 0.81 / SDK 54
`app.json:9` explicitly disables the New Architecture. RN 0.81/Expo SDK 54 defaults new projects to the
New Architecture; explicitly opting out is a deliberate, documented-elsewhere choice (consistent with
`AGENTS.md`'s "this is NOT the Next.js/RN you know, read the docs before writing code" warning), but it
means none of Fabric/TurboModules' behavior or performance characteristics apply here — worth reconfirming
this is still intentional given how much library churn (react-native-svg, gesture-handler, screens) has
happened since it was set.

---

## Low

### L1 — Icon-only touchables with no `accessibilityLabel`
Systemic across every reviewed screen: back arrows (`GroupDetailScreen.js:520`,
`ProfileScreen.js:419`, `UserProfileScreen.js:278`, `SettingsScreen.js:311`,
`NotificationsScreen.js:141`), settings gear (`ProfileScreen.js:426`), avatar camera-upload
(`ProfileScreen.js:451`), note edit/delete pencils and trash icons (`ProfileScreen.js:130-135`), share
icon (`UserProfileScreen.js:512`), and post-delete trash (`GroupDetailScreen.js:700`) — none carry an
`accessibilityLabel`. TalkBack users get "button" with no description for every one of these.

### L2 — Dead tap targets on UserProfileScreen
`UserProfileScreen.js:310-323` wraps the Followers/Following/Books stat pills in `TouchableOpacity` with
no `onPress` at all. Looks tappable (ripple/opacity feedback), does nothing — likely a followers-list
screen that was never wired up.

### L3 — Account deletion doesn't proactively deregister the push token
`SettingsScreen.js:297` calls `profileAPI.deleteAccount()` then `authAPI.logout()`, but never calls
`DELETE /push-tokens/` first. Confirmation and local token cleanup (AsyncStorage `bt_token`) are both
present and correct; this is only a minor server-side hygiene gap (an orphaned `expo` push-token row),
not a user-visible bug.

### L4 — Build workflows use `npm install`, not `npm ci`
`build-stitch-apk.yml` and `build-stitch-aab.yml` both run `npm install` against a checked-in
`package-lock.json` (used only for the actions/cache key). `npm install` can still update the lockfile
and resolve slightly different versions than what's committed, undermining the reproducibility the lockfile
and the `react-native-svg` pin (H6) are meant to guarantee. `npm ci` would enforce the lockfile exactly.

### L5 — Goodreads import auto-chains into cover-fix with no cancel
`SettingsScreen.js:276-278`: a successful import automatically triggers `runCoverFix(false)`, a second
long-running batched job, with no way for the user to skip or cancel it once started (only a spinner/
progress banner). Reasonable default, but worth a "Skip" affordance for large libraries.

### L6 — `Clipboard` import from core `react-native`
`GroupDetailScreen.js:5` imports `Clipboard` from `'react-native'`, which is deprecated in favor of
`@react-native-clipboard/clipboard` on recent RN versions. Unverified whether it still functions on RN
0.81 without a device test — flagging for confirmation since "Copy Invite Link" is the only consumer.

---

## Parity gaps vs web (from this review + `dependency-map.md`)

- Mobile has no Friends-feed tab and no curator-invites list (`groupsAPI.getMyInvites` is unused) —
  pre-existing, documented in `dependency-map.md`.
- Web's `GroupDetailPage` calls `GET /groups/{id}/goal`; mobile never does (see H4).
- Notes created from `ProfileScreen.js:223` are unconditionally `is_public: true` — no private-note
  toggle exists on mobile; unverified whether web exposes one (out of scope for this pass).

---

## Contract checks that passed (worth recording, not just failures)

- `UserProfileScreen.js` correctly uses `is_private` / `is_following` / `follows_you` matching
  `GET /profile/{user_id}` exactly (`profile_router.py:219-231`) — this is the one screen that gets the
  `is_private` vs `is_private_profile` distinction right on both read (`is_private` for viewing someone
  else) and `SettingsScreen.js` gets it right on write (`is_private_profile` for `PUT /profile/me`).
- `UserProfileScreen.js`'s `stats.finished/reading/this_year/total_pages` all match `UserStats`
  (`users_router.py:169-177`) exactly.
- `SettingsScreen.js`'s `NOTIF_PREFS` keys match `USER_PREF_KEYS` (`notifications/router.py:182`) exactly
  (the semantics bug is H1, not a naming mismatch).
- Privacy enforcement for `/userbooks/user/{id}`, `/notes/user/{id}`, `/users/{id}/stats`,
  `/reading-activity/user/{id}/daily` is consistently implemented server-side (`is_private_profile` +
  Follow check, 403 otherwise) — `UserProfileScreen`'s `Promise.allSettled` correctly tolerates those 403s
  since `is_private` from the profile call already gates the locked-profile UI.
- Goodreads import MIME handling (`application/octet-stream`, backend validates by content) and 120s
  timeout both match between `SettingsScreen.js` and `importAPI.importGoodreads`.
- `monthly_pages` (sprint-2 fix) is correct on both sides — no skipped February, no duplicate months.
- All 6 i18n locale files (`en/de/es/fr/pt/ru`) have identical key coverage; `ru.json`'s 10 "extra" keys
  are correct `_few`/`_many` plural-form variants i18next needs for Russian, not orphaned keys.
- `google-services.json` being git-tracked in `book-tracker-mobile-stitch/` is expected (it's a
  client-side Firebase config shipped inside the APK anyway); `firebase-service-account.json` at the repo
  root is correctly gitignored and not tracked.

---

## Dependency refinement (screen → api fn → endpoint → backend handler)

Everything below is exercised by the seven reviewed screens and is either missing from, or worth
promoting into, the curated section of `dependency-map.md`:

| Screen | Client fn | Endpoint | Backend handler | Note |
|---|---|---|---|---|
| GroupDetailScreen | `groupsAPI.deleteGroup` | `DELETE /groups/{id}` | `groups_router.py:466 delete_group` | **fn doesn't exist in api.js — C1** |
| GroupDetailScreen | `usersAPI.searchUsers` | `GET /users/search` | `users_router.py:37 search_users` | **`usersAPI` doesn't exist, should be `userAPI` — C2** |
| GroupDetailScreen | *(none — missing)* | `GET /groups/{id}/goal` | `groups_router.py:961 get_goal_progress` | never called from mobile — H4 |
| GroupsScreen / GroupDetailScreen | `groupsAPI.createGroup` | `POST /groups/` | `groups_router.py:376 create_group` | client sends `reading_goal`, server reads `goal_pages` — H4 |
| InsightsScreen / ProfileScreen | `activityAPI.getInsights` | `GET /reading-activity/insights` | `reading_activity_router.py:56 get_reading_insights` | 4 field-name mismatches — H2, H3 |
| GroupDetailScreen | `groupsAPI.getGroupActivity` | `GET /groups/{id}/activity` | `groups_router.py:1068 get_group_activity` | backend returns `user.avatar_url` (`groups_router.py:1104`), a field that does not exist on `User` (`models.py` only has `profile_picture`) — always `null`; harmless today because `GroupDetailScreen`'s activity feed never reads it, but worth fixing at the source so a future consumer doesn't inherit a permanently-null field |
| NotificationsScreen | `notificationsAPI.getHistory`/`markAllRead` | `GET /notifications/history`, `POST /notifications/mark-read` | `notifications/router.py:126,159` | no per-item mark-read endpoint exists — M2 |
| SettingsScreen | `notificationsAPI.updatePrefs` | `PATCH /notifications/prefs` | `notifications/router.py:212 update_prefs` | replace-not-merge semantics — H1 |

---

## Unverified / out of scope for this pass

- `books_router.py`, `admin_router.py`, `App.js` (deep-link intent handling, `PreloadContext`,
  `preloadData()`), and the AndroidManifest itself were not part of the assigned scope — `booksAPI.addToLibrary`
  payload shape used by `UserProfileScreen`'s shelf modal was cross-checked only against
  `dependency-map.md`'s description, not against `books_router.py` directly.
- Exact expected Expo-SDK-54-compatible versions for `expo-notifications`, `expo-splash-screen`,
  `expo-constants`, etc. were not independently verified against Expo's official compatibility table
  (no network access in this review) — recommend running `npx expo install --check` as a fast, authoritative
  check rather than trusting a manual read of `package.json`. `react-native-gesture-handler`'s `^2.31.1`
  caret range is flagged the same way as unverified-but-worth-checking, alongside the confirmed
  `react-native-svg` pin violation (H6).
- Whether `Clipboard` from core `react-native` still functions on this RN/Android combination (L6) was not
  tested on a device/emulator.
