"""Shared FastAPI dependencies: authentication and role guards."""

from __future__ import annotations

from collections.abc import Callable

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Role, User
from app.security import decode_access_token

bearer_scheme = HTTPBearer(auto_error=False)

_UNAUTHENTICATED = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Authentication required",
    headers={"WWW-Authenticate": "Bearer"},
)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    """Return the authenticated user or raise 401."""
    if credentials is None or not credentials.credentials:
        raise _UNAUTHENTICATED

    payload = decode_access_token(credentials.credentials)
    if not payload or not payload.get("sub"):
        raise _UNAUTHENTICATED

    try:
        user_id = int(payload["sub"])
    except (TypeError, ValueError):
        raise _UNAUTHENTICATED from None

    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise _UNAUTHENTICATED
    return user


def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User | None:
    """Return the authenticated user, or ``None`` when nobody is signed in.

    Used by endpoints that are public but can personalise their answer.
    """
    if credentials is None or not credentials.credentials:
        return None
    payload = decode_access_token(credentials.credentials)
    if not payload or not payload.get("sub"):
        return None
    try:
        user_id = int(payload["sub"])
    except (TypeError, ValueError):
        return None
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        return None
    return user


def require_roles(*roles: Role) -> Callable[[User], User]:
    """Build a dependency that only allows the given roles through."""

    allowed = set(roles)

    def _guard(user: User = Depends(get_current_user)) -> User:
        if user.role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to perform this action",
            )
        return user

    return _guard


require_customer = require_roles(Role.CUSTOMER, Role.STAFF, Role.ADMIN)
require_staff = require_roles(Role.STAFF, Role.ADMIN)
require_admin = require_roles(Role.ADMIN)
