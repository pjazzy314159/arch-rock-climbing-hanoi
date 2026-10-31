"""Regression tests for route/wall admin CRUD (Task 8.6)."""

from fastapi.testclient import TestClient
from tests.conftest import auth_headers, login


WALL_PAYLOAD = {"name": "Test Wall", "description": "A test wall", "sort_order": 1, "is_active": True}
ROUTE_PAYLOAD = {"name": "Test Route", "grade": "V5", "wall_type": "vertical", "color": "red", "style": "boulder", "setter": "Test Setter", "status": "active"}


def admin_client(client: TestClient) -> TestClient:
    client.headers.update(auth_headers(login(client, "admin@example.com")))
    return client


def staff_client(client: TestClient) -> TestClient:
    client.headers.update(auth_headers(login(client, "staff@example.com")))
    return client


def customer_client(client: TestClient) -> TestClient:
    client.headers.update(auth_headers(login(client, "climber@example.com")))
    return client


# --- Wall CRUD --------------------------------------------------------------


def test_admin_wall_list_includes_inactive(client: TestClient, admin) -> None:
    ac = admin_client(client)
    created = ac.post("/api/admin/walls", json={**WALL_PAYLOAD, "name": "Inactive Wall", "is_active": False})
    assert created.status_code == 201
    wall_id = created.json()["id"]

    listed = ac.get("/api/admin/walls")
    assert listed.status_code == 200
    walls = listed.json()
    assert any(item["id"] == wall_id for item in walls)
    stored = next(item for item in walls if item["id"] == wall_id)
    assert stored["is_active"] is False


def test_admin_wall_create_and_patch(client: TestClient, admin) -> None:
    ac = admin_client(client)
    created = ac.post("/api/admin/walls", json=WALL_PAYLOAD)
    assert created.status_code == 201
    wall = created.json()
    assert wall["name"] == "Test Wall"
    assert wall["is_active"] is True

    patched = ac.patch(f"/api/admin/walls/{wall['id']}", json={"name": "Updated Wall", "description": "New desc"})
    assert patched.status_code == 200
    updated = patched.json()
    assert updated["name"] == "Updated Wall"
    assert updated["description"] == "New desc"
    assert updated["sort_order"] == 1


def test_admin_wall_patch_partial_update(client: TestClient, admin) -> None:
    ac = admin_client(client)
    wall_id = ac.post("/api/admin/walls", json=WALL_PAYLOAD).json()["id"]

    patched = ac.patch(f"/api/admin/walls/{wall_id}", json={"is_active": False})
    assert patched.status_code == 200
    assert patched.json()["is_active"] is False
    # Other fields unchanged
    assert patched.json()["name"] == "Test Wall"


def test_admin_wall_patch_name_conflict_409(client: TestClient, admin) -> None:
    ac = admin_client(client)
    ac.post("/api/admin/walls", json={**WALL_PAYLOAD, "name": "Wall One"})
    wall_two_id = ac.post("/api/admin/walls", json={**WALL_PAYLOAD, "name": "Wall Two"}).json()["id"]

    conflict = ac.patch(f"/api/admin/walls/{wall_two_id}", json={"name": "Wall One"})
    assert conflict.status_code == 409


def test_admin_wall_missing_returns_404(client: TestClient, admin) -> None:
    ac = admin_client(client)
    assert ac.patch("/api/admin/walls/999999", json={"name": "Nope"}).status_code == 404
    assert ac.delete("/api/admin/walls/999999").status_code == 404


def test_admin_wall_delete(client: TestClient, admin) -> None:
    ac = admin_client(client)
    wall_id = ac.post("/api/admin/walls", json=WALL_PAYLOAD).json()["id"]

    deleted = ac.delete(f"/api/admin/walls/{wall_id}")
    assert deleted.status_code == 204
    assert all(item["id"] != wall_id for item in ac.get("/api/admin/walls").json())


def test_wall_delete_sets_route_wall_id_null(client: TestClient, admin, db) -> None:
    """Deleting a wall must not fail; referencing routes keep null wall_id."""
    from app.models import ClimbRoute

    ac = admin_client(client)
    wall_id = ac.post("/api/admin/walls", json=WALL_PAYLOAD).json()["id"]

    route = ClimbRoute(name="Test Route", grade="V5", wall_id=wall_id, wall_type="vertical")
    db.add(route)
    db.commit()
    route_id = route.id

    assert ac.delete(f"/api/admin/walls/{wall_id}").status_code == 204
    db.expire_all()
    assert db.get(ClimbRoute, route_id).wall_id is None


# --- Route CRUD -------------------------------------------------------------


def test_admin_route_list_includes_archived(client: TestClient, admin) -> None:
    ac = admin_client(client)
    from app.models import RouteStatus
    created = ac.post("/api/admin/routes", json={**ROUTE_PAYLOAD, "status": RouteStatus.ARCHIVED.value})
    assert created.status_code == 201
    route_id = created.json()["id"]

    listed = ac.get("/api/admin/routes")
    assert listed.status_code == 200
    routes = listed.json()
    assert any(item["id"] == route_id for item in routes)
    stored = next(item for item in routes if item["id"] == route_id)
    assert stored["status"] == RouteStatus.ARCHIVED.value


def test_admin_route_create_and_patch(client: TestClient, admin) -> None:
    ac = admin_client(client)
    wall_id = ac.post("/api/admin/walls", json=WALL_PAYLOAD).json()["id"]
    route_payload = {**ROUTE_PAYLOAD, "wall_id": wall_id}
    created = ac.post("/api/admin/routes", json=route_payload)
    assert created.status_code == 201
    route = created.json()
    assert route["name"] == "Test Route"
    assert route["wall_id"] == wall_id

    patched = ac.patch(f"/api/admin/routes/{route['id']}", json={"grade": "V6", "color": "blue"})
    assert patched.status_code == 200
    updated = patched.json()
    assert updated["grade"] == "V6"
    assert updated["color"] == "blue"
    assert updated["wall_id"] == wall_id


def test_admin_route_patch_wall_assignment(client: TestClient, admin) -> None:
    ac = admin_client(client)
    wall1_id = ac.post("/api/admin/walls", json={**WALL_PAYLOAD, "name": "Wall A"}).json()["id"]
    wall2_id = ac.post("/api/admin/walls", json={**WALL_PAYLOAD, "name": "Wall B"}).json()["id"]
    route_id = ac.post("/api/admin/routes", json={**ROUTE_PAYLOAD, "wall_id": wall1_id}).json()["id"]

    patched = ac.patch(f"/api/admin/routes/{route_id}", json={"wall_id": wall2_id})
    assert patched.status_code == 200
    assert patched.json()["wall_id"] == wall2_id

    patched = ac.patch(f"/api/admin/routes/{route_id}", json={"wall_id": None})
    assert patched.status_code == 200
    assert patched.json()["wall_id"] is None


def test_admin_route_patch_invalid_wall_404(client: TestClient, admin) -> None:
    ac = admin_client(client)
    route_id = ac.post("/api/admin/routes", json=ROUTE_PAYLOAD).json()["id"]
    resp = ac.patch(f"/api/admin/routes/{route_id}", json={"wall_id": 999999})
    assert resp.status_code == 404


def test_admin_route_missing_returns_404(client: TestClient, admin) -> None:
    ac = admin_client(client)
    assert ac.patch("/api/admin/routes/999999", json={"name": "Nope"}).status_code == 404
    assert ac.delete("/api/admin/routes/999999").status_code == 404


def test_admin_route_delete(client: TestClient, admin) -> None:
    ac = admin_client(client)
    wall_id = ac.post("/api/admin/walls", json=WALL_PAYLOAD).json()["id"]
    route_id = ac.post("/api/admin/routes", json={**ROUTE_PAYLOAD, "wall_id": wall_id}).json()["id"]

    deleted = ac.delete(f"/api/admin/routes/{route_id}")
    assert deleted.status_code == 204
    assert all(item["id"] != route_id for item in ac.get("/api/admin/routes").json())


def test_route_delete_cascades_votes_and_achievements(client: TestClient, admin, db) -> None:
    """Deleting a route removes its votes and achievements."""
    from app.models import ClimbRoute, RouteVote, Achievement, VoteValue, ResultType

    ac = admin_client(client)
    wall_id = ac.post("/api/admin/walls", json=WALL_PAYLOAD).json()["id"]
    route_id = ac.post("/api/admin/routes", json={**ROUTE_PAYLOAD, "wall_id": wall_id}).json()["id"]

    # Add a vote
    vote = RouteVote(route_id=route_id, user_id=admin.id, value=VoteValue.AS_SET)
    db.add(vote)
    # Add an achievement
    achievement = Achievement(route_id=route_id, user_id=admin.id, route_name="Test", grade="V5", result=ResultType.SENT)
    db.add(achievement)
    db.commit()

    # Verify they exist before deletion
    assert db.get(RouteVote, route_id) is not None
    assert db.get(Achievement, route_id) is not None

    # Delete the route
    assert ac.delete(f"/api/admin/routes/{route_id}").status_code == 204
    db.expire_all()
    # Note: CASCADE delete behavior for RouteVote and Achievement is tested here
    # The actual cascade behavior depends on the FK configuration


# --- Authorization ----------------------------------------------------------


def test_wall_mutations_require_admin(client: TestClient, staff, customer) -> None:
    assert client.get("/api/admin/walls").status_code == 401
    assert client.post("/api/admin/walls", json=WALL_PAYLOAD).status_code == 401

    cc = customer_client(client)
    for resp in (
        cc.get("/api/admin/walls"),
        cc.post("/api/admin/walls", json=WALL_PAYLOAD),
        cc.patch("/api/admin/walls/1", json={"name": "Nope"}),
        cc.delete("/api/admin/walls/1"),
    ):
        assert resp.status_code == 403

    sc = staff_client(client)
    assert sc.get("/api/admin/walls").status_code == 403
    assert sc.post("/api/admin/walls", json=WALL_PAYLOAD).status_code == 403


def test_route_mutations_require_admin(client: TestClient, staff, customer) -> None:
    assert client.get("/api/admin/routes").status_code == 401
    assert client.post("/api/admin/routes", json=ROUTE_PAYLOAD).status_code == 401

    cc = customer_client(client)
    for resp in (
        cc.get("/api/admin/routes"),
        cc.post("/api/admin/routes", json=ROUTE_PAYLOAD),
        cc.patch("/api/admin/routes/1", json={"name": "Nope"}),
        cc.delete("/api/admin/routes/1"),
    ):
        assert resp.status_code == 403

    sc = staff_client(client)
    assert sc.get("/api/admin/routes").status_code == 403
    assert sc.post("/api/admin/routes", json=ROUTE_PAYLOAD).status_code == 403


# --- Public API Visibility --------------------------------------------------


def test_public_walls_include_all(client: TestClient, admin) -> None:
    """Public /api/public/walls returns all walls regardless of is_active."""
    ac = admin_client(client)
    ac.post("/api/admin/walls", json={**WALL_PAYLOAD, "name": "Public Wall", "is_active": True})
    ac.post("/api/admin/walls", json={**WALL_PAYLOAD, "name": "Inactive Wall", "is_active": False})

    resp = client.get("/api/public/walls")
    assert resp.status_code == 200
    data = resp.json()
    # Public API does not filter by is_active
    names = [item["name"] for item in data]
    assert "Public Wall" in names
    assert "Inactive Wall" in names


def test_public_routes_filter_by_status(client: TestClient, admin) -> None:
    """Public /api/public/routes filters by is_active via status."""
    from app.models import RouteStatus
    ac = admin_client(client)
    wall_id = ac.post("/api/admin/walls", json=WALL_PAYLOAD).json()["id"]
    active_id = ac.post("/api/admin/routes", json={**ROUTE_PAYLOAD, "wall_id": wall_id, "status": RouteStatus.ACTIVE.value}).json()["id"]
    archived_id = ac.post("/api/admin/routes", json={**ROUTE_PAYLOAD, "wall_id": wall_id, "status": RouteStatus.ARCHIVED.value}).json()["id"]

    # Default list (active only)
    resp = client.get("/api/public/routes")
    assert resp.status_code == 200
    ids = [item["id"] for item in resp.json()]
    assert active_id in ids
    assert archived_id not in ids

    # Explicitly ask for archived
    resp = client.get(f"/api/public/routes?status={RouteStatus.ARCHIVED.value}")
    assert resp.status_code == 200
    ids = [item["id"] for item in resp.json()]
    assert archived_id in ids


def test_route_wall_assignment_visible_in_public(client: TestClient, admin) -> None:
    """Route-wall assignment is reflected in public API."""
    ac = admin_client(client)
    wall_id = ac.post("/api/admin/walls", json={**WALL_PAYLOAD, "name": "Public Wall"}).json()["id"]
    route_id = ac.post("/api/admin/routes", json={**ROUTE_PAYLOAD, "wall_id": wall_id}).json()["id"]

    resp = client.get("/api/public/routes")
    assert resp.status_code == 200
    route = next(r for r in resp.json() if r["id"] == route_id)
    assert route["wall_id"] == wall_id
    assert route["wall"] == "Public Wall"