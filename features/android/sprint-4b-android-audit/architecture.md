---
screen: sprint-4b-android-audit
feature: android
status: architecture-complete
spec_status: in-progress (PM — Android build 2.2.2 approved 2026-09-13; audit triage 4B list)
architect_verified: 2026-09-13
code_baseline: master @ 8c44198 (mobile app.json 2.2.1 / versionCode 60)
4a_handoff_status: RESOLVED 2026-09-13. `features/maintenance/sprint-4a-platform-audit/architecture.md` → "Contracts for 4B" confirms F-07 (§1), F-15 (§2, /goal unchanged), F-23 (§3, route added) and F-03 (§4, token reassignment) exactly as assumed. No PENDING-4A-CONTRACT remains. tests.md contract conflicts K1–K8 are resolved in "Contract conflicts K1–K8".
pm_decisions: 2026-09-13 — Gate 2 approved; Play rollout 100% after the PM device check (hard gate before the AAB); rollback is a hotfix build; composer remembers the last Public/Private choice (`bt_note_visibility`); "Saved privately" message confirmed; SearchScreen/OnboardingScreen deleted in a later build
---

## Risk Summary (for PM)

- **What changes:** one Android update (2.2.2) with 20 fixes. Circles: Disband, Invite Friends, reading goals, a Reject confirm and the Curator badge all work. The tour search finds books, an expired login returns to sign-in, and Insights/Profile show real numbers. Every note composer gets a Public/Private switch: Private until the user picks, then the choice is remembered. Join notifications open something, push follows the signed-in account, TalkBack reads icon buttons, and the build refuses a stale version number. Books with no Google cover show a book icon instead of a blank tile.
- **What 2.2.1 users keep until they update:** dead Disband and Invite search, an empty tour search, a blank app after a 30-day login expiry, no circle goal or Curator badge, no confirm on Reject, and join-approval taps that do nothing. 4A's backend fixes their Insights/Profile numbers and makes book-page reflections private, but 2.2.1 has no switch and its Home and Profile posts stay public.
- **What could break:** sign-out and "session expired" share one code path, so a bug there could sign people out unexpectedly. A user who never touches the switch posts privately and may think the post vanished; the app says "Saved privately — find it on your Profile". The faster feed list can drop the keyboard while typing.
- **The rollout is 100% (approved), so there is no partial-rollout safety net.** A bad 2.2.2 reaches everyone, and the only rollback is a hotfix build (2.2.3). That makes your device check of the test APK a hard gate: no AAB is built until it passes.
- **On the phone you must check** (there is no emulator here): sign-out and an expired session, push on a shared phone, the Home post Public/Private flow and its message, Disband, Invite search, and the keyboard staying open while typing in the feed list.
- **Depends on 4A being live:** 4A has confirmed, as assumed, duplicate-book prevention, marking one notification read, the circle-goal shape and moving a push token to the new account. One gap is escalated to 4A: its tests don't yet prove the duplicate-book matching, and the Android build waits for them. One residual is accepted: after an offline sign-out, the old account's notifications keep reaching that phone until someone else signs in on it.
- **Decisions:** all answered on 2026-09-13. The two unreachable screens (Search, Onboarding) are deleted in a later build, not 2.2.2.
- **Recommendation:** build the test APK only after 4A is live, then your device check, then the AAB, then your final go and a 100% Play release.

---

## Data Flow

No new endpoints and no response-shape changes. This is a client-only sprint that corrects which fields Android sends and reads.
- **Auth:** any 401 on a request that carried a token goes to the `api.js` response interceptor. That clears `bt_token` and calls a handler registered by `App.js`, which resets state so `LoginScreen` renders.
- **Push:** the sign-out paths in `App.js handleLogout` and `SettingsScreen` delete-account call `NotificationService.deregisterPushToken()`, then `userAPI.deregisterPushToken()` → `DELETE /push-tokens/`, and only then clear the token.
- **Reads fixed in place:**
  - `GET /reading-activity/insights` → Insights/Profile field names.
  - `GET /api/googlebooks/search` → AppTour `results`.
  - `GET /groups/{id}/goal` → the GroupDetail goal card (new call).
- **Writes fixed in place:**
  - `POST /groups/` sends `goal_pages`.
  - `POST /notes/` and `PUT /notes/{id}` send `is_public`.
  - `POST /books/add-to-library` sends `book_id`/`isbn`.
  - `DELETE /groups/{id}` is wired up.
  - `POST /notifications/{id}/read` is new, from 4A.

## depends_on
- `app/deps.py :: get_current_user`: 401 for a missing, invalid or expired token or a deleted user (`deps.py:53-76`). F-11 keys on this.
- `app/routers/push_router.py`: register `:20-60` and deregister `:63-82`, both filtering `token_type == "expo"`.
- `app/routers/auth_router.py :: delete_own_account` (`:240+`): already deletes the user's `PushToken` rows server-side.
- `app/routers/reading_activity_router.py :: get_reading_insights`: returns `total_finished`, `finished_this_year`, `avg_rating`, `yearly_goal:{goal, completed, pct, on_track}|null`, `projected_finishes:[{userbook_id, …, days_left, projected_finish}]` (return dict ~`:180-195`).
- `app/routers/groups_router.py`:
  - `_serialize_group` `:48-72` (`created_by`, `membership_role`, `goal_pages`, `goal_period`)
  - `CreateGroupBody.goal_pages` `:77-84`
  - `create_group` `:375-418` (sets `goal_start_date` whenever `goal_period` is sent)
  - `get_group` `:422-433` (403 for a private non-member)
  - `delete_group` `:466-484` (204, creator only)
  - `get_goal_progress` `:961-1000`, returning `{goal_pages, goal_period, pages_read, pct}` or `{goal_pages: null, pages_read: 0, pct: 0}`
- `app/routers/notes_router.py`: `NoteCreateSchema.is_public` `:40`; `PUT` honours `is_public` `:202-203`; `/notes/me` returns `is_public` `:334`.
- `app/routers/books_router.py :: AddBookFromGooglePayload` `:15-31`: plain `BaseModel`, so unknown keys such as `book_id` are ignored until 4A adds the field.
- `app/notifications/router.py :: GET /history` `:125-155`: `data` is a JSON dict (`models.py:159`) carrying `group_id` for group events.
- `app/notifications/config.py`: `group_join_approved` `:95`, `group_join_rejected` `:102`, `admin_broadcast` `:129`.
- `GET /version` (meta_router): unauthenticated, no DB, used as the warm-up ping.
- **Sprint 4A "Contracts for 4B"** (committed; CONFIRMED for F-07, F-15, F-23, F-03): see the Contract dependency table.

## depended_by
- `App.js :: preloadData()` → PreloadContext keys `profile, library, feed, insights, activity, notes, groups, pendingGroups` seed every tab. F-11 and F-31 change how failures there behave, not the keys.
- Every mobile screen uses the shared axios instance in `src/services/api.js`. The interceptors (F-11, F-31) affect every call.
- No web file and no backend file changes. `dependency-map.md` consumers of the endpoints below get new or corrected Android rows (listed for Doc Sync at the end).

## API Endpoints Used
| Method | Path | Web api.js fn | Mobile api.js fn | Purpose | 4B change |
|---|---|---|---|---|---|
| GET | /version | — | `warmUp` (new) | wake Render before login | new consumer |
| POST | /push-tokens/ | — | `userAPI.registerPushToken` (existed, dead) | register Expo token | now used by NotificationService |
| DELETE | /push-tokens/ | — | `userAPI.deregisterPushToken` (new) | remove Expo token on logout/delete | new consumer |
| DELETE | /groups/{id} | `deleteGroup` | `groupsAPI.deleteGroup` (new) | Disband | new consumer, 204 |
| GET | /groups/{id}/goal | `getGroupGoal` | `groupsAPI.getGroupGoal` (new) | circle goal card | new consumer |
| POST | /groups/ | `createGroup` | `groupsAPI.createGroup` | create circle | sends `goal_pages` |
| GET | /users/search | `searchUsers` | `userAPI.searchUsers` | invite search | fixed import |
| GET | /reading-activity/insights | `getReadingInsights` | `activityAPI.getInsights` | Insights/Profile | canonical field names |
| GET | /api/googlebooks/search | `searchGoogleBooks` | `booksAPI.search` | AppTour book step | reads `results` |
| POST | /books/add-to-library | `addToLibrary` | `booksAPI.addToLibrary` | BookPreview add | + `book_id`, `isbn` (4A §1) |
| POST / PUT | /notes/, /notes/{id} | `createNote`/`updateNote` | `notesAPI.createNote`/`updateNote` | composers | explicit `is_public` |
| POST | /notifications/{id}/read | (4A web) | `notificationsAPI.markRead` (new) | mark one read | new consumer (4A §3) |
| GET | /notifications/unread-count | `getUnreadCount` | `notificationsAPI.getUnreadCount` | bell badge | also called after mark-read |

## DB Tables Touched
| Table | Operation | Ownership / privacy rule enforced |
|---|---|---|
| pushtoken | delete (existing route) | `user_id == me AND token_type='expo'` (`push_router.py:69-74`) |
| readinggroup / groupmember / grouppost | delete (existing route) | `created_by == me`, otherwise 403 (`groups_router.py:473-474`) |
| note | insert/update (existing routes) | owner only; `is_public=False` never in feeds |
| book / userbook | insert (existing route) | own library only |
| notificationlog | update `is_read` (4A route) | owner only, 404 otherwise (4A) |

No schema change and no migration, so nothing is appended to `context/supabase_migration.sql`.

## Notifications Fired
| event_type | recipients | extra keys the template needs |
|---|---|---|
| none fired by this sprint | | Android only **consumes** `group_join_approved` / `group_join_rejected` (`extra.group_id`, `group_name`) and `admin_broadcast` |

## Cross-Client Impact
- Android needs a new EAS build: 2.2.2 / versionCode 61 (`app.json:4`, `:35`).
- No web change. The backend is untouched by 4B.
- 4B relies on 4A being deployed first for F-07, F-23 and the server half of F-03. If 4A slips, those items fall back as described per item; every other item works against today's backend.

---

## Technical Brief

### 0. Ground rules for all Builders
- **Android only.** Do not touch `app/`, `book-tracker-frontend-stitch/`, `dependency-map.md`, `context/supabase_migration.sql`, or anything under `features/maintenance/sprint-4a-platform-audit/`.
- **Merge order A → B → C, one EAS build.** Packages B and C call `api.js` functions and i18n keys that Package A adds (the cross-package contract is listed in Work packages). No package ships alone.
- **4A contract gate (resolved 2026-09-13).** `features/maintenance/sprint-4a-platform-audit/architecture.md` → "Contracts for 4B" confirms every former PENDING-4A-CONTRACT item as assumed. Build against it. If any detail in this brief differs from that section, follow 4A and note it in `code-map.md`. The build itself still waits for the 4A backend to be live (Build step 1).
- **Line numbers** are at `8c44198`. Re-locate by the quoted code if they drift.
- **Style:** match the file. New user-visible and TalkBack strings go through `t()` / `i18n.t()`; do not hardcode English.
- **No `adjustsFontSizeToFit`, no `Alert.prompt`, `react-native-svg` stays 15.15.4** (LOAD_ME_FIRST gotchas).

### 0.1 New i18n keys (Package A adds to all six locales: `src/i18n/locales/{en,de,es,fr,pt,ru}.json`)
Existing keys reused, with no change: `common.private`, `common.public`, `common.cancel`, `common.reject`, `common.back`, `common.close`.

| Key | en value |
|---|---|
| `auth.sessionExpiredTitle` | Session expired |
| `auth.sessionExpiredBody` | Please sign in again. |
| `notes.visibilityHintPrivate` | Only you can see this |
| `notes.visibilityHintPublic` | Shown in the Community feed |
| `notes.savedPrivately` | Saved privately — find it on your Profile (PM-confirmed wording, 2026-09-13; shown after a private Home post) |
| `groups.rejectRequestTitle` | Reject request? |
| `groups.rejectRequestConfirm` | {{name}} will not be added to the circle. |
| `a11y.back` | Back |
| `a11y.close` | Close |
| `a11y.openSettings` | Settings |
| `a11y.openProfile` | Your profile |
| `a11y.openUserProfile` | Open {{name}}'s profile |
| `a11y.notifications` | Notifications |
| `a11y.changePhoto` | Change profile photo |
| `a11y.addPhoto` | Add photo |
| `a11y.removePhoto` | Remove photo |
| `a11y.removeTaggedBook` | Remove tagged book |
| `a11y.postOptions` | Post options |
| `a11y.deletePost` | Delete post |
| `a11y.deleteComment` | Delete comment |
| `a11y.editNote` | Edit note |
| `a11y.deleteNote` | Delete note |
| `a11y.like` | Like |
| `a11y.comments` | Comments |
| `a11y.sendComment` | Send comment |
| `a11y.share` | Share |
| `a11y.searchBooks` | Search books |
| `a11y.clearSearch` | Clear search |
| `a11y.rateStars` | Rate {{count}} stars |
| `a11y.chooseAvatar` | Avatar {{name}} |
| `a11y.coverPreset` | Cover {{name}} |
| `a11y.postVisibility` | Post visibility |

Counts in labels are passed through `accessibilityValue={{ text: String(n) }}`, not interpolated into keys. That avoids adding Russian plural forms.

---

### T-01 · F-32 — Build prep  (Package A)
1. `book-tracker-mobile-stitch/package.json:38`: change `"react-native-svg": "^15.15.4"` to `"react-native-svg": "15.15.4"`.
2. Resync the lockfile root spec (`package-lock.json:37` still says `^15.15.4`, and `npm ci` fails on a package.json/lock mismatch). From `book-tracker-mobile-stitch/`, run `npm install --package-lock-only --ignore-scripts`. `git diff package-lock.json` must show only the spec line, and `node_modules/react-native-svg` stays `"version": "15.15.4"` (`:9112`).
3. `.github/workflows/build-stitch-apk.yml:39` and `build-stitch-aab.yml:39`: change `run: npm install` to `run: npm ci`.
4. **Delete** `.github/workflows/build-android.yml`, rather than repairing it.
   - It targets `book-tracker-mobile/` (`:8`, `:15`, `:26`, `:53`), which no longer exists.
   - It duplicates `build-stitch-aab.yml`.
   - Repairing it would create a third, push-triggered build path that spends Actions/EAS minutes on every mobile commit.
5. **Version guard.**
   - New `book-tracker-mobile-stitch/release/last-released.json`, content `{ "version": "2.2.1", "versionCode": 60 }`. This is the last build accepted by Play (LOAD_ME_FIRST.md:17).
   - New `book-tracker-mobile-stitch/scripts/check-version-bump.js` (plain Node, no deps, ~25 lines):
     - Read `app.json` → `expo.version`, `expo.android.versionCode`, and `release/last-released.json`.
     - Validate that both versionCodes are integers.
     - `bad = versionCode <= last.versionCode || version === last.version`.
     - With `--strict`: on `bad`, print `::error::app.json versionCode <n> / version <v> not bumped past last Play release <m> / <w>` and `process.exit(1)`.
     - Without `--strict`: on `bad`, print `::warning::…` and exit 0. Always print the compared values.
   - Workflow step, placed after "Setup Node.js" and before "Install dependencies" (the working directory is already `book-tracker-mobile-stitch`):
     - `build-stitch-aab.yml`: `- name: Check version bump` / `run: node scripts/check-version-bump.js --strict`
     - `build-stitch-apk.yml`: `- name: Check version bump` / `run: node scripts/check-version-bump.js`
   - **Why APK is warn-only:** device-test APKs are legitimately rebuilt at the same versionCode while fixing device-check findings. Only a Play upload needs a new code, and a duplicate code fails only in Play Console, late.
   - After Play accepts 2.2.2, the release commit updates `last-released.json` to 2.2.2 / 61 (Build & release plan, step 11).
6. Rollback: revert the commit. The workflows are manual-dispatch only.

### T-02 · F-03 (mobile) — Push registration per account  (Package A core + Package C call sites)
**`src/services/api.js` (A)**
- `userAPI.registerPushToken` already exists (`:107`, currently unused). Keep it.
- Add to `userAPI`: `deregisterPushToken: async () => (await api.delete('/push-tokens/', { timeout: 10000, skipAuthExpired: true })).data,`
  - The 10 s timeout means a sleeping server can't hold sign-out hostage.
  - `skipAuthExpired` stops an already-expired token from raising a second "session expired".

**`src/services/NotificationService.js` (A)**
- Delete `API_BASE_URL` (`:7`) and both `fetch` blocks (`:64-76`, `:93-98`). Add `import { userAPI, authAPI } from './api';`.
- Keep `lastRegisteredExpoToken` (`:14`) and add `let registrationEpoch = 0;`.
- New export:
  ```js
  export function resetPushRegistration() { lastRegisteredExpoToken = null; registrationEpoch += 1; }
  ```
- `registerExpoPushToken()` takes **no argument** (`:43`):
  - Replace `if (!authToken || !EXPO_PROJECT_ID) return;` with `if (!EXPO_PROJECT_ID || !(await authAPI.isLoggedIn())) return;`.
  - Capture `const epoch = registrationEpoch;` at the start.
  - After obtaining the token and the `lastRegisteredExpoToken === expoPushToken` check (`:62`), call `await userAPI.registerPushToken(expoPushToken);` inside the existing try.
  - On success, set `if (epoch === registrationEpoch) lastRegisteredExpoToken = expoPushToken;`. The epoch stops an in-flight registration for A from re-arming the guard after A signed out.
  - Keep the `registrationInProgress` guard.
- `deregisterPushToken()` takes **no argument** (`:88-102`):
  ```js
  resetPushRegistration();
  try { await userAPI.deregisterPushToken(); }
  catch (err) { if (__DEV__) console.warn('[Push] Error deregistering push token:', err?.message); }
  ```
- Gate the remaining console calls with `__DEV__` (`:56`, and the old `:74`/`:98` disappear with the fetch blocks). See T-18.
- Leave the duplicate `Notifications.setNotificationHandler` (`:17-23`, also `App.js:26-32`) alone. It is pre-existing; mention only.

**`App.js` (A)**
- `:12`: `import { registerExpoPushToken, deregisterPushToken, resetPushRegistration } from './src/services/NotificationService';`
- `:161`: `registerExpoPushToken().catch(() => {});`, with no token argument.
- `handleLogout` (`:174-180`) becomes the single sign-out path:
  ```js
  const handleLogout = async ({ alreadyDeregistered = false } = {}) => {
    if (!alreadyDeregistered && (await authAPI.isLoggedIn())) await deregisterPushToken();
    else resetPushRegistration();
    await authAPI.logout();
    await AsyncStorage.removeItem(NOTE_VISIBILITY_KEY).catch(() => {});   // T-11: next account starts on Private
    clearInterval(pollRef.current);
    setPreloaded(null); setUnreadCount(0); setShowTour(false); setIsLoggedIn(false);
  };
  ```
  `deregisterPushToken` swallows its own errors, so sign-out always completes.

**Call sites (C)**
- `src/screens/ProfileScreen.js:393-396`: the destructive button's `onPress: async () => { await onLogout?.(); }`. Remove `authAPI` from the import at `:12`; `:394` is its only use.
- `src/screens/SettingsScreen.js:288`: `onPress: () => onLogout?.()`.
- `src/screens/SettingsScreen.js:297`:
  ```js
  try { await deregisterPushToken(); await profileAPI.deleteAccount(); await onLogout?.({ alreadyDeregistered: true }); }
  ```
  - Add `import { deregisterPushToken } from '../services/NotificationService';`.
  - Remove `authAPI` from `:12`; `:288` and `:297` are its only uses.
  - Deregister runs **before** delete, because after deletion the token returns 401 "User not found". The server also deletes the rows (`auth_router.py` delete_own_account), so this call is mainly the guard reset.

**Residual risk (K7, accepted):** a sign-out while offline, or a session expiry (the token is already invalid), cannot remove A's server row. 4A §4 (confirmed) deletes that row when the next account registers the same device token. Until then it stays, and it stays indefinitely if nobody signs in or the next account denies notification permission (no registration happens).

### T-03 · F-11 — Expired session returns to Login  (Package A)
**`src/services/api.js`**
- Add `import { isAuthExpiredError, isRetryableRequest } from './httpPolicy';` (T-22). Both interceptor rules below call these helpers; neither condition is written inline in `api.js`.
- Above the response interceptor (`:24`):
  ```js
  let authExpiredHandler = null;
  let authExpiredNotified = false;
  export const setAuthExpiredHandler = (fn) => { authExpiredHandler = fn; };
  ```
- In the response error handler (`:25-31`, after the T-15 retry block):
  ```js
  if (isAuthExpiredError(error)) {   // src/services/httpPolicy.js (T-22)
    await AsyncStorage.removeItem('bt_token');
    if (!authExpiredNotified) { authExpiredNotified = true; authExpiredHandler?.(); }
  }
  return Promise.reject(error);
  ```
  - The `Authorization` check means a 401 from `POST /auth/google` on the Login screen (no token yet) stays a login error.
  - `authExpiredNotified` collapses the 9 parallel preload 401s into one event.
  - **K6 (4A F-29):** `GET /api/googlebooks/search` treats an invalid Bearer token as anonymous: two searches may succeed, then it returns `401 {"detail": {"code": "login_required", …}}`. That request carried `Authorization`, so this handler shows "Session expired". That is correct, because the token is invalid. No special case.
- `authAPI.saveToken` (`:39`): set `authExpiredNotified = false;` before saving.

**`App.js`**
- Imports: add `Alert` to `:2`, `import i18n from 'i18next';`, and `setAuthExpiredHandler` plus `NOTE_VISIBILITY_KEY` to the `:11` import (`AsyncStorage` is already imported at `:9`).
- Add before the auth-check effect (`:75`):
  ```js
  const handleSessionExpired = () => {
    resetPushRegistration();          // cannot deregister: token is already invalid (4A reassignment covers it)
    clearInterval(pollRef.current);
    setPreloaded(null); setUnreadCount(0); setShowTour(false);
    setTransitioning(false); setIsLoggedIn(false); setAuthChecked(true);
    AsyncStorage.removeItem(NOTE_VISIBILITY_KEY).catch(() => {});   // T-11
    Alert.alert(i18n.t('auth.sessionExpiredTitle'), i18n.t('auth.sessionExpiredBody'));
  };
  useEffect(() => { setAuthExpiredHandler(handleSessionExpired); return () => setAuthExpiredHandler(null); }, []);
  ```
  Setters are stable, so the stale closure is safe.
- Mount effect (`:78-84`), immediately after `await preloadData();`: `if (!(await authAPI.isLoggedIn())) { setAuthChecked(true); return; }`
- `handleLoginSuccess` (`:165-172`), immediately after `await preloadData();`: `if (!(await authAPI.isLoggedIn())) { setTransitioning(false); return; }`
- **Why the re-check is required:** the handler sets `isLoggedIn(false)` while the mount effect is still awaiting `preloadData()`. Without the re-check, that effect resumes and calls `setIsLoggedIn(true)`, which is exactly the zombie session.
- Mid-session expiry is covered by the existing 60 s unread poll (`:140-156`): its 401 fires the handler.
- No change to `AppNavigator.js`. Login is rendered by `App.js:227-229` when `!isLoggedIn`.

### T-04 · F-04 — Disband Circle  (A: api.js · B: screens)
- **A** `src/services/api.js` groupsAPI (`:120-154`): add `deleteGroup: async (id) => { await api.delete(`/groups/${id}`); },`. The 204 has no body, so return nothing.
- **B** `src/screens/GroupDetailScreen.js`:
  - `:828`: `{isCurator && …}` becomes `{group?.created_by != null && group.created_by === currentUser?.id && (…)}`. `currentUser` loads at `:333-336`; until it resolves the button stays hidden. The backend is creator-only (`groups_router.py:473-474`).
  - `handleDisband` (`:483-489`): no change. `navigation.goBack()` on success already works once the function exists.
- **B** `src/screens/GroupsScreen.js` useFocusEffect (`:318-322`): call `loadMine()` as well as `loadPending()`. Add `loadMine` to the deps array. Without this, the disbanded circle stays in My Circles until pull-to-refresh, because focus only reloads pending.

### T-05 · F-05 — Invite Friends search  (Package B)
- `src/screens/GroupDetailScreen.js:11`: remove `usersAPI` from the import (`userAPI` is already imported).
- `:358`: `const res = await userAPI.searchUsers(q.trim());`. The endpoint returns `List[UserSearchResult]` (`users_router.py`), so `(res || []).filter` stays valid.

### T-06 · F-12 — AppTour book search  (Package A)
- `src/components/AppTour.js:186-187`:
  ```js
  const res = await booksAPI.search(query);
  const items = Array.isArray(res?.results) ? res.results : [];
  setBookResults(items.slice(0, 5).map(b => ({
    ...b,
    google_books_id: b.google_id,
    author: b.authors?.join(', ') || '',
    isbn: b.isbn_13 || b.isbn_10 || null,
  })));
  ```
  The render (`:421-444`) keys on `book.google_books_id` and reads `authors?.[0] || author` and `cover_url || thumbnail`, so it is satisfied.
- `handleAddBook` (`:196-202`): add `total_pages: book.total_pages || null, isbn: book.isbn,`. That gives server dedup its `isbn` match and stops a page-less Book row.
- F-38 in this file: avatar tile `:319` gets `accessibilityRole="button"`, `accessibilityLabel={t('a11y.chooseAvatar', { name: av.id })}` and `accessibilityState={{ selected: selectedAvatar?.id === av.id }}`.

### T-07 · F-13 (mobile) — Yearly goal reads `completed`  (Package C)
Android reads the canonical name only. 4A's `finished` alias exists for ≤2.2.1 builds.
- `src/screens/InsightsScreen.js:203`: `goalFinished = yearGoal.completed ?? 0;`
- `src/screens/ProfileScreen.js:407`: `((yearGoal.completed ?? 0) / (yearGoal.goal || 1))`
- `src/screens/ProfileScreen.js:520`: `{yearGoal.completed ?? 0} / {yearGoal.goal} books`

### T-08 · F-14 (mobile) — Insights canonical field names  (Package C)
All in `src/screens/InsightsScreen.js`:
| Line | Today | Change to |
|---|---|---|
| 179 | `insights?.finished_books ?? …` | `insights?.total_finished ?? …` (**new in this brief**: the backend key is `total_finished`; today it silently falls back to counting the preloaded library) |
| 181 | `insights?.average_rating ?? null` | `insights?.avg_rating ?? null` |
| 185 | `insights?.books_this_year ?? insights?.books_finished_this_year ?? null` | `insights?.finished_this_year ?? null` |
| 349 | `daysLeft(proj.projected_finish_date)` | `daysLeft(proj.projected_finish)` |
| 374 | `proj?.projected_finish_date &&` | `proj?.projected_finish &&` |
| 376 | `shortDate(proj.projected_finish_date)` | `shortDate(proj.projected_finish)` |

`projected_finish` is `date.isoformat()` (`YYYY-MM-DD`). `shortDate` (`:28`) and `daysLeft` (`:34`) take any `new Date()`-parseable string, so no helper change is needed.

### T-09 · F-15 (mobile) — Circle reading goal  (A: api.js · B: screens) — 4A §2 confirmed
- **A** `src/services/api.js` groupsAPI: add `getGroupGoal: async (id) => (await api.get(`/groups/${id}/goal`)).data,`.
- **B** `src/screens/GroupsScreen.js:93-94`:
  ```js
  goal_pages: readingGoal ? parseInt(readingGoal, 10) : null,
  goal_period: readingGoal ? goalPeriod : null,
  ```
  `create_group` stamps `goal_start_date` whenever `goal_period` is sent (`groups_router.py:385-387`). Sending it without pages creates the "goal-active with no target" state.
- **B** `src/screens/GroupDetailScreen.js`:
  - State: `const [goal, setGoal] = useState(null);` near `:264`.
  - `load()` `:305-313`: add `safe(groupsAPI.getGroupGoal(groupId), 'getGoal')` to the `Promise.all` (8th element), then `setGoal(gl || null)`. A 403 for a private non-member becomes `null` through `safe`.
  - Card `:764-775`:
    - gate `goal?.goal_pages > 0`
    - value `goal.pages_read ?? 0`
    - "of" line `goal.goal_pages.toLocaleString()`
    - bar width and percent `Math.min(100, goal.pct ?? 0)`
    - Keep the existing label keys; the monthly/yearly label is under Later.
- **Confirmed shape (4A "Contracts for 4B" §2, unchanged from `groups_router.py:961-1000`):**
  - with a goal: `{goal_pages, goal_period, pages_read, pct}`
  - without one: `{goal_pages: null, pages_read: 0, pct: 0}` with **no** `goal_period` key. The card must not read `goal_period`.
- **K4:** 4A also returns `reading_goal` and `pages_read_total` on `GET /groups/{id}`, for 2.2.1 only. Android 2.2.2 must **never** read either, and never send `reading_goal`. `grep -rnE "reading_goal|pages_read_total" src` must be empty (tests.md S36).

### T-10 · F-07 (mobile) — Send the local book id  (Package C) — 4A §1 confirmed
- `src/screens/BookPreviewScreen.js`, after `:37`:
  ```js
  // book_id only for a real Book object — never a userbook's id
  const localBookId = rawBook.book ? rawBook.book.id : (rawBook.status == null ? rawBook.id : null);
  ```
- `handleAdd` payload `:66-73`: add `book_id: localBookId ?? null,` and `isbn: book.isbn || null,`.
- **Why the guard:** `UserProfileScreen.js:415,465` navigate with `ub.book || ub`, so a userbook without a nested book would pass a *userbook* id. Every other caller passes a Book: `FeedScreen.js:497,538,605` and `GroupDetailScreen.js:731`.
- Safe before 4A: `AddBookFromGooglePayload` is a default `BaseModel` and ignores unknown keys.
- **Confirmed (4A §1):**
  - `book_id` (a Book id) is matched first. An unknown id is ignored and falls through to `google_books_id`, then `isbn`.
  - 4A states this userbook guard is correct.
  - The sub-shapes (recommendations, friends-reading `.book`, note card `.book`, `current_book`) carry `google_books_id`/`isbn`/`total_pages`. Pytest proof of the match order is Escalation E1.
  - The two never-opened shelf modals (`FeedScreen.js:321-339`, `UserProfileScreen.js:139-157`; `setShelfModal` is only ever called with `null`) are dead code (F-40) and are **not** changed.

### T-11 · F-17 (mobile) — Public/Private switch that remembers the last choice  (Package C; key constant + sign-out clear in Package A)
**PM decision 2026-09-13:** the switch remembers the user's last choice, shared by all note composers. A user who has never chosen starts on Private. This replaces the earlier reset-to-Private-after-every-post design.

- **Storage contract:** AsyncStorage key `bt_note_visibility`, value `'private'` or `'public'`. A missing key, a read error or any other value means Private. The parse/serialize rule lives in `src/utils/noteVisibility.js` (T-22). Web uses the same key name in localStorage (4A's concern; Android never reads web storage).
- **A** `src/services/api.js`: `export const NOTE_VISIBILITY_KEY = 'bt_note_visibility';`, next to the `bt_token` handling. Every reader and writer uses this constant; the literal appears once.
- **A** clear on sign-out (Security Review): `App.js handleLogout` (T-02) and `handleSessionExpired` (T-03) call `AsyncStorage.removeItem(NOTE_VISIBILITY_KEY)`. Without this, one account's Public choice becomes the next account's default on a shared phone.
- **C new `src/components/VisibilityToggle.js`** exports two things:
  1. The hook `useNoteVisibility()`:
     ```js
     export function useNoteVisibility() {
       const isFocused = useIsFocused();
       const [isPublic, setIsPublicState] = useState(false);          // Private until storage says otherwise
       useEffect(() => {
         if (!isFocused) return;
         AsyncStorage.getItem(NOTE_VISIBILITY_KEY)
           .then(v => setIsPublicState(parseStoredVisibility(v)))
           .catch(() => setIsPublicState(false));
       }, [isFocused]);
       const setIsPublic = (next) => {
         setIsPublicState(next);
         AsyncStorage.setItem(NOTE_VISIBILITY_KEY, serializeVisibility(next)).catch(() => {});
       };
       return [isPublic, setIsPublic];
     }
     ```
     - The key is written when the switch changes, not when a post is sent.
     - The hook re-reads on screen focus. The Feed composer stays mounted in its tab, so a choice made in BookDetail or Profile shows there when the user returns.
     - A post sent before the first read resolves goes out Private, which is the safe direction.
     - Imports: `useIsFocused` from `@react-navigation/native`, `AsyncStorage`, and `NOTE_VISIBILITY_KEY` from `../services/api`, plus `parseStoredVisibility` and `serializeVisibility` from `../utils/noteVisibility` (T-22).
  2. The default export `VisibilityToggle` (presentational, ~35 lines):
     - Props `{ isPublic, onChange, disabled }`; `onPress={() => onChange(!isPublic)}`.
     - A `TouchableOpacity` pill: `Ionicons` `lock-closed-outline` / `earth-outline` + `Text` `t('common.private')` / `t('common.public')`.
     - `accessibilityRole="switch"`, `accessibilityState={{ checked: isPublic }}`, `accessibilityLabel={t('a11y.postVisibility')}`, `accessibilityHint={t(isPublic ? 'notes.visibilityHintPublic' : 'notes.visibilityHintPrivate')}`.
     - Styles from `theme.js` tokens. It does no storage itself.
- **`src/screens/FeedScreen.js`**
  - `const [isPublic, setIsPublic] = useNoteVisibility();` near `:67`.
  - `:214` and `:229`: `is_public: true` becomes `is_public: isPublic`. **No reset after posting.**
  - Capture `const postedPublic = isPublic;` before each create. After a successful create with `postedPublic === false`: `if (Platform.OS === 'android') ToastAndroid.show(t('notes.savedPrivately'), ToastAndroid.SHORT);`. This covers both the normal path (`:225-234`) and the post-without-image path (`:213-216`). Add `ToastAndroid` to the `:3-6` import.
  - Render `<VisibilityToggle isPublic={isPublic} onChange={setIsPublic} disabled={posting} />` in the actions row `:466-480`, between the image button and Post.
- **`src/screens/BookDetailScreen.js`**
  - `const [noteIsPublic, setNoteIsPublic] = useNoteVisibility();`.
  - `:172`: `createNote({ userbook_id: ub.id, text: …, quote: …, is_public: noteIsPublic })`. No reset. No toast, because the new note appears in the list right below.
  - Render the toggle in `noteQuoteRow` (`:367-386`) before the Post button.
- **`src/screens/ProfileScreen.js` NewNoteModal**
  - New note: `const [rememberedPublic, setRememberedPublic] = useNoteVisibility();`; `:223` sends `is_public: rememberedPublic`.
  - Edit: local `const [editPublic, setEditPublic] = useState(false);`; the effect `:206-214` sets `setEditPublic(!!editNote?.is_public)`; `:221` sends `updateNote(editNote.id, { text, quote, is_public: editPublic })`. Editing shows that note's own visibility and does **not** change the remembered choice (Assumption 9).
  - Render `<VisibilityToggle isPublic={editNote ? editPublic : rememberedPublic} onChange={editNote ? setEditPublic : setRememberedPublic} disabled={saving} />` after the quote input (`:288`).
- **Not a note composer:** the GroupDetail post composer (`POST /groups/{id}/posts`) gets no toggle.

### T-12 · F-22 (mobile) — Notification tap routing  (Package C)
`src/screens/NotificationsScreen.js`:
- `EVENT_CONFIG` (`:22-37`), add:
  ```js
  group_join_approved: { icon: 'checkmark-circle', color: colors.primaryContainer, bgColor: colors.primaryContainer + '22', navTarget: 'group' },
  group_join_rejected: { icon: 'close-circle',     color: colors.onSurfaceVariant, bgColor: colors.surfaceContainerHigh,  navTarget: 'circles' },
  admin_broadcast:     { icon: 'megaphone',        color: colors.primary,          bgColor: colors.primary + '15',       navTarget: null },
  ```
- `handleNotifPress` switch (`:104-127`): add `case 'circles': navigation?.navigate('Tabs', { screen: 'CircTab' }); break;`.
- **Why rejected goes to the list:** `GET /groups/{id}` is 403 for a private circle the user isn't in (`groups_router.py:430-432`). GroupDetail would render an empty hero with a misleading Join button.
- `data.group_id` is present in `log.data` for both group events (dispatcher `data = {type, actor_id, **extra}`).

### T-13 · F-23 — Mark one notification read  (A: api.js + context · C: screen) — 4A §3 confirmed
- **A** `src/context/NotificationContext.js`: default value `{ unreadCount: 0, refreshUnread: () => {} }`. `App.js:233`: `value={{ unreadCount, refreshUnread: fetchUnread }}`. This part does not depend on 4A.
- **A** `src/services/api.js` notificationsAPI (`:111-117`), route confirmed by 4A §3: `markRead: async (id) => (await api.post(`/notifications/${id}/read`)).data,`.
- **C** `src/screens/NotificationsScreen.js`:
  - `const { refreshUnread } = useContext(NotificationContext);`
  - `handleNotifPress` `:98`, after the optimistic update: `if (!item.is_read) notificationsAPI.markRead(item.id).then(() => refreshUnread()).catch(() => {});`
  - `handleMarkAllRead` `:90`, after success: `refreshUnread();`. Mark All Read works today; this only makes the badge drop immediately.
- **Assumed contract:** `POST /notifications/{id}/read`, owner-checked (404 otherwise), response `{id, is_read: true}`, which Android ignores.
- **Confirmed (4A §3):** `POST /notifications/{id}/read` → `200 {id, is_read: true}` for the caller's row, and also 200 when it's already read. It returns `404 {"detail": "Notification not found"}` for any other id. The earlier local-only fallback is withdrawn. If the backend at build time lacks the route, 4A is not live and the build stops at step 1.

### T-14 · F-25 (mobile) — Confirm before Reject  (Package B)
- `src/screens/GroupDetailScreen.js:422-425`:
  ```js
  const handleReject = (member) => Alert.alert(t('groups.rejectRequestTitle'), t('groups.rejectRequestConfirm', { name: member.name }), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('common.reject'), style: 'destructive', onPress: async () => {
      try { await groupsAPI.rejectGroupMember(groupId, member.user_id); setPending(prev => prev.filter(m => m.user_id !== member.user_id)); }
      catch { Alert.alert(t('common.error'), 'Could not reject member'); }
    }},
  ]);
  ```
- Call site `:578`: `onPress={() => handleReject(m)}`.

### T-15 · F-31 — Cold-start timeout, retry, warm-up  (Package A)
**Decision: a 45 s timeout only during the cold-start window, a single retry for GETs only, and a warm-up ping.**
- **Why 45 s:** Render's free tier takes ~30 s to wake (LOAD_ME_FIRST, CLAUDE.md), and the current ceiling is also 30 s (`api.js:10`), so the first request races the wake. 45 s is the wake time plus 50%.
- **Why only the window:** once any response has succeeded the server is awake, so later calls keep the 30 s fail-fast and a genuinely dead server isn't hidden behind long spinners.
- **Why the retry is GET-only:** `POST /auth/google` can create a user, and likes, posts, joins and deletes are not idempotent. A timed-out POST may have succeeded server-side, and retrying it duplicates data.
- **Worst case (server truly down at launch):** 45 s + 2 s + 30 s ≈ 77 s on the splash before tabs render with empty state. That is acceptable against today's silent empty tabs, and it is flagged in the device check.

`src/services/api.js`:
```js
const DEFAULT_TIMEOUT = 30000;
const COLD_START_TIMEOUT = 45000;
let coldStart = true;                       // true until the first successful response
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
```
- `axios.create` `:8-12`: `timeout: DEFAULT_TIMEOUT`.
- Request interceptor `:14-21`: `if (coldStart && config.timeout === DEFAULT_TIMEOUT) config.timeout = COLD_START_TIMEOUT;`. The Goodreads 120 s override is untouched.
- Response success handler `:25-26`: `(response) => { coldStart = false; return response; }`.
- Response error handler, first block, before the 401 logic:
  ```js
  if (isRetryableRequest(error)) {   // src/services/httpPolicy.js (T-22)
    const cfg = error.config;
    cfg.__retried = true;
    cfg.timeout = DEFAULT_TIMEOUT;
    await sleep(2000);
    return api(cfg);
  }
  ```
  The response interceptor's error function becomes `async`.
- Add: `export const warmUp = () => api.get('/version', { timeout: COLD_START_TIMEOUT, skipAuthExpired: true }).then(() => true).catch(() => false);`

`src/screens/LoginScreen.js`:
- `:30-32` effect: after `GoogleSignin.configure(…)`, call `warmUp();` fire-and-forget. Import `warmUp` from `../services/api`.
- The Google account picker takes a few seconds, so the server is usually awake by the time `authAPI.googleLogin` runs, and that call still gets the 45 s window.
- Out of scope (Later): re-arming `coldStart` when the app returns from more than 15 minutes in the background. Background resumes are covered by the GET retry.

### T-16 · F-34 — Curator badge  (Package B)
- `src/screens/GroupsScreen.js:33`: `const isCurator = group.membership_role === 'curator';`

### T-17 · F-38 — Accessibility labels on icon-only touchables  (A / B / C by file)
**Method.**
- Rule: `accessibilityRole="button"` plus `accessibilityLabel={t('a11y.…')}`.
- Toggles and selectable tiles add `accessibilityState={{ selected }}`.
- Buttons with a numeric count add `accessibilityValue={{ text: String(count) }}`.
- **Source list:**
  - every icon-only element in `qa/inventory/mobile-a.json` / `mobile-b.json` (column "inv" = inventory id)
  - plus every touchable an AST sweep found with no `<Text>` descendant and no `accessibilityLabel`: `@babel/parser` over `App.js` + `src/`, reproducible with the method in Test plan hooks; marked "AST".

| Pkg | File:line | Element | Label key | inv |
|---|---|---|---|---|
| A | components/AppTour.js:319 | avatar preset tile | `a11y.chooseAvatar` {name} + selected | mobile.apptour.avatarTile |
| B | screens/GroupDetailScreen.js:159 | SetGroupBookModal search button | `a11y.searchBooks` | AST |
| B | screens/GroupDetailScreen.js:520 | back arrow | `a11y.back` | AST (review-b L1) |
| B | screens/GroupDetailScreen.js:692 | post author avatar | `a11y.openUserProfile` {name: post.user?.name} | mobile.groups.detail.post.authorNavigate |
| B | screens/GroupDetailScreen.js:700 | post trash (curator) | `a11y.deletePost` | mobile.groups.detail.post.delete |
| B | screens/GroupDetailScreen.js:889 | remove tagged book (composer) | `a11y.removeTaggedBook` | AST |
| B | screens/GroupDetailScreen.js:955 | remove photo (composer) | `a11y.removePhoto` | AST |
| B | screens/GroupsScreen.js:117 | cover preset tile | `a11y.coverPreset` {name: p.key} + selected | AST |
| C | components/AppHeader.js:43 | bell | `a11y.notifications` + value = badgeCount | mobile.header.bell |
| C | components/AppHeader.js:53 | avatar | `a11y.openProfile` | mobile.header.avatar |
| C | screens/FeedScreen.js:359 | composer avatar | `a11y.openProfile` | mobile.feed.composerAvatar |
| C | screens/FeedScreen.js:387 | remove tagged book | `a11y.removeTaggedBook` | AST |
| C | screens/FeedScreen.js:459 | remove image preview | `a11y.removePhoto` | mobile.feed.removeSelectedImage |
| C | screens/FeedScreen.js:467 | image picker | `a11y.addPhoto` | mobile.feed.pickImage |
| C | screens/FeedScreen.js:639 | post overflow (···) | `a11y.postOptions` | mobile.feed.postMenu |
| C | screens/FeedScreen.js:672 | like | `a11y.like` + selected + value = likes_count | mobile.feed.likeToggle |
| C | screens/FeedScreen.js:680 | comments toggle | `a11y.comments` + value = comments_count | inventory "Comment toggle" |
| C | screens/FeedScreen.js:705 | admin delete comment | `a11y.deleteComment` | inventory "Admin delete comment" |
| C | screens/BookDetailScreen.js:44 | star 1–5 | `a11y.rateStars` {count: star} + selected | inventory "Star rating" |
| C | screens/BookDetailScreen.js:229 | back arrow | `a11y.back` | AST |
| C | screens/BookDetailScreen.js:405 | delete note | `a11y.deleteNote` | mobile.bookdetail.deleteNote |
| C | screens/BookPreviewScreen.js:86 | back arrow | `a11y.back` | AST |
| C | screens/LibraryScreen.js:311 | AddBookModal search button | `a11y.searchBooks` | mobile.library.addModal.searchInput |
| C | screens/LibraryScreen.js:568 | clear library search | `a11y.clearSearch` | AST |
| C | screens/ProfileScreen.js:130 | edit note | `a11y.editNote` | mobile.profile.note.edit |
| C | screens/ProfileScreen.js:133 | delete note | `a11y.deleteNote` | mobile.profile.note.delete |
| C | screens/ProfileScreen.js:152 | like | `a11y.like` + selected + value | mobile.profile.note.like |
| C | screens/ProfileScreen.js:156 | comments toggle | `a11y.comments` + value | AST-adjacent (count only) |
| C | screens/ProfileScreen.js:188 | send comment | `a11y.sendComment` | mobile.profile.note.commentSubmit |
| C | screens/ProfileScreen.js:419 | back arrow | `a11y.back` | review-b L1 |
| C | screens/ProfileScreen.js:426 | settings gear | `a11y.openSettings` | mobile.profile.settingsNavigate |
| C | screens/ProfileScreen.js:451 | camera (change photo) | `a11y.changePhoto` | mobile.profile.avatarUpload |
| C | screens/UserProfileScreen.js:278 | back arrow | `a11y.back` | review-b L1 |
| C | screens/UserProfileScreen.js:508 | admin delete note | `a11y.deleteNote` | mobile.userprofile.note.adminDelete |
| C | screens/UserProfileScreen.js:512 | share | `a11y.share` | mobile.userprofile.note.share |
| C | screens/UserProfileScreen.js:528 | like | `a11y.like` + selected + value | mobile.userprofile.note.like |
| C | screens/UserProfileScreen.js:310,315,320 | Followers / Following / Books pills | **change `TouchableOpacity` → `View`** (no `onPress`; F-38) | inventory "stat pills" |
| C | screens/SettingsScreen.js:74 | avatar picker close | `a11y.close` | AST |
| C | screens/SettingsScreen.js:86 | avatar picker tile | `a11y.chooseAvatar` {name: item.id} + selected | AST |
| C | screens/SettingsScreen.js:311 | back arrow | `a11y.back` | review-b L1 |
| C | screens/NotificationsScreen.js:141 | back arrow | `a11y.back` | mobile.notifications.backNavigate |

**Excluded on purpose:**
- `SearchScreen.js:266,283` (unreachable; the PM approved deleting the file in a later build, not 2.2.2)
- `FeedScreen.js:744` and `UserProfileScreen.js:239` (backdrops of never-opened shelf modals, F-40)

### T-18 · `__DEV__` console gating  (Package A)
- The only ungated calls in `App.js` + `src/` are `NotificationService.js:56`, `:74` and `:98` (`grep -rn "console\." App.js src | grep -v __DEV__`). `:74` and `:98` are removed with the fetch blocks (T-02).
- Wrap `:56` in `if (__DEV__)`. Any new console call in A/B/C must be gated.

### T-19 · Review A #8 / F-35 (FlatList half, size M) — Feed virtualisation  (Package C)
- `src/screens/FeedScreen.js:805-835`: keep the `ScrollView` for the Friends tab. For the Community tab, render:
  ```jsx
  <FlatList
    style={styles.scrollView}
    data={posts.filter(p => p != null)}
    keyExtractor={(p) => String(p.id)}
    renderItem={({ item }) => renderPost(item)}
    ListHeaderComponent={<>{renderComposer()}{renderRecommendations()}</>}
    ListEmptyComponent={<View style={styles.emptyState}><Text style={styles.emptyIcon}>📚</Text><Text style={styles.emptyText}>{t('feed.noPostsYet')}</Text></View>}
    extraData={{ expandedComments, menuPostId, currentUser, likingTick: posts }}
    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    keyboardShouldPersistTaps="handled"
    removeClippedSubviews={false}
  />
  ```
- Add `FlatList` to the `:3-6` import. In `renderPost` `:598`, drop the `Math.random()` key fallback; `keyExtractor` owns keys.
- **Three gotchas that must be followed:**
  1. `ListHeaderComponent` gets an **element**, never an inline component function (`() => renderComposer()`). A new function type each render remounts the header and drops composer keyboard focus.
  2. `extraData` must include `expandedComments` and `menuPostId`, or comment boxes and the ··· menu stop re-rendering.
  3. `removeClippedSubviews={false}`: on Android, clipped rows detach their `TextInput`s and close the keyboard mid-typing.
- **Cut line:** if the device check shows focus loss that can't be fixed in the same session, revert this item alone. No other item depends on it.
- `_silentCoverFix` once a day (F-35's other half) stays under Later.

### T-20 · Version bump  (Package A, last commit before dispatch)
- `book-tracker-mobile-stitch/app.json:4`: `"version": "2.2.2"`; `:35`: `"versionCode": 61`.

### T-21 · K1 / 4A F-19 — Cover fallback for imageless Google results  (Package B + Package C)
4A now returns `cover_url: null` when Google has no image (4A F-19; tests.md C14). Before 4A these rows showed Google's grey placeholder; after 4A they would be blank boxes. Reuse the in-file fallback pattern already at `GroupDetailScreen.js:219-225`:
```jsx
{item.cover_url ? (
  <Image source={{ uri: item.cover_url }} style={styles.resultCover} resizeMode="cover" />
) : (
  <View style={[styles.resultCover, { backgroundColor: colors.surfaceContainerHigh, justifyContent: 'center', alignItems: 'center' }]}>
    <Ionicons name="book-outline" size={24} color={colors.outline} />
  </View>
)}
```
- **B** `src/screens/GroupDetailScreen.js:186-192`: the SetGroupBookModal result tile (`styles.resultCover`). The selected hero `:219-225` already falls back.
- **C** `src/screens/LibraryScreen.js`:
  - `:339-345`: the AddBookModal result tile (`styles.resultCover`)
  - `:374-378`: the selected hero (`styles.selectedCoverLarge`, icon size 32)
- Already safe, no change: AppTour `:429-435`, BookPreviewScreen `:98-104`, FeedScreen recommendations `:499-502`. The dead `SearchScreen`/`OnboardingScreen` stay untouched.
- No payload change, no new strings. These are images, not touchables, so no F-38 rows.

### T-22 · Testability helpers and static test infrastructure  (Package A + Package C; approved 2026-09-13, tests.md Preconditions §1)
Two **zero-import** ESM modules let Node's built-in `node:test` exercise the auth, retry and visibility rules without React Native. Metro resolves them like any other file. Neither may import anything.

**A — new `src/services/httpPolicy.js`:**
```js
const TRANSIENT_CODES = ['ECONNABORTED', 'ETIMEDOUT', 'ERR_NETWORK'];

export function isAuthExpiredError(error) {
  const config = error?.config;
  if (!config) return false;
  return error?.response?.status === 401 && !!config.headers?.Authorization && !config.skipAuthExpired;
}

export function isRetryableRequest(error) {
  const config = error?.config;
  if (!config || config.__retried) return false;
  const method = (config.method || 'get').toLowerCase();
  const transient = TRANSIENT_CODES.includes(error?.code) || !error?.response;
  return method === 'get' && transient;
}
```
- `api.js` imports both and calls them in the response error handler: `isRetryableRequest` first (T-15), then `isAuthExpiredError` (T-03). It must not re-implement either condition inline.
- A GET that received an HTTP error response (e.g. 500, code `ERR_BAD_RESPONSE`) is not retryable.

**C — new `src/utils/noteVisibility.js`:**
```js
export function parseStoredVisibility(value) { return value === 'public'; }
export function serializeVisibility(isPublic) { return isPublic ? 'public' : 'private'; }
```
- No imports and no key literal. `NOTE_VISIBILITY_KEY` stays in `api.js` (T-11). `useNoteVisibility` calls both functions.

**Test infrastructure:** `node:test`, no new dependency, Node ≥ 22.7. Do **not** add `"type": "module"` to `package.json`.
- **A owns:**
  - `__tests__/_ast.mjs`, the shared loader for `@babel/parser` and `js-yaml` via `createRequire`
  - `versionGuard.test.mjs`, `httpPolicy.test.mjs`, `i18nParity.test.mjs`, `apiContract.test.mjs`, `sourceRules.test.mjs`, `workflows.test.mjs`
  - optionally the `"test"` script in `package.json` (A already owns that file; the lockfile is unaffected)
- **C owns** `noteVisibility.test.mjs`, `notificationEvents.test.mjs` and `a11yTouchables.test.mjs`. They import A's `./_ast.mjs`; the A → C merge order already holds.
- **B owns no test file.** B's assertions live in A's `sourceRules.test.mjs` and `apiContract.test.mjs`, e.g. `disband_gated_on_created_by`, `groups_focus_effect_reloads_mine`, `group_detail_load_arity_matches`, `reject_requires_confirm_with_cancel_first`, `goal_card_reads_goal_endpoint_fields`.
- **No-overlap rule:**
  - A package creates and edits only the test files that tests.md's "Node test files" table assigns to it.
  - A failure caused by another package's source is reported to that package's Builder. Nobody edits another package's test file to make it pass.
  - If a case must change, Senior QA edits tests.md and names the owning package.
- **When each runs:**
  - Each Builder runs its own test files during its package.
  - Assertions about other packages' files (A's `sourceRules`/`apiContract` rows for B/C, and C's `a11yTouchables`) are expected to fail until all three packages merge.
  - Required gate: `node --test "__tests__/*.test.mjs"` ends `# fail 0` on the merged A+B+C tree (Build step 5).

---

## Contract dependency table

Resolved 2026-09-13: `features/maintenance/sprint-4a-platform-audit/architecture.md` → "Contracts for 4B" confirms all four former PENDING-4A-CONTRACT items exactly as assumed (F-07 §1; F-15 §2 with `/goal` unchanged; F-23 §3, route added; F-03 §4, reassignment). The build still waits for that backend to be live (Build & release plan, step 1).
| Item | 4A contract needed | Status |
|---|---|---|
| F-32 build prep | none | ready |
| F-03 (mobile) push per account | `POST /push-tokens/` first deletes another user's `expo` row holding the same token (4A §4) | ready: 4A §4 confirmed. Residual accepted (K7): closed when the next account registers |
| F-04 Disband | `DELETE /groups/{id}` → 204, creator-only (exists, `groups_router.py:466`) | ready |
| F-05 Invite search | `GET /users/search` → list (exists) | ready |
| F-11 expired session | `get_current_user` 401 semantics (exists) | ready |
| F-12 tour search | `GET /api/googlebooks/search` → `{results:[{google_id, authors, isbn_13, isbn_10, total_pages, cover_url…}]}` (exists). 4A F-29 anonymous quota does not affect a logged-in tour (token sent) | ready |
| F-13 / F-14 insights | canonical `completed`, `avg_rating`, `finished_this_year`, `projected_finish`, `total_finished` (exist today). 4A's aliases are only for ≤2.2.1 | ready |
| F-15 circle goal | `POST /groups/` takes `goal_pages` (canonical; the `reading_goal` alias is for 2.2.1 only). `GET /groups/{id}/goal` → `{goal_pages, goal_period, pages_read, pct}`, or `{goal_pages: null, pages_read: 0, pct: 0}` with no `goal_period` (4A §2) | ready: 4A §2 confirmed |
| F-07 book id | `book_id` matched first, an unknown id falls through; sub-shapes carry `google_books_id`/`isbn`/`total_pages` (4A §1) | ready: 4A §1 confirmed. Pytest proof is Escalation E1 |
| F-17 visibility toggle | none (Android sends `is_public` explicitly). 4A's default flip protects 2.2.1 | ready |
| F-22 notification routing | `extra.group_id` on join approved/rejected (exists) | ready |
| F-23 mark one read | `POST /notifications/{id}/read` → `200 {id, is_read: true}` (idempotent), 404 for any other id (4A §3) | ready: 4A §3 confirmed |
| T-21 cover fallback (K1) | `GoogleBookResult.cover_url` may be `null` (4A F-19) | ready |
| F-25 reject confirm | none | ready |
| F-31 cold start | `GET /version` stays unauthenticated and DB-free (exists) | ready |
| F-34 curator badge | `membership_role` (exists) | ready |
| F-38 accessibility | none | ready |
| `__DEV__` gating, FlatList, version | none | ready |

---

## Contract conflicts K1–K8 (tests.md) — resolutions
Checked on 2026-09-13 against `features/maintenance/sprint-4a-platform-audit/architecture.md` → "Contracts for 4B" (committed; live before the 4B build) and the current backend code.

| K# | Which side is right | Resolution | Changed section |
|---|---|---|---|
| K1 | **4A.** `cover_url: null` for imageless Google results is F-19's intent | 4B was incomplete. Add a cover fallback in LibraryScreen (C) and the GroupDetailScreen SetGroupBookModal (B) | spec R21; T-21; Work packages B and C; Contract dependency table; Device "Also check" 15; Risk Summary "What changes" |
| K2 | **Neither is a contract break.** The stored value (`'private'`/`'public'`) and key `bt_note_visibility` match | Android keeps the PM's 4B wording "Private" (`common.private`). Web's "Only me" is an accepted wording difference | Assumption 11 |
| K3 | **4B.** It covers Feed, BookDetail and Profile (new and edit), remembered and cleared on sign-out, which matches the PM decision 4A itself records | No Android change. 4A's F-17 handoff row is stale wording (Doc Sync). Sign-out parity for web is Escalation E2 | Dependency-map updates 13; Escalations E2 |
| K4 | **Both agree.** 4A's `GET /groups/{id}` aliases serve 2.2.1 only | T-09 now forbids reading `reading_goal`/`pages_read_total`; tests.md S36 guards it | T-09 |
| K5 | **tests.md and the code.** review.friend is already a Review Circle member, and `handleInviteSearch` filters members out | The 4B acceptance criterion was wrong. Use a throwaway private circle with no other members; Review Circle not listing review.friend is correct | spec R4; Device hard gate 5 |
| K6 | **4A.** An invalid token counts as anonymous: 2 calls, then `401 login_required` | No change. The interceptor treating that 401 (Authorization sent) as expiry is correct, because the token is invalid | T-03 (K6 note) |
| K7 | **4A's contract is sufficient.** The residual is inherent: no valid token to deregister with, and no registration happens if nobody signs in or permission is denied | Residual accepted and documented. It closes when the next account registers | T-02 residual; Security Review; Risk Summary |
| K8 | **4A's contract is correct but unproven by pytest** | Escalation E1. Build step 1 requires those tests green | Build & release plan step 1; Escalations E1 |

### Escalations to 4A (do not edit 4A files from 4B)
- **E1 (blocks the 4B build at step 1).** Add these to `tests/test_books.py` (4A package A2) and pass them on the deployed commit:
  - `test_add_by_book_id_reuses_catalogue_row`: an existing Book not in the caller's library; POST with its `book_id` plus a different `google_books_id` → 200, the response `book_id` equals that Book, and the Book row count is unchanged.
  - `test_unknown_book_id_falls_through_to_google_books_id`: `book_id: 999999` plus an existing `google_books_id` → 200, matched by Google id, with no 404 and no new Book.
  - `test_book_id_wins_over_google_books_id`: `book_id` of Book X with the `google_books_id` of Book Y → matched to X.
  - `test_recommendations_items_have_dedup_keys`: every `GET /books/recommendations` item has the `google_books_id`, `isbn` and `total_pages` keys.
  - `test_friends_reading_book_has_dedup_keys_and_user_profile_picture`: `GET /userbooks/friends/currently-reading` `[i].book` has those three keys, and `[i].user` has `profile_picture`.
- **E2 (parity recommendation; does not block 4B).** Web `logout()` (4A package B1, `src/context/AuthContext.jsx`) should also call `localStorage.removeItem('bt_note_visibility')`. That matches Android's clear on sign-out, so on a shared browser the next account starts on "Only me", as the PM decision intends. If 4A declines, record the parity difference in 4A's decisions; Android is unchanged either way.

---

## Build & release plan
**Target:** version **2.2.2**, versionCode **61**. `eas.json` `appVersionSource: "local"`, so EAS reads `app.json`. Both workflows check out `ref: master` and run `eas build --local`, so the code must be on master before dispatch.

**PM decisions (2026-09-13):** Gate 2 is approved. The Play rollout is **100%**, not staged, after the PM's device check of the test APK passes.

Ordered checklist:
1. **Gate: 4A backend is live.**
   - `curl -s https://book-tracker-stitch.onrender.com/version` → `commit` equals the 4A merge SHA.
   - 4A's "Contracts for 4B" is committed (confirmed 2026-09-13), and the Escalation E1 pytest cases pass on the deployed commit: `pytest tests/test_books.py -q -k "book_id or dedup_keys"` → `5 passed`.
2. Builder A merges: T-01…T-03, T-06, T-11 (A part), T-13 (A part), T-15, T-17 (A row), T-18, T-22 (A: `httpPolicy.js`, `_ast.mjs`, A's test files), the api.js additions for T-04/T-09/T-13, and the i18n keys. **Do not** bump the version yet.
3. Builder B merges: T-04 (B), T-05, T-09 (B), T-14, T-16, T-17 (B rows), T-21 (B).
4. Builder C merges: T-02 call sites, T-07, T-08, T-10, T-11, T-12, T-13 (C), T-17 (C rows), T-19, T-21 (C), T-22 (C: `noteVisibility.js`, C's test files).
5. Senior QA static checks pass per `tests.md`:
   - `node --test "__tests__/*.test.mjs"` ends `# fail 0` on the merged A+B+C tree
   - the grep and AST checks
   - a Metro bundle via `npx expo export --platform android` (record SKIP with the error text if it needs the network)
6. Package A commit: T-20 (`app.json` → 2.2.2 / 61). Push to master.
7. Dispatch **`Build Stitch APK (Preview)`** (`.github/workflows/build-stitch-apk.yml`). In the log confirm:
   - "Check version bump" prints 61 > 60 with no warning
   - `npm ci`
   - `react-native-svg@15.15.4`
   Download the `TrackMyRead-stitch-preview` artifact.
8. **HARD GATE — PM device check on that APK.** Every item under "Hard gate" in Test plan hooks → Device only must pass. **No AAB is dispatched while any item fails.** The preview APK's signing may differ from the Play install, so use a device without the Play build or uninstall it first.
9. On a failure: fix, commit, re-dispatch the APK (versionCode stays 61; the APK guard only warns), then repeat the **whole** hard-gate list on the new APK, not only the failed item. Sign-out, push and feed-list focus interact.
10. Dispatch **`Build Stitch AAB (Production)`** (`.github/workflows/build-stitch-aab.yml`). The strict guard must pass. Download `TrackMyRead-stitch-production`.
11. **PM final release gate (owned by PM):**
    - The PM gives the final go, uploads the AAB to Play Console and releases it to **100%** of users.
    - Once Play accepts it, commit `book-tracker-mobile-stitch/release/last-released.json` → `{ "version": "2.2.2", "versionCode": 61 }`.
    - Doc Sync updates LOAD_ME_FIRST and `repos/mobile/index.md`.

**Rollback is a hotfix build, not a rollout halt.** At 100% every user can receive 2.2.2 immediately, so halting the release protects almost no one, and a versionCode can never go down. If 2.2.2 misbehaves in production:
1. Fix on master.
2. Bump `app.json` to **2.2.3 / versionCode 62**.
3. Dispatch the APK and re-run the hard-gate items the fix touches, plus sign-out and expired session.
4. Dispatch the AAB (the strict guard passes at 62 > 61).
5. PM go → 100% release.
6. Update `release/last-released.json` to 2.2.3 / 62.

4B changes no backend or schema, so there is nothing server-side to revert. Workflow changes are reverted by commit.

---

## Test plan hooks for Senior QA

### Static (no device)
Senior QA's executable plan is `features/android/sprint-4b-android-audit/tests.md`: node:test files under `book-tracker-mobile-stitch/__tests__/`, owned per T-22. This table is the brief-level summary.
| Item | Check |
|---|---|
| F-32 | • `grep -n '"react-native-svg": "15.15.4"' book-tracker-mobile-stitch/package.json` → 1 hit<br>• `npm install --package-lock-only --ignore-scripts` then `git diff --exit-code package-lock.json` (in sync)<br>• `grep -c "run: npm ci" .github/workflows/build-stitch-{apk,aab}.yml` → 1 each, `npm install` → 0<br>• `test ! -e .github/workflows/build-android.yml`<br>• `node scripts/check-version-bump.js --strict` exits 1 against a temp `app.json` copy at 60 / 2.2.1 and 0 at 61 / 2.2.2; without `--strict` it exits 0 and prints `::warning::` |
| F-03 | • `grep -nE "fetch\(|API_BASE_URL" src/services/NotificationService.js` → empty<br>• `grep -rn "authAPI.logout" src/screens` → empty<br>• `grep -n "deregisterPushToken" App.js src/screens/SettingsScreen.js` → App.js handleLogout + SettingsScreen delete, the latter before `deleteAccount` |
| F-04 | • `grep -n "deleteGroup" src/services/api.js` → 1<br>• Disband gated on `created_by` (read `GroupDetailScreen.js` near the old `:828`)<br>• `GroupsScreen` focus effect calls `loadMine` |
| F-05 | `grep -rn "usersAPI" App.js src` → empty |
| F-11 | • `grep -n "setAuthExpiredHandler" App.js src/services/api.js` → both<br>• two `isLoggedIn()` re-checks after `preloadData()` in App.js<br>• the interceptor calls `isAuthExpiredError` from `src/services/httpPolicy.js`, with no inline 401 / `Authorization` / `skipAuthExpired` condition (`httpPolicy.test.mjs` covers the rule) |
| F-12 | `grep -n "res.books" src/components/AppTour.js` → empty; `results` + `google_id` mapping present |
| F-13/F-14 | `grep -nE "yearGoal\.finished|average_rating|books_this_year|books_finished_this_year|projected_finish_date|finished_books" src/screens/InsightsScreen.js src/screens/ProfileScreen.js` → empty |
| F-15 | `grep -rn "reading_goal" src` → empty; `grep -n "getGroupGoal" src/screens/GroupDetailScreen.js src/services/api.js` → both |
| F-07 | `grep -n "book_id" src/screens/BookPreviewScreen.js` → present, with the userbook guard |
| F-17 | • `grep -rn "is_public: true" src` → empty<br>• `is_public:` appears in FeedScreen (2), BookDetailScreen (1), ProfileScreen (2)<br>• `grep -rn "bt_note_visibility" App.js src` → exactly 1 hit, the `NOTE_VISIBILITY_KEY` export in `api.js`; `src/utils/noteVisibility.js` has no key literal and no imports<br>• `useNoteVisibility`: initial state `false`; the read goes through `parseStoredVisibility`, the write through `serializeVisibility` inside the setter; the re-read keys on `useIsFocused` (`noteVisibility.test.mjs` covers parse and serialize)<br>• `useNoteVisibility` used by FeedScreen, BookDetailScreen and ProfileScreen; `grep -nE "setIsPublic\(false\)\|setNoteIsPublic\(false\)\|setRememberedPublic\(false\)" src/screens` → empty (no reset after posting)<br>• ProfileScreen edit path binds to local `editPublic`, not the hook<br>• `grep -n "NOTE_VISIBILITY_KEY" App.js` → `removeItem` in both `handleLogout` and `handleSessionExpired`<br>• `notes.savedPrivately` used on both FeedScreen create paths and present in all 6 locale files |
| F-22 | `grep -nE "group_join_approved|group_join_rejected|admin_broadcast|'circles'" src/screens/NotificationsScreen.js` → all present |
| F-23 | `markRead` present in api.js + NotificationsScreen **iff** 4A ships the route; `refreshUnread` in NotificationContext, App.js and NotificationsScreen |
| F-25 | `handleReject` wraps `Alert.alert` with a cancel option |
| F-31 | • `grep -nE "COLD_START_TIMEOUT\|warmUp" src/services/api.js src/screens/LoginScreen.js`<br>• the retry block calls `isRetryableRequest` from `httpPolicy.js` and sits before the 401 block, with no inline method or error-code condition in `api.js` (`httpPolicy.test.mjs` covers GET-only, the transient codes and no double retry) |
| F-34 | `grep -rn "user_role" src` → empty |
| F-38 | **AST sweep:**<br>• Scope: `App.js` + `src/**/*.js` with `@babel/parser` (present at `book-tracker-mobile-stitch/node_modules/@babel/parser`).<br>• Report every `TouchableOpacity`/`Pressable`/`TouchableHighlight`/`TouchableWithoutFeedback` JSX element with no `accessibilityLabel` attribute and no `<Text>` descendant.<br>• Expected result: only `SearchScreen.js:266,283`, `FeedScreen.js` shelf backdrop, `UserProfileScreen.js` shelf backdrop.<br>• Plus: every row in the T-17 table carries `accessibilityLabel`, and `UserProfileScreen` pills are `View`. |
| `__DEV__` | `grep -rn "console\." App.js src | grep -v __DEV__` → empty |
| FlatList | `FeedScreen.js` has `FlatList` with `keyExtractor`, `extraData` containing `expandedComments` and `menuPostId`, an element (not a function) `ListHeaderComponent`, and `removeClippedSubviews={false}` |
| Whole app | • `cd book-tracker-mobile-stitch && npx expo export --platform android --output-dir <scratch>`: Metro bundles, catching syntax errors and unresolved modules.<br>• Recommended one-off AST check: every named import from `../services/api` / `./src/services/api` / `../services/NotificationService` is an actual export. This is the class of bug behind F-05 that Metro does not catch. |

### Device only (PM, on the step-7 APK; there is no emulator on this machine)
Follow `qa/RULES_OF_ENGAGEMENT.md`. Create throwaway data only and delete it afterwards.

**Hard gate — all six must pass before the AAB is dispatched (Build & release plan, step 8):**
1. **Sign-out and expired session (F-03, F-11).**
   - Sign out from Profile: Login shows with **no** "Session expired" alert, and signing back in works. Repeat from Settings → Sign Out.
   - Sign in with a throwaway Google account and background the app. Delete that account from the web Settings, then foreground or relaunch: Login shows with the "Session expired" alert within 60 s or on relaunch, never blank tabs.
2. **Push on a shared phone (F-03).** Sign in as A and allow notifications. Sign out, then sign in as B. From the web as a third account, like B's own note: this phone, signed in as B, shows the push. Sign out B and sign in as A: A does not receive B's activity, and a like on A's own note reaches A.
3. **Home post Public/Private flow and its message (F-17).**
   - On a fresh install (or after clearing app data), the Home composer starts on **Private**.
   - Post from Home on Private: the toast reads "Saved privately — find it on your Profile". The post is not in Community and is on Profile.
   - Flip to **Public** and post: no toast, and the post appears in Community.
   - Open a book's page and Profile → New Entry: both composers now show **Public** (the choice is remembered). Kill and relaunch: still Public.
   - Edit an existing private note on Profile: its switch shows Private, and after saving, Home still shows Public.
   - Sign out and sign back in: the composers are back on **Private**.
   - Delete every test note.
4. **Disband (F-04).** As the creator, make a private throwaway circle and Disband it: it disappears from My Circles without pull-to-refresh. On a circle where you are a curator but not the creator, there is no Disband button.
5. **Invite search (F-05).** As review.reader, in a private throwaway circle with no other members (Gate 4's circle, **before** disbanding it), type "review" in Invite Friends: review.friend is listed. Don't tap Invite. In Review Circle the same search correctly does **not** list review.friend, because existing members are filtered out (K5).
6. **Keyboard in the feed list (T-19).** Scroll a full Home feed smoothly. Type 20+ characters in the composer, then in an expanded comment box: the keyboard stays open and no characters are lost. The ··· menu and comment expand still work. If this fails and can't be fixed quickly, revert T-19 alone and re-run this item.

**Also check on the same APK.** Report findings to the orchestrator; the PM decides whether each one blocks the AAB.
7. **Cold start (F-31):** leave the backend idle 20+ minutes, confirming `/version` is slow. Kill and relaunch: tabs have data with no timeout alert. Sign out, then sign in after another 20-minute idle: success on the first tap.
8. **Tour (F-12):** clear app data → sign in → tour book step → type "hobbit" → 1–5 results. Don't add (or remove it afterwards).
9. **Circles extras:** a throwaway circle with goal 1000 shows 0 of 1,000 (F-15); Curator badge in My Circles (F-34); a pending request → Reject → Cancel keeps it (F-25; needs a second account to request).
10. **Insights / Profile (F-13/F-14):** goal "X / N books" on both screens, avg rating, This Year, and a projected finish date on an in-progress book.
11. **Notifications (F-22/F-23):** tap a join-approved row → circle; rejected row → Circles tab; broadcast row → nothing. Tap one unread row, kill and relaunch: still read, badge one lower (if F-23 shipped).
12. **Duplicate book (F-07):** open a book you already own from a friend's currently-reading card → "Already in library".
13. **TalkBack (F-38):** on Profile, Settings, GroupDetail and Feed, every icon button announces a name, and the Public/Private switch announces as a switch with its state. The UserProfile stat pills are not announced as buttons.
14. Settings footer shows the new build number.
15. **Missing covers (K1 / T-21):** in Library → Add Book, and in a circle's Set Group Book, search a title whose Google result has no image: a book icon shows, never a blank box or a crash.

---

## Work packages
All three packages are disjoint by file (confirmed below). Merge order is **A → B → C**, then one build.

### Package A — Core: build, auth, push, networking, tour, i18n
Items: T-01 (F-32), T-02 core (F-03), T-03 (F-11), T-04/T-09/T-13 api.js additions, T-06 (F-12), T-11 key constant + sign-out clear, T-13 context, T-15 (F-31), T-17 AppTour row, T-18, T-20, T-22 (A), all i18n keys (including the PM-confirmed `notes.savedPrivately` in all 6 locales).
- `.github/workflows/build-stitch-apk.yml`
- `.github/workflows/build-stitch-aab.yml`
- `.github/workflows/build-android.yml` (delete)
- `book-tracker-mobile-stitch/package.json`
- `book-tracker-mobile-stitch/package-lock.json`
- `book-tracker-mobile-stitch/app.json`
- `book-tracker-mobile-stitch/scripts/check-version-bump.js` (new)
- `book-tracker-mobile-stitch/release/last-released.json` (new)
- `book-tracker-mobile-stitch/App.js`
- `book-tracker-mobile-stitch/src/services/api.js`
- `book-tracker-mobile-stitch/src/services/NotificationService.js`
- `book-tracker-mobile-stitch/src/context/NotificationContext.js`
- `book-tracker-mobile-stitch/src/screens/LoginScreen.js`
- `book-tracker-mobile-stitch/src/components/AppTour.js`
- `book-tracker-mobile-stitch/src/i18n/locales/en.json`, `de.json`, `es.json`, `fr.json`, `pt.json`, `ru.json`
- `book-tracker-mobile-stitch/src/services/httpPolicy.js` (new, T-22)
- `book-tracker-mobile-stitch/__tests__/_ast.mjs` (new, T-22)
- `book-tracker-mobile-stitch/__tests__/versionGuard.test.mjs`, `httpPolicy.test.mjs`, `i18nParity.test.mjs`, `apiContract.test.mjs`, `sourceRules.test.mjs`, `workflows.test.mjs` (new, T-22)

**Contract A provides to B and C:**
- `groupsAPI.deleteGroup(id)`, `groupsAPI.getGroupGoal(id)`
- `userAPI.deregisterPushToken()`
- `notificationsAPI.markRead(id)` (4A §3 confirmed)
- `NotificationService.deregisterPushToken()` / `resetPushRegistration()`, both without arguments
- `App.js handleLogout({ alreadyDeregistered })` via `onLogout`
- `NotificationContext` `refreshUnread`
- `NOTE_VISIBILITY_KEY` (`'bt_note_visibility'`), exported from `api.js`
- every key in §0.1
- `__tests__/_ast.mjs` (imported by C's test files) and the `node --test` convention (T-22)

### Package B — Circles
Items: T-04 screens (F-04), T-05 (F-05), T-09 screens (F-15), T-14 (F-25), T-16 (F-34), T-17 B rows, T-21 (GroupDetail search-result cover fallback).
- `book-tracker-mobile-stitch/src/screens/GroupsScreen.js`
- `book-tracker-mobile-stitch/src/screens/GroupDetailScreen.js`

### Package C — Feed, library, book, profile, settings, notifications, insights
Items: T-02 call sites, T-07 (F-13), T-08 (F-14), T-10 (F-07), T-11 (F-17, including the `useNoteVisibility` hook in `VisibilityToggle.js`), T-12 (F-22), T-13 screen (F-23), T-17 C rows (F-38), T-19 (FlatList), T-21 (Library cover fallback), T-22 (C).
- `book-tracker-mobile-stitch/src/components/AppHeader.js`
- `book-tracker-mobile-stitch/src/components/VisibilityToggle.js` (new)
- `book-tracker-mobile-stitch/src/screens/FeedScreen.js`
- `book-tracker-mobile-stitch/src/screens/LibraryScreen.js`
- `book-tracker-mobile-stitch/src/screens/BookDetailScreen.js`
- `book-tracker-mobile-stitch/src/screens/BookPreviewScreen.js`
- `book-tracker-mobile-stitch/src/screens/ProfileScreen.js`
- `book-tracker-mobile-stitch/src/screens/UserProfileScreen.js`
- `book-tracker-mobile-stitch/src/screens/SettingsScreen.js`
- `book-tracker-mobile-stitch/src/screens/NotificationsScreen.js`
- `book-tracker-mobile-stitch/src/screens/InsightsScreen.js`
- `book-tracker-mobile-stitch/src/utils/noteVisibility.js` (new, T-22)
- `book-tracker-mobile-stitch/__tests__/noteVisibility.test.mjs`, `notificationEvents.test.mjs`, `a11yTouchables.test.mjs` (new, T-22)

**Overlap check:**
- A has 28 paths (27 edited or new plus 1 deletion), B has 2 and C has 15. Re-counted 2026-09-13 after adding the T-22 helpers and test files; T-21 adds no file.
- Test files are owned exactly as tests.md's "Node test files" table assigns them: A has `_ast.mjs` plus 6 files, C has 3 files, B has none. See T-22 for the no-overlap rule.
- The intersection of every pair is empty.
- `AppNavigator.js`, `SearchScreen.js`, `OnboardingScreen.js`, `theme.js`, `buildInfo.js`, `eas.json` and `google-services.json` are in no package.

### Files NOT to touch
- `app/**`, `tests/**`, `context/supabase_migration.sql`: backend is 4A only.
- `book-tracker-frontend-stitch/**`: web is 4A.
- `dependency-map.md`: Doc Sync, from the list below.
- `features/maintenance/sprint-4a-platform-audit/**`: the other Architect's files.
- `book-tracker-mobile-stitch/src/navigation/AppNavigator.js`: no change needed.
- `book-tracker-mobile-stitch/src/screens/SearchScreen.js`, `OnboardingScreen.js`: the PM approved deleting them in a later build, not 2.2.2.
- `book-tracker-mobile-stitch/src/buildInfo.js`: generated by CI.
- `book-tracker-mobile-stitch/eas.json`, `google-services.json`.

---

## Security Review
- **Ownership and privacy:** no endpoint is added or changed by 4B, and every mutation Android calls is already owner-checked server-side (see DB Tables Touched).
  - Disband visibility follows `created_by`; the server still 403s everyone else.
  - Composers now default to `is_public:false`, which strictly reduces exposure.
  - F-07's `book_id` can at worst add an existing catalog book to the caller's *own* library. The guard excludes userbook ids.
- **Session handling (F-11):** a 401 clears `bt_token` and nothing is logged. The handler fires only when a token was sent, so a failed Google login can't masquerade as expiry. The re-check after preload prevents rendering tabs without a token.
- **Push (F-03):** deregistration runs while the token is valid, before `bt_token` is cleared. The guard reset plus epoch prevents a stale in-flight registration from suppressing the next account's registration.
  - **Residual (K7, accepted):** offline sign-out or a session expiry leaves the old row on the server until the next account registers the same device token; 4A §4 then deletes it. It stays if nobody signs in or that account denies notification permission.
- **Retries (F-31):** only GETs are retried, and only once. No POST (`/auth/google`, likes, posts, joins, deletes) is ever replayed, so no duplicate writes. The warm-up hits `/version`, which returns no user data.
- **Unauthenticated reach:** nothing new; `/version` was already public.
- **Logging:** all `console.*` gated with `__DEV__`, so release logcat carries no push status codes. No token or PII was logged before, and none is added.
- **Supply chain (F-32):** `npm ci` plus an exact `react-native-svg` pin make the store build reproducible from the lockfile. The guard script reads only `app.json` and a committed JSON file, with no secrets and no network.
- **Remembered visibility (F-17):** `bt_note_visibility` holds only `'private'` or `'public'`, never user data. It is cleared on sign-out and session expiry, so one account's Public choice never becomes the next account's default on a shared phone. A missing or unexpected value reads as Private.
- **Unchanged, flagged:** the JWT stays in plain AsyncStorage (F-44, Later).

## Assumptions
1. **2.2.1 / versionCode 60 is the highest code Play Console has accepted** (LOAD_ME_FIRST.md:17). If wrong, use the next free code and seed `last-released.json` with the real last value; T-20 and the guard change accordingly.
2. **The live backend serves 4A's "Contracts for 4B" at build time.** Confirmed on paper on 2026-09-13; Build step 1 verifies the deploy and E1's tests. If a detail differs, the Builder follows 4A and records it in `code-map.md`. Only T-02 (residual), T-09, T-10, T-13 and T-21 are affected.
3. **The preview APK may be signed differently from the Play AAB.** If so, the PM must test on a device without the Play install (or uninstall first, losing local data). The device checklist changes only in setup.
4. **axios ^1.15 reports timeouts as `ECONNABORTED` (or `ETIMEDOUT`) and connection failures as `ERR_NETWORK` or no `response`.** If wrong, the retry never fires and cold start behaves like today with a 45 s ceiling.
5. **The en.json `common.private` / `common.public` keys exist in all six locales.** Verified in en; the Builder confirms the other five before relying on them.
6. **`GET /groups/{id}` stays 403 for private non-members.** If 4A relaxes it, rejected-join taps could route to the group page instead.
7. **Render wake time is ~30 s.** If production cold starts regularly exceed 45 s, raise `COLD_START_TIMEOUT`. The retry keeps a second chance either way.
8. **`BookPreviewScreen` is never handed a Google search result.** Verified: all 6 `navigate('BookPreview')` call sites pass local Books or userbooks. If a future caller passes a Google result, `rawBook.id` is undefined and `book_id` becomes null, which is safe.
9. **Editing an existing note does not change the remembered choice**; the switch shows that note's own visibility. If the PM wants edits to update the remembered choice, bind the edit toggle to `useNoteVisibility` as well.
10. **The remembered choice is forgotten at sign-out and session expiry** (Security Review). This keeps "never chosen → Private" true per account on a shared phone. If the PM wants the choice kept across sign-out, delete the two `removeItem` lines. 4A's web should make the same call for localStorage.
11. **Label wording (K2).** Android labels the private option "Private" (`common.private`), the PM's 4B wording; 4A web says "Only me". The stored value and key are identical, so this is wording only. If the PM wants parity, change that one label key in `VisibilityToggle.js`.

## Open Questions (product only)
None open. The PM answered on 2026-09-13:
1. **Unreachable screens:** delete `SearchScreen.js` and `OnboardingScreen.js` in a later build, not 2.2.2 (see Later). 2.2.2 does not touch them.
2. **Remember the last Public/Private choice:** yes. One AsyncStorage key shared by all composers, `bt_note_visibility` (`'private'` or `'public'`); never chosen → Private; written when the switch changes (T-11). Web uses the same key name in localStorage.
3. **"Saved privately — find it on your Profile" after a private Home post:** confirmed (`notes.savedPrivately`, Package A, all 6 locales).
4. **Play rollout:** 100% after the PM device check of the test APK passes (Build & release plan). Rollback is a hotfix build.

## Later (not in 2.2.2)
- F-35: run `_silentCoverFix` at most once a day.
- Re-arm the 45 s cold-start window after more than 15 minutes in the background.
- GroupDetail goal card label chooses monthly vs yearly by `goal_period`. Today it always says yearly.
- F-40: delete the never-opened shelf modals in `FeedScreen.js` and `UserProfileScreen.js`.
- **Delete `SearchScreen.js` and `OnboardingScreen.js`** (PM-approved 2026-09-13, for a build after 2.2.2). Neither is registered in `AppNavigator.js`. Delete both files, re-run `python scripts/gen_dependency_map.py` (they drop out as consumers of `/api/googlebooks/search`, `POST /books/add-to-library` and `PUT /profile/me`), and re-run the F-38 AST touchable check. 2.2.2 does not touch them.
- F-44 remainder: expo-secure-store for `bt_token` (read the old AsyncStorage token once), New Architecture revisit, KeyboardAvoidingView on Android 15, `Clipboard` from core RN, `AppTour.finish` unhandled rejection, `Linking.openURL` catch, unmount guards, cover fallback in AddBookModal.
- Remove the duplicate `Notifications.setNotificationHandler` (`App.js:26`, `NotificationService.js:17`).
- F-30: own-comment delete UI, after the PM's deferred decision.

## Dependency-map updates (for Doc Sync)
Curated section only. Then run `python scripts/gen_dependency_map.py`.
1. **`pushtoken` table:**
   - Mobile registers through `api.js` `userAPI.registerPushToken`; `NotificationService` no longer has its own base URL or fetch.
   - `userAPI.deregisterPushToken` → `DELETE /push-tokens/` is called from `App.js handleLogout` and `SettingsScreen` delete-account, before the token is cleared.
   - Remove the parity-gap bullet "Mobile push registration bypasses api.js…".
2. **Mobile `App.js :: preloadData()`:**
   - A 401 on any preload request clears `bt_token` and returns to Login via `setAuthExpiredHandler` (F-11).
   - Requests before the first successful response use a 45 s timeout.
   - GETs retry once on timeout or network error; non-GETs never retry (F-31).
   - `_silentCoverFix` is still on every launch.
3. **New curated contract, `GET /reading-activity/insights`:** Android 2.2.2 reads only canonical keys (`total_finished`, `finished_this_year`, `avg_rating`, `yearly_goal.completed`, `projected_finishes[].projected_finish`). 4A's aliases stay until 2.2.1 is below the minimum supported version.
4. **New curated contract, group shape:**
   - Android reads `membership_role` and `created_by` (Disband is creator-only) and sends `goal_pages` on create (`goal_period` only with a goal).
   - Goal progress comes from `GET /groups/{id}/goal` `{goal_pages, goal_period, pages_read, pct}`.
   - Remove the parity gap "Mobile never calls `GET /groups/{id}/goal` and sends `reading_goal`" and the `groupsAPI.deleteGroup` / `usersAPI.searchUsers` undefined-function bullet.
5. **Note card / `POST /notes`, `PUT /notes/{id}`:** every Android composer (Feed, BookDetail, Profile new and edit) sends `is_public` explicitly. New notes use the remembered choice in AsyncStorage `bt_note_visibility` (`'private'` or `'public'`; missing → private; cleared on sign-out), the same key name web uses in localStorage. Editing sends the note's own value. The group post composer is not a note.
6. **`fire_event()` section:** Android deep links route `group_join_approved` → GroupDetail(`data.group_id`), `group_join_rejected` → Circles tab (GET /groups/{id} is 403 for private non-members), and `admin_broadcast` → no navigation.
7. **`googlebooks_router.normalize_google_cover_url` / search mapping:** Android `AppTour.js` now maps `results[].google_id → google_books_id`, `authors[] → author`, `isbn_13|isbn_10 → isbn` (F-12). `LibraryScreen` and `GroupDetailScreen` modals already read `results`.
8. **Userbook shape / `POST /books/add-to-library`:** `BookPreviewScreen` sends `book_id` (only for Book objects) and `isbn` alongside `google_books_id` (F-07, after 4A).
9. **Notifications:** `POST /notifications/{id}/read` consumer is Android `NotificationsScreen` (if 4A ships it). After mark-read and mark-all-read, Android refreshes `GET /notifications/unread-count` via `NotificationContext.refreshUnread`.
10. **`GET /version`:** new consumer, Android `LoginScreen` warm-up (`warmUp` in api.js). It must stay unauthenticated and DB-free.
11. **"api.js functions nobody calls" (generated):**
    - Expect `userAPI.registerPushToken` to drop off.
    - New mobile functions: `groupsAPI.deleteGroup`, `groupsAPI.getGroupGoal`, `userAPI.deregisterPushToken`, `notificationsAPI.markRead`, `warmUp`.
12. **UI actions → API (android):** after 2.2.2, the contract column clears for AppTour search, the GroupDetail Disband / Invite search / Reading Goal rows, the GroupsScreen Curator badge and Create Group rows, the InsightsScreen and ProfileScreen refresh rows, the BookDetailScreen composer row and the NotificationsScreen row tap. That update belongs to the inventory regeneration, not a hand edit.
13. **4A "Sprint 4B handoff" rows superseded by the 4B brief (K3, K1):**
    - F-17 is on Feed, BookDetail and Profile (new and edit), remembered in `bt_note_visibility` and cleared on sign-out, not book-detail only.
    - F-19's Android cover fallback is T-21: `LibraryScreen.js` result tile and selected hero, and the `GroupDetailScreen.js` SetGroupBookModal result tile.
    - Record Android that way in the curated map. The 4A file itself is not edited from 4B.
