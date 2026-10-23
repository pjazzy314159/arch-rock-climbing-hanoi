"""Focused contract tests for the staff-task API hardening in Task 5.2."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import event as sqlalchemy_event

from app.db import engine
from app.models import ChecklistItem, Event, StaffTask, TaskStatus
from tests.conftest import auth_headers, login


def _event(
    db,
    *,
    title: str = "Open Day",
    starts_at: datetime | None = None,
    ends_at: datetime | None = None,
) -> Event:
    starts_at = starts_at or datetime.now(UTC) + timedelta(days=2)
    item = Event(
        title=title,
        description="",
        starts_at=starts_at,
        ends_at=ends_at or starts_at + timedelta(hours=3),
        location="Main wall",
        is_public=True,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def _task(
    db,
    *,
    assignee_id: int,
    event_id: int | None = None,
    title: str = "Set up the competition wall",
    **extra,
) -> StaffTask:
    item = StaffTask(
        title=title,
        assignee_id=assignee_id,
        event_id=event_id,
        **extra,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def test_creating_a_task_validates_and_exposes_its_event(
    client: TestClient, db, admin, staff
) -> None:
    event = _event(db, title="Summer competition")
    token = login(client, admin.email)

    response = client.post(
        "/api/staff/tasks",
        json={
            "title": "Set up the competition wall",
            "description": "Check every hold.",
            "assignee_id": staff.id,
            "event_id": event.id,
            "checklist": [
                {"label": "Inspect holds", "position": 99},
                {"label": "Check the mats", "position": 99},
            ],
        },
        headers=auth_headers(token),
    )

    assert response.status_code == 201, response.text
    task = response.json()
    assert task["event_id"] == event.id
    assert task["event_title"] == "Summer competition"
    assert task["event_starts_at"] is not None
    assert task["event_ends_at"] is not None
    assert task["assignee_name"] == staff.full_name
    assert task["created_by_name"] == admin.full_name
    # The server owns positions; client values are ignored to avoid collisions.
    assert [item["position"] for item in task["checklist"]] == [0, 1]
    assert [item["label"] for item in task["checklist"]] == [
        "Inspect holds",
        "Check the mats",
    ]


def test_creating_a_task_rejects_a_missing_event(client: TestClient, admin, staff) -> None:
    token = login(client, admin.email)

    response = client.post(
        "/api/staff/tasks",
        json={
            "title": "Set up the competition wall",
            "assignee_id": staff.id,
            "event_id": 4242,
        },
        headers=auth_headers(token),
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Event not found"
    assert client.get("/api/admin/tasks", headers=auth_headers(token)).json() == []


def test_task_lists_expose_event_context_to_staff_and_admin(
    client: TestClient, db, admin, staff
) -> None:
    event = _event(db, title="Youth workshop")
    _task(db, assignee_id=staff.id, event_id=event.id)
    _task(db, assignee_id=admin.id, event_id=event.id)

    staff_token = login(client, staff.email)
    staff_tasks = client.get("/api/staff/tasks", headers=auth_headers(staff_token))
    assert staff_tasks.status_code == 200
    assert [task["event_title"] for task in staff_tasks.json()] == ["Youth workshop"]

    admin_token = login(client, admin.email)
    admin_tasks = client.get("/api/admin/tasks", headers=auth_headers(admin_token))
    assert admin_tasks.status_code == 200
    assert [task["event_title"] for task in admin_tasks.json()] == [
        "Youth workshop",
        "Youth workshop",
    ]


def test_task_update_keeps_omitted_fields_and_can_replace_or_clear_the_event(
    client: TestClient, db, admin, staff
) -> None:
    first = _event(db, title="First event")
    second = _event(db, title="Second event")
    task = _task(db, assignee_id=staff.id, event_id=first.id)
    token = login(client, admin.email)

    omitted = client.patch(
        f"/api/staff/tasks/{task.id}",
        json={"title": "Renamed task"},
        headers=auth_headers(token),
    )
    assert omitted.status_code == 200, omitted.text
    assert omitted.json()["event_id"] == first.id
    assert omitted.json()["event_title"] == "First event"

    replaced = client.patch(
        f"/api/staff/tasks/{task.id}",
        json={"event_id": second.id},
        headers=auth_headers(token),
    )
    assert replaced.status_code == 200, replaced.text
    assert replaced.json()["event_id"] == second.id
    assert replaced.json()["event_title"] == "Second event"

    cleared = client.patch(
        f"/api/staff/tasks/{task.id}",
        json={"event_id": None},
        headers=auth_headers(token),
    )
    assert cleared.status_code == 200, cleared.text
    assert cleared.json()["event_id"] is None
    assert cleared.json()["event_title"] is None
    assert cleared.json()["event_starts_at"] is None


def test_task_update_rejects_a_missing_event_without_changing_the_task(
    client: TestClient, db, admin, staff
) -> None:
    event = _event(db)
    task = _task(db, assignee_id=staff.id, event_id=event.id)
    token = login(client, admin.email)

    response = client.patch(
        f"/api/staff/tasks/{task.id}",
        json={"event_id": 4242},
        headers=auth_headers(token),
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Event not found"
    stored = db.get(StaffTask, task.id)
    assert stored is not None
    assert stored.event_id == event.id


def test_patch_preserves_omitted_nullable_fields_and_clears_explicit_nulls(
    client: TestClient, db, admin, staff
) -> None:
    event = _event(db)
    due = datetime.now(UTC) + timedelta(days=1)
    task = _task(db, assignee_id=staff.id, event_id=event.id, due_at=due)
    token = login(client, admin.email)

    omitted = client.patch(
        f"/api/staff/tasks/{task.id}",
        json={"title": "Renamed task"},
        headers=auth_headers(token),
    )
    assert omitted.status_code == 200, omitted.text
    assert omitted.json()["assignee_id"] == staff.id
    assert omitted.json()["due_at"] is not None
    assert omitted.json()["event_id"] == event.id

    cleared = client.patch(
        f"/api/staff/tasks/{task.id}",
        json={"assignee_id": None, "due_at": None, "event_id": None},
        headers=auth_headers(token),
    )
    assert cleared.status_code == 200, cleared.text
    payload = cleared.json()
    assert payload["assignee_id"] is None
    assert payload["assignee_name"] is None
    assert payload["due_at"] is None
    assert payload["event_id"] is None
    assert payload["event_title"] is None


def test_patch_replaces_nullable_fields_and_rejects_invalid_values(
    client: TestClient, db, admin, staff, customer
) -> None:
    task = _task(db, assignee_id=staff.id)
    token = login(client, admin.email)
    replacement_due = datetime.now(UTC) + timedelta(days=4)

    replaced = client.patch(
        f"/api/staff/tasks/{task.id}",
        json={"assignee_id": admin.id, "due_at": replacement_due.isoformat()},
        headers=auth_headers(token),
    )
    assert replaced.status_code == 200, replaced.text
    assert replaced.json()["assignee_id"] == admin.id
    assert replaced.json()["due_at"] is not None

    missing = client.patch(
        f"/api/staff/tasks/{task.id}",
        json={"assignee_id": 4242},
        headers=auth_headers(token),
    )
    assert missing.status_code == 404
    assert missing.json()["detail"] == "Assignee not found"

    customer_assignee = client.patch(
        f"/api/staff/tasks/{task.id}",
        json={"assignee_id": customer.id},
        headers=auth_headers(token),
    )
    assert customer_assignee.status_code == 400
    assert "staff or administrators" in customer_assignee.json()["detail"]

    invalid_due = client.patch(
        f"/api/staff/tasks/{task.id}",
        json={"due_at": "not-a-date"},
        headers=auth_headers(token),
    )
    assert invalid_due.status_code == 422
    db.expire_all()
    stored = db.get(StaffTask, task.id)
    assert stored is not None
    assert stored.assignee_id == admin.id
    assert stored.event_id is None


def test_patch_rejects_explicit_nulls_for_required_fields(
    client: TestClient, db, admin, staff
) -> None:
    task = _task(db, assignee_id=staff.id)
    token = login(client, admin.email)

    for field in ("title", "description", "priority", "status"):
        response = client.patch(
            f"/api/staff/tasks/{task.id}",
            json={field: None},
            headers=auth_headers(token),
        )
        assert response.status_code == 400, (field, response.text)
        assert "cannot be null" in response.json()["detail"]


def test_staff_cannot_clear_administrator_only_fields(client: TestClient, db, staff, admin) -> None:
    task = _task(db, assignee_id=staff.id)
    token = login(client, staff.email)

    for field in ("assignee_id", "due_at", "event_id", "title"):
        response = client.patch(
            f"/api/staff/tasks/{task.id}",
            json={field: None},
            headers=auth_headers(token),
        )
        assert response.status_code == 403, (field, response.text)

    allowed = client.patch(
        f"/api/staff/tasks/{task.id}",
        json={"status": "in_progress"},
        headers=auth_headers(token),
    )
    assert allowed.status_code == 200, allowed.text
    assert allowed.json()["status"] == "in_progress"
    assert allowed.json()["assignee_id"] == staff.id


def test_checklist_positions_are_assigned_by_the_server_and_remain_ordered(
    client: TestClient, db, staff
) -> None:
    task = _task(db, assignee_id=staff.id)
    token = login(client, staff.email)

    for index, label in enumerate(("First", "Second", "Third"), start=1):
        response = client.post(
            f"/api/staff/tasks/{task.id}/checklist",
            json={"label": label, "position": 99 + index},
            headers=auth_headers(token),
        )
        assert response.status_code == 201, response.text
        assert response.json()["position"] == index - 1

    listed = client.get("/api/staff/tasks", headers=auth_headers(token))
    assert listed.status_code == 200
    checklist = listed.json()[0]["checklist"]
    assert [item["label"] for item in checklist] == ["First", "Second", "Third"]
    assert [item["position"] for item in checklist] == [0, 1, 2]


def test_checklist_responses_sort_legacy_duplicate_positions_deterministically(
    client: TestClient, db, admin, staff
) -> None:
    task = _task(db, assignee_id=staff.id)
    second = ChecklistItem(task_id=task.id, label="Second", position=2)
    first = ChecklistItem(task_id=task.id, label="First", position=1)
    third = ChecklistItem(task_id=task.id, label="Third", position=2)
    db.add_all([second, first, third])
    db.commit()

    token = login(client, admin.email)
    response = client.get("/api/admin/tasks", headers=auth_headers(token))
    assert response.status_code == 200
    checklist = response.json()[0]["checklist"]
    assert [item["label"] for item in checklist] == ["First", "Second", "Third"]


def test_assignee_options_are_administrator_only_and_minimal(
    client: TestClient, admin, staff, customer
) -> None:
    assert client.get("/api/admin/assignees").status_code == 401

    customer_token = login(client, customer.email)
    assert (
        client.get("/api/admin/assignees", headers=auth_headers(customer_token)).status_code == 403
    )

    staff_token = login(client, staff.email)
    assert client.get("/api/admin/assignees", headers=auth_headers(staff_token)).status_code == 403

    admin_token = login(client, admin.email)
    response = client.get("/api/admin/assignees", headers=auth_headers(admin_token))
    assert response.status_code == 200
    assignees = response.json()
    assert [item["email"] for item in assignees] == [admin.email, staff.email]
    assert [item["role"] for item in assignees] == ["admin", "staff"]
    assert set(assignees[0]) == {"id", "full_name", "email", "role"}


def test_status_updates_remain_permissive_pending_an_arch_policy(
    client: TestClient, db, staff
) -> None:
    """Existing API behaviour is kept until ARCH decides a transition graph."""

    task = _task(
        db,
        assignee_id=staff.id,
        status=TaskStatus.DONE,
        completed_at=datetime.now(UTC),
    )
    token = login(client, staff.email)

    response = client.patch(
        f"/api/staff/tasks/{task.id}",
        json={"status": "todo"},
        headers=auth_headers(token),
    )
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "todo"
    assert response.json()["completed_at"] is None

    invalid = client.patch(
        f"/api/staff/tasks/{task.id}",
        json={"status": "not-a-status"},
        headers=auth_headers(token),
    )
    assert invalid.status_code == 422


def test_task_listing_loads_related_context_without_an_n_plus_one(
    client: TestClient, db, admin, staff
) -> None:
    event = _event(db)
    for title in ("First task", "Second task", "Third task"):
        task = _task(db, assignee_id=staff.id, event_id=event.id, title=title)
        db.add(ChecklistItem(task_id=task.id, label="Inspect holds", position=0))
    db.commit()

    token = login(client, admin.email)
    statements: list[str] = []

    def _record_select(_conn, _cursor, statement, _parameters, _context, _executemany):
        if statement.lstrip().upper().startswith("SELECT"):
            statements.append(statement)

    sqlalchemy_event.listen(engine, "before_cursor_execute", _record_select)
    try:
        response = client.get("/api/admin/tasks", headers=auth_headers(token))
    finally:
        sqlalchemy_event.remove(engine, "before_cursor_execute", _record_select)

    assert response.status_code == 200
    tasks = response.json()
    assert len(tasks) == 3
    assert all(task["event_title"] == "Open Day" for task in tasks)
    assert all(task["assignee_name"] == staff.full_name for task in tasks)
    # Authentication plus one task query and one checklist query. A lazy-loading
    # implementation would grow with the number of tasks.
    assert len(statements) <= 5, statements
