# ARCH database migrations

Alembic migrations for the ARCH backend. The database URL is read from the
application settings (`DATABASE_URL`), so `alembic` always targets the same
database as the API.

```bash
# Apply every pending migration
uv run alembic upgrade head

# Create a new migration after changing the models
uv run alembic revision --autogenerate -m "describe the change"

# Roll back one revision
uv run alembic downgrade -1

# Show the current revision
uv run alembic current
```
