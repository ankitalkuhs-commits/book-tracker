"""Tests for POST /auth/signup and POST /auth/login."""
import os
from datetime import date

import pytest
from sqlmodel import select, func

from app import auth, crud, models
from tests.conftest import _make_user, _auth


class TestSignup:
    def test_signup_success(self, client):
        r = client.post("/auth/signup", json={"name": "Carol", "email": "carol@example.com", "password": "strongpass1"})
        assert r.status_code == 200
        data = r.json()
        assert "access_token" in data
        assert data["user"]["email"] == "carol@example.com"

    def test_signup_duplicate_email(self, client, db):
        _make_user(db, email="dup@example.com")
        r = client.post("/auth/signup", json={"name": "Dup", "email": "dup@example.com", "password": "strongpass1"})
        assert r.status_code == 400
        assert "already registered" in r.json()["detail"]

    def test_signup_short_password(self, client):
        r = client.post("/auth/signup", json={"name": "Short", "email": "short@example.com", "password": "abc"})
        assert r.status_code == 422  # validation error


class TestLogin:
    def test_login_success(self, client, db):
        _make_user(db, email="login_ok@example.com", password="mypassword")
        r = client.post("/auth/login", json={"email": "login_ok@example.com", "password": "mypassword"})
        assert r.status_code == 200
        assert "access_token" in r.json()

    def test_login_wrong_password(self, client, db):
        _make_user(db, email="login_bad@example.com", password="correct")
        r = client.post("/auth/login", json={"email": "login_bad@example.com", "password": "wrong"})
        assert r.status_code == 401

    def test_login_unknown_email(self, client):
        r = client.post("/auth/login", json={"email": "nobody@example.com", "password": "whatever"})
        assert r.status_code == 401

    def test_no_token_on_protected_endpoint(self, client):
        r = client.get("/userbooks/")
        assert r.status_code == 401

    def test_invalid_token_rejected(self, client):
        r = client.get("/userbooks/", headers={"Authorization": "Bearer notarealtoken"})
        assert r.status_code == 401


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

    def test_last_active_set_to_today(self, client, db, monkeypatch):
        _configure(monkeypatch, "review.active@trackmyread.com")
        r = client.post(
            "/auth/review-login",
            json={"email": "review.active@trackmyread.com", "secret": REVIEW_SECRET},
        )
        assert r.status_code == 200

        db.expire_all()
        user = crud.get_user_by_email(db, "review.active@trackmyread.com")
        assert user.last_active is not None
        assert user.last_active.date() == date.today()

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
