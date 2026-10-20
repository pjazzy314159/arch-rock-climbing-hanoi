"""Tests for the security-related configuration and hardening."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.config import Settings, is_production
from app.schemas.auth import MAX_PASSWORD_BYTES, RegisterIn
from app.security import DUMMY_PASSWORD_HASH, hash_password, verify_password


class TestProductionDetection:
    @pytest.mark.parametrize("environment", ["production", "Production", "PROD", " prod "])
    def test_production_names_are_detected(self, environment: str) -> None:
        assert is_production(environment) is True

    @pytest.mark.parametrize("environment", ["development", "test", "staging", ""])
    def test_other_names_are_not_production(self, environment: str) -> None:
        assert is_production(environment) is False


class TestSecretKey:
    def test_the_default_secret_is_refused_in_production(self) -> None:
        with pytest.raises(ValidationError) as error:
            Settings(
                environment="production",
                secret_key="change-me-local-development-only",
            )
        assert "ARCH_SECRET_KEY" in str(error.value)

    def test_the_default_secret_is_allowed_in_development(self) -> None:
        settings = Settings(
            environment="development",
            secret_key="change-me-local-development-only",
        )
        assert settings.secret_key == "change-me-local-development-only"

    def test_a_unique_secret_is_accepted_in_production(self) -> None:
        settings = Settings(environment="production", secret_key="a-real-secret")
        assert settings.secret_key == "a-real-secret"

    def test_the_production_guard_also_applies_to_the_environment_variable(
        self, monkeypatch
    ) -> None:
        monkeypatch.setenv("ARCH_ENVIRONMENT", "production")
        monkeypatch.setenv("ARCH_SECRET_KEY", "change-me-local-development-only")
        with pytest.raises(ValidationError) as error:
            Settings()
        assert "ARCH_SECRET_KEY" in str(error.value)


class TestCorsConfiguration:
    def test_a_wildcard_origin_is_refused(self) -> None:
        with pytest.raises(ValidationError) as error:
            Settings(cors_origins="*")
        assert "CORS_ORIGINS" in str(error.value)

    def test_explicit_origins_are_accepted(self) -> None:
        settings = Settings(cors_origins="http://localhost:8080, https://arch.example")
        assert settings.cors_origin_list == ["http://localhost:8080", "https://arch.example"]


class TestPasswordHandling:
    def test_a_password_longer_than_bcrypt_accepts_is_refused(self) -> None:
        with pytest.raises(ValidationError):
            RegisterIn(
                email="a@example.com",
                full_name="A Person",
                password="x" * (MAX_PASSWORD_BYTES + 1),
            )

    def test_a_password_of_exactly_the_maximum_length_is_accepted(self) -> None:
        registration = RegisterIn(
            email="a@example.com",
            full_name="A Person",
            password="x" * MAX_PASSWORD_BYTES,
        )
        assert len(registration.password) == MAX_PASSWORD_BYTES

    def test_multibyte_passwords_are_measured_in_bytes(self) -> None:
        with pytest.raises(ValidationError):
            RegisterIn(
                email="a@example.com",
                full_name="A Person",
                password="é" * (MAX_PASSWORD_BYTES // 2 + 1),
            )

    def test_passwords_are_hashed_and_salted(self) -> None:
        first = hash_password("a-good-password")
        second = hash_password("a-good-password")
        assert first != second, "each hash must use a fresh salt"
        assert first != "a-good-password"
        assert verify_password("a-good-password", first)
        assert not verify_password("a-wrong-password", first)

    def test_a_malformed_hash_does_not_raise(self) -> None:
        assert verify_password("anything", "not-a-bcrypt-hash") is False


class TestLoginResponses:
    def test_an_unknown_email_and_a_wrong_password_give_the_same_answer(
        self, client: TestClient, customer
    ) -> None:
        unknown = client.post(
            "/api/auth/login",
            json={"email": "nobody@example.com", "password": "whatever-password"},
        )
        wrong = client.post(
            "/api/auth/login",
            json={"email": customer.email, "password": "whatever-password"},
        )
        assert unknown.status_code == wrong.status_code == 401
        assert unknown.json() == wrong.json()

    def test_the_dummy_hash_is_a_usable_bcrypt_hash(self) -> None:
        assert verify_password("not-a-real-password", DUMMY_PASSWORD_HASH) is True


class TestChecklistRequestBody:
    def test_a_checklist_item_can_be_added_with_a_simple_body(
        self, client: TestClient, db, staff
    ) -> None:
        from app.models import StaffTask

        task = StaffTask(title="Reset the slab", assignee_id=staff.id)
        db.add(task)
        db.commit()

        from tests.conftest import auth_headers, login

        token = login(client, staff.email)
        response = client.post(
            f"/api/staff/tasks/{task.id}/checklist",
            json={"label": "Check the holds"},
            headers=auth_headers(token),
        )
        assert response.status_code == 201, response.text
        assert response.json()["label"] == "Check the holds"


class TestDemoSeedGuard:
    def test_demo_accounts_are_refused_in_production(self, db, monkeypatch) -> None:
        from app import seed
        from app.config import get_settings

        settings = get_settings()
        monkeypatch.setattr(settings, "environment", "production", raising=False)
        with pytest.raises(RuntimeError, match="production"):
            seed._seed_demo(db)
