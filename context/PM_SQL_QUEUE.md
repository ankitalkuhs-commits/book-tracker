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

## 6. Sprint 4F — the `is_bot` column — WRITES, and it gates the 4F deploy

Run this **before** the Sprint 4F API deploy. `app/schema_guard.py` refuses to start when a
column it requires is absent, so skipping this turns into a failed deploy (the previous version
keeps serving) rather than a service that boots and then 500s on every `User` query.

```sql
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS is_bot BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS ix_user_is_bot ON "user" (is_bot);

UPDATE "user" SET is_bot = true
 WHERE email IN ('tmrbot@trackmyread.com','tmrprompts@trackmyread.com',
                 'tmrquotes@trackmyread.com','tmrcircles@trackmyread.com');

-- E-9: rename @TMRBot and give it a bio that opens "Automated account."
UPDATE "user"
   SET name = 'TrackMyRead Bestsellers',
       bio  = 'Automated account. Weekly picks from the New York Times bestseller lists.'
 WHERE email = 'tmrbot@trackmyread.com';
```

The `ALTER` is metadata-only on every supported PostgreSQL version (a non-volatile default does
not rewrite the table). The index is its own statement because creating indexes is never
bundled in this project — you decide it.

**Verify — send the output back.**

```sql
-- 1 row now (@TMRBot only); exactly 4 rows after migrations/add_bot_accounts.py has run
SELECT id, email, username, is_bot, is_admin FROM "user" WHERE is_bot;
-- must return 0 — a bot is never an admin (R-01)
SELECT count(*) FROM "user" WHERE is_bot AND is_admin;
-- must return 0 — every bot bio opens "Automated account." (E-9)
SELECT count(*) FROM "user" WHERE is_bot AND COALESCE(bio,'') NOT LIKE 'Automated account.%';
```

---

## 7. Sprint 4F — the `bot_post` table — WRITES, additive

Run this straight after step 6, and still before the deploy: `schema_guard` requires
`bot_post.dedup_key`, and a missing table produces no `information_schema.columns` row either.

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

`uq_bot_post` is where dedup correctness lives: the API writes this row inside the note's own
transaction, so a collision rolls the note back with it and no post is created.

**Verify — send the output back.**

```sql
SELECT column_name FROM information_schema.columns
 WHERE table_schema = current_schema() AND table_name = 'bot_post' AND column_name = 'dedup_key';
SELECT indexname FROM pg_indexes WHERE tablename = 'bot_post';
```

Steps 6 and 7 are additive, re-runnable, and touch no existing row of any other table.
`editorial_post` is left exactly as it is — it becomes read-only history (R-14).

---

## 8. Sprint 4G — the `user.apple_sub` column — WRITES, additive, and it gates the 4G deploy

Run this **before** the Sprint 4G API deploy. `schema_guard` requires `user.apple_sub`, so the
commit that adds it refuses to start until this has run (that is the guard working: Render fails
the deploy and the previous version keeps serving).

```sql
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS apple_sub VARCHAR(255);
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_apple_sub ON "user" (apple_sub);
```

Nullable, no default: the `ALTER` is metadata-only and no existing row is rewritten. Every
current reader stays `NULL`, which is correct — they have no Apple identity. The unique index
ignores `NULL`s, so thousands of Google-only readers coexist while at most one row can ever hold
a given Apple subject. **That index is where the correctness lives**: Apple hands over the email
only on the first authorization, so this column is the identity for every later sign-in, and two
concurrent first sign-ins must not both win. The index is its own statement because creating
indexes is never bundled in this project — you decide it.

**Verify — send the output back.**

```sql
-- 1 row: character varying, YES
SELECT column_name, data_type, is_nullable FROM information_schema.columns
 WHERE table_schema = current_schema() AND table_name = 'user' AND column_name = 'apple_sub';
-- 1 row: a CREATE UNIQUE INDEX definition
SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'user' AND indexname = 'uq_user_apple_sub';
-- must return 0: nothing has been written yet
SELECT count(*) FROM "user" WHERE apple_sub IS NOT NULL;
```

---

## 9. Sprint 4H — the `user.apple_refresh_token` column — WRITES, additive, and it gates the 4H deploy

Run this **before** the Sprint 4H API deploy. `schema_guard` requires `user.apple_refresh_token`,
so the commit that adds it refuses to start until this has run (that is the guard working:
Render fails the deploy and the previous version keeps serving).

This is the column that makes Apple token revocation actually work. Sprint 4G shipped the
revocation call with the Apple **subject** in it, and Apple's `auth/revoke` only accepts a
refresh or access token — so every call would have answered `400` and the reader's Apple ID
would have kept listing TrackMyRead under "Apps Using Apple ID", which is the item App Review
checks. 4H exchanges Apple's one-time authorization code for a refresh token and stores it here.

```sql
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS apple_refresh_token VARCHAR(512);
```

Nullable, no default, no index: the `ALTER` is metadata-only and no existing row is rewritten.
Every current reader stays `NULL`, which is correct — a reader only gets a value the next time
they sign in with Apple on a build that sends the code.

**No index, and that is deliberate.** Nothing ever looks a reader up by this value, and an index
on a credential is that credential sitting in one more place on disk and in one more backup.

**What is stored is a ciphertext, not the token.** The value is sealed with Fernet
(AES-128-CBC + HMAC-SHA256) under `APPLE_TOKEN_KEY`, which lives only in the Render environment.
With `APPLE_TOKEN_KEY` unset the application writes **nothing** to this column and revocation
stays inert, exactly as it is today — there is no plaintext fallback. 512 characters is the
ciphertext length with room to spare; Apple's own token is about 60.

**Verify — send the output back.**

```sql
-- 1 row: character varying, 512, YES
SELECT column_name, data_type, character_maximum_length, is_nullable
  FROM information_schema.columns
 WHERE table_schema = current_schema()
   AND table_name = 'user' AND column_name = 'apple_refresh_token';
-- must return 0 rows: this column is deliberately NOT indexed
SELECT indexname FROM pg_indexes
 WHERE tablename = 'user' AND indexdef LIKE '%apple_refresh_token%';
-- must return 0: nothing has been written yet
SELECT count(*) FROM "user" WHERE apple_refresh_token IS NOT NULL;
```

Step 9 is additive, re-runnable, and touches no existing row of any table.

---

## 10. Sprint 4I-A — the `report` table — WRITES, additive, and it gates the 4I-A deploy

> **Applied to production 2026-10-11 and verified: 13 columns, indexes `report_pkey` / `uq_report_once` / `ix_report_open`, 0 rows.**
> `"user"` row count unchanged at 131. Nothing below needs running again —
> the statements are `IF NOT EXISTS`, but re-running a done step wastes a
> round of PM attention, which is the scarce thing here.

Run this **before** the Sprint 4I-A API deploy. `schema_guard` requires `report.reason`, so the
commit that adds it refuses to start until this has run (that is the guard working: Render fails
the deploy and the previous version keeps serving).

This is the table behind `POST /reports`. App Store Review Guideline 1.2 item 2 requires a way to
report offensive content, with timely responses, and there is none in the product today — 131
readers have no way to flag anything. The report queues for a human and changes nothing anyone
else sees.

```sql
CREATE TABLE IF NOT EXISTS report (
    id              SERIAL PRIMARY KEY,
    reporter_id     INTEGER      NOT NULL,
    target_type     VARCHAR(16)  NOT NULL,   -- note | comment | group_post | user
    target_id       INTEGER      NOT NULL,
    target_user_id  INTEGER,                 -- the author, denormalised at creation
    reason          VARCHAR(32)  NOT NULL,
    detail          VARCHAR(1000),
    target_snapshot VARCHAR(2000),
    status          VARCHAR(16)  NOT NULL DEFAULT 'open',
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at     TIMESTAMP,
    resolved_by     INTEGER,
    resolution      VARCHAR(500)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_report_once ON report (reporter_id, target_type, target_id);
CREATE INDEX IF NOT EXISTS ix_report_open ON report (status, created_at DESC);
```

**No foreign keys, deliberately.** A report has to outlive the content it is about: the admin
deletes the reported note, the report row stays with `status = 'actioned'`, and `target_id`
dangles. A moderation record that vanishes with the content cannot show a pattern, and a pattern
across reports is the only way one abusive reader is visible. `bot_post.note_id` carries audit
information with no foreign key for the same reason.

**`uq_report_once` is where the correctness lives.** One reader may report a given thing exactly
once, for ever. It is enforced here and not in the handler, so two concurrent submissions cannot
both win, and it is what makes the queue's per-target count mean something.

**`target_snapshot` is a copy of a reader's words in a second table**, and that is a privacy cost
paid on purpose: without it a resolved report is an id and a reason. The controls are the length
cap, admin-only access on both routes, and deletion with the reporter's account.

**Verify — send the output back.**

```sql
-- 13 rows: the columns above, with their types and lengths
SELECT column_name, data_type, character_maximum_length, is_nullable
  FROM information_schema.columns
 WHERE table_schema = current_schema() AND table_name = 'report'
 ORDER BY ordinal_position;
-- 3 rows: report_pkey, uq_report_once, ix_report_open
SELECT indexname FROM pg_indexes WHERE tablename = 'report' ORDER BY indexname;
-- must return 0: nothing has been written yet
SELECT count(*) FROM report;
```

Step 10 is additive, re-runnable, and touches no existing row of any table.

---

## 11. Sprint 4I-B — the `block` table — WRITES, additive, and it gates the 4I-B deploy

> **Applied to production 2026-10-11 and verified: 4 columns, indexes `block_pkey` / `uq_block_pair` / `ix_block_blocked`, 0 rows.**
> `"user"` row count unchanged at 131. Nothing below needs running again —
> the statements are `IF NOT EXISTS`, but re-running a done step wastes a
> round of PM attention, which is the scarce thing here.

Run this **after** step 10 has run and the 4I-A API is deployed, and **before** the Sprint 4I-B
API deploy. These are two separate deploys, not one. `schema_guard` requires `block.blocked_id`,
so the commit that adds it refuses to start until this has run (that is the guard working: Render
fails the deploy and the previous version keeps serving).

This is the table behind `POST /blocks/{user_id}`. App Store Review Guideline 1.2 item 3 requires
the ability to block abusive users, and there is none in the product today. A block is symmetric
in visibility and interaction, asymmetric in control — only the blocker sees it or can lift it,
and the blocked reader is never told.

```sql
CREATE TABLE IF NOT EXISTS block (
    id          SERIAL PRIMARY KEY,
    blocker_id  INTEGER   NOT NULL,
    blocked_id  INTEGER   NOT NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_block_pair ON block (blocker_id, blocked_id);
CREATE INDEX IF NOT EXISTS ix_block_blocked ON block (blocked_id);
```

**One row per block, read both ways.** The row records who blocked whom; the symmetry is in the
read, not the storage. Two rows per block would double every write and would make "only the
blocker can lift it" a convention rather than a fact about the data.

**`uq_block_pair` is what makes a double block idempotent** under concurrency: the handler
catches the unique violation and returns the state the caller asked for, so tapping Block twice
is never a 500 and never a second row.

**`ix_block_blocked` is the one index this design needs at runtime.** Every filtered request runs
`WHERE blocker_id = :me OR blocked_id = :me`; `uq_block_pair` covers the first arm, and without
an index on `blocked_id` the second arm is a sequential scan on every one of them. At 131 readers
that is free — it is here so it does not have to be found later.

**No foreign keys**, matching `report`. The account-deletion cascade deletes both directions
itself, and a foreign key would turn a missed cascade step into a 500 instead of the orphan row
the verification query below looks for.

**Verify — send the output back.**

```sql
-- 4 rows: id, blocker_id, blocked_id, created_at
SELECT column_name, data_type, character_maximum_length, is_nullable
  FROM information_schema.columns
 WHERE table_schema = current_schema() AND table_name = 'block'
 ORDER BY ordinal_position;
-- 3 rows: block_pkey, ix_block_blocked, uq_block_pair
SELECT indexname FROM pg_indexes WHERE tablename = 'block' ORDER BY indexname;
-- must return 0: nothing has been written yet
SELECT count(*) FROM block;
```

Step 11 is additive, re-runnable, and touches no existing row of any table.

---

## What Claude does with each answer

| You send | Claude does |
|---|---|
| 1. index list | names the missing indexes, their cost, and a `CREATE INDEX` proposal for your approval |
| 2. duplicate counts | confirms whether 2b is needed, then verifies the constraints exist afterwards |
| 3. verify output | merges Sprint 4C (deploys it), then checks `/version` and re-runs the live checks |
| 4. three counts | reviews (a) against (a3) and recommends whether to widen the date before (b)/(c) |
| 6. bot rows + 0/0 | merges Sprint 4F's API package, which deploys it, then checks `/version` |
| 7. dedup_key + both index names | confirms `schema_guard` will pass, then runs `migrations/add_bot_accounts.py` |
| 8. column row + index row + 0 | deploys Sprint 4G's API package (the commit carrying `("user","apple_sub")` in `schema_guard`), then checks `/version` |
| 9. column row + no index + 0 | deploys Sprint 4H's API package (the commit carrying `("user","apple_refresh_token")` in `schema_guard`), then checks `/version` |
| 10. 13 column rows + 3 index names + 0 | deploys Sprint 4I-A's API package (the commit carrying `("report","reason")` in `schema_guard`), then checks `/version` and files one real report end to end |
| 11. 4 column rows + 3 index names + 0 | deploys Sprint 4I-B's API package (the commit carrying `("block","blocked_id")` in `schema_guard`), then checks `/version` and runs the two invariant queries: no `follow` row survives for a blocked pair, and no `block` row points at a missing `user.id` |
