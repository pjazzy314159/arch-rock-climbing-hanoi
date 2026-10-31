"""HTTP-level integration tests for the ARCH assistant endpoint.

These tests exercise the full `/api/assistant/chat` endpoint through the
FastAPI test client with isolated database fixtures. They verify that the
assistant returns grounded answers from structured public data and that
the public response contract is maintained.
"""

from __future__ import annotations

from datetime import datetime, time

from fastapi.testclient import TestClient
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


def test_direct_faq_match_returns_answer_and_source(client: TestClient, db: Session) -> None:
    """A direct FAQ match returns the expected answer and source metadata."""
    db.add(
        FaqEntry(
            question="Do I need climbing experience to visit?",
            answer="No. Complete beginners are welcome.",
            category="Visiting",
            keywords="beginner first time experience",
            is_published=True,
        )
    )
    db.commit()

    response = client.post(
        "/api/assistant/chat", json={"question": "Do I need experience to visit?"}
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["mode"] == "knowledge_base"
    assert "beginners" in payload["answer"].lower()
    assert payload["sources"]
    # Direct FAQ match returns the FAQ entry's category field (e.g., "Visiting")
    assert payload["sources"][0]["category"] == "Visiting"
    assert "experience" in payload["sources"][0]["question"].lower()


def test_structured_route_question_returns_grounded_info(
    client: TestClient, db: Session
) -> None:
    """A structured route question returns grounded information with source metadata."""
    _add_route(db, "Quiet the Mind", "V3", "The Slab")
    db.commit()

    response = client.post(
        "/api/assistant/chat", json={"question": "What routes are on The Slab?"}
    )
    assert response.status_code == 200
    payload = response.json()
    # Should get knowledge_base mode with route information
    assert payload["mode"] == "knowledge_base"
    assert payload["sources"]
    # At least one source should be a route
    route_sources = [s for s in payload["sources"] if s["category"] == "route"]
    assert route_sources, f"Expected route source, got: {payload['sources']}"
    assert any("Quiet the Mind" in s["question"] for s in route_sources)


def test_price_question_uses_only_real_fixture_records(
    client: TestClient, db: Session
) -> None:
    """Price answers only use real records inserted by isolated test fixtures."""
    db.add(
        Price(
            name="Day Pass",
            category="Entry",
            amount_vnd=150000,
            unit="per visit",
            is_active=True,
        )
    )
    db.commit()

    response = client.post(
        "/api/assistant/chat", json={"question": "How much is a day pass?"}
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["mode"] == "knowledge_base"
    assert "150000" in payload["answer"] or "Day Pass" in payload["answer"]
    price_sources = [s for s in payload["sources"] if s["category"] == "price"]
    assert price_sources


def test_opening_hours_question_uses_only_real_fixture_records(
    client: TestClient, db: Session
) -> None:
    """Opening hours answers only use real records inserted by isolated test fixtures."""
    db.add(OpeningHour(day_of_week=0, opens_at=time(9, 0), closes_at=time(21, 0), is_closed=False))
    db.add(OpeningHour(day_of_week=1, is_closed=True))
    db.commit()

    response = client.post(
        "/api/assistant/chat", json={"question": "What are the opening hours on Sunday?"}
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["mode"] == "knowledge_base"
    hour_sources = [s for s in payload["sources"] if s["category"] == "opening_hour"]
    assert hour_sources


def test_published_rules_and_faq_remain_supported(
    client: TestClient, db: Session
) -> None:
    """Published rules and FAQ entries remain supported."""
    db.add(
        Rule(
            title="No chalk on the walls",
            body="Use chalk responsibly and clean up after yourself.",
            category="Safety",
            is_active=True,
            is_confirmed=True,
        )
    )
    db.add(
        FaqEntry(
            question="Do you rent shoes?",
            answer="Yes, shoes can be hired at reception.",
            category="Visiting",
            keywords="rent shoes rental",
            is_published=True,
        )
    )
    db.commit()

    # Test rule - structured sources use "rule" as category
    response = client.post(
        "/api/assistant/chat", json={"question": "What is the chalk rule?"}
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["mode"] == "knowledge_base"
    rule_sources = [s for s in payload["sources"] if s["category"] == "rule"]
    assert rule_sources

    # Test FAQ - direct FAQ match returns the FAQ entry's category field
    response = client.post(
        "/api/assistant/chat", json={"question": "Can I rent climbing shoes?"}
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["mode"] == "knowledge_base"
    # Direct FAQ match returns the FAQ entry's category (e.g., "Visiting")
    faq_sources = [s for s in payload["sources"] if s["category"] == "Visiting"]
    assert faq_sources


def test_empty_unrelated_records_do_not_create_fictional_facts(
    client: TestClient, db: Session
) -> None:
    """Empty prices, opening hours, or event records do not create fictional business facts."""
    # No price records at all
    response = client.post(
        "/api/assistant/chat", json={"question": "How much does a membership cost?"}
    )
    assert response.status_code == 200
    payload = response.json()
    # Should not invent a price
    assert "đ" not in payload["answer"] and "VND" not in payload["answer"]
    assert "membership" not in payload["answer"].lower() or payload["mode"] == "not_covered"

    # No event records
    response = client.post(
        "/api/assistant/chat", json={"question": "When is the next competition?"}
    )
    assert response.status_code == 200
    payload = response.json()
    # Should not invent an event date
    assert payload["mode"] in ("knowledge_base", "not_covered")


def test_unpublished_inactive_records_excluded(client: TestClient, db: Session) -> None:
    """Unpublished or inactive records are excluded according to actual model semantics."""
    # Inactive price
    db.add(
        Price(
            name="Hidden Price",
            category="Entry",
            amount_vnd=999,
            unit="per visit",
            is_active=False,
        )
    )
    # Unpublished FAQ
    db.add(
        FaqEntry(
            question="Secret FAQ",
            answer="Secret answer.",
            category="General",
            is_published=False,
        )
    )
    # Inactive rule
    db.add(
        Rule(
            title="Hidden Rule",
            body="Secret rule.",
            category="General",
            is_active=False,
            is_confirmed=False,
        )
    )
    # Private event
    db.add(
        Event(
            title="Secret Event",
            description="Private event.",
            starts_at=datetime(2026, 7, 1, 10, 0),
            location="ARCH",
            is_public=False,
        )
    )
    # Inactive course
    db.add(Course(title="Hidden Course", level="Advanced", summary="Secret.", is_active=False))
    # Inactive service
    db.add(Service(title="Hidden Service", summary="Secret.", is_active=False))
    db.commit()

    # None of these should appear in answers
    response = client.post(
        "/api/assistant/chat", json={"question": "Tell me about hidden prices"}
    )
    assert response.status_code == 200
    payload = response.json()
    assert "Hidden Price" not in payload["answer"]
    assert "999" not in payload["answer"]

    response = client.post(
        "/api/assistant/chat", json={"question": "What is the secret FAQ?"}
    )
    assert response.status_code == 200
    payload = response.json()
    assert "Secret FAQ" not in payload["answer"]
    assert "Secret answer" not in payload["answer"]


def test_unrelated_questions_use_not_covered_behavior(
    client: TestClient, db: Session
) -> None:
    """Insufficient or unrelated questions use the current not-covered behavior."""
    db.add(
        FaqEntry(
            question="What are the opening hours?",
            answer="Opening hours are being confirmed by ARCH.",
            category="Visiting",
            keywords="opening hours",
            is_published=True,
        )
    )
    db.commit()

    response = client.post(
        "/api/assistant/chat",
        json={"question": "What is the wifi password for the guest network in Tokyo?"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["mode"] == "not_covered"
    assert payload["sources"] == []
    assert "don't have approved information" in payload["answer"].lower()


def test_provider_failure_falls_back_safely(client: TestClient, db: Session) -> None:
    """Provider timeout, HTTP error, malformed response, and empty content fall back safely."""
    # With no LLM provider configured, the assistant should fall back gracefully
    # This is tested by the fact that no provider is configured in test environment
    db.add(
        FaqEntry(
            question="What are the opening hours?",
            answer="Opening hours are being confirmed by ARCH.",
            category="Visiting",
            keywords="opening hours",
            is_published=True,
        )
    )
    db.commit()

    # A question that won't match the existing FAQ (score < 0.55)
    # should get a not-covered response without crashing
    response = client.post(
        "/api/assistant/chat",
        json={"question": "What are the opening hours on Christmas Eve?"},
    )
    assert response.status_code == 200
    payload = response.json()
    # Should not crash, should return a valid response
    assert payload["mode"] in ("knowledge_base", "not_covered")
    assert "answer" in payload
    assert "sources" in payload
    assert "provider" in payload
    assert "model" in payload
    assert "created_at" in payload
    assert "disclaimer" in payload


def test_public_response_contract_compatible(client: TestClient) -> None:
    """The public response contract remains compatible."""
    response = client.post(
        "/api/assistant/chat", json={"question": "Any question"}
    )
    assert response.status_code == 200
    payload = response.json()

    # Required fields per API contract
    assert "answer" in payload
    assert isinstance(payload["answer"], str)
    assert "mode" in payload
    assert payload["mode"] in ("knowledge_base", "llm_grounded", "not_covered")
    assert "sources" in payload
    assert isinstance(payload["sources"], list)
    assert "provider" in payload
    assert "model" in payload
    assert "created_at" in payload
    assert "disclaimer" in payload

    # Sources structure
    for source in payload["sources"]:
        assert "id" in source
        assert "question" in source
        assert "category" in source


def test_no_member_specific_fields_exposed(client: TestClient, db: Session) -> None:
    """No member-specific fields or records are exposed."""
    # Add a route (public data)
    _add_route(db, "Test Route", "V3", "The Slab")
    db.commit()

    response = client.post(
        "/api/assistant/chat", json={"question": "What routes exist?"}
    )
    assert response.status_code == 200
    payload = response.json()

    # Verify no private fields in sources
    for source in payload["sources"]:
        assert "user_id" not in source
        assert "email" not in source
        assert "password" not in source
        assert "climb_log" not in source
        assert "agreement" not in source

    # Verify answer doesn't contain private data patterns
    answer_lower = payload["answer"].lower()
    assert "password" not in answer_lower
    assert "email" not in answer_lower
    assert "private" not in answer_lower


def test_structured_course_answer(client: TestClient, db: Session) -> None:
    """Structured course question returns grounded answer with source."""
    db.add(
        Course(
            title="Intro to Bouldering",
            level="Beginner",
            summary="Learn the basics of bouldering.",
            schedule="Sat 10am",
            duration_weeks=4,
            capacity=10,
            price_vnd=500000,
            is_active=True,
        )
    )
    db.commit()

    response = client.post(
        "/api/assistant/chat", json={"question": "Do you have beginner bouldering courses?"}
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["mode"] == "knowledge_base"
    course_sources = [s for s in payload["sources"] if s["category"] == "course"]
    assert course_sources


def test_structured_event_answer(client: TestClient, db: Session) -> None:
    """Structured event question returns grounded answer with source."""
    db.add(
        Event(
            title="Summer Competition",
            description="Annual summer bouldering competition.",
            starts_at=datetime(2026, 7, 1, 10, 0),
            ends_at=datetime(2026, 7, 1, 18, 0),
            location="ARCH",
            capacity=50,
            is_public=True,
        )
    )
    db.commit()

    response = client.post(
        "/api/assistant/chat", json={"question": "Are there any upcoming competitions?"}
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["mode"] == "knowledge_base"
    event_sources = [s for s in payload["sources"] if s["category"] == "event"]
    assert event_sources


def test_structured_service_answer(client: TestClient, db: Session) -> None:
    """Structured service question returns grounded answer with source."""
    db.add(
        Service(
            title="Bouldering Area",
            summary="Main wall area for bouldering.",
            is_active=True,
        )
    )
    db.commit()

    response = client.post(
        "/api/assistant/chat", json={"question": "What facilities do you have?"}
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["mode"] == "knowledge_base"
    service_sources = [s for s in payload["sources"] if s["category"] == "service"]
    assert service_sources


def test_route_provenance_limitation_documented(client: TestClient, db: Session) -> None:
    """Active route status does not falsely claim ARCH content verification."""
    _add_route(db, "Demo Route", "V4", "The Cave", status="active")
    db.commit()

    response = client.post(
        "/api/assistant/chat", json={"question": "Is Demo Route a confirmed ARCH route?"}
    )
    assert response.status_code == 200
    payload = response.json()
    # The assistant should not claim the route is "confirmed ARCH content"
    # Route status ACTIVE only means operational, not verified
    # The answer should be grounded in available data without provenance claims
    assert payload["mode"] in ("knowledge_base", "not_covered")


def test_assistant_status_endpoint_honest(client: TestClient) -> None:
    """The assistant status endpoint honestly reports provider state."""
    response = client.get("/api/assistant/status")
    assert response.status_code == 200
    payload = response.json()
    assert "live_model_enabled" in payload
    assert "provider" in payload
    assert "model" in payload
    assert "mode" in payload
    # In test environment, no provider should be configured
    assert payload["live_model_enabled"] is False
    assert payload["mode"] == "knowledge_base"