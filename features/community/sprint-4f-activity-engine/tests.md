---
screen: sprint-4f-activity-engine
feature: community
test_plan_written: 2026-09-23
last_run: —
pass_rate: —
written_by: Senior QA (before Builder; branch HEAD cf2f5a8 is docs only — no 4F product, bot, harness or test code exists on this branch)
sources: spec.md (approved 2026-09-23, R-01..R-16), architecture.md (architecture-complete, incl. §"Call sites", §"Security review", §"Test strategy" B-*/C-*/W-*/A-*/P-*, §"Non-vacuity rules (from 4C, K-08 onward)"), pm-decisions.md (binding, 2026-09-23, E-1..E-9), plus the four PM rulings handed to QA on 2026-09-23 (prompt-pool floor, silent dedup ignore, E-9 as a production check, 4E merge order). House style: features/reading-stats/sprint-4c-local-day/tests.md and features/maintenance/sprint-4d-page-speed/tests.md. Product code read on THIS branch at cf2f5a8 for every file:line cited: app/models.py, app/schema_guard.py, app/deps.py, app/crud.py, app/database.py, app/main.py, app/server_timing.py, app/routers/{notes_router,auth_router,follow_router,likes_comments,profile_router,users_router,groups_router,admin_router}.py, app/notifications/{scheduler,dispatcher}.py, editorial_bot.py, .github/workflows/keep-oregon-awake.yml, tests/{conftest,test_notes,test_admin,test_groups,test_books,test_follow_profile,test_dependencies,test_server_timing,test_sql_artifacts}.py, qa/unit/*.test.mjs, qa/web_4d_local.mjs, qa/RULES_OF_ENGAGEMENT.md, book-tracker-mobile-stitch/__tests__/{_ast.mjs,workflows.test.mjs}, book-tracker-frontend-stitch/src/pages/{HomePage,UserProfilePage,GroupDetailPage}.jsx, book-tracker-mobile-stitch/src/screens/{FeedScreen,GroupDetailScreen,UserProfileScreen}.js, context/PM_SQL_QUEUE.md
revised: 2026-09-23 @ a9d4a0c — four corrections after the P1 Builder built against this plan (`build-notes-4f-p1.md`): K-01a/K-01b add the three `REQUIRED_COLUMNS` assertions K-01 missed and the bounded `SCHEMA_GUARD_EXEMPT` that covers them; B-07 is rewritten to what is actually computable (there is no `iat` claim); MUT-4F-11 and MUT-4F-15 are re-worded because neither bit as written; B-24 and B-25b move from P1 to P2, so P1 is 28 cases and P2 is 28. Everything else is unchanged.
baseline_measured: 2026-09-23 on the worktree at cf2f5a8, using the main checkout's `.venv` (the worktree has no `.venv`, no `qa/node_modules` and no `book-tracker-mobile-stitch/node_modules`). `pytest tests -q` → **540 passed, 0 failed, in 960 s (16 min — budget for it in CI and in any mutation loop)**; `--collect-only` → 540 collected. 4C's K-01 flake (`TestImportRegression::test_covers_status_unchanged`) did not reproduce in this run. `node --test "qa/unit/*.test.mjs"` → **34 tests, 34 pass** when `qa/node_modules` exists; **29 tests, 28 pass, 1 fail** when it does not (K-03 — five assertions vanish). Android `node --test "__tests__/*.test.mjs"` (NODE_PATH pointed at the main checkout's node_modules) → **113 tests, 112 pass, 1 FAIL** — `workflows.test.mjs::build_android_yml_absent`, pre-existing on master b98228a (K-02). Query-count probe (throwaway test file, written, run and deleted the same minute): a reader's warm `POST /notes/` executes **5** SQL statements with `is_public: true` and **4** with `is_public: false` (K-09).
---

## How to read this plan

- Cases are grouped by the **work packages in architecture.md** — P1 API security, P2 serialisation / metrics / dedup, P3 web, P4 Android, P5 bot + CI — then by requirement.
- **Ids.** The architecture's ids are kept unchanged: `B-01..B-30` (API), `C-01..C-12` + `C-04a` / `C-05a` (bot package), `W-01..W-03`, `A-01..A-02`, `P-01..P-08`. New ones continue each series (`B-31`, `C-13`, `W-04`, `A-03`) or take a letter suffix (`B-12a`). Production checks are renumbered `P-4F-01..` to avoid colliding with 4C's `P-4C-*` in the run ledger; the architecture's `P-01..P-08` map onto them and the mapping is given in section 8. Other prefixes:
  - `L-4F`: Playwright case in `qa/web_4f_local.mjs`.
  - `ST-4F`: static command, run from the repo root.
  - `RG-4F`: regression.
  - `G-4F`: gate.
  - `MUT-4F`: a row in the mutation-proof table (section 10).
- **Severity:** Critical = labelling, authorisation, privacy, ownership, data integrity, or a feature dead. Major = a core flow or content type broken. Minor = cosmetic or defensive. **Every labelling, authorisation and privacy case is Critical and is never downgraded.**
- **Priority:** P0 ship blocker · P1 fix within sprint · P2 nice to have.
- **Mutation testing is the acceptance rule.** Every case names the **one-line change to named product code** that must turn it red, and the first failure line to expect. Section 10 is the table the Builders fill in. **A test whose mutation stays green is not coverage: the merge is blocked until the test is fixed or the case is deleted.** A case for which no mutation can be named does not appear in this plan — that is why several ideas from the architecture's draft table have been split, tightened or moved to section 8.
- "Expected" is what spec.md, pm-decisions.md and architecture.md promise (as amended by section 0), not what the code does.
- Where a case would collide with Sprint 4E's rewrite of the same function, the case row says **[4E]** and section 0 K-08 says what to do about it.

### Non-vacuity rules — carried forward from 4C, extended for 4F

Binding on every case in this plan. Rules 1–3 are 4C's (architecture.md §"Non-vacuity rules (from 4C, K-08 onward)"); 4–8 are new this sprint, each for a defect this project has actually shipped.

1. **Every injection asserts a control.** A test that makes a user a bot also exercises a reader in the same test that behaves normally. A 403 test with no 200 control cannot tell "bots are blocked" from "everyone is blocked".
2. **Every enumeration first proves its inventory is complete.** A parametrised walk asserts the list it walks **equals** the full set discovered from `app.routes` / the file, before it checks anything. *(The defect this exists for: a test that inspected the wrong call in a multi-call AST walk and therefore asserted nothing — the `api.interceptors.request.use` vs `.response.use` case, 4C M-09.)*
3. **Every detector runs against a synthetic positive.** A rule that greps, walks an AST or scans a log proves on a deliberately-failing snippet that it reports a hit, in the same test.
4. **A walker that finds zero sites fails.** Every enumerating test asserts `found == EXPECTED_N` with `EXPECTED_N` written out in the plan, **before** the per-site assertions. A walk that matches nothing and passes is the exact failure mode this project has already shipped once.
5. **Every new test file opens with an import guard.** `assert callable(...)` / `assert.equal(typeof x, 'function')` on every symbol the file uses, at module scope, so a missing or renamed symbol is one loud failure and never seven silent skips. *(The defect: a test file that imported a non-existent symbol, failed to load, and silently dropped 7 assertions.)*
6. **No gate counts a `-k` filter's output; every gate counts the whole file or the whole suite, exactly.** Where a `-k` filter is used for a mutation run, the plan writes the filter with its **anchors** and the expected collected count, because a substring filter matches more than intended (`book_id` inside `userbook_id`). Mutation rows in section 10 name a test by its **full node id** (`tests/test_bots.py::TestBotLogin::test_x`), never by a substring.
7. **A file that fails to load is a count change, not one failure.** Gates compare `# tests`, `# pass` **and** `# fail` exactly, because a module-level error collapses N assertions into `# fail 1` — measured today: `node --test "qa/unit/*.test.mjs"` reports 34/34 with `qa/node_modules` present and 29/28/1 without, and the 5 missing assertions are invisible in the failure line (K-03).
8. **A test that can pass against unbuilt code is a defect.** Every case in sections 2–6 names, in its own row or in K-07, the symbol whose absence must make it fail loudly rather than skip: the import guard (rule 5) is what converts "not built yet" into a red line.

---

## 0. Findings and escalations from writing this plan — read before building

**K-01, K-02, K-04, K-05 and K-08 need an answer before the Builders start.** Each has a recommended resolution, which the rest of this plan assumes until told otherwise.

| # | Finding (evidence, read on this branch) | Recommended resolution — and what this plan assumes | Owner |
|---|---|---|---|
| **K-01** | **Spec R-02's "The response-shape regression tests stay green unedited" is false, and so is architecture B-23 as written.** **Twelve** existing assertions pin an *exact* key set on a dict that R-02 / R-16 add `is_bot` (or `bot_users` / `bot_notes`) to. *(Corrected by Builder P2, 2026-09-23: this read "Fourteen" while enumerating twelve. Twelve is what broke and twelve is what was amended. `K01_MAX_CHANGED_ASSERTIONS = 14` in B-23' is a separate per-file ceiling and is unaffected.)* **Then thirteen** — `tests/test_groups.py:361` (`m_keys` on `/groups/{id}/members`) broke too, once the PM ruled that the circle member row carries `is_bot` (K-05b). **Treat this list as a floor, not an inventory.** It was hand-written, and it has now been found incomplete three separate times: P1 found three assertions in `tests/test_local_day.py` and `tests/test_sql_artifacts.py` that read `schema_guard.REQUIRED_COLUMNS` and break whenever any sprint appends to it (P1 Finding 1, hence `SCHEMA_GUARD_EXEMPT`), and P2 found `tests/test_groups.py:361`. A Builder who adds a response key must re-derive the set — `grep -rn "keys()) ==" tests/` plus the typed response models — and **must not** assume this row is complete. Deriving it mechanically, once, would retire the problem; until someone does, every count in this row is a lower bound. Measured, all on this branch: `tests/test_notes.py:1106` (`/notes/feed`), `:1107` (`/notes/me`), `:1108` (`/notes/friends-feed`), `:1109` (`/notes/user/{id}`), `:1110` (`/notes/userbook/{id}`) — all `set(row["user"].keys()) == {...}`; `tests/test_notes.py:1142` (same, unauthenticated feed); `tests/test_notes.py:1203` — `assert as_bob["R03 liked"]["user"] == {"id": alice.id, "name": alice.name}`, an exact **dict** equality, values included; `tests/test_admin.py:86` and `tests/test_admin.py:129` (`STATS_KEYS`) — both break on `bot_users` / `bot_notes`; `tests/test_admin.py:133` (`USER_KEYS`) — breaks on `/admin/users` gaining `is_bot`; `tests/test_admin.py:145` (`NOTE_KEYS`) — breaks on `/admin/content/notes` gaining the author's `is_bot`; `tests/test_groups.py:385` — `set(row["user"].keys()) == {"id","name","username","avatar_url"}` on `/groups/{id}/activity`, which architecture P2 adds `is_bot` to (`groups_router.py:1129`). | **Amend the spec.** R-02's last bullet becomes: *"No existing key changes name, type or value. The only permitted edit to `tests/` is (a) adding the new key to an enumerated key set — **at least 13** assertions, listed in tests.md K-01 as a floor — and (b) the bounded `SCHEMA_GUARD_EXEMPT` rework in K-01a. Nothing else in `tests/` changes."* B-23 is re-stated as **B-23'** (section 2.6): the suite passes and `git diff origin/master...HEAD -- tests/` contains **only** added-token lines whose added tokens are drawn from `{is_bot, bot_users, bot_notes}`. That is a stronger test than "unedited", because "unedited" is unachievable and would be satisfied by deleting the assertions. | PM / Architect |
| **K-01a** | **K-01's list is incomplete: three more assertions break, in two files K-01 does not name, and they are not about `is_bot` at all.** Found by the P1 Builder, reported in `build-notes-4f-p1.md` Finding 1, reproduced here. Appending **anything** to `schema_guard.REQUIRED_COLUMNS` (`app/schema_guard.py:10-19`) breaks: `tests/test_local_day.py::TestSchemaGuard::test_guard_passes_when_both_present` and `::test_startup_refuses_before_scheduler_when_column_missing` — both built a `_StubEngine` serving the two **hard-coded** 4C pairs, so "everything present" silently became "two columns missing"; and `tests/test_sql_artifacts.py::TestMigration4C::test_4c_column_types_match_code`, which walked **all** of `REQUIRED_COLUMNS` against the 4C migration's STEP 1 text — an assertion that means "no sprint after 4C may ever add a column", which cannot be what it intended (`schema_guard.py`'s own docstring: *"Every future column migration appends to REQUIRED_COLUMNS"*). **Measured: 8 failures from a two-line guard change** — the three above plus five cascades, because `TestClockIndependence::test_subset_passes_under_tz[*]` spawns a nested pytest over `tests/test_local_day.py` and the two stub failures reappear inside it. | **Already done by P1, and it is the pattern for every future sprint.** The two `_StubEngine` call sites now serve `list(REQUIRED_COLUMNS)` (`tests/test_local_day.py:1042`, `:1090`), so they never need editing again; the deliberate literal **omission** in `test_guard_raises_naming_missing_column` is untouched, because that case is about a missing column. `test_4c_column_types_match_code` is scoped to a local `C4_PAIRS` literal plus `assert set(C4_PAIRS) <= set(REQUIRED_COLUMNS)` (`tests/test_sql_artifacts.py:310-317`) — each sprint's section owns its own columns. **B-23' carries a named, bounded exemption** for this: `SCHEMA_GUARD_EXEMPT = {"tests/test_local_day.py", "tests/test_sql_artifacts.py"}`, asserted to hold **exactly 2** files, with every line added to an exempt file required to carry one of `REQUIRED_COLUMNS` / `C4_PAIRS` / `Sprint 4F` / a comment marker. The exemption cannot widen silently, and it is not a licence to edit those files for anything else. | Recorded — no further decision needed |
| **K-01b** | **A fourth `REQUIRED_COLUMNS` walker exists and is green — deliberately.** A full-suite grep (`grep -rn REQUIRED_COLUMNS --include=*.py`, run on this branch at `a9d4a0c`) finds exactly four readers outside `app/schema_guard.py`: the two fixed stubs, the scoped 4C SQL walk, and **`tests/test_local_day.py::TestSchemaGuard::test_required_columns_match_models`** (`:1096-1105`, 4C's T-4C-G4), which iterates every pair and asserts `cname in tables[tname].columns`. It did **not** break for 4F only because P1 added both `User.is_bot` **and** the `BotPost` model in the same package. It is a *guard*, not a hard-code, so it stays as it is. | **Keep it, and know what it does.** It is the tripwire that catches a `REQUIRED_COLUMNS` entry with no matching SQLModel column — and it fails with a bare `KeyError` on the table name, not an `AssertionError`, if a future sprint declares a table the models do not define. P5 must not add a `REQUIRED_COLUMNS` entry for a table without a model. No other test in the suite reads `REQUIRED_COLUMNS`. | Recorded |
| **K-02** | **The Android workflow test already fails on this branch, and 4F makes it worse.** `book-tracker-mobile-stitch/__tests__/workflows.test.mjs:73` asserts `fs.readdirSync(.github/workflows).sort()` deep-equals exactly `['build-stitch-aab.yml','build-stitch-apk.yml']`. `keep-oregon-awake.yml` was added by master b98228a and the assertion was not updated. Measured today: `# tests 113, # pass 112, # fail 1`. P5 adds `.github/workflows/tmr-bots.yml`, a third unexpected entry. | **P5 owns the fix.** `build_android_yml_absent` keeps its `build-android.yml` absence check and its directory listing becomes an explicit allowlist of four files, with `tmr-bots.yml` and `keep-oregon-awake.yml` named and commented. Case **C-20**. The Android gate G-4F-07 then expects `# tests 113, # pass 113, # fail 0` **plus** P4's and P5's new tests. This is a pre-existing defect: log it as a triage row (F-75 candidate) as well as fixing it. | P5 / triage |
| **K-03** | **A test file that fails to load hides its assertions, and the worktree reproduces it today.** `node --test "qa/unit/*.test.mjs"` gives `# tests 34, # pass 34` in a tree with `qa/node_modules`, and `# tests 29, # pass 28, # fail 1` without it — `pagePerfWaterfall.test.mjs` imports `qa/page_perf.mjs`, which imports `playwright`. Five assertions disappear and the run still looks like "one known failure". | Non-vacuity rule 7. Builders run `npm ci --prefix qa` **in the worktree** (never npm in the main checkout, 4C K-10). Gate G-4F-06 compares `# tests`, `# pass` and `# fail` exactly against 34 + the new cases. | Builders |
| **K-04** | **Spec R-02 mislabels two of the seven note-serialising sites, and an enumerating test written from those labels would miss one.** Read on this branch: the route decorators are `notes_router.py:257` `/notes/feed`, `:333` `/notes/me`, `:394` `/notes/user/{user_id}`, `:466` `/notes/userbook/{userbook_id}`, `:510` `/notes/friends-feed`. So the dict at `:380` belongs to **`/notes/me`**, not to `/notes/friends-feed`; and `:606` is `/notes/friends-feed`'s **only** shape, not a "second shape". The line numbers in R-02 are all correct; two of the labels are not. `tests/test_notes.py:1107` (`me` has `profile_picture`, no `is_mutual`) and `:1108` (`ff` has `is_mutual`) confirm which is which. **Corrected in `spec.md` by Doc Sync, 2026-09-23** (branch `builder-4f-docs`): R-02 now reads `:380` = `/notes/me` and `:606` = `/notes/friends-feed`'s only shape, with the five route decorators listed underneath as the evidence. | **Doc Sync corrects R-02's two labels.** This plan's B-16 enumerates by **route path discovered from `app.routes`**, not by the spec's labels, and asserts the discovered set equals the seven-entry map in section 3.2 — so a mislabelled document cannot produce a test that skips a site. Until Doc Sync lands, **section 3.2 of this plan is the authoritative map** and the P2 Builder works from it, not from R-02's prose. | Doc Sync / Architect |
| **K-05** | **Architecture P3 lists a web badge site that can never render a badge.** `HomePage.jsx:704` renders `item.user?.name` for `/userbooks/friends/currently-reading` (the "friends are reading" strip). That endpoint is **not** in spec R-02's list, and its `user` dict is pinned by `tests/test_books.py:717` to `{"id","is_mutual","name","username","profile_picture"}`. A `<BotBadge user={item.user} />` there would read `undefined` and render `null` forever — a Critical-looking test that is structurally vacuous. **Removed from `architecture.md`'s P3 table by Doc Sync, 2026-09-23** (branch `builder-4f-docs`), with the reason recorded beneath the table so it is not silently re-added. P3 had already left the site unbadged and pinned that with a tripwire at `qa/unit/botBadge.test.mjs:162-168`. | **Follow the spec: drop `:704` from P3.** W-04's site inventory is spec R-03's list exactly, and no more: `HomePage.jsx:175`, `:291`, `:641`, `:655`; `UserProfilePage.jsx:386`; `GroupDetailPage.jsx:111` and `:965` — seven sites. If the PM wants the strip badged too, that is `is_bot` on `/userbooks/friends/currently-reading` in P2 and one more edited assertion in K-01's list — a 15-minute change, but it is a change, not a freebie. | Architect / PM |
| **K-05a** | **`HomePage.jsx:655` — the sidebar following list — badges an account whose endpoint does not serialise `is_bot`.** Found by Builder P2 while sweeping every badged site against the endpoint feeding it. `GET /users/following` returns `FollowingUser` (`users_router.py:26-34`), which is not in spec R-02's list, so `<BotBadge user={u} />` there would read `undefined` and render `null` forever — structurally the same defect as K-05. | **PM ruling, 2026-09-23: the opposite resolution to K-05. Add the field; the badge stays.** K-05's `:704` was dropped because a bot can *never* appear there (bots have no shelf). A bot *does* appear in a following list: R-05 permits a reader to follow a bot account — "the prohibition is one-directional" — so dropping the badge would leave a bot rendered **unlabelled** on a surface where readers really will meet one, which is the harm the sprint exists to prevent. `FollowingUser` gains `is_bot: bool = False`, always present, always boolean; B-17's inventory literal goes from 7 to 8. P3's badge is unchanged. | PM / P2 |
| **K-05b** | **`GroupDetailPage.jsx:965` — the circle member row — badges an account whose endpoint does not serialise `is_bot`.** Found by Builder P2 in the same sweep as K-05a. `GET /groups/{group_id}/members` (`groups_router.py:585-613`) returns `{user_id, name, username, profile_picture, role, joined_at}`; it is in neither spec R-02's list nor architecture P2's call-site table (`:844`, `:883`, `:1129` only). A bot can **never** be a circle member (R-05; spec §"Not building"), so on the K-05 rule this is a "drop the badge" case — but dropping contradicts R-03, which commissions this badge by name. | **PM ruling, 2026-09-23: add the field; the badge stays.** R-03 commissions it *with its reason attached* — "the badge is added so that a future mistake is visible rather than silent" — and the same sentence covers `:111`, which works only because P2 added the field to `/groups/{id}/posts`. Half-implemented defence in depth is worse than none: the document asserts a guarantee the code does not provide, and the next person reads the claim rather than the code. Cost of honouring it: one boolean and one key-set edit. Cost of not: a bot rendered as an ordinary member on the screen a reader uses to see who they share a circle with. Added to spec R-02 so it is required, not incidental; B-17's inventory literal goes 8 → 9; `tests/test_groups.py:361` is K-01 amendment **thirteen**. | PM / P2 |
| **K-06** | **`hmac.compare_digest` cannot be proved by timing in this suite.** A statistical timing test on an in-process TestClient is noise. Spec R-08's "constant-time compare" is therefore not behaviourally testable. | **B-07a asserts it structurally**: an AST walk of `auth_router.py`'s `bot_login` function body finds a call to `hmac.compare_digest` and **no** `==` comparison whose operands include the secret name. The detector runs against a synthetic `if payload.secret == configured_secret:` snippet and must report a hit (rule 3). Stated plainly as a structural proof, not a timing proof. | QA |
| **K-07** | **Every case in this plan would "pass" today by not existing.** There is no `tests/test_bots.py`, no `bots/` package, no `BotBadge`. | Non-vacuity rule 5: every new file opens with an import guard at module scope (`from app.deps import deny_bot_actor` / `assert.equal(typeof BotBadge, 'function')`). Before any Builder code lands, the correct result of `pytest tests/test_bots.py` is a **collection error**, not `0 passed`. G-4F-01 records that as the red-first baseline. | Builders |
| **K-08** | ~~**Sprint 4E rewrites the functions eight of these cases measure.**~~ **Mostly void as of 2026-09-23: 4E was descoped and its P3 was dropped**, so nothing in 4E rewrites `_note_relations`, the engagement queries, the feed `user` dicts or the `likes_comments.py` comments query. The original text is kept because it is what comes back if those packages re-open. Rows still marked **[4E]**: B-16, B-17 (comment-author half), B-33 (the pinned query counts), RG-4F-03. | **The merge-order constraint is lifted** (4F pm-decisions §Standing constraints 2, and architecture §"Merge order"): 4F no longer waits. **B-33's pinned 5 / 6 still need re-measuring before P2 merges**, but against a different tree than the one this row assumed — 4E's P1 shipped (`6f37946`, the `last_active` write moved off the request path, `app/deps.py` + `app/database.py`), and B-33 counts a *warm* `POST /notes/`, so the number may well be unchanged. QA re-measures it and QA updates it, not the Builder. B-16's enumeration is written against `app.routes`, so no rebuild can make it stale. | Orchestrator / QA |
| **K-09** | **R-13's "costs a reader nothing" needs a number, and the number exists.** Measured on this branch with a throwaway probe: a reader's **warm** `POST /notes/` (i.e. after the once-a-day `last_active` write at `deps.py:87`) runs **5** statements with `is_public: true`, **4** with `is_public: false`. `tests/test_notes.py:86` already has the `query_counter` fixture and `_queries_for` helper for exactly this, and `app/server_timing.py` exposes the same count on every response as `Server-Timing: db;…;desc="<n> queries"`. | **B-33** pins reader = 5 and bot = 6 (the one extra `COUNT` the cap runs), asserts the **difference** as well as both absolute numbers, and cross-checks the reader's number against the `Server-Timing` header so a change in how the count is taken cannot hide a change in the count. Re-measure after 4E (K-08). | API |
| **K-10** | **"Before any row is written and before any notification is queued" (R-05) is an ordering claim, and a status-code test does not prove it.** Both notification paths are `background_tasks.add_task(fire_event, …)` (`likes_comments.py:70-79` like, `:141-150` comment; `follow_router.py:47-51` follow), which TestClient runs *after* the response — so a test that only checks the 403 proves nothing about ordering. | Three independent proofs, all required: **B-12a** structural (the `deny_bot_actor` dependency is in `route.dependant` for exactly those four routes and for no other route — FastAPI runs dependencies before the handler body, so this *is* the "before"); **B-08..B-11** row counts unchanged; **B-11a** a `fire_event` spy that records every call and is asserted empty, plus `NotificationLog` count unchanged; **B-12c** `stmt_counter.inserts == 0` on the 403 path. The `_StatementCounter` in `tests/conftest.py:167` gains an `inserts` attribute (regex `^\s*INSERT\s`) — additive, no existing test reads it. | API |
| **K-11** | **`/admin/stats` has two independent copies of its key set**, `tests/test_admin.py:86` (inline, inside `test_stats_has_push_subscribed_users_distinct_count`) and `tests/test_admin.py:129` (`TestAdminRegression.STATS_KEYS`). A Builder who edits one and not the other gets a green-looking local run and a red gate. | Both are named in K-01's list of 14. B-19 asserts the two are **the same set** (`==`) as a guard against them drifting apart again. | API |
| **K-12** | **E-9's "every bot bio begins 'Automated account.'" has no server-side enforcement and will not get one** (PM ruling, 2026-09-23). The bios are set by a PM `UPDATE` (architecture §Data) and by `migrations/add_bot_accounts.py`. Nothing in `app/` reads `bio`. | **Not an automated test.** It is **P-4F-09**, a production check owned by QA/PM, listed in section 8 with the exact verification SQL from architecture §Data (`SELECT count(*) FROM "user" WHERE is_bot AND COALESCE(bio,'') NOT LIKE 'Automated account.%'` → 0). An automated test asserting a string in a migration script would prove the script, not the database, and would read as a guarantee it is not. Said plainly here so nobody later mistakes its absence for an oversight. | QA / PM |
| **K-13** | **The prompt pool floor must be derived, not typed.** The PM ruling: the pool holds **at least 40** prompts, because Thursday's circle-roundup falls back to a second `@TMRPrompts` prompt when the R-11 floor does not fire, so `@TMRPrompts` can carry **three** slots a week against R-10's **60-day** no-repeat window. A test that says `assert len(POOL) >= 40` is satisfiable by a Builder who lowers the window instead. | **C-13** computes the requirement from product code: `slots_per_week` is counted from the workflow's schedule (Tue + Sat + the Thursday fallback = 3) and `window_days` is read from `bots.prompts.NO_REPEAT_DAYS`, then asserts `len(pool) >= ceil(window_days / 7) * slots_per_week + 1`. **C-13a** separately pins `NO_REPEAT_DAYS == 60` and `slots_per_week == 3` with their own mutations, so lowering either to make a small pool "sufficient" goes red. **C-13b** asserts the PM's floor `len(pool) >= 40` as its own case, citing the ruling. All three must pass. | P5 |
| **K-14** | **The silent ignore of `dedup_key` for a reader is specified behaviour** (PM ruling; spec R-07, architecture §"One field, not two"). It is tested as behaviour, not tolerated as an accident: **B-28** (201, no `bot_post` row, no 422, no warning) and **B-28a** (the same key on `PUT /notes/{id}`, which shares `NoteCreateSchema` at `notes_router.py:46-54`, is also ignored and does not 422). | — | API |
| **K-15** | **The two PM SQL steps have no test harness, and architecture §Data numbers them wrongly.** They go into `context/PM_SQL_QUEUE.md`, but `tests/test_sql_artifacts.py` only parses `context/supabase_migration.sql` (`MIGRATION_SQL_PATH`, `:13`). Architecture §Data says "new steps 4 and 5"; **steps 4 and 5 already exist on this branch** — `PM_SQL_QUEUE.md:69` (`## 4. Rating-reset repair`) and `:79` (`## 5. One leftover from QA`), verified at `a9d4a0c`. | **B-25b** adds `TestBotSQL` to `tests/test_sql_artifacts.py`, reading a **bounded** 4F section of `PM_SQL_QUEUE.md` — from its `## 6.` heading to the next `## ` heading (4C K-15's lesson: `text[start:]` scans everything after it). The 4F steps are **6** (the `is_bot` column, the four accounts, the E-9 renames) and **7** (the `bot_post` table and its two indexes). It asserts idempotency (`IF NOT EXISTS` on both the column and both indexes), the four bot emails, the three verification queries, and that the section contains **no** statement touching `note` (R-06: no note row is read, written or moved). **Owner: P2, not P1** — see section 3.5. Architect: correct `architecture.md` §Data. | P2 / Architect |
| **K-16** | **`GET /bots/posted` returns bot-only data and takes the opposite guard to every other route** (403 unless `is_bot`). Architecture §Security review 4 warns that two dependencies with opposite senses and similar names are a mistake waiting to happen. | **B-29b** asserts `deny_bot_actor` is **not** among `/bots/posted`'s dependencies (it would invert the route), and that the route's own check rejects a reader. Paired with B-12a's inventory, which asserts `deny_bot_actor` appears on exactly four routes. | API |

### Open question for the PM

**Q-1 (blocks nothing, answer before P2 merges):** R-16 says `/admin/stats` `total_notes` counts readers' notes only. `total_journals`, `total_likes`, `total_comments` and `total_userbooks` (`admin_router.py:22-39`) are **not** mentioned. A bot creates none of these today — it cannot like or comment (R-05), has no userbooks and writes no journal — so the numbers are correct by construction. This plan therefore does **not** filter them, and **B-19c** asserts they are left unfiltered and are zero for a bot, so the assumption is recorded as a test rather than as silence. If the PM wants them filtered too, it is one `where` each and one more row in K-01's list.

---

## 1. Summary

| Package | New automated cases | Changed existing | Command | Baseline → expected |
|---|---|---:|---|---|
| **P1** API — flag, token, guards ✅ **merged at `a9d4a0c`** | **28** (`tests/test_bots.py`: B-01..B-12 + B-01a/07a/07b/07c/12a/12b/12c, B-21, B-21a, B-22, B-23' + B-23'b, B-25, B-25a, B-31) | `tests/conftest.py` `_StatementCounter` gains `.inserts` (K-10); the 3 forced `REQUIRED_COLUMNS` edits in K-01a | `.venv\Scripts\python -m pytest tests -q` | **540 → 568 passed**, 0 failed (measured) |
| **P2** API — serialisation, cap, metrics, dedup | **28** (`tests/test_bots.py`: B-13..B-20 + B-15a/16a/18a/19b/19c, B-24, B-26..B-30 + B-27a/28a/29a/29b/30a, B-32, B-32b, B-33 · `tests/test_sql_artifacts.py`: B-25b) | the 14 key-set assertions in K-01 | same | see below |
| **P3** Web | **9** (`qa/unit/botBadge.test.mjs`: W-04..W-07 · `qa/web_4f_local.mjs`: L-4F-01..05 — the architecture's W-01..W-03 are three of those five) | — | `node --test "qa/unit/*.test.mjs"`; `node qa/web_4f_local.mjs` | unit **34 → 38 pass**; harness → `4F web local: 5 passed, 0 failed` |
| **P4** Android | **7** (`__tests__/botBadge.test.mjs`: A-01, A-01a, A-02..A-06) | `workflows.test.mjs::build_android_yml_absent` (K-02, case C-20) | `node --test "__tests__/*.test.mjs"` from `book-tracker-mobile-stitch/` | **113 tests / 112 pass / 1 fail → 120 tests / 120 pass / 0 fail** |
| **P5** Bot + CI | **27** pytest (`tests/test_bot_content.py`: C-01..C-19, C-21, C-22 incl. C-02a/04a/05a/11a/13a/13b) **+ 1 changed** node test (C-20) | `__tests__/workflows.test.mjs` | `.venv\Scripts\python -m pytest tests -q` (same suite) | included below |
| Static | ST-4F-01..06 | — | section 7 | as stated |
| Production / PM | P-4F-01..12, D-4F-01..02 | — | section 8 | as stated |
| Regression | RG-4F-01..10 | — | section 9 | per row |

**Expected pytest total: 540 + 28 + 28 + 27 = 623 collected, 623 passed.** That is the gate number (G-4F-02). P1 is in: the suite measured **568 passed, 0 failed** at `5b55c1b`. Node: `qa/unit` **34 → 38**; Android **113 → 120**, with the one pre-existing failure fixed.

**Test mechanics every API case relies on:**
- `tests/conftest.py` as it is today: `pinned_now` (autouse, `BT_TEST_PIN_HOUR`), `freeze_at`, `stmt_counter`, `_make_user`, `_auth`. **One additive change**: `_StatementCounter` gains `inserts` (regex `^\s*INSERT\s`, case-insensitive) beside `selects` and `updates_user` (K-10). No existing test reads it.
- **A bot fixture, not a bot literal.** `_make_bot(db, email="tmrbot@trackmyread.com")` = `_make_user(...)` then `user.is_bot = True; db.add(user); db.commit()`. Every case that uses it also uses a reader in the same test (rule 1).
- **A token for a bot is minted the same way a reader's is** — `_auth(bot)` — *except* in B-02/B-05/B-07, which go through `POST /auth/bot-login` because the route is what those cases are about. This is deliberate: E-4 says the token carries no scope claim, so a bot token and a reader token must be indistinguishable, and a test that could only mint a bot token through the new route would hide it if they were not.
- **Env-gated route.** `_configure_bot_login(monkeypatch, *emails, secret="s3cr3t")` sets `BOT_LOGIN_SECRET` and `BOT_LOGIN_EMAILS`, mirroring `tests/test_auth.py`'s `_configure` for `/auth/review-login` (`auth_router.py:106-120` reads both per request, so monkeypatch works).
- **Fresh email per case**: `4f-<case-id>@trackmyread.com`. `_make_user` returns the **existing** user for a reused email (`conftest.py:59`), so a stored `is_bot` would leak between cases.

---

## 2. Package P1 — the flag, the token, the guards (`tests/test_bots.py`)

Owns `app/models.py`, `app/schema_guard.py`, `app/routers/auth_router.py`, `app/deps.py`, `app/routers/follow_router.py`, `app/routers/likes_comments.py` (whole file, architecture §Work packages), `app/notifications/{dispatcher,scheduler}.py`, `migrations/add_bot_accounts.py`. Requirements R-01, R-05, R-08.

**File header (mandatory, K-07 / rule 5):**
```python
from app.deps import deny_bot_actor          # collection error until P1 builds it
from app.models import User, BotPost         # collection error until P1 builds it
from app import schema_guard
assert callable(deny_bot_actor)
```

### 2.1 The flag — R-01

| # | Pytest node id | Arrange / act | Assert | Mutation → first red line | Sev / Pri |
|---|---|---|---|---|---|
| B-31 | `TestBotFlag::test_is_bot_column_shape` | model introspection on `models.User` | `User.__table__.c.is_bot.type` is `Boolean`; `.nullable is False`; the column default is `False`; `c.is_bot.index is True` (R-16 filters on it on every `/admin/stats` call); a freshly created `_make_user` row has `is_bot is False`, **not `None`** | `is_bot: Optional[bool] = None` on `models.py:36` (MUT-4F-01) → `assert None is False` | Critical P0 |
| B-25 | `TestBotFlag::test_schema_guard_entries` | `schema_guard.REQUIRED_COLUMNS` | contains `("user","is_bot")` **and** `("bot_post","dedup_key")`; every pair exists in `SQLModel.metadata.tables` (catches a typo like `bot_posts`); the 4C pairs are still there | drop either entry from `schema_guard.py:10-19` (MUT-4F-02) → `assert ('bot_post', 'dedup_key') in (...)` | Major P0 |
| B-25a | `TestBotFlag::test_migration_script_creates_non_admin_bots` | import `migrations/add_bot_accounts.py`, run its creation function against the test session | the three new rows have `is_bot is True`, `is_admin is False`, a `password_hash` that `auth.verify_password` rejects for `""` and for the email itself, and a `bio` starting `"Automated account."`; re-running it creates no duplicate row | drop `is_bot=True` (MUT-4F-03) → `assert False is True`; set `is_admin=True` → `assert True is False` | Critical P0 |
| B-25b | **moved to P2** — see section 3.5. It needs `context/PM_SQL_QUEUE.md`, which P1 does not own | | | | |

### 2.2 `/auth/bot-login` — R-08

Instant is the default pin unless stated. `_configure_bot_login` sets both env vars; the "unconfigured" cases unset them.

| # | Pytest node id | Arrange / act | Assert | Mutation → first red line | Sev / Pri |
|---|---|---|---|---|---|
| B-01 | `TestBotLogin::test_404_when_unconfigured` | three sub-cases: neither var set; only `BOT_LOGIN_SECRET`; only `BOT_LOGIN_EMAILS`. Each posts a **valid** body | **404** in all three. **Control:** with both set, the same body returns 200 (proves the body was valid and the 404 was the gate, not the payload) | delete the `if not configured_secret or not allowlist: 404` guard in `auth_router.py` (MUT-4F-05) → `assert 401 == 404` | Critical P0 |
| B-01a | `TestBotLogin::test_not_in_openapi` | `GET /openapi.json` | `"/auth/bot-login"` is not a key in `paths`, exactly as `/auth/review-login` is not (`auth_router.py:122` `include_in_schema=False`) | drop `include_in_schema=False` (MUT-4F-06) → `assert '/auth/bot-login' not in {...}` | Minor P1 |
| B-02 | `TestBotLogin::test_valid_bot_gets_a_working_token` | allowlisted `@trackmyread.com` row with `is_bot=True`, right secret | 200; body has `access_token`; that token on `GET /profile/me` returns 200 with the bot's id; **control:** the same token is accepted by `get_current_user` exactly like a reader's, so the route mints an ordinary user token (E-4) | invert `email_ok and secret_ok` (MUT-4F-07) → `assert 401 == 200` | Critical P0 |
| B-03 | `TestBotLogin::test_401_when_row_is_not_a_bot` | allowlisted `@trackmyread.com` row with `is_bot=False`, right secret | **401**; and `GET /profile/me` with any token previously issued to that email is unaffected (no side effect) | drop the `user.is_bot` check (MUT-4F-08) → `assert 200 == 401` | Critical P0 |
| B-04 | `TestBotLogin::test_401_for_allowlisted_foreign_domain` | `BOT_LOGIN_EMAILS` contains `evil@example.com`; that row exists with `is_bot=True`; right secret | **401**. **Control:** the same test's `@trackmyread.com` bot gets 200 | delete the `endswith("@trackmyread.com")` guard (MUT-4F-09) → `assert 200 == 401` | Critical P0 |
| B-05 | `TestBotLogin::test_all_five_rejections_are_byte_identical` | five requests: (a) email not in the allowlist, (b) allowlisted but wrong domain, (c) allowlisted, right domain, **no row**, (d) row exists but `is_bot=False`, (e) everything right, **wrong secret** | all five: `status_code == 401`; `r.json()` equal to each other; `r.content` byte-equal to each other; the `content-type` and `content-length` headers equal. **Control:** a sixth, valid request returns 200 (so "all identical" is not "all broken") | give any two branches different `detail` strings (MUT-4F-10) → `assert b'{"detail":"Unknown account"}' == b'{"detail":"Invalid credentials"}'` | Critical P0 |
| B-06 | `TestBotLogin::test_never_creates_a_user` | allowlisted `@trackmyread.com` email with **no row**; count `User` rows before and after; right secret | 401; `count(User)` **unchanged**; `crud.get_user_by_email(...) is None` | **the whole `review_login` copy**: drop the `row_ok` term from the credentials check **and** paste the find-or-create block (`auth_router.py:147-156`) (MUT-4F-11) → `assert 200 == 401`. *Pasting the create alone does not bite: `row_ok` (`auth_router.py:220`) 401s a missing row before the paste is ever reached.* | Critical P0 |
| B-07 | `TestBotLogin::test_token_lives_fifteen_minutes` (**rewritten** — see the three traps below) | record `issued_at = datetime.utcnow()` immediately before `POST /auth/bot-login`; decode the token with `auth.decode_token` | **(a)** `exp - calendar.timegm(issued_at.utctimetuple())` is within `895..905` (a 900 s token, ±5 s of scheduling slack); **(b)** that lifetime is `< auth.ACCESS_TOKEN_EXPIRE_MINUTES * 60`, i.e. emphatically not the 30-day default (`auth.py:17`); **(c)** a token minted on a clock shifted **−16 min** is rejected (401) and one minted at **−14 min** is accepted (200) by `GET /profile/me`, where the shift is applied to `app.auth.datetime` inside a `monkeypatch.context()` for the **mint only** and the request runs on the real clock — a genuinely old token, not a patched validator | remove `expires_delta=timedelta(minutes=15)` (MUT-4F-12) → `AssertionError: expected a 900 s token, got 2592000 s` | Critical P0 |
| B-07a | `TestBotLogin::test_secret_compare_is_constant_time` (structural, K-06) | AST of `app/routers/auth_router.py`: locate the `FunctionDef` named `bot_login` (**assert it was found** before anything else) | its body contains a `Call` to `hmac.compare_digest`, and **no** `Compare` node with `Eq` whose source segment mentions the secret variable. **Control:** the same detector on the snippet `def bot_login():\n    if payload.secret == configured_secret: pass` reports exactly 1 violation | replace `compare_digest` with `==` (MUT-4F-13) → `assert ['auth_router.py:bot_login'] == []` | Critical P0 |
| B-07b | `TestBotLogin::test_login_does_not_write_last_active` | bot row with `last_active = None`; `POST /auth/bot-login`; `db.expire_all()` | `user.last_active is None` after the login (R-12; `review_login` sets it at `auth_router.py:159` — the divergence is deliberate). **Control:** a subsequent authenticated `GET /profile/me` *does* set it, via `deps.py:87` | copy `auth_router.py:158-159` into `bot_login` (MUT-4F-14) → `assert datetime(...) is None` | Major P0 |
| B-07c | `TestBotLogin::test_config_read_per_request` | configure, get 200; `monkeypatch.delenv("BOT_LOGIN_SECRET")`; post again | second call is **404** without a restart (mirrors `auth_router.py:177-179`'s own comment) | **hoist both `os.getenv` calls out of `_bot_login_config` to module scope** (MUT-4F-15) → `assert 200 == 404` | Major P1 |

**Three traps in B-07, all hit while building it — do not re-discover them** (`build-notes-4f-p1.md` Finding 2):

1. **There is no `iat` claim.** `auth.create_access_token` (`app/auth.py:64-69`) writes `exp` and nothing else; the earlier wording, `exp - iat == 900`, raises `KeyError`. The issue instant must be taken from the caller's own clock.
2. **`datetime.utcnow().timestamp()` is wrong by the machine's UTC offset.** It reads a naive UTC value as *local* time — 19,800 s out on this machine, which is what the Builder's first draft measured (it reported a "20700 s token" and still passed a loose bound). Use `calendar.timegm(dt.utctimetuple())`.
3. **`freeze_at` does not reach the token.** `app/auth.py` calls `datetime.utcnow()` directly, not `localday.utcnow()`, so the suite's clock seam does not apply. Assertion (c) shifts `app.auth.datetime` for the mint inside a scoped `monkeypatch.context()` — which must be scoped, or it clobbers the autouse `pinned_now` for the rest of the test.

### 2.3 `deny_bot_actor` — R-05, and the proof of "before"

| # | Pytest node id | Arrange / act | Assert | Mutation → first red line | Sev / Pri |
|---|---|---|---|---|---|
| B-08 | `TestDenyBotActor::test_follow_403_and_no_row` | bot B, reader R; `POST /follow/{R.id}` as B | **403**, detail `"Automated accounts cannot interact with readers' posts"`; `count(Follow)` unchanged; `count(NotificationLog where event_type='new_follower')` unchanged | remove `Depends(deny_bot_actor)` from `follow_router.py:13` (MUT-4F-16) → `assert 200 == 403` | Critical P0 |
| B-09 | `TestDenyBotActor::test_like_403_no_row_no_notification` | reader R owns a public note; bot B posts `POST /notes/{id}/like`; `fire_event` spied via `monkeypatch.setattr("app.routers.likes_comments.fire_event", spy)` | 403; `count(Like)` unchanged; **`spy.calls == []`**; `count(NotificationLog)` unchanged. **Control:** reader C liking the same note in the same test → 201, `spy.calls` has one `post_liked` | remove the dependency from `likes_comments.py:31` (MUT-4F-17) → `assert 201 == 403`, then `assert [call(post_liked)] == []` | Critical P0 |
| B-10 | `TestDenyBotActor::test_unlike_403` | as B-09, on `DELETE /notes/{id}/like` | 403; the pre-existing `Like` row (planted directly in the DB) still exists | remove the dependency from `likes_comments.py:83` (MUT-4F-18) → `assert 200 == 403` | Critical P0 |
| B-11 | `TestDenyBotActor::test_comment_403_no_row` | as B-09, on `POST /notes/{id}/comments` | 403; `count(Comment)` unchanged | remove the dependency from `likes_comments.py:114` (MUT-4F-19) → `assert 201 == 403` | Critical P0 |
| B-11a | `TestDenyBotActor::test_no_notification_is_queued_for_any_of_the_four` | one spy on each of `follow_router.fire_event` and `likes_comments.fire_event`; the four bot calls in one test | every spy's call list is **empty**; `count(NotificationLog)` unchanged across all four. **Control:** the same four calls by a reader produce ≥ 2 spy calls (follow, like, comment) | any of MUT-4F-16..19 → `assert [<call>] == []` | Critical P0 |
| B-12 | `TestDenyBotActor::test_reader_still_succeeds_on_all_four` | reader R2 does follow / like / unlike / comment | 200/201 on all four; rows created; notifications fired | make `deny_bot_actor` reject everyone (`if True:`) (MUT-4F-20) → `assert 403 == 200` | Critical P0 |
| B-12a | `TestDenyBotActor::test_dependency_inventory_is_exactly_four_routes` (K-10, rule 2/4) | walk `app.routes`, collect `(methods, path)` for every `APIRoute` whose `route.dependant` transitively calls `deny_bot_actor` — the `_dependency_calls` helper at `tests/test_dependencies.py:15` is the precedent | the set is **exactly** `{("POST","/follow/{followed_id}"), ("POST","/notes/{note_id}/like"), ("DELETE","/notes/{note_id}/like"), ("POST","/notes/{note_id}/comments")}`; `len(...) == 4` is asserted **first**; `("POST","/notes/")` is **not** in it; no `GET` is in it (architecture §Security review 4) | add `deny_bot_actor` to `POST /notes/` (MUT-4F-21) → `assert {…, ('POST','/notes/')} == {…}`; remove it from one route → `assert 3 == 4` | Critical P0 |
| B-12b | `TestDenyBotActor::test_decided_from_the_row_not_the_token` | mint a token for user U **while `U.is_bot is False`**; then set `U.is_bot = True` in the DB and commit; reuse the **same** token on `POST /follow/{R.id}`. Then the reverse: mint while `True`, flip to `False`, reuse | first → **403** (the row now says bot, the token predates it); second → **200** (E-4: no scope claim, revocation is an `UPDATE`) | read `is_bot` from a JWT claim instead of the row (MUT-4F-22) → `assert 200 == 403` | Critical P0 |
| B-12c | `TestDenyBotActor::test_403_path_writes_nothing` (K-10) | `stmt_counter.reset()`; the four bot calls | `stmt_counter.inserts == 0` across all four. **Control:** the same four by a reader give `inserts >= 3` | move the check from a dependency into the handler body, after `db.add(like)` (MUT-4F-23) → `assert 1 == 0` | Critical P0 |

### 2.4 Notifications and the scheduler — R-05

| # | Pytest node id | Arrange / act | Assert | Mutation → first red line | Sev / Pri |
|---|---|---|---|---|---|
| B-21 | `TestBotNotifications::test_fire_event_never_delivers_to_a_bot` | bot B and reader R both with prefs allowing `new_follower`; `fire_event(db, event_type="new_follower", actor_id=R2.id, recipient_ids=[B.id, R.id], …)` | `NotificationLog` rows exist for R and **not** for B; the returned count reflects one delivery. **Control:** R's row proves the call fired at all | remove the `is_bot` filter from `dispatcher._user_wants_event` (`dispatcher.py:91`) (MUT-4F-24) → `assert 2 == 1` | Major P0 |
| B-21a | `TestBotNotifications::test_bot_is_never_named_as_actor` | `fire_event(..., actor_id=<bot>.id, recipient_ids=[R.id])` | no `NotificationLog` row is written naming the bot as `actor_id`. Documented as **defence in depth**: R-05's server guards mean no product path can reach this, so the case's own control is that the *same* call with a reader actor **does** write a row | remove the actor filter (MUT-4F-25) → `assert 1 == 0` | Major P1 |
| B-22 | `TestBotNotifications::test_streak_reminder_never_selects_a_bot` | give a bot and a reader a push token each; both inactive; `freeze_at` inside their 20:00–21:59 local window; run `_send_inactivity_reminders()` with a `fire_event` spy | the spy's recipient ids contain the reader's and **not** the bot's; a `NotificationLog` row exists for the reader only | remove `.where(User.is_bot == False)` from `scheduler.py:39` (MUT-4F-26) → `assert <bot id> not in [<bot id>, <reader id>]` | Major P0 |

### 2.5 What is removed — R-16 / architecture §7

**B-24 is moved to P2** — see section 3.5. It needs `app/routers/admin_router.py`, which P1 does not own.

### 2.6 The existing suite — R-02's last bullet, as amended by K-01

**B-23' is two test nodes**, because the diff rule and the file-list rule fail for different reasons and a single node would hide one behind the other.

| # | Case | Assert | Mutation | Sev / Pri |
|---|---|---|---|---|
| B-23' | `TestExistingSuite::test_only_the_new_key_was_added_to_tests` (static) | `git diff origin/master...HEAD -- tests/` (via `subprocess`), parsed: every removed line is matched, in the same hunk, by an added line differing **only** by tokens drawn from `{"is_bot", "bot_users", "bot_notes"}`; no line is **deleted** without a replacement. The two files in `SCHEMA_GUARD_EXEMPT` (K-01a) are exempt from the token rule **and** the exemption is itself asserted: `len(SCHEMA_GUARD_EXEMPT) == 2`, and every line added to an exempt file carries one of the rework markers. **Control:** the detector, run on a synthetic diff that deletes an assertion, reports 1 violation | delete `tests/test_notes.py:1106` instead of amending it (MUT-4F-28) → `assert ['tests/test_notes.py: deleted without an equivalent replacement: …'] == []` | Critical P0 |
| B-23'b | `TestExistingSuite::test_changed_assertion_files_are_in_k01s_list` (static) | every file with deleted lines in that diff is in K-01's three-file list (`tests/test_notes.py`, `tests/test_admin.py`, `tests/test_groups.py`) **or** in `SCHEMA_GUARD_EXEMPT`; the count of changed assertion lines outside the exempt files is **≤ 14** | edit a fourth file — e.g. delete a line in `tests/test_dependencies.py` (MUT-4F-28b) → `assert tests/test_dependencies.py has deleted lines and is not in K-01's list` | Critical P0 |
| — | the whole suite | `pytest tests -q` → **623 passed, 0 failed** | any of the above | Critical P0 |

---

### 2.6a Amendment to B-23' — the bounded exemption (Builder P2, 2026-09-23)

P1 introduced `SCHEMA_GUARD_EXEMPT = {"tests/test_local_day.py", "tests/test_sql_artifacts.py"}`
for the three assertions that read `schema_guard.REQUIRED_COLUMNS` and break whenever any sprint
appends to it (P1's Finding 1). Its bound was: **every** line added to an exempt file must carry
one of `REQUIRED_COLUMNS` / `C4_PAIRS` / `Sprint 4F` / a comment marker.

**That bound blocks a case this plan itself commissions.** K-15 tells a Builder to add
`TestBotSQL` to `tests/test_sql_artifacts.py` — B-25b, ~85 lines, most of them ordinary code
carrying no marker. Worse, git's 3-line context merges P1's `C4_PAIRS` rework and the appended
class into **one hunk**, so the new block inherits the marker requirement although it replaces
nothing.

**Amended rule, as built:** the marker requirement is scoped to an *edit group* — a run of
`-`/`+` lines bounded by context lines — and applies only to a group that **contains a
removal**. A wholly new block weakens nothing, and `_diff_violations` is what guards removals.
The detector is `_exempt_marker_violations(diff_text)` in `tests/test_bots.py`.

Two synthetic controls are required (rule 3), and both are built:

| Control | Input | Must report |
|---|---|---|
| the rule still fires | an exempt file, one removed assertion replaced by `+        assert True`, no marker | **1** violation |
| the rule does not over-fire | an exempt file: a marked replacement, then a **context line**, then an unmarked new class | **0** violations |

MUT-4F-28 and MUT-4F-28b are unaffected — both are removals, which `_diff_violations` catches.

---

## 3. Package P2 — serialisation, the cap, metrics, atomic dedup (`tests/test_bots.py`)

Requirements R-02, R-07, R-13, R-15, R-16 — plus **B-24** and **B-25b**, reassigned from P1 because they need `app/routers/admin_router.py` and `context/PM_SQL_QUEUE.md` (section 3.5).

### 3.1 The cap — R-13

| # | Pytest node id | Arrange / act | Assert | Mutation → first red line | Sev / Pri |
|---|---|---|---|---|---|
| B-13 | `TestBotCap::test_third_post_in_24h_is_429` | bot B; three `POST /notes/ {"text":…,"is_public":true}` at the pinned instant | 1st **201**, 2nd **201**, 3rd **429**; `count(Note where user_id=B.id) == 2` after all three (the 429 wrote nothing) | raise the cap constant to 99 (MUT-4F-29) → `assert 201 == 429` | Critical P0 |
| B-14 | `TestBotCap::test_reader_third_post_succeeds` | reader R; three posts | all three **201**; `count(Note) == 3` | drop the `current_user.is_bot` condition from the cap block (MUT-4F-30) → `assert 429 == 201` | Critical P0 |
| B-15 | `TestBotCap::test_window_slides` | bot B with two notes whose `created_at` is set directly to **25 h** before the frozen instant; then one more post | **201**. **Control:** a second bot with two notes at **23 h** gets **429** | change the window to "all time" (MUT-4F-31) → `assert 429 == 201`; change 24 h to 48 h → the control `assert 201 == 429` | Major P0 |
| B-15a | `TestBotCap::test_429_is_raised_before_the_note_is_written` | bot at the cap; `stmt_counter.reset()`; post | 429; `stmt_counter.inserts == 0`; `count(Note)` unchanged; a `fire_group_activity_for_user` spy is **not** called | move the cap check below `crud.create_note` (`notes_router.py:161`) (MUT-4F-32) → `assert 1 == 0` | Critical P0 |
| B-33 | `TestBotCap::test_reader_pays_nothing_for_the_cap` **[4E]** (K-09) | warm both accounts with one post each (so the once-a-day `last_active` write at `deps.py:87` is out of the way); then, counting on `tests.conftest.engine` exactly as `tests/test_server_timing.py:33-43` does: one reader `POST /notes/ {"is_public": true}` and one bot `POST /notes/ {"is_public": true}` | reader `== 5` (the pre-4F number, measured 2026-09-23); bot `== 6`; `bot - reader == 1`; and the reader response's `Server-Timing` header parses to the **same** 5 (`app/server_timing.py:56`) | MUT-4F-30 (cap runs for everyone) → `assert 6 == 5`; adding a second cap query → `assert 7 == 6` | Critical P0 |

### 3.2 `is_bot` everywhere — R-02

**The seven note-serialising sites, by route path** (read on this branch; K-04 corrects spec R-02's two labels):

| Route | Handler line | `user` dict line | Today's keys |
|---|---|---|---|
| `POST /notes/` | `:134` | `:197` | `{id, name}` |
| `PUT /notes/{note_id}` | `:204` | `:252` | `{id, name}` |
| `GET /notes/feed` | `:257` | `:318` | `{id, name, username, profile_picture}` |
| `GET /notes/me` | `:333` | `:380` | `{id, name, username, profile_picture}` |
| `GET /notes/user/{user_id}` | `:394` | `:453` | `{id, name}` |
| `GET /notes/userbook/{userbook_id}` | `:466` | `:504` | `{id, name}` |
| `GET /notes/friends-feed` | `:510` | `:606` | `{id, name, username, profile_picture, is_mutual}` |

| # | Pytest node id | Arrange / act | Assert | Mutation → first red line | Sev / Pri |
|---|---|---|---|---|---|
| B-16a | `TestSerialisation::test_note_route_inventory_is_complete` (rule 2/4) | from `app.routes`, collect every `APIRoute` under the `/notes` prefix whose response model is `NoteOutSchema` or `List[NoteOutSchema]` (`notes_router.py:64`) | the `(method, path)` set **equals** the seven rows above, written out as a literal in the test; `len == 7` asserted first. This is the guard that stops an eighth route escaping B-16 | add a new note route returning `NoteOutSchema` without `is_bot` (MUT-4F-33) → `assert 8 == 7` with the new path named | Critical P0 |
| B-16 | `TestSerialisation::test_is_bot_present_and_boolean_at_every_note_site` **[4E]** | parametrised over the seven routes from B-16a's inventory (not a copy-pasted list). A **bot** author and a **reader** author each own one note visible on every route; the caller follows both so friends-feed is populated | for every route and both authors: `"is_bot" in row["user"]`; `isinstance(row["user"]["is_bot"], bool)`; the bot's is `True` and the reader's is `False`. Before asserting, the test asserts it actually **found a row on all seven routes** (`assert sorted(seen) == sorted(EXPECTED_7)`) — a route that returns `[]` must fail, not pass | remove the key from any one site (MUT-4F-34) → `assert 'is_bot' in {'id':…, 'name':…}` naming the route | Critical P0 |
| B-17 | `TestSerialisation::test_is_bot_on_the_other_author_objects` **[4E]** | **eight author sites**, enumerated against the literal `OTHER_AUTHOR_SITES`, whose length is asserted **before** any value is checked (rules 2 and 4): `GET /profile/{id}` (`profile_router.py:227-239` `base`), `GET /users/search?q=` (`users_router.py:15` `UserSearchResult`, route `:37`), comment author on create (`likes_comments.py:157`) and on list (`:192`), group post author (`groups_router.py:844`, `:883`), group activity author (`:1129`), **and `GET /users/following` (`users_router.py` `FollowingUser`)** — added on the PM ruling of 2026-09-23, see K-05a | each carries `is_bot`, boolean, correct value for a bot and for a reader. **Control:** each sub-case asserts it got a non-empty payload first | remove the key from any one (MUT-4F-35) → `assert 'is_bot' in {...}` naming the endpoint | Critical P0 |
| B-18 | `TestSerialisation::test_reader_is_false_never_null_never_absent` | every site from B-16 and B-17, reader author | `row["user"]["is_bot"] is False` — identity, not truthiness, so `None` and `0` both fail | emit `getattr(user, "is_bot", None)` (MUT-4F-36) → `assert None is False` | Critical P0 |
| B-18a | `TestSerialisation::test_bot_is_true_at_every_site` | the same, bot author | `... is True` at every site. The positive half of B-18: a hard-coded `False` passes B-18 and fails here | emit the literal `False` (MUT-4F-37) → `assert False is True` | Critical P0 |
| B-32 | `TestSerialisation::test_existing_keys_are_untouched` | the five list routes | the `user` key set for each equals the pre-4F set **+ `is_bot`** exactly — the same five sets `tests/test_notes.py:1106-1110` pins, computed here as `OLD | {"is_bot"}` | rename `username` → `user_name` at one site (MUT-4F-38) → `assert {…,'user_name'} == {…,'username','is_bot'}` | Critical P0 |

### 3.3 Atomic dedup — R-07, R-15

| # | Pytest node id | Arrange / act | Assert | Mutation → first red line | Sev / Pri |
|---|---|---|---|---|---|
| B-26 | `TestDedup::test_fresh_key_creates_note_and_bot_post_together` | bot B; `POST /notes/ {"text":…, "is_public": true, "dedup_key": "bestseller:9780593321447"}` | **201**; exactly one `BotPost` row with `content_type == "bestseller"`, `dedup_key == "bestseller:9780593321447"`, `bot_email == B.email`, `note_id ==` the returned note id; the `Note` row exists and `is_public is True` | drop `db.add(models.BotPost(...))` (MUT-4F-39) → `assert 0 == 1` | Critical P0 |
| B-27 | `TestDedup::test_duplicate_key_is_409_and_creates_no_note` | B-26's key already used; count `Note` and `BotPost` first; post again with the same key and **different text** | **409**; `count(Note)` **unchanged**; `count(BotPost)` unchanged; no `Note` exists with the second text | catch `IntegrityError` without `db.rollback()` (MUT-4F-40) → `assert 14 == 13` on the note count | Critical P0 |
| B-27a | `TestDedup::test_409_raises_before_the_group_activity_task` | as B-27 with `fire_group_activity_for_user` spied (`notes_router.py:180`) | 409; the spy is **not** called. **Control:** B-26's 201 in the same test **does** call it | move the dedup block below the group-activity hook (MUT-4F-41) → `assert [<call>] == []` | Critical P0 |
| B-28 | `TestDedup::test_reader_dedup_key_is_silently_ignored` (K-14) | reader R; `POST /notes/ {..., "dedup_key": "bestseller:9780593321447"}` — a key a bot **has already used** | **201** (not 409, not 422); `count(BotPost)` unchanged; no warning in `caplog`; the response body is identical in shape to a post made without the key | honour the field without the `current_user.is_bot` condition (MUT-4F-42) → `assert 409 == 201` | Critical P0 |
| B-28a | `TestDedup::test_put_note_ignores_dedup_key` | reader's own note; `PUT /notes/{id} {"text": "edited", "dedup_key": "prompt:1"}` (`NoteCreateSchema` is shared — `notes_router.py:46`, comment at `:54`) | **200**; text updated; `count(BotPost)` unchanged; no 422 | make `dedup_key` a rejected extra field (`model_config = {"extra": "forbid"}`) (MUT-4F-43) → `assert 422 == 200` | Critical P0 |
| B-32b | `TestDedup::test_unknown_content_type_prefix_is_422_for_a_bot` | bot B; `dedup_key = "whatever:1"` and `dedup_key = "nocolon"` | **422** both times; `count(Note)` unchanged (architecture §"One field, not two" — bot-only field, so failing loudly is free). **Control:** all four known prefixes (`bestseller`, `prompt`, `quote`, `circles`) return 201 | accept any prefix (MUT-4F-44) → `assert 201 == 422` | Major P0 |
| B-30 | `TestCrud::test_create_note_default_still_commits` | call `crud.create_note(db, user_id=…, text=…)` with **no** `commit=` kwarg, then read the row from a **second, fresh** `Session(engine)` | the row is visible in the other session (it was committed); `note.id` is not `None`; `inspect(signature(crud.create_note)).parameters["commit"].default is True` | flip the default to `commit=False` at `crud.py:112` (MUT-4F-45) → the second session's query returns `None` → `assert None is not None` | Critical P0 |
| B-30a | `TestCrud::test_create_note_commit_false_flushes_without_committing` | `crud.create_note(db, …, commit=False)` | `note.id is not None` (the `flush()` assigned the `SERIAL`); a **second** session cannot see the row; after `db.rollback()` the row is gone from both | implement `commit=False` as "skip the add" or as a `commit()` anyway (MUT-4F-46) → `assert None is not None`, or the second session sees the row | Critical P0 |
| B-29 | `TestBotsPosted::test_bots_posted_guard_and_union` | seed one `BotPost` (`bestseller:A`) and one legacy `editorial_post` row (`nyt_isbn = B`) | reader token → **403**; no token → **401**; bot token → **200** and `set(body["dedup_keys"]) >= {"bestseller:A", "bestseller:B"}` — the legacy id is present, proving the union (architecture §Data) | read only `bot_post` (MUT-4F-47) → `assert {'bestseller:A'} >= {'bestseller:A','bestseller:B'}`; drop the `is_bot` check (MUT-4F-48) → `assert 200 == 403` | Critical P0 |
| B-29a | `TestBotsPosted::test_since_filters_and_content_type_scopes` | three `BotPost` rows: `bestseller` 200 days old, `bestseller` 10 days old, `prompt` 10 days old | `?content_type=bestseller&since=<90d ago>` returns only the 10-day bestseller; the prompt key never appears under `content_type=bestseller`; an unknown `content_type` returns `{"dedup_keys": []}`, not 500 | ignore `since` (MUT-4F-49) → `assert 2 == 1`; ignore `content_type` → the prompt key appears | Major P0 |
| B-29b | `TestBotsPosted::test_route_does_not_carry_deny_bot_actor` (K-16) | `app.routes` | `deny_bot_actor` is **not** in `GET /bots/posted`'s dependant (it would invert the route); combined with B-12a's `len == 4` | add `Depends(deny_bot_actor)` to `bots_router.py` (MUT-4F-50) → `assert 200 == 403` in B-29, and the inventory `assert 5 == 4` in B-12a | Critical P0 |

### 3.4 Metrics — R-16

| # | Pytest node id | Arrange / act | Assert | Mutation → first red line | Sev / Pri |
|---|---|---|---|---|---|
| B-19 | `TestAdminMetrics::test_reader_counts_do_not_move_when_a_bot_posts` | read `/admin/stats` as admin → snapshot; create a **bot** (a new `User` row) and have it post one note; read again | `total_users`, `new_users_this_week`, `new_users_this_month` (`admin_router.py:91`, `:95`, `:100`) and `total_notes` (`:127`) are **identical**; `bot_users` +1; `bot_notes` +1. **Control:** in the same test a **reader** is created and posts, and then `total_users` +1 and `total_notes` +1 (so "identical" is not "frozen"). Also: `TestAdminRegression.STATS_KEYS` (`tests/test_admin.py:129`) `== ` the inline set at `tests/test_admin.py:86` (K-11) | remove `.where(User.is_bot == False)` from `:91` (MUT-4F-51) → `assert 41 == 40`; from `:127` (MUT-4F-52) → `assert 301 == 300`; hard-code `bot_notes = 0` → `assert 0 == 1` | Critical P0 |
| B-19b | `TestAdminMetrics::test_bot_users_and_bot_notes_are_the_excluded_figures` | as B-19, with 2 bots and 3 bot notes | `bot_users == 2`; `bot_notes == 3`; `total_users + bot_users == count(User)`; `total_notes + bot_notes == count(Note)` — nothing disappeared (R-16) | count bots twice, or count all users in `bot_users` (MUT-4F-53) → `assert 42 == 40` | Critical P0 |
| B-19c | `TestAdminMetrics::test_unfiltered_counters_are_documented` (Q-1) | as B-19 | `total_likes`, `total_comments`, `total_userbooks`, `total_journals` are unchanged by the bot's activity **because the bot has none** — and the test asserts the bot's like/comment/userbook/journal counts are all 0, so the assumption behind not filtering them is recorded | give a bot a `UserBook` row directly and the case goes red, which is the point: it is a tripwire on Q-1 | Major P1 |
| B-20 | `TestAdminMetrics::test_admin_lists_carry_is_bot` | `GET /admin/users` and `GET /admin/content/notes` as admin, with one bot and one reader present | every `/admin/users` row has a boolean `is_bot`, `True` for the bot only; every `/admin/content/notes` row carries the author's `is_bot`, boolean; **control:** both lists are non-empty and contain both accounts | remove the field from `UserSummary` (`admin_router.py:40`) (MUT-4F-54) → `assert 'is_bot' in {...}` | Major P0 |

### 3.5 Reassigned from P1 (they need files P1 does not own)

Both were in P1's list when this plan was written; the P1 Builder reported that neither is buildable inside P1's file set (`build-notes-4f-p1.md` Finding 3) and neither was built or silently skipped. **The P2 Builder owns both.**

| # | Pytest node id | Arrange / act | Assert | Mutation → first red line | Sev / Pri |
|---|---|---|---|---|---|
| B-24 | `TestRemovedRoutes::test_admin_bot_trigger_is_gone` (needs `app/routers/admin_router.py`) | admin token | `POST /admin/bot/trigger` → **404**; `"/admin/bot/trigger"` not in `/openapi.json`; **control:** `GET /admin/stats` as the same admin → 200 | restore `admin_router.py:353-354` (MUT-4F-27) → `assert 200 == 404` | Minor P1 |
| B-25b | `tests/test_sql_artifacts.py::TestBotSQL` (one node, 5 assertions — K-15; needs `context/PM_SQL_QUEUE.md`) | the **bounded** 4F section of `context/PM_SQL_QUEUE.md`: from its `## 6.` heading to the next `## ` heading (4C K-15's lesson — `text[start:]` scans everything after it) | `ADD COLUMN IF NOT EXISTS is_bot BOOLEAN NOT NULL DEFAULT false`; `CREATE UNIQUE INDEX IF NOT EXISTS uq_bot_post` and `CREATE INDEX IF NOT EXISTS ix_bot_post_posted`; the four `@trackmyread.com` emails; the three verification `SELECT`s incl. `WHERE is_bot AND is_admin`; **no** statement whose target table is `note` (R-06) | remove `IF NOT EXISTS` (MUT-4F-04) → assertion on the statement text; add `UPDATE note …` → the `note` assertion fires | Critical P0 |

**The step numbers are 6 and 7, not 4 and 5.** `architecture.md` §Data says the 4F SQL goes into `context/PM_SQL_QUEUE.md` "as new steps 4 and 5". Steps 4 and 5 **already exist** on this branch — `## 4. Rating-reset repair — READ ONLY first (finding F-16)` (`PM_SQL_QUEUE.md:69`) and `## 5. One leftover from QA — WRITES, tiny` (`:79`). 4F's two steps are therefore **6** (the `is_bot` column, the four accounts and the E-9 renames) and **7** (the `bot_post` table and its two indexes), in that order, and K-15's bounded-section heading is re-pointed to `## 6.` accordingly. Architect: correct `architecture.md` §Data.

---

## 4. Package P3 — web (`qa/unit/botBadge.test.mjs`, `qa/web_4f_local.mjs`)

`BotBadge.jsx` is JSX, so Node cannot import it (4C's precedent: `qa/unit/localDate.test.mjs` imports a plain `.js` util; JSX behaviour is proved in the Playwright harness). So P3 splits: **source-shape** cases in `qa/unit/`, **rendered-badge** cases in the harness.

### 4.1 `qa/unit/botBadge.test.mjs` (new; text/AST over source, no JSX import)

File opens with the import guard `assert.ok(fs.existsSync(BADGE_PATH), 'BotBadge.jsx missing')` (K-07).

| # | `test(…)` name | Assert | Control / non-vacuity | Mutation → red | Sev / Pri |
|---|---|---|---|---|---|
| W-04 | `badge_rendered_at_every_r03_site` | for each of the seven spec R-03 sites — `HomePage.jsx:175`, `:291`, `:641`, `:655`; `UserProfilePage.jsx:386`; `GroupDetailPage.jsx:111`, `:965` — the source line **or one of the two lines after it** contains `<BotBadge`; each of the three files imports `BotBadge` | `found === 7` asserted **before** the per-site checks (rule 4); each file's anchor text (e.g. `{post.user?.name \|\| 'User'}`) is located by content, not by line number, so a refactor moves the site rather than voiding the test; the detector run on a synthetic file with zero `<BotBadge` reports 0 | remove the badge from any one site (MUT-4F-55) → `6 !== 7`, naming the site | Critical P0 |
| W-05 | `badge_copies_the_curator_pill_classes` | `BotBadge.jsx` contains the class string `text-xs font-bold uppercase tracking-wider text-secondary bg-secondary/10 px-1.5 py-0.5 rounded-full shrink-0` — byte-for-byte the Curator pill at `GroupDetailPage.jsx:967` (read from that file at test time, **not** re-typed in the test) | the class string is found in `GroupDetailPage.jsx` first, else fail `Curator pill not found — this test is comparing against nothing` | invent a new pill design (MUT-4F-56) → the strings differ | Minor P1 |
| W-06 | `badge_returns_null_when_not_a_bot` | `BotBadge.jsx` source contains an early `if (!user?.is_bot) return null` (or equivalent guard whose test is `user?.is_bot`) and has no other `return` before it | the file parses; exactly one component function found | render unconditionally (MUT-4F-57) → the guard is absent; L-4F-02 is the behavioural half | Critical P0 |
| W-07 | `trigger_bot_control_removed` | `AdminPage.jsx` contains no `triggerBot` and no "editorial bot" trigger button; `src/services/api.js` exports no `triggerBot` (`api.js:356` today) | both files were read and are > 1 KB | leave `triggerBot()` in `api.js` (MUT-4F-58) → `1 !== 0` | Minor P1 |

### 4.2 `qa/web_4f_local.mjs` (new, QA-owned; same shape as `qa/web_4d_local.mjs`)

- **Setup** copies `qa/web_4d_local.mjs:33-60`: `--web` / `--api`, **exit 5** on a `trackmyread.com` / `onrender.com` host, **exit 6** on a missing precondition, never prints a token or secret, one line per case, then `4F web local: <n> passed, <m> failed`.
- **Extra precondition:** the local API's `GET /notes/feed` carries `is_bot` on the `user` object — else exit 6 with `run P2 first, or apply the two SQLite ALTERs`.
- **Fixture:** review.reader (110) posts one note; a local-only bot account is flagged `is_bot = true` in the **local** SQLite DB (never production — `qa/RULES_OF_ENGAGEMENT.md`). Every case starts from a **fresh browser context**, because the 60-second GET cache can serve a stale response (4D lesson).

| # | Case | Steps | Expected | Mutation | Sev / Pri |
|---|---|---|---|---|---|
| L-4F-01 (W-01) | a bot post is badged in the community feed | open `/home`, find the bot's post card | the card shows a `BOT` pill next to the name; the pill's computed classes match W-05's string | MUT-4F-55 → no pill | Critical P0 |
| L-4F-02 (W-01) | a reader's post is not badged, and gains no whitespace | the same page, the reader's card | no `BOT` text anywhere in the card; the card's bounding height equals a pre-4F screenshot's within 2 px (spec R-03: "no extra whitespace") | MUT-4F-57 (render unconditionally) → a pill on the reader card | Critical P0 |
| L-4F-03 (W-02) | profile header and user search | open `/profile/<bot id>`; type the bot's name in the sidebar search | the badge renders beside the `<h1>` and in the search result row | remove either (MUT-4F-55) | Critical P0 |
| L-4F-04 (W-03) | a `user` object with **no** `is_bot` (a stale 60 s cache) | `page.route` the feed call and strip `is_bot` from every `user` object | no badge anywhere; **no console error**; the page renders the same number of cards as the unmodified response | a truthy default in `BotBadge` (MUT-4F-59) → a pill appears on every card | Major P0 |
| L-4F-05 | the R-05a line is visible in the post body | the bot's post text ends with `— automated post from @TMRBot` | the rendered `innerText` of the card contains that exact string, em dash included | the web app trims the last line of a post (MUT-4F-60) → the string is absent | Critical P0 |

---

## 5. Package P4 — Android (`book-tracker-mobile-stitch/__tests__/botBadge.test.mjs`)

There is **no device in CI** and no Play build in this sprint, so every automated Android case is an AST assertion over source, using `__tests__/_ast.mjs` (`parseMobileFile`, `walk`, `findAll`). The behavioural half is D-4F-01/02 in section 8.

File opens with `assert.ok(existsInMobile('src/components/BotBadge.js'))` (K-07).

| # | `test(…)` name | Assert | Control / non-vacuity | Mutation → red | Sev / Pri |
|---|---|---|---|---|---|
| A-01 | `badge_present_at_every_r04_site` | six sites from spec R-04: `FeedScreen.js` feed-post name (`:660`), the "is feeling…" sentence (`:697`), the comment row (`:751`), the user-search row (`:593`); `GroupDetailScreen.js` post author (`:724`); `UserProfileScreen.js` display name (`:303`). For each: a `JSXElement` named `BotBadge` exists in the same JSX parent as the `Text` node that prints the name | the six **anchor** nodes are located by their content (`styles.userName`, `styles.commentName`, `styles.postAuthor`, `styles.userNameText`, the emotion sentence, `styles.userName` on the profile), and `found === 6` is asserted first (rule 4). The same walker on a synthetic screen with no badge reports 0 | remove the badge from any one (MUT-4F-61) → `5 !== 6`, naming the site | Critical P0 |
| A-01a | `feed_card_name_is_wrapped_in_a_userNameRow` | at `FeedScreen.js:654-662` the bare `<View style={{flex:1}}>` now contains a `userNameRow`-styled `View` around the name and the badge (architecture P4: without it the badge cannot sit beside the name) | the `userNameRow` style exists at `FeedScreen.js:1053` and is referenced ≥ 2 times | place the badge outside the row (MUT-4F-62) → the badge is not a sibling of the name `Text` | Major P1 |
| A-02 | `post_text_is_rendered_verbatim` (R-05a floor) | the `Text` that renders `post.text` (`FeedScreen.js:705`) has `{post.text}` as its **only** child — no `.replace(`, no `.split(`, no `.slice(`, no `trimTrailingLine`-shaped call anywhere in `FeedScreen.js`, `GroupDetailScreen.js` or `UserProfileScreen.js` applied to a note's text | the three `post.text` render sites are found (`found === 3`); the detector on a synthetic `<Text>{post.text.replace(/—.*$/,'')}</Text>` reports 1 | strip the trailing line before rendering (MUT-4F-63) → `1 !== 0` | Critical P0 |
| A-03 | `badge_reuses_the_existing_pill_styles` | `BotBadge.js` references `userBadge` / `userBadgeText` (`FeedScreen.js:1055-1057`) and declares **no new** `StyleSheet.create` block with a background colour | both style keys exist in `FeedScreen.js` | invent a new style (MUT-4F-64) → a new `StyleSheet.create` is found | Minor P2 |
| A-04 | `group_avatar_takes_an_isBot_prop` | `GroupDetailScreen.js:42-49`'s local `Avatar({ name, size })` now also takes `isBot`, and the call at `:722` passes it | the `Avatar` `FunctionDeclaration` is found by name | drop the prop (MUT-4F-65) → the param list lacks `isBot` | Minor P2 |
| A-05 | `app_json_is_2_2_4_63` | `expo.version === '2.2.4'`, `expo.android.versionCode === 63` (`scripts/check-version-bump.js --strict` fails the AAB otherwise) | — | leave 2.2.3 / 62 (MUT-4F-66) → `'2.2.3' !== '2.2.4'` | Major P0 |
| A-06 | `versionGuard_and_apiContract_still_green` | the existing `versionGuard.test.mjs::committed_tree_passes_strict` reads its numbers from `app.json` + `release/last-released.json` (4C K-11 already made it do so) and stays green at 2.2.4 / 63; `apiContract.test.mjs::named_imports_resolve_to_real_exports` covers the new `../components/BotBadge` import | — | import `BotBadge` from a path that does not exist (MUT-4F-67) → `apiContract` goes red — this is the defence against the "imported a non-existent symbol" defect | Critical P0 |

---

## 6. Package P5 — the bot package and its CI (`tests/test_bot_content.py`)

Pytest, **no network**: every NYT / Gemini / API call is a monkeypatched double. The file opens with `from bots import common, bestsellers, prompts, quotes, circles` and `assert callable(common.label_line)` (K-07).

### 6.1 The label — R-05a

| # | Pytest node id | Arrange / act | Assert | Mutation → first red line | Sev / Pri |
|---|---|---|---|---|---|
| C-01 | `TestLabel::test_every_post_ends_with_the_exact_e2_string` | build one post of each of the four types with doubled sources | each `text` ends with, character for character, `"\n— automated post from @" + handle`: `—` (em dash) **not** `-` or `–`; a single space after it; lower-case `automated`; the handle for that account (`@TMRBot`, `@TMRPrompts`, `@TMRQuotes`, `@TMRCircles`); **no trailing punctuation or whitespace** (`text == text.rstrip()`). The form is read from one constant in `bots/common.py`, and the test asserts the constant **is** `"— automated post from @{handle}"` | make the line optional for one type, or change the em dash to a hyphen (MUT-4F-68) → `assert '... - automated post from @TMRQuotes' .endswith('... — automated post from @TMRQuotes')` | Critical P0 |
| C-02 | `TestLabel::test_line_is_appended_after_generation` | a Gemini double that returns `""`, and one that returns a string **containing** an em dash | both posts still end with the exact line, exactly once (`text.count(LABEL_PREFIX) == 1`) | move the append before generation (MUT-4F-69) → `assert '' .endswith('— automated post from @TMRBot')` | Critical P0 |
| C-02a | `TestLabel::test_line_is_never_model_generated` | AST of `bots/`: the label constant is a module-level string literal in `bots/common.py`, and no `f`-string or `.format` builds it from a variable other than `handle`; nothing passes the label text to the model client | the constant is found (`found == 1`); the detector on a synthetic `LABEL = model.generate("write a disclaimer")` reports 1 | build the line from model output (MUT-4F-70) → `1 !== 0` | Critical P0 |

### 6.2 Posting through the API — R-07

| # | Pytest node id | Assert | Mutation → first red line | Sev / Pri |
|---|---|---|---|---|
| C-03 | `TestPosting::test_is_public_true_in_every_body` | the captured `POST /notes/` body for all four types has `"is_public": True` explicitly (`notes_router.py:150`'s F-17 default would make an omitted key **private**) | drop the key (MUT-4F-71) → `assert None is True` | Critical P0 |
| C-04 | `TestPosting::test_dedup_key_shape_for_every_type` | every body has `dedup_key` matching `^(bestseller\|prompt\|quote\|circles):.+$`, and its prefix equals the run's content type | omit the key for one type (MUT-4F-72) → `assert None is not None`; use `prompt:` for a quote → `assert 'prompt' == 'quote'` | Critical P0 |
| C-04a | `TestPosting::test_bots_package_has_no_database_access` | **(a)** AST over every file in `bots/`: no `Import`/`ImportFrom` of `sqlalchemy`, `sqlmodel`, `psycopg2`, `psycopg`, `asyncpg`, `app.database`, `app.models`, `app.crud`; no `Name` called `create_engine`; no string literal or `os.getenv` argument equal to `DATABASE_URL`. **(b)** a **subprocess** run of `python -c "import sys; sys.modules['sqlalchemy']=None; import bots.bestsellers, bots.prompts, bots.quotes, bots.circles, bots.common"` exits 0 — so the absence is real at import time, not only in the AST. **Controls:** (a) walked `>= 6` files and the detector on a synthetic `from sqlalchemy import create_engine` reports 1; (b) the same subprocess with `import app.crud` appended exits non-zero | re-add `editorial_bot.py:287-290`'s engine to `bots/common.py` (MUT-4F-73) → `assert ['bots/common.py: sqlalchemy'] == []`, and the subprocess exits 1 | Critical P0 |
| C-05 | `TestPosting::test_429_and_409_fail_the_run_without_retry` | a `POST /notes/` double returning 429, then one returning 409 | each raises / exits non-zero; the double was called **exactly once** in each case (no retry); nothing is written anywhere | add a retry loop (MUT-4F-74) → `assert 3 == 1` | Major P0 |
| C-05a | `TestPosting::test_candidates_filtered_before_the_model_call` | `GET /bots/posted` double returns every ISBN in the NYT double's list except one; a Gemini double counts calls | the Gemini double is called **exactly once** (for the one surviving candidate), not once per skipped book; the posted ISBN is the surviving one | move the filter after generation (MUT-4F-75) → `assert 15 == 1` | Major P0 |
| C-12 | `TestPosting::test_nothing_secret_is_logged` | run all four types with `capsys`; the doubles' responses carry a body containing the sentinel `SEKRIT-BODY`, and the secret is `SEKRIT-SECRET`, the token `SEKRIT-TOKEN` | captured stdout + stderr contain none of the three sentinels, and no `Authorization` header string; they **do** contain a status code and a note id (the control — proves output was captured at all). **Synthetic positive:** the same detector run over a deliberately leaking `print(response.text)` call reports a hit (rule 3 / architecture §6) | `print(response.text)` on error (MUT-4F-76) → `assert 'SEKRIT-BODY' not in '...'` | Critical P0 |

### 6.3 Content — R-09..R-12, R-15

| # | Pytest node id | Assert | Mutation → first red line | Sev / Pri |
|---|---|---|---|---|
| C-06 | `TestBestsellers::test_gemini_failure_falls_back_to_the_description` | a Gemini double that raises; the post still exists, its teaser is the first sentence of the NYT description, ≤ 30 words, and it still carries the C-01 line | remove the `except` around the teaser call (MUT-4F-77) → the exception propagates → `Failed: DID NOT post` | Major P0 |
| C-07 | `TestBestsellers::test_nyt_failure_posts_nothing_and_exits_zero` | an NYT double that raises; **no** `POST /notes/` call is made; the run's exit code is **0** (a skipped day, not a fabricated one) | substitute placeholder book data on failure (MUT-4F-78) → `assert 1 == 0` posts | Major P0 |
| C-08 | `TestDedupWindows::test_prompt_60_days_quote_180_days` | `GET /bots/posted` double returns keys used 30 days ago and 200 days ago. A prompt used 30 days ago is **not** chosen; one used 61 days ago **is**. A quote used 179 days ago is **not** chosen; one used 181 days ago **is**. The `since` the bot sends is `now - NO_REPEAT_DAYS` for its type | ignore the `GET /bots/posted` response when choosing (MUT-4F-79) → the 30-day-old prompt is chosen → `assert 'prompt:7' not in {'prompt:7'}` | Major P0 |
| C-09 | `TestBestsellers::test_legacy_editorial_post_isbn_is_not_reposted` | `GET /bots/posted?content_type=bestseller` double returns a key that exists **only** in `editorial_post` (B-29's union); the NYT list's first entry is that ISBN | the bot posts a **different** ISBN, or nothing; the posted `dedup_key` is never the legacy one | ignore the response and post the first NYT entry (MUT-4F-80) → `assert 'bestseller:B' != 'bestseller:B'` | Critical P0 |
| C-10 | `TestCircles::test_roundup_names_nobody` | a `/groups/public` double carrying reader names, usernames, a private circle's name and per-reader rows | the composed text contains none of the reader names, none of the usernames, and not the private circle's name; it contains only counts and public titles. **Control:** the text is non-empty and contains the public title (so "names nobody" is not "says nothing") | include the top reader's name (MUT-4F-81) → `assert 'Priya' not in '...Priya...'` | Critical P0 |
| C-11 | `TestCircles::test_below_the_floor_posts_a_prompt_not_a_roundup` | doubles giving (a) 2 readers / 2 circles, (b) 3 readers / 1 circle, (c) 3 readers / 2 circles | (a) and (b) post a **prompt** — the `dedup_key` prefix is `prompt:` and the handle in the C-01 line is `@TMRPrompts`; **no** roundup text is posted, softened or otherwise. (c) posts a roundup with `circles:` | lower the floor to 1 (MUT-4F-82) → `assert 'circles:2026-W39'.startswith('prompt:')` | Critical P0 |
| C-11a | `TestCircles::test_fallback_prompt_obeys_the_same_60_day_window` | below the floor, with the 60-day window already containing the "next" prompt | the fallback picks an unused prompt (E-3: "subject to the same 60-day no-repeat window") | skip the window on the fallback path (MUT-4F-83) → a repeat is chosen | Major P0 |
| C-13 | `TestPools::test_prompt_pool_is_sufficient_for_the_worst_case` (K-13) | `slots_per_week` counted from `.github/workflows/tmr-bots.yml`'s schedule (prompt crons + the Thursday cron, because Thursday can fall through) and `window_days = bots.prompts.NO_REPEAT_DAYS`; then `len(pool) >= ceil(window_days / 7) * slots_per_week + 1`. **Nothing in this assertion is a literal.** The computed requirement is printed in the failure message | shrink the pool (MUT-4F-84) → `assert 20 >= 28`; add a fourth prompt slot to the workflow without growing the pool → `assert 40 >= 49` | Critical P0 |
| C-13a | `TestPools::test_window_and_slot_count_are_what_the_pm_decided` | `bots.prompts.NO_REPEAT_DAYS == 60`; `bots.quotes.NO_REPEAT_DAYS == 180`; the counted `slots_per_week == 3`. This is the case that stops C-13 being satisfied by lowering the window | set `NO_REPEAT_DAYS = 7` (MUT-4F-85) → `assert 7 == 60` | Critical P0 |
| C-13b | `TestPools::test_prompt_pool_meets_the_pm_floor` | `len(prompts) >= 40` — the PM's stated floor, asserted separately from C-13 so both a derivation change and a pool shrink are caught, and the ruling is visible in the test | shrink the pool to 39 (MUT-4F-86) → `assert 39 >= 40` | Critical P0 |
| C-14 | `TestPools::test_pool_ids_are_unique_and_stable` | every entry in `prompts.json` and `quotes.json` has a unique `id`; ids are integers or stable strings; no two entries have the same text. A duplicate id makes the no-repeat window a lie | duplicate an id (MUT-4F-87) → `assert 40 == 39` distinct ids | Major P0 |
| C-15 | `TestPools::test_quotes_are_public_domain_by_data` (E-6) | every entry in `quotes.json` has `author`, `work` and `year`; every `year <= 1928`; no entry is missing a field. The rule is enforced on the data, since nothing else can enforce it | add a 1998 quote (MUT-4F-88) → `assert 1998 <= 1928` | Critical P0 |
| C-16 | `TestPools::test_prompts_ask_and_instruct` (R-10) | every prompt contains a `?` and a call to action matching `/\bpost\b/i`; none is generated at runtime (the file is the only source — AST: no model call in `bots/prompts.py`) | a prompt with no question mark (MUT-4F-89) → the offending id is named | Minor P1 |

### 6.4 The workflow and its secrets — R-09, R-14, and the "no `DATABASE_URL`" rule

Parsed with `yaml.safe_load` in pytest (the Python side) and by `__tests__/_ast.mjs`'s `parseYAML` for C-20 (the Node side).

| # | Pytest node id | Assert | Mutation → first red line | Sev / Pri |
|---|---|---|---|---|
| C-17 | `TestWorkflow::test_seven_crons_match_the_r09_table` | `on.schedule` is exactly `['30 13 * * 1','30 13 * * 2','30 13 * * 3','30 13 * * 4','30 13 * * 5','30 05 * * 6','30 05 * * 0']` (set equality **and** length 7 — a duplicated cron must fail); `on.workflow_dispatch.inputs.type` exists | drop or duplicate one cron (MUT-4F-90) → `assert 6 == 7` | Major P0 |
| C-18 | `TestWorkflow::test_kill_switch_is_the_first_step` | the job's **step index 0** has an `if` referencing `vars.BOT_ENABLED` and `!= 'true'`, and it exits before any step that runs `python -m bots.` | move the gate to step 2 (MUT-4F-91) → `assert 1 == 0`; delete it → the `if` is absent | Critical P0 |
| C-19 | `TestWorkflow::test_jitter_precedes_the_post` | a step whose `run` sleeps a random 0–1500 s (`RANDOM % 1500` or equivalent) exists, and its index is **less** than the `python -m bots.` step's | remove the sleep (MUT-4F-92) → the step is absent; move it after → `assert 3 < 2` | Minor P1 |
| C-21 | `TestWorkflow::test_only_three_secrets_and_never_a_database_url` | every `secrets.X` reference across **all** of `.github/workflows/*.yml` is in `{BOT_LOGIN_SECRET, NYT_API_KEY, GEMINI_API_KEY, GITHUB_TOKEN, EXPO_TOKEN}`, and the bot workflow's own set is **exactly** `{BOT_LOGIN_SECRET, NYT_API_KEY, GEMINI_API_KEY}`; the token `DATABASE_URL` appears **nowhere** in `.github/**` (any file, any case); no `env:` block in the bot workflow defines a `*_URL` pointing at `postgres`. **Control:** the walker found `>= 3` workflow files and `>= 1` secret reference, and the detector on a synthetic `env: {DATABASE_URL: ${{ secrets.DATABASE_URL }}}` reports 1 | add `DATABASE_URL` to the workflow (MUT-4F-93) → `assert ['tmr-bots.yml:31 DATABASE_URL'] == []` | Critical P0 |
| C-22 | `TestWorkflow::test_editorial_bot_is_still_present_and_unscheduled` | `editorial_bot.py` **exists** (architecture: deleted only after two successful production runs) and is referenced by **no** workflow and by **no** file under `app/` — `admin_router.py`'s `subprocess.run([sys.executable, "editorial_bot.py"])` (today at `:366`) is gone | delete `editorial_bot.py` in this sprint (MUT-4F-94) → `assert False is True`; leave the admin route → the `app/` reference is found | Minor P1 |
| C-20 | `__tests__/workflows.test.mjs::build_android_yml_absent` (**changed**, K-02) | `build-android.yml` still absent; the directory listing equals the explicit allowlist `['build-stitch-aab.yml','build-stitch-apk.yml','keep-oregon-awake.yml','tmr-bots.yml']` | add an unlisted workflow (MUT-4F-95) → the deepEqual names it | Major P0 |

---

## 7. Static commands and gates

**Static (ST-4F), run from the repo root of the worktree:**

- **ST-4F-01 (no database credential in CI):** `grep -rnE "DATABASE_URL\s*[:=]|(secrets|vars|env)\.DATABASE_URL" .github/workflows/` → **no output**. Duplicates C-21 deliberately: one is a test, one is a command a human can run in five seconds during review. *(Corrected 2026-09-23 by the P5 Builder: the original bare `grep -rn "DATABASE_URL" .github/` can never be empty — `.github/copilot-instructions.md:23` has named it since before this sprint — and satisfying it would mean deleting the workflow comment that documents the prohibition. The rule is a **use** check, not a mention check.)*
- **ST-4F-02 (no driver in the bot package):** `grep -rniE "sqlalchemy|psycopg|sqlmodel|create_engine|DATABASE_URL" bots/` → **no output**.
- **ST-4F-03 (package disjointness):** every path in `git diff --name-only origin/master...HEAD` belongs to exactly one package list in architecture §Work packages, plus this plan's `tests/conftest.py` (K-10), `tests/test_sql_artifacts.py` (K-15), `__tests__/workflows.test.mjs` (K-02) and the 14 files in K-01.
- **ST-4F-04 (the dead trigger is gone):** `grep -rn "bot/trigger\|triggerBot\|editorial_bot" app/ book-tracker-frontend-stitch/src/ .github/` → **no output**.
- **ST-4F-05 (no note migration, R-06):** `git diff origin/master...HEAD -- migrations/ context/` | `grep -iE "^\+.*(UPDATE|DELETE|INSERT).*\bnote\b"` → **no output**.
- **ST-4F-06 (web build and lint):** `npm --prefix book-tracker-frontend-stitch run build` exits 0; `npx eslint src/components/BotBadge.jsx src/pages/HomePage.jsx src/pages/UserProfilePage.jsx src/pages/GroupDetailPage.jsx src/pages/AdminPage.jsx src/services/api.js` — **no new problem** against the rebased base, and **0** in `BotBadge.jsx`.

**Gates (G-4F), in order; a failing gate stops the release:**

| # | Gate | When | Command | Exact expected output | Sev |
|---|---|---|---|---|---|
| G-4F-00 | 4E is merged first | before anything | `git log --oneline origin/master \| grep 4E` | the 4E merge commit is an ancestor of this branch's base (pm-decisions §Standing constraints 2) | Critical P0 |
| G-4F-01 | **Red first** (K-07) | before any Builder code | `pytest tests/test_bots.py tests/test_bot_content.py -q`; `node --test "qa/unit/botBadge.test.mjs"` | pytest: a **collection error** naming `app.deps.deny_bot_actor` / `bots` — never `0 passed`. node: `# fail 1` on the missing-file guard. Recorded in the ledger | Critical P0 |
| G-4F-02 | Backend suite | rebased branch, then the merged tree | `.venv\Scripts\python -m pytest tests -q` | **`623 passed`**, 0 failed, 0 errors (540 + 83; P1's 28 are already in, measured 568). 4C's K-01 one-re-run allowance for `TestImportRegression::test_covers_status_unchanged` still applies and both runs are recorded | Critical P0 |
| G-4F-03 | Clock independence | same tree | `TZ=LIN-14 BT_TEST_PIN_HOUR=0 .venv/Scripts/python -m pytest tests -q`; `TZ=BIT+12 BT_TEST_PIN_HOUR=18 …` (Git Bash, 05:30–23:30 IST, with 4C's `tm_gmtoff` controls) | **`623 passed`** each. B-07's shifted mint clock and B-15's 24-hour window are the two new clock-dependent assertions; B-07 deliberately does **not** use `freeze_at`, because `app/auth.py` bypasses the seam (see the traps under B-07) | Critical P0 |
| G-4F-04 | Static | same tree | ST-4F-01..05 | empty / empty / one package per file / empty / empty | Critical P0 |
| G-4F-05 | Web build and lint | same tree | ST-4F-06 | exit 0; no new lint problem | Major P0 |
| G-4F-06 | Web unit (K-03) | after `npm ci --prefix qa` **in the worktree** | `node --test "qa/unit/*.test.mjs"` | **`# tests 38`**, `# pass 38`, `# fail 0` (34 + W-04..W-07) | Critical P0 |
| G-4F-07 | Android node (K-02) | after `npm ci` in `book-tracker-mobile-stitch/` | `node --test "__tests__/*.test.mjs"` | **`# tests 121`**, `# pass 121`, `# fail 0`, `# skipped 0` (113 + A-01, A-01a, A-02..A-06 from P4, + C-20 from P5; measured on the integrated branch 2026-09-23) | Critical P0 |
| G-4F-08 | Web behaviour, locally | local API on this tree + the dev server on `--mode localapi` | `node qa/web_4f_local.mjs`; then `node qa/web_4d_local.mjs`; then `node qa/web_4a_local.mjs` | `4F web local: 5 passed, 0 failed`; 4D and 4A at their current counts, unchanged; all exit 0 | Critical P0 |
| G-4F-09 | **Mutation proof** | before the merge | section 10 | every row filled: red line recorded, `caught = yes`, restored, suite green again. **An uncaught row blocks the merge** | Critical P0 |
| G-4F-10 | PM SQL, in order | before the deploy | architecture §Deploy order steps 1–2 | the `is_bot` verification returns **exactly 4 rows**, all `is_bot = true`, none `is_admin`; the `bot_post` table and both indexes exist; the bio query returns **0** (K-12 / P-4F-09). **The PM sends the output** | Critical P0 |
| G-4F-11 | Dependency map | after the merge | `python scripts/gen_dependency_map.py && git diff --stat dependency-map.md` | exit 0; the generated appendix gains exactly two routes (`POST /auth/bot-login`, `GET /bots/posted`) and loses one (`POST /admin/bot/trigger`) | Major P0 |
| G-4F-12 | Backend live | after the Render deploy | `curl -s <api>/version`; the Render log | `commit` = the merge SHA; **no** `Migration not applied`; the service is up | Critical P0 |

---

## 8. Production checks after deploy (QA/PM-owned)

Every check obeys `qa/RULES_OF_ENGAGEMENT.md`: read-only SQL run by the PM in the Supabase SQL Editor; only rows of 110 / 111 are mutated; no token, secret or `Authorization` header is ever printed. `<api>` = the production API, `<web>` = `https://www.trackmyread.com`.

The architecture's `P-01..P-08` map to `P-4F-01..08` in the same order; `P-4F-09..12` are new.

| # | Check | How | Expected | Sev / Pri |
|---|---|---|---|---|
| P-4F-01 | The four accounts | `SELECT id,email,username,is_bot,is_admin FROM "user" WHERE is_bot;` and `SELECT count(*) FROM "user" WHERE is_bot AND is_admin;` | exactly **4** rows, all `is_bot`, none `is_admin`; the second query **0** | Critical P0 |
| P-4F-02 | Nothing a bot touched | `SELECT count(*) FROM "like" l JOIN "user" u ON u.id=l.user_id WHERE u.is_bot;` and the equivalents for `comment` and for `follow` (as follower) | **0**, **0**, **0**. Re-run at the end of week 4 | Critical P0 |
| P-4F-03 | The cadence | the feed, plus `SELECT date_trunc('day', created_at AT TIME ZONE 'Asia/Kolkata'), count(*) FROM note n JOIN "user" u ON u.id=n.user_id WHERE u.is_bot GROUP BY 1;` over one full week | **7** posts, at the scheduled times ± the 0–25 min jitter and GitHub's own delay, **none more than 2 on a day**, none exactly on the half hour | Critical P0 |
| P-4F-04 | The kill switch | set the repository variable `BOT_ENABLED=false`; wait for the next scheduled run | the run exits at **step 1**, the log says why, and no note is created. Restore `true` afterwards | Critical P0 |
| P-4F-05 | The back catalogue (R-06) | open an old `@TMRBot` post on `<web>` — one made before this sprint | the badge renders, and `SELECT count(*) FROM note WHERE user_id = <TMRBot>` is the same before and after the `is_bot` UPDATE | Critical P0 |
| P-4F-06 | Metrics do not move | `/admin/stats` before and immediately after a bot post | reader figures **identical**; `bot_notes` **+1** | Critical P0 |
| P-4F-07 | No `DATABASE_URL` in CI | GitHub → Settings → Secrets and variables → Actions, read **by name**, after the bots are live | exactly `BOT_LOGIN_SECRET`, `NYT_API_KEY`, `GEMINI_API_KEY` for these workflows, and **no `DATABASE_URL`** anywhere in the list (E-5/E-7) | Critical P0 |
| P-4F-08 | 409 by hand | re-dispatch a bestseller run with `workflow_dispatch` for a key already posted | **409** in the log; `count(*)` on `note` for that bot **unchanged**; the run fails visibly | Critical P0 |
| P-4F-09 | **E-9 bios (K-12 — QA/PM, not automated)** | `SELECT count(*) FROM "user" WHERE is_bot AND COALESCE(bio,'') NOT LIKE 'Automated account.%';` and `SELECT name FROM "user" WHERE email='tmrbot@trackmyread.com';` | **0**; and the name is `TrackMyRead Bestsellers`. **This is the whole enforcement of E-9.** There is no server-side check and there will not be one; re-run it after any bio edit | Major P0 |
| P-4F-10 | The label on a real card | open the community feed on `<web>` and on an Android **2.2.1** phone | web: the `BOT` pill. Android 2.2.1: **no pill** (expected — E-1) but the post's last line reads `— automated post from @…`. This is the check that proves R-05a is doing the work the badge cannot yet do | Critical P0 |
| P-4F-11 | Render cron deleted | Render dashboard | the job "TMR bot Cron Job" is **deleted**, not suspended, and the paid service is gone from the bill | Major P0 |
| P-4F-12 | The bot is not "active" | `/admin/users`, the bot rows | `is_bot` shows in the admin table; `last_active` moves for the bots (it will — `deps.py:87` stamps it) **and** the reader-facing figures in P-4F-06 do not. Recorded so the known cost of moving to the API is visible rather than surprising | Minor P1 |
| **D-4F-01** | Android 2.2.4 on a device (PM) | install the 2.2.4 test APK; open the feed, a bot's profile, and a comment thread on a bot post | the badge renders at all four visible sites; a reader's card shows none | Critical P0 |
| **D-4F-02** | Android 2.2.1 still works | the 2.2.1 phone, same screens | no crash, no blank card; the extra `is_bot` key is ignored (neither `api.js` allowlists response keys — architecture §"Three layers") | Critical P0 |

---

## 9. Regression — consumers of what changed (from `dependency-map.md`)

| # | Pri / Sev | Consumer | Proof |
|---|---|---|---|
| RG-4F-01 | P0 / Critical | Every client that reads a note's `user` object (web `HomePage.jsx`, `GroupDetailPage.jsx`, `UserProfilePage.jsx`; Android `FeedScreen.js`, `GroupDetailScreen.js`, `UserProfileScreen.js`) | B-32 (old keys + `is_bot` exactly); the 14 amended assertions in K-01; D-4F-02 |
| RG-4F-02 | P0 / Critical | `POST /notes/` — the one route this sprint changes most (new optional field, new cap, new transaction shape) | B-14, B-28, B-28a, B-30, B-33; `TestNotesCRUD`, `TestFeed`, `TestPrivateNotesAndGroupActivity` and `TestPushAfterResponse` (`tests/test_notes.py:144`, `:256`, `:785`, `:1228`) stay green **unedited** |
| RG-4F-03 | P0 / Critical | The F-08 query-count tests **[4E]** (`tests/test_notes.py:952` `TestNoteQueryCount`) | still green: the cap runs only for a bot, so `n_a == n_b` and the `<= 8` / `<= 10` bounds are untouched. B-33 is the positive statement of the same fact |
| RG-4F-04 | P0 / Critical | `crud.create_note` — one caller in `app/` (`notes_router.py:161`, verified by grep) | B-30 (default unchanged), B-30a (the new branch), and every existing note test |
| RG-4F-05 | P0 / Critical | `follow` / `like` / `comment` for readers | B-12; `TestLikesComments` (`tests/test_notes.py:312`), `test_follow_profile.py` follow tests, `test_notifications_api.py` stay green |
| RG-4F-06 | P1 / Major | `/admin/*` — the dashboard reads every field | B-19, B-19b, B-20; `TestAdminRegression` amended per K-01 and otherwise green; the web Admin page renders (L-4F via `qa/screenshots.mjs`) |
| RG-4F-07 | P1 / Major | The inactivity reminder (4C R-11) | B-22; `tests/test_scheduler.py` (20 tests) green **unedited** |
| RG-4F-08 | P1 / Major | `/auth/review-login` — the route `bot_login` is copied from | `TestReviewLogin` green unedited; B-06 proves the one deliberate divergence (no find-or-create) |
| RG-4F-09 | P1 / Major | Circles: a bot is in none, and posts to none | B-12a (no group route carries the dependency, because a bot cannot reach one anyway); `tests/test_groups.py` green except the one K-01 assertion; C-10's privacy assertions |
| RG-4F-10 | P2 / Minor | 4C and 4D harnesses | `node qa/web_4c_local.mjs`, `node qa/web_4d_local.mjs`, `node qa/web_4a_local.mjs` at their current counts, unchanged (G-4F-08) |

---

## 10. Mutation-proof table (Builders fill in; required by G-4F-09)

**Procedure per row:**
1. Apply the one-line change to the named file.
2. Run **only the named tests, by full node id** (rule 6), e.g. `.venv\Scripts\python -m pytest "tests/test_bots.py::TestDenyBotActor::test_follow_403_and_no_row" -q`, or `node --test <file>`.
3. Paste the **first failing assertion line**.
4. `git checkout -- <file>`, re-run, record green.

**The full suite takes 16 minutes**, so never run it per mutation — step 2's single node id is the point, and step 4's green is confirmed once at the end of the package.

**A mutation that needs two edits to bite is one row, not two.** MUT-4F-11 is the worked example: pasting `review_login`'s find-or-create alone is unreachable behind `row_ok`, so the row names the whole copy. Where a Builder finds that a listed mutation splits into two genuinely different product changes, both are recorded with a letter suffix (P1 added `03b`, `17b`, `21a`/`21b`, `28b` that way) — a split is a finding, not bookkeeping.

A row whose tests stay green is **not caught**: the merge is blocked until a test is fixed or added.

| MUT-4F | File | One-line change | Must go red | Expected first red line | Observed | Caught | Restored |
|---|---|---|---|---|---|---|---|
| 01 | `app/models.py` | `is_bot: Optional[bool] = None` | B-31 | `assert None is False` | | | |
| 02 | `app/schema_guard.py` | drop `("bot_post","dedup_key")` | B-25 | `assert ('bot_post','dedup_key') in (...)` | | | |
| 03 | `migrations/add_bot_accounts.py` | create with `is_admin=True` | B-25a | `assert True is False` | | | |
| 04 | `context/PM_SQL_QUEUE.md` | drop `IF NOT EXISTS` | B-25b | assertion on the statement text | | | |
| 05 | `app/routers/auth_router.py` | delete the unconfigured→404 guard | B-01 | `assert 500 == 404` (unconfigured then reaches `None.encode`) | | | |
| 06 | `app/routers/auth_router.py` | drop `include_in_schema=False` | B-01a | `assert '/auth/bot-login' not in {...}` | | | |
| 07 | `app/routers/auth_router.py` | invert `email_ok and secret_ok` | B-02 | `assert 401 == 200` | | | |
| 08 | `app/routers/auth_router.py` | drop the `user.is_bot` check | B-03 | `assert 200 == 401` | | | |
| 09 | `app/routers/auth_router.py` | delete the `@trackmyread.com` guard. **There must be exactly one** — `review_login`, the stated pattern, also filters the *allowlist* by domain, and two guards leave this mutation green | B-04 | `assert 200 == 401` | | | |
| 10 | `app/routers/auth_router.py` | two different 401 `detail` strings | B-05 | `assert b'…Unknown…' == b'…Invalid…'` | | | |
| 11 | `app/routers/auth_router.py` | drop the `row_ok` term from the 401 check **and** paste `review_login`'s find-or-create — the whole copy, because the create alone is unreachable behind `row_ok` | B-06 | `assert 200 == 401` | | | |
| 12 | `app/routers/auth_router.py` | drop `expires_delta` | B-07 | `AssertionError: expected a 900 s token, got 2592000 s` | | | |
| 13 | `app/routers/auth_router.py` | `compare_digest` → `==` | B-07a | `assert ['auth_router.py:bot_login'] == []` | | | |
| 14 | `app/routers/auth_router.py` | write `last_active` on bot-login | B-07b | `assert datetime(...) is None` | | | |
| 15 | `app/routers/auth_router.py` | hoist both `os.getenv` calls out of `_bot_login_config` to module scope — a `try/except NameError` cache never populates and so never bites | B-07c | `assert 200 == 404` | | | |
| 16 | `app/routers/follow_router.py` | remove `Depends(deny_bot_actor)` | B-08, B-11a, B-12a | `assert 200 == 403` | | | |
| 17 | `app/routers/likes_comments.py` | remove it from `:31` | B-09, B-12a | `assert 201 == 403` | | | |
| 18 | `app/routers/likes_comments.py` | remove it from `:83` | B-10, B-12a | `assert 200 == 403` | | | |
| 19 | `app/routers/likes_comments.py` | remove it from `:114` | B-11, B-12a | `assert 201 == 403` | | | |
| 20 | `app/deps.py` | `deny_bot_actor` rejects everyone | B-12 | `assert 403 == 200` | | | |
| 21 | `app/routers/notes_router.py` | add `deny_bot_actor` to `POST /notes/` | B-12a | `assert {…,('POST','/notes/')} == {…}` | | | |
| 22 | `app/deps.py` | read `is_bot` from the JWT claim | B-12b | `assert 200 == 403` | | | |
| 23 | `app/routers/likes_comments.py` | move the check into the handler body, after `db.add(like)` | B-12c | `assert 1 == 0` | | | |
| 24 | `app/notifications/dispatcher.py` | remove the bot recipient filter | B-21 | `assert 2 == 1` | | | |
| 25 | `app/notifications/dispatcher.py` | remove the bot actor filter | B-21a | `assert 1 == 0` | | | |
| 26 | `app/notifications/scheduler.py` | remove `.where(User.is_bot == False)` | B-22 | `assert <bot id> not in [...]` | | | |
| 27 | `app/routers/admin_router.py` | restore `POST /admin/bot/trigger` | B-24 | `assert 200 == 404` | | | |
| 28 | `tests/test_notes.py` | delete `:1106` instead of amending it | B-23' | `assert ['tests/test_notes.py: deleted without an equivalent replacement: …'] == []` | | | |
| 28b | `tests/test_dependencies.py` | delete a line in a file K-01 does not list | B-23'b | `AssertionError: tests/test_dependencies.py has deleted lines and is not in K-01's list` | | | |
| 29 | `app/routers/notes_router.py` | cap constant → 99 | B-13 | `assert 201 == 429` | | | |
| 30 | `app/routers/notes_router.py` | drop `current_user.is_bot` from the cap | B-14, B-33 | `assert 429 == 201` | | | |
| 31 | `app/routers/notes_router.py` | cap window → all time | B-15 | `assert 429 == 201` | | | |
| 32 | `app/routers/notes_router.py` | cap check below `crud.create_note` | B-15a | `assert 1 == 0` | | | |
| 33 | `app/routers/notes_router.py` | add an 8th `NoteOutSchema` route | B-16a | `assert 8 == 7` | | | |
| 34 | `app/routers/notes_router.py` | remove `is_bot` from `:318` | B-16 | `assert 'is_bot' in {'id':…,'name':…}` | | | |
| 35 | `app/routers/profile_router.py` | remove `is_bot` from `:239` | B-17 | `assert 'is_bot' in {...}` | | | |
| 36 | `app/routers/notes_router.py` | `getattr(user,"is_bot",None)` | B-18 | `assert None is False` | | | |
| 37 | `app/routers/notes_router.py` | emit the literal `False` | B-18a | `assert False is True` | | | |
| 38 | `app/routers/notes_router.py` | rename `username` → `user_name` | B-32 | `assert {…'user_name'} == {…'username','is_bot'}` | | | |
| 39 | `app/routers/notes_router.py` | drop `db.add(models.BotPost(...))` | B-26 | `assert 0 == 1` | | | |
| 40 | `app/routers/notes_router.py` | `except IntegrityError:` without `db.rollback()` | B-27 | `assert 14 == 13` | | | |
| 41 | `app/routers/notes_router.py` | dedup block after the group-activity hook | B-27a | `assert [<call>] == []` | | | |
| 42 | `app/routers/notes_router.py` | honour `dedup_key` without the `is_bot` condition | B-28 | `assert 409 == 201` | | | |
| 43 | `app/routers/notes_router.py` | `NoteCreateSchema` forbids extra fields | B-28a | `assert 422 == 200` | | | |
| 44 | `app/routers/notes_router.py` | accept any `dedup_key` prefix | B-32b | `assert 201 == 422` | | | |
| 45 | `app/crud.py` | `commit: bool = False` default | B-30 | `assert None is not None` | | | |
| 46 | `app/crud.py` | `commit=False` commits anyway | B-30a | the second session sees the row | | | |
| 47 | `app/routers/bots_router.py` | read only `bot_post` for the union | B-29 | `assert {'bestseller:A'} >= {'bestseller:A','bestseller:B'}` | | | |
| 48 | `app/routers/bots_router.py` | drop the `is_bot` check | B-29 | `assert 200 == 403` | | | |
| 49 | `app/routers/bots_router.py` | ignore `since` | B-29a | `assert 2 == 1` | | | |
| 50 | `app/routers/bots_router.py` | add `Depends(deny_bot_actor)` | B-29b, B-12a | `assert 5 == 4` | | | |
| 51 | `app/routers/admin_router.py` | remove the filter at `:91` | B-19 | `assert 41 == 40` | | | |
| 52 | `app/routers/admin_router.py` | remove the filter at `:127` | B-19 | `assert 301 == 300` | | | |
| 53 | `app/routers/admin_router.py` | `bot_users` counts all users | B-19b | `assert 42 == 40` | | | |
| 54 | `app/routers/admin_router.py` | remove `is_bot` from `UserSummary` | B-20 | `assert 'is_bot' in {...}` | | | |
| 55 | `HomePage.jsx` | remove `<BotBadge />` from `:175` | W-04, L-4F-01 | `6 !== 7` | | | |
| 56 | `BotBadge.jsx` | invent new pill classes | W-05 | the class strings differ | | | |
| 57 | `BotBadge.jsx` | render the pill unconditionally | W-06, L-4F-02 | a pill on the reader card | | | |
| 58 | `src/services/api.js` (web) | keep `triggerBot()` | W-07 | `1 !== 0` | | | |
| 59 | `BotBadge.jsx` | `user?.is_bot ?? true` | L-4F-04 | a pill on every card | | | |
| 60 | `HomePage.jsx` | trim the post's last line | L-4F-05 | the label string is absent | | | |
| 61 | `FeedScreen.js` | remove the badge from `:697` | A-01 | `5 !== 6` | | | |
| 62 | `FeedScreen.js` | badge outside `userNameRow` | A-01a | the badge is not a sibling of the name | | | |
| 63 | `FeedScreen.js` | `{post.text.replace(/—.*$/,'')}` | A-02 | `1 !== 0` | | | |
| 64 | `BotBadge.js` (Android) | new `StyleSheet.create` | A-03 | a new block is found | | | |
| 65 | `GroupDetailScreen.js` | drop the `isBot` prop | A-04 | the param list lacks `isBot` | | | |
| 66 | `app.json` | leave 2.2.3 / 62 | A-05 | `'2.2.3' !== '2.2.4'` | | | |
| 67 | `FeedScreen.js` | import `BotBadge` from a wrong path | A-06 | `apiContract` names the unresolved import | | | |
| 68 | `bots/common.py` | em dash → hyphen in the label | C-01 | `.endswith(...)` fails, showing both strings | | | |
| 69 | `bots/common.py` | append the label before generation | C-02 | `assert ''.endswith('— automated post from @TMRBot')` | | | |
| 70 | `bots/common.py` | build the label from model output | C-02a | `1 !== 0` | | | |
| 71 | `bots/common.py` | drop `is_public: True` | C-03 | `assert None is True` | | | |
| 72 | `bots/quotes.py` | omit `dedup_key` | C-04 | `assert None is not None` | | | |
| 73 | `bots/common.py` | re-add `create_engine` | C-04a | `assert ['bots/common.py: sqlalchemy'] == []` | | | |
| 74 | `bots/common.py` | retry loop on 429/409 | C-05 | `assert 3 == 1` | | | |
| 75 | `bots/bestsellers.py` | filter after generation | C-05a | `assert 15 == 1` | | | |
| 76 | `bots/common.py` | `print(response.text)` on error | C-12 | `assert 'SEKRIT-BODY' not in '...'` | | | |
| 77 | `bots/bestsellers.py` | remove the Gemini `except` | C-06 | the exception propagates | | | |
| 78 | `bots/bestsellers.py` | placeholder book on NYT failure | C-07 | `assert 1 == 0` | | | |
| 79 | `bots/prompts.py` | ignore `GET /bots/posted` | C-08 | `assert 'prompt:7' not in {'prompt:7'}` | | | |
| 80 | `bots/bestsellers.py` | post the first NYT entry regardless | C-09 | the legacy ISBN is posted | | | |
| 81 | `bots/circles.py` | include the top reader's name | C-10 | `assert 'Priya' not in '...'` | | | |
| 82 | `bots/circles.py` | lower the k-floor to 1 | C-11 | `assert 'circles:…'.startswith('prompt:')` | | | |
| 83 | `bots/circles.py` | fallback skips the 60-day window | C-11a | a repeat is chosen | | | |
| 84 | `bots/content/prompts.json` | shrink the pool to 20 | C-13 | `assert 20 >= 28` | | | |
| 85 | `bots/prompts.py` | `NO_REPEAT_DAYS = 7` | C-13a | `assert 7 == 60` | | | |
| 86 | `bots/content/prompts.json` | shrink the pool to 39 | C-13b | `assert 39 >= 40` | | | |
| 87 | `bots/content/prompts.json` | duplicate an id | C-14 | `assert 40 == 39` | | | |
| 88 | `bots/content/quotes.json` | add a 1998 quote | C-15 | `assert 1998 <= 1928` | | | |
| 89 | `bots/content/prompts.json` | a prompt with no question | C-16 | the offending id is named | | | |
| 90 | `.github/workflows/tmr-bots.yml` | drop one cron | C-17 | `assert 6 == 7` | | | |
| 91 | `.github/workflows/tmr-bots.yml` | move the `BOT_ENABLED` gate to step 2 | C-18 | `assert 1 == 0` | | | |
| 92 | `.github/workflows/tmr-bots.yml` | remove the jitter sleep | C-19 | the step is absent | | | |
| 93 | `.github/workflows/tmr-bots.yml` | add `DATABASE_URL` | C-21, ST-4F-01 | `assert ['tmr-bots.yml:31 DATABASE_URL'] == []` | | | |
| 94 | repo | delete `editorial_bot.py` | C-22 | `assert False is True` | | | |
| 95 | `.github/workflows/` | add an unlisted workflow | C-20 | the deepEqual names it | | | |

---

## 11. What this plan does NOT cover

Stated plainly, because a gap nobody names becomes a gap somebody assumes was covered.

1. **No real Android device in CI, and no Play build in this sprint.** Every automated Android case (A-01..A-06) is an **AST assertion over source**: it proves a `BotBadge` element sits beside a name in the JSX tree. It does **not** prove the pill is visible, legible, correctly coloured, or not clipped at the right edge of a narrow card. That is D-4F-01, done by hand by the PM on a 2.2.4 test APK, and it is the only proof there is. R-04's success criterion is a human looking at a phone.
2. **No proof that the badge reaches installed apps.** E-1 accepted that it does not, for some weeks. The plan tests the *floor* instead (R-05a: C-01, C-02, A-02, L-4F-05, P-4F-10). If R-05a's line is ever dropped as "redundant now the badge exists", Android users below 2.2.4 lose their only label — that is what A-02 and C-01 exist to prevent, and it is why both are Critical.
3. **E-9's bio wording has no automated test and will not get one** (PM ruling, K-12). `P-4F-09` is a production SQL check owned by QA/PM, re-run after any bio edit. A bot whose bio is edited in the database to something else will pass every test in this document.
4. **The constant-time compare is proved structurally, not by timing** (K-06). B-07a proves `hmac.compare_digest` is *called*; it cannot prove the process leaks no timing signal elsewhere (the allowlist lookup, the database query for the row). Rate limiting is absent from the whole API by choice (architecture §Security review 3.8) and this sprint does not add it; a bot-login endpoint can be probed at will.
5. **No live GitHub Actions run is tested.** C-17..C-22 parse the YAML. They cannot prove GitHub honours the cron, that the runner has the secrets, or that a scheduled run happens at all — GitHub delays and sometimes drops scheduled runs. P-4F-03 and P-4F-04 are the only proof, and they take a week.
6. **No PostgreSQL in the automated suite.** The dedup collision (B-27) is proved against SQLite's unique-index `IntegrityError`, not PostgreSQL's. 4C built `qa/pg_4c_migration.py` for exactly this gap; **this sprint does not extend it**, because the 4F SQL is additive and re-runnable and the `IntegrityError`→409 shape is already proved in production by `follow_router.py:39-44`. If the PM wants it, it is a half-day: a `qa/pg_4f_dedup.py` in the same shape.
7. **No concurrency test.** R-15's "two runs racing" is asserted as *"a duplicate key is a 409 and creates no note"* (B-27), not as two simultaneous requests. A true race needs two processes against one PostgreSQL, which this suite cannot run.
8. **No test of Gemini's or the NYT's actual output.** C-06/C-07 use doubles. The quality, tone and accuracy of a generated teaser is not testable here and is not tested; C-15 constrains only the **quote pool's data**, which is why E-6 required a checked-in pool rather than model output.
9. **Nothing proves the bots are wanted.** E-8's "seven a week, measured after four weeks" is a product decision with a date on it, not a test. `P-4F-03` counts the posts; nobody counts whether readers liked them.
10. **`/admin/stats`'s other counters are unfiltered by design, not by proof** (Q-1). B-19c records the assumption as a tripwire; it is not a guarantee that a future bot behaviour cannot inflate them.
11. **The web badge's accessibility is untested.** `qa/a11y_audit.mjs` exists and is not extended here: the pill is copied verbatim from the Curator badge, which already ships, so it inherits whatever that badge's contrast and screen-reader behaviour is — good or bad. A screen-reader user's actual label today is R-05a's text line, which is in the post body and therefore read out.

---

## Test Cases (index)

| IDs | Area | Count | Severity |
|---|---|---|---|
| B-01..B-07c | `/auth/bot-login` | 11 | all Critical except B-01a Minor, B-07b/07c Major |
| B-08..B-12c | `deny_bot_actor` (R-05) | 9 | all Critical |
| B-21, B-21a, B-22 | notifications, scheduler | 3 | Major |
| B-25, B-25a, B-31 | guard, migration script, model | 3 | Critical except B-25 (Major) |
| B-23', B-23'b | the existing suite (K-01, K-01a) | 2 | Critical |
| B-24, B-25b | reassigned to P2 (section 3.5) | 2 | B-25b Critical, B-24 Minor |
| B-13..B-15a, B-33 | the 429 cap (R-13) | 5 | Critical except B-15 Major |
| B-16..B-18a, B-32 | `is_bot` everywhere (R-02) | 6 | all Critical |
| B-26..B-30a, B-32b | atomic dedup (R-07/R-15) | 11 | Critical except B-29a, B-32b Major |
| B-19..B-20 | metrics (R-16) | 4 | Critical except B-19c, B-20 Major |
| W-04..W-07 | web source shape | 4 | W-04, W-06 Critical |
| L-4F-01..05 | web rendered (Playwright) | 5 | 01, 02, 03, 05 Critical |
| A-01, A-01a, A-02..A-06 | Android AST | 7 | A-01, A-02, A-06 Critical |
| C-01..C-22 | bot package, pools, workflow | 28 (27 pytest + C-20, a changed node test) | 13 Critical |
| ST-4F-01..06 | static commands | 6 | Critical except 06 |
| P-4F-01..12, D-4F-01..02 | production, device | 14 | mostly Critical |
| RG-4F-01..10 | regression | 10 | per row |

**Automated new cases: 99** (API pytest 56 — P1 **28**, P2 **28** · bot/CI pytest 27 · web unit 4 · web harness 5 · Android 7), plus 1 changed node test (C-20), 3 forced `REQUIRED_COLUMNS` reworks (K-01a), 6 static commands, 14 production/device checks and 10 regression proofs.

## Priority Guide
- **P0:** ship blocker. Must pass before the merge (automated) or before the bots are switched on (production).
- **P1:** important. Fix within the sprint.
- **P2:** nice to have.

## Automated

`.venv\Scripts\python -m pytest tests -q`:
- `tests/test_bots.py`: `TestBotFlag`, `TestBotLogin`, `TestDenyBotActor`, `TestBotNotifications`, `TestRemovedRoutes`, `TestExistingSuite`, `TestBotCap`, `TestSerialisation`, `TestDedup`, `TestCrud`, `TestBotsPosted`, `TestAdminMetrics`.
- `tests/test_bot_content.py`: `TestLabel`, `TestPosting`, `TestBestsellers`, `TestDedupWindows`, `TestCircles`, `TestPools`, `TestWorkflow`.
- `tests/test_sql_artifacts.py::TestBotSQL`.

Plus `node --test "qa/unit/*.test.mjs"`, `node qa/web_4f_local.mjs`, and `node --test "__tests__/*.test.mjs"` from `book-tracker-mobile-stitch/`.

## Failing Tests

None run yet. Junior QA records each failure here with its reason and disposition: fix now / deferred to sprint N / accepted risk.
