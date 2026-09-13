---
screen: review-login
feature: auth
repo: api (+ scripts/, .gitignore)
status: production
last_verified: 2026-09-13
approved_by: PM (2026-09-13 — "create similar dummy accounts to login … so that you can take screenshots [and] understand the deployment is working")
---

## What It Does
Gives QA (Claude agents, the PM, future app-store reviewers) a way to log into TrackMyRead without a Google account, so screenshots and live post-deploy checks can be run against production. Modelled on the School ERP review accounts (allowlisted emails + a fixed secret), adapted to this app's Google-only auth. Also adds `GET /version` so any Render deploy can be confirmed with one request — sprint 2 could not be confirmed at all.

## Appetite
Max complexity: simple (1 day). Backend + a seed script. No client change, no mobile build, no DB migration (review users are ordinary `user` rows).

Not building:
- A password/OTP login form in either client — the JWT is obtained via the API and, for web screenshots, placed in `localStorage.bt_token`
- Removing `/auth/signup` + `/auth/login` — still the PM's decision (this feature makes them fully redundant; recommend removing next sprint)
- Auth on `/api/googlebooks/*` — still the PM's decision
- Hiding review accounts from the community feed / admin stats — mention if it becomes a problem
- Rate limiting (there is none anywhere; the secret's length is the defence)

## Requirements
- [ ] R1 **`POST /auth/review-login`** — body `{email, secret}`. Behaviour, in order:
  1. If `REVIEW_LOGIN_SECRET` or `REVIEW_LOGIN_EMAILS` env var is unset/empty → `404 Not Found` (the route is invisible in environments that have not opted in — local dev, tests unless they set the vars, any fork).
  2. Email not in the comma-separated `REVIEW_LOGIN_EMAILS` allowlist (case-insensitive, trimmed) → `401`.
  3. `secret` ≠ `REVIEW_LOGIN_SECRET` (constant-time comparison, `hmac.compare_digest`) → `401`. Same body for 2 and 3 — no enumeration of which failed.
  4. Otherwise: find the user by email, or create it exactly as `/auth/google` does (random `password_hash`, `name` = the part before `@` title-cased, e.g. "Review.Reader"), bump `last_active` once per day, and return **the same shape as `/auth/google`**: `{access_token, is_new, user: {id, name, email}}`.
  5. Allowlisted emails must all end in `@trackmyread.com`; the endpoint refuses (500 at startup is NOT acceptable — refuse at request time with 401) any allowlisted email that does not, so a mistyped env var can never open login for a real user's Gmail.
- [ ] R2 **`GET /version`** — unauthenticated; returns `{"commit": <RENDER_GIT_COMMIT or null>, "service": <RENDER_SERVICE_NAME or null>, "branch": <RENDER_GIT_BRANCH or null>}`. Nothing else (no env dump).
- [ ] R3 **Seed script `scripts/seed_review_accounts.py`** — runs from a developer machine against any base URL: `python scripts/seed_review_accounts.py --base-url https://book-tracker-stitch.onrender.com` reads `REVIEW_LOGIN_SECRET` from the environment or from a gitignored `.env.review` file at the repo root (`KEY=value` lines). Logs in as `review.reader@trackmyread.com` and `review.friend@trackmyread.com` via R1 and, **through the public API only** (never the DB), ensures: each has 3 books from Google Books search (one `reading` with progress logged, one `finished` with a rating, one `to-read`), 2 public notes each (one with an emotion, one with a quote), reader follows friend and friend follows reader (mutual), a public circle "Review Circle" curated by reader with friend as member and one group post. Idempotent: re-running adds nothing (checks before creating; `add-to-library` duplicates are caught by the existing 400). Prints a summary and both user ids. Exit non-zero on any failure.
- [ ] R4 `.gitignore` gains `.env.*` (so `.env.review` can never be committed). `context/deployment/README.md` gains a "Review accounts" section: the two env vars, how to generate the secret (`python -c "import secrets; print(secrets.token_urlsafe(32))"`), how to run the seed, how to obtain a token with curl, how to log a browser in (`localStorage.setItem('bt_token', …)` then open `/home`).
- [ ] R5 Tests: R1 all five branches (404 when unset, 401 wrong email, 401 wrong secret, 401 non-trackmyread allowlist entry, 200 + shape + `is_new` true then false, `last_active` set); R2 shape with and without env vars; the token returned by R1 works on `GET /profile/me`. Tests set/unset the env vars with `monkeypatch` and must not leak them between tests. `pytest tests -q` green (was 213).
- [ ] R6 `python scripts/gen_dependency_map.py` re-run; both new routes appear (`/auth/review-login` will show ⚠️ no-auth — expected and documented in the curated section as "gated by env allowlist + secret, 404 when unconfigured").

## Screen States
Not applicable — no UI. Client behaviour is unchanged; a browser with a review JWT in `bt_token` behaves exactly like a Google-signed-in user.

## Done Checklist
1. Local: backend with `REVIEW_LOGIN_*` set, `curl -X POST /auth/review-login` with the right secret → 200 + token; wrong secret → 401; vars unset → 404.
2. Local: seed script runs twice against `http://127.0.0.1:8000`; second run reports 0 created.
3. Local: web dev server, `bt_token` set from the review token → `/home` shows the feed with the friend's notes, `/library` shows 3 books, `/groups` shows Review Circle — screenshots captured into `qa/screenshots/2026-09-13-local/`.
4. **Production (after PM sets the env vars on Render):** `GET /version` returns the pushed commit; seed against Render; the same three screenshots against `https://www.trackmyread.com` into `qa/screenshots/<date>-prod/`; the sprint-2 live checks 1–4 (friends-feed order, own-note likes, private note absent from circle activity, 12 consecutive months) run as `review.reader`.

## Parity
- [x] api
- [ ] web — no change (token injection only)
- [ ] mobile — no change; screenshots BLOCKED without a device build
