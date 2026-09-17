---
screen: sprint-4a-platform-audit
feature: maintenance
repo: api + web
status: architecture-complete
spec_status: APPROVED (PM — full-platform audit request 2026-09-13; extended by PM decisions, live probes and the 4B contract request the same day)
architect_verified: 2026-09-13 (code read at 8c44198 + working tree)
---

## Risk Summary (for PM)

- **What changes.** About 35 fixes on the API and website:
  - **Privacy:** strangers can no longer like or comment on private notes; pushes stop following a shared device; the old password login is gone.
  - **Broken actions:** settings save again, "remove book" works, and server errors reach the browser.
  - **Speed:** the Home feed drops from 9 s to about 1–2 s, and actions stop waiting for push delivery.
  - **Behaviour:** new notes are private unless Public is picked (the switch remembers the last choice); circle and admin danger buttons ask first; logged-out visitors get 2 Google searches a day.
- **Your actions, in this order:**
  1. Run the F-53 duplicate-cleanup SQL in Supabase (steps 1, then 2, then 3) **before** the backend deploy.
  2. Deploy the backend.
  3. Deploy the website.
  4. Run F-16 repair part (a) only, and send me the count.
- **What users will notice.** On Android 2.2.1, notes written on the **book detail** screen become private, with no toggle until 2.2.2; Feed and Profile posts stay public. Web secondary text is darker, and tiny labels grow to 12 px.
- **Could break:**
  - Someone with notifications on in two browsers now gets pushes in both.
  - Invalid "update book" values are rejected; every current web and Android call was checked and passes.
  - Android search tiles with no cover show blank until 4B.
  - "Make Admin", which has silently never worked, now works (the allowlist still applies). **PM, please note:** the orchestrator chose to fix it by default (2026-09-13). Say so if you would rather keep the button disabled.
  - A notification lands a moment after the action instead of before the response.
- **Honest limits:**
  - The anonymous search count resets when Render sleeps. It counts each visitor by the address Render's proxy records, which a caller cannot forge; people sharing one network (an office, a school) share the 2 searches.
  - Feed and rating saves stay 1–3 s until the region check (F-28).
- **No response field is removed or renamed.** The three contracts Sprint 4B was waiting on are defined below. Recommendation: approve. All open questions are resolved (orchestrator defaults, 2026-09-13), so nothing blocks the build.

---

## Data Flow

**Reads.** The note lists fetch their page, then batch-load authors, userbooks and books with three `IN()` queries instead of lazy-loading per note. Book-bearing responses add `google_books_id` / `isbn` / `total_pages`: note cards, recommendations, friends-reading and circle `current_book`.

**Writes.**
- Web `BookPreviewModal` and `LibraryPage` forward the dedup keys to `POST /books/add-to-library`. It matches `book_id`, then `google_books_id`, then `isbn` before creating a Book.
- These writes gain guards:
  - like and comment check note visibility
  - `PATCH` userbook validates through a Pydantic model
  - list parameters are bounded
  - unique indexes stop duplicates, and the handler returns the existing contract
  - deletes clear FK dependents
  - prefs `PATCH` merges into the stored JSON
  - `POST /notifications/{id}/read` marks one row
- After the main commit, `fire_event` and group-activity writes are scheduled on `BackgroundTasks`, so they run after the response is sent.

**Push.**
- Registering a token or endpoint removes it from any other user first.
- Web logout calls `DELETE /notifications/web-unsubscribe` with the token captured before it is cleared.
- The service worker maps `data.type` to a URL.

**Errors and headers.** An unhandled exception becomes a JSON 500 inside the CORS layer, and every response gains security headers.

**Google Books.** An anonymous caller is counted in an in-process dict keyed by a salted IP hash.

**Data.** F-16 is SQL the PM runs by hand. F-53 is a migration appendix the PM runs before deploy.

## depends_on
- **`app/deps.py`**: `get_current_user` and `get_current_user_optional` (unchanged). `get_current_user` costs 1 SELECT, plus an UPDATE once per day for `last_active`. This matters for the F-08 query targets.
- **`app/notifications/dispatcher.py :: fire_event`** (unchanged):
  - Per recipient: `db.get(User)` for prefs, the daily-cap query when configured, the expo token query plus the Expo HTTP publish, the web token query plus the web-push HTTP call, and a log row. One commit at the end.
  - `data` = `{"type": event_type, "actor_id", **extra}`. `push_web.send_web_push` sends `{"title", "body", **data}`, and that is what `sw-push.js` receives.
- **`app/group_activity.py`** (unchanged): `fire_group_activity_for_user` = 1 memberships query + 1 commit; `fire_group_activity` = 1 insert + commit.
- **Stack, verified in `.venv`:** Pydantic 1.10.24, FastAPI 0.95.2, SQLModel 0.0.8, SQLAlchemy 1.4.41, Starlette 0.27.0.
  - `requirements.txt` (UTF-16 encoded) pins `fastapi==0.95.2`, which requires `pydantic<2`, so production is v1 too.
  - **Every snippet here uses v1 APIs:** `.dict(exclude_unset=True)`, `__fields_set__`, `conint`, `root_validator`. Never `model_dump` / `model_fields_set` / `model_validate`; that is F-49.
  - The system Python on this machine has Pydantic 2.11. Run tests from `.venv`.
  - **FastAPI 0.95 runs `BackgroundTasks` before a `yield` dependency's exit code**, so the request's `db` Session is still open inside background tasks. F-59 relies on this. Versions ≥ 0.106 changed it (see Assumptions).
- **`tests/conftest.py`:**
  - One shared-cache in-memory SQLite `engine`; `create_all` runs at import.
  - Users come from `crud.create_user` + `auth.create_access_token({"sub": email})` (lines 44-63). **No dependency on `/auth/signup` or `/auth/login`**, verified.
  - The shared `client` is `TestClient(app, raise_server_exceptions=True)`. Starlette's TestClient runs background tasks before the call returns, so F-59 tests stay deterministic.
- **Web:**
  - React Router DOM 7 `BrowserRouter` (`main.jsx:18`) stores `window.history.state.idx`.
  - `ToastProvider` wraps `App` (`main.jsx:19-22`).
- **PM migration workflow:** `context/supabase_migration.sql` runs in the Supabase SQL Editor before a `models.py` change ships.

## depended_by
Consumers come from `dependency-map.md` (the generated table and "UI actions → API"). "Additive" means keys only added; nothing removed, renamed or retyped.

### Response-shape changes (all additive)
| Change | Endpoint(s) | Web consumers | Android consumers | Removed / renamed? |
|---|---|---|---|---|
| F-07: note `book` + `google_books_id`, `isbn`, `total_pages` | `GET /notes/feed`, `/friends-feed`, `/me`, `/user/{id}` | `pages/HomePage.jsx`, `pages/ProfilePage.jsx`, `pages/UserProfilePage.jsx` | `App.js` (preload `feed`, `notes`), `FeedScreen.js`, `ProfileScreen.js`, `UserProfileScreen.js` | No. Shape tests `test_notes.py:112,331,420` check presence only |
| F-07: + `google_books_id`, `isbn` (`total_pages` exists) | `GET /books/recommendations` | `HomePage.jsx` | `FeedScreen.js` | No |
| F-07 + F-33: `book` + `google_books_id`, `isbn`; `user` + `profile_picture` | `GET /userbooks/friends/currently-reading` | `HomePage.jsx` | `FeedScreen.js` (reads `user.profile_picture` at `:524`) | No |
| F-07: `current_book` + `google_books_id`, `isbn`, `total_pages` | `GET /groups/{id}`, `POST /groups/`, `PUT /groups/{id}` (`_serialize_group`); `PUT /groups/{id}/book` response | `GroupDetailPage.jsx`, `CreateGroupPage.jsx` | `GroupDetailScreen.js`, `GroupsScreen.js` | No |
| F-15: + `reading_goal`, `pages_read_total` | `GET /groups/{id}` only | `GroupDetailPage.jsx` (ignores) | `GroupDetailScreen.js:764-773` | No |
| F-13/F-14: + `average_rating`, `books_this_year`, `yearly_goal.finished`, `projected_finishes[].projected_finish_date` | `GET /reading-activity/insights` | `InsightsPage.jsx`, `ProfilePage.jsx` | `App.js` (preload `insights`), `InsightsScreen.js`, `ProfileScreen.js` | No. `test_insights_returns_correct_shape` checks presence; the strict `monthly_pages` key-set test (`:279`) is untouched |
| F-26: + `push_subscribed_users` | `GET /admin/stats` | `AdminPage.jsx` | — | No |
| F-58: the 500 body becomes JSON `{"detail": "Internal Server Error"}` (was Starlette's plain text) | any route, on an unhandled exception | `apiFetchRaw` reads `detail` | axios `e.response.data.detail` | Nothing removed; the body is now readable because CORS headers are present |
| F-23: new route | `POST /notifications/{id}/read` → `{id, is_read}` | `NotificationsPage.jsx` (B1) | 4B `NotificationsScreen.js` | New |

### Request, behaviour and status-code changes (each verified against callers)
| Change | Endpoint | Callers verified | Result |
|---|---|---|---|
| F-01: routes removed | `POST /auth/signup`, `POST /auth/login` | Generated rows 106-107: web —, mobile —. 0 references in `qa/`, `scripts/` or either client. `tests/test_auth.py` only | Safe. `main.py:28` `oauth2_scheme(tokenUrl="auth/login")` is referenced nowhere; removed in A2 |
| F-17: default `is_public` becomes private | `POST /notes/` | **Web:** `HomePage.jsx:386` explicit true; `BookDetailPage.jsx:218` explicit; `LibraryPage.jsx:401` explicit, inside the dead `BookDetailPanel`; `ProfilePage.jsx:147` omits (B2 adds a toggle). **Android 2.2.1:** `FeedScreen.js:214,229` explicit true; `ProfileScreen.js:223` explicit true; **`BookDetailScreen.js:172` omits → private**. **Other:** `editorial_bot.py:293` inserts SQL with `is_public=True`; `seed_review_accounts.py` explicit | Intended. The Android book-detail change is PM-accepted |
| F-17: `PUT` without `is_public` keeps visibility | `PUT /notes/{id}` | `HomePage.jsx:95` `{text}`; `ProfilePage.jsx:326` `{text, quote}`; Android `ProfileScreen.js:221` `{text, quote}` | Also fixes a latent bug: today the schema default `True` makes a private note public on every edit |
| F-52: validation | `PATCH /userbooks/{id}` | **Web:** `BookDetailPage.jsx:158` `{status}`; `:203` `{rating: stars}` (0 = "Rating removed"); `LibraryPage.jsx:340,385` (dead panel). **Android:** `BookDetailScreen.js:101` `{status, current_page, total_pages?}` (`total_pages` only when truthy); `:164` `{rating: stars}` | All pass: rating 0 accepted as clear; `current_page` null accepted |
| F-51: bounds 1..200 (422 outside) | `limit` / `days` | **Web:** `getMyActivity(7\|30)`, `getUserActivity(30\|90)`, feed 50, admin 50/100. **Android:** feed and friends-feed 50, friends-reading 10, activity 30/90 (`UserProfileScreen.js:47`) | All in range |
| F-29: anonymous 401 `login_required` | `GET /api/googlebooks/search`, `/book/{id}` | **Web:** `AppTour.jsx`, `GroupDetailPage.jsx`, `LibraryPage.jsx`, `SearchPage.jsx`. **Android:** `AppTour.js`, `GroupDetailScreen.js`, `LibraryScreen.js` (plus the unreachable `OnboardingScreen.js`, `SearchScreen.js`) | All logged-in, and all send a Bearer token (web `apiFetchRaw:48`, Android interceptor `api.js:15`), so unlimited. An expired token counts as anonymous |
| F-19: `cover_url: null` without images | same | Web `SearchPage.jsx:24`, `LibraryPage.jsx:51`, `HomePage.jsx:560` render the fallback | Android `LibraryScreen.js:341` shows a blank tile until 4B |
| F-54: `start_index` ≥ 1000 returns an empty page | `/api/googlebooks/search` | Web `LibraryPage.jsx:179`, `SearchPage.jsx:204` pass `next_start_index` | `has_more` goes false first |
| F-02: 403/404 | `/notes/{id}/like`, `/notes/{id}/comments` | Web `HomePage.jsx`, `UserProfilePage.jsx`; Android `FeedScreen.js`, `ProfileScreen.js`, `UserProfileScreen.js` | Those screens only show notes the caller can see |
| F-03: `web-subscribe` requires `subscription.endpoint` (400 otherwise) | `POST /notifications/web-subscribe` | `AuthContext.jsx`, `NotificationsPage.jsx` send `PushSubscription.toJSON()` | Always has `endpoint` |
| F-06/F-49: merge | `PATCH /notifications/prefs` | `SettingsPage.jsx` full body; `SettingsScreen.js:218` partial | Both work (500 today) |
| F-18: null clears | `PUT /profile/me` (8 files) | `SettingsPage.jsx:205` and `SettingsScreen.js:169` send null only when the field is empty; both prefill from the profile (`:160`, `:154`). `ProfilePage.jsx:234` sends `{name, bio}` (no goal key). `AppTour.jsx:155`, `OnboardingPage.jsx:51`, Android `AppTour.js:220`, `OnboardingScreen.js:86` send positive values. Avatar and privacy saves send no goal key | Safe |
| F-53: duplicate race | `POST /books/add-to-library` (12), `POST /userbooks/`, `POST /notes/{id}/like` (5), `POST /follow/{id}` | — | The loser gets today's sequential-duplicate response |
| F-50: delete succeeds | `DELETE /userbooks/{id}`, `DELETE /groups/{id}`, `POST /auth/delete-account/me` | — | 500 becomes 200/204 |
| F-59: notification and activity rows written after the response | every endpoint listed under F-59 | Nothing reads a *recipient's* notification in the actor's request. The web and Android unread-badge polls see the row on their next poll | Timing only |
| F-56/F-58: headers | every response | — | Additive |

## API Endpoints Used
| Method | Path | Auth | Items | Change |
|---|---|---|---|---|
| POST | `/auth/signup`, `/auth/login` | none | F-01 | **Removed** |
| POST | `/auth/delete-account/me` | user | F-50 | FK cleanup |
| POST / DELETE | `/notes/{id}/like` | user | F-02, F-53, F-59 | Visibility; IntegrityError → "Already liked"; push after response |
| POST / GET | `/notes/{id}/comments` | user | F-02, F-59 | Visibility; push after response |
| POST | `/follow/{id}` | user | F-53, F-59 | IntegrityError → 400; push after response |
| POST | `/push-tokens/` | user | F-03 | Reassign the token from other users |
| POST | `/notifications/web-subscribe` | user | F-03 | Upsert by endpoint across users; keep the user's other endpoints |
| DELETE | `/notifications/web-unsubscribe` | user | F-03 | Match the caller's row by endpoint |
| POST | **`/notifications/{id}/read`** | user (owner) | F-23 | **New** |
| PATCH | `/notifications/prefs` | user | F-49, F-06 | v1 `.dict`, merge |
| GET | `/notifications/history` | user | F-51 | `limit` bound |
| GET | `/notes/feed` | optional | F-07, F-08, F-51 | Batching, keys, bound |
| GET | `/notes/friends-feed`, `/notes/me` | user | F-07, F-08, F-51 | Same |
| GET | `/notes/user/{id}`, `/notes/userbook/{id}` | user | F-07 (user only), F-08 | Batching |
| POST / PUT | `/notes/`, `/notes/{id}` | user | F-17, F-59 | Private default; update keeps visibility; group activity after response |
| POST | `/notes/upload-image`, `/profile/me/picture` | user | F-55 | 400 on empty or rejected image |
| PUT | `/profile/me` | user | F-18 | `yearly_goal` null/0 clears |
| POST | `/books/add-to-library` | user | F-07, F-53, F-59 | Optional `book_id`; race → 400; `book_added` after response |
| GET | `/books/recommendations`, `/books/search` | user | F-07, F-51 | Keys; bound |
| GET | `/userbooks/friends/currently-reading` | user | F-07, F-33, F-51 | Keys; bound |
| POST | `/userbooks/` | user | F-53, F-59 | Race → 400; event after response |
| PUT | `/userbooks/{id}/progress`; POST `/userbooks/{id}/finish` | user | F-59 | Events and activity after response |
| PATCH | `/userbooks/{id}` | user | F-52, F-59 | Pydantic v1 model; events after response |
| DELETE | `/userbooks/{id}` | user | F-50 | Delete `reading_activity`; null `group_post.userbook_id` |
| POST / GET / PUT | `/groups/`, `/groups/{id}` | user | F-07, F-15 | Alias; keys; goal fields on GET |
| PUT | `/groups/{id}/book` | curator | F-07, F-59 | Response keys; activity after response |
| POST / DELETE | `/groups/{id}/join`, `/approve/{uid}`, `/reject/{uid}`, `/invite/{uid}`, `/accept` | user / curator | F-59 | Events and activity after response |
| DELETE | `/groups/{id}` | creator | F-50 | Delete `group_activity` |
| GET | `/groups/{id}/activity` | member | F-51 | `limit` bound |
| GET | `/groups/{id}/goal` | member | — | **Unchanged** (4B contract) |
| GET | `/reading-activity/insights` | user | F-13, F-14 | Aliases |
| GET | `/reading-activity/daily`, `/user/{id}/daily` | user | F-51 | `days` bound |
| GET | `/api/googlebooks/search`, `/book/{id}` | **optional + anonymous quota** | F-19, F-29, F-54 | Null cover; quota; clamp and 502 |
| GET | `/admin/stats` | admin | F-26 | + `push_subscribed_users` |
| GET | admin list routes | admin | F-51 | `limit` bound |
| * | every response | — | F-56, F-58 | Security headers; JSON 500 with CORS |

**Route changes:** one route is added (`POST /notifications/{id}/read`) and a pair is removed. No auth level changes; the Google Books routes stay public (PM decision) with a quota.

## DB Tables Touched
| Table | Operation | Ownership / privacy rule enforced |
|---|---|---|
| `note` | read (F-02, F-08); create default (F-17) | F-02: for a non-owner, `is_public=false` → 404, and a private-profile author not followed → 403 |
| `like`, `comment` | write (F-02, F-53) | Only on viewable notes; unique `(note_id, user_id)` |
| `follow` | write (F-53) | Unique `(follower_id, followed_id)` |
| `pushtoken` | write (F-03) | Every query filters `token_type`. Register/subscribe deletes the same token/endpoint from **other** users. Unsubscribe deletes only `user_id == current_user.id` |
| `notificationlog` | update `is_read` (F-23); written after response (F-59) | F-23: `log.user_id == current_user.id`, else 404 |
| `user` | write (F-18); delete (F-50 account) | Own row |
| `userbook` | write (F-52); delete (F-50); unique (F-53) | `ub.user_id == current_user.id`, else 404 (unchanged) |
| `reading_activity` | delete (F-50) | Only for a userbook the caller owns |
| `group_post` | `userbook_id = NULL` (F-50) | Only rows referencing the caller's deleted userbook(s) |
| `group_activity` | delete (F-50); written after response (F-59) | Only groups the caller created, or rows by the deleted user |
| `group_member` | delete pending invites sent by, or null `invited_by` for, a deleted account (F-50) | Only rows referencing the deleted user |
| `book` | read (F-07 `book_id` match) | Global catalogue, same access as `/books/search` |
| `notificationlog`, `group_activity` | read-only evidence (F-16 SQL, run by the PM) | — |

**Migration: YES, flagged.** F-53 appends dedupe and unique-index steps to `context/supabase_migration.sql`, and adds `__table_args__` to `app/models.py` for `UserBook`, `Like` and `Follow`. No columns are added. Deploying the model change before the index exists does not crash, because SQLAlchemy never checks constraints at query time. But the race stays open until the indexes exist, so **the PM runs the migration first**.

**Repair script: flagged.** `context/repairs/2026-09-rating-reset-repair.sql` is new and run by hand, in parts.

## Notifications Fired
| event_type | recipients | extra keys the template needs |
|---|---|---|
| none new | — | F-02 **prevents** `post_liked`/`post_commented` on non-visible notes. F-53 fires nothing on the losing duplicate. F-59 changes *when* existing events fire, not *what*: same event types, same `extra` (built from values captured in the request), same recipients. F-16 is SQL, so it fires nothing. `config.py` is unchanged. |

## Cross-Client Impact
- **Android 2.2.1 (no build) benefits on backend deploy:**
  - F-06/F-49: settings toggles save
  - F-07: Feed-card adds reuse books that have `google_books_id`
  - F-13/F-14: Insights numbers
  - F-15: circle goal card
  - F-18: clearing the goal
  - F-33: friend avatars
  - F-50: remove book
  - F-53: no duplicates
  - F-58: error messages readable
  - F-59: faster actions
  - F-02/F-03 server-side protections
  - F-08: feed speed
- **Android 2.2.1 visible regressions until 4B:**
  - F-17: book-detail notes become private
  - F-19: blank no-cover search tiles
- **Web:** packages B1, B2, C. **The backend deploys first** (see the execution plan).
- **No `app.json` bump in 4A.** 2.2.2 / versionCode 61 is Sprint 4B, built after this backend is live.

---

# Technical Brief

Conventions for every snippet:
- Pydantic **v1** only
- batched `IN()` lookups
- no raw SQLModel in responses
- no new `print` or log line containing an email, token, endpoint, IP or query string

## Package A1 — API: social, notes, push, auth, profile, notifications

### F-02 · `app/routers/likes_comments.py`
```python
def _assert_can_view_note(db: Session, note: models.Note, user: models.User) -> None:
    """Same rule as the feeds: owner always; otherwise the note must be public and a
    private-profile author must be followed. 404 hides a private note's existence."""
    if note.user_id == user.id:
        return
    if not note.is_public:
        raise HTTPException(status_code=404, detail="Note not found")
    author = db.get(models.User, note.user_id)
    if author and getattr(author, "is_private_profile", False):
        follows = db.exec(select(models.Follow).where(
            models.Follow.follower_id == user.id,
            models.Follow.followed_id == note.user_id,
        )).first()
        if not follows:
            raise HTTPException(status_code=403, detail="This profile is private")
```
- **`like_note`:** call it right after the 404 check (`:23`).
- **`create_comment`:** call it after the 404 check (`:100`) and **before** the insert.
- **`get_comments`:** replace the inline private-profile block (`:139-150`) with one call.
- **`unlike_note`:** unchanged; it only removes the caller's own like.
- Leave the unused `send_push_notification_to_user` import (sprint-2 decision).

### F-53 (handler half) · `likes_comments.like_note`, `app/routers/follow_router.py :: follow_user`
`from sqlalchemy.exc import IntegrityError`.
- **Like:** `try: db.add(like); db.commit()` then `except IntegrityError: db.rollback(); return {"message": "Already liked", "liked": True}`. This returns before any notification is scheduled.
- **Follow:** the same wrap, with `except IntegrityError: db.rollback(); raise HTTPException(status_code=400, detail="Already following")`.
- The existing pre-checks stay and cover sequential duplicates. The except covers the race.

### F-59 (A1 call sites) · `likes_comments.py`, `follow_router.py`, `notes_router.py`
Import `BackgroundTasks` from `fastapi`, and add `background_tasks: BackgroundTasks` to each handler's signature. Replace the direct call with a scheduled one. Arguments are evaluated at scheduling time, so pass plain values, never lazy ORM attributes:
```python
background_tasks.add_task(
    fire_event,
    db=db, event_type="post_liked", actor_id=current_user.id, actor_name=liker_name,
    recipient_ids=[note.user_id], extra={"note_id": note_id},
)
```
- **`like_note`** (`:43`) and **`create_comment`** (`:111`): as above.
- **`follow_user`** (`:41`): as above, with `recipient_ids=[followed_id]`.
- **`create_note`** (`:150-156`): compute `book_title` in the request. It is identity-mapped, because the response builder loads `note.userbook.book` anyway. Then `background_tasks.add_task(fire_group_activity_for_user, db, current_user.id, "note_posted", {"note_id": note.id, "book_title": book_title})`, still inside `if is_public:`.
- `notifications/router.test_fire_event` (admin tool) stays synchronous, because its response includes the result.

### F-03 (api) · `app/routers/push_router.py :: register_push_token`
After prefix validation, before the `existing` lookup:
```python
    # A device token belongs to exactly one account: the one that registered it last.
    # Without this, a shared phone keeps delivering account A's pushes after B logs in.
    for row in db.exec(select(models.PushToken).where(
        models.PushToken.token == payload.token,
        models.PushToken.token_type == "expo",
        models.PushToken.user_id != current_user.id,
    )).all():
        db.delete(row)
```
- The rest is unchanged: one expo row per user, update-or-insert, and a single `db.commit()`.
- `deregister_push_token` is unchanged; 4B calls it.

### F-03 (api) · `app/notifications/router.py :: web_subscribe`, `web_unsubscribe`
The subscription is stored as `json.dumps(subscription)`, and key order and `expirationTime` can vary between calls. So **match on `endpoint`**:
```python
def _web_rows_for_endpoint(db: Session, endpoint: str, user_id: Optional[int] = None):
    q = select(models.PushToken).where(
        models.PushToken.token_type == "web",
        models.PushToken.token.contains(endpoint, autoescape=True),   # coarse LIKE '%…%', escaped
    )
    if user_id is not None:
        q = q.where(models.PushToken.user_id == user_id)
    rows = []
    for row in db.exec(q).all():
        try:
            if json.loads(row.token).get("endpoint") == endpoint:   # exact check
                rows.append(row)
        except (ValueError, TypeError, AttributeError):
            continue
    return rows
```
**`web_subscribe`:**
1. Read `endpoint = payload.subscription.get("endpoint")`. If it is falsy, return `400 "subscription.endpoint is required"`.
2. Delete `_web_rows_for_endpoint(db, endpoint)`, for every user.
3. Insert the caller's row and commit once.
4. **Delete the existing "remove all this user's web tokens" loop (`:62-70`).** With F-27 re-registering on every load, that loop would make a user's two browsers evict each other. Stale rows self-clean on 410 in `send_web_push`.

**`web_unsubscribe`:** delete `_web_rows_for_endpoint(db, endpoint, user_id=current_user.id)`. The response is unchanged.

### F-49 + F-06 · `app/notifications/router.py :: update_prefs`
```python
    try:
        stored = json.loads(user.notification_prefs) if user.notification_prefs else {}
    except (json.JSONDecodeError, TypeError):
        stored = {}
    if not isinstance(stored, dict):
        stored = {}
    merged = {k: stored.get(k, True) for k in USER_PREF_KEYS}
    merged.update(prefs.dict(exclude_unset=True))    # Pydantic v1: only the keys the client sent
    merged["book_added"] = merged["book_completed"]   # book_added follows book_completed
    user.notification_prefs = json.dumps(merged)
    db.add(user)
    db.commit()
    return {k: merged[k] for k in USER_PREF_KEYS}
```
- `NotificationPrefs` is unchanged: v1 ignores extra keys by default.
- **Why the tests missed it:** no test calls `PATCH /notifications/prefs`. The only `prefs` references in `tests/` are in `test_scheduler.py`, which writes the JSON directly.

### F-23 · `app/notifications/router.py` (new route)
Place it after `mark_all_read`. Its path has two segments after the prefix, so it cannot collide with `POST /notifications/mark-read`:
```python
@router.post("/{notification_id}/read", status_code=status.HTTP_200_OK)
def mark_one_read(
    notification_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Mark one notification read. Idempotent. 404 for rows that are not the caller's."""
    log = db.get(models.NotificationLog, notification_id)
    if not log or log.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Notification not found")
    if not log.is_read:
        log.is_read = True
        db.add(log)
        db.commit()
    return {"id": log.id, "is_read": True}
```

### F-51 (A1 files)
Change these parameters to `limit: int = Query(50, ge=1, le=200)`, importing `from fastapi import Query`:
- `notes_router.get_feed`
- `notes_router.get_my_notes`
- `notes_router.get_friends_feed`
- `notifications/router.notification_history`

### F-08 · `app/routers/notes_router.py`: batch the relations, keep every output byte
**Design.** Use one helper with three `IN()` queries, not `selectinload`.
- `selectinload` would mean editing `crud.get_notes_feed` and each query.
- It would also interact with the identity map after `get_current_user`'s daily commit.
- The helper matches the house pattern in `/profile/me`, `/insights` and `friends/currently-reading`.
```python
def _note_relations(db, notes):
    """Batch-load the author, userbook and book for a page of notes: 3 queries for any page
    size. Replaces per-note lazy loads of n.user / n.userbook / n.userbook.book (F-08)."""
    from sqlmodel import select
    user_ids = {n.user_id for n in notes}
    ub_ids = {n.userbook_id for n in notes if n.userbook_id}
    users = {u.id: u for u in db.exec(select(models.User).where(models.User.id.in_(user_ids))).all()} if user_ids else {}
    ubs = {u.id: u for u in db.exec(select(models.UserBook).where(models.UserBook.id.in_(ub_ids))).all()} if ub_ids else {}
    book_ids = {ub.book_id for ub in ubs.values() if ub.book_id}
    books = {b.id: b for b in db.exec(select(models.Book).where(models.Book.id.in_(book_ids))).all()} if book_ids else {}
    return users, ubs, books
```
**Applying it:**
- Call it once in `get_feed`, `get_my_notes`, `get_public_notes_for_user`, `get_notes_for_userbook` and `get_friends_feed`, after `notes` is fetched.
- In each loop, replace the lazy loads with `ub = ubs.get(n.userbook_id); book = books.get(ub.book_id) if ub else None; user = users.get(n.user_id)`.
- **These five functions never touch `n.user` or `n.userbook` again.**
- `get_friends_feed` returns `[]` early when `notes` is empty.
- `create_note` and `update_note` are unchanged.

**F-07 in the same loops.** In `get_feed`, `get_my_notes`, `get_friends_feed` and `get_public_notes_for_user`, `book` becomes:
```python
"book": {"id": book.id, "title": book.title, "author": book.author, "cover_url": book.cover_url,
         "google_books_id": book.google_books_id, "isbn": book.isbn, "total_pages": book.total_pages} if book else None
```
- `get_notes_for_userbook` keeps `{id, title, author}`: the owner's own book page never opens a book preview.
- Every other key stays exactly as it is, including today's asymmetries: `/user/{id}` has no `user_id` and no like keys, and `/me` has `updated_at`.

**Target queries per request.** SQLite, warm (after the day's `last_active` write). "+1" is `get_current_user`. The counts must not depend on note count:
| Endpoint | Handler queries | Ceiling asserted |
|---|---|---|
| `/notes/feed` (authed) | notes, like counts, comment counts, liked set, users, userbooks, books = 7 | ≤ 8 |
| `/notes/friends-feed` | following, mutuals, notes, likes, comments, liked, users, userbooks, books = 9 | ≤ 10 |
| `/notes/me` | notes, likes, comments, liked, users, userbooks, books = 7 | ≤ 8 |
| `/notes/user/{id}` | target user, (+ follow check if private), notes, likes, comments, users, userbooks, books = 7–8 | ≤ 9 |
| `/notes/userbook/{id}` | ownership, notes, users, userbooks, books = 5 | ≤ 6 |

In production, 8 round trips × 150–250 ms ≈ 1.2–2.0 s for `/notes/feed`, down from 9.2 s. Going lower needs F-28.

**The pytest** (`tests/test_notes.py`, new `class TestNoteQueryCount`):
```python
from datetime import datetime, timedelta
from sqlalchemy import event
from tests.conftest import engine

@pytest.fixture()
def query_counter():
    counter = {"n": 0}
    def _count(conn, cursor, statement, parameters, context, executemany):
        counter["n"] += 1
    event.listen(engine, "before_cursor_execute", _count)
    yield counter
    event.remove(engine, "before_cursor_execute", _count)

def _queries_for(client, counter, url, headers):
    assert client.get(url, headers=headers).status_code == 200   # warm-up: absorbs the daily last_active write
    counter["n"] = 0
    r = client.get(url, headers=headers)
    assert r.status_code == 200
    return counter["n"], r.json()

def _seed_public_notes(db, n, tag, *, owner=None, userbook=None):
    """n notes, each by a DISTINCT author with its own Book + UserBook (the N+1 worst case),
    created_at in the future so they lead the shared feed. owner/userbook pin them for /me and /userbook.
    Commit, then db.expire_all()."""
```
**Tests:**
- `test_feed_query_count_constant`: seed 50; `/notes/feed?limit=5` vs `?limit=50`; equal and ≤ 8.
- `test_friends_feed_query_count_constant`: the viewer follows the 50 authors; equal and ≤ 10.
- `test_my_notes_query_count_constant`: one owner with 50 notes on 50 userbooks; `limit=5` vs `50`; equal and ≤ 8.
- `test_user_notes_query_count_constant`: 2 vs 20 notes (the route cap); equal and ≤ 9.
- `test_userbook_notes_query_count_constant`: 2 vs 20; equal and ≤ 6.
- `test_note_card_book_has_dedup_keys`: the new `book` keys appear on all four endpoints.

**Proof the tests catch the bug:** on today's code, `limit=5` and `limit=50` differ by about 90 queries.

### F-17 (api) · `app/routers/notes_router.py`
- `NoteCreateSchema.is_public: Optional[bool] = None` (was `= True`).
- `create_note` `:124`: `is_public = payload.is_public if payload.is_public is not None else False`.
- `update_note` is unchanged (`if payload.is_public is not None:`). With the default now `None`, an edit that omits the field keeps visibility.

**Why not a literal `= False`:** the schema is shared with `PUT`. A `False` default would silently make every text-only edit private: `HomePage.jsx:95`, `ProfilePage.jsx:326`, and Android `ProfileScreen.js:221`. The effective create default is `False`, as approved. `crud.create_note`'s default is not touched.

**Tests** (`test_notes.py`):
- `TestNotesCRUD::test_create_without_is_public_is_private`
- `::test_explicit_public_still_in_feed`
- `::test_update_without_is_public_keeps_private`
- `::test_update_without_is_public_keeps_public`

Also grep `tests/` for note posts without `is_public` that expect feed visibility. Check `test_notes.py:37,501,518`, whose bodies span several lines.

### F-18 · `app/routers/profile_router.py :: update_profile`
Replace `:110-111`:
```python
    if "yearly_goal" in payload.__fields_set__:           # Pydantic v1: key sent → apply it
        user.yearly_goal = payload.yearly_goal or None     # null or 0 clears the goal
```
**Tests** (`test_follow_profile.py::TestProfile`):
- `test_put_yearly_goal_null_clears`
- `test_put_yearly_goal_zero_clears`
- `test_put_without_yearly_goal_keeps_it`
- `test_insights_goal_null_after_clear`

### F-55 · `notes_router.upload_image`, `profile_router.upload_profile_picture`
- `import cloudinary.exceptions`.
- Read the file **before** the `try`: `contents = await file.read()`, then `if not contents: raise HTTPException(400, "File is empty")`.
- Add `except cloudinary.exceptions.BadRequest: raise HTTPException(status_code=400, detail="Invalid image file")` before the generic `except Exception` (which stays 500).

**Tests:** monkeypatch `cloudinary.uploader.upload` to raise `cloudinary.exceptions.BadRequest("Invalid image file")`, and monkeypatch the three `CLOUDINARY_*` env vars.
- `test_notes.py::TestUploads::test_rejected_image_400`
- `test_notes.py::TestUploads::test_empty_file_400`
- `test_follow_profile.py::TestProfile::test_avatar_rejected_image_400`

### F-01 · `app/routers/auth_router.py`
- Delete `SignupIn`, `LoginIn` (`:21-37`) and the `signup`/`login` routes (`:50-76`).
- Remove imports that only these used (`Field`, `validator`); grep first.
- Keep `/google`, `/review-login`, `/delete-account` and `/delete-account/me`. `app/auth.py` is not touched.

**`tests/test_auth.py`:**
- Delete `TestSignup` and the three signup/login tests in `TestLogin`.
- Move `test_no_token_on_protected_endpoint` and `test_invalid_token_rejected` into `class TestTokenValidation`.
- Add `class TestLegacyPasswordRoutesRemoved` with `test_signup_404` and `test_login_404`.
- The triage-named `test_google_login_existing_email_issues_token_for_that_user` does **not** exist today. Do not invent it: Google token verification is not mockable without new fixtures.

**Clients:** zero references (grep verified). Nothing to remove.

### F-50 (account half) · `auth_router.delete_own_account`
Insert these deletes in the existing dependency order:
1. Before the created-groups loop: delete `GroupActivity` where `user_id == uid`.
2. Inside that loop, before `db.delete(g)`: delete `GroupActivity` where `group_id == g.id`.
3. Before deleting the user's `GroupMember` rows:
   - delete `GroupMember` where `invited_by == uid` and `status == "pending"`
   - set `invited_by = None` on the remaining rows with `invited_by == uid`
4. Before the userbook delete: set `userbook_id = None` on `GroupPost` rows whose `userbook_id` is in the user's userbook ids.

**Journal:** grep `models.Journal` writers. None are expected; if one exists, also delete `Journal` where `user_id == uid`.

**Test:** `test_auth.py::TestDeleteAccountCleansDependents` asserts no orphan references remain. SQLite tests do not enforce FKs (no PRAGMA, by project rule), so the 500 itself is re-checked by the post-deploy adversarial probe.

### A1 tests — new files and additions
**`tests/test_notifications_api.py` (new):**
- `test_patch_prefs_full_body_200`
- `test_patch_prefs_partial_preserves_other_keys`
- `test_patch_prefs_extra_keys_ignored`
- `test_patch_prefs_non_bool_422` (`{"post_liked": {"x": 1}}`)
- `test_book_added_follows_book_completed`
- `test_history_limit_bounds_422` (0, -1, 201 → 422; 200 → 200)
- F-23:
  - `test_mark_one_read_only_that_row`
  - `test_mark_one_read_idempotent`
  - `test_mark_other_users_notification_404`
  - `test_mark_unknown_notification_404`
  - `test_unread_count_drops_after_mark_one`

**`tests/test_pydantic_v1_compat.py` (new):** reads every `app/**/*.py` and asserts none contains `model_dump(`, `model_validate(`, `model_fields_set`, `model_config` or `field_validator`. This catches the whole F-49 class of bug.

**`tests/test_push_tokens.py`:** use a unique endpoint per test (`f"https://fcm.googleapis.com/fcm/send/{uuid4().hex}"`), because the shared DB persists and `_SUB` is reused.
- `test_register_token_owned_by_other_user_moves_row`
- `test_register_expo_does_not_touch_other_users_web_rows`
- `test_web_subscribe_same_endpoint_moves_between_users`
- `test_web_subscribe_keeps_same_users_other_browser`
- `test_web_subscribe_same_endpoint_twice_single_row`
- `test_web_subscribe_key_order_does_not_duplicate`
- `test_web_unsubscribe_matches_by_endpoint`
- `test_web_unsubscribe_cannot_remove_other_users_row`
- `test_web_subscribe_without_endpoint_400`

The existing 7 tests stay green.

**`tests/test_notes.py::TestLikesComments`:**
- `test_like_private_note_404`
- `test_comment_private_note_404`
- `test_get_comments_private_note_404`
- `test_comment_private_profile_non_follower_403`
- `test_refused_comment_writes_no_notificationlog`
- `test_follower_can_like_and_comment_private_profile_public_note`
- `test_owner_can_like_and_comment_own_private_note`
- `test_feed_limit_bounds_422`
- `test_my_notes_limit_bounds_422`

**F-59 correctness** is proven by the existing tests staying green **unchanged**. They assert the NotificationLog row after the request, and TestClient runs background tasks before returning: `test_notes.py::test_like_still_writes_notification_log` and `test_follow_profile.py::test_follow_still_writes_notification_log`. Latency is proven by re-running the web scenario timings (see F-59 in A2).

---

## Package A2 — API: catalogue, groups, insights, Google Books, admin, platform, migration

### F-07 · `app/routers/books_router.py`
- `AddBookFromGooglePayload`: add `book_id: Optional[int] = None`.
- Step 1 of `add_book_to_library` becomes:
  ```python
  book = db.get(Book, payload.book_id) if payload.book_id else None   # an existing catalogue row wins
  if not book and payload.google_books_id: …   # unchanged
  if not book and payload.isbn: …              # unchanged
  ```
  An unknown `book_id` falls through to the existing matching, with no 404.
- `get_recommendations` return dict: add `"google_books_id": r["book"].google_books_id` and `"isbn": r["book"].isbn`.
- F-51: `get_recommendations` `limit: int = Query(12, ge=1, le=200)`; `search_books` `limit: int = Query(20, ge=1, le=200)`.

### F-07 + F-33 · `app/routers/userbooks_router.py :: get_friends_currently_reading`
- `user`: add `"profile_picture": getattr(user, "profile_picture", None)`.
- `book`: add `"google_books_id": book.google_books_id` and `"isbn": book.isbn`.
- `limit: int = Query(10, ge=1, le=200)`.

### F-07 + F-15 + F-50 + F-51 · `app/routers/groups_router.py`
- **`_serialize_group`:** `current_book` adds `"google_books_id"`, `"isbn"` and `"total_pages"`. The list serializers (`/my`, `/discover`, `/invites/pending`) are unchanged.
- **`set_group_book` return:** `{"id", "title", "author", "cover_url", "google_books_id", "isbn", "total_pages"}`. Web `GroupDetailPage.jsx:651` stores it as `current_book`.
- **`CreateGroupBody`:** add `reading_goal: Optional[int] = None  # alias of goal_pages sent by Android ≤2.2.1 (GroupsScreen.js:93); remove once 2.2.2 is the minimum`. In `create_group`, pass `goal_pages = body.goal_pages if body.goal_pages is not None else body.reading_goal`.
- **Extract** the body of `get_goal_progress`, from the members query to `total_pages`, into `_goal_pages_read(db, g) -> int`. `get_goal_progress` then returns exactly what it returns today.
- **`get_group`:**
  ```python
  out = _serialize_group(db, g, me.id)
  out["reading_goal"] = g.goal_pages                                  # Android ≤2.2.1 alias
  out["pages_read_total"] = _goal_pages_read(db, g) if g.goal_pages else 0
  return out
  ```
  It keeps the existing private-group gate, identical to `/goal`, and adds 2 queries only when a goal is set.
- **`delete_group` (F-50):** before `db.delete(g)`, delete every `GroupActivity` with that `group_id`. Prod `ON DELETE CASCADE` exists only if the migration file created the table; `create_all` may not have.
- **`get_group_activity`:** `limit: int = Query(50, ge=1, le=200)`. F-42 `avatar_url` is not touched.

### F-13 + F-14 · `app/routers/reading_activity_router.py`
- `goal_progress`: add `"finished": len(finished_this_year),  # alias of completed for Android ≤2.2.1`.
- `projected.append`: add `"projected_finish_date": finish_date.isoformat(),  # alias of projected_finish`.
- Return dict: add `"average_rating": avg_rating, "books_this_year": len(finished_this_year),  # aliases for Android ≤2.2.1`. Android reads `books_this_year ?? books_finished_this_year`, so one alias is enough.
- Both daily routes: `days: int = Query(30, ge=1, le=200)`.

**Tests:**
- `TestInsights::test_yearly_goal_has_completed_and_finished_alias`
- `TestInsights::test_mobile_alias_keys_present`
- `TestDailyStats::test_days_bounds_422`

### F-15 / F-07 / F-50 tests · `tests/test_groups.py`
- `TestGroupsCRUD`:
  - `test_create_accepts_reading_goal_alias`
  - `test_goal_pages_wins_over_alias`
  - `test_get_group_returns_reading_goal_and_pages_read_total` (equals `/goal` `pages_read`)
  - `test_get_group_no_goal_pages_read_total_zero`
  - `test_goal_endpoint_shape_unchanged` (asserts the 4B contract below)
  - `test_current_book_has_dedup_keys`
  - `test_set_group_book_response_has_dedup_keys`
- `TestGroupDelete::test_delete_group_with_activity_leaves_no_rows`
- `test_activity_limit_bounds_422`

### F-52 · `app/routers/userbooks_router.py :: patch_userbook`
```python
from typing import Literal
from pydantic import BaseModel, conint, root_validator

class UserBookPatch(BaseModel):
    """PATCH /userbooks/{id}. Pydantic v1; unknown keys ignored (v1 default Extra.ignore)."""
    status: Optional[Literal["to-read", "reading", "finished"]] = None
    current_page: Optional[conint(ge=0)] = None
    rating: Optional[conint(strict=True, ge=0, le=5)] = None      # 0 or null clears (web sends 0 for "Rating removed")
    private_notes: Optional[str] = None
    format: Optional[Literal["hardcover", "paperback", "ebook", "kindle", "pdf", "audiobook"]] = None
    ownership_status: Optional[Literal["owned", "borrowed", "loaned"]] = None
    borrowed_from: Optional[str] = None
    loaned_to: Optional[str] = None
    total_pages: Optional[conint(ge=1)] = None

    @root_validator(pre=True)
    def _no_null_for_required_columns(cls, values):
        for k in ("status", "format", "ownership_status", "total_pages"):
            if k in values and values[k] is None:
                raise ValueError(f"{k} cannot be null")
        return values
```
- **Signature:** `payload: UserBookPatch`.
- **Body:**
  ```python
  sent = payload.dict(exclude_unset=True)
  new_total_pages = sent.pop("total_pages", None)
  if "rating" in sent and not sent["rating"]:
      sent["rating"] = None
  update_fields = sent
  ```
- **Everything else is unchanged:** the 400 when nothing is sent, the finished notification (now scheduled, F-59), and the response.
- `strict=True` rejects `"4"`, `4.5` and `true`. Every caller sends JS integers.

**Tests** (`tests/test_books.py::TestPatchUserbookValidation`):
- `rating`: `"abc"` / -1 / 6 / 4.5 → 422; 0 → 200 stored None; null → None.
- `status`: `"banana"` or null → 422.
- `current_page` -5 → 422. `total_pages` 0 → 422. `format` `"scroll"` → 422.
- An extra key → 200. `{}` → 400.
- Every recorded caller payload → 200.
- The response key set is unchanged.

### F-50 · `userbooks_router.delete_userbook`
Before `db.delete(ub)`:
```python
    # reading_activity and group_post reference userbook without an ORM relationship, so the
    # DELETE violated the FK in Postgres (500). Notes keep today's behaviour: the ORM detaches them.
    for ra in db.exec(select(models.ReadingActivity).where(models.ReadingActivity.userbook_id == ub.id)).all():
        db.delete(ra)
    for gp in db.exec(select(models.GroupPost).where(models.GroupPost.userbook_id == ub.id)).all():
        gp.userbook_id = None
        db.add(gp)
```
- It shares the one existing `db.commit()`.
- **Test** `TestDeleteUserbook::test_delete_after_progress_200_no_orphans`: add; `PUT /progress` to 10; `DELETE` → 200; 0 `reading_activity` rows remain; the book is no longer listed.

### F-59 (A2 call sites) · `books_router.py`, `userbooks_router.py`, `groups_router.py`
Same pattern as A1: a `background_tasks: BackgroundTasks` parameter plus `background_tasks.add_task(<same function>, <same args, evaluated now>)`.
| Call site | Scheduled |
|---|---|
| `books_router.add_book_to_library` `:115` | `fire_event(book_added)`. `get_follower_ids` stays in the request (1 query) so the recipient list is fixed at action time |
| `userbooks_router.update_progress` `:107,115,127` | `fire_event(book_completed)` and both `fire_group_activity_for_user` calls. `book_title` and `follower_ids` are computed in the request |
| `userbooks_router.mark_userbook_finished` `:175,183` | both |
| `userbooks_router.add_userbook` `:251` | `fire_event` |
| `userbooks_router.patch_userbook` `:384,392,397` | all three |
| `groups_router.join_group` `:502,514` | `fire_group_activity` + `fire_event` |
| `groups_router.approve_member` `:626,628` | both, in the same order (tasks run sequentially) |
| `groups_router.reject_member` `:652` | `fire_event` (`g.name` captured before the delete) |
| `groups_router.invite_user` `:697` | `fire_event` |
| `groups_router.accept_invite` `:744` | `fire_group_activity` |
| `groups_router.set_group_book` `:1047` | `fire_group_activity` |

**Not moved:**
- `admin_router.broadcast_push_notification`: an admin action whose response reports the count; sprint-2 contract.
- `notifications/scheduler.py`: not a request.
- `notifications/router.test_fire_event`: its response includes the result.

**Latency moved out of the request.** A trip is one DB round trip, about 150–250 ms in production today. External calls are the Expo publish and the web push, about 0.3–0.8 s each (assumption).
| Endpoint | Trips removed from the request | External calls removed |
|---|---|---|
| `POST /notes/{id}/like`, `POST /notes/{id}/comments`, `POST /follow/{id}` | ≈ 4–5 per recipient (prefs `get`, cap check when configured, expo tokens, web tokens, final commit); 1 recipient | 1 per recipient device |
| `POST /notes/` (public) | 2 (memberships, commit) | 0 |
| `POST /books/add-to-library`, `POST /userbooks/` | ≈ 4 × followers + 1 | 1 per follower device |
| `PATCH /userbooks/{id}` status→finished, `PUT /progress` reaching the end, `POST /finish` | ≈ 4 × followers + 1, plus 2 group activity | 1 per follower device |
| `PATCH /userbooks/{id}` status→reading | 2 | 0 |
| `PUT /progress` crossing a milestone | 2 | 0 |
| group join / approve / reject / invite / accept / set book | 1–6 | 0–1 recipient devices |
| `PATCH /userbooks/{id}` rating, format and so on | **0** (no events). The 3.1 s is pure DB round trips (F-28) | 0 |

**Expected result:** a like, comment or follow gets about 1–2.5 s faster. Marking a book finished or adding one, for a user with 10 followers, gets several seconds faster.

**Verify:** re-run `qa/scenarios_web.mjs` S1/S4 and compare against the triage timings (note 3.3–4.9 s, PATCH status 4.3 s, add 3.3 s).

**Failure mode:** an exception in a background task happens after the response. The user's action succeeded, the notification is lost, and the error is logged by uvicorn. This is the same outcome as a push-provider outage today, minus the slow response.

### F-53 · `app/models.py` ⚑ (gated: migration STEPS 1–3 run first)
```python
from sqlalchemy import UniqueConstraint   # add to the existing sqlalchemy import line

class UserBook(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("user_id", "book_id", name="uq_userbook_user_book"),)
class Like(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("note_id", "user_id", name="uq_like_note_user"),)
class Follow(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("follower_id", "followed_id", name="uq_follow_pair"),)
```
- No column changes.
- `init_db()`'s `create_all` never alters existing tables, so production depends on the SQL below. SQLite tests get the constraints at conftest import.

**Handlers (A2 files):**
- `books_router.add_book_to_library` step 4 wraps `db.add(userbook); db.commit()`. On `IntegrityError`: `db.rollback()`, re-select the winner, and raise the **same** 400 with the tab name. Factor the message into a local `_already_in_library(existing)`.
- `userbooks_router.add_userbook` wraps `crud.create_userbook(...)`. On `IntegrityError`: `db.rollback()` plus the existing duplicate 400.
- `import_router` is not touched. Residual risk: a concurrent add during an import fails that import request.

**Tests** (`tests/test_uniqueness.py`, new):
- `test_db_rejects_duplicate_userbook`, `test_db_rejects_duplicate_like`, `test_db_rejects_duplicate_follow`: a direct `db.add` of a duplicate raises `IntegrityError`, then roll back.
- `test_sequential_duplicate_contracts_unchanged`.
- Try `test_add_to_library_race_returns_400`: register a SQLAlchemy `before_flush` listener on the request session that inserts the competing row, then assert 400 and one userbook row. If this proves brittle, drop it and rely on the post-deploy race probe; record that in Build Notes.
- The Builder greps `tests/` for direct duplicate inserts of `Like`, `Follow` or `UserBook`. None were seen.

### F-53 · `context/supabase_migration.sql` ⚑ (append; PM runs each STEP separately, before the backend deploy)
```sql
-- ════════════════════════════════════════════════════════════════════════════
-- Sprint 4A · F-53 · unique (user_id, book_id), (note_id, user_id), (follower_id, followed_id)
-- Run STEP 1, read the numbers, then STEP 2, then STEP 3 — each on its own — BEFORE deploying
-- the 4A backend. Re-running any step is harmless. Rollback at the end.
-- ════════════════════════════════════════════════════════════════════════════

-- STEP 1 — READ-ONLY: duplicate groups and surplus rows per table
SELECT 'userbook' AS tbl, COUNT(*) AS dup_groups, COALESCE(SUM(n - 1), 0) AS surplus_rows
  FROM (SELECT user_id, book_id, COUNT(*) AS n FROM userbook GROUP BY user_id, book_id HAVING COUNT(*) > 1) d
UNION ALL
SELECT 'like', COUNT(*), COALESCE(SUM(n - 1), 0)
  FROM (SELECT note_id, user_id, COUNT(*) AS n FROM "like" GROUP BY note_id, user_id HAVING COUNT(*) > 1) d
UNION ALL
SELECT 'follow', COUNT(*), COALESCE(SUM(n - 1), 0)
  FROM (SELECT follower_id, followed_id, COUNT(*) AS n FROM follow GROUP BY follower_id, followed_id HAVING COUNT(*) > 1) d;

-- STEP 1b — READ-ONLY preview: duplicate library entries side by side (keeper = lowest id)
SELECT ub.user_id, ub.book_id, ub.id, MIN(ub.id) OVER (PARTITION BY ub.user_id, ub.book_id) AS keeper_id,
       ub.status, ub.current_page, ub.rating, ub.created_at, ub.updated_at
  FROM userbook ub
 WHERE (ub.user_id, ub.book_id) IN (SELECT user_id, book_id FROM userbook GROUP BY 1, 2 HAVING COUNT(*) > 1)
 ORDER BY ub.user_id, ub.book_id, ub.id;

-- STEP 2 — DEDUPE (one transaction). Keeper = the oldest row (lowest id). Backups kept for rollback.
BEGIN;

-- 2a. surplus userbooks (not the keeper), with the keeper each folds into
CREATE TABLE IF NOT EXISTS dedupe_20260913_userbook AS
  SELECT ub.*, k.keeper_id
    FROM userbook ub
    JOIN (SELECT user_id, book_id, MIN(id) AS keeper_id FROM userbook GROUP BY 1, 2 HAVING COUNT(*) > 1) k
      ON k.user_id = ub.user_id AND k.book_id = ub.book_id
   WHERE ub.id <> k.keeper_id;

-- 2b. keepers as they are now (to undo 2c)
CREATE TABLE IF NOT EXISTS dedupe_20260913_userbook_keeper AS
  SELECT * FROM userbook WHERE id IN (SELECT DISTINCT keeper_id FROM dedupe_20260913_userbook);

-- 2c. the kept (oldest) row absorbs its duplicates' progress and status
--     (resolved, orchestrator default 2026-09-13):
--       current_page = the highest across the keeper and its duplicates
--       status       = the most advanced: finished > reading > to-read
--       rating       = the keeper's if non-null (and not 0), else the most recently updated
--                      duplicate's non-null rating
--       updated_at   = the latest across the group
--     Nothing else on the keeper changes. The EXISTS guard applies this only while the
--     duplicates still exist, so re-running STEP 2 after 2f cannot overwrite later user edits.
UPDATE userbook k
   SET current_page = GREATEST(k.current_page, agg.max_page),          -- GREATEST ignores NULLs
       status = CASE GREATEST(CASE k.status WHEN 'finished' THEN 3 WHEN 'reading' THEN 2 ELSE 1 END, agg.max_rank)
                  WHEN 3 THEN 'finished' WHEN 2 THEN 'reading' ELSE 'to-read' END,
       rating = COALESCE(NULLIF(k.rating, 0), agg.dup_rating, k.rating),
       updated_at = GREATEST(k.updated_at, agg.max_updated)
  FROM (
    SELECT keeper_id,
           MAX(current_page) AS max_page,
           MAX(CASE status WHEN 'finished' THEN 3 WHEN 'reading' THEN 2 ELSE 1 END) AS max_rank,
           (ARRAY_AGG(rating ORDER BY updated_at DESC NULLS LAST, id DESC)
              FILTER (WHERE rating IS NOT NULL AND rating <> 0))[1] AS dup_rating,
           MAX(updated_at) AS max_updated
      FROM dedupe_20260913_userbook
     GROUP BY keeper_id
  ) agg
 WHERE k.id = agg.keeper_id
   AND EXISTS (SELECT 1 FROM userbook s JOIN dedupe_20260913_userbook d ON d.id = s.id
                WHERE d.keeper_id = k.id);

-- 2d. remember every dependent row we repoint (to undo 2e)
CREATE TABLE IF NOT EXISTS dedupe_20260913_repoint AS
  SELECT 'note'::text AS tbl, n.id AS row_id, n.userbook_id AS old_userbook_id
    FROM note n JOIN dedupe_20260913_userbook d ON n.userbook_id = d.id
  UNION ALL
  SELECT 'reading_activity', r.id, r.userbook_id
    FROM reading_activity r JOIN dedupe_20260913_userbook d ON r.userbook_id = d.id
  UNION ALL
  SELECT 'group_post', g.id, g.userbook_id
    FROM group_post g JOIN dedupe_20260913_userbook d ON g.userbook_id = d.id;

-- 2e. repoint dependents from the surplus row to its keeper
UPDATE note n             SET userbook_id = d.keeper_id FROM dedupe_20260913_userbook d WHERE n.userbook_id = d.id;
UPDATE reading_activity r SET userbook_id = d.keeper_id FROM dedupe_20260913_userbook d WHERE r.userbook_id = d.id;
UPDATE group_post g       SET userbook_id = d.keeper_id FROM dedupe_20260913_userbook d WHERE g.userbook_id = d.id;
DO $$ BEGIN
  IF to_regclass('public.journal') IS NOT NULL THEN
    INSERT INTO dedupe_20260913_repoint
      SELECT 'journal', j.id, j.entry_id FROM journal j JOIN dedupe_20260913_userbook d ON j.entry_id = d.id;
    UPDATE journal j SET entry_id = d.keeper_id FROM dedupe_20260913_userbook d WHERE j.entry_id = d.id;
  END IF;
END $$;

-- 2f. drop the surplus userbooks
DELETE FROM userbook WHERE id IN (SELECT id FROM dedupe_20260913_userbook);

-- 2g. likes and follows have no dependents: back up and delete surplus rows
CREATE TABLE IF NOT EXISTS dedupe_20260913_like AS
  SELECT l.* FROM "like" l
    JOIN (SELECT note_id, user_id, MIN(id) AS keeper_id FROM "like" GROUP BY 1, 2 HAVING COUNT(*) > 1) k
      ON k.note_id = l.note_id AND k.user_id = l.user_id
   WHERE l.id <> k.keeper_id;
DELETE FROM "like" WHERE id IN (SELECT id FROM dedupe_20260913_like);

CREATE TABLE IF NOT EXISTS dedupe_20260913_follow AS
  SELECT f.* FROM follow f
    JOIN (SELECT follower_id, followed_id, MIN(id) AS keeper_id FROM follow GROUP BY 1, 2 HAVING COUNT(*) > 1) k
      ON k.follower_id = f.follower_id AND k.followed_id = f.followed_id
   WHERE f.id <> k.keeper_id;
DELETE FROM follow WHERE id IN (SELECT id FROM dedupe_20260913_follow);

COMMIT;

-- STEP 3 — unique indexes (fails loudly if any duplicate survived STEP 2), then verify
CREATE UNIQUE INDEX IF NOT EXISTS uq_userbook_user_book ON userbook (user_id, book_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_like_note_user     ON "like" (note_id, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_follow_pair        ON follow (follower_id, followed_id);
SELECT indexname FROM pg_indexes WHERE indexname IN ('uq_userbook_user_book', 'uq_like_note_user', 'uq_follow_pair');

-- ROLLBACK (only if needed; indexes first, data second):
-- DROP INDEX IF EXISTS uq_userbook_user_book; DROP INDEX IF EXISTS uq_like_note_user; DROP INDEX IF EXISTS uq_follow_pair;
-- INSERT INTO userbook (id, user_id, book_id, status, current_page, rating, private_notes, format, ownership_status,
--                       borrowed_from, loaned_to, created_at, updated_at)
--   SELECT id, user_id, book_id, status, current_page, rating, private_notes, format, ownership_status,
--          borrowed_from, loaned_to, created_at, updated_at FROM dedupe_20260913_userbook;
-- UPDATE note n             SET userbook_id = r.old_userbook_id FROM dedupe_20260913_repoint r WHERE r.tbl = 'note'             AND n.id = r.row_id;
-- UPDATE reading_activity a SET userbook_id = r.old_userbook_id FROM dedupe_20260913_repoint r WHERE r.tbl = 'reading_activity' AND a.id = r.row_id;
-- UPDATE group_post g       SET userbook_id = r.old_userbook_id FROM dedupe_20260913_repoint r WHERE r.tbl = 'group_post'       AND g.id = r.row_id;
-- UPDATE journal j          SET entry_id    = r.old_userbook_id FROM dedupe_20260913_repoint r WHERE r.tbl = 'journal'          AND j.id = r.row_id;
-- -- undo 2c: restore exactly the four fields 2c changes, from the pre-2c keeper backup (2b)
-- UPDATE userbook k SET status = b.status, current_page = b.current_page, rating = b.rating,
--        updated_at = b.updated_at FROM dedupe_20260913_userbook_keeper b WHERE k.id = b.id;
-- Order for a full undo: DROP INDEX → re-INSERT the surplus userbooks → repoint dependents back → undo 2c → re-INSERT likes/follows.
-- INSERT INTO "like" SELECT * FROM dedupe_20260913_like;
-- INSERT INTO follow SELECT * FROM dedupe_20260913_follow;
-- Backup tables can be dropped by the PM after a successful release (not before 2026-10-13).
```
**Why each clause:**
- **Oldest id as keeper:** PM-specified. The oldest row is also the most likely to be referenced by notes and activity.
- **2c (resolved, orchestrator default 2026-09-13):** a double-tap duplicate may be the row the client kept using, so without 2c its progress would be lost.
  - The keeper takes the maximum `current_page` and the most advanced status (`finished` > `reading` > `to-read`).
  - It takes a non-null rating: its own first, else the most recently updated duplicate's.
  - The statement runs **before** 2e repoints `note.userbook_id`, `reading_activity.userbook_id` (and `group_post`, `journal`) and 2f deletes the duplicates.
  - The `EXISTS` guard keeps a re-run from overwriting later edits.
- **Repoint, never delete, dependents:** notes and reading history are user content.
- **The `journal` guard:** the table exists only if `create_all` made it.
- **F-07 duplicates:** these have different `book_id`s, so this constraint leaves them alone.

### F-16 · `context/repairs/2026-09-rating-reset-repair.sql` (new; the PM runs part (a) alone, first)
**What the bug left behind:** `status='to-read'`, `current_page=0`, `updated_at` = the bad rating tap, and **no rating saved**. The rating is therefore not evidence.

**Evidence of an earlier finish:**
- **E1:** `notificationlog` rows with `event_type='book_completed'`, `actor_id` = owner, and `data->>'book_title'` = title. These exist only if the owner had a follower who accepted the event. `data` is JSONB.
- **E2:** `group_activity` rows with `event_type='book_finished'`, `user_id` = owner, and payload `book_id` = `userbook.book_id`. These exist only if the owner was in a circle. `payload` is TEXT JSON.
```sql
-- ════════════════════════════════════════════════════════════════════════════
-- F-16 · Restore books reset to "Want to Read" by the pre-2026-05-04 Android rating bug
-- Run PART (a) alone and send the count + preview to the Architect. (b) and (c) are commented out:
-- running the whole file by accident only executes (a). Nothing here sends notifications.
-- Timestamps are naive UTC, as stored.
-- ════════════════════════════════════════════════════════════════════════════

-- ── PART (a) — READ-ONLY ─────────────────────────────────────────────────────
WITH evidence AS (
  SELECT ub.id AS userbook_id, nl.sent_at AS finished_at
    FROM userbook ub
    JOIN book b ON b.id = ub.book_id
    JOIN notificationlog nl
      ON nl.event_type = 'book_completed'
     AND nl.actor_id   = ub.user_id                        -- the owner finished it
     AND nl.data->>'book_title' = b.title                  -- title is the only book key in this payload
     AND nl.sent_at    < ub.updated_at                     -- recorded before the reset write
   WHERE NOT EXISTS (                                      -- title is ambiguous if the owner has another book with it
           SELECT 1 FROM userbook ub2 JOIN book b2 ON b2.id = ub2.book_id
            WHERE ub2.user_id = ub.user_id AND ub2.id <> ub.id AND b2.title = b.title)
  UNION ALL
  SELECT ub.id, ga.created_at
    FROM userbook ub
    JOIN group_activity ga
      ON ga.event_type = 'book_finished'
     AND ga.user_id    = ub.user_id
     AND (CASE WHEN ga.payload ~ '^\s*\{' THEN ga.payload::jsonb->>'book_id' END) = ub.book_id::text  -- exact book; CASE avoids casting non-JSON
     AND ga.created_at < ub.updated_at
),
candidates AS (
  SELECT ub.id, ub.user_id, ub.book_id, b.title, b.total_pages,
         ub.status, ub.current_page, ub.rating, ub.updated_at AS reset_at,
         MAX(e.finished_at) AS finished_at
    FROM userbook ub
    JOIN book b ON b.id = ub.book_id
    JOIN evidence e ON e.userbook_id = ub.id
   WHERE ub.status = 'to-read'                             -- still in the state the bug wrote
     AND COALESCE(ub.current_page, 0) = 0                  -- the bug zeroed the page
     AND ub.updated_at < TIMESTAMP '2026-05-05 00:00:00'   -- reset before the fix shipped (see recall check a3)
   GROUP BY ub.id, ub.user_id, ub.book_id, b.title, b.total_pages, ub.status, ub.current_page, ub.rating, ub.updated_at
),
safe AS (
  SELECT c.* FROM candidates c
   WHERE NOT EXISTS (                                      -- pages read after the finish ⇒ a re-read; the reset may be genuine
           SELECT 1 FROM reading_activity ra
            WHERE ra.userbook_id = c.id AND ra.pages_read > 0 AND ra.date > c.finished_at)
     AND NOT EXISTS (                                      -- started again after the finish ⇒ not the bug's state
           SELECT 1 FROM group_activity gs
            WHERE gs.event_type = 'book_started' AND gs.user_id = c.user_id
              AND (CASE WHEN gs.payload ~ '^\s*\{' THEN gs.payload::jsonb->>'book_id' END) = c.book_id::text
              AND gs.created_at > c.finished_at)
)
SELECT (SELECT COUNT(*) FROM safe)                 AS restorable_rows,
       (SELECT COUNT(DISTINCT user_id) FROM safe)  AS affected_users,
       (SELECT COUNT(*) FROM candidates)           AS candidates_before_reread_exclusions;
-- (a2) preview: same WITH block, then
--      SELECT id, user_id, title, total_pages, reset_at, finished_at FROM safe ORDER BY reset_at DESC LIMIT 50;
-- (a3) recall check: same WITH block without the `updated_at < 2026-05-05` line, then SELECT COUNT(*) FROM safe;
--      old APKs kept the bug after 2026-05-04 — widening the date is a PM decision after seeing (a) vs (a3).

-- ── PART (b) — BACKUP (after approval) ──────────────────────────────────────
-- <same WITH block>
-- CREATE TABLE userbook_repair_backup_20260913 AS
--   SELECT ub.*, s.finished_at, s.total_pages AS restore_page
--     FROM userbook ub JOIN safe s ON s.id = ub.id;
-- SELECT COUNT(*) FROM userbook_repair_backup_20260913;     -- must equal (a) restorable_rows

-- ── PART (c) — RESTORE (one transaction) ───────────────────────────────────
-- BEGIN;
-- UPDATE userbook u
--    SET status       = 'finished',
--        current_page = COALESCE(b.restore_page, u.current_page),   -- page = book length when known
--        updated_at   = b.finished_at                               -- original finish time, so "finished this year" stays honest
--   FROM userbook_repair_backup_20260913 b
--  WHERE u.id = b.id
--    AND u.status = 'to-read' AND COALESCE(u.current_page, 0) = 0;  -- untouched since the backup
-- -- the reported row count must equal the backup count; otherwise ROLLBACK;
-- COMMIT;

-- ── ROLLBACK of (c) ─────────────────────────────────────────────────────────
-- UPDATE userbook u SET status = b.status, current_page = b.current_page, updated_at = b.updated_at
--   FROM userbook_repair_backup_20260913 b WHERE u.id = b.id;
```
The file is Postgres-only (`~`, `::jsonb`), so the Builder reviews it by eye and says so in Build Notes; it is never run against SQLite.

**False positives:** one realistic case remains. A user finished a book and later deliberately moved it back to Want to Read without reading. The web confirm "Moving back to Want to Read will clear your reading progress" produces an identical row. The date cut-off and both re-read exclusions shrink this group, and the (a2) preview is the PM's check. Ratings cannot be restored, because none were saved.

### F-19 + F-29 + F-54 · `app/routers/googlebooks_router.py`
**F-19.** Add a helper next to `normalize_google_cover_url`, which stays unchanged:
```python
def _cover_from_volume(google_id: str, image_links: Optional[dict]) -> Optional[str]:
    """Google's front-cover CDN answers 200 with an 'image not available' PNG for volumes that
    have no imageLinks, which defeats every client's onError fallback. Only build a URL when
    Google says an image exists."""
    if not image_links:
        return None
    raw = (image_links.get("large") or image_links.get("medium")
           or image_links.get("thumbnail") or image_links.get("smallThumbnail"))
    if not raw:
        return None
    return normalize_google_cover_url(
        f"https://books.google.com/books/content?id={google_id}" if google_id else raw)
```
- Use it at search `:268-276` and detail `:361-368`.
- `_novel_score` gives +3 for a cover, so image-less volumes now rank lower, which is intended.
- Stored rows are not touched.

**F-29 — anonymous quota** (lives in this module, since it is used only here):
```python
import hashlib, secrets, time
from fastapi import Depends, Request
from ..deps import get_current_user_optional

ANON_CALLS_PER_WINDOW = 2
ANON_WINDOW_SECONDS = 24 * 60 * 60
_anon_calls: dict[str, list[float]] = {}   # salted ip-hash -> call times. In-process only: resets on Render restart/sleep (PM-accepted).
_IP_SALT = secrets.token_bytes(16)          # per process, so hashes cannot be reversed from a memory dump
_clock = time.time                          # tests monkeypatch this

def _caller_key(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for", "")
    # Right-most X-Forwarded-For entry: the one Render's proxy appends. Everything to its left is
    # caller-supplied and forgeable (resolved, orchestrator default 2026-09-13).
    hops = [h.strip() for h in fwd.split(",") if h.strip()]
    ip = hops[-1] if hops else (request.client.host if request.client else "unknown")
    return hashlib.sha256(_IP_SALT + ip.encode()).hexdigest()

def _consume_anonymous_call(request: Request) -> None:
    now = _clock()
    key = _caller_key(request)
    recent = [t for t in _anon_calls.get(key, ()) if now - t < ANON_WINDOW_SECONDS]
    if len(recent) >= ANON_CALLS_PER_WINDOW:
        _anon_calls[key] = recent
        raise HTTPException(status_code=401, detail={"code": "login_required", "message": "Log in to keep searching"})
    recent.append(now)
    _anon_calls[key] = recent
    if len(_anon_calls) > 10_000:           # bound memory: drop callers with no call inside the window
        for k in [k for k, ts in _anon_calls.items() if not ts or now - ts[-1] >= ANON_WINDOW_SECONDS]:
            del _anon_calls[k]
```
- **Signature:** both routes get `request: Request, current_user=Depends(get_current_user_optional)`.
- **One shared quota** for `/search` and `/book/{id}`, because each spends the same Google quota.
- **Order in `/search`:**
  1. query-length validation (a 400 does not consume)
  2. `if current_user is None: _consume_anonymous_call(request)`
  3. the F-54 clamp
  4. Google
- In `/book/{id}`, the quota check is the first line.
- **The quota check sits outside the existing `try`** so the 401 is never re-wrapped.
- Never log `ip`, `key` or the header.
- An authenticated search now costs 1 user SELECT (the optional dependency does not write `last_active`).

**F-54:**
```python
MAX_START_INDEX = 1000
...
    if start_index >= MAX_START_INDEX:
        return GoogleBooksSearchResponse(results=[], total_items=0, query_used=_build_query(query, genre),
                                         has_more=False, next_start_index=start_index)
...
        has_more = total_items > next_start and next_start < MAX_START_INDEX
...
    except HTTPException:
        raise                                   # keep our own 502 instead of rewrapping it as 500
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="Google Books is unavailable right now")
    except Exception:
        raise HTTPException(status_code=502, detail="Google Books returned an unexpected response")
```
Use the same `except HTTPException: raise` in `get_book_details`. Details no longer echo `str(e)`.

**Tests** (`tests/test_googlebooks.py`, new). An autouse fixture clears `_anon_calls` and monkeypatches `googlebooks_router.httpx.AsyncClient` with a fake async context manager. The fake records its calls and returns 2 items: one with `imageLinks`, one without.
- **F-19:**
  - `test_item_without_imagelinks_has_null_cover`
  - `test_item_with_imagelinks_has_frontcover_url`
  - the same pair for `/book/{id}`
- **F-29:**
  - `test_anonymous_first_two_calls_200`
  - `test_anonymous_third_call_401_login_required` (exact `detail` dict)
  - `test_quota_shared_between_search_and_book`
  - `test_authenticated_unlimited` (5 calls)
  - `test_different_ip_has_own_quota` (`X-Forwarded-For: 203.0.113.1` vs `.2`)
  - `test_forged_leftmost_xff_counts_against_real_ip` (required):
    - Send three anonymous calls with `X-Forwarded-For: 198.51.100.<n>, 203.0.113.9`, using a different forged left-most value each time and the same right-most value.
    - Calls 1 and 2 return 200; call 3 returns `401 login_required`.
    - A call with only `X-Forwarded-For: 203.0.113.10` still returns 200.
  - `test_no_xff_falls_back_to_client_host`: TestClient's `testclient` host is counted.
  - `test_quota_resets_after_window` (monkeypatch `_clock`: `t`, then `t + 86401`)
  - `test_invalid_token_counts_as_anonymous`
  - `test_raw_ip_not_stored`
  - `test_short_query_400_does_not_consume`
- **F-54:**
  - `test_start_index_999999_returns_empty_200_without_calling_google`
  - `test_google_non_200_returns_502`
  - `test_google_transport_error_returns_502`

### F-26 support + F-51 · `app/routers/admin_router.py`
- `PlatformStats`: add `push_subscribed_users: int = 0`. In `get_platform_stats`: `db.exec(select(func.count(func.distinct(models.PushToken.user_id)))).one()`. That is the same audience as the broadcast.
- The five list routes (`:170, :225, :285, :456, :502`): `limit: int = Query(<same default>, ge=1, le=200)`.
- **Mention only:** `books_completed` counts `status == "completed"` and `books_wishlist` counts `"want_to_read"`. Neither value exists, so both stats are always 0.

**Tests** (`tests/test_admin.py`):
- `test_stats_has_push_subscribed_users_distinct_count`
- `test_admin_list_limit_bounds_422`

### F-56 + F-58 + F-01 cleanup · `app/main.py`
Two pure ASGI middlewares, avoiding `BaseHTTPMiddleware`'s streaming and background-task pitfalls on Starlette 0.27:
```python
import logging
from starlette.responses import JSONResponse

_error_log = logging.getLogger("app.errors")

class CatchUnhandledErrorsMiddleware:
    """F-58: turn an unhandled exception into a JSON 500 *inside* CORSMiddleware, so the browser
    can read it. Starlette's ServerErrorMiddleware sits outside CORS and strips the allow headers."""
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        response_started = False

        async def send_tracking(message):
            nonlocal response_started
            if message["type"] == "http.response.start":
                response_started = True
            await send(message)

        try:
            await self.app(scope, receive, send_tracking)
        except Exception:
            _error_log.exception("Unhandled error on %s %s", scope.get("method"), scope.get("path"))   # path only, no query string
            if response_started:
                raise   # headers already sent (e.g. a background task failed after the response) — nothing to rewrite
            await JSONResponse({"detail": "Internal Server Error"}, status_code=500)(scope, receive, send)


_SECURITY_HEADERS = (
    (b"x-content-type-options", b"nosniff"),
    (b"referrer-policy", b"strict-origin-when-cross-origin"),
    (b"x-frame-options", b"DENY"),
    (b"strict-transport-security", b"max-age=31536000; includeSubDomains"),
)

class SecurityHeadersMiddleware:
    """F-56: baseline security headers on every HTTP response. A JSON API needs no CSP."""
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        async def send_with_headers(message):
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                present = {k.lower() for k, _ in headers}
                headers.extend(h for h in _SECURITY_HEADERS if h[0] not in present)
                message["headers"] = headers
            await send(message)

        await self.app(scope, receive, send_with_headers)
```
**Registration order.** Starlette's `add_middleware` puts each new middleware outside the previous ones:
```python
app.add_middleware(CatchUnhandledErrorsMiddleware)   # 1st → innermost: exceptions become responses inside CORS
app.add_middleware(CORSMiddleware, ...)              # existing call, unchanged arguments
app.add_middleware(SecurityHeadersMiddleware)        # 3rd → outermost: every response, preflights included
```
- `HTTPException` and validation errors never reach the catch middleware; FastAPI's `ExceptionMiddleware` handles them further inside.
- HSTS is ignored by browsers on `http://localhost`.

**F-01 orphan:** delete `oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")` (`:28`, referenced nowhere) and its import. Change the `auth` tag description to `"Google sign-in and account deletion"`.

**Tests** (`tests/test_security_headers.py`, new):
- `test_headers_on_200`: `GET /version`.
- `test_headers_on_404`.
- `test_preflight_keeps_cors_and_gets_headers`: `OPTIONS /notes/feed`, `Origin: https://www.trackmyread.com`, `Access-Control-Request-Method: GET` → 200 with `access-control-allow-origin` and `x-content-type-options`.
- `test_foreign_origin_no_allow_header`.
- F-58: the fixture adds and removes a temporary route. The middleware stack is built once, and routes live in the inner router, so a route added in a test is reachable:
  ```python
  @pytest.fixture()
  def boom_route():
      async def _boom():
          raise RuntimeError("boom-secret-detail")
      app.add_api_route("/__test_boom", _boom, methods=["GET"])
      yield
      app.router.routes[:] = [r for r in app.router.routes if getattr(r, "path", None) != "/__test_boom"]
  ```
  - `test_unhandled_exception_500_has_cors_and_json`: `GET /__test_boom` with an allowed `Origin` → 500, `json() == {"detail": "Internal Server Error"}`, `access-control-allow-origin` present, `x-content-type-options` present, and `"boom-secret-detail" not in r.text`. The conftest client uses `raise_server_exceptions=True`; the middleware converts the exception first, so the test does not raise.
  - `test_unhandled_exception_logged`: `caplog` on `app.errors` has one record naming `/__test_boom`.

---

## Package B1 — Web platform: api.js, auth/push, notifications, admin, onboarding, public pages
Paths are relative to `book-tracker-frontend-stitch/`.

### `src/services/api.js`
**Errors carry `status` and `code`** (F-29, F-58). Replace `apiFetchRaw` `:54-63`; `token` is already captured at `:45`:
```js
  if (res.status === 401) {
    const body = await res.json().catch(() => ({}))
    // Anonymous Google Books quota (F-29): a logged-out visitor must not be bounced to "/".
    if (!token && body?.detail?.code === 'login_required') {
      const e = new Error(body.detail.message || 'Log in to keep searching')
      e.status = 401
      e.code = 'login_required'
      throw e
    }
    clearToken()
    window.location.href = '/'
    return
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Request failed' }))
    const d = err.detail
    const e = new Error(typeof d === 'string' ? d : (d?.message || 'Request failed'))
    e.status = res.status
    if (d && typeof d === 'object' && d.code) e.code = d.code
    throw e
  }
```
- With a token present, `login_required` means an expired session, so the existing redirect stays.
- 422 array details stop surfacing as `"[object Object]"`.
- 500s are now readable (F-58).
- No landing search box or login prompt is built (PM: not approved). `e.code === 'login_required'` is exposed for any future caller.

**Cache invalidation (F-20).** Clear inside `.then(r => { …; return r })`. Add next to the existing helpers:
```js
function invalidateGroups() { cacheClear('/groups') }
function invalidateNotifications() { cacheClear('/notifications') }
function invalidateSocial() { cacheClear('/follow'); cacheClear('/users'); cacheClear('/profile'); cacheClear('/notes'); cacheClear('/userbooks/friends'); cacheClear('/books/recommendations') }
```
| Function | Clears |
|---|---|
| `likeNote`, `unlikeNote`, `addComment` | `invalidateFeed()` |
| `followUser`, `unfollowUser` | `invalidateSocial()` |
| `markAllNotificationsRead`, **`markNotificationRead` (new)** | `invalidateNotifications()` |
| `updateNotificationPrefs` | `cacheClear('/notifications/prefs')` |
| `uploadProfilePicture` (raw fetch) | `invalidateProfile()` before `return res.json()` |
| The 16 group mutations: `createGroup`, `updateGroup`, `deleteGroup`, `joinGroup`, `leaveGroup`, `approveGroupMember`, `rejectGroupMember`, `removeGroupMember`, `inviteToGroup`, `joinByInviteCode`, `acceptGroupInvite`, `declineGroupInvite`, `createGroupPost`, `deleteGroupPost`, `setGroupBook`, `clearGroupBook` | `invalidateGroups()` |
| `fixCoversBatch` | `cacheClear('/userbooks'); cacheClear('/import'); invalidateFeed()` |
| `adminDeleteNote`, `adminDeleteComment` | `cacheClear('/admin'); invalidateFeed()` |
| `setAdminRole` | `cacheClear('/admin')` |
| `triggerBot` | `invalidateFeed()` |
| Already correct (unchanged) | `updateMyProfile`, `addToLibrary`, `updateUserBook`, `updateProgress`, `markFinished`, `removeFromLibrary`, `createNote`, `updateNote`, `deleteNote`, `importGoodreads` |
| No cache impact | `webSubscribe`, `webUnsubscribe`, `sendTestPush`, `broadcastPush`, `deleteAccount`, `uploadNoteImage` |

The TTL and stale-while-revalidate behaviour are unchanged.

**New exports:**
```js
// F-03: called during logout with the token captured *before* clearToken(), so the request is still authenticated.
export const webUnsubscribe = (subscription, token) =>
  apiFetch('/notifications/web-unsubscribe', {
    method: 'DELETE',
    body: JSON.stringify({ subscription }),
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })

// F-23
export const markNotificationRead = (id) =>
  apiFetch(`/notifications/${id}/read`, { method: 'POST' })
    .then(r => { invalidateNotifications(); return r })
```
`options.headers` is spread last in `apiFetchRaw`, so the explicit token wins.

**F-26:** `setAdminRole = (userId) => apiFetch(\`/admin/set-admin/${userId}?is_admin=true\`, { method: 'POST' })`, plus the cache clear. The route requires the `is_admin: bool` query (`admin_router.py:321`). Web never sent it, so every click has returned 422 into an empty catch. Fix it: resolved, orchestrator default 2026-09-13, still restricted to the server-side admin email allowlist (`admin_router.py:334`).

### F-03 web + F-27 · `src/context/AuthContext.jsx`
```js
async function registerWebPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return
  if (!getToken() || Notification.permission !== 'granted') return   // F-27: never prompt here; the banner asks
  try {
    const reg = await navigator.serviceWorker.register('/sw-push.js')
    await navigator.serviceWorker.ready
    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      const { public_key } = await getVapidPublicKey()
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(public_key) })
    }
    await webSubscribe(sub.toJSON(), navigator.userAgent.slice(0, 120))   // always: the server reassigns this endpoint (F-03)
  } catch (err) {
    if (import.meta.env.DEV) console.warn('Web push registration failed:', err?.message)
  }
}

async function unregisterWebPush(token) {
  try {
    if (!token || !('serviceWorker' in navigator)) return
    const reg = await navigator.serviceWorker.getRegistration('/sw-push.js')
    const sub = reg && await reg.pushManager.getSubscription()
    if (sub) await webUnsubscribe(sub.toJSON(), token)   // the browser subscription is kept; the next login re-registers it
  } catch { /* best effort — server-side reassignment covers a failed call */ }
}
```
```js
  const logout = () => {
    const token = getToken()   // capture before clearing
    clearToken()
    setUser(null)
    unregisterWebPush(token)   // fire-and-forget; logout stays synchronous for its callers
  }
```
- The callers (`Nav.jsx:34`, `ProfilePage.jsx:500`, `SettingsPage.jsx:289,297`) are not touched.
- After account deletion, the unsubscribe gets a 401 and redirects to `/`, which is where the page is already going.

### F-22 + F-23 · `public/sw-push.js` and `src/pages/NotificationsPage.jsx`
**`sw-push.js`** cannot import from `src/`, so the mapping is duplicated. A comment in both files points at the other.
```js
function urlForNotification(d) {
  d = d || {}
  switch (d.type) {
    case 'new_follower':
    case 'post_liked':
    case 'post_commented':      return d.actor_id ? `/profile/${d.actor_id}` : '/notifications'
    case 'book_completed':
    case 'book_added':          return '/home'
    case 'reading_streak_reminder': return '/insights'
    case 'group_invite':
    case 'group_join_request':
    case 'group_join_approved': return d.group_id ? `/groups/${d.group_id}` : '/groups'
    case 'group_join_rejected': return '/groups'
    default:                    return '/notifications'   // admin_broadcast and anything unknown: the inbox shows the message
  }
}

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = new URL(urlForNotification(event.notification.data), self.location.origin).href
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const w of wins) {
      if ('focus' in w) {
        await w.focus()
        if ('navigate' in w) { try { await w.navigate(url); return } catch { /* uncontrolled client */ } }
      }
    }
    await self.clients.openWindow(url)
  })())
})
```
- The `push` handler is unchanged.
- A rejection goes to `/groups`: only private circles reject, and `GET /groups/{id}` returns 403 to non-members. `GroupDetailPage.load` would turn that into an error toast and a redirect.

**`NotificationsPage.jsx`:**
- **`getDestination`:**
  - Add `group_join_approved` to the `group_invite` case.
  - Add `group_join_rejected` → `'/groups'`.
  - Add `admin_broadcast` → `null`. This must be explicit, or the `default` branch would route through `actor_id`.
- **Row `onClick` (F-23):** inside `if (!n.is_read) { … }`, add `markNotificationRead(n.id).catch(() => {})` after the optimistic update. Import it.
- Apply F-10 to this file's 4 matches.

### F-26 · `src/pages/AdminPage.jsx`
- `import { useToast } from '../components/Toast'` and `const toast = useToast()`.
- **`handleBroadcast`:** after the empty check:
  ```js
  const n = stats?.push_subscribed_users
  if (!window.confirm(`Send this push to ${n ?? 'every'} user(s) with notifications on?\n\n${bTitle.trim()}\n${bBody.trim()}`)) return
  ```
  `window.confirm` matches this page's existing pattern (`:124,135`).
- **`handleMakeAdmin(u)`:** pass the row's user (`:297`), then:
  ```js
  if (!window.confirm(`Give admin access to ${u.name || u.email}?`)) return
  ```
  On success, `toast('Admin access granted', 'success')`; in the catch, `toast(e.message || 'Could not grant admin', 'error')`.
- Apply F-10 to the 10 matches.

### F-24 · `src/components/AppTour.jsx` and `src/pages/OnboardingPage.jsx`
- `AppTour`: `import { useToast } from './Toast'`, with `const toast = useToast()` in each step. The file is English-only.
- **`AvatarStep.handleUpload`** catch: `toast('Could not upload that photo — try another', 'error')`.
- **`AvatarStep.handleSave`:** `catch (e) { toast(e.message || 'Could not save your avatar', 'error'); setSaving(false); return }`. `onSave` is not called.
- **`GoalStep.handleSave`:** the same pattern with `'Could not save your goal'`.
- **`AddBookStep.handleAdd`:** `catch (e) { toast(e.message || 'Could not add that book', 'error') }`. `setAdded` is not reached.
- **`OnboardingPage.handleNext`, step 2:** `catch (e) { toast(e.message || 'Could not save your goal', 'error'); setSavingGoal(false); return }`, so it does not advance.
- Skip is unchanged. Apply F-10 (AppTour 2, Onboarding 1).

### F-57 · `src/utils/navigation.js` (new) and the About, Privacy and Terms pages
```js
// React Router's BrowserRouter stores the in-app history position in history.state.idx.
// idx 0 (or no state) means this tab opened directly on the page — navigate(-1) would leave the site.
export function goBackOrHome(navigate) {
  if ((window.history.state?.idx ?? 0) > 0) navigate(-1)
  else navigate('/', { replace: true })
}
```
- `AboutPage.jsx:16`, `PrivacyPage.jsx:9` and `TermsPage.jsx:9` use `onClick={() => goBackOrHome(navigate)}`, plus the import.
- **Test** (Playwright):
  1. In a fresh context, open each page directly and click Back. The URL is `/` and the body is non-empty.
  2. From `/`, navigate in-app to `/privacy` and click Back. The URL is the previous route.

---

## Package B2 — Web content pages: circles, book preview, library, composers, search, locales

### F-25 · `src/pages/GroupDetailPage.jsx`
Add a generic confirm state (keep `showDeleteConfirm` for Disband):
```js
const [confirm, setConfirm] = useState(null)   // { title, body, confirmLabel, onConfirm }
```
Split each handler into an asking function and a doing function:
- **`handleRemoveMember(userId)`:** `m = members.find(x => x.user_id === userId)`, then:
  ```js
  setConfirm({
    title: t('groups.removeMemberTitle'),
    body: t('groups.removeMemberConfirm', { name: m?.name || m?.username || '' }),
    confirmLabel: t('groups.remove'),
    onConfirm: () => doRemoveMember(userId),
  })
  ```
- **`handleLeave()`:**
  ```js
  setConfirm({
    title: t('groups.leaveCircle') + '?',
    body: t('groups.leaveConfirm', { name: group.name }),
    confirmLabel: t('groups.leave'),
    onConfirm: doLeave,
  })
  ```
- **`handleDeletePost(postId)`:**
  ```js
  setConfirm({
    title: t('groups.deletePostTitle'),
    body: t('groups.deletePostConfirm'),
    confirmLabel: t('groups.delete'),
    onConfirm: () => doDeletePost(postId),
  })
  ```
  `doDeletePost` is wrapped: `try { await deleteGroupPost(…); setPosts(…); toast('Post deleted', 'info') } catch (e) { toast(e.message || 'Could not delete post', 'error') }`.
- **Render** one modal after the Disband modal by copying its markup (`:1182-1205`). The confirm button runs `async () => { const fn = confirm.onConfirm; setConfirm(null); await fn() }`. Cancel runs `setConfirm(null)`. A backdrop click does nothing.
- Apply F-10: 27 colour + 18 size.

### F-07 web · `src/components/BookPreviewModal.jsx` and `src/pages/LibraryPage.jsx`
- **`BookPreviewModal.handleAdd`:** add `book_id: book.id || null` and `isbn: book.isbn || null`. Every opener passes a Book (recommendations, friends-reading `.book`, circle `current_book`), and the duplicate check at `:43-45` already treats `book.id` as `Book.id`. Apply F-10 (2).
- **`LibraryPage.handleAdd`** (`:192-202`, the live Add Book modal): add `google_books_id: book.google_books_id || null`. The search results carry it (`api.js:112`); `isbn` is already sent.
  - Do **not** send `book_id` here: Google results have no local id.
  - Leave the dead `BookDetailPanel` (`:306-604`) logic alone.
  - Apply F-10 (23 colour + 9 size) to the whole file, including class names inside the dead panel.

### F-17 web · remembered Public / Only me switch (`HomePage.jsx`, `BookDetailPage.jsx`, `ProfilePage.jsx`)
**PM decision 2026-09-13:**
- Every composer remembers the user's last choice.
- A user who has never chosen gets Private.
- The API default for an omitted `is_public` stays `False`.

**`src/utils/noteVisibility.js` (new):**
```js
// One key for every note composer (Home, Book detail, Profile). 'private' | 'public'; absent → 'private'.
export const NOTE_VISIBILITY_KEY = 'bt_note_visibility'

export function readNoteVisibility() {
  try { return localStorage.getItem(NOTE_VISIBILITY_KEY) === 'public' ? 'public' : 'private' }
  catch { return 'private' }   // storage blocked (private mode, site data disabled)
}

export function writeNoteVisibility(value) {
  try { localStorage.setItem(NOTE_VISIBILITY_KEY, value === 'public' ? 'public' : 'private') } catch { /* ignore */ }
}
```

**`src/components/VisibilityToggle.jsx` (new).** A two-option segmented control, with props `{ value, onChange }`:
- Options: **Only me** (icon `lock`, first) and **Public** (icon `public`).
- Styling: the existing chip styles.
- Accessibility: `role="radiogroup"` labelled `t('feed.visibilityLabel')`; each option has `role="radio"` and `aria-checked`.
- On click it calls `writeNoteVisibility(next)` and then `onChange(next)`, so the key is written **on change**, not only on post.

**Each composer:**
- `const [visibility, setVisibility] = useState(readNoteVisibility)`.
- Render `<VisibilityToggle value={visibility} onChange={setVisibility} />` beside the post button.
- Send `is_public: visibility === 'public'`: replace `is_public: true` at `HomePage.jsx:386` and `BookDetailPage.jsx:218`, and add it at `ProfilePage.jsx:147`.
- **Do not reset** the switch after posting.
- A second open tab keeps its own state until reload, which is acceptable.
- The circle composer (`GroupDetailPage` `NewPostModal`) is not affected: group posts live in `group_post`, which has no `is_public`.

**Home composer after a private post** (`PostComposer.handleSubmit`, `HomePage.jsx:370-400`):
```js
const isPublic = visibility === 'public'
const note = await createNote({ text, quote: quote || null, emotion: emotion || null, image_url,
                                is_public: isPublic, userbook_id: selectedBook?.id || null })
if (isPublic) {
  onPost({ ...note, book: selectedBook?.book || null })
  toast('Reflection posted!', 'success')        // existing
} else {
  toast(t('feed.savedPrivately'), 'success')    // "Saved privately — find it on your Profile"
}
```
A private post is **never** passed to `onPost`, so it is never inserted into the Community or Friends list. The Book detail and Profile lists show only the owner's own notes, so they keep inserting as today.

**New i18n keys, in all 6 locales:**
| Key | English value |
|---|---|
| `feed.visibilityLabel` | "Who can see this" |
| `feed.visibilityPublic` | "Public" |
| `feed.visibilityPrivate` | "Only me" |
| `feed.savedPrivately` | "Saved privately — find it on your Profile" |

**Test cases** (for Senior QA's `tests.md`; Playwright, local dev):
1. Fresh context: every composer's switch shows Only me.
2. Choose Public on Home, post, reload: the Home, Book detail and Profile switches all show Public.
3. `localStorage.clear()`, then reload: Only me.
4. Choose Public, don't post, reload: still Public (written on change).
5. On Home, choose Only me and post: the toast "Saved privately — find it on your Profile" appears, there is no new card in Community or Friends, and the note is listed on `/profile`.
6. In a context whose `localStorage` throws, the switch shows Only me and posting still works.

### F-60 · `src/pages/HomePage.jsx`: a post made while the feed loads must not vanish
**Cause.**
- `fetchFeed(tab)` (`:713-722`) ends with `setPosts(data || [])`.
- A post made during the first fetch (about 9 s before F-08) is prepended by `handleNewPost` (`:740-742`).
- The stale response then replaces the list, and the post disappears.
- A quick Community → Friends switch races the same way: the slower response wins.

**Design** (inside `HomePage`; add `useRef` to the React import):
```js
const requestSeq = useRef(0)            // id of the newest fetchFeed call
const activeTabRef = useRef(activeTab)  // tab the newest call was for
const localPosts = useRef([])           // [{ post, tab }] created this page session, not yet seen in a response

const fetchFeed = async (tab) => {
  const seq = ++requestSeq.current
  activeTabRef.current = tab
  setLoading(true)
  setError(null)
  try {
    const data = tab === 'community' ? await getCommunityFeed() : await getFriendsFeed()
    if (seq !== requestSeq.current || tab !== activeTabRef.current) return   // a newer request or tab owns the list
    const fresh = data || []
    const seen = new Set(fresh.map(p => p.id))
    localPosts.current = localPosts.current.filter(l => !seen.has(l.post.id))   // the server has it now: stop carrying it
    const carried = localPosts.current.filter(l => l.tab === tab).map(l => l.post)
    setPosts([...carried, ...fresh])
  } catch {
    if (seq !== requestSeq.current) return
    setError('Failed to load feed.')
  }
  if (seq === requestSeq.current) setLoading(false)
}

const handleNewPost = (note) => {
  const post = { ...note, user, likes_count: 0, comments_count: 0, liked_by_me: false }
  localPosts.current = [{ post, tab: activeTabRef.current }, ...localPosts.current]
  setPosts(prev => [post, ...prev.filter(p => p.id !== post.id)])
}
```
- Only public posts reach `handleNewPost` (F-17 rule above), so a carried post always belongs in the feed it is shown in.
- `handleDeletePost` also removes the id from `localPosts.current`, so a later fetch cannot resurrect it.
- `handleEditPost` also updates the carried copy: `localPosts.current = localPosts.current.map(l => l.post.id === postId ? { ...l, post: { ...l.post, ...updated } } : l)`.
- The same merge covers the `api.js` 60 s cache returning a list without the new post. B1's `createNote` already clears `/notes`.

**Test cases** (for Senior QA; Playwright with `page.route` delaying responses):
1. **The S1 hook in `qa/scenarios_web.mjs` must pass.** Delay `GET /notes/feed` by 5 s and post a public note immediately after load. Once the feed resolves, the new post is still the first card, visible within 20 s.
2. Delay `/notes/feed` by 5 s and `/notes/friends-feed` by 0.5 s. Load on Community and switch to Friends at once. After both resolve, the list equals the friends response.
3. Post, then delete that post before the delayed feed resolves. The post does not reappear.
4. Post privately while the feed is loading. No card appears before or after the feed resolves, and the toast shows.

- **Apply F-10:** Home 11 + 3, BookDetail 8, Profile 25 + 13.
- **HomePage synthetic cover** (`:135-150`, F-10). Change three `COVER_COLORS` entries that fail on their own 16 % tint:
  - `'#2e7d32'` → `'#256b29'` (5.18:1)
  - `'#e65100'` → `'#a84300'` (4.79:1)
  - `'#bf360c'` → `'#a52f0a'` (5.38:1)

  The other five already pass: #00695c 5.18, #880e4f 7.02, #283593 7.85, #6a1b9a 7.07, #1565c0 4.58. The title `<p className="text-[7px] …">` becomes `className="hidden md:line-clamp-4 text-xs font-bold text-center leading-tight"`. The 48 px mobile tile shows the icon only; the title is already in `alt` and in the post.

### F-21 · `src/pages/SearchPage.jsx`
- **Delete:** `FORMAT_OPTIONS` (`:169-175`), the `activeFormat` state (`:180`), `filterByFormat` (`:255-265`) and the chips block (`:314-…`).
- `:267` becomes `const activeResults = tab === 'google' ? googleResults : localResults`.
- Do **not** delete `format.*` i18n keys; grep before touching any key.
- Android `SearchScreen.js:20` (`FORMAT_KEYS`) is unreachable, not in `AppNavigator.js`. Note only.
- Apply F-10: 11 + 2.

### `src/i18n/locales/{en,de,es,fr,pt,ru}.json`
**Under `groups`:**
| Key | English value |
|---|---|
| `leaveConfirm` | "You'll stop seeing {{name}}'s posts and activity. Rejoining a private circle needs a new invite." |
| `leave` | "Leave" |
| `removeMemberTitle` | "Remove member?" |
| `removeMemberConfirm` | "Remove {{name}} from this circle?" |
| `remove` | "Remove" |
| `deletePostTitle` | "Delete post?" |
| `deletePostConfirm` | "This post will be deleted for everyone. This cannot be undone." |
| `delete` | "Delete" |

**Under `feed`:** `visibilityLabel`, `visibilityPublic`, `visibilityPrivate` and `savedPrivately` (values in the F-17 section above).
- Translate for de, es, fr, pt and ru. Where unsure, use English; i18next falls back to `en`.
- Reuse existing keys with the same meaning if a grep finds them.

---

## Package C — Web styling: F-10 tokens and pages no other package touches

### Tokens · `tailwind.config.js`
```js
"on-surface-muted": "#586060",   // replaces text-on-surface-variant/60–70 and text-on-surface/40–60
"on-surface-faint": "#636a6a",   // replaces text-on-surface-variant/20–50 and text-outline* on text
```
**Contrast (WCAG 2.1 relative luminance, computed):**
| Text colour | #ffffff | #fbf9f4 | #f5f3ee | #f0eee9 | #eae8e3 (container-high) |
|---|---|---|---|---|---|
| `on-surface-variant` #3f4949 (unchanged, tier 1) | 9.29 | 8.83 | 8.38 | 8.01 | 7.59 |
| **`on-surface-muted` #586060 (new, tier 2)** | **6.45** | **6.13** | **5.81** | **5.56** | 5.27 |
| **`on-surface-faint` #636a6a (new, tier 3)** | **5.53** | **5.25** | **4.98** | **4.77** | 4.51 |
| `error` #ba1a1a (replaces error/50–70) | 6.46 | 6.14 | 5.83 | 5.57 | 5.28 |
| `secondary` #735c00 (replaces secondary/80) | 6.44 | 6.12 | 5.81 | 5.56 | 5.26 (5.06 on its chip `#e8e4d6`) |
| `primary` #00464a (replaces primary/60–70) | 10.63 | 10.11 | 9.59 | 9.17 | 8.68 |
| today: variant/60 → #8c9292 | 3.16 | 3.12 | 3.04 | 2.98 | — |
| today: variant/50 | 2.52 | 2.49 | 2.45 | 2.40 | — |
| today: `outline` #6f7979 solid | 4.48 | 4.26 | 4.04 | 3.86 | 3.66 |

- The three tiers stay visibly distinct on white: 9.3, then 6.5, then 5.5.
- **Do not put `on-surface-faint` text on #e4e2dd (`surface-container-highest` / `surface-variant`), where it is ≈ 4.3:1.** Use `on-surface-muted` there (≈ 5.0:1). The matched lines contain no such pairing today.

### Mapping rule (each package applies it to its own files)
Resting-state **text** classes only:
| From | To |
|---|---|
| `text-on-surface-variant/60`, `/70` | `text-on-surface-muted` |
| `text-on-surface-variant/20`, `/30`, `/40`, `/50` | `text-on-surface-faint` |
| `text-on-surface/40`, `/50`, `/60` (e.g. inactive nav `Nav.jsx:61`) | `text-on-surface-muted` |
| `text-outline`, `text-outline/20..60` **on text** | `text-on-surface-faint` |
| `text-error/50`, `/60`, `/70` | `text-error` |
| `text-secondary/80` | `text-secondary` |
| `text-primary/60`, `/70` | `text-primary` |
| `text-[7px]`, `text-[9px]`, `text-[10px]`, `text-[11px]` | `text-xs` (12 px / 16 px line height) |

**Not changed:**
- Icon-only `material-symbols-outlined` elements. axe skips icon ligatures, and WCAG 1.4.11 governs them. Examples: the `text-outline/40 menu_book` placeholders, and the empty stars at `LibraryPage.jsx:77` and `BookDetailPage.jsx:45`.
- `hover:`, `group-hover:`, `focus:` and `placeholder:` variants.
- `text-on-surface/70`, which already passes (6.32 / 5.88).
- Borders and backgrounds.

**Badges:** fixed-size number circles (`w-4 h-4 … text-[10px] rounded-full`, 12 occurrences, e.g. `Nav.jsx:66`) become `min-w-[18px] h-[18px] px-1 text-xs leading-none rounded-full`.

**Minimum text size: 12 px everywhere.** The one sub-12 px text that cannot grow in place, the synthetic cover title, is hidden on mobile instead (B2).

**Occurrences per package** (resting-state grep):
| Package | File | Colour | Size |
|---|---|---:|---:|
| C | `components/Nav.jsx` | 2 | 2 |
| C | `pages/CreateGroupPage.jsx` | 5 | 1 |
| C | `pages/GroupsPage.jsx` | 6 | 5 |
| C | `pages/InsightsPage.jsx` | 20 | 11 |
| C | `pages/LoginPage.jsx` | 1 | 1 |
| C | `pages/SettingsPage.jsx` | 4 | 0 |
| C | `pages/UserProfilePage.jsx` | 23 | 9 |
| B1 | `AppTour.jsx` / `AdminPage.jsx` / `NotificationsPage.jsx` / `OnboardingPage.jsx` | 2 / 10 / 4 / 1 | 0 |
| B2 | `BookPreviewModal.jsx` / `GroupDetailPage.jsx` / `HomePage.jsx` / `BookDetailPage.jsx` / `ProfilePage.jsx` / `SearchPage.jsx` / `LibraryPage.jsx` | 2 / 27 / 11 / 8 / 25 / 11 / 23 | 0 / 18 / 3 / 0 / 13 / 2 / 9 |
| **Total** | 18 files | **185** | **74** |

Some colour matches are icon-only spans that stay as they are, so edited counts will be lower. Builders list skipped icon lines in Build Notes.

**Verification:**
- `npm run build`.
- `node qa/a11y_audit.mjs` against a Vercel preview: 0 `color-contrast` nodes on the 16 pages.
- Before and after screenshots of `/home`, `/insights`, `/groups/7` and `/library`. `qa/screenshots` baselines will change (expected).

---

## Contracts for 4B
These resolve every **PENDING-4A-CONTRACT** in `features/android/sprint-4b-android-audit/architecture.md`. All four match the assumptions that brief made, so 4B needs no changes. Pydantic v1 ignores unknown request keys, so every request below is safe to send before 4A is live; the new behaviour starts when it is.

### 1. F-07 — add-to-library and book sub-shapes · **CONFIRMED**
**Request.** `POST /books/add-to-library`, auth: user. All fields are the existing ones plus the new `book_id`:
```json
{
  "book_id": 829,
  "google_books_id": "abcDEF123",
  "isbn": "9780141439556",
  "title": "Wuthering Heights",
  "author": "Emily Brontë",
  "cover_url": "https://books.google.com/books/publisher/content/images/frontcover/abcDEF123?fife=w300-h450",
  "description": null,
  "total_pages": 416,
  "publisher": null,
  "published_date": null,
  "status": "to-read",
  "current_page": 0,
  "format": "hardcover",
  "ownership_status": "owned",
  "borrowed_from": null,
  "loaned_to": null
}
```
**Matching order:**
1. `book_id` (an existing Book row; an unknown id is ignored and falls through)
2. `google_books_id`
3. `isbn`
4. otherwise create a Book

`book_id` must be a **Book** id, never a userbook id; 4B's guard at `BookPreviewScreen.js` is correct.

**Response 200, unchanged:**
```json
{
  "id": 901, "user_id": 110, "book_id": 829, "status": "to-read", "current_page": 0, "rating": null,
  "format": "hardcover", "ownership_status": "owned",
  "created_at": "2026-09-14T10:00:00Z", "updated_at": "2026-09-14T10:00:00Z",
  "book": { "id": 829, "title": "Wuthering Heights", "author": "Emily Brontë", "description": null,
            "total_pages": 416, "cover_url": "…", "google_books_id": "abcDEF123" }
}
```
**Error 400**, when already in the caller's library, sequentially or by race:
```json
{"detail": "This book is already in your library in the 'Want to Read' tab."}
```

**Book sub-shapes** that 4B can hand to BookPreviewScreen. Each **includes** `google_books_id`, `isbn` and `total_pages` (the values may be `null`):
| Endpoint | Path in the response | Shape |
|---|---|---|
| `GET /books/recommendations` | each item | `{"id", "title", "author", "cover_url", "total_pages", "description", "reason", "friend_name", "google_books_id", "isbn"}` |
| `GET /userbooks/friends/currently-reading` | `[i].book` | `{"id", "title", "author", "cover_url", "total_pages", "google_books_id", "isbn"}` |
| (same) | `[i].user` | `{"id", "username", "name", "is_mutual", "profile_picture"}` |
| `GET /notes/feed`, `/notes/friends-feed`, `/notes/me`, `/notes/user/{id}` | `[i].book` | `{"id", "title", "author", "cover_url", "google_books_id", "isbn", "total_pages"}` or `null` |
| `GET /groups/{id}`, `POST /groups/`, `PUT /groups/{id}` | `.current_book` | `{"id", "title", "author", "cover_url", "google_books_id", "isbn", "total_pages"}` or `null` |
| `PUT /groups/{id}/book` | response body | `{"id", "title", "author", "cover_url", "google_books_id", "isbn", "total_pages"}` |

`GET /notes/userbook/{id}` `book` stays `{"id", "title", "author"}`: it is the owner's own book page.

### 2. F-15 — circle goal · **CONFIRMED (unchanged `/goal`; create accepts `goal_pages` + alias)**
**`POST /groups/`** (auth: user):
```json
{"name": "Review Circle", "description": "…", "is_private": false, "cover_preset": "teal",
 "goal_pages": 1000, "goal_period": "monthly", "invite_user_ids": []}
```
- `goal_pages` is canonical.
- `reading_goal` is still accepted as an alias when `goal_pages` is absent or null. If both are sent, `goal_pages` wins.
- `goal_period` in `monthly|yearly` stamps `goal_start_date`.
- The response is the full group object below (201).

**`GET /groups/{id}/goal`** (auth: user; a private group requires active membership, else 403). **Shape unchanged:**
```json
{"goal_pages": 1000, "goal_period": "monthly", "pages_read": 342, "pct": 34}
```
When the group has no goal: `{"goal_pages": null, "pages_read": 0, "pct": 0}`. Note: **no `goal_period` key** in that case, as today.

**`GET /groups/{id}`** gains two additive fields for shipped 2.2.1. 4B should read `/goal` instead:
```json
{"id": 7, "name": "Review Circle", "description": "…", "is_private": false, "invite_code": "…", "cover_preset": "teal",
 "created_by": 110, "creator_name": "Review.Reader", "goal_pages": 1000, "goal_period": "monthly",
 "goal_start_date": "2026-09-01T00:00:00", "current_book": { "…": "see §1" }, "member_count": 2,
 "membership_status": "active", "membership_role": "curator", "created_at": "2026-09-12T08:00:00",
 "reading_goal": 1000, "pages_read_total": 342}
```

### 3. F-23 — mark one notification read · **ADDED IN 4A (recommended yes; defined)**
**`POST /notifications/{id}/read`** (auth: user; no body).
- **200** when the row belongs to the caller. Idempotent: an already-read row also returns 200.
  ```json
  {"id": 5123, "is_read": true}
  ```
- **404** for another user's id or an unknown id. The response never reveals whether the row exists.
  ```json
  {"detail": "Notification not found"}
  ```
- After success, `GET /notifications/unread-count` → `{"unread": <n-1>}` and `GET /notifications/history` shows `"is_read": true` for that row.
- 4B's `notificationsAPI.markRead` and `NotificationsScreen.handleNotifPress` wiring can ship as written.

### 4. F-03 server half — push token reassignment · **CONFIRMED**
- **`POST /push-tokens/`** `{"token": "ExponentPushToken[…]"}` → `200 {"message": "Push token registered"}`. Any `expo` row holding this exact token for **another** user is deleted first. The caller then keeps exactly one `expo` row, with this token.
- **`POST /notifications/web-subscribe`** `{"subscription": {"endpoint": "…", "keys": {…}}, "device_info": "…"}` → `200 {"message": "Web push subscription registered"}`.
  - Every `web` row whose stored subscription has this `endpoint` is deleted first, for any user.
  - The caller's rows for *other* endpoints are kept.
  - A missing `endpoint` returns 400.
- **`DELETE /push-tokens/`** (unchanged) removes the caller's `expo` rows.
- **`DELETE /notifications/web-unsubscribe`** (same body as subscribe) removes only the caller's row for that endpoint.

**Status lines for 4B:**
- F-07: confirmed as assumed.
- F-15: confirmed; `/goal` unchanged.
- F-23: added in 4A, contract as assumed.
- F-03: server reassignment confirmed.

---

## Execution Plan — five parallel Builder packages, disjoint file sets

| Package | Scope | Files (exhaustive) |
|---|---|---|
| **A1** API: social, notes, push, auth, profile, notifications | F-01, F-02, F-03 api, F-06/F-49, F-07 (note card), F-08, F-17 api, F-18, F-23, F-50 (account delete), F-51 (notes, notifications), F-53 (like and follow handlers), F-55, F-59 (like, comment, follow, note) | `app/routers/auth_router.py`, `app/routers/likes_comments.py`, `app/routers/follow_router.py`, `app/routers/push_router.py`, `app/notifications/router.py`, `app/routers/notes_router.py`, `app/routers/profile_router.py`, `tests/test_auth.py`, `tests/test_notes.py`, `tests/test_push_tokens.py`, `tests/test_follow_profile.py`, `tests/test_notifications_api.py` (new), `tests/test_pydantic_v1_compat.py` (new) |
| **A2** API: catalogue, groups, insights, Google Books, admin, platform, data | F-01 orphan, F-07 (recommendations, friends-reading, groups, add-to-library), F-13/F-14, F-15, F-16 SQL, F-19, F-26 stats, F-29, F-33, F-50 (userbook and group delete), F-51 (rest), F-52, F-53 (models, migration, add handlers), F-54, F-56, F-58, F-59 (books, userbooks, groups) | `app/main.py`, `app/models.py` ⚑, `context/supabase_migration.sql` ⚑, `context/repairs/2026-09-rating-reset-repair.sql` (new), `app/routers/books_router.py`, `app/routers/userbooks_router.py`, `app/routers/groups_router.py`, `app/routers/reading_activity_router.py`, `app/routers/googlebooks_router.py`, `app/routers/admin_router.py`, `tests/test_books.py`, `tests/test_groups.py`, `tests/test_reading_activity.py`, `tests/test_admin.py`, `tests/test_googlebooks.py` (new), `tests/test_uniqueness.py` (new), `tests/test_security_headers.py` (new) |
| **B1** Web platform | F-03 web, F-20, F-22, F-23 web, F-24, F-26, F-27, F-29 web, F-57, F-10 inside its files | `src/services/api.js`, `src/context/AuthContext.jsx`, `public/sw-push.js`, `src/pages/NotificationsPage.jsx`, `src/pages/AdminPage.jsx`, `src/components/AppTour.jsx`, `src/pages/OnboardingPage.jsx`, `src/pages/AboutPage.jsx`, `src/pages/PrivacyPage.jsx`, `src/pages/TermsPage.jsx`, `src/utils/navigation.js` (new) |
| **B2** Web content pages | F-07 web, F-17 web (remembered choice + private-post toast), F-21, F-25, F-60, F-10 inside its files (including the synthetic cover) | `src/utils/noteVisibility.js` (pre-committed, read-only — import only), `src/components/VisibilityToggle.jsx` (new), `src/pages/GroupDetailPage.jsx`, `src/components/BookPreviewModal.jsx`, `src/pages/LibraryPage.jsx`, `src/pages/HomePage.jsx`, `src/pages/BookDetailPage.jsx`, `src/pages/ProfilePage.jsx`, `src/pages/SearchPage.jsx`, `src/i18n/locales/de.json`, `en.json`, `es.json`, `fr.json`, `pt.json`, `ru.json` |
| **C** Web styling | F-10 tokens and remaining pages | `tailwind.config.js`, `src/components/Nav.jsx`, `src/pages/CreateGroupPage.jsx`, `src/pages/GroupsPage.jsx`, `src/pages/InsightsPage.jsx`, `src/pages/LoginPage.jsx`, `src/pages/SettingsPage.jsx`, `src/pages/UserProfilePage.jsx` |

Web paths are relative to `book-tracker-frontend-stitch/`.

**Disjointness (verified by listing):**
- No file appears in two packages.
- A1 never edits `models.py`, and A2 never edits `notes_router.py`.
- The F-53 like/follow **tests** are in A2 (`test_uniqueness.py`), because they need A2's models. A1's handler code works with or without the constraint.
- F-59 is split by file: each package edits only its own call sites. No shared helper is added, since `BackgroundTasks.add_task` takes the existing functions directly.
- `LibraryPage.jsx` is B2 only; it moved from C because of the F-07 web fix.
- `src/utils/` holds `navigation.js` (new, B1) and `noteVisibility.js`. **`noteVisibility.js` is pre-committed on `master` by the PM** (2026-09-17, byte-identical to the block above) to resolve tests.md K-15: E2 needs `NOTE_VISIBILITY_KEY` in B1's `AuthContext.jsx` while the composers need `read`/`write` in B2, so neither package creates it and no package depends on another's build. It is **read-only for every Builder** — import from it, do not edit it, and do not use the literal `'bt_note_visibility'` anywhere else (ST-W-01).
- `tailwind.config.js` is C only.
- **In no package:**
  - `tests/conftest.py`
  - `app/deps.py`, `app/crud.py`, `app/auth.py`, `app/group_activity.py`
  - `app/notifications/dispatcher.py`, `config.py`, `push_web.py`, `push_mobile.py`, `scheduler.py`
  - `app/routers/import_router.py`, `users_router.py`, `meta_router.py`

**Cross-package dependencies (at merge, not at edit):**
- **B1 and B2 depend on C's tokens.** The build passes either way, but check visuals after all three merge.
- **B1 depends on:**
  - A2: `push_subscribed_users`, the `login_required` code, JSON 500s
  - A1: endpoint-based `web-unsubscribe`, `POST /notifications/{id}/read`
- **B2 depends on A2's** `book_id`/`isbn` matching. It is harmless before A2.

**Merge and deploy order:**
1. **PM:** run F-53 STEP 1, then STEP 2, then STEP 3 in Supabase, and confirm the three `uq_` indexes.
2. **Backend:**
   - Merge A1 + A2 together.
   - Run `pytest tests -q` green on the merged tree.
   - Run `python scripts/gen_dependency_map.py`.
   - Push, and do one Render deploy.
   - Confirm with `curl <api>/version` (commit) and `curl -I` (headers).
3. **Smoke:**
   - `PATCH /notifications/prefs` → 200.
   - `POST /auth/login` → 404.
   - `DELETE` a throwaway userbook that has progress → 200.
   - A forced 500 is not available in production; check `curl -H "Origin: https://www.trackmyread.com" "<api>/notes/feed?limit=-1"`, which is now a 422 with ACAO.
4. **Web:** merge C + B1 + B2, run `npm run build`, and do one Vercel deploy.
5. **PM:** F-16 part (a), then (b) and (c) after approval.
6. **Sprint 4B** Android 2.2.2 build: only after step 2 is live.

**Why the backend goes first:**
- Web consumes the new stats field, `book_id` matching, the endpoint-keyed unsubscribe, the mark-one-read route and `error.code`.
- Web Profile notes are created private between steps 2 and 4 (minutes); this is accepted.

## Files NOT to touch
- **Android:** everything under `book-tracker-mobile-stitch/`. That is Sprint 4B.
- **Sprint 1–3 security/auth code outside the listed items:** `app/deps.py`, `app/auth.py`, `auth_router.review_login` / `google_auth`, `meta_router.py`, `admin_router.set_admin_status` / `broadcast_push_notification`, `notifications/config.py`.
- `app/crud.py`, `app/group_activity.py`, `app/notifications/dispatcher.py`, `push_web.py`, `push_mobile.py`, `scheduler.py`.
- `app/routers/import_router.py`: F-53 residual, mention only.
- `tests/conftest.py`: F-08's counter fixture lives in `test_notes.py`.
- `googlebooks_router.normalize_google_cover_url`: `userbooks_router` imports it.
- `NoteOutSchema` and every existing response key.
- The `format.*` i18n keys.
- Production data beyond the two PM-run SQL files. The fixture-leftover SQL in the triage is the PM's.

## dependency-map.md
- **Curated section, updated in this change:** triage corrections 1–12, plus the 4A contract changes marked **(4A — in build)** until Doc Sync flips them.
- **The generated appendix** is regenerated by the backend Builder after merging A1+A2 (`python scripts/gen_dependency_map.py`). Expected diff:
  - rows `POST /auth/signup` and `POST /auth/login` disappear
  - `POST /notifications/{notification_id}/read` appears
  - the Google Books rows keep `⚠️ NONE`, correctly, since they are public and quota-limited per the curated note

## Security Review
**Closed by this sprint:**
- **F-02:** likes and comments are gated by the feed visibility rule; refused writes notify nobody.
- **F-03:** a device token or browser endpoint has one owner, so A's notifications (with names and note previews) stop reaching B.
- **F-01:** the pre-registration takeover path is gone. Password-hash rows from `signup` remain, but nothing accepts a password.
- **F-29:** the Google quota is no longer free for scripts; the residual is below.
- **F-52:** no out-of-range values, and no 500 on type confusion.
- **F-51:** no unbounded page size.
- **F-55:** no 500 on hostile uploads.
- **F-56:** nosniff, frame-deny, HSTS, referrer policy.
- **F-54 / F-58:** internal exception text is no longer echoed. 500s are JSON with no stack trace, and the details are logged server-side only.
- **F-23:** owner-checked, returns 404 (not 403) for others' ids, and does not reveal whether a row exists.

**Reviewed and safe:**
- **Token reassignment abuse** requires knowing the victim's Expo token or push endpoint. These are unguessable capability strings that no API returns (grep: the admin, users and profile routers expose no `token`). Even then, the victim's device would receive the attacker's notifications; the attacker would learn nothing.
- **`book_id` on add-to-library** reaches only existing catalogue rows, which are already searchable.
- **`pages_read_total`** sits behind the private-group membership gate, the same as `/goal`.
- **The IP hash** is salted per process, kept in memory, and never logged.
- **`push_subscribed_users`** is admin-only.
- **`?is_admin=true`:** the server allowlist still decides (`admin_router.py:334`).
- **F-59:** background tasks receive values captured at request time, and the authorization checks all run before scheduling. A background task can never act for a user the request didn't authorize.

**Residual risk:**
- **F-29: the quota keys on the right-most `X-Forwarded-For` entry,** which Render's proxy appends, falling back to `request.client.host`. A forged left-most value is ignored, so a caller cannot mint fresh IPs; `test_forged_leftmost_xff_counts_against_real_ip` covers this. **Residuals:**
  - Callers behind one NAT share a quota.
  - An attacker with many real IPs still gets 2 calls per IP.
  - If Render ever stopped appending the hop, or a CDN were placed in front, the right-most entry would change meaning. That would need a re-check.
- **F-29: the quota is per process.** It resets on restart, and a multi-worker deploy would multiply it (assumption: single uvicorn).
- **`_web_rows_for_endpoint` uses `LIKE '%…%'`,** which is fine at hundreds of rows. Add a hashed `endpoint` column at tens of thousands.
- **F-53:** `import_router` can still fail a whole import on a concurrent duplicate.
- **F-50:** SQLite tests cannot reproduce the FK 500 (no PRAGMA, by project rule). The adversarial probe re-run confirms it in production.
- **F-59:** a background failure loses that notification silently (logged).
- **F-16:** the false-positive class is described in that section.
- **F-17 and Android 2.2.1:** book-detail notes become private with no UI to change it until 4B. That is safe, not leaky.
- **`/users/search` returning private profiles' name and bio** (adversarial INFO) is unchanged.

## Assumptions
- **Production runs Pydantic 1.x** (`fastapi==0.95.2` requires `pydantic<2`). If wrong, F-49's root cause differs. The v1 snippets still run on v2, with deprecation warnings.
- **FastAPI stays 0.95.x for this sprint.** F-59 passes the request `db` Session into background tasks, which is valid only while background tasks run before `yield`-dependency exit (true before 0.106). **An upgrade to ≥ 0.106 must switch those tasks to open their own Session.** Add this to LOAD_ME_FIRST gotchas when F-59 ships.
- **Render puts the client IP in `X-Forwarded-For`** and appends its own proxy hop last. If wrong, only the parsing line changes.
- **The Render start command is a single uvicorn process.** If not, the anonymous quota is per worker.
- **External push calls take about 0.3–0.8 s each from Render** (used for F-59 estimates; not measured).
- **`notificationlog.data` is JSON/JSONB,** and `group_activity.payload` is TEXT holding `json.dumps` output.
- **No code writes `models.Journal`** (the Builder confirms by grep). If code does, add Journal cleanup to the F-50 deletes.
- **Production `group_activity` may lack `ON DELETE CASCADE`,** which is why the group delete is explicit.
- **Every `PATCH /userbooks/{id}` caller sends integer stars 0–5** (verified at 4 call sites).
- **Web SettingsPage fills the goal field before a save is possible** (`:160`). A save during the initial load would now clear the goal. The window is sub-second, and the same was already true for name and bio.
- **React Router 7 `BrowserRouter` writes `history.state.idx`.** If it ever stops, Back always goes home, which is safe.
- **Google Books yields nothing useful at `startIndex` ≥ 1000.** It is one constant.
- **Reset rows still carry `updated_at` from the bad write.** A later edit only causes a miss, never a false restore.

## Open Questions for PM (all resolved)
1. **Anonymous search IP source — Resolved (orchestrator default, 2026-09-13).** Use the **right-most** `X-Forwarded-For` entry (appended by Render's proxy), falling back to `request.client.host`. The earlier "first hop" instruction came from the orchestrator, not the PM, and would have let a caller forge a fresh IP.
2. **RESOLVED by PM 2026-09-13: starting position of the Public / Only me switch.** Every composer remembers the user's last choice in `localStorage.bt_note_visibility`. A user who has never chosen sees Only me. After a private Home post, a "Saved privately" toast shows and nothing is added to the feed.
3. **Duplicate library entries (F-53) — Resolved (orchestrator default, 2026-09-13): yes.** The kept (oldest) row absorbs the duplicates' progress and status: the maximum `current_page`, the most advanced status (`finished` > `reading` > `to-read`), and a non-null rating. Dependents (`note.userbook_id`, `reading_activity.userbook_id`, plus `group_post` and `journal`) are repointed to the kept row before the duplicate is deleted. See STEP 2c/2e/2f and the rollback.
4. **"Make Admin" — Resolved (orchestrator default, 2026-09-13): fix it,** still restricted to the server-side admin email allowlist. Flagged for the PM in the Risk Summary.
5. **New text colours (F-10) — Resolved (orchestrator default, 2026-09-13): ship `#586060` / `#636a6a`,** subject to contrast verification by `qa/a11y_audit.mjs` after deploy (0 `color-contrast` nodes on the 16 pages).

## Out-of-scope items this sprint depends on or unblocks
- **F-09** (not approved): F-08's loader is where review-account filtering would go later.
- **Production cover cleanup** (not approved): only meaningful after F-19 ships.
- **F-28 region move:** caps F-08 and F-59 at about 1–3 s per request. Re-measure `qa/api_perf.py` after both.
- **F-30, F-35..F-48:** later sprints. F-30 touches `likes_comments.py` after A1 merges.
- **Fixture-leftover SQL** (triage): a PM action. After F-50, userbook 864 also becomes deletable through the API.
- **Logged-out landing-page search box: NOT approved** (PM 2026-09-13). The anonymous Google Books quota and `apiFetch`'s `login_required` code still ship. No logged-out search UI and no login prompt page are built.

## Sprint 4B handoff — Android 2.2.2 (versionCode 61), built only after the 4A backend is live
The contracts are in "Contracts for 4B" above. The Android work that consumes them:
| Item | Android change | Files |
|---|---|---|
| F-03 | Reset the push guard per account; call `deregisterPushToken` on logout and account delete | `src/services/NotificationService.js`, `App.js`, `src/screens/SettingsScreen.js:288,297`, `src/screens/ProfileScreen.js:394` |
| F-07 | Send `book_id` (Book id only) and `isbn` to add-to-library | `src/screens/BookPreviewScreen.js` |
| F-13 | Read `yearly_goal.completed` | `src/screens/InsightsScreen.js:203`, `src/screens/ProfileScreen.js:407,520` |
| F-14 | Read `avg_rating`, `finished_this_year`, `projected_finish` | `src/screens/InsightsScreen.js:181,185,349,374,376` |
| F-15 | Send `goal_pages` + `goal_period`; read `GET /groups/{id}/goal` | `src/screens/GroupsScreen.js:93`, `src/screens/GroupDetailScreen.js:764-773`, `src/services/api.js` |
| F-17 | Public / Only me toggle on book-detail notes, sending `is_public` explicitly. The web decision (PM 2026-09-13) is to remember the last choice, defaulting to Only me; 4B should mirror it with AsyncStorage key `bt_note_visibility` if the 4B brief agrees | `src/screens/BookDetailScreen.js:172` |
| F-19 | Cover fallback for a null `cover_url` in search results | `src/screens/LibraryScreen.js:341,375` |
| F-22 | `EVENT_CONFIG` for `group_join_approved` (→ group) and `group_join_rejected` (→ Groups) | `src/screens/NotificationsScreen.js:22-37` |
| F-23 | `notificationsAPI.markRead(id)`; call it on row press when unread | `src/services/api.js`, `src/screens/NotificationsScreen.js` |
| F-29 / F-51 / F-52 / F-58 | No change needed. Android is always authenticated, in range and valid, and now receives readable 500 bodies | — |
| Alias removal | Once 2.2.2 is the minimum version: remove the insights aliases and the `reading_goal` create/GET aliases | backend, a later sprint |

## Build Notes
_Each Builder fills this in per package: what was built, files changed, diverged from brief, assumptions confirmed, explicitly not built, and verification output._
