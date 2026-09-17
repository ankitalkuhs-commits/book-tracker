# Build Notes — Package B1 (Sprint 4A Web Platform)

Scope: F-03 web, F-20, F-22, F-23 web, F-24, F-26, F-27, F-29 web, F-57, F-10 inside B1's own files.
Files touched (exhaustive, matches the brief's file list exactly):
`src/services/api.js`, `src/context/AuthContext.jsx`, `public/sw-push.js`,
`src/pages/NotificationsPage.jsx`, `src/pages/AdminPage.jsx`, `src/components/AppTour.jsx`,
`src/pages/OnboardingPage.jsx`, `src/pages/AboutPage.jsx`, `src/pages/PrivacyPage.jsx`,
`src/pages/TermsPage.jsx`, `src/utils/navigation.js` (new).
All paths relative to `book-tracker-frontend-stitch/`.

## What was built, per finding

### F-29 web + F-58 · `src/services/api.js` (`apiFetchRaw`)
- A 401 with a token absent and `body.detail.code === 'login_required'` now throws an `Error` carrying
  `status: 401` and `code: 'login_required'` instead of clearing a (nonexistent) token and navigating to `/`.
- A 401 with a token present still does the legacy clear-and-redirect (expired session).
- Every other non-ok response now throws an `Error` with `status` set, and a string vs. object `detail`
  (422 arrays, F-58 JSON 500s) both produce a readable `message` instead of `[object Object]`.
- Covers L-B1-01, L-B1-02.

### F-20 · `src/services/api.js` cache invalidation
- Added `invalidateGroups()`, `invalidateNotifications()`, `invalidateSocial()` next to the existing
  `invalidateUserBooks/Feed/Profile`.
- Wired every mutating function per the architecture's table:
  - `likeNote`, `unlikeNote`, `addComment` → `invalidateFeed()`
  - `followUser`, `unfollowUser` → `invalidateSocial()`
  - `markAllNotificationsRead`, new `markNotificationRead` → `invalidateNotifications()`
  - `updateNotificationPrefs` → `cacheClear('/notifications/prefs')`
  - `uploadProfilePicture` (raw fetch) → `invalidateProfile()` before `return res.json()`
  - All 16 group mutations (`createGroup` … `clearGroupBook`) → `invalidateGroups()`
  - `fixCoversBatch` → `cacheClear('/userbooks')`, `cacheClear('/import')`, `invalidateFeed()`
  - `adminDeleteNote`, `adminDeleteComment` → `cacheClear('/admin')`, `invalidateFeed()`
  - `setAdminRole` → `cacheClear('/admin')`
  - `triggerBot` → `invalidateFeed()`
  - Left the 10 "already correct" functions and `webSubscribe`/`webUnsubscribe`/`sendTestPush`/
    `broadcastPush`/`deleteAccount`/`uploadNoteImage` untouched, as the brief says.
- Covers L-B1-03..06.

### F-26 · `setAdminRole` sends the required query
- `setAdminRole(userId)` now calls `POST /admin/set-admin/${userId}?is_admin=true` (was missing the
  query entirely, so the server 422'd into an empty catch and the button never worked).
- `AdminPage.handleMakeAdmin` now takes the row's user object, confirms
  (`Give admin access to ${u.name || u.email}?`), and shows a success/error toast.
- `AdminPage.handleBroadcast` confirms with `Send this push to ${n ?? 'every'} user(s)…` using
  `stats?.push_subscribed_users` (an A2 dependency — see below).
- Covers L-B1-07; ST for the confirm/toast wiring is manual per the brief (no dedicated static check
  beyond ST-B1-09's colour grep on this file).

### F-03 web + F-27 · `src/context/AuthContext.jsx`
- `registerWebPush()` now returns early unless a token exists **and**
  `Notification.permission === 'granted'` — it never prompts, and never calls `pushManager.subscribe`
  outside that guard.
- `webSubscribe(...)` is now called unconditionally on every run (not only inside `if (!sub)`), so a
  second account on a shared browser is always (re-)registered with the server, which reassigns the
  endpoint (F-03 server half, A1).
- Added `unregisterWebPush(token)`: best-effort, gets the current subscription (if any) and calls
  `webUnsubscribe(sub.toJSON(), token)`. Failures are swallowed — server-side reassignment on next
  login covers a failed unsubscribe.
- `logout()` rewritten to the exact order the architecture and E2 require (see below).
- Covers L-B1-08, ST-B1-06.

### E2 · Logout clears the remembered note visibility
`logout()` in `AuthContext.jsx` is now:
```js
const logout = () => {
  const token = getToken();                          // F-03 web: capture before clearing
  clearToken();
  localStorage.removeItem(NOTE_VISIBILITY_KEY);      // E2: the next account must start at "Only me"
  setUser(null);
  unregisterWebPush(token);                          // fire-and-forget
};
```
- `NOTE_VISIBILITY_KEY` is imported from `src/utils/noteVisibility.js`, which was already pre-committed
  on this worktree byte-identical to the architecture's block (K-15's recommended resolution: B1 imports
  the constant as a read-only dependency; I did not create or edit that file). The literal
  `'bt_note_visibility'` does not appear anywhere in B1's files.
- `logout` stays synchronous and returns nothing; its four callers (`Nav.jsx:34`, `ProfilePage.jsx:500`,
  `SettingsPage.jsx:289,297`) are untouched — verified with `git diff` showing no change to those files.
- Covers L-B1-09 / gate G-E2, ST-B1-07.

### F-22 · `public/sw-push.js` + `src/pages/NotificationsPage.jsx`
- `sw-push.js`: added `urlForNotification(d)` with the exact mapping from the architecture, and
  rewrote `notificationclick` to focus + `navigate()` an existing window (falling back to
  `openWindow`) instead of always opening `/`. The `push` event listener (lines 1-16) is untouched.
  A comment points at `NotificationsPage.jsx` as the duplicated mapping (a service worker cannot
  import from `src/`).
- `NotificationsPage.getDestination`: added `group_join_approved` to the `group_invite` case,
  `group_join_rejected` → `/groups`, and an explicit `admin_broadcast` → `null` case — all three placed
  before `default` so `default` doesn't swallow them via `actor_id`.
- Covers ST-B1-03, ST-B1-04.

### F-23 web · Mark one notification read
- `api.js` exports `markNotificationRead = (id) => apiFetch(\`/notifications/${id}/read\`, { method: 'POST' })`
  with a `.then` that clears the notifications cache.
- `NotificationsPage`'s row `onClick` calls `markNotificationRead(n.id).catch(() => {})` inside the
  existing `if (!n.is_read) { ... }` block, right after the optimistic `setNotifications` update. The
  `if (dest) navigate(dest)` line is unchanged.
- Covers L-B1-05 (cache half), ST-B1-05.

### F-24 · `src/components/AppTour.jsx`, `src/pages/OnboardingPage.jsx`
- `AppTour.jsx`: added `import { useToast } from './Toast'`; `const toast = useToast()` added inside
  each of `AvatarStep`, `GoalStep`, `AddBookStep` (there is no shared parent scope to hoist it into).
  - `AvatarStep.handleUpload` catch → `toast('Could not upload that photo — try another', 'error')`.
  - `AvatarStep.handleSave` catch → `toast(e.message || 'Could not save your avatar', 'error')`,
    `setSaving(false)`, `return` — before `onSave(...)`, so the step stays open.
  - `GoalStep.handleSave` catch → same pattern, `'Could not save your goal'`, `return` before `onSave`.
  - `AddBookStep.handleAdd` catch → `toast(e.message || 'Could not add that book', 'error')`;
    `setAdded` is not reached (it's inside the `try`, before the `catch`).
  - The literals `/* ignore */` and `/* non-fatal */` no longer appear anywhere in the file (verified
    by grep, 0 hits).
- `OnboardingPage.handleNext` step 2: same pattern —
  `toast(e.message || 'Could not save your goal', 'error')`, `setSavingGoal(false)`, `return` before
  the `if (step < total - 1)` advance. Skip (`finish()`'s own path) is untouched.
- Covers ST-B1-01, ST-B1-02.

### F-57 · `src/utils/navigation.js` (new), `AboutPage.jsx`, `PrivacyPage.jsx`, `TermsPage.jsx`
- New file, exactly the architecture's `goBackOrHome(navigate)`:
  `idx > 0` → `navigate(-1)`; otherwise → `navigate('/', { replace: true })`.
- All three pages: `onClick={() => navigate(-1)}` → `onClick={() => goBackOrHome(navigate)}`, plus the
  import. `navigate(-1)` now occurs 0 times across the three pages (verified by grep).
- Self-verified the four `ST-B1-08` scenarios by running the module directly under Node with a stubbed
  `window.history.state` (idx 2 → `[-1]`; idx 0 → `['/', {replace:true}]`; `state: null` → same;
  `state: {}` → same). All four matched the spec.
- Covers ST-B1-08; the browser-level L-B1-10 case needs Playwright, which is QA's harness (K-18/K-20),
  not run here.

### F-10 inside B1's files
Applied the architecture's mapping rule (`text-on-surface-variant/60,70` → `text-on-surface-muted`;
`/20,30,40,50` → `text-on-surface-faint`; `text-error/50,60,70` → `text-error`;
`text-primary/60,70` → `text-primary`; sub-12px → `text-xs`) to resting-state text only. Icon-only
`material-symbols-outlined` spans and `hover:`/`focus:`/`group-hover:` variants were left alone per the
brief's "Not changed" list.

| File | Edited | Skipped (icon-only or hover-only) |
|---|---|---|
| `AppTour.jsx` | 0 | 2 — `:298` `text-outline-variant` (search icon), `:325` `text-outline` (menu_book icon), both `material-symbols-outlined` spans |
| `AdminPage.jsx` | 8 — tab label `/60`→muted; 4× list-meta `/40,/50`→faint; 2× delete-button `/70`→`text-error` | 3 — 2 search-icon `text-outline/50` spans, and `hover:text-primary/70` on the "Make Admin" link (a hover variant, no resting match) |
| `NotificationsPage.jsx` | 2 — body `/70`→muted, timestamp `/60`→muted | 2 — `text-outline/40` on the empty-state icon, `text-on-surface-variant/30` on the `chevron_right` icon |
| `OnboardingPage.jsx` | 0 | 1 — `:472` `text-outline-variant` on an `upload_file` icon |

`tailwind.config.js`'s `on-surface-muted`/`on-surface-faint` tokens are Package C's file and do not
exist yet in this worktree, so these classes currently resolve to nothing in isolation (no visual change
until C merges) — this is expected per the architecture's cross-package note ("the build passes either
way, check visuals after all three merge") and does not affect `npm run build`.

## Build / lint — before and after

Ran from `book-tracker-frontend-stitch/` after `npm ci` (node_modules did not exist in the worktree).

- **Install:** `npm ci` — succeeded, 251 packages added, 0 errors (a pre-existing `npm audit`
  advisory list is unrelated to this change and was not touched).
- **Build:** `npm run build` — exit 0 both before and after my edits. No unresolved-module warning;
  `src/utils/navigation.js` and `src/utils/noteVisibility.js` both resolve (satisfies ST-W-01's
  cross-package-import check).
- **Lint** (`npx eslint . -f json`, totals across the whole repo):
  - Before my edits: not independently re-measured against a clean checkout (B2/C changes are not in
    this worktree yet either, so a true "before" run would only show the pre-existing baseline).
    tests.md's recorded baseline at `3157eee` is **44 problems: 37 errors, 7 warnings**.
  - After my edits: **43 problems: 36 errors, 7 warnings** — within the ≤37 error / ≤7 warning gate.
  - `src/utils/navigation.js` (the one file B1 creates): **0 problems**.
  - Every error/warning inside files I touched (`sw-push.js:5`, `AppTour.jsx:419,478`,
    `AuthContext.jsx:59,84`, `AdminPage.jsx:127,138,148`, `NotificationsPage.jsx:143`,
    `OnboardingPage.jsx` unused-import + unused-var) is pre-existing and outside my edited lines —
    confirmed by reading each message against the diff; none of them sits inside code I added or
    changed. I did not touch any of those pre-existing empty-catch / unused-var spots, per the
    Builder rule against fixing adjacent, unrelated issues.

## `logout()` shipped body

```js
const logout = () => {
  const token = getToken();                          // F-03 web: capture before clearing
  clearToken();
  localStorage.removeItem(NOTE_VISIBILITY_KEY);      // E2: the next account must start at "Only me"
  setUser(null);
  unregisterWebPush(token);                          // fire-and-forget
};
```

## Cross-package dependencies relied on

- **A2** (not in this worktree yet): `stats.push_subscribed_users` on `GET /admin/stats` — used in
  `AdminPage.handleBroadcast`'s confirm text (`${n ?? 'every'}`), which degrades gracefully to "every"
  if the field is absent so this does not break before A2 merges.
- **A2**: the `login_required` 401 shape `{"detail": {"code": "login_required", "message": "..."}}`
  from `/api/googlebooks/*` — `apiFetchRaw` is coded against this shape per the architecture; not
  independently testable against a live backend from this worktree.
- **A2**: JSON (not stack-trace) 500 bodies — `apiFetchRaw`'s new error handling degrades safely to
  `'Request failed'` if `detail` is anything unexpected, so it does not depend on A2 having landed to
  avoid breaking.
- **A1**: `DELETE /notifications/web-unsubscribe` matching by endpoint, and `POST /notifications/{id}/read`
  — both are called optimistically by B1's new code; neither endpoint exists in this worktree's backend
  yet, so they cannot be exercised end-to-end here. The client-side contract (method, body, auth header
  precedence) matches the architecture and Contracts-for-4B section exactly.
- **B2**: `src/utils/noteVisibility.js` — read-only import for `NOTE_VISIBILITY_KEY`. It was already
  present on this worktree (pre-committed per the architecture's K-15 resolution), byte-identical to the
  architecture's snippet, so no fallback literal was needed.
- **C**: `tailwind.config.js` tokens `on-surface-muted` / `on-surface-faint` — referenced by class name
  in `AdminPage.jsx` and `NotificationsPage.jsx`; not yet defined in this worktree's Tailwind config, so
  those classes are currently no-ops visually until C merges (per architecture, checked at merge, not at
  edit).

## Not run (out of scope for this worktree)

- `node qa/web_4a_local.mjs` (the L- harness) — does not exist in this worktree yet (QA-owned, K-20)
  and requires a live local backend seeded via `scripts/seed_review_accounts.py`, which needs A1/A2
  merged first. Correctness of the L-B1-01..10 cases was instead checked by re-reading each grep/logic
  requirement against the shipped code line by line (see the "What was built" section above), plus the
  standalone Node check of `goBackOrHome`.
- `node --test qa/unit/navigation.test.mjs` — the file does not exist yet (QA-owned per K-18/K-20); I
  ran the equivalent four assertions manually under plain Node (see F-57 above) and all four matched.
- Real web push delivery, a real `notificationclick`, and a real Notification permission prompt — per
  K-17, these are not automatable and are production-only (`P-` cases), not something a Builder can
  verify locally.

## Everything else

- No file outside B1's exhaustive list was edited. `git status --porcelain` shows exactly the 10 files
  in the brief plus the one new file.
- No dependency was added to `book-tracker-frontend-stitch/package.json`; `package-lock.json` is
  unchanged (K-18).
- `dist/` and `node_modules/` are both git-ignored and untouched in the index.

## Ready-for-QA checklist

- [x] all screen states implemented (error/readable-error, confirm dialogs, toast-on-failure, safe Back)
- [ ] `pytest tests -q` green — not applicable to B1 (no Python files touched)
- [x] web build passes (`npm run build`, exit 0)
- [ ] migration appended + flagged — not applicable to B1 (no `models.py` change)
- [ ] `app.json` bumped — not applicable to B1 (no mobile code touched)
- [ ] notification: config entry + placeholders + `fire_event` — not applicable to B1 (backend-only;
      B1 only calls the already-defined `/notifications/{id}/read` and `/notifications/web-unsubscribe`
      contracts from the client)
