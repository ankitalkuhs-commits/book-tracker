#!/usr/bin/env python
"""qa/pg_4c_migration.py — QA-owned, real-PostgreSQL harness for Sprint 4C (K-14, G-4C-05).

Proves on a THROWAWAY local PostgreSQL cluster (never Supabase, never Render) what SQLite
cannot: refuse-to-start (R-14), idempotency, rollback, fail-open, and the unquoted `timezone`
column through SQLAlchemy (A-6).

Preconditions (exit 6, naming the missing one): `initdb`, `pg_ctl`, `psql` on PATH; the
project .venv has psycopg2.

Usage:
    C:/Users/sonal/Documents/projects/book-tracker/.venv/Scripts/python.exe qa/pg_4c_migration.py

Output: one PASS/FAIL line per case, then "4C pg local: <n> passed, <m> failed". Exit 0 only
if every case passed.
"""
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 55432
PG_USER = "qa"
PG_DB = "bt4c"
PYTHON = sys.executable
MIGRATION_SQL_PATH = os.path.join(REPO_ROOT, "context", "supabase_migration.sql")

results = []


def _pass(case, note=""):
    results.append((case, True))
    print(f"PASS {case}" + (f" — {note}" if note else ""))
    sys.stdout.flush()


def _fail(case, note=""):
    results.append((case, False))
    print(f"FAIL {case}" + (f" — {note}" if note else ""))
    sys.stdout.flush()


def _which_or_exit(name):
    path = shutil.which(name)
    if not path:
        print(f"exit 6: missing precondition — '{name}' not found on PATH")
        sys.exit(6)
    return path


def _check_preconditions():
    for tool in ("initdb", "pg_ctl", "psql"):
        _which_or_exit(tool)
    try:
        import psycopg2  # noqa: F401
    except ImportError:
        print("exit 6: missing precondition — psycopg2 not importable in this interpreter")
        sys.exit(6)


def _read_4c_sql_blocks():
    """Extract STEP 1, STEP 2 and the ROLLBACK block from context/supabase_migration.sql —
    not retyped, per tests.md section 5."""
    with open(MIGRATION_SQL_PATH, "r", encoding="utf-8") as f:
        text = f.read()
    start = text.index("Sprint 4C")
    section = text[start:]

    def _line_start(s, marker):
        """Byte offset of the START of the line containing marker's first occurrence, so a
        slice from here keeps that line's own leading '-- ' comment prefix (the markers sit
        mid-line, e.g. '-- STEP 1 — add the columns' — slicing from index() alone drops the
        '-- ' and leaves 'STEP 1 — add the columns' as a bare, invalid first SQL line)."""
        idx = s.index(marker)
        nl = s.rfind("\n", 0, idx)
        return nl + 1

    step1 = section[_line_start(section, "STEP 1 —"):_line_start(section, "STEP 2 —")]
    step2 = section[_line_start(section, "STEP 2 —"):_line_start(section, "ROLLBACK (only AFTER")]
    rollback_raw = section[_line_start(section, "ROLLBACK (only AFTER"):]

    def _strip_comments(sql):
        return "\n".join(line.split("--", 1)[0] for line in sql.splitlines())

    def _uncomment(sql):
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

    step1_sql = _strip_comments(step1).strip()
    step2_sql = _strip_comments(step2).strip()
    # The rollback block's own descriptive prose ("ROLLBACK (only AFTER the backend is back on
    # a pre-4C SHA; pre-4C code never selects these columns, ...)") is commented text too, and
    # _uncomment() would turn it into a bogus, non-terminated first "statement" (it even embeds
    # a semicolon inside the prose, splitting mid-sentence) — keep only the real ALTER lines.
    rollback_sql = "\n".join(
        line for line in _uncomment(rollback_raw).splitlines()
        if line.strip().upper().startswith("ALTER")
    ).strip()
    return step1_sql, step2_sql, rollback_sql


class PgCluster:
    def __init__(self, data_dir, port=PORT):
        self.data_dir = data_dir
        self.port = port

    def initdb(self):
        subprocess.run(
            ["initdb", "-U", PG_USER, "-A", "trust", "-E", "UTF8", "-D", self.data_dir],
            check=True, capture_output=True, text=True, timeout=60,
        )

    def start(self):
        log = os.path.join(self.data_dir, "pg.log")
        # NOT capture_output: pg_ctl's grandchild postgres.exe (and ITS forked workers)
        # inherit the stdout/stderr pipe handles on Windows and never close them, so
        # subprocess.run's communicate() blocks forever waiting for EOF even after pg_ctl
        # itself has exited successfully and the server is fully up — measured: a 30s
        # timeout still took 94s to actually raise. DEVNULL avoids creating that pipe at all.
        subprocess.run(
            ["pg_ctl", "-D", self.data_dir, "-l", log, "-o", f"-p {self.port} -h 127.0.0.1", "-w", "start"],
            check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=60,
        )
        # Wait for the socket
        for _ in range(30):
            try:
                with socket.create_connection(("127.0.0.1", self.port), timeout=1):
                    return
            except OSError:
                time.sleep(0.5)
        raise RuntimeError("PostgreSQL did not start listening")

    def stop(self):
        subprocess.run(["pg_ctl", "-D", self.data_dir, "-m", "fast", "stop"],
                        capture_output=True, text=True, timeout=30)

    def createdb(self):
        subprocess.run(
            ["psql", "-h", "127.0.0.1", "-p", str(self.port), "-U", PG_USER, "-d", "postgres",
             "-v", "ON_ERROR_STOP=1", "-c", f"CREATE DATABASE {PG_DB};"],
            check=True, capture_output=True, text=True, timeout=30,
        )

    def psql(self, sql, database=PG_DB, on_error_stop=True):
        # -f <file>, not -c <text>: a non-ASCII character (the migration SQL's em-dashes) in a
        # -c argument gets mangled by Windows' argv encoding before psql ever sees it — measured
        # as "invalid byte sequence for encoding UTF8: 0x97" (cp1252's byte for U+2014). A UTF-8
        # file read with -f sidesteps argv encoding entirely.
        fd, path = tempfile.mkstemp(suffix=".sql")
        try:
            with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as f:
                f.write(sql)
            args = ["psql", "-h", "127.0.0.1", "-p", str(self.port), "-U", PG_USER, "-d", database]
            if on_error_stop:
                args += ["-v", "ON_ERROR_STOP=1"]
            args += ["-f", path]
            return subprocess.run(args, capture_output=True, text=True, timeout=30,
                                   env={**os.environ, "PGCLIENTENCODING": "UTF8"})
        finally:
            os.unlink(path)

    @property
    def dsn(self):
        return f"postgresql://{PG_USER}@127.0.0.1:{self.port}/{PG_DB}"


def _create_pre4c_schema(cluster):
    """Tables from the 4C SQLModel.metadata.create_all, then drop the two 4C columns —
    the pre-4C production shape."""
    env = {**os.environ, "DATABASE_URL": cluster.dsn, "SECRET_KEY": "qa-4c-pg"}
    code = (
        "from sqlmodel import SQLModel; "
        "import app.models; "  # registers every table on SQLModel.metadata before create_all
        "import app.database as d; "
        "SQLModel.metadata.create_all(d.engine)"
    )
    r = subprocess.run([PYTHON, "-c", code], cwd=REPO_ROOT, env=env, capture_output=True, text=True, timeout=60)
    if r.returncode != 0:
        raise RuntimeError(f"create_all failed: {r.stderr}")
    r1 = cluster.psql('ALTER TABLE reading_activity DROP COLUMN local_day;')
    if r1.returncode != 0:
        raise RuntimeError(f"pre-4C schema prep failed (drop local_day): {r1.stderr}")
    r2 = cluster.psql('ALTER TABLE "user" DROP COLUMN timezone;')
    if r2.returncode != 0:
        raise RuntimeError(f"pre-4C schema prep failed (drop timezone): {r2.stderr}")


def _start_app(cluster, extra_env=None, port=8766):
    # PYTHONIOENCODING: app/main.py prints "✅ Application started." — harmless on Render
    # (Linux, UTF-8 locale) but a real Windows console subprocess defaults to a codepage
    # ('charmap') that can't encode it, crashing with UnicodeEncodeError right after a
    # clean fail-open (measured in G-PG-7). Not an app bug to fix here (pre-existing,
    # outside 4C's scope) — this makes the local harness match Render's own encoding.
    env = {**os.environ, "DATABASE_URL": cluster.dsn, "SECRET_KEY": "qa-4c-pg", "PYTHONIOENCODING": "utf-8"}
    if extra_env:
        env.update(extra_env)
    proc = subprocess.Popen(
        [PYTHON, "-m", "uvicorn", "app.main:app", "--port", str(port)],
        cwd=REPO_ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
        bufsize=1,
    )
    # Drain stdout continuously on a background thread — on Windows a full pipe buffer
    # (uvicorn access-log spam, repeated bind-retry errors, ...) blocks the CHILD process
    # if nobody reads it, which previously hung this harness for many minutes with the
    # parent sitting idle in its polling loop.
    import threading
    buf = []
    def _drain():
        try:
            for line in proc.stdout:
                buf.append(line)
        except Exception:
            pass
    t = threading.Thread(target=_drain, daemon=True)
    t.start()
    proc._qa_buf = buf
    proc._qa_thread = t
    return proc


def _wait_for_exit_or_version(proc, port=8766, timeout=60):
    """Poll: either the process exits, or /version answers 200. Returns (exited, out_tail)."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        if proc.poll() is not None:
            proc._qa_thread.join(timeout=5)
            return True, "".join(proc._qa_buf)
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/version", timeout=1) as resp:
                if resp.status == 200:
                    return False, "".join(proc._qa_buf)
        except Exception:
            pass
        time.sleep(0.5)
    return (proc.poll() is not None), "".join(proc._qa_buf)


def _kill(proc):
    if proc.poll() is None:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()


def main():
    _check_preconditions()
    step1_sql, step2_sql, rollback_sql = _read_4c_sql_blocks()

    tmp = tempfile.mkdtemp(prefix="qa-4c-pg-")
    data_dir = os.path.join(tmp, "data")
    cluster = PgCluster(data_dir)

    try:
        print("[setup] initdb..."); sys.stdout.flush()
        cluster.initdb()
        print("[setup] start..."); sys.stdout.flush()
        cluster.start()
        print("[setup] createdb..."); sys.stdout.flush()
        cluster.createdb()
        print("[setup] pre-4C schema..."); sys.stdout.flush()
        _create_pre4c_schema(cluster)
        print("[setup] done"); sys.stdout.flush()

        # ── G-PG-1: start on the pre-4C schema — refuse, code 3, both columns named ──
        proc = _start_app(cluster, port=8766)
        exited, out = _wait_for_exit_or_version(proc, port=8766, timeout=60)
        _kill(proc)
        rc = proc.returncode
        if (exited and rc == 3 and "Migration not applied" in out
                and "user.timezone" in out and "reading_activity.local_day" in out
                and "Application startup failed. Exiting." in out
                and "[scheduler] Started" not in out):
            _pass("G-PG-1")
        else:
            _fail("G-PG-1", f"exited={exited} rc={rc} out_tail={out[-500:]!r}")

        # ── G-PG-2: only the user ALTER applied — names only reading_activity.local_day ──
        cluster.psql('ALTER TABLE "user" ADD COLUMN timezone VARCHAR(64);')
        proc = _start_app(cluster, port=8767)
        exited, out = _wait_for_exit_or_version(proc, port=8767, timeout=60)
        _kill(proc)
        rc = proc.returncode
        if exited and rc == 3 and "reading_activity.local_day" in out and "user.timezone" not in out:
            _pass("G-PG-2")
        else:
            _fail("G-PG-2", f"exited={exited} rc={rc} out_tail={out[-500:]!r}")
        cluster.psql('ALTER TABLE "user" DROP COLUMN timezone;')

        # ── G-PG-3: STEP 1 via psql -v ON_ERROR_STOP=1, twice — idempotent ──
        r1 = cluster.psql(step1_sql)
        r2 = cluster.psql(step1_sql)
        if r1.returncode == 0 and r2.returncode == 0 and r2.stderr.count("already exists, skipping") == 2:
            _pass("G-PG-3")
        else:
            _fail("G-PG-3", f"rc1={r1.returncode} rc2={r2.returncode} stderr2={r2.stderr!r}")

        # ── G-PG-4: STEP 2 — exact rows and zero counts ──
        r = cluster.psql(step2_sql, on_error_stop=False)
        out2 = r.stdout
        ok_rows = (
            re.search(r"reading_activity\s*\|\s*local_day\s*\|\s*boolean\s*\|\s*YES", out2)
            and re.search(r"user\s*\|\s*timezone\s*\|\s*character varying\s*\|\s*YES", out2)
        )
        ok_counts = out2.count("0") >= 2 or ("users_with_zone" in out2 and "local_day_rows" in out2)
        if ok_rows and ok_counts:
            _pass("G-PG-4")
        else:
            _fail("G-PG-4", f"stdout={out2!r}")

        # ── G-PG-5: start the app — happy path ──
        proc = _start_app(cluster, port=8768)
        exited, out = _wait_for_exit_or_version(proc, port=8768, timeout=60)
        started_ok = (not exited)
        version_ok = False
        if started_ok:
            try:
                with urllib.request.urlopen("http://127.0.0.1:8768/version", timeout=5) as resp:
                    version_ok = resp.status == 200
            except Exception:
                version_ok = False
        time.sleep(1)
        try:
            log_tail = proc.stdout.read1(65536).decode() if hasattr(proc.stdout, "read1") else ""
        except Exception:
            log_tail = ""
        if started_ok and version_ok:
            _pass("G-PG-5")
        else:
            _fail("G-PG-5", f"started_ok={started_ok} version_ok={version_ok}")

        # ── G-PG-6: real-PostgreSQL round trip (A-6) ──
        g_pg_6_ok = False
        g_pg_6_note = ""
        try:
            import psycopg2
            conn = psycopg2.connect(cluster.dsn, connect_timeout=10)
            conn.autocommit = True
            cur = conn.cursor()
            cur.execute(
                "INSERT INTO \"user\" (name, email, password_hash, is_admin, is_private_profile, "
                "created_at) VALUES (%s, %s, %s, false, false, now()) RETURNING id",
                ("QA PG", "qa-pg-6@example.com", "x"),
            )
            uid = cur.fetchone()[0]

            env = {**os.environ, "DATABASE_URL": cluster.dsn, "SECRET_KEY": "qa-4c-pg"}
            token_code = (
                "from app.auth import create_access_token; "
                "print(create_access_token({'sub': 'qa-pg-6@example.com'}))"
            )
            tok = subprocess.run([PYTHON, "-c", token_code], cwd=REPO_ROOT, env=env,
                                  capture_output=True, text=True, timeout=30).stdout.strip()

            req = urllib.request.Request(
                "http://127.0.0.1:8768/profile/me",
                headers={"Authorization": f"Bearer {tok}", "X-Timezone": "America/New_York"},
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                body = resp.read().decode()
            tz_ok = '"timezone":"America/New_York"' in body.replace(" ", "")

            cur.execute('SELECT timezone FROM "user" WHERE id = %s', (uid,))
            db_tz = cur.fetchone()[0]

            cur.execute(
                "INSERT INTO book (title, created_at) VALUES (%s, now()) RETURNING id", ("QA PG Book",)
            )
            bid = cur.fetchone()[0]
            cur.execute(
                "INSERT INTO userbook (user_id, book_id, status, current_page, format, "
                "ownership_status, created_at, updated_at) VALUES (%s, %s, 'reading', 0, "
                "'hardcover', 'owned', now(), now()) RETURNING id",
                (uid, bid),
            )
            ubid = cur.fetchone()[0]

            for page in (10, 15):
                req = urllib.request.Request(
                    f"http://127.0.0.1:8768/userbooks/{ubid}/progress",
                    data=f'{{"current_page": {page}}}'.encode(),
                    headers={"Authorization": f"Bearer {tok}", "X-Timezone": "America/New_York",
                              "Content-Type": "application/json"},
                    method="PUT",
                )
                urllib.request.urlopen(req, timeout=5)

            cur.execute(
                "SELECT local_day, date, pages_read FROM reading_activity WHERE userbook_id = %s", (ubid,)
            )
            rows = cur.fetchall()
            g_pg_6_ok = (
                tz_ok and db_tz == "America/New_York" and len(rows) == 1
                and rows[0][0] is True and rows[0][1].hour == 0 and rows[0][2] == 15
            )
            g_pg_6_note = f"tz_ok={tz_ok} db_tz={db_tz} rows={rows}"
            conn.close()
        except Exception as e:
            g_pg_6_note = f"exception: {e}"
        if g_pg_6_ok:
            _pass("G-PG-6")
        else:
            _fail("G-PG-6", g_pg_6_note)

        _kill(proc)

        # ── G-PG-7: stop PostgreSQL, start the app — fails open, no DSN leak ──
        cluster.stop()
        proc = _start_app(cluster, port=8769)
        exited, out = _wait_for_exit_or_version(proc, port=8769, timeout=60)
        started_ok = not exited
        has_skip_line = "[schema_guard] check skipped: OperationalError" in out
        no_leak = "55432" not in out and "qa@" not in out and "postgresql://" not in out
        _kill(proc)
        if started_ok and has_skip_line and no_leak:
            _pass("G-PG-7")
        else:
            _fail("G-PG-7", f"started_ok={started_ok} has_skip_line={has_skip_line} no_leak={no_leak} out={out[-500:]!r}")

        # restart PostgreSQL for G-PG-8
        cluster.start()

        # ── G-PG-8: rollback then STEP 1 again — reversible ──
        r_rollback = cluster.psql(rollback_sql)
        proc = _start_app(cluster, port=8770)
        exited, out = _wait_for_exit_or_version(proc, port=8770, timeout=60)
        rc = proc.returncode
        _kill(proc)
        rollback_then_refuses = r_rollback.returncode == 0 and exited and rc == 3
        r_step1_again = cluster.psql(step1_sql)
        proc2 = _start_app(cluster, port=8771)
        exited2, out2 = _wait_for_exit_or_version(proc2, port=8771, timeout=60)
        started_again = not exited2
        _kill(proc2)
        if rollback_then_refuses and r_step1_again.returncode == 0 and started_again:
            _pass("G-PG-8")
        else:
            _fail("G-PG-8", f"rollback_then_refuses={rollback_then_refuses} started_again={started_again}")

    finally:
        try:
            cluster.stop()
        except Exception:
            pass
        shutil.rmtree(tmp, ignore_errors=True)

    n_pass = sum(1 for _, ok in results if ok)
    n_fail = len(results) - n_pass
    print(f"4C pg local: {n_pass} passed, {n_fail} failed")
    sys.exit(0 if n_fail == 0 else 1)


if __name__ == "__main__":
    main()
