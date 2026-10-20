"""Model registry.

Importing this package registers every table on the shared declarative base,
which is what Alembic's autogenerate and ``create_all`` rely on.
"""

from app.db import Base
from app.models.base import TimestampMixin, utcnow
from app.models.climbing import (
    Achievement,
    ClimbRoute,
    ResultType,
    RouteStatus,
    RouteVote,
    VoteValue,
)
from app.models.commerce import Product
from app.models.content import (
    ContactMessage,
    ContentRevision,
    Course,
    Event,
    FaqEntry,
    GymInfo,
    OpeningHour,
    Price,
    Rule,
    Service,
)
from app.models.staff import ChecklistItem, StaffShift, StaffTask, TaskPriority, TaskStatus
from app.models.users import AgreementMethod, AgreementStatus, Role, SafetyAgreement, User

__all__ = [
    "Achievement",
    "AgreementMethod",
    "AgreementStatus",
    "Base",
    "ChecklistItem",
    "ClimbRoute",
    "ContactMessage",
    "ContentRevision",
    "Course",
    "Event",
    "FaqEntry",
    "GymInfo",
    "OpeningHour",
    "Price",
    "Product",
    "ResultType",
    "Role",
    "RouteStatus",
    "RouteVote",
    "Rule",
    "SafetyAgreement",
    "Service",
    "StaffShift",
    "StaffTask",
    "TaskPriority",
    "TaskStatus",
    "TimestampMixin",
    "User",
    "VoteValue",
    "utcnow",
]
