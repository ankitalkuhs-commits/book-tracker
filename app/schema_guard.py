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
    # Sprint 4F. DEPLOY ORDER IS NOT NEGOTIABLE (architecture.md §"Deploy order"): the PM runs
    # the `is_bot` SQL and the `bot_post` SQL FIRST, and only then is this commit deployed. A
    # missing table produces no information_schema row either, so ("bot_post","dedup_key")
    # covers the whole table. Deploying this ahead of the SQL fails the deploy on purpose and
    # the previous version keeps serving.
    ("user", "is_bot"),                # Sprint 4F
    ("bot_post", "dedup_key"),         # Sprint 4F
    # Sprint 4G. SAME NON-NEGOTIABLE ORDER: the PM runs PM_SQL_QUEUE step 8 (the column and
    # uq_user_apple_sub) FIRST, and only the deploy AFTER that output arrives may carry this
    # line. Deployed early it raises below, Render fails the deploy and the previous version
    # keeps serving — the guard working, and still a failed deploy somebody has to explain.
    ("user", "apple_sub"),             # Sprint 4G
    # Sprint 4H. SAME NON-NEGOTIABLE ORDER: the PM runs PM_SQL_QUEUE step 9 FIRST and sends the
    # verify output back, and only the deploy AFTER that may carry this line. This entry and
    # `models.User.apple_refresh_token` must travel in the SAME commit — a model column without
    # its guard entry is the April 2026 outage (the service boots, then 500s on every User
    # query); a guard entry without the SQL is a failed deploy and the previous version keeps
    # serving, which is the outcome this file exists to produce.
    ("user", "apple_refresh_token"),   # Sprint 4H
    # Sprint 4I-A. SAME NON-NEGOTIABLE ORDER: the PM runs PM_SQL_QUEUE step 10 (the `report`
    # table, uq_report_once and ix_report_open) FIRST and sends the verify output back, and
    # only the deploy AFTER that may carry this line. A missing table produces no
    # information_schema row either, so ("report","reason") covers the whole table — the
    # reasoning already written at :14-16 for `bot_post`. Deployed ahead of the SQL this
    # raises below, Render fails the deploy and the previous version keeps serving.
    ("report", "reason"),              # Sprint 4I-A
    # Sprint 4I-B. SAME NON-NEGOTIABLE ORDER, AND IT IS A SECOND, SEPARATE DEPLOY: the PM runs
    # PM_SQL_QUEUE step 11 (the `block` table, uq_block_pair and ix_block_blocked) FIRST and
    # sends the verify output back, and only the deploy AFTER that may carry this line. Step 10
    # (4I-A's `report` table) must already have run — the two steps are two deploys, not one,
    # and this entry must never travel in the same commit as step 10's. ("block","blocked_id")
    # covers the whole table for the reason written at :14-16.
    ("block", "blocked_id"),           # Sprint 4I-B
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
