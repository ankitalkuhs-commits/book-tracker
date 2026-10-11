---
screen: sprint-4i-report-block
feature: safety
package: 4I-A — the report API (P1-A + P2)
builder: Builder (4i-report worktree, branch `builder-4i-report`)
built: 2026-10-11
pytest: 814 before -> 855 after (41 new)
---

# Sprint 4I-A build notes — the report API

What shipped: a `report` table, `POST /reports`, `GET /admin/reports`, `PATCH /admin/reports/{id}`,
a `content_reported` admin notification, the report half of the account-deletion cascade, the
schema-guard entry and PM SQL step 10. No block, no `also_block` — that is 4I-B.

Guideline 1.2 item 2 is satisfied only if a report reaches a human, so the queue and the
notification are in this half, not a later one. **How a moderator actually sees a report** is at
the end of these notes.

---

## 1. What was built, file by file

| File | Change |
|---|---|
| `app/models.py` | `+ class Report` after `BotPost` (the insertion point 4F used). `uq_report_once` as a named `UniqueConstraint`, **no foreign keys** (R-07) and **no `index=True` on any column** — PM step 10 creates exactly `uq_report_once` and `ix_report_open`, and a model index the migration does not create is a dev/prod divergence nothing would catch. |
| `app/schema_guard.py` | `+ ("report", "reason")`, 6 entries -> 7, with the deploy-order comment in the shape 4F/4G/4H left. |
| `app/routers/reports_router.py` (new) | `POST /reports`. `deny_bot_actor` as a **route dependency**; the 20-per-24h cap; one byte-identical 404 for every visibility refusal; the `IntegrityError` -> 200 path; `fire_event` as a `BackgroundTask`. |
| `app/main.py` | one import and one `include_router`. |
| `app/notifications/config.py` | `+ "content_reported"` — title and body carry the reason and nothing else. |
| `app/routers/admin_router.py` | `+ GET /admin/reports`, `+ PATCH /admin/reports/{id}`, appended after `list_recent_comments` and **before** `delete_note`, so the two delete routes a resolution uses stay adjacent. Three statements per queue read regardless of row count. |
| `app/routers/auth_router.py` | `+` the `Report` delete, both kinds, above the `user` delete, inside the one transaction that commits at the end. |
| `context/PM_SQL_QUEUE.md` | `+ ## 10. Sprint 4I-A`, appended after step 9 (checked: steps 1-9 are taken, 9 is 4H's and is still outstanding), plus one row in the answers table. |
| `tests/test_reports.py` (new) | 40 collected: S-20..S-22 (table and guard), S-01..S-19 with suffixes, S-24, S-25. |
| `tests/test_sql_artifacts.py` | `+ TestReportSQL` (S-23). |
| `tests/test_bots.py` | `GUARDED_ROUTES` 4 -> 5 and the inventory test renamed `..._is_exactly_five_routes`. **The permitted exception** (pm-decisions' amendment to done-checklist item 7). |
| `tests/test_apple_auth.py` | two literals moved — see "Problems found", item 1. **This was NOT a permitted exception and it was unavoidable.** |
| `.github/workflows/ci-tests.yml` | pytest floor 814 -> 855, measured, with the reason recorded in the comment block. |

### The two closed sets, pinned in the router

```python
REASONS      = ("spam", "harassment", "hate", "sexual", "violence", "self_harm", "other")   # 7
TARGET_TYPES = ("note", "comment", "group_post", "user")                                    # 4
```

### Who may be reported (pm-decisions Q-2, overriding spec R-02 for `user` targets)

- `note` / `comment` / `group_post`: the viewer must be able to see it. The note rule is
  `likes_comments._assert_can_view_note`, **reused**; the group-post rule is the one
  `get_group_posts` applies (`groups_router.py:827`).
- `user`: **the row exists.** `is_private_profile` is irrelevant, bots included. The response is
  identical whether or not the reporter could see that person — S-05a asserts
  `r_private.content == r_public.content`, not two separate expectations.

### The cap (pm-decisions Q-2, superseding spec R-09)

20 reports per reporter per rolling 24 hours, 429, counted with one `COUNT(*)` **before the target
is looked up**, so a flood writes nothing and costs one statement — Sprint 4F's bot cap
(`notes_router.py:159-176`) is the shape. Two consequences worth stating:

- A capped reporter gets 429 even for a target that does not exist. That leaks nothing (they
  already know they are capped) and it is what keeps the cap ahead of every write.
- A capped reporter also gets 429 when re-tapping Report on something they already reported,
  where they would otherwise get 200. Accepted: the alternative is doing the lookup work first.

---

## 2. The PM SQL — step 10, and its verification

Step 10 is the **next unused number**: `context/PM_SQL_QUEUE.md` has steps 1-9, step 9 is Sprint
4H's and is still outstanding. Checked, not assumed.

```sql
CREATE TABLE IF NOT EXISTS report (
    id              SERIAL PRIMARY KEY,
    reporter_id     INTEGER      NOT NULL,
    target_type     VARCHAR(16)  NOT NULL,   -- note | comment | group_post | user
    target_id       INTEGER      NOT NULL,
    target_user_id  INTEGER,                 -- the author, denormalised at creation
    reason          VARCHAR(32)  NOT NULL,
    detail          VARCHAR(1000),
    target_snapshot VARCHAR(2000),
    status          VARCHAR(16)  NOT NULL DEFAULT 'open',
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at     TIMESTAMP,
    resolved_by     INTEGER,
    resolution      VARCHAR(500)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_report_once ON report (reporter_id, target_type, target_id);
CREATE INDEX IF NOT EXISTS ix_report_open ON report (status, created_at DESC);
```

**Verification to send back** (the output of all three):

```sql
-- 13 rows: the columns above, with their types and lengths
SELECT column_name, data_type, character_maximum_length, is_nullable
  FROM information_schema.columns
 WHERE table_schema = current_schema() AND table_name = 'report'
 ORDER BY ordinal_position;
-- 3 rows: report_pkey, uq_report_once, ix_report_open
SELECT indexname FROM pg_indexes WHERE tablename = 'report' ORDER BY indexname;
-- must return 0: nothing has been written yet
SELECT count(*) FROM report;
```

### Deploy order, in my own words

`app/schema_guard.py` raises at startup (`:39-41`, called from `app/main.py:166`) when a required
column has no `information_schema` row, and a missing **table** produces no row either — so
`("report","reason")` guards the whole table. That makes the order one-way:

1. **PM runs step 10** on Supabase and sends the three verification outputs back.
2. **Only then deploy this commit.** It carries the `Report` model *and* the guard entry in the
   same commit, which is the rule 4H's comment states: a model column without its guard entry is
   the April 2026 outage (the service boots, then 500s on every query of that table).
3. If someone deploys this before the SQL, `assert_migrated` raises, **Render fails the deploy and
   the previous version keeps serving.** That is the guard working — a failed deploy, not an
   outage. It is still a failed deploy somebody has to explain, which is why the order is written
   here and in the guard's own comment.
4. Nothing in this deploy is reader-visible: no client calls `/reports` yet (P4/P5 are not in this
   package), so steps 1-3 can be measured on production before any reader can reach them.
5. 4I-B's `("block","blocked_id")` entry must **not** travel in this commit. It waits for PM step
   11, which is a different deploy.

---

## 3. Mutation-proof table

House rule: every case was run **green**, the mutation applied, the named node run again and
required to be **RED**, the actual first failure line recorded, the mutation reverted, and the node
re-run **green**. **32 mutations, 36 rows** (some bite more than one case), every one measured that
way by an apply -> run -> revert -> re-run harness kept in the session scratchpad and deliberately
not committed. Every row's `green_before` and `green_after` were `True`; the three rows marked
"stays GREEN" are reported below rather than replaced.

| MUT | Mutation (one line of product/artifact) | Node that must go red | Measured first RED line |
|---|---|---|---|
| MUT-4I-01 | drop `target_snapshot` from the `Report` model | S-20 `TestReportTable::test_column_shape` | `AssertionError: P1-A has not added the column` — the module-scope import guard, so the whole file errors at **collection** (rule 5 working: one loud error, not 40 silent passes) |
| MUT-4I-02 | drop the `uq_report_once` `UniqueConstraint` | S-20a `test_uniqueness_is_the_database_not_the_handler` | `assert False` (the named-constraint assertion) |
| MUT-4I-02 | " | S-03 `test_a_concurrent_duplicate_leaves_one_row` | `AssertionError: {"status":"received"}` / `assert 201 == 200` |
| MUT-4I-02 | " | **S-02 stays GREEN — see "Mutations that did not bite", item 1** | — |
| MUT-4I-03 | `target_id = Field(foreign_key="note.id")` | S-20b `test_no_foreign_keys` | `AssertionError: assert {ForeignKey('note.id')} == set()` |
| MUT-4I-03 | " | S-15 `test_a_report_outlives_its_target` | red in the same run (`2 failed`) |
| MUT-4I-04 | drop `("report","reason")` from `REQUIRED_COLUMNS` | S-21 `test_schema_guard_entry` | `assert ('report', 'reason') in (('user','timezone'), …)` |
| MUT-4I-04 | " | S-22 `test_guard_raises_naming_report_reason` | red in the same run (`2 failed`) |
| MUT-4I-05 | drop `IF NOT EXISTS` from `uq_report_once` in PM step 10 | S-23 `TestReportSQL::test_step_10_…` | `assert 'CREATE UNIQUE INDEX IF NOT EXISTS uq_report_once ON report (…)' in '## 10. Sprint 4I-A …'` |
| MUT-4I-05b | physically move step 10 **above** step 9 | S-23 | `assert 12602 < 9535` (the heading-order assertion). **The mutation tests.md names did not bite the first version of this case — see item 2** |
| MUT-4I-06 | `target_snapshot=None` on the insert | S-01 + S-15 | `AssertionError: assert None is not None` |
| MUT-4I-07 | `target_user_id=None` on the insert | S-01 | `AssertionError: assert None == 5` |
| MUT-4I-08 | answer a repeat with 409 | S-02 | `AssertionError: {"detail":"Already reported"}` (`assert 409 == 200`) |
| MUT-4I-09 | `except IntegrityError` -> a type that never fires | S-03 | `AssertionError: {"detail":"Internal Server Error"}` (`assert 500 == 200`) |
| MUT-4I-10 | `_can_view_note` returns True on refusal | S-04, S-05, S-07 | `AssertionError: {"status":"received"}` (`assert 201 == 404`), `3 failed` |
| MUT-4I-11 | apply the private-profile branch to a `user` target | S-05a `test_reporting_a_person` | `AssertionError: {"detail":"Not found"}` (`assert 404 == 201`) |
| MUT-4I-12 | drop the four self-report refusals | S-06 | `AssertionError: assert 201 == 400` |
| MUT-4I-13 | give the missing-target branch its own message | S-07 | `AssertionError: ('{"detail":"Note not found"}', '{"detail":"Not found"}')` |
| MUT-4I-14 | remove `Depends(deny_bot_actor)` | S-08, S-08a, **and 4F's inventory** | `AssertionError: {"status":"received"}` (`assert 201 == 403`), `3 failed` |
| MUT-4I-15 | move the bot check into the handler body | S-08a | `AssertionError: [('DELETE','/notes/{note_id}/like'), ('POST','/follow/{followed_id}'), …]` — `("POST","/reports")` absent from the route-dependency set |
| MUT-4I-16 | stop validating `reason` | S-17 (7 parameters) | `AssertionError: {"status":"received"}` (`assert 201 == 422`), `7 failed` |
| MUT-4I-17 | stop validating `target_type` | S-18 (4 parameters) | `AssertionError: {"status":"received"}`, `4 failed` |
| MUT-4I-18a | auto-hide reported notes in `crud.get_notes_feed` | S-09, S-09a | `AssertionError: MUT-4I-18a: three reports removed nothing`, `2 failed` |
| MUT-4I-19 | drop `get_admin_user` from `GET /admin/reports` | S-10 | `AssertionError: assert 200 == 403` |
| MUT-4I-20 | serialise the author with a per-row `SELECT` | S-10a | `AssertionError: (5, 25)` — 5 statements at 1 report, 25 at 21 |
| MUT-4I-21 | delete the row on resolve | S-11 | `assert None is not None` |
| MUT-4I-22 | accept any `status` string on PATCH | S-11a | `AssertionError: {"id":1,"status":"vanished"}` |
| MUT-4I-23 | put the snapshot in the notification | S-12 | `AssertionError: S12-NOTE-SENTINEL` |
| MUT-4I-24 | call `fire_event` inline instead of `add_task` | S-12 | `AssertionError: assert 1 < 0` (response.start after the event) |
| MUT-4I-24 | " | **S-13 stays GREEN — see item 3** | — |
| MUT-4I-24b | remove the `try/except` in `_notify_admins` | S-13 | `RuntimeError: stale token` (the 201 becomes a raised push failure) |
| MUT-4I-25 | add the reported reader to `recipient_ids` | S-14 | `AssertionError: assert 1 == 0` (a `NotificationLog` row for the reported reader) |
| MUT-4I-26 | serve `detail`/`target_snapshot` from a reader-facing GET | S-16 | `AssertionError: /reports/mine` |
| MUT-4I-27 | `print(f"report: {payload} by {name} <{email}>")` in the route | S-19 | `AssertionError: S19-DETAIL-SENTINEL` |
| MUT-4I-28 | cascade deletes only the filed-by reports | S-24 | `AssertionError: about A` (`assert 1 == 0`) |
| MUT-4I-29 | stop enforcing the 20/24h cap | S-25 | `AssertionError: {"status":"received"}` (`assert 201 == 429`) |
| MUT-4I-30 | shrink `GUARDED_ROUTES` back to four | `test_bots.py::…::test_dependency_inventory_is_exactly_five_routes` | `assert {('DELETE',…), ('POST','/reports')} == {('DELETE',…)}` |

### Mutations that did not bite, reported rather than replaced

1. **MUT-4I-02 against S-02.** tests.md says dropping the unique constraint turns S-02
   (`test_a_second_report_of_the_same_target_is_200_and_one_row`) red with `assert 2 == 1`.
   **It does not.** The handler's sequential duplicate check (`_existing_report`) still finds the
   first row and still answers 200, so no second row is written and S-02 is green with the index
   gone. The constraint only shows its value on the path where the pre-check saw nothing, which is
   S-03 — and there the same mutation **does** bite (`assert 201 == 200`), as does S-20a. The
   coverage is real; the case tests.md attributed it to is the wrong one.
2. **MUT-4I-05b as tests.md words it.** "Insert step 10 before step 9 -> `assert '## 9. Sprint 4H'
   not in section` fails" did **not** bite the first version of S-23: `_report_sql_section()`
   terminates on the *next* `## ` heading whatever its number, so swapping sections 9 and 10 left
   every bound assertion green (measured). I added a direct ordering assertion
   (`whole.index("## 9. Sprint 4H") < whole.index("## 10. Sprint 4I-A")`) and then the mutation
   bites. The property is worth having: the PM works down that file in order.
3. **MUT-4I-24 against S-13.** "Make the notification synchronous" does not turn S-13 red, because
   `_notify_admins` wraps `fire_event` in a `try/except` — which is the requirement itself ("a
   report must not be slower, or fail, because the admin's push token is stale"), so a synchronous
   call still answers 201. The ordering half of the same mutation does bite S-12. The mutation that
   bites S-13 is removing the `try/except` (MUT-4I-24b), measured above. Both are in the table.
4. **A hole the sweep found in my own test.** S-12's "it ran after the response" assertion was
   originally written as `events.append("fire_event")` *in the test, after the request*, which
   made it unfalsifiable — MUT-4I-24 stayed green against it. The spy now appends to the same
   `events` list the ASGI `send` callback writes to, and the mutation bites. Non-vacuity rule 14,
   caught by doing the mutation run rather than by reading the test.

---

## 4. pytest counts

| Run | Result |
|---|---|
| Before, `pytest tests -q` on this worktree | **814 passed** in 559s |
| After | **855 passed** (814 + 41) |

The 41: 40 in `tests/test_reports.py` (5 table/guard + 34 the QA plan's P2 collected count + 1 for
the cap) and 1 in `tests/test_sql_artifacts.py` (S-23). The QA plan predicted 854 because the cap
(S-25) post-dates it.

`.github/workflows/ci-tests.yml`'s `EXPECTED_MIN_TESTS` is raised 814 -> 855 in this commit, from
the measured number, not from this document.

---

## 5. Problems found — in the brief, the spec and the plan

1. **The amendment to done-checklist item 7 is one file short.** It names
   `tests/test_bots.py::GUARDED_ROUTES` as the single permitted edit to an existing test. Adding
   `("report","reason")` to `schema_guard.REQUIRED_COLUMNS` **also** turns
   `tests/test_apple_auth.py::TestAppleColumn::test_schema_guard_entry` red: it asserts
   `len(pairs) == 6` as a deliberate literal (so a sprint cannot *replace* a pair and have it read
   as an append). Sprint 4H already moved that literal 5 -> 6 and said so in a comment, so the
   precedent is that every migration sprint bumps it. Moved 6 -> 7 with the reason in the comment.
   **And a second one:** that file's `test_apple_sub_is_never_serialised` asserts
   `EXPECTED_GETS == 50` over a discovered GET-route sweep, and `GET /admin/reports` moves it to
   51. Both are pure inventory bumps of exactly the kind K-4I-02 describes; neither was in the
   permitted-exception list. Two edits, both numeric, both commented.
2. **`_assert_can_view_note` answers a private profile with 403, not 404.** spec R-02 says to reuse
   it and tests.md S-05 requires **404**; S-07 requires the invisible-target body to be
   byte-identical to the missing-target body. Reusing the function verbatim would return
   `403 {"detail":"This profile is private"}` and fail both. The rule is reused for its *decision*
   and the route maps every visibility refusal onto one 404 (`_can_view_note`). Worth noticing
   that the existing like/comment routes therefore still leak which of the two refusals applied —
   pre-existing, not touched here.
3. **The brief's file-ownership list omits two files tests.md assigns to P2.**
   `app/routers/auth_router.py` (the report half of the cascade, which S-24 tests) and
   `app/notifications/config.py` (the event, which S-12 tests) are both named in tests.md
   section 3's ownership line but not in the brief's "Files you own". Both were edited — without
   the cascade, R-08 is unmet and account deletion leaves report rows pointing at a dead user id
   with a snapshot of a deleted reader's words in them.
4. **The architecture's "move `_assert_can_view_note` to a shared module" was not done**, because
   `app/routers/likes_comments.py` is not a file this package owns and moving it would touch three
   existing call sites. `reports_router` imports it from `likes_comments` instead. A router
   importing a router is not a cycle here (nothing imports `reports_router` but `main`), and the
   rule still exists exactly once. If 4I-B wants the shared module, it is a one-file move then.
5. **tests.md's S-16 "today 52 GET pairs" is not the number.** Measured on this branch with the
   plan's own exclusions: **51** GET routes (including the new `GET /admin/reports`), so 50
   before. The literal in the test is the measured 51.
6. **S-12's "recipient_ids == the admin ids" cannot be a literal.** Other suites create admin
   readers, so `[admin.id]` passes alone and fails in a whole-suite run. The case discovers the
   admin set from the rows and asserts equality against it, plus `admin.id in` it as the control.
7. **Two of my cases were order-sensitive in the whole suite and are now not.** `/notes/feed`
   serves 50 notes and `tests/test_notes.py::_seed_public_notes` dates its notes a year ahead, so
   S-09's bot note fell off the page in a full run — an absence for the wrong reason, which is a
   false pass waiting to happen. Its note is now dated further ahead, and the fix is commented in
   place.
8. **Pre-existing, not mine, recorded because I hit it:** six tests in `tests/test_bots.py` and
   `tests/test_notes.py` fail when `tests/test_notes.py` is run *before* `tests/test_bots.py`
   (`"/notes/feed?limit=200: the note did not surface"` and `"CONTROL: both accounts are listed"`).
   Verified on this branch with `pytest tests/test_apple_auth.py tests/test_notes.py
   tests/test_bots.py` **without any 4I file loaded**. The default alphabetical order hides it.
   Not fixed here; it is a file-order dependency in 4F's own cases.
9. **`GET /notes/{id}` does not exist** (405), which tests.md's S-15 wording ("the target has
   gone") reads as if it does. The case asserts the row is gone through the session instead.

---

## 6. How a moderator actually sees a report

This is the half of Guideline 1.2 item 2 that is easiest to skip, so, concretely, today:

1. A reader files one. `POST /reports` writes the row and registers a `BackgroundTask`.
2. **The admin is told, on their device.** `fire_event("content_reported", recipient_ids=[admin
   ids])` goes down the same Expo and Web Push path every other event uses — no new delivery code.
   The push says `New content report` / `A reader reported content. Reason: harassment`. It
   carries **no reported text, no `detail`, no reader's name**: a lock screen is a public surface.
   It also lands in the admin's in-app `NotificationLog`, so `GET /notifications/history` shows it
   even if the push was missed.
3. **The admin opens the queue.** `GET /admin/reports` (403 for anyone else) returns the open
   reports newest-first with, per row: the reported words (`target_snapshot`), the author's name
   and whether they are a bot, the reporter's name, the reason, the `detail`, and
   `reports_on_target` — every report on that same target, so one complaint can be told from a
   pattern. One request, no follow-ups.
4. **The admin acts** with the routes that already existed:
   `DELETE /admin/content/note/{id}` (`admin_router.py:538`) or
   `DELETE /admin/content/comment/{id}` (`:557`), unmodified.
5. **The admin closes it.** `PATCH /admin/reports/{id} {"status":"actioned","resolution":"…"}`
   stamps `resolved_at` and `resolved_by` and **keeps the row**. It leaves the open queue and is
   still readable at `?status=all`. The report outlives the content it was about, which is the only
   way a repeat offender is visible.

**The gap, stated rather than hidden:** there is no admin UI for this yet. `AdminPage.jsx` gains a
Reports tab in P4, which ships with the clients. Until then the PM reads the queue through the API
with their admin token. The notification arrives either way, so a report is not sitting unseen —
but "a human looks at it" currently means a human making an authenticated GET, and the 2-working-day
commitment in pm-decisions E-3 depends on that being acceptable until P4 lands. **The one admin is
also the one reviewer of reports about themselves (E-6), accepted and unfixable in code.**

---

## 7. What this package does NOT do

- No `also_block` (4I-B; it cannot exist before blocking does).
- No auto-hide, no threshold, no quarantine state. A report changes nothing any serving path reads
  — S-09a proves it by comparing captured response bodies, not by asserting an absence.
- The reported reader is told nothing at all (S-14).
- No client affordance. Nothing calls `/reports` yet, which is what makes this deploy invisible.
- No query-budget row for either new route (E-7). "Unbudgeted" is not "unmeasured": S-10a pins the
  queue's statement count with `stmt_counter` — **4 statements at 1 report and at 21**, ceiling 5.
