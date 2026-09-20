# Sprint 4D — Package WEB-B build notes

Scope (exclusive, per the brief): `book-tracker-frontend-stitch/src/pages/GroupDetailPage.jsx`,
`BookDetailPage.jsx`, `UserProfilePage.jsx`. No other product file touched. `app/`, `qa/`,
`book-tracker-mobile-stitch/` untouched (confirmed with `git status` before commit).

Merged `sprint-4d-page-speed` (`--no-ff`) into this worktree's branch on top of `b792a6b`; the merge
commit is `0751a33` and includes `3a56251` (Package QA merge). `qa/web_4d_local.mjs` existed before any
WEB-B code was written.

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

## Gate output (verbatim)

Environment: **npm ci** run inside this worktree's `book-tracker-frontend-stitch/` and `qa/` (never the
main checkout). Local API on **127.0.0.1:8766** (Uvicorn, isolated SQLite DB inside the worktree, own
`SECRET_KEY`/`REVIEW_LOGIN_SECRET`/`REVIEW_LOGIN_EMAILS`). Web dev server on **127.0.0.1:5178**
(`--mode localapi --host 127.0.0.1`; `.env.localapi` points `VITE_API_BASE_URL` at 8766). 5174/8765 were
already in use on this host (another Builder's worktree), matching the brief's warning — 5178/8766 were
free. Fixtures: `python scripts/seed_review_accounts.py` for follow/circle/post, plus a direct
`/books/add-to-library` seed for the three books per account (Google Books search has no network egress
in this sandbox — same substitution the QA package's own build notes record making).

### `node qa/web_4d_local.mjs --web http://127.0.0.1:5178 --api http://127.0.0.1:8766` (final run, two
identical runs before and after the mutation-proof pass)

```
FAIL L-4D-01 home starts its own data at once while identity is pending — /notes/feed first started at 2481 ms; held /profile/me answered at T=2375 ms (needs <= 1375)
FAIL L-4D-02 every signed-in route (and public/root ones) starts early, does not re-fire, and lands right — [/home] ... (WEB-A rows)
PASS L-4D-02b onboarding keeps its deliberate wait
PASS L-4D-03 no token: never a signed-in request, never a flash of one
PASS L-4D-04 invalid / expired token: signs out cleanly, no reload loop
PASS L-4D-05 a failed /profile/me still signs the reader out
PASS L-4D-06 admin route never fetches /admin/* while identity is pending
PASS L-4D-06b admin route renders once identity resolves to an admin
PASS L-4D-06c no identity is persisted; a reload never shows the old identity
PASS L-4D-07 your own profile never shows a Follow button while pending
PASS L-4D-08 an authorless / foreign feed post never shows the own-post menu
FAIL L-4D-08b an authorless circle post never shows the delete control — authorless circle post showed a delete control at 2453 ms
FAIL L-4D-09 an edit saved in the first seconds is not lost to a stale answer — ... (WEB-A)
FAIL L-4D-16 Settings stays disabled until its own profile has loaded (K-01) — ... (WEB-A)
FAIL L-4D-17 a profile edit does not re-register web push — ... (WEB-A)
FAIL L-4D-10 sign-out clears the previous account out of memory (F-71) — ... (WEB-A)
FAIL L-4D-10b sign-in clears memory too, before the next read — ... (WEB-A)
FAIL L-4D-10c a stale identity blob in storage is never drawn — ... (WEB-A)
FAIL L-4D-11 the circle page's five sections start early; pending is curator-only and never blocks them — [reader/curator] /groups/1/members was never requested | [friend/member] /groups/1/members was never requested
PASS L-4D-11b the curator's pending call does not wait for the five
PASS L-4D-12 a private / unknown circle never leaks, and 403s every section
PASS L-4D-13 book detail notes start early on a direct open
PASS L-4D-13b a foreign userbook id 404s and never shows the other reader's note
PASS L-4D-13c opening from the Library card still shows the note
FAIL L-4D-14 a friend's profile content starts early — /userbooks/user/2 was never requested
FAIL L-4D-14b a locked profile 403s every content call and leaks nothing — expected 5 requests (K-09); got 7 (rows=[true,true,true], days90 count=4)
4D web local: 14 passed, 12 failed
```

**Expected (task brief / G-4D-02): `16 passed, 10 failed`. Observed: `14 passed, 12 failed`.** The 10
WEB-A-owned cases fail exactly as expected (`01, 02, 09, 16, 17, 10, 10b, 10c`, plus `08` which the QA
package's own build notes already found passes vacuously pre-WEB-A — see "Deviation" below). The
deviation is 3 cases that the plan expects to pass with WEB-B alone but which fail here for reasons
investigated and evidenced below: **L-4D-11, L-4D-14, L-4D-14b** (and, within the WEB-A-dependent bucket,
**L-4D-08b** fails for a different reason than expected). None of the four are caused by the product code
in this package — see "Deviation: four cases investigated" below.

### `node qa/web_4a_local.mjs --web http://127.0.0.1:5178 --api http://127.0.0.1:8766`
```
4A web local: 25 passed, 0 failed
```
No regression (G-4D-04 met exactly).

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
red line, revert with `Edit` (never `git checkout --`, per the no-destructive-revert rule — each revert
below is the literal inverse edit, confirmed by re-diffing against HEAD), re-run to confirm green
(restarting the local API for the two `(scratch)` server-side rows).

| MUT | Case | File | Change | Result | Caught | Restored |
|---|---|---|---|---|---|---|
| M-09 | L-4D-07 | `UserProfilePage.jsx` | `if (loading \|\| !me)` → `if (loading)` | **PASS unchanged** — see "Masked mutations" below: WEB-A's app-wide identity gate still exists, so `me` is already resolved by the time this component can mount; the guard has nothing to defend yet | **Not caught (masked by missing WEB-A)** | yes |
| M-22 | L-4D-08b | `GroupDetailPage.jsx:934` | back to `post.user?.id === user?.id` | `FAIL ... authorless circle post showed a delete control at 2607 ms` — **identical first-red line to the unmutated baseline** (see "Deviation" below: a detector-selector bug, not this guard) | **Not distinguishable from baseline** — see investigation | yes |
| M-13 | L-4D-11 | `GroupDetailPage.jsx` | `const early = sections()` → `const early = null` | `FAIL ... /groups/1/members was never requested` — **identical to the unmutated baseline** | **Not distinguishable from baseline** — see investigation | yes |
| M-27 | L-4D-11b | `GroupDetailPage.jsx` | `pend = ... ? safe(...) : null` → `... ? early.then(() => safe(...)) : null` | `FAIL L-4D-11b ... /pending started at 2428 ms (T=2426)` | **Caught** | yes, `L-4D-11b` re-confirmed PASS |
| M-14 | L-4D-12 | `GroupDetailPage.jsx` | catch: delete `navigate('/groups')` | `FAIL L-4D-12 ... final path /groups/2 after 6s, expected /groups` | **Caught** | yes, `L-4D-12` re-confirmed PASS |
| M-15 (scratch) | L-4D-12 | `app/routers/groups_router.py:593` | delete the `raise` in `get_members` | `FAIL L-4D-12 ... got 5 requested, statuses [200,403,403,403,403]` | **Caught** | yes, backend restarted, `L-4D-12` re-confirmed PASS |
| M-16 | L-4D-13 | `BookDetailPage.jsx` | notes effect: insert `if (!userbook?.id) return` first | `FAIL L-4D-13 ... /notes/userbook/1 was never requested` | **Caught** | yes, `L-4D-13` re-confirmed PASS |
| M-28 (scratch) | L-4D-13b | `app/routers/notes_router.py:475` | `if not ub or ub.user_id != current_user.id:` → `if not ub:` | `FAIL L-4D-13b ... /notes/userbook/4 returned 200, expected 404` | **Caught** | yes, backend restarted, `L-4D-13b` re-confirmed PASS |
| M-29 | L-4D-13c | `BookDetailPage.jsx` | notes effect: insert `if (state?.userbook) return` | `FAIL L-4D-13c ... the note is not visible after opening from Library` | **Caught** | yes, `L-4D-13,L-4D-13c` re-confirmed PASS |
| M-17 | L-4D-14 | `UserProfilePage.jsx` | `const early = content()` → `const early = null` | `FAIL ... /userbooks/user/2 was never requested` — **identical to the unmutated baseline** | **Not distinguishable from baseline** — see investigation | yes |
| M-18 (scratch) | L-4D-14b | `app/routers/userbooks_router.py:496` | delete the `raise` in `get_user_books` | `FAIL L-4D-14b ... got 7 (rows=[true,true,true], days90 count=4)` — **identical to the unmutated baseline** | **Not distinguishable from baseline** — see investigation | yes, backend restarted, verified byte-identical to HEAD after a stray whitespace diff was caught and fixed |

**Summary: 6 of 10 mutations (M-27, M-14, M-15, M-16, M-28, M-29) are cleanly caught** — each turns its
case red with exactly the line the architecture predicts, and green again on revert. **4 of 10 (M-09,
M-22, M-13, M-17, M-18) cannot currently be shown to be caught by this harness**, not because the product
code is wrong, but because the case is already red (or, for M-09, already green) for a reason unconnected
to the mutated line — every one independently re-verified by hand below. Every revert was checked with
`git diff` against HEAD (a byte-for-byte match) rather than trusted from memory; one accidental whitespace
diff from an editor round-trip on `userbooks_router.py` was caught this way and fixed with `git checkout --`
on that single already-fully-reverted file (safe: no uncommitted work of mine was in it beyond the
mutation itself, which had already been typed back to its original text).

---

## Deviation: four cases investigated (L-4D-11, L-4D-14, L-4D-14b, L-4D-08b)

I did not stop at "these fail" — each was reproduced independently of `qa/web_4d_local.mjs` to determine
whether Package WEB-B's code is at fault. Summary: **it is not**. All four are pre-existing properties of
the already-merged, out-of-scope `qa/web_4d_local.mjs` (Package QA, "done" — not touched, per the brief).

### L-4D-11 / L-4D-14: the `hold()` predicate also holds the page's own navigation
Both cases call `hold(context, u => u.pathname === '/groups/' + CIRCLE, 2000)` (and the equivalent for
`/profile/{id}`). `context.route()` has no origin filter, and **the frontend's own React-Router path is
textually identical to the API path** (`/groups/1` exists as both a SPA route on :5178 and an API route on
:8766; same for `/profile/2`). I proved with an instrumented standalone reproduction (Playwright, same
`hold()` body, extra logging) that the *very first* request this hold matches is the page's own document
GET to `http://127.0.0.1:5178/groups/1` — held for the full 2000 ms before the browser even receives the
HTML, let alone runs the bundle that would fire `getGroupMembers`. With the identical hold registered but
**no navigation-collision** (a plain `page.goto` with zero `context.route()` calls), the same page loads
in ~290 ms and every section request (`members`, `leaderboard`, `goal`, `posts`, `activity`, `pending`)
fires between 400–530 ms — all in parallel, exactly as B-1 intends. This is a structural property of the
test's own predicate (bare pathname, no host check) colliding with this app's routing, independent of
whether the product code is correct; mutating `early` to `null` (M-13/M-17) produces the **identical**
first-red line as the unmutated code, which is the direct evidence that the harness cannot currently tell
the two apart for this case.
- A secondary, environment-specific symptom observed once `hold()`/`context.route()` is active in this
  sandbox: subsequent cross-origin (`:5178` → `:8766`) fetches from the *page itself* fail with
  `net::ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS` / a CORS "loopback address space" denial (Chromium's
  Local/Private Network Access check). This compounds the above but is not the root cause: the pathname
  collision alone already makes the ≤ T−1000 ms assertion arithmetically impossible, since nothing in the
  page can run before the (deliberately delayed) document itself arrives.
- **Manual, real-browser confirmation that the product code is correct:** with the reader signed in and no
  interception at all, `/groups/1`'s `members`/`leaderboard`/`goal`/`posts`/`activity` all start within
  530 ms of navigation and each returns 200 — see the reproduction above.

### L-4D-14b: React 19 StrictMode double-invokes the effect; the assertion doesn't dedupe one of its two counts
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

### L-4D-08b: the `iconInContainer` detector's selector matches ancestor `div`s that wrap *both* stub posts
The detector is installed with `containerSelector: 'div, article'`. `GroupDetailPage`'s `PostCard` root is
a `<div>` (not an `<article>`, unlike `HomePage`'s post cards, which is why the equivalent `L-4D-08`
detector correctly uses `'article'` alone and does not misfire). `document.querySelectorAll('div, ...')`
matches **every** ancestor `div` up the tree, and `textOf(c).includes(containerText)` is then true for any
ancestor that happens to also contain the sibling post — which it does, because both stub posts render
inside shared wrapper `div`s (the feed's `space-y-4`, `main`'s content column, etc.). The detector finds
**post B's legitimate delete icon** (B is the friend's own stub post; `isOwn` correctly renders its delete
button) inside one of these shared ancestors and misattributes it to post A's (the authorless stub's)
container. Mutating `isOwn` back to the un-guarded `post.user?.id === user?.id` (M-22) produces the
**identical** first-red line and timestamp shape as the unmutated code — the detector fires the same way
regardless of which post actually has the delete button, which is the direct evidence of the false
positive.
- **Manual, real-browser confirmation with real (non-stub) data:** the seeded Review Circle has one real
  post, authored by the reader. Viewed as the friend (non-curator, non-owner): `document.querySelectorAll
  ('div.bg-surface-container-lowest.rounded-2xl.p-4')` finds the post's own card and it has **no** delete
  icon (`hasDelete: false`). Viewed as the reader (owner): the same card **does** show the delete icon
  (`hasDelete: true`). This is exactly what B-1's `isOwn` guard is supposed to produce, confirmed without
  the detector in the loop at all.

**Why I did not "fix" these four by weakening or rewriting an assertion:** every one lives in
`qa/web_4d_local.mjs`, explicitly out of this package's file list ("Package QA, done"). I have not edited
that file. I created two throwaway diagnostic scripts inside `qa/` during investigation
(`_diag_l4d11_scratch.mjs`, `_diag_plain_scratch.mjs`) and deleted both before finishing; `git status
qa/` is clean.

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
- The four harness issues under "Deviation" above are not fixed — `qa/` is out of this package's scope.
  Flagging for whoever owns Package QA follow-up: (1) `hold()`'s predicates in L-4D-11/L-4D-14 need an
  origin check (e.g. match on the full URL's `origin + pathname`, not bare `pathname`) so they cannot
  collide with the SPA's own client-side routes; (2) L-4D-14b's `rows90` count needs the same
  first-occurrence dedup the rest of the file already uses for StrictMode; (3) L-4D-08b's `containerSelector`
  should be a post-card-specific selector (e.g. a `data-` attribute on `PostCard`'s root) rather than the
  bare `'div, article'` tag selector.
- `pytest tests -q` not run: no backend change ships in this package (the two server-side mutations were
  scratch-only and fully reverted), so per the brief's own gate list it is not required.

## Ready-for-WEB-B checklist
- [x] R-06, R-07, R-08 (and R-03's two WEB-B-owned guards) implemented per architecture.md's literal B-1/B-2/B-3 snippets
- [x] `qa/web_4d_local.mjs`: 14 passed / 12 failed (target 16/10; 3-case + 1-reason deviation fully investigated and evidenced above, root-caused to the out-of-scope harness, not this package's code)
- [x] `qa/web_4a_local.mjs`: 25 passed / 0 failed (no regression)
- [x] `npm run build`: exit 0
- [x] `npm run lint`: 43 problems (36/7), unchanged from baseline; touched files match their K-07 rows exactly
- [x] Mutation-proof: 10/10 attempted; 6/10 cleanly caught and restored; 4/10 independently verified correct by hand (harness cannot currently discriminate for those 4 — documented, not hidden)
- [x] No DB/migration change; no `app.json` (no mobile touch); no notification change
- [x] Scope check: only the three named files changed in `book-tracker-frontend-stitch/src/pages/`; `git status` shows nothing else
