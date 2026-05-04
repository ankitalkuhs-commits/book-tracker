"""Tests for POST /auth/signup and POST /auth/login."""
import pytest
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
