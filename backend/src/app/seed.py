"""Seed the ARCH database.

Two levels of data are available:

``python -m app.seed``
    Seeds only what the site needs to be structurally complete and what does
    **not** invent business facts: the gym record, the facility descriptions
    that already existed in the Lovable concept site, and a set of *draft*
    rules that are clearly flagged as awaiting ARCH's approval.

``python -m app.seed --demo``
    Additionally loads clearly-labelled sample data (routes, products, demo
    accounts, climbs and votes) so the local development environment has
    something to show. Demo data is sample data, not ARCH information.

Both levels are idempotent: running them twice does not duplicate rows.
"""

from __future__ import annotations

import argparse
from datetime import UTC, date, datetime, time, timedelta
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
    FaqEntry,
    GymInfo,
    OpeningHour,
    Product,
    ResultType,
    Role,
    RouteStatus,
    RouteVote,
    Rule,
    SafetyAgreement,
    Service,
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

# --- Content that is safe to publish ----------------------------------------

GYM = {
    "name": "ARCH Rock Climbing Hanoi",
    "tagline": "Rock climbing. Real connection.",
    "about": (
        "ARCH is an indoor bouldering gym in Hanoi built for climbing and for the "
        "people who make it worth showing up for."
    ),
    "surface_area_m2": 600,
    "route_count": 64,
    "opening_note": "Opening hours are to be confirmed by ARCH.",
}

# The facility descriptions below are the ones the concept site already
# published. They describe what the space offers, not a business commitment.
SERVICES = [
    (
        "Bouldering walls",
        "Bouldering only — no ropes and no harness needed to get started.",
        "mountain",
        1,
    ),
    (
        "All levels welcome",
        "Routes from a first session to a serious project, V0 to V8.",
        "users",
        2,
    ),
    (
        "Shoe rental",
        "Climbing shoes available to hire at reception while you find your fit.",
        "footprints",
        3,
    ),
    (
        "Training zone",
        "A dedicated training area with boards, bands and pull-up bars.",
        "dumbbell",
        4,
    ),
    ("Changing rooms", "Changing rooms and lockers are available on site.", "shirt", 5),
    (
        "Community sessions",
        "Open sessions and events for first-timers and regulars alike.",
        "sparkles",
        6,
    ),
]

# Draft rules: generic gym-safety guidance that still needs ARCH's approval.
# `is_confirmed` stays False so the site labels them as drafts.
DRAFT_RULES = [
    (
        "Warm up before you set out",
        "Take a few minutes on the easier problems and stretch first.",
        "Safety",
        1,
    ),
    (
        "Climb within your ability",
        "Use the crash pads, keep three points of contact and never climb above your level.",
        "Safety",
        2,
    ),
    (
        "Report damaged holds",
        "Tell a member of staff if a hold, bolt or mat looks damaged.",
        "Safety",
        3,
    ),
    (
        "Leave the mats as you found them",
        "Move holds only when a member of staff asks you to.",
        "Wall",
        4,
    ),
    (
        "Share the wall",
        "Leave room for other climbers and avoid hogging a problem.",
        "Community",
        5,
    ),
    (
        "Shoes off outside the climbing area",
        "Please keep climbing shoes off the rest of the building.",
        "Facility",
        6,
    ),
]

FAQ_ENTRIES = [
    (
        "What does ARCH offer?",
        "ARCH is an indoor bouldering gym in Hanoi. Bouldering means you climb a "
        "short, powerful problem close to the ground, using only the mats — no "
        "ropes and no harness are needed.",
        "About the gym",
        "bouldering indoor gym what is arch climbing",
    ),
    (
        "Do I need climbing experience to visit?",
        "No. Complete beginners are welcome. A member of staff will show you how "
        "the mats, the padding and the grading work, and you can hire shoes at "
        "reception.",
        "Visiting",
        "beginner first time experience needed novice",
    ),
    (
        "What should I wear and bring?",
        "Comfortable clothes you can move in, a water bottle and flat footwear "
        "for the walk in. Climbing shoes can be hired at reception if you do not "
        "have your own.",
        "Visiting",
        "wear clothes bring equipment shoes rental",
    ),
    (
        "How are routes graded?",
        "Routes use the V-scale, from V0 for the easiest problems to V8 and above "
        "for the hardest. The grade is set by the route setter and is shown on "
        "each route.",
        "Climbing",
        "grade v scale difficulty v0 v8 how hard",
    ),
    (
        "How do I record my climbs?",
        "Signed-in members can log climbs in their logbook, and can vote on whether "
        "a route felt easier, exactly as set, or harder than its official grade.",
        "Climbing",
        "logbook record climbs log send project vote",
    ),
    (
        "How does route voting work?",
        "Every member can cast one difficulty vote per route: easier, as set, or "
        "harder. The community feedback is shown alongside the official grade; it "
        "never replaces it.",
        "Climbing",
        "vote voting difficulty perceived grade community",
    ),
    (
        "When is the gym open?",
        "Opening hours are being confirmed by ARCH and will be published here as "
        "soon as they are finalised. The team at reception can also tell you when "
        "we are open.",
        "Visiting",
        "opening hours open time when close schedule",
    ),
    (
        "How much does it cost?",
        "The price list is being confirmed by ARCH. Once it is finalised it will "
        "be published on the prices section of this site.",
        "Prices",
        "price cost membership pass day pass how much",
    ),
    (
        "Do you run courses?",
        "Yes — ARCH runs introductory and progressing courses. The current course "
        "schedule is being confirmed and will be listed on the courses section of "
        "this site.",
        "Courses",
        "course class coaching learn beginner training",
    ),
    (
        "What events do you run?",
        "ARCH runs community sessions and competitions. The published event "
        "calendar is being confirmed and will appear on the events section of "
        "this site.",
        "Events",
        "event competition session tournament calendar",
    ),
    (
        "Is there a safety agreement?",
        "Yes. Every member signs a safety agreement before climbing. The exact "
        "process is being finalised by ARCH, and the front desk will talk you "
        "through it on your first visit.",
        "Membership",
        "safety agreement waiver sign form liability",
    ),
    (
        "How do I contact ARCH?",
        "Use the contact form on this site, or speak to the team at reception "
        "during opening hours. The direct contact details are being confirmed and "
        "will be published here shortly.",
        "Contact",
        "contact email phone address reach get in touch",
    ),
]


def _seed_gym(db: Session) -> None:
    if db.get(GymInfo, 1) is None:
        db.add(GymInfo(id=1, **GYM))
    else:
        info = db.get(GymInfo, 1)
        for key, value in GYM.items():
            setattr(info, key, value)


def _seed_services(db: Session) -> None:
    if db.scalar(select(Service).limit(1)) is not None:
        return
    for title, summary, icon, order in SERVICES:
        db.add(Service(title=title, summary=summary, icon=icon, sort_order=order))


def _seed_rules(db: Session) -> None:
    if db.scalar(select(Rule).limit(1)) is not None:
        return
    for title, body, category, order in DRAFT_RULES:
        db.add(
            Rule(
                title=title,
                body=body,
                category=category,
                sort_order=order,
                is_active=True,
                is_confirmed=False,
            )
        )


def _seed_faq(db: Session) -> None:
    if db.scalar(select(FaqEntry).limit(1)) is not None:
        return
    for question, answer, category, keywords in FAQ_ENTRIES:
        db.add(
            FaqEntry(
                question=question,
                answer=answer,
                category=category,
                keywords=keywords,
                is_published=True,
            )
        )


def _seed_opening_hours(db: Session) -> None:
    """Placeholder hours.

    The rows exist so the schedule can be edited, but every day is marked
    closed and the note says the hours are being confirmed, so the site never
    publishes unconfirmed opening times.
    """
    if db.scalar(select(OpeningHour).limit(1)) is not None:
        return
    for day in range(7):
        db.add(
            OpeningHour(
                day_of_week=day,
                opens_at=time(9, 0),
                closes_at=time(21, 0),
                note="To be confirmed by ARCH",
                is_closed=True,
            )
        )


def _seed_demo(db: Session) -> None:
    """Load clearly-labelled sample data for local development.

    The demo accounts use well-known development passwords, so this refuses to
    run against a production environment.
    """
    from app.config import get_settings, is_production

    if is_production(get_settings().environment):
        raise RuntimeError(
            "Refusing to seed demo accounts with development passwords in a production environment."
        )

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
            wall = Wall(
                name=name,
                description=description,
                sort_order=order,
                image_url=image_url,
            )
            db.add(wall)
        else:
            # The wall already exists, most likely because the migration
            # created it. It still gets the description, the ordering and the
            # photograph it should have.
            wall.description = description
            wall.sort_order = order
            if not wall.image_url:
                wall.image_url = image_url
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


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed the ARCH database")
    parser.add_argument(
        "--demo",
        action="store_true",
        help="Also load clearly-labelled sample routes, products and accounts",
    )
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Roll the schema back to an empty database before seeding",
    )
    args = parser.parse_args()

    _migrate(reset=args.reset)
    print("Database is at the latest migration.")

    session: Session = SessionLocal()
    try:
        _seed_gym(session)
        _seed_services(session)
        _seed_rules(session)
        _seed_faq(session)
        _seed_opening_hours(session)
        if args.demo:
            _seed_demo(session)
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()

    print("Seeded content." + (" (including sample demo data)" if args.demo else ""))


if __name__ == "__main__":
    main()
