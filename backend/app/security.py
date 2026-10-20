"""Password hashing and JSON Web Token helpers."""

from __future__ import annotations

import datetime as dt
from typing import Any

import bcrypt
import jwt

from app.config import get_settings

ALGORITHM = "HS256"

#: A valid bcrypt hash of a throwaway value. It is used to keep the time taken
#: to reject an unknown email the same as the time taken to check a real
#: password, so the login endpoint does not reveal which addresses exist.
DUMMY_PASSWORD_HASH = "$2b$12$lQUFyI3iGA2vqwW2vLnAy.XelNL8AU9qHANsbp287M1EVTb6iWQBC"


def hash_password(password: str) -> str:
    """Hash a plaintext password with bcrypt."""
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    """Check a plaintext password against a stored bcrypt hash."""
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def create_access_token(subject: str, role: str, expires_delta: dt.timedelta | None = None) -> str:
    """Create a signed access token for the given user id and role."""
    settings = get_settings()
    now = dt.datetime.now(dt.UTC)
    expires = now + (expires_delta or dt.timedelta(minutes=settings.access_token_ttl_minutes))
    payload: dict[str, Any] = {
        "sub": str(subject),
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int(expires.timestamp()),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any] | None:
    """Decode and validate a token, returning ``None`` when it is not usable."""
    settings = get_settings()
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        return None
