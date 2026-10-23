"""Administrator customer-directory tests.

The directory is read-only and must never expose authentication internals.
Every request is checked by the backend role guard, not by a hidden UI control.
"""

from __future__ import annotations

from datetime import date

from fastapi.testclient import TestClient

from app.models import (
    Achievement,
    AgreementMethod,
    AgreementStatus,
    ContactMessage,
    ResultType,
    SafetyAgreement,
)
from tests.conftest import auth_headers, login, make_user


def test_customer_directory_rejects_non_admins(client: TestClient, customer, staff) -> None:
    assert client.get("/api/admin/customers").status_code == 401

    customer_token = login(client, customer.email)
    assert (
        client.get("/api/admin/customers", headers=auth_headers(customer_token)).status_code == 403
    )

    staff_token = login(client, staff.email)
    assert client.get("/api/admin/customers", headers=auth_headers(staff_token)).status_code == 403


def test_directory_returns_safe_fields_and_activity(
    client: TestClient, db, admin, customer, other_customer, route
) -> None:
    customer.phone = "0901234567"
    customer.membership_tier = "Monthly"
    customer.membership_status = "active"
    customer.joined_on = date(2026, 1, 5)
    db.add(
        SafetyAgreement(
            user_id=customer.id,
            status=AgreementStatus.SIGNED,
            version="2026-01",
        )
    )
    db.add_all(
        [
            Achievement(
                user_id=customer.id,
                route_id=route.id,
                route_name=route.name,
                grade=route.grade,
                result=ResultType.SENT,
                attempts=1,
                climbed_on=date(2026, 10, 20),
            ),
            Achievement(
                user_id=customer.id,
                route_name="Project Line",
                grade="V6",
                result=ResultType.PROJECT,
                attempts=4,
                climbed_on=date(2026, 10, 21),
            ),
        ]
    )
    db.commit()

    token = login(client, admin.email)
    response = client.get("/api/admin/customers?role=customer", headers=auth_headers(token))
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["total"] == 2
    assert payload["limit"] == 25
    assert payload["offset"] == 0

    by_email = {item["email"]: item for item in payload["items"]}
    alex = by_email[customer.email]
    assert alex["full_name"] == "Alex Nguyen"
    assert alex["role"] == "customer"
    assert alex["is_active"] is True
    assert alex["agreement_status"] == "signed"
    assert alex["total_sends"] == 1
    assert alex["last_climb_on"] == "2026-10-21"
    assert alex["membership_tier"] == "Monthly"
    assert alex["joined_on"] == "2026-01-05"
    assert "password_hash" not in alex
    assert "email" in alex and "full_name" in alex

    other = by_email[other_customer.email]
    assert other["agreement_status"] is None
    assert other["total_sends"] == 0
    assert other["last_climb_on"] is None


def test_directory_search_filters_and_empty_result(
    client: TestClient, db, admin, customer, other_customer
) -> None:
    customer.phone = "0901234567"
    other_customer.full_name = "Bao Tran"
    db.commit()
    token = login(client, admin.email)
    headers = auth_headers(token)

    by_name = client.get("/api/admin/customers?search=alex", headers=headers)
    assert by_name.status_code == 200
    assert [item["email"] for item in by_name.json()["items"]] == [customer.email]

    by_email = client.get("/api/admin/customers?search=other%40example.com", headers=headers)
    assert [item["email"] for item in by_email.json()["items"]] == [other_customer.email]

    by_phone = client.get("/api/admin/customers?search=0901234567", headers=headers)
    assert [item["email"] for item in by_phone.json()["items"]] == [customer.email]

    empty = client.get("/api/admin/customers?search=nobody", headers=headers)
    assert empty.status_code == 200
    assert empty.json()["items"] == []
    assert empty.json()["total"] == 0


def test_directory_filters_by_role_and_account_status(
    client: TestClient, db, admin, customer, staff
) -> None:
    inactive = make_user(db, "inactive@example.com", full_name="Inactive Climber")
    inactive.is_active = False
    db.commit()
    token = login(client, admin.email)
    headers = auth_headers(token)

    staff_only = client.get("/api/admin/customers?role=staff", headers=headers)
    assert {item["email"] for item in staff_only.json()["items"]} == {staff.email}

    inactive_only = client.get("/api/admin/customers?status=inactive", headers=headers)
    assert [item["email"] for item in inactive_only.json()["items"]] == [inactive.email]

    active_only = client.get("/api/admin/customers?status=active", headers=headers)
    active_emails = {item["email"] for item in active_only.json()["items"]}
    assert customer.email in active_emails
    assert inactive.email not in active_emails


def test_directory_paginates_with_a_stable_total(
    client: TestClient, admin, customer, other_customer
) -> None:
    token = login(client, admin.email)
    headers = auth_headers(token)

    first = client.get("/api/admin/customers?role=customer&limit=1&offset=0", headers=headers)
    second = client.get("/api/admin/customers?role=customer&limit=1&offset=1", headers=headers)
    assert first.status_code == 200 and second.status_code == 200
    assert first.json()["total"] == 2
    assert second.json()["total"] == 2
    assert len(first.json()["items"]) == 1
    assert len(second.json()["items"]) == 1
    assert first.json()["items"][0]["email"] != second.json()["items"][0]["email"]
    assert first.json()["limit"] == 1 and first.json()["offset"] == 0
    assert second.json()["limit"] == 1 and second.json()["offset"] == 1


def test_legacy_members_endpoint_still_returns_safe_records(
    client: TestClient, admin, customer
) -> None:
    token = login(client, admin.email)
    response = client.get("/api/admin/members", headers=auth_headers(token))
    assert response.status_code == 200
    assert customer.email in {item["email"] for item in response.json()}
    assert all("password_hash" not in item for item in response.json())


def test_customer_detail_is_admin_only(client: TestClient, customer, staff) -> None:
    assert client.get(f"/api/admin/customers/{customer.id}").status_code == 401

    customer_token = login(client, customer.email)
    assert (
        client.get(
            f"/api/admin/customers/{customer.id}",
            headers=auth_headers(customer_token),
        ).status_code
        == 403
    )

    staff_token = login(client, staff.email)
    assert (
        client.get(
            f"/api/admin/customers/{customer.id}",
            headers=auth_headers(staff_token),
        ).status_code
        == 403
    )


def test_customer_detail_includes_bounded_activity_and_linked_email_history(
    client: TestClient, db, admin, customer, route
) -> None:
    customer.phone = "0901234567"
    customer.climbing_level = 4
    customer.joined_on = date(2026, 1, 5)
    db.add(
        SafetyAgreement(
            user_id=customer.id,
            status=AgreementStatus.SIGNED,
            version="2026-01",
            method=AgreementMethod.DIGITAL_SIGNATURE,
            signed_name="Alex Nguyen",
        )
    )
    db.add_all(
        [
            Achievement(
                user_id=customer.id,
                route_id=route.id,
                route_name=route.name,
                grade=route.grade,
                result=ResultType.SENT,
                attempts=1,
                climbed_on=date(2026, 10, 20),
            ),
            Achievement(
                user_id=customer.id,
                route_name="Project Line",
                grade="V6",
                result=ResultType.PROJECT,
                attempts=4,
                climbed_on=date(2026, 10, 21),
            ),
            ContactMessage(
                name="Alex Nguyen",
                email=customer.email.upper(),
                subject="Opening hours",
                message="A long private message that should not be returned in the summary.",
            ),
            ContactMessage(
                name="Someone Else",
                email="other@example.com",
                subject="Not this customer",
                message="Not linked.",
            ),
        ]
    )
    db.commit()

    token = login(client, admin.email)
    response = client.get(f"/api/admin/customers/{customer.id}", headers=auth_headers(token))
    assert response.status_code == 200, response.text
    payload = response.json()

    assert payload["email"] == customer.email
    assert payload["phone"] == "0901234567"
    assert payload["climbing_level"] == 4
    assert payload["agreement"]["status"] == "signed"
    assert payload["agreement"]["method"] == "digital_signature"
    assert payload["agreement"]["version"] == "2026-01"
    assert payload["activity"] == {
        "sends": 1,
        "flashes": 1,
        "projects": 1,
        "attempts": 5,
        "total_climbs": 2,
    }
    assert payload["last_climb_on"] == "2026-10-21"
    assert [attempt["route_name"] for attempt in payload["recent_attempts"]] == [
        "Project Line",
        route.name,
    ]
    assert [message["subject"] for message in payload["recent_contact_messages"]] == [
        "Opening hours"
    ]
    assert "not linked" in payload["contact_history_note"].lower()
    assert "message" not in payload["recent_contact_messages"][0]
    assert "password_hash" not in payload


def test_customer_detail_distinguishes_missing_agreement_and_activity(
    client: TestClient, admin, other_customer
) -> None:
    token = login(client, admin.email)
    response = client.get(f"/api/admin/customers/{other_customer.id}", headers=auth_headers(token))
    assert response.status_code == 200, response.text
    payload = response.json()

    assert payload["agreement"] is None
    assert payload["agreement_status"] is None
    assert payload["phone"] is None
    assert payload["activity"] == {
        "sends": 0,
        "flashes": 0,
        "projects": 0,
        "attempts": 0,
        "total_climbs": 0,
    }
    assert payload["recent_attempts"] == []
    assert payload["recent_contact_messages"] == []
    assert payload["last_climb_on"] is None


def test_customer_detail_missing_record_is_404(client: TestClient, admin) -> None:
    token = login(client, admin.email)
    response = client.get("/api/admin/customers/999999", headers=auth_headers(token))
    assert response.status_code == 404
