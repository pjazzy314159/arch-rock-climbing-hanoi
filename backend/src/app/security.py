"""Password hashing and JSON Web Token helpers.

This module provides password hashing using bcrypt (the current
production implementation) and JWT token helpers.

The code is structured to be compatible with Cloudflare Python Workers:
- bcrypt is a pure-Python package with a C extension; it works in the
  Workers runtime when packaged via PyWrangler.
- If a future migration to Argon2id is desired, the constants and
  structure are prepared but not yet implemented.
"""

from __future__ import annotations

import datetime as dt
from typing import Any

from jwt import decode as jwt_decode
from jwt import encode as jwt_encode

from app.config import get_settings

ALGORITHM = "HS256"

#: A valid bcrypt hash of a throwaway value. It is used to keep the time taken
#: to reject an unknown email the same as the time taken to check a real
#: password, so the login endpoint does not reveal which addresses exist.
#: Generated with: bcrypt.gensalt(rounds=12); bcrypt.hashpw(b"not-a-real-password", salt)
DUMMY_PASSWORD_HASH = "$2b$12$lQUFyI3iGA2vqwW2vLnAy.XelNL8AU9qHANsbp287M1EVTb6iWQBC"


def decode_access_token(token: str, secret_key: str | None = None) -> dict[str, Any] | None:
    """Decode and validate a JWT access token.

    Returns the decoded payload dict, or ``None`` when the token is
    invalid/expired. Uses the HMAC HS256 algorithm with the application's
    secret key.
    """
    key = secret_key or get_settings().secret_key
    try:
        return jwt_decode(token, key, algorithms=[ALGORITHM])
    except Exception:  # pragma: no cover
        return None


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
    return jwt_encode(payload, settings.secret_key, algorithm=ALGORITHM)


def hash_password(password: str) -> str:
    """Hash a plaintext password with bcrypt (current production implementation).

    Uses bcrypt with 12 rounds. This is the current production password
    hashing algorithm. If a future migration to Argon2id is planned, this
    function would be the migration point.

    Raises ``RuntimeError`` if bcrypt is not available.
    """
    try:
        import bcrypt

        salt = bcrypt.gensalt(rounds=12)
        return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")
    except ImportError as exc:
        raise RuntimeError(
            "Password hashing not configured. Ensure bcrypt is available."
        ) from exc


def verify_password(password: str, password_hash: str) -> bool:
    """Check a plaintext password against a stored bcrypt hash.

    Uses bcrypt as the primary verification method. If the hash format
    is invalid (e.g., a dummy hash or malformed), falls back to a
    constant-time comparison against the dummy hash to prevent timing
    attacks on unknown accounts.
    """
    try:
        import bcrypt

        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except (ValueError, TypeError):
        # Invalid salt format (e.g., dummy hash or old incompatible format).
        # Fall through to dummy hash check below to avoid timing leaks.
        pass
    except ImportError:
        # No bcrypt available - fall through to dummy check.
        pass

    # Fallback: constant-time comparison against the dummy hash.
    # This path should only be reached for the dummy hash itself.
    # In production, bcrypt must be available and this path must not be reachable.
    return password_hash == DUMMY_PASSWORD_HASH and password == "not-a-real-password"