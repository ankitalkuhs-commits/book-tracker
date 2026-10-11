"""Sprint 4I-B package P6 — the classification of EVERY route in the app (B-32, F3).

This is the enumeration R-22's table is, written as something a test can hold. Each
`(method, path)` pair carries one of three verdicts and a reason, and
`tests/test_route_coverage.py` asserts that the set of keys EQUALS the set of routes the app
registers. A route added later and not classified here fails CI; a route removed and left here
fails CI too. That is the whole point: R-22's table was built by reading the routers on one day
and decays the moment somebody adds an endpoint.

  FILTERED      the response carries another reader's name, avatar or words, and a blocked
                pair's is removed from it or the whole response is 404'd. Fourteen paths, each
                with a both-directions case in `tests/test_blocks.py::FILTERED_PATHS`.
  REFUSED       a non-GET that answers a blocked pair with 403 or 404 before any row is written
                and before any notification is registered.
  NOT_SERVING   everything else, each with the reason it needs no filter. The reasons fall into
                a few groups: the reader's own content; ids or aggregates only; admin-only
                (moderation needs the unfiltered truth); unauthenticated; a write of the
                reader's own data; or a row that CANNOT EXIST for a blocked pair, which is the
                strong form of "not filtered" and is pinned by `PINNED_UNFILTERED` in the test.

THE DECISION RULE, so a future endpoint is classified without re-litigating:
**if a response carries another reader's name, avatar or words, it is filtered or 404'd; if it
carries only an id or an aggregate, it is not.**

Data lives here and assertions live in the test, so a reviewer can read the whole
classification in one place.
"""
FILTERED = "FILTERED"
REFUSED = "REFUSED"
NOT_SERVING = "NOT_SERVING"

# Measured on this branch with
#   {(m, r.path) for r in app.routes if isinstance(r, APIRoute) for m in r.methods if m != "HEAD"}
# 112 pairs after Sprint 4I-A, 115 after 4I-B's three (`POST` and `DELETE /blocks/{user_id}`,
# `GET /blocks`). Never typed from a document — re-measured, and a difference means a route
# arrived from another branch and this guard is doing its job.
EXPECTED_ROUTE_PAIRS = 115
EXPECTED_FILTERED = 14
EXPECTED_REFUSED = 7
EXPECTED_NOT_SERVING = 94

OWN = "the reader's own content only — no other reader is named"
IDS = "ids or aggregates only; no other reader's name, avatar or words"
ADMIN = ("admin-only; moderation needs the unfiltered truth, so /admin/* is never filtered "
         "(R-22 row 23, B-28)")
WRITE_OWN = "a write of the reader's own data; it serves no other reader's content"
NOAUTH = "unauthenticated — there is no viewer, so there is no block set (E-8)"
BOOK = "a book is not a reader's content"
PASSTHROUGH = "a Google Books passthrough; it carries no reader data of any kind"

CLASSIFICATION = {
    # ── FILTERED (14): R-22's table, each with a both-directions case ─────────────────────
    ("GET", "/notes/feed"):
        (FILTERED, "the first screen after login; the author is filtered (R-22 row 1)"),
    ("GET", "/notes/friends-feed"):
        (FILTERED, "filtered as defence in depth over R-21's invariant (R-22 row 2)"),
    ("GET", "/notes/user/{user_id}"):
        (FILTERED, "a profile's notes are the subject's content; 404 before the private gate "
                   "(R-22 row 3)"),
    ("GET", "/notes/{note_id}/comments"):
        (FILTERED, "a blocked reader's comment under a third party's post, text and all "
                   "(R-22 row 4, K-4I-06)"),
    ("GET", "/profile/{user_id}"):
        (FILTERED, "identity, bio, avatar and counts; 404 before the private gate (R-22 row 6)"),
    ("GET", "/users/{user_id}/stats"):
        (FILTERED, "reading stats are the subject's; 404 before the private gate (R-22 row 7)"),
    ("GET", "/users/search"):
        (FILTERED, "a block that leaves the reader findable by name is not a block (R-22 row 8)"),
    ("GET", "/users/following"):
        (FILTERED, "the response carries name, username and bio (R-22 row 9)"),
    ("GET", "/userbooks/user/{user_id}"):
        (FILTERED, "their library; 404 before the private gate (R-22 row 10)"),
    ("GET", "/userbooks/friends/currently-reading"):
        (FILTERED, "carries user.name and profile_picture per row (R-22 row 11)"),
    ("GET", "/books/recommendations"):
        (FILTERED, "carries friend_name — a recommendation reading 'Because B is reading this' "
                   "is B reaching the reader (R-22 row 12)"),
    ("GET", "/reading-activity/user/{user_id}/daily"):
        (FILTERED, "their day-by-day activity; 404 before the private gate (R-22 row 13)"),
    ("GET", "/groups/{group_id}/posts"):
        (FILTERED, "a circle both belong to: the content goes, the structure stays "
                   "(R-22 row 14, E-2)"),
    ("GET", "/groups/{group_id}/activity"):
        (FILTERED, "carries user.name at every event row (R-22 row 15, E-2)"),

    # ── REFUSED (7): a non-GET that refuses before any row and any notification ───────────
    ("POST", "/follow/{followed_id}"):
        (REFUSED, "403 before the self-follow check, before any row and before add_task "
                  "(R-21, R-24, B-05)"),
    ("POST", "/notes/{note_id}/like"):
        (REFUSED, "404 through _assert_can_view_note's blocked-pair branch (R-22 row 5)"),
    ("POST", "/notes/{note_id}/comments"):
        (REFUSED, "404 through the same branch; a comment would otherwise fire a push at the "
                  "blocker, which bypasses every filter above"),
    ("POST", "/groups/{group_id}/invite/{user_id}"):
        (REFUSED, "403 before the row and before add_task — inviting is contact (R-22 row 18)"),
    ("POST", "/groups/{group_id}/join"):
        (REFUSED, "403 on the PENDING branch, so the row GET /groups/{id}/pending serves cannot "
                  "exist (pm-decisions Q-1). A public circle joins instantly and is not refused: "
                  "a block does not control circle membership (E-2)"),
    ("POST", "/groups/join/{invite_code}"):
        (REFUSED, "the same refusal — the invite code is a second door into the same pending row "
                  "(pm-decisions Q-1)"),
    ("POST", "/reports"):
        (REFUSED, "404 for a note or comment the viewer may not see, and for a blocked user "
                  "target (pm-decisions Q-2's full rule)"),

    # ── NOT_SERVING (94): each with the reason it needs no filter ─────────────────────────
    ("DELETE", "/admin/content/comment/{comment_id}"): (NOT_SERVING, ADMIN),
    ("DELETE", "/admin/content/note/{note_id}"): (NOT_SERVING, ADMIN),
    ("DELETE", "/blocks/{user_id}"):
        (NOT_SERVING, "lifts the reader's OWN block row; only the blocker can reach it, and a "
                      "missing row is a no-op 200 that reveals nothing (R-20, R-28)"),
    ("DELETE", "/books/{book_id}"): (NOT_SERVING, ADMIN),
    ("DELETE", "/follow/{followed_id}"):
        (NOT_SERVING, "removes the reader's own follow row; R-21 has already deleted it for a "
                      "blocked pair"),
    ("DELETE", "/groups/{group_id}"):
        (NOT_SERVING, "a curator deleting their own circle; it serves no reader's content"),
    ("DELETE", "/groups/{group_id}/book"):
        (NOT_SERVING, "a curator clearing the circle's current book; no reader content"),
    ("DELETE", "/groups/{group_id}/decline"):
        (NOT_SERVING, "the reader declining their OWN pending invite"),
    ("DELETE", "/groups/{group_id}/leave"):
        (NOT_SERVING, "the reader leaving a circle themselves; a block never ejects anybody (E-2)"),
    ("DELETE", "/groups/{group_id}/posts/{post_id}"):
        (NOT_SERVING, "owner or curator deleting a post; a block is not a moderation power"),
    ("DELETE", "/groups/{group_id}/remove/{user_id}"):
        (NOT_SERVING, "a curator's existing power over their own circle, unchanged by any "
                      "block (E-2)"),
    ("DELETE", "/notes/{note_id}"): (NOT_SERVING, WRITE_OWN),
    ("DELETE", "/notes/{note_id}/like"):
        (NOT_SERVING, "pm-decisions struck R-24's unlike refusal: the handler loads no note, and "
                      "withdrawing a like the reader left themselves is not a leak"),
    ("DELETE", "/notifications/web-unsubscribe"): (NOT_SERVING, WRITE_OWN),
    ("DELETE", "/push-tokens/"): (NOT_SERVING, WRITE_OWN),
    ("DELETE", "/userbooks/{userbook_id}"): (NOT_SERVING, WRITE_OWN),
    ("GET", "/"): (NOT_SERVING, NOAUTH),
    ("GET", "/admin/books"): (NOT_SERVING, ADMIN),
    ("GET", "/admin/content/comments"): (NOT_SERVING, ADMIN),
    ("GET", "/admin/content/notes"): (NOT_SERVING, ADMIN),
    ("GET", "/admin/follows"): (NOT_SERVING, ADMIN),
    ("GET", "/admin/reports"): (NOT_SERVING, ADMIN),
    ("GET", "/admin/stats"): (NOT_SERVING, ADMIN),
    ("GET", "/admin/users"): (NOT_SERVING, ADMIN),
    ("GET", "/api/googlebooks/book/{google_book_id}"): (NOT_SERVING, PASSTHROUGH),
    ("GET", "/api/googlebooks/search"): (NOT_SERVING, PASSTHROUGH),
    ("GET", "/blocks"):
        (NOT_SERVING, "the reader's OWN outbound blocks, and never the inbound ones, because the "
                      "blocked reader must learn nothing (R-20, R-28, B-07)"),
    ("GET", "/books/"): (NOT_SERVING, BOOK),
    ("GET", "/books/search"): (NOT_SERVING, BOOK),
    ("GET", "/books/{book_id}"): (NOT_SERVING, BOOK),
    ("GET", "/bots/posted"):
        (NOT_SERVING, "bot-only (it 403s a reader) and it returns dedup keys, no reader data"),
    ("GET", "/follow/followers"):
        (NOT_SERVING, "PINNED: ids only, and the row cannot exist for a blocked pair under "
                      "R-21's invariant; filtering would desynchronise the follow button"),
    ("GET", "/follow/following"):
        (NOT_SERVING, "PINNED: the same, and it returns followed_id rather than follower_id"),
    ("GET", "/groups/discover"):
        (NOT_SERVING, "PINNED: the only identity is creator_name; hiding it would hide the circle"),
    ("GET", "/groups/invites/pending"):
        (NOT_SERVING, "PINNED: the reader's own invites, and a blocked pair's row is deleted by "
                      "the block in the same transaction (pm-decisions Q-1)"),
    ("GET", "/groups/my"):
        (NOT_SERVING, "PINNED: the only identity is creator_name; hiding it would hide the circle"),
    ("GET", "/groups/my/pending"):
        (NOT_SERVING, "the reader's own pending requests; the only identity is the circle's "
                      "creator_name, and a blocked pair's row is deleted (Q-1)"),
    ("GET", "/groups/{group_id}"):
        (NOT_SERVING, "PINNED: the only identity is creator_name; hiding it would hide the circle"),
    ("GET", "/groups/{group_id}/goal"):
        (NOT_SERVING, "a page total for the whole circle — an aggregate, with no names (E-2)"),
    ("GET", "/groups/{group_id}/leaderboard"):
        (NOT_SERVING, "PINNED: a viewer-dependent leaderboard is not a leaderboard (E-2)"),
    ("GET", "/groups/{group_id}/members"):
        (NOT_SERVING, "PINNED: membership is structure, and hiding it desynchronises "
                      "member_count (E-2, B-26)"),
    ("GET", "/groups/{group_id}/pending"):
        (NOT_SERVING, "PINNED: a decision only the curator can take, so filtering it would hide "
                      "that decision for ever; the block deletes the row instead (Q-1)"),
    ("GET", "/import/covers-status"): (NOT_SERVING, ADMIN),
    ("GET", "/notes/me"): (NOT_SERVING, OWN),
    ("GET", "/notes/userbook/{userbook_id}"): (NOT_SERVING, OWN),
    ("GET", "/notifications/admin/events"): (NOT_SERVING, ADMIN),
    ("GET", "/notifications/history"):
        (NOT_SERVING, "PINNED: history is a log; rewriting it makes a notification that WAS "
                      "delivered vanish (R-22 row 20, B-30)"),
    ("GET", "/notifications/prefs"): (NOT_SERVING, OWN),
    ("GET", "/notifications/unread-count"): (NOT_SERVING, IDS),
    ("GET", "/notifications/vapid-public-key"):
        (NOT_SERVING, "a server public key; it carries no reader data at all"),
    ("GET", "/profile/me"): (NOT_SERVING, OWN),
    ("GET", "/reading-activity/daily"): (NOT_SERVING, OWN),
    ("GET", "/reading-activity/insights"): (NOT_SERVING, OWN),
    ("GET", "/userbooks/"): (NOT_SERVING, OWN),
    ("GET", "/userbooks/{userbook_id}"): (NOT_SERVING, OWN),
    ("GET", "/version"): (NOT_SERVING, NOAUTH),
    ("PATCH", "/admin/reports/{report_id}"): (NOT_SERVING, ADMIN),
    ("PATCH", "/notifications/admin/events/{event_type}/toggle"): (NOT_SERVING, ADMIN),
    ("PATCH", "/notifications/prefs"): (NOT_SERVING, WRITE_OWN),
    ("PATCH", "/userbooks/{userbook_id}"): (NOT_SERVING, WRITE_OWN),
    ("POST", "/admin/push/broadcast"):
        (NOT_SERVING, "an announcement from TrackMyRead, not from a reader, and it does not go "
                      "through fire_event, so R-25's suppression does not apply to it"),
    ("POST", "/admin/push/test/{user_id}"): (NOT_SERVING, ADMIN),
    ("POST", "/admin/set-admin/{user_id}"): (NOT_SERVING, ADMIN),
    ("POST", "/auth/apple"): (NOT_SERVING, NOAUTH),
    ("POST", "/auth/bot-login"): (NOT_SERVING, NOAUTH),
    ("POST", "/auth/delete-account"):
        (NOT_SERVING, "the reader's own account; the cascade removes their blocks both ways "
                      "(R-08, B-33)"),
    ("POST", "/auth/delete-account/me"):
        (NOT_SERVING, "the reader's own account; the cascade removes their blocks both ways "
                      "(R-08, B-33)"),
    ("POST", "/auth/google"): (NOT_SERVING, NOAUTH),
    ("POST", "/auth/review-login"): (NOT_SERVING, NOAUTH),
    ("POST", "/blocks/{user_id}"):
        (NOT_SERVING, "the block route itself: a bot cannot reach it, a self-block is 400, and a "
                      "second block is the same 200 as the first (R-27, B-02, B-03, B-04)"),
    ("POST", "/books/"): (NOT_SERVING, BOOK),
    ("POST", "/books/add-to-library"): (NOT_SERVING, WRITE_OWN),
    ("POST", "/groups/"):
        (NOT_SERVING, "creating the reader's own circle; no other reader is named"),
    ("POST", "/groups/{group_id}/accept"):
        (NOT_SERVING, "the reader accepting their OWN pending invite; a blocked pair's invite no "
                      "longer exists (pm-decisions Q-1)"),
    ("POST", "/groups/{group_id}/approve/{user_id}"):
        (NOT_SERVING, "a curator acting on a pending row; a blocked pair's row cannot exist "
                      "(pm-decisions Q-1)"),
    ("POST", "/groups/{group_id}/posts"):
        (NOT_SERVING, "the reader posting their own words into a circle they belong to; a block "
                      "hides the post from the other reader and does not prevent it (E-2)"),
    ("POST", "/groups/{group_id}/reject/{user_id}"):
        (NOT_SERVING, "a curator acting on a pending row; a blocked pair's row cannot exist "
                      "(pm-decisions Q-1)"),
    ("POST", "/import/fix-covers-batch"): (NOT_SERVING, ADMIN),
    ("POST", "/import/goodreads"): (NOT_SERVING, WRITE_OWN),
    ("POST", "/notes/"): (NOT_SERVING, WRITE_OWN),
    ("POST", "/notes/upload-image"): (NOT_SERVING, WRITE_OWN),
    ("POST", "/notifications/admin/test/{event_type}/{user_id}"): (NOT_SERVING, ADMIN),
    ("POST", "/notifications/mark-read"): (NOT_SERVING, WRITE_OWN),
    ("POST", "/notifications/web-subscribe"): (NOT_SERVING, WRITE_OWN),
    ("POST", "/notifications/{notification_id}/read"): (NOT_SERVING, WRITE_OWN),
    ("POST", "/profile/me/picture"): (NOT_SERVING, WRITE_OWN),
    ("POST", "/push-tokens/"): (NOT_SERVING, WRITE_OWN),
    ("POST", "/userbooks/"): (NOT_SERVING, WRITE_OWN),
    ("POST", "/userbooks/{userbook_id}/finish"): (NOT_SERVING, WRITE_OWN),
    ("PUT", "/groups/{group_id}"):
        (NOT_SERVING, "a curator editing their own circle; it carries no reader content"),
    ("PUT", "/groups/{group_id}/book"):
        (NOT_SERVING, "a curator setting the circle's book, and a book is not a reader's content"),
    ("PUT", "/notes/{note_id}"): (NOT_SERVING, WRITE_OWN),
    ("PUT", "/profile/me"): (NOT_SERVING, WRITE_OWN),
    ("PUT", "/userbooks/{userbook_id}/progress"): (NOT_SERVING, WRITE_OWN),
}


def unclassified(pairs) -> list:
    """The pairs CLASSIFICATION has no verdict for, as "METHOD /path" strings.

    A pure function with no app import, so `tests/test_route_coverage.py` can call it with a
    synthetic extra pair and prove the detector is able to fail at all (rules 3 and 14 — a
    detector that asserted "at most one" would be green when it found none).
    """
    return sorted(f"{m} {p}" for m, p in pairs if (m, p) not in CLASSIFICATION)
