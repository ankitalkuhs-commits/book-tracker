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
