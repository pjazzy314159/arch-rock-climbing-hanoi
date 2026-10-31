"""Read-only retrieval of public ARCH information for the assistant.

This module provides a small, explicit set of retrieval functions that gather
relevant public ARCH records (routes, prices, opening hours, rules, FAQ
entries, courses, events, services) based on a question.  Results are
normalised into a single ``RetrievedSource`` representation so the existing
assistant can use them as grounding context without changing its response
contract.

No new database schema is required: every record comes from tables that
already exist and are already exposed by the public API.

Security notes
--------------
* Only publicly visible records are retrieved (active prices, published FAQ,
  public events, etc.).
* No member-specific, staff-internal, or operational data is ever queried.
* Retrieved text fields are treated as *data*, not instructions.  Callers
  must place them in a clearly delimited context block, never in a system
  prompt.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    ClimbRoute,
    Course,
    Event,
    FaqEntry,
    OpeningHour,
    Price,
    RouteStatus,
    Rule,
    Service,
    Wall,
)

# ---------------------------------------------------------------------------
# Tokenization (shared with assistant module)
# ---------------------------------------------------------------------------

_TOKEN_PATTERN = re.compile(r"[a-z0-9à-ỹ]+")


def _stem(token: str) -> str:
    if len(token) > 4 and token.endswith("ies"):
        return token[:-3] + "y"
    if len(token) > 4 and token.endswith("es") and token[-3:-2] in {"s", "x", "z"}:
        return token[:-2]
    if len(token) > 3 and token.endswith("s") and not token.endswith("ss"):
        return token[:-1]
    return token


_STOP_WORDS = {
    "a",
    "an",
    "and",
    "are",
    "at",
    "be",
    "can",
    "do",
    "does",
    "for",
    "how",
    "i",
    "in",
    "is",
    "it",
    "me",
    "much",
    "my",
    "of",
    "on",
    "or",
    "the",
    "to",
    "what",
    "when",
    "where",
    "which",
    "with",
    "you",
    "your",
}


def tokenize(text: str) -> list[str]:
    if not text:
        return []
    tokens = _TOKEN_PATTERN.findall(text.lower())
    return [_stem(token) for token in tokens if token not in _STOP_WORDS and len(token) > 1]


# ---------------------------------------------------------------------------
# Internal representation
# ---------------------------------------------------------------------------


@dataclass
class RetrievedSource:
    """A single piece of public ARCH information retrieved for a question.

    ``category`` identifies the source type so the caller can explain where
    a fact came from.  ``title`` is a short human-readable label.  ``content``
    is the factual text.  ``metadata`` carries structured details (wall, grade,
    status, amount, etc.) that the caller may render or pass to a model.
    ``score`` is the retrieval relevance score (0.0–1.0).
    """

    category: str
    id: int
    title: str
    content: str
    score: float = 0.0
    metadata: dict[str, str] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

#: Maximum number of sources returned per category.
PER_CATEGORY_LIMIT = 5

#: Maximum total sources returned across all categories.
TOTAL_LIMIT = 20


# ---------------------------------------------------------------------------
# Scoring helpers
# ---------------------------------------------------------------------------


def _score_tokens(question_tokens: set[str], text: str) -> float:
    """Score how well a text matches a set of question tokens."""
    if not question_tokens:
        return 0.0
    haystack = set(tokenize(text))
    if not haystack:
        return 0.0
    overlap = question_tokens & haystack
    if not overlap:
        return 0.0
    return len(overlap) / len(question_tokens)


# ---------------------------------------------------------------------------
# Category retrieval functions
# ---------------------------------------------------------------------------


def retrieve_routes(
    db: Session, question: str, limit: int = PER_CATEGORY_LIMIT
) -> list[RetrievedSource]:
    """Retrieve relevant public routes based on the question.

    Only active routes are included.  Filtering by wall name, grade, or status
    is derived from the question tokens.
    """
    tokens = set(tokenize(question))
    statement = select(ClimbRoute).where(ClimbRoute.status == RouteStatus.ACTIVE)
    routes = db.scalars(statement).all()

    # Pre-load walls for metadata.
    wall_map: dict[int, str] = {}
    for wall in db.scalars(select(Wall)).all():
        wall_map[wall.id] = wall.name

    scored: list[tuple[float, ClimbRoute]] = []
    for route in routes:
        wall_name = wall_map.get(route.wall_id, "") if route.wall_id else ""
        text = (
            f"{route.name} {route.grade} {route.status} {wall_name} "
            f"{route.style} {route.setter} {route.beta or ''}"
        )
        score = _score_tokens(tokens, text)
        if score > 0:
            scored.append((score, route))

    scored.sort(key=lambda item: (-item[0], item[1].id))
    results: list[RetrievedSource] = []
    for score, route in scored[:limit]:
        wall_name = wall_map.get(route.wall_id, "Unknown wall") if route.wall_id else "No wall"
        content_parts = [
            f"Route: {route.name}",
            f"Grade: {route.grade}",
            f"Wall: {wall_name}",
            f"Wall type: {route.wall_type.value}",
            f"Status: {route.status.value}",
        ]
        if route.style:
            content_parts.append(f"Style: {route.style}")
        if route.setter:
            content_parts.append(f"Setter: {route.setter}")
        if route.beta:
            content_parts.append(f"Beta: {route.beta}")
        if route.set_at:
            content_parts.append(f"Set on: {route.set_at.isoformat()}")

        metadata: dict[str, str] = {
            "grade": route.grade,
            "wall": wall_name,
            "wall_type": route.wall_type.value,
            "status": route.status.value,
        }
        if route.wall_id:
            metadata["wall_id"] = str(route.wall_id)

        results.append(
            RetrievedSource(
                category="route",
                id=route.id,
                title=f"{route.name} ({route.grade})",
                content="\n".join(content_parts),
                score=score,
                metadata=metadata,
            )
        )
    return results


def retrieve_prices(
    db: Session, question: str, limit: int = PER_CATEGORY_LIMIT
) -> list[RetrievedSource]:
    """Retrieve relevant active prices."""
    tokens = set(tokenize(question))
    prices = db.scalars(
        select(Price).where(Price.is_active.is_(True)).order_by(Price.sort_order, Price.id)
    ).all()

    scored: list[tuple[float, Price]] = []
    for price in prices:
        text = f"{price.name} {price.category} {price.description} {price.unit}"
        score = _score_tokens(tokens, text)
        if score > 0:
            scored.append((score, price))

    # If no token match, return all active prices when the question mentions pricing.
    if not scored and any(
        t in tokens for t in {"price", "cost", "pass", "member", "fee", "how", "much"}
    ):
        scored = [(0.1, price) for price in prices]

    scored.sort(key=lambda item: (-item[0], item[1].id))
    results: list[RetrievedSource] = []
    for score, price in scored[:limit]:
        content_parts = [
            f"Price: {price.name}",
            f"Category: {price.category}",
            f"Amount: {price.amount_vnd} VND",
        ]
        if price.unit:
            content_parts.append(f"Unit: {price.unit}")
        if price.description:
            content_parts.append(f"Description: {price.description}")

        results.append(
            RetrievedSource(
                category="price",
                id=price.id,
                title=f"{price.name} — {price.amount_vnd} VND",
                content="\n".join(content_parts),
                score=score,
                metadata={
                    "category": price.category,
                    "amount_vnd": str(price.amount_vnd),
                    "unit": price.unit,
                },
            )
        )
    return results


def retrieve_opening_hours(
    db: Session, question: str, limit: int = PER_CATEGORY_LIMIT
) -> list[RetrievedSource]:
    """Retrieve opening hours. All entries are public."""
    tokens = set(tokenize(question))
    hours = db.scalars(select(OpeningHour).order_by(OpeningHour.day_of_week)).all()

    # Opening hours are few; include them when the question mentions time/opening.
    if not any(t in tokens for t in {"open", "hour", "time", "when", "close", "schedule"}):
        return []

    results: list[RetrievedSource] = []
    for hour in hours[:limit]:
        if hour.is_closed:
            content = f"Day {hour.day_of_week}: Closed"
        else:
            opens = hour.opens_at.isoformat() if hour.opens_at else "unknown"
            closes = hour.closes_at.isoformat() if hour.closes_at else "unknown"
            content = f"Day {hour.day_of_week}: {opens} – {closes}"
        if hour.note:
            content += f" ({hour.note})"

        results.append(
            RetrievedSource(
                category="opening_hour",
                id=hour.id,
                title=f"Opening hours — day {hour.day_of_week}",
                content=content,
                score=0.1,
                metadata={"day_of_week": str(hour.day_of_week), "is_closed": str(hour.is_closed)},
            )
        )
    return results


def retrieve_rules(
    db: Session, question: str, limit: int = PER_CATEGORY_LIMIT
) -> list[RetrievedSource]:
    """Retrieve relevant active rules."""
    tokens = set(tokenize(question))
    rules = db.scalars(
        select(Rule).where(Rule.is_active.is_(True)).order_by(Rule.sort_order, Rule.id)
    ).all()

    scored: list[tuple[float, Rule]] = []
    for rule in rules:
        text = f"{rule.title} {rule.body} {rule.category}"
        score = _score_tokens(tokens, text)
        if score > 0:
            scored.append((score, rule))

    # If the question mentions rules/policy, include all active rules.
    if not scored and any(
        t in tokens for t in {"rule", "policy", "allowed", "can", "must", "should"}
    ):
        scored = [(0.1, rule) for rule in rules]

    scored.sort(key=lambda item: (-item[0], item[1].id))
    results: list[RetrievedSource] = []
    for score, rule in scored[:limit]:
        content_parts = [f"Rule: {rule.title}"]
        if rule.body:
            content_parts.append(rule.body)
        if not rule.is_confirmed:
            content_parts.append("(Draft — awaiting ARCH confirmation)")

        results.append(
            RetrievedSource(
                category="rule",
                id=rule.id,
                title=rule.title,
                content="\n".join(content_parts),
                score=score,
                metadata={
                    "category": rule.category,
                    "is_confirmed": str(rule.is_confirmed),
                },
            )
        )
    return results


def retrieve_faq(
    db: Session, question: str, limit: int = PER_CATEGORY_LIMIT
) -> list[RetrievedSource]:
    """Retrieve relevant published FAQ entries (existing assistant knowledge base)."""
    tokens = set(tokenize(question))
    entries = db.scalars(
        select(FaqEntry).where(FaqEntry.is_published.is_(True)).order_by(FaqEntry.id)
    ).all()

    scored: list[tuple[float, FaqEntry]] = []
    for entry in entries:
        text = f"{entry.question} {entry.answer} {entry.keywords} {entry.category}"
        score = _score_tokens(tokens, text)
        if score > 0:
            scored.append((score, entry))

    scored.sort(key=lambda item: (-item[0], item[1].id))
    results: list[RetrievedSource] = []
    for score, entry in scored[:limit]:
        results.append(
            RetrievedSource(
                category="faq",
                id=entry.id,
                title=entry.question,
                content=f"Q: {entry.question}\nA: {entry.answer}",
                score=score,
                metadata={"category": entry.category},
            )
        )
    return results


def retrieve_courses(
    db: Session, question: str, limit: int = PER_CATEGORY_LIMIT
) -> list[RetrievedSource]:
    """Retrieve relevant active courses."""
    tokens = set(tokenize(question))
    courses = db.scalars(select(Course).where(Course.is_active.is_(True)).order_by(Course.id)).all()

    scored: list[tuple[float, Course]] = []
    for course in courses:
        text = (
            f"{course.title} {course.level} {course.summary} "
            f"{course.description} {course.instructor} {course.schedule}"
        )
        score = _score_tokens(tokens, text)
        if score > 0:
            scored.append((score, course))

    # If the question mentions courses/coaching, include all active courses.
    if not scored and any(
        t in tokens for t in {"course", "coaching", "class", "learn", "training", "programme"}
    ):
        scored = [(0.1, course) for course in courses]

    scored.sort(key=lambda item: (-item[0], item[1].id))
    results: list[RetrievedSource] = []
    for score, course in scored[:limit]:
        content_parts = [f"Course: {course.title}"]
        if course.level:
            content_parts.append(f"Level: {course.level}")
        if course.summary:
            content_parts.append(f"Summary: {course.summary}")
        if course.schedule:
            content_parts.append(f"Schedule: {course.schedule}")
        if course.duration_weeks:
            content_parts.append(f"Duration: {course.duration_weeks} weeks")
        if course.capacity:
            content_parts.append(f"Capacity: {course.capacity}")
        if course.price_vnd:
            content_parts.append(f"Price: {course.price_vnd} VND")
        if course.instructor:
            content_parts.append(f"Instructor: {course.instructor}")

        results.append(
            RetrievedSource(
                category="course",
                id=course.id,
                title=course.title,
                content="\n".join(content_parts),
                score=score,
                metadata={
                    "level": course.level,
                    "schedule": course.schedule,
                },
            )
        )
    return results


def retrieve_events(
    db: Session, question: str, limit: int = PER_CATEGORY_LIMIT
) -> list[RetrievedSource]:
    """Retrieve relevant public events."""
    tokens = set(tokenize(question))
    events = db.scalars(
        select(Event).where(Event.is_public.is_(True)).order_by(Event.starts_at)
    ).all()

    scored: list[tuple[float, Event]] = []
    for event in events:
        text = f"{event.title} {event.description} {event.location}"
        score = _score_tokens(tokens, text)
        if score > 0:
            scored.append((score, event))

    # If the question mentions events, include upcoming public events.
    if not scored and any(t in tokens for t in {"event", "competition", "workshop", "community"}):
        scored = [(0.1, event) for event in events]

    scored.sort(key=lambda item: (-item[0], item[1].id))
    results: list[RetrievedSource] = []
    for score, event in scored[:limit]:
        content_parts = [f"Event: {event.title}"]
        if event.description:
            content_parts.append(f"Description: {event.description}")
        content_parts.append(f"Starts: {event.starts_at.isoformat()}")
        if event.ends_at:
            content_parts.append(f"Ends: {event.ends_at.isoformat()}")
        if event.location:
            content_parts.append(f"Location: {event.location}")
        if event.capacity:
            content_parts.append(f"Capacity: {event.capacity}")

        results.append(
            RetrievedSource(
                category="event",
                id=event.id,
                title=event.title,
                content="\n".join(content_parts),
                score=score,
                metadata={
                    "starts_at": event.starts_at.isoformat(),
                    "location": event.location,
                },
            )
        )
    return results


def retrieve_services(
    db: Session, question: str, limit: int = PER_CATEGORY_LIMIT
) -> list[RetrievedSource]:
    """Retrieve relevant active services."""
    tokens = set(tokenize(question))
    services = db.scalars(
        select(Service).where(Service.is_active.is_(True)).order_by(Service.sort_order, Service.id)
    ).all()

    scored: list[tuple[float, Service]] = []
    for service in services:
        text = f"{service.title} {service.summary}"
        score = _score_tokens(tokens, text)
        if score > 0:
            scored.append((score, service))

    # If the question mentions services/facilities, include all active services.
    if not scored and any(
        t in tokens
        for t in {"service", "facility", "boulder", "coaching", "training", "what", "offer"}
    ):
        scored = [(0.1, service) for service in services]

    scored.sort(key=lambda item: (-item[0], item[1].id))
    results: list[RetrievedSource] = []
    for score, service in scored[:limit]:
        content_parts = [f"Service: {service.title}"]
        if service.summary:
            content_parts.append(f"Summary: {service.summary}")

        results.append(
            RetrievedSource(
                category="service",
                id=service.id,
                title=service.title,
                content="\n".join(content_parts),
                score=score,
                metadata={"icon": service.icon},
            )
        )
    return results


# ---------------------------------------------------------------------------
# Unified retrieval
# ---------------------------------------------------------------------------


def retrieve_public_context(
    db: Session,
    question: str,
    *,
    limit_per_category: int = PER_CATEGORY_LIMIT,
    total_limit: int = TOTAL_LIMIT,
) -> list[RetrievedSource]:
    """Retrieve relevant public ARCH information for a question.

    Queries all public data categories and returns a bounded, de-duplicated
    list of ``RetrievedSource`` objects.  The list is ordered by category
    priority (FAQ first, then routes, prices, etc.) and then by relevance
    within each category.

    This function is read-only and never mutates the database.
    """
    all_sources: list[RetrievedSource] = []

    # FAQ first (existing knowledge base).
    all_sources.extend(retrieve_faq(db, question, limit_per_category))
    all_sources.extend(retrieve_routes(db, question, limit_per_category))
    all_sources.extend(retrieve_prices(db, question, limit_per_category))
    all_sources.extend(retrieve_opening_hours(db, question, limit_per_category))
    all_sources.extend(retrieve_rules(db, question, limit_per_category))
    all_sources.extend(retrieve_courses(db, question, limit_per_category))
    all_sources.extend(retrieve_events(db, question, limit_per_category))
    all_sources.extend(retrieve_services(db, question, limit_per_category))

    # Bound total results.
    return all_sources[:total_limit]


def build_context_text(sources: list[RetrievedSource]) -> str:
    """Render retrieved sources as grounding text for a model.

    Retrieved text fields are treated as *data*, not instructions.  The caller
    must place this text in a clearly delimited context block, never in a
    system prompt.
    """
    if not sources:
        return ""
    blocks: list[str] = []
    for source in sources:
        blocks.append(f"[{source.category.upper()}] {source.title}\n{source.content}")
    return "\n\n".join(blocks)


def build_sources_list(sources: list[RetrievedSource]) -> list[dict[str, Any]]:
    """Convert retrieved sources to the existing AssistantSource-compatible format.

    This allows the expanded retrieval to be used with the existing response
    schema without changing the API contract.
    """
    return [
        {
            "id": source.id,
            "question": source.title,
            "category": source.category,
        }
        for source in sources
    ]
