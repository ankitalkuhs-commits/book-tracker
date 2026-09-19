"""Tests for /auth/* — the surviving routes (Google, review-login, delete-account) and
proof that the legacy password signup/login routes (F-01) are gone."""
import os
from datetime import date, datetime

import pytest
from sqlmodel import select, func

from app import auth, crud, models
from tests.conftest import _make_user, _auth


class TestTokenValidation:
    def test_no_token_on_protected_endpoint(self, client):
        r = client.get("/userbooks/")
        assert r.status_code == 401

    def test_invalid_token_rejected(self, client):
        r = client.get("/userbooks/", headers={"Authorization": "Bearer notarealtoken"})
        assert r.status_code == 401


class TestLegacyPasswordRoutesRemoved:
    """F-01 — /auth/signup and /auth/login are gone; every other auth route is unchanged."""

    def test_signup_404(self, client, db):
        r = client.post("/auth/signup", json={"email": "f01_signup@example.com", "password": "password123", "name": "X"})
        assert r.status_code in (404, 405)
        db.expire_all()
        assert crud.get_user_by_email(db, "f01_signup@example.com") is None

    def test_login_404(self, client):
        r = client.post("/auth/login", json={"email": "alice_f@example.com", "password": "password123"})
        assert r.status_code in (404, 405)
        assert "access_token" not in r.text

    def test_legacy_routes_absent_from_openapi(self, client):
        paths = client.get("/openapi.json").json()["paths"]
        assert "/auth/signup" not in paths
        assert "/auth/login" not in paths
        assert "/auth/google" in paths
        assert "/auth/delete-account" in paths
        assert "/auth/delete-account/me" in paths

    def test_no_test_or_fixture_calls_legacy_routes(self):
        root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        search_dirs = [
            os.path.join(root, "tests"),
            os.path.join(root, "qa"),
            os.path.join(root, "scripts"),
            os.path.join(root, "book-tracker-frontend-stitch", "src"),
            os.path.join(root, "book-tracker-mobile-stitch", "src"),
        ]
        offenders = []
        this_file = os.path.abspath(__file__)
        for base in search_dirs:
            if not os.path.isdir(base):
                continue
            for dirpath, _dirnames, filenames in os.walk(base):
                for fname in filenames:
                    if not fname.endswith((".py", ".mjs", ".js", ".jsx", ".ts", ".tsx")):
                        continue
                    fpath = os.path.join(dirpath, fname)
                    if os.path.abspath(fpath) == this_file:
                        continue
                    try:
                        with open(fpath, "r", encoding="utf-8", errors="ignore") as fh:
                            text = fh.read()
                    except OSError:
                        continue
                    if "/auth/signup" in text or "/auth/login" in text:
                        offenders.append(fpath)
        assert offenders == []

    def test_google_and_account_routes_still_registered(self, client):
        # google_auth is unchanged by F-01 (out of scope here). A malformed token fails
        # locally in the Google client library with a ValueError, which google_auth's own
        # `except Exception` re-wraps as 500 instead of the 401 it raises internally — a
        # pre-existing bug (not touched, not introduced by this change; see build notes).
        # The invariant F-01 cares about is that the route is still registered, i.e. never
        # 404/405 (which would mean the route was removed or the method rejected).
        r_a = client.post("/auth/google", json={"token": "not-a-real-token"})
        assert r_a.status_code not in (404, 405)

        r_b = client.post("/auth/delete-account/me")
        assert r_b.status_code == 401

        r_c = client.post("/auth/delete-account", json={"email": "nobody-f01@example.com"})
        assert r_c.status_code == 200
        assert r_c.json() == {"message": "Account deletion request received"}


class TestPublicDeleteAccountForm:
    def test_delete_account_form_stays_public(self, client, db):
        _make_user(db, email="alice_f_delacct@example.com")
        r = client.post("/auth/delete-account", json={"email": "alice_f_delacct@example.com", "reason": "qa"})
        assert r.status_code == 200
        assert r.json() == {"message": "Account deletion request received"}

        db.expire_all()
        from app import crud
        user = crud.get_user_by_email(db, "alice_f_delacct@example.com")
        assert user.deletion_requested_at is not None
        assert user.deletion_reason == "qa"

    def test_delete_account_unknown_email_same_response(self, client):
        r = client.post("/auth/delete-account", json={"email": "nobody-xyz@example.com"})
        assert r.status_code == 200
        assert r.json() == {"message": "Account deletion request received"}


class TestDeleteAccountCleansDependents:
    """F-50 (account half) — POST /auth/delete-account/me leaves no FK-orphaning rows behind."""

    def _fixture(self, client, db):
        from app import models as m

        u = _make_user(db, email="f50_victim@example.com", name="F50 Victim")
        w = _make_user(db, email="f50_w@example.com", name="F50 W")
        v = _make_user(db, email="f50_v@example.com", name="F50 V")
        x = _make_user(db, email="f50_x@example.com", name="F50 X")
        hu, hw, hv = _auth(u), _auth(w), _auth(v)

        g1 = client.post("/groups/", json={"name": "F50 U circle", "is_private": False}, headers=hu).json()["id"]
        r = client.post(f"/groups/{g1}/join", headers=hv)
        assert r.status_code == 201

        g2 = client.post("/groups/", json={"name": "F50 W circle", "is_private": False}, headers=hw).json()["id"]
        r = client.post(f"/groups/{g2}/join", headers=hu)
        assert r.status_code == 201

        db.add(m.GroupMember(group_id=g2, user_id=v.id, role="member", status="pending", invited_by=u.id))
        db.add(m.GroupMember(group_id=g2, user_id=x.id, role="member", status="active", invited_by=u.id))
        db.commit()

        add = client.post("/books/add-to-library", json={"title": "F50 acct", "total_pages": 100, "status": "reading"}, headers=hu)
        ub = add.json()["id"]
        r = client.put(f"/userbooks/{ub}/progress", json={"current_page": 10}, headers=hu)
        assert r.status_code == 200

        gp = m.GroupPost(group_id=g2, user_id=w.id, text="F50 W post", userbook_id=ub)
        db.add(gp)
        db.commit()
        db.refresh(gp)

        return u, w, v, x, g1, g2, ub, gp.id

    def test_delete_account_leaves_no_fk_orphans(self, client, db):
        from app import models as m

        u, w, v, x, g1, g2, ub, gp_id = self._fixture(client, db)
        # Capture plain ids before the delete: `u` is already identity-mapped in this
        # session (from _make_user), so touching u.<attr> after its row is gone re-triggers
        # an expired-attribute reload and raises ObjectDeletedError instead of just working.
        u_id, w_id, v_id, x_id = u.id, w.id, v.id, x.id
        auth_u = _auth(u)

        r = client.post("/auth/delete-account/me", headers=auth_u)
        assert r.status_code == 200
        assert r.json() == {"message": "Account deleted"}

        db.expire_all()
        assert db.exec(select(m.User).where(m.User.id == u_id)).first() is None
        assert db.exec(select(m.GroupActivity).where(m.GroupActivity.user_id == u_id)).all() == []
        assert db.exec(select(m.GroupActivity).where(m.GroupActivity.group_id == g1)).all() == []
        assert db.get(m.ReadingGroup, g1) is None

        assert db.exec(select(m.GroupMember).where(m.GroupMember.invited_by == u_id)).all() == []
        v_row = db.exec(select(m.GroupMember).where(
            m.GroupMember.group_id == g2, m.GroupMember.user_id == v_id
        )).first()
        assert v_row is None
        x_row = db.exec(select(m.GroupMember).where(
            m.GroupMember.group_id == g2, m.GroupMember.user_id == x_id
        )).first()
        assert x_row is not None
        assert x_row.status == "active"
        assert x_row.invited_by is None

        gp = db.get(m.GroupPost, gp_id)
        assert gp is not None
        assert gp.userbook_id is None

        assert db.exec(select(m.ReadingActivity).where(m.ReadingActivity.user_id == u_id)).all() == []
        assert db.exec(select(m.UserBook).where(m.UserBook.user_id == u_id)).all() == []

    def test_delete_account_keeps_other_users_rows(self, client, db):
        from app import models as m

        u, w, v, x, g1, g2, ub, gp_id = self._fixture(client, db)
        w_id, x_id = w.id, x.id
        auth_u, auth_w = _auth(u), _auth(w)

        client.post("/auth/delete-account/me", headers=auth_u)
        db.expire_all()

        assert db.get(m.ReadingGroup, g2) is not None
        w_row = db.exec(select(m.GroupMember).where(
            m.GroupMember.group_id == g2, m.GroupMember.user_id == w_id
        )).first()
        assert w_row is not None
        assert w_row.role == "curator"
        x_row = db.exec(select(m.GroupMember).where(
            m.GroupMember.group_id == g2, m.GroupMember.user_id == x_id
        )).first()
        assert x_row is not None
        assert x_row.status == "active"

        r = client.get(f"/groups/{g2}/posts", headers=auth_w)
        assert r.status_code == 200
        assert any(p["id"] == gp_id for p in r.json())

        r2 = client.get("/profile/me", headers=_auth(w))
        assert r2.status_code == 200


REVIEW_SECRET = "test-review-secret-value"


def _configure(monkeypatch, emails, secret=REVIEW_SECRET):
    monkeypatch.setenv("REVIEW_LOGIN_SECRET", secret)
    monkeypatch.setenv("REVIEW_LOGIN_EMAILS", emails)


class TestReviewLogin:
    @pytest.fixture(autouse=True)
    def _clean_review_env(self, monkeypatch):
        monkeypatch.delenv("REVIEW_LOGIN_SECRET", raising=False)
        monkeypatch.delenv("REVIEW_LOGIN_EMAILS", raising=False)

    # ── T01-T05: unconfigured -> 404 ────────────────────────────────────────

    def test_404_when_both_env_vars_unset(self, client):
        r = client.post(
            "/auth/review-login",
            json={"email": "review.reader@trackmyread.com", "secret": "anything"},
        )
        assert r.status_code == 404
        assert r.json() == {"detail": "Not Found"}

    def test_404_when_only_secret_set(self, client, monkeypatch):
        monkeypatch.setenv("REVIEW_LOGIN_SECRET", REVIEW_SECRET)
        r = client.post(
            "/auth/review-login",
            json={"email": "review.reader@trackmyread.com", "secret": REVIEW_SECRET},
        )
        assert r.status_code == 404

    def test_404_when_only_emails_set(self, client, monkeypatch):
        monkeypatch.setenv("REVIEW_LOGIN_EMAILS", "review.reader@trackmyread.com")
        r = client.post(
            "/auth/review-login",
            json={"email": "review.reader@trackmyread.com", "secret": "anything"},
        )
        assert r.status_code == 404

    def test_404_when_secret_is_blank(self, client, monkeypatch):
        monkeypatch.setenv("REVIEW_LOGIN_SECRET", "   ")
        monkeypatch.setenv("REVIEW_LOGIN_EMAILS", "review.reader@trackmyread.com")
        r = client.post(
            "/auth/review-login",
            json={"email": "review.reader@trackmyread.com", "secret": "   "},
        )
        assert r.status_code == 404

    def test_404_when_allowlist_is_only_separators(self, client, monkeypatch):
        monkeypatch.setenv("REVIEW_LOGIN_EMAILS", " , , ")
        monkeypatch.setenv("REVIEW_LOGIN_SECRET", REVIEW_SECRET)
        r = client.post(
            "/auth/review-login",
            json={"email": "review.reader@trackmyread.com", "secret": REVIEW_SECRET},
        )
        assert r.status_code == 404

    # ── T06-T16: wrong credentials -> 401 (never 200, never 500) ────────────

    def test_401_when_email_not_allowlisted(self, client, db, monkeypatch):
        _configure(monkeypatch, "review.reader@trackmyread.com")
        r = client.post(
            "/auth/review-login",
            json={"email": "stranger@trackmyread.com", "secret": REVIEW_SECRET},
        )
        assert r.status_code == 401
        assert r.json()["detail"] == "Invalid review credentials"
        db.expire_all()
        assert crud.get_user_by_email(db, "stranger@trackmyread.com") is None

    def test_401_when_secret_wrong(self, client, db, monkeypatch):
        _configure(monkeypatch, "review.wrongsecret@trackmyread.com")
        r = client.post(
            "/auth/review-login",
            json={"email": "review.wrongsecret@trackmyread.com", "secret": "not-the-secret"},
        )
        assert r.status_code == 401
        assert r.json()["detail"] == "Invalid review credentials"
        db.expire_all()
        assert crud.get_user_by_email(db, "review.wrongsecret@trackmyread.com") is None

    def test_401_bodies_are_identical_for_bad_email_and_bad_secret(self, client, monkeypatch):
        _configure(monkeypatch, "review.identical@trackmyread.com")
        r1 = client.post(
            "/auth/review-login",
            json={"email": "stranger.identical@trackmyread.com", "secret": REVIEW_SECRET},
        )
        r2 = client.post(
            "/auth/review-login",
            json={"email": "review.identical@trackmyread.com", "secret": "wrong-secret-value"},
        )
        assert r1.status_code == r2.status_code == 401
        assert r1.json() == r2.json()

    def test_401_when_allowlisted_email_is_not_trackmyread_domain(self, client, db, monkeypatch):
        monkeypatch.setenv("REVIEW_LOGIN_EMAILS", "someone@gmail.com")
        monkeypatch.setenv("REVIEW_LOGIN_SECRET", REVIEW_SECRET)
        r = client.post(
            "/auth/review-login",
            json={"email": "someone@gmail.com", "secret": REVIEW_SECRET},
        )
        assert r.status_code == 401
        assert r.json()["detail"] == "Invalid review credentials"
        assert "access_token" not in r.json()
        db.expire_all()
        assert crud.get_user_by_email(db, "someone@gmail.com") is None

    def test_401_when_allowlisted_domain_is_a_lookalike(self, client, db, monkeypatch):
        monkeypatch.setenv("REVIEW_LOGIN_EMAILS", "x@trackmyread.com.evil.io")
        monkeypatch.setenv("REVIEW_LOGIN_SECRET", REVIEW_SECRET)
        r = client.post(
            "/auth/review-login",
            json={"email": "x@trackmyread.com.evil.io", "secret": REVIEW_SECRET},
        )
        assert r.status_code == 401
        db.expire_all()
        assert crud.get_user_by_email(db, "x@trackmyread.com.evil.io") is None

        # mirror: a subdomain of the real domain also does not end in "@trackmyread.com"
        monkeypatch.setenv("REVIEW_LOGIN_EMAILS", "review.sub@mail.trackmyread.com")
        r2 = client.post(
            "/auth/review-login",
            json={"email": "review.sub@mail.trackmyread.com", "secret": REVIEW_SECRET},
        )
        assert r2.status_code == 401

    def test_401_when_secret_is_a_prefix_of_the_real_one(self, client, monkeypatch):
        _configure(monkeypatch, "review.prefix@trackmyread.com")
        r = client.post(
            "/auth/review-login",
            json={"email": "review.prefix@trackmyread.com", "secret": REVIEW_SECRET[:-1]},
        )
        assert r.status_code == 401

    def test_401_when_secret_has_the_real_one_as_a_prefix(self, client, monkeypatch):
        _configure(monkeypatch, "review.prefix2@trackmyread.com")
        r = client.post(
            "/auth/review-login",
            json={"email": "review.prefix2@trackmyread.com", "secret": REVIEW_SECRET + "x"},
        )
        assert r.status_code == 401

    def test_401_when_secret_is_empty_string(self, client, db, monkeypatch):
        _configure(monkeypatch, "review.empty@trackmyread.com")
        r = client.post(
            "/auth/review-login",
            json={"email": "review.empty@trackmyread.com", "secret": ""},
        )
        assert r.status_code == 401
        assert r.json()["detail"] == "Invalid review credentials"
        db.expire_all()
        assert crud.get_user_by_email(db, "review.empty@trackmyread.com") is None

    def test_422_when_secret_field_missing(self, client, monkeypatch):
        _configure(monkeypatch, "review.nosecret@trackmyread.com")
        r = client.post(
            "/auth/review-login",
            json={"email": "review.nosecret@trackmyread.com"},
        )
        assert r.status_code == 422

        monkeypatch.delenv("REVIEW_LOGIN_SECRET", raising=False)
        monkeypatch.delenv("REVIEW_LOGIN_EMAILS", raising=False)
        r2 = client.post(
            "/auth/review-login",
            json={"email": "review.nosecret@trackmyread.com"},
        )
        assert r2.status_code == 422

    def test_401_when_secret_is_non_ascii_never_500(self, client, monkeypatch):
        _configure(monkeypatch, "review.unicode@trackmyread.com")
        r = client.post(
            "/auth/review-login",
            json={"email": "review.unicode@trackmyread.com", "secret": "\U0001F511пароль"},
        )
        assert r.status_code == 401

    def test_401_for_absurdly_long_email_and_secret(self, client, db, monkeypatch):
        _configure(monkeypatch, "review.long@trackmyread.com")
        r = client.post(
            "/auth/review-login",
            json={"email": "a" * 10000 + "@trackmyread.com", "secret": "b" * 10000},
        )
        assert r.status_code == 401
        db.expire_all()

    # ── T17-T28: the happy path and its contracts ───────────────────────────

    def test_200_happy_path_is_new_true_and_name_title_cased(self, client, monkeypatch):
        _configure(monkeypatch, "review.reader@trackmyread.com")
        r = client.post(
            "/auth/review-login",
            json={"email": "review.reader@trackmyread.com", "secret": REVIEW_SECRET},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["is_new"] is True
        assert isinstance(body["access_token"], str) and body["access_token"]
        assert body["user"]["email"] == "review.reader@trackmyread.com"
        assert body["user"]["name"] == "Review.Reader"
        assert isinstance(body["user"]["id"], int)

    def test_response_shape_matches_google_auth_exactly(self, client, monkeypatch):
        _configure(monkeypatch, "review.shape@trackmyread.com")
        r = client.post(
            "/auth/review-login",
            json={"email": "review.shape@trackmyread.com", "secret": REVIEW_SECRET},
        )
        body = r.json()
        assert set(body) == {"access_token", "is_new", "user"}
        assert set(body["user"]) == {"id", "name", "email"}

    def test_second_login_returns_is_new_false_and_same_user_id(self, client, monkeypatch):
        _configure(monkeypatch, "review.twice@trackmyread.com")
        payload = {"email": "review.twice@trackmyread.com", "secret": REVIEW_SECRET}
        r1 = client.post("/auth/review-login", json=payload)
        r2 = client.post("/auth/review-login", json=payload)
        assert r1.json()["is_new"] is True
        assert r2.json()["is_new"] is False
        assert r1.json()["user"]["id"] == r2.json()["user"]["id"]

    def test_email_matched_case_and_whitespace_insensitively(self, client, db, monkeypatch):
        monkeypatch.setenv("REVIEW_LOGIN_EMAILS", "review.case@trackmyread.com")
        monkeypatch.setenv("REVIEW_LOGIN_SECRET", REVIEW_SECRET)

        r1 = client.post(
            "/auth/review-login",
            json={"email": "  Review.Case@TrackMyRead.com  ", "secret": REVIEW_SECRET},
        )
        assert r1.status_code == 200
        assert r1.json()["is_new"] is True
        assert r1.json()["user"]["email"] == "review.case@trackmyread.com"

        r2 = client.post(
            "/auth/review-login",
            json={"email": "review.case@trackmyread.com", "secret": REVIEW_SECRET},
        )
        assert r2.status_code == 200
        assert r2.json()["is_new"] is False
        assert r2.json()["user"]["id"] == r1.json()["user"]["id"]

        db.expire_all()
        rows = db.exec(
            select(models.User).where(func.lower(models.User.email) == "review.case@trackmyread.com")
        ).all()
        assert len(rows) == 1

    def test_allowlist_entries_are_trimmed_and_lowercased(self, client, monkeypatch):
        monkeypatch.setenv(
            "REVIEW_LOGIN_EMAILS",
            " Review.Trim@TrackMyRead.com , other@trackmyread.com ",
        )
        monkeypatch.setenv("REVIEW_LOGIN_SECRET", REVIEW_SECRET)
        r = client.post(
            "/auth/review-login",
            json={"email": "review.trim@trackmyread.com", "secret": REVIEW_SECRET},
        )
        assert r.status_code == 200

    def test_name_uses_title_not_capitalize(self, client, monkeypatch):
        _configure(monkeypatch, "review.namecheck@trackmyread.com")
        r = client.post(
            "/auth/review-login",
            json={"email": "review.namecheck@trackmyread.com", "secret": REVIEW_SECRET},
        )
        assert r.json()["user"]["name"] == "Review.Namecheck"

    def test_token_works_on_profile_me(self, client, monkeypatch):
        _configure(monkeypatch, "review.profile@trackmyread.com")
        r = client.post(
            "/auth/review-login",
            json={"email": "review.profile@trackmyread.com", "secret": REVIEW_SECRET},
        )
        token = r.json()["access_token"]
        user_id = r.json()["user"]["id"]

        r2 = client.get("/profile/me", headers={"Authorization": f"Bearer {token}"})
        assert r2.status_code == 200
        assert r2.json()["email"] == "review.profile@trackmyread.com"
        assert r2.json()["id"] == user_id

    def test_token_works_on_userbooks_and_returns_empty_list(self, client, monkeypatch):
        _configure(monkeypatch, "review.empty.library@trackmyread.com")
        r = client.post(
            "/auth/review-login",
            json={"email": "review.empty.library@trackmyread.com", "secret": REVIEW_SECRET},
        )
        token = r.json()["access_token"]

        r2 = client.get("/userbooks/", headers={"Authorization": f"Bearer {token}"})
        assert r2.status_code == 200
        assert r2.json() == []

    def test_last_active_set_to_today(self, client, db, monkeypatch, pinned_now):
        _configure(monkeypatch, "review.active@trackmyread.com")
        r = client.post(
            "/auth/review-login",
            json={"email": "review.active@trackmyread.com", "secret": REVIEW_SECRET},
        )
        assert r.status_code == 200

        db.expire_all()
        user = crud.get_user_by_email(db, "review.active@trackmyread.com")
        assert user.last_active is not None
        # F-62: login sets last_active to the seam's now, never date.today() (which floats
        # with the machine's local date and fails inside 00:00-05:30 IST).
        assert user.last_active == pinned_now

    def test_last_active_refreshed_at_local_midnight_boundary(self, client, db, monkeypatch, freeze_at):
        _configure(monkeypatch, "review.4c.a3@trackmyread.com")
        freeze_at("2026-09-17T18:00:00")
        client.post(
            "/auth/review-login",
            json={"email": "review.4c.a3@trackmyread.com", "secret": REVIEW_SECRET},
        )
        freeze_at("2026-09-17T19:00:00")
        r = client.post(
            "/auth/review-login",
            json={"email": "review.4c.a3@trackmyread.com", "secret": REVIEW_SECRET},
        )
        assert r.status_code == 200
        db.expire_all()
        user = crud.get_user_by_email(db, "review.4c.a3@trackmyread.com")
        assert user.last_active == datetime(2026, 9, 17, 19, 0)

    def test_password_hash_is_not_the_review_secret(self, client, db, monkeypatch):
        _configure(monkeypatch, "review.pwd@trackmyread.com")
        r = client.post(
            "/auth/review-login",
            json={"email": "review.pwd@trackmyread.com", "secret": REVIEW_SECRET},
        )
        assert r.status_code == 200

        db.expire_all()
        user = crud.get_user_by_email(db, "review.pwd@trackmyread.com")
        assert auth.verify_password(REVIEW_SECRET, user.password_hash) is False
        assert auth.verify_password("review.pwd@trackmyread.com", user.password_hash) is False
        assert user.password_hash
        assert REVIEW_SECRET not in user.password_hash

    def test_review_user_is_not_admin(self, client, db, monkeypatch):
        _configure(monkeypatch, "review.notadmin@trackmyread.com")
        r = client.post(
            "/auth/review-login",
            json={"email": "review.notadmin@trackmyread.com", "secret": REVIEW_SECRET},
        )
        token = r.json()["access_token"]

        db.expire_all()
        user = crud.get_user_by_email(db, "review.notadmin@trackmyread.com")
        assert user.is_admin is False

        r2 = client.get("/admin/stats", headers={"Authorization": f"Bearer {token}"})
        assert r2.status_code == 403

    def test_extra_body_fields_are_ignored(self, client, db, monkeypatch):
        _configure(monkeypatch, "review.extra@trackmyread.com")
        r = client.post(
            "/auth/review-login",
            json={
                "email": "review.extra@trackmyread.com",
                "secret": REVIEW_SECRET,
                "is_admin": True,
                "id": 1,
                "name": "Injected",
                "username": "root",
            },
        )
        assert r.status_code == 200
        body = r.json()
        assert body["user"]["name"] == "Review.Extra"
        assert body["user"]["id"] != 1

        db.expire_all()
        user = crud.get_user_by_email(db, "review.extra@trackmyread.com")
        assert user.is_admin is False

    # ── T29: env must not leak between tests — must run right after T28 ─────

    def test_404_again_after_a_successful_login_when_env_removed(self, client):
        assert os.getenv("REVIEW_LOGIN_SECRET") is None
        assert os.getenv("REVIEW_LOGIN_EMAILS") is None
        r = client.post(
            "/auth/review-login",
            json={"email": "review.extra@trackmyread.com", "secret": REVIEW_SECRET},
        )
        assert r.status_code == 404

    # ── T30: ownership — a review token is an ordinary user token ───────────

    def test_review_token_cannot_mutate_another_users_userbook(self, client, db, monkeypatch):
        alice = _make_user(db, email="rl_owner@example.com", name="Alice")
        book = models.Book(title="Ownership Probe", author="QA")
        db.add(book)
        db.commit()
        db.refresh(book)
        ub = models.UserBook(user_id=alice.id, book_id=book.id, status="reading", rating=None)
        db.add(ub)
        db.commit()
        db.refresh(ub)

        _configure(monkeypatch, "review.owner@trackmyread.com")
        r = client.post(
            "/auth/review-login",
            json={"email": "review.owner@trackmyread.com", "secret": REVIEW_SECRET},
        )
        token = r.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        r2 = client.patch(f"/userbooks/{ub.id}", json={"rating": 5}, headers=headers)
        assert r2.status_code == 404

        r3 = client.delete(f"/userbooks/{ub.id}", headers=headers)
        assert r3.status_code == 404

        db.expire_all()
        row = crud.get_userbook(db, userbook_id=ub.id)
        assert row is not None
        assert row.rating is None
        assert row.status == "reading"

    # ── T31-T32: schema visibility / method handling ────────────────────────

    def test_route_absent_from_openapi_schema(self, client):
        r = client.get("/openapi.json")
        assert r.status_code == 200
        assert "/auth/review-login" not in r.json()["paths"]

    def test_get_on_review_login_is_405_not_404(self, client):
        r = client.get("/auth/review-login")
        assert r.status_code == 405


class TestGoogleLoginLastActive:
    """Sprint 4C: login is activity on the reader's day, whatever their zone (R-10)."""

    def test_google_login_sets_last_active_to_now(self, client, db, monkeypatch, freeze_at):
        from google.oauth2 import id_token as _id_token

        def _fake_verify(token, request, audience=None, clock_skew_in_seconds=10):
            return {"email": "4c-a4@example.com", "name": "A4", "sub": "g-4c-a4"}

        monkeypatch.setattr(_id_token, "verify_oauth2_token", _fake_verify)

        freeze_at("2026-09-17T18:00:00")
        r1 = client.post("/auth/google", json={"token": "fake-token"})
        assert r1.status_code == 200

        freeze_at("2026-09-17T19:00:00")
        r2 = client.post("/auth/google", json={"token": "fake-token"})
        assert r2.status_code == 200

        db.expire_all()
        user = crud.get_user_by_email(db, "4c-a4@example.com")
        assert user.last_active == datetime(2026, 9, 17, 19, 0)
