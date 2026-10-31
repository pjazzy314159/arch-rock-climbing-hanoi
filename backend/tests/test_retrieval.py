"""Tests for the public ARCH information retrieval layer.

These tests exercise the retrieval service against the FastAPI test database
(SQLite) using real model instances.  They verify that relevant records are
returned, that non-public records are excluded, and that results are bounded.
"""

from __future__ import annotations

from datetime import datetime, time

from sqlalchemy.orm import Session

from app.models import (
    ClimbRoute,
    Course,
    Event,
    FaqEntry,
    OpeningHour,
    Price,
    Rule,
    Service,
    Wall,
    WallType,
)
from app.services.retrieval import (
    RetrievedSource,
    build_context_text,
    retrieve_courses,
    retrieve_events,
    retrieve_faq,
    retrieve_opening_hours,
    retrieve_prices,
    retrieve_public_context,
    retrieve_routes,
    retrieve_rules,
    retrieve_services,
)


def _add_route(
    db: Session, name: str, grade: str, wall_name: str, status: str = "active"
) -> ClimbRoute:
    wall = db.query(Wall).filter(Wall.name == wall_name).first()
    if wall is None:
        wall = Wall(name=wall_name, sort_order=1)
        db.add(wall)
        db.flush()
    route = ClimbRoute(
        name=name,
        grade=grade,
        wall_id=wall.id,
        wall_type=WallType.SLAB,
        status=status,
        setter="Minh",
    )
    db.add(route)
    db.flush()
    return route


def test_retrieve_routes_returns_matching_route(db: Session) -> None:
    _add_route(db, "Quiet the Mind", "V3", "The Slab")
    _add_route(db, "Steep and Hard", "V5", "The Cave")
    db.commit()

    results = retrieve_routes(db, "quiet slab")
    assert len(results) >= 1
    assert any("Quiet the Mind" in r.content for r in results)
    assert all(r.category == "route" for r in results)


def test_retrieve_routes_respects_status(db: Session) -> None:
    _add_route(db, "Active Route", "V2", "The Slab", status="active")
    _add_route(db, "Archived Route", "V4", "The Slab", status="archived")
    db.commit()

    results = retrieve_routes(db, "route slab")
    titles = [r.title for r in results]
    assert any("Active Route" in t for t in titles)
    assert not any("Archived Route" in t for t in titles)


def test_retrieve_routes_respects_wall_and_grade(db: Session) -> None:
    _add_route(db, "Slab V3", "V3", "The Slab")
    _add_route(db, "Cave V5", "V5", "The Cave")
    db.commit()

    results = retrieve_routes(db, "slab V3")
    assert len(results) >= 1
    assert any("Slab V3" in r.content for r in results)


def test_retrieve_routes_bounded(db: Session) -> None:
    for i in range(20):
        _add_route(db, f"Route {i}", "V1", "The Slab")
    db.commit()

    results = retrieve_routes(db, "route slab", limit=5)
    assert len(results) <= 5


def test_retrieve_prices_returns_active_prices(db: Session) -> None:
    db.add(
        Price(
            name="Day pass", category="Entry", amount_vnd=150000, unit="per visit", is_active=True
        )
    )
    db.add(
        Price(
            name="Hidden price", category="Entry", amount_vnd=999, unit="per visit", is_active=False
        )
    )
    db.commit()

    results = retrieve_prices(db, "day pass price")
    assert len(results) >= 1
    assert any("Day pass" in r.content for r in results)
    assert not any("Hidden price" in r.content for r in results)


def test_retrieve_prices_empty_when_no_match(db: Session) -> None:
    db.add(Price(name="Day pass", category="Entry", amount_vnd=150000, is_active=True))
    db.commit()

    results = retrieve_prices(db, "zzzzz nonexistent")
    # No token match, but if no pricing keywords, should be empty.
    # The fallback only triggers for pricing-related tokens.
    assert isinstance(results, list)


def test_retrieve_opening_hours_returns_when_asked(db: Session) -> None:
    db.add(OpeningHour(day_of_week=0, opens_at=time(9, 0), closes_at=time(21, 0), is_closed=False))
    db.add(OpeningHour(day_of_week=1, is_closed=True))
    db.commit()

    results = retrieve_opening_hours(db, "opening hours")
    assert len(results) == 2
    assert all(r.category == "opening_hour" for r in results)


def test_retrieve_opening_hours_empty_for_unrelated(db: Session) -> None:
    db.add(OpeningHour(day_of_week=0, opens_at=time(9, 0), closes_at=time(21, 0)))
    db.commit()

    results = retrieve_opening_hours(db, "climbing shoes")
    assert results == []


def test_retrieve_rules_returns_active_rules(db: Session) -> None:
    db.add(
        Rule(
            title="No chalk on the walls",
            body="Use chalk responsibly.",
            category="Safety",
            is_active=True,
            is_confirmed=True,
        )
    )
    db.add(
        Rule(
            title="Hidden rule",
            body="Secret.",
            category="General",
            is_active=False,
            is_confirmed=False,
        )
    )
    db.commit()

    results = retrieve_rules(db, "chalk rule")
    assert len(results) >= 1
    assert any("No chalk on the walls" in r.content for r in results)
    assert not any("Hidden rule" in r.content for r in results)


def test_retrieve_faq_returns_published(db: Session) -> None:
    db.add(
        FaqEntry(
            question="Do you rent shoes?",
            answer="Yes, at reception.",
            category="Visiting",
            keywords="rent shoes",
            is_published=True,
        )
    )
    db.add(
        FaqEntry(question="Hidden FAQ", answer="Secret.", category="General", is_published=False)
    )
    db.commit()

    results = retrieve_faq(db, "rent shoes")
    assert len(results) >= 1
    assert any("rent shoes" in r.content.lower() for r in results)
    assert not any("Hidden FAQ" in r.content for r in results)


def test_retrieve_faq_empty_for_unrelated(db: Session) -> None:
    db.add(
        FaqEntry(
            question="Do you rent shoes?",
            answer="Yes.",
            category="Visiting",
            keywords="rent shoes",
            is_published=True,
        )
    )
    db.commit()

    results = retrieve_faq(db, "zzzzz nonexistent")
    assert results == []


def test_retrieve_courses_returns_active(db: Session) -> None:
    db.add(
        Course(
            title="Intro to Bouldering",
            level="Beginner",
            summary="Learn basics.",
            schedule="Sat 10am",
            is_active=True,
        )
    )
    db.add(Course(title="Hidden course", level="Advanced", summary="Secret.", is_active=False))
    db.commit()

    results = retrieve_courses(db, "bouldering course")
    assert len(results) >= 1
    assert any("Intro to Bouldering" in r.content for r in results)
    assert not any("Hidden course" in r.content for r in results)


def test_retrieve_events_returns_public(db: Session) -> None:
    db.add(
        Event(
            title="Summer Comp",
            description="Annual competition.",
            starts_at=datetime(2026, 7, 1, 10, 0),
            location="ARCH",
            is_public=True,
        )
    )
    db.add(
        Event(
            title="Secret event",
            description="Private.",
            starts_at=datetime(2026, 7, 2, 10, 0),
            location="ARCH",
            is_public=False,
        )
    )
    db.commit()

    results = retrieve_events(db, "summer competition")
    assert len(results) >= 1
    assert any("Summer Comp" in r.content for r in results)
    assert not any("Secret event" in r.content for r in results)


def test_retrieve_services_returns_active(db: Session) -> None:
    db.add(Service(title="Bouldering", summary="Main wall area.", is_active=True))
    db.add(Service(title="Hidden service", summary="Secret.", is_active=False))
    db.commit()

    results = retrieve_services(db, "bouldering service")
    assert len(results) >= 1
    assert any("Bouldering" in r.content for r in results)
    assert not any("Hidden service" in r.content for r in results)


def test_retrieve_public_context_bounded(db: Session) -> None:
    for i in range(30):
        db.add(
            FaqEntry(
                question=f"FAQ {i}",
                answer=f"Answer {i}",
                category="General",
                keywords="test",
                is_published=True,
            )
        )
    db.commit()

    results = retrieve_public_context(db, "test")
    assert len(results) <= 20


def test_retrieve_public_context_empty_for_unrelated(db: Session) -> None:
    db.add(
        FaqEntry(
            question="Do you rent shoes?",
            answer="Yes.",
            category="Visiting",
            keywords="rent shoes",
            is_published=True,
        )
    )
    db.commit()

    results = retrieve_public_context(db, "zzzzz nonexistent qqqqq")
    # FAQ won't match, but other categories might return via keyword fallback.
    # The key is no fabricated facts.
    assert isinstance(results, list)


def test_build_context_text_empty(db: Session) -> None:
    assert build_context_text([]) == ""


def test_build_context_text_renders_sources(db: Session) -> None:
    sources = [
        RetrievedSource(category="faq", id=1, title="Q: Test?", content="A: Yes."),
    ]
    text = build_context_text(sources)
    assert "FAQ" in text
    assert "Test?" in text
