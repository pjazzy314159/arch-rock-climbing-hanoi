"""Tests for the demo seed.

The seed is what a new machine runs first, so it has to work on an empty
database, work on a database the migration has already filled, and produce the
same result both times.
"""

from __future__ import annotations

import pytest
from sqlalchemy.orm import Session

from app.models import ClimbRoute, Wall, WallType
from app.seed import WALL_PHOTO, _seed_demo


def test_the_demo_seed_creates_the_walls(db: Session) -> None:
    _seed_demo(db)
    db.commit()

    walls = db.query(Wall).order_by(Wall.sort_order).all()
    assert [wall.name for wall in walls] == ["The Main Wall", "The Slab", "The Cave"]
    # Every wall carries a description, an ordering and a photograph reference.
    for wall in walls:
        assert wall.description
        assert wall.image_url == WALL_PHOTO
        assert wall.is_active is True


def test_the_demo_seed_points_each_route_at_its_wall(db: Session) -> None:
    _seed_demo(db)
    db.commit()

    routes = db.query(ClimbRoute).order_by(ClimbRoute.id).all()
    assert len(routes) == 6
    for route in routes:
        assert route.wall is not None, route.name
        assert route.wall_type in set(WallType)


def test_the_demo_seed_gives_the_routes_their_wall_type(db: Session) -> None:
    _seed_demo(db)
    db.commit()

    types = {
        route.name: route.wall_type for route in db.query(ClimbRoute).order_by(ClimbRoute.id).all()
    }
    assert types["Quiet the Mind"] is WallType.SLAB
    assert types["Against the Grain"] is WallType.OVERHANG
    assert types["Little by Little"] is WallType.VERTICAL


def test_the_demo_seed_is_idempotent(db: Session) -> None:
    _seed_demo(db)
    db.commit()
    _seed_demo(db)
    db.commit()

    assert db.query(Wall).count() == 3
    assert db.query(ClimbRoute).count() == 6


def test_the_demo_seed_fills_in_a_wall_the_migration_already_created(db: Session) -> None:
    """The migration creates the walls, without a photograph.

    The seed still has to bring such a wall up to date rather than skip it.
    """
    existing = Wall(name="The Slab", description="", sort_order=99)
    db.add(existing)
    db.commit()

    _seed_demo(db)
    db.commit()

    db.refresh(existing)
    assert existing.description == "Low-angle wall for balance and technique."
    assert existing.sort_order == 2
    assert existing.image_url == WALL_PHOTO


def test_the_demo_seed_keeps_a_photograph_that_is_already_published(db: Session) -> None:
    """A wall that already has a picture is not given the placeholder."""
    existing = Wall(
        name="The Slab",
        description="Low-angle wall for balance and technique.",
        sort_order=2,
        image_url="https://media.example.com/slab.jpg",
    )
    db.add(existing)
    db.commit()

    _seed_demo(db)
    db.commit()

    db.refresh(existing)
    assert existing.image_url == "https://media.example.com/slab.jpg"


@pytest.mark.parametrize("environment", ["production", "prod"])
def test_the_demo_seed_refuses_a_production_environment(
    db: Session, monkeypatch: pytest.MonkeyPatch, environment: str
) -> None:
    """The demo accounts use known passwords, so they must never reach production."""
    from app.config import get_settings

    settings = get_settings().model_copy(update={"environment": environment})
    monkeypatch.setattr("app.config.get_settings", lambda: settings)

    with pytest.raises(RuntimeError):
        _seed_demo(db)
