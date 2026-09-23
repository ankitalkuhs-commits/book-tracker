---
screen: sprint-4f-activity-engine
feature: community
package: P2 — serialisation, the cap, metrics, the atomic dedup
built_by: Builder (branch `builder-4f-p2`)
built: 2026-09-23
requirements: R-02, R-07, R-13, R-15, R-16
---

# Build notes — Sprint 4F, Package P2

## What was built

| File | Change |
|---|---|
| `app/crud.py` | `create_note` gains `commit: bool = True`. When false: `db.add` → `db.flush()` → return. The flush assigns the `SERIAL` id without ending the transaction. `notes_router.create_note` is still its only caller in `app/`, and it is the only call site that passes the kwarg |
| `app/routers/notes_router.py` | `NoteCreateSchema` gains `dedup_key: Optional[str] = None`; `BOT_MAX_NOTES_PER_DAY = 2`, `BOT_CAP_WINDOW = 24 h`, `BOT_CONTENT_TYPES`; the R-13 cap and the R-15 dedup branch in `create_note`; `+ "is_bot": bool(user.is_bot)` at all **seven** note-serialising sites |
| `app/routers/likes_comments.py` | `is_bot` on both comment-author dicts (create at `:157`, list at `:192`). The P1 guard dependencies were not touched |
| `app/routers/profile_router.py` | `is_bot` on `GET /profile/{user_id}`'s `base` dict. `GET /profile/me` is a **different handler** and is unchanged, so `tests/test_follow_profile.py:318` stays green |
| `app/routers/users_router.py` | `UserSearchResult` **and `FollowingUser`** gain `is_bot: bool = False`, set from the row. `FollowingUser` is a PM ruling on Finding 9, below |
| `app/routers/groups_router.py` | `is_bot` on the group-post list author (`:844`), the group-post create author (`:883`) and the group-activity author (`:1129`) |
| `app/routers/admin_router.py` | `PlatformStats` gains `bot_users` / `bot_notes`; `total_users`, `new_users_this_week`, `new_users_this_month` and `total_notes` filter `User.is_bot == False`; `UserSummary` and `NoteAdminView` gain `is_bot`; **`POST /admin/bot/trigger` deleted** |
| `app/routers/bots_router.py` | **new.** `GET /bots/posted?content_type=…&since=…`, 403 unless `current_user.is_bot`, unioning `bot_post.dedup_key` with `editorial_post.nyt_isbn` prefixed `bestseller:` |
| `app/main.py` | one import and one `include_router` |
| `context/PM_SQL_QUEUE.md` | the two PM SQL steps, as **6 and 7** (see Finding 1) |
| `tests/test_bots.py` | **+27 cases** (B-13..B-20 with suffixes, B-24, B-26..B-33) and two amendments to P1's own cases (Findings 5 and 6) |
| `tests/test_sql_artifacts.py` | **+1 case**, `TestBotSQL` (B-25b) |
| `tests/test_notes.py`, `tests/test_admin.py`, `tests/test_groups.py` | the 12 K-01 key-set assertions, amended in place |

### Suite numbers

| | Collected | Passed | Failed |
|---|---:|---:|---:|
| Baseline, this worktree at `a9d4a0c` (P1 merged) | 568 | 568 | 0 |
| After P2 | **596** | **596** | **0** |

596 − 568 = **28**, exactly the number of cases added (27 + 1) — so no test file failed to
load and no assertion was silently skipped. Wall time 452 s (baseline 450 s).

**The plan's 622 is not reachable from here and never was.** tests.md §1 credits P1 with 29
cases and P2 with 26; P1 delivered 28 test *functions* covering 26 case ids (B-23' is two
functions) and explicitly deferred B-24 and B-25b to P2. P2 therefore delivers 26 P2 cases
plus those two, as 28 functions. 540 + 28 + 28 = 596, and P5's 27 would bring it to 623. The
gate number in G-4F-02 needs re-deriving once P5 lands; the arithmetic in §1, not the work, is
what is off.

---

## The three things that matter most

### 1. The atomic dedup

```python
dedup_key = None
if current_user.is_bot:          # the cap, then the key — a reader reaches neither
    ...429 if 2 notes in 24 h...
    if payload.dedup_key:
        prefix = payload.dedup_key.split(":", 1)[0]
        if ":" not in payload.dedup_key or prefix not in BOT_CONTENT_TYPES:
            raise HTTPException(422, ...)
        dedup_key, content_type = payload.dedup_key, prefix

note = crud.create_note(db, ..., commit=(dedup_key is None))

if dedup_key is not None:
    db.add(models.BotPost(bot_email=..., content_type=..., dedup_key=..., note_id=note.id))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Already posted")
    db.refresh(note)
```

The block sits **before** the group-activity hook, so a 409 raises before
`background_tasks.add_task` is reached.

**Proof that a 409 creates no note** — B-27 counts rows, not status codes:

```
count(Note) before the duplicate == count(Note) after
count(BotPost) before == after
SELECT ... WHERE note.text = 'B27 SECOND TEXT'  ->  None
```

and the mutation that produces the orphan (commit the note first, then write the dedup row —
MUT-4F-40b) goes red on `assert 2 == 1` on the note count, not on the status code. The status
code is 409 in both worlds; only the count tells them apart.

### 2. R-02 at every note-serialising site

B-16a discovers the inventory from `app.routes` — every `APIRoute` under `/notes` whose
response model is `NoteOutSchema` or `List[NoteOutSchema]` — and asserts `len(found) == 7`
against a literal **before** anything is checked about contents. Adding an eighth such route
turns it red naming the new path (`found 8: [('GET', '/notes/eighth-site'), ...]`). B-16 then
walks that discovered set, not a copy-pasted list, and asserts it **reached a row on all
seven** before asserting anything about `is_bot`.

**Spec R-02's two mislabelled sites, verified independently.** The decorators on this branch
are at `:324` `/feed`, `:400` `/me`, `:461` `/user/{id}`, `:536` `/userbook/{id}`, `:580`
`/friends-feed`. So `notes_router.py:380` is `/notes/me`, not friends-feed, and `:606` is
friends-feed's only shape, not a "second shape". Both P1's notes and tests.md K-04 say so and
both are right. The line numbers are correct; two of the labels are not.

### 3. R-13 costs a reader nothing

Measured with a listener on `tests.conftest.engine`, both accounts warmed so the once-a-local-
day `last_active` write is out of the way:

| | statements | `Server-Timing` header |
|---|---:|---:|
| reader `POST /notes/ {"is_public": true}` | **5** | 4 |
| bot `POST /notes/ {"is_public": true}` | **6** | — |
| reader `POST /notes/ {"is_public": false}` | **4** | 4 |

`bot − reader == 1`, and that one statement is the cap's `COUNT`. The reader's 5 is the
pre-4F number K-09 measured, unchanged. See Finding 4 for why the header is 4 and not 5.

---

## The PM SQL for `bot_post`

This is the text now in `context/PM_SQL_QUEUE.md` **step 7**. It matches P1's build notes and
the `CREATE TABLE` that P1's `schema_guard` entry `("bot_post", "dedup_key")` requires,
statement for statement — confirmed by diffing the two blocks.

```sql
CREATE TABLE IF NOT EXISTS bot_post (
    id           SERIAL PRIMARY KEY,
    bot_email    VARCHAR(255) NOT NULL,
    content_type VARCHAR(32)  NOT NULL,
    dedup_key    VARCHAR(255) NOT NULL,
    note_id      INTEGER,
    posted_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_bot_post ON bot_post (content_type, dedup_key);
CREATE INDEX IF NOT EXISTS ix_bot_post_posted ON bot_post (content_type, posted_at DESC);
```

Verification (also in the file):

```sql
SELECT column_name FROM information_schema.columns
 WHERE table_schema = current_schema() AND table_name = 'bot_post' AND column_name = 'dedup_key';
SELECT indexname FROM pg_indexes WHERE tablename = 'bot_post';
```

Step 6 is P1's `is_bot` SQL verbatim, with its three verification queries. Neither step reads,
writes or moves a `note` row (R-06), and B-25b asserts that on the bounded section text.

---

## Mutation-proof table

Driver: `scratchpad/mut4f_p2.py` — one exact anchored edit (or, for a MOVE, one removal plus
one insertion), one pytest run by **full node id** (rule 6), file restored byte-for-byte in a
`finally`, then re-run to confirm green. Every row below was restored and re-verified; the
product tree after the run is identical to the commit (`git diff --stat` empty for `app/`).

| MUT-4F | File | One-line change | Case | Result | Actual first RED line |
|---|---|---|---|---|---|
| 29 | `notes_router.py` | `BOT_MAX_NOTES_PER_DAY = 99` | B-13 | RED | `E AssertionError: {"id":3,...,"user":{"id":4,"name":"B13","is_bot":true},"book":null}` (a 201 where a 429 was required) |
| 30 | `notes_router.py` | `if current_user.is_bot:` → `if True:` | B-14, B-33 | RED | `E AssertionError: (2, '{"detail":"Automated accounts may post at most 2 times in 24 hours"}')` |
| 31 | `notes_router.py` | drop `.where(Note.created_at >= window_start)` | B-15 | RED | `E AssertionError: {"detail":"Automated accounts may post at most 2 times in 24 hours"}` |
| 32 | `notes_router.py` | **move** the 429 to below `crud.create_note` | B-15a | RED | `E assert 1 == 0` (`stmt_counter.inserts`) |
| 33 | `notes_router.py` | add an 8th `NoteOutSchema` route | B-16a | RED | `E AssertionError: expected 7 note-serialising routes, found 8: [('GET', '/notes/eighth-site'), ...]` |
| 34 | `notes_router.py` | remove `is_bot` from `/notes/feed` | B-16 | RED | `E AssertionError: (('GET', '/notes/feed'), {'id': 4, 'name': 'B16b', 'profile_picture': None, 'username': '4f-b16-bot'})` |
| 35 | `profile_router.py` | remove `is_bot` from `base` | B-17 | RED | `E KeyError: 'is_bot'` |
| 35b | `users_router.py` | drop `is_bot=` from the `FollowingUser(...)` call (the pydantic default `False` stands, so the **bot** row reports False) | B-17 | RED | `E AssertionError: GET /users/following` |
| 35c | `users_router.py` | remove `is_bot` from the `FollowingUser` model (pydantic v1 ignores the extra kwarg, so the key is **absent**) | B-17 | RED | `E AssertionError: ('GET /users/following', ['bio', 'followed_at', 'id', 'is_following', 'is_mutual', 'name', ...])` |
| 35d | `tests/test_bots.py` | drop the site from `OTHER_AUTHOR_SITES` — proves the count guard fires **before** any value is read | B-17 | RED | `E AssertionError: assert 7 == 8` |
| 36 | `notes_router.py` | `getattr(user, "is_bot_absent", None)` | B-18 | RED | `E AssertionError: (('POST', '/notes/'), 'None')` |
| 37 | `notes_router.py` | emit the literal `False` | B-18a | RED | `E AssertionError: (('POST', '/notes/'), 'False')` |
| 38 | `notes_router.py` | `username` → `user_name` on `/notes/feed` | B-32 | RED | `E AssertionError: ('GET', '/notes/feed')` |
| 39 | `notes_router.py` | drop `db.add(models.BotPost(...))` | B-26 | RED | `E AssertionError: []` (no `BotPost` row) |
| **40** | `notes_router.py` | `except IntegrityError:` without `db.rollback()` | B-27 | **GREEN — does not bite** | — (see Finding 2) |
| **40b** | `notes_router.py` | `commit=(dedup_key is None)` → `commit=True` | B-27 | RED | `E AssertionError: assert 2 == 1` (the orphan note) |
| 41 | `notes_router.py` | **move** the dedup block below the group-activity hook | B-27a | RED | `E AssertionError: the 409 must not even register the hook` |
| 42 | `notes_router.py` | honour `dedup_key` without the `is_bot` guard | B-28 | RED | `E AssertionError: {"detail":"Already posted"}` |
| **43** | `notes_router.py` | `class Config: extra = "forbid"` | B-28a | **GREEN — cannot bite** | — (see Finding 3) |
| **43b** | `notes_router.py` | duplicate the dedup rule onto `PUT /notes/{id}` | B-28a | RED | `E AssertionError: {"detail":"no dedup on PUT"}` |
| 44 | `notes_router.py` | accept any `dedup_key` prefix | B-32b | RED | `E AssertionError: ('whatever:1', 201, '{"id":1,...}')` |
| 45 | `crud.py` | `commit: bool = False` default | B-30 | RED | `E assert False is True` (the signature default) |
| 46 | `crud.py` | `commit=False` commits anyway | B-30a | RED | `E AssertionError: the row was committed` |
| 47 | `bots_router.py` | read only `bot_post` (drop the legacy union) | B-29 | RED | `E AssertionError: ['bestseller:B29A']` |
| 48 | `bots_router.py` | drop the `is_bot` check | B-29 | RED | `E AssertionError: assert 200 == 403` |
| 49 | `bots_router.py` | ignore `since` | B-29a | RED | `E AssertionError: since was ignored` |
| 50 | `bots_router.py` | add `Depends(deny_bot_actor)` | B-29b, B-12a | RED | `E assert deny_bot_actor not in {..., <function deny_bot_actor ...>}` |
| 51 | `admin_router.py` | drop the filter on `total_users` | B-19 | RED | `E AssertionError: total_users` |
| 52 | `admin_router.py` | drop the filter on `total_notes` | B-19 | RED | `E AssertionError: total_notes` |
| 53 | `admin_router.py` | `bot_users` counts all users | B-19b | RED | `E AssertionError: assert (3 + 5) == 5` |
| 54 | `admin_router.py` | remove `is_bot` from `UserSummary` | B-20 | RED | `E KeyError: 'is_bot'` |
| 27 | `admin_router.py` | restore `POST /admin/bot/trigger` | B-24 | RED | `E AssertionError: {"status":"success"}` |
| 04 | `PM_SQL_QUEUE.md` | drop `IF NOT EXISTS` on `uq_bot_post` | B-25b | RED | `E AssertionError: assert 'CREATE UNIQUE INDEX IF NOT EXISTS uq_bot_post' in '## 6. Sprint 4F …'` |
| 04b | `PM_SQL_QUEUE.md` | add `UPDATE note …` to the section | B-25b | RED | `E AssertionError: ['UPDATE note SET is_public = false WHERE id = 1']` |

**Two mutations did not bite** (Findings 2 and 3). Both are reported here with the faithful
replacement that does, rather than swapped in silently — the same call P1 made for MUT-4F-11
and MUT-4F-15.

---

## Findings — things in the spec, architecture or test plan that are wrong or unbuildable

### Finding 1 (Major) — architecture §Data's "steps 4 and 5" are taken; the 4F SQL is 6 and 7

`context/PM_SQL_QUEUE.md` already has `## 4. Rating-reset repair` and `## 5. One leftover from
QA` on this branch. P1 flagged this; it is confirmed and acted on. The 4F SQL is steps **6**
and **7**, and K-15's "bounded section from its `## 4.` heading" is re-pointed to `## 6.` in
B-25b. The bound runs from the `## 6.` heading to the first `## ` heading after step 7, and
the case asserts the bound is real (step 4's title is outside it, step 7's is inside it) before
it asserts anything about the SQL — 4C's K-15 lesson about `text[start:]` applies in both
directions.

### Finding 2 (Major) — MUT-4F-40 does not bite, and cannot

`except IntegrityError:` without `db.rollback()` leaves B-27 green. The reason is structural:
the handler raises `HTTPException` immediately afterwards, and `get_db` closes the session
without committing (`app/database.py:60-68`), so the note is discarded either way. The rollback
is still correct — on PostgreSQL the session is in a failed transaction until it happens, and
`db.refresh(note)` and every later statement on that session would error — but **no test can
distinguish it on SQLite through the API**, because the failure mode it prevents never reaches
a row count.

The mutation that reproduces the defect the atomic design exists to prevent is the **pre-atomic
ordering**: commit the note first, then write `bot_post` separately. That is `commit=True` in
place of `commit=(dedup_key is None)` — recorded as **MUT-4F-40b** above, and it goes red on
the note count (`assert 2 == 1`), which is exactly the assertion the case was built around.

### Finding 3 (Major) — MUT-4F-43 is not a possible defect

tests.md B-28a names "make `dedup_key` a rejected extra field (`model_config = {"extra":
"forbid"}`)". Two things are wrong with it:

- This project runs **pydantic 1.10.24**, where `model_config` is inert — the v1 spelling is
  `class Config: extra = "forbid"`. Tried both.
- Neither bites, and neither can: `dedup_key` is a **declared field** on `NoteCreateSchema`,
  so `extra = "forbid"` never sees it. Forbidding extras would reject some *other* unknown key,
  which is not what B-28a is about.

The defect B-28a actually guards is the one the PM ruling in spec R-07 warns about in so many
words — duplicating the dedup rule onto `PUT /notes/{id}`, a route with no dedup concept.
Recorded as **MUT-4F-43b**: a `raise HTTPException(422)` on `payload.dedup_key` inside
`update_note`. It goes red with `{"detail":"no dedup on PUT"}`.

### Finding 4 (Minor) — B-33's `Server-Timing` cross-check is arithmetically impossible

tests.md B-33 asks for "the reader response's `Server-Timing` header parses to the **same** 5".
It parses to **4**, always: `ServerTimingMiddleware` stamps the header when the response is
built, and the public-post path queues `fire_group_activity_for_user` as a `BackgroundTask`
that runs one more statement afterwards. Measured: 5 statements, header 4.

The case pins both halves rather than dropping one, and adds the pairing where the two
measures *must* agree exactly — a **private** post queues no background task, and there the
listener count and the header are both 4. That is the cross-check K-09 wanted; the public
post's 5-vs-4 is a real, explainable gap and is asserted as `reader_queries - reader_header == 1`.

### Finding 5 (Major) — K-01's bounded exemption blocks a case tests.md itself commissions

P1's `SCHEMA_GUARD_EXEMPT` requires every line added to `tests/test_local_day.py` or
`tests/test_sql_artifacts.py` to carry one of `REQUIRED_COLUMNS` / `C4_PAIRS` / `Sprint 4F` /
`#`. K-15 instructs a Builder to add `TestBotSQL` to `tests/test_sql_artifacts.py` — 85 lines,
most of them ordinary code. Worse, git's 3-line context merges P1's `C4_PAIRS` rework and the
appended class into **one hunk**, so the new block inherits the marker requirement even though
it replaces nothing.

`_exempt_marker_violations` now scopes the marker rule to an *edit group*: a run of `-`/`+`
lines bounded by context lines, and only a group that contains a removal. A wholly new block
weakens nothing, and `_diff_violations` is what guards removals. Two synthetic controls were
added: an unmarked replacement still reports 1 violation, and an appended class after a context
line reports none. MUT-4F-28 and MUT-4F-28b (P1's) are unaffected — they are removals.

**This belongs back in tests.md K-01**, alongside P1's finding, rather than living only here.

### Finding 6 (Major) — B-27a as written cannot see the ordering it is about

The case says "the spy is **not** called". Starlette discards a response's background tasks
when the handler raises, so a hook that was *registered* and then abandoned is indistinguishable
from one never registered — and MUT-4F-41 (move the dedup block below the hook) stayed green
against it. R-15's claim is about registration: `background_tasks.add_task` must not be
reached. B-27a now records `BackgroundTasks.add_task` and asserts both the registration and the
call, with the 201 path as the control for each. The mutation then bites.

### Finding 7 (Minor) — K-01 says "fourteen assertions" and enumerates twelve

K-01's prose says fourteen; its list is `tests/test_notes.py:1106-1110` (5), `:1142`, `:1203`,
`tests/test_admin.py:86`, `:129`, `:133`, `:145`, `tests/test_groups.py:385` — **twelve**.
Twelve is what actually broke and twelve is what was amended. `K01_MAX_CHANGED_ASSERTIONS = 14`
is a per-file ceiling in B-23' and is unaffected, but the number in the finding should be
corrected so a later reader does not go hunting for two missing edits.

### Finding 8 (Minor) — one K-01 amendment could not be written the obvious way

`tests/test_notes.py:1203` is an exact dict equality. The obvious amendment adds
`"is_bot": False`, but B-23' compares the tokens on the removed and added lines and `False` is
not in `ALLOWED_NEW_TOKENS` — so the obvious amendment fails B-23'. It is written as
`"is_bot": alice.is_bot` instead, whose only new token is `is_bot`. B-18 and B-18a already pin
the identity `is False` at that site, so nothing is lost. Worth naming because the next person
to amend a value-bearing assertion will hit the same wall.

### Finding 9 (Major) — R-03 badges surfaces R-02 does not serialise. **PM-ruled 2026-09-23.**

Spec R-03 requires a badge at `HomePage.jsx:655`, the sidebar **following** list. That is
`GET /users/following`, whose `FollowingUser` model was **not** in R-02's list, so `is_bot` was
absent and a `<BotBadge user={u} />` there would read `undefined` and render `null` forever —
structurally the same vacuity K-05 caught at `HomePage.jsx:704`.

**PM ruling: the opposite resolution to K-05. Add the field; the badge stays.** K-05's `:704`
was dropped because a bot can *never* appear there — bots have no shelf. A bot *does* appear in
a following list, because R-05 permits a reader to follow a bot account ("the prohibition is
one-directional"). Dropping the badge would leave a bot rendered **unlabelled** on a surface
where readers really will meet one, which is the harm the whole sprint exists to prevent.

Built: `FollowingUser` gains `is_bot: bool = False`, set from the row, always present and
always boolean. B-17's literal inventory goes from 7 sites to **8**. P3's files were not
touched. Recorded in tests.md as **K-05a**.

### Finding 9a (Major) — the full sweep: every P3 and P4 badge against the endpoint feeding it

Asked for after Finding 9, so that a third mismatch could not be found later by accident. For
each badged site the client code was read to find which API call populates it, and that
endpoint's serialiser was checked.

| # | Badged site | Endpoint feeding it | `is_bot`? | Can a bot appear? |
|---|---|---|---|---|
| R-03 | `HomePage.jsx:175` post header | `/notes/feed`, `/notes/friends-feed` | yes (P2) | yes |
| R-03 | `HomePage.jsx:291` comment author | `GET /notes/{id}/comments` | yes (P2) | yes — a bot post's comments list |
| R-03 | `HomePage.jsx:641` user-search row | `GET /users/search` | yes (P2) | yes |
| R-03 | `HomePage.jsx:655` following list | `GET /users/following` | **was missing → added** | **yes** (R-05, one-directional) |
| R-03 | `UserProfilePage.jsx:386` profile name | `GET /profile/{user_id}` | yes (P2) | yes |
| R-03 | `GroupDetailPage.jsx:111` group post header | `GET /groups/{id}/posts` | yes (P2) | no — defence in depth, and it works |
| R-03 | **`GroupDetailPage.jsx:965` member row** | **`GET /groups/{id}/members`** | **no — ESCALATED** | no — see below |
| R-04 | `FeedScreen.js:660` feed post name | `/notes/feed`, `/notes/friends-feed` | yes (P2) | yes |
| R-04 | `FeedScreen.js:697` "is feeling…" line | same post object | yes (P2) | yes |
| R-04 | `FeedScreen.js:751` comment row | `GET /notes/{id}/comments` | yes (P2) | yes |
| R-04 | `FeedScreen.js:593` user-search row | `GET /users/search` | yes (P2) | yes |
| R-04 | `GroupDetailScreen.js:724` group post | `GET /groups/{id}/posts` | yes (P2) | no — defence in depth |
| R-04 | `UserProfileScreen.js:303` profile header | `GET /profile/{userId}` (`getPublicProfile`) | yes (P2) | yes |

Twelve of the thirteen are sound. Every mobile site is sound — R-04 badges no member list, so
the one gap is web-only.

**ESCALATION — `GroupDetailPage.jsx:965`, the circle member row.** `GET /groups/{group_id}/members`
(`groups_router.py:585-613`) returns `{user_id, name, username, profile_picture, role,
joined_at}` and carries no `is_bot`. It is not in spec R-02's list and not in architecture P2's
call-site table (which names `:844`, `:883`, `:1129` only). A bot **cannot** genuinely appear
there — spec §"Not building" rules out bots joining circles, and R-05 keeps them out — so by
the rule given this is a "drop the badge" case, and I have **not** decided it. But dropping
contradicts spec R-03, which commissions this badge **by name and with a stated reason**: "A
bot can never appear here (R-05), but the badge is added so that a future mistake is visible
rather than silent." The same sentence covers `:111`, and `:111` works only because P2 added
the field to `/groups/{id}/posts`.

So the two honest options are:

- **(a) add `is_bot` to the members row**, which makes R-03's stated defence-in-depth real and
  costs one more K-01-style assertion edit — `tests/test_groups.py:361` pins
  `{"user_id","name","username","profile_picture","role","joined_at"}` and is **not** in K-01's
  list of twelve; or
- **(b) drop `:965` from R-03's site inventory**, which contradicts R-03 as written and leaves
  the defence-in-depth claim in the spec untrue.

Either is one small change. Both are decisions above a Builder, and P3 cannot proceed on `:965`
until one is taken.

### Finding 10 (Informational) — `editorial_post` has no SQLModel, so the union is raw SQL

`editorial_post` is created by `migrations/add_editorial_bot.py` with raw DDL and has no entry
in `app/models.py`, so it is absent from `SQLModel.metadata` and from the test database.
`bots_router._legacy_bestseller_keys` therefore reads it with `sqlalchemy.text(...)` and treats
`SQLAlchemyError` as "no legacy history" after a `db.rollback()` — an absent legacy table must
not be a 500. B-29 creates and seeds the table with the same DDL the migration uses, so the
union is proved against a real row and MUT-4F-47 bites. Adding an `EditorialPost` model would
be cleaner, but `app/models.py` belongs to P1 and the table is read-only history (R-14).

### Finding 11 (Informational) — `/admin/content/notes` carries a flat `is_bot`, not an author object

Spec R-16 says this route "returns `is_bot` on the author". Its response model `NoteAdminView`
has no author object — it is flat, with `user_id` and `user_name`. The field is therefore
`is_bot` at the top level of the row, which is what K-01's `NOTE_KEYS` amendment and B-20
assert. No nested shape was invented.

### Finding 12 (Informational) — B-30a needs a lock-aware probe on this suite's database

"A second session cannot see the row" is the right assertion, but on the shared-cache in-memory
SQLite the suite uses, an uncommitted `INSERT` holds a **write lock** on `note`, so the second
connection cannot read the table at all and raises
`OperationalError: database table is locked: note`. `_visible_in_another_session` treats a lock
and an empty result identically — both mean "not committed" — and the mutation still bites
(`commit=False` committing anyway makes the read succeed). Recorded so the next person does not
read the `try/except` as a swallowed error.

---

## Deploy order — unchanged from P1

P2 adds no `schema_guard` entry, so P1's order stands exactly: PM runs step 6, PM runs step 7,
**then** deploy, then set `BOT_LOGIN_SECRET` / `BOT_LOGIN_EMAILS`, then run
`migrations/add_bot_accounts.py`. Deploying before steps 6 and 7 fails the deploy safely.

One thing P2 adds to the checklist: `POST /admin/bot/trigger` is gone, so the web Admin page's
"trigger editorial bot" control and `api.js`'s `triggerBot()` must go out in the **same web
deploy or later** — never earlier. That is P3's `AdminPage.jsx:454` / `api.js:356` row, and
ST-4F-04 greps for it.
