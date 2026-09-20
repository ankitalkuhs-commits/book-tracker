# Sprint 4D — Package WEB-B build notes

Scope (exclusive, per the brief): `book-tracker-frontend-stitch/src/pages/GroupDetailPage.jsx`,
`BookDetailPage.jsx`, `UserProfilePage.jsx`. No other product file touched. `app/`, `qa/`,
`book-tracker-mobile-stitch/` untouched (confirmed with `git status` before commit).

Merged `sprint-4d-page-speed` (`--no-ff`) into this worktree's branch on top of `b792a6b`; the merge
commit is `0751a33` and includes `3a56251` (Package QA merge). `qa/web_4d_local.mjs` existed before any
WEB-B code was written.

**Update (second pass):** the coordinator independently verified the pathname-collision diagnosis in
this document's first version and landed a harness fix, `ff055cc` on `sprint-4d-page-speed` ("harness
holds must match the API origin, not the app's own" — a new `isApi()` guard in `hold()` and every other
route install). Merged into this worktree with `git merge --no-ff sprint-4d-page-speed` → commit
`037af27` (clean fast-forward-shaped merge, `qa/web_4d_local.mjs` only, no conflict). That pass landed at
`4D web local: 16 passed, 10 failed` (target met), with `L-4D-08b` and `L-4D-14b` still red for two
*different*, already-reported harness reasons (a detector-selector bug, a StrictMode double-count).

**Update (third pass):** the coordinator fixed both of those from the same evidence — `4bc66ab` on
`sprint-4d-page-speed` ("innermost container for icon detection; count each request once"). Merged with
`git merge --no-ff sprint-4d-page-speed` → commit `723d5c7` (clean, `qa/web_4d_local.mjs` only, no
conflict). `L-4D-08b` and `L-4D-14b` now **PASS**. Everything below this note reflects the harness
**after both fixes**; the two earlier passes' numbers and investigations are kept under "Earlier-pass
history" at the end for the record.

---

## Per-requirement changes

### R-06 — circle page (F-70), `GroupDetailPage.jsx`
- `load()` now builds `sections()` — a `Promise.all` of `getGroupMembers`, `getGroupLeaderboard`,
  `getGroupGoal`, `getGroupPosts`, and the activity `apiFetch` — and calls it immediately (`const early =
  sections()`) before `getGroup(id)` is awaited. The five section requests leave in the same tick as the
  parent, not after it.
- `getPendingMembers` still starts only once `getGroup()` answers and only for a curator
  (`g?.membership_role === 'curator'`), so a non-curator never sees it and the curator's own extra call
  never blocks the five.
- `setGroup` moves after the five resolve; the `loading` skeleton already hides the page until
  `setLoading(false)`, so nothing renders differently.
- `safe()`'s console warning is now `if (import.meta.env.DEV)`-gated (a private circle's parallel 403s
  would otherwise print 5 warnings in production).
- `:934` `isOwn`: `post.user?.id === user?.id` → `user?.id != null && post.user?.id === user.id`, so an
  authorless post is never treated as the reader's own once identity is `undefined` rather than resolved
  (K-04 — this is a WEB-B file's own copy of the ownership guard; WEB-A's `HomePage.jsx:62` is separate).

### R-07 — book detail (F-70b), `BookDetailPage.jsx`
- The notes effect no longer depends on `userbook?.id` (which only exists after the userbook fetch
  resolves on a direct/refreshed open). It now reads `userbookId` straight from the URL param and depends
  on `[userbookId]`, so `/notes/userbook/{id}` starts alongside `getUserbook()`, not after it.
- Opening from the Library or the preview modal is unaffected: both pass `state.userbook` whose `id`
  already equals the URL segment (verified in `LibraryPage.jsx:914` and `BookPreviewModal.jsx:142`), so
  the effect sees the same id either way.

### R-08 — friend's profile (F-70c), `UserProfilePage.jsx`
- The identity-independent effect now builds `content()` (the five `safe(...)` calls: books, notes,
  30-day and 90-day activity, stats) and fires it immediately (`const early = content()`) before
  `getPublicProfile(userId)` is awaited. If the profile turns out to be `locked`, the already-in-flight
  `early` result is simply never read — matching R-08's "the server refuses those four [sic, five] requests
  and the page discards them."
- `:324` (skeleton guard): `if (loading)` → `if (loading || !me)`. Your own profile-by-id can never render
  as someone else's while identity is still unknown; this costs no time because `me` resolves in parallel
  with the page's own data, not after it.

### R-03 (the two guards Package WEB-B owns)
- `GroupDetailPage.jsx:934` and `UserProfilePage.jsx:324` are the two identity guards this package is
  responsible for (per the brief: "Identity guards belong to you — WEB-A relies on them"). Both treat
  unknown identity as `null`/`undefined`-safe, never letting `x?.id === undefined === undefined` read as
  "true" the way the un-guarded circle post comparison used to.

No change to `Page2Print`, `templates.config.ts`, or anything server-side. No DB, no endpoint, no auth
level, no notification changed.

---

## Gate output (verbatim) — after both harness fixes (`ff055cc`, `4bc66ab`)

Environment: **npm ci** run inside this worktree's `book-tracker-frontend-stitch/` and `qa/` (never the
main checkout). Local API on **127.0.0.1:8766** (Uvicorn, isolated SQLite DB inside the worktree, own
`SECRET_KEY`/`REVIEW_LOGIN_SECRET`/`REVIEW_LOGIN_EMAILS`). Web dev server on **127.0.0.1:5178**
(`--mode localapi --host 127.0.0.1`; `.env.localapi` points `VITE_API_BASE_URL` at 8766). 5174/8765 were
already in use on this host (another Builder's worktree), matching the brief's warning — 5178/8766 were
free. Fixtures: `python scripts/seed_review_accounts.py` for follow/circle/post, plus a direct
`/books/add-to-library` seed for the three books per account (Google Books search has no network egress
in this sandbox — same substitution the QA package's own build notes record making). Per the
coordinator's note, `qa/web_4a_local.mjs` and `qa/web_4d_local.mjs` are now always run **sequentially**
against the shared dev server, never concurrently (see "Note on concurrency" below).

### `node qa/web_4d_local.mjs --web http://127.0.0.1:5178 --api http://127.0.0.1:8766` (two identical
runs after the `4bc66ab` merge: once right after, once after the M-22/M-18 mutation-proof pass)

```
FAIL L-4D-01 home starts its own data at once while identity is pending — /notes/feed first started at 2451 ms; held /profile/me answered at T=2364 ms (needs <= 1364)
FAIL L-4D-02 every signed-in route (and public/root ones) starts early, does not re-fire, and lands right — [/home] /home: /notes/feed first started at 2377 ms (T=2293) | [/library] /library: /userbooks/ first started at 2388 ms (T=2335) | [/library/book/1] /library/book/1: /userbooks/ first started at 2336 ms (T=2301) | [/groups] /groups: /groups/my first started at 2396 ms (T=2353) | [/groups/1] ...
PASS L-4D-02b onboarding keeps its deliberate wait
PASS L-4D-03 no token: never a signed-in request, never a flash of one
PASS L-4D-04 invalid / expired token: signs out cleanly, no reload loop
PASS L-4D-05 a failed /profile/me still signs the reader out
PASS L-4D-06 admin route never fetches /admin/* while identity is pending
PASS L-4D-06b admin route renders once identity resolves to an admin
PASS L-4D-06c no identity is persisted; a reload never shows the old identity
PASS L-4D-07 your own profile never shows a Follow button while pending
PASS L-4D-08 an authorless / foreign feed post never shows the own-post menu
PASS L-4D-08b an authorless circle post never shows the delete control
FAIL L-4D-09 an edit saved in the first seconds is not lost to a stale answer — Nav avatar read "QR" before the Settings form was usable (released 1)
FAIL L-4D-16 Settings stays disabled until its own profile has loaded (K-01) — the name input did not exist during the pending window
FAIL L-4D-17 a profile edit does not re-register web push — web-subscribe POSTed after the save: 3, expected 2
FAIL L-4D-10 sign-out clears the previous account out of memory (F-71) — getMyBooks after sign-out returned [1,2,3], expected the friend's [4,5,6]
FAIL L-4D-10b sign-in clears memory too, before the next read — getMyBooks after signing in as the friend resolved from memory within 1500ms (it should have gone to the network)
FAIL L-4D-10c a stale identity blob in storage is never drawn — control failed: no avatar value recorded before T=2152 ([{"value":"R","at":2176}])
PASS L-4D-11 the circle page's five sections start early; pending is curator-only and never blocks them
PASS L-4D-11b the curator's pending call does not wait for the five
PASS L-4D-12 a private / unknown circle never leaks, and 403s every section
PASS L-4D-13 book detail notes start early on a direct open
PASS L-4D-13b a foreign userbook id 404s and never shows the other reader's note
PASS L-4D-13c opening from the Library card still shows the note
PASS L-4D-14 a friend's profile content starts early
PASS L-4D-14b a locked profile 403s every content call and leaks nothing
4D web local: 18 passed, 8 failed
```

**`18 passed, 8 failed` — both `L-4D-08b` and `L-4D-14b` now PASS.** FAIL set = `{01, 02, 09, 16, 17, 10,
10b, 10c}` — exactly the 8 WEB-A cases (`AuthContext.jsx`, `App.jsx`, `SettingsPage.jsx`, still being
built in parallel). **Every case this package owns now passes.** Ran twice (right after the `4bc66ab`
merge, and again after the M-22/M-18 mutation-proof pass below) with identical membership both times.

### `node qa/web_4a_local.mjs --web http://127.0.0.1:5178 --api http://127.0.0.1:8766`
```
4A web local: 25 passed, 0 failed
```
No regression (G-4D-04 met exactly).

**Note on concurrency (flagged to the coordinator, now addressed):** in the previous pass, running this
concurrently with a fresh `qa/web_4d_local.mjs` invocation against the same shared dev server/API pair
produced a truncated, resource-contended 4D run (4 lines then a non-zero exit with no summary line) — an
artifact of two full Playwright suites hitting one shared Vite dev server at once, not a code or harness
defect. All runs in this pass were sequential (4D alone, mutation reverts alone, final confirmation
alone) and every one completed cleanly with stable, repeatable results.

### `npm --prefix book-tracker-frontend-stitch run build`
```
✓ 100 modules transformed.
dist/index.html                   0.78 kB
dist/assets/index-DjqbYueM.css   43.62 kB
dist/assets/index-TZk1rO4y.js   771.29 kB
✓ built in 2.41s
```
Exit 0.

### `npm --prefix book-tracker-frontend-stitch run lint`
```
✖ 43 problems (36 errors, 7 warnings)
```
Matches the K-07 baseline (`43 problems (36 errors, 7 warnings)`) exactly — **no new problem**. Per
touched file, measured against the K-07 row:

| File | Baseline (errors/warnings) | Observed | New? |
|---|---|---|---|
| `BookDetailPage.jsx` | 1 / 0 | 1 / 0 | none |
| `GroupDetailPage.jsx` | 5 / 1 | 5 / 1 | none |
| `UserProfilePage.jsx` | 1 / 1 | 1 / 1 | none |

All three files' problems are pre-existing (unused imports, `setState`-in-effect, empty catch blocks —
none on a line this package touched).

---

## Mutation-proof table (WEB-B's 10 cases; all Critical or Major, so all required)

Procedure per row: apply the one-line change, `node qa/web_4d_local.mjs --only <id>`, record the first
red line, revert by writing the original text back (Edit tool for the client files; for the server-side
scratch rows, a direct byte-level rewrite when needed — see M-18 below — because the editor's own save
path silently strips trailing whitespace, which `git diff` then reports as a residual change even though
nothing semantic differs; **`git checkout --` was not used anywhere across any pass**), then re-run to
confirm green, restarting the local API for the `(scratch)` server-side rows.

| MUT | Case | File | Change | Result | Caught | Restored |
|---|---|---|---|---|---|---|
| M-13 | L-4D-11 | `GroupDetailPage.jsx` | `const early = sections()` → `const early = null` | `FAIL ... [reader/curator] /groups/1/members first started at 2501 ms (T=2493) \| [friend/member] /groups/1/members first started at 2349 ms (T=2345)` | **Caught** (after `ff055cc`) | yes — `git diff` against HEAD 0 lines; PASS |
| M-17 | L-4D-14 | `UserProfilePage.jsx` | `const early = content()` → `const early = null` | `FAIL ... /userbooks/user/2 first started at 2342 ms (T=2338)` | **Caught** (after `ff055cc`) | yes — `git diff` 0 lines; PASS |
| M-27 | L-4D-11b | `GroupDetailPage.jsx` | `pend = ... ? safe(...) : null` → `... ? early.then(() => safe(...)) : null` | `FAIL L-4D-11b ... /pending started at 2428 ms (T=2426)` | **Caught** | yes, PASS |
| M-14 | L-4D-12 | `GroupDetailPage.jsx` | catch: delete `navigate('/groups')` | `FAIL L-4D-12 ... final path /groups/2 after 6s, expected /groups` | **Caught** | yes, PASS |
| M-15 (scratch) | L-4D-12 | `app/routers/groups_router.py:593` | delete the `raise` in `get_members` | `FAIL L-4D-12 ... got 5 requested, statuses [200,403,403,403,403]` | **Caught** | yes, backend restarted, PASS |
| M-16 | L-4D-13 | `BookDetailPage.jsx` | notes effect: insert `if (!userbook?.id) return` first | `FAIL L-4D-13 ... /notes/userbook/1 was never requested` | **Caught** | yes, PASS |
| M-28 (scratch) | L-4D-13b | `app/routers/notes_router.py:475` | `if not ub or ub.user_id != current_user.id:` → `if not ub:` | `FAIL L-4D-13b ... /notes/userbook/4 returned 200, expected 404` | **Caught** | yes, backend restarted, PASS |
| M-29 | L-4D-13c | `BookDetailPage.jsx` | notes effect: insert `if (state?.userbook) return` | `FAIL L-4D-13c ... the note is not visible after opening from Library` | **Caught** | yes, PASS |
| M-22 | L-4D-08b | `GroupDetailPage.jsx:934` | back to `post.user?.id === user?.id` | **PASS, unchanged.** After `4bc66ab` (innermost-container fix), re-attempting M-22 no longer produces *any* failure — the detector no longer misattributes B's delete icon to A. But removing the guard also produces no red: with WEB-A's app-wide identity gate still in place, `GroupDetailPage` can only mount after `/profile/me` has already resolved, so `user.id` is never `undefined` while the page is rendering — the exact same "masked by missing WEB-A" shape as M-09. **Not `4bc66ab`'s scope; reported below, not adjusted.** | **Not caught (masked by missing WEB-A, same reason as M-09)** | yes — `git diff` 0 lines |
| M-18 (scratch) | L-4D-14b | `app/routers/userbooks_router.py:496` | delete the `raise` in `get_user_books` | `FAIL L-4D-14b ... not every content request answered 403: [200,403,403] / days=[403,403]` — **a genuinely different message from every prior run** (previously masked at `got 7 (rows=[true,true,true], days90 count=4)`; now the count assertion passes and the mutation is caught by the very check it exists for) | **Caught** (after `4bc66ab`) | yes, backend restarted; byte-level rewrite for the trailing-whitespace residual, `git diff` 0 lines; PASS |

**Summary: 9 of 10 mutations are now cleanly caught** (M-13, M-17 caught after `ff055cc`; M-18 newly
caught after `4bc66ab`), each turning its case red with a message distinct from any passing run, and
green again on revert, confirmed byte-identical to HEAD by `git diff` every time (never `git checkout
--`). **1 of 10 (M-09) still cannot be shown caught, and M-22 joins it for the same reason** — both
guard against unresolved identity during a render window that cannot exist until WEB-A's optimistic
mount ships. This is not a harness defect and not something for the coordinator to fix; it is expected
to resolve itself once WEB-A merges, at which point both should be re-attempted.

---

## Both previously-reported harness issues: closed

Per instruction 4 in this round: **both are now caught, with a message different from the unmutated
run** (see M-18's row above for L-4D-14b's new distinguishing message: `not every content request
answered 403: [200,403,403] / days=[403,403]`, replacing the old masked `got 7`). L-4D-08b's own mutation
(M-22) is no longer masked by the detector bug — I re-verified this directly: with the fixed detector,
removing the `isOwn` guard produces *no* observable difference at all, because (as with M-09) WEB-A's
gate means there is currently no window in which `user.id` is unresolved while `GroupDetailPage` renders.
That is a different, expected reason (see the mutation table above and "Explicitly not built / not fixed"
below) — not a harness defect, and not something I am flagging back.

I have not edited `qa/web_4d_local.mjs` in this pass either (no diagnostic scratch files created this
time — the re-verification above was done by reading the merged detector/dedupe code and by mutating the
already-passing product line, both non-destructive).

---

## Assumptions
- Ports 5178 (web) / 8766 (api) chosen because 5174/8765 were already bound on this host by another
  worktree, per the task's own warning.
- Local backend runs against an isolated SQLite DB created fresh in this worktree (`book_tracker.db`,
  gitignored) — never the shared Supabase instance. Tables were created once via `init_db()` (the
  worktree had no prior DB file); this is a one-time local setup step, not a product change.
- Google Books search has no network egress in this sandbox, so book fixtures were seeded directly via
  `/books/add-to-library` with synthetic `google_books_id`s — the same substitution the Package QA
  build notes record making, for the same reason.

## Explicitly not built / not fixed (out of scope)
- Nothing left to report against the harness — both issues from the previous pass (`L-4D-08b`'s detector
  selector, `L-4D-14b`'s `rows90` count) are fixed on `sprint-4d-page-speed` (`4bc66ab`) and merged in.
  `qa/web_4d_local.mjs` is untouched by me across all three passes.
- The one remaining mutation-proof gap (M-09, and now M-22 for the same reason) is a **WEB-A dependency,
  not a harness issue**: both guard against a render window (page mounted, identity still unresolved)
  that cannot exist until `App.jsx`/`PrivateRoute`'s optimistic mount ships. Nothing to fix in this
  package or in the harness; re-attempt once WEB-A merges.
- `pytest tests -q` not run: no backend change ships in this package (the server-side mutations were
  scratch-only and fully reverted every time), so per the brief's own gate list it is not required.

## Ready-for-WEB-B checklist
- [x] R-06, R-07, R-08 (and R-03's two WEB-B-owned guards) implemented per architecture.md's literal B-1/B-2/B-3 snippets
- [x] `qa/web_4d_local.mjs`: **18 passed / 8 failed.** Every case this package owns now passes (`L-4D-08b` and `L-4D-14b` joined `L-4D-11`/`L-4D-14` after `4bc66ab`). Remaining 8 = exactly the WEB-A cases, still being built in parallel
- [x] `qa/web_4a_local.mjs`: 25 passed / 0 failed (no regression), run sequentially per the coordinator's note (never concurrently with `qa/web_4d_local.mjs` against the same dev server)
- [x] `npm run build`: exit 0
- [x] `npm run lint`: 43 problems (36/7), unchanged from baseline; touched files match their K-07 rows exactly
- [x] Mutation-proof: 10/10 attempted; **9/10 cleanly caught and restored**, each with a message different from any passing run; 1/10 (M-09) plus M-22 (re-attempted, same reason) masked by WEB-A not yet existing — a dependency, not a defect, documented not hidden
- [x] No DB/migration change; no `app.json` (no mobile touch); no notification change
- [x] Scope check: only the three named files changed in `book-tracker-frontend-stitch/src/pages/`; `git status` shows nothing else
- [x] Every revert across all three passes verified with `git diff` against HEAD (0 lines); `git checkout --` not used anywhere

---

## Earlier-pass history (kept for the record; superseded by the sections above)

### First pass
The first pass merged `sprint-4d-page-speed` at `3a56251` (before `ff055cc` existed) and measured
`4D web local: 14 passed, 12 failed` — 3 cases short of the `16/10` target. Investigating why (rather
than accepting the shortfall) is what surfaced the pathname-collision bug: `hold()`'s predicate matched
bare `pathname`, with no origin check, and this app's own SPA routes are textually identical to some API
paths (`/groups/1`, `/profile/2`), so `hold(u => u.pathname === '/groups/' + CIRCLE, 2000)` intercepted
the page's *own* document navigation, not just the API call, delaying the whole bundle's execution behind
the 2000 ms hold and making the ≤ T−1000 ms assertion arithmetically impossible regardless of whether the
product code was correct. I proved this with an instrumented standalone Playwright reproduction (same
`hold()` body, extra logging) showing the very first request matched was
`http://127.0.0.1:5178/groups/1` (the frontend's own page load, not the API), and confirmed the product
code was already correct by disabling all interception and watching the same page load in ~290 ms with
every section request firing in parallel between 400–530 ms. The direct evidence at the time was that
mutating `early` to `null` (M-13, M-17) produced the **identical** failure message as the unmutated
code — proof the harness could not yet tell the two apart. That reproduction and evidence is what the
coordinator verified and fixed as `ff055cc` ("harness holds must match the API origin, not the app's
own" — a new `isApi()` guard in `hold()` and every other route install). A secondary, environment-specific
symptom noted at the time (Chromium's Local/Private Network Access check firing once any
`context.route()` was active in this sandbox) compounded the collision but was not its root cause; it is
not mentioned further because `ff055cc` removes the underlying collision that made it observable here.

`L-4D-14b` (StrictMode double-count) and `L-4D-08b` (detector selector) were investigated the same way in
the first pass and found unrelated to the collision — both were still open after `ff055cc`.

### Second pass
Merged `ff055cc` (`037af27`). Measured `4D web local: 16 passed, 10 failed` — the target count, with
`L-4D-11`/`L-4D-14` now passing (confirming the fix) and `L-4D-08b`/`L-4D-14b` still red for their own,
separate reasons, reported in detail: `L-4D-08b`'s `iconInContainer` detector used
`containerSelector: 'div, article'`, which matched every ancestor `div` up the tree (not just the
innermost post card), so a shared wrapper `div` containing both a stub post with a legitimate delete
icon and a sibling authorless stub caused the detector to misattribute the sibling's icon to the wrong
post — confirmed by re-attempting M-22 and getting the identical failure line as the unmutated baseline,
and independently confirmed correct with real (non-stub) data: as a non-owner, a real post's card had no
delete icon; as the owner, the same card did. `L-4D-14b`'s assertion counted `rows90` (the reading-activity
rows) with a raw `.filter(...).length` that did not dedupe by path the way the file's own `firstStart`
helper does elsewhere, so React 19 StrictMode's double-invoke of the early-fire effect inflated the count
from 5 to 7 before the "all 403" check was ever reached — confirmed the same way, by re-attempting M-18
and getting the identical `got 7` line as the unmutated baseline, with the privacy gate itself
independently verified intact via a direct `GET /userbooks/user/{id}` check. Both were reported to the
coordinator with suggested fixes and left untouched in `qa/web_4d_local.mjs`.

### Third pass (this document's current state)
Merged `4bc66ab` ("innermost container for icon detection; count each request once", `723d5c7`).
`L-4D-08b` and `L-4D-14b` both now pass at baseline. Re-attempting their mutations: M-22 produces no
observable change at all (masked by the same missing-WEB-A reason as M-09 — see the mutation table
above), while M-18 is now genuinely caught with a new message (`not every content request answered 403:
[200,403,403] / days=[403,403]`), confirming the dedupe fix let the case reach the check it was written
to make. Full harness: `18 passed, 8 failed` — every WEB-B case now passes; the 8 remaining are WEB-A's.
