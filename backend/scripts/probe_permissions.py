"""Probe the API's public surface and its permission boundaries.

Usage: uv run python scripts/probe_permissions.py
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request

API = "http://localhost:8000"


def call(path: str, token: str | None = None, data: dict | None = None, method: str | None = None):
    request = urllib.request.Request(
        f"{API}{path}",
        method=method or ("POST" if data is not None else "GET"),
        data=json.dumps(data).encode() if data is not None else None,
    )
    if data is not None:
        request.add_header("Content-Type", "application/json")
    if token:
        request.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return response.status, json.loads(response.read() or b"null")
    except urllib.error.HTTPError as error:
        body = error.read()
        try:
            return error.code, json.loads(body or b"null")
        except json.JSONDecodeError:
            return error.code, body[:120].decode(errors="replace")


def login(email: str, password: str) -> str:
    status, body = call("/api/auth/login", data={"email": email, "password": password})
    assert status == 200, (status, body)
    return body["access_token"]


def main() -> None:
    customer = login("alex@example.com", "customer-demo-password")
    staff = login("staff@example.com", "staff-demo-password")
    admin = login("admin@example.com", "admin-demo-password")

    print("=== public endpoints (no token) ===")
    for path in (
        "/api/health",
        "/api/public/gym",
        "/api/public/routes",
        "/api/public/products",
        "/api/public/prices",
        "/api/public/faq",
        "/api/me/leaderboard",
        "/api/assistant/status",
    ):
        status, body = call(path)
        note = ""
        if isinstance(body, list) and body and isinstance(body[0], dict):
            note = "fields: " + ", ".join(sorted(body[0].keys()))
        elif isinstance(body, dict):
            note = "fields: " + ", ".join(sorted(body.keys()))
        print(f"  {status} {path:<26} {note}")

    print()
    print("=== protected endpoints, no token ===")
    for path in (
        "/api/auth/me",
        "/api/me/dashboard",
        "/api/me/logbook",
        "/api/me/agreement",
        "/api/staff/tasks",
        "/api/admin/summary",
        "/api/admin/members",
    ):
        status, _ = call(path)
        print(f"  {status} {path}")

    print()
    print("=== customer token ===")
    for path in (
        "/api/staff/tasks",
        "/api/staff/shifts",
        "/api/admin/summary",
        "/api/admin/members",
        "/api/admin/routes",
    ):
        status, _ = call(path, token=customer)
        print(f"  {status} {path}")

    print()
    print("=== staff token ===")
    for path in ("/api/staff/tasks", "/api/admin/summary", "/api/admin/members"):
        status, _ = call(path, token=staff)
        print(f"  {status} {path}")

    print()
    print("=== staff token asking for every task ===")
    status, body = call("/api/staff/tasks?all=true", token=staff)
    own = len(body) if isinstance(body, list) else body
    status2, body2 = call("/api/staff/tasks", token=staff)
    print(f"  ?all=true -> {status} ({own} tasks)   plain -> {status2} ({len(body2)} tasks)")

    print()
    print("=== admin token ===")
    for path in ("/api/staff/tasks?all=true", "/api/admin/summary", "/api/admin/members"):
        status, _ = call(path, token=admin)
        print(f"  {status} {path}")

    print()
    print("=== a member's own records are not visible to another member ===")
    status, _ = call("/api/me/logbook", token=customer)
    print(f"  own logbook: {status}")


if __name__ == "__main__":
    main()
