# Doc Sync Retro — 2026-09-13 Sprint 2

## Files Updated

| File | Action | Notes |
|---|---|---|
| `features/maintenance/sprint-2-audit-bugs/spec.md` | updated | status → `tested`, last_verified → 2026-09-13 |
| `features/maintenance/sprint-2-audit-bugs/learnings.md` | created | 6 learnings (tuple sort, month iteration, streak anchor, daily cap edge case, dead import, builder validation) |
| `features/maintenance/index.md` | updated | status → `tested` |
| `repos/api/index.md` | updated | Health section: pytest 213/0, seven fixes documented, carried items listed; last_verified → 2026-09-13 |
| `context/LOAD_ME_FIRST.md` | updated | Added September 13 Recently Shipped entry; Known Issues section rewritten (7 items from HIGH to MEDIUM/LOW after closures) |
| `context/INDEX.md` | updated | Added Maintenance feature row |
| `memory/project_sprint_2_audit_bugs.md` | created | Full sprint summary: R1–R7 shipped, 72/72 verdict, PM checklist, learnings, success metrics |
| `memory/MEMORY.md` | updated | Added one line referencing sprint-2-audit-bugs project file |

**Total: 8 files created/updated**

---

## Divergences: Spec vs. Built

| Item | Spec Said | Built | Resolution |
|---|---|---|---|
| Response shapes | No changes promised | No changes shipped | ✅ Contract maintained backward-compatible |
| R6 + R7 dispatch routing | `fire_event()` calls | Both routers now call `fire_event()` with correct event types | ✅ As specced |
| R1–R7 test verdict | 72/72 PASS | 72/72 PASS, pytest 213/0 | ✅ Exact match |
| Git hygiene commit | Separate R8 commit | Shipped as 8f421e5 | ✅ As specced |

**Verdict:** Zero divergences. All 72 test cases passed. All R1–R7 shipped as specced. Spec status updated to `tested`.

---

## Accepted Open Issues (Deferred, Not in Scope)

| Item | Category | Note | Deferral |
|---|---|---|---|
| `/auth/signup`, `/auth/login` (password auth) | Auth | Unused by both clients; decision pending on removal | PM decision on whether to keep or delete |
| `/api/googlebooks/*` (unauthenticated) | Auth | Landing page may want anonymous search; decision pending | Separate PM decision on auth |
| Dead client calls | Web + Mobile | `demoLogin` (web) and `userAPI.getUser` (mobile) need client edits + mobile build | Client team decision + build resources |
| DB repair for pre-May-4 bugs | Data | Users' finished books reset to to-read by old rating bug; repair needs explicit PM approval | PM decision on whether to run |
| Broadcast/reminder per-recipient | Performance | All users queued sequentially (fine at ~100, needs batching past ~1K) | Next sprint or infra decision |
| Unused `send_push_notification_to_user` import | Cleanup | Dead in `likes_comments.py`; module still used elsewhere | Don't delete module; flag for next cleanup pass |
| Junk file tracking | Hygiene | `.pyc`, `book_tracker.db`, `crash.txt` still tracked (pre-existing) | Batch removal in future cleanup pass |
| Missing `og-image.png` | Assets | Web root missing the referenced image file | Next sprint or deployment checklist |
| Vercel `build:ssg` unverified | Build | Web build script may not run correctly | Next sprint or CI setup |

---

## Needs PM Review

### Live Verification (After Render Deploy)

Run the spec Done Checklist 1–6 on live Render backend:

1. **Mutual-first order:** As user C who follows A (mutual) and B (non-mutual), with B's post newer:
   - Call `GET /notes/friends-feed`
   - Verify A's post appears **before** B's post
   - ✅ Test: T01 `PASS`

2. **Own note like state:** 
   - Like one of your own notes via `POST /notes/{id}/like`
   - Call `GET /notes/me`
   - Verify the liked note has `liked_by_me: true` and `user_has_liked: true`
   - Verify unliked notes have both keys as `false`
   - ✅ Test: T09 `PASS`

3. **Private note privacy in group activity:**
   - While in a group, post a private note (`is_public: false`)
   - Call `GET /groups/{id}/activity`
   - Verify there is **no** `note_posted` entry for the private note
   - ✅ Test: T15 `PASS`

4. **Insights months (no Feb skip):**
   - Call `GET /reading-activity/insights`
   - Check `monthly_pages` array
   - Verify it has exactly 12 entries with consecutive YYYY-MM strings (no gaps)
   - Verify February appears (month 02)
   - ✅ Test: T23, T24, T26 `PASS`

5. **No PII in logs:**
   - Call `GET /profile/me`
   - Check Render logs (`https://dashboard.render.com`)
   - Verify there is **no** `/profile/me response:` line containing the user's email
   - ✅ Test: T35 `PASS`

6. **Admin broadcast on web push:**
   - As admin, call `POST /admin/push/broadcast` with title/body
   - As a web-push subscriber, verify you receive the notification
   - Check `GET /notifications/history`
   - Verify there is an `admin_broadcast` row with correct title/body
   - ✅ Test: T49, T54 `PASS`

### Product Decisions (Still Pending from Sept 12 Audit)

1. **Remove legacy password endpoints?**
   - `/auth/signup` and `/auth/login` are unused by both web and mobile
   - Both use Google OAuth only
   - **Recommendation:** Remove them (dead code)
   - **Defer to:** PM (keep or remove?)

2. **Add auth to Google Books search?**
   - `/api/googlebooks/search` and `/api/googlebooks/book/{id}` are currently `NONE` (unauthenticated)
   - Landing page may want anonymous search capability
   - **Recommendation:** Keep unauthenticated (supports landing page)
   - **Defer to:** PM (confirm or add auth?)

### Items Requiring Explicit Approval

1. **DB repair for pre-May-4 rating bug:**
   - Users who rated books before May 4, 2026 had book status reset to "to-read" by old `handleRating` bug
   - This is now fixed going forward (rating goes through PATCH)
   - Historical books need restoration (restore `status: finished` for rows with rating > 0 and `status: to-read`)
   - **Defer to:** PM approval to run the repair script

2. **Mobile build for dead-call removal:**
   - `userAPI.getUser` in mobile `App.js` hits a route that doesn't exist
   - `web` `demoLogin` in LoginPage also dead (doesn't exist)
   - Both need client edits + new mobile EAS build + app store submission
   - **Defer to:** Client team (remove calls, rebuild, release)

---

## Sprint Metrics

| Metric | Value |
|---|---|
| Test Verdict | PASS 72/72 (100% all verdicts) |
| Pytest Summary | 213 passed, 0 failed (was 150; sprint-2 +63 new tests) |
| Test Cases Written | 72 (R1–R7 core + R8 hygiene + R9 regression) |
| Response Shape Changes | 0 (all backward compatible) |
| DB Migrations Required | 0 (all tables pre-existing) |
| Client Changes | 0 (no version bump, no rebuilds) |
| Files Modified | 14 backend + test + doc files |
| Privacy/Auth Cases (P0/Critical) | 11 (all PASS) |
| Major Cases (P0/P1) | 58 (all PASS) |
| Spec Divergences | 0 |
| Commits Shipped | 2 (f20bb08 fixes + tests, 8f421e5 git hygiene) |

---

## Context Updated

- ✅ Spec status → `tested`, last_verified → 2026-09-13
- ✅ Feature index (maintenance) status → `tested`
- ✅ Repo API health updated: pytest 213/0, seven fixes listed, carried items documented
- ✅ LOAD_ME_FIRST: Sept 13 Recently Shipped entry added (concise, same style as Sept 12)
- ✅ LOAD_ME_FIRST: Known Issues updated (closed 3 HIGH items from sprint 1, rebalanced to MEDIUM/LOW + 2 new PM decisions)
- ✅ INDEX.md: added Maintenance feature row
- ✅ Memory file created (project_sprint_2_audit_bugs.md) + MEMORY.md index updated
- ✅ Learnings file created with 6 items for next person

---

## Deliverables

1. **Spec + Architecture + Tests + Code Map:** `features/maintenance/sprint-2-audit-bugs/`
   - spec.md: status tested, R1–R7 shipped
   - architecture.md: comprehensive brief, risk summary, parity analysis
   - tests.md: 72 test cases, verdict PASS 2026-09-13
   - code-map.md: file changes, consumers verified
   - learnings.md: 6 learnings for next person

2. **Feature Index:** `features/maintenance/index.md` status tested

3. **Repo Health:** `repos/api/index.md` updated with pytest 213/0 + all seven fixes documented + carried items

4. **Context:** LOAD_ME_FIRST (Sept 13 entry + Known Issues), INDEX (Maintenance row), dependency-map still current

5. **Memory:** project_sprint_2_audit_bugs.md created for persistence across sessions

---

## Notes

- Two commits shipped (f20bb08 R1–R7 fixes + 63 tests, 8f421e5 git hygiene) and pushed to origin/master 2026-09-13
- Render auto-deploys on push; live should match spec by 2026-09-13 ~08:30 UTC
- PM must run spec Done Checklist items 1–6 on live after deploy to verify against production
- All privacy cases (R2, R3) and consent cases (R6 pref gate) passed; no regressions
- Next sprint can tackle carried items: PM decisions, dead calls, DB repair, performance batching, cleanup passes
- Six learnings captured for next hardening sprint (tuple sorting, month iteration, streak anchoring, timing edge case, dead import cleanup, builder validation)
