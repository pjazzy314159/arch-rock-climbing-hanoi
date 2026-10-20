"""Tests for the customer-facing endpoints: logbook, agreement, voting and
the leaderboard. Ownership is checked on the server, not in the UI."""

from __future__ import annotations

from fastapi.testclient import TestClient

from tests.conftest import auth_headers, login


def test_logbook_requires_authentication(client: TestClient) -> None:
    assert client.get("/api/me/logbook").status_code == 401
    assert (
        client.post("/api/me/logbook", json={"route_name": "X", "grade": "V1"}).status_code == 401
    )


def test_logging_a_climb_returns_the_entry(client: TestClient, customer) -> None:
    token = login(client, customer.email)
    response = client.post(
        "/api/me/logbook",
        json={"route_name": "Quiet the Mind", "grade": "V3", "attempts": 2, "result": "sent"},
        headers=auth_headers(token),
    )
    assert response.status_code == 201, response.text
    assert response.json()["grade"] == "V3"
    assert response.json()["attempts"] == 2


def test_a_member_only_sees_their_own_logbook(client: TestClient, customer, other_customer) -> None:
    token = login(client, customer.email)
    client.post(
        "/api/me/logbook",
        json={"route_name": "My climb", "grade": "V2"},
        headers=auth_headers(token),
    )
    other_token = login(client, other_customer.email)
    response = client.get("/api/me/logbook", headers=auth_headers(other_token))
    assert response.status_code == 200
    assert response.json() == []


def test_a_member_cannot_delete_another_members_entry(
    client: TestClient, customer, other_customer
) -> None:
    token = login(client, customer.email)
    created = client.post(
        "/api/me/logbook",
        json={"route_name": "My climb", "grade": "V2"},
        headers=auth_headers(token),
    )
    entry_id = created.json()["id"]

    other_token = login(client, other_customer.email)
    response = client.delete(f"/api/me/logbook/{entry_id}", headers=auth_headers(other_token))
    assert response.status_code == 404


def test_dashboard_summarises_the_members_own_record(client: TestClient, customer) -> None:
    token = login(client, customer.email)
    client.post(
        "/api/me/logbook",
        json={"route_name": "A", "grade": "V1", "result": "sent"},
        headers=auth_headers(token),
    )
    client.post(
        "/api/me/logbook",
        json={"route_name": "B", "grade": "V4", "result": "sent"},
        headers=auth_headers(token),
    )
    client.post(
        "/api/me/logbook",
        json={"route_name": "C", "grade": "V6", "result": "project"},
        headers=auth_headers(token),
    )
    response = client.get("/api/me/dashboard", headers=auth_headers(token))
    assert response.status_code == 200
    payload = response.json()
    assert payload["total_sends"] == 2
    assert payload["best_grade"] == "V4"
    assert payload["active_projects"] == 1


def test_agreement_is_created_for_a_new_customer(client: TestClient) -> None:
    client.post(
        "/api/auth/register",
        json={
            "email": "agreement@example.com",
            "full_name": "Agreement Person",
            "password": "a-long-enough-password",
        },
    )
    token = login(client, "agreement@example.com", "a-long-enough-password")
    response = client.get("/api/me/agreement", headers=auth_headers(token))
    assert response.status_code == 200
    assert response.json()["status"] == "pending"


def test_signing_the_agreement_records_the_signature(client: TestClient, customer) -> None:
    token = login(client, customer.email)
    response = client.post(
        "/api/me/agreement/signature",
        json={"signed_name": "Alex Nguyen", "accepted": True},
        headers=auth_headers(token),
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "signed"
    assert payload["method"] == "digital_signature"
    assert payload["signed_name"] == "Alex Nguyen"


def test_an_agreement_cannot_be_signed_without_acceptance(client: TestClient, customer) -> None:
    token = login(client, customer.email)
    response = client.post(
        "/api/me/agreement/signature",
        json={"signed_name": "Alex Nguyen", "accepted": False},
        headers=auth_headers(token),
    )
    assert response.status_code == 400


def test_voting_on_a_route_records_the_vote(client: TestClient, customer, route) -> None:
    token = login(client, customer.email)
    response = client.post(
        f"/api/me/routes/{route.id}/vote",
        json={"value": "harder", "comment": "Cruisy"},
        headers=auth_headers(token),
    )
    assert response.status_code == 200
    assert response.json()["value"] == "harder"


def test_voting_twice_replaces_the_previous_vote(client: TestClient, customer, route) -> None:
    token = login(client, customer.email)
    client.post(
        f"/api/me/routes/{route.id}/vote", json={"value": "harder"}, headers=auth_headers(token)
    )
    client.post(
        f"/api/me/routes/{route.id}/vote", json={"value": "easier"}, headers=auth_headers(token)
    )
    own = client.get(f"/api/me/routes/{route.id}/vote", headers=auth_headers(token))
    assert own.json()["value"] == "easier"

    tally = client.get(f"/api/me/routes/{route.id}/tally")
    assert tally.json()["total"] == 1
    assert tally.json()["easier"] == 1


def test_voting_on_an_unknown_route_is_a_404(client: TestClient, customer) -> None:
    token = login(client, customer.email)
    response = client.post(
        "/api/me/routes/9999/vote", json={"value": "as_set"}, headers=auth_headers(token)
    )
    assert response.status_code == 404


def test_a_vote_can_be_withdrawn(client: TestClient, customer, route) -> None:
    token = login(client, customer.email)
    client.post(
        f"/api/me/routes/{route.id}/vote", json={"value": "as_set"}, headers=auth_headers(token)
    )
    response = client.delete(f"/api/me/routes/{route.id}/vote", headers=auth_headers(token))
    assert response.status_code == 204
    assert client.get(f"/api/me/routes/{route.id}/tally").json()["total"] == 0


def test_the_leaderboard_lists_climbers_with_sends(
    client: TestClient, customer, other_customer
) -> None:
    token = login(client, customer.email)
    client.post(
        "/api/me/logbook",
        json={"route_name": "A", "grade": "V4", "result": "sent"},
        headers=auth_headers(token),
    )
    response = client.get("/api/me/leaderboard")
    assert response.status_code == 200
    entries = response.json()
    assert len(entries) == 1
    assert entries[0]["display_name"] == customer.full_name
    assert entries[0]["best_grade"] == "V4"
    assert entries[0]["rank"] == 1


def test_the_leaderboard_is_public(client: TestClient, customer) -> None:
    assert client.get("/api/me/leaderboard").status_code == 200
