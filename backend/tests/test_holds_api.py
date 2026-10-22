"""Route-setting endpoints: hold boxes, ordered sequences and publication."""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import ClimbRoute, RouteStatus, WallHold

from .conftest import auth_headers, login


def _hold(client: TestClient, token: str, wall_id: int, **overrides) -> dict:
    payload = {"x": 0.1, "y": 0.2, "width": 0.05, "height": 0.06, "label": ""}
    payload.update(overrides)
    response = client.post(
        f"/api/staff/walls/{wall_id}/holds",
        json=payload,
        headers=auth_headers(token),
    )
    assert response.status_code == 201, response.text
    return response.json()


def _save(client: TestClient, token: str, route_id: int, holds: list[dict], **overrides) -> dict:
    payload = {"holds": holds, **overrides}
    response = client.put(
        f"/api/staff/routes/{route_id}/hold-set",
        json=payload,
        headers=auth_headers(token),
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_a_hold_box_is_stored_in_normalised_image_space(
    client: TestClient, db: Session, wall, staff
) -> None:
    token = login(client, staff.email)
    hold = _hold(client, token, wall.id, x=0.123456, y=0.2, width=0.100004, height=0.06)
    assert hold["x"] == 0.12346
    assert hold["width"] == 0.1

    listed = client.get(f"/api/staff/walls/{wall.id}/holds", headers=auth_headers(token)).json()
    assert [row["id"] for row in listed] == [hold["id"]]


def test_boxes_outside_the_photograph_are_rejected(
    client: TestClient, db: Session, wall, staff
) -> None:
    token = login(client, staff.email)
    bad_boxes = [
        {"x": -0.01, "y": 0.1, "width": 0.1, "height": 0.1},
        {"x": 0.1, "y": -0.01, "width": 0.1, "height": 0.1},
        {"x": 0.1, "y": 0.1, "width": 0, "height": 0.1},
        {"x": 0.1, "y": 0.1, "width": 0.1, "height": 0},
        {"x": 0.1, "y": 0.1, "width": 0.001, "height": 0.1},
        {"x": 0.95, "y": 0.1, "width": 0.1, "height": 0.1},
        {"x": 0.1, "y": 0.95, "width": 0.1, "height": 0.1},
    ]
    for box in bad_boxes:
        response = client.post(
            f"/api/staff/walls/{wall.id}/holds",
            json={**box, "label": ""},
            headers=auth_headers(token),
        )
        assert response.status_code == 422, (box, response.text)

    assert db.query(WallHold).count() == 0


def test_moving_a_hold_out_of_the_image_is_rejected(client: TestClient, wall, staff) -> None:
    token = login(client, staff.email)
    hold = _hold(client, token, wall.id, x=0.5, width=0.1)
    response = client.patch(
        f"/api/staff/holds/{hold['id']}",
        json={"x": 0.95},
        headers=auth_headers(token),
    )
    assert response.status_code == 422

    moved = client.patch(
        f"/api/staff/holds/{hold['id']}",
        json={"x": 0.75, "label": "The big jug"},
        headers=auth_headers(token),
    )
    assert moved.status_code == 200, moved.text
    assert moved.json()["x"] == 0.75
    assert moved.json()["label"] == "The big jug"


def test_a_route_keeps_its_holds_in_order_and_loads_them_back(
    client: TestClient, db: Session, route, staff
) -> None:
    token = login(client, staff.email)
    first = _hold(client, token, route.wall_id, x=0.1)
    second = _hold(client, token, route.wall_id, x=0.3)
    third = _hold(client, token, route.wall_id, x=0.5)

    saved = _save(
        client,
        token,
        route.id,
        [
            {"wall_hold_id": second["id"]},
            {"wall_hold_id": third["id"]},
            {"wall_hold_id": first["id"]},
        ],
    )
    assert [row["position"] for row in saved["holds"]] == [1, 2, 3]
    assert [row["role"] for row in saved["holds"]] == ["start", "middle", "finish"]
    assert [row["wall_hold_id"] for row in saved["holds"]] == [
        second["id"],
        third["id"],
        first["id"],
    ]

    state = client.get(f"/api/staff/routes/{route.id}/hold-set", headers=auth_headers(token)).json()
    assert state["draft"]["id"] == saved["id"]
    assert [row["wall_hold_id"] for row in state["draft"]["holds"]] == [
        second["id"],
        third["id"],
        first["id"],
    ]


def test_a_hold_cannot_appear_twice_or_come_from_another_wall(
    client: TestClient, db: Session, route, staff
) -> None:
    token = login(client, staff.email)
    hold = _hold(client, token, route.wall_id)
    duplicate = client.put(
        f"/api/staff/routes/{route.id}/hold-set",
        json={"holds": [{"wall_hold_id": hold["id"]}, {"wall_hold_id": hold["id"]}]},
        headers=auth_headers(token),
    )
    assert duplicate.status_code == 422
    assert "only once" in duplicate.json()["detail"]

    from app.models import Wall

    other_wall = Wall(name="Elsewhere", description="", sort_order=9)
    db.add(other_wall)
    db.commit()
    foreign = _hold(client, token, other_wall.id)
    wrong_wall = client.put(
        f"/api/staff/routes/{route.id}/hold-set",
        json={"holds": [{"wall_hold_id": foreign["id"]}]},
        headers=auth_headers(token),
    )
    assert wrong_wall.status_code == 422
    assert "own wall" in wrong_wall.json()["detail"]


def test_the_first_hold_is_the_start_and_the_last_is_the_finish(
    client: TestClient, route, staff
) -> None:
    token = login(client, staff.email)
    first = _hold(client, token, route.wall_id, x=0.1)
    second = _hold(client, token, route.wall_id, x=0.5)
    response = client.put(
        f"/api/staff/routes/{route.id}/hold-set",
        json={
            "holds": [
                {"wall_hold_id": first["id"], "role": "middle"},
                {"wall_hold_id": second["id"]},
            ]
        },
        headers=auth_headers(token),
    )
    assert response.status_code == 422


def test_a_draft_is_not_public_until_an_admin_publishes_it(
    client: TestClient, db: Session, route, staff, admin
) -> None:
    staff_token = login(client, staff.email)
    first = _hold(client, staff_token, route.wall_id, x=0.1)
    second = _hold(client, staff_token, route.wall_id, x=0.5)
    _save(
        client,
        staff_token,
        route.id,
        [{"wall_hold_id": first["id"]}, {"wall_hold_id": second["id"]}],
    )

    before = client.get(f"/api/public/routes/{route.id}/holds")
    assert before.status_code == 200
    assert before.json()["published"] is False
    assert before.json()["holds"] == []

    # Staff may draft but not publish.
    forbidden = client.post(
        f"/api/staff/routes/{route.id}/hold-set/publish",
        headers=auth_headers(staff_token),
    )
    assert forbidden.status_code == 403

    admin_token = login(client, admin.email)
    published = client.post(
        f"/api/staff/routes/{route.id}/hold-set/publish",
        headers=auth_headers(admin_token),
    )
    assert published.status_code == 200, published.text
    assert published.json()["status"] == "published"

    after = client.get(f"/api/public/routes/{route.id}/holds").json()
    assert after["published"] is True
    assert [row["wall_hold_id"] for row in after["holds"]] == [first["id"], second["id"]]
    assert after["holds"][0]["role"] == "start"
    assert after["holds"][-1]["role"] == "finish"


def test_publishing_replaces_the_previous_public_sequence(
    client: TestClient, db: Session, route, staff, admin
) -> None:
    staff_token = login(client, staff.email)
    admin_token = login(client, admin.email)
    a = _hold(client, staff_token, route.wall_id, x=0.1)
    b = _hold(client, staff_token, route.wall_id, x=0.4)
    c = _hold(client, staff_token, route.wall_id, x=0.7)

    _save(client, staff_token, route.id, [{"wall_hold_id": a["id"]}, {"wall_hold_id": b["id"]}])
    client.post(f"/api/staff/routes/{route.id}/hold-set/publish", headers=auth_headers(admin_token))

    # The next draft starts from the published sequence, so a change is small.
    _save(client, staff_token, route.id, [{"wall_hold_id": a["id"]}, {"wall_hold_id": c["id"]}])
    second = client.post(
        f"/api/staff/routes/{route.id}/hold-set/publish", headers=auth_headers(admin_token)
    )
    assert second.status_code == 200, second.text

    public = client.get(f"/api/public/routes/{route.id}/holds").json()
    assert [row["wall_hold_id"] for row in public["holds"]] == [a["id"], c["id"]]


def test_archived_routes_do_not_publish_their_sequence(
    client: TestClient, db: Session, route, staff, admin
) -> None:
    staff_token = login(client, staff.email)
    admin_token = login(client, admin.email)
    a = _hold(client, staff_token, route.wall_id, x=0.1)
    b = _hold(client, staff_token, route.wall_id, x=0.5)
    _save(client, staff_token, route.id, [{"wall_hold_id": a["id"]}, {"wall_hold_id": b["id"]}])
    client.post(f"/api/staff/routes/{route.id}/hold-set/publish", headers=auth_headers(admin_token))

    route.status = RouteStatus.ARCHIVED
    db.commit()

    public = client.get(f"/api/public/routes/{route.id}/holds").json()
    assert public["published"] is False
    assert public["holds"] == []


def test_members_cannot_read_the_wall_hold_workspace(client: TestClient, wall, customer) -> None:
    token = login(client, customer.email)
    for path in (
        f"/api/staff/walls/{wall.id}/holds",
        f"/api/staff/walls/{wall.id}/routes",
        "/api/staff/walls",
    ):
        assert client.get(path, headers=auth_headers(token)).status_code == 403
        assert client.get(path).status_code == 401


def test_a_hold_used_by_a_published_route_cannot_be_deleted(
    client: TestClient, db: Session, route, staff, admin
) -> None:
    staff_token = login(client, staff.email)
    admin_token = login(client, admin.email)
    a = _hold(client, staff_token, route.wall_id, x=0.1)
    b = _hold(client, staff_token, route.wall_id, x=0.5)
    _save(client, staff_token, route.id, [{"wall_hold_id": a["id"]}, {"wall_hold_id": b["id"]}])
    client.post(f"/api/staff/routes/{route.id}/hold-set/publish", headers=auth_headers(admin_token))

    response = client.delete(f"/api/staff/holds/{a['id']}", headers=auth_headers(staff_token))
    assert response.status_code == 409
    assert db.get(WallHold, a["id"]) is not None


def test_deleting_a_draft_hold_closes_up_the_sequence(
    client: TestClient, db: Session, route, staff
) -> None:
    token = login(client, staff.email)
    a = _hold(client, token, route.wall_id, x=0.1)
    b = _hold(client, token, route.wall_id, x=0.4)
    c = _hold(client, token, route.wall_id, x=0.7)
    _save(
        client,
        token,
        route.id,
        [{"wall_hold_id": a["id"]}, {"wall_hold_id": b["id"]}, {"wall_hold_id": c["id"]}],
    )

    deleted = client.delete(f"/api/staff/holds/{b['id']}", headers=auth_headers(token))
    assert deleted.status_code == 204

    state = client.get(f"/api/staff/routes/{route.id}/hold-set", headers=auth_headers(token)).json()
    assert [row["position"] for row in state["draft"]["holds"]] == [1, 2]
    assert [row["role"] for row in state["draft"]["holds"]] == ["start", "finish"]


def test_publishing_needs_a_start_and_a_finish(client: TestClient, route, staff, admin) -> None:
    staff_token = login(client, staff.email)
    admin_token = login(client, admin.email)
    only = _hold(client, staff_token, route.wall_id)
    _save(client, staff_token, route.id, [{"wall_hold_id": only["id"]}])

    response = client.post(
        f"/api/staff/routes/{route.id}/hold-set/publish",
        headers=auth_headers(admin_token),
    )
    assert response.status_code == 422
    assert "start and a finish" in response.json()["detail"]


def test_a_route_without_a_wall_cannot_be_annotated(client: TestClient, db: Session, staff) -> None:
    route = ClimbRoute(name="Nowhere", grade="V2", wall_id=None)
    db.add(route)
    db.commit()
    token = login(client, staff.email)

    response = client.put(
        f"/api/staff/routes/{route.id}/hold-set",
        json={"holds": []},
        headers=auth_headers(token),
    )
    assert response.status_code == 422
    assert "needs a wall" in response.json()["detail"]
