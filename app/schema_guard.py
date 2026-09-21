# app/schema_guard.py
"""Refuse to start on PostgreSQL if a column the models need has not been migrated.

April 2026: pushing a models.py column before its Supabase migration crashed every User query
(login down). A process exit at startup instead makes Render fail the deploy and keep the previous
version serving (assumption A-1). Every future column migration appends to REQUIRED_COLUMNS.
"""
from sqlalchemy import text

REQUIRED_COLUMNS = (
    ("user", "timezone"),              # Sprint 4C
    ("reading_activity", "local_day"), # Sprint 4C
)


def assert_migrated(engine) -> None:
    if engine.dialect.name != "postgresql":
        return                                   # SQLite dev/tests: create_all owns the schema
    wanted = {t for t, _ in REQUIRED_COLUMNS}
    try:
        with engine.connect() as conn:
            rows = conn.execute(
                text("SELECT table_name, column_name FROM information_schema.columns "
                     "WHERE table_schema = current_schema() AND table_name = ANY(:t)"),
                {"t": list(wanted)},
            ).all()
    except Exception as e:                       # a DB hiccup on a cold start must not block startup
        print(f"[schema_guard] check skipped: {type(e).__name__}")
        return
    present = {(r[0], r[1]) for r in rows}
    missing = [f"{t}.{c}" for t, c in REQUIRED_COLUMNS if (t, c) not in present]
    if missing:
        raise RuntimeError("Migration not applied — missing column(s): " + ", ".join(missing)
                           + ". Run context/supabase_migration.sql (Sprint 4C STEP 1) first.")
