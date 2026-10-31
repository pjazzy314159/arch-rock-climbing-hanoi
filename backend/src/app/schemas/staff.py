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
    """A new checklist item.

    ``position`` is accepted for backward compatibility, but the server assigns
    the final position so new items cannot collide with existing ones.
    """

    label: str = Field(min_length=1, max_length=200)
    position: int | None = None


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
    created_by_name: str | None = None
    event_id: int | None = None
    event_title: str | None = None
    event_starts_at: datetime | None = None
    event_ends_at: datetime | None = None
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
    event_id: int | None = None


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


class EventUpdateIn(BaseModel):
    """A partial event update.

    ``ends_at`` stays explicitly settable to ``None`` so an existing end time
    can be cleared; ``exclude_unset`` keeps that distinct from "unchanged".
    """

    title: str | None = Field(default=None, min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=4000)
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    location: str | None = Field(default=None, max_length=160)
    capacity: int | None = Field(default=None, ge=1, le=10_000)
    is_public: bool | None = None


class AdminSummaryOut(BaseModel):
    members: int
    staff: int
    active_routes: int
    archived_routes: int
    upcoming_events: int
    open_tasks: int
    pending_agreements: int
    products: int


class AdminAssigneeOut(ORMModel):
    """The minimum identity fields needed to populate an assignment control."""

    id: int
    full_name: str
    email: str
    role: str


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


class AdminCustomerOut(AdminMemberOut):
    """A safe customer summary for the directory.

    The database ID is present only so the browser can build a detail URL; the
    UI uses the name and email as the visible identifier.
    """

    created_at: datetime
    last_climb_on: date | None = None


class AdminCustomerListOut(BaseModel):
    items: list[AdminCustomerOut]
    total: int
    limit: int
    offset: int


class AdminCustomerAgreementOut(ORMModel):
    id: int
    version: str
    status: str
    method: str | None = None
    signed_at: datetime | None = None
    signed_name: str | None = None
    notes: str | None = None


class AdminCustomerAttemptOut(ORMModel):
    id: int
    route_id: int | None = None
    route_name: str
    grade: str
    result: str
    attempts: int
    climbed_on: date
    created_at: datetime


class AdminCustomerContactOut(ORMModel):
    id: int
    subject: str
    handled: bool
    created_at: datetime


class AdminCustomerActivityOut(BaseModel):
    sends: int = 0
    flashes: int = 0
    projects: int = 0
    attempts: int = 0
    total_climbs: int = 0


class AdminCustomerDetailOut(AdminCustomerOut):
    phone: str | None = None
    climbing_level: int = 0
    agreement: AdminCustomerAgreementOut | None = None
    activity: AdminCustomerActivityOut
    recent_attempts: list[AdminCustomerAttemptOut] = []
    recent_contact_messages: list[AdminCustomerContactOut] = []
    contact_history_note: str = ""
