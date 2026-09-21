# Moving the API from Oregon to Singapore

**Why.** The API runs in Oregon, the database in Singapore, so every query crosses the Pacific. Measured on production from the `Server-Timing` header: **182–251 ms per query**, and a page makes 5–12 of them. Application code costs a few milliseconds. This is the largest single cost on every signed-in page and no code change can remove it (F-68).

**What Render allows.** A service's region is fixed at creation and cannot be changed; Render's own answer is to create a new service in the new region ([Regions](https://render.com/docs/regions)). Suspending does not help. A service's `onrender.com` address cannot be changed either, and a deleted name is not immediately reusable ([community](https://community.render.com/t/reusing-old-url/26327), [feature request](https://feedback.render.com/features/p/ability-to-change-onrendercom-sub-domain)), so "delete the old one and take its name" is not dependable.

**The constraint that shapes the plan.** Installed Android apps have `https://book-tracker-stitch.onrender.com` compiled in (`book-tracker-mobile-stitch/src/services/api.js:7`). They keep calling the old address until each reader updates, so the old service must keep answering for a while.

**Expected result.** Signed-in pages roughly **3–6 s → 0.4–0.6 s**: queries drop from ~200 ms to 1–2 ms each, and India-to-Singapore is ~60–80 ms against ~290 ms to Oregon.

## Why Singapore, and why the database stays put (asked 2026-09-21)

**Render has no India region.** Its regions are Oregon, Ohio, Virginia, Frankfurt and Singapore ([docs](https://render.com/docs/regions)). Singapore is its closest to India.

**Supabase is already in Singapore**, so the nearest location both can share needs only the API to move. Do **not** move the database.

| setup | per query | reader → API | signed-in page |
|---|---|---|---|
| today: API Oregon, DB Singapore | ~200 ms × 5–12 | ~290 ms | 3–6 s |
| **API Singapore, DB Singapore** | **1–2 ms** | ~60–80 ms | **~0.4–0.6 s** |
| API Singapore, DB Mumbai | ~50–70 ms × 5–12 | ~60–80 ms | ~1–1.5 s |

Moving the database to Mumbai would be a **regression against this plan**: same-region is what collapses the query cost, and Singapore↔Mumbai puts a cross-region hop back on every query.

**Mumbai for both** would need a different host. Fly.io has a Mumbai region, worth roughly 0.1–0.2 s per page over Singapore (readers ~20–30 ms from the API instead of ~60–80 ms), at the cost of a platform migration, a database migration, and a region with reported operational problems ([1](https://community.fly.io/t/region-bom-not-operational/27588), [2](https://community.fly.io/t/unable-to-scale-machines-to-region-bom/23142)). Not recommended for that margin; revisit only if leaving Render for other reasons.

---

## Two settings that must be copied exactly

Both are already supported by the code; they only need the same values on the new service.

| Variable | If it differs |
|---|---|
| `SECRET_KEY` | **Every reader is signed out.** It signs the login tokens; a new value invalidates all of them. |
| `VAPID_PRIVATE_KEY` / `VAPID_PUBLIC_KEY` | **Web push silently stops** for everyone already subscribed. Browsers tie a subscription to the key that created it. |

Full list to copy: `DATABASE_URL`, `SECRET_KEY`, `CORS_ORIGINS`, `GOOGLE_BOOKS_API_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_CONTACT_EMAIL`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `REVIEW_LOGIN_SECRET`, `REVIEW_LOGIN_EMAILS`.

Two new ones this migration uses (both off unless set, tests in `tests/test_region_migration.py`):

| Variable | Meaning |
|---|---|
| `RUN_SCHEDULER=0` | This service schedules no reminders. **Exactly one service may run the scheduler** while both are live, or every reader gets each evening reminder twice. |
| `API_REDIRECT_BASE=https://…` | This service stops serving and forwards everything to that base with **307** (keeps method and body, not cached permanently). `/version` still answers locally so the service can be identified. |

---

## Step 1 — create the Singapore service (nothing changes for readers)

- New Web Service, same repo and branch (`master`), **region Singapore**, same plan, same build and start commands.
- Copy every variable above. Set **`RUN_SCHEDULER=0`** for now: Oregon keeps sending the reminders until cutover.
- Deploy. It will have its own `…onrender.com` address; that is fine, it is temporary.

**Verify before going further** (Claude runs these): `GET /version` returns the current commit; `qa/live_checks.py` passes 15/15 against the new address; `Server-Timing` on `/profile/me` shows **db ≈ 5–15 ms** instead of ~1000 ms. That number is the whole point of the migration — if it is not there, stop.

Both services now talk to the same database. That is safe: same code, same schema, and only Oregon schedules reminders.

## Step 2 — put a stable address in front of it

Add the custom domain **`api.trackmyread.com`** to the Singapore service and create the DNS record Render shows. A custom domain is the part that can move between services later; an `onrender.com` address cannot.

Verify: `https://api.trackmyread.com/version` answers, with a valid certificate.

## Step 3 — move the web app (most readers benefit here)

Set `VITE_API_BASE_URL=https://api.trackmyread.com` in Vercel and redeploy; update `book-tracker-frontend-stitch/.env` in the repo to match.

Verify: the site loads, sign-in works, and `qa/page_perf.mjs` shows signed-in pages at roughly 0.4–1.0 s. Rollback is one variable and a redeploy.

## Step 4 — cut the reminders over

On **Singapore** set `RUN_SCHEDULER=1`; on **Oregon** set `RUN_SCHEDULER=0`. Order matters only in that both must never be `1` at once. Do it outside 8 PM IST, the reminder window.

## Step 5 — point the old address at the new service

On **Oregon** set `API_REDIRECT_BASE=https://api.trackmyread.com`. Installed apps keep working: their requests are forwarded, method and body intact.

Counter-intuitively this makes those readers **faster, not slower**: the extra hop costs one round trip (~0.3 s), while the queries it saves cost ~0.2 s each and a page makes 5–12.

Verify: `curl -i https://book-tracker-stitch.onrender.com/profile/me` returns `307` with the new `Location`, and `/version` on that host still answers locally.

## Step 6 — ship the app with the new address

Android 2.2.3 (already being prepared for Sprint 4C) changes `api.js:7` to `https://api.trackmyread.com`. After it is released, Oregon only serves readers who have not updated.

## Step 7 — retire Oregon

When the Play console shows the old versions nearly gone, delete the Oregon service. Keep it while it costs little: a redirect service is cheap, and deleting it strands anyone who never updates.

---

## Rollback

| After step | To undo |
|---|---|
| 1–2 | Delete the new service. Nothing pointed at it. |
| 3 | Restore `VITE_API_BASE_URL` in Vercel, redeploy. |
| 4 | Swap the two `RUN_SCHEDULER` values back. |
| 5 | Remove `API_REDIRECT_BASE` from Oregon. It serves normally again at once — the 307 is not cached permanently, which is why it is not a 308. |
| 6 | An app release cannot be recalled, which is why `api.trackmyread.com` must stay pointed at a working service from then on. |

## Notes

- **Do not repoint the database.** It is already in Singapore; moving the service is what closes the gap.
- Sprint 4E (fewer queries per request) is worth shipping regardless: it cuts the count, this cuts the cost of each.
- After the move, revisit `pool_pre_ping` (one extra round trip per request, ~175 ms today, ~2 ms afterwards — keep it) and re-run `qa/page_perf.mjs` to record the new baseline.
