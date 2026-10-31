"""Integration tests for admin FAQ and Rules CRUD (Task 8.5)."""

from fastapi.testclient import TestClient
from tests.conftest import auth_headers, login

FAQ_PAYLOAD = {"question": "What is ARCH?", "answer": "A climbing gym.", "category": "General", "keywords": "arch gym"}
RULE_PAYLOAD = {"title": "No shoes on mats", "body": "Keep climbing shoes off pads.", "category": "Safety", "sort_order": 1}


def admin_client(client: TestClient) -> TestClient:
    client.headers.update(auth_headers(login(client, "admin@example.com")))
    return client


def test_admin_faq_crud(client: TestClient, admin) -> None:
    ac = admin_client(client)
    created = ac.post("/api/admin/faq", json=FAQ_PAYLOAD)
    assert created.status_code == 201
    faq_id = created.json()["id"]

    listed = ac.get("/api/admin/faq")
    assert listed.status_code == 200
    assert any(item["id"] == faq_id for item in listed.json())

    patched = ac.patch(f"/api/admin/faq/{faq_id}", json={"is_published": False})
    assert patched.status_code == 200
    assert patched.json()["is_published"] is False

    deleted = ac.delete(f"/api/admin/faq/{faq_id}")
    assert deleted.status_code == 204


def test_admin_rule_crud(client: TestClient, admin) -> None:
    ac = admin_client(client)
    created = ac.post("/api/admin/rules", json=RULE_PAYLOAD)
    assert created.status_code == 201
    rule_id = created.json()["id"]

    listed = ac.get("/api/admin/rules")
    assert listed.status_code == 200
    assert any(item["id"] == rule_id for item in listed.json())

    patched = ac.patch(f"/api/admin/rules/{rule_id}", json={"is_active": False, "is_confirmed": True})
    assert patched.status_code == 200
    assert patched.json()["is_active"] is False
    assert patched.json()["is_confirmed"] is True

    deleted = ac.delete(f"/api/admin/rules/{rule_id}")
    assert deleted.status_code == 204
