"""Tests for authentication, registration and profile handling."""

from __future__ import annotations

from fastapi.testclient import TestClient

from tests.conftest import auth_headers, login


def test_register_creates_a_customer_and_returns_a_token(client: TestClient) -> None:
    response = client.post(
        "/api/auth/register",
        json={
            "email": "New.Climber@Example.com",
            "full_name": "New Climber",
            "password": "a-long-enough-password",
        },
    )
    assert response.status_code == 201, response.text
    payload = response.json()
    assert payload["user"]["role"] == "customer"
    assert payload["user"]["email"] == "new.climber@example.com"
    assert payload["access_token"]


def test_register_rejects_a_duplicate_email(client: TestClient) -> None:
    body = {
        "email": "dupe@example.com",
        "full_name": "First",
        "password": "a-long-enough-password",
    }
    assert client.post("/api/auth/register", json=body).status_code == 201
    second = client.post("/api/auth/register", json=body)
    assert second.status_code == 409


def test_register_rejects_a_short_password(client: TestClient) -> None:
    response = client.post(
        "/api/auth/register",
        json={"email": "a@example.com", "full_name": "A", "password": "short"},
    )
    assert response.status_code == 422


def test_register_rejects_a_malformed_email(client: TestClient) -> None:
    response = client.post(
        "/api/auth/register",
        json={"email": "not-an-email", "full_name": "A", "password": "a-long-enough-password"},
    )
    assert response.status_code == 422


def test_login_returns_a_token(client: TestClient, customer) -> None:
    token = login(client, customer.email)
    assert token


def test_login_rejects_a_wrong_password(client: TestClient, customer) -> None:
    response = client.post(
        "/api/auth/login", json={"email": customer.email, "password": "wrong-password"}
    )
    assert response.status_code == 401
    assert "Incorrect email or password" in response.json()["detail"]


def test_login_for_an_unknown_email_is_rejected(client: TestClient) -> None:
    response = client.post(
        "/api/auth/login", json={"email": "nobody@example.com", "password": "whatever"}
    )
    assert response.status_code == 401


def test_me_requires_a_token(client: TestClient) -> None:
    assert client.get("/api/auth/me").status_code == 401


def test_me_rejects_a_garbage_token(client: TestClient) -> None:
    response = client.get("/api/auth/me", headers=auth_headers("not-a-jwt"))
    assert response.status_code == 401


def test_me_returns_the_signed_in_user(client: TestClient, customer) -> None:
    token = login(client, customer.email)
    response = client.get("/api/auth/me", headers=auth_headers(token))
    assert response.status_code == 200
    assert response.json()["email"] == customer.email


def test_profile_update_only_touches_the_own_account(client: TestClient, customer) -> None:
    token = login(client, customer.email)
    response = client.patch(
        "/api/auth/me",
        json={"full_name": "Alex N.", "climbing_level": 5},
        headers=auth_headers(token),
    )
    assert response.status_code == 200
    assert response.json()["full_name"] == "Alex N."
    assert response.json()["climbing_level"] == 5


def test_profile_update_rejects_an_out_of_range_level(client: TestClient, customer) -> None:
    token = login(client, customer.email)
    response = client.patch(
        "/api/auth/me", json={"climbing_level": 99}, headers=auth_headers(token)
    )
    assert response.status_code == 422


def test_a_deactivated_account_cannot_sign_in(client: TestClient, db, customer) -> None:
    stored = db.get(type(customer), customer.id)
    stored.is_active = False
    db.commit()

    response = client.post(
        "/api/auth/login", json={"email": customer.email, "password": "correct-horse-battery"}
    )
    assert response.status_code == 403
