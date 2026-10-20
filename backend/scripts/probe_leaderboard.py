"""Check the leaderboard's scoring and ranking through the public API.

Creates a member with a known set of sends and checks the score, the best
grade and the rank that come back.

Usage: uv run python scripts/probe_leaderboard.py
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
        return error.code, json.loads(error.read() or b"null")


def main() -> None:
    stamp = int(__import__("time").time())
    email = f"board-{stamp}@example.com"

    status, body = call(
        "/api/auth/register",
        data={
            "email": email,
            "full_name": "Board Check",
            "password": "a-long-enough-password",
        },
    )
    assert status == 201, (status, body)
    token = body["access_token"]

    # V0 is worth 1 point, V4 is worth 5, so three sends are worth 1 + 5 + 5 = 11.
    for grade in ("V0", "V4", "V4"):
        status, _ = call(
            "/api/me/logbook",
            token=token,
            data={"route_name": f"Route {grade}", "grade": grade, "result": "sent"},
        )
        assert status == 201, status

    # A project must not count.
    call(
        "/api/me/logbook",
        token=token,
        data={"route_name": "Project", "grade": "V8", "result": "project"},
    )

    status, entries = call("/api/me/leaderboard")
    assert status == 200, status
    mine = next(entry for entry in entries if entry["display_name"] == "Board Check")

    print("leaderboard entry:", mine)
    print()
    assert mine["total_sends"] == 3, "only sends count"
    assert mine["best_grade"] == "V4", "the best grade is the highest send"
    assert mine["score"] == 11, "a send is worth one point per grade step"
    assert mine["rank"] >= 1
    assert "user_id" not in mine
    assert "climbing_level" not in mine
    print("OK: sends only, correct score, best grade, rank and no extra fields.")


if __name__ == "__main__":
    main()
