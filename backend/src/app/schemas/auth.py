"""Authentication and customer-record schemas."""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.models import AgreementStatus, Role
from app.schemas.common import ORMModel

#: bcrypt silently ignores everything after the first 72 bytes, so longer
#: passwords are rejected rather than quietly truncated.
MAX_PASSWORD_BYTES = 72
MIN_PASSWORD_LENGTH = 10


def _validate_password_bytes(value: str) -> str:
    if len(value.encode("utf-8")) > MAX_PASSWORD_BYTES:
        raise ValueError(f"password must be at most {MAX_PASSWORD_BYTES} bytes long")
    return value


class RegisterIn(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=160)
    password: str = Field(min_length=MIN_PASSWORD_LENGTH, max_length=MAX_PASSWORD_BYTES)
    phone: str | None = Field(default=None, max_length=40)

    _check_password_bytes = field_validator("password")(_validate_password_bytes)


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class PasswordChangeIn(BaseModel):
    """Payload for changing the signed-in user's own password."""

    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=MIN_PASSWORD_LENGTH, max_length=MAX_PASSWORD_BYTES)

    _check_password_bytes = field_validator("new_password")(_validate_password_bytes)


class UserOut(ORMModel):
    id: int
    email: str
    full_name: str
    role: Role
    is_active: bool
    phone: str | None = None
    membership_tier: str | None = None
    membership_status: str | None = None
    joined_on: date | None = None
    climbing_level: int


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserOut


class ProfileUpdateIn(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=160)
    phone: str | None = Field(default=None, max_length=40)
    climbing_level: int | None = Field(default=None, ge=0, le=12)


class AgreementOut(ORMModel):
    id: int
    user_id: int
    version: str
    status: AgreementStatus
    method: str | None = None
    signed_at: datetime | None = None
    signed_name: str | None = None
    notes: str | None = None
    created_at: datetime


class AgreementSignIn(BaseModel):
    """A digital signature of the safety agreement.

    The workflow is provisional until ARCH confirms it, so the payload only
    carries what a signature needs: the signer's name and an explicit
    confirmation that the terms were read.
    """

    signed_name: str = Field(min_length=2, max_length=160)
    accepted: bool = True


class AgreementUpdateIn(BaseModel):
    """Staff-side update of an agreement record."""

    status: AgreementStatus
    method: str | None = None
    notes: str | None = Field(default=None, max_length=2000)
