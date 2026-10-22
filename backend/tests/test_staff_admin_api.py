"""Tests for the staff and administrator areas.

These are the tests that prove that permissions are enforced by the backend:
a member cannot reach staff or admin data by changing the URL.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

from app.models import TaskStatus
from tests.conftest import auth_headers, login


def test_staff_endpoints_reject_customers(client: TestClient, customer) -> None:
    token = login(client, customer.email)
    assert client.get("/api/staff/tasks", headers=auth_headers(token)).status_code == 403
    assert client.get("/api/admin/summary", headers=auth_headers(token)).status_code == 403
    assert client.get("/api/admin/members", headers=auth_headers(token)).status_code == 403


def test_staff_endpoints_require_a_token(client: TestClient) -> None:
    assert client.get("/api/staff/tasks").status_code == 401
    assert client.get("/api/admin/summary").status_code == 401


def test_a_staff_member_sees_only_their_own_tasks(client: TestClient, db, staff, admin) -> None:
    from app.models import StaffTask

    mine = StaffTask(title="Reset the slab", assignee_id=staff.id, created_by_id=admin.id)
    theirs = StaffTask(title="Book the mats", assignee_id=admin.id, created_by_id=admin.id)
    db.add_all([mine, theirs])
    db.commit()

    token = login(client, staff.email)
    response = client.get("/api/staff/tasks", headers=auth_headers(token))
    assert response.status_code == 200
    titles = [task["title"] for task in response.json()]
    assert titles == ["Reset the slab"]


def test_a_staff_member_cannot_touch_someone_elses_task(
    client: TestClient, db, staff, admin
) -> None:
    from app.models import StaffTask

    task = StaffTask(title="Not mine", assignee_id=admin.id, created_by_id=admin.id)
    db.add(task)
    db.commit()

    token = login(client, staff.email)
    response = client.post(
        f"/api/staff/tasks/{task.id}/status",
        json={"status": "done"},
        headers=auth_headers(token),
    )
    assert response.status_code == 403


def test_a_staff_member_can_update_their_own_task_status(client: TestClient, db, staff) -> None:
    from app.models import StaffTask

    task = StaffTask(title="Reset the slab", assignee_id=staff.id)
    db.add(task)
    db.commit()

    token = login(client, staff.email)
    response = client.post(
        f"/api/staff/tasks/{task.id}/status",
        json={"status": "in_progress"},
        headers=auth_headers(token),
    )
    assert response.status_code == 200
    assert response.json()["status"] == "in_progress"


def test_only_admins_can_create_and_assign_tasks(client: TestClient, staff, admin) -> None:
    staff_token = login(client, staff.email)
    denied = client.post(
        "/api/staff/tasks",
        json={"title": "New task", "assignee_id": staff.id},
        headers=auth_headers(staff_token),
    )
    assert denied.status_code == 403

    admin_token = login(client, admin.email)
    allowed = client.post(
        "/api/staff/tasks",
        json={"title": "New task", "assignee_id": staff.id},
        headers=auth_headers(admin_token),
    )
    assert allowed.status_code == 201
    assert allowed.json()["assignee_id"] == staff.id


def test_a_task_cannot_be_assigned_to_a_customer(client: TestClient, admin, customer) -> None:
    admin_token = login(client, admin.email)
    response = client.post(
        "/api/staff/tasks",
        json={"title": "New task", "assignee_id": customer.id},
        headers=auth_headers(admin_token),
    )
    assert response.status_code == 400


def test_a_staff_member_can_tick_a_checklist_item(client: TestClient, db, staff) -> None:
    from app.models import ChecklistItem, StaffTask

    task = StaffTask(title="Reset the slab", assignee_id=staff.id)
    db.add(task)
    db.flush()
    item = ChecklistItem(task_id=task.id, label="Check the holds")
    db.add(item)
    db.commit()

    token = login(client, staff.email)
    response = client.patch(
        f"/api/staff/checklist/{item.id}", json={"is_done": True}, headers=auth_headers(token)
    )
    assert response.status_code == 200
    assert response.json()["is_done"] is True
    assert response.json()["done_by_id"] == staff.id


def test_a_staff_member_cannot_tick_a_checklist_item_on_another_persons_task(
    client: TestClient, db, staff, admin
) -> None:
    from app.models import ChecklistItem, StaffTask

    task = StaffTask(title="Admin task", assignee_id=admin.id)
    db.add(task)
    db.flush()
    item = ChecklistItem(task_id=task.id, label="Check the holds")
    db.add(item)
    db.commit()

    token = login(client, staff.email)
    response = client.patch(
        f"/api/staff/checklist/{item.id}", json={"is_done": True}, headers=auth_headers(token)
    )
    assert response.status_code == 403


def test_staff_see_only_their_own_shifts(client: TestClient, db, staff, admin) -> None:
    from app.models import StaffShift

    now = datetime.now(UTC)
    db.add(
        StaffShift(staff_id=staff.id, starts_at=now, ends_at=now + timedelta(hours=4), role="Floor")
    )
    db.add(
        StaffShift(staff_id=admin.id, starts_at=now, ends_at=now + timedelta(hours=4), role="Admin")
    )
    db.commit()

    token = login(client, staff.email)
    response = client.get("/api/staff/shifts", headers=auth_headers(token))
    assert response.status_code == 200
    assert len(response.json()) == 1
    assert response.json()[0]["role"] == "Floor"


def test_the_admin_summary_is_restricted(client: TestClient, admin) -> None:
    token = login(client, admin.email)
    response = client.get("/api/admin/summary", headers=auth_headers(token))
    assert response.status_code == 200
    assert "members" in response.json()


def test_an_admin_can_archive_a_route(client: TestClient, admin, route) -> None:
    token = login(client, admin.email)
    response = client.patch(
        f"/api/admin/routes/{route.id}",
        json={"status": "archived"},
        headers=auth_headers(token),
    )
    assert response.status_code == 200
    assert response.json()["status"] == "archived"


def test_a_customer_cannot_change_a_route(client: TestClient, customer, route) -> None:
    token = login(client, customer.email)
    response = client.patch(
        f"/api/admin/routes/{route.id}",
        json={"grade": "V9"},
        headers=auth_headers(token),
    )
    assert response.status_code == 403


def test_an_admin_sees_member_records(client: TestClient, admin, customer) -> None:
    token = login(client, admin.email)
    response = client.get("/api/admin/members", headers=auth_headers(token))
    assert response.status_code == 200
    emails = [member["email"] for member in response.json()]
    assert customer.email in emails


def test_an_admin_can_record_an_agreement_decision(client: TestClient, db, admin, customer) -> None:
    from app.models import AgreementStatus, SafetyAgreement

    agreement = SafetyAgreement(user_id=customer.id, status=AgreementStatus.PENDING)
    db.add(agreement)
    db.commit()

    token = login(client, admin.email)
    response = client.patch(
        f"/api/admin/agreements/{agreement.id}",
        json={"status": "signed", "method": "staff_confirmed", "notes": "Checked in person"},
        headers=auth_headers(token),
    )
    assert response.status_code == 200
    assert response.json()["status"] == "signed"


def test_an_admin_can_create_an_event(client: TestClient, admin) -> None:
    token = login(client, admin.email)
    starts_at = (datetime.now(UTC) + timedelta(days=3)).isoformat()
    response = client.post(
        "/api/admin/events",
        json={"title": "Community session", "starts_at": starts_at, "is_public": True},
        headers=auth_headers(token),
    )
    assert response.status_code == 201, response.text
    assert response.json()["title"] == "Community session"


def test_a_customer_cannot_create_an_event(client: TestClient, customer) -> None:
    token = login(client, customer.email)
    starts_at = (datetime.now(UTC) + timedelta(days=3)).isoformat()
    response = client.post(
        "/api/admin/events",
        json={"title": "Nope", "starts_at": starts_at},
        headers=auth_headers(token),
    )
    assert response.status_code == 403


def test_task_status_values_are_validated(client: TestClient, db, staff) -> None:
    from app.models import StaffTask

    task = StaffTask(title="Reset the slab", assignee_id=staff.id, status=TaskStatus.TODO)
    db.add(task)
    db.commit()

    token = login(client, staff.email)
    response = client.post(
        f"/api/staff/tasks/{task.id}/status",
        json={"status": "not-a-status"},
        headers=auth_headers(token),
    )
    assert response.status_code == 422


def test_a_contact_message_can_be_read_and_handled(client: TestClient, admin, customer) -> None:
    """What the contact form collects has to be readable by the gym."""
    sent = client.post(
        "/api/public/contact",
        json={
            "name": "Interested Visitor",
            "email": "visitor@example.com",
            "subject": "My first visit",
            "message": "I would like to come and try it out.",
        },
    )
    assert sent.status_code == 201
    message_id = sent.json()["id"]

    token = login(client, admin.email)
    listed = client.get("/api/admin/contact", headers=auth_headers(token))
    assert listed.status_code == 200
    messages = listed.json()
    assert len(messages) == 1
    assert messages[0]["email"] == "visitor@example.com"
    assert messages[0]["handled"] is False

    updated = client.patch(
        f"/api/admin/contact/{message_id}?handled=true", headers=auth_headers(token)
    )
    assert updated.status_code == 200
    assert updated.json()["handled"] is True

    remaining = client.get("/api/admin/contact", headers=auth_headers(token)).json()
    assert remaining == []


def test_a_contact_message_is_not_visible_to_a_customer(client: TestClient, customer) -> None:
    client.post(
        "/api/public/contact",
        json={
            "name": "Interested Visitor",
            "email": "visitor@example.com",
            "subject": "General",
            "message": "A private enquiry.",
        },
    )
    token = login(client, customer.email)
    response = client.get("/api/admin/contact", headers=auth_headers(token))
    assert response.status_code == 403


def test_an_admin_can_add_a_wall(client: TestClient, admin) -> None:
    token = login(client, admin.email)
    response = client.post(
        "/api/admin/walls",
        json={
            "name": "The Cave",
            "description": "Steep, overhanging terrain.",
            "image_url": "https://example.com/cave.jpg",
            "sort_order": 3,
        },
        headers=auth_headers(token),
    )
    assert response.status_code == 201, response.text
    assert response.json()["name"] == "The Cave"
    assert response.json()["image_url"] == "https://example.com/cave.jpg"
    assert response.json()["is_active"] is True


def test_a_wall_name_cannot_be_used_twice(client: TestClient, admin, wall) -> None:
    token = login(client, admin.email)
    response = client.post(
        "/api/admin/walls",
        json={"name": "The Slab"},
        headers=auth_headers(token),
    )
    assert response.status_code == 409
    assert response.json()["detail"] == "Wall already exists"


def test_the_admin_wall_list_is_restricted(client: TestClient, customer) -> None:
    token = login(client, customer.email)
    assert client.get("/api/admin/walls", headers=auth_headers(token)).status_code == 403
    assert client.get("/api/admin/walls").status_code == 401


def test_the_admin_wall_list_shows_every_wall(client: TestClient, admin, wall) -> None:
    token = login(client, admin.email)
    listed = client.get("/api/admin/walls", headers=auth_headers(token))
    assert listed.status_code == 200
    assert [item["name"] for item in listed.json()] == ["The Slab"]


def test_an_admin_can_create_a_route_on_a_wall(client: TestClient, admin, wall) -> None:
    token = login(client, admin.email)
    response = client.post(
        "/api/admin/routes",
        json={
            "name": "Nightfall",
            "grade": "v5",
            "wall_id": wall.id,
            "wall_type": "overhang",
            "setter": "Minh",
        },
        headers=auth_headers(token),
    )
    assert response.status_code == 201, response.text
    created = response.json()
    assert created["wall"] == "The Slab"
    assert created["wall_id"] == wall.id
    assert created["wall_type"] == "overhang"
    assert created["grade"] == "V5"


def test_a_route_cannot_be_created_on_a_wall_that_does_not_exist(client: TestClient, admin) -> None:
    token = login(client, admin.email)
    response = client.post(
        "/api/admin/routes",
        json={"name": "Nightfall", "grade": "V5", "wall_id": 4242},
        headers=auth_headers(token),
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "Wall not found"


def test_a_route_cannot_be_moved_to_a_wall_that_does_not_exist(
    client: TestClient, admin, route
) -> None:
    token = login(client, admin.email)
    response = client.patch(
        f"/api/admin/routes/{route.id}",
        json={"wall_id": 4242},
        headers=auth_headers(token),
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "Wall not found"


def test_a_route_can_be_moved_to_another_wall(client: TestClient, db, admin, route, wall) -> None:
    from app.models import Wall

    other = Wall(name="The Cave", description="", sort_order=2)
    db.add(other)
    db.commit()
    db.refresh(other)

    token = login(client, admin.email)
    response = client.patch(
        f"/api/admin/routes/{route.id}",
        json={"wall_id": other.id},
        headers=auth_headers(token),
    )
    assert response.status_code == 200, response.text
    assert response.json()["wall"] == "The Cave"
    assert response.json()["wall_id"] == other.id
    assert wall.name == "The Slab"


def test_the_admin_route_list_can_be_filtered_by_status(client: TestClient, admin, route) -> None:
    token = login(client, admin.email)

    archived = client.patch(
        f"/api/admin/routes/{route.id}",
        json={"status": "archived"},
        headers=auth_headers(token),
    )
    assert archived.status_code == 200

    active = client.get("/api/admin/routes?status=active", headers=auth_headers(token)).json()
    assert active == []

    archived_routes = client.get(
        "/api/admin/routes?status=archived", headers=auth_headers(token)
    ).json()
    assert len(archived_routes) == 1
    assert archived_routes[0]["status"] == "archived"


def test_an_unknown_status_is_refused_by_the_admin_route_list(
    client: TestClient, admin, route
) -> None:
    token = login(client, admin.email)
    response = client.get("/api/admin/routes?status=sideways", headers=auth_headers(token))
    assert response.status_code == 400
    assert response.json()["detail"] == "Unknown route status"
