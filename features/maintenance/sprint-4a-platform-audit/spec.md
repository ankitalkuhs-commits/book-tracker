---
screen: sprint-4a-platform-audit
feature: maintenance
repo: api + web (no Android code; Android 2.2.2 / versionCode 61 is Sprint 4B)
status: in-progress
last_verified: 2026-09-13
approved_by: PM — full-platform audit request 2026-09-13; decision-free subset of triage
extended_by: PM decisions 2026-09-13 (F-01, F-16, F-17 and F-21 approved; F-29 modified); live adversarial probes 2026-09-13 (F-49..F-56); live interaction and web scenario runs (F-57, F-58, F-59, F-07 web precise); 4B contract request (F-23)
source: qa/reports/triage-2026-09-13.md (verified at 8c44198, plus the merged live sections), qa/reports/a11y-2026-09-13.md, qa/reports/api-perf-2026-09-13.md
---

## What It Does
Fixes the verified findings from the 2026-09-13 full-platform audit that can ship without an app-store release.

**Privacy and security:**
- Strangers can no longer like or comment on private notes by id.
- Push notifications stop following a shared device to the next account.
- The unused password signup and login routes are removed.
- Anonymous Google Books searches are capped.
- API responses carry security headers, and server errors reach the browser.

**Broken actions:**
- Notification settings save again.
- Books with reading history can be removed.
- A yearly goal can be cleared.
- Double taps can no longer create duplicate library entries, likes or follows.
- A single notification can be marked read.

**Correctness and speed:**
- Adding a book from a feed card, recommendation, circle or the Library modal reuses the existing book.
- Shipped Android builds read the right Insights and circle-goal numbers.
- The Home feed loads in about 1–2 s instead of 9 s.
- Actions no longer wait for push delivery.
- Google's "image not available" placeholder is no longer stored as a cover.
- New notes are private unless the author picks Public.
- A data-repair script restores books wrongly reset to Want to Read.

**Web experience:**
- Lists refresh right after an action.
- Notification taps open the right page.
- Onboarding stops hiding failed saves.
- Destructive circle and admin actions ask first.
- Text meets contrast requirements, with a 12 px minimum size.
- The dead format filter is gone.
- Back on About, Privacy and Terms never shows a blank page.

## Appetite
Max complexity: complex (1–2 weeks across five parallel work packages).

Not building (awaiting a PM decision or explicitly out of scope):
- F-09: hide review accounts from public surfaces (not approved).
- Production cleanup of stored Google placeholder covers (not approved). The F-19 code change ships.
- F-28: Render ↔ Supabase region move (ops, PM).
- Any Android code. Android changes are Sprint 4B; this sprint defines the contracts 4B consumes.
- A logged-out landing-page search box or login prompt (PM: not approved, 2026-09-13). F-29 ships only the API quota and the `login_required` code in `api.js`.
- F-30 comment delete, F-35..F-48, and `/books/recommendations` batching (Later).
- Fixture-leftover SQL from the adversarial run (a PM action, listed in the triage).

## Requirements
Each item names the triage id, the verified defect, and the acceptance criterion.

### Privacy and security
- [ ] **R-F02 Visibility on likes and comments.**
  - **Defect:** `like_note` and `create_comment` only check that the note exists, and `get_comments` ignores `is_public`. Strangers can like or comment on private notes and on private profiles' notes, and the author is notified (confirmed live: 201).
  - **Accept:**
    - Another user's `is_public=false` note returns 404 on like, comment and comment list.
    - A note by a private-profile author the caller doesn't follow returns 403.
    - A refused comment writes no `NotificationLog`.
    - The owner and followers still succeed.
- [ ] **R-F03-api One owner per push token.**
  - **Defect:** `POST /push-tokens/` and `POST /notifications/web-subscribe` key on `user_id` only, so one device token or browser endpoint can live on two accounts.
  - **Accept:**
    - Registering a token or endpoint already owned by another user moves it to the caller.
    - The caller's other browsers keep their subscriptions.
    - `DELETE /notifications/web-unsubscribe` removes only the caller's row for that endpoint.
- [ ] **R-F03-web + F-27 Web subscribe and unsubscribe.**
  - **Defect:** web registers only when the browser has no subscription, so user B is never registered on a shared browser. Logout never unsubscribes, and the permission prompt fires on login without explanation.
  - **Accept:**
    - When `Notification.permission === 'granted'`, every login and load re-registers the subscription for the current user.
    - When permission is `default`, there is no prompt and no request; only the Notifications banner asks.
    - Logout sends `DELETE /notifications/web-unsubscribe` with the pre-logout token.
- [ ] **R-F01 Legacy password routes removed.**
  - **Defect:** `POST /auth/signup` and `POST /auth/login` let anyone pre-register a victim's email, which `/auth/google` later logs into.
  - **Accept:**
    - Both routes return 404, and their models and tests are gone.
    - `/auth/google`, `/auth/review-login` and both delete-account routes are unchanged.
    - No client references remain.
- [ ] **R-F29 Anonymous Google Books quota** (PM-modified).
  - **Defect:** `/api/googlebooks/*` is unauthenticated with no limit.
  - **Accept:**
    - A caller without a valid Bearer token gets 2 calls per rolling 24 h, shared across `/search` and `/book/{id}`.
    - The 3rd call returns `401 {"detail": {"code": "login_required", "message": "Log in to keep searching"}}`.
    - Authenticated callers are unlimited.
    - Callers are keyed by a salted SHA-256 hash of the IP, held in memory only. The raw IP is never stored or logged.
    - The IP is the **right-most** `X-Forwarded-For` entry (appended by Render's proxy), falling back to `request.client.host` (resolved, orchestrator default 2026-09-13).
    - A caller sending a forged left-most `X-Forwarded-For` value is still counted against their real, right-most IP.
    - Web `apiFetch` exposes `error.code === 'login_required'` without redirecting a logged-out visitor.
- [ ] **R-F56 Security headers.**
  - **Defect:** API responses have no HSTS, X-Frame-Options, X-Content-Type-Options or Referrer-Policy.
  - **Accept:**
    - Every HTTP response carries `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY` and `Strict-Transport-Security: max-age=31536000; includeSubDomains`. This includes errors and CORS preflights.
    - Preflight from `https://www.trackmyread.com` still gets CORS allow headers.
- [ ] **R-F58 CORS headers on server errors.**
  - **Defect:** unhandled exceptions become 500s in Starlette's `ServerErrorMiddleware`, outside `CORSMiddleware`. The 500 has no `Access-Control-Allow-Origin`, so browsers report `net::ERR_FAILED` and clients cannot read the error.
  - **Accept:**
    - A forced exception returns 500 `{"detail": "Internal Server Error"}` with `access-control-allow-origin` for an allowed Origin, plus the security headers.
    - No stack trace or exception text is in the body.
    - The exception is logged server-side, with method and path but no query string.

### Broken actions
- [ ] **R-F49 + F-06 Notification preferences save and merge.**
  - **Defect:** `PATCH /notifications/prefs` returns 500 in production for every body, because `prefs.model_dump()` is Pydantic v2 and the stack is Pydantic 1.10 / FastAPI 0.95. It also replaced the stored dict, so partial bodies reset other keys. No test covered the route.
  - **Accept:**
    - Full, partial and extra-key bodies return 200.
    - Omitted keys are unchanged; extra keys are ignored.
    - A non-boolean value returns 422.
    - `book_added` mirrors `book_completed`.
    - The response is the 7-key dict as today.
- [ ] **R-F50 Deleting a book with history works.**
  - **Defect:** `DELETE /userbooks/{id}` returns 500 once `reading_activity` rows exist (a foreign-key violation), so any book ever progressed is undeletable.
  - **Accept:**
    - Progress then delete returns 200.
    - No `reading_activity` row references the deleted userbook, and `group_post.userbook_id` references are nulled.
    - Notes behave as today: kept and detached.
    - Group delete and account delete also leave nothing that violates a foreign key: group activity, pending invites sent by the deleted user, and group posts pointing at deleted userbooks.
- [ ] **R-F18 A yearly goal can be cleared.**
  - **Defect:** `PUT /profile/me` ignores `yearly_goal: null`.
  - **Accept:**
    - `{"yearly_goal": null}` or `0` stores NULL.
    - A body without the key keeps the goal.
    - Insights then returns `yearly_goal: null`.
- [ ] **R-F53 No duplicates from races.**
  - **Defect:** concurrent requests create duplicate userbooks, likes and follows (no unique constraints).
  - **Accept:**
    - The PM runs a migration with rollback, in three steps:
      1. A read-only count.
      2. A dedupe. The kept (oldest) userbook absorbs its duplicates' maximum `current_page`, most advanced status (`finished` > `reading` > `to-read`) and a non-null rating (resolved, orchestrator default 2026-09-13). Dependents (`note.userbook_id`, `reading_activity.userbook_id`) are repointed to the kept row before duplicates are deleted.
      3. Unique indexes `userbook(user_id, book_id)`, `like(note_id, user_id)` and `follow(follower_id, followed_id)`.
    - `models.py` declares the same constraints, so SQLite tests enforce them.
    - A losing duplicate insert returns the existing contract instead of 500: 400 "already in your library", "Already liked", or 400 "Already following".
- [ ] **R-F55 Bad uploads return 400.**
  - **Defect:** an empty file, text renamed `.png`, or a script SVG returns 500 when Cloudinary rejects it.
  - **Accept:**
    - An empty file or a Cloudinary `BadRequest` returns 400 on `POST /notes/upload-image` and `POST /profile/me/picture`.
    - Configuration or network failures still return 500.
- [ ] **R-F23 Mark one notification read.**
  - **Defect:** tapping a notification only updates local state, and there is no per-row endpoint.
  - **Accept:**
    - `POST /notifications/{id}/read` returns `200 {"id": <id>, "is_read": true}` for the owner and is idempotent.
    - Another user's id, or an unknown id, returns 404.
    - The unread count drops by one.
    - Web NotificationsPage calls it when an unread row is clicked.

### Correctness, contracts and speed
- [ ] **R-F07 + F-33 Book objects carry dedup keys.**
  - **Defect:** book objects from recommendations, friends currently-reading, note cards and circle `current_book` lack `google_books_id` / `isbn` / `total_pages`. Web Library "Add Book" (`LibraryPage.jsx:192-202`) omits `google_books_id`. Adding creates duplicate Book and library rows. Friends-reading `user` lacks `profile_picture`.
  - **Accept:**
    - These book objects include `google_books_id`, `isbn` and `total_pages`: the four note-card endpoints, `/books/recommendations`, friends-reading `.book`, and `current_book` in `GET/POST/PUT /groups/{id}` and `PUT /groups/{id}/book`.
    - Friends-reading `user` includes `profile_picture`.
    - `POST /books/add-to-library` accepts optional `book_id` and matches it first, then `google_books_id`, then `isbn`.
    - Web `BookPreviewModal` sends `book_id` and `isbn`; web `LibraryPage` sends `google_books_id`.
    - Re-adding an owned book from any of these surfaces returns 400 with no new Book row.
    - No key is removed or renamed.
- [ ] **R-F08 Note lists do not N+1.**
  - **Defect:** every note serializer lazy-loads user, userbook and book per note. 50 notes cost 114 queries, and `/notes/feed` p50 is 9.2 s.
  - **Accept:**
    - `/notes/feed`, `/friends-feed`, `/me`, `/user/{id}` and `/userbook/{id}` use a query count that does not grow with note count (pytest).
    - Outputs are identical apart from R-F07's added keys.
    - Production `/notes/feed` p50 is under 2 s on re-measure.
- [ ] **R-F59 Actions don't wait for push delivery.**
  - **Defect:** every mutation takes 1.5–5 s in production, partly because `fire_event` (Expo and web-push HTTP calls plus NotificationLog writes) and group-activity fan-out run inside the request.
  - **Accept:**
    - In-request `fire_event`, `fire_group_activity` and `fire_group_activity_for_user` calls run after the response via FastAPI `BackgroundTasks`.
    - NotificationLog and group-activity rows are still written; every existing notification test stays green.
    - Re-running the web scenario timings shows like, comment, follow, add-to-library and status→finished faster by the round trips the architecture lists.
- [ ] **R-F13 + F-14 Insights aliases for shipped Android.**
  - **Defect:** Android 2.2.1 reads `yearly_goal.finished`, `average_rating`, `books_this_year` and `projected_finish_date`, which the API never returns.
  - **Accept:** `GET /reading-activity/insights` also returns `yearly_goal.finished` (= `completed`), `average_rating` (= `avg_rating`), `books_this_year` (= `finished_this_year`) and `projected_finishes[].projected_finish_date` (= `projected_finish`). All existing keys stay.
- [ ] **R-F15 Circle goal on shipped Android.**
  - **Defect:** Android sends `reading_goal`, which create ignores. It reads `reading_goal` / `pages_read_total`, which the group endpoint never returns.
  - **Accept:**
    - `POST /groups/` stores `reading_goal` as `goal_pages` when `goal_pages` is absent.
    - `GET /groups/{id}` adds `reading_goal` (= `goal_pages`) and `pages_read_total` (= `/goal` `pages_read`, or 0 without a goal).
    - `GET /groups/{id}/goal` is unchanged.
- [ ] **R-F19 No placeholder covers.**
  - **Defect:** search builds a front-cover URL even when Google has no image, so the placeholder PNG is shown and stored.
  - **Accept:**
    - A volume without `imageLinks` returns `cover_url: null` from `/api/googlebooks/search` and `/book/{id}`.
    - The web fallback cover shows.
    - Stored rows are not touched.
- [ ] **R-F17 Notes private by default.**
  - **Defect:** a note created without `is_public` is published to the community feed. Android 2.2.1 book-detail notes and web Profile notes omit the field.
  - **Accept:**
    - `POST /notes/` without `is_public` creates a private note.
    - `PUT /notes/{id}` without `is_public` keeps visibility.
    - Web Home, Book detail and Profile composers show a Public / Only me switch and always send `is_public`.
    - The switch remembers the last choice in `localStorage.bt_note_visibility`, written on change and shared by all three composers. A user who has never chosen sees Only me, and clearing storage returns to Only me.
    - After a private post from the Home composer, a toast reads "Saved privately — find it on your Profile" (a new key in all 6 locales), and the post is not inserted into the Community or Friends list.
    - Private notes stay owner-only everywhere.
    - Logout removes the key, so the next account on a shared browser starts at Only me. (Added 2026-09-17 accepting tests.md K-16 / Sprint 4B escalation E2: without it, one account's Public choice becomes the next account's default. Android mirrors it in AsyncStorage in 4B.)
- [ ] **R-F51 Bounded list parameters.**
  - **Defect:** unbounded `limit`; a negative value returns 500, and 100000 is uncapped.
  - **Accept:** every `limit` and `days` query parameter is 1..200, and out-of-range values return 422. Endpoints:
    - note lists
    - notification history
    - recommendations and book search
    - friends-reading
    - group activity
    - reading-activity daily (`days`)
    - admin lists
- [ ] **R-F52 Validated userbook PATCH.**
  - **Defect:** `PATCH /userbooks/{id}` takes any dict, storing rating −1/6/99, `status="banana"` and `current_page=-5`, and returning 500 on `rating="abc"`.
  - **Accept:**
    - `status` in `to-read|reading|finished`.
    - `rating` an integer 0–5 or null, where 0 or null clears.
    - `current_page` ≥ 0 or null.
    - `total_pages` ≥ 1.
    - `format` in `hardcover|paperback|ebook|kindle|pdf|audiobook`.
    - `ownership_status` in `owned|borrowed|loaned`.
    - Extra keys are ignored; anything else returns 422.
    - The response shape is unchanged, and every web and Android caller still succeeds.
- [ ] **R-F54 Deep Google pagination.**
  - **Defect:** `start_index=999999` returns 500.
  - **Accept:**
    - `start_index` ≥ 1000 returns 200 with empty results and `has_more: false`, without calling Google.
    - A Google failure returns 502, not 500.
- [ ] **R-F16 Rating-reset repair script.**
  - **Defect:** before 2026-05-04, Android rating called `PUT /progress` with `{rating}`. No rating was saved, and the book reset to `to-read`, page 0.
  - **Accept:**
    - `context/repairs/2026-09-rating-reset-repair.sql` has separately runnable parts: (a) read-only count and preview, (b) backup table `userbook_repair_backup_20260913`, (c) transactional restore plus rollback.
    - Candidates need a recorded finish (`notificationlog` `book_completed` or `group_activity` `book_finished`) from before the reset, and no later re-reading.
    - Nothing runs automatically. The PM runs (a) first and reports.

### Web experience
- [ ] **R-F20 Cache invalidation after every mutation.**
  - **Defect:** the 16 group mutations, like/unlike/comment, follow/unfollow, mark-all-read, avatar upload, cover fix and admin deletes never clear the 60 s GET cache.
  - **Accept:**
    - Every mutating `api.js` function clears its prefixes after success.
    - Accepting an invite shows the circle in Groups immediately.
    - Mark all read shows badge 0.
    - Editing a circle description shows the change immediately.
- [ ] **R-F22 Notification deep links.**
  - **Defect:** `group_join_approved`, `group_join_rejected` and `admin_broadcast` go nowhere, and a web push click always opens `/`.
  - **Accept:** inbox click and push click open:

    | Event | Opens |
    |---|---|
    | approved | `/groups/{group_id}` |
    | rejected | `/groups` |
    | admin broadcast | `/notifications` (inbox click does nothing) |
    | other events | the inbox mapping |

    - The push click focuses and navigates an open tab, or opens one.
- [ ] **R-F24 Onboarding save failures surface.**
  - **Defect:** failed avatar, goal and first-book saves in AppTour and OnboardingPage are swallowed, and the step shows as done.
  - **Accept:**
    - A failure shows an error toast.
    - The step stays open.
    - Skip still works.
- [ ] **R-F25 + F-26 Confirm destructive actions.**
  - **Defect:** leave circle, remove member and delete group post run on one click. Delete post also has no error handling. Admin broadcast and make-admin run on one click, and make-admin fails silently.
  - **Accept:**
    - All five actions confirm, and Cancel sends nothing.
    - A delete-post failure shows a toast.
    - The broadcast confirm shows title, body and recipient count.
    - Make-admin shows a success or error toast and sends the required `is_admin=true` query, so the button works for the first time. It stays restricted to the server-side admin email allowlist (resolved, orchestrator default 2026-09-13; flagged for the PM).
- [ ] **R-F10 Contrast and text size.**
  - **Defect:** 203 axe `color-contrast` nodes on 12 of 16 pages. The causes are alpha-faded text colours and 74 text sizes of 7–11 px.
  - **Accept:**
    - All resting text colours are ≥ 4.5:1 on `#ffffff`, `#fbf9f4`, `#f5f3ee` and `#f0eee9`, using two new solid tokens with three visible tiers.
    - The tokens are `#586060` and `#636a6a`: ship, subject to contrast verification by `qa/a11y_audit.mjs` after deploy (resolved, orchestrator default 2026-09-13).
    - No text is under 12 px.
    - `qa/a11y_audit.mjs` shows 0 `color-contrast` nodes on the 16 pages.
- [ ] **R-F21 Format chips removed.**
  - **Defect:** Google-tab format chips filter on fields the API never returns.
  - **Accept:** SearchPage has no format chips, and Google results are unfiltered.
- [ ] **R-F57 Safe Back on public pages.**
  - **Defect:** About, Privacy and Terms call `navigate(-1)`, so a directly opened page leaves the site or goes blank.
  - **Accept:**
    - With no in-app history, Back goes to `/`; otherwise it goes to the previous page.
    - One shared helper serves all three pages.
- [ ] **R-F60 A post made while the feed loads stays visible.**
  - **Defect:** `HomePage.fetchFeed` replaces the list with `setPosts(data)`. A post made during the slow first load is prepended and then wiped by the stale response. A quick Community → Friends switch can also show the wrong tab's posts when the slower response lands last.
  - **Accept:**
    - A response from an older request, or for a tab no longer active, is ignored.
    - When a fetch resolves, locally created public posts missing from the response are merged in by id, not dropped.
    - A deleted local post is not resurrected.
    - Private posts are never inserted (R-F17).
    - `qa/scenarios_web.mjs` S1, which posts right after page load and waits 20 s for the card, passes.

### Cross-cutting
- [ ] `pytest tests -q` passes, with the new tests listed in the architecture.
- [ ] `npm run build` passes.
- [ ] `dependency-map.md` curated section is updated.
- [ ] Every response-shape change is additive. Request tightenings (F-51, F-52, F-29) and the F-17 default change are listed with their consumers.
- [ ] Architecture defines the "Contracts for 4B" (F-07, F-15, F-23, F-03).

## Screen States
| State | Trigger | What User Sees |
|---|---|---|
| confirm | Leave / Remove member / Delete post (circle) | In-app modal matching Disband, with Cancel and a red confirm button |
| confirm | Send Broadcast / Make Admin (admin) | Browser confirm with title, body and recipient count, or the user's name |
| error | A circle or admin mutation fails | Error toast; list unchanged |
| error | Onboarding save fails | Error toast; step stays open |
| error | Any 5xx from the API | The client's normal error toast (readable now that CORS headers are present) instead of a silent network failure |
| composer | Home / Book detail / Profile new note | Public / Only me switch showing the last choice (Only me if never chosen); the value is sent and remembered |
| private post | Home composer posts with Only me | Toast "Saved privately — find it on your Profile"; nothing is added to the Community or Friends list |
| feed loading | User posts before the first feed load finishes | The new public post stays at the top after the feed arrives |
| login_required | Anonymous 3rd Google call (API) | No web UI (landing search not approved). `api.js` throws `code: 'login_required'` |
| back | Back on About / Privacy / Terms | Previous in-app page, or `/` when opened directly |
| default | Everything else | Same layout; darker secondary text; small labels at 12 px; actions return faster |

## Done Checklist (PM verifies after deploy)
1. **Before the backend deploy:** run F-53 STEP 1 in Supabase and note the counts, then STEP 2, then STEP 3. The final SELECT lists three `uq_` indexes.
2. `curl -X POST <api>/auth/login` returns 404. `curl -I <api>/version` shows `x-frame-options: DENY` and `strict-transport-security`.
3. Web Settings: toggle one notification off and reload. It stays off, and the others are unchanged.
4. Remove a book you have logged pages on. It stays gone after reload.
5. Settings: empty the yearly goal and save. Insights shows no goal card.
6. Home feed first load is under 2 s (warm backend). Liking a post returns noticeably faster than before.
7. Home: post a note with "Only me". The "Saved privately" toast shows, and the note is absent from the Community tab in a logged-out window. After a reload, the switch still shows Only me.
8. Circle page: Leave → Cancel; you are still a member. The admin broadcast confirm shows the recipient count.
9. Open `/privacy` directly in a new tab and click Back. You land on `/`.
10. Run F-16 part (a) only, and send the Architect the count plus the preview before running (b)/(c).

## Parity
- [x] **api:** every R-F item with an api part.
- [x] **web:** F-03 web, F-07 web, F-10, F-17 web, F-20, F-21, F-22, F-23 web, F-24, F-25, F-26, F-27, F-29 web, F-57, F-60.
- [ ] **Android:** no code this sprint. Shipped 2.2.1 benefits from the server fixes: F-02, F-03, F-06/F-49, F-07, F-08, F-13, F-14, F-15, F-18, F-19, F-50, F-53, F-58, F-59. The Android changes are Sprint 4B, per "Contracts for 4B" in the architecture.
