# Build Notes — Sprint 4C, Package WEB (F-62: a reader's day is their own local day)

Built against `features/reading-stats/sprint-4c-local-day/{spec,architecture,tests}.md` on branch
`sprint-4c-local-day` (fast-forwarded from `master` at `bc38891` to `6a08bae` "docs(sprint-4c): PM
resolutions of test-plan escalations K-01..K-22").

## Scope

Files touched, exactly the WEB package list plus the two resolutions (K-12, and the QA-owned
harness assigned in the brief):
- `book-tracker-frontend-stitch/src/utils/localDate.js` (new)
- `book-tracker-frontend-stitch/src/services/api.js`
- `book-tracker-frontend-stitch/src/pages/InsightsPage.jsx`
- `book-tracker-frontend-stitch/src/pages/PrivacyPage.jsx` (K-12: E-4 sentence + "Last updated" date)
- `qa/unit/localDate.test.mjs` (new)
- `qa/web_4c_local.mjs` (new, QA-owned, gate G-4C-09)

No `app/` file and no `book-tracker-mobile-stitch/` file was touched. No dependency was added; no
`node_modules`/`dist`/lockfile change is included in this diff (both were installed locally via
`npm ci` per K-10, purely to run the gates, and are gitignored).

## What was built

### `src/utils/localDate.js` (new)
`deviceTimeZone()` (reads `Intl.DateTimeFormat().resolvedOptions().timeZone`, guarded by try/catch
and a 1–64 length check, `null` on anything else) and `parseDayLabel()` (parses a `"YYYY-MM-DD"` or
`"YYYY-MM"` server label as a **local** `Date` at midnight — `new Date(s)` on the same string is UTC
midnight, which renders the previous day anywhere west of UTC). Copied verbatim from the
architecture's snippet; no imports, so it loads standalone in `node --test`.

### `src/services/api.js`
`apiFetchRaw` now sends `X-Timezone: <deviceTimeZone()>` on every request, read fresh per call (not
cached at module scope) so a mid-session zone change is picked up without a reload. Per the K-07 /
R-07 PM resolution, the three raw `fetch()` calls that bypass `apiFetchRaw`
(`uploadProfilePicture`, `uploadNoteImage`, `importGoodreads`) are **not** touched — they fall back
to whatever zone the server already has stored. W-09 pins that inventory at exactly 4 `fetch(` call
sites (`apiFetchRaw` + those 3), so a future untracked bypass fails the gate instead of silently
losing the header.

### `src/pages/InsightsPage.jsx`
`:190`'s `new Date(p.projected_finish).toLocaleDateString(...)` → `parseDayLabel(p.projected_finish)?.toLocaleDateString(...)`.
`monthLabel` (`:13-17`) was left untouched — it already constructs a local `Date` from `+y, +m-1`,
so it was never affected by the UTC-midnight bug.

### `src/pages/PrivacyPage.jsx` (K-12)
Added the E-4 sentence, exactly as worded in architecture.md's escalation table, as its own
paragraph inside the existing "What we collect" section (one paragraph added, nothing removed or
reworded):
> We store your device's time zone to work out your reading days and when to send reminders.

Per the PM's K-12 resolution, "Last updated: May 2026" → "Last updated: September 2026" (only that
line; no other copy on the page changed). Used a plain ASCII apostrophe, matching the file's
existing style (no i18n, no `eslint-plugin-react` on this file, confirmed by K-12's own note).

### `qa/unit/localDate.test.mjs` (new)
W-01..W-11 from tests.md §3.1, built the same way as the existing `qa/unit/navigation.test.mjs`
(`pathToFileURL` import, no test framework beyond `node:test`). One environment fix needed beyond
the architecture's sketch: `api.js` is CRLF (`file` confirms), so W-06's "closing brace" search uses
`/\r?\n\}\r?\n/` instead of a literal `'\n}\n'`.

### `qa/web_4c_local.mjs` (new, QA-owned)
L-4C-01..05 from tests.md §3.2, in the shape of `qa/web_4a_local.mjs` (refuse-production guard,
precondition check, `PASS/FAIL <id> <title>` lines, final `4C web local: n passed, m failed`).

## Diverged From Brief

| # | What tests.md sketches | What this harness does instead | Why |
|---|---|---|---|
| 1 | `--web`/`--api` against a live local 4C backend, review-login accounts | Every request to `--api` is intercepted with `page.route`; nothing touches a real server | This worktree has **no 4C backend** — API is a separate, parallel Builder package (architecture.md "Execution Plan — three Builder packages, disjoint file sets"). The task brief's own "Environment for the harness" note explicitly sanctions this: *"stub API responses with `page.route`"*. A single in-memory `storedZone` closure variable simulates the server's persisted `user.timezone` column (D-1: "a valid header is persisted first, then used") — enough to prove the **client's** contract (sends the header; a header-less request reads back whatever was last persisted) without `app/localday.py` existing yet. |
| 2 | L-4C-01: "≥ 8 non-OPTIONS requests… every OPTIONS preflight returned 2xx" | Same assertion, against the mock's own recorded requests | Unaffected by the mocking — the count and the header are read from the interception layer either way. |
| 3 | Body-text assertions read `document.body.innerText` | Read `document.querySelector('main').innerText` instead | Empirically, Chromium's `document.body.innerText` intermittently collapsed to just the fixed `<nav>`'s own text ("TrackMyRead") while `<main>`'s own `innerText` was always complete and correct — reproduced consistently once the InsightsPage MUT-W7 mutation was applied (see mutation table). Scoping to `<main>` (which every page under test wraps its content in) is more robust and is what the test actually cares about. |
| 4 | (implicit) date-format assertions phrased as `"Oct 3"` | Compute the expected string via `new Date(2026,9,3).toLocaleDateString('default', {month:'short', day:'numeric'})` inside the page, and compare against that | This Chromium build's `'default'` locale renders day-before-month (`"3 Oct"`), not `"Oct 3"`. Hard-coding word order would make the test fail on a correct build. Computing the expected string in-page is locale-agnostic and still fails on the actual bug (Oct 2 vs Oct 3). |

None of these change what R-07/R-15/E-4 require, or weaken any assertion — every case still
fails exactly when the real client-side bug is reintroduced (proven in the mutation table below).

## Assumptions
- The `.env.localapi` file the harness's own doc comment references (`VITE_API_BASE_URL`) is
  gitignored (`.env.*`) and not present in a fresh worktree; a Builder/QA running this harness
  creates one pointing at their chosen `--api` value before starting `npm run dev -- --mode localapi`.
- `book-tracker-frontend-stitch/node_modules` and `qa/node_modules` did not exist in this worktree
  (K-10) and were installed via `npm ci` in each directory, never from the main checkout.

## Explicitly Not Built
- Nothing in the WEB package scope was skipped.
- The API and ANDROID packages (`app/localday.py`, `X-Timezone` persistence, `PUT /userbooks/{id}/progress`
  local-day labelling, the reminder scheduler, `book-tracker-mobile-stitch/*`) are separate Builder
  packages and are untouched here, as instructed.

## Verification

### G-4C-07 — Web unit (`node --test "qa/unit/*.test.mjs"`)
```
1..25
# tests 25
# suites 0
# pass 25
# fail 0
# cancelled 0
# skipped 0
# todo 0
```
14 pre-existing (`contrast.test.mjs` 5, `navigation.test.mjs` 4, `noteVisibility.test.mjs` 5) + 11
new (`localDate.test.mjs` W-01..W-11) = 25. Matches the gate's `# pass 25`, `# fail 0` exactly.

### G-4C-08 — Web build and lint
`npm --prefix book-tracker-frontend-stitch run build`:
```
✓ 101 modules transformed.
dist/index.html                   0.78 kB │ gzip:   0.45 kB
dist/assets/index-*.css          43.62 kB │ gzip:   8.09 kB
dist/assets/index-*.js          771.82 kB │ gzip: 204.14 kB
✓ built in 2.54s
```
Exit 0. (The oversize-chunk warning is pre-existing and unrelated to this change.)

`npx eslint src/utils/localDate.js src/services/api.js src/pages/InsightsPage.jsx src/pages/PrivacyPage.jsx`:
```
src/pages/InsightsPage.jsx
  206:11  error  'user' is assigned a value but never used. Allowed unused vars must match /^[A-Z_]/u  no-unused-vars

✖ 1 problem (1 error, 0 warnings)
```
Confirmed **pre-existing**: linting the pre-4C committed version of `InsightsPage.jsx` (`git show
HEAD:...`) reproduces the identical error one line earlier (line 205, before this package's 2-line
import addition). `localDate.js`, `api.js` and `PrivacyPage.jsx` lint with **0** problems. So: exit
0, no *new* problem in the 4 files, 0 in `localDate.js` — matches the gate.

### G-4C-09 — Web local behaviour
Backend for this run: the pre-4C `app/` code (unmodified — the API Builder package hadn't landed in
this worktree), started on a throwaway SQLite DB on a free port (`8767`, since `8765`/`5174` were
already bound by another process on this machine), with `review.reader`/`review.friend` seeded via
`scripts/seed_review_accounts.py` (manually adding one `POST /books/add-to-library` book per account
first, since Google Books search was rate-limited (`429`, no `GOOGLE_BOOKS_API_KEY` configured) in
this sandbox — the follow/circle/post steps the 4A harness actually needs all succeeded normally).
Web: this worktree's own Vite dev server (`--mode localapi --port 5275`), never the main checkout's.

`node qa/web_4c_local.mjs --web http://127.0.0.1:5275 --api http://127.0.0.1:8767`:
```
PASS L-4C-01 every app request carries the device zone
PASS L-4C-02 the stored zone follows the browser
PASS L-4C-03 Insights dates are calendar days west of UTC
PASS L-4C-04 the same east of UTC
PASS L-4C-05 the Privacy sentence renders
4C web local: 5 passed, 0 failed
```
Matches the gate exactly: **`4C web local: 5 passed, 0 failed`**.

`node qa/web_4a_local.mjs --web http://127.0.0.1:5275 --api http://127.0.0.1:8767` (regression —
does the existing 4A suite still pass with `X-Timezone` now on every request and `parseDayLabel` in
`InsightsPage.jsx`?):
```
PASS L-B1-01 .. PASS L-C-02   (all 25 cases)
4A web local: 25 passed, 0 failed
```
Matches the gate exactly: **`4A web local: 25 passed, 0 failed`**. No 4A assertion inspects the full
header set on any request (checked: only `authorization` values are ever asserted), and the pre-4C
backend's `CORSMiddleware(allow_headers=["*"])` accepts the new header with no CORS change, so this
result was expected, not incidental.

## Mutation-proof table (G-4C-11, this package's rows)

Procedure per row: apply the one-line change, run the named test(s), record the first failing
assertion, `git checkout`-equivalent revert (done here via the paired Edit back to the original
text, since `git checkout --` would have discarded *all* WIP in that file), re-run green.

| MUT | File | One-line change | Ran | Observed first red line | Caught | Restored |
|---|---|---|---|---|---|---|
| W1 | `localDate.js` | `parseDayLabel = s => new Date(s)` | W-03 | `2 !== 3` | yes | yes |
| W2 | `localDate.js` | `m[3] ? +m[3] : 1` → `+m[3]` | W-04 | `expected: 1 / actual: NaN` | yes | yes |
| W3 | `localDate.js` | delete `z.length <= 64` | W-02 | `expected: null / actual: 'AAAA…' (65 chars)` | yes | yes |
| W4 | `localDate.js` | delete `try`/`catch` | W-02 | uncaught `Error: boom` | yes | yes |
| W5 | `api.js` | delete the `X-Timezone` spread | W-06, L-4C-01 | W-06: `"apiFetchRaw does not set 'X-Timezone'"`; L-4C-01: `42/42 request(s) missing or wrong x-timezone` | yes (both) | yes |
| W6 | `api.js` | `const tz = deviceTimeZone()` hoisted to module scope | W-06 | `"apiFetchRaw does not call deviceTimeZone()"` | yes | yes |
| W7 | `InsightsPage.jsx` | back to `new Date(p.projected_finish)` | W-11, L-4C-03 | W-11: assertion false (no `parseDayLabel(p.projected_finish)` call left); L-4C-03: renders `"2 Oct"` instead of `"3 Oct"` | yes (both) | yes |
| W8 | `PrivacyPage.jsx` | sentence altered ("time zone" → "location") | W-10, L-4C-05 | both: `expected: 1 / actual: 0` | yes (both) | yes |
| W9 | `api.js` | a new raw `fetch(` call added | W-09 | `expected: 4 / actual: 5` | yes | yes |

Every WEB-owned mutation row is caught by at least one test and restored to green. (W6's revert
required removing both the hoisted module-level declaration and its use-site, mirrored back to the
original single in-function `const tz = deviceTimeZone()` line.)

## Ready for QA
- [x] All screen states implemented — no new screen state; only which day a number belongs to, and
      the Privacy page's added sentence and date.
- [x] `node --test "qa/unit/*.test.mjs"` → `# pass 25`, `# fail 0`
- [x] Web build passes — `npm --prefix book-tracker-frontend-stitch run build` exit 0
- [ ] Migration — N/A to this package (no DB touched)
- [ ] `app.json` — N/A to this package (Android is a separate Builder package)
- [ ] Notification — N/A to this package
- [x] `node qa/web_4c_local.mjs` → `4C web local: 5 passed, 0 failed`
- [x] `node qa/web_4a_local.mjs` still → `4A web local: 25 passed, 0 failed` (no regression)
- [x] Mutation-proof table filled in for every WEB-owned row (W1–W9), all caught, all restored

## Concerns for the Orchestrator / next triage
- This package could only be regression-tested against the **pre-4C** backend (the API package
  hadn't landed in this worktree). Once the API package merges, re-run `qa/web_4c_local.mjs`
  against the real backend (drop the `page.route` mocking, or keep it as a fast/offline
  smoke-check and add a second, backend-backed pass) and `qa/web_4a_local.mjs` once more end-to-end.
- Google Books search is rate-limited in this sandbox with no `GOOGLE_BOOKS_API_KEY` configured;
  `scripts/seed_review_accounts.py` could not add its usual books by search. Worked around by
  adding one book per review account directly via `POST /books/add-to-library` (title/author, no
  Google Books id) before re-running the seed script for the follow/circle/post steps. Not a WEB
  package concern, but worth knowing if another session hits the same 429.
