---
screen: sprint-4i-report-block
feature: safety
repo: api + web + mobile (iOS and Android) + docs. **Both clients change, and the mobile app has no OTA
  channel, so each client change is a store release — see R-40.**
status: draft — eight escalations open, four of them blocking (E-1 the block symmetry, E-2 circles,
  E-3 what a report does before review, E-5 the sprint split)
last_verified: 2026-10-11
source: code read on branch `sprint-4i-report-block` (base master @ `1162479`, deployed). Files opened
  for this document, and the only ones its line numbers may cite: `app/models.py`, `app/crud.py`,
  `app/deps.py`, `app/schema_guard.py`, `app/main.py` (grep of `include_router` / startup),
  `app/routers/notes_router.py`, `app/routers/likes_comments.py`, `app/routers/follow_router.py`,
  `app/routers/profile_router.py`, `app/routers/users_router.py`, `app/routers/admin_router.py`,
  `app/routers/bots_router.py`, `app/routers/groups_router.py:1-145,321-405,590-929,1108-1153`,
  `app/routers/userbooks_router.py:475-620`, `app/routers/books_router.py:220-339`,
  `app/routers/reading_activity_router.py:220-276`, `app/routers/auth_router.py:455-603`,
  `app/notifications/dispatcher.py`, `app/notifications/router.py`,
  `tests/conftest.py`, `tests/test_query_budget.py:1-80,520-1033`,
  `qa/unit/botBadge.test.mjs:1-70` (+ grep of its literals),
  `qa/unit/noteVisibility.test.mjs:1-45`, `.github/workflows/ci-tests.yml:50-200`,
  `context/PM_SQL_QUEUE.md:127-253`, `dependency-map.md:1-20`, `context/INDEX.md`,
  `features/auth/index.md`, `features/community/index.md`, `features/security/index.md`,
  `book-tracker-frontend-stitch/src/pages/HomePage.jsx` (grep + `:184-214`),
  `book-tracker-frontend-stitch/src/pages/UserProfilePage.jsx` (grep),
  `book-tracker-frontend-stitch/src/pages/GroupDetailPage.jsx` (grep),
  `book-tracker-frontend-stitch/src/pages/AdminPage.jsx` (grep),
  `book-tracker-frontend-stitch/src/services/api.js` (grep),
  `book-tracker-frontend-stitch/src/App.jsx` (grep),
  `book-tracker-frontend-stitch/src/pages/SettingsPage.jsx` (grep),
  `book-tracker-mobile-stitch/src/screens/SettingsScreen.js` (grep),
  `book-tracker-mobile-stitch/src/screens/FeedScreen.js` (grep + `:646-652,669-682,746-770`),
  `book-tracker-mobile-stitch/src/screens/GroupDetailScreen.js` (grep + `:711-742`),
  `book-tracker-mobile-stitch/src/screens/UserProfileScreen.js` (grep),
  `book-tracker-mobile-stitch/src/services/api.js` (grep),
  `book-tracker-mobile-stitch/src/navigation/AppNavigator.js` (grep),
  `book-tracker-mobile-stitch/src/i18n/index.js` + `src/i18n/locales/en.json` (grep),
  `book-tracker-mobile-stitch/app.json`, `book-tracker-mobile-stitch/eas.json` (grep)
---

## What It Does

TrackMyRead serves another reader's content to a signed-in reader from **fourteen** endpoints, and one
of those fourteen serves it to anonymous visitors too. **131 real readers** are on production today
and there is no way for any of them to report a post or to stop another reader reaching them.

Verified on this branch before anything was designed: `grep -rn "class Report\|class Block\|class Mute" app/`
returns nothing, and a case-insensitive sweep of `app/` for `report|block|mute|flag|abuse|moderation`
returns exactly one hit — a code comment at `app/routers/auth_router.py:214`. Both clients are the
same: the web client's only hits are Tailwind class names, two code comments and the string
"Content moderation" labelling the admin tab (`AdminPage.jsx:33`, `:321`); the mobile client's only
hits are style identifiers and the Ionicons glyph `flag-outline`. **There is no report path, no block
path, no mute, no hide, and no blocked-users list anywhere in this product.**

App Store Review Guideline **1.2** requires four things of an app with user-generated content:

| # | Requirement | State on this branch |
|---|---|---|
| 1 | A method for filtering objectionable material | **Partial.** An admin can hard-delete a note (`admin_router.py:538-554`) or a comment (`:557-568`), from `AdminPage.jsx`'s content tab. There is no automated filter and no reader-side filter. |
| 2 | A mechanism to report offensive content, with timely responses | **MISSING.** This sprint. |
| 3 | The ability to block abusive users | **MISSING.** This sprint. |
| 4 | Published contact information | **Done** — `trackmyread.com/support`, shipped in `2b555f6`. |

So the iOS build cannot be submitted. This sprint adds:

- A **report** path from every surface that shows another reader's content, a `report` table, and a
  place a human actually sees it — because a report that lands nowhere fails requirement 2 on the
  word "timely", not on the word "mechanism".
- A **block**, with written-down semantics, honoured at **every** path that serves content to a
  signed-in reader. The enumeration is in R-22 and it was built by reading the routers, not by
  recalling them.

**This is honestly two sprints' work and the split is E-5.** The appetite section says where the line
is and why the first half ships on its own.

## User story

As a reader who opens TrackMyRead and finds that someone has posted something cruel about me, or has
followed me and is commenting on every note I write, I want to tell someone about the post and I want
to make that reader disappear from my app — without having to email anybody, without being told to
wait, and without that reader learning what I did.

- **Evidence:** two sources, and the second is the weaker one.
  - Guideline 1.2 items 2 and 3. This is a submission blocker and it is binary.
  - **No reader has reported abuse, because there is no way to.** The absence of complaints is not
    evidence of safety here; it is evidence of the missing mechanism. This document does not pretend
    there is user research behind it.
- **Success metric:**
  - The iOS build passes App Review without a 1.2 rejection. Binary.
  - **A blocked reader's content appears on zero of the fourteen serving paths in R-22.** Proved by a
    test per path, not by a spot check, because a block that leaks in one query is worse than none:
    the reader believes they are protected and behaves as if they are.
  - A report filed in the product is visible to the PM **and announced to them** within the same
    minute, measured by one end-to-end run on production (R-03).
  - Zero `report` rows with a duplicate `(reporter_id, target_type, target_id)`. The unique index
    makes this unfalsifiable, which is the point.
  - Zero `follow` rows for a blocked pair, in either direction, measured by one SQL check after
    deploy (R-21).

## Appetite

Max complexity: **large**. Honestly: **8–12 days** across six packages. That is more than this
project's sprints have been, and pretending otherwise is how the block ships with a leak in it.

### This is bigger than one sprint, and here is the split

**4I-A — Report.** The `report` table, `POST /reports`, the admin queue, the admin notification, and
the report affordance on both clients. **Independently shippable and independently valuable**: it
satisfies guideline 1.2 item 2 on its own, it gives 131 readers a path they do not have today, and it
**moves zero query budgets** because it adds no filter to any existing endpoint (R-29). 3–4 days.

**4I-B — Block.** The `block` table, `POST`/`DELETE /blocks`, the filter at all fourteen serving paths,
the interaction refusals, the notification suppression, the budget re-measurement, and the block
affordance plus a blocked-list screen on both clients. 5–8 days, and the filter work is the part that
cannot be rushed.

Both are required before submission, so the split is about *review surface and risk*, not about
shipping one and stopping. **The recommendation (E-5) is: two sprints of API work, one client
release.** The mobile app has no OTA channel — verified: `expo-updates` is absent from
`book-tracker-mobile-stitch/package.json`, `app.json` has no `updates` key and no `runtimeVersion`,
and no `eas.json` build profile carries a `channel`. So every client change is a store release with a
review wait. Two client releases would mean two waits and two chances to be rejected; one release
carrying both affordances is strictly better, and the API can still deploy in two steps behind it.

### Blocked on

- **Two PM SQL steps**, 10 and 11 (`context/PM_SQL_QUEUE.md`; steps 1–9 are taken, 9 is Sprint 4H's
  and is still outstanding). `app/schema_guard.py:35-53` raises at startup for a missing column, from
  `app/main.py:166`, so the commit that adds `("report", "reason")` / `("block", "blocked_id")` to
  `REQUIRED_COLUMNS` must deploy **after** the SQL, never with it.
- **E-1, E-2, E-3 and E-5.** The block's symmetry, what it does inside a shared circle, what a report
  does to content before a human looks at it, and the sprint split are product decisions. R-20, R-26
  and R-04 must not be built before they are answered.
- **Nothing outside this repo.** Unlike Sprint 4G, there is no Apple-side registration, no key to
  generate and no capability to enable. Everything here is ours.

### Not building

- **An automated filter** (word lists, image classification, an LLM moderation pass). Guideline 1.2
  item 1 is already partially met by admin deletion and is not what the rejection would cite. Adding a
  classifier is its own sprint with its own false-positive problem.
- **Auto-removal of reported content.** See R-04 and **E-3**. A report threshold that hides content is
  a brigading weapon, and on a 131-reader platform the threshold would have to be 2 or 3 to ever fire.
- **An appeals flow.** Nothing in this sprint removes content automatically, so there is nothing to
  appeal. The day auto-removal ships, an appeal becomes required and it is not here.
- **A mute** (see their content in threads, not in feeds). It is a third set of semantics on top of
  two new ones and nothing in Guideline 1.2 asks for it.
- **Blocking by email, phone or device.** A block is between two `user` rows. A blocked reader who
  creates a second account is not stopped by this sprint and nothing here claims otherwise.
- **Hiding the blocker's content from an anonymous visitor.** `GET /notes/feed` takes
  `get_current_user_optional` (`notes_router.py:329`), so an unauthenticated request has no viewer and
  no block set. A blocked reader who signs out sees the public feed exactly as anyone would. This is
  **E-8**, stated rather than hidden.
- **Changing `is_private_profile`.** It already exists and already gates five endpoints. A block is a
  different control and does not touch it.
- **Changing the admin delete routes.** `DELETE /admin/content/note/{id}` (`admin_router.py:538`) and
  `DELETE /admin/content/comment/{id}` (`:557`) are exactly the actions a report resolution needs and
  they are reused unmodified.
- **A second rate limiter.** This service has none anywhere. R-09 explains why the unique index is the
  cap here and why adding the service's only rate limit to one route would be false comfort — the same
  treatment `/auth/bot-login` and `/auth/apple` already got.

## Requirements

Instants are UTC. "Viewer" is the signed-in reader making the request. "Subject" is the other reader.
A **blocked pair** means a `block` row exists with `(blocker_id, blocked_id)` equal to `(A, B)` or
`(B, A)`.

### Report — the half that can ship alone

- [ ] **R-01 One `report` table, and a reader may report a given thing once.**
  - **Accept:**
    - `report` carries: `reporter_id`, `target_type`, `target_id`, `reason`, optional `detail` text,
      `status`, `created_at`, `resolved_at`, `resolved_by`, `resolution`.
    - `target_type` is one of **`note`**, **`comment`**, **`group_post`**, **`user`** — the four
      things a reader can see that belong to someone else. There is no fifth; `group_activity` rows
      carry no reader-authored text (`groups_router.py:1140-1151` serialises `event_type` and a
      payload the server wrote), and a book is not a reader's content.
    - `UNIQUE (reporter_id, target_type, target_id)`, enforced by a **database index**, not by the
      handler, so two concurrent submissions cannot both win. The precedent is this codebase's own:
      `follow_router.py:39-44` catches the `IntegrityError` on `uq_follow_pair`, rolls back at `:43`
      and returns the same contract the sequential check returns at `:27`.
    - A second report of the same target by the same reader returns **200** with the first report's
      state, not 409 and not a second row. A reader tapping Report twice has not done anything wrong.
    - `reason` is a closed set of strings. Free text goes in `detail` and is never rendered anywhere
      except the admin queue.
  - **Mutation:** drop `unique=True` (the concurrent-double-report test must then produce two rows);
    accept an unlisted `target_type`; return a 409 for a repeat.
- [ ] **R-02 `POST /reports` refuses everything that is not a real report.**
  - **Accept:**
    - **404 when the target does not exist**, with the same body as a target the viewer may not see,
      so the route cannot be used to enumerate note ids.
    - **400 when the target is the viewer's own content or the viewer themselves.**
    - **The viewer must be able to see the target.** A report on a private note, or on a private
      profile's note the viewer does not follow, is a **404** — the same rule and the same code as
      `likes_comments._assert_can_view_note` (`likes_comments.py:14-28`), reused, not re-implemented.
      Otherwise `POST /reports` is a visibility oracle for every note id.
    - `deny_bot_actor` (`app/deps.py:191-211`) is a dependency on this route. A bot does not report.
    - `detail` is capped in length and stored as-is. It is never echoed to any reader.
    - The response says only that the report was received. It never says whether this is the first
      report, how many others exist, or what will happen.
  - **Mutation:** drop the visibility check (a 404 for an invisible note must then become a 201);
    drop `deny_bot_actor`; allow a self-report; return the report count.
- [ ] **R-03 A report reaches a human, and the product can prove it.**
  - **Why this is the requirement and not "store the row":** Guideline 1.2 asks for a mechanism *with
    timely responses*. A table nobody queries and a tab nobody opens are the same thing as no
    mechanism, and that is the half of this requirement most likely to be skipped.
  - **Accept:**
    - `GET /admin/reports` lists open reports newest-first with the reported text inline, the author,
      the reporter, the reason, the detail, and the count of other reports on the same target —
      enough to action without a second request.
    - `PATCH /admin/reports/{id}` sets `status` to one of **`open`**, **`actioned`**, **`dismissed`**,
      stamping `resolved_at` and `resolved_by`. Resolving is **not** deleting: the row stays.
    - Both are behind `get_admin_user` (`app/deps.py:172-185`), which 403s a non-admin.
    - **A new report fires a notification to every admin**, through `fire_event`
      (`app/notifications/dispatcher.py:113-214`) with a new entry in
      `app/notifications/config.py`'s `NOTIFICATION_EVENTS` — the same path every other event uses, so
      it reaches Expo and Web Push with no new delivery code. It is a `BackgroundTask`, after the
      response, the way `follow_router.py:48-55` and `likes_comments.py:71-79` already do it: a report
      must not be slower, or fail, because the admin's push token is stale.
    - The notification body carries **no reported text and no reader's name** — only that a report
      exists and its reason. A push notification is a lock-screen surface.
    - **This extends the existing admin surface rather than adding a new one.** The justification is
      in architecture §"Why the admin surface and not a new one" and it is not merely "it is already
      there": the two actions a resolution needs (delete the note, delete the comment) already live at
      `admin_router.py:538` and `:557` behind the same dependency, and a second surface would
      duplicate both plus the auth and give the PM two places to look.
  - **Mutation:** make the notification synchronous (the "admin has no push token" test must then slow
    or fail the report); put the reported text in the notification body; let `PATCH` delete the row;
    drop `get_admin_user` from either route.
- [ ] **R-04 A report changes nothing about the content until a human decides. (Subject to E-3.)**
  - **This requirement must not be built before E-3 is answered.** It is the one place where a
    plausible-sounding alternative — "hide it after three reports" — is a brigading weapon on a
    131-reader platform, and that is the PM's call, not the architect's.
  - **Accept (the proposal):**
    - A report sets no flag that any serving path reads. The content stays exactly as visible as it
      was, to everybody, until the admin deletes it.
    - **The relief the reporter gets is immediate and is their own:** the report flow offers "Also
      block this reader", checked by default. That composes the two halves of this sprint — the
      reporter stops seeing the content in the same tap, with no global effect and no race with a
      human. It is the reason R-04 can be "do nothing" without being callous.
    - If the admin deletes the content, the existing delete routes do it and the report's `status`
      becomes `actioned`. There is no soft-delete and no quarantine state.
  - **Mutation:** add a `hidden` column any feed reads; auto-hide at a report count; make "also block"
    silently not block.
- [ ] **R-05 Report is reachable from every surface that shows another reader's content, and that is proved by a scan, not by a screenshot.**
  - **Accept:**
    - Web, six sites, all verified on this branch:
      | # | Surface | File | Anchor |
      |---|---|---|---|
      | 1 | Feed post (serves both the Community and the Friends tab — one `PostCard`) | `HomePage.jsx` | the overflow menu at `:184-213`, gated `(isOwn \|\| isAdmin)` at `:184` |
      | 2 | Feed comment | `HomePage.jsx` | the comment author span at `:292` |
      | 3 | Public-profile note | `UserProfilePage.jsx` | the `PublicNoteCard` action cluster, component at `:117` |
      | 4 | Public profile (the reader) | `UserProfilePage.jsx` | beside the follow button, `onClick={toggleFollow}` at `:424` |
      | 5 | Circle post | `GroupDetailPage.jsx` | the delete button gated `(isOwn \|\| isCurator)` at `:128` |
      | 6 | User search result | `HomePage.jsx` | the sidebar result row |
    - Mobile, six sites, all verified on this branch:
      | # | Surface | File | Anchor |
      |---|---|---|---|
      | 1 | Feed post | `FeedScreen.js` | the `···` menu at `:669-682`, gated `(isOwnPost \|\| isAdmin)` at `:669`, state `menuPostId` at `:77` |
      | 2 | Feed comment | `FeedScreen.js` | the comment row at `:746-770`, admin trash at `:763` |
      | 3 | Public-profile note | `UserProfileScreen.js` | the note list at `:513` |
      | 4 | Public profile (the reader) | `UserProfileScreen.js` | beside `onPress={toggleFollow}` at `:345` |
      | 5 | Circle post | `GroupDetailScreen.js` | the post header at `:711-742`, curator trash at `:732-740` |
      | 6 | User search result | `FeedScreen.js` | `renderUserCard` at `:583` |
    - **The existing per-post menu is gated to the owner and the admin on both clients** — web
      `HomePage.jsx:184`, mobile `FeedScreen.js:669`. A non-owner sees *no* menu at all today. So this
      is not "add an item to a menu": the gate has to open for everyone, with Report (and Block) as
      the only items a non-owner gets. **That is the single largest client change in the sprint** and
      it is named here because it is easy to under-estimate from the outside.
    - **The proof is a source scan with a site map, following `qa/unit/botBadge.test.mjs`.** That file
      already solves this exact problem for the bot badge: anchors drawn from surrounding JSX rather
      than line numbers (`botBadge.test.mjs:12-13`), each anchor asserted to resolve to exactly one
      line, `found === EXPECTED_SITES` against a literal (`:50`, asserted at `:152-153`) **before** any
      per-site assertion, and the same detector run over a synthetic copy with every badge stripped
      which must report 0 (`:145-149`). A new `reportAffordance.test.mjs` in `qa/unit/` and one in
      `book-tracker-mobile-stitch/__tests__/` copies that structure exactly, including the synthetic
      negative. Any site deliberately left out is pinned the way `DROPPED_SITE`
      (`botBadge.test.mjs:99`) pins one.
  - **Mutation:** delete one site's Report item (the scan must name it); set `EXPECTED_SITES` below the
    list's length; remove the synthetic-negative assertion (the scan must then be unable to fail).
- [ ] **R-06 A bot is reportable and cannot be reported into oblivion; the admin's own content is reportable and the hole that creates is named.**
  - **Accept:**
    - `target_type: user` with a bot's id is accepted. A reader cannot tell `@TMRBot` from a person
      and must not have to; a report on a bot lands in the queue like any other.
    - **Because R-04 removes nothing automatically, no number of reports can take a bot's posts out of
      the feed.** This is the whole mitigation and it is a consequence of R-04, not a separate check.
      If E-3 chooses auto-hiding, `is_bot` must be excluded from it and that becomes a new requirement.
    - A bot never *files* a report (R-02's `deny_bot_actor`).
    - A report whose target is the admin's own content lands in the admin's own queue. **There is
      exactly one admin** — `admin_router.py:350` pins `_ALLOWED_ADMIN_EMAILS` to a single address and
      `:369-370` refuses to grant `is_admin` to anyone else. So a report about the admin is reviewed by
      the subject of the report. Named, not solved: solving it needs a second reviewer, which is an
      organisational change, not a code change. **E-6.**
  - **Mutation:** reject a report whose target is a bot; reject a report whose target is an admin.
- [ ] **R-07 A report outlives the content it is about, or it does not — and the choice is written down.**
  - **Accept:**
    - When the admin deletes the reported note or comment, the `report` row **stays**, with
      `status: actioned`. A moderation record that disappears with the content it describes cannot
      show a pattern, and a pattern across reports is the only way one abusive reader is visible.
    - `target_id` therefore becomes a **dangling** reference once the content is gone. It is
      deliberately **not** a foreign key, and `GET /admin/reports` renders a resolved report whose
      target has gone without a 500. The reported text is **copied into the report row at creation**
      (`target_snapshot`) so the queue can still show what was reported.
    - **A snapshot is a copy of a reader's words in a second table**, and that is a privacy cost paid
      deliberately: it is capped in length, is visible only to an admin, and is deleted with the
      reporter's account (R-08). Without it a resolved report is an id and a reason, which is not a
      record of anything.
  - **Mutation:** make `target_id` a foreign key (the delete must then fail or cascade); drop the
    snapshot (a resolved report's queue row must then render blank); delete the report on resolution.
- [ ] **R-08 Account deletion accounts for every new row, and the cascade is extended in the same commit as the table.**
  - **Why:** `POST /auth/delete-account/me` (`auth_router.py:475-603`) hard-deletes fourteen kinds of row
    by hand, in a written dependency order, and `models.py` has no `ondelete` anywhere. A new table
    that is not added to that function is an orphan row pointing at a `user.id` that no longer exists —
    and on the `block` table that orphan is *worse than an orphan*: a hidden-id set computed from it
    would hide a reader who no longer exists, or fail to hide one who does.
  - **Accept:**
    - Reports **filed by** the deleted reader are deleted. A report is a reader's statement and it goes
      with them, snapshot included.
    - Reports **about** the deleted reader's content are deleted, because the content is deleted by the
      same function (notes at `auth_router.py:571-572`, comments at `:576-577`, group posts at
      `:548-549`) and the snapshot would be the only copy left.
    - **Blocks in both directions are deleted** — `blocker_id == uid OR blocked_id == uid`, the same
      shape the follow delete already uses at `auth_router.py:559-562`.
    - These run **before** the `user` row delete at `:598-600`, in the same transaction, which commits
      once at `:601`.
  - **Mutation:** delete only the blocks where the reader is the blocker (the other reader must then
    keep a block pointing at a dead id); delete the user row first; put either delete after the commit.
- [ ] **R-09 No new rate limiter, and the reason is the design rather than an omission.**
  - **Accept:** the `UNIQUE (reporter_id, target_type, target_id)` index is the cap: one reader can
    file at most one report per thing, for ever. A flood therefore needs a flood of accounts, which is
    a signup problem and not a report problem. This service has **no** rate limiter on any route; the
    treatment matches `/auth/bot-login` and `/auth/apple`, both of which recorded the same gap rather
    than adding the service's only limiter to one path.
- [ ] **R-10 The reported reader is never told.**
  - **Accept:** no notification, no response-shape change, no counter anywhere a reader can see. The
    only observable consequence of a report is the admin deleting the content, which is observable
    today.
  - **Mutation:** fire any event with the reported reader as a recipient.

### Block — the harder half

- [ ] **R-20 The semantics, in one sentence, before any file list. (Subject to E-1.)**
  - **The rule: a block is symmetric in visibility, symmetric in interaction, asymmetric in control,
    and destructive to the follow graph.**
  - **Accept — spelled out, because every clause has a consequence for a real reader:**

    | Clause | If A blocks B | Consequence |
    |---|---|---|
    | **Symmetric visibility** | B's content vanishes from A's app **and** A's content vanishes from B's app, everywhere a signed-in reader is served (R-22) | A is protected. B is also deprived, which is the cost. |
    | **Symmetric interaction** | Neither can follow, like, comment on, or invite the other (R-24) | A block that only hides is cosmetic: B could still comment on A's post and A would get the push. |
    | **Asymmetric control** | Only A sees the block, only A can lift it. B is never told, cannot see a list, cannot unblock | B learns nothing from the product. B will infer it, and that is unavoidable in any block that works. |
    | **Destructive to follows** | Both `follow` rows are deleted, in the same transaction (R-21) | Unblocking does **not** restore them. This is a visible, irreversible side effect and it must be stated in the UI before the tap. |
  - **Why symmetric and not one-directional.** A one-directional block — A stops seeing B, B keeps
    seeing A — leaves the reader A was hiding from with a live feed of A's posts
    (`/notes/feed`, `/notes/user/{id}`), A's profile and stats (`/profile/{id}`,
    `/users/{id}/stats`), A's reading activity (`/reading-activity/user/{id}/daily`) and A's half of
    every comment thread they share. That is precisely the situation the requirement exists to end.
    Guideline 1.2 asks for "the ability to block abusive users", and a block the abusive user can see
    through is not that ability. It is also what a reader expects of a button labelled Block.
  - **What symmetry costs, stated:** A loses B's content too. If A blocks the wrong person, or blocks a
    prolific reader, A's own feed gets quieter and the only repair is unblocking — which does not bring
    back the follows. R-28's blocked list and the confirm copy are what make that recoverable.
  - **Mutation:** make the filter one-directional (a test that signs in as B and reads A's profile must
    then go red); let B unblock; keep the follows.
- [ ] **R-21 A block deletes both follows, in the same transaction, and no `follow` row can exist for a blocked pair afterwards.**
  - **Accept:**
    - `POST /blocks/{user_id}` inserts the `block` row and deletes `follow` rows in both directions in
      **one** transaction, committing once. A block that committed without the unfollow would leave
      the pair in the friends feed until someone noticed.
    - `POST /follow/{followed_id}` (`follow_router.py:13-61`) returns **403** for a blocked pair,
      checked **before** the self-follow check at `:15` and before any row is added. The 403 body is
      the same whichever of the two blocked, so B cannot tell a block from a platform rule.
    - **The invariant:** no `follow` row exists for a blocked pair. It is maintained by two separate
      pieces of code — this delete and that 403 — and is therefore asserted directly by a production
      SQL check (architecture §Production checks) rather than trusted.
    - `DELETE /blocks/{user_id}` removes the block row and **restores nothing**.
  - **Why delete rather than filter the follow graph:** it is the one decision that removes work rather
    than adding it. `follow` is read by `/notes/friends-feed` (`notes_router.py:593-596`),
    `/userbooks/friends/currently-reading` (`userbooks_router.py:553-556`),
    `/books/recommendations` (`books_router.py:244-246`), `/users/following`
    (`users_router.py:123-126`), `/follow/followers` and `/follow/following`
    (`follow_router.py:79-87`), `/profile/{id}` (`profile_router.py:212-219`) and the four
    private-profile gates. Deleting the rows makes the block true in all of them at once.
  - **Mutation:** commit the block before the unfollow (a crash between them must be impossible, so the
    test is that one transaction is used); drop the 403 on `POST /follow`; restore follows on unblock.
- [ ] **R-22 Every path that serves content is enumerated, and the enumeration was built by reading the routers.**
  - **Accept — the complete table. "Filtered" means a blocked pair's content, name or avatar must not
    appear in the response. Every file:line here was opened on this branch.**

    | # | Path | Handler | Viewer | What a block does | Why |
    |---|---|---|---|---|---|
    | 1 | `GET /notes/feed` | `notes_router.py:325-399`, query in `crud.get_notes_feed` `crud.py:142-154` | **optional** (`:329`) | **Filter** the author. No viewer → no filter (E-8) | The first screen after login |
    | 2 | `GET /notes/friends-feed` | `notes_router.py:580-695` | required | **Filter**, although R-21 already makes it empty | Two codepaths must stay right for R-21's invariant; one filter makes the leak impossible |
    | 3 | `GET /notes/user/{id}` | `notes_router.py:464-533` | required | **404** the whole response, before the private-profile gate at `:474-480` | A profile's notes are the subject's content |
    | 4 | `GET /notes/{id}/comments` | `likes_comments.py:165-205` | required | **Filter** comment authors; **404** if the note's author is blocked, via `_assert_can_view_note` | A blocked reader's comment under a third party's post |
    | 5 | `POST/DELETE /notes/{id}/like`, `POST /notes/{id}/comments` | `likes_comments.py:31,84,116` | required | **Refuse**, through the same `_assert_can_view_note` (`:14-28`, called at `:46`, `:135`, `:177`) | R-20's symmetric interaction |
    | 6 | `GET /profile/{user_id}` | `profile_router.py:202-259` | required | **404**, before the private gate at `:243` | Identity, bio, avatar, counts |
    | 7 | `GET /users/{user_id}/stats` | `users_router.py:184-262` | required | **404**, before the private gate at `:200-208` | Reading stats are the subject's |
    | 8 | `GET /users/search` | `users_router.py:39-111` | required | **Exclude** from results, beside the `id != current_user.id` filter at `:59` | A block that leaves the reader findable is not a block |
    | 9 | `GET /users/following` | `users_router.py:114-170` | own | **Filter** — the response carries `name`, `username`, `bio` (`:27-36`) | R-21 makes it empty; the response carries identity, so it is filtered anyway |
    | 10 | `GET /userbooks/user/{id}` | `userbooks_router.py:482-537` | required | **404**, before the private gate at `:495-500` | Their library |
    | 11 | `GET /userbooks/friends/currently-reading` | `userbooks_router.py:540-620` | required | **Filter** — carries `user.name` and `profile_picture` (`:600-606`) | Same reasoning as 9 |
    | 12 | `GET /books/recommendations` | `books_router.py:225-331` | required | **Filter** — carries `friend_name` (`:271`, `:291`, `:326`) | A recommendation reading "Because B is reading this" is B reaching the reader |
    | 13 | `GET /reading-activity/user/{id}/daily` | `reading_activity_router.py:225-276` | required | **404**, before the private gate at `:239-244` | Their activity |
    | 14 | `GET /groups/{id}/posts` | `groups_router.py:820-864` | member/public | **Filter** post authors — **E-2** | A circle both belong to |
    | 15 | `GET /groups/{id}/activity` | `groups_router.py:1112-1153` | member/public | **Filter** event actors — **E-2** | Carries `user.name` at `:1145-1151` |
    | 16 | `GET /groups/{id}/members` | `groups_router.py:594-627` | member/public | **Proposed: no change** — **E-2** | A membership row is structure, not content; hiding it desynchronises `member_count` (`:93`, `_member_count` `:34-40`) |
    | 17 | `GET /groups/{id}/leaderboard` | `groups_router.py:922-...` | member/public | **Proposed: no change** — **E-2** | A viewer-dependent leaderboard is not a leaderboard |
    | 18 | `POST /groups/{id}/invite/{user_id}` | `groups_router.py:730-761` | curator | **403** for a blocked pair, before the row at `:746-749` | Inviting is contact |
    | 19 | Notifications | `dispatcher.py:113-214` | — | **Suppress** a blocked pair, in `fire_event`'s per-recipient loop at `:166-202`, beside the bot check at `:99-101` | A push is contact that bypasses every filter above |
    | 20 | `GET /notifications/history` | `notifications/router.py:139-169` | own | **No change** — rows already sent stay | History is a log. Rewriting it would make a delivered notification vanish, and the row carries no reader name (`:158-168`) |
    | 21 | `GET /groups/my`, `/groups/discover`, `GET /groups/{id}` | `:218`, `:321-405`, `:459` | required | **No change** | The only identity is `creator_name` (`_serialize_group` `:83`, discover `:392`). Hiding it would hide the circle |
    | 22 | `GET /notes/me`, `/notes/userbook/{id}`, `/profile/me`, `/userbooks/`, `/userbooks/{id}`, `/reading-activity/daily`, `/reading-activity/insights`, `/journals/*` | — | own | **No change** | Own content only |
    | 23 | `GET /admin/*` | `admin_router.py` all | admin | **Never filtered** | Moderation needs the unfiltered truth. An admin who blocked a reader must still see their reported post |
    | 24 | `GET /bots/posted` | `bots_router.py:36-61` | bot only | **No change** | Returns dedup keys, no reader data, and 403s a reader at `:44-48` |
  - **The decision rule the table follows, so a future endpoint is classified without re-litigating:**
    **if a response carries another reader's name, avatar, or words, it is filtered or 404'd; if it
    carries only an id or an aggregate, it is not.** That is why 9, 11 and 12 are filtered even though
    R-21 already empties them, and why `GET /follow/followers` and `GET /follow/following`
    (`follow_router.py:79-87`) are **not** — they return `{"follower_id": n}` and nothing else, the row
    cannot exist under R-21's invariant, and filtering them would desynchronise the client's own
    follow-button state.
  - **404 and not 403, and not an empty 200.** Every refusal above uses the status the surrounding code
    already uses for "not visible to you": `notes_router.py:480` and `profile_router.py:243-246` use
    403 and a `locked` flag for a private profile, and `likes_comments.py:20` uses **404** with the
    comment "404 hides a private note's existence". A block must not be distinguishable from a deleted
    account, so it takes the 404 form, not the private-profile form.
  - **Mutation:** remove the filter from any one row of the table. Each must turn its own named test
    red. A single test covering "the feed" is not coverage of this requirement.
- [ ] **R-23 One helper, one shape, one query. (Proved on this branch — see architecture §"The filter, proved".)**
  - **Accept:**
    - A single module-level helper returns the set of user ids invisible to a viewer, in **exactly one
      SQL statement**, from one `select(Block.blocker_id, Block.blocked_id).where(or_(...))`.
    - It is **not** built from `union(...)`. Verified on this branch: `union()` through SQLModel's
      `Session.exec()` returns `Row` tuples, not scalars, and feeding them to `notin_()` raises
      `ProgrammingError: type 'Row' is not supported`. The two-arm `or_` on one select avoids the trap
      and is still one statement.
    - Every filtered path calls that helper once and passes the result to `notin_()`. The filter itself
      adds **no** statement — proved.
    - An empty set is safe and needs no special case: on the pinned SQLAlchemy 1.4.41, `notin_([])`
      emits `NOT IN (SELECT 1 FROM (SELECT 1) WHERE 1!=1)`, returns every row, and raises no warning.
      Verified, because "no blocks" is the state of all 131 readers on day one and a crash there would
      be the whole product.
    - The helper runs **after** an endpoint's early return, never before, so the eight `empty_state`
      budget rows keep their counts (R-29).
  - **Why a fetched set and not a correlated `NOT EXISTS`.** `NOT EXISTS` was tried and works in zero
    extra statements (architecture §"The filter, proved", case F) and was **rejected**: it has to be
    hand-written into every one of the fourteen queries, each a place to get the two `or_` arms backwards
    and ship a silently one-directional block; and it leaves every query budget unchanged, so the
    guard that would otherwise prove the filter ran tells you nothing. The one extra statement per
    request **is** the evidence.
  - **Mutation:** build the set with `union()` (the `Row` failure must surface in a test, not in
    production); call the helper inside a loop; drop one of the two `or_` arms.
- [ ] **R-24 A blocked reader cannot act on the blocker, and the refusals land before any row and before any notification.**
  - **Accept:**
    - Follow → 403 (R-21). Like, unlike, comment → the `_assert_can_view_note` refusal (R-22 row 5).
      Circle invite → 403 (row 18). Report → 404, because the target is not visible (R-02).
    - Every refusal is **before** the row is written and **before** any
      `background_tasks.add_task(fire_event, ...)` is registered. This is the ordering
      `deny_bot_actor` was made a dependency for (`app/deps.py:196-200` states exactly this reason),
      and it is the ordering, not a side effect of it.
    - Deleting a like or a comment made **before** the block is not required and is not done. The
      counts on the blocker's post stay honest; the blocked reader's comment disappears from the
      blocker's view by R-22 row 4.
  - **Mutation:** check the block inside the handler body instead of before it (a test must then see a
    notification fired for a refused action); allow a like; allow an invite.
- [ ] **R-25 A notification is never delivered between a blocked pair.**
  - **Accept:**
    - `fire_event` skips a recipient who is in a blocked pair with the actor, in the same per-recipient
      loop that already skips the actor (`dispatcher.py:167-170`) and already skips a bot recipient
      (`_user_wants_event`, `:99-101`). No `NotificationLog` row is written and no push is sent.
    - The skip is counted and returned in the summary dict (`:207-212`) under its own key, so a
      suppressed delivery is visible in the logs rather than indistinguishable from "nothing happened".
    - `POST /admin/push/broadcast` (`admin_router.py:397-434`) is **not** filtered: it is an
      announcement from TrackMyRead, not from a reader, and it does not go through `fire_event`.
  - **Mutation:** move the check outside the loop; let the block check pass for one event type; make
    the suppression write the log row anyway.
- [ ] **R-26 Circles: a block hides content and leaves structure alone. (Subject to E-2 — this is the one with no obviously right answer.)**
  - **Accept (the proposal):** inside a circle both readers belong to, `GET /groups/{id}/posts` and
    `GET /groups/{id}/activity` filter the blocked reader out; `GET /groups/{id}/members`,
    `member_count` and the leaderboard do not.
  - **The residual this leaves, stated plainly:** A will still see B's name and avatar in the Members
    list and in the leaderboard of a circle they share, and the circle's member count will include B.
    So the block is not total inside a circle, and a reader who blocks someone in their book club will
    notice.
  - **The alternative that removes the residual** is to make co-membership impossible: a block ejects
    the blocked reader from circles the blocker created, and `POST /groups/{id}/join`,
    `/groups/join/{invite_code}` and `/groups/{id}/invite/{user_id}` refuse. That is a much stronger
    act — it removes a reader from a group they belong to, as a side effect of someone else's block —
    and it is **E-2**, not an architect's call.
  - **Mutation:** filter the member list (`member_count` must then disagree with it, and a test must
    catch the disagreement); leave the posts unfiltered.
- [ ] **R-27 Bots, anonymous viewers and self.**
  - **Accept:**
    - **A bot is blockable.** A reader who does not want `@TMRBot` in their feed can block it, and the
      feed filter (R-22 row 1) removes its posts for them only. The symmetric half is inert — a bot
      reads no feed, and `deny_bot_actor` means it holds no follow, like or comment to lose. A test
      asserts that blocking a bot does not 500, fires no notification, and leaves every other reader's
      feed unchanged.
    - **A bot cannot block.** `deny_bot_actor` is a dependency on `POST /blocks/{user_id}`.
    - **Blocking yourself is 400**, before any row, the way `follow_router.py:15-16` refuses a
      self-follow.
    - **Blocking the admin is allowed.** It hides the admin's reader-facing content from that reader
      and changes nothing about `get_admin_user` or any `/admin/*` route (R-22 row 23). An admin's
      moderation power is not a reader relationship.
    - **An anonymous request has no block set** (E-8). `GET /notes/feed` with no token returns the
      unfiltered public feed. This is a real limit of the design and the reader is not told otherwise.
  - **Mutation:** let a bot block; let a reader block themselves; filter `/admin/*` by the admin's own
    blocks; apply a block to the anonymous feed using some other reader's set.
- [ ] **R-28 The reader can see and undo what they have done.**
  - **Accept:**
    - `GET /blocks` returns the viewer's blocks — the readers **they** blocked, with name, username and
      avatar. It never includes readers who blocked them, because R-20 says B learns nothing.
    - A blocked-readers list exists in Settings on both clients, with Unblock. Web:
      `SettingsPage.jsx`'s privacy block, which today holds only the private-profile toggle
      (`handlePrivacyToggle` at `:236-245`, state at `:104-105`). Mobile: `SettingsScreen.js`'s
      Privacy section, which opens at `:449` and holds only `togglePrivacy` (`:216-221`).
    - The block confirm says, before the tap, that the two will stop seeing each other **and that any
      follow in either direction will be removed and will not come back**. R-21 is irreversible and a
      reader must not discover that afterwards.
    - Unblock does not notify anybody and does not restore a follow.
  - **Mutation:** include inbound blocks in `GET /blocks` (the "B cannot see the block" test must go
    red); drop the follow warning from the confirm copy; make Unblock restore the follow.
- [ ] **R-29 The query-budget guard will fail, that is the guard working, and the numbers are re-measured rather than relaxed.**
  - **Verified by reading `tests/test_query_budget.py` on this branch, not assumed:** `BUDGETS` is 67
    rows over 44 endpoints (`:570`, the literals `EXPECTED_ROWS = 67` and `EXPECTED_ENDPOINTS = 44` at
    `:715-716`), with `budget == expected` on every row — margin zero, stated at `:30-32`. Adding one
    statement to a feed query fails that row by design.
  - **Accept:**
    - **4I-A (Report) moves nothing.** It adds no statement to any existing endpoint. Its two new
      endpoints are admin-only and are not added to the table — see E-7 for why they *cannot* be
      without touching another sprint's document.
    - **4I-B (Block) moves exactly 24 of the 67 rows, each by +1**, and 43 are unchanged. The full
      table is in architecture §"Which budgets move". Summary: `03`, `03p`, `03f`, `06`, `06f`, `07`,
      `08`, `08e`, `09`, `11`, `11f`, `13`, `14`, `14n`, `22`, `23`, `24`, `24f`, `27`, `27f`, `36`,
      `36p`, `37`, `37p`.
    - **Every number is re-measured on the branch and written into the table in the same commit as the
      filter.** No budget is widened beyond its measured count: `test_the_table_is_whole` enforces
      `budget <= expected + 1` (`:824-830`), so a padded budget is itself a failure.
    - **`BQ-08e` is the one with no headroom left.** `test_empty_accounts_keep_their_early_returns`
      carries a hard ceiling — `if m.n > 3` (`:959-963`), "an early-return guard costs 1-2 plus
      authentication". `/notes/feed` on an empty database goes 2 → 3, which passes **at** the ceiling.
      The next statement added to that endpoint by anyone fails a second guard, not just a budget.
      Written here so that is a known state and not a surprise.
    - **`BQ-24` is a `TARGET` row, not a ratchet** (`GET /users/{id}/stats`, expected 3, the measured
      post-fix count of the only N+1 optimisation that shipped). It goes 3 → 4. It **stays** `TARGET`:
      the N+1 fix is untouched, and `test_only_two_targets_the_rest_are_ratchets` (`:832-842`) asserts
      which *endpoints* are targets, not their counts. Flagged because moving the project's only
      delivered optimisation number deserves to be a decision, not a diff.
    - **The large seed must contain `block` rows**, or `test_no_endpoint_scales_with_row_count`
      (`:880-936`) proves nothing about the new filter: it compares `seed(1)` against `seed(10)` and
      fails on any difference, which is exactly the case that catches a per-row block lookup. The trap
      to avoid while doing it: that test also asserts `len(bigger) >= 5` (`:908-911`) — at least five
      endpoints must return a *longer* body on the large seed — and blocks shorten bodies. Seed the
      blocks between readers who are not the ones those five rows measure.
  - **Mutation:** raise a budget above its measured count; leave a moved row at its old number (CI must
    fail and name the endpoint); add the filter before an early return (an `empty_state` row must then
    break).
- [ ] **R-30 Both clients, and each client change is a store release.**
  - **Accept:**
    - **Web** (`book-tracker-frontend-stitch`): Report and Block on the six sites of R-05, a blocked
      list in Settings, and the Reports tab in `AdminPage.jsx` — the tab string joins
      `const TABS = ['overview', 'users', 'content', 'push']` at `:136`, with a lazy loader modelled on
      `loadContent` at `:103-113` and a panel after the existing content panel. The admin page is
      reached through the `AdminRoute` guard at `App.jsx:70-76`, route `/admin` at `:94`.
    - **Mobile** (`book-tracker-mobile-stitch`, iOS **and** Android from one binary): Report and Block
      on the six sites of R-05, and a blocked list in Settings. `version` (`app.json:6`, `2.2.4`) and
      `android.versionCode` (`:41`, `63`) are bumped, because `scripts/check-version-bump.js` gates the
      build and `__tests__/versionGuard.test.mjs` asserts it.
    - **No OTA channel exists.** Verified: no `expo-updates` dependency, no `updates` key and no
      `runtimeVersion` in `app.json`, no `channel` on any `eas.json` build profile, and
      `cli.appVersionSource: "local"`. So a client change is a store release on both stores, with a
      review wait on iOS. **That is the argument in E-5 for one client release carrying both halves.**
    - **Every new string lands in all six locales.** `book-tracker-mobile-stitch/src/i18n/locales/`
      holds `en, ru, es, pt, de, fr`, and `__tests__/i18nParity.test.mjs` asserts identical key sets and
      matching placeholders across them — a new English-only string fails CI. The accessibility labels
      belong in `en.json`'s `a11y` section (opens at `:517`, with `postOptions` at `:528`).
    - **`__tests__/apiContract.test.mjs` cross-checks every mobile `api.js` call against the real
      FastAPI routers.** A client function for `/reports` or `/blocks` fails until the route exists, so
      the client package cannot merge ahead of the API package. That is a dependency, not a problem.
  - **Mutation:** add a string to `en.json` only; ship a client call for a route that does not exist;
    skip the version bump.
- [ ] **R-31 Each requirement is testable by breaking the product, and what cannot be is named with its substitute proof.**
  - **Accept:** every Critical and Major case in architecture §Test strategy names the one-line product
    change that must turn it red.
  - **What cannot be tested, and what stands in for it:**

    | # | Not testable in CI | Why | Substitute proof |
    |---|---|---|---|
    | 1 | That App Review accepts this as satisfying 1.2 | It is a human judgement on a submission | The four-row table at the top of this document, pasted into the submission notes with the exact in-app path to Report and to Block. Plus screenshots of both flows. No CI substitute exists and this document does not invent one |
    | 2 | "Timely responses" | It is an operational commitment, not code | The admin notification (R-03) is the code half and is tested. The response-time commitment is **E-3** and belongs in `pm-decisions.md`. A page with no owner is not a mechanism |
    | 3 | That a block leaks on no path | A test can only cover the paths someone enumerated | R-22's table is the enumeration, and the *route-coverage test* is the guard on it: a test that walks `app.routes`, asserts the count of routes serving another reader's content against a literal, and fails when a new route appears un-classified. A new endpoint added later therefore fails a test instead of silently leaking |
    | 4 | That the mobile Report item is reachable by touch | `node --test` does not render | The source scan of R-05 (the `botBadge.test.mjs` pattern) proves the item exists at each site and is not inside a closed gate; the touch target is covered by the existing `__tests__/a11yTouchables.test.mjs` pattern; and one manual pass per surface on a device, screenshotted for the submission notes |
    | 5 | Push suppression between a blocked pair end to end | Expo and Web Push are external | `fire_event` is called with a blocked pair and asserted to write no `NotificationLog` row and to call neither `send_expo_push` nor `send_web_push` (both monkeypatched). The live check is one manual run with two review accounts |

## Done checklist

1. The PM has answered **E-1** (block symmetry), **E-2** (circles), **E-3** (what a report does, and
   the response-time commitment) and **E-5** (the split). Recorded in `pm-decisions.md`.
2. The PM has run SQL step **10** (`report`) and sent back the verification output.
3. The Report API deploys **with** `("report", "reason")` in `schema_guard.REQUIRED_COLUMNS` — in the
   deploy **after** step 2, never the same push.
4. A report filed from the web client appears in `GET /admin/reports` and the admin's device receives
   one notification containing no reported text.
5. The PM has run SQL step **11** (`block`) and sent back the verification output.
6. The Block API deploys with `("block", "blocked_id")` in `REQUIRED_COLUMNS`, after step 5.
7. `pytest tests -q` passes above the CI floor (currently **814**,
   `.github/workflows/ci-tests.yml:68`), with **no edits to any existing test** except the budget
   numbers of the 24 rows in R-29 and the budget seed's new `block` rows.
8. `node --test qa/unit/*.test.mjs` and `node --test book-tracker-mobile-stitch/__tests__/*.test.mjs`
   pass above their floors (38 and 140, `ci-tests.yml:118` and `:168`), both raised in the same commit.
9. The fourteen filtered paths of R-22 each have a passing test **and** a recorded mutation that turns it
   red. A path with a test and no mutation does not count.
10. `SELECT count(*) FROM follow f JOIN block b ON (f.follower_id=b.blocker_id AND f.followed_id=b.blocked_id) OR (f.follower_id=b.blocked_id AND f.followed_id=b.blocker_id)`
    returns **0** on production.
11. `SELECT reporter_id, target_type, target_id, count(*) FROM report GROUP BY 1,2,3 HAVING count(*)>1`
    returns no rows.
12. One review account blocks another on the web client; the blocked account signs in on the mobile
    client and sees no trace of the blocker on any of the six surfaces. Done by hand, both directions.
13. One review account deletes itself after blocking and being blocked; `SELECT count(*) FROM block
    WHERE blocker_id NOT IN (SELECT id FROM "user") OR blocked_id NOT IN (SELECT id FROM "user")`
    returns 0.
14. `dependency-map.md` regenerated (`python scripts/gen_dependency_map.py`) so the new routes have
    consumers listed.
15. The store release carrying both affordances is submitted, with the 1.2 table and the screenshots in
    the submission notes, and does not come back with a 1.2 rejection.
