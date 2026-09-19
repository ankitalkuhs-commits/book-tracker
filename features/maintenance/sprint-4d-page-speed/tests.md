---
screen: sprint-4d-page-speed
feature: maintenance
test_plan_written: 2026-09-20
last_run: —
pass_rate: —
written_by: Senior QA (before Builder; branch HEAD d2d2f37 is docs only, no 4D product or harness code exists)
sources: spec.md (DRAFT, escalations decided 2026-09-20), architecture.md (authoritative, incl. "Test strategy" and the 15 proposed L-4D cases), decisions/ADR-001-no-persisted-profile.md, qa/reports/page-perf-2026-09-19.md (Analysis §2 waterfall; master b792a6b adds the Server-Timing section), qa/reports/triage-2026-09-13.md rows F-68..F-73 (master), qa/web_4a_local.mjs, qa/page_perf.mjs, dependency-map.md, pre-4D product code read at d2d2f37 for selectors and behaviour (App.jsx, AuthContext.jsx, api.js, Nav.jsx, HomePage, GroupDetailPage, BookDetailPage, UserProfilePage, SettingsPage, ProfilePage, JoinGroupPage, LoginPage, en.json), backend routers for response semantics (profile_router PUT, groups_router join, notes_router, auth.py), house style features/reading-stats/sprint-4c-local-day/tests.md (branch sprint-4c-local-day)
baseline_measured: 2026-09-20 19:50 UTC (01:20 IST on 09-20, inside the F-62 window). Lint on master b792a6b's frontend (identical to d2d2f37's; `git diff master d2d2f37 -- book-tracker-frontend-stitch` is empty), read-only in the main checkout because the worktree has no node_modules → `✖ 43 problems (36 errors, 7 warnings)`. node --test "qa/unit/*.test.mjs" on the worktree → 14 pass, 0 fail. pytest on the worktree → 428 passed, 3 failed (the three F-62 day-boundary tests; see K-15).
---

## How to read this plan

- Cases are grouped by requirement (R-01..R-10), after the harness mechanics they all share.
- **Ids.** The architecture's ids are kept unchanged: `L-4D-01..15` and mutations `M-01..M-18`. New cases take a letter suffix (`L-4D-08b`) or continue the series (`L-4D-16`, `M-19`...). Other prefixes:
  - `W-4D`: node unit tests for `qa/page_perf.mjs`'s waterfall.
  - `ST-4D`: static command.
  - `P-4D`: production (release) check.
  - `RG-4D`: regression.
  - `G-4D`: gate.
- **Severity:** Critical = privacy / identity / auth / ownership / data loss / feature dead. Major = core flow broken or the speed promise not kept. Minor = cosmetic or defensive. **Identity, privacy and ownership cases are Critical and are never downgraded.**
- **Priority:** P0 ship blocker · P1 fix within sprint · P2 nice to have.
- **Every Critical and Major case names a mutation**: the one-line product change that must turn it red, and the first failure line to expect. Section 8 is the table the Builders fill in. **A mutation that no test catches blocks the merge** (house rule since 2026-09-18, when five agent-written tests passed with the product broken).
- "Expected" is what spec.md and architecture.md promise (as amended by section 0), not what the code does.
- Each case lists its assertions as `(a) (b) ...`. The harness prints the labels that ran (`PASS L-4D-01 ... [a b c d e f]`). **A PASS line whose label set differs from this plan is treated as a FAIL** by Junior QA: that is how a check whose result was never recorded gets noticed.

---

## 0. Decisions, findings and escalations — read before building

### 0.1 Escalations — decided 2026-09-20 (all five follow the Architect's recommendation)

| # | Decision | What this plan tests because of it |
|---|---|---|
| E-1 | **Accepted:** for ~1 s the nav avatar shows `?`, the Admin link is absent, own-post Edit/Delete appears late, a post written in that second shows the author "User" until reload. `/admin` and `/onboarding` keep today's wait. | L-4D-01 asserts the `?` avatar under the normal nav (not the full-screen "Loading..."); L-4D-08/08b assert own-post controls are **absent**, never wrong, in that window; L-4D-06/02b assert the two deliberate waits. |
| E-2 | **Included:** the F-71 fix (clear the 60-second GET cache on sign-out **and** on sign-in). F-71 is now a triage row on master (b792a6b). | L-4D-10 (sign-out clear), L-4D-10b (sign-in clear, K-03), L-4D-10c (token swap across reload). |
| E-3 | **Do not persist the profile** (ADR-001 stands). | L-4D-06c (storage scan + the next load's `is_admin`), L-4D-10c (a planted stale identity blob is never shown), ST-4D-02. |
| E-4 | **Included:** book detail (F-70b) and friend's profile (F-70c). | L-4D-13/13b/13c, L-4D-14/14b. |
| E-5 | **Kept:** a failed `/profile/me` (5xx, offline) still signs the reader out; logged as **F-72** (master triage). | L-4D-05 asserts today's outcome for both a 500 and a network error. K-10 records one side effect this now has. |

### 0.2 Findings from writing this plan

**K-01 and K-02 need an answer before WEB-A is built.** Each has a recommended resolution, which this plan assumes until told otherwise. Nothing else blocks.

| # | Finding (evidence) | Recommended resolution — and what this plan assumes | Owner |
|---|---|---|---|
| **K-01** | **Critical, data loss, introduced by 4D: Settings can be saved before it has loaded the profile, and that erases the reader's yearly goal.** `SettingsPage.jsx` renders its form at once with empty `name` / `bio` / `yearlyGoal` state and fills them from its own `getMyProfile()` (`:156-163`). Today that call is a cache hit (the boot call filled the cache before any page mounted), so the fields are filled on the first tick. After 4D the page mounts while both `/profile/me` calls are in flight (1.5–1.9 s in production), so the form is empty and editable. Typing a name and pressing Save sends `{name, bio: null, yearly_goal: null}` (`:201-205`). `PUT /profile/me` ignores a null `bio` but **clears `yearly_goal` whenever the key is sent** (`profile_router.py:111-112`, the 4A rule in `dependency-map.md:57`). Anything typed before the load lands is also overwritten by it. The privacy toggle shows "off" for a private profile until then (harmless: clicking sends `true`). **The architecture's own L-4D-09 does exactly this** ("type name and Save before T"), so it would erase review.reader's goal and then "restore the profile via API", which hides the bug. | **Settings' profile controls (name, bio, goal, Save, privacy toggle) are disabled until the page's own `/profile/me` has answered** (e.g. a `profileLoaded` flag on a `<fieldset disabled>`). `SettingsPage.jsx` is already a WEB-A file. New case **L-4D-16** (Critical) with mutation M-30. L-4D-09 is redesigned so it saves only after the Settings form has its data (section 3.4). Notification prefs are not affected: that call is not gated by `/profile/me` today either. | Architect / PM → WEB-A |
| **K-02** | **Major: A-1's early patch is used up by the first `/profile/me` answer, and a second, older answer then overwrites it.** In the dev server `main.jsx` wraps the app in `<StrictMode>`, so `AuthProvider`'s boot effect runs twice and sends **two** `/profile/me`. A-1 sets `earlyPatch.current = null` after the first answer, so the second answer (a snapshot taken before the save) runs `setUser(data)` and the nav reverts to the old name. Production sends one boot call, but the local harness runs the dev server, and R-04 says the edit "is not overwritten by the older answer". Today's code also calls `registerWebPush()` twice for the same reason. | The boot effect applies **only the live effect's answer** (a cleanup `ignore` flag, the standard pattern), or applies the patch to every answer of this page load. L-4D-09 goes red against the literal A-1 snippet and green with either fix. The Builder names the line in the mutation table (M-32). | Architect → WEB-A |
| K-03 | **Major: nothing tests the sign-in half of the F-71 fix.** L-4D-10 swaps the token with `setToken` + `getMyBooks`, which never calls `login()`, so M-12 is caught but "delete `cacheClear()` from `login()`" is not. `LoginPage` signs in only through Google's iframe. The real gap `login()` closes: a GET sent before sign-out that answers after it and puts the old account's data back in memory. | New **L-4D-10b**: route `https://accounts.google.com/gsi/client` to a local stub that captures `initialize({callback})`, route `POST /auth/google` to the friend's review-login JSON, park the reader's background revalidation across the sign-out, then drive the real `LoginPage → login()`. Mutation M-24. Local only. | QA |
| K-04 | **Major: the circle page's own-post guard has no case.** B-1 changes `GroupDetailPage.jsx:934` to `user?.id != null && ...`, but the architecture's L-4D-08 covers only `HomePage`. Today `post.user?.id === user?.id` is `undefined === undefined`, i.e. true, for an authorless circle post while identity is pending. | New **L-4D-08b** (Critical). **L-4D-08 is raised from Major to Critical**: an Edit/Delete control on someone else's content is an ownership case (brief; "never downgrade"). | QA |
| K-05 | **Major: the production waterfall rule cannot read "parallel" on three signed-in pages.** (1) `/search` and `/groups/new` send only `/profile/me` and `/notifications/unread-count`, and QA-2's verdict excludes the unread count, so both would read "—". (2) `/join/{code}`'s only own call is `POST /groups/join/{code}`, which `page_perf.mjs` aborts (read-only). It is recorded today only by accident: the abort check `/blockedbyclient/i` does not match Chromium's `net::ERR_BLOCKED_BY_CLIENT`, so the 2026-09-19 report lists it under "API errors" and counts 0 blocked writes. The release rule ("parallel on every signed-in page except `/admin` and `/onboarding`") is therefore unpassable as written. | **Verdict rules** (section 6.1): aborted requests stay in `calls` with `status: 'blocked'` and count as page calls; a page with no own call falls back to the Nav's unread count and reads `parallel (nav)` / `SERIAL (nav)`; the abort regex matches both spellings. `waterfallVerdict`, `isBlocked` and `renderWaterfall` are exported pure functions, `main()` runs only when the file is executed directly, and **`qa/unit/pagePerfWaterfall.test.mjs` (new, W-4D-01..06) joins the QA package's file list.** A release gate that is itself untested would repeat 2026-09-18. | Architect → QA |
| K-06 | Minor: the `/profile/me` page copies on `/profile` and `/settings` cannot be told apart from the boot call on the wire, and StrictMode doubles every mount effect, so "early" and "no re-fire" cannot be asserted for `/profile/me` per consumer. | L-4D-02 leaves `/profile/me` out of every route's path list. `/profile` and `/settings` are proven by their other paths (`/notes/me` ..., `/notifications/prefs`). | — |
| K-07 | Minor: **the lint baseline is misquoted.** R-10 and L-4D-15 say "lint 36/7" / "≤ 36 problems / 7 errors". Measured: **`✖ 43 problems (36 errors, 7 warnings)`**. Per touched file: `App.jsx` 0/0, `AuthContext.jsx` 2/0, `BookDetailPage.jsx` 1/0, `GroupDetailPage.jsx` 5/1, `HomePage.jsx` 6/0, `ProfilePage.jsx` 0/1, `SettingsPage.jsx` 0/0, `UserProfilePage.jsx` 1/1 (errors/warnings). | G-4D-06 uses the measured line: errors ≤ 36, warnings ≤ 7, **and no touched file above its row**. The only new file (`qa/web_4d_local.mjs`, plus the W-4D unit file) is outside ESLint's scope (`eslint .` runs in the frontend), so "0 in new files" is `node --check` (ST-4D-08). Doc Sync corrects the wording. | Doc Sync |
| K-08 | Minor: L-4D-02's "/join already a member" exception is not needed. `POST /groups/join/{code}` returns **201** with the existing status for a current member (`groups_router.py:760-763`). | No exception: every response on every L-4D-02 route is < 400. | — |
| K-09 | Minor: L-4D-14's locked sub-case says "the 4 content responses are 403". There are **5** requests to 4 endpoints (30- and 90-day activity share one). | L-4D-14b asserts 5 requests, each 403. | Doc Sync |
| **K-10** | **Major, behaviour change (PM): a write can now run on a load that ends in sign-out.** With a 5xx or offline `/profile/me`, the page's own requests now leave with the (valid) token before E-5 signs the reader out. All of them are GETs except `/join/{code}`: the reader **joins the circle**, then lands on the login page. Today the page never mounts, so they never join. | **Recommend accept:** joining is what the invite link asked for, and F-72 (E-5) is the root cause. L-4D-05 records the join POST's status but does not assert it. If the PM does not accept, `JoinGroupPage` must wait for identity like `/onboarding`, and a case is added. | PM |
| K-11 | Major: **"expired" is not tested by a malformed token.** The architecture's L-4D-04 uses only `invalid.token.value`. The server rejects both through the same branch (`auth.decode_token` → `JWTError` → 401), but the brief names the expired token as its own Critical. A real expired token needs the local API's `SECRET_KEY`. | The harness reads `SECRET_KEY` from its own environment (the shell that started uvicorn). **Precondition:** it mints a 2-minute token for the reader (HS256, `sub` = email, as `auth_router.py:99` does) and `GET /profile/me` must return 200 with the reader's id; else exit 6. It then mints an expired one (`exp` = now − 3600). The key and tokens are never printed. | QA |
| K-12 | Major: **seeding the token with a per-document init script fakes a reload loop.** `seedAuth` (`context.addInitScript`) re-plants `bt_token` on every document, including the reload that `api.js` makes after a 401, so the bad token comes back after every 401 and the page reloads forever. | L-4D-04, 05, 10, 10b and 10c seed **once**: open `/about` (public, no token), `localStorage.setItem` via `page.evaluate`, then `goto` the route. The rule is in the harness mechanics. | QA |
| K-13 | Minor: use `127.0.0.1`, not `localhost`. The API's CORS list allows both (`main.py:98-107`), but on Windows `localhost` can resolve to `::1`, where Vite may be the only listener. | Dev server `--host 127.0.0.1`. The harness exits 6 if `--web` or `--api` names `localhost` (after the exit-5 production check). | QA |
| K-14 | Info: **master moved to b792a6b** after the branch point e6ede32: `87664e7` (Server-Timing middleware, backend) and `b792a6b` (docs, F-71..F-73). The local harness runs against the worktree's backend, which has no Server-Timing header. | Server-Timing is used only in production checks (P-4D-02, 05, 07). Rebase before merge (G-4D-00). No count changes. | Orchestrator |
| K-15 | Info: the pytest baseline was taken inside the F-62 window (19:50 UTC = 01:20 IST): **428 passed, 3 failed**. The failures are the three known F-62 day-boundary tests: `test_auth.py::TestReviewLogin::test_last_active_set_to_today`, `test_scheduler.py::test_inactivity_reminder_skips_user_active_today`, `test_scheduler.py::test_inactivity_reminder_daily_cap_prevents_second_send`. Outside the window it is 431 passed (F-67 row). | 4D changes no backend. G-4D-10 is optional and uses the triage's F-62 rule: 431 passed, or 428 + exactly those 3 inside the window. After 4C merges, 4C's exact count governs. | — |
| K-16 | Minor: two request sources are not mount effects: the Nav polls `/notifications/unread-count` every 60 s (`Nav.jsx:29`), and `NotificationsPage` refetches `/notifications/history` on window `focus` (`:135`). | The re-fire check (L-4D-02 (c)) ignores the unread count, and ignores a `/notifications/history` re-request only if the init script recorded a `focus` event before it. | — |
| K-17 | Info: the worktree has no `node_modules` (frontend or `qa/`). | Builders run `npm --prefix book-tracker-frontend-stitch ci` and `npm --prefix qa ci` **in the worktree**, never npm in the main checkout. | Builders |

---

## 1. Summary

| Package | What proves it | New automated cases | Command | Baseline → expected |
|---|---|---:|---|---|
| **WEB-A** (`AuthContext`, `App`, `ProfilePage`, `SettingsPage`, `HomePage`) | `qa/web_4d_local.mjs` | **16**: L-4D-01, 02, 02b, 03, 04, 05, 06, 06b, 06c, 08, 09, 10, 10b, 10c, 16, 17 | `node qa/web_4d_local.mjs` | red-first → green (G-4D-01..03) |
| **WEB-B** (`GroupDetailPage`, `BookDetailPage`, `UserProfilePage`) | `qa/web_4d_local.mjs` | **10**: L-4D-07, 08b, 11, 11b, 12, 13, 13b, 13c, 14, 14b | same | same |
| **QA** harness (`qa/web_4d_local.mjs`, new) | the 26 cases above | 26 total | same | — → **`4D web local: 26 passed, 0 failed`** |
| **QA** unit (`qa/unit/pagePerfWaterfall.test.mjs`, new, K-05) | `page_perf` waterfall logic | **6**: W-4D-01..06 | `node --test "qa/unit/*.test.mjs"` | **14 → 20 pass** (31 if 4C's 11 are merged first) |
| **QA** `qa/page_perf.mjs` (changed) | production waterfall | P-4D-01, 05, 06, 07 | `node qa/page_perf.mjs --runs 3` | SERIAL before deploy → `parallel` after (section 6) |
| Regression: 4A harness | unchanged file | 0 (25 existing) | `node qa/web_4a_local.mjs` | **25 → 25 passed** (L-4D-15) |
| Static | ST-4D-01..10 | — | section 5 | — |
| Production | P-4D-00..12 | — | section 6 | — |
| Regression rows | RG-4D-01..10 | — | section 7 | — |

---

## 2. Harness mechanics — `qa/web_4d_local.mjs` (new, QA-owned)

Same shape as `qa/web_4a_local.mjs`. Copy its `readSecret`, `reviewLogin`, `api`, `report`, `assert`, `withPage`, `label` and `callApi` helpers.

### 2.1 Environment and preconditions
- **Servers (local only):**
  - API: `.venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8765` on the worktree backend, with `SECRET_KEY`, `REVIEW_LOGIN_SECRET` and `REVIEW_LOGIN_EMAILS` set. Run `python scripts/seed_review_accounts.py` against it first.
  - Web: `npm --prefix book-tracker-frontend-stitch run dev -- --mode localapi --port 5174 --host 127.0.0.1` (dev server, so React StrictMode is on).
- **Defaults:** `--web http://127.0.0.1:5174 --api http://127.0.0.1:8765`. Flags: `--only`, `--secret-file`.
- **Exit 5 first:** `--web` or `--api` matching `/trackmyread\.com|onrender\.com/i` → print `refusing to run: ...` and exit 5 before reading any secret (ST-4D-09).
- **Exit 6** on any missing precondition, each named on its own line:
  - `--web` / `--api` host is `localhost` (K-13);
  - `GET <api>/version` is not `commit: null` (not the local backend);
  - the served `<web>/src/services/api.js` does not contain `<api>` (not `--mode localapi`);
  - review-login fails for `review.reader@` or `review.friend@`;
  - `SECRET_KEY` absent, or a minted 2-minute reader token does not get 200 on `/profile/me` (K-11);
  - review.reader has no "Review Circle", no userbook, or is not its curator; review.friend is not an active non-curator member of it;
  - review.friend has `is_admin: true` (L-4D-06 needs a non-admin), or has no userbook (L-4D-13b / 14 need one; the harness may seed one instead, below).
- **Fixtures created per run**, all removed in `finally` (tracked in sets as in 4A; local disposable DB, K-21 of 4A):
  - one public note by the reader (`QA 4D feed <ts>`), so `/notes/feed` is never empty (L-4D-01, 08);
  - one private note on the reader's userbook `UB` (`QA 4D bd <ts>`) (L-4D-13, 13c);
  - one circle post by the reader in Review Circle (`QA 4D circle <ts>`) (L-4D-08b);
  - a private circle `QA 4D private <ts>` with a post `QA 4D secret <ts>` (L-4D-12);
  - one private note by the friend on the friend's userbook `FUB` (`QA 4D foreign <ts>`) (L-4D-13b);
  - profile edits (L-4D-09, 16, 17), the friend's `is_private_profile` and the reader→friend follow (L-4D-14b): the original values are read first and written back.
- **Fresh browser context per case** (the 60 s memory cache must never carry over, 4A lesson 3).
- **Token seeding:** `seedAuth` (`context.addInitScript`) is used only where the token must survive every document. L-4D-04, 05, 10, 10b and 10c seed **once** (K-12).

### 2.2 Making the order observable
Three helpers. Each is fetch-first: **the server answers now, and only the browser's copy is delayed.**

```js
// Hold every matching GET for `ms`. Returns a handle the case must assert on.
async function hold(context, test, ms, { modify } = {}) {
  const h = { entries: [] }
  await context.route(u => test(new URL(u)), async route => {
    if (route.request().method() !== 'GET') return route.continue()
    const e = { url: route.request().url(), enteredAt: Date.now() }; h.entries.push(e)
    const resp = await route.fetch()                      // the server answers NOW
    e.fetchedAt = Date.now()
    const body = modify ? JSON.stringify(modify(await resp.json())) : undefined
    await new Promise(r => setTimeout(r, ms))
    await route.fulfill({ response: resp, ...(body ? { body } : {}) })
    e.fulfilledAt = Date.now()
  })
  return h
}
// Park: like hold, but released by the case (release(1) = oldest first; releaseAll()).
// Used by L-4D-09 and L-4D-10b.
```

`timeline(page, t0)` records, for every request to `<api>`: method, `pathname + search`, `start` and `end` in ms from `t0`, status (set on `response`, read on `requestfinished` / `requestfailed`), and whether an `Authorization` header was sent. It also counts main-frame `document` requests.

**Definitions used by every order case:**
- **T** = the earliest `end` in the timeline among the held requests: the first moment the browser could know the answer.
- A path is **early** when its **first** occurrence (StrictMode doubles mount effects) has `start ≤ T − 1000`.
- A path **re-fires** when any occurrence has `start > T` (K-16 exclusions only).
- A sample is **inside the pending window** only if the harness recorded its own sampling time `s1` and `s1 ≤ T − 500`. A "before T" assertion whose `s1` is later fails with `sampled too late` and never counts as a pass.

**Hold controls. Every case that holds asserts all three before anything else.** They exist because of the 2026-09-18 lessons.

| Control | Assertion | Catches |
|---|---|---|
| H1 | `h.entries.length ≥ 1` | a predicate that matched nothing (`hold matched no request`) |
| H2 | every held row in the timeline has `end − start ≥ ms − 100` | a response that was not actually held |
| H3 | every entry has `fetchedAt`, and `fetchedAt − enteredAt < ms − 500` | a hold written as delay-then-`route.continue()`: the server would then answer late, with data from after the delay |

**Why this cannot pass by luck.** "Early" is measured against the held answer, not against a fixed time. Every page call starts in the same React commit as the held call (≈ 0–50 ms apart on the dev server), so the margin is ≈ 2000 ms against a 1000 ms threshold. A slow machine delays both sides together. The unmodified code starts page calls only after T, so every order case fails on it by construction. **G-4D-01 proves that by running the harness on the unmodified code first.**

**"Never visible" checks use observers, not polling.** An init script installs a `MutationObserver` on `document` that records the first time (ms from navigation) a forbidden thing appeared, e.g. a Follow button, a circle name or another account's initials. The case then:
1. reads `window.__qa` and asserts `installed === true`;
2. asserts the forbidden record is empty;
3. runs a **positive control** where the same detector must fire (e.g. the friend's own profile does show a Follow button), so a detector that can never fire cannot pass.

### 2.3 Output
- One line per case: `PASS <id> <title> [<labels>]` or `FAIL <id> <title> — <first failing detail>`.
- Then `4D web local: <n> passed, <m> failed` (plus `(<k> skipped)` with `--only`).
- Evidence: `qa/reports/web-4d-local-<date>.json` with each case's timeline, T, and the observer records, so the mutation table can quote numbers. It contains paths and timings only: **no token, secret or `Authorization` value.**
- Exit: 0 all ran cases passed; 1 some FAIL; 5 production host; 6 precondition missing. **Exit 5 and exit 6 are never a pass.**

### 2.4 Shared ids and selectors
- `READER`, `FRIEND`, `READER_ID`, `FRIEND_ID`, `CIRCLE` (Review Circle id), `CODE` (its `invite_code`), `UB` (the reader's first userbook), `FUB` (the friend's first userbook).
- **Nav avatar value** = the text of `[data-tour="avatar"]`, or its `img[alt]` when a picture is set. `?` means identity is unknown (`Nav.jsx:37-39`).
- **Full-screen loading** = an element whose exact text is `Loading...` (three dots). The LoginPage spinner says `Loading…` (a one-character ellipsis) and does not match.
- **Login page visible** = `document.title` starts with `TrackMyRead — Social Book Tracker` (LoginPage's Helmet title).
- **Follow button** = a `button` whose text matches `/^(person_add|person_check)?\s*(Follow|Follow Back|Following)$/` (`en.json:359-361`, icon ligatures `UserProfilePage.jsx:423`).
- **Home own-post menu** = `button:has(.material-symbols-outlined:text("more_horiz"))` inside the post's `article` (`HomePage.jsx:181-187`). **Circle own-post delete** = `button:has(.material-symbols-outlined:text("delete"))` inside the post card (`GroupDetailPage.jsx:127`).

---

## 3. Cases

### 3.1 R-01 — signed-in pages start their own data at once (F-69)

| # | Setup → steps | Assertions | Mutation → first red line | Sev / Pri |
|---|---|---|---|---|
| **L-4D-01** | reader (`seedAuth`); `hold(/profile/me GET, 2000)`; open `/home` | (a) H1–H3. (b) `/notes/feed`, `/books/recommendations`, `/userbooks/`, `/users/following`, `/userbooks/friends/currently-reading`, `/notifications/unread-count` are early. (c) at `s1 ≤ T−500`: the Nav avatar is visible and reads `?`, and no full-screen `Loading...` exists. (d) at the same `s1`, ≥ 1 feed `article` is visible. (e) at `T+500` the avatar reads the reader's initials (or `img[alt]` = reader's name). (f) no response ≥ 400 | **M-01** `App.jsx`: `if (loading) return <FullScreenLoading />` as the first line after `useAuth()` in `App()` → `FAIL L-4D-01 ... /notes/feed first started at 2140 ms; held /profile/me answered at T=2102 ms (needs ≤ 1102)` | Critical P0 |
| **L-4D-02** | one sub-run per route below; reader (`seedAuth`); `hold(/profile/me GET, 2000)`; `goto` the route; observe until `T + 1500` | per route: (a) H1–H3. (b) every listed path is early. (c) no listed path re-fires (K-16 exclusions). (d) no response ≥ 400 (K-08: no exception). (e) the final path is the route, except: `/` → `/home`, which must be reached at `s1 ≤ T−500`; `/join/{CODE}` → `/groups/{C}` after its success view (`JoinGroupPage.jsx:22`, 1.5 s after the 201). (f) on public routes, at `s1 ≤ T−500`: `document.body.innerText.length > 200`, no full-screen `Loading...`, path unchanged | **M-01** → the public rows and `/home` fail (b)/(f). **M-02** `PrivateRoute`: `if (loading) return <FullScreenLoading />` → `FAIL L-4D-02 /library ... /userbooks/ first started at 2131 ms (T=2098)`. **M-03** `PrivateRoute`: `<AppLayout key={user ? 'in' : 'pending'}>` → `FAIL L-4D-02 /home ... /notes/feed re-fired at 2150 ms (T=2101)`. **M-04** `ProfilePage`: `getMyBooks()` → `getUserBooks(user?.id)` → `FAIL L-4D-02 /profile ... GET /userbooks/user/undefined → 422`. **M-19** `App.jsx` `/` route: `user \|\| loading ?` → `user ?` → `FAIL L-4D-02 / ... still on / at s1=1480 (T=2090)` | Critical P0 |
| L-4D-02b | reader; `hold(/profile/me, 2000)`; open `/onboarding` | (a) H1–H3. (b) at `s1 ≤ T−500`: full-screen `Loading...` is visible and there is no Nav avatar (a deliberate wait). (c) after `T+500`: path `/onboarding` and the Nav avatar is absent (OnboardingPage has no AppLayout) | **M-34** `OnboardingRoute`: delete `if (loading) return <FullScreenLoading />` → `FAIL L-4D-02b ... final path /home, expected /onboarding` | Minor P2 |

**L-4D-02 route table.** Taken from architecture "Requests each signed-in route sends at mount", with `/profile/me` removed (K-06). Every signed-in row also includes `/notifications/unread-count`.

| Route | Listed paths (must be early; must not re-fire) |
|---|---|
| `/home` | `/notes/feed`, `/userbooks/`, `/books/recommendations`, `/users/following`, `/userbooks/friends/currently-reading` |
| `/library` | `/userbooks/`, `/reading-activity/daily?days=7` |
| `/library/book/{UB}` | `/userbooks/`, `/notes/userbook/{UB}` |
| `/search` | (unread count only) |
| `/groups` | `/groups/my`, `/groups/discover`, `/groups/invites/pending`, `/groups/my/pending` |
| `/groups/{CIRCLE}` | `/groups/{C}`, `/groups/{C}/members`, `/groups/{C}/leaderboard?period=monthly`, `/groups/{C}/goal`, `/groups/{C}/posts`, `/groups/{C}/activity` (`/pending` is excluded here; L-4D-11 checks it) |
| `/groups/new` | (unread count only) |
| `/join/{CODE}` | `POST /groups/join/{CODE}` (201 for a member, K-08) |
| `/insights` | `/reading-activity/insights` |
| `/notifications` | `/notifications/history` (re-fire allowed only after a recorded `focus`, K-16) |
| `/profile` | `/notes/me`, `/userbooks/`, `/reading-activity/daily?days=30`, `/reading-activity/insights` |
| `/profile/{FRIEND_ID}` | `/profile/{F}`, `/userbooks/user/{F}`, `/notes/user/{F}`, `/reading-activity/user/{F}/daily?days=30`, `...?days=90`, `/users/{F}/stats` |
| `/settings` | `/notifications/prefs` |
| `/` (token present) | none; must redirect to `/home` inside the window, assertion (e) |
| `/about`, `/privacy`, `/terms`, `/blog` | none; assertion (f) |

The book-detail, circle and friend rows are early here even without WEB-B, because their parents answer in milliseconds locally. L-4D-11, 13 and 14 hold the parent to prove WEB-B.

### 3.2 R-02 — sign-in outcomes do not change

| # | Setup → steps | Assertions | Mutation → first red line | Sev / Pri |
|---|---|---|---|---|
| **L-4D-03** | **no token**; for each of `/`, `/home`, `/library`, `/groups/{C}`, `/profile`, `/settings`, `/admin`, `/onboarding`, `/join/{CODE}`: fresh context, `goto`, observe 5 s; avatar observer installed | (a) ≤ 2 main-frame document loads. (b) final path `/`. (c) login page visible. (d) **0** requests carrying `Authorization`. (e) **0** requests to `<api>` at all (LoginPage makes none; G-4D-01 confirms on the old code). (f) observer installed, and `[data-tour="avatar"]` never appeared: no signed-in page rendered, even for a moment | **M-05** `AuthContext`: `useState(() => !!getToken())` → `useState(true)` → `/` → `/home` → a 401 without a token → `api.js` reloads `/` → forever: `FAIL L-4D-03 / ... 9 document loads in 5 s (≤ 2)`. **M-07** (below) → `FAIL L-4D-03 /home ... GET /notes/feed sent with no token` | Critical P0 |
| **L-4D-04** | tokens **(i)** `invalid.token.value` and **(ii)** a real **expired** JWT (K-11); routes `/`, `/home`, `/groups/{C}`, `/join/{CODE}` (8 runs); seed once (K-12), `goto`, observe 8 s | per run: (a) final path `/`. (b) login page visible. (c) `localStorage.bt_token === null`. (d) ≤ 3 document loads counted from the `goto`. (e) no `article`, circle name or `[data-tour="avatar"]` is visible at the end | **M-06** (`api.js`, scratch copy only): delete `clearToken();` in `apiFetchRaw`'s 401 branch → `FAIL L-4D-04 (ii) /home ... 14 document loads in 8 s (≤ 3)` | Critical P0 |
| **L-4D-05** | reader token, seeded once; variant **(i)** `GET /profile/me` → `route.fulfill({status: 500, body: '{"detail":"Internal Server Error"}'})`; variant **(ii)** `route.abort('failed')`; routes `/home`, `/library`, `/join/{CODE}`; observe 6 s | per run: (a) final path `/`. (b) login page visible. (c) `bt_token === null`. (d) ≤ 3 document loads. **Recorded, not asserted (K-10):** the status of `POST /groups/join/{CODE}` on the `/join` runs | **M-07** `PrivateRoute`: delete `if (!user && !loading) return <Navigate to="/" replace />` → the page stays mounted with the token gone: `FAIL L-4D-05 (i) /home ... final path /home after 6 s, expected /` | Critical P0 |

### 3.3 R-03 — nothing shows the wrong identity while the answer is pending

| # | Setup → steps | Assertions | Mutation → first red line | Sev / Pri |
|---|---|---|---|---|
| **L-4D-06** | **friend** (non-admin, precondition); `hold(/profile/me, 2000)`; open `/admin`; observe 8 s | (a) H1–H3. (b) **0** requests whose pathname starts with `/admin/`, at any time. (c) at `s1 ≤ T−500`: full-screen `Loading...` is visible. (d) final path `/home`. (e) the Nav never showed an `Admin` link (observer) | **M-08** `AdminRoute`: `if (loading) return <FullScreenLoading />` → `if (loading) return <AppLayout>{children}</AppLayout>` → `FAIL L-4D-06 ... GET /admin/stats requested at 212 ms` | Critical P0 |
| L-4D-06b | friend; `hold(/profile/me, 2000, { modify: j => ({ ...j, is_admin: true }) })`; open `/admin`. The `/admin/*` calls reach the real server and get 403, which is expected: this case tests only the route decision | (a) H1–H3. (b) no `/admin/` request starts before T. (c) ≥ 1 `/admin/` request starts after T (the admin page mounted). (d) final path `/admin`. (e) after `T+500` the Nav shows the `Admin` link | **M-20** `AdminRoute`: `if (loading) return <FullScreenLoading />` → `if (loading) return <Navigate to="/home" replace />` → `FAIL L-4D-06b ... final path /home, expected /admin` | Major P0 |
| **L-4D-06c** | continues in 06b's context: (1) scan storage; (2) remove the modify route, `hold(/profile/me, 2000)` unmodified, `page.reload()`, observe 6 s | (a) no `localStorage` or `sessionStorage` value contains `"is_admin"`, the friend's email, or `"id":<FRIEND_ID>`. (b) `indexedDB.databases()` names ⊆ a fresh context's list. (c) after the reload: 0 `/admin/` requests; final path `/home`; no `Admin` link ever in the Nav. `is_admin` comes only from this load's answer (ADR-001) | **M-21** `AuthContext` boot `.then`: add `localStorage.setItem('bt_me', JSON.stringify(data));` → `FAIL L-4D-06c ... localStorage["bt_me"] holds identity fields (is_admin, id, email)` | Critical P0 |
| **L-4D-07** | reader; `hold(/profile/me, 2000)`; Follow-button observer; open `/profile/{READER_ID}`. **Positive control:** a fresh context, no hold, open `/profile/{FRIEND_ID}` | (a) H1–H3. (b) observer installed. (c) no Follow button ever recorded on `/profile/{READER_ID}`. (d) final path `/profile` within 5 s. (e) control: the observer does record a Follow button on the friend's profile | **M-09** `UserProfilePage`: `if (loading \|\| !me) {` → `if (loading) {` → `FAIL L-4D-07 ... Follow button "person_add Follow" visible at 188 ms on /profile/110 (T=2094)` | Critical P0 |
| **L-4D-08** | reader; `hold(/profile/me, 2000)`; `route /notes/feed`: fetch the real feed, clone its first item as a template, and fulfil `[A, B, C]`: **A** `{id: 990000001, text: 'QA 4D authorless <ts>', user: null, user_id: 999999}`, **B** by the reader (`user.id = user_id = READER_ID`), **C** by the friend. Menu observer on A and C; open `/home` | (a) H1–H3. (b) at `s1 ≤ T−500`, the texts of A, B and C are all visible (the pending window is really observed, and the stub renders). (c) at `s1`, none of A, B, C has the more menu. (d) at `T+500`: B has it; A and C do not. (e) the observer never recorded a menu on A or C | **M-10** `HomePage.jsx:62`: delete `currentUserId != null && ` → `FAIL L-4D-08 ... authorless post A showed more_horiz at s1=620 ms (T=2088)` | **Critical** P0 (raised from Major, K-04) |
| **L-4D-08b** | **friend** (active member, **not** curator, so curator powers do not confound); `hold(/profile/me, 2000)`; `route /groups/{C}/posts`: clone a real post, fulfil `[A (user: null), B (user.id = FRIEND_ID)]`; open `/groups/{C}` | (a) H1–H3. (b) at `s1 ≤ T−500`, both texts are visible. (c) at `s1`, neither card has the delete icon. (d) at `T+500`: B has it; A does not. (e) the observer never recorded a delete icon on A | **M-22** `GroupDetailPage.jsx:934`: back to `isOwn={post.user?.id === user?.id}` → `FAIL L-4D-08b ... authorless circle post showed a delete control at s1=540 ms (T=2079)` | Critical P0 |

### 3.4 R-04 — a profile edit saved in the first seconds is not lost

| # | Setup → steps | Assertions | Mutation → first red line | Sev / Pri |
|---|---|---|---|---|
| **L-4D-09** | Arrange via API: save the reader's original `{name, bio, yearly_goal, profile_picture}`; PUT `{name: 'Qa Reader', bio: '4d-09 bio', yearly_goal: 24}`. Fresh context (`seedAuth`); **park** every `GET /profile/me`; open `/settings`. **Release loop:** every 250 ms, while the name input's value ≠ `Qa Reader`: assert the Nav avatar still reads `?`, then `release(1)` (oldest first); at most 8 releases or 5 s. Then fill the name `Zed Quill`, click Save, wait for `PUT /profile/me` → 200. Wait 300 ms, then `releaseAll()`. Wait until no `/profile/me` is in flight, plus 500 ms. `finally`: PUT the originals back | (a) setup reached: the form shows `Qa Reader` while the avatar still reads `?` and ≥ 1 `/profile/me` is still parked. Otherwise `FAIL setup: identity landed before the Settings form was usable (released N)`: never a pass. (b) PUT 200, and its body has `yearly_goal: 24` (the form was loaded, K-01). (c) 300 ms after the PUT the avatar still reads `?`: no partial user object (R-04 bullet 2). (d) after every `/profile/me` of this load has answered, the avatar reads `ZQ` (or `img[alt] = 'Zed Quill'`). (e) Node `GET /profile/me`: `name = 'Zed Quill'`, `yearly_goal = 24`, `bio = '4d-09 bio'` | **M-11** `AuthContext`: `setUser(data && earlyPatch.current ? {...} : data)` → `setUser(data)` → `FAIL L-4D-09 ... avatar read "QR" after all /profile/me answered, expected "ZQ"`. **M-23** `updateUser`: `setUser(prev => (prev ? {...prev, ...patch} : prev))` → `setUser(prev => ({ ...prev, ...patch }))` → `FAIL (c) ... avatar read "ZQ" before /profile/me answered (partial user)`. **M-32** revert the K-02 fix → `FAIL (d) ... read "QR"` | Major P0 |
| **L-4D-16** (K-01) | Arrange as L-4D-09 (goal 24). `hold(/profile/me, 3000)`; open `/settings`. At `s1 ≤ T−1000` inspect the form; press Enter in the name field; wait until `T+500`. `finally`: restore | (a) H1–H3. (b) at `s1`: the name input exists (the page rendered in the pending window), and the name, bio and goal inputs, the Save button and the privacy toggle are all disabled. (c) no `PUT /profile/me` request before T. (d) after `T+500`: the fields show `Qa Reader` / `4d-09 bio` / `24` and are enabled. (e) Node `GET /profile/me`: `yearly_goal == 24` | **M-30** `SettingsPage`: remove the K-01 load gate from the form's `disabled` → `FAIL L-4D-16 ... Save enabled at s1=700 ms before the page's profile loaded (T=3090)` | **Critical** P0 |
| L-4D-17 | reader; an init script makes `Notification.permission` return `'granted'` and stubs `navigator.serviceWorker.register` / `.ready` / `pushManager.getSubscription` (as 4A L-B1-09 does); route `/notifications/vapid-public-key` (stub key) and `POST /notifications/web-subscribe` (200, counted). Open `/settings`; wait until `/profile/me` has answered, plus 1500 ms; `n0` = the count. Change the bio, Save (PUT 200), wait 1500 ms. `finally`: restore the bio | (a) `n0 ≥ 1`: sign-in and page load still register (F-27 unchanged; proves the stub works). (b) the count is still `n0` after the save: a profile edit no longer re-registers | **M-31** `AuthContext.updateUser`: add `setTimeout(registerWebPush, 500);` → `FAIL L-4D-17 ... web-subscribe POSTs after the save: n0+1, expected n0` | Minor P1 |

### 3.5 R-05 — signing out forgets the previous account's data (F-71)

| # | Setup → steps | Assertions | Mutation → first red line | Sev / Pri |
|---|---|---|---|---|
| **L-4D-10** | reader, seeded once (K-12); open `/library`; wait until the book list is rendered and no `<api>` request has been in flight for 500 ms. Nav avatar → **Sign out** → path `/`. Then `callApi('setToken', FRIEND)` and `r = await callApi('getMyBooks')`, within 10 s of the sign-out | (a) `bt_token === null` right after the sign-out. (b) `r.value` ids equal the friend's `GET /userbooks/` ids (Node), in order. (c) control: the reader's list is non-empty, so the two lists differ. (d) a `GET /userbooks/` carrying the friend's `Authorization` appears in the timeline after the sign-out: the answer came from the network | **M-12** `AuthContext.logout`: delete `cacheClear();` → `FAIL L-4D-10 ... getMyBooks after sign-out returned the reader's 3 userbooks [856, 857, 860]` | Critical P0 |
| **L-4D-10b** (K-03) | Before any navigation, route `https://accounts.google.com/gsi/client*` to a stub script that defines `google.accounts.id.{initialize, renderButton, prompt, cancel, disableAutoSelect}`, stores `initialize`'s `callback` on `window.__gsi`, and renders a placeholder div. Route `POST <api>/auth/google` to `{access_token: FRIEND, user: <friend user>}` from the friend's review-login. **1.** reader (seed once); open `/library`; idle 500 ms. **2.** Park the **next** `GET /userbooks/`. **3.** `callApi('getMyBooks')`: a cache hit, so it resolves at once, and its background revalidation is parked. **4.** Sign out via the Nav → `/`. **5.** Release the parked response and wait for its `requestfinished`: the reader's snapshot re-enters memory **after** logout's clear. **6.** Park **every** further `GET /userbooks/`. **7.** `page.evaluate(() => window.__gsi({ credential: 'qa-fake', select_by: 'btn' }))`. **8.** `p = callApi('getMyBooks')` raced against 1500 ms. **9.** `releaseAll()` | (a) exactly 1 request parked in step 3, and it carried the reader's `Authorization`. (b) the sign-out left `bt_token === null`. (c) the parked response finished after the sign-out. (d) the stub was served (route hit = 1), and after step 7 the path is `/home` and `bt_token === FRIEND`. (e) `p` did **not** resolve within 1500 ms: it went to the network, because memory was cleared at sign-in. If it resolved, the failure line shows the ids it returned. (f) after the release, `p` resolves to the friend's ids | **M-24** `AuthContext.login`: delete `cacheClear();` → `FAIL L-4D-10b ... getMyBooks after signing in as friend was served from memory: reader's ids [856, 857, 860]` | Critical P0 |
| **L-4D-10c** | Node: the reader-only titles = the reader's userbook titles minus the friend's (non-empty; otherwise the reader adds `QA 4D reader-only <ts>`, removed in `finally`). Reader seeded once; open `/home`; wait for the avatar to show the reader. **Plant stale identity:** `localStorage.bt_user` and `sessionStorage.bt_user` = the reader's `/profile/me` JSON. Set `bt_token = FRIEND`. `hold(/profile/me, 2000)`; install observers (avatar value history; reader-only titles); `goto /library` | (a) H1–H3. (b) observers installed. (c) every avatar value recorded before T is `?`: never the reader's initials or picture. (d) no reader-only title ever appeared in the DOM. (e) after `T+500` the avatar shows the friend. (f) control: ≥ 1 avatar value was recorded before T (the Nav really rendered inside the identity gap, so (c) is not vacuous). A stale identity in storage (planted here, or left by any future version) is never drawn | **M-25** `AuthContext`: `useState(null)` → `useState(() => JSON.parse(localStorage.getItem('bt_user') \|\| 'null'))` → `FAIL L-4D-10c ... avatar read "QR" (reader) at 160 ms, before the friend's identity (T=2085)` | Critical P0 |

### 3.6 R-06 — circle page (F-70)

| # | Setup → steps | Assertions | Mutation → first red line | Sev / Pri |
|---|---|---|---|---|
| **L-4D-11** | **(i)** reader (curator); `hold(u => u.pathname === '/groups/' + C, 2000)` (exactly the parent, not its sub-paths); open `/groups/{C}`. **(ii)** the same as friend (member) | (a) H1–H3. (b) `members`, `leaderboard?period=monthly`, `goal`, `posts`, `activity` are early. (c) (i) `/groups/{C}/pending` is requested ≥ 1 time, and its first start is ≥ T. (d) (i) after T the circle name and the friend's name in the member list are visible. (e) (ii) `/groups/{C}/pending` is **never** requested. (f) (ii) the five are early for the friend too | **M-13** `GroupDetailPage`: `const early = sections()` → `const early = null` → `FAIL L-4D-11 (i) ... /groups/7/members first started at 2144 ms (T=2101)`. **M-26** `const pend = g?.membership_role === 'curator' ? safe(getPendingMembers(id)) : null` → `const pend = safe(getPendingMembers(id))` → `FAIL L-4D-11 (ii) ... friend requested /groups/7/pending 2 times, expected 0` | Critical P0 |
| L-4D-11b | reader (curator); `hold(/groups/{C}/posts, 2000)` only; open `/groups/{C}` | (a) H1–H3 (T = the posts answer). (b) `/groups/{C}/pending` first start ≤ T − 1000: the curator's call does not wait for the five (R-06 bullet 2) | **M-27** `const pend = ... ? safe(getPendingMembers(id)) : null` → `... ? early.then(() => safe(getPendingMembers(id))) : null` → `FAIL L-4D-11b ... /pending started at 2139 ms (T=2096)` | Major P1 |
| **L-4D-12** | Arrange: the reader creates private circle `P` and posts `QA 4D secret <ts>`. **(i)** friend (not a member); an observer for P's name and the secret text; open `/groups/{P}`; observe 6 s. **(ii)** friend opens `/groups/99999999`. **(iii) control:** the reader opens `/groups/{P}` with the same observer. Teardown: delete P | (a) (i) observer installed; P's name and the secret **never** appeared. (b) (i) final path `/groups` within 6 s. (c) (i) the parent `GET /groups/{P}` answered 403, and an error toast shows that response's `detail` text. (d) (i) each of `members`, `leaderboard`, `goal`, `posts` and `activity` was requested and **every** response is 403 (5 of 5; on the old code there are 0, which fails here by design). (e) (ii) final `/groups`; the parent and all 5 sections answered 404. (f) (iii) the observer **does** record P's name | **M-14** `GroupDetailPage` catch: delete `navigate('/groups')` → `FAIL L-4D-12 (i) ... final path /groups/31 after 6 s, expected /groups`. **M-15** (server, scratch copy only): delete the `raise` in `groups_router.get_members` (`:593`) → `FAIL L-4D-12 (i) ... GET /groups/31/members → 200, expected 403` | Critical P0 |

### 3.7 R-07 — book detail (F-70b)

| # | Setup → steps | Assertions | Mutation → first red line | Sev / Pri |
|---|---|---|---|---|
| L-4D-13 | reader; `hold(u => u.pathname === '/userbooks/', 2000)`; open `/library/book/{UB}` directly | (a) H1–H3. (b) `/notes/userbook/{UB}` is early. (c) the note `QA 4D bd <ts>` is visible within `T+5000`. (d) no response ≥ 400 | **M-16** `BookDetailPage` notes effect: insert `if (!userbook?.id) return` as its first line → `FAIL L-4D-13 ... /notes/userbook/856 first started at 2133 ms (T=2090)` | Major P0 |
| **L-4D-13b** | Arrange: the friend's userbook `FUB` with the friend's private note `QA 4D foreign <ts>`. Reader; a text observer; open `/library/book/{FUB}` directly. **Control:** the friend opens the same URL | (a) observer installed. (b) final path `/library` within 5 s. (c) `/notes/userbook/{FUB}` was requested and answered **404**. (d) the note text never appeared. (e) control: the friend sees the note | **M-28** (server, scratch copy only) `notes_router.get_notes_for_userbook`: `if not ub or ub.user_id != current_user.id:` → `if not ub:` → `FAIL L-4D-13b ... GET /notes/userbook/912 → 200, expected 404` | Critical P0 |
| L-4D-13c | reader; open `/library`; click the card for `UB`'s title (navigates with `state.userbook`) | (a) path `/library/book/{UB}`. (b) the note `QA 4D bd <ts>` is visible within 5 s. (c) no response ≥ 400. "Behaves as today" (R-07) | **M-29** `BookDetailPage` notes effect: insert `if (state?.userbook) return` → `FAIL L-4D-13c ... note not visible after opening from Library` | Major P1 |

### 3.8 R-08 — a friend's profile (F-70c)

| # | Setup → steps | Assertions | Mutation → first red line | Sev / Pri |
|---|---|---|---|---|
| L-4D-14 | the reader follows the friend (arranged; restored); `hold(u => u.pathname === '/profile/' + F, 2000)`; open `/profile/{F}` | (a) H1–H3. (b) `/userbooks/user/{F}`, `/notes/user/{F}`, `/reading-activity/user/{F}/daily?days=30`, `...?days=90` and `/users/{F}/stats` are early. (c) after T the friend's name and at least one of the friend's book titles (Node `GET /userbooks/user/{F}`) are visible. (d) no response ≥ 400 | **M-17** `UserProfilePage`: `const early = content()` → `const early = null` → `FAIL L-4D-14 ... /userbooks/user/111 first started at 2129 ms (T=2093)` | Major P0 |
| **L-4D-14b** | Arrange: record the friend's `is_private_profile` and the reader→friend follow. The friend sets private; the reader unfollows. Collect the friend's book titles and public-note texts first. Reader; an observer for those texts; open `/profile/{F}`; observe 5 s. `finally`: restore both | (a) `This profile is private` is visible. (b) the 5 content requests (K-09) were all made. (c) **every** one answered 403. (d) no friend book title or note text ever appeared. (e) no response other than those 5 is ≥ 400 | **M-18** (server, scratch copy only): delete the `raise` in `userbooks_router.get_user_books` (`:496`) → `FAIL L-4D-14b ... GET /userbooks/user/111 → 200, expected 403` | Critical P0 |

### 3.9 R-10 — existing suites, build and lint

| # | Steps | Expected | Mutation | Sev / Pri |
|---|---|---|---|---|
| L-4D-15 | G-4D-04, G-4D-05, G-4D-06 (not inside the harness; not counted in the 26) | `4A web local: 25 passed, 0 failed`; the build exits 0; lint errors ≤ 36 and warnings ≤ 7, with no touched file above its K-07 row | any 4A regression | Major P0 |

---

## 4. The 4A harness under the new order (L-4D-15, RG-4D-01)

`qa/web_4a_local.mjs` is **not edited**. It must report `4A web local: 25 passed, 0 failed`. Each case was checked against the new order:

- **L-B1-01..08, L-B1-10, L-B2-05's logged-out step:** all run on the login page or with no token. The token is written without a reload, or no signed-in page is opened. Unaffected.
- **L-B1-09** (logout): it waits for the `/profile/me` response before clicking the avatar, then signs out. 4D adds `cacheClear()` to `logout`. That makes no request and does not change the one `web-unsubscribe` call it counts. Unaffected.
- **Legitimately changed state: L-B2-09** clicks the **more menu of the reader's own new post** on `/home`. After 4D (E-1) that menu appears only once identity is known, and the composer is usable before that. Playwright's `click()` waits for the button, and the local `/profile/me` answers in milliseconds, so the case is expected to stay green unchanged.
  - **If it ever fails at that click, the only allowed edit** is to wait for the Nav avatar to leave `?` before posting: `await page.waitForFunction(() => document.querySelector('[data-tour="avatar"]')?.innerText.trim() !== '?')`.
  - Weakening any assertion is not allowed. The edit is recorded in build notes and in section 8 as `4A-EDIT-1`.
- **Legitimately changed state: L-C-02** (font size) samples each page 800 ms after `domcontentloaded`. Pages now render earlier, and the identity-pending state (`?` avatar, author "User") may be what it samples. A new sub-12 px offender found **only** in that state is a real finding for WEB-A, not a harness change.
- **L-C-01** runs `a11y_audit.mjs` (1200 ms wait). Same reasoning as L-C-02.
- **L-B2-13** (circle confirmations): curator controls come from `membership_role`, not `useAuth` (architecture security §4). Unaffected.

If 4C's `qa/web_4c_local.mjs` is merged first, it must also stay `5 passed, 0 failed` (RG-4D-07).

---

## 5. Static checks

Run from the worktree root. `<base>` = the merge base with master.

| # | Check | Command | Expected | Sev / Pri |
|---|---|---|---|---|
| ST-4D-01 | files 4D must not touch are untouched | `git diff --stat <base>..HEAD -- book-tracker-frontend-stitch/src/services/api.js book-tracker-frontend-stitch/src/pages/InsightsPage.jsx book-tracker-frontend-stitch/src/pages/PrivacyPage.jsx book-tracker-frontend-stitch/src/utils/localDate.js book-tracker-frontend-stitch/src/components/Nav.jsx book-tracker-frontend-stitch/src/pages/LoginPage.jsx book-tracker-frontend-stitch/src/pages/AdminPage.jsx book-tracker-frontend-stitch/src/pages/OnboardingPage.jsx app/ book-tracker-mobile-stitch/ context/supabase_migration.sql` | empty | Critical P0 |
| ST-4D-02 | no identity persisted (ADR-001) | `git grep -nE "localStorage\.setItem\|sessionStorage\|indexedDB" -- book-tracker-frontend-stitch/src/context/AuthContext.jsx book-tracker-frontend-stitch/src/App.jsx` | empty | Critical P0 |
| ST-4D-03 | no request built from `useAuth().user` | `git grep -nE "\(user\?\.id\)\|\[user\?\.id\]" -- book-tracker-frontend-stitch/src/pages book-tracker-frontend-stitch/src/components` | empty (today's only hits are `ProfilePage.jsx:462,473`) | Major P0 |
| ST-4D-04 | no new `console.*` outside DEV | `git diff <base>..HEAD -U0 -- book-tracker-frontend-stitch/src \| grep '^+' \| grep 'console\.' \| grep -v 'import.meta.env.DEV'` | empty | Minor P1 |
| ST-4D-05 | the app-wide gate is gone | `git grep -c "Loading\.\.\." -- book-tracker-frontend-stitch/src/App.jsx` | `1` (only inside `FullScreenLoading`) | Major P1 |
| ST-4D-06 | lint per touched file (K-07) | `npx eslint -f json <the 8 files>` (from `book-tracker-frontend-stitch/`) | each file's errors/warnings ≤ its K-07 row | Major P0 |
| ST-4D-07 | build | `npm --prefix book-tracker-frontend-stitch run build` | exit 0 | Critical P0 |
| ST-4D-08 | new QA files parse | `node --check qa/web_4d_local.mjs && node --check qa/page_perf.mjs && node --check qa/unit/pagePerfWaterfall.test.mjs` | exit 0 | Major P0 |
| ST-4D-09 | the harness never runs against production | `node qa/web_4d_local.mjs --web https://www.trackmyread.com`; `node qa/web_4d_local.mjs --api https://book-tracker-stitch.onrender.com`; `node qa/web_4d_local.mjs --web http://localhost:5174` | exit **5**, exit **5**, exit **6**; no secret or token printed | Critical P0 |
| ST-4D-10 | `page_perf.mjs` stays read-only | `git grep -n "abort('blockedbyclient')" -- qa/page_perf.mjs` | 1 line: non-GET requests to the API are still aborted | Critical P0 |

---

## 6. `qa/page_perf.mjs` waterfall (QA-2) and production release checks

### 6.1 Waterfall rules (K-05) and their unit tests — `qa/unit/pagePerfWaterfall.test.mjs` (new)
`page_perf.mjs` exports:
- `isBlocked(errorText)`;
- `waterfallVerdict(calls)`;
- `renderWaterfall(rows)`.

`main()` runs only when the file is executed directly (`import.meta.url === pathToFileURL(process.argv[1]).href`). Rules:
- `calls` = every API request of the **cold** run: `{method, path, start, end, status}`, where `path` is the pathname only.
- A request aborted by the write guard stays in `calls` with `status: 'blocked'`. `isBlocked` matches `/blocked_?by_?client/i`.
- **ME** = the `GET /profile/me` with the lowest `start`. **Own calls** = every other call except `GET /notifications/unread-count`.
- Verdict:
  - no ME → `—`;
  - own calls exist → `parallel` if their minimum `start` < ME.end, else `SERIAL` (strict `<`);
  - no own calls → the same test on the first unread count, printed `parallel (nav)` / `SERIAL (nav)`;
  - neither → `—`.
- Each call also records its `Server-Timing` (`db` dur, query count, `total` dur) when the header is present. The Markdown gets `## Waterfall (first visit)`, one row per signed-in page and profile: ME start–end, first own-call start, verdict, and ME's `total` / queries.
- The table's note says `/admin` and `/onboarding` are expected to read `SERIAL` / `—`.

| # | `test(...)` | Input → expected | Mutation → red | Sev / Pri |
|---|---|---|---|---|
| W-4D-01 | `serial_home_2026_09_19` | ME 298–1833, own calls from 1917 (the report's `/home`) → `SERIAL` | **M-33** `waterfallVerdict` returns `'parallel'` unconditionally → `'parallel' !== 'SERIAL'` | Major P0 |
| W-4D-02 | `parallel_home` | ME 300–1800, `/notes/feed` from 310 → `parallel` | M-33b `<` → `>` → `'SERIAL' !== 'parallel'` | Major P0 |
| W-4D-03 | `nav_fallback_search` | only ME 300–1800 + unread from 320 → `parallel (nav)`; unread from 1850 → `SERIAL (nav)`; with a page call present, an early unread count is ignored (page call from 1900 → `SERIAL`) | drop the fallback → `'—' !== 'parallel (nav)'` | Major P0 |
| W-4D-04 | `blocked_post_counts_join` | `isBlocked('net::ERR_BLOCKED_BY_CLIENT')` and `isBlocked('blockedbyclient')` are true; `isBlocked('net::ERR_FAILED')` is false; ME 300–1800 + `POST /groups/join/x` status `blocked` from 330 → `parallel` | today's `/blockedbyclient/i` → `false !== true` | Major P0 |
| W-4D-05 | `boundaries_and_no_me` | only ME → `—`; no ME → `—`; own start == ME.end → `SERIAL` | `<` → `<=` → `'parallel' !== 'SERIAL'` | Minor P1 |
| W-4D-06 | `render_has_section_rows_no_secrets` | `renderWaterfall` of 2 rows contains `## Waterfall (first visit)`, 2 data rows, and the admin/onboarding note; no path in the output contains `?`, and the output contains no `Bearer` | — | Minor P1 |

### 6.2 Production release checks
These obey `qa/RULES_OF_ENGAGEMENT.md`: read-only, review accounts only, no token or `Authorization` value printed. `<api>` = `https://book-tracker-stitch.onrender.com`, `<web>` = `https://www.trackmyread.com`.

| # | Check | How | Expected | Sev / Pri |
|---|---|---|---|---|
| P-4D-00 | Before numbers | `curl -s <api>/version`; save `<web>/` `index.html` asset names | recorded in the run ledger | Major P0 |
| **P-4D-01** | **The detector detects serial** (the waterfall's own non-vacuity), run **immediately before** the web deploy with the new `page_perf.mjs` | `node qa/page_perf.mjs --runs 3` (repo root, `.env.review` present) | Waterfall table: **every** signed-in page reads `SERIAL` or `SERIAL (nav)` on both profiles (`/onboarding` may read `—`). One `parallel` here means the detector is broken: stop | Critical P0 |
| P-4D-02 | Assumptions A-1 / F-68 state | `curl -sI --http2 <api>/version \| head -1`; `curl -sI -H "Authorization: Bearer $T" <api>/profile/me \| grep -i server-timing` (×5) | `HTTP/2 200`: if `HTTP/1.1`, expect a smaller saving on `/home` and the circle page (A-1). `db;dur=…;desc="5 queries", total;dur=…`: record the per-query cost. **Below 20 ms per query means F-68 shipped: apply architecture rule 4** (P-4D-01 becomes the baseline) | Major P0 |
| P-4D-03 | Deployed code is the tested code | after the Vercel deploy: `<web>/` asset names differ from P-4D-00; `curl -s <api>/version` = the merge SHA (Render restarts on the push) | both | Critical P0 |
| P-4D-04 | Expired session on production (R-02) | PM, DevTools on `<web>`: `localStorage.bt_token = 'invalid.token.value'`, open `/home` | lands on the login page at `/`; `bt_token` removed; no reload loop | Critical P0 |
| **P-4D-05** | **The order in production (R-09)** | `node qa/page_perf.mjs --runs 3` after the deploy | Waterfall, **both profiles**: `parallel` for `/home`, `/library`, `/library/book/{ub}`, `/groups`, `/groups/{id}`, `/join/…`, `/insights`, `/notifications`, `/profile`, `/profile/{friend}`, `/settings`; `parallel (nav)` for `/search` and `/groups/new` (13 × 2 = 26 parallel verdicts); `/onboarding` `—`; `/admin` `SERIAL` **and no `/admin/` path in its `calls`** (non-admin) | Critical P0 |
| P-4D-06 | The speed promise (R-09) | the desktop "ready (first visit)" column from P-4D-05 against the table below | each page is within ±0.5 s of "after", **or** ≥ 0.8 s faster than 2026-09-19. With F-68 shipped: against P-4D-01 instead | Major P0 |
| P-4D-07 | Server-Timing: same backend, and the concurrency holds (A-2) | P-4D-01 vs P-4D-05 `calls[].st` | the query count per endpoint is identical (no backend change; a difference invalidates P-4D-06); the median `/profile/me` `total` after ≤ 1.3 × before. More than that means A-2 is failing (contention): report it, do not fail the order gate | Major P1 |
| P-4D-08 | PM Done checklist 1–2 | DevTools Network on `/home` and the Review Circle | the feed and the 5 circle sections start together with `profile/me` / `groups/{id}` | Major P0 |
| P-4D-09 | PM Done checklist 3 (F-71, real Google sign-in) | sign out; within a minute sign in as a second Google account in the same tab; open Library | only the second account's books | Critical P0 |
| P-4D-10 | PM Done checklist 4 | private window: `/profile/<own id>` | lands on `/profile`; never a Follow button on yourself | Critical P0 |
| P-4D-11 | PM Done checklist 5 | as a non-admin: `/admin` | goes to `/home`; the Network panel shows no `/admin/` request | Critical P0 |
| P-4D-12 | Every page renders | `node qa/screenshots.mjs --web <web> --api <api> --out qa/screenshots/<date>-4d-prod` | exit 0; no failed API call, no console error | Critical P0 |

**Expected ready times (architecture, desktop / phone), for P-4D-06:**

| Page | Desktop today → after | Phone today → after |
|---|---|---|
| Home | 5.40 → ~3.7 s | 8.14 → ~6.4 s |
| Library | 3.11 → ~1.9 s | 5.13 → ~3.9 s |
| Book detail (direct) | 4.71 → ~2.0 s | 7.24 → ~4.5 s |
| Search | 2.92 → ~1.9 s | 4.88 → ~3.9 s |
| Circles | 4.18 → ~2.6 s | 5.74 → ~4.2 s |
| Circle detail | 6.38 → ~3.3 s | 8.89 → ~5.8 s |
| New circle | 2.90 → ~1.9 s | 5.19 → ~4.2 s |
| Join via invite | 3.01 → ~1.9 s | 4.82 → ~3.8 s |
| Insights | 3.19 → ~1.9 s | 5.15 → ~3.8 s |
| Notifications | 3.37 → ~2.1 s | 4.70 → ~3.5 s |
| My profile | 3.96 → ~2.4 s | 6.36 → ~4.8 s |
| Friend's profile | 5.84 → ~2.6 s | 7.79 → ~4.6 s |
| Settings | 3.60 → ~2.1 s | 5.87 → ~4.4 s |
| Onboarding | 1.87 → 1.87 s | 3.64 → 3.64 s |
| Admin (non-admin) | 4.56 → ~4.5 s | 8.01 → ~8.0 s |

**Order:** G-4D-00..12 on the branch → P-4D-00, P-4D-02, **P-4D-01** (just before the web deploy) → PM pushes master → P-4D-03 → P-4D-05, 06, 07, 12 → P-4D-04, 08..11 (PM) → the report is committed as `qa/reports/page-perf-<date>.md/.json`.

---

## 7. Regression — consumers of what changed

| # | Pri / Sev | Consumer | Proof |
|---|---|---|---|
| RG-4D-01 | P0 / Critical | the whole web app on the 4A behaviours | `web_4a_local.mjs` 25/25 (section 4) |
| RG-4D-02 | P0 / Critical | `GET /profile/me` web consumers: `AuthContext`, `ProfilePage`, `SettingsPage` | L-4D-02 (`/profile`, `/settings`), L-4D-09, 16, 03..05 |
| RG-4D-03 | P1 / Major | `GET /userbooks/user/{id}`: web `UserProfilePage` (keeps it), `ProfilePage` (drops it); Android `UserProfileScreen` | L-4D-14; G-4D-12 shows exactly `pages/ProfilePage.jsx` removed from that generated row; no server change (ST-4D-01) |
| RG-4D-04 | P0 / Critical | circle curator and member actions (leave, remove, delete post) | 4A L-B2-13 green; L-4D-11 (d) |
| RG-4D-05 | P1 / Major | invite links `/join/{code}` | L-4D-02 `/join` row (201, success view); L-4D-04 / 05 `/join` runs |
| RG-4D-06 | P1 / Major | sign-in through Google (LoginPage `login()` signature unchanged) | L-4D-10b drives the real `LoginPage` path with a stub; P-4D-09 with real Google |
| RG-4D-07 | P1 / Major | Sprint 4C, if merged first | `node qa/web_4c_local.mjs` → `4C web local: 5 passed, 0 failed`; `qa/unit` 31 |
| RG-4D-08 | P1 / Major | web push registration on sign-in and page load (F-27) | L-4D-17 (a) |
| RG-4D-09 | P2 / Minor | first-visit tour (`AppTour`, no `bt_onboarding_v1`) | P-4D-12 screenshots plus one local look (Junior QA): the tour still starts on `/home` |
| RG-4D-10 | P2 / Minor | backend untouched | optional `pytest tests -q` (G-4D-10) |

---

## 8. Mutation-proof table (Builders fill in; required by G-4D-09)

**Procedure per row:**
1. Apply the one-line change.
   - Rows marked **(scratch)** change files 4D does not ship (`api.js`, `app/`). Apply them only in a scratch copy of the worktree, and restart the local API for the server rows.
2. Run only the named cases: `node qa/web_4d_local.mjs --only <ids>`, or `node --test qa/unit/pagePerfWaterfall.test.mjs`.
3. Paste the **first failing line**.
4. `git checkout -- <file>`, re-run, and record green.

A row whose cases stay green is **not caught**, and the merge is blocked until a case is fixed. The failing line must come from the named assertion, not from a setup or precondition failure.

| MUT | File | One-line change | Must go red | Expected first red line | Observed (Builder) | Caught | Restored |
|---|---|---|---|---|---|---|---|
| M-01 | `App.jsx` | `if (loading) return <FullScreenLoading />` first in `App()` | L-4D-01 (b), L-4D-02 public rows (f) | `... /notes/feed first started at ... (needs ≤ T−1000)` | | | |
| M-02 | `App.jsx` | `PrivateRoute`: `if (loading) return <FullScreenLoading />` | L-4D-01, L-4D-02 | `... /userbooks/ first started at ...` | | | |
| M-03 | `App.jsx` | `PrivateRoute`: `<AppLayout key={user ? 'in' : 'pending'}>` | L-4D-02 (c) | `... /notes/feed re-fired at ... (T=...)` | | | |
| M-04 | `ProfilePage.jsx` | `getMyBooks()` → `getUserBooks(user?.id)` | L-4D-02 `/profile` (d) | `GET /userbooks/user/undefined → 422` | | | |
| M-05 | `AuthContext.jsx` | `useState(() => !!getToken())` → `useState(true)` | L-4D-03 (a) | `... N document loads in 5 s (≤ 2)` | | | |
| M-06 (scratch) | `api.js` | delete `clearToken();` in the 401 branch | L-4D-04 (d) | `... N document loads in 8 s (≤ 3)` | | | |
| M-07 | `App.jsx` | `PrivateRoute`: delete the `Navigate to="/"` line | L-4D-05 (a), L-4D-03 (d) | `... final path /home after 6 s, expected /` | | | |
| M-08 | `App.jsx` | `AdminRoute` loading → `<AppLayout>{children}</AppLayout>` | L-4D-06 (b) | `GET /admin/stats requested at ... ms` | | | |
| M-09 | `UserProfilePage.jsx` | `if (loading \|\| !me)` → `if (loading)` | L-4D-07 (c) | `Follow button ... visible at ... on /profile/<reader>` | | | |
| M-10 | `HomePage.jsx:62` | delete `currentUserId != null && ` | L-4D-08 (c) | `authorless post A showed more_horiz at s1=...` | | | |
| M-11 | `AuthContext.jsx` | `setUser(data)` without the patch merge | L-4D-09 (d) | `avatar read "QR" after all /profile/me answered, expected "ZQ"` | | | |
| M-12 | `AuthContext.jsx` | `logout`: delete `cacheClear();` | L-4D-10 (b) | `getMyBooks after sign-out returned the reader's N userbooks` | | | |
| M-13 | `GroupDetailPage.jsx` | `const early = sections()` → `null` | L-4D-11 (b) | `/groups/<c>/members first started at ...` | | | |
| M-14 | `GroupDetailPage.jsx` | catch: delete `navigate('/groups')` | L-4D-12 (b) | `final path /groups/<p> after 6 s` | | | |
| M-15 (scratch) | `groups_router.py:593` | delete the `raise` in `get_members` | L-4D-12 (d) | `GET /groups/<p>/members → 200, expected 403` | | | |
| M-16 | `BookDetailPage.jsx` | notes effect: `if (!userbook?.id) return` first | L-4D-13 (b) | `/notes/userbook/<ub> first started at ...` | | | |
| M-17 | `UserProfilePage.jsx` | `const early = content()` → `null` | L-4D-14 (b) | `/userbooks/user/<f> first started at ...` | | | |
| M-18 (scratch) | `userbooks_router.py:496` | delete the `raise` in `get_user_books` | L-4D-14b (c) | `GET /userbooks/user/<f> → 200, expected 403` | | | |
| M-19 | `App.jsx` | `/` route `user \|\| loading ?` → `user ?` | L-4D-02 `/` (e) | `still on / at s1=...` | | | |
| M-20 | `App.jsx` | `AdminRoute` loading → `<Navigate to="/home" replace />` | L-4D-06b (d) | `final path /home, expected /admin` | | | |
| M-21 | `AuthContext.jsx` | boot `.then`: `localStorage.setItem('bt_me', JSON.stringify(data));` | L-4D-06c (a) | `localStorage["bt_me"] holds identity fields` | | | |
| M-22 | `GroupDetailPage.jsx:934` | back to `post.user?.id === user?.id` | L-4D-08b (c) | `authorless circle post showed a delete control at s1=...` | | | |
| M-23 | `AuthContext.jsx` | `updateUser`: `prev ? {...} : prev` → `({ ...prev, ...patch })` | L-4D-09 (c) | `avatar read "ZQ" before /profile/me answered (partial user)` | | | |
| M-24 | `AuthContext.jsx` | `login`: delete `cacheClear();` | L-4D-10b (e) | `... served from memory: reader's ids [...]` | | | |
| M-25 | `AuthContext.jsx` | `useState(null)` → `useState(() => JSON.parse(localStorage.getItem('bt_user') \|\| 'null'))` | L-4D-10c (c) | `avatar read "QR" (reader) at ... before the friend's identity` | | | |
| M-26 | `GroupDetailPage.jsx` | `pend` for everyone | L-4D-11 (e) | `friend requested /groups/<c>/pending N times, expected 0` | | | |
| M-27 | `GroupDetailPage.jsx` | `pend` = `early.then(() => safe(getPendingMembers(id)))` | L-4D-11b (b) | `/pending started at ... (T=...)` | | | |
| M-28 (scratch) | `notes_router.py:475` | `if not ub or ub.user_id != current_user.id:` → `if not ub:` | L-4D-13b (c) | `GET /notes/userbook/<fub> → 200, expected 404` | | | |
| M-29 | `BookDetailPage.jsx` | notes effect: `if (state?.userbook) return` | L-4D-13c (b) | `note not visible after opening from Library` | | | |
| M-30 | `SettingsPage.jsx` | remove the K-01 load gate from `disabled` | L-4D-16 (b) | `Save enabled at s1=... before the page's profile loaded` | | | |
| M-31 | `AuthContext.jsx` | `updateUser`: add `setTimeout(registerWebPush, 500);` | L-4D-17 (b) | `web-subscribe POSTs after the save: n0+1, expected n0` | | | |
| M-32 | `AuthContext.jsx` | revert the K-02 fix (Builder names the line) | L-4D-09 (d) | `avatar read "QR" after all /profile/me answered` | | | |
| M-33 | `page_perf.mjs` | `waterfallVerdict` returns `'parallel'` | W-4D-01 | `'parallel' !== 'SERIAL'` | | | |
| M-33b | `page_perf.mjs` | verdict `<` → `>` | W-4D-02 | `'SERIAL' !== 'parallel'` | | | |
| M-34 | `App.jsx` | `OnboardingRoute`: delete the loading line | L-4D-02b (c) | `final path /home, expected /onboarding` | | | |
| 4A-EDIT-1 | `web_4a_local.mjs` | only if needed (section 4) | — | — | | | |

---

## 9. Gate summary

| Gate | Protects | Command | Exact expected output |
|---|---|---|---|
| **G-4D-00** | the right tree; master's two new commits | `git branch --show-current`; `git log --oneline -1`; `git rebase master` before merge | `sprint-4d-page-speed`; the merge base includes `b792a6b` (K-14) |
| **G-4D-01** | **red first**: the tests fail on the old code. Run once the QA package exists, **before** WEB-A/WEB-B code | `node qa/web_4d_local.mjs` | PASS exactly {02b, 03, 04, 05, 06, 06b, 06c, 07, 13c}; FAIL exactly {01, 02, 08, 08b, 09, 10, 10b, 10c, 11, 11b, 12, 13, 13b, 14, 14b, 16, 17}; **`4D web local: 9 passed, 17 failed`**, exit 1. Any other split is investigated before building. The 9 that pass guard behaviour that 4D must not change, and their mutations prove them on the new code |
| G-4D-02 | WEB-B merges first (architecture deploy notes) | the same, after WEB-B only | **`4D web local: 16 passed, 10 failed`**; FAIL exactly {01, 02, 08, 08b, 09, 10, 10b, 10c, 16, 17} |
| **G-4D-03** | everything 4D promises, locally | `node qa/web_4d_local.mjs` | 26 `PASS` lines, each with the label set in section 3; **`4D web local: 26 passed, 0 failed`**; exit 0 |
| **G-4D-04** | 4A behaviours | `node qa/web_4a_local.mjs` | **`4A web local: 25 passed, 0 failed`**; exit 0 |
| **G-4D-05** | build | `npm --prefix book-tracker-frontend-stitch run build` | exit 0 (Vite prints `✓ built in …`) |
| **G-4D-06** | lint (K-07) | `npm --prefix book-tracker-frontend-stitch run lint`; ST-4D-06 | `✖ N problems (E errors, W warnings)` with **E ≤ 36, W ≤ 7** (baseline `43 problems (36 errors, 7 warnings)`); no touched file above its row; `node --check` of the new QA files exit 0 |
| **G-4D-07** | waterfall logic | `node --test "qa/unit/*.test.mjs"` | **`# pass 20`**, `# fail 0` (**`# pass 31`** if 4C's `localDate.test.mjs` is merged first) |
| **G-4D-08** | static rules | ST-4D-01..05, 08..10 | as section 5 |
| **G-4D-09** | the tests test something | section 8 | every row caught and restored |
| G-4D-10 | backend untouched (optional) | `.venv\Scripts\python -m pytest tests -q` | `431 passed`, or inside the F-62 window `428 passed, 3 failed` with exactly the K-15 three |
| G-4D-11 | 4C, if merged | `node qa/web_4c_local.mjs` | `4C web local: 5 passed, 0 failed` |
| G-4D-12 | the dependency map | `python scripts/gen_dependency_map.py && git diff --stat dependency-map.md` | only the `GET /userbooks/user/{user_id}` generated row changes (drops `pages/ProfilePage.jsx`), plus the curated 4D note Doc Sync writes |

Release: section 6, from P-4D-01 (before the deploy) to P-4D-12.

---

## Test Cases (index)

| IDs | Area | Count | Severity |
|---|---|---|---|
| L-4D-01, 02, 02b | R-01 order, public pages, onboarding wait | 3 | 01, 02 Critical; 02b Minor |
| L-4D-03, 04, 05 | R-02 no token, invalid + expired token, `/profile/me` 5xx / offline | 3 | Critical |
| L-4D-06, 06b, 06c, 07, 08, 08b | R-03 admin, stored identity, own profile, own-post controls | 6 | Critical except 06b Major |
| L-4D-09, 16, 17 | R-04 early edit, Settings data loss (K-01), web push | 3 | 16 Critical; 09 Major; 17 Minor |
| L-4D-10, 10b, 10c | R-05 / F-71 sign-out, sign-in, token swap | 3 | Critical |
| L-4D-11, 11b, 12 | R-06 circle order, curator pending, private / unknown circle | 3 | 11, 12 Critical; 11b Major |
| L-4D-13, 13b, 13c | R-07 book detail order, foreign id, Library path | 3 | 13b Critical; 13, 13c Major |
| L-4D-14, 14b | R-08 friend's profile order, locked profile | 2 | 14b Critical; 14 Major |
| L-4D-15 | R-10 4A + build + lint (gates) | 1 | Major |
| W-4D-01..06 | waterfall unit | 6 | 01–04 Major |
| ST-4D-01..10 | static | 10 | per row |
| P-4D-00..12 | production | 13 | per row |
| RG-4D-01..10 | regression | 10 | per row |

**Critical harness cases (18):** 01, 02, 03, 04, 05, 06, 06c, 07, 08, 08b, 10, 10b, 10c, 11, 12, 13b, 14b, 16.

## Priority Guide
- **P0:** ship blocker. Must pass before merge (automated) or before the release is called done (production).
- **P1:** important. Fix within the sprint.
- **P2:** nice to have.

## Automated
- `qa/web_4d_local.mjs`: 26 cases.
- `qa/unit/pagePerfWaterfall.test.mjs`: W-4D-01..06.
- `qa/page_perf.mjs` waterfall: production.
- Unchanged and still required: `qa/web_4a_local.mjs` (25). `pytest tests -q` is not needed (no backend change).

## Failing Tests
None run yet. Junior QA records each failure here with its reason and disposition: fix now / deferred to sprint N / accepted risk.
