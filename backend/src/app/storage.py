"""Storage abstraction for image uploads.

The application supports two providers:

* ``LocalStorageProvider`` writes into a directory that the development app
  serves at ``/storage``. It is intended for local development only.
* ``R2StorageProvider`` writes to a Cloudflare R2 bucket. On Cloudflare Python
  Workers it uses the native R2 binding (``IMAGES_BUCKET``); outside Workers it
  can fall back to the S3-compatible API through ``boto3`` when that optional
  dependency is installed.

Neither provider ever uses a client-supplied filename as a storage path. Object
keys are generated server-side from the detected image type.
"""

from __future__ import annotations

import asyncio
import os
import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any, BinaryIO

from fastapi import UploadFile  # noqa: F401  (kept for type compatibility)

ALLOWED_IMAGE_TYPES: tuple[str, ...] = ("image/jpeg", "image/png", "image/webp")
MAX_IMAGE_BYTES: int = 10 * 1024 * 1024  # 10 MB

_DETECTED_EXTENSIONS = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}


@dataclass(frozen=True)
class StoredImage:
    """Metadata for a stored image."""

    url: str
    """Public URL to access the image."""

    object_key: str
    """Internal storage key/object name."""

    content_type: str
    """MIME type of the stored image."""

    size_bytes: int
    """Size of the stored file in bytes."""

    width: int | None = None
    """Image width in pixels (if available)."""

    height: int | None = None
    """Image height in pixels (if available)."""


def detect_image_type(file: BinaryIO) -> str:
    """Detect an image MIME type from its magic bytes.

    The uploaded filename and declared content type are deliberately ignored;
    only the bytes decide whether the file is an allowed image.
    """
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


def generate_object_key(content_type: str, prefix: str = "uploads") -> str:
    """Generate a safe, unique object key for an image.

    The key is a UUID plus an extension derived from the *detected* content
    type. No part of the client filename reaches the storage path.
    """
    extension = _DETECTED_EXTENSIONS.get(content_type, ".bin")
    safe_prefix = prefix.strip("/") or "uploads"
    return f"{safe_prefix}/{uuid.uuid4().hex}{extension}"


def _worker_bucket() -> Any | None:
    """Return the Cloudflare R2 binding when running on Workers, else ``None``."""
    try:
        from workers import env as worker_env
    except Exception:
        return None

    try:
        return getattr(worker_env, "IMAGES_BUCKET", None)
    except Exception:
        return None


class StorageProvider(ABC):
    """Abstract base class for storage providers."""

    ALLOWED_CONTENT_TYPES: tuple[str, ...] = ALLOWED_IMAGE_TYPES
    MAX_FILE_SIZE: int = MAX_IMAGE_BYTES

    @abstractmethod
    async def upload(
        self,
        file: BinaryIO,
        content_type: str,
        object_key: str,
    ) -> StoredImage:
        """Upload a file and return metadata for the stored object."""

    @abstractmethod
    async def delete(self, object_key: str) -> bool:
        """Delete an object. Returns True if deleted, False if not found."""

    @abstractmethod
    def get_public_url(self, object_key: str) -> str:
        """Get the public URL for an object key."""

    @abstractmethod
    async def exists(self, object_key: str) -> bool:
        """Check if an object exists."""

    def validate_content_type(self, content_type: str) -> bool:
        """Check if a content type is allowed."""
        return content_type in self.ALLOWED_CONTENT_TYPES

    def validate_file_size(self, size: int) -> bool:
        """Check if file size is within limits."""
        return size <= self.MAX_FILE_SIZE

    @staticmethod
    def detect_content_type(file: BinaryIO) -> str:
        """Detect MIME type from file content (first few bytes)."""
        return detect_image_type(file)

    def generate_object_key(self, content_type: str, prefix: str = "uploads") -> str:
        """Generate a safe object key for the detected content type."""
        return generate_object_key(content_type, prefix=prefix)


class LocalStorageProvider(StorageProvider):
    """Local filesystem storage provider for development."""

    def __init__(self, base_path: str | Path, public_base_url: str):
        self.base_path = Path(base_path).resolve()
        self.public_base_url = public_base_url.rstrip("/")
        self.base_path.mkdir(parents=True, exist_ok=True)

    def _target(self, object_key: str) -> Path:
        """Resolve a key inside the storage root, rejecting traversal."""
        key = PurePosixPath(object_key)
        if key.is_absolute() or ".." in key.parts:
            raise ValueError("Invalid object key")
        target = (self.base_path / key).resolve()
        if target != self.base_path and self.base_path not in target.parents:
            raise ValueError("Invalid object key")
        return target

    async def upload(
        self,
        file: BinaryIO,
        content_type: str,
        object_key: str,
    ) -> StoredImage:
        target_path = self._target(object_key)
        target_path.parent.mkdir(parents=True, exist_ok=True)

        data = file.read()
        await asyncio.to_thread(target_path.write_bytes, data)

        return StoredImage(
            url=self.get_public_url(object_key),
            object_key=object_key,
            content_type=content_type,
            size_bytes=len(data),
        )

    async def delete(self, object_key: str) -> bool:
        target_path = self._target(object_key)
        try:
            target_path.unlink()
            return True
        except FileNotFoundError:
            return False

    def get_public_url(self, object_key: str) -> str:
        return f"{self.public_base_url}/{object_key.lstrip('/')}"

    async def exists(self, object_key: str) -> bool:
        try:
            return self._target(object_key).is_file()
        except ValueError:
            return False


class R2StorageProvider(StorageProvider):
    """Cloudflare R2 storage provider.

    On Cloudflare Workers the native ``IMAGES_BUCKET`` binding is used. In a
    normal CPython process (local development or tests) the optional ``boto3``
    S3-compatible client is used instead. Credentials are never required when
    the Workers binding is present.
    """

    def __init__(
        self,
        account_id: str | None = None,
        access_key_id: str | None = None,
        secret_access_key: str | None = None,
        bucket_name: str = "arch-images",
        public_base_url: str = "",
        region: str = "auto",
    ):
        self.account_id = account_id
        self.access_key_id = access_key_id
        self.secret_access_key = secret_access_key
        self.bucket_name = bucket_name
        self.public_base_url = public_base_url.rstrip("/")
        self.region = region
        self._binding = _worker_bucket()
        self._client: Any | None = None

    def _s3_client(self) -> Any:
        if self._client is not None:
            return self._client

        if not all(
            [self.account_id, self.access_key_id, self.secret_access_key]
        ):
            raise RuntimeError("R2 credentials are not configured")

        try:
            import boto3
            from botocore.config import Config
        except ImportError as exc:  # pragma: no cover - depends on environment
            raise RuntimeError(
                "The boto3 package is required for R2 outside Cloudflare Workers"
            ) from exc

        self._client = boto3.client(
            "s3",
            endpoint_url=f"https://{self.account_id}.r2.cloudflarestorage.com",
            aws_access_key_id=self.access_key_id,
            aws_secret_access_key=self.secret_access_key,
            region_name=self.region,
            config=Config(signature_version="s3v4"),
        )
        return self._client

    async def upload(
        self,
        file: BinaryIO,
        content_type: str,
        object_key: str,
    ) -> StoredImage:
        data = file.read()

        if self._binding is not None:
            # Native Workers binding: no credentials and no S3 client needed.
            await self._binding.put(
                object_key,
                data,
                httpMetadata={"contentType": content_type},
            )
        else:
            client = self._s3_client()
            await asyncio.to_thread(
                client.put_object,
                Bucket=self.bucket_name,
                Key=object_key,
                Body=data,
                ContentType=content_type,
            )

        return StoredImage(
            url=self.get_public_url(object_key),
            object_key=object_key,
            content_type=content_type,
            size_bytes=len(data),
        )

    async def delete(self, object_key: str) -> bool:
        try:
            if self._binding is not None:
                await self._binding.delete(object_key)
            else:
                client = self._s3_client()
                await asyncio.to_thread(
                    client.delete_object, Bucket=self.bucket_name, Key=object_key
                )
            return True
        except Exception:
            return False

    def get_public_url(self, object_key: str) -> str:
        if not self.public_base_url:
            raise RuntimeError("R2_PUBLIC_BASE_URL is not configured")
        return f"{self.public_base_url}/{object_key.lstrip('/')}"

    async def exists(self, object_key: str) -> bool:
        try:
            if self._binding is not None:
                return await self._binding.head(object_key) is not None
            client = self._s3_client()
            await asyncio.to_thread(
                client.head_object, Bucket=self.bucket_name, Key=object_key
            )
            return True
        except Exception:
            return False


def get_storage_provider() -> StorageProvider:
    """Get the configured storage provider based on environment."""
    env = os.getenv("ARCH_STORAGE_PROVIDER", "local").lower()

    if env == "r2":
        account_id = os.getenv("R2_ACCOUNT_ID")
        access_key = os.getenv("R2_ACCESS_KEY_ID")
        secret_key = os.getenv("R2_SECRET_ACCESS_KEY")
        bucket = os.getenv("R2_BUCKET_NAME", "arch-images")
        public_url = os.getenv("R2_PUBLIC_BASE_URL", "").strip()
        region = os.getenv("R2_REGION", "auto")

        if not public_url:
            raise RuntimeError(
                "R2 storage configured but R2_PUBLIC_BASE_URL is missing"
            )

        # On Workers the bucket binding replaces the credentials. Outside
        # Workers all three S3 credential variables are required.
        if _worker_bucket() is None and not all([account_id, access_key, secret_key]):
            raise RuntimeError(
                "R2 storage configured but required environment variables missing: "
                "R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY"
            )

        return R2StorageProvider(
            account_id=account_id,
            access_key_id=access_key,
            secret_access_key=secret_key,
            bucket_name=bucket,
            public_base_url=public_url,
            region=region,
        )

    if env not in ("local", ""):
        raise RuntimeError(f"Unknown ARCH_STORAGE_PROVIDER: {env}")

    # Default: local filesystem
    base_path = os.getenv("ARCH_LOCAL_STORAGE_PATH", "./storage/images")
    public_url = os.getenv("ARCH_LOCAL_PUBLIC_URL", "http://localhost:8080/storage")

    return LocalStorageProvider(base_path=base_path, public_base_url=public_url)
