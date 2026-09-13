# QA Rules of Engagement — testing TrackMyRead in production

Every agent and script that touches production follows this file. If a test needs to break a rule, **do not run it**. Record it under "Not run — needs PM decision" in your report.

## Targets
| | |
|---|---|
| Web | `https://www.trackmyread.com` |
| API | `https://book-tracker-stitch.onrender.com` (Render free tier: sleeps after 15 min, ~30 s cold start) |
| Build check | `GET /version` → commit SHA |

## Accounts
| Account | User id | Role in tests |
|---|---|---|
| `review.reader@trackmyread.com` | 110 | actor |
| `review.friend@trackmyread.com` | 111 | second user / "victim" for IDOR and privacy tests |

- **Login:** `POST /auth/review-login {email, secret}`. The secret comes from the `REVIEW_LOGIN_SECRET` env var or `<repo>/.env.review`.
- **Never** print, log, screenshot or write to any file: the secret, an access token, or an `Authorization` header. Redact tokens in any request log (`Bearer <redacted>`).
- `scripts/seed_review_accounts.py` restores the baseline fixture: 3 books each, notes, mutual follow, "Review Circle". It is idempotent.

## Allowed
- **Read** anything the review accounts can see, including other users' public feed posts and public groups. Read only.
- **Mutate** rows owned by user 110 or 111: their userbooks, progress, ratings, notes, comments on their own notes, likes on their own notes, the follow between them, their profile fields, notification prefs, "Review Circle" and its posts.
- **Adversarial calls** that are expected to be refused:
  - reader targets friend's ids, and friend targets reader's ids
  - unauthenticated calls
  - malformed or oversized input (at most 100 KB per request)
  - admin endpoints (expected 403)
- **Uploads:** at most 3 small images (< 200 KB) per run, attached to review-owned notes that are then deleted.
- **Goodreads import:** a CSV of at most 5 rows, imported into a review account. Delete the imported userbooks afterwards.

## Forbidden
- Any call whose path or body targets a user id, note, comment, group or userbook **not owned by 110/111**. That includes: follow or unfollow, like, comment, join or request to join, invite, approve, reject, remove member, delete.
  - Also forbidden: clicking "Join Circle" on any group other than Review Circle, "Follow" on any non-review user, and like/comment on any non-review post.
  - Reason: these notify or alter real people.
- Admin actions: broadcast push, set-admin, delete content, bot trigger. Even the 403 probe uses only `GET /admin/stats` and `POST /admin/push/broadcast` with an empty body, from a non-admin review account.
- Deleting either review account. This is an orchestrator-only step, done last, followed by a reseed.
- Load or stress testing. Keep to at most 5 requests/second sustained and at most 5 concurrent requests. Performance runs are sampled, not flooded.
- Leaving public test content behind. Test notes are `is_public: false` unless the test is about public visibility. Any public test note is deleted in the same run.
- Changing anything in Render, Vercel, Supabase, Cloudinary, GitHub or Play Console.

## Cleanup (mandatory)
- Record every id you create.
- Delete or restore each one before finishing: profile name/bio/private flag, prefs, likes, notes, comments, userbooks added by tests, group posts.
- **Assert** the cleanup (re-read and confirm). Report `created N / cleaned N`.
- If cleanup fails, stop and report. Do not keep testing on a dirty fixture.

## Hygiene
- Scratch files go only in the session scratchpad: `C:\Users\sonal\AppData\Local\Temp\claude\C--Users-sonal-Documents-projects-biodata\f99ba33a-3623-411e-9505-2b847ae0b8af\scratchpad\`. Filenames must include your agent role (e.g. `web-inventory-a-*.json`). Never use `/tmp`.
- Screenshots go under `qa/screenshots/` (gitignored; they contain real users' public posts).
- Reports go under `qa/reports/` (committed; no secrets, no tokens, no personal data beyond display names already public in the feed).
- Every shell command starts with `cd /c/Users/sonal/Documents/projects/book-tracker &&`. Touch no other project.
