"""FAQ publication default regression tests.

These tests verify the FAQ publication behavior:
- Missing is_published defaults to false
- Explicit true/false is respected
- PATCH omission preserves the original value
- Public FAQ API excludes unpublished entries
- Assistant retrieval excludes unpublished entries
- Admin can still list unpublished entries
- Existing published entries remain available
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from tests.conftest import auth_headers, login


class TestFAQPublicationDefaults:
    """Regression tests for FAQ publication defaults and visibility."""

    # 1. Missing is_published defaults to false
    def test_create_faq_missing_is_published_defaults_false(
        self, client: TestClient, admin
    ) -> None:
        token = login(client, admin.email)
        payload = {
            "question": "Test FAQ?",
            "answer": "Test answer.",
            "category": "Test",
            "keywords": "test",
        }
        response = client.post(
            "/api/admin/faq",
            json=payload,
            headers=auth_headers(token),
        )
        assert response.status_code == 201, response.text
        data = response.json()
        assert data["is_published"] is False, f"Expected False, got {data['is_published']}"

    # 2. Explicit true remains true
    def test_create_faq_explicit_true(
        self, client: TestClient, admin
    ) -> None:
        token = login(client, admin.email)
        payload = {
            "question": "Test FAQ true?",
            "answer": "Test answer.",
            "category": "Test",
            "keywords": "test",
            "is_published": True,
        }
        response = client.post(
            "/api/admin/faq",
            json=payload,
            headers=auth_headers(token),
        )
        assert response.status_code == 201, response.text
        data = response.json()
        assert data["is_published"] is True

    # 3. Explicit false remains false
    def test_create_faq_explicit_false(
        self, client: TestClient, admin
    ) -> None:
        token = login(client, admin.email)
        payload = {
            "question": "Test FAQ false?",
            "answer": "Test answer.",
            "category": "Test",
            "keywords": "test",
            "is_published": False,
        }
        response = client.post(
            "/api/admin/faq",
            json=payload,
            headers=auth_headers(token),
        )
        assert response.status_code == 201, response.text
        data = response.json()
        assert data["is_published"] is False

    # 4. PATCH omission preserves the original value
    def test_patch_faq_preserves_is_published(
        self, client: TestClient, admin, db
    ) -> None:
        token = login(client, admin.email)
        # Create published FAQ
        create_payload = {
            "question": "Published FAQ?",
            "answer": "Yes.",
            "category": "Test",
            "keywords": "test",
            "is_published": True,
        }
        create_resp = client.post(
            "/api/admin/faq",
            json=create_payload,
            headers=auth_headers(token),
        )
        assert create_resp.status_code == 201
        faq_id = create_resp.json()["id"]

        # PATCH without is_published
        patch_resp = client.patch(
            f"/api/admin/faq/{faq_id}",
            json={"question": "Updated question?"},
            headers=auth_headers(token),
        )
        assert patch_resp.status_code == 200, patch_resp.text
        data = patch_resp.json()
        assert data["is_published"] is True, "is_published should be preserved"

    # 5. Unpublished entries are excluded from public FAQ API
    def test_unpublished_faq_excluded_from_public_api(
        self, client: TestClient, admin, db
    ) -> None:
        token = login(client, admin.email)
        # Create unpublished FAQ
        payload = {
            "question": "Unpublished FAQ?",
            "answer": "Should not appear.",
            "category": "Test",
            "keywords": "test",
            "is_published": False,
        }
        create_resp = client.post(
            "/api/admin/faq",
            json=payload,
            headers=auth_headers(token),
        )
        assert create_resp.status_code == 201
        faq_id = create_resp.json()["id"]

        # Check public API
        public_resp = client.get("/api/public/faq")
        assert public_resp.status_code == 200
        public_data = public_resp.json()
        ids = [item["id"] for item in public_data]
        assert faq_id not in ids, "Unpublished FAQ should not appear in public API"

    # 6. Unpublished entries are excluded from assistant retrieval
    def test_unpublished_faq_excluded_from_assistant_retrieval(
        self, client: TestClient, admin, db
    ) -> None:
        token = login(client, admin.email)
        # Create unpublished FAQ
        payload = {
            "question": "Secret FAQ?",
            "answer": "Secret answer.",
            "category": "Test",
            "keywords": "secret",
            "is_published": False,
        }
        create_resp = client.post(
            "/api/admin/faq",
            json=payload,
            headers=auth_headers(token),
        )
        assert create_resp.status_code == 201
        faq_id = create_resp.json()["id"]

        # Check assistant retrieval (uses retrieve_faq which filters by is_published)
        from app.db import SessionLocal
        from app.services.retrieval import retrieve_faq

        db_session = SessionLocal()
        try:
            sources = retrieve_faq(db_session, "Secret FAQ?", limit=5)
            ids = [s.id for s in sources]
            assert faq_id not in ids, "Unpublished FAQ should not be retrieved by assistant"
        finally:
            db_session.close()

    # 7. Admin can still list unpublished entries
    def test_admin_can_list_unpublished_entries(
        self, client: TestClient, admin
    ) -> None:
        token = login(client, admin.email)
        # Create unpublished FAQ
        payload = {
            "question": "Admin only FAQ?",
            "answer": "Only admin sees.",
            "category": "Test",
            "keywords": "admin",
            "is_published": False,
        }
        create_resp = client.post(
            "/api/admin/faq",
            json=payload,
            headers=auth_headers(token),
        )
        assert create_resp.status_code == 201
        faq_id = create_resp.json()["id"]

        # Admin list should include it
        admin_resp = client.get("/api/admin/faq", headers=auth_headers(token))
        assert admin_resp.status_code == 200
        admin_data = admin_resp.json()
        ids = [item["id"] for item in admin_data]
        assert faq_id in ids, "Admin should see unpublished FAQ"

    # 8. Existing published entries remain available
    def test_existing_published_entries_remain_available(
        self, client: TestClient, admin, db
    ) -> None:
        token = login(client, admin.email)
        # Create published FAQ
        payload = {
            "question": "Published FAQ?",
            "answer": "Available.",
            "category": "Test",
            "keywords": "published",
            "is_published": True,
        }
        create_resp = client.post(
            "/api/admin/faq",
            json=payload,
            headers=auth_headers(token),
        )
        assert create_resp.status_code == 201
        faq_id = create_resp.json()["id"]

        # Public API should include it
        public_resp = client.get("/api/public/faq")
        assert public_resp.status_code == 200
        public_data = public_resp.json()
        ids = [item["id"] for item in public_data]
        assert faq_id in ids, "Published FAQ should appear in public API"

        # Assistant retrieval should include it
        from app.db import SessionLocal
        from app.services.retrieval import retrieve_faq

        db_session = SessionLocal()
        try:
            sources = retrieve_faq(db_session, "Published FAQ?", limit=5)
            ids = [s.id for s in sources]
            assert faq_id in ids, "Published FAQ should be retrieved by assistant"
        finally:
            db_session.close()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])