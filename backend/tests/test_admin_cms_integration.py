"""Cross-cutting integration tests for the admin CMS.

These tests exist to protect the invariants that span every CMS resource:

* every admin endpoint is protected on the server, not just in the UI;
* admin-managed publication state is what the public API reflects;
* admin lists can still see records that are hidden from the public;
* PATCH requests leave omitted fields alone;
* destructive operations remove only the requested record (and let the
  database's own foreign-key behaviour decide what happens to references);
* public response contracts do not leak admin-only fields.

Resource-specific happy-path coverage lives in the per-resource test modules.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from tests.conftest import auth_headers, login

ADMIN_EMAIL = "admin@example.com"

PRODUCT = {"sku": "CMS-PRODUCT", "name": "CMS Product", "price_vnd": 100_000}
PRICE = {"category": "CMS", "name": "CMS Price", "amount_vnd": 100_000}
OPENING_HOUR = {
    "day_of_week": 2,
    "opens_at": "09:00",
    "closes_at": "18:00",
    "note": "CMS hours",
}
EVENT = {
    "title": "CMS Event",
    "description": "Integration fixture",
    "starts_at": "2030-01-01T10:00:00Z",
    "ends_at": "2030-01-01T12:00:00Z",
    "location": "Main hall",
}
COURSE = {
    "title": "CMS Course",
    "level": "Beginner",
    "summary": "Integration fixture",
}
FAQ = {"question": "CMS question?", "answer": "CMS answer.", "is_published": True}
RULE = {"title": "CMS rule", "body": "CMS rule body."}
SERVICE = {"title": "CMS service", "summary": "Integration fixture"}

# (collection path, create payload)
RESOURCES = [
    ("/api/admin/products", PRODUCT),
    ("/api/admin/prices", PRICE),
    ("/api/admin/opening-hours", OPENING_HOUR),
    ("/api/admin/events", EVENT),
    ("/api/admin/courses", COURSE),
    ("/api/admin/faq", FAQ),
    ("/api/admin/rules", RULE),
    ("/api/admin/services", SERVICE),
]


def admin_client(client: TestClient) -> TestClient:
    client.headers.update(auth_headers(login(client, ADMIN_EMAIL)))
    return client


def public_client(client: TestClient) -> TestClient:
    """Public endpoints do not care about the bearer token; keep the client."""
    return client


def _create(ac: TestClient, path: str, payload: dict) -> dict:
    response = ac.post(path, json=payload)
    assert response.status_code == 201, response.text
    return response.json()


# --- Authorization ----------------------------------------------------------


@pytest.mark.parametrize(("path", "payload"), RESOURCES)
def test_collection_endpoints_require_authentication(
    client: TestClient, path: str, payload: dict
) -> None:
    client.headers.clear()
    assert client.get(path).status_code == 401
    assert client.post(path, json=payload).status_code == 401


@pytest.mark.parametrize(("path", "payload"), RESOURCES)
def test_collection_endpoints_reject_non_admins(
    client: TestClient, customer, staff, path: str, payload: dict
) -> None:
    for user in (customer, staff):
        client.headers.update(auth_headers(login(client, user.email)))
        assert client.get(path).status_code == 403
        assert client.post(path, json=payload).status_code == 403
    client.headers.clear()


@pytest.mark.parametrize(("path", "payload"), RESOURCES)
def test_item_endpoints_reject_non_admins(
    client: TestClient, customer, staff, path: str, payload: dict
) -> None:
    for user in (customer, staff):
        client.headers.update(auth_headers(login(client, user.email)))
        assert client.patch(f"{path}/1", json={}).status_code == 403
        if path not in ("/api/admin/products", "/api/admin/prices"):
            assert client.delete(f"{path}/1").status_code == 403
    client.headers.clear()


# --- Publication / visibility ----------------------------------------------


def test_product_publication_follows_admin_flag(client: TestClient, admin) -> None:
    ac = admin_client(client)
    product = _create(ac, "/api/admin/products", PRODUCT)

    public_ids = [item["id"] for item in public_client(client).get("/api/public/products").json()]
    assert product["id"] in public_ids

    ac.patch(f"/api/admin/products/{product['id']}", json={"is_active": False})
    public_ids = [item["id"] for item in public_client(client).get("/api/public/products").json()]
    assert product["id"] not in public_ids
    # The admin list still contains it for management.
    assert any(
        item["id"] == product["id"] for item in ac.get("/api/admin/products").json()
    )


def test_price_and_service_publication_follow_admin_flags(
    client: TestClient, admin
) -> None:
    ac = admin_client(client)
    price = _create(ac, "/api/admin/prices", PRICE)
    service = _create(ac, "/api/admin/services", SERVICE)

    assert price["id"] in [
        item["id"] for item in public_client(client).get("/api/public/prices").json()
    ]
    assert service["id"] in [
        item["id"] for item in public_client(client).get("/api/public/services").json()
    ]

    ac.patch(f"/api/admin/prices/{price['id']}", json={"is_active": False})
    ac.patch(f"/api/admin/services/{service['id']}", json={"is_active": False})

    assert price["id"] not in [
        item["id"] for item in public_client(client).get("/api/public/prices").json()
    ]
    assert service["id"] not in [
        item["id"] for item in public_client(client).get("/api/public/services").json()
    ]


def test_course_publication_and_response_contract(client: TestClient, admin) -> None:
    ac = admin_client(client)
    course = _create(ac, "/api/admin/courses", {**COURSE, "is_active": False})

    public = public_client(client).get("/api/public/courses").json()
    assert course["id"] not in [item["id"] for item in public]
    # Public course shape is unchanged and does not expose admin state.
    for item in public:
        assert "is_active" not in item

    ac.patch(f"/api/admin/courses/{course['id']}", json={"is_active": True})
    public = public_client(client).get("/api/public/courses").json()
    assert course["id"] in [item["id"] for item in public]
    assert any(
        item["id"] == course["id"] for item in ac.get("/api/admin/courses").json()
    )


def test_event_publication_and_response_contract(client: TestClient, admin) -> None:
    ac = admin_client(client)
    event = _create(ac, "/api/admin/events", {**EVENT, "is_public": False})

    public = public_client(client).get("/api/public/events").json()
    assert event["id"] not in [item["id"] for item in public]

    ac.patch(f"/api/admin/events/{event['id']}", json={"is_public": True})
    public = public_client(client).get("/api/public/events").json()
    assert event["id"] in [item["id"] for item in public]

    # The admin list exposes private events too.
    ac.patch(f"/api/admin/events/{event['id']}", json={"is_public": False})
    admin_events = ac.get("/api/admin/events").json()
    assert any(item["id"] == event["id"] and item["is_public"] is False for item in admin_events)


def test_faq_and_rule_publication_flags(client: TestClient, admin) -> None:
    ac = admin_client(client)
    faq = _create(ac, "/api/admin/faq", {**FAQ, "is_published": False})
    rule = _create(ac, "/api/admin/rules", {**RULE, "is_active": False})

    assert faq["id"] not in [
        item["id"] for item in public_client(client).get("/api/public/faq").json()
    ]
    assert rule["id"] not in [
        item["id"] for item in public_client(client).get("/api/public/rules").json()
    ]

    ac.patch(f"/api/admin/faq/{faq['id']}", json={"is_published": True})
    ac.patch(f"/api/admin/rules/{rule['id']}", json={"is_active": True})

    assert faq["id"] in [
        item["id"] for item in public_client(client).get("/api/public/faq").json()
    ]
    assert rule["id"] in [
        item["id"] for item in public_client(client).get("/api/public/rules").json()
    ]


def test_opening_hours_publish_and_unpublish(client: TestClient, admin, db: Session) -> None:
    ac = admin_client(client)

    # First make the gym verified by setting a contact detail directly in the DB
    from app.models import GymInfo
    gym_info = db.get(GymInfo, 1)
    if gym_info is None:
        gym_info = GymInfo(id=1)
        db.add(gym_info)
    gym_info.email = "info@arch.vn"
    db.commit()

    hour = _create(ac, "/api/admin/opening-hours", {**OPENING_HOUR, "day_of_week": 5})

    gym = public_client(client).get("/api/public/gym").json()
    fridays = [item for item in gym["opening_hours"] if item["day_of_week"] == 5]
    assert fridays, "new opening hour should be public"
    for item in fridays:
        assert "id" not in item  # public contract has no admin identifier

    ac.delete(f"/api/admin/opening-hours/{hour['id']}")
    gym = public_client(client).get("/api/public/gym").json()
    assert not [item for item in gym["opening_hours"] if item["day_of_week"] == 5]


# --- PATCH preservation -----------------------------------------------------


def test_patch_preserves_omitted_fields(client: TestClient, admin) -> None:
    ac = admin_client(client)

    product = _create(ac, "/api/admin/products", PRODUCT)
    patched = ac.patch(
        f"/api/admin/products/{product['id']}", json={"name": "Renamed product"}
    ).json()
    assert patched["sku"] == PRODUCT["sku"]
    assert patched["price_vnd"] == PRODUCT["price_vnd"]

    price = _create(ac, "/api/admin/prices", PRICE)
    patched = ac.patch(
        f"/api/admin/prices/{price['id']}", json={"amount_vnd": 55_000}
    ).json()
    assert patched["category"] == PRICE["category"]
    assert patched["name"] == PRICE["name"]

    course = _create(ac, "/api/admin/courses", COURSE)
    patched = ac.patch(
        f"/api/admin/courses/{course['id']}", json={"instructor": "Linh"}
    ).json()
    assert patched["title"] == COURSE["title"]
    assert patched["level"] == COURSE["level"]

    event = _create(ac, "/api/admin/events", EVENT)
    patched = ac.patch(
        f"/api/admin/events/{event['id']}", json={"location": "Back wall"}
    ).json()
    assert patched["starts_at"] == event["starts_at"]
    assert patched["title"] == EVENT["title"]

    faq = _create(ac, "/api/admin/faq", FAQ)
    patched = ac.patch(
        f"/api/admin/faq/{faq['id']}", json={"category": "Safety"}
    ).json()
    assert patched["question"] == FAQ["question"]

    rule = _create(ac, "/api/admin/rules", RULE)
    patched = ac.patch(
        f"/api/admin/rules/{rule['id']}", json={"sort_order": 7}
    ).json()
    assert patched["body"] == RULE["body"]

    service = _create(ac, "/api/admin/services", SERVICE)
    patched = ac.patch(
        f"/api/admin/services/{service['id']}", json={"icon": "bolt"}
    ).json()
    assert patched["summary"] == SERVICE["summary"]

    hour = _create(ac, "/api/admin/opening-hours", OPENING_HOUR)
    patched = ac.patch(
        f"/api/admin/opening-hours/{hour['id']}", json={"note": "Changed"}
    ).json()
    assert patched["day_of_week"] == OPENING_HOUR["day_of_week"]
    assert patched["opens_at"] is not None


# --- Destructive operations -------------------------------------------------


def test_deleting_a_wall_keeps_its_routes(client: TestClient, admin, wall, route) -> None:
    """A wall deletion must not take the route or unrelated records with it."""
    ac = admin_client(client)

    assert ac.delete(f"/api/admin/walls/{wall.id}").status_code == 204

    public_route = public_client(client).get(f"/api/public/routes/{route.id}")
    assert public_route.status_code == 200
    assert public_route.json()["id"] == route.id

    # The route is still manageable through the admin API.
    assert any(
        item["id"] == route.id for item in ac.get("/api/admin/routes").json()
    )


def test_deleting_one_record_leaves_siblings(client: TestClient, admin) -> None:
    ac = admin_client(client)
    keep = _create(ac, "/api/admin/faq", {**FAQ, "question": "Keep me"})
    drop = _create(ac, "/api/admin/faq", {**FAQ, "question": "Drop me"})

    assert ac.delete(f"/api/admin/faq/{drop['id']}").status_code == 204
    remaining = ac.get("/api/admin/faq").json()
    assert any(item["id"] == keep["id"] for item in remaining)
    assert all(item["id"] != drop["id"] for item in remaining)

    service_keep = _create(ac, "/api/admin/services", {**SERVICE, "title": "Keep"})
    service_drop = _create(ac, "/api/admin/services", {**SERVICE, "title": "Drop"})
    assert ac.delete(f"/api/admin/services/{service_drop['id']}").status_code == 204
    remaining = ac.get("/api/admin/services").json()
    assert any(item["id"] == service_keep["id"] for item in remaining)

    rule_keep = _create(ac, "/api/admin/rules", {**RULE, "title": "Keep"})
    rule_drop = _create(ac, "/api/admin/rules", {**RULE, "title": "Drop"})
    assert ac.delete(f"/api/admin/rules/{rule_drop['id']}").status_code == 204
    remaining = ac.get("/api/admin/rules").json()
    assert any(item["id"] == rule_keep["id"] for item in remaining)

    course_keep = _create(ac, "/api/admin/courses", {**COURSE, "title": "Keep"})
    course_drop = _create(ac, "/api/admin/courses", {**COURSE, "title": "Drop"})
    assert ac.delete(f"/api/admin/courses/{course_drop['id']}").status_code == 204
    remaining = ac.get("/api/admin/courses").json()
    assert any(item["id"] == course_keep["id"] for item in remaining)


def test_deleting_an_event_keeps_the_referencing_task(client: TestClient, admin, db) -> None:
    from app.models import StaffTask

    ac = admin_client(client)
    event = _create(ac, "/api/admin/events", EVENT)

    task = StaffTask(title="Prepare the hall", event_id=event["id"])
    db.add(task)
    db.commit()
    task_id = task.id

    assert ac.delete(f"/api/admin/events/{event['id']}").status_code == 204

    db.expire_all()
    assert db.get(StaffTask, task_id) is not None


# --- Public contract compatibility -----------------------------------------


@pytest.mark.parametrize(
    ("path", "forbidden_fields"),
    [
        ("/api/public/products", set()),
        ("/api/public/prices", set()),
        ("/api/public/services", set()),
        ("/api/public/courses", {"is_active"}),
        ("/api/public/events", set()),
        ("/api/public/faq", {"is_published"}),
        ("/api/public/rules", {"is_active"}),
    ],
)
def test_public_responses_do_not_expose_admin_only_fields(
    client: TestClient, admin, path: str, forbidden_fields: set[str]
) -> None:
    ac = admin_client(client)
    # Seed one visible record so the shape can be inspected.
    _create(ac, "/api/admin/products", PRODUCT)
    _create(ac, "/api/admin/prices", PRICE)
    _create(ac, "/api/admin/services", SERVICE)
    _create(ac, "/api/admin/courses", COURSE)
    _create(ac, "/api/admin/events", EVENT)
    _create(ac, "/api/admin/faq", FAQ)
    _create(ac, "/api/admin/rules", RULE)

    payload = public_client(client).get(path).json()
    assert isinstance(payload, list) and payload
    for item in payload:
        assert not forbidden_fields.intersection(item)
        # No staff/customer identity may leak through public content.
        assert "email" not in item
        assert "created_by_id" not in item
