"""Seed the ARCH database.

The seed command is a local development tool, not a production content path.

``python -m app.seed``
    Applies the Alembic migrations and creates **no business content**. ARCH
    content is entered through the Admin CMS after it has been supplied and
    approved. An empty database is the correct starting state.

``python -m app.seed --demo``
    Optionally loads clearly-labelled sample fixtures for local development
    (routes, products, demo accounts, climbs and votes). Demo data is sample
    data, not ARCH information, and is only allowed against recognised local
    databases.

Both operations are guarded before Alembic runs. ``--reset`` additionally
requires ``--confirm-reset``.
"""

from __future__ import annotations

import argparse
from datetime import UTC, date, datetime, timedelta
from typing import TYPE_CHECKING

from sqlalchemy import select
from sqlalchemy.orm import Session

if TYPE_CHECKING:
    from alembic.config import Config

from app.db import SessionLocal
from app.models import (
    Achievement,
    AgreementStatus,
    ClimbRoute,
    Course,
    Event,
    Product,
    ResultType,
    Role,
    RouteStatus,
    RouteVote,
    SafetyAgreement,
    StaffTask,
    User,
    VoteValue,
    Wall,
    WallType,
)
from app.security import hash_password

#: The placeholder photograph the seeded walls point at. ARCH has not
#: published a photograph of each wall yet; the real pictures live in the
#: media store and are referenced the same way.
WALL_PHOTO = "/walls/placeholder-gym.jpg"


def _seed_demo(db: Session) -> None:
    """Load clearly-labelled sample fixtures for local development.

    The demo accounts use well-known development passwords, so this refuses to
    run outside a local development/test environment and against any database
    that is not a recognised local target. The CLI performs the same checks
    before Alembic runs; this inner check also protects direct callers.
    """
    from app.config import get_settings, is_production
    from app.seed_safety import validate_database_target

    settings = get_settings()
    if is_production(settings.environment):
        raise RuntimeError(
            "Refusing to seed demo accounts with development passwords in a production environment."
        )

    bind = db.get_bind()
    if bind is None:
        raise RuntimeError("Refusing to seed demo data: the database target cannot be verified.")
    validate_database_target(str(bind.url))

    # A wall carries a reference to the photograph it is set against, not the
    # photograph itself. ARCH has not published a photograph of each wall yet,
    # so the seeded walls point at the placeholder photograph and that is
    # replaced with the real ones in the media store.
    demo_walls = [
        ("The Main Wall", "The long main face of the gym.", 1, WALL_PHOTO),
        ("The Slab", "Low-angle wall for balance and technique.", 2, WALL_PHOTO),
        ("The Cave", "Steep overhang for power and commitment.", 3, WALL_PHOTO),
    ]
    walls: dict[str, Wall] = {}
    for name, description, order, image_url in demo_walls:
        wall = db.scalar(select(Wall).where(Wall.name == name))
        if wall is None:
            # Only create a missing demo wall. An existing wall may be ARCH
            # content or may have been edited by a user, so it is never
            # overwritten by the fixture loader.
            wall = Wall(
                name=name,
                description=description,
                sort_order=order,
                image_url=image_url,
            )
            db.add(wall)
        walls[name] = wall
    db.flush()
    for wall in db.scalars(select(Wall)).all():
        walls.setdefault(wall.name, wall)

    demo_routes = [
        ("Quiet the Mind", "V3", "The Slab", WallType.SLAB, "lime", "Balance · Technical", "Minh"),
        (
            "Against the Grain",
            "V5",
            "The Cave",
            WallType.OVERHANG,
            "coral",
            "Power · Overhang",
            "Linh",
        ),
        (
            "Little by Little",
            "V1",
            "The Main Wall",
            WallType.VERTICAL,
            "blue",
            "Flow · Beginner-friendly",
            "An",
        ),
        (
            "Trust Your Feet",
            "V4",
            "The Slab",
            WallType.SLAB,
            "yellow",
            "Footwork · Technical",
            "Minh",
        ),
        (
            "After Hours",
            "V6",
            "The Cave",
            WallType.OVERHANG,
            "blue",
            "Compression · Power",
            "Linh",
        ),
        (
            "First Ascent",
            "V0",
            "The Main Wall",
            WallType.VERTICAL,
            "coral",
            "Beginner-friendly · Flow",
            "An",
        ),
    ]
    if db.scalar(select(ClimbRoute).limit(1)) is None:
        for index, (name, grade, wall_name, wall_type, color, style, setter) in enumerate(
            demo_routes
        ):
            db.add(
                ClimbRoute(
                    name=name,
                    grade=grade,
                    wall_id=walls[wall_name].id if wall_name in walls else None,
                    wall_type=wall_type,
                    color=color,
                    style=style,
                    setter=setter,
                    status=RouteStatus.ACTIVE,
                    set_at=date.today() - timedelta(days=index * 3),
                )
            )
        db.flush()

    if db.scalar(select(Product).limit(1)) is None:
        demo_products = [
            ("ARC-EDG-01", "Edge Performance", "Performance", "Aggressive", 2490000, 8),
            ("ARC-FLW-01", "Flow All-round", "All-round", "Moderate", 1890000, 12),
            ("ARC-STA-01", "Start Essential", "Beginner", "Neutral", 1290000, 4),
        ]
        for sku, name, category, fit, price, stock in demo_products:
            db.add(
                Product(
                    sku=sku,
                    name=name,
                    brand="ARCH Selection",
                    category=category,
                    fit=fit,
                    price_vnd=price,
                    description=(
                        "Sample catalogue entry used for local development. "
                        "Replace with ARCH's real product data."
                    ),
                    stock=stock,
                )
            )

    if db.scalar(select(Course).limit(1)) is None:
        db.add(
            Course(
                title="Introduction to Bouldering",
                level="Beginner",
                summary="A two-session introduction for new climbers.",
                description=(
                    "Sample course entry used for local development. Replace with "
                    "ARCH's confirmed course catalogue."
                ),
                instructor="To be confirmed",
                schedule="To be confirmed",
                duration_weeks=2,
                capacity=8,
            )
        )

    if db.scalar(select(Event).limit(1)) is None:
        now = datetime.now(UTC)
        db.add(
            Event(
                title="Sample community session",
                description=(
                    "Sample event entry used for local development. Replace with "
                    "ARCH's confirmed event calendar."
                ),
                starts_at=now + timedelta(days=7),
                ends_at=now + timedelta(days=7, hours=3),
                location="Main Wall",
                capacity=30,
                is_public=True,
            )
        )

    # The addresses use the documentation domain on purpose: they are demo
    # accounts, and reserved domains such as `.local` are rejected by the
    # e-mail validator used by the API.
    accounts = [
        ("admin@example.com", "ARCH Admin", Role.ADMIN, "admin-demo-password"),
        ("staff@example.com", "Minh Tran", Role.STAFF, "staff-demo-password"),
        ("alex@example.com", "Alex Nguyen", Role.CUSTOMER, "customer-demo-password"),
    ]
    users: dict[str, User] = {}
    for email, full_name, role, password in accounts:
        user = db.scalar(select(User).where(User.email == email))
        if user is None:
            user = User(
                email=email,
                full_name=full_name,
                password_hash=hash_password(password),
                role=role,
                membership_tier="Monthly pass" if role is Role.CUSTOMER else None,
                membership_status="Active" if role is Role.CUSTOMER else None,
                joined_on=date.today() - timedelta(days=30),
                climbing_level=4 if role is Role.CUSTOMER else 0,
            )
            db.add(user)
            db.flush()
            if role is Role.CUSTOMER:
                db.add(
                    SafetyAgreement(
                        user_id=user.id,
                        version="2026-01",
                        status=AgreementStatus.SIGNED,
                        signed_at=datetime.now(UTC),
                        signed_name=full_name,
                    )
                )
        users[email] = user

    alex = users["alex@example.com"]
    if db.scalar(select(Achievement).where(Achievement.user_id == alex.id).limit(1)) is None:
        demo_climbs = [
            ("Quiet the Mind", "V3", ResultType.SENT, 3, 14),
            ("Against the Grain", "V5", ResultType.PROJECT, 6, 14),
            ("Little by Little", "V1", ResultType.SENT, 1, 12),
            ("Trust Your Feet", "V4", ResultType.SENT, 2, 10),
        ]
        for route_name, grade, result, attempts, days_ago in demo_climbs:
            db.add(
                Achievement(
                    user_id=alex.id,
                    route_name=route_name,
                    grade=grade,
                    result=result,
                    attempts=attempts,
                    climbed_on=date.today() - timedelta(days=days_ago),
                    notes="Sample log entry for local development.",
                )
            )

    if db.scalar(select(RouteVote).limit(1)) is None:
        routes = db.scalars(select(ClimbRoute)).all()
        if routes:
            values = [VoteValue.AS_SET, VoteValue.EASIER, VoteValue.HARDER]
            for index, route in enumerate(routes):
                db.add(
                    RouteVote(
                        route_id=route.id,
                        user_id=alex.id,
                        value=values[index % len(values)],
                        voter_level=alex.climbing_level,
                        comment="Sample vote for local development.",
                    )
                )

    if db.scalar(select(StaffTask).limit(1)) is None:
        staff_user = users["staff@example.com"]
        db.add(
            StaffTask(
                title="Sample task — reset the slab",
                description="Sample task used for local development.",
                assignee_id=staff_user.id,
                due_at=datetime.now(UTC) + timedelta(days=2),
            )
        )


def _migration_config(database_url: str) -> Config:
    """Build an Alembic config that points at the backend's migrations.

    ``app`` lives in ``backend/src/app``, so the backend root is two levels
    above the package directory (``app.config.BACKEND_ROOT``), not two levels
    above this module. Resolving it from the package location keeps the
    documented ``python -m app.seed --demo`` command working from a source
    checkout.
    """
    from alembic.config import Config

    from app.config import BACKEND_ROOT

    config = Config(str(BACKEND_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_ROOT / "migrations"))
    # configparser treats a bare percent sign as interpolation syntax. Escape
    # percent-encoded URLs here for the same reason as migrations/env.py.
    config.set_main_option("sqlalchemy.url", database_url.replace("%", "%%"))
    return config


def _migrate(reset: bool = False) -> None:
    """Bring the database to the latest Alembic revision.

    The seed uses Alembic rather than ``create_all`` so the schema and the
    recorded migration revision can never drift apart.
    """
    from alembic import command

    from app.config import get_settings

    config = _migration_config(get_settings().database_url)

    if reset:
        command.downgrade(config, "base")
        print("Rolled the schema back to an empty database.")
    command.upgrade(config, "head")


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Seed the ARCH database")
    parser.add_argument(
        "--demo",
        action="store_true",
        help="Also load clearly-labelled local sample routes, products and accounts",
    )
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Roll the local schema back to an empty database before migrating",
    )
    parser.add_argument(
        "--confirm-reset",
        action="store_true",
        help="Required with --reset; confirms destruction of the local database",
    )
    args = parser.parse_args(argv)

    from app.config import get_settings
    from app.seed_safety import SeedSafetyError, validate_seed_invocation

    settings = get_settings()
    try:
        validate_seed_invocation(
            environment=settings.environment,
            database_url=settings.database_url,
            reset=args.reset,
            confirm_reset=args.confirm_reset,
        )
    except SeedSafetyError as exc:
        parser.exit(2, f"error: {exc}\n")

    # The guard above must complete before this point. No migration, downgrade,
    # or content write may happen before the target has been validated.
    _migrate(reset=args.reset)
    print("Database is at the latest migration.")

    if not args.demo:
        print("No business content was seeded. Use the Admin CMS for ARCH content.")
        return

    session: Session = SessionLocal()
    try:
        _seed_demo(session)
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()

    print("Loaded local sample demo fixtures.")


if __name__ == "__main__":
    main()
