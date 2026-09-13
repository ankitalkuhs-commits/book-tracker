# Web Action Inventory B — TrackMyRead

Scope: `GroupsPage`, `GroupDetailPage`, `CreateGroupPage`, `JoinGroupPage`, `InsightsPage`, `NotificationsPage`, `SettingsPage`, `OnboardingPage`, `AdminPage`, `LoginPage`, `BlogListPage`, `BlogPostPage`, `AboutPage`, `PrivacyPage`, `TermsPage`, `i18n/index.js`, `sw-push.js`, `vercel.json`, `index.html`, `generate-ssg.mjs`. Every scoped file was read in full. Companion JSON: `qa/inventory/web-b.json` (69 entries).

Note on scope reduction: a small number of visually-repeated, behaviorally-identical controls are represented by one JSON entry each rather than one-per-instance — the 7 notification-preference toggles (`SettingsPage.jsx:455-483`), the 6 language pills (`SettingsPage.jsx:762-770`), the 8 cover-preset chips (`CreateGroupPage.jsx:104-119`), and the 8 admin quick-pick chips (`AdminPage.jsx:518-536`). Each entry's `element` field names every variant it covers. Two automatic (non-clickable) side effects — the service-worker `notificationclick` handler and `AuthContext`'s auto push-registration on login — have no Playwright-locatable element and are documented only as code findings below, not as inventory rows.

## Per-page summary

| Page | Route | Elements | Notable risk |
|---|---|---|---|
| GroupsPage | `/groups` | 6 | Accept-invite refresh can show stale cache |
| GroupDetailPage | `/groups/:groupId` | 23 | No group mutation invalidates cache; Leave/Delete-post/Remove-member lack confirmation |
| CreateGroupPage | `/groups/new` | 3 | createGroup doesn't invalidate `/groups` cache |
| JoinGroupPage | `/join/:inviteCode` | 3 | Join/join-request fires automatically on page load, no user confirmation click |
| InsightsPage | `/insights` | 0 | Pure read-only analytics page — no buttons, forms, or mutations found |
| NotificationsPage | `/notifications` | 3 | Per-notification read state is UI-only, not persisted; duplicate/ungated push subscription flow |
| SettingsPage | `/settings` | 10 | Generally the most defensive page (optimistic-revert toggles, confirm modal + disabled button for delete-account) |
| OnboardingPage | `/onboarding` | 3 | Yearly-goal save failure is silently swallowed |
| AdminPage | `/admin` | 6 | Broadcast-push-to-everyone and Make-Admin have weaker guards than deleting a single comment |
| LoginPage | `/` | 2 | Uses blocking `alert()` for auth errors instead of Toast |
| BlogListPage | `/blog` | 3 | Read-only, SSG-covered |
| BlogPostPage | `/blog/:slug` | 2 | Read-only; static body uses `dangerouslySetInnerHTML` from internal data |
| AboutPage | `/about` | 3 | Read-only |
| PrivacyPage | `/privacy` | 1 | No i18n |
| TermsPage | `/terms` | 1 | No i18n |

Infrastructure files (`i18n/index.js`, `public/sw-push.js`, `vercel.json`, `index.html`, `scripts/generate-ssg.mjs`) have no page-level actionable elements; findings from them are folded into the ranked list below.

## Code findings, ranked by severity

### Critical

1. **Cross-account push notification leak on shared devices.** `context/AuthContext.jsx:13-32` (`registerWebPush`) only calls `webSubscribe()` when `reg.pushManager.getSubscription()` returns nothing. On a shared browser, if user A subscribes then logs out and user B logs in, the browser-level `PushSubscription` still exists, so `sub` is truthy and `webSubscribe` is skipped for B — the server-side `PushToken` row (`app/notifications/router.py:52-75`) stays associated with A. `DELETE /notifications/web-unsubscribe` exists precisely for this ("called when user denies permission or logs out" per its own docstring) but is **never called anywhere in the web app** — `AuthContext.jsx:59-62` `logout()` does not call it, confirmed against `dependency-map.md`'s "no consumer" listing for that route. Failure scenario: two people share a laptop; the second person enables notifications but never receives any, while the first keeps getting notified for an account they signed out of.
2. **Ungated automatic push permission prompt bypasses the opt-in banner.** `AuthContext.jsx:38-51` calls `registerWebPush()` on every successful login and on every app load with a stored token, which calls `reg.pushManager.subscribe({userVisibleOnly:true,...})` without first checking `Notification.permission`. This triggers the native OS/browser permission dialog immediately on load/login, duplicating and bypassing `NotificationsPage.jsx:57-111`'s deliberately-designed `PushPermissionBanner` opt-in flow. Failure scenario: a user is prompted for notification permission before ever visiting the Notifications page or reading any explanation of why.
3. **Groups feature never invalidates its GET cache after any mutation.** None of `joinGroup`, `leaveGroup`, `createGroup`, `updateGroup`, `deleteGroup`, `approveGroupMember`, `rejectGroupMember`, `removeGroupMember`, `inviteToGroup`, `joinByInviteCode`, `acceptGroupInvite`, `declineGroupInvite`, `createGroupPost`, `deleteGroupPost`, `setGroupBook`, `clearGroupBook` (`services/api.js:227-263`) call `cacheClear`. Combined with `apiFetch`'s stale-while-revalidate GET cache (`services/api.js:8-42`, 60s TTL), `GroupsPage.jsx:189-198`'s pattern of `await mutate(); load();` **serves stale cached data synchronously** — e.g. accepting an invite and immediately calling `load()` can render the pre-accept group list, because `getMyGroups()` returns the cached response first and only refreshes the cache in the background with no re-render trigger. Failure scenario: curator approves a join request, member count on the Groups list doesn't update for up to a minute.
4. **"Add to Library" from a group's current book always loses the dedup key and page count.** `GET /groups/{id}` (`app/routers/groups_router.py:48-71`) returns `current_book` as `{id, title, author, cover_url}` only. `GroupDetailPage.jsx:978,995` passes this object straight into `BookPreviewModal`, whose `handleAdd` (`components/BookPreviewModal.jsx:52-67`) sends `google_books_id: book.google_books_id || book.google_id || null` and `total_pages: book.total_pages || null` to `POST /books/add-to-library`. Both are always `null` for a group-book preview. Per `dependency-map.md`, the Userbook contract's duplicate-detection keys on `google_books_id` — sending `null` risks creating a second/duplicate library entry for a book the user already owns under its Google Books ID, with no `total_pages` for page-based progress math afterward.
5. **Broadcast Push to every user has no confirmation, unlike deleting a single comment on the same page.** `AdminPage.jsx:61-75` (`handleBroadcast`) submits directly to `POST /admin/push/broadcast` with only the browser's native form validation (`required` inputs) — no `window.confirm` or modal — while the far lower-impact single-note/comment delete actions on the same page's Content tab (lines 124, 135) do use `window.confirm`. Failure scenario: an admin fat-fingers the broadcast form and instantly notifies the entire user base with no chance to back out.

### High

6. **Making a user an admin has no confirmation at all.** `AdminPage.jsx:77-84` (`handleMakeAdmin`) calls `POST /admin/set-admin/{user_id}` on a single click, with the failure path silently swallowed (empty `catch`). This grants full admin rights (broadcast push, delete any content, view all user data) with weaker guardrails than deleting one comment.
7. **Leaving a group has no confirmation and no double-submit guard**, while the curator's "Disband Group" (a comparable, arguably less personal, action) does have both. `GroupDetailPage.jsx:622-628,1153-1158` fires `DELETE /groups/{id}/leave` immediately on click.
8. **Deleting a group post has neither confirmation nor error handling.** `GroupDetailPage.jsx:643-646` (`handleDeletePost`) calls `deleteGroupPost` with no `try/catch` and no confirm dialog — a single misclick on the trash icon (`GroupDetailPage.jsx:128-133`) permanently deletes a post, and if the request fails, the rejection is unhandled with no user-visible error.
9. **Removing a group member has no confirmation.** `GroupDetailPage.jsx:612-620` — an others-affecting, curator-only action that kicks a real user out of a group with a single click.
10. **Per-notification read state is never persisted server-side.** `NotificationsPage.jsx:189-194` marks a clicked notification read only in local React state; no such single-item endpoint exists (confirmed against `dependency-map.md`, which lists only the bulk `POST /notifications/mark-read`). Reloading the page or the tab-focus refetch (`NotificationsPage.jsx:125-132`) shows the notification unread again.
11. **Invite link is hardcoded to production**, not derived from `window.location.origin`. `GroupDetailPage.jsx:673-679` (`copyInviteLink`) always copies `https://www.trackmyread.com/join/{code}` — testing or previewing on any other host (localhost, a Vercel preview URL) produces a copied link that points at production instead of the environment under test.
12. **Invite-link auto-join fires without a confirmation click.** `JoinGroupPage.jsx:15-32` calls `joinByInviteCode` inside a `useEffect` on mount — simply visiting `/join/:code` (e.g. a pre-fetched link preview, a crawler, or an accidental click) is sufficient to join a public group or send a join request to a private one's curator, with zero user confirmation on this page.

### Medium

13. **`markAllNotificationsRead` doesn't invalidate the unread-count cache.** `services/api.js:211-212` — `getUnreadCount()` (used for the Nav bell badge, per `dependency-map.md`) is GET-cached for 60s and not cleared here, so the badge can keep showing a stale non-zero count for up to a minute after "Mark all read".
14. **`uploadProfilePicture` bypasses the cache-invalidation helper entirely.** `services/api.js:86-97` is a raw `fetch` call, not routed through `apiFetch`/`invalidateProfile()`, unlike `updateMyProfile`. Any other cached `/profile` read within 60s of an avatar upload can show the old picture.
15. **`adminDeleteNote`/`adminDeleteComment` don't invalidate `/notes`.** `services/api.js:304-305` — a note an admin deletes can keep appearing in a still-open, cached community feed or profile view for up to 60s.
16. **`fixCoversBatch` doesn't invalidate `/userbooks`** despite mutating `book.cover_url` on userbook records — `services/api.js:287-290`.
17. **`loadLeaderboard` swallows errors silently** — `GroupDetailPage.jsx:557-565`, empty `catch {}`. A failed period switch leaves the previous period's data displayed with no error indicator.
18. **Onboarding's yearly-goal save failure is silently discarded.** `OnboardingPage.jsx:46-54`, comment literally says `/* non-fatal */` — the user proceeds believing their goal was saved; it wasn't, and nothing in Settings or Insights will show it.
19. **No modal in the app closes on Escape.** Checked `EditGroupModal`, `SetBookModal`, `NewPostModal`, the disband/delete-account confirmation dialogs, and `AvatarPickerModal` — all rely solely on a backdrop click or an explicit close button; no `keydown`/Escape handler exists anywhere in the scoped files (verified via grep — zero matches for `onKeyDown`/`Escape` across all ten interactive pages).
20. **`window.confirm` used instead of the app's own styled modal pattern** for admin note/comment deletion (`AdminPage.jsx:124,135`) — inconsistent with the rest of the app (SettingsPage delete-account, GroupDetailPage disband both use in-app modals), and the confirm text is hardcoded English (no i18n).
21. **Plain `<a href>` used for internal navigation in several places**, forcing full page reloads instead of client-side routing: `SettingsPage.jsx:685,847-849`, `LoginPage.jsx:246-256`. Elsewhere (BlogListPage, BlogPostPage, AboutPage's legal links) the app correctly uses react-router `Link`/`navigate`.
22. **Login errors use blocking `alert()`** (`LoginPage.jsx:48,121`) instead of the app's Toast component used everywhere else — inconsistent, unstyled, unlocalized.
23. **`sw-push.js` notification click always opens `/`, never a deep link.** `public/sw-push.js:18-28` hardcodes `urlToOpen = '/'` and ignores `event.notification.data` entirely, even though the push payload built by `dispatcher.py` carries event-specific data. Failure scenario: a user taps a "so-and-so liked your post" push and lands on the app root instead of the relevant profile/post/group.

### Low

24. **`cacheClear` is imported but never used** in `OnboardingPage.jsx:4` — dead import.
25. **`PrivacyPage.jsx` and `TermsPage.jsx` have no i18n** (no `useTranslation`/`t()` calls) while the rest of the app is translated into 6 languages (`i18n/index.js:14-21`).
26. **No client-side file-size/type validation** before several uploads: avatar (`SettingsPage.jsx:179-193`), group-post image (`GroupDetailPage.jsx:306-311`), Goodreads CSV (only filename/MIME sniffing at `SettingsPage.jsx:245-257` / `OnboardingPage.jsx:68-77`, no size cap shown in the UI — cross-check `app/routers/import_router.py` for a server-side cap).
27. **No debounce on the group-book search-as-you-type** — `GroupDetailPage.jsx:149-158` fires a full `/api/googlebooks/search` request on every keystroke past 2 characters.
28. **Hardcoded, non-translated "Load more" strings** — `GroupDetailPage.jsx:862,910`.
29. **`navigator.clipboard.writeText(...)` has no `.catch()`** — `GroupDetailPage.jsx:675-678`; a denied clipboard permission fails silently with no error toast.

## SEO route coverage (`generate-ssg.mjs` vs `App.jsx`)

Compared `book-tracker-frontend-stitch/scripts/generate-ssg.mjs`'s `ROUTES` array against `App.jsx:81-103`'s `<Routes>`. All public, unauthenticated routes are covered: `/`, `/about`, `/privacy`, `/terms`, `/blog`, and one entry per `POSTS` slug for `/blog/:slug`. All other `App.jsx` routes (`/home`, `/library`, `/groups`, `/settings`, `/admin`, `/join/:inviteCode`, etc.) are behind `PrivateRoute`/`AdminRoute` and correctly excluded from SSG — **no gap found here**. One item to verify manually (not code-inspectable): whether Vercel's `vercel.json` `{"handle":"filesystem"}` rule actually serves `dist/about/index.html` for a request to `/about` (directory-index resolution) rather than falling through to the SPA catch-all `dest: "/index.html"` — this determines whether crawlers actually see the SSG'd meta tags. Marked **unverified**.

`App.jsx:103`'s catch-all (`<Route path="*" element={<Navigate to="/" replace />} />`) redirects any unknown path to `/` rather than rendering a real 404 — combined with the SPA rewrite in `vercel.json`, an unknown URL likely returns HTTP 200 with a client-side redirect (a soft-404), which can be flagged by Search Console. Marked **unverified** (would need a live response-header check, which is out of scope for static analysis).

## i18n gaps

- `PrivacyPage.jsx` and `TermsPage.jsx` are entirely hardcoded English (finding #25 above).
- `AdminPage.jsx` is entirely hardcoded English throughout (tab labels, table headers, all button text, `window.confirm` strings) — consistent with it being an internal tool, but worth confirming that's intentional since every other authenticated page uses `t()`.
- Hardcoded "Load more" (`GroupDetailPage.jsx:862,910`) and "Import another file" (`SettingsPage.jsx:699`) strings amid otherwise-translated pages.

## Accessibility gaps

- No modal in scope traps focus or closes on Escape (finding #19).
- Icon-only buttons generally have a `title` attribute (e.g. "Remove member", "Decline", "Approve" in `GroupDetailPage.jsx`) but not all have `aria-label` — screen reader behavior depends on browser `title`-as-accessible-name fallback, which is inconsistent across browsers. Toggle switches in `SettingsPage.jsx` (privacy, notification prefs) do correctly set `aria-label`.
- `AdminPage.jsx`'s data table has proper `<th>` headers but the action column header is an empty string (`''` in the header array, line 265) — acceptable but worth a `<span class="sr-only">Actions</span>` for screen readers.

## Dependency-map refinement table

UI elements exercising endpoints, and cache-invalidation gaps, not captured in the curated section of `dependency-map.md`:

| UI element | api.js fn | Endpoint | Gap vs. dependency-map.md |
|---|---|---|---|
| Groups: join/leave/create/update/delete/approve/reject/remove/invite/post/setBook/clearBook (all of `GroupsPage.jsx`, `GroupDetailPage.jsx`, `CreateGroupPage.jsx`) | `joinGroup`, `leaveGroup`, `createGroup`, `updateGroup`, `deleteGroup`, `approveGroupMember`, `rejectGroupMember`, `removeGroupMember`, `inviteToGroup`, `createGroupPost`, `deleteGroupPost`, `setGroupBook`, `clearGroupBook`, `joinByInviteCode`, `acceptGroupInvite`, `declineGroupInvite` | 16 distinct `/groups/...` mutation endpoints | The curated "Web `src/services/api.js` cache" section only documents the rule for `/userbooks`, `/notes`, `/profile` — it should explicitly list `/groups` too, since **none** of these 16 functions call `cacheClear`, unlike every userbooks/notes/profile mutation |
| Notifications: Mark all read | `markAllNotificationsRead` | `POST /notifications/mark-read` | Not documented that this should `cacheClear('/notifications')` for the Nav unread-count badge |
| Settings: notification prefs toggle | `updateNotificationPrefs` | `PATCH /notifications/prefs` | Same gap — no cache rule documented or implemented for `/notifications/prefs` |
| Settings: avatar upload | `uploadProfilePicture` | `POST /profile/me/picture` | Raw `fetch`, bypasses the `apiFetch`/cache layer entirely — not flagged anywhere that this profile-mutating call skips `invalidateProfile()` |
| Admin: delete note/comment | `adminDeleteNote`, `adminDeleteComment` | `DELETE /admin/content/note/{id}`, `DELETE /admin/content/comment/{id}` | No cache rule for admin mutations touching `/notes`-derived data other users may have cached |
| Settings: Fix Missing Covers | `fixCoversBatch` | `POST /import/fix-covers-batch` | Mutates `book.cover_url` inside userbook records but isn't listed alongside the `/userbooks` cache-clear rule |
| Groups: current_book preview → Add to Library | `addToLibrary` (via `BookPreviewModal`) | `POST /books/add-to-library` | Not documented that `GET /groups/{id}`'s `current_book` shape (`id,title,author,cover_url`) is missing `google_books_id`/`total_pages` that the Userbook contract's dedup logic depends on — this is a real shape mismatch between two documented contracts (Group shape vs. Userbook shape) that dependency-map.md doesn't cross-reference |
| Notifications: click a single item | (none — client-only) | n/a | Confirms and documents a genuine missing endpoint: there is no `PATCH /notifications/{id}/read`; only bulk mark-read exists. Worth adding to dependency-map's "Client calls with NO backend route" section as a *missing feature*, not a wrong call |

## Not verified (would require a live/manual check, out of scope for static analysis)

- Whether Vercel actually serves the SSG'd `dist/<route>/index.html` files for clean URLs like `/about` (routing config `filesystem` + rewrite behavior).
- Whether `App.jsx`'s catch-all redirect produces an HTTP soft-404 in production.
- Whether `app/routers/import_router.py` enforces a server-side file-size/row-count cap on Goodreads CSV imports (referenced but not read — out of the assigned file list; flagged for a follow-up pass against `app/routers/`).
