# Web Action Inventory A — TrackMyRead

Scope: `App.jsx`, `main.jsx`, `context/AuthContext.jsx`, `components/{Nav,Toast,BookPreviewModal,AppTour}.jsx`, `pages/{HomePage,LibraryPage,BookDetailPage,SearchPage,ProfilePage,UserProfilePage}.jsx`.
Full inventory: `qa/inventory/web-a.json` (115 entries). This file: per-page summary, ranked code findings, and a dependency-map refinement.

`App.jsx`, `main.jsx`, and `context/AuthContext.jsx` contain no actionable UI elements themselves (routing table, bootstrap, and auth-state provider respectively) — their behavior surfaces through the pages/components that consume them and is covered there.

## Per-page summary

| File | Elements | none | self | others | destructive | external |
|---|---|---|---|---|---|---|
| components/Nav.jsx | 8 | 7 | 1 | 0 | 0 | 0 |
| components/Toast.jsx | 1 | 1 | 0 | 0 | 0 | 0 |
| components/BookPreviewModal.jsx | 5 | 3 | 1 | 0 | 0 | 1 |
| components/AppTour.jsx | 12 | 5 | 6 | 0 | 0 | 1 |
| pages/HomePage.jsx | 26 | 20 | 2 | 2 | 2 | 0 |
| pages/LibraryPage.jsx | 13 | 9 | 1 | 0 | 0 | 3 |
| pages/BookDetailPage.jsx | 12 | 5 | 4 | 0 | 2 | 1 |
| pages/SearchPage.jsx | 9 | 4 | 1 | 0 | 0 | 4 |
| pages/ProfilePage.jsx | 21 | 15 | 5 | 0 | 1 | 0 |
| pages/UserProfilePage.jsx | 8 | 4 | 0 | 2 | 1 | 1 |
| **Total** | **115** | **73** | **21** | **4** | **6** | **11** |

One `LibraryPage.jsx` entry (`web.library.detailpanel.dead_code`) is dead code — a fully-built ~300-line `BookDetailPanel` component that is never rendered — counted above but not reachable by any test.

## Code findings, ranked by severity

### High — user-facing correctness bugs

1. **Format filter on Search always empties or over-includes results.** `src/pages/SearchPage.jsx:255-265`. The Google Books response (`app/routers/googlebooks_router.py` `GoogleBookResult`) never returns a `binding`/`format` field, so `filterByFormat`'s `(b.binding || b.format || '').toLowerCase()` is always `''`. Every filter except "All" and "Paperback" (which matches on `!binding`, i.e. everything) returns zero results. Clicking Ebook/Audiobook/Hardcover on the Google tab always empties the list.
2. **Wrong toast text after changing a book's status.** `src/pages/BookDetailPage.jsx:165` (and the same bug in dead code at `src/pages/LibraryPage.jsx:347`). `STATUS_BADGE[newStatus]?.label` reads a `.label` property, but `STATUS_BADGE` entries only define `labelKey` (`BookDetailPage.jsx:26-30`). The lookup is always `undefined`, so the toast falls back to the raw status string (e.g. "Moved to reading") instead of a translated label ("Moved to Reading").
3. **Comment/like counts go stale on the feed after admin or own actions, for up to 60s.** `src/pages/HomePage.jsx:79-89,116-129` update local `comments` arrays but never touch the parent post's `comments_count`; `src/services/api.js` `likeNote`, `unlikeNote`, `addComment`, and `adminDeleteComment`/`adminDeleteNote` call no `cacheClear()` at all (contrast `createNote`/`updateNote`/`deleteNote`, which call `invalidateFeed()`). A user who likes/comments/admin-deletes and then switches feed tabs or reloads within 60s can see counts that don't match what they just did.
4. **~300 lines of dead, buggy code shadow the live book-detail flow.** `src/pages/LibraryPage.jsx:306-604` defines `BookDetailPanel` (status change, progress, rating, notes CRUD, remove-from-library) but it is never imported or rendered anywhere (`grep -n "<BookDetailPanel" — no matches`). The real flow is `BookDetailPage.jsx`, reached via `LibraryPage.jsx:913`'s navigate. This dead code already contains its own copy of finding #2 above and will keep drifting from the live implementation unnoticed.

### Medium — missing error handling / silent failures

5. **Onboarding tour swallows every save/upload error.** `src/components/AppTour.jsx:60-69` (avatar upload), `:71-82` (avatar save), `:155` (goal save), `:251-266` (add book) all use bare `catch { /* ignore */ }` / `/* non-fatal */`. A failed `PUT /profile/me` or `POST /books/add-to-library` during onboarding advances the tour and shows a "done" checklist as if the step succeeded, with zero indication to a brand-new user that their goal/avatar/book never saved.
6. **`HomePage` like/unlike has no in-flight guard, no toast, and no rollback**, unlike the equivalent action on `UserProfilePage`. `src/pages/HomePage.jsx:726-739` reads stale `post.liked_by_me` on every click with no debounce/lock, and `catch { }` (line 738) means a failed like/unlike gives the user zero feedback. Compare the reference implementation at `src/pages/UserProfilePage.jsx:228,269-285`, which uses a `likingInFlight` ref `Set` and rolls back optimistic state on failure (though even that path has no toast on failure — see finding 11).
7. **Direct-URL book detail load is silent on any failure.** `src/pages/BookDetailPage.jsx:109-122`. Any error (network, 401, not-found) during `getUserbook(userbookId)` redirects to `/library` with no toast — a genuine outage looks identical to "this book doesn't exist."
8. **Google Books search failures are indistinguishable from zero results** across three call sites: `src/pages/SearchPage.jsx:220-222` (main search), `src/pages/LibraryPage.jsx:171` (Add Book modal), `src/components/AppTour.jsx:234-242` (onboarding book step). All three catch and clear results with no error UI, hiding real backend errors (e.g. the `502` `googlebooks_router.py` raises on a non-200 from Google) as "no books found."
9. **`getRecommendations()` and `getComments()` failures render as empty states.** `src/pages/HomePage.jsx:543` and `:104-114` — same pattern as above, one level less severe since these are secondary content, not a primary search action.

### Medium — cache invalidation gaps (not yet documented in `dependency-map.md`)

10. **`likeNote`/`unlikeNote`/`addComment` never invalidate the `/notes` cache** (`src/services/api.js:180-186`), so a 60s-old feed page can show pre-like/pre-comment counts after navigating back to it. This compounds finding #3.
11. **`followUser`/`unfollowUser` never invalidate the `/profile` cache** (`src/services/api.js:189-192`). `GET /profile/{user_id}` is cached for 60s; revisiting the same profile shortly after following/unfollowing (e.g. via back button) can show a stale `is_following`/`followers_count`.
12. **`adminDeleteNote`/`adminDeleteComment` never invalidate any cache** (`src/services/api.js:304-305`), compounding finding #3 for admin moderation actions specifically.
13. **`uploadProfilePicture` never invalidates `/profile`** (`src/services/api.js:86-97`) — the current page patches local state manually so it isn't user-visible on the same page, but any other consumer reading `/profile/me` within 60s (including `AuthContext`'s own re-fetch on a hard refresh racing the cache) would see the stale picture.

### Low — accessibility gaps

14. **Icon-only buttons with no `aria-label`** across the codebase: `Nav.jsx` avatar toggle (`:95-112`), mobile menu button (`:146-151`); `BookPreviewModal.jsx` close button (`:86-88`); `HomePage.jsx` post overflow menu (`:180-185`), remove-image button (`:420-425`); `LibraryPage.jsx` Add Book modal close (`:217-219`); `ProfilePage.jsx` New Note modal close (`:162-164`), note card overflow menu (`:350-356`). Several rely only on a `title` attribute (acceptable but weaker than `aria-label`), e.g. `ProfilePage.jsx:540-555`, `UserProfilePage.jsx:141-156`.
15. **A clickable, keyboard-unreachable `<div>` for toast dismissal.** `src/components/Toast.jsx:31-41` — `onClick` on a plain `<div>` with no `role="button"`, no `tabIndex`, no `onKeyDown`. Toasts also aren't `aria-live`, so screen-reader users never hear success/error toasts anywhere in the app.
16. **No click-outside-to-close on two of three dropdown/menu implementations.** `Nav.jsx` avatar dropdown (`:94-143`) and `HomePage.jsx` post overflow menu (`:178-207`) have no outside-click listener; only `ProfilePage.jsx` NoteCard menu (`:316-320`) implements one correctly (`mousedown` + ref). Recommend unifying on that pattern.
17. **No Escape-key handling on any modal in scope** — `BookPreviewModal.jsx`, `LibraryPage.jsx`'s Add Book modal, `ProfilePage.jsx`'s New Note / Edit Profile modals all close only via an explicit X button or backdrop click.
18. **Duplicate nav-link DOM nodes break simple role+name Playwright locators.** `Nav.jsx:53-73` (desktop, `hidden md:flex`) and `:158-178` (mobile dropdown, `hidden md:hidden`) render the same link text twice regardless of viewport (only CSS visibility differs). `page.getByRole('link', {name: 'Feed'})` will match 2 elements and fail Playwright's strict mode; tests need `.first()`/visibility scoping or the app needs distinguishing `data-testid`s.

### Low — other

19. **Duplicate, timezone-based Amazon affiliate URL logic**, copy-pasted three times: `BookPreviewModal.jsx:9-17`, `BookDetailPage.jsx:71-81`, and inside the dead `LibraryPage.jsx:9-17` (`BookDetailPanel` scope references the same pattern from its own file top). All three infer India vs. US purely from `Intl.DateTimeFormat().resolvedOptions().timeZone`, so a traveler/VPN user gets the wrong affiliate tag — silent revenue misattribution, not a crash.
20. **`getUserbook()` in `api.js` fetches the entire library to find one book.** `src/services/api.js:127-133` calls `GET /userbooks/` (all books) and does a client `.find()`, instead of the existing, zero-consumer `GET /userbooks/{userbook_id}` endpoint (confirmed in `dependency-map.md` and `app/routers/userbooks_router.py:313`). Used on every hard-refresh/direct-link visit to `/library/book/:id`.
21. **Dead import**: `addToLibrary` imported in `src/pages/HomePage.jsx:11` but never referenced anywhere in the file.
22. **`ProfilePage`'s New Note composer omits `is_public` entirely** (`src/pages/ProfilePage.jsx:147`), relying implicitly on the backend default (`NoteCreateSchema.is_public: Optional[bool] = True`, `app/routers/notes_router.py:38`) rather than passing it explicitly like `HomePage.jsx:386` and `BookDetailPage.jsx:218` do. A future change to that default would silently start creating private notes from this one call site with no client change to flag it.
23. **`SearchPage`'s "Add" button has no already-in-library check**, unlike `BookPreviewModal` (which pre-fetches `getMyBooks()`). `src/pages/SearchPage.jsx:61-84` — adding a book the user already owns is not prevented client-side (server-side duplicate handling not verified in this audit's scope; response-shape assumption to confirm against `books_router.py`'s add-to-library handler).

## Dependency refinement — not yet in `dependency-map.md`

| UI element | api fn | Endpoint | Why it matters |
|---|---|---|---|
| Like/unlike a post or public note (`HomePage.jsx`, `UserProfilePage.jsx`) | `likeNote` / `unlikeNote` | `POST`/`DELETE /notes/{id}/like` | Neither invalidates the `/notes` cache — affects every screen that later reads `GET /notes/feed`, `/friends-feed`, `/me`, `/user/{id}` within 60s. Not called out under the Note card shape contract in `dependency-map.md`. |
| Add/read a comment (`HomePage.jsx`) | `addComment` / `getComments` | `POST`/`GET /notes/{id}/comments` | `addComment` doesn't invalidate `/notes`, and neither the like nor comment path updates the in-memory `post.comments_count`/`likes_count` already held by `HomePage`'s `posts` state — a purely client-side staleness bug layered on top of the cache gap. |
| Admin delete note/comment (`HomePage.jsx`, `UserProfilePage.jsx`) | `adminDeleteNote` / `adminDeleteComment` | `DELETE /admin/content/{note,comment}/{id}` | No cache invalidation at all, unlike the self-service `deleteNote`. Worth adding to the "Note card shape" contract section since it's a second write path into the same cached resource. |
| Follow/unfollow (`UserProfilePage.jsx`) | `followUser` / `unfollowUser` | `POST`/`DELETE /follow/{id}` | No `/profile` cache invalidation — affects `GET /profile/{user_id}` re-reads. `dependency-map.md`'s `GET /profile/me` contract section covers the stats shape but not this staleness path for `GET /profile/{id}`. |
| Upload profile picture (`ProfilePage.jsx`, `AppTour.jsx`) | `uploadProfilePicture` | `POST /profile/me/picture` | No `/profile` cache invalidation; both call sites patch local state manually as a workaround, masking the underlying gap for any other consumer. |
| Direct book-detail load (`BookDetailPage.jsx`) | `getUserbook` | `GET /userbooks/` (all, client-filtered) | Not listed as a consumer of `GET /userbooks/{userbook_id}` in `dependency-map.md` because it doesn't call that endpoint at all — it re-fetches the full collection instead. Worth flagging in the map's "Fan-out" section since it's an extra, avoidable full-collection read on every refresh of a book-detail deep link. |
| Format filter chips (`SearchPage.jsx`) | `searchGoogleBooks` (client-side post-filter only) | `GET /api/googlebooks/search` | Not a network dependency, but the map's Google Books contract section doesn't note that the response has no `binding`/`format` field — worth adding so nobody re-introduces this client filter assuming the field exists. |

## Notes on scope decisions

- `App.jsx`, `main.jsx`, `context/AuthContext.jsx` contribute no direct rows (no actionable elements of their own).
- `src/pages/LibraryPage.jsx`'s `BookDetailPanel` (lines 306-604) is included as a single dead-code row rather than exploded into ~15 individual unreachable actions, since it is never mounted and cannot be exercised by Playwright through any route.
- Nothing in the audited files uses `dangerouslySetInnerHTML` or constructs URLs from unsanitized user input in a way that reaches `href`/`src` unescaped (confirmed via grep across all 13 files) — no injection-class findings to report.
- Everything not explicitly confirmed against backend code in this pass (e.g. server-side duplicate-add handling for `add-to-library`, exact page-number clamping in `PUT /userbooks/{id}/progress`) is marked "unverified" in the relevant `code_findings` entries rather than asserted.
