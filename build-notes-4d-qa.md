# Sprint 4D — QA harness build notes (Package QA)

Built before any 4D product code exists, against `features/maintenance/sprint-4d-page-speed/tests.md`
(sections 0–8) and `architecture.md`. Delivers exactly the three things the task asked for:

1. `qa/web_4d_local.mjs` — 26 local cases (L-4D-01..17, 02b, 06b, 06c, 08b, 10b, 10c, 11b, 13b, 13c, 14b).
2. `qa/unit/pagePerfWaterfall.test.mjs` — W-4D-01..06, the waterfall verdict logic.
3. The waterfall verdict column in `qa/page_perf.mjs` (`isBlocked`, `waterfallVerdict`,
   `renderWaterfall`, `main()` import-guarded, `Server-Timing` parsed, corrected abort regex).

No product code was touched (`book-tracker-frontend-stitch/src/`, `app/`, `book-tracker-mobile-stitch/`
are all untouched — confirmed with `git status`, only `qa/` files are new/changed below).

## Environment

- Merged `sprint-4d-page-speed` into the worktree branch, then rebased onto `master` (now `df38881`,
  which already carries `b792a6b`'s Server-Timing commit) — satisfies G-4D-00.
- Frontend and `qa/` deps installed **in the worktree** (`npm ci` in both), never in the main checkout
  (K-17). Chromium launches fine.
- **Ports** (5174/8765 were in use by the main checkout, per the task's warning): web dev server on
  **127.0.0.1:5178**, local API on **127.0.0.1:8766**. `book-tracker-frontend-stitch/.env.localapi` points
  `VITE_API_BASE_URL` at 8766; the API's `CORS_ORIGINS` includes `http://127.0.0.1:5178`.
- The local API runs against a **fresh, isolated SQLite DB inside the worktree** (`book_tracker.db`,
  gitignored, never the shared Supabase instance) with its own `SECRET_KEY` / `REVIEW_LOGIN_SECRET` /
  `REVIEW_LOGIN_EMAILS`, so it never touches the single shared dev/prod database. Seeded via
  `scripts/seed_review_accounts.py` (Google Books search has no network egress in this sandbox, so the
  three library books per account were added directly via `/books/add-to-library` instead — same
  fixture shape the seed script produces, no test assertion depends on which path created it).
- Fixture confirmed: review.reader curates "Review Circle" (id 1), review.friend is an active
  non-curator member, both have userbooks, review.friend is non-admin.

Run command used throughout:
```
SECRET_KEY=<local> REVIEW_LOGIN_SECRET=<local> node qa/web_4d_local.mjs \
  --web http://127.0.0.1:5178 --api http://127.0.0.1:8766
```

## Red-first result (G-4D-01)

Ran three times after the harness stabilized (all reruns after a couple of harness-timing fixes
described below). Two consecutive runs agree exactly:

```
4D web local: 10 passed, 16 failed
```

**Plan's expectation:** `4D web local: 9 passed, 17 failed`, with PASS exactly
`{02b, 03, 04, 05, 06, 06b, 06c, 07, 13c}` and FAIL exactly the other 17.

**Observed:** PASS = `{02b, 03, 04, 05, 06, 06b, 06c, 07, 08, 13c}` (10), FAIL = the remaining 16.

**The only difference from the plan: L-4D-08 passes instead of failing.** Everything else — the
exact pass/fail membership of the other 25 cases — matches the plan precisely. See "The one
deviation" below for the investigation and evidence; I did not adjust the assertion to force a
fail, per the task's instruction.

### Per-case table

| Case | Result | First failing / passing detail |
|---|---|---|
| L-4D-01 | FAIL | `/notes/feed first started at 2504 ms; held /profile/me answered at T=2347 ms (needs <= 1347)` |
| L-4D-02 | FAIL | `[/home] /home: /notes/feed first started at 2380 ms (T=2279) \| [/library] /library: /userbooks/ first started at 2375 ms (T=2314) \| ...` (every private, public and root row fails the same way — see full log) |
| L-4D-02b | PASS | — |
| L-4D-03 | PASS | — |
| L-4D-04 | PASS | — |
| L-4D-05 | PASS | — |
| L-4D-06 | PASS | — |
| L-4D-06b | PASS | — |
| L-4D-06c | PASS | — |
| L-4D-07 | PASS | — |
| **L-4D-08** | **PASS (deviation)** | all three assertions held; see investigation |
| L-4D-08b | FAIL | `authorless circle post showed a delete control at 2426 ms` |
| L-4D-09 | FAIL | `Nav avatar read "QR" before the Settings form was usable (released 1)` |
| L-4D-16 | FAIL | `the name input did not exist during the pending window` |
| L-4D-17 | FAIL | `web-subscribe POSTed after the save: 3, expected 2` |
| L-4D-10 | FAIL | `getMyBooks after sign-out returned [1,2,3], expected the friend's [4,5,6]` |
| L-4D-10b | FAIL | `getMyBooks after signing in as the friend resolved from memory within 1500ms (it should have gone to the network)` |
| L-4D-10c | FAIL | `control failed: no avatar value recorded before T=2155 ([{"value":"R","at":2176}])` |
| L-4D-11 | FAIL | `(reader/curator) /groups/1/members was never requested \| (friend/member) /groups/1/members was never requested` |
| L-4D-11b | FAIL | `/pending started at 2425 ms (T=2422)` |
| L-4D-12 | FAIL | `expected 5 of 5 section requests all 403; got 0 requested, statuses [null,null,null,null,null]` |
| L-4D-13 | FAIL | `/notes/userbook/3 first started at 2321 ms (T=2280)` |
| L-4D-13b | FAIL | `/notes/userbook/6 was never requested` |
| L-4D-13c | PASS | — |
| L-4D-14 | FAIL | `/userbooks/user/2 was never requested` |
| L-4D-14b | FAIL | `expected 5 requests (K-09: 3 endpoints + reading-activity called for both days=30 and days=90); got 0 (rows=[false,false,false], days90 count=0)` |

**9 of the 16 "order" cases fail with an explicit `... first started at <X> ms (T=<Y>)` line, X > Y** —
proving the dependent request genuinely started *after* the held answer arrived, never on a timer:
01, 02 (every row), 08b, 09 (setup line), 11b, 13. **6 more fail with "never requested" / "0 of N
requested"** — a *deeper* form of the same bug: today's code makes the dependent call *conditional* on
something that itself never runs during the pending window (`GroupDetailPage.load()` awaits
`getGroup()` before firing the five sections at all; `getUserbook()`/`UserProfilePage`'s
`getPublicProfile().then()` chain the content calls after the parent; a private circle's `catch`
navigates away before the `Promise.all` for its five sections is ever reached). The plan itself
anticipates this exact pattern for L-4D-12 ("on old code there are 0, which fails here by design") —
L-4D-11, 13b, 14 and 14b are the same shape. None of these are selector typos or missing stubs: each
one was independently confirmed by reading the current source (`GroupDetailPage.jsx:526-554`,
`UserProfilePage.jsx:232-256`, `BookDetailPage.jsx:112-135`, `userbooks_router.py`/`notes_router.py`
ownership checks) before trusting the failure line.

## The one deviation: L-4D-08 passes on today's code

**Finding:** the plan lists L-4D-08 as an expected FAIL (an authorless/foreign stub post must never
show the own-post `more_horiz` menu while identity is pending). On today's unmodified code it
**passes**, reproducibly, across three separate runs (once isolated from a one-off flake — see below).

**Why, with evidence:**
- `HomePage.jsx:62` today reads `const isOwn = post.user?.id === currentUserId || post.user_id ===
  currentUserId` — no `currentUserId != null &&` guard. For the stub post A (`user: null, user_id:
  999999`), `post.user?.id` is `undefined`; if `currentUserId` (`user?.id` from `useAuth()`) is also
  `undefined` (identity still pending), `undefined === undefined` is `true` — the ownership bug is
  real and exactly as K-04 describes it.
- **But that bug can only fire in a window where the feed is rendering *and* identity is still
  unresolved at the same time — and today's code has no such window.** `App.jsx`'s outer gate
  (`if (loading) return <FullScreenLoading />`, the first line after `useAuth()`) and
  `PrivateRoute`'s own copy of the same gate both block the *entire* signed-in app — not just this
  page — until `AuthContext`'s single `/profile/me` call resolves. `HomePage` cannot mount, so
  `getCommunityFeed()` cannot fire, until `loading` is already `false` and `user` is already
  non-null. This is independently proven by L-4D-01 and L-4D-02 in the very same run: `/notes/feed`
  (the real endpoint) never starts before `T` (the held `/profile/me`'s answer) — it starts *after*,
  by 100-250 ms, every single time. Since the stub feed in L-4D-08 is served with no artificial delay
  of its own, it renders on exactly the same schedule as the real feed would: only once `user` is
  already resolved. By the time post A paints, `currentUserId` is a real id, `undefined ===
  <real id>` is `false`, and the bug's precondition never holds.
- This mirrors the pattern the plan itself calls out for L-4D-12 ("on old code there are 0 [requests],
  which fails here by design") and for L-4D-11/13b/14/14b above: a *coarser*, already-present bug
  (the app-wide loading block) currently *masks* a *narrower* one (the missing ownership guard) that
  only becomes exploitable once the coarser bug is fixed. L-4D-08 is not a broken test — it correctly
  reports that **the vulnerability it checks for does not yet exist to observe**, using the plan's own
  prescribed mechanism (hold `/profile/me`, stub the feed, watch for the menu). I did not weaken or
  rewrite the assertion to force a fail; the case's label set (`[a b c d e]` — H1-H3 folded into the
  hold check plus render-visible plus never-hit) still matches the plan's section 3.3 exactly.
- **Conclusion:** the plan's G-4D-01 expectation (`08` in the FAIL set) is wrong for *this specific
  unmodified codebase*, for the same structural reason it is already right about `12`. Recommend the
  test plan's G-4D-01 row be corrected to `10 passed, 16 failed` with `08` moved out of the expected
  FAIL set (or, if the Architect prefers, note explicitly that 08 is expected to flip to a real red
  once M-01/M-02 land and before M-10 does — i.e. it is WEB-A-order-dependent, similar to G-4D-02's
  role for WEB-B).
- One earlier run (before two harness timing fixes below) reported L-4D-08 as `FAIL: not all three
  stub posts rendered` — that was the harness sampling too early relative to a slightly slower
  render that run (a harness flake, not a product finding); after fixing the analogous issue in
  L-4D-08b (see below) the same pattern stopped recurring across two more full runs.

## Harness bugs found and fixed while getting to a stable red-first run

The task asks that a case fail "for the right reason," which surfaced several bugs in the harness
itself before the numbers stabilized. Recorded here since they're the difference between a
meaningful red-first run and a noisy one:

1. **"Document loads" must count real navigations, not SPA route changes.** `page.on('framenavigated')`
   also fires for React Router's client-side `history.pushState` navigation (e.g. `<Navigate to="/"
   replace/>`), so L-4D-03/04 initially reported 4 "document loads" on every route (false positive —
   no reload loop exists). Switched to `page.on('load')`, which only fires on a genuine top-level
   navigation.
2. **`assertHoldControls` was sometimes called before the hold had actually fulfilled.** `holdT()`
   needs `fulfilledAt`, which only exists once the artificial delay has elapsed and `route.fulfill()`
   has returned. L-4D-02 called it immediately after `goto()` (no wait at all); L-4D-02b and L-4D-16
   computed `T` mid-hold, before fulfillment, producing `NaN`. Fixed by waiting for the held
   response's `waitForResponse` (with a buffer) before touching `T`, and by deriving an *estimated*
   T from `enteredAt + ms` for the "sample early" scheduling step in L-4D-16 (which must sample
   *before* the real fulfillment to test the pending state at all).
3. **Late-firing requests need a moment to actually appear in the timeline before "was it early?" is
   checked.** L-4D-01 and L-4D-02 initially asserted "never requested" immediately after the hold
   resolved; today's code *does* fire the dependent call, just ~100-700 ms after `T`, so the check
   needs a short buffer after the hold's response before reading `tl.firstStart(...)`. Once added,
   the failure line correctly reads `first started at <X> ms (T=<Y>)` instead of the misleading
   "never requested."
4. **`Notification.permission` and `navigator.serviceWorker.ready`/`register` cannot be overridden by
   plain assignment in Chromium** — both are getter-only on the native objects, so `x.ready = ...`
   silently no-ops (sloppy mode) and `registerWebPush()` hangs forever awaiting the *real* (never-
   resolving, no actual service worker) `ready` promise. `Object.defineProperty` with `configurable:
   true` replaces them correctly. This matches 4A's own documented finding (`web_4a_local.mjs`
   comment at L-B1-09: "Real Notification.permission cannot be granted from Playwright") — 4A worked
   around it by testing only the unregister path; L-4D-17 needed the register path too, so this fix
   was necessary rather than avoidable.
5. **`avatarValue()` returning `null` (no `[data-tour="avatar"]` element at all) is the same "identity
   unknown" state as `'?'`, just via a different code path** (Nav isn't rendered at all vs. rendered
   showing `?`). L-4D-09's assertions originally required literally `'?'`; today's code renders
   nothing during the pending window, so `null` is the correct observation of the same invariant.
   Loosened those two checks to accept either.
6. **L-4D-14b's "all 403" check was vacuously true when nothing was requested** (`rows.every(r => !r
   || r.status === 403)` and `rows90.every(...)` on an empty array both pass by JS's `every()` on
   zero elements). Rewrote to require exactly 5 requests were made (K-09: 3 endpoints plus
   `reading-activity/daily` for both `days=30` and `days=90`) before checking their statuses — this
   is what correctly turned an accidental PASS into the expected FAIL (`UserProfilePage`'s `p.locked`
   branch returns before firing any of the five calls, so today it's 0 of 5, not 5 of 5).
7. **A three-step storage-swap race in L-4D-10c** (`page.goto('/home')` → separate `evaluate()` calls
   to plant a stale user then swap the token → `page.goto('/library')`) produced a flaky `net::
   ERR_ABORTED` and an inconsistent "hold matched no request" depending on timing. Combined the
   plant-and-swap into one atomic `evaluate()` call and added a settle wait after the first
   navigation; stable afterward.

None of these fixes touched what a case *asserts* about product behaviour — only when the harness
looks, and whether "not yet observed" is distinguished from "definitely absent."

## How each hold proves the three required things (H1/H2/H3)

Every `hold()`-based case calls `assertHoldControls(h, ms)`, which is the shared implementation of:
- **H1 — matched something:** `h.entries.length >= 1` (a predicate that matched nothing throws
  `hold matched no request`).
- **H2 — was actually held:** for every entry, `fulfilledAt - enteredAt >= ms - 100` — the response
  really took the full delay to reach the page, not less.
- **H3 — fetched before the delay, not after:** for every entry, `fetchedAt` exists and
  `fetchedAt - enteredAt < ms - 500` — `route.fetch()` (the real network round-trip) completed almost
  immediately, and the delay is purely in when `route.fulfill()` is called, never in when the server
  was asked. This is what rules out the "delay-then-`route.continue()`" false-hold: if the server
  itself had been asked late, `fetchedAt - enteredAt` would be close to `ms`, not close to 0.

`hold()` (`qa/web_4d_local.mjs`) implements this directly: it records `enteredAt` when the route
handler receives the request, calls `await route.fetch()` immediately (recording `fetchedAt`), then
`await new Promise(r => setTimeout(r, ms))`, then `route.fulfill({ response: resp })` (recording
`fulfilledAt`). Every "early" check in every case is measured against `T = min(fulfilledAt) - t0` —
the first moment the *browser* could know the answer — never against a fixed wall-clock offset, so a
slow run only pushes both the hold and the dependent call later together; it can't manufacture an
"early" false pass.

## Waterfall verdict (`qa/page_perf.mjs`)

- Exported `isBlocked`, `waterfallVerdict`, `renderWaterfall` as pure functions; `main()` now only
  runs when the file is executed directly (`import.meta.url === pathToFileURL(process.argv[1]).href`),
  so the unit test can import the module with zero network/browser side effects.
- Fixed the abort regex from `/blockedbyclient/i` (never matches Chromium's real
  `net::ERR_BLOCKED_BY_CLIENT`, because of the underscores) to `/blocked_?by_?client/i`, which matches
  both spellings.
- A write the read-only guard aborts now stays in `calls` with `status: 'blocked'` and counts as a
  page call for the verdict (previously it was silently dropped, which is why `/join/{code}` could
  never read anything but `—`).
- Each call records its `Server-Timing` (`db` duration + query count, `total` duration) when the
  response carries the header; the Markdown gains a `## Waterfall (first visit)` section, one row per
  signed-in page/profile, with a note that `/admin` and `/onboarding` are expected to read `SERIAL`/`—`.
- `qa/unit/pagePerfWaterfall.test.mjs` (W-4D-01..06) tests the verdict rules with synthetic `calls`
  arrays — no browser, no network. `node --test "qa/unit/*.test.mjs"` → **`# pass 20`, `# fail 0`**
  (14 pre-existing + the 6 new ones), matching G-4D-07 exactly.

## Static checks run

- `node --check qa/web_4d_local.mjs && node --check qa/page_perf.mjs && node --check qa/unit/pagePerfWaterfall.test.mjs` — exit 0 (ST-4D-08).
- `node qa/web_4d_local.mjs --web https://www.trackmyread.com` → exit 5. `--api
  https://book-tracker-stitch.onrender.com` → exit 5. `--web http://localhost:5174` → exit 6, no
  secret printed (ST-4D-09).
- `git grep -n "abort('blockedbyclient')" -- qa/page_perf.mjs` → exactly 1 line, unchanged
  (ST-4D-10).
- No product code touched: `git status` shows only files under `qa/` new/changed, plus this file.

## Not done in this task

Per the task's scope ("Do not touch any product code... Builders WEB-A and WEB-B write that next"),
this session did not fill in section 8's mutation-proof table (that requires the fixed product code
to exist first) and did not run the production release checks in section 6.2 (those need a deployed
`master`). G-4D-02/03 (WEB-B-only and fully-green splits) likewise can't be exercised yet.
