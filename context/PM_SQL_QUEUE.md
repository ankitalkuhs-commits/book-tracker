# SQL queue for the PM — everything waiting on Supabase access

Claude has no database access, so these are the only outstanding items it cannot do. Each block says whether it **reads** or **writes**, and what to send back.

Run them in the Supabase **SQL Editor**, in this order. Steps 1 and 2 only read. Nothing here depends on the hosting move (the API/database region change) — run them before or after it, whichever suits.

Status of everything else, for context: Sprint 4A and Sprint 4D are live. Sprint 4C is code-complete and blocked only by step 3 below. Sprint 4E (query cuts) is in build.

---

## 1. Index check — READ ONLY (finding F-74)

Several indexes are declared in `app/models.py` (`index=True`) but appear in neither `create_tables.sql` nor `context/supabase_migration.sql`. If the production tables were created from those scripts, the indexes do not exist and those queries scan whole tables.

```sql
SELECT tablename, indexname FROM pg_indexes
 WHERE schemaname = 'public'
 ORDER BY tablename, indexname;
```

**Send the output back.** Expected to exist, among others: an index on `group_member`, `group_post`, `notificationlog`, `note.is_public`, `note.created_at`, `userbook.status`, plus the primary keys. Claude will say exactly which are missing and what each one costs. **Creating any index is a separate decision**, never bundled into a sprint.

---

## 2. Duplicate counts — READ ONLY (finding F-53)

From `context/supabase_migration.sql`, the block headed `Sprint 4A · F-53`, **STEP 1**. It reports how many duplicate `userbook`, `like` and `follow` rows exist.

**Send the three numbers back.** They decide whether step 2b below is needed at all.

### 2b. Dedupe and add the unique constraints — WRITES (only after 2)

Same file: **STEP 1b** (read-only preview), then **STEP 2** (one transaction, backs rows up into `dedupe_20260913_*` tables and re-points notes, reading activity and circle posts to the surviving row), then re-run **STEP 1** to confirm zeros, then **STEP 3** (creates the three unique indexes).

- STEP 3 fails loudly if any duplicate survived. That is intended: re-run STEP 2, then STEP 3.
- Readers are using the site meanwhile, so a fresh duplicate can appear between the two steps.
- A full rollback is at the end of the block.

---

## 3. Sprint 4C migration — WRITES, and it unblocks the release

Two nullable columns. In PostgreSQL this is metadata-only: no table rewrite, existing rows untouched, safe to re-run.

```sql
-- STEP 1 — add the columns
ALTER TABLE "user"           ADD COLUMN IF NOT EXISTS timezone  VARCHAR(64);
ALTER TABLE reading_activity ADD COLUMN IF NOT EXISTS local_day BOOLEAN;
```

```sql
-- STEP 2 — READ-ONLY verify: must list exactly 2 rows, and both counts must be 0 before deploy
SELECT table_name, column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_schema = current_schema()
   AND ((table_name = 'user' AND column_name = 'timezone')
     OR (table_name = 'reading_activity' AND column_name = 'local_day'))
 ORDER BY table_name;
SELECT COUNT(*) AS users_with_zone FROM "user"           WHERE timezone  IS NOT NULL;
SELECT COUNT(*) AS local_day_rows  FROM reading_activity WHERE local_day IS TRUE;
```

**Send back the verify output.** Then Claude merges Sprint 4C, which deploys it.

**Order matters, and it is the reverse of the usual instinct:** the SQL must run **before** the merge, because pushing to `master` *is* the deploy. 4C's backend refuses to start if either column is missing — a deliberate guard, so a skipped migration becomes a failed deploy rather than the April login outage.

---

## 4. Rating-reset repair — READ ONLY first (finding F-16)

File `context/repairs/2026-09-rating-reset-repair.sql`, **PART (a) only**. It counts books that the old Android rating bug reset to "Want to Read", using independent evidence that the reader had finished them, and excludes anyone who simply re-read the book.

**Send back the three counts** (`restorable_rows`, `affected_users`, `candidates_before_reread_exclusions`), plus the (a2) preview and the (a3) recall check described in the file. Parts (b) and (c) — the backup and the actual restore — stay commented out until you have seen those numbers.

Run PART (a) **before** the F-53 dedupe as well if you can: the dedupe moves each surviving row's `updated_at`, which can push a repairable book out of PART (a)'s window. Running it twice costs nothing and makes that visible.

---

## 5. One leftover from QA — WRITES, tiny

A 2026-09-13 QA scenario left a deletion request on the **review.reader** test account (user 110). The other two leftovers are already cleaned up through the API (2026-09-21): userbook 864 was deleted, which proved F-50 fixed live, and the yearly goal was cleared, which proved F-18 fixed live. No API clears this one.

```sql
UPDATE "user" SET deletion_requested_at = NULL, deletion_reason = NULL WHERE id = 110;
```

---

## What Claude does with each answer

| You send | Claude does |
|---|---|
| 1. index list | names the missing indexes, their cost, and a `CREATE INDEX` proposal for your approval |
| 2. duplicate counts | confirms whether 2b is needed, then verifies the constraints exist afterwards |
| 3. verify output | merges Sprint 4C (deploys it), then checks `/version` and re-runs the live checks |
| 4. three counts | reviews (a) against (a3) and recommends whether to widen the date before (b)/(c) |
