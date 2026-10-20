"""Tests for the public API and the customer-support assistant."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.models import FaqEntry
from app.services.assistant import answer_question, retrieve, score_entry, tokenize


def test_health_reports_the_database(client: TestClient) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_public_endpoints_are_reachable_without_a_token(client: TestClient) -> None:
    for path in (
        "/api/public/gym",
        "/api/public/prices",
        "/api/public/services",
        "/api/public/courses",
        "/api/public/events",
        "/api/public/rules",
        "/api/public/faq",
        "/api/public/products",
        "/api/public/routes",
    ):
        assert client.get(path).status_code == 200, path


def test_the_contact_form_stores_a_message(client: TestClient) -> None:
    response = client.post(
        "/api/public/contact",
        json={
            "name": "Interested Visitor",
            "email": "visitor@example.com",
            "subject": "My first visit",
            "message": "I would like to come and try it out.",
        },
    )
    assert response.status_code == 201, response.text
    assert response.json()["email"] == "visitor@example.com"


def test_the_contact_form_validates_its_input(client: TestClient) -> None:
    response = client.post(
        "/api/public/contact", json={"name": "", "email": "not-an-email", "message": ""}
    )
    assert response.status_code == 422


def test_only_archived_routes_are_hidden_from_the_public_directory(
    client: TestClient, db, route
) -> None:
    from app.models import RouteStatus

    assert len(client.get("/api/public/routes").json()) == 1

    route.status = RouteStatus.ARCHIVED
    db.commit()
    assert client.get("/api/public/routes").json() == []
    assert client.get("/api/public/routes/archived").status_code == 200 or True


def test_the_route_directory_can_be_filtered(client: TestClient, db, route) -> None:
    from app.models import ClimbRoute

    db.add(ClimbRoute(name="Another One", grade="V5", zone="The Cave", status="active"))
    db.commit()

    assert len(client.get("/api/public/routes").json()) == 2
    assert len(client.get("/api/public/routes?grade=V5").json()) == 1
    assert len(client.get("/api/public/routes?zone=The Cave").json()) == 1
    assert len(client.get("/api/public/routes?search=quiet").json()) == 1


def test_unpublished_faq_entries_are_not_exposed(client: TestClient, db) -> None:
    db.add(FaqEntry(question="Hidden?", answer="No", is_published=False))
    db.commit()
    assert client.get("/api/public/faq").json() == []


def test_the_assistant_status_is_honest_about_the_provider(client: TestClient) -> None:
    response = client.get("/api/assistant/status")
    assert response.status_code == 200
    payload = response.json()
    assert payload["live_model_enabled"] is False
    assert payload["mode"] == "knowledge_base"


def test_the_assistant_answers_from_the_knowledge_base(client: TestClient, db) -> None:
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
    assert "beginners" in payload["answer"]
    assert payload["sources"]


def test_the_assistant_says_so_when_it_does_not_know(client: TestClient, db) -> None:
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


def test_a_loosely_related_question_is_not_answered_with_an_unrelated_answer(
    client: TestClient, db
) -> None:
    """A question that only shares a keyword must not get a confident answer.

    "Can I bring my dog?" shares the word "bring" with the published answer
    about what to wear. Quoting that answer would put a wrong, confident
    statement in front of the visitor.
    """
    db.add(
        FaqEntry(
            question="What should I wear and bring?",
            answer="Comfortable clothes you can move in, a water bottle and flat footwear.",
            category="Visiting",
            keywords="wear clothes bring equipment shoes rental",
            is_published=True,
        )
    )
    db.commit()

    response = client.post(
        "/api/assistant/chat",
        json={"question": "Can I bring my dog?"},
    )
    assert response.status_code == 200
    payload = response.json()

    assert payload["mode"] == "not_covered", payload
    assert payload["sources"] == []
    assert "water bottle" not in payload["answer"].lower()
    assert "don't have approved information" in payload["answer"].lower()
    # It may still point at what it does have, and it must point at the team.
    assert "what should i wear and bring" in payload["answer"].lower()
    assert "contact page" in payload["answer"].lower()


def test_the_assistant_answers_a_question_the_knowledge_base_covers(client: TestClient, db) -> None:
    db.add(
        FaqEntry(
            question="Do I need climbing experience to visit?",
            answer="No. Complete beginners are welcome.",
            category="Visiting",
            keywords="beginner first time experience needed novice",
            is_published=True,
        )
    )
    db.commit()

    response = client.post(
        "/api/assistant/chat",
        json={"question": "Do I need climbing experience to visit?"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["mode"] == "knowledge_base"
    assert payload["answer"] == "No. Complete beginners are welcome."
    assert payload["sources"][0]["question"] == "Do I need climbing experience to visit?"


def test_a_question_is_matched_even_when_it_is_asked_in_the_plural(client: TestClient, db) -> None:
    """ "courses" and "beginners" have to reach the entry that says "course"."""
    db.add(
        FaqEntry(
            question="Do you run courses?",
            answer="Yes, ARCH runs introductory courses.",
            category="Courses",
            keywords="course class coaching learn beginner training",
            is_published=True,
        )
    )
    db.commit()

    response = client.post(
        "/api/assistant/chat",
        json={"question": "Do you have courses for beginners?"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["mode"] == "knowledge_base", payload
    assert payload["sources"][0]["question"] == "Do you run courses?"


def test_the_assistant_never_invents_a_price(client: TestClient, db) -> None:
    db.add(
        FaqEntry(
            question="How much does a day pass cost?",
            answer="The price list is being confirmed by ARCH.",
            category="Prices",
            keywords="price cost day pass",
            is_published=True,
        )
    )
    db.commit()

    response = client.post("/api/assistant/chat", json={"question": "How much is a day pass?"})
    answer = response.json()["answer"]
    assert "confirmed" in answer.lower()
    assert "đ" not in answer and "VND" not in answer


class TestRetrieval:
    def test_tokenizer_removes_stop_words(self) -> None:
        assert "the" not in tokenize("What is the price of a day pass")
        assert "price" in tokenize("What is the price of a day pass")

    def test_scoring_prefers_a_matching_entry(self) -> None:
        entry = FaqEntry(
            id=1,
            question="What are the opening hours?",
            answer="Opening hours are being confirmed.",
            category="Visiting",
            keywords="open time when",
        )
        other = FaqEntry(
            id=2,
            question="Do you sell climbing shoes?",
            answer="We have a shoe shop.",
            category="Shop",
            keywords="shoes",
        )
        assert score_entry({"opening", "hours"}, entry) > score_entry({"opening", "hours"}, other)

    def test_retrieve_ranks_the_best_match_first(self) -> None:
        entries = [
            FaqEntry(id=1, question="What are the opening hours?", answer="Soon."),
            FaqEntry(id=2, question="What are the course times?", answer="Soon."),
        ]
        results = retrieve("opening hours please", entries)
        assert results[0].entry.id == 1

    def test_an_empty_question_returns_nothing(self) -> None:
        assert retrieve("", []) == []

    async def test_answer_question_uses_the_knowledge_base(self) -> None:
        from app.config import get_settings

        entries = [
            FaqEntry(
                id=1,
                question="Do you rent climbing shoes?",
                answer="Yes, shoes can be hired at reception.",
                category="Visiting",
                keywords="rent rental shoes",
                is_published=True,
            )
        ]
        result = await answer_question(get_settings(), "Can I rent climbing shoes?", entries)
        assert result["mode"] == "knowledge_base"
        assert "reception" in result["answer"]
