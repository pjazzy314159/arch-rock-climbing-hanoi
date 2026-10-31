"""Integration tests for admin opening-hours CRUD (Task 8.3)."""

from __future__ import annotations

from datetime import time

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import OpeningHour
from tests.conftest import auth_headers, login


def admin_client(client: TestClient, admin_email: str = "admin@example.com") -> TestClient:
    token = login(client, admin_email)
    client.headers.update(auth_headers(token))
    return client


def _time_str(t: time | None) -> str | None:
    return t.strftime("%H:%M:%S") if t else None


def test_admin_list_empty(client: TestClient, admin) -> None:
    ac = admin_client(client)
    response = ac.get("/api/admin/opening-hours")
    assert response.status_code == 200
    assert response.json() == []


def test_admin_create_and_list(client: TestClient, admin) -> None:
    ac = admin_client(client)
    response = ac.post(
        "/api/admin/opening-hours",
        json={
            "day_of_week": 1,
            "opens_at": "09:00:00",
            "closes_at": "21:00:00",
            "note": "Lunch break 12-13",
            "is_closed": False,
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert data["id"] is not None
    assert data["day_of_week"] == 1

    # Verify via list
    response = ac.get("/api/admin/opening-hours")
    assert response.status_code == 200
    items = response.json()
    assert any(i["id"] == data["id"] for i in items)


def test_admin_create_valid_interval(client: TestClient, admin) -> None:
    ac = admin_client(client)
    response = ac.post(
        "/api/admin/opening-hours",
        json={"day_of_week": 3, "opens_at": "10:00", "closes_at": "22:00"},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["day_of_week"] == 3
    # Time serialization may be HH:MM:SS
    opens = data.get("opens_at")
    assert opens is not None and (opens.startswith("10:00") or opens == "10:00:00")
    closes = data.get("closes_at")
    assert closes is not None and (closes.startswith("22:00") or closes == "22:00:00")
    assert data.get("note") == ""
    assert data.get("is_closed") is False


def test_admin_update_persistence(client: TestClient, admin) -> None:
    ac = admin_client(client)
    create_resp = ac.post(
        "/api/admin/opening-hours",
        json={"day_of_week": 2, "opens_at": "08:00", "closes_at": "20:00", "note": "Good"},
    )
    assert create_resp.status_code == 201
    item_id = create_resp.json()["id"]

    patch_resp = ac.patch(
        f"/api/admin/opening-hours/{item_id}",
        json={"note": "Updated note", "closes_at": "21:00"},
    )
    assert patch_resp.status_code == 200
    updated = patch_resp.json()
    assert updated["note"] == "Updated note"
    assert updated["day_of_week"] == 2

    list_resp = ac.get("/api/admin/opening-hours")
    assert list_resp.status_code == 200
    items = list_resp.json()
    found = next((i for i in items if i["id"] == item_id), None)
    assert found is not None
    assert found["note"] == "Updated note"


def test_public_gym_reflects_admin_edits(client: TestClient, admin, db: Session) -> None:
    from app.models import GymInfo
    gym_info = db.get(GymInfo, 1)
    if gym_info is None:
        gym_info = GymInfo(id=1)
        db.add(gym_info)
    gym_info.email = "info@arch.vn"
    db.commit()

    ac = admin_client(client)
    create_resp = ac.post(
        "/api/admin/opening-hours",
        json={"day_of_week": 4, "opens_at": "07:30", "closes_at": "19:30"},
    )
    assert create_resp.status_code == 201

    public_resp = client.get("/api/public/gym")
    assert public_resp.status_code == 200
    payload = public_resp.json()
    assert "opening_hours" in payload
    hours = payload["opening_hours"]
    assert isinstance(hours, list)
    # Must include the new record (no id in public schema)
    day4 = [h for h in hours if h.get("day_of_week") == 4]
    assert len(day4) >= 1
    for h in day4:
        assert "day_of_week" in h
        assert "opens_at" in h
        assert "closes_at" in h
        assert "note" in h
        assert "is_closed" in h
        # No id expected in public response
        assert "id" not in h


def test_closed_day_persistence_and_public_rendering(client: TestClient, admin, db: Session) -> None:
    from app.models import GymInfo
    gym_info = db.get(GymInfo, 1)
    if gym_info is None:
        gym_info = GymInfo(id=1)
        db.add(gym_info)
    gym_info.email = "info@arch.vn"
    db.commit()

    ac = admin_client(client)
    resp = ac.post(
        "/api/admin/opening-hours",
        json={"day_of_week": 0, "is_closed": True},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["is_closed"] is True
    assert data["opens_at"] is None
    assert data["closes_at"] is None

    public_resp = client.get("/api/public/gym")
    payload = public_resp.json()
    hours = payload["opening_hours"]
    closed = [h for h in hours if h.get("day_of_week") == 0 and h.get("is_closed") is True]
    assert len(closed) >= 1
    for h in closed:
        assert h.get("opens_at") is None
        assert h.get("closes_at") is None


def test_invalid_day_of_week_422(client: TestClient, admin) -> None:
    ac = admin_client(client)
    for bad in [7, -1, 99]:
        resp = ac.post(
            "/api/admin/opening-hours",
            json={"day_of_week": bad, "opens_at": "09:00", "closes_at": "17:00"},
        )
        assert resp.status_code == 422, f"expected 422 for day {bad}"


def test_invalid_note_too_long_422(client: TestClient, admin) -> None:
    ac = admin_client(client)
    resp = ac.post(
        "/api/admin/opening-hours",
        json={
            "day_of_week": 1,
            "opens_at": "09:00",
            "closes_at": "17:00",
            "note": "x" * 201,
        },
    )
    assert resp.status_code == 422


def test_open_interval_missing_time_422(client: TestClient, admin) -> None:
    ac = admin_client(client)
    # Missing closes_at
    resp = ac.post(
        "/api/admin/opening-hours",
        json={"day_of_week": 1, "opens_at": "09:00", "is_closed": False},
    )
    assert resp.status_code == 422
    # Missing opens_at
    resp = ac.post(
        "/api/admin/opening-hours",
        json={"day_of_week": 1, "closes_at": "17:00", "is_closed": False},
    )
    assert resp.status_code == 422
    # Both missing
    resp = ac.post(
        "/api/admin/opening-hours",
        json={"day_of_week": 1, "is_closed": False},
    )
    assert resp.status_code == 422


def test_patch_missing_id_404(client: TestClient, admin) -> None:
    ac = admin_client(client)
    resp = ac.patch("/api/admin/opening-hours/99999", json={"note": "x"})
    assert resp.status_code == 404
    assert resp.json().get("detail") == "Opening hour not found"


def test_delete_missing_id_404(client: TestClient, admin) -> None:
    ac = admin_client(client)
    resp = ac.delete("/api/admin/opening-hours/99999")
    assert resp.status_code == 404
    assert resp.json().get("detail") == "Opening hour not found"


def test_unauthenticated_401(client: TestClient) -> None:
    for method, path in [
        ("get", "/api/admin/opening-hours"),
        ("post", "/api/admin/opening-hours"),
        ("patch", "/api/admin/opening-hours/1"),
        ("delete", "/api/admin/opening-hours/1"),
    ]:
        if method == "get":
            resp = client.get(path)
        elif method == "post":
            resp = client.post(path, json={"day_of_week": 1, "opens_at": "09:00", "closes_at": "17:00"})
        elif method == "patch":
            resp = client.patch(path, json={"note": "x"})
        else:
            resp = client.delete(path)
        assert resp.status_code == 401, f"{method.upper()} {path} should be 401"


def test_staff_customer_403_for_post_patch_delete(client: TestClient, staff, customer) -> None:
    for user in (staff, customer):
        token = login(client, user.email)
        client.headers.update(auth_headers(token))
        # POST
        resp = client.post(
            "/api/admin/opening-hours",
            json={"day_of_week": 1, "opens_at": "09:00", "closes_at": "17:00"},
        )
        assert resp.status_code == 403, f"POST for {user.email} should be 403"
        # PATCH (assume id 1 may not exist; endpoint should still check auth first)
        resp = client.patch("/api/admin/opening-hours/1", json={"note": "x"})
        assert resp.status_code == 403, f"PATCH for {user.email} should be 403"
        # DELETE
        resp = client.delete("/api/admin/opening-hours/1")
        assert resp.status_code == 403, f"DELETE for {user.email} should be 403"
        client.headers.clear()


def test_staff_customer_403_for_get(client: TestClient, staff, customer) -> None:
    for user in (staff, customer):
        token = login(client, user.email)
        client.headers.update(auth_headers(token))
        resp = client.get("/api/admin/opening-hours")
        assert resp.status_code == 403, f"GET for {user.email} should be 403"
        client.headers.clear()


def test_multiple_intervals_same_day_persist(client: TestClient, admin, db: Session) -> None:
    from app.models import GymInfo
    gym_info = db.get(GymInfo, 1)
    if gym_info is None:
        gym_info = GymInfo(id=1)
        db.add(gym_info)
    gym_info.email = "info@arch.vn"
    db.commit()

    ac = admin_client(client)
    r1 = ac.post(
        "/api/admin/opening-hours",
        json={"day_of_week": 5, "opens_at": "09:00", "closes_at": "12:00", "note": "Morning"},
    )
    assert r1.status_code == 201
    r2 = ac.post(
        "/api/admin/opening-hours",
        json={"day_of_week": 5, "opens_at": "14:00", "closes_at": "18:00", "note": "Afternoon"},
    )
    assert r2.status_code == 201

    list_resp = ac.get("/api/admin/opening-hours")
    items = list_resp.json()
    day5 = [i for i in items if i["day_of_week"] == 5]
    assert len(day5) == 2
    ids = {i["id"] for i in day5}
    assert r1.json()["id"] in ids
    assert r2.json()["id"] in ids

    # Public should see both
    public_resp = client.get("/api/public/gym")
    hours = public_resp.json()["opening_hours"]
    day5_public = [h for h in hours if h.get("day_of_week") == 5]
    assert len(day5_public) == 2


def test_delete_removes_from_admin_and_public(client: TestClient, admin) -> None:
    ac = admin_client(client)
    resp = ac.post(
        "/api/admin/opening-hours",
        json={"day_of_week": 6, "opens_at": "08:00", "closes_at": "10:00"},
    )
    assert resp.status_code == 201
    item_id = resp.json()["id"]

    del_resp = ac.delete(f"/api/admin/opening-hours/{item_id}")
    assert del_resp.status_code == 204

    list_resp = ac.get("/api/admin/opening-hours")
    assert not any(i["id"] == item_id for i in list_resp.json())

    public_resp = client.get("/api/public/gym")
    hours = public_resp.json()["opening_hours"]
    assert not any(h.get("day_of_week") == 6 for h in hours)


def test_patch_resulting_interval_lacks_time_422(client: TestClient, admin, db: Session) -> None:
    ac = admin_client(client)
    resp = ac.post(
        "/api/admin/opening-hours",
        json={"day_of_week": 2, "opens_at": "09:00", "closes_at": "17:00", "is_closed": False},
    )
    assert resp.status_code == 201
    item_id = resp.json()["id"]

    # Clear times while not closed
    patch_resp = ac.patch(
        f"/api/admin/opening-hours/{item_id}",
        json={"is_closed": False, "opens_at": None, "closes_at": None},
    )
    assert patch_resp.status_code == 422


def test_list_ordered_by_day_then_opens_then_id(client: TestClient, admin, db: Session) -> None:
    ac = admin_client(client)
    # Create out-of-order entries
    ac.post("/api/admin/opening-hours", json={"day_of_week": 2, "opens_at": "10:00", "closes_at": "12:00"})
    ac.post("/api/admin/opening-hours", json={"day_of_week": 1, "opens_at": "09:00", "closes_at": "11:00"})
    ac.post("/api/admin/opening-hours", json={"day_of_week": 2, "opens_at": "08:00", "closes_at": "09:00"})

    resp = ac.get("/api/admin/opening-hours")
    items = resp.json()
    # Day 1 should come before day 2; within same day, 08:00 before 10:00
    days = [i["day_of_week"] for i in items]
    assert days == sorted(days), "days should be ordered"
    # Check that within day 2, opens_at ordering is preserved (if present)
    day2 = [i for i in items if i["day_of_week"] == 2]
    if len(day2) >= 2:
        times = [i.get("opens_at") or "" for i in day2]
        assert times == sorted(times), "same-day intervals ordered by opens_at"
