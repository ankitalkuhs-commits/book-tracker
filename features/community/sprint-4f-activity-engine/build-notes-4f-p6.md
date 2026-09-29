---
screen: sprint-4f-activity-engine
feature: community
package: P6 — the post-ship fix (withdraw R-05a, link the book)
built_by: Builder (branch `fix/bot-post-parity`, base master @ f471a4b — what is deployed)
built: 2026-09-29
requirements: ~~R-05a~~ (withdrawn by PM), R-17 (new)
---

# Build notes — Sprint 4F, Package P6

Sprint 4F shipped on 2026-09-29. The PM read the first live bot post and asked for two
changes. Both are here.

1. **Remove the in-text label.** R-05a is withdrawn.
2. **Make a bot post render like a reader's** — a cover thumbnail and a book title, which
   the first post had neither of.

---

## Change 1 — R-05a is withdrawn

### What was removed

| File | Change |
|---|---|
| `bots/common.py` | `LABEL_TEMPLATE`, `LABEL_PREFIX`, `label_line()` and `append_label()` **deleted**. The module docstring now states the withdrawal and says nothing here may reintroduce a label |
| `bots/bestsellers.py`, `bots/prompts.py`, `bots/quotes.py`, `bots/circles.py` | each `compose()` returns its own body; the `append_label` call is gone from all four |
| `tests/test_bot_content.py` | `TestLabel` (C-01, C-02, C-02a) **deleted**, and the `_label_violations` / `_label_violations_in_package` helpers with it. The module-scope import guard changed from `assert callable(common.label_line)` to `post_note` + `add_to_library` |
| `qa/web_4f_local.mjs` | `LABEL_LINE` and case `L-4F-05` **deleted** |
| `book-tracker-mobile-stitch/__tests__/botBadge.test.mjs` | A-02 **kept**; only its rationale comment changed |

### Tests deleted, and why — said out loud rather than quietly

Three pytest cases and one Playwright case are gone. Every one of them asserted the
withdrawn requirement and **has no weaker form that is still true**:

| Case | What it asserted | Why it could not be amended |
|---|---|---|
| C-01 `test_every_post_ends_with_the_exact_e2_string` | every post ends with `\n— automated post from @<handle>`, character for character | the string no longer exists |
| C-02 `test_line_is_appended_after_generation` | the label survives an empty model response | there is no label to survive |
| C-02a `test_line_is_never_model_generated` | the label is a module-level literal, proved over the package AST | there is no constant to prove anything about |
| L-4F-05 | the line is visible in the rendered card | the line is not in the card |

**Added in their place: C-01b** (`TestNoInTextLabel::test_no_post_carries_an_automated_post_line`).
It asserts the *absence*: no voice's text contains "automated post from" or "automated
account"; none ends on a dash plus handle; `bots.common` has no `append_label` /
`label_line` / `LABEL_TEMPLATE` / `LABEL_PREFIX`; and the string appears nowhere in
`bots/**.py`. The withdrawal is a decision, and without this a later reader would re-add
"just a small disclaimer line" believing they were fixing an oversight.

### Tests kept, with the expectation fixed

| Case | Was | Now |
|---|---|---|
| C-06 `test_gemini_failure_falls_back_to_the_description` | `assert text.endswith("\n— automated post from @TMRBot")` | `assert text.rstrip().endswith(teaser_line)` — the post ends *on the teaser* |
| C-11 `test_below_the_floor_posts_a_prompt_not_a_roundup` | the two branches were told apart by which **handle** appeared in the label | the branches are told apart by the **body**: a roundup must say "circles are active" and "Literary Circles"; a prompt must not. **Stronger than what it replaces** — a roundup mislabelled as a prompt used to be caught by a handle and is now caught by its content |
| A-02 `post_text_is_rendered_verbatim` (Android) | written as "R-05a's floor lives in `note.text`, so no screen may reshape it" | unchanged assertions; the comment now says what the rule actually enforces — a reader's post reaches the screen unmodified. That never depended on the label. MUT-4F-63 was re-run and still bites |

### Documents

`spec.md` R-05a, `pm-decisions.md` E-1/E-2, `architecture.md` (risk table, file map, the
flow diagram, the test-strategy table, the E-1 escalation) and `tests.md` (§6.1, §4.2,
§4.3, §8, the mutation table, §11) all record the withdrawal **in place**, struck through,
with the original reasoning left visible. Nothing was deleted from the record.

### The residual risk, in full

What still labels a bot post: the **username** (`@TMRBot` …), the **display name**
(*TrackMyRead Bestsellers*), the **bio** ("Automated account. …"), the **`is_bot` field** on
every API author object, and the **BOT badge** on web and on Android ≥ 2.2.4.

What no longer does:

- **An installed Android app below 2.2.4 now shows no per-post marker at all.** The `is_bot`
  field and the badge both need the new build; the username, name and bio are visible only
  if the reader opens the profile. This directly reverses the bargain in **E-1**, which
  accepted shipping ahead of the badge *because* R-05a covered the gap.
- A stale 60-second GET cache (`api.js:10-44`) predating R-02 serves author objects with no
  `is_bot`; those cards render unbadged on web too (that is L-4F-04's scenario).
- A screen-reader user no longer has a spoken label inside the post body.
- Any future surface that prints an author name into a server-composed sentence has no
  label at all. R-05 keeps bots out of the two that exist today.

`tests.md` §11 item 2 warned, in writing, that dropping R-05a would leave Android readers
below 2.2.4 with no label. The warning was correct and has been overridden knowingly.
Shipping 2.2.4 is the only mitigation on record.

---

## Change 2 — a bot post carries a real linked book (R-17)

### Diagnosis, confirmed in code before anything was changed

`GET /notes/feed` builds its `book` object from the note's `userbook -> book` and from
nothing else (`app/routers/notes_router.py`, `get_feed`, the `"book": {...} if book else None`
dict). The web card gates **both** the cover thumbnail and the gold title on that object
(`HomePage.jsx` `PostCard`: `const book = post.book`, then `{book && (…cover…)}` and
`{book && (…title…)}`). The bot passed a loose `image_url` and no `userbook_id`, so `book`
was `None` and the card had neither. The brief's description of the cause was correct.

### Mechanism chosen: `POST /books/add-to-library`

This is the reader's own path, reused unchanged. It matches an existing `Book` by
`book_id` → `google_books_id` → `isbn`, creates the row when there is no match, creates the
caller's `UserBook`, and returns the userbook's `id` — exactly the value `POST /notes/`
wants. `bots/common.add_to_library()` is a thin call to it; `post_note()` gained an optional
`userbook_id`.

**Rejected, and why:**

- **`POST /userbooks/`** — it takes an existing `book_id` and 404s otherwise. It does not
  resolve or create a `Book`, so the bot would have to create the catalogue row itself.
- **A new `book` payload on `POST /notes/`, resolved server-side.** It hides the same
  `UserBook` write behind a new API surface, duplicates the resolution logic that
  `add-to-library` already has, and would have needed its own tests and its own dedup
  story. The brief asked for the existing path and the existing path fits.
- **A `book_id` column on `note`.** A migration, a serialiser change on seven sites, and a
  second way for a note to have a book. Rejected on size alone.
- **Keeping `image_url` as well.** The cover would render twice — once as the 160px attached
  image and once as the 48/80px thumbnail. The cover now goes into the `Book` row's
  `cover_url` and `image_url` is passed **only** when the link failed.

### The three things the brief asked to be stated explicitly

**1. Should the bot own `UserBook` rows at all?** Yes, and it is a deliberate consequence,
not a side effect. `@TMRBot`'s profile now shows a library, and for that account the shelf
reads as "the bestsellers it has featured", which is honest. The rows are added as
**`status="to-read"` with no rating**, and that choice is the whole of what keeps the shelf
inert for readers:

| Reader surface | Selects | A `to-read`, unrated row |
|---|---|---|
| `GET /userbooks/friends/currently-reading` | `status == "reading"` | excluded |
| `GET /books/recommendations` bucket 1 | `status == "reading"` | excluded |
| `GET /books/recommendations` bucket 2 | `status == "finished"` **and** `rating >= 4` | excluded |
| `UserProfilePage` counters | counts `reading` / `finished` | shows **0 reading, 0 finished** |

`finished` would also miss bucket 2 while the rating stays null, but it claims the bot read
the book. `to-read` claims only that the shelf exists. B-37 pins both halves.

**2. What the other three voices do: nothing.** A prompt and a quote are about no book, and
none is invented. The **circle roundup does have one** — `/groups/discover` returns each
circle's `current_book` with an id — and it still does not link it, deliberately: the
roundup's subject is the circles, and a cover thumbnail beside it would read as a review of
that title. C-23b asserts zero library calls from all three *and* controls on the roundup
having named a book in its text, so "no link" is visibly a decision and not an absence.
A card with `book == None` keeps rendering; B-34's control and L-4F-06's control both
assert that.

**3. Is anything in R-05's prohibitions touched? No — confirmed by reading the guards.**

- R-05's prohibition is exactly four routes. `deny_bot_actor` (`app/deps.py:190`) appears on
  `follow_router.follow_user` and on three handlers in `likes_comments.py` (like, unlike,
  comment) — `grep -rn "deny_bot_actor" app/` returns those four and nothing else.
  `POST /books/add-to-library` does not carry it and must not: a bot owning **its own**
  library is not interaction with a reader's content. **B-36** pins both directions.
- The one place it could have leaked: `add_book_to_library` fires a `book_added` event to
  the actor's followers, and R-05 permits a reader to follow a bot. `fire_event` returns
  early when the actor's row has `is_bot` (`app/notifications/dispatcher.py:153`), so nothing
  is delivered and the bot is never named as an actor. **B-35** asserts the follower's
  `NotificationLog` count does not move, with a control proving the same call from a reader
  does move it by 1.

### Known, bounded residue

If `add-to-library` succeeds and `POST /notes/` then fails (409 or 429), the bot keeps a
`UserBook` row for a book it never posted about. It is one shelf row on a bot's profile,
not a duplicate post, and the next run's `GET /bots/posted` filter is unaffected. The
reciprocal case — the book is already on the shelf from such a run, so `add-to-library`
returns 400 — is handled by falling back to an unlinked post rather than spending a second
call to go and find the row (C-23a).

---

## Mutation-proof table

House rule: green → mutate product code → **RED with the actual output recorded** → revert →
green. Every row below was run that way. No mutation was invented after the fact, and the
two that did not bite the first time are reported, not hidden.

| MUT | File mutated | Mutation | Case | Actual first red line |
|---|---|---|---|---|
| 100 | `bots/prompts.py` | `compose` appends `"\n\n— automated post from @TMRPrompts"` again | C-01b | `AssertionError: prompt:1` / `assert 'automated post from' not in "what's a bo... @tmrprompts"` — pytest printed the containing line |
| 101 | `bots/bestsellers.py` | `post_note(..., userbook_id=None)` | C-23 | `KeyError: 'userbook_id'` at `assert posted["userbook_id"] == 701` |
| 102 | `bots/common.py` | `add_to_library` raises `BotError` instead of returning `None` | C-23a | `assert 1 == 0` on `common.run_guarded(bestsellers.run)`; stdout showed `FAILED: add-to-library failed status 400` — the post was lost |
| 103 | `bots/circles.py` | the roundup links its `current_book` | C-23b | `AssertionError: [{'author': 'An Author', 'cover_url': None, …}]` / `Left contains one more item` |
| 96 | `app/routers/notes_router.py` | `get_feed` serialises `book` as `None` when the author is a bot | B-34 | `AssertionError: the card has no book — this is the defect being fixed` / `assert None is not None` |
| 97 | `app/notifications/dispatcher.py` | the `_actor.is_bot` early return in `fire_event` is deleted | B-35 | `assert 1 == 0`; stdout showed `[Notify] book_added: sent=1` |
| 98 | `app/routers/books_router.py` | `Depends(deny_bot_actor)` added to `add_book_to_library` | B-36 | `assert deny_bot_actor not in [get_db, get_current_user, deny_bot_actor]` |
| 99 | `bots/common.py` | `add_to_library` sends `status="reading"` | B-37 | `AssertionError: the bot no longer adds books as to-read; re-check the surfaces below` |
| 99a | `app/routers/userbooks_router.py` | the `status == "reading"` filter is removed from `friends/currently-reading` | B-37 | `AssertionError: [{'book': {'author': 'B37 Author', …, 'title': 'B37 Shelved'}, …}]` / `assert False` |
| C-06 | `bots/bestsellers.py` | `compose` appends `"\n\nPosted automatically."` | C-06 | `assert False` on `'…A quiet novel about a long winter.\n\nPosted automatically.'.endswith('A quiet novel about a long winter.')` |
| C-11 | `bots/circles.py` | `MIN_READERS = 1`, `MIN_CIRCLES = 1` | C-11 | `AssertionError: circles:2026-W40` / `assert 'circles:2026-W40'.startswith('prompt:')` |
| 63 | `book-tracker-mobile-stitch/src/screens/FeedScreen.js` | `{post.text.replace(/—.*$/, '')}` | A-02 | `expected 3 verbatim note-text render sites, found 2 (FeedScreen.js=0, …)` — re-run to confirm the kept case still bites after its comment changed |
| 104 | `book-tracker-frontend-stitch/src/pages/HomePage.jsx` | `const book = null` in `PostCard` — exactly the defect the PM reported | L-4F-06 | `expected one cover <img alt="The Wager"> on the bot's card, found 0` |
| — | `tests/test_books.py` (committed) | one pre-4F assertion deleted | B-23' | `tests/test_books.py: deleted without an equivalent replacement: assert r.json()["book"]["title"] == "Dune"` **and** `tests/test_books.py has deleted lines and is not in K-01's list` — re-run after pinning the base, to prove the guard still covers pre-4F files |

### Mutations that did not bite as first written — reported, not replaced quietly

1. **MUT-4F-99 bites the canary, not the behaviour.** B-37 opens with a source assertion
   (`'"status": "to-read"' in inspect.getsource(add_to_library)`), and that assertion fires
   first, so changing the status to `reading` never reaches the three surface assertions.
   The surface half was therefore unproved by MUT-4F-99 alone. **MUT-4F-99a** was added to
   kill it from the other side — removing the `status == "reading"` filter from
   `friends/currently-reading` — and it does bite, with the bot's shelf appearing in a
   reader's list. Both are recorded above. A reader of this table should know that B-37 is
   two claims with two mutations, not one.
2. **MUT-4F-104 appeared not to bite, and the test harness was the reason.** The first run
   passed with the mutation in place. Cause: `npm run dev -- --port 5178` printed
   `Port 5178 is in use, trying another one...` and bound **5179**, while another checkout's
   dev server already held 5178 — so the harness was measuring a different working tree.
   Re-run against 5179 the mutation bites immediately. **Fixed in the follow-up below**
   (§"Follow-up 2"): the harness now refuses to run unless `--web` is serving this tree.
3. **The `_diff_violations` / K-01 guard cannot be mutation-tested from the working tree.**
   Both meta-tests read `git diff origin/master...HEAD`, which is *committed* state — the
   P5 builder recorded the same trap. The mutation in the last table row was therefore
   committed, run, and then removed with `git reset --hard HEAD~1`.

---

## What I found wrong in the plan, the guards and the brief

### 1. B-23'/K-01 had become unamendable, and it blocked this PM decision

`TestExistingSuite` asserts that no file under `tests/` may have **deleted lines** unless it
is in `K01_ALLOWED_FILES`, `SCHEMA_GUARD_EXEMPT`, `BUDGET_EXEMPT` or is `conftest.py`, and it
measured that from `origin/master...HEAD`. That was correct while 4F was on a branch:
`origin/master` *was* the pre-4F tree.

Since 4F merged, `origin/master` contains 4F, and the rule began policing **Sprint 4F's own
test files against every later branch**. Two consequences, both hit here:

- The PM's withdrawal of R-05a necessarily deletes three tests from
  `tests/test_bot_content.py`. Both meta-tests failed on it:
  `tests/test_bot_content.py: deleted without an equivalent replacement: assert callable(common.label_line)`
  (with 100 more such items) and
  `tests/test_bot_content.py has deleted lines and is not in K-01's list`.
- The rule **forbade its own amendment**: `tests/test_bots.py` is where the rule lives, and
  any edit to it produces deleted lines in a file that is not on any list.

I first fixed this with a fourth named exemption, `FOURF_OWN_TEST_FILES`. **The PM rejected
that and chose the other option** — pin the diff base — on the grounds that an exemption buys
one merge and taxes every branch after it, while quietly exempting the file the rule lives in.
That is the right call and it is what shipped; the resolution is written up in
§"Follow-up 1" below and in tests.md §2.6b.

### 2. The CI pytest floor had drifted 86 tests behind

`.github/workflows/ci-tests.yml` pinned `EXPECTED_MIN_TESTS: 623` — correct when P5 wrote it,
but master now passes **709**. Sprint 4E's and the rest of 4F's tests merged without anyone
raising it, leaving an 86-test hole in the exact protection that file exists to give: a test
file could stop loading and take 80 assertions with it without CI noticing. Raised to the
number measured after both changes, with the history in a comment, and the workflow header
now says in as many words that all three floors are re-measured and raised **every sprint**,
because a floor that lags is a gate that is switched off by exactly the size of the lag. The
`qa/unit` (38) and Android (121) floors were in step and are unchanged.

### 3. `qa/web_4f_local.mjs` silently measured another checkout

See mutation note 2 above, and §"Follow-up 2" — fixed.

### 4. The brief's own description was accurate

The cause given for change 2 — the serialiser emitting `"book": {...} if book else None`
derived from the note's `UserBook`, and the bot passing only `image_url` — was confirmed
line by line before anything was changed. Nothing in it was wrong.

### 5. One thing the brief did not mention

Dropping the loose `image_url` is part of the fix, not an extra. Keeping it alongside the
linked book renders the same cover twice on the card. It is now sent **only** when the link
fails.

---

## Suite numbers

| Suite | Before (measured on this branch at `f471a4b`) | After | Delta |
|---|---:|---:|---:|
| `pytest tests -q` | **709 passed**, 0 failed (491 s) | **714 passed**, 0 failed | **+5** |
| `node --test "qa/unit/*.test.mjs"` | **38 / 38 / 0** | **38 / 38 / 0** | 0 |
| `node --test "__tests__/*.test.mjs"` (mobile) | **121 / 121 / 0** | **121 / 121 / 0** | 0 |

All three baselines were measured in this worktree before any code was written, and all
three matched the numbers handed over.

Re-measured after the three follow-up changes below (pinned B-23' base, the harness tree
check, the CI floors): **714 passed, 0 failed** — unchanged, as expected, since none of the
three adds or removes a case. `EXPECTED_MIN_TESTS` is set to that number.

**The +5 reconciles exactly:** −3 deleted (C-01, C-02, C-02a) +1 added (C-01b) +3 added
(C-23, C-23a, C-23b) +4 added (B-34, B-35, B-36, B-37) = **+5**. No file failed to load.

`qa/unit` is unchanged because `qa/web_4f_local.mjs` is **not** part of it — it is a manual
Playwright harness run by hand. It was run in this worktree against its own dev server:
**5 passed, 0 failed** (L-4F-01..04 and the new L-4F-06; L-4F-05 deleted).

Android is unchanged because A-02 was kept — only its comment changed.

`npm ci --prefix qa`, `npm ci` in `book-tracker-mobile-stitch/` and `npm ci` in
`book-tracker-frontend-stitch/` were all run **in this worktree**. The main checkout was not
touched and nothing was pushed.

---

## Follow-ups after the coordinator's review (same branch, 2026-09-29)

### Follow-up 1 — B-23' is pinned to the pre-4F commit; `FOURF_OWN_TEST_FILES` is gone

The coordinator took the option I had not: B-23' is a statement about **what Sprint 4F did to
test files that already existed**, which is a historical fact that stopped being a moving
target when 4F merged. So the diff base is pinned and must never go back to `origin/master`.

**As built** (`tests/test_bots.py`):

```python
B23_BASE  = "707b8d9"            # merge(4e): query budget ... — the last pre-4F tree
B23_RANGE = B23_BASE + "...HEAD"

def _require_b23_base():
    """Fail with instructions if the pinned base is not in this clone. Never skip."""
```

All three B-23' nodes call `_require_b23_base()` and then diff `B23_RANGE`.
`FOURF_OWN_TEST_FILES` is **deleted**, together with its three usages and its two count
assertions — against a pre-4F tree, Sprint 4F's own test files are wholly new and appear as
pure additions, which `_diff_violations` already permits, so nothing needs exempting. The
three existing exemptions (`SCHEMA_GUARD_EXEMPT`, `BUDGET_EXEMPT`, `conftest.py`) and K-01's
14-line ceiling are untouched. The reasoning is written into the `B23_BASE` comment and into
each docstring so nobody re-points it.

**One correction to the instruction, reported rather than silently resolved.** `707b8d9` was
described as "master immediately before the 4F merge". It is not quite: it is
`merge(4e): query budget …`, and the commit immediately before the 4F merge is `01ec86c`
*fix(qa): refuse a bare URL, and default to the Singapore API*. **It makes no difference
here** — `01ec86c` touches only `qa/live_checks.py`:

```
$ git show --numstat --oneline 01ec86c
01ec86c fix(qa): refuse a bare URL, and default to the Singapore API
 qa/live_checks.py | 9 ++++++++-

$ git show --numstat --oneline 01ec86c -- tests/
(empty)
```

so for a `-- tests/` diff the two commits are the same base. I used `707b8d9` as instructed
and recorded the off-by-one and its evidence in the code comment.

#### Non-vacuity — the rule is exercised for the first time since the merge

Under `origin/master` on a just-merged master the range was **empty**, so all three nodes
passed while asserting nothing about 4F at all. Under the pinned base:

```
$ git diff 707b8d9...HEAD --numstat -- tests/
5     0    tests/conftest.py
4     4    tests/test_admin.py
883   0    tests/test_bot_content.py
2096  0    tests/test_bots.py
2     2    tests/test_groups.py
7     3    tests/test_local_day.py
7     7    tests/test_notes.py
7     1    tests/test_query_budget.py
92    1    tests/test_sql_artifacts.py

$ git diff 707b8d9...HEAD -- tests/ | wc -l
3264
```

Every file with deletions lands on a list that already existed; the two 4F files are 2096/0
and 883/0 — pure additions, exactly as the pinning predicted.

#### Proof, both directions

**A — a deleted assertion in a PRE-4F file must still fail.** Deleted
`assert r.json()["book"]["title"] == "Dune"` from `tests/test_books.py`, committed, ran:

```
E  assert ['tests/test_..."] == "Dune"'] == []
E    Left contains one more item: 'tests/test_books.py: deleted without an equivalent
E    replacement: assert r.json()["book"]["title"] == "Dune"'
E  AssertionError: tests/test_books.py has deleted lines and is not in K-01's list
E  assert ('tests/test_books.py' in {'tests/test_admin.py', 'tests/test_groups.py',
E          'tests/test_notes.py'} or … or 'tests/test_books.py' == 'tests/conftest.py')
2 failed, 1 passed, 57 deselected
```

Reverted with `git reset --hard HEAD~1`; back to 3 passed.

**B — a normal edit to a LATER sprint's test file must now pass where it previously failed.**
Deleted an assertion from `tests/test_bot_content.py` (a 4F-era file), committed, ran:

```
3 passed, 57 deselected in 0.43s
```

and then ran the **real** `_diff_violations` over the **same commit** from both bases, to show
the difference is the base and not the change:

```
PINNED 707b8d9    | _diff_violations: 0   | files with unlisted deletions: []
OLD origin/master | _diff_violations: 106 | files with unlisted deletions:
                                            ['tests/test_bot_content.py', 'tests/test_bots.py']
                    first violation: tests/test_bot_content.py: deleted without an
                                     equivalent replacement: """Sprint 4F, package P5 — the
```

Reverted. That is the same commit failing 106 ways under the old base and passing under the
pinned one.

#### CI needs full history — stated, not worked around

`git diff` against a pinned SHA needs that SHA present, and `actions/checkout@v4` clones at
depth 1, so the pytest job now sets **`fetch-depth: 0`**. That is a checkout change, not a
loosening of the rule. If it is ever removed, `_require_b23_base()` fails the three cases
with:

> B-23's pinned base 707b8d9 is not reachable in this clone. This is a CHECKOUT problem, not
> a reason to re-point the rule at origin/master: the pytest job needs `fetch-depth: 0`.

It **fails**; it does not skip. A fixed depth is not an alternative — the distance from HEAD
to `707b8d9` grows with every commit. Worth flagging to whoever owns CI: the previous
`origin/master...HEAD` form was *already* fragile there (on a pull-request checkout the
`origin/master` ref may not exist at depth 1, in which case `git diff` returns non-zero and
the case fails), so this change also removes an existing latent CI failure.

### Follow-up 2 — the harness now refuses to measure the wrong server

**The bug, restated.** `npm run dev -- --port 5178` prints `Port 5178 is in use, trying
another one...` and binds 5179. The operator passes `--web http://127.0.0.1:5178`, the port
they asked for, and every case measures whatever *does* hold 5178. On 2026-09-29 that was
`…/.claude/worktrees/4f-p3/` — another builder's worktree — and MUT-4F-104 reported PASS.

**The check, in `qa/web_4f_local.mjs`.** A new precondition, `treeMismatchReason()`, runs
before any case in both `--mock` and `--api` mode. It fetches the witness module
`/src/pages/HomePage.jsx` — the file every rendering case here depends on — and reads two
things out of Vite's dev transform. No writes, no nonce, no temp file in the repo:

| Half | Signal | Catches |
|---|---|---|
| **identity** | the absolute source path the transform names must be inside this harness's own `REPO` | `--web` pointing at a different checkout |
| **freshness** | the inline sourcemap's `sourcesContent[0]` is the original file text, and must equal the file on disk | the right tree served from a stale transform |

Content comparison alone is **not** sufficient, and that is worth recording: sibling worktrees
normally hold byte-identical files, so a content-only check passes right up to the moment the
trees diverge — which is precisely when it matters. The first version of this check was
content-only and it **passed against :5178**. The absolute path is what actually discriminates:
`…/worktrees/4f-p3/…` vs `…/worktrees/4f-fix/…`.

All failures **exit 6 and run nothing** — including "the served module names no source path",
because a harness that cannot identify what it is measuring must not report a pass.

**Proved, all four paths:**

| Case | Command | Result |
|---|---|---|
| correct server | `--web :5185` (this worktree's own dev server) | **5 passed, 0 failed** |
| wrong checkout | `--web :5178` (the `4f-p3` worktree) | **exit 6**, `is serving a DIFFERENT checkout. served from: …/worktrees/4f-p3/… expected: …/worktrees/4f-fix/…` plus the port-bump explanation |
| right tree, stale | a replay server on :5186 serving a captured transform while the disk file was changed underneath | **exit 6**, `is serving the right tree (…) but STALE contents of it … Restart the dev server.` |
| unidentifiable build | the same replay with the source path and the sourcemap stripped | **exit 6**, `names no source path, so this harness cannot prove which tree it came from and refuses to report a result` |

The stale and unidentifiable cases were produced with a throwaway replay server (a captured
response served from a temporary port) rather than by racing Vite's file watcher — a first
attempt at the race lost to the watcher, so it proved nothing and is not counted as a proof.
The replay is the same device as this plan's synthetic-diff controls: real function, fake
transport.

**Not changed:** the harness still cannot tell you that the port you passed is the port your
own `npm run dev` chose — nothing in the process tree connects the two. What it can now do is
refuse when the server on that port is not this tree, which is the failure that actually
occurred.

### Follow-up 3 — the CI floors

- The pytest floor is raised to the number measured after both follow-ups (see the table
  below).
- The workflow header now carries, in its own paragraph: **"RAISE THESE EVERY SPRINT."** with
  the measured evidence — the floor said 623 while master passed 709, so the gate was off by
  86 assertions for a week — and the instruction that the last step of any sprint touching
  tests is to re-measure all three suites and put the numbers in that sprint's own commit.
- `qa/unit` (38) and Android (121) were already in step and are unchanged.
