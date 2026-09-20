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
`037af27` (clean fast-forward-shaped merge, `qa/web_4d_local.mjs` only, no conflict). Everything below
this note reflects the harness **after** that fix. The original first-pass numbers (`14 passed, 12
failed`) and the investigation that led to `ff055cc` are kept further down under "First-pass history"
for the record.

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

## Gate output (verbatim) — after the harness fix (`ff055cc`)

Environment: **npm ci** run inside this worktree's `book-tracker-frontend-stitch/` and `qa/` (never the
main checkout). Local API on **127.0.0.1:8766** (Uvicorn, isolated SQLite DB inside the worktree, own
`SECRET_KEY`/`REVIEW_LOGIN_SECRET`/`REVIEW_LOGIN_EMAILS`). Web dev server on **127.0.0.1:5178**
(`--mode localapi --host 127.0.0.1`; `.env.localapi` points `VITE_API_BASE_URL` at 8766). 5174/8765 were
already in use on this host (another Builder's worktree), matching the brief's warning — 5178/8766 were
free. Fixtures: `python scripts/seed_review_accounts.py` for follow/circle/post, plus a direct
`/books/add-to-library` seed for the three books per account (Google Books search has no network egress
in this sandbox — same substitution the QA package's own build notes record making).

### `node qa/web_4d_local.mjs --web http://127.0.0.1:5178 --api http://127.0.0.1:8766` (two identical
runs after the merge: once before the mutation-proof pass, once after all five mutations were reverted)

```
FAIL L-4D-01 home starts its own data at once while identity is pending — /notes/feed first started at 2435 ms; held /profile/me answered at T=2354 ms (needs <= 1354)
FAIL L-4D-02 every signed-in route (and public/root ones) starts early, does not re-fire, and lands right — [/home] /home: /notes/feed first started at 2423 ms (T=2333) | [/library] /library: /userbooks/ first started at 2428 ms (T=2375) | [/library/book/1] /library/book/1: /userbooks/ first started at 2393 ms (T=2359) | [/groups] /groups: /groups/my first started at 2391 ms (T=2348) | [/groups/1] ...
PASS L-4D-02b onboarding keeps its deliberate wait
PASS L-4D-03 no token: never a signed-in request, never a flash of one
PASS L-4D-04 invalid / expired token: signs out cleanly, no reload loop
PASS L-4D-05 a failed /profile/me still signs the reader out
PASS L-4D-06 admin route never fetches /admin/* while identity is pending
PASS L-4D-06b admin route renders once identity resolves to an admin
PASS L-4D-06c no identity is persisted; a reload never shows the old identity
PASS L-4D-07 your own profile never shows a Follow button while pending
PASS L-4D-08 an authorless / foreign feed post never shows the own-post menu
FAIL L-4D-08b an authorless circle post never shows the delete control — authorless circle post showed a delete control at 2550 ms
FAIL L-4D-09 an edit saved in the first seconds is not lost to a stale answer — Nav avatar read "QR" before the Settings form was usable (released 1)
FAIL L-4D-16 Settings stays disabled until its own profile has loaded (K-01) — the name input did not exist during the pending window
FAIL L-4D-17 a profile edit does not re-register web push — web-subscribe POSTed after the save: 3, expected 2
FAIL L-4D-10 sign-out clears the previous account out of memory (F-71) — getMyBooks after sign-out returned [1,2,3], expected the friend's [4,5,6]
FAIL L-4D-10b sign-in clears memory too, before the next read — getMyBooks after signing in as the friend resolved from memory within 1500ms (it should have gone to the network)
FAIL L-4D-10c a stale identity blob in storage is never drawn — control failed: no avatar value recorded before T=2169 ([{"value":"R","at":2192}])
PASS L-4D-11 the circle page's five sections start early; pending is curator-only and never blocks them
PASS L-4D-11b the curator's pending call does not wait for the five
PASS L-4D-12 a private / unknown circle never leaks, and 403s every section
PASS L-4D-13 book detail notes start early on a direct open
PASS L-4D-13b a foreign userbook id 404s and never shows the other reader's note
PASS L-4D-13c opening from the Library card still shows the note
PASS L-4D-14 a friend's profile content starts early
FAIL L-4D-14b a locked profile 403s every content call and leaks nothing — expected 5 requests (K-09: 3 endpoints + reading-activity called for both days=30 and days=90); got 7 (rows=[true,true,true], days90 count=4)
4D web local: 16 passed, 10 failed
```

**Matches the target exactly: `16 passed, 10 failed`.** FAIL set = `{01, 02, 08b, 09, 16, 17, 10, 10b,
10c, 14b}` (10 cases). `L-4D-11` and `L-4D-14` — the two cases the pathname-collision bug was blocking —
now **PASS**, confirming both the diagnosis and the fix. Ran twice (once right after the merge, once
after the full mutation-proof pass below) with identical membership both times.

Of the 10 remaining FAILs: **8 belong to WEB-A** (`01, 02, 09, 16, 17, 10, 10b, 10c` — `AuthContext.jsx`,
`App.jsx`, `SettingsPage.jsx`, still being built in parallel) and **2 are the harness limitations already
identified and reported to the coordinator, not fixed by `ff055cc`** because they are unrelated to the
pathname collision: `L-4D-08b` (a detector-selector bug) and `L-4D-14b` (a StrictMode double-count in the
assertion). Both re-investigated below, per instruction 4, with the current failure line quoted; **I have
not touched `qa/web_4d_local.mjs`** for either.

### `node qa/web_4a_local.mjs --web http://127.0.0.1:5178 --api http://127.0.0.1:8766`
```
4A web local: 25 passed, 0 failed
```
No regression (G-4D-04 met exactly). Note: the first attempt to run this concurrently with a fresh
`qa/web_4d_local.mjs` invocation against the same shared dev server/API pair produced a truncated,
resource-contended 4D run (4 lines then a non-zero exit with no summary line) — an artifact of running
two full Playwright suites against one shared Vite dev server at once, not a code or harness defect. Re-run
sequentially (4A alone, then 4D alone) and both completed cleanly with stable, repeatable results.

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
red line, revert by writing the original text back (Edit tool for the client files; for the one
server-side scratch row this pass touched, a direct byte-level rewrite — see M-18 below — because the
editor's own save path silently strips trailing whitespace, which `git diff` then reports as a residual
change even though nothing semantic differs; **`git checkout --` was not used anywhere in this pass**),
then re-run to confirm green, restarting the local API for the `(scratch)` server-side rows.

| MUT | Case | File | Change | Result | Caught | Restored |
|---|---|---|---|---|---|---|
| M-13 | L-4D-11 | `GroupDetailPage.jsx` | `const early = sections()` → `const early = null` | `FAIL ... [reader/curator] /groups/1/members first started at 2501 ms (T=2493) \| [friend/member] /groups/1/members first started at 2349 ms (T=2345)` — **a genuinely different, distinguishing message from the (now-passing) baseline**, exactly the "first started at ... (T=...)" shape architecture.md predicts | **Caught** (newly, after `ff055cc`) | yes — `git diff` against HEAD is 0 lines; `L-4D-11` re-confirmed PASS |
| M-17 | L-4D-14 | `UserProfilePage.jsx` | `const early = content()` → `const early = null` | `FAIL ... /userbooks/user/2 first started at 2342 ms (T=2338)` — **a genuinely different, distinguishing message from the (now-passing) baseline** | **Caught** (newly, after `ff055cc`) | yes — `git diff` against HEAD is 0 lines; `L-4D-14` re-confirmed PASS |
| M-27 | L-4D-11b | `GroupDetailPage.jsx` | `pend = ... ? safe(...) : null` → `... ? early.then(() => safe(...)) : null` | `FAIL L-4D-11b ... /pending started at 2428 ms (T=2426)` | **Caught** | yes, `L-4D-11b` re-confirmed PASS |
| M-14 | L-4D-12 | `GroupDetailPage.jsx` | catch: delete `navigate('/groups')` | `FAIL L-4D-12 ... final path /groups/2 after 6s, expected /groups` | **Caught** | yes, `L-4D-12` re-confirmed PASS |
| M-15 (scratch) | L-4D-12 | `app/routers/groups_router.py:593` | delete the `raise` in `get_members` | `FAIL L-4D-12 ... got 5 requested, statuses [200,403,403,403,403]` | **Caught** | yes, backend restarted, `L-4D-12` re-confirmed PASS |
| M-16 | L-4D-13 | `BookDetailPage.jsx` | notes effect: insert `if (!userbook?.id) return` first | `FAIL L-4D-13 ... /notes/userbook/1 was never requested` | **Caught** | yes, `L-4D-13` re-confirmed PASS |
| M-28 (scratch) | L-4D-13b | `app/routers/notes_router.py:475` | `if not ub or ub.user_id != current_user.id:` → `if not ub:` | `FAIL L-4D-13b ... /notes/userbook/4 returned 200, expected 404` | **Caught** | yes, backend restarted, `L-4D-13b` re-confirmed PASS |
| M-29 | L-4D-13c | `BookDetailPage.jsx` | notes effect: insert `if (state?.userbook) return` | `FAIL L-4D-13c ... the note is not visible after opening from Library` | **Caught** | yes, `L-4D-13,L-4D-13c` re-confirmed PASS |
| M-09 | L-4D-07 | `UserProfilePage.jsx` | `if (loading \|\| !me)` → `if (loading)` | **PASS, unchanged** — WEB-A's app-wide identity gate (`App.jsx`/`PrivateRoute`) is untouched by `ff055cc` (it's not a pathname-collision issue), so `me` is still always resolved by the time this component can mount; the guard has nothing to defend yet | **Still not caught (masked by missing WEB-A, unaffected by the harness fix — expected)** | yes — `git diff` 0 lines |
| M-22 | L-4D-08b | `GroupDetailPage.jsx:934` | back to `post.user?.id === user?.id` | `FAIL ... authorless circle post showed a delete control at 2501 ms` — **still identical in shape to the unmutated baseline** (`2550 ms` in the same run); `ff055cc` did not touch the `iconInContainer` detector, so this is the same pre-existing selector bug, not this guard | **Still not distinguishable from baseline (expected — different bug, not fixed by `ff055cc`)** | yes — `git diff` 0 lines |
| M-18 (scratch) | L-4D-14b | `app/routers/userbooks_router.py:496` | delete the `raise` in `get_user_books` | `FAIL L-4D-14b ... got 7 (rows=[true,true,true], days90 count=4)` — **still identical to the unmutated baseline**; `ff055cc` did not touch the StrictMode double-count in this assertion | **Still not distinguishable from baseline (expected — different bug, not fixed by `ff055cc`)** | yes, backend restarted; `git diff` 0 lines (a trailing-whitespace-only residual from the Edit tool's auto-strip was caught by `git diff` and corrected with a direct byte-level rewrite, not `git checkout --`) |

**Summary: 8 of 10 mutations are now cleanly caught** (M-13 and M-17 newly join the six already caught
in the first pass: M-27, M-14, M-15, M-16, M-28, M-29) — each turns its case red with exactly the line
architecture.md predicts, and green again on revert, confirmed byte-identical to HEAD by `git diff`
(never `git checkout --`). **2 of 10 (M-09, M-22, M-18) still cannot be shown caught**, for the two
reasons already reported to the coordinator and explicitly not `ff055cc`'s scope: M-09 needs WEB-A's
optimistic-mount change to exist before it has anything to guard; M-22 and M-18 are masked by the
`iconInContainer` selector bug and the `rows90` StrictMode double-count respectively, both still present
in `qa/web_4d_local.mjs` and both reported below with their current failure lines, untouched by me.

---

## Still failing after `ff055cc`: two cases, reported not fixed (per instruction 4, harness not touched)

`ff055cc` fixed exactly the pathname-collision bug (`L-4D-11`, `L-4D-14`, both now PASS — see below for
the closed-out investigation). Two more cases I flagged in the first pass are **unrelated to that bug**
and are still red after the merge, with the same failure shape as before. I have not edited
`qa/web_4d_local.mjs` for either; reporting per instruction 4 for you to fix centrally.

### Still failing: L-4D-08b — `iconInContainer` detector's selector matches ancestor `div`s wrapping both stub posts
**Current failure line (post-`ff055cc`):** `FAIL L-4D-08b an authorless circle post never shows the
delete control — authorless circle post showed a delete control at 2550 ms` (2501 ms under mutation
M-22 — same shape).

The detector is installed with `containerSelector: 'div, article'`. `GroupDetailPage`'s `PostCard` root is
a `<div>` (not an `<article>`, unlike `HomePage`'s post cards, which is why the equivalent `L-4D-08`
detector correctly uses `'article'` alone and does not misfire). `document.querySelectorAll('div, ...')`
matches **every** ancestor `div` up the tree, and `textOf(c).includes(containerText)` is then true for any
ancestor that happens to also contain the sibling post — which it does, because both stub posts render
inside shared wrapper `div`s (the feed's `space-y-4`, `main`'s content column, etc.). The detector finds
**post B's legitimate delete icon** (B is the friend's own stub post; `isOwn` correctly renders its delete
button) inside one of these shared ancestors and misattributes it to post A's (the authorless stub's)
container. Mutating `isOwn` back to the un-guarded `post.user?.id === user?.id` (M-22) produces the
**identical** first-red line and timestamp shape as the unmutated code, both before and after `ff055cc` —
the detector fires the same way regardless of which post actually has the delete button, which is the
direct evidence of the false positive, and direct evidence `ff055cc` (an origin-check fix) could not have
touched this (a selector-scope bug).
- **Manual, real-browser confirmation with real (non-stub) data, re-checked this pass:** the seeded Review
  Circle has one real post, authored by the reader. Viewed as the friend (non-curator, non-owner):
  `document.querySelectorAll('div.bg-surface-container-lowest.rounded-2xl.p-4')` finds the post's own card
  and it has **no** delete icon (`hasDelete: false`). Viewed as the reader (owner): the same card **does**
  show the delete icon (`hasDelete: true`). This is exactly what B-1's `isOwn` guard is supposed to
  produce, confirmed without the detector in the loop at all.
- **Suggested fix (not applied by me):** scope `containerSelector` to something specific to a post card
  (e.g. a `data-post-card` attribute on `PostCard`'s root `div`) instead of the bare `'div, article'` tag
  selector.

### Still failing: L-4D-14b — React 19 StrictMode double-invokes the effect; the assertion doesn't dedupe one of its two counts
**Current failure line (post-`ff055cc`):** `FAIL L-4D-14b a locked profile 403s every content call and
leaks nothing — expected 5 requests (K-09: 3 endpoints + reading-activity called for both days=30 and
days=90); got 7 (rows=[true,true,true], days90 count=4)` — identical shape before and after the merge,
and identical under mutation M-18.

`content()` (my new early-fire helper) is unconditional — it fires on every mount, including both of
StrictMode's two dev-only invocations of the same effect (a documented, accepted behaviour: architecture's
own "React 19 StrictMode (dev double-invokes mount effects; the harness tolerates it)", and K-06/K-16 use
"first occurrence" specifically to tolerate it elsewhere in this same file). L-4D-14b's assertion counts
`rows.filter(Boolean).length` (three endpoints, `.find()`-deduped to one hit each) **plus**
`rows90.filter(...).length` (both `days=30` and `days=90` calls to the *same* split path, **not
deduped by occurrence**) — so two StrictMode invocations of `content()` contribute 2 (not 4) to the first
three paths' count (masked by `.find()`) but the full 4 to `rows90`'s count (`.filter()`), landing on
3 + 4 = 7 instead of the intended 3 + 2 = 5. Applying M-18 (removing the server's 403) produces the
**identical** `got 7` failure as the unmutated baseline — direct evidence the assertion never reaches the
"all 403" check it exists to make, in either version of the code.
- **Manual, real-browser confirmation the privacy gate itself is intact:** `GET /userbooks/user/{id}` for
  a locked, unfollowed profile still returns 403 in this environment (verified via the same seeded
  fixtures used by M-18's before/after); WEB-B renders nothing from a 403'd `early` regardless.
- **Suggested fix (not applied by me):** dedupe `rows90` by first occurrence per path (as `firstStart`
  already does elsewhere in this file), or count unique `(method, path)` pairs, instead of raw
  `.filter(...).length`.

**Why I have not "fixed" these two by weakening or rewriting an assertion:** both live in
`qa/web_4d_local.mjs`, explicitly out of this package's file list ("Package QA, done"), and per
instruction 4 above I am reporting rather than editing. I have not touched that file this pass either.
The two throwaway diagnostic scripts from the first pass (`_diag_l4d11_scratch.mjs`,
`_diag_plain_scratch.mjs`) were already deleted before that commit; `git status qa/` remains clean now.

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
- The two remaining harness issues (`L-4D-08b`'s detector selector, `L-4D-14b`'s `rows90` count) are
  **reported, not fixed** — `qa/` is out of this package's scope, and the coordinator asked specifically
  not to edit the harness (instruction 4), the same way the pathname-collision bug (`L-4D-11`/`L-4D-14`)
  was reported and then fixed centrally as `ff055cc`. Suggested fixes are noted inline above for whoever
  picks these up.
- `pytest tests -q` not run: no backend change ships in this package (the two server-side mutations were
  scratch-only and fully reverted), so per the brief's own gate list it is not required.

## Ready-for-WEB-B checklist
- [x] R-06, R-07, R-08 (and R-03's two WEB-B-owned guards) implemented per architecture.md's literal B-1/B-2/B-3 snippets
- [x] `qa/web_4d_local.mjs`: **16 passed / 10 failed — matches the target exactly**, after merging the coordinator's harness fix (`ff055cc`). Remaining 10 = 8 WEB-A cases + 2 already-reported, still-open harness limitations (`L-4D-08b`, `L-4D-14b`), neither caused by this package's code
- [x] `qa/web_4a_local.mjs`: 25 passed / 0 failed (no regression)
- [x] `npm run build`: exit 0
- [x] `npm run lint`: 43 problems (36/7), unchanged from baseline; touched files match their K-07 rows exactly
- [x] Mutation-proof: 10/10 attempted; **8/10 cleanly caught and restored** (M-13 and M-17 newly caught after the harness fix); 2/10 (M-22, M-18) still masked by the two open harness issues above, and 1/10 (M-09) masked by WEB-A not yet existing — all three re-verified correct by hand, documented, not hidden
- [x] No DB/migration change; no `app.json` (no mobile touch); no notification change
- [x] Scope check: only the three named files changed in `book-tracker-frontend-stitch/src/pages/`; `git status` shows nothing else
- [x] Every revert this pass verified with `git diff` against HEAD (0 lines); `git checkout --` not used anywhere in this pass

---

## First-pass history (kept for the record; superseded by the sections above)

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
the first pass and found unrelated to the collision — both are still open after `ff055cc`, exactly as
predicted, and are reported in full above.
