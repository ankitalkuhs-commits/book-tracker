"""Two switches the Oregon -> Singapore move needs (F-68).

Render cannot change a service's region, so the move means running a second service for a while.
Both talk to the same database, so exactly one may run the reminder scheduler, and the old service
has to forward the readers whose installed app has the old address compiled in.

Neither switch does anything unless its environment variable is set, so production behaviour is
unchanged until the migration.
"""
import pytest
from fastapi.testclient import TestClient

from app import main as app_main
from app.notifications import scheduler as sched


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch):
    monkeypatch.delenv("RUN_SCHEDULER", raising=False)
    monkeypatch.delenv("API_REDIRECT_BASE", raising=False)


# ── one scheduler across both services ───────────────────────────────────────

class _FakeScheduler:
    """Stands in for APScheduler: `running` is a read-only property on the real one."""
    running = True          # so start_scheduler() never tries to start a real loop
    def __init__(self):
        self.jobs = []
    def add_job(self, *a, **k):
        self.jobs.append(k.get("id") or a)
    def remove_job(self, *a, **k):
        pass
    def get_job(self, *a, **k):
        return None


def test_scheduler_runs_by_default(monkeypatch):
    fake = _FakeScheduler()
    monkeypatch.setattr(sched, "scheduler", fake)
    sched.start_scheduler()
    assert fake.jobs, "the scheduler must still run when RUN_SCHEDULER is unset"


def test_scheduler_can_be_switched_off(monkeypatch):
    fake = _FakeScheduler()
    monkeypatch.setenv("RUN_SCHEDULER", "0")
    monkeypatch.setattr(sched, "scheduler", fake)
    sched.start_scheduler()
    assert fake.jobs == [], (
        "RUN_SCHEDULER=0 must stop this service scheduling reminders; with two services on one "
        "database, both scheduling means every reader gets the reminder twice"
    )


# ── the old service forwards to the new one ──────────────────────────────────

def _client_with_redirect(monkeypatch, base="https://api.example.com"):
    # The middleware reads the variable per request, so no reload is needed.
    monkeypatch.setenv("API_REDIRECT_BASE", base)
    return TestClient(app_main.app)   # redirects are inspected, not followed (per request below)


def test_no_redirect_unless_configured(client):
    assert client.get("/version").status_code == 200
    assert "location" not in {k.lower() for k in client.get("/version").headers}


def test_redirect_preserves_path_query_and_method(monkeypatch):
    c = _client_with_redirect(monkeypatch)
    r = c.get("/notes/feed?limit=5", follow_redirects=False)
    if True:
        assert r.status_code == 307, "307 keeps the method and body, and is not cached forever"
        assert r.headers["location"] == "https://api.example.com/notes/feed?limit=5"

        r = c.post("/notes/", json={"text": "x"}, follow_redirects=False)
        assert r.status_code == 307 and r.headers["location"] == "https://api.example.com/notes/"


def test_version_is_not_redirected(monkeypatch):
    """/version must answer locally, so the old service can still be identified and health-checked."""
    c = _client_with_redirect(monkeypatch)
    r = c.get("/version", follow_redirects=False)
    assert r.status_code == 200, "/version must not redirect"
    assert "commit" in r.json()
