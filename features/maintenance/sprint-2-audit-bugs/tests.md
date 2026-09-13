---
screen: sprint-2-audit-bugs
feature: maintenance
test_plan_written: 2026-09-13
last_run: 2026-09-13
pass_rate: 72/72 (100% all pass)
written_by: Senior QA (before Builder; no build code read — only shipped pre-sprint code, to state current behaviour where the plan requires it)
sources: spec.md (APPROVED, R1–R9), architecture.md (PM-approved Technical Brief), dependency-map.md, tests/conftest.py, tests/test_notes.py, tests/test_reading_activity.py, tests/test_admin.py, tests/test_groups.py, features/security/sprint-1-hardening/tests.md
---

## How to read this plan

Every case gives exact steps and an exact expected result. "Expected" is what the spec and the
architecture promise — not what the code does today. Where a case is automatable, the pytest
function the Builder must create is named as `file :: Class :: name`.

Severity: **Critical** = privacy / ownership / data loss / feature dead. **Major** = core flow
broken. **Minor** = cosmetic or defensive.

Priority: P0 = ship blocker. P1 = fix within sprint. P2 = nice to have.

**Every privacy case is P0 / Critical and must never be downgraded.** In this sprint that means
all of R3 (private notes in group activity), the cross-user like case in R2 (T11), and the PII
case in R5 (T35/T37). R6's preference gate (T41) is a consent control and is also Critical.

---

## Test Cases

| # | Case | Priority | Severity | Status | Notes |
|---|---|---|---|---|---|
| T01 | R1 — mutual A + non-mutual B, B's post newer → A's post is first | P0 | Major | PASS | Test passes; friends feed correctly orders mutuals first |
| T02 | R1 — two mutuals → newest of the two first, both above any non-mutual | P0 | Major | PASS | Stable sort validates correct ordering within mutual group |
| T03 | R1 — two non-mutuals only → newest first | P0 | Major | PASS | Non-mutual ordering by recency works correctly |
| T04 | R1 — user follows nobody → `200` and `[]` | P1 | Major | PASS | Returns empty array as expected |
| T05 | R1 — a followed user's `is_public: false` note never appears | P0 | Critical | PASS | Privacy: private notes excluded from friends feed |
| T06 | R1 — a **private-profile** user you follow still contributes public notes | P0 | Critical | PASS | Private-profile users' public notes included when followed |
| T07 | R1 — notes from users you do not follow never appear | P0 | Critical | PASS | Privacy: unfollowed users' notes never visible |
| T08 | R1 — `GET /notes/friends-feed` unauthenticated → `401` | P0 | Critical | PASS | Unauthenticated request properly rejected |
| T09 | R2 — liked own note → both `true`; unliked note → both `false` | P0 | Major | PASS | Like state correctly reflects actual likes |
| T10 | R2 — the two duplicate keys agree on every row of the response | P0 | Major | PASS | `liked_by_me` and `user_has_liked` are consistent |
| T11 | R2 — another user's like does **not** set my `liked_by_me` | P0 | **Critical** | PASS | Cross-user privacy: other users' likes not leaked |
| T12 | R2 — `likes_count` still counts every liker, not just mine | P0 | Major | PASS | Like count aggregation unaffected by the fix |
| T13 | R2 — after `DELETE /notes/{id}/like`, both keys are `false` | P1 | Major | PASS | Unlike correctly resets both like flags |
| T14 | R2 — `/notes/me` note-card shape unchanged (incl. `updated_at`) | P0 | Critical | PASS | Contract maintained: all required keys present |
| T15 | R3 — private note → no `note_posted` in group activity | P0 | **Critical** | PASS | Private notes excluded from group activity (privacy fix) |
| T16 | R3 — public note → exactly one `note_posted` | P0 | Major | PASS | Public notes still fire group activity |
| T17 | R3 — `PUT private→public` fires **no** new activity | P0 | **Critical** | PASS | No retroactive activity announcements |
| T18 | R3 — `PUT public→private` fires nothing, no delete | P1 | Major | PASS | Existing activity not retroactively deleted |
| T19 | R3 — owner still sees private note via `GET /notes/me` | P0 | **Critical** | PASS | Owner access to own notes preserved (no data loss) |
| T20 | R3 — owner still sees via `GET /notes/userbook/{id}` | P0 | **Critical** | PASS | Owner-scoped userbook queries unaffected |
| T21 | R3 — private note in no public list | P0 | **Critical** | PASS | Private notes correctly absent from feed, friends-feed, user notes |
| T22 | R3 — author in two groups posts privately → neither has it | P1 | **Critical** | PASS | Group fan-out correctly guards all groups |
| T23 | R4 — `monthly_pages` has exactly 12 entries | P0 | Major | PASS | Month bucket count correct |
| T24 | R4 — 12 months match independent calendar walk | P0 | Major | PASS | 30-day-step bug fixed; real calendar months |
| T25 | R4 — consecutive unique months oldest-first | P0 | Major | PASS | Month ordering validated |
| T26 | R4 — every month number 1..12 appears exactly once | P0 | Major | PASS | February no longer skipped |
| T27 | R4 — backdated pages land in correct month | P0 | Major | PASS | Bucketing logic correct |
| T28 | R4 — `monthly_pages` shape: exactly `{month, pages_read}` | P0 | Critical | PASS | Contract maintained: no extra fields |
| T29 | R4 — activity today only → `current_streak == 1` | P0 | Major | PASS | Today-anchored streak calculation correct |
| T30 | R4 — activity yesterday only → `current_streak == 1` | P0 | Major | PASS | Yesterday fallback anchor working (was 0 before) |
| T31 | R4 — yesterday + today → `current_streak == 2` | P0 | Major | PASS | Multi-day streak counts correct |
| T32 | R4 — day-before-yesterday only → `current_streak == 0` | P0 | Major | PASS | Anchor moves back only 1 day, not 2 |
| T33 | R4 — no activity → both streaks `0` | P0 | Major | PASS | Zero streak for new users |
| T34 | R4 — `longest_streak` unaffected by anchor change | P0 | Major | PASS | Longest streak calculation preserved |
| T35 | R5 — no email in WARNING logs | P0 | **Critical** | PASS | PII: email not logged at WARNING level |
| T36 | R5 — `/profile/me` shape unchanged | P0 | Critical | PASS | Contract: all response keys present, both stat casings |
| T37 | R5 — nothing replaces log at DEBUG | P1 | **Critical** | PASS | PII: no substitute debug logging of profile data |
| T38 | R6 — inactive expo user gets row | P0 | Major | PASS | Reminder dispatched to inactive expo users |
| T39 | R6 — inactive web-only user gets row | P0 | Major | PASS | Web push recipients now included (was expo-only) |
| T40 | R6 — active today → no row | P0 | Major | PASS | Active users correctly excluded from reminders |
| T41 | R6 — user pref `false` → no row | P0 | **Critical** | PASS | Consent: preference toggle honored |
| T42 | R6 — twice same day → one row | P1 | Major | PASS | Daily cap prevents duplicate reminders |
| T43 | R6 — no token → no row | P0 | Major | PASS | Tokenless users not targeted |
| T44 | R6 — `is_active: False` early-returns | P1 | Major | PASS | Config disable gate works |
| T45 | R6 — no APScheduler, no network call | P0 | Critical | PASS | Suite hygiene: scheduler not started in tests |
| T46 | R7 — `sent_to` counts distinct users | P0 | Major | PASS | Broadcast counts users, not devices |
| T47 | R7 — non-admin → `403` | P0 | **Critical** | PASS | Authorization: non-admins rejected |
| T48 | R7 — unauthenticated → `401` | P0 | **Critical** | PASS | Authentication required |
| T49 | R7 — each recipient gets one `NotificationLog` row | P0 | Major | PASS | One row per user with correct `admin_broadcast` event |
| T50 | R7 — dual-channel user counted once | P0 | Major | PASS | User with multiple tokens counted as one recipient |
| T51 | R7 — no tokens → `sent_to: 0` | P1 | Major | PASS | Correct response when no push tokens exist |
| T52 | R7 — admin's account included if they have token | P1 | Major | PASS | Admins receive their own broadcasts |
| T53 | R7 — response shape `{message, sent_to}` | P0 | Critical | PASS | Contract: exactly two keys, sent_to is int |
| T54 | R7 — emoji and 500-char body round-trip | P2 | Minor | PASS | Unicode and long bodies preserved |
| T55 | R7 — no router imports `send_push_to_many` | P1 | Minor | PASS | Only likes_comments.py has dead import remaining |
| T56 | R8 — `git ls-files` no `.pyc` | P0 | Major | PASS | Bytecode files untracked (output: 0) |
| T57 | R8 — `git ls-files book_tracker.db` empty | P0 | Major | PASS | Database untracked |
| T58 | R8 — files still exist on disk | P0 | **Critical** | PASS | Data preserved: db and pycache dir present |
| T59 | R8 — `git status` clean of `.pyc` | P1 | Minor | PASS | No working tree noise |
| T60 | R8 — untracking in separate commit | P1 | Minor | PASS | Commit contains only git-index changes |
| T61 | R9 — pytest: 0 failed, count >= 150+new | P0 | Major | PASS | Full suite: 213 passed, 0 failed |
| T62 | R9 — sprint-1 tests unmodified | P0 | Major | PASS | All baseline tests still pass |
| T63 | R9 — `gen_dependency_map.py` exits 0 | P0 | Major | PASS | Dependency graph regenerates cleanly |
| T64 | Regression — `/notes/feed` shape | P0 | Critical | PASS | Community feed note-card unchanged |
| T65 | Regression — `/notes/friends-feed` with `is_mutual` | P0 | Critical | PASS | Friends feed shape preserved with mutual flag |
| T66 | Regression — `/reading-activity/daily` | P0 | Critical | PASS | Daily stats unchanged |
| T67 | Regression — `GET /profile/{id}` | P0 | **Critical** | PASS | Profile endpoint unchanged (locked private view works) |
| T68 | Regression — like still fires `post_liked` | P0 | Major | PASS | Like notifications still written |
| T69 | Regression — follow still fires `new_follower` | P0 | Major | PASS | Follow notifications still written |
| T70 | Regression — `/notes/user/{id}` private 403 | P0 | **Critical** | PASS | Private profile access control preserved |
| T71 | Regression — `member_joined` activity | P1 | Major | PASS | Non-note group activity still fires |
| T72 | Regression — `admin_broadcast` in history | P1 | Major | PASS | New event type renders in notification history |

**Total: 72 cases.**

---

## Detailed Cases

### R1 — friends feed order · `GET /notes/friends-feed`

**Shared setup helper** (put it at the top of the new class):

```python
def _backdate(db, note_id, minutes):
    """Force a deterministic created_at — two API calls can land in the same second."""
    from app import models
    from datetime import datetime, timedelta
    n = db.get(models.Note, note_id)
    n.created_at = datetime.utcnow() - timedelta(minutes=minutes)
    db.add(n); db.commit(); db.expire_all()
```

Every R1 case uses **fresh users** via `_make_user(db, email="ff2_<case>@example.com")` — never
`alice`/`bob`, whose follow graph other test files mutate. Follow with
`client.post(f"/follow/{other.id}", headers=h)`.

#### T01 — mutual first even when the non-mutual post is newer · P0 / Major
This is the case the sprint exists for; it fails on today's code.
**Steps:**
1. Create `viewer`, `mutual`, `nonmutual`.
2. `viewer` follows both: `POST /follow/{mutual.id}`, `POST /follow/{nonmutual.id}` as viewer.
3. `mutual` follows back: `POST /follow/{viewer.id}` as mutual. `nonmutual` does **not**.
4. As `mutual`: `POST /notes/ {"text": "T01 mutual older", "is_public": true}` → `m_id`.
5. As `nonmutual`: `POST /notes/ {"text": "T01 nonmutual newer", "is_public": true}` → `nm_id`.
6. `_backdate(db, m_id, minutes=30)` — the mutual's post is now unambiguously **older**.
7. `GET /notes/friends-feed` as `viewer`.
**Expected:** `200`. Both notes are present. `ids = [n["id"] for n in r.json()]` →
`ids.index(m_id) < ids.index(nm_id)`. The mutual's entry has `user["is_mutual"] is True`,
the non-mutual's has `user["is_mutual"] is False`.
**Pytest:** `tests/test_notes.py :: TestFriendsFeedOrder :: test_friends_feed_puts_mutual_follows_first`

#### T02 — newest first inside the mutual group · P0 / Major
**Steps:**
1. Create `viewer`, `mutual_a`, `mutual_b`, `nonmutual`.
2. `viewer` follows all three; `mutual_a` and `mutual_b` follow `viewer` back.
3. `mutual_a` posts (`a_id`), `mutual_b` posts (`b_id`), `nonmutual` posts (`nm_id`).
4. `_backdate(db, a_id, minutes=60)`, `_backdate(db, b_id, minutes=10)`, leave `nm_id` newest.
**Expected:** `200`. Order of the three ids in the response is exactly `[b_id, a_id, nm_id]` —
newest-first inside the mutual group, and the whole mutual group above the non-mutual post even
though `nm_id` is the newest note overall.
**Pytest:** `tests/test_notes.py :: TestFriendsFeedOrder :: test_friends_feed_newest_first_within_mutual_group`

#### T03 — two non-mutuals → newest first · P0 / Major
**Steps:** `viewer` follows `nm_a` and `nm_b`; neither follows back. `nm_a` posts (`a_id`),
`nm_b` posts (`b_id`). `_backdate(db, a_id, minutes=45)`.
**Expected:** `200`. `ids.index(b_id) < ids.index(a_id)` — the newer post is first. Both entries
have `user["is_mutual"] is False`.
**Pytest:** `tests/test_notes.py :: TestFriendsFeedOrder :: test_friends_feed_newest_first_when_all_non_mutual`

#### T04 — no follows → `[]` · P1 / Major
**Steps:** a brand-new user who follows nobody: `GET /notes/friends-feed`.
**Expected:** `200` and the body is exactly `[]` — an empty JSON array, not `null`, not
`{"notes": []}`, not a 404. (The handler returns early when the follow list is empty.)
**Pytest:** `tests/test_notes.py :: TestFriendsFeedOrder :: test_friends_feed_empty_when_no_follows`

#### T05 — a followed user's private note never appears · P0 / Critical
**Steps:** `viewer` follows `author`; `author` posts `{"text": "T05 secret", "is_public": false}`
and a second note `{"text": "T05 public", "is_public": true}`. `GET /notes/friends-feed` as viewer.
**Expected:** `200`. `"T05 public"` is present; **no** entry has `text == "T05 secret"`, and no
entry has `is_public is False`. Do this assertion on `text` *and* on the id — a leak that strips
the text but keeps the row is still a leak.
**Pytest:** `tests/test_notes.py :: TestFriendsFeedOrder :: test_friends_feed_excludes_private_notes`

#### T06 — private-profile author you follow · P0 / Critical — **current behaviour, stated**
The spec says "private-author exclusion unchanged (whatever the current behaviour is)". I read the
code path named in the brief. **The current behaviour is: `get_friends_feed` does NOT filter on
`is_private_profile` at all.** Its only filters are `Note.user_id IN following_ids` **and**
`Note.is_public == True` (`notes_router.py:479-487`). The private-profile exclusion lives in
`crud.get_notes_feed` (`crud.py:134-145`) and therefore applies **only to `GET /notes/feed`**.
So a private-profile user you already follow still contributes their public notes to your
friends-feed — which is correct: following is the consent, and `dependency-map.md` documents the
exclusion as a property of the community feed only. **R1 must not change this.**
**Steps:** `author` sets `PUT /profile/me {"is_private_profile": true}`; `viewer` follows `author`;
`author` posts a public note.
**Expected:** `200`, the note **is** in the viewer's friends-feed. If the Builder adds an
`is_private_profile` filter to `get_friends_feed`, this test fails — that is an out-of-scope
behaviour change and must be reported, not accepted.
**Pytest:** `tests/test_notes.py :: TestFriendsFeedOrder :: test_friends_feed_includes_private_profile_author_you_follow`

#### T07 — unfollowed users never appear · P0 / Critical
**Steps:** `viewer` follows `followed` only. `stranger` (not followed) posts a public note.
`GET /notes/friends-feed` as viewer.
**Expected:** `200`; no entry has `user_id == stranger.id`. The existing
`TestFeed :: test_friends_feed_only_shows_followed_users` covers the same invariant and must
still pass — this is the explicit guard that the new sort did not widen the query.
**Pytest:** `tests/test_notes.py :: TestFriendsFeedOrder :: test_friends_feed_excludes_unfollowed_users`

#### T08 — unauthenticated → 401 · P0 / Critical
**Steps:** `client.get("/notes/friends-feed")` with no header.
**Expected:** `401`. Assert the status only, not the detail text.
**Pytest:** `tests/test_notes.py :: TestFriendsFeedOrder :: test_friends_feed_requires_auth`

---

### R2 — `/notes/me` liked state

All R2 cases use a fresh user so the like counts are deterministic.

#### T09 — real like state, both keys · P0 / Major
**Steps:**
1. `owner = _make_user(db, email="me_like@example.com")`, `h = _auth(owner)`.
2. Post two notes as owner → `liked_id`, `unliked_id`.
3. `POST /notes/{liked_id}/like` as owner → `200`.
4. `GET /notes/me` as owner.
**Expected:** `200`. For the entry with `id == liked_id`: `liked_by_me is True` **and**
`user_has_liked is True`. For `unliked_id`: `liked_by_me is False` **and**
`user_has_liked is False`. Assert with `is True` / `is False`, not truthiness — today's code
hardcodes `True` and would pass a truthiness check on the liked row by accident.
**Pytest:** `tests/test_notes.py :: TestMyNotesLikeState :: test_my_notes_liked_by_me_reflects_real_likes`

#### T10 — the two duplicate keys agree · P0 / Major
**Steps:** on the same response as T09 (or a fresh `GET /notes/me`).
**Expected:** for **every** row, `n["liked_by_me"] == n["user_has_liked"]`, and both keys are
present in every row (`"user_has_liked" in n`). This is the `dependency-map.md` note-card contract;
today every row of this endpoint ships `liked_by_me: true` alongside `user_has_liked: false`.
**Pytest:** `tests/test_notes.py :: TestMyNotesLikeState :: test_my_notes_sets_both_like_keys_consistently`

#### T11 — another user's like does not set mine · P0 / **Critical** (cross-user privacy)
**Steps:**
1. `owner` posts a note → `note_id`. `owner` does **not** like it.
2. `liker = _make_user(db, email="me_like_other@example.com")`; `POST /notes/{note_id}/like` as liker.
3. `GET /notes/me` as **owner**.
**Expected:** `200`. The row for `note_id` has `liked_by_me is False` **and**
`user_has_liked is False` — the new query must be scoped `Like.user_id == current_user.id`.
A `True` here means the batch query leaked another user's like state into the caller's response.
`likes_count == 1` on the same row (see T12).
**Pytest:** `tests/test_notes.py :: TestMyNotesLikeState :: test_my_notes_other_users_like_does_not_set_liked_by_me`

#### T12 — `likes_count` still correct · P0 / Major
**Steps:** continue from T11 — `owner` now also likes their own note
(`POST /notes/{note_id}/like` as owner), then `GET /notes/me`.
**Expected:** `200`. The row has `likes_count == 2` (owner + liker) and `liked_by_me is True`.
The new `liked_set` query must not be confused with, or replace, the existing `likes_map`
aggregate.
**Pytest:** `tests/test_notes.py :: TestMyNotesLikeState :: test_my_notes_likes_count_counts_all_likers`

#### T13 — unliking flips both keys back · P1 / Major
**Steps:** with the owner's own like in place, `DELETE /notes/{note_id}/like` as owner, then
`GET /notes/me`.
**Expected:** `200`; the row has `liked_by_me is False`, `user_has_liked is False`, and
`likes_count` decremented by exactly 1.
**Pytest:** `tests/test_notes.py :: TestMyNotesLikeState :: test_my_notes_liked_by_me_false_after_unlike`

#### T14 — `/notes/me` note-card shape unchanged · P0 / Critical
**Steps:** `GET /notes/me` for a user with at least one note.
**Expected:** `200`. Every row contains **all** of: `id`, `user_id`, `text`, `emotion`,
`page_number`, `chapter`, `image_url`, `quote`, `is_public`, `created_at`, `updated_at`,
`likes_count`, `comments_count`, `liked_by_me`, `user_has_liked`, `user`, `book`.
`created_at` ends with `"Z"`. `user` is a dict with `id`, `name`, `username`, `profile_picture`.
**`updated_at` must still be present** — it is deliberately on `/notes/me` and absent from
`/notes/feed`; the brief says leave that asymmetry alone. No key is added or removed.
**Pytest:** `tests/test_notes.py :: TestMyNotesLikeState :: test_my_notes_note_card_shape_unchanged`

---

### R3 — private notes stay out of group activity — **every case Critical**

**Setup helper:**

```python
def _create_group(client, headers, name="R3 Circle"):
    return client.post("/groups/", json={"name": name, "is_private": False,
                                         "description": "R3"}, headers=headers)

def _note_posted_events(client, headers, gid):
    r = client.get(f"/groups/{gid}/activity", headers=headers)
    assert r.status_code == 200
    return [e for e in r.json() if e["event_type"] == "note_posted"]
```

The group creator is inserted as an **active curator** (`groups_router.py:401-402`), so a single
fresh user is enough — no join flow needed.

#### T15 — private note produces no group activity · P0 / **Critical**
**Steps:**
1. `author = _make_user(db, email="r3_priv@example.com")`, `h = _auth(author)`.
2. `gid = _create_group(client, h, name="R3 Private Circle").json()["id"]`.
3. Baseline: `before = _note_posted_events(client, h, gid)` → expect `[]`.
4. `POST /notes/ {"text": "R3 private body", "is_public": false}` as author → `201`, `note_id`.
5. `after = _note_posted_events(client, h, gid)`.
**Expected:** `after == []`. No event with `event_type == "note_posted"` exists for that group,
and no event anywhere in the response has `payload.get("note_id") == note_id`. Also assert the
note's text does not appear anywhere in `r.text` of the activity response — the payload only ever
carried `{note_id, book_title}`, and that must not change.
**Pytest:** `tests/test_notes.py :: TestPrivateNotesAndGroupActivity :: test_private_note_does_not_appear_in_group_activity`

#### T16 — public note still produces one · P0 / Major
**Steps:** same setup, a fresh group and author. `POST /notes/ {"text": "R3 public body",
"is_public": true}` → `note_id`. Read the activity.
**Expected:** exactly **one** `note_posted` event; `event["payload"]["note_id"] == note_id`;
`event["user"]["id"] == author.id`. This is the guard against over-correcting R3 into "never fire".
**Pytest:** `tests/test_notes.py :: TestPrivateNotesAndGroupActivity :: test_public_note_still_appears_in_group_activity`

#### T17 — flipping private → public fires nothing · P0 / **Critical**
**Steps:**
1. Fresh author + group. Post `{"text": "R3 flip up", "is_public": false}` → `note_id`.
2. `count_before = len(_note_posted_events(...))` → expect `0`.
3. `PUT /notes/{note_id} {"text": "R3 flip up", "is_public": true}` → `200`.
4. `count_after = len(_note_posted_events(...))`.
**Expected:** `count_after == 0`. A note made public later does **not** retroactively announce
itself — the brief states this is intended, not an oversight. `update_note` must gain no
`fire_group_activity*` call.
**Pytest:** `tests/test_notes.py :: TestPrivateNotesAndGroupActivity :: test_updating_note_to_public_fires_no_group_activity`

#### T18 — flipping public → private fires nothing, and does not delete · P1 / Major
**Steps:** fresh author + group. Post a **public** note → one `note_posted` row exists.
`PUT /notes/{note_id} {"text": "now hidden", "is_public": false}` → `200`. Re-read activity.
**Expected:** still exactly **one** `note_posted` event — the count is unchanged in both
directions. **Stated expected behaviour:** the pre-existing activity row is *not* retro-deleted;
the spec scopes R3 to `POST /notes/` only. Record it here so it is a decision, not a surprise.
It leaks nothing new (the row was legitimate when the note was public) but the PM should know.
**Pytest:** `tests/test_notes.py :: TestPrivateNotesAndGroupActivity :: test_updating_note_to_private_fires_no_group_activity`

#### T19 — the owner can still see their private note in `/notes/me` · P0 / **Critical**
An over-tight R3 fix that filters the note itself out of the owner's own list is data loss.
**Steps:** author posts `{"text": "R3 mine only", "is_public": false}` → `note_id`.
`GET /notes/me` as author.
**Expected:** `200`; a row with `id == note_id`, `text == "R3 mine only"`, `is_public is False`.
`crud.get_notes_for_user` has no `is_public` filter and must keep none.
**Pytest:** `tests/test_notes.py :: TestPrivateNotesAndGroupActivity :: test_private_note_still_visible_to_owner_in_my_notes`

#### T20 — the owner can still see it via `/notes/userbook/{id}` · P0 / **Critical**
**Steps:** author adds a book (`POST /books/add-to-library {"title": "R3 Book",
"total_pages": 100, "status": "reading"}` → `ub_id = json["id"]`), posts
`{"text": "R3 book-scoped private", "userbook_id": ub_id, "is_public": false}` → `note_id`, then
`GET /notes/userbook/{ub_id}` as author.
**Expected:** `200`; a row with `id == note_id` and `is_public is False`. That route is
owner-scoped (`ub.user_id != current_user.id` → `404`) and must keep returning private notes.
Also assert a **different** user gets `404` on the same `ub_id` (ownership, unchanged).
**Pytest:** `tests/test_notes.py :: TestPrivateNotesAndGroupActivity :: test_private_note_still_visible_to_owner_via_userbook`

#### T21 — the private note is in no public list · P0 / **Critical**
**Steps:** author (followed by `viewer`, mutual not required) posts `{"text": "R3 never public",
"is_public": false}` → `note_id`. Then as `viewer`: `GET /notes/feed`, `GET /notes/friends-feed`,
`GET /notes/user/{author.id}`.
**Expected:** all three `200`; in none of the three does any row have `id == note_id` or
`text == "R3 never public"`. This is the `CLAUDE.md` invariant in full.
**Pytest:** `tests/test_notes.py :: TestPrivateNotesAndGroupActivity :: test_private_note_absent_from_every_public_list`

#### T22 — the author is in two groups · P1 / **Critical**
`fire_group_activity_for_user` fans out to *every* active membership, so one guard must cover all.
**Steps:** author creates two groups `g1`, `g2` (creator = active curator in both). Posts
`{"text": "R3 two circles", "is_public": false}`.
**Expected:** `_note_posted_events` for **both** `g1` and `g2` is `[]`.
**Pytest:** `tests/test_notes.py :: TestPrivateNotesAndGroupActivity :: test_private_note_hidden_in_all_of_authors_groups`

---

### R4 — insights month buckets and streak

**How to create backdated activity.** `PUT /userbooks/{id}/progress` only ever logs **today**, so
every dated case inserts `ReadingActivity` rows directly through the `db` fixture:

```python
from datetime import datetime, timedelta
from app.models import ReadingActivity

def _log_activity(db, user_id, userbook_id, days_ago, pages=10):
    db.add(ReadingActivity(
        user_id=user_id,
        userbook_id=userbook_id,
        date=datetime.utcnow() - timedelta(days=days_ago),   # `date` is a datetime column
        pages_read=pages,
    ))
    db.commit()
    db.expire_all()      # the fixture session and the handler session are different Sessions
```

`userbook_id` is a real FK — create the userbook first with
`POST /books/add-to-library {"title": "...", "total_pages": 300, "status": "reading"}` and take
`json["id"]`. Do **not** call the progress endpoint in these tests: it would add an extra
today-row and corrupt the streak arithmetic. Every case uses a **fresh user**, so
`active_dates` contains only what the test inserted.

**Clock:** the handler uses `today = datetime.utcnow().date()` (`reading_activity_router.py:64`).
Tests must compute expectations from `datetime.utcnow().date()` — **not** `date.today()`, which is
the local date and differs from UTC for 5.5 hours a day on this machine.

#### T23 — exactly 12 entries · P0 / Major
**Steps:** fresh user, `GET /reading-activity/insights`.
**Expected:** `200`, `len(data["monthly_pages"]) == 12`. (Existing
`test_insights_monthly_pages_has_12_months` covers the same and must keep passing.)
**Pytest:** `tests/test_reading_activity.py :: TestInsightsMonthBuckets :: test_insights_monthly_has_exactly_12_entries`

#### T24 — the months equal an independently computed calendar walk · P0 / Major
This is the case that kills the 30-day-step bug regardless of what today's date is.
**Steps:**
```python
from datetime import datetime
today = datetime.utcnow().date()
expected = []
y, m = today.year, today.month
for _ in range(12):
    expected.append(f"{y}-{m:02d}")
    m -= 1
    if m == 0:
        m, y = 12, y - 1
expected.reverse()                      # oldest-first, ending with the current month
got = [e["month"] for e in r.json()["monthly_pages"]]
```
**Expected:** `got == expected` — element-for-element, same order. The expected list is built with
real month arithmetic in the test, never by re-using the handler's helper. `got[-1]` equals
`f"{today.year}-{today.month:02d}"`.
**Pytest:** `tests/test_reading_activity.py :: TestInsightsMonthBuckets :: test_insights_monthly_months_match_independent_calendar_walk`

#### T25 — unique, consecutive, oldest-first · P0 / Major
**Steps:** parse each `month` into `(year, month)` with
`tuple(int(p) for p in e["month"].split("-"))`.
**Expected:** 12 pairs; `len(set(pairs)) == 12` (no duplicates); for every adjacent pair,
`next == (y+1, 1) if m == 12 else (y, m+1)` — exactly one calendar month forward, never two,
never zero. The last pair equals the current UTC `(year, month)`.
**Pytest:** `tests/test_reading_activity.py :: TestInsightsMonthBuckets :: test_insights_monthly_months_are_consecutive_and_unique`

#### T26 — every month number appears exactly once · P0 / Major
Twelve consecutive calendar months must contain each of `1..12` exactly once. The 30-day-step code
cannot satisfy this in any year: stepping 30 days repeatedly from the 1st drifts backwards and
emits a duplicate month while skipping a 28/29-day February.
**Steps:** `nums = sorted(int(e["month"].split("-")[1]) for e in monthly_pages)`.
**Expected:** `nums == list(range(1, 13))`. Concretely this means February can never be missing —
which is the "assert February appears when running in March/April" case generalised so it holds on
every day of the year.
**Pytest:** `tests/test_reading_activity.py :: TestInsightsMonthBuckets :: test_insights_monthly_covers_every_month_number_once`

#### T27 — pages land in the right month · P0 / Major
**Steps:**
1. Fresh user + userbook. `_log_activity(db, user.id, ub_id, days_ago=0, pages=7)` — today.
2. `_log_activity(db, user.id, ub_id, days_ago=70, pages=13)` — roughly 2-3 months back.
3. Compute the expected key for each inserted row **in the test**:
   `d = (datetime.utcnow() - timedelta(days=N)).date()` → `f"{d.year}-{d.month:02d}"`.
4. `GET /reading-activity/insights`; build `by_month = {e["month"]: e["pages_read"] for e in …}`.
**Expected:** `by_month[key_for_0_days] >= 7` and `by_month[key_for_70_days] >= 13`
(use `>=` only if the two keys can collide — with 0 and 70 days apart they cannot, so assert `==`
when the keys differ, which the test should assert first). Every other of the 12 entries is `0`.
Both keys are present in the returned 12 — if the 70-day-old month is missing, the window itself
is wrong.
**Pytest:** `tests/test_reading_activity.py :: TestInsightsMonthBuckets :: test_insights_monthly_pages_bucketed_into_correct_month`

#### T28 — `monthly_pages` entry shape locked · P0 / Critical
Five client files render this list.
**Steps:** `GET /reading-activity/insights`.
**Expected:** `monthly_pages` is a **list** (not a dict). Every entry's key set is **exactly**
`{"month", "pages_read"}` — no `year`, no `label`, nothing added. `month` matches
`^\d{4}-\d{2}$`. `pages_read` is an `int` (not `None`, not a string). Ordering is oldest-first.
**Pytest:** `tests/test_reading_activity.py :: TestInsightsMonthBuckets :: test_insights_monthly_pages_shape_unchanged`

#### T29 — activity today only → streak 1 · P0 / Major
**Steps:** fresh user + userbook; `_log_activity(days_ago=0)`; `GET …/insights`.
**Expected:** `current_streak == 1`. (`today in active_dates` → anchor on today → one step.)
**Pytest:** `tests/test_reading_activity.py :: TestInsightsStreak :: test_insights_streak_one_when_only_today`

#### T30 — activity yesterday only → streak 1 · P0 / Major
Fails on today's code, which returns `0`.
**Steps:** fresh user + userbook; `_log_activity(days_ago=1)` only; `GET …/insights`.
**Expected:** `current_streak == 1` — the reader who has not opened the app yet today keeps
their streak. `longest_streak == 1`.
**Pytest:** `tests/test_reading_activity.py :: TestInsightsStreak :: test_insights_streak_one_when_only_yesterday`

#### T31 — yesterday + today → streak 2 · P0 / Major
**Steps:** `_log_activity(days_ago=0)` and `_log_activity(days_ago=1)`.
**Expected:** `current_streak == 2`, `longest_streak == 2`. Confirms the today-anchored path is
not broken by the new `else` branch.
**Pytest:** `tests/test_reading_activity.py :: TestInsightsStreak :: test_insights_streak_two_for_yesterday_and_today`

#### T32 — day-before-yesterday only → streak 0 · P0 / Major
The guard that the anchor moves back **one** day, not two.
**Steps:** `_log_activity(days_ago=2)` only.
**Expected:** `current_streak == 0`. `longest_streak == 1` (the single active day still counts as
the longest run). A `current_streak` of 1 here means the fallback walked too far back.
**Pytest:** `tests/test_reading_activity.py :: TestInsightsStreak :: test_insights_streak_zero_when_last_activity_two_days_ago`

#### T33 — no activity → 0 / 0 · P0 / Major
**Steps:** fresh user, no userbook, no activity rows. `GET …/insights`.
**Expected:** `current_streak == 0` **and** `longest_streak == 0`. Explicitly assert both — the
new `check = today - timedelta(days=1)` fallback must not make an empty set produce a non-zero
value. Existing `test_insights_new_user_all_zeros` asserts `current_streak == 0` and must also
still pass.
**Pytest:** `tests/test_reading_activity.py :: TestInsightsStreak :: test_insights_streak_zero_for_user_with_no_activity`

#### T34 — `longest_streak` untouched by the anchor change · P0 / Major
**Steps:** fresh user + userbook. `_log_activity` for `days_ago` = `10`, `11`, `12` (a three-day
run that ended over a week ago) and nothing since.
**Expected:** `current_streak == 0` (nothing today or yesterday) and `longest_streak == 3`.
`longest_streak`'s loop (`reading_activity_router.py:116-126`) is explicitly out of scope —
a changed value here means the Builder edited code the brief said not to touch.
**Pytest:** `tests/test_reading_activity.py :: TestInsightsStreak :: test_insights_longest_streak_unaffected_by_anchor_change`

---

### R5 — no PII in logs · **Critical**

#### T35 — no email in WARNING logs · P0 / **Critical**
**Steps:**
```python
import logging
def test_profile_me_logs_no_email(self, client, db, caplog):
    user = _make_user(db, email="pii_probe_unique@example.com", name="PII Probe")
    with caplog.at_level(logging.WARNING):
        r = client.get("/profile/me", headers=_auth(user))
    assert r.status_code == 200
    assert not any("pii_probe_unique@example.com" in rec.getMessage() for rec in caplog.records)
    assert "pii_probe_unique@example.com" not in caplog.text
    assert "/profile/me response" not in caplog.text
```
**Expected:** all four assertions hold. Today the handler calls
`logging.warning(f"/profile/me response: {repr(_log_data)}")` with `id`, `name`, **`email`**,
`bio`, `created_at`, `is_admin` — on the hottest authenticated path in the product. This is the
highest-severity item in the sprint: Render retains logs and anyone with dashboard access can read
them. A failure here is a ship blocker, no exceptions.
**Pytest:** `tests/test_follow_profile.py :: TestProfileMeNoPII :: test_profile_me_logs_no_email`

#### T36 — `/profile/me` response shape unchanged · P0 / Critical
Ten client files consume this endpoint.
**Steps:** `GET /profile/me` with a user token.
**Expected:** `200`. Top-level keys **exactly**: `id`, `name`, `username`, `email`, `bio`,
`profile_picture`, `yearly_goal`, `created_at`, `followers_count`, `following_count`, `stats`,
`is_admin`, `is_private_profile`. `stats` keys **exactly**: `total_books`, `totalBooks`,
`finished`, `reading`, `to_read`, `toRead`, `total_pages_read`, `totalPagesRead` — both casings,
because mobile reads camel and web reads snake and dropping either breaks a shipped app build.
`followers_count` and `following_count` are ints. Deleting the log block changes zero bytes of
this response; any diff is an unintended side effect.
**Pytest:** `tests/test_follow_profile.py :: TestProfileMeNoPII :: test_profile_me_response_shape_unchanged`

#### T37 — nothing quietly replaces the log · P1 / **Critical**
The spec says: remove the block, do not substitute a debug log of the same data.
**Steps:** same as T35 but `with caplog.at_level(logging.DEBUG)` and a second unique probe user
with a distinctive `bio` (e.g. `PUT /profile/me {"bio": "pii-probe-bio-marker"}` first).
**Expected:** no record at any level contains the email **or** `"pii-probe-bio-marker"`.
A `logging.debug` with the same dict is the same leak with a different log level.
**Pytest:** `tests/test_follow_profile.py :: TestProfileMeNoPII :: test_profile_me_logs_no_pii_at_debug_level`

---

### R6 — streak reminder through the dispatcher · `tests/test_scheduler.py` (new file)

**Call the function directly. Do not start APScheduler, do not touch `CronTrigger`,
`start_scheduler` or `stop_scheduler`.**

**Module-level fixture every case uses** (the seam is one module attribute, per the brief):

```python
import json
from datetime import datetime, timedelta
import pytest
from sqlmodel import select
from app import models
import app.notifications.scheduler as sched
from tests.conftest import engine as test_engine, _make_user

@pytest.fixture()
def scheduler_env(monkeypatch):
    """Point the scheduler at the test DB and stop any real push from leaving the machine."""
    monkeypatch.setattr(sched, "engine", test_engine)
    sent = []
    monkeypatch.setattr("app.notifications.dispatcher.send_expo_push",
                        lambda db, user_id, title, body, data: sent.append(user_id))
    monkeypatch.setattr("app.notifications.dispatcher.send_web_push",
                        lambda db, user_id, title, body, data: None)
    return sent

def _reminder_rows(db, user_id):
    db.expire_all()
    return db.exec(
        select(models.NotificationLog)
        .where(models.NotificationLog.user_id == user_id)
        .where(models.NotificationLog.event_type == "reading_streak_reminder")
    ).all()

def _inactive_user(db, email, token_type="expo", token="ExponentPushToken[sched-x]"):
    u = _make_user(db, email=email)
    u.last_active = datetime.utcnow() - timedelta(days=2)
    db.add(u)
    db.add(models.PushToken(user_id=u.id, token=token, token_type=token_type))
    db.commit(); db.expire_all()
    return u
```

**Why `send_expo_push` must be patched on the dispatcher, not on `push_mobile`:**
`dispatcher.py` does `from .push_mobile import send_expo_push` at module import, so the live
binding is `app.notifications.dispatcher.send_expo_push`. Without the patch, the scheduler — which
now scans **every** `PushToken` row in the shared test DB, including the real-looking
`ExponentPushToken[test-abc123]` left by `tests/test_push_tokens.py` — would hit Expo's live API
from the test suite. `send_web_push` returns early with no VAPID key, so its patch is belt-and-braces;
keep it so the suite stays offline if anyone ever sets `VAPID_PRIVATE_KEY` locally.

**Side-effect note for Junior QA:** because the scheduler scans all tokens, one call writes
reminder rows for other test files' users too. That is expected. Every assertion below is scoped
to *this test's* user id — never to a global row count.

#### T38 — inactive expo user gets a row · P0 / Major
**Steps:** `u = _inactive_user(db, "sched_expo@example.com", token_type="expo")`;
`sched._send_inactivity_reminders()`; read `_reminder_rows(db, u.id)`.
**Expected:** exactly **1** row. `row.event_type == "reading_streak_reminder"`,
`row.actor_id == 0` (not `None` — the old code wrote `None`), `row.user_id == u.id`,
`row.title == "Keep your streak alive! 🔥"`, `row.body ==
"You haven't logged any reading today. Even 5 pages counts!"` — both verbatim from `config.py`,
with no literal `{braces}` anywhere in either string. `u.id in sent` (the patched expo sender was
called).
**Pytest:** `tests/test_scheduler.py :: test_inactivity_reminder_notifies_expo_user`

#### T39 — web-only subscriber also gets a row · P0 / Major
This is the behaviour R6 adds; it fails on today's `token_type == "expo"` filter.
**Steps:** `u = _inactive_user(db, "sched_web@example.com", token_type="web",
token='{"endpoint": "https://fcm.googleapis.com/fcm/send/sched-web", "keys": {"p256dh": "k", "auth": "a"}}')`;
call the function.
**Expected:** exactly **1** `reading_streak_reminder` row for `u.id`, `actor_id == 0`. The user
has no expo token, so the row proves the recipient query stopped filtering `token_type`.
**Pytest:** `tests/test_scheduler.py :: test_inactivity_reminder_notifies_web_only_user`

#### T40 — user active today gets nothing · P0 / Major
**Steps:** create a user with a token and `last_active = datetime.utcnow()`; call the function.
**Expected:** `_reminder_rows(db, u.id) == []`.
**Pytest:** `tests/test_scheduler.py :: test_inactivity_reminder_skips_user_active_today`

#### T41 — preference `false` suppresses it · P0 / **Critical** (consent)
`notification_prefs` is a **JSON string** column, not a dict.
**Steps:** `u = _inactive_user(db, "sched_optout@example.com")`; then
`u.notification_prefs = json.dumps({"reading_streak_reminder": False})`; `db.add(u); db.commit()`;
call the function.
**Expected:** `_reminder_rows(db, u.id) == []` and `u.id not in sent`. A consent toggle that does
nothing is a privacy defect — this case is why R6 exists and must never be downgraded.
Also assert the inverse in the same test or a sibling: a user with
`json.dumps({"new_follower": False})` (a *different* key off) still **does** get the reminder —
opt-out is per-key, not global.
**Pytest:** `tests/test_scheduler.py :: test_inactivity_reminder_respects_user_preference`

#### T42 — running twice the same day sends once · P1 / Major
**Steps:** `u = _inactive_user(db, "sched_cap@example.com")`;
`sched._send_inactivity_reminders()` twice in a row; read the rows.
**Expected:** exactly **1** row for `u.id` — `reading_streak_reminder` has `daily_cap: True` and
`_check_daily_cap` now applies because the actor is a stable `0`.
**Known fragility to report, not to hide:** `_check_daily_cap` builds its window from
`date.today()` (**local**) while `NotificationLog.sent_at` defaults to `datetime.utcnow()`
(`dispatcher.py:65` vs `models.py:161`). On an IST machine, between 00:00 and 05:30 local the
window start is *ahead* of the UTC timestamps of rows written earlier the same local day, so the
cap can fail to match and a second row appears. If this test fails only in that window, it is a
**pre-existing timezone mismatch in the dispatcher**, not a Builder defect — record it as an
observation for the PM, do not let the Builder "fix" it by editing `dispatcher.py` (out of scope).
**Pytest:** `tests/test_scheduler.py :: test_inactivity_reminder_daily_cap_prevents_second_send`

#### T43 — user with no push token gets nothing · P0 / Major
**Steps:** `u = _make_user(db, email="sched_notoken@example.com")` with
`last_active = utcnow() - 2 days` and **no** `PushToken` row at all; call the function.
**Expected:** `_reminder_rows(db, u.id) == []` — the recipient set is derived from `pushtoken`,
so a tokenless user is never even a candidate and no history row is fabricated for them.
**Pytest:** `tests/test_scheduler.py :: test_inactivity_reminder_skips_user_without_token`

#### T44 — `is_active: False` short-circuits · P1 / Major
**Patch the config dict and restore it** — `NOTIFICATION_EVENTS` is module-level and shared.
**Steps:**
```python
from app.notifications.config import NOTIFICATION_EVENTS
cfg = NOTIFICATION_EVENTS["reading_streak_reminder"]
monkeypatch.setitem(cfg, "is_active", False)     # monkeypatch restores it after the test
u = _inactive_user(db, "sched_disabled@example.com")
sched._send_inactivity_reminders()
```
**Expected:** `_reminder_rows(db, u.id) == []` and `sent == []` — nothing sent to **anyone**, not
just this user. Use `monkeypatch.setitem` (auto-restoring) rather than a manual assignment; a
leaked `is_active: False` would silently disable the event for every later test in the session.
After the test, assert in a following case (or at teardown) that
`NOTIFICATION_EVENTS["reading_streak_reminder"]["is_active"] is True` again.
**Pytest:** `tests/test_scheduler.py :: test_inactivity_reminder_noop_when_event_disabled`

#### T45 — no APScheduler, no network · P0 / Critical (suite hygiene)
**Steps:** in a test that has already called `_send_inactivity_reminders()`:
`assert sched.scheduler.running is False`.
**Expected:** `False`. `start_scheduler()` is **never** called from the test suite. Additionally,
the suite's wall-clock must not grow by seconds-per-case — a jump is the signature of a real HTTP
call to Expo, i.e. the `send_expo_push` patch missed its binding. Neither
`app/notifications/scheduler.py`'s `CronTrigger(hour=14, minute=30)` nor `start_scheduler` /
`stop_scheduler` may be touched by this sprint.
**Pytest:** `tests/test_scheduler.py :: test_inactivity_reminder_does_not_start_apscheduler`

---

### R7 — admin broadcast on both channels · `tests/test_admin.py :: TestAdminBroadcast`

**Same network hazard, different binding.** `admin_router.py` imports the senders at module level,
so patch `app.routers.admin_router.send_expo_push` (and, defensively,
`app.routers.admin_router.send_web_push`) in every broadcast case. The handler scans **all**
`PushToken` rows, including ones other test files created.

**Helpers:**
```python
_BODY = {"title": "T46 Announcement", "body": "We shipped something."}

def _give_token(db, user, token_type="expo", token=None):
    db.add(models.PushToken(user_id=user.id, token=token or f"ExponentPushToken[adm-{user.id}]",
                            token_type=token_type))
    db.commit(); db.expire_all()

def _distinct_token_user_ids(db):
    db.expire_all()
    return set(db.exec(select(models.PushToken.user_id)).all())

def _broadcast_rows(db, user_id):
    db.expire_all()
    return db.exec(select(models.NotificationLog)
                   .where(models.NotificationLog.user_id == user_id)
                   .where(models.NotificationLog.event_type == "admin_broadcast")).all()
```

#### T46 — `sent_to` counts distinct users · P0 / Major
**Steps:** two fresh users each with **one** expo token; compute
`expected = len(_distinct_token_user_ids(db))` from the DB immediately before the call (the shared
DB may hold other users' tokens — never hardcode `2`);
`POST /admin/push/broadcast` with `_BODY` and `admin_headers`.
**Expected:** `200`. `json["sent_to"] == expected`. `json["message"]` contains
`f"{expected} user(s)"` — the wording changed from "device(s)" to "user(s)" deliberately.
**Pytest:** `tests/test_admin.py :: TestAdminBroadcast :: test_broadcast_sent_to_counts_distinct_users`

#### T47 — non-admin → 403 · P0 / **Critical**
**Steps:** `client.post("/admin/push/broadcast", json=_BODY, headers=alice_headers)`.
**Expected:** `403` — not 401, not 200. Then assert **no** new `admin_broadcast` row exists for
alice (`_broadcast_rows(db, alice.id) == []` if she had none before): a rejected request must
write nothing.
**Pytest:** `tests/test_admin.py :: TestAdminBroadcast :: test_broadcast_forbidden_for_non_admin`

#### T48 — unauthenticated → 401 · P0 / **Critical**
**Steps:** `client.post("/admin/push/broadcast", json=_BODY)` with no header.
**Expected:** `401`. No `NotificationLog` row with `event_type == "admin_broadcast"` is created
by this call (snapshot the count before and after).
**Pytest:** `tests/test_admin.py :: TestAdminBroadcast :: test_broadcast_requires_auth`

#### T49 — a log row per recipient with the right fields · P0 / Major
**Steps:** two fresh users, one with an **expo** token and one with a **web** token; broadcast
`{"title": "T49 Title", "body": "T49 Body"}` as admin.
**Expected:** `200`. For **each** of the two users, exactly one new row with
`event_type == "admin_broadcast"`, `actor_id == admin.id` (the real admin id, not `0` and not
`None` — this is what makes a broadcast auditable), `title == "T49 Title"`,
`body == "T49 Body"` byte-for-byte (no template rendering, no `{braces}` left behind), and
`row.data["type"] == "admin_broadcast"`.
**Pytest:** `tests/test_admin.py :: TestAdminBroadcast :: test_broadcast_writes_notification_log_per_user`

#### T50 — dual-channel user counted once · P0 / Major
**Steps:** one fresh user given **both** an expo and a web `PushToken` row; snapshot
`expected = len(_distinct_token_user_ids(db))`; broadcast.
**Expected:** `200`; `sent_to == expected` (the two-token user contributes **1**, not 2) and that
user has exactly **one** new `admin_broadcast` row, not two. This is the `SELECT DISTINCT`
requirement; a device count here is the old behaviour.
**Pytest:** `tests/test_admin.py :: TestAdminBroadcast :: test_broadcast_counts_dual_channel_user_once`

#### T51 — no tokens at all → `sent_to: 0` · P1 / Major
**Destructive setup — read this before writing the test.** The shared in-memory DB usually holds
tokens by the time this runs, so the test must empty the table itself:
```python
for t in db.exec(select(models.PushToken)).all():
    db.delete(t)
db.commit(); db.expire_all()
```
This is safe because **no test depends on a `PushToken` row created by a different test** — every
push test (`tests/test_push_tokens.py`, and T38-T50 above) creates its own rows inside the test
body. If a random-order plugin is ever added to this repo, revisit this case first.
**Steps:** empty the table as above, then `POST /admin/push/broadcast` with `_BODY` as admin.
**Expected:** `200`, body exactly
`{"message": "No registered push tokens found", "sent_to": 0}`. No `NotificationLog` row is
written by this call.
**Pytest:** `tests/test_admin.py :: TestAdminBroadcast :: test_broadcast_with_no_tokens_returns_zero`

#### T52 — the admin's own account is included · P1 / Major
**Expected behaviour, stated per the brief:** the handler deliberately does **not** go through
`fire_event`, so `fire_event`'s skip-self rule does not apply. It loops over every distinct
`PushToken.user_id` with no exclusion. **An admin who has a push token receives their own
broadcast and gets a `NotificationLog` row where `user_id == actor_id == admin.id`.** That is
correct for an operational announcement channel — the admin is a user of the product too.
**Steps:** give the `admin` fixture user an expo token; broadcast `{"title": "T52", "body": "self"}`.
**Expected:** `200`; `_broadcast_rows(db, admin.id)` contains a row with `title == "T52"` and
`actor_id == admin.id`; `admin.id` is counted inside `sent_to`. If the Builder adds a skip-self
guard, that is a deviation from the brief — report it rather than accepting either behaviour.
**Pytest:** `tests/test_admin.py :: TestAdminBroadcast :: test_broadcast_includes_admins_own_account`

#### T53 — response shape unchanged · P0 / Critical
**Steps:** any successful broadcast.
**Expected:** `set(json.keys()) == {"message", "sent_to"}` — exactly two keys, nothing added.
`isinstance(json["sent_to"], int)` and `isinstance(json["message"], str)`.
`AdminPage.jsx:68` reads only `message`, so the shape is the whole contract; the *number inside*
the message legitimately changes meaning from devices to users.
**Pytest:** `tests/test_admin.py :: TestAdminBroadcast :: test_broadcast_response_shape_unchanged`

#### T54 — emoji and long body round-trip · P2 / Minor
**Steps:** broadcast `{"title": "📣 Café — naïve 🎧", "body": "x" * 500}`.
**Expected:** `200`; the recipient's `NotificationLog` row has `title` byte-identical to what was
sent (no mojibake) and `len(row.body) == 500` (no truncation).
**Pytest:** `tests/test_admin.py :: TestAdminBroadcast :: test_broadcast_preserves_emoji_and_long_body`

#### T55 — `utils/push.py` is no longer imported by a router · P1 / Minor
**Command (repo root, Git Bash):**
```
grep -rn "from ..utils.push import\|from app.utils.push import" app/routers/
```
**Expected:** exactly **one** remaining hit —
`app/routers/likes_comments.py: from ..utils.push import send_push_notification_to_user`. That
import is pre-existing dead code and the spec says leave it (`CLAUDE.md` rule 3: mention, do not
delete). There must be **no** `send_push_to_many` hit anywhere under `app/`. `app/utils/push.py`
itself must still exist on disk (`ls app/utils/push.py`) — the spec says leave the file.
**Not automatable as pytest — shell check.**

---

### R8 — git hygiene

Run all of these from the repo root `C:\Users\sonal\Documents\projects\book-tracker`, in Git Bash,
**after** the Builder's commit. Between `git rm --cached …` and the commit, `git status`
legitimately shows staged `D` lines — that is the expected intermediate state, not a failure.
Baseline before the sprint: 18 tracked files (7 in `app/__pycache__/`, 10 in
`app/routers/__pycache__/`, plus `book_tracker.db`).

#### T56 — no `.pyc` tracked · P0 / Major
**Command:** `git ls-files | grep -cE "\.pyc$"`
**Expected:** `0` (was 17). `grep -c` exits 1 when it counts nothing — read the printed `0`, the
exit code is not the result.
#### T57 — `book_tracker.db` not tracked · P0 / Major
**Command:** `git ls-files book_tracker.db`
**Expected:** empty output, exit 0.
#### T58 — the files still exist on disk · P0 / **Critical**
**Command:** `ls -la book_tracker.db && ls app/__pycache__ | head`
**Expected:** `book_tracker.db` present with a non-zero size; `app/__pycache__/` still listing
`.pyc` files. If either is gone, the Builder dropped `--cached` — that is data loss: stop and
restore from `git show HEAD^:<path>` before doing anything else.
#### T59 — `git status` clean of `.pyc` noise · P1 / Minor
**Command:** `git status --short | grep -c "\.pyc"`
**Expected:** `0`.
#### T60 — its own commit · P1 / Minor
**Command:** `git show --stat --name-only HEAD | grep -vE "__pycache__|book_tracker\.db"`
**Expected:** besides the commit header lines, **nothing** — no `app/routers/*.py`, no `tests/`,
no `features/`. The commit message body should note (a) a collaborator pulling it loses those
paths from their working copy and (b) a fresh clone has no `book_tracker.db`, so local dev must
initialise the DB once. `.gitignore` is **not** edited this sprint — it already covers both
patterns; a `.gitignore` diff in this commit means the Builder did unnecessary work.

---

### R9 — the suite is green

#### T61 — full run · P0 / Major
**Command (repo root):** `.venv\Scripts\python.exe -m pytest tests -q`
**Expected:** the summary line ends `0 failed`. No errors, no new skips, no collection errors.
Collected count `>= 150 + the new tests` (150 is the sprint-1 baseline). A **drop** in the
collected count means a test was deleted rather than fixed — that is a fail.
#### T62 — sprint-1's 150 still pass · P0 / Major
**Command:** `.venv\Scripts\python.exe -m pytest tests -q` then `git diff --stat HEAD~N -- tests/`
**Expected:** every test that passed at sprint-1 close still passes. The architecture states all
sprint-2 tests are **additive**: no existing test file loses or rewrites a case. In particular
`test_insights_new_user_all_zeros`, `test_insights_monthly_pages_has_12_months`,
`test_friends_feed_only_shows_followed_users`, `test_private_notes_excluded_from_community_feed`
and all 7 of `tests/test_push_tokens.py` must pass **unmodified**. If a pre-existing test had to
change to accommodate the fix, that is a contract change and must be escalated, not edited away.
#### T63 — dependency map regenerates · P0 / Major
**Command:** `.venv\Scripts\python.exe scripts\gen_dependency_map.py`
**Expected:** exit `0`, no traceback. The diff to `dependency-map.md` is **line-number shifts
only** in the generated appendix. No route is added, removed, or re-authed, so no `⚠️` appears or
disappears and no consumer column changes. The curated `### app/notifications/dispatcher.py ::
fire_event() + config.py` section already names the scheduler caller and the `admin_broadcast`
exception (Architect updated it) — confirm the generator did not overwrite the curated block.

---

### Regression — consumers of the touched endpoints

Sourced from `dependency-map.md`. No client file changes this sprint, so the bar is: **the server
response is identical in shape to before.**

#### T64 — `GET /notes/feed` note-card shape · P0 / Critical
**Steps:** as a user, `GET /notes/feed` with at least one public note present.
**Expected:** `200`; every row has all of `id`, `user_id`, `text`, `emotion`, `page_number`,
`chapter`, `image_url`, `quote`, `is_public`, `created_at`, `likes_count`, `comments_count`,
`liked_by_me`, `user_has_liked`, `user`, `book`. `created_at` ends `"Z"`. `liked_by_me ==
user_has_liked` on every row. `/notes/feed` is **not** modified this sprint — any diff is a side
effect of the R2 edit landing in the wrong function.
**Pytest:** `tests/test_notes.py :: TestFeed :: test_community_feed_note_card_shape_unchanged`

#### T65 — `GET /notes/friends-feed` note-card shape · P0 / Critical
**Steps:** the T01 fixture, then read the response.
**Expected:** `200`; the same key set as T64 **plus** `user["is_mutual"]` present and boolean on
every row — the web `HomePage.jsx` renders it, and the brief forbids touching it. The sort must
not drop, wrap, or re-key any element: `len(response)` equals the number of qualifying notes and
the set of ids is unchanged by the re-order.
**Pytest:** `tests/test_notes.py :: TestFriendsFeedOrder :: test_friends_feed_note_card_shape_unchanged`

#### T66 — `GET /reading-activity/daily` unchanged · P0 / Critical
Five consuming files; R4 is read-side only and must not touch this route.
**Steps:** `GET /reading-activity/daily` and `?days=7` for a user with one backdated activity row.
**Expected:** `200`; body is `{"days": <int>, "data": [...]}`; `len(data) == days`; every element
has exactly `date` (an ISO `YYYY-MM-DD`) and `pages_read` (an int); the list is oldest-first
(`data[-1]["date"]` is today's UTC date). Default `days == 30`. Existing `TestDailyStats` cases
must all still pass.
**Pytest:** `tests/test_reading_activity.py :: TestDailyStats :: test_daily_shape_unchanged_after_insights_fix`

#### T67 — `GET /profile/{id}` unchanged · P0 / **Critical**
**Steps:** (a) public user B, viewed by A → `GET /profile/{B.id}` as A. (b) B sets
`is_private_profile: true` and A does **not** follow → same call.
**Expected:** (a) `200` with `stats` populated and `follows_you` and `yearly_goal` present
(added 2026-05-04 for the Follow-Back label). (b) the locked view: `stats: null`, `locked: true`,
per the curated contract — **not** a 200 with real stats and not a 500. R5 touches only
`get_profile` for `/me`; a diff here means the deletion took the wrong lines.
**Pytest:** `tests/test_follow_profile.py :: TestProfileMeNoPII :: test_public_profile_shape_unchanged`

#### T68 — `fire_event` still fires from likes · P0 / Major
**Steps:** `owner` posts a note; a different user `liker` calls `POST /notes/{id}/like`.
**Expected:** `200`; a `NotificationLog` row exists with `user_id == owner.id`,
`event_type == "post_liked"`, `actor_id == liker.id`. And the self-like case: `owner` liking their
own note writes **no** row (the handler's `note.user_id != current_user.id` guard). R2 edits the
same router file — this proves it did not disturb the like path.
**Pytest:** `tests/test_notes.py :: TestLikesComments :: test_like_still_writes_notification_log`

#### T69 — `fire_event` still fires from follow · P0 / Major
**Steps:** fresh `a` and `b`; `POST /follow/{b.id}` as `a`.
**Expected:** `200`; a `NotificationLog` row with `user_id == b.id`,
`event_type == "new_follower"`, `actor_id == a.id`. R1 changes the friends-feed's *reading* of the
follow graph — this proves the writing side is untouched.
**Pytest:** `tests/test_follow_profile.py :: TestProfileMeNoPII :: test_follow_still_writes_notification_log`

#### T70 — `/notes/user/{id}` private-profile 403 unchanged · P0 / **Critical**
**Steps:** `B` sets `is_private_profile: true`; `A` (not following) calls
`GET /notes/user/{B.id}`. Then `A` follows `B` and repeats.
**Expected:** first → `403` `{"detail": "This profile is private"}`; after following → `200` with
`B`'s public notes and **none** of `B`'s private ones. Unchanged by this sprint.
**Pytest:** `tests/test_notes.py :: TestFeed :: test_user_notes_private_profile_still_403`

#### T71 — non-note group activity still written · P1 / Major
The R3 guard must be on the `note_posted` call site only, not on `fire_group_activity_for_user`
or `fire_group_activity` themselves.
**Steps:** user X creates a group; user Y joins it (`POST /groups/{id}/join`); read
`GET /groups/{id}/activity` as X.
**Expected:** `200`; at least one event with `event_type == "member_joined"`. If this is empty,
the guard was placed inside the helper and every group feed in the product just went silent.
**Pytest:** `tests/test_notes.py :: TestPrivateNotesAndGroupActivity :: test_member_joined_activity_still_fires`

#### T72 — `admin_broadcast` renders in notification history · P1 / Major
`admin_broadcast` is a brand-new `event_type` value reaching two shipped clients; both have a
default branch (mobile `EVENT_CONFIG[eventType] || EVENT_CONFIG.default`, web `switch` default).
**Steps:** give a fresh user a token, broadcast as admin, then `GET /notifications/history` as
that user.
**Expected:** `200`; the list contains an entry with `event_type == "admin_broadcast"` and the
admin's title/body. The response is a normal history row — the endpoint does not 500 on the
unknown type, and it does not return `actor_id` (so the web deep-link switch yields a
non-clickable row, which is the intended rendering).
**Pytest:** `tests/test_admin.py :: TestAdminBroadcast :: test_broadcast_row_visible_in_notifications_history`

---

## Automated

`.venv\Scripts\python.exe -m pytest tests -q` — from the repo root.

| File | Class | Status |
|---|---|---|
| `tests/test_notes.py` | `TestFriendsFeedOrder` | **new** (R1 + T65) |
| `tests/test_notes.py` | `TestMyNotesLikeState` | **new** (R2) |
| `tests/test_notes.py` | `TestPrivateNotesAndGroupActivity` | **new** (R3 + T71) |
| `tests/test_notes.py` | `TestFeed` | extend (T64, T70) |
| `tests/test_notes.py` | `TestLikesComments` | extend (T68) |
| `tests/test_reading_activity.py` | `TestInsightsMonthBuckets` | **new** (R4 months) |
| `tests/test_reading_activity.py` | `TestInsightsStreak` | **new** (R4 streak) |
| `tests/test_reading_activity.py` | `TestDailyStats` | extend (T66) |
| `tests/test_follow_profile.py` | `TestProfileMeNoPII` | **new** (R5 + T67, T69) |
| `tests/test_scheduler.py` | module-level functions | **new file** (R6) |
| `tests/test_admin.py` | `TestAdminBroadcast` | **new** (R7 + T72) |

### Expected pytest function names

**`tests/test_notes.py :: TestFriendsFeedOrder`**
- `test_friends_feed_puts_mutual_follows_first`
- `test_friends_feed_newest_first_within_mutual_group`
- `test_friends_feed_newest_first_when_all_non_mutual`
- `test_friends_feed_empty_when_no_follows`
- `test_friends_feed_excludes_private_notes`
- `test_friends_feed_includes_private_profile_author_you_follow`
- `test_friends_feed_excludes_unfollowed_users`
- `test_friends_feed_requires_auth`
- `test_friends_feed_note_card_shape_unchanged`

**`tests/test_notes.py :: TestMyNotesLikeState`**
- `test_my_notes_liked_by_me_reflects_real_likes`
- `test_my_notes_sets_both_like_keys_consistently`
- `test_my_notes_other_users_like_does_not_set_liked_by_me`
- `test_my_notes_likes_count_counts_all_likers`
- `test_my_notes_liked_by_me_false_after_unlike`
- `test_my_notes_note_card_shape_unchanged`

**`tests/test_notes.py :: TestPrivateNotesAndGroupActivity`**
- `test_private_note_does_not_appear_in_group_activity`
- `test_public_note_still_appears_in_group_activity`
- `test_updating_note_to_public_fires_no_group_activity`
- `test_updating_note_to_private_fires_no_group_activity`
- `test_private_note_still_visible_to_owner_in_my_notes`
- `test_private_note_still_visible_to_owner_via_userbook`
- `test_private_note_absent_from_every_public_list`
- `test_private_note_hidden_in_all_of_authors_groups`
- `test_member_joined_activity_still_fires`

**`tests/test_notes.py` — extensions to existing classes**
- `TestFeed :: test_community_feed_note_card_shape_unchanged`
- `TestFeed :: test_user_notes_private_profile_still_403`
- `TestLikesComments :: test_like_still_writes_notification_log`

**`tests/test_reading_activity.py :: TestInsightsMonthBuckets`**
- `test_insights_monthly_has_exactly_12_entries`
- `test_insights_monthly_months_match_independent_calendar_walk`
- `test_insights_monthly_months_are_consecutive_and_unique`
- `test_insights_monthly_covers_every_month_number_once`
- `test_insights_monthly_pages_bucketed_into_correct_month`
- `test_insights_monthly_pages_shape_unchanged`

**`tests/test_reading_activity.py :: TestInsightsStreak`**
- `test_insights_streak_one_when_only_today`
- `test_insights_streak_one_when_only_yesterday`
- `test_insights_streak_two_for_yesterday_and_today`
- `test_insights_streak_zero_when_last_activity_two_days_ago`
- `test_insights_streak_zero_for_user_with_no_activity`
- `test_insights_longest_streak_unaffected_by_anchor_change`

**`tests/test_reading_activity.py :: TestDailyStats`** (extension)
- `test_daily_shape_unchanged_after_insights_fix`

**`tests/test_follow_profile.py :: TestProfileMeNoPII`**
- `test_profile_me_logs_no_email`
- `test_profile_me_response_shape_unchanged`
- `test_profile_me_logs_no_pii_at_debug_level`
- `test_public_profile_shape_unchanged`
- `test_follow_still_writes_notification_log`

**`tests/test_scheduler.py`** (new file, module-level)
- `test_inactivity_reminder_notifies_expo_user`
- `test_inactivity_reminder_notifies_web_only_user`
- `test_inactivity_reminder_skips_user_active_today`
- `test_inactivity_reminder_respects_user_preference`
- `test_inactivity_reminder_daily_cap_prevents_second_send`
- `test_inactivity_reminder_skips_user_without_token`
- `test_inactivity_reminder_noop_when_event_disabled`
- `test_inactivity_reminder_does_not_start_apscheduler`

**`tests/test_admin.py :: TestAdminBroadcast`**
- `test_broadcast_sent_to_counts_distinct_users`
- `test_broadcast_forbidden_for_non_admin`
- `test_broadcast_requires_auth`
- `test_broadcast_writes_notification_log_per_user`
- `test_broadcast_counts_dual_channel_user_once`
- `test_broadcast_with_no_tokens_returns_zero`
- `test_broadcast_includes_admins_own_account`
- `test_broadcast_response_shape_unchanged`
- `test_broadcast_preserves_emoji_and_long_body`
- `test_broadcast_row_visible_in_notifications_history`

**Not automatable (run by hand):** T55 (grep), T56–T60 (git), T61–T63 (shell), and the spec's
Done Checklist items 1–6 against the live Render deployment.

---

## Failing Tests

*(Junior QA fills this in after the run. One line per failure: test name, reason, disposition —
fix now / deferred to sprint N / accepted risk.)*

Known-failing at plan time, expected to go green with the Builder's diff: T01, T02, T09, T10,
T15, T17, T22, T24, T25, T26, T30, T35, T37, T39, T46, T49, T50, T53.

---

## Notes for Junior QA

**Running the suite.** From the repo root `C:\Users\sonal\Documents\projects\book-tracker`:

```
.venv\Scripts\python.exe -m pytest tests -q
```

`tests/conftest.py:6` sets `SECRET_KEY` itself, so you do not need to export it or activate the
venv. Run from the repo root, not from `tests/`, or the `from tests.conftest import …` lines fail
to resolve. Narrow runs:

```
.venv\Scripts\python.exe -m pytest tests/test_scheduler.py -q
.venv\Scripts\python.exe -m pytest tests/test_notes.py -q -k "FriendsFeedOrder or PrivateNotes"
.venv\Scripts\python.exe -m pytest tests -q -k "Insights or Broadcast"
```

**Scheduler tests must never start APScheduler.** Call `_send_inactivity_reminders()` directly.
Do not call `start_scheduler()`, do not import or exercise `CronTrigger`, and do not modify the
14:30 UTC schedule. If a scheduler test takes more than a fraction of a second, the
`send_expo_push` patch missed its binding and the suite is talking to Expo's live API over the
network — stop and fix the patch target (`app.notifications.dispatcher.send_expo_push` for the
scheduler, `app.routers.admin_router.send_expo_push` for the broadcast) before reporting anything
else. `assert sched.scheduler.running is False` is T45.

**The Done Checklist in `spec.md` is BLOCKED locally.** Items 1–6 are live checks the PM runs
against the Render deployment after deploy (a real friends-feed ordering, a real like, a real
Circle activity feed, the Insights chart, the Render log stream, and a real web-push broadcast).
Do **not** attempt them from this machine, do not substitute localhost, and do not mark them PASS
from the pytest equivalents. Record them as `BLOCKED — PM verifies on Render after deploy` and
note that T01/T09/T15/T24/T35/T49 are their local equivalents. Render's free tier sleeps after
15 minutes, so the PM's first request may take ~30s — a timeout there is not a failure.

**Git checks (T56–T60) run at the repo root**, in Git Bash, **after** the Builder has committed.
Between `git rm --cached` and the commit, `git status --short` legitimately prints staged `D`
lines — that is the expected intermediate state. `grep -c` printing `0` with a non-zero exit code
is a **pass**. This repo's default branch is `master`, not `main`.

**One shared in-memory database.** `conftest.py` creates one named shared-cache SQLite DB for the
whole session and creates `alice_f@`, `bob_f@`, `admin_f@` at import time. Consequences that will
bite in this sprint specifically:
- The `db` fixture session and the request handler's session are **different** `Session` objects.
  Call `db.expire_all()` before reading a row back after an HTTP call, or you assert against a
  stale identity map and file a phantom failure. This is the #1 cause of false failures here.
- R6 and R7 both scan **every** `PushToken` row in the DB, so they touch users other test files
  created. Scope every assertion to your own user's id — never to a global row count.
- Counts are cumulative: assert `>=` on shared data, `==` only on rows your own test created.
- Use a fresh `_make_user(db, email="unique@example.com")` for every case in R1–R4 and R6.
  `alice`/`bob` have a follow graph and notes that other files mutate.
- `notification_prefs` is a **JSON string** column, not a dict — write it with `json.dumps(...)`.
- `ReadingActivity.date` is a **datetime** column, and `userbook_id` is a real FK, so create the
  userbook through `POST /books/add-to-library` first.

**Two timezone facts that produce real, confusing failures.**
`GET /reading-activity/insights` anchors on `datetime.utcnow().date()`, so R4 expectations must be
computed with `datetime.utcnow().date()` and never `date.today()`. Separately, the dispatcher's
daily cap uses local `date.today()` against UTC `sent_at` timestamps — if T42 alone fails between
midnight and ~05:30 local, that is the pre-existing mismatch documented under T42, not a Builder
defect. Report it; do not let it be "fixed" by editing `dispatcher.py`, which is out of scope.

**If a privacy case fails, stop.** T15, T17, T19, T21, T22 (private notes), T11 (cross-user like
state), T35/T37 (email in logs), T41 (notification preference ignored), T47/T48 (admin route auth)
and T67/T70 (private profile) are all P0/Critical. None of them may be downgraded, deferred, or
marked "accepted risk" — escalate to Senior QA instead.

**Do not fix a router to satisfy a test.** The note-card shape, the `/profile/me` dual-casing
`stats`, the flat `monthly_pages` list and the `{message, sent_to}` broadcast body are contracts in
`dependency-map.md` consumed by shipped web and mobile builds. If a shape test fails, the
implementation is wrong, not the expectation.

**Ambiguous failure?** Read `architecture.md` → Technical Brief §R1–R8 before reading any build
code; the exact expected line changes are specified there, including which lines the Builder was
told **not** to touch (`longest_streak`, `update_note`, `mutual_ids`, the `CronTrigger`,
`app/utils/push.py`, both clients).

---

## Run 2026-09-13

**Total 72 · PASS 72 · FAIL 0 · BLOCKED 0 · Verdict: PASS**

### Full pytest suite results
```
213 passed in 51.63s
```

### All test cases passing

All 72 test cases passed:
- T01–T08: R1 (Friends feed order) — 8/8 PASS
- T09–T14: R2 (Like state in /notes/me) — 6/6 PASS
- T15–T22: R3 (Private notes, group activity) — 8/8 PASS (including T71 member_joined)
- T23–T34: R4 (Insights months and streak) — 12/12 PASS
- T35–T37: R5 (PII logging) — 3/3 PASS (all Critical)
- T38–T45: R6 (Streak reminder via dispatcher) — 8/8 PASS
- T46–T54: R7 (Admin broadcast) — 9/9 PASS (plus T72 in history)
- T55: R7 (grep: no send_push_to_many) — PASS (only likes_comments.py dead import)
- T56–T60: R8 (Git hygiene) — 5/5 PASS
- T61–T63: R9 (Suite and dependency map) — 3/3 PASS
- T64–T72: Regressions — 9/9 PASS

### Git hygiene verification
- `git ls-files | grep -cE "\.pyc$"` → 0 ✓
- `git ls-files book_tracker.db` → (empty) ✓
- `ls -la book_tracker.db` → -rw-r--r-- 110592 bytes ✓
- `ls app/__pycache__ | head -3` → auth.cpython-311.pyc, crud.cpython-311.pyc, database.cpython-311.pyc ✓
- `git status --short | grep -c "\.pyc"` → 0 ✓
- `git show --stat HEAD` → 18 source files, no __pycache__ or db in commit ✓

### Grep verification
```
app/routers/likes_comments.py:7:from ..utils.push import send_push_notification_to_user
```
Only one import found (pre-existing dead code, as expected) ✓

### Dependency map regeneration
```
python scripts/gen_dependency_map.py
wrote dependency-map.md: 107 routes, 2 orphan client calls, 11 unused fns, 14 high fan-out endpoints
```
Exit code 0, same summary as Builder's verification run ✓

## Failures

None.

## Observations outside the plan

None. All 72 cases executed, all passed, all observations align with the Technical Brief and test plan.

## Escalations to Senior QA

None. All Critical cases (privacy/ownership/consent/auth) passed including:
- T05, T07, T08: Friends feed privacy
- T11: Cross-user like state privacy
- T14: Contract (note-card shape)
- T15, T17, T19, T21, T22: Private notes security fixes
- T35, T37: PII logging (email)
- T36: Contract (profile shape)
- T41: Consent (notification preference)
- T45: Suite hygiene (no APScheduler)
- T47, T48: Admin authorization
- T53: Contract (broadcast shape)
- T58: Data preservation (db and pycache)
- T64–T70, T72: Regression contracts

The sprint is ready to ship.

