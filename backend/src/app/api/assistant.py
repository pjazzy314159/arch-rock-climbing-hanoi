"""Customer-support assistant endpoint.

The assistant is reachable without signing in. Provider credentials stay on
the server; the browser only ever sees the generated answer and the
knowledge-base entries it was based on.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.deps import get_optional_user
from app.models import FaqEntry, User
from app.schemas import AssistantAnswer, AssistantQuestion
from app.services.assistant import answer_question

router = APIRouter(prefix="/api/assistant", tags=["assistant"])


@router.post("/chat", response_model=AssistantAnswer)
async def chat(
    payload: AssistantQuestion,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
) -> AssistantAnswer:
    """Answer a question about ARCH using approved information only.

    The response states its ``mode`` so the UI can be transparent about whether
    the answer came from the knowledge base, from a configured model, or from
    the "not covered" fallback.
    """
    settings = get_settings()
    entries = db.scalars(
        select(FaqEntry).where(FaqEntry.is_published.is_(True)).order_by(FaqEntry.id)
    ).all()

    result = await answer_question(settings, payload.question, list(entries))
    answer = AssistantAnswer(**result, conversation_id=payload.conversation_id)
    answer.disclaimer = (
        "Answers are based on approved ARCH information only. "
        "Prices, schedules and policies are confirmed by the ARCH team."
    )
    return answer


@router.get("/status")
def assistant_status() -> dict:
    """Report whether a live model provider is configured.

    The browser uses this to show an honest label such as "offline answers
    only" instead of implying a live AI service.
    """
    settings = get_settings()
    return {
        "provider": settings.llm_provider or None,
        "model": settings.llm_model or None,
        "live_model_enabled": settings.llm_enabled,
        "mode": "llm_grounded" if settings.llm_enabled else "knowledge_base",
    }
