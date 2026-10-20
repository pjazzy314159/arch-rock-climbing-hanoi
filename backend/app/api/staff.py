"""Staff endpoints: assigned tasks, checklists and shifts.

Every endpoint enforces its authorisation on the backend. Staff can only read
and update their own assignments; administrators may work across the team.
"""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import require_admin, require_staff
from app.models import (
    ChecklistItem,
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


def _task_to_out(task: StaffTask) -> TaskOut:
    payload = TaskOut.model_validate(task)
    payload.assignee_name = task.assignee.full_name if task.assignee else None
    payload.checklist = [ChecklistItemOut.model_validate(item) for item in task.checklist]
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
    statement = select(StaffTask)
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
    assignee = None
    if payload.assignee_id is not None:
        assignee = db.get(User, payload.assignee_id)
        if assignee is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignee not found")
        if assignee.role not in (Role.STAFF, Role.ADMIN):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Tasks can only be assigned to staff or administrators",
            )

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
                position=item.position or index,
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

    is_admin = user.role is Role.ADMIN
    if not is_admin and (
        payload.assignee_id is not None
        or payload.title is not None
        or payload.description is not None
        or payload.priority is not None
        or payload.due_at is not None
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can change task details",
        )

    if payload.title is not None:
        task.title = payload.title.strip()
    if payload.description is not None:
        task.description = payload.description.strip()
    if payload.priority is not None:
        task.priority = payload.priority
    if payload.due_at is not None:
        task.due_at = payload.due_at
    if payload.assignee_id is not None:
        assignee = db.get(User, payload.assignee_id)
        if assignee is None or assignee.role not in (Role.STAFF, Role.ADMIN):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Tasks can only be assigned to staff or administrators",
            )
        task.assignee_id = assignee.id
    if payload.status is not None:
        task.status = payload.status
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
    """Add a checklist entry to a task."""
    task = _load_task(db, task_id)
    _assert_can_access(task, user)
    label = payload.label.strip() or "Checklist item"
    item = ChecklistItem(task_id=task.id, label=label, position=payload.position)
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
