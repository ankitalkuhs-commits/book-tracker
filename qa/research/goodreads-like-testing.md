# QA Research: Testing Goodreads-like Platforms → TrackMyRead Test Matrix

Researched 2026-09-13. Scope: how professional QA approaches social book-tracking apps (Goodreads, StoryGraph, Bookly, Letterboxd-adjacent), mapped onto TrackMyRead's actual features from `CLAUDE.md`/`AGENTS.md`, `context/PLATFORM_MAP.md`, `features/{library,community,reading-stats,auth}/index.md`, and the curated section of `dependency-map.md`.

---

## Sources

| # | URL | What I took from it |
|---|---|---|
| 1 | https://www.goodreads.com/topic/show/12042793-possible-wrong-isbn-number-warnings | Librarian thread on "possible wrong ISBN" warnings when adding editions — ISBN validation is fuzzy and error-prone at data-entry time |
| 2 | https://www.goodreads.com/topic/show/22827219-answered-duplicate-isbn-in-use-for-paperback-and-ebook-editions | Same ISBN reused across paperback/ebook editions of the same title — dedupe-by-ISBN logic must handle this, not just true duplicates |
| 3 | https://thewritingking.com/goodreads-metadata-errors/ | An author's book was auto-merged into a different author's page for ~a year; a single title showed 8 editions instead of 4; wrong data propagates to Google's search snippet since Goodreads is a data source for it |
| 4 | https://www.goodreads.com/topic/show/26354-2-completely-different-books-1-isbn-conflict | Two unrelated books sharing one ISBN merge into a single catalog record — ISBN is not a safe unique key |
| 5 | https://johnwargo.com/posts/2022/accurately-calculating-progress-in-goodreads/ | Progress % is wrong when page-count metadata includes back matter (index/notes) — e.g. book listed at 521 pages but only 484 are narrative, so page 100 shows 19% instead of the "true" 20%; edition-swapping to fix page count is hard to find |
| 6 | https://help.goodreads.com/s/question/0D58V00006IfaUgSAJ/how-can-i-see-the-percentage-instead-of-my-page-number-by-book-progress | Users can't get a percentage at all when the specific edition has no page-count data |
| 7 | https://betterbookclubs.substack.com/p/goodreads-versus-the-storygraph | StoryGraph offers customizable reading-challenge tracking (mood/genre goals); comparison context for what users expect from a "goal" feature |
| 8 | https://api-security.owasp.org/editions/2023/en/0xa1-broken-object-level-authorization | OWASP API1:2023 — Broken Object Level Authorization (BOLA/IDOR): attackers swap an object ID in the URL/body to read or mutate another user's resource; mitigation is authorization-per-object-per-request, not just authentication |
| 9 | https://trophy.so/blog/streak-timezone-dst-handling | Root cause of streak bugs: comparing UTC calendar dates instead of the user's local calendar date; naive `getUTCDate()` breaks for UTC+10..+12 users near midnight; 24-hour arithmetic breaks across DST spring-forward/fall-back; timezone travel shifts "today" and can extend or unfairly break a streak |
| 10 | https://github.com/LeetCode-Feedback/LeetCode-Feedback/issues/28204 | Real bug report: activity at 12:30 AM logged to the previous day, breaking a user's streak — concrete instance of the UTC/local mismatch above |
| 11 | https://github.com/dailydotdev/daily/issues/1543 | Streak *icon* desyncs from streak *state* across timezones — UI can show a stale streak status even when the backend value is correct, a distinct display-layer bug class |
| 12 | https://www.librarything.com/topic/212145 | LibraryThing bug-collectors thread: Goodreads CSV export drops "Date Read" and rating data inconsistently, worse when a review's date was hand-edited vs. set via "I'm finished!" |
| 13 | https://www.goodreads.com/topic/show/19701280-missing-data-in-csv-file | Confirms CSV import/export can silently drop fields; malformed rows (embedded commas/quotes in title or review) break the parser and drop that row entirely |
| 14 | https://qaskills.sh/blog/testing-offset-pagination-duplicate-records | Offset pagination duplicates a row when something is inserted ahead of the current offset (boundary row reappears on the next page) and skips a row when something ahead is deleted; recommends a fixed baseline + `ORDER BY created_at DESC, id DESC` tie-break, then scripted mutation-between-pages tests asserting "same ID twice" / "seeded ID never appears" |
| 15 | https://qaskills.sh/blog/notification-event-schema-testing-dedup | Notification duplicates come from queue retries, provider-ack races (worker crashes after provider accepted, before DB write), and dedup keys that are only an `eventId` (misses a producer that double-emits two different IDs for one logical event); dedup key must be written with a uniqueness constraint *before* the provider call, and tests should stub the provider and assert call *count*, not just final DB state |
| 16 | https://medium.com/@e.pavlovich29/push-notifications-testing-a-comprehensive-checklist-for-ios-and-android-fba3799e3152 | Push checklist: test foregrounded/backgrounded/killed app states, verify no notifications after logout (including ones queued while offline), verify deep-link payload routes to the right screen |
| 17 | https://medium.com/@YoKoKho/idor-at-private-bug-bounty-program-that-could-leads-to-personal-data-leaks-d2536d026bf5 | Real IDOR bounty case where a supposedly "private" data field leaked through a secondary/derived endpoint (not the main profile endpoint) — the pattern of privacy holes hiding in *indirect* reads, not the obvious one |
| 18 | https://dev.to/nikhilmartinez/accessibility-testing-checklist-translating-wcag-guidelines-into-an-accessibility-strategy-3858 | WCAG-practical checklist: 4.5:1 contrast for normal text / 3:1 for large text and UI components, no color-only signaling, full keyboard tab order with a visible focus indicator, alt text on meaningful images (empty alt on decorative ones), labeled form controls |
| 19 | https://www.forasoft.com/blog/article/simulate-slow-network-connection-57 | Concrete degraded-network test profiles to reproduce real carrier conditions: 2G Edge (50 kbps/400ms), lossy 4G (10 Mbps/5% loss), high-latency-no-loss, and airplane-mode-recovery; "packet loss and jitter break apps before bandwidth does" |
| 20 | https://www.goodreads.com/blog/show/261-spoiler-tags | Goodreads' own spoiler-tag feature is scoped to reviews and group discussion comments only — it explicitly does not cover status updates, i.e. even the market leader has an inconsistent, partial spoiler-protection surface |
| 21 | https://www.goodreads.com/poll/show/81672 | Long-running, still-unresolved user demand for half-star ratings (59.5% want it) — evidence that a coarse rating scale is a persistent source of user friction/complaints |

---

## Bug classes that hurt these platforms

1. **Duplicate editions / ISBN collisions** — same ISBN reused across formats (source 2), or two unrelated books sharing one ISBN and merging into one catalog record (source 4). Dedupe-by-ISBN is not safe as a sole key.
2. **Metadata drift breaking discovery** — a mis-attributed edition or author can hide a book from search for months, and bad data propagates outward to other search surfaces (source 3).
3. **Progress-percentage inaccuracy** — wrong or missing `total_pages`, or `total_pages` that includes non-narrative back matter, makes the percentage lie relative to what the reader is actually experiencing (source 5, 6).
4. **Streak / timezone / DST bugs** — comparing UTC calendar dates instead of the user's local calendar date breaks streaks near local midnight for UTC+10..+12 users, across DST transitions, and across timezone travel (source 9, real instances in 10, 11).
5. **Import/export fidelity loss** — CSV rows silently dropped on parse errors (embedded punctuation), or fields like date-read/rating inconsistently missing depending on how the original data was entered (source 12, 13).
6. **Feed pagination duplication/omission** — offset-based pagination duplicates or skips rows when the underlying set is mutated between page fetches (source 14).
7. **Notification duplication/spam** — retries without a durable, pre-provider-call dedup key send the same notification twice; naive `eventId`-only dedup misses logically-duplicate events with different IDs (source 15); notifications not suppressed after logout (source 16).
8. **Privacy leaks through indirect/secondary endpoints** — the "front door" endpoint enforces privacy correctly but a side endpoint (stats, activity, recommendations, search) leaks the same data unchecked (source 17, general pattern is OWASP API1 BOLA, source 8).
9. **Rating-scale friction** — a coarse 1–5 scale is a chronic, unresolved user complaint (source 21); half-star/finer granularity is a top ask.
10. **Inconsistent spoiler protection** — even Goodreads only protects reviews/group comments, not status-equivalent short posts, leaving a known gap type (source 20).
11. **Account-deletion incompleteness** — deletion requests that convert to "cancel" instead of hard delete, or leave data in secondary systems/analytics, are a recurring real-world GDPR complaint pattern (background research, not separately sourced above but consistent with source 8/17's "check every surface" theme).
12. **Accessibility gaps** — insufficient contrast, color-only status signaling, missing focus indicators, and missing/duplicate alt text are the most common WCAG failures found in checklist audits (source 18).
13. **Fragile behavior on degraded networks** — packet loss and jitter, not just low bandwidth, are what actually break apps in the field; airplane-mode recovery is a distinct failure mode from steady slow connections (source 19).

---

## Test matrix for TrackMyRead

RoE = safe to run in production under `qa/RULES_OF_ENGAGEMENT.md` (review accounts 110/111 only, read-only against other users' data, no mutation of anyone else's rows, no admin actions beyond the 403 probe, no load testing). "No" means: needs staging/local/synthetic data, or is a design/code review item, not a live prod action.

### Library (Google Books search, add-to-library, progress, status, format/ownership)

| Test idea | Why it matters (bug class) | How to test | Priority | Safe in prod? |
|---|---|---|---|---|
| Add the same Google Books result twice → expect the documented duplicate error, not a second row | Duplicate editions (#1) | API: `POST /books/add-to-library` twice with same `google_books_id` | P0 | Yes (review-owned) |
| Add a book whose Google Books result has no `total_pages` → progress UI must not crash or show NaN% | Progress inaccuracy (#3) | UI + API: add a book with missing page count, then `PUT /progress` | P0 | Yes |
| Set `current_page` exactly to `total_pages` → status flips to `finished`, `book_completed` fires once | Status/notification correctness | API: `PUT /userbooks/{id}/progress` at boundary | P0 | Yes |
| Set `current_page` beyond `total_pages` (e.g. total 300, page 350) | Progress inaccuracy (#3) edge case | API: same endpoint, over-max value | P0 | Yes |
| Set `current_page` to 0 after having progress → reverts to `to-read` | Status auto-transition correctness; this exact regression happened before (`dependency-map.md`: PUT/PATCH mixing bug) | API | P0 | Yes |
| Re-read a finished book: reduce page then progress again — does a second `ReadingActivity`/finish event fire correctly, or does history get overwritten? | No re-read concept in schema (see Gaps) — verify actual behavior, not assumed | API + DB read (`reading_activity`) | P1 | Yes |
| Format = `audiobook` — does the UI still ask for "page" progress, or hours/percent? | Progress edge cases: audiobooks/percent (spec item) | UI walkthrough | P1 | Yes |
| Two userbooks for the same underlying `book_id` (re-added after delete) — any orphaned `ReadingActivity` rows? | Data integrity on delete/re-add | API: delete then re-add, inspect `reading_activity` | P1 | Yes (review-owned rows only) |
| Google Books search with a typo ("Harry Poter") — result relevance | Search relevance/typo tolerance | UI: `GET /api/googlebooks/search` | P1 | Yes (unauthenticated, read-only) |
| Search a title with special characters / non-Latin script (Hindi/Marathi title) | Search robustness | UI/API | P2 | Yes |
| Add-to-library with `format`/`ownership_status` outside the documented enum values | Input validation | API: malformed body (<100KB per RoE) | P1 | Yes |
| `ownership_status=borrowed` without `borrowed_from` — is it required or silently null? | Data model edge case | API | P2 | Yes |
| CSV import: 5-row file with a comma inside a book title, and a row with no ISBN | Import fidelity (#5) | UI/API: `POST /import/goodreads` per RoE's 5-row limit, then delete imported userbooks | P0 | Yes (RoE explicitly allows, ≤5 rows, cleanup required) |
| CSV import: verify Goodreads status strings (`read`, `currently-reading`, `to-read`) map correctly to TrackMyRead's three statuses | Import fidelity (#5) | API/manual CSV construction | P0 | Yes |
| CSV import: duplicate a book already in the review account's library — does import create a second userbook or dedupe? | Duplicate editions (#1) applied to import path | API | P1 | Yes |
| Amazon affiliate link picks `.in` vs `.com` correctly based on timezone, not IP/locale | Region logic correctness (feature-specific) | UI: `resize_window`/spoof `Intl` timezone in browser devtools | P2 | Yes (client-side only) |
| `GET /userbooks/user/{userId}` against a private user the reader does not follow → 403 | Privacy leak (#8) | API: reader (110) vs. an arbitrary private non-review user id | P0 | Yes — this is a **read-only adversarial probe explicitly allowed** by RoE |
| Recommendations endpoint does not leak a private user's `friend_name` if that user is private and not followed | Privacy leak via secondary endpoint (#8) | API: `GET /books/recommendations`, inspect `friend_name` sources | P0 | Yes (read-only) |

### Community (feed, notes/posts, likes, comments, follow, profiles, groups)

| Test idea | Why it matters (bug class) | How to test | Priority | Safe in prod? |
|---|---|---|---|---|
| Fetch community feed page 1, have a new public note appear (own review-account post), fetch page 2 — check for duplicate/missing note across the page boundary | Feed pagination duplication (#6) | API: `GET /notes/feed` with `limit`, mutate between calls using review account's own note | P0 | Yes (own note only) |
| Note with `is_public=false` never appears in `/notes/feed`, `/notes/friends-feed`, or any group activity feed | Privacy leak (#8) — this is the project's own stated invariant | API: create a private review note, check all three surfaces, then delete | P0 | Yes |
| Like/unlike race: rapid double-tap like on the same note (idempotency) | Notification/data duplication (#7) | API: fire `POST /notes/{id}/like` twice quickly on own note | P0 | Yes |
| Comment/like on own note fires no self-notification (or does, verify intended) | Notification correctness | API + `GET /notifications/history` | P1 | Yes |
| `note.is_public=false` — verify `GET /notes/user/{id}` for another user still respects it (not just the feed) | Privacy leak via secondary endpoint (#8) | API | P0 | Yes, read-only against own/friend account |
| Delete a note that has likes+comments — verify comments/likes are deleted first (documented FK requirement), no 500 | Data integrity | API: create note+like+comment then delete, on review account | P0 | Yes |
| Follow/unfollow double-tap race (`followInFlight` pattern exists specifically because of this) | Race condition already known-risky per feature doc | UI: rapid click | P0 | **No** — forbidden to follow/unfollow anyone but the paired review account; test only between 110↔111 |
| Private profile: `GET /profile/{id}` for a private non-followed user returns `locked: true`, `stats: null` — verify no other field leaks (e.g. `yearly_goal`, `bio`) | Privacy leak via partial-lock response (#8) | API, read-only | P0 | Yes |
| `GET /users/{id}/stats` against a private non-followed user — does the *separate* stats endpoint enforce the same lock as the profile endpoint? | Privacy leak via secondary endpoint (#8) — exact pattern from source 17 | API, read-only | P0 | Yes |
| Admin-only endpoints (`/admin/stats`, `/admin/push/broadcast`) return 403 for a non-admin review account | BOLA/authorization (#8, source 8) | API, per RoE's explicit allowed 403 probe (empty body only) | P0 | Yes (RoE-sanctioned) |
| IDOR probe: reader (110) calls note/comment/userbook mutation endpoints with friend's (111) ids and vice versa, expect 403/404 | BOLA (#8, source 8) | API, exactly as RoE describes ("Adversarial calls that are expected to be refused") | P0 | Yes (RoE-sanctioned) |
| Emotion chip + quote + image note: create with all fields, verify all echoed back correctly in feed card shape | Contract drift | API/UI | P1 | Yes (own note, image ≤200KB per RoE, delete after) |
| Broken/failed note image shows nothing (not broken-image icon) — mirrors the documented `PostImage` 1×1-placeholder handling, verify same on web | UI consistency across platforms | UI: upload a tiny/corrupt image | P2 | Yes (own note, cleanup) |
| Circles: join-by-invite-code for a **private** group requires curator approval, not instant join | Access-control correctness for groups | API, but only against "Review Circle" | P0 | Yes, but **only Review Circle** — joining any other real group is forbidden |
| Circles: `GET /groups/{id}/pending` (self-join requests) vs `GET /groups/invites/pending` (curator invites) are not confused anywhere in UI | Documented "CRITICAL: two different pending endpoints" trap | API/UI | P0 | Yes, read-only against Review Circle |
| Group leaderboard sums `pages_read` correctly for a monthly vs all-time window, including month/year boundary | Streak/period boundary bug class (#4) | API: `GET /groups/{id}/leaderboard`, seed activity near a month boundary | P1 | Yes, within Review Circle only |
| Group post with emotion+image renders identically to personal note post (shared component) | Contract/UI parity | UI | P2 | Yes, Review Circle only |
| Curator-only actions (approve/reject/remove/disband) are 403 for a plain member | BOLA / role check | API, only using review-owned Review Circle roles | P1 | Yes |
| Spoiler protection: no field/flag exists for notes/comments — verify current behavior is "no spoiler protection at all," not partially implemented | Inconsistent spoiler protection (#10) | Manual UI review, no live mutation needed | P1 | Yes (read-only observation) |

### Reading Stats / Insights

| Test idea | Why it matters (bug class) | How to test | Priority | Safe in prod? |
|---|---|---|---|---|
| Log progress at 11:55 PM local time close to midnight in a non-UTC timezone (e.g. IST, UTC+5:30) — does `reading_activity.date` (truncated to UTC midnight) land on the wrong calendar day for the user? | Streak/timezone bug (#4), directly the pattern in sources 9–11 | API: spoof client timezone, `PUT /progress` near midnight IST, inspect `reading_activity` row date | P0 | Yes (review account's own data) |
| Yearly goal: book finished Dec 31 vs Jan 1 (server UTC) — counted toward the correct year for a non-UTC user | Year-boundary goal counting (#4) | API: `POST /userbooks/{id}/finish` near year boundary with timezone offset | P0 | Yes, but only genuinely testable near real year boundary or via seeded/staging data — **flag for staging**, not forced in prod |
| 30-day activity chart: empty days render as zero bars, not gaps (per feature doc) | UI correctness, already documented expectation | UI | P2 | Yes |
| `stats.finished` vs `stats.finished_books` — confirm every consumer (mobile/web) reads the correct key; this exact bug shipped before | Contract drift (project-specific known gotcha) | Code/API response inspection | P0 | Yes (read-only) |
| Reading velocity / projected finish date recalculates sanely after a big single-day jump (e.g. current_page 10→300 in one update) | Edge-case math bug | API | P1 | Yes, own userbook |
| GoalRing percentage does not exceed 100% or go negative when `finished > yearly_goal` or `yearly_goal = 0` | Div-by-zero / overflow edge case | API/UI | P1 | Yes |

### Auth

| Test idea | Why it matters (bug class) | How to test | Priority | Safe in prod? |
|---|---|---|---|---|
| `POST /auth/review-login` with wrong secret / wrong email → uniform 401 (not distinguishable, per dependency-map's anti-enumeration design) | Authorization / info-leak via error messages (#8-adjacent) | API | P0 | Yes (this is the sanctioned login path) |
| `GET /version` unauthenticated, confirm shape is exactly `{commit, service, branch}` and nothing else (documented "must never leak a secret" invariant) | Info leak via a no-auth endpoint | API, read-only | P0 | Yes |
| JWT expiry (30 days, no refresh) — verify expired token gets a clean 401 prompting re-login, not a crash | Session handling | Requires a token >30 days old — **needs a pre-aged fixture, not producible live** | P1 | No — needs staging/synthetic token |
| `is_new` triggers onboarding exactly once, never again on subsequent logins for the same account | First-run logic correctness | API/UI, review account | P2 | Yes, but only once meaningfully testable — **note as low-value in prod after first run** |
| Admin escalation: non-admin review account cannot call `/admin/set-admin/{id}` on itself or the other review account | BOLA (#8) | API, 403 probe | P0 | Yes (RoE-sanctioned 403 probe) |
| Account deletion (`DELETE /auth/delete-account/me`) actually removes/anonymizes owned notes, comments, likes, follows, group memberships — not just the `user` row | Account-deletion incompleteness (#11) | Requires deleting a real account and verifying cascade — **destructive, account-recreation needed after** | P0 | **No** — forbidden by RoE ("Deleting either review account... orchestrator-only step, done last, followed by a reseed") — must be run in the designated final step only, not as an ad hoc test |

### Cross-cutting: accessibility, performance, mobile

| Test idea | Why it matters (bug class) | How to test | Priority | Safe in prod? |
|---|---|---|---|---|
| Contrast ratio of primary text/buttons ≥ 4.5:1, large text/icons ≥ 3:1 | WCAG contrast (#12, source 18) | Automated contrast checker (axe/Lighthouse) against live pages | P1 | Yes, read-only |
| Status (to-read/reading/finished) is never conveyed by color alone | WCAG color-only signaling (#12) | Manual UI review | P1 | Yes |
| Full keyboard tab order through Add Book modal, note composer, and settings, with a visible focus indicator at each stop | WCAG focus (#12) | Manual keyboard-only pass | P1 | Yes |
| Screen reader announces book cover images, emotion chips, and like/comment buttons with meaningful labels (not "image" / "button") | WCAG screen-reader labeling (#12) | VoiceOver/NVDA spot check | P2 | Yes |
| Cold start timing on Render free tier after 15-min sleep (~30s) — confirm mobile's 30s timeout doesn't clip the request | Performance/cold start | Trigger deliberately by waiting out the sleep window, then time `GET /version` | P1 | Yes (read-only, low request volume, within 5 req/s cap) |
| App behavior on 2G/lossy-4G profiles (per source 19) for feed load and image upload | Degraded network resilience | Throttle via Network Link Conditioner / Charles Proxy in a controlled client, hitting prod read-only endpoints | P1 | Yes for reads; **no** for the image-upload leg unless within the RoE's 3-image/run cap |
| Airplane-mode-recovery: start progress update offline, reconnect — no duplicate `reading_activity` row from a retried request | Notification/request duplication (#7) applied to mutations generally | Client network toggling against own review userbook | P1 | Yes, review-owned data |
| Deep link (e.g. `trackmyread://book/123` or `/join/{invite_code}`) opens correctly from a cold start and from a logged-out state | Deep link correctness | Manual mobile/web test | P1 | Yes, using Review Circle's invite code only |
| Push notification suppressed after logout (no further pushes reach a logged-out device) | Push testing checklist item (source 16) | Log out review account on a device, trigger an event on it from the other review account, confirm no push | P1 | Yes, both review-owned |
| SEO/share preview: a public profile or public note has correct Open Graph title/image (not a generic fallback) | Share preview correctness (spec item) | Fetch the public URL, inspect meta tags | P2 | Yes, read-only |

---

## Gaps

Features users commonly expect from a Goodreads-like platform that TrackMyRead's spec/schema does not appear to support (list only — no build recommendations):

- No edition selection (one `Book`/`total_pages` per catalog entry; no per-edition page-count or cover choice)
- No re-read tracking (no "read count" or per-read-cycle history; a second read cycle isn't modeled distinctly from the first)
- No data export (CSV import exists one-way; no export-your-library path)
- No spoiler tags/markers on notes or comments
- No half-star or finer-grained rating scale (integer 1–5 only)
- No blocking or reporting of other users (only admin-side moderation of content, not a user-facing block/report flow)
- No DNF (did-not-finish) status distinct from the three status values
- Follow is one-way only — no mutual "friend" concept beyond that
- No content warnings / mood or pacing tags (a StoryGraph-style feature)
- No offline reading log queue described in the spec (only implied via general offline testing, not a stated feature)
- No audiobook-specific progress unit (hours/percent) called out separately from page-based progress in the schema
- No account data export (distinct from CSV library export) for a user's notes/comments/likes prior to deletion

---

## Top 25 tests to run first

1. IDOR probe: reader (110) and friend (111) attempt mutations on each other's userbooks/notes/comments — expect 403/404
2. `GET /userbooks/user/{userId}` and `GET /users/{id}/stats` against a private non-followed user both correctly locked (secondary-endpoint privacy check)
3. `note.is_public=false` never appears in community feed, friends feed, or `GET /notes/user/{id}`
4. Admin endpoints (`/admin/stats`, `/admin/push/broadcast`) return 403 for non-admin review account
5. `GET /version` response contains only `{commit, service, branch}` — no leaked secret/env data
6. `POST /auth/review-login` with a wrong secret/email returns a uniform 401 (no enumeration signal)
7. Set `current_page = 0` after prior progress — status correctly reverts to `to-read` (guards the historical PATCH/PUT mixing regression)
8. Set `current_page = total_pages` exactly — status flips to `finished`, `book_completed` fires exactly once
9. Set `current_page` beyond `total_pages` — no crash, sane clamped display
10. Add-to-library duplicate detection (same `google_books_id` twice) — correct duplicate error, no second row
11. Log progress near local midnight in IST (UTC+5:30) — verify `reading_activity.date` lands on the correct local calendar day
12. `stats.finished` vs `stats.finished_books` key consistency across web and mobile responses
13. Rapid double-tap like on own note — no duplicate like row, no duplicate notification
14. Community feed pagination across a mutation (new own public note appears) — no duplicate/missing note across the page boundary
15. CSV import of a 5-row Goodreads export with one row containing a comma in the title — verify no silent row drop or malformed parse, then clean up
16. CSV import status mapping (`read`/`currently-reading`/`to-read`) → TrackMyRead's three canonical statuses
17. Delete a note that has likes and comments — comments/likes removed first, no 500 (documented FK order requirement)
18. Group join-by-invite-code on a private group requires curator approval, not instant join (Review Circle only)
19. `GET /groups/{id}/pending` vs `GET /groups/invites/pending` are not swapped anywhere in the UI
20. Follow/unfollow rapid double-tap between the two review accounts — no duplicate follow row, no duplicate `new_follower` notification
21. Push notification suppressed after logout on a device that was previously registered
22. Cold start after Render's 15-minute sleep — confirm `GET /version` completes within mobile's 30s timeout
23. Contrast ratio automated check (axe/Lighthouse) on Library, Feed, and Insights pages
24. Full keyboard-only pass through Add Book modal and note composer — visible focus indicator at every stop, no trap
25. Deep link to Review Circle's invite code opens correctly from a cold, logged-out app state
