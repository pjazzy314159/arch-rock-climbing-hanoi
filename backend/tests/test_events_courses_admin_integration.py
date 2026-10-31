"""Integration tests for admin events and courses CRUD (Task 8.4)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from tests.conftest import auth_headers, login

EVENT_PAYLOAD = {
    "title": "Bouldering Social",
    "description": "Community session for every level.",
    "starts_at": "2030-05-01T18:00:00Z",
    "ends_at": "2030-05-01T20:00:00Z",
    "location": "Main hall",
    "capacity": 40,
    "is_public": True,
}

COURSE_PAYLOAD = {
    "title": "Intro to Bouldering",
    "level": "Beginner",
    "summary": "Learn the basics safely.",
    "description": "Four weeks of technique and movement.",
    "instructor": "Minh",
    "schedule": "Tue & Thu 18:00",
    "duration_weeks": 4,
    "capacity": 12,
    "price_vnd": 1_200_000,
    "is_active": True,
}


def admin_client(client: TestClient) -> TestClient:
    client.headers.update(auth_headers(login(client, "admin@example.com")))
    return client


def staff_client(client: TestClient) -> TestClient:
    client.headers.update(auth_headers(login(client, "staff@example.com")))
    return client


def customer_client(client: TestClient) -> TestClient:
    client.headers.update(auth_headers(login(client, "climber@example.com")))
    return client


# --- Events -----------------------------------------------------------------


def test_admin_event_list_includes_unpublished(client: TestClient, admin) -> None:
    ac = admin_client(client)
    created = ac.post(
        "/api/admin/events", json={**EVENT_PAYLOAD, "is_public": False}
    )
    assert created.status_code == 201
    event_id = created.json()["id"]

    listed = ac.get("/api/admin/events")
    assert listed.status_code == 200
    events = listed.json()
    assert any(item["id"] == event_id for item in events)
    stored = next(item for item in events if item["id"] == event_id)
    assert stored["is_public"] is False


def test_admin_event_create_and_patch(client: TestClient, admin) -> None:
    ac = admin_client(client)
    created = ac.post("/api/admin/events", json=EVENT_PAYLOAD)
    assert created.status_code == 201
    event = created.json()
    assert event["title"] == "Bouldering Social"
    assert event["capacity"] == 40
    assert event["is_public"] is True
    event_id = event["id"]

    patched = ac.patch(
        f"/api/admin/events/{event_id}",
        json={"title": "  Bouldering Night  ", "location": "Back wall"},
    )
    assert patched.status_code == 200
    updated = patched.json()
    assert updated["title"] == "Bouldering Night"
    assert updated["location"] == "Back wall"
    assert updated["starts_at"] == event["starts_at"]

    listed = ac.get("/api/admin/events").json()
    stored = next(item for item in listed if item["id"] == event_id)
    assert stored["title"] == "Bouldering Night"


def test_admin_event_publish_toggle(client: TestClient, admin) -> None:
    ac = admin_client(client)
    event_id = ac.post(
        "/api/admin/events", json={**EVENT_PAYLOAD, "is_public": False}
    ).json()["id"]

    published = ac.patch(f"/api/admin/events/{event_id}", json={"is_public": True})
    assert published.status_code == 200
    assert published.json()["is_public"] is True

    hidden = ac.patch(f"/api/admin/events/{event_id}", json={"is_public": False})
    assert hidden.status_code == 200
    assert hidden.json()["is_public"] is False


def test_admin_event_patch_clears_optional_fields(client: TestClient, admin) -> None:
    ac = admin_client(client)
    event_id = ac.post("/api/admin/events", json=EVENT_PAYLOAD).json()["id"]

    patched = ac.patch(
        f"/api/admin/events/{event_id}", json={"ends_at": None, "capacity": None}
    )
    assert patched.status_code == 200
    data = patched.json()
    assert data["ends_at"] is None
    assert data["capacity"] is None


def test_admin_event_patch_end_time_only(client: TestClient, admin) -> None:
    """An end-time-only PATCH compares a stored (naive) start with an aware end."""
    ac = admin_client(client)
    event_id = ac.post("/api/admin/events", json=EVENT_PAYLOAD).json()["id"]

    patched = ac.patch(
        f"/api/admin/events/{event_id}", json={"ends_at": "2030-05-01T21:00:00Z"}
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["ends_at"] is not None
    assert patched.json()["starts_at"] != patched.json()["ends_at"]


def test_admin_event_patch_missing_returns_404(client: TestClient, admin) -> None:
    ac = admin_client(client)
    response = ac.patch("/api/admin/events/999999", json={"title": "Nope"})
    assert response.status_code == 404
    assert response.json()["detail"] == "Event not found"


def test_admin_event_delete(client: TestClient, admin) -> None:
    ac = admin_client(client)
    event_id = ac.post("/api/admin/events", json=EVENT_PAYLOAD).json()["id"]

    deleted = ac.delete(f"/api/admin/events/{event_id}")
    assert deleted.status_code == 204

    assert all(item["id"] != event_id for item in ac.get("/api/admin/events").json())
    missing = ac.delete(f"/api/admin/events/{event_id}")
    assert missing.status_code == 404


def test_admin_event_delete_keeps_referencing_staff_task(
    client: TestClient, admin, db
) -> None:
    """Deleting an event must not fail or delete the staff task that used it."""
    from app.models import StaffTask

    ac = admin_client(client)
    event_id = ac.post("/api/admin/events", json=EVENT_PAYLOAD).json()["id"]

    task = StaffTask(title="Prepare the hall", event_id=event_id)
    db.add(task)
    db.commit()
    task_id = task.id

    assert ac.delete(f"/api/admin/events/{event_id}").status_code == 204
    db.expire_all()
    assert db.get(StaffTask, task_id) is not None


def test_event_rejects_end_before_start(client: TestClient, admin) -> None:
    ac = admin_client(client)
    response = ac.post(
        "/api/admin/events",
        json={
            **EVENT_PAYLOAD,
            "starts_at": "2030-05-01T20:00:00Z",
            "ends_at": "2030-05-01T18:00:00Z",
        },
    )
    assert response.status_code == 422
    assert response.json()["detail"] == "Event end must be after its start"

    event_id = ac.post("/api/admin/events", json=EVENT_PAYLOAD).json()["id"]
    patched = ac.patch(
        f"/api/admin/events/{event_id}", json={"ends_at": "2030-05-01T17:00:00Z"}
    )
    assert patched.status_code == 422
    assert patched.json()["detail"] == "Event end must be after its start"


def test_event_rejects_invalid_title_and_capacity(client: TestClient, admin) -> None:
    ac = admin_client(client)
    assert (
        ac.post("/api/admin/events", json={**EVENT_PAYLOAD, "title": ""}).status_code
        == 422
    )
    assert (
        ac.post("/api/admin/events", json={**EVENT_PAYLOAD, "title": "   "}).status_code
        == 422
    )
    for capacity in (0, 10_001):
        response = ac.post(
            "/api/admin/events", json={**EVENT_PAYLOAD, "capacity": capacity}
        )
        assert response.status_code == 422


def test_event_patch_rejects_whitespace_title(client: TestClient, admin) -> None:
    ac = admin_client(client)
    event_id = ac.post("/api/admin/events", json=EVENT_PAYLOAD).json()["id"]

    response = ac.patch(f"/api/admin/events/{event_id}", json={"title": "   "})
    assert response.status_code == 422

    cleared_start = ac.patch(f"/api/admin/events/{event_id}", json={"starts_at": None})
    assert cleared_start.status_code == 422


def test_event_mutations_require_admin(client: TestClient, staff, customer) -> None:
    # Unauthenticated
    assert client.get("/api/admin/events").status_code == 401
    assert client.post("/api/admin/events", json=EVENT_PAYLOAD).status_code == 401

    # Customer (non-staff)
    cc = customer_client(client)
    for response in (
        cc.get("/api/admin/events"),
        cc.post("/api/admin/events", json=EVENT_PAYLOAD),
        cc.patch("/api/admin/events/1", json={"title": "Nope"}),
        cc.delete("/api/admin/events/1"),
    ):
        assert response.status_code == 403


def test_event_mutations_reject_staff(client: TestClient, admin, staff) -> None:
    sc = staff_client(client)
    assert sc.get("/api/admin/events").status_code == 403
    assert sc.post("/api/admin/events", json=EVENT_PAYLOAD).status_code == 403


def test_public_events_respect_is_public(client: TestClient, admin) -> None:
    ac = admin_client(client)
    public_id = ac.post(
        "/api/admin/events", json={**EVENT_PAYLOAD, "title": "Public Session"}
    ).json()["id"]
    private_id = ac.post(
        "/api/admin/events",
        json={**EVENT_PAYLOAD, "title": "Staff Only", "is_public": False},
    ).json()["id"]

    public = client.get("/api/public/events")
    assert public.status_code == 200
    ids = [item["id"] for item in public.json()]
    assert public_id in ids
    assert private_id not in ids

    # Re-publishing through the admin API makes it visible; hiding removes it.
    ac.patch(f"/api/admin/events/{private_id}", json={"is_public": True})
    assert private_id in [item["id"] for item in client.get("/api/public/events").json()]

    ac.patch(f"/api/admin/events/{public_id}", json={"is_public": False})
    assert public_id not in [
        item["id"] for item in client.get("/api/public/events").json()
    ]


# --- Courses ----------------------------------------------------------------


def test_admin_course_list_includes_inactive(client: TestClient, admin) -> None:
    ac = admin_client(client)
    created = ac.post(
        "/api/admin/courses", json={**COURSE_PAYLOAD, "is_active": False}
    )
    assert created.status_code == 201
    course_id = created.json()["id"]

    listed = ac.get("/api/admin/courses")
    assert listed.status_code == 200
    courses = listed.json()
    stored = next(item for item in courses if item["id"] == course_id)
    assert stored["is_active"] is False
    # The admin shape exposes every model field.
    for field in (
        "title",
        "level",
        "summary",
        "description",
        "instructor",
        "schedule",
        "duration_weeks",
        "capacity",
        "price_vnd",
        "is_active",
    ):
        assert field in stored


def test_admin_course_create_and_patch(client: TestClient, admin) -> None:
    ac = admin_client(client)
    created = ac.post("/api/admin/courses", json=COURSE_PAYLOAD)
    assert created.status_code == 201
    course = created.json()
    assert course["price_vnd"] == 1_200_000
    assert course["is_active"] is True

    patched = ac.patch(
        f"/api/admin/courses/{course['id']}",
        json={"instructor": "Linh", "schedule": "Mon & Wed 19:00"},
    )
    assert patched.status_code == 200
    updated = patched.json()
    assert updated["instructor"] == "Linh"
    assert updated["title"] == course["title"]
    assert updated["price_vnd"] == course["price_vnd"]


def test_course_price_stays_nullable(client: TestClient, admin) -> None:
    ac = admin_client(client)
    payload = {
        key: value for key, value in COURSE_PAYLOAD.items() if key != "price_vnd"
    }
    created = ac.post("/api/admin/courses", json=payload)
    assert created.status_code == 201
    assert created.json()["price_vnd"] is None

    explicit = ac.post(
        "/api/admin/courses", json={**COURSE_PAYLOAD, "price_vnd": None}
    )
    assert explicit.status_code == 201
    assert explicit.json()["price_vnd"] is None

    # Clearing a previously confirmed price must store null, never 0.
    course_id = created.json()["id"]
    priced = ac.patch(
        f"/api/admin/courses/{course_id}", json={"price_vnd": 900_000}
    )
    assert priced.json()["price_vnd"] == 900_000
    cleared = ac.patch(f"/api/admin/courses/{course_id}", json={"price_vnd": None})
    assert cleared.status_code == 200
    assert cleared.json()["price_vnd"] is None


def test_admin_course_activation_toggle(client: TestClient, admin) -> None:
    ac = admin_client(client)
    course_id = ac.post(
        "/api/admin/courses", json={**COURSE_PAYLOAD, "is_active": True}
    ).json()["id"]

    deactivated = ac.patch(f"/api/admin/courses/{course_id}", json={"is_active": False})
    assert deactivated.status_code == 200
    assert deactivated.json()["is_active"] is False

    activated = ac.patch(f"/api/admin/courses/{course_id}", json={"is_active": True})
    assert activated.status_code == 200
    assert activated.json()["is_active"] is True


def test_admin_course_missing_returns_404(client: TestClient, admin) -> None:
    ac = admin_client(client)
    patched = ac.patch("/api/admin/courses/999999", json={"title": "Nope"})
    assert patched.status_code == 404
    assert patched.json()["detail"] == "Course not found"

    deleted = ac.delete("/api/admin/courses/999999")
    assert deleted.status_code == 404


def test_admin_course_delete(client: TestClient, admin) -> None:
    ac = admin_client(client)
    course_id = ac.post("/api/admin/courses", json=COURSE_PAYLOAD).json()["id"]

    deleted = ac.delete(f"/api/admin/courses/{course_id}")
    assert deleted.status_code == 204
    assert all(
        item["id"] != course_id for item in ac.get("/api/admin/courses").json()
    )


def test_course_rejects_invalid_fields(client: TestClient, admin) -> None:
    ac = admin_client(client)
    assert (
        ac.post("/api/admin/courses", json={**COURSE_PAYLOAD, "title": ""}).status_code
        == 422
    )
    assert (
        ac.post("/api/admin/courses", json={**COURSE_PAYLOAD, "title": "   "}).status_code
        == 422
    )
    for field in ("duration_weeks", "capacity"):
        for value in (0, -1):
            response = ac.post(
                "/api/admin/courses", json={**COURSE_PAYLOAD, field: value}
            )
            assert response.status_code == 422, (field, value)
    assert (
        ac.post("/api/admin/courses", json={**COURSE_PAYLOAD, "price_vnd": -1}).status_code
        == 422
    )

    course_id = ac.post("/api/admin/courses", json=COURSE_PAYLOAD).json()["id"]
    assert (
        ac.patch(f"/api/admin/courses/{course_id}", json={"title": "  "}).status_code
        == 422
    )
    assert (
        ac.patch(f"/api/admin/courses/{course_id}", json={"capacity": 0}).status_code
        == 422
    )


def test_course_mutations_require_admin(client: TestClient, staff, customer) -> None:
    assert client.get("/api/admin/courses").status_code == 401
    assert client.post("/api/admin/courses", json=COURSE_PAYLOAD).status_code == 401

    cc = customer_client(client)
    for response in (
        cc.get("/api/admin/courses"),
        cc.post("/api/admin/courses", json=COURSE_PAYLOAD),
        cc.patch("/api/admin/courses/1", json={"title": "Nope"}),
        cc.delete("/api/admin/courses/1"),
    ):
        assert response.status_code == 403


def test_course_mutations_reject_staff(client: TestClient, admin, staff) -> None:
    sc = staff_client(client)
    assert sc.get("/api/admin/courses").status_code == 403
    assert sc.post("/api/admin/courses", json=COURSE_PAYLOAD).status_code == 403


def test_public_courses_respect_is_active(client: TestClient, admin) -> None:
    ac = admin_client(client)
    active_id = ac.post(
        "/api/admin/courses", json={**COURSE_PAYLOAD, "title": "Active Course"}
    ).json()["id"]
    inactive_id = ac.post(
        "/api/admin/courses",
        json={**COURSE_PAYLOAD, "title": "Inactive Course", "is_active": False},
    ).json()["id"]

    public = client.get("/api/public/courses")
    assert public.status_code == 200
    payload = public.json()
    ids = [item["id"] for item in payload]
    assert active_id in ids
    assert inactive_id not in ids

    # Public contract is unchanged: no admin-only is_active field.
    for item in payload:
        assert "is_active" not in item

    ac.patch(f"/api/admin/courses/{inactive_id}", json={"is_active": True})
    assert inactive_id in [
        item["id"] for item in client.get("/api/public/courses").json()
    ]

    ac.patch(f"/api/admin/courses/{active_id}", json={"is_active": False})
    assert active_id not in [
        item["id"] for item in client.get("/api/public/courses").json()
    ]
