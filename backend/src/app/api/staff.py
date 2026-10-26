"""Staff endpoints: assigned tasks, checklists and shifts.

Every endpoint enforces its authorisation on the backend. Staff can only read
and update their own assignments; administrators may work across the team.
"""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.db import get_db
from app.deps import require_admin, require_staff
from app.models import (
    ChecklistItem,
    Event,
    Role,
    StaffShift,
    StaffTask,
    TaskStatus,
    User,
)
from app.schemas import (
    ChecklistItemIn,
    ChecklistItemOut,
    ChecklistUpdateIn,
    ShiftIn,
    ShiftOut,
    TaskCreateIn,
    TaskOut,
    TaskStatusIn,
    TaskUpdateIn,
)

router = APIRouter(prefix="/api/staff", tags=["staff"])


def _task_load_options():
    """Load the task relations needed by ``TaskOut`` without an N+1 query."""
    return (
        joinedload(StaffTask.assignee),
        joinedload(StaffTask.created_by),
        joinedload(StaffTask.event),
        selectinload(StaffTask.checklist),
    )


def _task_to_out(task: StaffTask) -> TaskOut:
    payload = TaskOut.model_validate(task)
    payload.assignee_name = task.assignee.full_name if task.assignee else None
    payload.created_by_name = task.created_by.full_name if task.created_by else None
    payload.event_title = task.event.title if task.event else None
    payload.event_starts_at = task.event.starts_at if task.event else None
    payload.event_ends_at = task.event.ends_at if task.event else None
    items = sorted(task.checklist, key=lambda item: (item.position, item.id))
    payload.checklist = [ChecklistItemOut.model_validate(item) for item in items]
    return payload


def _shift_to_out(shift: StaffShift) -> ShiftOut:
    payload = ShiftOut.model_validate(shift)
    payload.staff_name = shift.staff.full_name if shift.staff else None
    return payload


def _load_task(db: Session, task_id: int) -> StaffTask:
    task = db.get(StaffTask, task_id)
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    return task


def _assert_can_access(task: StaffTask, user: User) -> None:
    if user.role is Role.ADMIN:
        return
    if task.assignee_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This task is not assigned to you",
        )


def _assignee_or_error(db: Session, assignee_id: int) -> User:
    assignee = db.get(User, assignee_id)
    if assignee is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignee not found")
    if assignee.role not in (Role.STAFF, Role.ADMIN):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tasks can only be assigned to staff or administrators",
        )
    return assignee


def _event_or_error(db: Session, event_id: int) -> Event:
    event = db.get(Event, event_id)
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    return event


@router.get("/tasks", response_model=list[TaskOut])
def list_tasks(
    status_filter: str | None = Query(default=None, alias="status"),
    all_tasks: bool = Query(default=False, alias="all"),
    user: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> list[TaskOut]:
    """List tasks.

    Staff see their own assignments by default. Administrators can request
    every task with ``?all=true``.
    """
    statement = select(StaffTask).options(*_task_load_options())
    if user.role is not Role.ADMIN or not all_tasks:
        statement = statement.where(StaffTask.assignee_id == user.id)
    if status_filter:
        try:
            wanted = TaskStatus(status_filter)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown task status"
            ) from None
        statement = statement.where(StaffTask.status == wanted)
    tasks = db.scalars(
        statement.order_by(StaffTask.due_at.is_(None), StaffTask.due_at, StaffTask.id)
    ).all()
    return [_task_to_out(task) for task in tasks]


@router.post("/tasks", response_model=TaskOut, status_code=status.HTTP_201_CREATED)
def create_task(
    payload: TaskCreateIn,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> TaskOut:
    """Create a task and assign it to a member of staff."""
    if payload.assignee_id is not None:
        _assignee_or_error(db, payload.assignee_id)
    if payload.event_id is not None:
        _event_or_error(db, payload.event_id)

    task = StaffTask(
        title=payload.title.strip(),
        description=payload.description.strip(),
        assignee_id=payload.assignee_id,
        created_by_id=user.id,
        priority=payload.priority,
        due_at=payload.due_at,
        event_id=payload.event_id,
    )
    db.add(task)
    db.flush()
    for index, item in enumerate(payload.checklist):
        db.add(
            ChecklistItem(
                task_id=task.id,
                label=item.label.strip(),
                position=index,
            )
        )
    db.commit()
    db.refresh(task)
    return _task_to_out(task)


@router.patch("/tasks/{task_id}", response_model=TaskOut)
def update_task(
    task_id: int,
    payload: TaskUpdateIn,
    user: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> TaskOut:
    """Update a task.

    Staff may change the status of their own tasks. Only administrators may
    reassign a task or change its details.
    """
    task = _load_task(db, task_id)
    _assert_can_access(task, user)

    supplied = payload.model_fields_set
    admin_fields = {"title", "description", "priority", "due_at", "assignee_id", "event_id"}
    if user.role is not Role.ADMIN and supplied & admin_fields:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can change task details",
        )

    # Nullable fields can be cleared explicitly. Required columns must not be
    # null, even though the PATCH model needs nullable types to mark omission.
    for field_name in ("title", "description", "priority", "status"):
        if field_name in supplied and getattr(payload, field_name) is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"{field_name.replace('_', ' ').title()} cannot be null",
            )
    if "assignee_id" in supplied and payload.assignee_id is not None:
        _assignee_or_error(db, payload.assignee_id)
    if "event_id" in supplied and payload.event_id is not None:
        _event_or_error(db, payload.event_id)

    if "title" in supplied:
        task.title = payload.title.strip()  # type: ignore[union-attr]
    if "description" in supplied:
        task.description = payload.description.strip()  # type: ignore[union-attr]
    if "priority" in supplied:
        task.priority = payload.priority  # type: ignore[assignment]
    if "due_at" in supplied:
        task.due_at = payload.due_at
    if "assignee_id" in supplied:
        task.assignee_id = payload.assignee_id
    if "event_id" in supplied:
        task.event_id = payload.event_id
    if "status" in supplied:
        task.status = payload.status  # type: ignore[assignment]
        task.completed_at = datetime.now(UTC) if payload.status is TaskStatus.DONE else None

    db.commit()
    db.refresh(task)
    return _task_to_out(task)


@router.post("/tasks/{task_id}/status", response_model=TaskOut)
def update_task_status(
    task_id: int,
    payload: TaskStatusIn,
    user: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> TaskOut:
    """Update the status of a task the signed-in staff member owns."""
    task = _load_task(db, task_id)
    _assert_can_access(task, user)
    task.status = payload.status
    task.completed_at = datetime.now(UTC) if payload.status is TaskStatus.DONE else None
    db.commit()
    db.refresh(task)
    return _task_to_out(task)


@router.post(
    "/tasks/{task_id}/checklist",
    response_model=ChecklistItemOut,
    status_code=status.HTTP_201_CREATED,
)
def add_checklist_item(
    task_id: int,
    payload: ChecklistItemIn,
    user: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ChecklistItemOut:
    """Add a checklist entry to a task.

    Positions are assigned by the server so repeated additions do not collide.
    The current table has no unique constraint on ``(task_id, position)``, so
    concurrent requests can still race on the same next value; this is a known
    limitation until the database model is extended.
    """
    task = _load_task(db, task_id)
    _assert_can_access(task, user)
    label = payload.label.strip() or "Checklist item"
    highest = db.scalar(
        select(func.max(ChecklistItem.position)).where(ChecklistItem.task_id == task.id)
    )
    position = 0 if highest is None else highest + 1
    item = ChecklistItem(task_id=task.id, label=label, position=position)
    db.add(item)
    db.commit()
    db.refresh(item)
    return ChecklistItemOut.model_validate(item)


@router.patch("/checklist/{item_id}", response_model=ChecklistItemOut)
def update_checklist_item(
    item_id: int,
    payload: ChecklistUpdateIn,
    user: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ChecklistItemOut:
    """Tick off or untick a checklist entry on a task."""
    item = db.get(ChecklistItem, item_id)
    if item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Checklist item not found"
        )
    task = _load_task(db, item.task_id)
    _assert_can_access(task, user)

    item.is_done = payload.is_done
    item.done_at = datetime.now(UTC) if payload.is_done else None
    item.done_by_id = user.id if payload.is_done else None
    if payload.label is not None:
        item.label = payload.label.strip()
    if payload.position is not None:
        item.position = payload.position
    db.commit()
    db.refresh(item)
    return ChecklistItemOut.model_validate(item)


@router.get("/shifts", response_model=list[ShiftOut])
def list_shifts(
    start: datetime | None = Query(default=None),
    end: datetime | None = Query(default=None),
    user: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> list[ShiftOut]:
    """Shifts for the signed-in staff member, or for the whole team for admins."""
    statement = select(StaffShift)
    if user.role is not Role.ADMIN:
        statement = statement.where(StaffShift.staff_id == user.id)
    if start is not None:
        statement = statement.where(StaffShift.starts_at >= start)
    if end is not None:
        statement = statement.where(StaffShift.starts_at <= end)
    shifts = db.scalars(statement.order_by(StaffShift.starts_at)).all()
    return [_shift_to_out(shift) for shift in shifts]


@router.post("/shifts", response_model=ShiftOut, status_code=status.HTTP_201_CREATED)
def create_shift(
    payload: ShiftIn,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> ShiftOut:
    """Schedule a shift for a member of staff."""
    staff = db.get(User, payload.staff_id)
    if staff is None or staff.role not in (Role.STAFF, Role.ADMIN):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Shifts can only be assigned to staff"
        )
    if payload.ends_at <= payload.starts_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="A shift must end after it starts"
        )
    shift = StaffShift(
        staff_id=staff.id,
        starts_at=payload.starts_at,
        ends_at=payload.ends_at,
        role=payload.role,
        notes=payload.notes,
    )
    db.add(shift)
    db.commit()
    db.refresh(shift)
    return _shift_to_out(shift)
