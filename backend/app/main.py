"""FastAPI application entry point for the ARCH platform."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.api import api_router
from app.config import get_settings
from app.db import engine

logger = logging.getLogger("arch.api")

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application start-up and shut-down."""
    logger.info("ARCH API starting (environment=%s)", settings.environment)
    yield
    logger.info("ARCH API shutting down")


app = FastAPI(
    title="ARCH Rock Climbing Hanoi API",
    version="0.1.0",
    description=(
        "Backend for the ARCH Rock Climbing Hanoi platform: public content, "
        "customer records, climbing routes and votes, staff operations and the "
        "customer-support assistant."
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list or ["http://localhost:8080"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Return validation problems in a predictable shape without leaking internals."""
    return JSONResponse(
        # 422 is written literally: Starlette renamed its constant in a recent
        # release and the literal keeps the code working on both.
        status_code=422,
        content={
            "detail": "Some of the submitted values are not valid.",
            "errors": [
                {
                    "field": ".".join(str(part) for part in error.get("loc", [])[1:]) or "body",
                    "message": error.get("msg", "Invalid value"),
                }
                for error in exc.errors()
            ],
        },
    )


@app.get("/api/health", tags=["meta"])
def health() -> dict:
    """Report service health and the configured database dialect."""
    dialect = engine.dialect.name
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        database_ok = True
    except Exception:  # pragma: no cover - only hit when the database is down
        logger.exception("Database health check failed")
        database_ok = False
    return {
        "status": "ok" if database_ok else "degraded",
        "database": dialect,
        "database_reachable": database_ok,
        "llm_enabled": settings.llm_enabled,
        "version": app.version,
    }


app.include_router(api_router)
