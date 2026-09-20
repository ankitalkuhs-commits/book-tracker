"""Static checks on the F-16 repair SQL and the F-53 migration section (T-A2-87..100).

Neither file is ever executed against SQLite — these are text-shape checks only.

Note: this file is not in the architecture's Package A2 "exhaustive" file list, but
tests.md section 3 requires it for F-16/F-53 coverage and names no other home for these
ids. Added anyway, flagged in Build Notes (see builder.md: "needs files outside the
brief" is a documented deviation, not a silent one).
"""
import re

REPAIR_SQL_PATH = "context/repairs/2026-09-rating-reset-repair.sql"
MIGRATION_SQL_PATH = "context/supabase_migration.sql"

WRITE = re.compile(r"\b(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|TRUNCATE|MERGE|GRANT|REVOKE|BEGIN|COMMIT|COPY)\b", re.IGNORECASE)


def strip_comments(sql: str) -> str:
    """Remove `--...` to end of line."""
    return "\n".join(line.split("--", 1)[0] for line in sql.splitlines())


def uncomment(sql: str) -> str:
    """Remove one leading '-- ' from each line."""
    out = []
    for line in sql.splitlines():
        stripped = line.lstrip()
        prefix = line[: len(line) - len(stripped)]
        if stripped.startswith("-- "):
            out.append(prefix + stripped[3:])
        elif stripped.startswith("--"):
            out.append(prefix + stripped[2:])
        else:
            out.append(line)
    return "\n".join(out)


def statements(sql: str):
    return [s for s in sql.split(";")]


def _read(path):
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def _line_start(text, marker):
    """Byte offset of the START of the line containing `marker`'s first occurrence —
    so a slice from here keeps that line's own leading '-- ' comment prefix."""
    idx = text.index(marker)
    nl = text.rfind("\n", 0, idx)
    return nl + 1


def _first_keyword_updates_deletes(stmts):
    """Statements whose first non-whitespace keyword is UPDATE or DELETE."""
    for s in stmts:
        stripped = s.strip()
        if not stripped:
            continue
        first_word = re.match(r"[A-Za-z]+", stripped)
        if first_word and first_word.group(0).upper() in ("UPDATE", "DELETE"):
            yield s


# ── F-16: context/repairs/2026-09-rating-reset-repair.sql ───────────────────

PART_A = "PART (a) —"
PART_B = "PART (b) —"
PART_C = "PART (c) —"
REPAIR_ROLLBACK = "── ROLLBACK of (c)"


class TestRepairSQL:
    def test_repair_sql_exists_with_parts_a_b_c_and_rollback(self):
        text = _read(REPAIR_SQL_PATH)
        ia = text.index(PART_A)
        ib = text.index(PART_B)
        ic = text.index(PART_C)
        ir = text.index(REPAIR_ROLLBACK)
        assert ia < ib < ic < ir

    def test_repair_part_a_is_select_only(self):
        text = _read(REPAIR_SQL_PATH)
        part_a = text[text.index(PART_A):text.index(PART_B)]
        stripped = strip_comments(part_a)
        assert not WRITE.search(stripped), "PART (a) must be read-only"
        for token in ["SELECT", "restorable_rows", "affected_users",
                      "candidates_before_reread_exclusions", "'to-read'",
                      "book_completed", "book_finished", "2026-05-05"]:
            assert token in part_a, f"missing {token!r} in PART (a)"

    def test_repair_parts_b_c_commented_out(self):
        text = _read(REPAIR_SQL_PATH)
        tail = text[_line_start(text, PART_B):]
        for line in tail.splitlines():
            if line.strip():
                assert line.lstrip().startswith("--"), f"non-commented line after PART (b): {line!r}"

    def test_repair_backup_table_name(self):
        text = _read(REPAIR_SQL_PATH)
        tail_uncommented = uncomment(text[text.index(PART_B):])
        assert "CREATE TABLE userbook_repair_backup_20260913" in tail_uncommented
        part_c_uncommented = uncomment(text[text.index(PART_C):text.index(REPAIR_ROLLBACK)])
        assert "BEGIN" in part_c_uncommented
        assert "COMMIT" in part_c_uncommented
        assert "u.status = 'to-read'" in part_c_uncommented
        assert "COALESCE(u.current_page, 0) = 0" in part_c_uncommented

    def test_repair_no_update_or_delete_without_where(self):
        text = _read(REPAIR_SQL_PATH)
        stmts = statements(strip_comments(text)) + statements(uncomment(text[text.index(PART_B):]))
        for s in _first_keyword_updates_deletes(stmts):
            assert "WHERE" in s.upper(), f"UPDATE/DELETE without WHERE: {s!r}"


# ── F-53: context/supabase_migration.sql (section starting at "Sprint 4A · F-53") ──

STEP_1 = "STEP 1 —"
STEP_1B = "STEP 1b —"
STEP_2 = "STEP 2 —"
STEP_3 = "STEP 3 — unique"
MIGRATION_ROLLBACK = "ROLLBACK (only if needed"


def _f53_section():
    text = _read(MIGRATION_SQL_PATH)
    start = text.index("Sprint 4A")
    assert "F-53" in text[start:start + 200]
    return text[start:]


class TestMigrationSQL:
    def test_migration_4a_section_present_with_steps_1_2_3_and_rollback(self):
        section = _f53_section()
        i1 = section.index(STEP_1)
        i1b = section.index(STEP_1B)
        i2 = section.index(STEP_2)
        i3 = section.index(STEP_3)
        ir = section.index(MIGRATION_ROLLBACK)
        assert i1 < i1b < i2 < i3 < ir

    def test_migration_step1_is_read_only(self):
        section = _f53_section()
        step1 = section[section.index(STEP_1):section.index(STEP_2)]
        stripped = strip_comments(step1)
        assert not WRITE.search(stripped), "STEP 1 must be read-only"
        # 3 in STEP 1's own dedup-count query (userbook, like, follow) + 1 in STEP 1b's preview subquery
        assert stripped.count("HAVING COUNT(*) > 1") == 4
        assert "dup_groups" in step1
        assert "surplus_rows" in step1

    def test_migration_dedupe_keeps_lowest_id_and_absorbs_progress(self):
        section = _f53_section()
        step2 = section[section.index(STEP_2):section.index(STEP_3)]
        assert "BEGIN;" in step2
        assert "COMMIT;" in step2
        assert "MIN(id)" in step2
        assert "GREATEST(k.current_page" in step2
        assert "WHEN 'finished' THEN 3" in step2
        assert "WHEN 'reading' THEN 2" in step2
        assert "NULLIF(k.rating, 0)" in step2
        assert "EXISTS (" in step2

    def test_migration_repoints_dependents_before_delete(self):
        section = _f53_section()
        step2 = section[section.index(STEP_2):section.index(STEP_3)]
        i_repoint_table = step2.index("dedupe_20260913_repoint")
        i_update_k = step2.index("UPDATE userbook k")
        i_update_note = step2.index("UPDATE note n")
        i_update_ra = step2.index("UPDATE reading_activity r")
        i_update_gp = step2.index("UPDATE group_post g")
        i_delete = step2.index("DELETE FROM userbook")
        assert i_update_k < i_update_note < i_update_ra < i_update_gp < i_delete
        assert i_repoint_table < i_update_note

    def test_migration_creates_three_unique_indexes_if_not_exists(self):
        section = _f53_section()
        step3 = section[section.index(STEP_3):section.index(MIGRATION_ROLLBACK)]
        normalized = " ".join(step3.split())
        assert "CREATE UNIQUE INDEX IF NOT EXISTS uq_userbook_user_book ON userbook (user_id, book_id)" in normalized
        assert 'CREATE UNIQUE INDEX IF NOT EXISTS uq_like_note_user ON "like" (note_id, user_id)' in normalized
        assert "CREATE UNIQUE INDEX IF NOT EXISTS uq_follow_pair ON follow (follower_id, followed_id)" in normalized
        assert "FROM pg_indexes" in step3

    def test_migration_is_idempotent(self):
        section = _f53_section()
        body = strip_comments(section[:section.index(MIGRATION_ROLLBACK)])
        for s in statements(body):
            stripped = s.strip()
            if re.match(r"CREATE TABLE\b", stripped, re.IGNORECASE):
                assert re.match(r"CREATE TABLE\s+IF NOT EXISTS", stripped, re.IGNORECASE), \
                    f"CREATE TABLE without IF NOT EXISTS: {stripped[:80]!r}"
            if re.match(r"CREATE UNIQUE INDEX\b", stripped, re.IGNORECASE):
                assert re.match(r"CREATE UNIQUE INDEX\s+IF NOT EXISTS", stripped, re.IGNORECASE), \
                    f"CREATE UNIQUE INDEX without IF NOT EXISTS: {stripped[:80]!r}"
        rollback_uncommented = uncomment(section[section.index(MIGRATION_ROLLBACK):])
        for s in statements(rollback_uncommented):
            stripped = s.strip()
            if re.match(r"DROP INDEX\b", stripped, re.IGNORECASE):
                assert re.match(r"DROP INDEX\s+IF EXISTS", stripped, re.IGNORECASE), \
                    f"DROP INDEX without IF EXISTS: {stripped[:80]!r}"

    def test_migration_rollback_present(self):
        section = _f53_section()
        rollback = uncomment(section[section.index(MIGRATION_ROLLBACK):])
        assert rollback.count("DROP INDEX IF EXISTS") == 3
        assert "INSERT INTO userbook" in rollback
        for tbl in ["note", "reading_activity", "group_post", "journal"]:
            assert f"tbl = '{tbl}'" in rollback, f"rollback missing repoint-back for {tbl}"
        assert "dedupe_20260913_userbook_keeper" in rollback
        assert 'INSERT INTO "like"' in rollback
        assert "INSERT INTO follow" in rollback

    def test_migration_no_update_or_delete_without_where(self):
        section = _f53_section()
        rollback = uncomment(section[section.index(MIGRATION_ROLLBACK):])
        stmts = statements(strip_comments(section)) + statements(rollback)
        for s in _first_keyword_updates_deletes(stmts):
            assert "WHERE" in s.upper(), f"UPDATE/DELETE without WHERE: {s!r}"

    def test_migration_index_names_match_models(self):
        from app import models
        section = _f53_section()
        step3 = section[section.index(STEP_3):section.index(MIGRATION_ROLLBACK)]

        expected = {
            "uq_userbook_user_book": ("user_id", "book_id"),
            "uq_like_note_user": ("note_id", "user_id"),
            "uq_follow_pair": ("follower_id", "followed_id"),
        }
        for name in expected:
            assert name in step3

        from sqlalchemy import UniqueConstraint
        model_constraints = {}
        for model in (models.UserBook, models.Like, models.Follow):
            for c in model.__table__.constraints:
                if isinstance(c, UniqueConstraint):
                    model_constraints[c.name] = tuple(col.name for col in c.columns)

        for name, cols in expected.items():
            assert name in model_constraints, f"models.py missing UniqueConstraint {name}"
            assert set(model_constraints[name]) == set(cols)


# ── Sprint 4C: context/supabase_migration.sql (section starting at "Sprint 4C") ─────
# Bounded (K-15): from the "Sprint 4C" header to EOF, so a later append cannot silently
# grow this section's scope the way the open-ended _f53_section() does.

C4_STEP_1 = "STEP 1 —"
C4_STEP_2 = "STEP 2 —"
C4_ROLLBACK = "ROLLBACK (only AFTER"


def _4c_section():
    text = _read(MIGRATION_SQL_PATH)
    start = text.index("Sprint 4C")
    assert "F-62" in text[start:start + 200]
    return text[start:]


class TestMigration4C:
    def test_4c_section_present_steps_in_order(self):
        section = _4c_section()
        i1 = section.index(C4_STEP_1)
        i2 = section.index(C4_STEP_2)
        ir = section.index(C4_ROLLBACK)
        assert i1 < i2 < ir

    def test_4c_step1_idempotent_exact(self):
        section = _4c_section()
        step1 = strip_comments(section[section.index(C4_STEP_1):section.index(C4_STEP_2)])
        normalized = " ".join(step1.split())
        assert 'ALTER TABLE "user" ADD COLUMN IF NOT EXISTS timezone VARCHAR(64)' in normalized
        assert "ALTER TABLE reading_activity ADD COLUMN IF NOT EXISTS local_day BOOLEAN" in normalized
        assert "DEFAULT" not in normalized.upper()

    def test_4c_step2_read_only_verify(self):
        section = _4c_section()
        step2 = strip_comments(section[section.index(C4_STEP_2):section.index(C4_ROLLBACK)])
        assert not re.search(r"\b(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|TRUNCATE)\b", step2, re.IGNORECASE)
        assert "information_schema.columns" in step2
        assert "current_schema()" in step2
        assert "timezone" in step2 and "local_day" in step2
        assert "WHERE timezone  IS NOT NULL" in step2 or "WHERE timezone IS NOT NULL" in step2
        assert "WHERE local_day IS TRUE" in step2

    def test_4c_rollback_fully_commented(self):
        section = _4c_section()
        rollback = section[_line_start(section, C4_ROLLBACK):]
        stripped = strip_comments(rollback)
        assert stripped.strip() == ""
        uncommented = uncomment(rollback)
        normalized = " ".join(uncommented.split())
        assert "ALTER TABLE reading_activity DROP COLUMN IF EXISTS local_day" in normalized
        assert 'ALTER TABLE "user" DROP COLUMN IF EXISTS timezone' in normalized

    def test_4c_section_never_rewrites_rows(self):
        section = strip_comments(_4c_section())
        assert not re.search(r"\b(UPDATE|DELETE|INSERT|TRUNCATE|CREATE TABLE)\b", section, re.IGNORECASE)

    def test_4c_column_types_match_code(self):
        from app import localday
        from app.schema_guard import REQUIRED_COLUMNS
        section = _4c_section()
        step1 = section[section.index(C4_STEP_1):section.index(C4_STEP_2)]
        m = re.search(r"VARCHAR\((\d+)\)", step1)
        assert m and int(m.group(1)) == localday.MAX_ZONE_LEN == 64
        for table, column in REQUIRED_COLUMNS:
            assert column in step1
