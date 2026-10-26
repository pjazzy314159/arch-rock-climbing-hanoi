"""Opt-in PostgreSQL integration coverage.

The normal suite runs against disposable SQLite databases, because it must stay
fast and must not require a database server. These tests are deliberately
opt-in: they run only when ``ARCH_TEST_POSTGRES_URL`` points at a dedicated
PostgreSQL test or verification database.

Each test works in its own temporary schema and drops that schema afterwards.
The public schema, the development database and any seeded data are never
touched. Run them with:

    $env:ARCH_TEST_POSTGRES_URL = "postgresql+psycopg://.../arch_pg_verify"
    uv run pytest tests/test_postgresql_integration.py -q
"""

from __future__ import annotations

import os
import uuid
from collections.abc import Iterator
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic import command
from alembic.config import Config
from sqlalchemy.engine import URL, make_url
from sqlalchemy.orm import sessionmaker

from app.config import get_settings
from app.db import Base
from app.models import (
    ChecklistItem,
    ClimbRoute,
    HoldRole,
    HoldSetStatus,
    RouteHold,
    RouteHoldSet,
    RouteStatus,
    Role,
    StaffShift,
    StaffTask,
    TaskPriority,
    TaskStatus,
    User,
    Wall,
    WallHold,
    WallType,
)
from app.models.base import utcnow
from app.services.holds import hold_set_state, public_holds

BACKEND_ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = BACKEND_ROOT / "migrations"
POSTGRES_URL = os.environ.get("ARCH_TEST_POSTGRES_URL")

pytestmark = pytest.mark.skipif(
    not POSTGRES_URL,
    reason="set ARCH_TEST_POSTGRES_URL to a dedicated PostgreSQL verify database",
)


def _base_url() -> URL:
    """Return the configured URL, refusing anything that is not clearly disposable."""
    assert POSTGRES_URL is not None
    url = make_url(POSTGRES_URL)
    if url.get_backend_name() != "postgresql":
        pytest.fail("ARCH_TEST_POSTGRES_URL must use a PostgreSQL SQLAlchemy URL")
    if not url.database or not any(marker in url.database.lower() for marker in ("test", "verify")):
        pytest.fail(
            "Refusing to run PostgreSQL integration tests against a database whose "
            "name does not contain 'test' or 'verify'"
        )
    return url


def _schema_url(base: URL, schema: str) -> URL:
    """A URL whose connections resolve unqualified names in ``schema``."""
    return base.update_query_dict({"options": f"-csearch_path={schema}"})


@pytest.fixture
def postgres_schema() -> Iterator[tuple[URL, str]]:
    """A temporary schema on the dedicated verification database."""
    base = _base_url()
    schema = f"arch_test_{uuid.uuid4().hex[:12]}"
    admin_engine = sa.create_engine(base, future=True)
    with admin_engine.begin() as connection:
        connection.execute(sa.text(f'CREATE SCHEMA "{schema}"'))
    try:
        yield base, schema
    finally:
        with admin_engine.begin() as connection:
            connection.execute(sa.text(f'DROP SCHEMA "{schema}" CASCADE'))
        admin_engine.dispose()


def _migration_config() -> Config:
    config = Config(str(BACKEND_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(MIGRATIONS))
    return config


def test_the_migrations_apply_and_roll_back_on_postgresql(
    postgres_schema: tuple[URL, str],
) -> None:
    base, schema = postgres_schema
    url = _schema_url(base, schema)
    original_url = os.environ.get("DATABASE_URL")
    os.environ["DATABASE_URL"] = url.render_as_string(hide_password=False)
    get_settings.cache_clear()
    config = _migration_config()
    engine = sa.create_engine(url, future=True)
    try:
        command.upgrade(config, "head")
        command.check(config)

        with engine.connect() as connection:
            inspector = sa.inspect(connection)
            tables = set(inspector.get_table_names())
            assert {
                "users",
                "walls",
                "climb_routes",
                "wall_holds",
                "route_hold_sets",
                "route_holds",
            } <= tables
            route_columns = {
                column["name"]: column for column in inspector.get_columns("climb_routes")
            }
            assert "published_hold_set_id" in route_columns
            assert "wall_type" in route_columns
            assert "zone" not in route_columns
            assert route_columns["wall_type"]["type"].python_type is str
            wall_columns = {column["name"]: column for column in inspector.get_columns("walls")}
            assert wall_columns["is_active"]["type"].python_type is bool
            version = connection.execute(sa.text("SELECT version_num FROM alembic_version"))
            assert version.scalar_one() == "83693e68129f"

        command.downgrade(config, "base")
        with engine.connect() as connection:
            remaining = set(sa.inspect(connection).get_table_names())
        assert not (remaining & set(Base.metadata.tables))
    finally:
        engine.dispose()
        if original_url is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = original_url
        get_settings.cache_clear()


def test_the_models_and_constraints_work_on_postgresql(
    postgres_schema: tuple[URL, str],
) -> None:
    base, schema = postgres_schema
    engine = sa.create_engine(_schema_url(base, schema), future=True)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False, future=True)
    try:
        with factory() as db:
            user = User(
                email="pg-integration@example.com",
                full_name="PostgreSQL Integration",
                password_hash="not-a-real-password-hash",
                is_active=True,
            )
            wall = Wall(name="PG Integration Wall", sort_order=1)
            route = ClimbRoute(
                name="PG Integration Route",
                grade="V4",
                wall=wall,
                wall_type=WallType.OVERHANG,
                status=RouteStatus.ACTIVE,
            )
            db.add_all([user, wall, route])
            db.flush()
            holds = [
                WallHold(
                    wall_id=wall.id,
                    label=f"Hold {index}",
                    x=0.1 * index,
                    y=0.1,
                    width=0.05,
                    height=0.05,
                )
                for index in range(1, 4)
            ]
            db.add_all(holds)
            db.flush()
            hold_set = RouteHoldSet(
                route_id=route.id,
                status=HoldSetStatus.PUBLISHED,
                published_at=utcnow(),
                holds=[
                    RouteHold(wall_hold=holds[0], position=1, role=HoldRole.START),
                    RouteHold(wall_hold=holds[1], position=2, role=HoldRole.MIDDLE),
                    RouteHold(wall_hold=holds[2], position=3, role=HoldRole.FINISH),
                ],
            )
            db.add(hold_set)
            db.flush()
            route.published_hold_set_id = hold_set.id
            db.commit()

            stored_route = db.get(ClimbRoute, route.id)
            assert stored_route is not None
            assert stored_route.wall_type is WallType.OVERHANG
            assert stored_route.status is RouteStatus.ACTIVE
            assert stored_route.published_hold_set_id == hold_set.id
            stored_set = db.get(RouteHoldSet, hold_set.id)
            assert stored_set is not None
            assert [row.position for row in stored_set.holds] == [1, 2, 3]
            assert [row.role for row in stored_set.holds] == [
                HoldRole.START,
                HoldRole.MIDDLE,
                HoldRole.FINISH,
            ]
            assert stored_set.published_at is not None
            assert stored_set.published_at.tzinfo is not None

            status, wall_type = db.execute(
                sa.text(
                    "SELECT s.status, r.wall_type FROM route_hold_sets s "
                    "JOIN climb_routes r ON r.published_hold_set_id = s.id"
                )
            ).one()
            assert status == "PUBLISHED"
            assert wall_type == "OVERHANG"
            assert (
                db.execute(
                    sa.text("SELECT is_active FROM walls WHERE id = :id"), {"id": wall.id}
                ).scalar_one()
                is True
            )

        # The database itself rejects a box outside the photograph.
        with pytest.raises(sa.exc.IntegrityError), engine.begin() as connection:
            connection.execute(
                sa.text(
                    "INSERT INTO wall_holds "
                    "(wall_id, label, x, y, width, height, created_at, updated_at) "
                    "VALUES (:wall_id, 'invalid', 0.9, 0.1, 0.2, 0.05, now(), now())"
                ),
                {"wall_id": wall.id},
            )

        # The database itself rejects two holds at the same position.
        with pytest.raises(sa.exc.IntegrityError), engine.begin() as connection:
            connection.execute(
                sa.text(
                    "INSERT INTO route_holds (set_id, wall_hold_id, position, role) "
                    "VALUES (:set_id, :wall_hold_id, 1, 'START')"
                ),
                {"set_id": hold_set.id, "wall_hold_id": holds[1].id},
            )

        # The failed writes did not remove or duplicate the valid rows.
        with engine.connect() as connection:
            assert connection.execute(sa.text("SELECT count(*) FROM wall_holds")).scalar_one() == 3
            assert connection.execute(sa.text("SELECT count(*) FROM route_holds")).scalar_one() == 3

        # A newer draft must not replace or leak into the published overlay.
        published_ids = [hold.id for hold in holds]
        with factory() as db:
            draft_holds = [
                WallHold(
                    wall_id=wall.id,
                    label=f"Draft hold {index}",
                    x=0.4 + 0.1 * index,
                    y=0.4,
                    width=0.05,
                    height=0.05,
                )
                for index in range(2)
            ]
            db.add_all(draft_holds)
            db.flush()
            draft_hold_ids = [hold.id for hold in draft_holds]
            draft = RouteHoldSet(
                route_id=route.id,
                status=HoldSetStatus.DRAFT,
                holds=[
                    RouteHold(wall_hold=draft_holds[0], position=1, role=HoldRole.START),
                    RouteHold(wall_hold=draft_holds[1], position=2, role=HoldRole.FINISH),
                ],
            )
            db.add(draft)
            db.commit()

            public = public_holds(db, route.id)
            assert public.published is True
            assert [item.wall_hold_id for item in public.holds] == published_ids
            state = hold_set_state(db, route.id)
            assert state.draft is not None
            assert state.published is not None
            assert [item.wall_hold_id for item in state.draft.holds] == draft_hold_ids
            assert [item.wall_hold_id for item in state.published.holds] == published_ids
    finally:
        engine.dispose()


def test_staff_task_checklist_shift_workflows_on_postgresql(
    postgres_schema: tuple[URL, str],
) -> None:
    """Staff task, checklist and shift CRUD work correctly on PostgreSQL."""
    base, schema = postgres_schema
    engine = sa.create_engine(_schema_url(base, schema), future=True)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False, future=True)
    try:
        with factory() as db:
            # Create test users: admin, staff, and customer
            admin = User(
                email="admin@pg-test.example.com",
                full_name="PostgreSQL Admin",
                password_hash="not-a-real-password-hash",
                is_active=True,
                role=Role.ADMIN,
            )
            staff_user = User(
                email="staff@pg-test.example.com",
                full_name="PostgreSQL Staff",
                password_hash="not-a-real-password-hash",
                is_active=True,
                role=Role.STAFF,
            )
            customer = User(
                email="customer@pg-test.example.com",
                full_name="PostgreSQL Customer",
                password_hash="not-a-real-password-hash",
                is_active=True,
                role=Role.CUSTOMER,
            )
            db.add_all([admin, staff_user, customer])
            db.flush()

            # --- Staff Task CRUD ---
            # Create a task assigned to staff
            task = StaffTask(
                title="Test route inspection",
                description="Inspect the new routes on the overhang wall",
                status=TaskStatus.TODO,
                priority=TaskPriority.HIGH,
                assignee_id=staff_user.id,
                created_by_id=admin.id,
            )
            db.add(task)
            db.flush()

            # Verify task created with correct values
            assert task.id is not None
            assert task.status is TaskStatus.TODO
            assert task.priority is TaskPriority.HIGH
            assert task.assignee_id == staff_user.id
            assert task.created_by_id == admin.id
            assert task.completed_at is None

            # Update task status to in_progress
            task.status = TaskStatus.IN_PROGRESS
            db.flush()

            stored_task = db.get(StaffTask, task.id)
            assert stored_task is not None
            assert stored_task.status is TaskStatus.IN_PROGRESS

            # Complete the task
            task.status = TaskStatus.DONE
            task.completed_at = utcnow()
            db.flush()

            stored_task = db.get(StaffTask, task.id)
            assert stored_task.status is TaskStatus.DONE
            assert stored_task.completed_at is not None

            # Cancel a task (should not set completed_at)
            cancelled_task = StaffTask(
                title="Cancelled task",
                description="This task was cancelled",
                status=TaskStatus.CANCELLED,
                assignee_id=staff_user.id,
            )
            db.add(cancelled_task)
            db.flush()
            assert cancelled_task.status is TaskStatus.CANCELLED
            assert cancelled_task.completed_at is None

            # --- Checklist CRUD ---
            # Add checklist items to the task
            item1 = ChecklistItem(
                task_id=task.id,
                label="Check holds are secure",
                position=0,
            )
            item2 = ChecklistItem(
                task_id=task.id,
                label="Verify route grades",
                position=1,
            )
            item3 = ChecklistItem(
                task_id=task.id,
                label="Update route status in system",
                position=2,
            )
            db.add_all([item1, item2, item3])
            db.flush()

            # Verify checklist items created with correct ordering
            assert item1.id is not None
            assert item2.id is not None
            assert item3.id is not None
            assert item1.position == 0
            assert item2.position == 1
            assert item3.position == 2

            # Tick the first item
            item1.is_done = True
            item1.done_at = utcnow()
            item1.done_by_id = staff_user.id
            db.flush()

            stored_item1 = db.get(ChecklistItem, item1.id)
            assert stored_item1.is_done is True
            assert stored_item1.done_at is not None
            assert stored_item1.done_by_id == staff_user.id

            # Verify checklist relationship and ordering
            stored_task = db.get(StaffTask, task.id)
            assert stored_task is not None
            checklist = stored_task.checklist
            assert len(checklist) == 3
            assert checklist[0].label == "Check holds are secure"
            assert checklist[1].label == "Verify route grades"
            assert checklist[2].label == "Update route status in system"
            assert checklist[0].is_done is True
            assert checklist[1].is_done is False
            assert checklist[2].is_done is False

            # --- Staff Shift CRUD ---
            # Create a shift for the staff member
            from datetime import datetime, timedelta
            shift_start = utcnow() + timedelta(days=1)
            shift_end = shift_start + timedelta(hours=8)

            shift = StaffShift(
                staff_id=staff_user.id,
                starts_at=shift_start,
                ends_at=shift_end,
                role="Floor staff",
                notes="Morning shift - route inspection",
            )
            db.add(shift)
            db.flush()

            assert shift.id is not None
            assert shift.staff_id == staff_user.id
            assert shift.role == "Floor staff"
            assert shift.notes == "Morning shift - route inspection"

            # Update shift
            shift.role = "Route setter"
            shift.notes = "Morning shift - route setting"
            db.flush()

            stored_shift = db.get(StaffShift, shift.id)
            assert stored_shift is not None
            assert stored_shift.role == "Route setter"
            assert stored_shift.notes == "Morning shift - route setting"

            # Verify shift timing constraints (ends_at must be after starts_at)
            # This is enforced at the application level, not database level
            invalid_shift = StaffShift(
                staff_id=staff_user.id,
                starts_at=shift_end,
                ends_at=shift_start,  # ends before starts
                role="Invalid shift",
            )
            db.add(invalid_shift)
            db.flush()  # This should succeed at DB level (no constraint)
            # Application validation should catch this

            # --- Database-level constraints ---
            # Task assignee must exist (FK constraint)
            with pytest.raises(sa.exc.IntegrityError), engine.begin() as connection:
                connection.execute(
                    sa.text(
                        "INSERT INTO staff_tasks (title, status, priority, assignee_id, created_at, updated_at) "
                        "VALUES (:title, :status, :priority, :assignee_id, now(), now())"
                    ),
                    {
                        "title": "Invalid task",
                        "status": "todo",
                        "priority": "normal",
                        "assignee_id": 99999,  # non-existent user
                    },
                )

            # Checklist item task_id must exist (FK constraint)
            with pytest.raises(sa.exc.IntegrityError), engine.begin() as connection:
                connection.execute(
                    sa.text(
                        "INSERT INTO checklist_items (task_id, label, position, is_done, created_at, updated_at) "
                        "VALUES (:task_id, :label, :position, :is_done, now(), now())"
                    ),
                    {
                        "task_id": 99999,  # non-existent task
                        "label": "Invalid item",
                        "position": 0,
                        "is_done": False,
                    },
                )

            # Shift staff_id must exist (FK constraint)
            with pytest.raises(sa.exc.IntegrityError), engine.begin() as connection:
                connection.execute(
                    sa.text(
                        "INSERT INTO staff_shifts (staff_id, starts_at, ends_at, role, notes, created_at, updated_at) "
                        "VALUES (:staff_id, :starts_at, :ends_at, :role, :notes, now(), now())"
                    ),
                    {
                        "staff_id": 99999,  # non-existent user
                        "starts_at": shift_start,
                        "ends_at": shift_end,
                        "role": "Floor staff",
                        "notes": "",
                    },
                )

            # Cascade delete: deleting a task should delete its checklist items
            db.delete(task)
            db.flush()
            remaining_items = db.query(ChecklistItem).filter(ChecklistItem.task_id == task.id).all()
            assert len(remaining_items) == 0

            # Cascade delete: deleting a user should delete their tasks (cascade="all, delete-orphan")
            # Note: FK has ondelete="SET NULL" but ORM cascade="all, delete-orphan" takes precedence
            db.delete(staff_user)
            db.flush()
            # The cancelled_task should be deleted because of cascade delete
            stored_task = db.get(StaffTask, cancelled_task.id)
            assert stored_task is None

    finally:
        engine.dispose()
