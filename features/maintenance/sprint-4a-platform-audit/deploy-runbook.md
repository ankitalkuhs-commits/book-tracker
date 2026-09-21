# Sprint 4A + 4B deploy runbook

**Who runs what:** steps marked **PM** touch the production database or a dashboard and are run by the PM. Steps marked **Claude** are run from this repo and only call the production API as the review accounts (`qa/RULES_OF_ENGAGEMENT.md`).

**Why the order matters:** the 4A backend declares unique constraints on `userbook`, `like` and `follow`. Production already contains duplicate rows (F-53), so those constraints cannot exist until the duplicates are gone. **Run the dedupe SQL before the backend deploy.** Deploying first gives you a backend whose model assumes uniqueness the database does not enforce, until STEP 3 runs.

Every SQL step below lives in a committed file. Paste from the file, not from this page, so the runbook can never drift from the SQL that was reviewed.

> ### Status 2026-09-21: Sprint 4D is also live (`7635aca`).
> Web only, no API or database change: pages fetch alongside `/profile/me` (F-69), the circle, book-detail and friend-profile sections load in parallel (F-70/b/c), and the GET cache is cleared on sign-out and sign-in (F-71, privacy). `qa/live_checks.py` passed 15/15 immediately after. Still unshipped and waiting on the PM: **4C** (needs its migration SQL first — its startup guard refuses to start without the columns) and **4E** (design only).
>
> ### ⚠️ Status 2026-09-20: 4A is already live. Pushing to `master` is the deploy.
> Render (backend) and Vercel (web) **auto-deploy on every push to `master`**. This runbook assumed a manual deploy after the SQL, but every 4A commit went live as it was pushed. Production served `6213ea0` when this was found.
> - **No breakage:** `qa/live_checks.py` passed **15/15** on the live 4A build. 4A's only model change is unique constraints, not columns, and nothing creates tables at startup, so the absent constraints crash nothing.
> - **What is still missing is protection, not uptime.** Until F-53 STEP 3 runs, a race can still create duplicate `userbook` / `like` / `follow` rows.
> - **So steps 3 and 4 below are done.** Run steps 1, 2 and 5 **now**, in the order written. STEP 2 is idempotent. If live traffic slips a new duplicate in between STEP 2 and STEP 3, STEP 3 fails loudly; then re-run STEP 2 and STEP 3.
> - **For Sprint 4C and anything else that adds a column:** the SQL must run **before the merge is pushed**, because the push itself is the deploy.

---

## 0. Before anything — Claude

- [ ] `master` is pushed, and `git ls-remote origin -h refs/heads/master` equals the local HEAD.
- [ ] `pytest tests -q` is green, allowing only the three F-62 day-boundary failures (see triage F-62; they fail 00:00–05:30 IST regardless of any change).
- [ ] G-E1 passes: `pytest tests/test_books.py -q -k "(book_id or dedup_keys) and not literal_paths and not nulls_group_post"` → `5 passed`.
- [ ] `npm --prefix book-tracker-frontend-stitch run build` exits 0.
- [ ] Record the SHA production serves now: `GET https://book-tracker-stitch.onrender.com/version`. It was `3157eee` on 2026-09-17.

## 1. F-16 baseline — PM, read-only (new step)

File: `context/repairs/2026-09-rating-reset-repair.sql`, **PART (a) only**.

- [ ] Run PART (a). Write down `restorable_rows`, `affected_users`, `candidates_before_reread_exclusions`.

**Why this runs now as well as later:** F-53's dedupe (step 2) sets each surviving row's `updated_at` to the latest in its duplicate group. F-16's evidence query only accepts rows with `updated_at < 2026-05-05`. So a row that is *both* a duplicate *and* bug-reset can drop out of F-16's window once the dedupe runs. PART (a) is read-only, so running it before and after costs nothing, and a lower count afterwards tells you exactly this happened. This check is not in tests.md; it was added by the PM review on 2026-09-18.

## 2. F-53 dedupe — PM, in Supabase, BEFORE the backend deploy

File: `context/supabase_migration.sql`, the block headed `Sprint 4A · F-53`. Run each step on its own.

- [ ] **STEP 1** (read-only): note `dup_groups` and `surplus_rows` for `userbook`, `like`, `follow`.
- [ ] **STEP 1b** (read-only): skim the side-by-side preview. The keeper is the lowest id. It absorbs the highest page, the most advanced status and a non-zero rating.
- [ ] **STEP 2** (one transaction):
  - It backs up into `dedupe_20260913_*` tables.
  - It re-points `note`, `reading_activity` and `group_post` rows to the keeper *before* deleting the surplus rows. This is the failure mode F-50 exposed, and it is handled.
  - If it errors, it rolls back as a whole. Stop and send the error.
- [ ] Re-run **STEP 1**. All three rows must now show `0`.
- [ ] **STEP 3**: creates `uq_userbook_user_book`, `uq_like_note_user`, `uq_follow_pair`, then lists them.
  - All three names must be listed.
  - It **fails loudly** if any duplicate survived, which is the intended behaviour.
  - Each `CREATE UNIQUE INDEX` briefly locks its table. At this data size that takes milliseconds, but don't run it during a traffic spike.

**Rollback:** the commented block at the end of the F-53 section. Drop the indexes first, then restore the data.

## 3. Deploy the backend — PM

- [ ] Deploy `master` on Render.
- [ ] Claude confirms `GET /version` returns the new SHA. **A deploy is not "live" until this matches.** Sprint 2 could never be confirmed for exactly this reason.

## 4. Deploy the web app — PM

- [ ] Deploy `master` on Vercel.
- [ ] Claude checks that the new bundle is being served (the asset hash differs from before) and that `/about`, `/privacy`, `/terms` → Back no longer blanks (F-57).

## 5. F-16 repair — PM

File: `context/repairs/2026-09-rating-reset-repair.sql`.

- [ ] Re-run **PART (a)** and compare it with step 1. If the count dropped, the difference is rows the dedupe moved, as explained in step 1.
- [ ] Run the (a2) preview and the (a3) recall check described in the file's comments.
  - If (a3) is much larger than (a), old APKs kept the bug after 2026-05-04.
  - Whether to widen the date is **your decision**. The file deliberately leaves it to you.
- [ ] Only after reviewing: uncomment and run **PART (b)** (backup), then **PART (c)** (restore, one transaction). Nothing in the file sends notifications.

## 6. Leftover QA fixture cleanup — mostly Claude now

These three came from the 2026-09-13 scenario runs on the **review.reader** test account (user 110). Two existed only because of bugs that 4A fixes, so after deploy they are done through the API. That also proves the fixes live.

| # | What | Before 4A | After 4A — who |
|---|---|---|---|
| 1 | Remove userbook 864 ("Aesop") and its reading activity | SQL only; the API returned 500 (F-50) | **Claude:** `DELETE /userbooks/864` as review.reader. A 2xx proves F-50 live. |
| 2 | Clear `deletion_requested_at` on user 110 | SQL | **PM, SQL.** No API clears it: `UPDATE "user" SET deletion_requested_at = NULL, deletion_reason = NULL WHERE id = 110;` |
| 3 | Clear review.reader's yearly goal | SQL; the API ignored `null` (F-18) | **Claude:** `PUT /profile/me {"yearly_goal": null}`, then `GET /profile/me` shows `null`. This proves F-18 live. |

If #1's `DELETE` fails after deploy, F-50 is **not** fixed in production. That is a finding, not something to route around with SQL.

## 7. Production verification — Claude

- [ ] `qa/live_checks.py`, all green.
- [ ] tests.md §8 production checks P-01..P-20.
- [ ] `qa/a11y_audit.mjs`: gate G-09 is **0** `color-contrast` nodes (baseline 203).
- [ ] `qa/api_perf.py`: `/notes/feed` against its 9.2 s / 114-query baseline (F-08).
- [ ] Screenshots of every main page as review.reader and review.friend, sent to the PM.
- [ ] Re-seed the fixture with `scripts/seed_review_accounts.py` if any check mutated it, then compare against the baseline.

## 8. Android 2.2.2 (vc61) — PM gate

Gated on steps 3 and 7: the app sends `book_id` for dedup, which needs the 4A backend live (E1).

- [ ] G-E1 re-run **on the deployed SHA**.
- [ ] Build the AAB via the manual-dispatch workflow `build-stitch-aab.yml`.
- [ ] PM device hard-gate checks (4B tests.md, device section).
- [ ] 100% Play rollout (PM-approved 2026-09-13). The final go is the PM's.

## Carried, not in this release

- **F-61:** no `/health` route (Low).
- **F-62:** UTC write vs local-date read for `last_active`. There is also a product question: whether a reading streak's "today" should be UTC or the reader's local day.
- **Unused files at the repo root:**
  - `reset_and_migrate.py` drops all tables.
  - `crash.txt` is a 3 MB logcat dump.
  - `build-mobile.ps1` is an 18-byte stub.
  - These await a PM decision.
