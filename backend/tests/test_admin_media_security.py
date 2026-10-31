"""Backend admin media security regression tests (Task 8.8).

Tests HTTP-level security properties of POST /api/admin/media/images with mocked storage.
Covers auth, authorization, content validation, size limits, key generation,
storage failures, config errors, URL strategy, and deletion absence.
"""

from __future__ import annotations

import io
import uuid
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.storage import StoredImage
from tests.conftest import auth_headers, login

# --- Minimal valid magic-byte bodies ---
JPEG_BYTES = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00" + b"\x00" * 10
PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 10
WEBP_BYTES = b"RIFF" + b"\x00\x00\x00\x00" + b"WEBP" + b"\x00" * 10

# --- Invalid / unsupported bodies ---
GIF_BYTES = b"GIF89a" + b"\x00" * 10
SVG_BYTES = b"<svg></svg>"
PDF_BYTES = b"%PDF-1.4\n1 0 obj\n\n" + b"\x00" * 10
TEXT_BYTES = b"this is not an image"


class FakeStorageProvider:
    """Fake storage provider for isolated security tests.

    Implements the StorageProvider interface plus the module-level
    functions that admin.py expects (ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES,
    detect_image_type, generate_object_key).
    """

    ALLOWED_IMAGE_TYPES = ("image/jpeg", "image/png", "image/webp")
    MAX_IMAGE_BYTES = 10 * 1024 * 1024  # 10 MB

    def __init__(
        self,
        public_base_url: str = "https://cdn.example.com",
        fail_upload: bool = False,
    ) -> None:
        self.public_base_url = public_base_url.rstrip("/")
        self.fail_upload = fail_upload
        self.uploaded: list[tuple[str, str, int]] = []

    @staticmethod
    def detect_image_type(file: io.BinaryIO) -> str:
        """Detect an image MIME type from its magic bytes."""
        header = file.read(32)
        file.seek(0)
        if header[:2] == b"\xff\xd8":
            return "image/jpeg"
        if header[:8] == b"\x89PNG\r\n\x1a\n":
            return "image/png"
        if header[:4] == b"RIFF" and header[8:12] == b"WEBP":
            return "image/webp"
        if header[:6] in (b"GIF87a", b"GIF89a"):
            return "image/gif"
        return "application/octet-stream"

    def generate_object_key(self, filename: str, prefix: str = "uploads") -> str:
        """Generate a safe, unique object key for a file."""
        ext = Path(filename).suffix.lower() or ".bin"
        return f"{prefix}/{uuid.uuid4().hex}{ext}"

    async def upload(self, file, content_type: str, object_key: str) -> StoredImage:
        if self.fail_upload:
            raise RuntimeError("simulated storage failure: disk full")
        file.seek(0, 2)
        size = file.tell()
        file.seek(0)
        self.uploaded.append((content_type, object_key, size))
        return StoredImage(
            url=self.get_public_url(object_key),
            object_key=object_key,
            content_type=content_type,
            size_bytes=size,
        )

    def get_public_url(self, object_key: str) -> str:
        return f"{self.public_base_url}/{object_key}"

    async def delete(self, object_key: str) -> bool:
        return False

    async def exists(self, object_key: str) -> bool:
        return False


@pytest.fixture
def fake_storage(monkeypatch):
    """Provide a fake storage provider and patch it into the admin module."""
    provider = FakeStorageProvider()
    monkeypatch.setattr("app.api.admin.get_storage_provider", lambda: provider)
    return provider


class TestAdminMediaSecurity:
    """Security regression tests for admin image upload endpoint."""

    # 1. Unauthenticated upload rejected (401/403)
    def test_unauthenticated_rejected(self, client: TestClient) -> None:
        response = client.post(
            "/api/admin/media/images",
            files={"file": ("test.jpg", JPEG_BYTES, "image/jpeg")},
        )
        assert response.status_code in (401, 403), (
            f"expected 401/403 for unauthenticated, got {response.status_code}"
        )

    # 2. Non-admin (customer and staff) rejected
    def test_customer_rejected(self, client: TestClient, customer) -> None:
        token = login(client, customer.email)
        response = client.post(
            "/api/admin/media/images",
            files={"file": ("test.jpg", JPEG_BYTES, "image/jpeg")},
            headers=auth_headers(token),
        )
        assert response.status_code in (401, 403), (
            f"expected 401/403 for customer, got {response.status_code}"
        )

    def test_staff_rejected(self, client: TestClient, staff) -> None:
        token = login(client, staff.email)
        response = client.post(
            "/api/admin/media/images",
            files={"file": ("test.jpg", JPEG_BYTES, "image/jpeg")},
            headers=auth_headers(token),
        )
        assert response.status_code in (401, 403), (
            f"expected 401/403 for staff, got {response.status_code}"
        )

    # 3. Admin valid JPEG/PNG/WebP accepted -> 201 with url/object_key/content_type/size_bytes
    def test_admin_valid_jpeg_png_webp_accepted(
        self, client: TestClient, admin, fake_storage: FakeStorageProvider
    ) -> None:
        token = login(client, admin.email)
        for body, ct, name in [
            (JPEG_BYTES, "image/jpeg", "photo.jpg"),
            (PNG_BYTES, "image/png", "photo.png"),
            (WEBP_BYTES, "image/webp", "photo.webp"),
        ]:
            response = client.post(
                "/api/admin/media/images",
                files={"file": (name, body, ct)},
                headers=auth_headers(token),
            )
            assert response.status_code == 201, (
                f"expected 201 for {name}, got {response.status_code}: {response.text}"
            )
            data = response.json()
            assert "url" in data
            assert "object_key" in data
            assert "content_type" in data
            assert "size_bytes" in data
            assert data["content_type"] == ct
            assert data["size_bytes"] == len(body)

    # 4. Invalid image bytes rejected; unsupported formats (GIF, SVG, PDF) rejected
    def test_invalid_bytes_rejected(
        self, client: TestClient, admin, fake_storage: FakeStorageProvider
    ) -> None:
        token = login(client, admin.email)
        response = client.post(
            "/api/admin/media/images",
            files={"file": ("bad.png", TEXT_BYTES, "image/png")},
            headers=auth_headers(token),
        )
        assert response.status_code == 400, (
            f"expected 400 for text bytes, got {response.status_code}: {response.text}"
        )

    def test_unsupported_formats_rejected(
        self, client: TestClient, admin, fake_storage: FakeStorageProvider
    ) -> None:
        token = login(client, admin.email)
        for body, ct, name in [
            (GIF_BYTES, "image/gif", "anim.gif"),
            (SVG_BYTES, "image/svg+xml", "icon.svg"),
            (PDF_BYTES, "application/pdf", "doc.pdf"),
        ]:
            response = client.post(
                "/api/admin/media/images",
                files={"file": (name, body, ct)},
                headers=auth_headers(token),
            )
            assert response.status_code == 400, (
                f"expected 400 for {name}, got {response.status_code}: {response.text}"
            )

    # 5. Filename extension / client MIME cannot bypass content validation
    def test_filename_and_client_mime_cannot_bypass(
        self, client: TestClient, admin, fake_storage: FakeStorageProvider
    ) -> None:
        token = login(client, admin.email)
        response = client.post(
            "/api/admin/media/images",
            files={"file": ("x.png", TEXT_BYTES, "image/png")},
            headers=auth_headers(token),
        )
        assert response.status_code == 400, (
            f"expected 400 for bypass attempt, got {response.status_code}"
        )

    # 6. Oversized upload rejected (413) — >10MB payload
    def test_oversized_rejected(
        self, client: TestClient, admin, fake_storage: FakeStorageProvider
    ) -> None:
        token = login(client, admin.email)
        # 11 MB: valid JPEG header + padding
        big = JPEG_BYTES + b"\x00" * (11 * 1024 * 1024)
        response = client.post(
            "/api/admin/media/images",
            files={"file": ("big.jpg", big, "image/jpeg")},
            headers=auth_headers(token),
        )
        assert response.status_code == 413, (
            f"expected 413 for oversized, got {response.status_code}: {response.text}"
        )

    # 7. Object key server-generated: no "..", no "/" from user filename,
    # no raw filename, unique per upload
    def test_object_key_server_generated_no_raw_filename(
        self, client: TestClient, admin, fake_storage: FakeStorageProvider, monkeypatch
    ) -> None:
        token = login(client, admin.email)
        # Monkeypatch uuid to fixed value for deterministic key inspection
        fixed_hex = "1234567890abcdef1234567890abcdef"
        monkeypatch.setattr(uuid, "uuid4", lambda: type("U", (), {"hex": fixed_hex})())

        response = client.post(
            "/api/admin/media/images",
            files={"file": ("user/file/name.png", PNG_BYTES, "image/png")},
            headers=auth_headers(token),
        )
        assert response.status_code == 201
        data = response.json()
        key = data["object_key"]

        # No path traversal
        assert ".." not in key
        # Only the prefix slash is allowed (uploads/)
        assert key.count("/") == 1, f"key should contain exactly one '/', got {key!r}"
        # No raw filename fragments
        assert "user" not in key
        assert "file" not in key
        assert "name" not in key
        # Starts with uploads/ and ends with .png
        assert key.startswith("uploads/")
        assert key.endswith(".png")

    def test_object_key_unique_per_upload(
        self, client: TestClient, admin, fake_storage: FakeStorageProvider
    ) -> None:
        token = login(client, admin.email)
        keys = []
        for i in range(3):
            r = client.post(
                "/api/admin/media/images",
                files={"file": (f"img{i}.jpg", JPEG_BYTES, "image/jpeg")},
                headers=auth_headers(token),
            )
            assert r.status_code == 201
            keys.append(r.json()["object_key"])
        assert len(set(keys)) == 3, f"keys not unique: {keys}"

    # 8. Storage failure -> no success; response must not contain exception text/secrets
    def test_storage_failure_no_exception_text(
        self, client: TestClient, admin, monkeypatch
    ) -> None:
        fail_provider = FakeStorageProvider(fail_upload=True)
        monkeypatch.setattr("app.api.admin.get_storage_provider", lambda: fail_provider)
        token = login(client, admin.email)
        response = client.post(
            "/api/admin/media/images",
            files={"file": ("test.jpg", JPEG_BYTES, "image/jpeg")},
            headers=auth_headers(token),
        )
        assert response.status_code == 500, (
            f"expected 500 on storage failure, got {response.status_code}"
        )
        text = response.text
        # Intended secure behavior: no raw exception text in response
        # If current code leaks via detail=f"Failed to upload image: {e}",
        # this assertion will fail and the defect is exposed.
        assert "Failed to upload image" not in text, (
            f"response leaks internal exception text: {text}"
        )
        assert "simulated storage failure" not in text, (
            f"response leaks exception details: {text}"
        )

    # 9. Missing storage configuration (R2 without env) -> explicit safe error (500),
    # no fake success, no secret values in body
    def test_missing_r2_config_safe_error(
        self, client: TestClient, admin, monkeypatch
    ) -> None:
        monkeypatch.setenv("ARCH_STORAGE_PROVIDER", "r2")
        for k in (
            "R2_ACCOUNT_ID",
            "R2_ACCESS_KEY_ID",
            "R2_SECRET_ACCESS_KEY",
            "R2_PUBLIC_BASE_URL",
        ):
            monkeypatch.delenv(k, raising=False)
        token = login(client, admin.email)
        response = client.post(
            "/api/admin/media/images",
            files={"file": ("test.jpg", JPEG_BYTES, "image/jpeg")},
            headers=auth_headers(token),
        )
        assert response.status_code == 500, (
            f"expected 500 for missing R2 config, got {response.status_code}"
        )
        text = response.text
        assert "R2" in text or "missing" in text.lower() or "configured" in text.lower(), (
            f"expected safe error message, got: {text}"
        )
        # No fake success
        assert response.status_code != 201
        # No secret values (they're not set anyway)
        for secret in ["account", "key", "secret"]:
            assert secret.lower() not in text.lower() or "missing" in text.lower(), (
                f"potential secret leak in error: {text}"
            )

    # 10. Returned public URL follows configured strategy
    def test_returned_url_follows_configured_base(
        self, client: TestClient, admin, monkeypatch
    ) -> None:
        custom_url = "https://images.example.org/assets"
        provider = FakeStorageProvider(public_base_url=custom_url)
        monkeypatch.setattr("app.api.admin.get_storage_provider", lambda: provider)
        token = login(client, admin.email)
        response = client.post(
            "/api/admin/media/images",
            files={"file": ("test.jpg", JPEG_BYTES, "image/jpeg")},
            headers=auth_headers(token),
        )
        assert response.status_code == 201
        url = response.json()["url"]
        assert url.startswith(custom_url), (
            f"expected URL to start with {custom_url}, got {url}"
        )

    # 11. No image deletion endpoint exists -> assert absence
    def test_no_deletion_endpoint_or_cannot_target_external(
        self, client: TestClient, admin
    ) -> None:
        # There is no DELETE /api/admin/media/images/{key} in admin.py
        token = login(client, admin.email)
        response = client.delete(
            "/api/admin/media/images/some-key",
            headers=auth_headers(token),
        )
        # Should be 404 (not found) or 405 (method not allowed), not 200/204
        assert response.status_code in (404, 405, 401, 403), (
            f"unexpected DELETE response {response.status_code}: {response.text}"
        )
        # Document: no deletion endpoint implemented; if one is added later,
        # it must validate object keys and never accept arbitrary external URLs.
