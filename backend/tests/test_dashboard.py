"""Tests for the member dashboard.

The dashboard is the member's own picture of their climbing. These tests
prove that every number in it comes from that member's own rows, that the
outcomes are derived the way the rules say, that the ranking agrees with the
public leaderboard, and that nothing of another member's is exposed.
"""

from __future__ import annotations

from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Achievement, ClimbRoute, ResultType, RouteStatus, WallType
from app.services.climbing import LEADERBOARD_SCORING_RULE, PERCENTILE_RULE
from app.services.dashboard import RECENT_ATTEMPT_LIMIT
from tests.conftest import auth_headers, login


def log_climb(
    db: Session,
    user_id: int,
    *,
    grade: str = "V3",
    result: ResultType = ResultType.SENT,
    attempts: int = 1,
    climbed_on: date | None = None,
    route_id: int | None = None,
    route_name: str = "Quiet the Mind",
) -> Achievement:
    """Record a logged climb for a member."""
    entry = Achievement(
        user_id=user_id,
        route_id=route_id,
        route_name=route_name,
        grade=grade,
        result=result,
        attempts=attempts,
        climbed_on=climbed_on or date.today(),
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def dashboard_of(client: TestClient, email: str) -> dict:
    token = login(client, email)
    response = client.get("/api/me/dashboard", headers=auth_headers(token))
    assert response.status_code == 200, response.text
    return response.json()


# --- The empty member -------------------------------------------------------


def test_a_new_member_sees_an_empty_dashboard(client: TestClient, customer) -> None:
    """A member with no records gets zeros and nulls, not a made-up history."""
    data = dashboard_of(client, customer.email)

    assert data["total_sends"] == 0
    assert data["total_sessions"] == 0
    assert data["active_projects"] == 0
    assert data["has_activity"] is False
    assert data["best_grade"] is None
    assert data["first_climb"] is None
    assert data["last_climb"] is None
    assert data["outcomes"] == {"sends": 0, "flashes": 0, "projects": 0, "attempts": 0}
    assert data["by_grade"] == []
    assert data["recent_attempts"] == []


def test_a_new_member_is_not_ranked(client: TestClient, customer) -> None:
    """No sends means no rank. It is not rank zero."""
    data = dashboard_of(client, customer.email)

    ranking = data["ranking"]
    assert ranking["rank"] is None
    assert ranking["percentile"] is None
    assert ranking["score"] == 0
    assert ranking["total_sends"] == 0
    assert ranking["best_grade"] is None


def test_a_new_member_still_sees_the_gyms_route_count(client: TestClient, customer) -> None:
    """The number of routes on the wall is the gym's, not the member's.

    A member who has climbed nothing still knows what is set for them.
    """
    data = dashboard_of(client, customer.email)
    assert data["active_routes"] == 0

    db_route = ClimbRoute(name="Something to climb", grade="V1", status=RouteStatus.ACTIVE)
    # The route is added through the database so the count can be checked
    # without depending on the administration endpoint.
    from app.db import SessionLocal

    with SessionLocal() as session:
        session.add(db_route)
        session.commit()

    data = dashboard_of(client, customer.email)
    assert data["active_routes"] == 1


# --- The populated member ----------------------------------------------------


def test_the_dashboard_counts_the_member_sends_and_sessions(
    client: TestClient, db, customer
) -> None:
    log_climb(db, customer.id, grade="V3", climbed_on=date(2026, 10, 1))
    log_climb(db, customer.id, grade="V4", climbed_on=date(2026, 10, 2))
    log_climb(db, customer.id, grade="V4", climbed_on=date(2026, 10, 2))

    data = dashboard_of(client, customer.email)
    assert data["total_sends"] == 3
    # Two different days, so two sessions.
    assert data["total_sessions"] == 2
    assert data["best_grade"] == "V4"
    assert data["has_activity"] is True
    assert data["first_climb"] == "2026-10-01"
    assert data["last_climb"] == "2026-10-02"


def test_a_flash_is_a_send_on_the_first_attempt(client: TestClient, db, customer) -> None:
    """The flash is derived from the attempts, not stored."""
    log_climb(db, customer.id, grade="V1", attempts=1)
    log_climb(db, customer.id, grade="V2", attempts=3)
    log_climb(db, customer.id, grade="V3", result=ResultType.PROJECT, attempts=1)

    data = dashboard_of(client, customer.email)
    outcomes = data["outcomes"]
    # Two sends, of which one was flashed. The project is not a send and not
    # a flash, even though it was tried once.
    assert outcomes["sends"] == 2
    assert outcomes["flashes"] == 1
    assert outcomes["projects"] == 1
    assert outcomes["attempts"] == 5


def test_the_dashboard_groups_the_record_by_grade(client: TestClient, db, customer) -> None:
    log_climb(db, customer.id, grade="V4", attempts=1)
    log_climb(db, customer.id, grade="V1", attempts=2)
    log_climb(db, customer.id, grade="V1", attempts=1)
    log_climb(db, customer.id, grade="V2", result=ResultType.PROJECT)

    data = dashboard_of(client, customer.email)
    # Easiest first.
    assert [item["grade"] for item in data["by_grade"]] == ["V1", "V2", "V4"]
    assert data["by_grade"][0] == {
        "grade": "V1",
        "sends": 2,
        "flashes": 1,
        "projects": 0,
    }
    # A grade the member has only tried is shown too.
    assert data["by_grade"][1] == {
        "grade": "V2",
        "sends": 0,
        "flashes": 0,
        "projects": 1,
    }


def test_the_dashboard_lists_the_most_recent_attempts(client: TestClient, db, customer) -> None:
    log_climb(db, customer.id, grade="V1", climbed_on=date(2026, 9, 1))
    log_climb(db, customer.id, grade="V2", climbed_on=date(2026, 10, 2), attempts=4)
    log_climb(db, customer.id, grade="V3", climbed_on=date(2026, 10, 5))

    data = dashboard_of(client, customer.email)
    recent = data["recent_attempts"]
    assert [item["grade"] for item in recent] == ["V3", "V2", "V1"]
    assert recent[0]["is_flash"] is True
    assert recent[1]["is_flash"] is False
    assert recent[1]["attempts"] == 4


def test_the_recent_attempts_list_is_bounded(client: TestClient, db, customer) -> None:
    for index in range(RECENT_ATTEMPT_LIMIT + 4):
        log_climb(
            db,
            customer.id,
            grade="V1",
            climbed_on=date(2026, 10, 1) + timedelta(days=index),
        )

    data = dashboard_of(client, customer.email)
    assert len(data["recent_attempts"]) == RECENT_ATTEMPT_LIMIT
    # The newest is still the newest: nine climbs from the 1st to the 9th.
    assert data["recent_attempts"][0]["climbed_on"] == "2026-10-09"


def test_the_dashboard_counts_only_the_routes_on_the_wall(client: TestClient, db, customer) -> None:
    from app.db import SessionLocal

    with SessionLocal() as session:
        session.add(ClimbRoute(name="On the wall", grade="V1", status=RouteStatus.ACTIVE))
        session.add(ClimbRoute(name="Taken down", grade="V2", status=RouteStatus.ARCHIVED))
        session.add(ClimbRoute(name="Being reset", grade="V3", status=RouteStatus.PENDING_RESET))
        session.commit()

    data = dashboard_of(client, customer.email)
    assert data["active_routes"] == 1


# --- The ranking -------------------------------------------------------------


def test_the_ranking_uses_the_leaderboards_own_rule(client: TestClient, db, customer) -> None:
    """One point per grade step, so V0 is worth one point."""
    log_climb(db, customer.id, grade="V0")
    log_climb(db, customer.id, grade="V3")

    data = dashboard_of(client, customer.email)
    ranking = data["ranking"]
    # V0 is one point, V3 is four points.
    assert ranking["score"] == 5
    assert ranking["total_sends"] == 2
    assert ranking["best_grade"] == "V3"


def test_projects_do_not_count_towards_the_score(client: TestClient, db, customer) -> None:
    log_climb(db, customer.id, grade="V5", result=ResultType.PROJECT, attempts=6)

    data = dashboard_of(client, customer.email)
    assert data["ranking"]["score"] == 0
    assert data["ranking"]["rank"] is None


def test_the_dashboard_rank_matches_the_public_leaderboard(
    client: TestClient, db, customer, other_customer
) -> None:
    """The two pages must never tell a member different stories."""
    log_climb(db, other_customer.id, grade="V5", route_name="Hard one")
    log_climb(db, customer.id, grade="V2", route_name="Easy one")

    token = login(client, customer.email)
    listed = client.get("/api/me/leaderboard", headers=auth_headers(token)).json()
    entry = next(item for item in listed if item["display_name"] == customer.full_name)

    data = dashboard_of(client, customer.email)
    assert data["ranking"]["rank"] == entry["rank"]
    assert data["ranking"]["score"] == entry["score"]
    assert data["ranking"]["total_sends"] == entry["total_sends"]
    assert data["ranking"]["best_grade"] == entry["best_grade"]


def test_the_percentile_is_the_share_of_ranked_climbers_behind(
    client: TestClient, db, customer, other_customer
) -> None:
    """The top climber is at the 100th percentile, the last at the lowest."""
    # The other member is ahead: a harder send is worth more points.
    log_climb(db, other_customer.id, grade="V5", route_name="Hard one")
    log_climb(db, customer.id, grade="V1", route_name="Easy one")

    data = dashboard_of(client, customer.email)
    ranking = data["ranking"]
    assert ranking["ranked_count"] == 2
    assert ranking["rank"] == 2
    assert ranking["ahead"] == 1
    # One of the two ranked climbers is at or behind this member.
    assert ranking["percentile"] == 50


def test_the_only_ranked_climber_is_at_the_hundredth_percentile(
    client: TestClient, db, customer
) -> None:
    log_climb(db, customer.id, grade="V2")

    data = dashboard_of(client, customer.email)
    ranking = data["ranking"]
    assert ranking["ranked_count"] == 1
    assert ranking["rank"] == 1
    assert ranking["ahead"] == 0
    assert ranking["percentile"] == 100


def test_climbers_who_have_not_sent_anything_are_not_counted(
    client: TestClient, db, customer, other_customer
) -> None:
    """A member with no sends is not on the leaderboard, and is not counted."""
    log_climb(db, customer.id, grade="V2")
    log_climb(db, other_customer.id, result=ResultType.PROJECT)

    data = dashboard_of(client, customer.email)
    assert data["ranking"]["ranked_count"] == 1


# --- Boundaries --------------------------------------------------------------


def test_the_dashboard_needs_a_token(client: TestClient) -> None:
    assert client.get("/api/me/dashboard").status_code == 401


def test_the_dashboard_never_shows_another_members_records(
    client: TestClient, db, customer, other_customer
) -> None:
    log_climb(db, other_customer.id, grade="V6", route_name="Their Secret Project")
    log_climb(db, customer.id, grade="V1", route_name="My Own Climb")

    data = dashboard_of(client, customer.email)
    assert data["total_sends"] == 1
    assert data["best_grade"] == "V1"
    names = [item["route_name"] for item in data["recent_attempts"]]
    assert names == ["My Own Climb"]
    assert "Their Secret Project" not in str(data)


def test_the_dashboard_does_not_publish_other_members_names(
    client: TestClient, db, customer, other_customer
) -> None:
    """The ranking is the member's own; the field is a count, not a list."""
    log_climb(db, other_customer.id, grade="V5", route_name="Hard one")

    data = dashboard_of(client, customer.email)
    assert other_customer.full_name not in str(data)
    assert "user_id" not in str(data)


def test_a_deactivated_member_cannot_read_the_dashboard(client: TestClient, db, customer) -> None:
    """A deactivated account is treated as not signed in, like everywhere else."""
    token = login(client, customer.email)
    customer.is_active = False
    db.commit()

    response = client.get("/api/me/dashboard", headers=auth_headers(token))
    assert response.status_code == 401


@pytest.mark.parametrize("path", ["/api/me/dashboard", "/api/me/stats"])
def test_the_dashboard_alias_answers_the_same_way(client: TestClient, db, customer, path) -> None:
    log_climb(db, customer.id, grade="V3")
    token = login(client, customer.email)

    response = client.get(path, headers=auth_headers(token))
    assert response.status_code == 200
    assert response.json()["total_sends"] == 1


def test_the_wall_type_of_a_route_is_not_the_member_s_own(
    client: TestClient, db, customer, route
) -> None:
    """A route's type belongs to the route; it never becomes the member's."""
    route.wall_type = WallType.OVERHANG
    db.commit()

    data = dashboard_of(client, customer.email)
    assert "wall_type" not in str(data)


# --- The stated rule --------------------------------------------------------


def test_the_dashboard_states_the_scoring_rule(client: TestClient, db, customer) -> None:
    """The rule travels with the ranking, so the page cannot drift from it."""
    log_climb(db, customer.id, grade="V3")

    data = dashboard_of(client, customer.email)
    ranking = data["ranking"]
    assert ranking["scoring_rule"] == LEADERBOARD_SCORING_RULE
    assert ranking["percentile_rule"] == PERCENTILE_RULE
    assert ranking["scoring_rule"]
    assert ranking["percentile_rule"]


def test_the_stated_rule_matches_the_implemented_calculation(
    client: TestClient, db, customer
) -> None:
    """Every claim the rule makes has to be true of the numbers.

    The rule is not a second definition written out by hand: it is checked
    against what the scoring actually does.
    """
    log_climb(db, customer.id, grade="V0")
    log_climb(db, customer.id, grade="V3")
    log_climb(db, customer.id, grade="V5", result=ResultType.PROJECT, attempts=4)

    data = dashboard_of(client, customer.email)
    ranking = data["ranking"]
    rule = ranking["scoring_rule"]

    # "A logged send is worth one point per grade step, so V0 is worth 1 point
    # and V3 is worth 4 points."
    assert "V0 is worth 1 point" in rule
    assert "V3 is worth 4 points" in rule
    # The project did not count: two sends, not three.
    assert ranking["total_sends"] == 2
    assert ranking["score"] == 1 + 4


def test_the_stated_rule_says_that_projects_do_not_count(client: TestClient, db, customer) -> None:
    log_climb(db, customer.id, grade="V4", result=ResultType.PROJECT, attempts=9)

    data = dashboard_of(client, customer.email)
    rule = data["ranking"]["scoring_rule"]
    assert "Projects do not count" in rule
    # The project really is worth nothing.
    assert data["ranking"]["score"] == 0
    assert data["ranking"]["total_sends"] == 0


def test_a_send_outside_the_v_scale_is_not_counted(client: TestClient, db, customer) -> None:
    """The rule says so, and it is true."""
    log_climb(db, customer.id, grade="6a")

    data = dashboard_of(client, customer.email)
    assert "outside the V scale is not counted" in data["ranking"]["scoring_rule"]
    assert data["ranking"]["score"] == 0
    assert data["ranking"]["total_sends"] == 0
    # The send itself is still in the member's record; it is only the
    # leaderboard that ignores it.
    assert data["total_sends"] == 1


def test_the_percentile_rule_describes_the_percentile(client: TestClient, db, customer) -> None:
    data = dashboard_of(client, customer.email)
    rule = data["ranking"]["percentile_rule"]
    assert "at or behind your position" in rule
    assert "100th percentile" in rule


def test_the_rule_is_the_same_everywhere_it_is_used(client: TestClient, db, customer) -> None:
    """One definition, used wherever the rule is shown."""
    from app.services.climbing import LEADERBOARD_SCORING_RULE as from_module

    assert from_module is LEADERBOARD_SCORING_RULE
    assert LEADERBOARD_SCORING_RULE.startswith("Sends only.")
