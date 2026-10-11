---
screen: sprint-4i-report-block
feature: safety
package: 4I-B — the block API (P1-B + P3 + P6)
builder: Builder (4i-block worktree, branch `builder-4i-block`)
built: 2026-10-11
pytest: 855 collected / 854 passed + 1 pre-existing failure before -> 952 passed after (97 new)
---

# Sprint 4I-B build notes — the block API

What shipped: a `block` table, `app/blocks.py`, `POST`/`DELETE /blocks/{user_id}`, `GET /blocks`,
the filter on **fourteen** GET paths, **seven** non-GET refusals, notification suppression,
`also_block` on `POST /reports`, the block half of the account-deletion cascade, the schema-guard
entry, PM SQL step 11, the re-measured query budgets and the route-coverage guard.

No clients. `POST /blocks/{user_id}` is live and nothing calls it, which is what makes this
deploy invisible to all 131 readers — the filters are no-ops while `block` is empty.

**The thing that had to not go wrong:** a block that leaks on one of fourteen paths is worse
than no block, because the reader believes they are protected and cannot detect that they are
not. The route-coverage guard (P6) was built early, not last, and it is what found two of the
leaks and two of the plan's own errors. Details in section 6.

---

## 1. What was built, file by file

| File | Change |
|---|---|
| `app/models.py` | `+ class Block` after `Report`. `uq_block_pair` as a named `UniqueConstraint` **and `ix_block_blocked` as an explicit `Index`** — `Field(index=True)` would have named it `ix_block_blocked_id` while PM step 11 creates `ix_block_blocked`, and a model index whose name differs from the migration's is a dev/prod divergence nothing would catch. No foreign keys (see §4). `+ Index` to the `sqlalchemy` import. |
| `app/schema_guard.py` | `+ ("block", "blocked_id")`, 7 entries -> 8, with the deploy-order comment and an explicit note that this must **not** travel in the same commit as step 10's entry. |
| `app/blocks.py` (new, 171 lines) | `hidden_user_ids` (one statement, two `or_` arms), `is_blocked_pair` (one statement, same two arms), `sever_relationships` (the teardown; **does not commit**, because the caller owns the transaction). The one module-level seam, so the arms exist once. |
| `app/routers/blocks_router.py` (new, 146 lines) | `POST /blocks/{user_id}` (block + teardown, one commit), `DELETE /blocks/{user_id}`, `GET /blocks`. `deny_bot_actor` on the POST only. |
| `app/main.py` | one import, one `include_router`. |
| `app/crud.py` | `get_notes_feed(..., hidden=frozenset())`, applied as `.notin_(hidden)`. Default empty, so the one other caller shape is byte-identical. |
| `app/routers/notes_router.py` | the feed's helper call (**before** the early return — forced, see §3), the friends-feed filter (after it), and `/notes/user/{id}`'s block check **plus a missing-subject 404 that route never had** (§6 item 1). |
| `app/routers/likes_comments.py` | `_assert_can_view_note` gains a blocked-pair branch **first**, and an optional `hidden=` so `get_comments` passes its already-computed set and BQ-13 moves +1 rather than +2. The comment filter is on the **comment**, not on `users_map` (K-4I-06). `unlike_note` deliberately **not** guarded (pm-decisions). |
| `app/routers/follow_router.py` | the 403, above the self-follow check, above the row, above `add_task`. |
| `app/routers/profile_router.py` | the block check before `is_self` and before the private gate. |
| `app/routers/users_router.py` | `/users/search`'s `notin_` inside the existing `and_`; `/users/following`'s `notin_`; `/users/{id}/stats`'s 404. |
| `app/routers/userbooks_router.py` | `/userbooks/user/{id}`'s 404; the friends-currently-reading `notin_`. |
| `app/routers/books_router.py` | `following_ids` filtered in Python after the helper (no early return exists on that endpoint, which is why BQ-14n moves too). |
| `app/routers/reading_activity_router.py` | `/reading-activity/user/{id}/daily`'s 404. |
| `app/routers/groups_router.py` | the posts and activity `notin_`; the invite 403; `+ _blocked_curator` and the **pending-join refusal on both join routes** (pm-decisions Q-1). |
| `app/notifications/dispatcher.py` | the set fetched **once** above the per-recipient loop, the **skip decided inside it**, and `skipped_blocked` in the summary. |
| `app/routers/auth_router.py` | `+` the `Block` delete, both directions, above the `user` delete, inside the one transaction. |
| `app/routers/reports_router.py` | `+ also_block` (one transaction with the report), `+ _write_block`, `+` the blocked-pair 404 for a `user` target. **Not in the brief's file list** — see §6 item 7. |
| `context/PM_SQL_QUEUE.md` | `+ ## 11. Sprint 4I-B`, appended after step 10, plus one row in the answers table. |
| `tests/test_blocks.py` (new) | 84 collected. |
| `tests/test_route_coverage.py` (new) | 13 collected. |
| `tests/blocks_classification.py` (new) | all 115 `(method, path)` pairs with a verdict and a reason each. Data, so the test file holds assertions. |
| `tests/block_seed.py` (new) | the `3 * scale` blocked filler readers the large seed needs (K-4I-08). |
| `tests/test_query_budget.py` | the 24 numbers, each with an inline marker, + two seed-wiring lines. |
| `tests/test_bots.py` | `GUARDED_ROUTES` 5 -> 6, the inventory test renamed, **and `BUDGET_EXEMPT` added to one `_diff_violations` call** — see §6 item 3. |
| `tests/test_apple_auth.py` | `len(pairs)` 7 -> 8, `EXPECTED_GETS` 51 -> 52, **and a `permitted_removals` set this sprint had to introduce** — see §6 item 2. |
| `tests/test_notes.py` | three `TestNoteQueryCount` ceilings, +1 each — a second query-budget guard no document mentions. §6 item 4. |
| `tests/test_reports.py` | three literals: the guard count 7 -> 8, the `deny_bot_actor` inventory 5 -> 6, the GET sweep 51 -> 52. §6 item 5. |
| `.github/workflows/ci-tests.yml` | pytest floor 855 -> 952, measured. |

### The helper, and why it is shaped that way

```python
rows = db.exec(select(Block.blocker_id, Block.blocked_id)
               .where(or_(Block.blocker_id == vid, Block.blocked_id == vid))).all()
return {(blocked if blocker == vid else blocker) for blocker, blocked in rows}
```

One statement, both directions, two plain columns. A SQL `UNION` of two selects is also one
statement and returns the right rows — as `Row` tuples, which `notin_()` rejects
(`ProgrammingError: type 'Row' is not supported`); `.scalars()` fixes the types and costs a
second statement. **B-35 reproduces that failure inside the test**, so the trap is in CI rather
than in production.

`notin_(set())` is safe and silent and is deliberately **not** special-cased: the day-one state
of all 131 readers must exercise the same line everybody else does. B-35b asserts it with a
positive `SAWarning` control, so "no warning" is not "warnings are off".

**Every call site reaches the helper through the module attribute** (`blocks.hidden_user_ids`),
never a bound name. That is what lets one `monkeypatch.setattr("app.blocks.hidden_user_ids", …)`
instrument all fourteen paths, which B-11 and B-37 both depend on. B-35a is the AST walk that
enforces it over all of `app/` with a file-count floor and a synthetic negative.

---

## 2. The PM SQL — step 11, and its verification

Step 11 is the **next unused number**: `context/PM_SQL_QUEUE.md` had steps 1–10, and step 10 is
4I-A's and is **still outstanding on production**. Checked in the file, not assumed.

```sql
CREATE TABLE IF NOT EXISTS block (
    id          SERIAL PRIMARY KEY,
    blocker_id  INTEGER   NOT NULL,
    blocked_id  INTEGER   NOT NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_block_pair ON block (blocker_id, blocked_id);
CREATE INDEX IF NOT EXISTS ix_block_blocked ON block (blocked_id);
```

**Verification to send back** (the output of all three):

```sql
-- 4 rows: id, blocker_id, blocked_id, created_at
SELECT column_name, data_type, character_maximum_length, is_nullable
  FROM information_schema.columns
 WHERE table_schema = current_schema() AND table_name = 'block'
 ORDER BY ordinal_position;
-- 3 rows: block_pkey, ix_block_blocked, uq_block_pair
SELECT indexname FROM pg_indexes WHERE tablename = 'block' ORDER BY indexname;
-- must return 0: nothing has been written yet
SELECT count(*) FROM block;
```

### Deploy order, in my own words

`app/schema_guard.py` raises at startup (`:66`, called from `app/main.py:168`) when a required
column has no `information_schema` row, and a missing **table** produces no row either — so
`("block","blocked_id")` guards the whole table. **These are two deploys, not one:**

1. **PM runs step 10** (4I-A's `report` table) and sends its three verification outputs back.
   *This has not happened yet.*
2. **Deploy 4I-A**, the commit carrying `("report","reason")`. `/version` check.
3. **PM runs step 11** and sends its three verification outputs back.
4. **Only then deploy this commit**, which carries the `Block` model *and* `("block","blocked_id")`
   together — a model column without its guard entry is the April 2026 outage; a guard entry
   without the SQL is a failed deploy and the previous version keeps serving, which is the
   outcome the guard exists to produce.
5. If someone deploys this before step 11, `assert_migrated` raises, Render fails the deploy and
   the previous version keeps serving. That is the guard working — a failed deploy, not an
   outage. It is still a failed deploy somebody has to explain, which is why the order is
   written here and in the guard's own comment.
6. Nothing in this deploy is reader-visible: no client calls `/blocks`, and every filter is a
   no-op while the table is empty. Steps 1–5 can therefore be measured on production before any
   reader can reach them.

Two production invariant queries to run after step 4, because each is maintained by two separate
pieces of code rather than by one:

```sql
-- must be 0: no follow row survives for a blocked pair (the delete AND the 403 both hold)
SELECT count(*) FROM follow f JOIN block b
  ON (f.follower_id = b.blocker_id AND f.followed_id = b.blocked_id)
  OR (f.follower_id = b.blocked_id AND f.followed_id = b.blocker_id);
-- must be 0: no block row points at a deleted reader (the cascade took both directions)
SELECT count(*) FROM block
 WHERE blocker_id NOT IN (SELECT id FROM "user") OR blocked_id NOT IN (SELECT id FROM "user");
```

---

## 3. Which budgets moved, and the two sharp edges

**24 of the 67 rows, each +1, every one measured on this branch by running the guard and reading
its own failure message. 43 unchanged. 24 + 43 = 67.** No budget was widened: `expected` and
`budget` moved together, so `test_the_table_is_whole`'s `budget <= expected + 1` ceiling is
still satisfied with margin zero.

| BQ | Endpoint | kind | now -> after | BQ | Endpoint | kind | now -> after |
|---|---|---|---|---|---|---|---|
| 03 | `/profile/{id}` | ratchet | 7 -> 8 | 22 | `/users/following` | ratchet | 4 -> 5 |
| 03p | `/profile/{id}` private non-follower | ratchet | 6 -> 7 | 23 | `/users/search` | ratchet | 4 -> 5 |
| 03f | `/profile/{id}` private follower | ratchet | 7 -> 8 | **24** | `/users/{id}/stats` | **target** | **3 -> 4** |
| 06 | `/userbooks/user/{id}` | ratchet | 4 -> 5 | 24f | `/users/{id}/stats` private follower | ratchet | 4 -> 5 |
| 06f | `/userbooks/user/{id}` private follower | ratchet | 5 -> 6 | 27 | `/reading-activity/user/{id}/daily` | ratchet | 3 -> 4 |
| 07 | `/userbooks/friends/currently-reading` | ratchet | 6 -> 7 | 27f | same, private follower | ratchet | 4 -> 5 |
| 08 | `/notes/feed` signed in | ratchet | 8 -> 9 | 36 | `/groups/{id}/posts` | ratchet | 6 -> 7 |
| **08e** | `/notes/feed` **empty database** | ratchet | **2 -> 3** | 36p | `/groups/{id}/posts` private member | ratchet | 7 -> 8 |
| 09 | `/notes/friends-feed` | ratchet | 10 -> 11 | 37 | `/groups/{id}/activity` | ratchet | 4 -> 5 |
| 11 | `/notes/user/{id}` | ratchet | 9 -> 10 | 37p | `/groups/{id}/activity` private member | ratchet | 5 -> 6 |
| 11f | `/notes/user/{id}` private author | ratchet | 10 -> 11 | 13 | `/notes/{id}/comments` | ratchet | 5 -> 6 |
| 14 | `/books/recommendations` | ratchet | 12 -> 13 | 14n | `/books/recommendations` follows nobody | ratchet | 4 -> 5 |

**`BQ-08e` 2 -> 3 is exactly the `if m.n > 3` ceiling** in
`test_empty_accounts_keep_their_early_returns` (`tests/test_query_budget.py:958`). There is
**zero headroom left** on that test for any future sprint. It is structural, not an oversight:
`get_feed` calls `crud.get_notes_feed` *first* and returns `[]` only afterwards, so the hidden
set is an argument to the query the early return is downstream of. Nobody may "optimise" it by
hoisting an early return above the helper — that would quietly unfilter the empty case. B-42
pins all eight empty-state rows and asserts `BQ-09e`/`BQ-22e`/`BQ-23e` are still 2 / 2 / 1,
which is what proves the helper sits *after* those three early returns.

**`BQ-24` 3 -> 4 moves a `TARGET` row, and that is a bigger deal than a ratchet moving.** A
ratchet number is "no worse than measured today" and carries no claim; a target is the measured
post-fix count of an optimisation that actually shipped — Sprint 4E's N+1 fix on
`/users/{id}/stats`, the project's only delivered optimisation number. It is now 4 instead of 3
and it **stays a target**: the N+1 fix is untouched, the +1 is one `SELECT … FROM block`, and
`test_only_two_targets_the_rest_are_ratchets` asserts endpoint *names*, not counts, so the
promotion is unaffected. The plan's correction to spec R-29's wording is right and is pinned:
there are **three** TARGET rows over **two** TARGET endpoints (`24`, `29`, `29e`), and this
sprint moves exactly one of them. `TestBudgetSeed::test_bq_24_is_still_a_target_at_its_new_number`
asserts all of that.

### The large seed, and the trap in it

`tests/block_seed.py` inserts `3 * scale` **blocked filler readers** and one
`Block(blocker_id=me, blocked_id=filler)` per filler. **The fillers are:**
`blockfiller_0..N` / `Quiet Neighbour N` — and they are deliberately **not** `pub`, `priv`,
`privx`, `admin`, `empty_viewer`, any `friend_*`, any `searchable_*` or any circle member. Each
authors no note, comment or group post and holds no `follow` row, and neither their name nor
their username matches `Searchable` or `Budget`, the budget table's two search literals.

That is not fussiness. Every `scales` row is measured with `expect=row.status` and **every status
in the table is 200**: if `me` had blocked `d.pub`, then `/profile/{pub}`, `/notes/user/{pub}`,
`/userbooks/user/{pub}`, `/users/{pub}/stats` and `/reading-activity/user/{pub}/daily` would all
answer **404** and twelve rows would fail on status before a single count was compared. And
`len(bigger) >= 5` (`:914`) requires at least five endpoints to return a **longer** body on the
large seed, while a block **shortens** bodies — so a block against anyone the table measures
could break that too. Because the fillers author nothing, no body shortens and that assertion is
untouched; because there are `3 * scale` of them, the hidden set **grows with scale**, which is
the only thing that makes a per-row block lookup visible to
`test_no_endpoint_scales_with_row_count`.

**The EMPTY database gets no block rows on purpose.** That is what makes `BQ-08e` prove the
helper runs and costs one statement against an *empty* set.

`B-43a` asserts every one of those invariants against the seed builder directly, because a seed
that silently stopped inserting blocks would make `B-43` vacuous rather than red.

---

## 4. The design decisions worth defending

**One row, read both ways.** The row records who blocked whom; the symmetry is in the read. Two
rows per block would double every write and make "only the blocker can lift it" a convention
rather than a fact about the data. B-50a's controls assert the reverse pair commits, so a
future "fix" that stored two rows fails a test instead of passing silently.

**No foreign keys on `block`** — the one place it differs from `Follow`, which does carry them.
The cascade deletes both directions itself (B-33) and a FK would turn a missed cascade step into
a 500 instead of the orphan row the production check looks for. Recorded because the
architecture says "the same shape as `follow`, down to the unique pair index" and this is where
that stops being true.

**404 and not 403, with the body of a deleted account.** All five single-subject paths answer a
blocked pair with `404 {"detail":"User not found"}` — byte-identical to the response for a user
id that has never existed (B-13a asserts `r.content` equality on all five). A 403, or a 404 with
its own message, tells the blocked reader exactly what happened, and R-20's asymmetric-control
clause is then false.

**The block check is before the private-profile gate, on every one of the five.** A block must
not be able to make a private profile *open*, and it cannot, because the pair is 404'd before
the gate is reached. B-16 asserts all three halves: the blocked reader gets 404, an unblocked
non-follower still gets `200` with `locked: true`, and the blocked response is not that 200.

**The comment filter is on the comment, not on `users_map`.** Filtering the map drops the blocked
reader's **name** and leaves their **words** in the response with `"user": null`, through the
pre-existing null-author branch — the single most likely way this path ships broken. The filter
is in the comments query itself, B-14 asserts the **text** is gone, and B-14a asserts no element
is ever served with a null author, for four different viewers.

**The dispatcher fetches the set once and decides per recipient.** One statement, never one per
recipient; and the `continue` is inside the loop beside the self-skip, because a mixed recipient
list containing one blocked reader and one unrelated reader must deliver to the second. B-29's
recipient list is mixed on purpose — a decision taken above the loop either skips both or
neither, and only a mixed list can tell the two apart.

**Pending circle rows are deleted and refused, not filtered** (pm-decisions Q-1). That is what
makes `GET /groups/{id}/pending` and `GET /groups/invites/pending` safe to leave unfiltered: the
row cannot exist. `_blocked_curator` refuses a **pending** join request to a circle any of whose
active curators is in a blocked pair with the applicant — any curator, not just the one who
happens to read the queue, because every curator reads the same endpoint. **The residual,
stated: while a reader they blocked is a curator, that private circle is closed to them.** A
public circle joins instantly and is **not** refused, because E-2 says a block does not control
circle membership and there is no pending row to leak.

**`also_block` is one transaction** (pm-decisions Q-3): `POST /reports` takes the flag, writes
the report, the block row and the teardown, and commits once. The wire default is **False** even
though the clients tick the box by default — an old client that does not know the field must not
start blocking people, and C-13 is where "checked by default" lives.

---

## 5. The route-coverage guard, and what it is for

`tests/blocks_classification.py` gives **all 115** `(method, path)` pairs a verdict and a reason:
**14 FILTERED, 7 REFUSED, 94 NOT_SERVING**. Measured, not predicted — 112 after 4I-A, 115 after
this package's three routes.

`test_every_route_is_classified` asserts, in this order: the pair count against a literal
**before anything else**; `set(CLASSIFICATION) == pairs` reporting both differences by name; the
three bucket sizes; that every `NOT_SERVING` reason is at least 20 characters of real sentence;
that the **FILTERED path set equals the path set of `test_blocks.py::FILTERED_PATHS`**; and that
every REFUSED pair is a non-GET. The classifier is a pure function and is called with a
synthetic extra pair, which must report **exactly one** unclassified route.

That fifth assertion is the coupling that makes the whole thing work: a route cannot be called
filtered without a both-directions case parametrised over it, and a case cannot exist for a route
nobody classified. Adding an endpoint that serves another reader's content and forgetting R-22 is
now a red build, not a silent leak. **It is the only control in this design that still works in
six months.**

`test_the_deliberately_unfiltered_paths_are_what_they_claim` parametrises **11** pinned paths in
two kinds — 7 where the blocked reader's name is still in the body **on purpose** (a positive
control, so a future change that starts filtering one of them has to be a decision) and 4 where
the **row cannot exist**. `test_no_other_reader_facing_get_leaks_a_blocked_reader` sweeps the
remaining **16** reader-reachable `NOT_SERVING` GETs for the sentinel, with the swept count
asserted against a literal first.

**The sweep found a real leak in my own work**: `GET /blocks` carries the blocked reader's name.
That one is correct — R-28 needs the blocker to see who they blocked in order to unblock them —
so it became the eleventh pinned path with its reason, rather than an exclusion. A sweep that
only ever confirms what you already believed is not a sweep.

---

## 6. Problems found — in the brief, the spec, the plan and the tree

1. **`GET /notes/user/{id}` had no missing-subject 404 at all**, so a blocked pair's 404 would
   have been *distinguishable* from a deleted account on that path: the route answered a user id
   that never existed with `200 []`. B-13a parametrises five paths and asserts byte-identical
   bodies, which is unsatisfiable without the 404. **Added** (`if not target_user: raise 404`) —
   a deliberate contract change to an existing endpoint, costing no statement because the
   `db.get` already happened, and no existing test asserted the `200 []`. The alternative was
   shipping a block that one of fourteen paths announces.
2. **The 4G guard `test_no_existing_test_file_was_edited` is red on the committed 4I-A merge**,
   and 4I-A did not notice because the rule reads **committed** state and 4I-A measured its 855
   before committing. `GUARDED_ROUTES` is an exact inventory, so appending a route *must* remove
   the `== 5` literal and the count in the test's own name — the rule forbade that for ever, for
   every future migration sprint. Fixed with a named, reasoned `permitted_removals` set bounded
   by its own literal count; removals anywhere else under `tests/` are still offenders, which is
   what MUT-4G-37 exercises. **My measured "before" is therefore 854 passed + 1 failed, not 855.**
3. **Two of Sprint 4F's own diff rules were mutually unsatisfiable for this sprint.**
   `test_budget_exemption_lines_name_the_row_they_change` requires every added line in
   `tests/test_query_budget.py` to carry a marker once anything is removed, and the only generic
   marker is `#`; `test_only_the_new_key_was_added_to_tests` requires a replacing line to add no
   new identifier tokens — and a `#` comment adds several. 4F never hit it because its own bump
   moved `BQ-39` by digits alone and digits are not tokens. Fixed by adding the already-existing
   `BUDGET_EXEMPT` to that one `_diff_violations` call, which is where 4F's design already
   intended it: the budget file stays bounded by its own marker rule.
4. **`tests/test_notes.py::TestNoteQueryCount` is a second query-budget guard no document
   mentions.** It holds a per-endpoint statement ceiling for `/notes/feed` (`<= 8`),
   `/notes/friends-feed` (`<= 10`), `/notes/user/{id}` (`<= 9`), `/notes/me` and
   `/notes/userbook/{id}`. The block filter moves three of them. Re-measured +1 each, digits only
   so 4F's token rule is satisfied, with the reason on an added comment line; the file's deletion
   count stays at 10 of K-01's permitted 14. **spec R-29, the architecture's "Which budgets move"
   and tests.md section 9 all describe `tests/test_query_budget.py` as the budget guard. It is
   not the only one.**
5. **Three more forced literals, in `tests/test_reports.py`** — 4I-A's own file: the
   `REQUIRED_COLUMNS` count 7 -> 8, the `deny_bot_actor` inventory 5 -> 6 (4I-A left a comment
   predicting exactly this) and the GET sweep 51 -> 52. Pure inventory bumps; so the permitted-
   exception list in pm-decisions' amendment to done-checklist item 7 is now **five** files short
   of reality, not one. The honest version of that item is "no existing test's *behaviour* is
   changed; the inventory literals of five named files move with the things they count."
6. **`tests/test_blocks.py` and `tests/test_route_coverage.py` broke 13 tests in three other
   files by leaving rows in the shared database**, and every one of them was green file-by-file.
   `tests/conftest.py` keeps one in-memory database for the whole session; `/notes/feed` is a
   global 50-row page ordered newest-first; these cases date their notes far in the future so
   they lead that page. ~120 far-future notes left behind pushed `test_notes.py`'s own +365-day
   notes off it, and ~200 new readers pushed `test_bots.py::test_admin_lists_carry_is_bot`'s two
   accounts past `/admin/users?limit=200`. Both files now delete every row they create, in
   dependency order, in an autouse fixture — the database is left as it was found. **This is the
   single thing a reviewer should check hardest**, because it is invisible to any run of one file
   and because this file sorts first alphabetically, so everything it leaves behind lands on
   somebody else.
7. **The brief's file-ownership list omits `app/routers/reports_router.py`**, which `also_block`
   (pm-decisions Q-3) and the `user`-target blocked-pair 404 (Q-2's full rule) both require. Same
   class of omission 4I-A reported for `auth_router.py` and `notifications/config.py`.
8. **tests.md carries no case for `also_block` at all**, server-side. Its only mention is C-13,
   a client case, which says the checkbox "is wired to the `POST /blocks` call" — the two-request
   shape pm-decisions Q-3 explicitly replaced with one. Four cases were written for it
   (`TestPendingRowsAndAlsoBlock`), including one for a regression this package would otherwise
   have shipped: without an existing-row check in `_write_block`, reporting somebody already
   blocked raises on `uq_block_pair`, the handler's `except IntegrityError` (which exists for the
   duplicate *report*) rolls the report back, and the reader is told "report received" with
   nothing written.
9. **tests.md carries no case for the pending-row deletion either** (pm-decisions Q-1), although
   the whole justification for leaving `/groups/{id}/pending` and `/groups/invites/pending`
   unfiltered rests on it. Written as
   `test_a_block_deletes_pending_invites_and_requests_both_ways`.
10. **B-32a is wrong on four of its ten pinned paths.** It asserts the blocked reader's sentinel
    is **present** on all ten. `/follow/followers` and `/follow/following` return ids and no name
    at all, so a name sentinel can never appear there; and all four of `/follow/*` plus the two
    pending routes have their row **deleted** by the block, which is the very reason they are
    classified not-filtered. The case is split into `PRESENT` (7) and `CANNOT_EXIST` (4), the
    latter asserting the blocked reader is absent **and** an uninvolved third reader is present
    in the same response, so "absent" cannot mean "this endpoint returns nothing".
11. **B-15u is struck** and `DELETE /notes/{note_id}/like` is therefore classified NOT_SERVING,
    so the REFUSED bucket is **7**, not tests.md's 6: minus unlike, plus
    `POST /groups/{group_id}/join` and `POST /groups/join/{invite_code}` from Q-1.
    `test_unlike_is_deliberately_unguarded` pins the decision from both sides — a blocked reader
    may still withdraw a like they left before the block, and the block does not delete it (E-4)
    — so a future reading of spec R-24 cannot quietly re-add the refusal.
12. **B-10 plants the two `follow` rows back after the block, on every parameter.** Four of the
    nine FILTER_LIST paths read `follow`, and R-21 deletes both rows at block time, so without a
    planted row those four parameters would have passed with the filter removed and
    MUT-4I-39/42b/43b/44 would not have bitten. tests.md names this exception for B-12 only. The
    deletion itself is covered by B-01 and B-06.
13. **ST-4I-07 cannot hold and should not.** It requires the `schema_guard` entry and the
    `PM_SQL_QUEUE` edit to be in different commits. 4I-A put both in one commit (`29e7441`) and
    so does this package: the queue file is *documentation of SQL a human runs*, and what has to
    be ordered is the **deploy**, which G-4I-10 covers and no test can assert. Splitting the
    sprint commit to satisfy a grep would make the diff less reviewable, not safer.
14. **ST-4I-05 as written (`grep -n "union" app/blocks.py`) cannot pass a file that explains why
    it avoids a `UNION`.** The useful form is `grep -n "union(" app/blocks.py`, which is what
    B-35 asserts (text **and** AST). The module's prose was reworded so the stricter grep is also
    clean, and ST-4I-04's grep likewise — the forbidden import spelling is now written nowhere
    in `app/`, not even in a comment.
15. **`EXPECTED_SWEPT` is 16, not the ~28 arithmetic suggests**, and
    `/notifications/vapid-public-key` had to join the unsweepable list: it answers **503** without
    `VAPID_PUBLIC_KEY`, which tests do not set. Both measured.
16. **`app/routers/blocks_router.py`'s `except IntegrityError` has to open at the INSERT, not at
    the commit.** The teardown runs SELECTs, SQLAlchemy autoflushes the pending `Block` row to
    serve them, and a second block therefore raises *inside* `sever_relationships` and never
    reaches `db.commit()`. A catch around the commit alone turns tapping Block twice into a 500.
    Measured, and the reason is in the code.
17. **`B-35` read 0 statements and would have passed any mutation that deleted the query.**
    `stmt_counter` listens on `tests.conftest.engine`, while the `db` fixture comes from the other
    copy of conftest that pytest auto-loads as the bare `conftest` plugin — a different `Engine`
    over the same shared-cache database, which conftest's own docstring records. A direct call
    through `db` is invisible to the counter. The helper is now called through a session on the
    engine being listened to. **Non-vacuity rule 14, caught by running the mutation rather than
    by reading the test** — the same class of hole 4I-A found in its own S-12.
18. **Pre-existing, not mine, and confirmed again:** six cases in `tests/test_bots.py` fail when
    `tests/test_notes.py` runs *before* them. Reproduced on this branch with
    `pytest tests/test_notes.py tests/test_apple_auth.py tests/test_bots.py` (6 failed) and green
    in alphabetical order. Not fixed here; it is a file-order dependency in 4F's own cases.
19. **G-4I-11 was run and is deliberately not committed.**
    `python scripts/gen_dependency_map.py` succeeds and the appendix gains **exactly the three
    new routes** — `POST`/`DELETE /blocks/{user_id}` and `GET /blocks` — which is what the gate
    asks for. It is reverted rather than committed, because the file in `HEAD` predates **4I-A**
    as well (`git show HEAD:dependency-map.md | grep -c reports` is 0), so regenerating it here
    would pull another package's three routes into this diff alongside 188 lines of line-number
    reflow. G-4I-11 is an after-merge gate; the merger should run it once for both halves.
20. **Not done, and named so it is not lost:** `features/safety/index.md` still says
    `status: design` and lists Guideline 1.2 items 2 and 3 as **Missing**. Neither 4I-A nor this
    package owns that file (the architecture gives it to P1). It wants one edit after both halves
    deploy. `context/INDEX.md`'s Feature Nodes table and `dependency-map.md` (G-4I-11) are in the
    same position.

---

## 7. pytest counts

| Run | Result |
|---|---|
| Before, `pytest tests -q` on this worktree at `27a8427` | **854 passed, 1 failed** (855 collected) — the failure is §6 item 2, pre-existing on the committed 4I-A merge |
| After | **952 passed**, 0 failed, 0 errors (687 s) — measured twice, the second time after the Q3c case was rewritten |

952 = 855 + 97. The 97: **84** in `tests/test_blocks.py` and **13** in
`tests/test_route_coverage.py`. No existing test id was removed; eight literals in five existing
files moved, each with its reason in a comment beside it.

`tests/blocks_classification.py` and `tests/block_seed.py` carry no tests of their own by design —
they are data and a seed builder, asserted by `test_route_coverage.py` and `B-43a` respectively.

The QA plan predicted 944 (`tests/test_blocks.py` 78 + `test_route_coverage.py` 11). The
difference is the four `also_block`/Q-1/Q-2 cases, the unlike pin, the `/blocks` pinned path and
the split of B-32a — every one of them named in section 6.

`.github/workflows/ci-tests.yml`'s `EXPECTED_MIN_TESTS` is raised 855 -> 952 in this commit, off
the run, not out of this document.

---

## 8. Mutation-proof table

House rule, applied to every row: the named node ids were run **green**, the one-line change
applied, the same node ids run again and required to be **RED** with the first failing line
recorded, the change reverted, and the node ids re-run **green**. Run by an
apply -> run -> revert -> re-run harness kept in the session scratchpad and deliberately not
committed. **58 mutations. Every `green_before` and `green_after` was True.**

`MUT-4I-30` and the leaked-Delete client mutation are the two G-4I-07 checks first; 30 is below,
and the client one belongs to P4/P5.

| MUT-4I | One-line change | File | Measured first RED line | Mutated run | Caught | Restored |
|---|---|---|---|---|---|---|
| MUT-4I-30 | `app/blocks.py` | transpose one `or_` arm in `hidden_user_ids` (`blocked_id` in both) | AssertionError: B-10 [blocker]: ZZb10blockerB LEAKED into /notes/feed?limit=200 | 9 failed, 19 passed in 24.13s | yes | yes |
| MUT-4I-30b | `app/blocks.py` | transpose one `or_` arm in `is_blocked_pair` | AssertionError: B-13: 200 [{"id":1,"user_id":null,"text":"ZZb13blockedA-NOTE","emotion":null,"page_number":null,"chapter":null,"image_url":null,"quote | 5 failed, 23 passed in 24.87s | yes | yes |
| MUT-4I-02b | `app/models.py` | drop the `uq_block_pair` UniqueConstraint | AssertionError: set() | 1 failed in 0.32s | yes | yes |
| MUT-4I-29 | `app/models.py` | drop the `ix_block_blocked` Index | AssertionError: assert [] == ['ix_block_blocked'] | 1 failed in 0.30s | yes | yes |
| MUT-4I-04b | `app/schema_guard.py` | drop `("block","blocked_id")` from REQUIRED_COLUMNS | AssertionError: (('user', 'timezone'), ('reading_activity', 'local_day'), ('user', 'is_bot'), ('bot_post', 'dedup_key'), ('user', 'apple_sub'), ('user | 2 failed in 0.47s | yes | yes |
| MUT-4I-05b | `context/PM_SQL_QUEUE.md` | drop `IF NOT EXISTS` from `CREATE TABLE block` | AssertionError: CREATE TABLE IF NOT EXISTS block | 1 failed in 0.33s | yes | yes |
| MUT-4I-05c | `context/PM_SQL_QUEUE.md` | drop `IF NOT EXISTS` from `CREATE INDEX ix_block_blocked` | AssertionError: CREATE INDEX IF NOT EXISTS ix_block_blocked ON block (blocked_id) | 1 failed in 0.31s | yes | yes |
| MUT-4I-31 | `app/blocks.py` | delete only one direction of the unfollow | AssertionError: assert Follow(follower_id=5, id=2, created_at=datetime.datetime(2026, 10, 11, 11, 9, 5, 310293), followed_id=4) is None | 1 failed in 1.28s | yes | yes |
| MUT-4I-09b | `app/routers/blocks_router.py` | remove the `IntegrityError` catch from `POST /blocks` | AssertionError: {"detail":"Internal Server Error"} | 1 failed in 1.03s | yes | yes |
| MUT-4I-32 | `app/routers/blocks_router.py` | allow a self-block | AssertionError: {"blocked":true} | 1 failed in 0.90s | yes | yes |
| MUT-4I-14b | `app/routers/blocks_router.py` | remove `Depends(deny_bot_actor)` from `POST /blocks` | AssertionError: {"blocked":true} | 2 failed in 1.32s | yes | yes |
| MUT-4I-33 | `app/routers/follow_router.py` | let `POST /follow` through for a blocked pair | AssertionError: {"detail":"followed","is_following":true,"is_mutual":false} | 2 failed in 2.28s | yes | yes |
| MUT-4I-34 | `app/routers/blocks_router.py` | restore both follows on unblock | AssertionError: assert 2 == 0 | 1 failed in 1.01s | yes | yes |
| MUT-4I-35 | `app/routers/blocks_router.py` | include inbound blocks in `GET /blocks` | AssertionError: [{'blocked_at': '2026-10-11T11:10:30.475325Z', 'name': 'B07B', 'profile_picture': None, 'user_id': 5, ...}, {'blocked_at': '2026-10-11 | 1 failed in 1.19s | yes | yes |
| MUT-4I-20b | `app/routers/blocks_router.py` | serialise `GET /blocks` with a per-row `db.get` | AssertionError: 3 statements at 1 block and 27 at 25 — the serialisation is per row | 1 failed in 8.37s | yes | yes |
| MUT-4I-36 | `app/routers/blocks_router.py` | commit the block row, then the teardown (two commits) | AssertionError: an orphan block survived | 1 failed in 1.29s | yes | yes |
| MUT-4I-37 | `tests/test_blocks.py` | drop a path from `FILTERED_PATHS` | AssertionError: ['B-10', 'B-12', 'B-13', 'B-14', 'B-16', 'B-17', ...] | 2 failed in 1.31s | yes | yes |
| MUT-4I-38 | `app/crud.py` | drop the `notin_` from `crud.get_notes_feed` | AssertionError: B-10 [blocker]: ZZb10blockerB LEAKED into /notes/feed?limit=200 | 2 failed in 3.85s | yes | yes |
| MUT-4I-39 | `app/routers/notes_router.py` | drop the friends-feed `notin_` | AssertionError: B-12 [blocker]: ZZb12blockerB LEAKED into /notes/friends-feed?limit=200 | 4 failed in 8.04s | yes | yes |
| MUT-4I-40 | `app/routers/notes_router.py` | drop the `/notes/user/{id}` block check | AssertionError: B-13: 200 [{"id":2,"user_id":null,"text":"ZZb13blockerB-NOTE","emotion":null,"page_number":null,"chapter":null,"image_url":null,"quote | 3 failed, 4 passed in 6.46s | yes | yes |
| MUT-4I-41 | `app/routers/profile_router.py` | drop the `/profile/{id}` block check | AssertionError: B-16: 200 {"id":5,"name":"ZZb16blockerB","username":"ZZb16blockerB","bio":null,"profile_picture":null,"yearly_goal":null,"created_at": | 2 failed in 2.18s | yes | yes |
| MUT-4I-42 | `app/routers/users_router.py` | drop `User.id.notin_` from the `/users/search` `and_` | AssertionError: B-18 [blocker]: ZZb18blockerB LEAKED into /users/search?q=ZZb18blocker | 2 failed in 2.13s | yes | yes |
| MUT-4I-42b | `app/routers/users_router.py` | drop the `/users/following` `notin_` | AssertionError: B-19 [blocker]: ZZb19blockerB LEAKED into /users/following | 2 failed in 2.31s | yes | yes |
| MUT-4I-43 | `app/routers/userbooks_router.py` | drop the `/userbooks/user/{id}` block check | AssertionError: B-20: 200 [{"id":2,"user_id":5,"book_id":2,"status":"reading","current_page":10,"rating":null,"created_at":"2026-10-11T11:14:24.938875 | 2 failed in 2.34s | yes | yes |
| MUT-4I-43b | `app/routers/userbooks_router.py` | drop the friends-currently-reading `notin_` | AssertionError: B-21 [blocker]: ZZb21blockerB LEAKED into /userbooks/friends/currently-reading?limit=200 | 2 failed in 2.38s | yes | yes |
| MUT-4I-44 | `app/routers/books_router.py` | stop filtering `following_ids` in `/books/recommendations` | AssertionError: B-22 [blocker]: ZZb22blockerB LEAKED into /books/recommendations?limit=200 | 2 failed in 2.59s | yes | yes |
| MUT-4I-45 | `app/routers/groups_router.py` | drop the group-posts `notin_` | AssertionError: B-24 [blocker]: ZZb24blockerB LEAKED into /groups/1/posts | 2 failed in 2.37s | yes | yes |
| MUT-4I-45b | `app/routers/groups_router.py` | drop the group-activity `notin_` | AssertionError: B-25 [blocker]: ZZb25blockerB LEAKED into /groups/1/activity | 2 failed in 2.39s | yes | yes |
| MUT-4I-18 | `app/routers/likes_comments.py` | drop the comment filter entirely | AssertionError: [{'created_at': '2026-10-11T11:15:59.104852Z', 'id': 1, 'text': 'ZZb14textblockerA-COMMENT', 'user': {'id': 4, 'is_bot...4textblockerC | 2 failed, 1 passed in 3.56s | yes | yes |
| MUT-4I-18c | `app/routers/likes_comments.py` | **filter `users_map` and keep the serialisation loop** (K-4I-06's shape) | AssertionError: [{'created_at': '2026-10-11T11:16:21.711013Z', 'id': 1, 'text': 'ZZb14textblockerA-COMMENT', 'user': {'id': 4, 'is_bot...4textblockerC | 3 failed in 4.04s | yes | yes |
| MUT-4I-47 | `app/routers/notes_router.py` | call the helper for an anonymous viewer | AssertionError: the helper ran 1 time(s) for a request with no viewer: [None] | 1 failed in 1.95s | yes | yes |
| MUT-4I-48 | `app/routers/users_router.py` | answer a blocked pair with 403 instead of 404 | AssertionError: B-17: 403 {"detail":"This profile is private"} | 2 failed, 4 passed in 9.13s | yes | yes |
| MUT-4I-50 | `app/routers/profile_router.py` | move the `/profile/{id}` block check below the private gate | AssertionError: {"id":4,"name":"ZZb16gateblockerP","username":"4i-b16gateblocker-priv","bio":null,"profile_picture":null,"yearly_goal":null,"created_a | 2 failed in 3.22s | yes | yes |
| MUT-4I-51 | `app/routers/groups_router.py` | filter `/groups/{id}/members` by the viewer's blocks | AssertionError: E-2: a block hides content and leaves structure. Filtering Members desynchronises member_count, which is a worse failure than a name i | 3 failed, 10 passed in 18.84s | yes | yes |
| MUT-4I-52 | `app/routers/groups_router.py` | check the block after the invite row is added | AssertionError: {"ok":true} | 2 failed in 2.02s | yes | yes |
| MUT-4I-53 | `app/routers/admin_router.py` | filter `/admin/content/notes` by the admin's blocks | AssertionError: /admin/content/notes hid a blocked reader from moderation | 1 failed in 1.31s | yes | yes |
| MUT-4I-54b | `app/notifications/dispatcher.py` | decide the suppression ABOVE the per-recipient loop | AssertionError: the uninvolved recipient was skipped too — the check is not in the loop | 2 failed in 2.33s | yes | yes |
| MUT-4I-55 | `app/notifications/dispatcher.py` | write the `NotificationLog` row before the skip | AssertionError: a NotificationLog row was written for a blocked pair | 2 failed in 2.24s | yes | yes |
| MUT-4I-56 | `app/routers/blocks_router.py` | delete the blocker's notification history on block | AssertionError: history is a log: rewriting it makes a delivered notification vanish | 1 failed in 0.93s | yes | yes |
| MUT-4I-57 | `app/routers/blocks_router.py` | refuse a bot as a block target | File "C:\Users\sonal\Documents\projects\book-tracker\.claude\worktrees\4i-block\app\routers\blocks_router.py", line 70 |  | yes | yes |
| MUT-4I-28b | `app/routers/auth_router.py` | delete only the OUTBOUND blocks in the account cascade | assert [Block(id=2, ...blocker_id=6)] == [] | 1 failed in 1.50s | yes | yes |
| MUT-4I-58 | `app/blocks.py` | build the hidden set with a SQL `UNION` fed to `notin_()` | AssertionError: the union() trap is back in app/blocks.py | 1 failed in 0.39s | yes | yes |
| MUT-4I-59 | `app/routers/notes_router.py` | import the helper as a bound function in one router | AssertionError: ['app/routers/notes_router.py'] | 1 failed in 0.52s | yes | yes |
| MUT-4I-60 | `app/routers/notes_router.py` | special-case the empty block set with an early `return []` | AssertionError: a | 1 failed in 1.53s | yes | yes |
| MUT-4I-62 | `app/routers/groups_router.py` | call the helper inside the group-posts serialisation loop | AssertionError: ['B-24 GET /groups/1/posts: helper called 3 time(s) (status 200)'] | 1 failed in 1.40s | yes | yes |
| MUT-4I-63 | `app/routers/notes_router.py` | call the helper above `if not following: return []` | AssertionError: ['B-12 GET /notes/friends-feed?limit=200: helper called 2 time(s) (status 200)'] | 2 failed in 3.87s | yes | yes |
| MUT-4I-64 | `app/routers/blocks_router.py` | add a route without classifying it | AssertionError: the app registers 116 method/path pairs, expected 115. A route was added or removed: classify it in tests/blocks_classification.py and | 1 failed in 0.31s | yes | yes |
| MUT-4I-65 | `tests/test_query_budget.py` | leave BQ-08 at its old number (8) | AssertionError: GET /notes/feed [signed in] ran 9 queries, budget 8 (ratchet), expected 8 (was 8 before Sprint 4E). | 1 failed, 66 passed in 4.03s | yes | yes |
| MUT-4I-66 | `tests/test_query_budget.py` | pad BQ-08's budget to 11 | AssertionError: BQ-08 budget 11 is more than one above expected 9 (R-06: margin of at most one) | 1 failed in 2.59s | yes | yes |
| MUT-4I-67 | `tests/block_seed.py` | block `d.pub` in the budget seed instead of a filler | AssertionError: GET /profile/3 primed with 404, expected 200: {"detail":"User not found"} | 1 failed in 2.52s | yes | yes |
| MUT-4I-68 | `tests/block_seed.py` | insert a fixed 3 blocks regardless of `scale` | AssertionError: 3 | 1 failed in 0.39s | yes | yes |
| MUT-4I-69 | `tests/test_query_budget.py` | demote BQ-24 to RATCHET | AssertionError: targets are ['GET /groups/my/pending']; only the two N+1 loops that shipped (build-notes-4e-n1.md) are targets. Everything else is a r | 2 failed in 2.82s | yes | yes |
| MUT-4I-Q1a | `app/blocks.py` | stop deleting the pending circle rows in the teardown | AssertionError: the pending request survived the block, so `/groups/{id}/pending` is unfiltered AND leaking — the two decisions together are now wrong | 1 failed in 1.24s | yes | yes |
| MUT-4I-Q1b | `app/routers/groups_router.py` | drop the pending-join refusal | AssertionError: assert 201 == 403 | 1 failed in 1.34s | yes | yes |
| MUT-4I-Q3a | `app/routers/reports_router.py` | ignore `also_block` | AssertionError: assert 0 == 1 | 1 failed in 1.34s | yes | yes |
| MUT-4I-Q3b | `app/routers/reports_router.py` | default `also_block` to True on the wire | AssertionError: assert Block(blocker_id=4, id=1, blocked_id=5, created_at=datetime.datetime(2026, 10, 11, 11, 24, 53, 534683)) is None | 1 failed in 1.42s | yes | yes |
| MUT-4I-Q2b | `app/routers/reports_router.py` | drop the blocked-pair 404 for a `user` report target | AssertionError: {"status":"received"} | 1 failed in 1.27s | yes | yes |
| MUT-4I-Q3c | `app/routers/reports_router.py` | drop the existing-row check in `_write_block` | AssertionError: {"detail":"Internal Server Error"} | 1 failed in 1.22s | yes | yes |

### Two findings from the sweep itself

**1. `MUT-4I-30` as tests.md words it does not cover `is_blocked_pair`.** The plan says
transposing one `or_` arm turns "all 14 `blocked`-direction parameters" of B-10 red. Measured:
it turns **9 `blocker`-direction** parameters red — the nine FILTER_LIST paths, in the direction
the transposition breaks — and the five HIDE_404 paths stay green, because they go through
`is_blocked_pair`, which is a **second** function with its own copy of the two arms. The design
has one *module*, not one *query*. `MUT-4I-30b` is the transposition in the other function and
turns the five HIDE_404 paths red. **Both are needed, and the plan named only one**; shipping
against the plan's single mutation would have left half the symmetry claim unproven. Recorded as
a split, which §14 of tests.md says is a finding.

**2. `MUT-4I-Q3c` did not bite the first version of its case** and is reported rather than
replaced. The case blocked B and then reported **C** with `also_block`, so `_write_block` was
never called with a pair that already had a row and the existing-row check was never exercised:
green with the check gone. Reaching it needs care, because `_resolve_target` 404s a blocked
`user` target *and* a blocked note's author — the one path that gets through is a **comment**,
whose visibility is judged by its parent note's author and says nothing about the commenter. So
A can still report B's comment under C's note after blocking B, which is what a client with a
stale screen sends. The case was rewritten to that scenario and the mutation then bites. The
measured symptom is also not the one I predicted: it is a **500**, not a silent rollback-and-200,
because the duplicate raises during the autoflush inside `sever_relationships` rather than at
`db.commit()`. Either way the report is lost and the reader is told something untrue.

### The mutation this package's shape makes impossible to get wrong twice

`MUT-4I-18c` — filter `users_map` and keep the serialisation loop — is the one K-4I-06 calls the
most likely way the comment path ships broken, and it is worth stating what it *does*: the
blocked reader's name disappears and their words stay, served with `"user": null`. B-14 fails on
the text and B-14a fails on the null author, so the half-done filter is red from two directions.

---

## 9. What this package does NOT do

- **No clients.** Nothing calls `/blocks`, which is what makes this deploy invisible. P4 and P5
  ship the affordances, the Settings list, the confirm copy and the "Also block" checkbox.
- **No ejection from circles** (E-2). Each still sees the other in Members and on the
  leaderboard of a shared circle; B-26 asserts that residual so a future "fix" has to be a
  decision.
- **Nothing for a signed-out reader** (E-8). `GET /notes/feed` serves anonymous callers and there
  is no viewer to filter for, so a blocked reader who signs out still sees the public feed.
  B-11 asserts that behaviour *and* that the helper is not even called, so it is a stated limit
  rather than an accident. The client copy has to say it.
- **No second account defence** (F2). A new row is in no block. Out of scope, and named so
  "blocked" is not read as "gone".
- **No deletion of past likes or comments** (E-4), and no unlike refusal (pm-decisions).
- **No budget row for the three new routes** (E-7). Unbudgeted is not unmeasured: `B-07a` pins
  `GET /blocks` at **3 statements at 1 block and at 25**, ceiling 3.
