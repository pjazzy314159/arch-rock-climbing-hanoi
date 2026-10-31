"""Shared pytest fixtures.

The test suite always runs against an isolated SQLite database. The
``DATABASE_URL`` environment variable is set before the application modules are
imported so the engine never points at a real database.
"""

from __future__ import annotations

import os
from collections.abc import Iterator

import pytest

# Use in-memory SQLite database with shared cache to avoid file locking issues on Windows
# The 'uri=true' parameter is required for SQLite URI parameters to be parsed
os.environ["DATABASE_URL"] = "sqlite:///file:test?mode=memory&cache=shared&uri=true"
os.environ["ARCH_SECRET_KEY"] = "test-secret-key-not-for-production"
os.environ["ARCH_ENVIRONMENT"] = "test"

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import Session, sessionmaker  # noqa: E402
from sqlalchemy.pool import QueuePool  # noqa: E402

from app import db as app_db  # noqa: E402
from app.db import Base  # noqa: E402

# The shared-cache URL above makes SQLAlchemy pick ``SingletonThreadPool``
# (because of ``mode=memory``). That pool assumes one connection per thread and
# closes older connections non-deterministically once the configured thread
# count is exceeded, which tears the SQLite connection out from under a live
# session and produces ``Cannot operate on a closed database`` during teardown.
# A shared-cache in-memory database supports concurrent connections, so use the
# normal queue pool explicitly, as SQLAlchemy's documentation recommends.
app_db._local_engine.dispose()
engine = create_engine(
    os.environ["DATABASE_URL"],
    future=True,
    connect_args={"check_same_thread": False},
    poolclass=QueuePool,
)
SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    expire_on_commit=False,
    future=True,
)
app_db._local_engine = engine
app_db.LocalSessionLocal = SessionLocal
app_db.engine = engine
app_db.SessionLocal = SessionLocal
from app.main import app  # noqa: E402
from app.models import (  # noqa: E402
    Achievement,
    AgreementStatus,
    ChecklistItem,
    ClimbRoute,
    ContactMessage,
    Course,
    Event,
    FaqEntry,
    GymInfo,
    OpeningHour,
    Price,
    Product,
    Role,
    RouteStatus,
    RouteVote,
    Rule,
    SafetyAgreement,
    Service,
    StaffShift,
    StaffTask,
    User,
    Wall,
    WallType,
)


def _clear_database() -> None:
    with engine.begin() as connection:
        for table in reversed(Base.metadata.sorted_tables):
            connection.execute(table.delete())


@pytest.fixture(scope="session", autouse=True)
def _database() -> Iterator[None]:
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)
    # Release the file handles before removing the database on Windows.
    engine.dispose()


@pytest.fixture(autouse=True)
def _clean_tables() -> Iterator[None]:
    _clear_database()
    yield


@pytest.fixture
def db() -> Iterator[Session]:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client


def make_user(
    db: Session,
    email: str,
    password: str = "correct-horse-battery",
    role: Role = Role.CUSTOMER,
    full_name: str = "Test Climber",
    **extra,
) -> User:
    """Create a user directly in the database."""
    from app.security import hash_password

    user = User(
        email=email,
        full_name=full_name,
        password_hash=hash_password(password),
        role=role,
        is_active=True,
        **extra,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def login(client: TestClient, email: str, password: str = "correct-horse-battery") -> str:
    """Sign in and return the bearer token."""
    response = client.post("/api/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


def auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def customer(db: Session) -> User:
    return make_user(db, "climber@example.com", full_name="Alex Nguyen")


@pytest.fixture
def other_customer(db: Session) -> User:
    return make_user(db, "other@example.com", full_name="Other Climber")


@pytest.fixture
def staff(db: Session) -> User:
    return make_user(db, "staff@example.com", role=Role.STAFF, full_name="Minh Tran")


@pytest.fixture
def admin(db: Session) -> User:
    return make_user(db, "admin@example.com", role=Role.ADMIN, full_name="ARCH Admin")


@pytest.fixture
def wall(db: Session) -> Wall:
    """A wall in the gym."""
    item = Wall(
        name="The Slab",
        description="Low-angle wall for balance and technique.",
        sort_order=1,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@pytest.fixture
def route(db: Session, wall: Wall) -> ClimbRoute:
    item = ClimbRoute(
        name="Quiet the Mind",
        grade="V3",
        wall_id=wall.id,
        wall_type=WallType.SLAB,
        color="lime",
        style="Balance",
        setter="Minh",
        status=RouteStatus.ACTIVE,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


__all__ = [
    "Achievement",
    "AgreementStatus",
    "ChecklistItem",
    "ClimbRoute",
    "ContactMessage",
    "Course",
    "Event",
    "FaqEntry",
    "GymInfo",
    "OpeningHour",
    "Price",
    "Product",
    "Role",
    "RouteStatus",
    "RouteVote",
    "Rule",
    "SafetyAgreement",
    "Service",
    "StaffShift",
    "StaffTask",
    "User",
    "Wall",
    "WallType",
    "auth_headers",
    "login",
    "make_user",
]
