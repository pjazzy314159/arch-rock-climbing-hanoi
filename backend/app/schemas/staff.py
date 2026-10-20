"""Schemas for staff tasks, checklists, shifts and the admin area."""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, Field

from app.models import TaskPriority, TaskStatus
from app.schemas.common import ORMModel


class ChecklistItemOut(ORMModel):
    id: int
    task_id: int
    label: str
    position: int
    is_done: bool
    done_at: datetime | None = None
    done_by_id: int | None = None


class ChecklistItemIn(BaseModel):
    label: str = Field(min_length=1, max_length=200)
    position: int = 0


class ChecklistUpdateIn(BaseModel):
    is_done: bool
    label: str | None = Field(default=None, min_length=1, max_length=200)
    position: int | None = None


class TaskOut(ORMModel):
    id: int
    title: str
    description: str
    status: TaskStatus
    priority: TaskPriority
    due_at: datetime | None = None
    completed_at: datetime | None = None
    assignee_id: int | None = None
    assignee_name: str | None = None
    created_by_id: int | None = None
    event_id: int | None = None
    created_at: datetime
    checklist: list[ChecklistItemOut] = []


class TaskCreateIn(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    description: str = Field(default="", max_length=4000)
    assignee_id: int | None = None
    priority: TaskPriority = TaskPriority.NORMAL
    due_at: datetime | None = None
    event_id: int | None = None
    checklist: list[ChecklistItemIn] = []


class TaskUpdateIn(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=4000)
    assignee_id: int | None = None
    priority: TaskPriority | None = None
    status: TaskStatus | None = None
    due_at: datetime | None = None


class TaskStatusIn(BaseModel):
    status: TaskStatus


class ShiftOut(ORMModel):
    id: int
    staff_id: int
    staff_name: str | None = None
    starts_at: datetime
    ends_at: datetime
    role: str
    notes: str


class ShiftIn(BaseModel):
    staff_id: int
    starts_at: datetime
    ends_at: datetime
    role: str = Field(default="Floor staff", max_length=80)
    notes: str = Field(default="", max_length=2000)


class EventCreateIn(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    description: str = Field(default="", max_length=4000)
    starts_at: datetime
    ends_at: datetime | None = None
    location: str = Field(default="", max_length=160)
    capacity: int | None = Field(default=None, ge=1, le=10_000)
    is_public: bool = True


class AdminSummaryOut(BaseModel):
    members: int
    staff: int
    active_routes: int
    archived_routes: int
    upcoming_events: int
    open_tasks: int
    pending_agreements: int
    products: int


class AdminMemberOut(ORMModel):
    id: int
    email: str
    full_name: str
    role: str
    is_active: bool
    membership_tier: str | None = None
    membership_status: str | None = None
    joined_on: date | None = None
    agreement_status: str | None = None
    total_sends: int = 0
