"""Customer-support assistant.

The assistant is grounded in ARCH's approved information. Two execution modes
exist:

* **Retrieval only** (default) - the question is matched against the published
  knowledge base and the matching answer is returned verbatim.
* **Grounded generation** - when a provider is configured, the matched
  knowledge-base entries are handed to the model together with the question,
  and the model is instructed to answer only from that material.

No provider credentials ever reach the browser, and no answer is invented: if
the knowledge base does not cover the question the assistant says so.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import UTC, datetime

import httpx

from app.config import Settings
from app.models import FaqEntry

_TOKEN_PATTERN = re.compile(r"[a-z0-9à-ỹ]+")

#: Minimum retrieval score for an entry to be treated as a direct answer.
DIRECT_MATCH_THRESHOLD = 0.55

#: Minimum retrieval score for an entry to be included as grounding context.
CONTEXT_MATCH_THRESHOLD = 0.15

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

NOT_COVERED_TEMPLATE = (
    "I don't have approved information about that yet, so I don't want to guess. "
    "The team at ARCH can answer properly — you can reach them through the "
    "contact page on this site, or ask at the front desk during opening hours."
)

SCOPE_TEMPLATE = (
    "Right now I can answer questions about: {topics}. For anything else, the ARCH team can help."
)


@dataclass
class RetrievedEntry:
    """A knowledge-base entry with its retrieval score."""

    entry: FaqEntry
    score: float


def tokenize(text: str) -> list[str]:
    """Split text into lowercase tokens with stop words removed."""
    if not text:
        return []
    tokens = _TOKEN_PATTERN.findall(text.lower())
    return [token for token in tokens if token not in _STOP_WORDS and len(token) > 1]


def score_entry(question_tokens: set[str], entry: FaqEntry) -> float:
    """Score how well a knowledge-base entry matches a question.

    The score is the fraction of the question's meaningful tokens that appear
    in the entry's question, answer or keywords.
    """
    if not question_tokens:
        return 0.0
    haystack = set(tokenize(f"{entry.question} {entry.answer} {entry.keywords} {entry.category}"))
    if not haystack:
        return 0.0
    overlap = question_tokens & haystack
    if not overlap:
        return 0.0
    return len(overlap) / len(question_tokens)


def retrieve(question: str, entries: list[FaqEntry]) -> list[RetrievedEntry]:
    """Rank knowledge-base entries against a question."""
    tokens = set(tokenize(question))
    if not tokens:
        return []
    scored = [RetrievedEntry(entry=entry, score=score_entry(tokens, entry)) for entry in entries]
    scored = [item for item in scored if item.score > 0]
    scored.sort(key=lambda item: (-item.score, item.entry.id))
    return scored


def _topics(entries: list[FaqEntry]) -> str:
    categories: list[str] = []
    for entry in entries:
        if entry.category and entry.category not in categories:
            categories.append(entry.category)
    if not categories:
        return "gym services, rules, courses and events"
    return ", ".join(categories[:8])


def build_grounding_context(entries: list[RetrievedEntry], limit: int = 5) -> str:
    """Render the retrieved entries as grounding material for a model."""
    if not entries:
        return ""
    blocks = []
    for item in entries[:limit]:
        blocks.append(f"Q: {item.entry.question}\nA: {item.entry.answer}")
    return "\n\n".join(blocks)


async def call_provider(
    settings: Settings, question: str, context: str
) -> tuple[str | None, str | None, str | None]:
    """Call the configured LLM provider.

    Returns ``(answer, provider, model)``. ``answer`` is ``None`` when the
    provider is unavailable or the call failed, in which case the caller falls
    back to a transparent "not covered" reply.
    """
    if not settings.llm_enabled:
        return None, None, None

    provider = settings.llm_provider.strip().lower()
    system_prompt = (
        "You are the customer-support assistant for ARCH Rock Climbing Hanoi. "
        "Answer only from the approved information supplied below. "
        "If the information does not cover the question, say that you do not have "
        "that information and suggest contacting the ARCH team. "
        "Never invent prices, opening hours, policies, schedules or bookings. "
        "Keep the answer under 120 words."
    )
    user_prompt = f"Approved information:\n\n{context}\n\nQuestion: {question}"

    try:
        async with httpx.AsyncClient(timeout=settings.llm_timeout_seconds) as client:
            if provider in {"groq", "openai", "openai-compatible"}:
                url = (
                    "https://api.groq.com/openai/v1/chat/completions"
                    if provider == "groq"
                    else "https://api.openai.com/v1/chat/completions"
                )
                response = await client.post(
                    url,
                    headers={
                        "Authorization": f"Bearer {settings.llm_api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": settings.llm_model,
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_prompt},
                        ],
                        "temperature": 0.2,
                        "max_tokens": 400,
                    },
                )
                response.raise_for_status()
                payload = response.json()
                answer = payload["choices"][0]["message"]["content"]
                return answer.strip(), provider, settings.llm_model

            if provider in {"google", "gemini"}:
                url = (
                    "https://generativelanguage.googleapis.com/v1beta/models/"
                    f"{settings.llm_model}:generateContent"
                )
                response = await client.post(
                    url,
                    params={"key": settings.llm_api_key},
                    json={
                        "system_instruction": {"parts": [{"text": system_prompt}]},
                        "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
                        "generationConfig": {"temperature": 0.2, "maxOutputTokens": 400},
                    },
                )
                response.raise_for_status()
                payload = response.json()
                candidates = payload.get("candidates") or []
                if not candidates:
                    return None, None, None
                answer = candidates[0]["content"]["parts"][0]["text"]
                return answer.strip(), provider, settings.llm_model
    except (httpx.HTTPError, KeyError, IndexError, ValueError):
        return None, None, None

    return None, None, None


async def answer_question(settings: Settings, question: str, entries: list[FaqEntry]) -> dict:
    """Answer a customer question using only approved ARCH information."""
    now = datetime.now(UTC)
    retrieved = retrieve(question, entries)
    direct = next((item for item in retrieved if item.score >= DIRECT_MATCH_THRESHOLD), None)

    if direct is not None:
        return {
            "answer": direct.entry.answer,
            "mode": "knowledge_base",
            "sources": [
                {
                    "id": direct.entry.id,
                    "question": direct.entry.question,
                    "category": direct.entry.category,
                }
            ],
            "provider": None,
            "model": None,
            "created_at": now,
        }

    context_entries = [item for item in retrieved if item.score >= CONTEXT_MATCH_THRESHOLD][:5]
    context = build_grounding_context(context_entries)

    if context and settings.llm_enabled:
        answer, provider, model = await call_provider(settings, question, context)
        if answer:
            return {
                "answer": answer,
                "mode": "llm_grounded",
                "sources": [
                    {
                        "id": item.entry.id,
                        "question": item.entry.question,
                        "category": item.entry.category,
                    }
                    for item in context_entries
                ],
                "provider": provider,
                "model": model,
                "created_at": now,
            }

    if context:
        # We have related information but no confident answer. Return the closest
        # entry's answer and label it as coming from the knowledge base.
        best = context_entries[0]
        return {
            "answer": (
                f"{best.entry.answer}\n\n"
                "If that doesn't cover your question, the ARCH team can help — "
                "use the contact page on this site."
            ),
            "mode": "knowledge_base",
            "sources": [
                {
                    "id": best.entry.id,
                    "question": best.entry.question,
                    "category": best.entry.category,
                }
            ],
            "provider": None,
            "model": None,
            "created_at": now,
        }

    return {
        "answer": f"{NOT_COVERED_TEMPLATE}\n\n{SCOPE_TEMPLATE.format(topics=_topics(entries))}",
        "mode": "not_covered",
        "sources": [],
        "provider": None,
        "model": None,
        "created_at": now,
    }
