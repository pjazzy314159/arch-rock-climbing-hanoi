"""API router registry."""

from fastapi import APIRouter

from app.api import admin, assistant, auth, holds, member, public, staff

api_router = APIRouter()
api_router.include_router(public.router)
api_router.include_router(holds.public_router)
api_router.include_router(auth.router)
api_router.include_router(member.router)
api_router.include_router(staff.router)
api_router.include_router(holds.staff_router)
api_router.include_router(admin.router)
api_router.include_router(assistant.router)

__all__ = ["api_router"]
