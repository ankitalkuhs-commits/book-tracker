# Build Notes — Package B (Circles)

Sprint: `features/android/sprint-4b-android-audit`
Scope: `book-tracker-mobile-stitch/src/screens/GroupsScreen.js`, `book-tracker-mobile-stitch/src/screens/GroupDetailScreen.js` only.

## What was built, per T-item

- **T-04 · F-04 — Disband Circle (B half)**
  - `GroupDetailScreen.js`: Disband button gate changed from `isCurator` to
    `group?.created_by != null && group.created_by === currentUser?.id`. Only the circle's creator
    sees the button now; a curator who didn't create the circle does not.
  - `GroupsScreen.js`: `useFocusEffect` now calls both `loadMine()` and `loadPending()`, with `loadMine`
    added to the deps array, so a disbanded circle drops out of My Circles on focus without a
    pull-to-refresh.

- **T-05 · F-05 — Invite Friends search**
  - `GroupDetailScreen.js`: removed the undefined `usersAPI` from the import (line 11); `userAPI` was
    already imported. `handleInviteSearch` now calls `userAPI.searchUsers(q.trim())` instead of the
    non-existent `usersAPI.searchUsers`.

- **T-09 · F-15 (B half) — Circle reading goal**
  - `GroupsScreen.js` `CreateGroupModal.handleCreate`: payload now sends `goal_pages` (parsed with
    radix 10) instead of the stale `reading_goal` key, and `goal_period` only when a goal is actually
    set (`readingGoal ? goalPeriod : null`).
  - `GroupDetailScreen.js`: added `goal` state; `load()`'s `Promise.all` gained an 8th call,
    `safe(groupsAPI.getGroupGoal(groupId), 'getGoal')`, destructured as `gl`, stored via
    `setGoal(gl || null)`. The Reading Goal card now reads `goal?.goal_pages > 0` to render,
    `goal.pages_read ?? 0` for the count, `goal.goal_pages.toLocaleString()` for the "of" line, and
    `Math.min(100, goal.pct ?? 0)` for both the bar width and the percent label. It never reads
    `goal.goal_period`, `group.reading_goal` or `group.pages_read_total` (verified by
    `grep -rnE "reading_goal|pages_read_total"` on both files — empty).

- **T-14 · F-25 — Confirm before Reject**
  - `GroupDetailScreen.js`: `handleReject` rewritten to take the whole `member` object and show
    `Alert.alert(t('groups.rejectRequestTitle'), t('groups.rejectRequestConfirm', {name}), […])` with
    Cancel first (no API call) and a destructive Reject second (calls
    `groupsAPI.rejectGroupMember(groupId, member.user_id)`). The call site now passes `m` instead of
    `m.user_id`.

- **T-16 · F-34 — Curator badge**
  - `GroupsScreen.js` `GroupCard`: `isCurator` now reads `group.membership_role === 'curator'` instead
    of the nonexistent `group.user_role`.

- **T-17 · F-38 — Package B accessibility rows** (all 7 from the architecture table)
  - `GroupDetailScreen.js` SetGroupBookModal search button → `accessibilityRole="button"` +
    `accessibilityLabel={t('a11y.searchBooks')}`.
  - `GroupDetailScreen.js` hero back arrow → `a11y.back`.
  - `GroupDetailScreen.js` post author avatar (navigates to `UserProfile`) →
    `a11y.openUserProfile` with `{ name: post.user?.name }`.
  - `GroupDetailScreen.js` post trash icon (curator delete) → `a11y.deletePost`.
  - `GroupDetailScreen.js` composer "remove tagged book" (×) → `a11y.removeTaggedBook`.
  - `GroupDetailScreen.js` composer "remove photo" (×) → `a11y.removePhoto`.
  - `GroupsScreen.js` cover preset tile → `a11y.coverPreset` with `{ name: p.key }` plus
    `accessibilityState={{ selected: preset === p.key }}`.

- **T-21 · K1 / 4A F-19 — Cover fallback (B half)**
  - `GroupDetailScreen.js` SetGroupBookModal search-result tile: wrapped the `Image` in
    `item.cover_url ? <Image…/> : <View…><Ionicons name="book-outline"…/></View>`, matching the
    existing fallback already used by the selected-book hero a few lines below. No payload or string
    change — image-only, so no F-38 row.

## Contract names relied on (Package A, not yet present in this worktree)

- `groupsAPI.getGroupGoal(id)` — new client call added to `api.js` by Package A.
- `groupsAPI.deleteGroup(id)` — new client call added to `api.js` by Package A (already called by the
  pre-existing `handleDisband`; not touched by this package beyond the visibility gate).
- `userAPI.searchUsers` — pre-existing function; only the caller was fixed.
- i18n keys used: `a11y.searchBooks`, `a11y.back`, `a11y.openUserProfile`, `a11y.deletePost`,
  `a11y.removeTaggedBook`, `a11y.removePhoto`, `a11y.coverPreset`, `groups.rejectRequestTitle`,
  `groups.rejectRequestConfirm` — all from architecture §0.1, added to all 6 locales by Package A.
  None of these keys exist in this worktree's locale files yet; `t()` is called with the exact key
  regardless, per the brief's instruction not to add local fallbacks.

None of Package A's or C's files were edited or created from this worktree.

## Verification

- `node --check src/screens/GroupsScreen.js` → exit 0.
- `node --check src/screens/GroupDetailScreen.js` → exit 0.
- Read the full `git diff` for both files line by line; every changed line traces to one of the
  T-items above.
- `grep -rnE "reading_goal|pages_read_total" src/screens/GroupsScreen.js src/screens/GroupDetailScreen.js`
  → empty (S36 guard).
- `grep -n "usersAPI" src/screens/GroupsScreen.js src/screens/GroupDetailScreen.js` → empty.
- `grep -n "user_role" src/screens/GroupsScreen.js src/screens/GroupDetailScreen.js` → empty.
- `grep -c "membership_role === 'curator'" src/screens/GroupsScreen.js` → 1.
- `grep -c "userAPI.searchUsers(" src/screens/GroupDetailScreen.js` → 1.
- Diffed every new `t('…')` key and every `groupsAPI.`/`userAPI.` call added against the architecture's
  §0.1 table and Contract dependency table — all match verbatim (see list above).
- No hardcoded new user-facing strings were added; every new label/message goes through `t()`. The one
  pre-existing hardcoded string in `handleReject`'s catch (`'Could not reject member'`) is exactly what
  T-14's brief snippet specifies verbatim, and matches the file's existing style for catch-block alerts
  elsewhere (e.g. `handleApprove`, `handleRemoveMember`).
- Could not run the merged `node --test "__tests__/*.test.mjs"` gate — those test files belong to
  Packages A and C and don't exist in this worktree; Package B owns no test files per T-22.
- Could not run `npx expo export --platform android` — Package B's two files don't change any import
  graph outside themselves; deferred to the Senior QA merge-tree bundle check.

## Deviations from the brief

None. Followed T-04, T-05, T-09 (B), T-14, T-16, T-17 (B rows) and T-21 (B half) exactly as written,
including the exact JSX/logic snippets given in the architecture where provided.

## Assumptions

- Per architecture Assumption 2, `groupsAPI.getGroupGoal` and `groupsAPI.deleteGroup` are Package A's
  responsibility to add to `api.js`; this package calls them by the exact names in the Contract
  dependency table without defining or stubbing them here.
- `currentUser` (loaded via `userAPI.getProfile()` in an existing effect) and `group.created_by`
  (returned by the existing `_serialize_group`) are both already present in this worktree's backend
  contract; no backend change was needed or made.

## Explicitly not built

- Nothing in Package B's item list was skipped. Items outside Package B's file list (T-01/02/03/06/…
  and everything under Package A/C, the monthly/yearly goal-period label distinction called out under
  "Later" in architecture.md, F-40 dead-code removal, SearchScreen/OnboardingScreen deletion) were left
  untouched, as directed.

## Ready-for-QA checklist

- [x] All screen states implemented for Package B's items (Disband hidden/shown, reject confirm/cancel,
      curator badge, goal card empty/populated, invite search, cover fallback).
- [ ] `pytest tests -q` — not applicable; no backend touched.
- [ ] Web build — not applicable; no web file touched.
- [x] No DB migration needed — none of this package's changes touch the schema.
- [ ] `app.json` bump — not this package's responsibility (Package A, T-20, last commit before dispatch).
- [ ] Notification config/fire_event — not applicable; no notification touched by Package B.
