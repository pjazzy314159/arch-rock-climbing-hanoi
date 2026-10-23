"""Staff operations: task assignment, checklists and shifts."""

from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.base import TimestampMixin


class TaskStatus(enum.StrEnum):
    """Lifecycle of a staff task."""

    TODO = "todo"
    IN_PROGRESS = "in_progress"
    DONE = "done"
    CANCELLED = "cancelled"


class TaskPriority(enum.StrEnum):
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"


class StaffTask(Base, TimestampMixin):
    """A task assigned to a member of staff."""

    __tablename__ = "staff_tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[TaskStatus] = mapped_column(
        Enum(TaskStatus, native_enum=False, length=20),
        default=TaskStatus.TODO,
        nullable=False,
        index=True,
    )
    priority: Mapped[TaskPriority] = mapped_column(
        Enum(TaskPriority, native_enum=False, length=20),
        default=TaskPriority.NORMAL,
        nullable=False,
    )
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    assignee_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    event_id: Mapped[int | None] = mapped_column(
        ForeignKey("events.id", ondelete="SET NULL"), nullable=True
    )

    assignee: Mapped[User] = relationship(  # noqa: F821
        back_populates="tasks", foreign_keys=[assignee_id]
    )
    created_by: Mapped[User] = relationship(foreign_keys=[created_by_id])  # noqa: F821
    event: Mapped[Event] = relationship()  # noqa: F821
    checklist: Mapped[list[ChecklistItem]] = relationship(
        back_populates="task", cascade="all, delete-orphan", order_by="ChecklistItem.position"
    )


class ChecklistItem(Base, TimestampMixin):
    """A single checklist entry belonging to a staff task."""

    __tablename__ = "checklist_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    task_id: Mapped[int] = mapped_column(
        ForeignKey("staff_tasks.id", ondelete="CASCADE"), index=True, nullable=False
    )
    label: Mapped[str] = mapped_column(String(200), nullable=False)
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_done: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    done_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    task: Mapped[StaffTask] = relationship(back_populates="checklist")
    done_by: Mapped[User] = relationship(foreign_keys=[done_by_id])  # noqa: F821


class StaffShift(Base, TimestampMixin):
    """A scheduled shift for a member of staff."""

    __tablename__ = "staff_shifts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    staff_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    role: Mapped[str] = mapped_column(String(80), default="Floor staff")
    notes: Mapped[str] = mapped_column(Text, default="")

    staff: Mapped[User] = relationship(foreign_keys=[staff_id])  # noqa: F821
