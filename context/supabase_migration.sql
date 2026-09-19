-- ============================================================
-- TrackMyRead — Supabase Stitch DB Migration
-- Run in: Supabase → SQL Editor → New Query
-- Safe to run on existing data — only adds missing columns
-- ============================================================

-- ── user ──────────────────────────────────────────────────
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS profile_picture TEXT;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS yearly_goal INTEGER;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS last_active TIMESTAMP;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMP;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS deletion_reason TEXT;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS is_private_profile BOOLEAN DEFAULT FALSE;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS notification_prefs TEXT DEFAULT NULL;

-- ── book ──────────────────────────────────────────────────
ALTER TABLE book ADD COLUMN IF NOT EXISTS tags TEXT;
ALTER TABLE book ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE book ADD COLUMN IF NOT EXISTS publisher TEXT;
ALTER TABLE book ADD COLUMN IF NOT EXISTS published_date TEXT;
ALTER TABLE book ADD COLUMN IF NOT EXISTS format TEXT;
ALTER TABLE book ADD COLUMN IF NOT EXISTS pages_source TEXT;
ALTER TABLE book ADD COLUMN IF NOT EXISTS google_books_id TEXT;

-- ── userbook ──────────────────────────────────────────────
ALTER TABLE userbook ADD COLUMN IF NOT EXISTS rating INTEGER;
ALTER TABLE userbook ADD COLUMN IF NOT EXISTS private_notes TEXT;
ALTER TABLE userbook ADD COLUMN IF NOT EXISTS format TEXT DEFAULT 'hardcover';
ALTER TABLE userbook ADD COLUMN IF NOT EXISTS ownership_status TEXT DEFAULT 'owned';
ALTER TABLE userbook ADD COLUMN IF NOT EXISTS borrowed_from TEXT;
ALTER TABLE userbook ADD COLUMN IF NOT EXISTS loaned_to TEXT;
ALTER TABLE userbook ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP;

-- ── note ──────────────────────────────────────────────────
ALTER TABLE note ADD COLUMN IF NOT EXISTS emotion TEXT;
ALTER TABLE note ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE note ADD COLUMN IF NOT EXISTS quote TEXT;
ALTER TABLE note ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP;

-- ── pushtoken ─────────────────────────────────────────────
ALTER TABLE pushtoken ADD COLUMN IF NOT EXISTS token_type TEXT DEFAULT 'expo';
ALTER TABLE pushtoken ADD COLUMN IF NOT EXISTS device_info TEXT;
ALTER TABLE pushtoken ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP;

-- ── reading_activity ──────────────────────────────────────
-- Create if missing (newer table)
CREATE TABLE IF NOT EXISTS reading_activity (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES "user"(id),
    userbook_id INTEGER NOT NULL REFERENCES userbook(id),
    date TIMESTAMP DEFAULT NOW(),
    pages_read INTEGER DEFAULT 0,
    current_page INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ── reading_group ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reading_group (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    is_private BOOLEAN DEFAULT FALSE,
    invite_code TEXT,
    cover_preset TEXT DEFAULT 'teal',
    created_by INTEGER REFERENCES "user"(id),
    goal_pages INTEGER,
    goal_period TEXT,
    goal_start_date TIMESTAMP,
    current_book_id INTEGER REFERENCES book(id),
    created_at TIMESTAMP DEFAULT NOW()
);
ALTER TABLE reading_group ADD COLUMN IF NOT EXISTS invite_code TEXT;
ALTER TABLE reading_group ADD COLUMN IF NOT EXISTS cover_preset TEXT DEFAULT 'teal';
ALTER TABLE reading_group ADD COLUMN IF NOT EXISTS goal_pages INTEGER;
ALTER TABLE reading_group ADD COLUMN IF NOT EXISTS goal_period TEXT;
ALTER TABLE reading_group ADD COLUMN IF NOT EXISTS goal_start_date TIMESTAMP;
ALTER TABLE reading_group ADD COLUMN IF NOT EXISTS current_book_id INTEGER REFERENCES book(id);

-- ── group_member ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS group_member (
    id SERIAL PRIMARY KEY,
    group_id INTEGER NOT NULL REFERENCES reading_group(id),
    user_id INTEGER NOT NULL REFERENCES "user"(id),
    role TEXT DEFAULT 'member',
    status TEXT DEFAULT 'active',
    invited_by INTEGER REFERENCES "user"(id),
    joined_at TIMESTAMP DEFAULT NOW()
);
ALTER TABLE group_member ADD COLUMN IF NOT EXISTS invited_by INTEGER REFERENCES "user"(id);

-- ── group_post ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS group_post (
    id SERIAL PRIMARY KEY,
    group_id INTEGER NOT NULL REFERENCES reading_group(id),
    user_id INTEGER NOT NULL REFERENCES "user"(id),
    text TEXT NOT NULL,
    quote TEXT,
    userbook_id INTEGER REFERENCES userbook(id),
    created_at TIMESTAMP DEFAULT NOW()
);

-- ── notificationlog ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS notificationlog (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES "user"(id),
    actor_id INTEGER,
    event_type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    data JSONB,
    is_read BOOLEAN DEFAULT FALSE,
    sent_at TIMESTAMP DEFAULT NOW()
);

-- ── Reset all sequences ───────────────────────────────────
SELECT setval('user_id_seq',            COALESCE((SELECT MAX(id) FROM "user"), 1));
SELECT setval('book_id_seq',            COALESCE((SELECT MAX(id) FROM book), 1));
SELECT setval('userbook_id_seq',        COALESCE((SELECT MAX(id) FROM userbook), 1));
SELECT setval('note_id_seq',            COALESCE((SELECT MAX(id) FROM note), 1));
SELECT setval('follow_id_seq',          COALESCE((SELECT MAX(id) FROM follow), 1));
SELECT setval('like_id_seq',            COALESCE((SELECT MAX(id) FROM "like"), 1));
SELECT setval('comment_id_seq',         COALESCE((SELECT MAX(id) FROM comment), 1));
SELECT setval('pushtoken_id_seq',       COALESCE((SELECT MAX(id) FROM pushtoken), 1));
SELECT setval('notificationlog_id_seq', COALESCE((SELECT MAX(id) FROM notificationlog), 1));
SELECT setval('reading_activity_id_seq',COALESCE((SELECT MAX(id) FROM reading_activity), 1));
SELECT setval('reading_group_id_seq',   COALESCE((SELECT MAX(id) FROM reading_group), 1));
SELECT setval('group_member_id_seq',    COALESCE((SELECT MAX(id) FROM group_member), 1));
SELECT setval('group_post_id_seq',      COALESCE((SELECT MAX(id) FROM group_post), 1));

-- ── group_activity ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS group_activity (
    id          SERIAL PRIMARY KEY,
    group_id    INTEGER NOT NULL REFERENCES reading_group(id) ON DELETE CASCADE,
    user_id     INTEGER NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    event_type  VARCHAR(50) NOT NULL,
    payload     TEXT DEFAULT '{}',
    created_at  TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_group_activity_group ON group_activity(group_id);
SELECT setval('group_activity_id_seq',  COALESCE((SELECT MAX(id) FROM group_activity), 1));

-- ── group_post new columns (May 2026) ────────────────────
ALTER TABLE group_post ADD COLUMN IF NOT EXISTS emotion TEXT;
ALTER TABLE group_post ADD COLUMN IF NOT EXISTS image_url TEXT;

-- ── Done ──────────────────────────────────────────────────
SELECT 'Migration complete' AS status;

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

-- ════════════════════════════════════════════════════════════════════════════
-- Sprint 4C · F-62 · a reader's day is their own local day
-- Run STEP 1, then STEP 2, BEFORE the 4C branch is merged to master (and so before any
-- 4C backend deploy). Precondition: the Sprint 4A backend is live (GET /version = 4A SHA).
-- Both columns are nullable with no default: metadata-only in PostgreSQL, no table rewrite,
-- existing rows untouched. Re-running either step is harmless. Rollback at the end.
-- ════════════════════════════════════════════════════════════════════════════

-- STEP 1 — add the columns
ALTER TABLE "user"           ADD COLUMN IF NOT EXISTS timezone  VARCHAR(64);
ALTER TABLE reading_activity ADD COLUMN IF NOT EXISTS local_day BOOLEAN;

-- STEP 2 — READ-ONLY verify: must list exactly 2 rows, then both SELECTs must succeed
SELECT table_name, column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_schema = current_schema()
   AND ((table_name = 'user' AND column_name = 'timezone')
     OR (table_name = 'reading_activity' AND column_name = 'local_day'))
 ORDER BY table_name;
SELECT COUNT(*) AS users_with_zone        FROM "user"           WHERE timezone  IS NOT NULL;   -- 0 before deploy
SELECT COUNT(*) AS local_day_rows         FROM reading_activity WHERE local_day IS TRUE;       -- 0 before deploy

-- ROLLBACK (only AFTER the backend is back on a pre-4C SHA; pre-4C code never selects these
-- columns, so leaving them in place is also safe):
-- ALTER TABLE reading_activity DROP COLUMN IF EXISTS local_day;
-- ALTER TABLE "user"           DROP COLUMN IF EXISTS timezone;
