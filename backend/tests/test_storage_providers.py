"""Unit tests for the storage abstraction (Task 8.8).

These exercise the real local provider and the Cloudflare Workers R2 binding
path with a fake binding. No network, R2 account, or boto3 installation is
required.
"""

from __future__ import annotations

import io

import pytest

import app.storage as storage

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 16
WEBP = b"RIFF\x00\x00\x00\x00WEBP" + b"\x00" * 16
GIF = b"GIF89a" + b"\x00" * 16


def test_detect_image_type_uses_magic_bytes_only() -> None:
    assert storage.detect_image_type(io.BytesIO(PNG)) == "image/png"
    assert storage.detect_image_type(io.BytesIO(JPEG)) == "image/jpeg"
    assert storage.detect_image_type(io.BytesIO(WEBP)) == "image/webp"
    assert storage.detect_image_type(io.BytesIO(GIF)) == "image/gif"
    assert storage.detect_image_type(io.BytesIO(b"<svg></svg>")) == "application/octet-stream"


def test_object_key_is_server_generated_and_unique() -> None:
    first = storage.generate_object_key("image/png")
    second = storage.generate_object_key("image/png")
    assert first.startswith("uploads/")
    assert first.endswith(".png")
    assert first != second
    assert ".." not in first
    assert first.count("/") == 1
    # Unknown/forbidden types never produce an executable or client extension.
    assert storage.generate_object_key("application/octet-stream").endswith(".bin")


@pytest.mark.asyncio
async def test_local_provider_round_trip(tmp_path) -> None:
    provider = storage.LocalStorageProvider(tmp_path, "http://localhost:8080/storage")
    key = storage.generate_object_key("image/png")

    stored = await provider.upload(io.BytesIO(PNG), "image/png", key)

    assert stored.url == f"http://localhost:8080/storage/{key}"
    assert stored.object_key == key
    assert stored.size_bytes == len(PNG)
    assert await provider.exists(key) is True
    assert (tmp_path / key).read_bytes() == PNG

    assert await provider.delete(key) is True
    assert await provider.exists(key) is False
    assert await provider.delete(key) is False


@pytest.mark.asyncio
async def test_local_provider_rejects_path_traversal(tmp_path) -> None:
    provider = storage.LocalStorageProvider(tmp_path, "http://localhost/storage")

    with pytest.raises(ValueError):
        await provider.upload(io.BytesIO(PNG), "image/png", "../escape.png")
    with pytest.raises(ValueError):
        await provider.delete("../escape.png")
    assert await provider.exists("../escape.png") is False


def test_r2_requires_public_url(monkeypatch) -> None:
    monkeypatch.setenv("ARCH_STORAGE_PROVIDER", "r2")
    monkeypatch.delenv("R2_PUBLIC_BASE_URL", raising=False)
    with pytest.raises(RuntimeError, match="R2_PUBLIC_BASE_URL"):
        storage.get_storage_provider()


def test_r2_requires_credentials_without_workers_binding(monkeypatch) -> None:
    monkeypatch.setenv("ARCH_STORAGE_PROVIDER", "r2")
    monkeypatch.setenv("R2_PUBLIC_BASE_URL", "https://cdn.example.com")
    for key in ("R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"):
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setattr(storage, "_worker_bucket", lambda: None)

    with pytest.raises(RuntimeError, match="R2_ACCOUNT_ID"):
        storage.get_storage_provider()


@pytest.mark.asyncio
async def test_r2_workers_binding_round_trip(monkeypatch) -> None:
    class FakeBucket:
        def __init__(self) -> None:
            self.objects: dict[str, bytes] = {}
            self.content_types: dict[str, str] = {}

        async def put(self, key, data, httpMetadata=None):
            self.objects[key] = bytes(data)
            self.content_types[key] = (httpMetadata or {}).get("contentType", "")

        async def delete(self, key):
            self.objects.pop(key, None)

        async def head(self, key):
            return object() if key in self.objects else None

    bucket = FakeBucket()
    monkeypatch.setattr(storage, "_worker_bucket", lambda: bucket)
    monkeypatch.setenv("ARCH_STORAGE_PROVIDER", "r2")
    monkeypatch.setenv("R2_PUBLIC_BASE_URL", "https://images.example.com")
    monkeypatch.delenv("R2_ACCOUNT_ID", raising=False)
    monkeypatch.delenv("R2_ACCESS_KEY_ID", raising=False)
    monkeypatch.delenv("R2_SECRET_ACCESS_KEY", raising=False)

    provider = storage.get_storage_provider()
    assert isinstance(provider, storage.R2StorageProvider)

    key = storage.generate_object_key("image/webp")
    stored = await provider.upload(io.BytesIO(WEBP), "image/webp", key)

    assert stored.url == f"https://images.example.com/{key}"
    assert bucket.objects[key] == WEBP
    assert bucket.content_types[key] == "image/webp"
    assert await provider.exists(key) is True
    assert await provider.delete(key) is True
    assert await provider.exists(key) is False
