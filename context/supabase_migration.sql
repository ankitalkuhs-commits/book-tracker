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

-- ── Done ──────────────────────────────────────────────────
SELECT 'Migration complete' AS status;
