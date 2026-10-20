"""Unit tests for the route voting and leaderboard business rules."""

from __future__ import annotations

from datetime import date

import pytest

from app.models import Achievement, ResultType, VoteValue
from app.services.climbing import (
    MAX_GRADE_SHIFT,
    MIN_VOTES_FOR_PERCEIVED_GRADE,
    build_leaderboard,
    grade_to_index,
    index_to_grade,
    rank_rows,
    tally_votes,
)


class TestGradeArithmetic:
    @pytest.mark.parametrize(
        ("grade", "expected"),
        [("V0", 0), ("V3", 3), ("v5", 5), (" V8 ", 8), ("V12", 12)],
    )
    def test_parses_v_scale_grades(self, grade: str, expected: int) -> None:
        assert grade_to_index(grade) == expected

    @pytest.mark.parametrize("grade", ["", "5a", "V", "unknown", "VB", "10", None])
    def test_rejects_unknown_grades(self, grade) -> None:
        assert grade_to_index(grade) is None

    def test_round_trips(self) -> None:
        assert index_to_grade(grade_to_index("V4")) == "V4"

    def test_never_produces_a_negative_grade(self) -> None:
        assert index_to_grade(-3) == "V0"


class TestVoteTally:
    def test_no_votes_means_no_perceived_grade(self) -> None:
        tally = tally_votes(1, "V3", [])
        assert tally.total == 0
        assert tally.perceived_grade is None
        assert tally.shift == 0

    def test_perceived_grade_needs_the_minimum_number_of_votes(self) -> None:
        votes = [VoteValue.HARDER, VoteValue.HARDER]
        tally = tally_votes(1, "V3", votes)
        assert tally.total < MIN_VOTES_FOR_PERCEIVED_GRADE
        assert tally.perceived_grade is None

    def test_consensus_makes_a_route_look_harder(self) -> None:
        votes = [VoteValue.HARDER, VoteValue.HARDER, VoteValue.AS_SET]
        tally = tally_votes(1, "V3", votes)
        assert tally.total == 3
        assert tally.harder == 2
        assert tally.shift == 1
        assert tally.perceived_grade == "V4"

    def test_consensus_makes_a_route_look_easier(self) -> None:
        votes = [VoteValue.EASIER, VoteValue.EASIER, VoteValue.AS_SET]
        tally = tally_votes(1, "V3", votes)
        assert tally.shift == -1
        assert tally.perceived_grade == "V2"

    def test_a_split_vote_does_not_shift_the_grade(self) -> None:
        votes = [VoteValue.EASIER, VoteValue.HARDER, VoteValue.AS_SET, VoteValue.AS_SET]
        tally = tally_votes(1, "V3", votes)
        assert tally.shift == 0
        assert tally.perceived_grade == "V3"

    def test_the_shift_is_never_more_than_one_step(self) -> None:
        votes = [VoteValue.HARDER] * 50
        tally = tally_votes(1, "V3", votes)
        assert abs(tally.shift) <= MAX_GRADE_SHIFT
        assert tally.perceived_grade == "V4"

    def test_the_official_grade_is_never_changed(self) -> None:
        tally = tally_votes(1, "V3", [VoteValue.HARDER] * 10)
        assert tally.official_grade == "V3"

    def test_an_unknown_official_grade_cannot_be_shifted(self) -> None:
        tally = tally_votes(1, "5a", [VoteValue.HARDER] * 5)
        assert tally.perceived_grade is None


def _achievement(user_id: int, grade: str, result=ResultType.SENT, days: int = 1) -> Achievement:
    return Achievement(
        id=user_id * 1000 + days,
        user_id=user_id,
        route_name="Route",
        grade=grade,
        result=result,
        attempts=1,
        climbed_on=date(2026, 1, days),
    )


class TestLeaderboard:
    def test_only_sends_count(self) -> None:
        rows = build_leaderboard(
            [(1, "Alex", 3)],
            [
                _achievement(1, "V3", ResultType.SENT, 1),
                _achievement(1, "V6", ResultType.PROJECT, 2),
            ],
        )
        assert rows[0].total_sends == 1
        assert rows[0].best_grade == "V3"

    def test_a_send_scores_the_grade_plus_one(self) -> None:
        rows = build_leaderboard(
            [(1, "Alex", 3)],
            [
                _achievement(1, "V0", days=1),
                _achievement(1, "V4", days=2),
            ],
        )
        assert rows[0].score == 1 + 5

    def test_harder_climbs_rank_higher(self) -> None:
        rows = build_leaderboard(
            [(1, "Easy", 1), (2, "Hard", 5)],
            [
                _achievement(1, "V1", days=1),
                _achievement(2, "V6", days=1),
            ],
        )
        assert rows[0].user_id == 2
        assert rows[0].score > rows[1].score

    def test_ties_share_a_rank_and_the_next_rank_skips(self) -> None:
        rows = build_leaderboard(
            [(1, "A", 2), (2, "B", 2)],
            [
                _achievement(1, "V3", days=1),
                _achievement(2, "V3", days=1),
            ],
        )
        ranked = rank_rows(rows)
        assert [rank for rank, _ in ranked] == [1, 1]

    def test_a_different_first_send_date_breaks_a_tie(self) -> None:
        rows = build_leaderboard(
            [(1, "A", 2), (2, "B", 2)],
            [
                _achievement(1, "V3", days=1),
                _achievement(2, "V3", days=4),
            ],
        )
        ranked = rank_rows(rows)
        assert [rank for rank, _ in ranked] == [1, 2]

    def test_more_sends_beat_a_lower_score(self) -> None:
        rows = build_leaderboard(
            [(1, "A", 2), (2, "B", 2)],
            [
                _achievement(1, "V1", days=1),
                _achievement(1, "V1", days=2),
                _achievement(2, "V5", days=1),
            ],
        )
        ranked = rank_rows(rows)
        # B has a higher score (6) than A (2), so B leads.
        assert ranked[0][1].user_id == 2

    def test_the_first_send_date_breaks_a_remaining_tie(self) -> None:
        rows = build_leaderboard(
            [(1, "Later", 2), (2, "Earlier", 2)],
            [
                _achievement(1, "V3", days=5),
                _achievement(2, "V3", days=2),
            ],
        )
        ranked = rank_rows(rows)
        assert ranked[0][1].user_id == 2

    def test_users_without_sends_are_kept_but_rank_last(self) -> None:
        rows = build_leaderboard([(1, "A", 1), (2, "B", 1)], [_achievement(1, "V2")])
        assert rows[0].user_id == 1
        assert rows[1].user_id == 2
        assert rows[1].total_sends == 0
