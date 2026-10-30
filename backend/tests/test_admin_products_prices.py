"""Tests for admin product and price CRUD endpoints."""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Price, Product
from tests.conftest import login, auth_headers


def admin_client(client: TestClient, admin_email: str = "admin@example.com") -> TestClient:
    """Return a client with admin authentication headers."""
    token = login(client, admin_email)
    client.headers.update(auth_headers(token))
    return client


def test_admin_products_list_requires_admin(client: TestClient, admin) -> None:
    """Admin products list requires admin role."""
    ac = admin_client(client)
    response = ac.get("/api/admin/products")
    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_admin_products_create_and_list(client: TestClient, admin, db: Session) -> None:
    """Create a product and verify it appears in the admin list."""
    ac = admin_client(client)
    # Create a product
    response = ac.post(
        "/api/admin/products",
        json={
            "sku": "TEST-SKU-001",
            "name": "Test Product",
            "brand": "Test Brand",
            "category": "Test Category",
            "fit": "Test Fit",
            "price_vnd": 100000,
            "description": "A test product",
            "image_url": None,
            "stock": 10,
            "is_active": True,
        },
    )
    assert response.status_code == 201
    product = response.json()
    assert product["sku"] == "TEST-SKU-001"
    assert product["name"] == "Test Product"
    assert product["is_active"] is True

    # Verify it appears in the list
    response = ac.get("/api/admin/products")
    assert response.status_code == 200
    products = response.json()
    assert any(p["sku"] == "TEST-SKU-001" for p in products)


def test_admin_products_create_duplicate_sku_fails(client: TestClient, admin) -> None:
    """Creating a product with duplicate SKU returns 409."""
    ac = admin_client(client)
    # Create first product
    ac.post(
        "/api/admin/products",
        json={
            "sku": "DUPLICATE-SKU",
            "name": "First Product",
            "price_vnd": 100000,
        },
    )

    # Try to create second with same SKU
    response = ac.post(
        "/api/admin/products",
        json={
            "sku": "DUPLICATE-SKU",
            "name": "Second Product",
            "price_vnd": 200000,
        },
    )
    assert response.status_code == 409
    assert "SKU already exists" in response.json()["detail"]


def test_admin_products_update(client: TestClient, admin) -> None:
    """Update a product."""
    ac = admin_client(client)
    # Create a product
    response = ac.post(
        "/api/admin/products",
        json={
            "sku": "UPDATE-TEST",
            "name": "Original Name",
            "price_vnd": 100000,
        },
    )
    assert response.status_code == 201
    product_id = response.json()["id"]

    # Update it
    response = ac.patch(
        f"/api/admin/products/{product_id}",
        json={"name": "Updated Name", "price_vnd": 150000},
    )
    assert response.status_code == 200
    updated = response.json()
    assert updated["name"] == "Updated Name"
    assert updated["price_vnd"] == 150000
    assert updated["sku"] == "UPDATE-TEST"  # Unchanged


def test_admin_products_update_duplicate_sku_fails(client: TestClient, admin) -> None:
    """Updating a product to use an existing SKU returns 409."""
    ac = admin_client(client)
    # Create two products
    r1 = ac.post(
        "/api/admin/products",
        json={"sku": "SKU-1", "name": "Product 1", "price_vnd": 100000},
    )
    r2 = ac.post(
        "/api/admin/products",
        json={"sku": "SKU-2", "name": "Product 2", "price_vnd": 200000},
    )
    id1 = r1.json()["id"]
    id2 = r2.json()["id"]

    # Try to update product 2 to use product 1's SKU
    response = ac.patch(
        f"/api/admin/products/{id2}",
        json={"sku": "SKU-1"},
    )
    assert response.status_code == 409
    assert "SKU already exists" in response.json()["detail"]


def test_admin_products_deactivate(client: TestClient, admin) -> None:
    """Deactivate a product."""
    ac = admin_client(client)
    response = ac.post(
        "/api/admin/products",
        json={"sku": "DEACTIVATE-TEST", "name": "To Deactivate", "price_vnd": 50000},
    )
    product_id = response.json()["id"]

    response = ac.patch(
        f"/api/admin/products/{product_id}",
        json={"is_active": False},
    )
    assert response.status_code == 200
    assert response.json()["is_active"] is False


def test_admin_prices_list_requires_admin(client: TestClient, admin) -> None:
    """Admin prices list requires admin role."""
    ac = admin_client(client)
    response = ac.get("/api/admin/prices")
    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_admin_prices_create_and_list(client: TestClient, admin, db: Session) -> None:
    """Create a price and verify it appears in the admin list."""
    ac = admin_client(client)
    response = ac.post(
        "/api/admin/prices",
        json={
            "category": "Test Category",
            "name": "Test Price",
            "description": "A test price",
            "amount_vnd": 150000,
            "unit": "per visit",
            "sort_order": 1,
            "is_active": True,
        },
    )
    assert response.status_code == 201
    price = response.json()
    assert price["category"] == "Test Category"
    assert price["name"] == "Test Price"
    assert price["amount_vnd"] == 150000
    assert price["is_active"] is True

    response = ac.get("/api/admin/prices")
    assert response.status_code == 200
    prices = response.json()
    assert any(p["name"] == "Test Price" for p in prices)


def test_admin_prices_update(client: TestClient, admin) -> None:
    """Update a price."""
    ac = admin_client(client)
    response = ac.post(
        "/api/admin/prices",
        json={
            "category": "Original",
            "name": "Original Price",
            "amount_vnd": 100000,
            "unit": "per visit",
        },
    )
    assert response.status_code == 201
    price_id = response.json()["id"]

    response = ac.patch(
        f"/api/admin/prices/{price_id}",
        json={"name": "Updated Price", "amount_vnd": 200000},
    )
    assert response.status_code == 200
    updated = response.json()
    assert updated["name"] == "Updated Price"
    assert updated["amount_vnd"] == 200000
    assert updated["category"] == "Original"  # Unchanged


def test_admin_prices_deactivate(client: TestClient, admin) -> None:
    """Deactivate a price."""
    ac = admin_client(client)
    response = ac.post(
        "/api/admin/prices",
        json={"category": "Test", "name": "To Deactivate", "amount_vnd": 50000},
    )
    price_id = response.json()["id"]

    response = ac.patch(
        f"/api/admin/prices/{price_id}",
        json={"is_active": False},
    )
    assert response.status_code == 200
    assert response.json()["is_active"] is False


def test_admin_services_list_requires_admin(client: TestClient, admin) -> None:
    """Admin services list requires admin role."""
    ac = admin_client(client)
    response = ac.get("/api/admin/services")
    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_admin_services_create_and_list(client: TestClient, admin) -> None:
    """Create a service and verify it appears in the admin list."""
    ac = admin_client(client)
    response = ac.post(
        "/api/admin/services",
        json={
            "title": "Test Service",
            "summary": "A test service",
            "icon": "test-icon",
            "sort_order": 1,
            "is_active": True,
        },
    )
    assert response.status_code == 201
    service = response.json()
    assert service["title"] == "Test Service"
    assert service["is_active"] is True

    response = ac.get("/api/admin/services")
    assert response.status_code == 200
    services = response.json()
    assert any(s["title"] == "Test Service" for s in services)


def test_admin_services_update(client: TestClient, admin) -> None:
    """Update a service."""
    ac = admin_client(client)
    response = ac.post(
        "/api/admin/services",
        json={"title": "Original Service", "summary": "Summary", "icon": "icon"},
    )
    assert response.status_code == 201
    service_id = response.json()["id"]

    response = ac.patch(
        f"/api/admin/services/{service_id}",
        json={"title": "Updated Service", "summary": "Updated summary"},
    )
    assert response.status_code == 200
    updated = response.json()
    assert updated["title"] == "Updated Service"
    assert updated["summary"] == "Updated summary"


def test_admin_services_deactivate(client: TestClient, admin) -> None:
    """Deactivate a service."""
    ac = admin_client(client)
    response = ac.post(
        "/api/admin/services",
        json={"title": "To Deactivate", "summary": "Summary", "icon": "icon"},
    )
    service_id = response.json()["id"]

    response = ac.patch(
        f"/api/admin/services/{service_id}",
        json={"is_active": False},
    )
    assert response.status_code == 200
    assert response.json()["is_active"] is False


def test_price_out_includes_is_active(client: TestClient, admin) -> None:
    """Admin price response includes is_active field."""
    ac = admin_client(client)
    response = ac.post(
        "/api/admin/prices",
        json={"category": "Test", "name": "Price", "amount_vnd": 100000},
    )
    price = response.json()
    assert "is_active" in price


def test_service_out_includes_is_active(client: TestClient, admin) -> None:
    """Admin service response includes is_active field."""
    ac = admin_client(client)
    response = ac.post(
        "/api/admin/services",
        json={"title": "Service", "summary": "Summary", "icon": "icon"},
    )
    service = response.json()
    assert "is_active" in service


def test_admin_products_not_found_returns_404(client: TestClient, admin) -> None:
    """Updating a non-existent product returns 404."""
    ac = admin_client(client)
    response = ac.patch("/api/admin/products/99999", json={"name": "Test"})
    assert response.status_code == 404


def test_admin_prices_not_found_returns_404(client: TestClient, admin) -> None:
    """Updating a non-existent price returns 404."""
    ac = admin_client(client)
    response = ac.patch("/api/admin/prices/99999", json={"name": "Test"})
    assert response.status_code == 404


def test_admin_services_not_found_returns_404(client: TestClient, admin) -> None:
    """Updating a non-existent service returns 404."""
    ac = admin_client(client)
    response = ac.patch("/api/admin/services/99999", json={"title": "Test"})
    assert response.status_code == 404


def test_public_prices_unaffected_by_admin_inactive(client: TestClient, admin, db: Session) -> None:
    """Inactive prices are excluded from public endpoint."""
    ac = admin_client(client)
    # Create an active price
    db.add(Price(category="Entry", name="Active Price", amount_vnd=100000, unit="per visit", is_active=True))
    # Create an inactive price
    db.add(Price(category="Entry", name="Inactive Price", amount_vnd=200000, unit="per visit", is_active=False))
    db.commit()

    response = client.get("/api/public/prices")
    assert response.status_code == 200
    prices = response.json()
    names = [p["name"] for p in prices]
    assert "Active Price" in names
    assert "Inactive Price" not in names


def test_public_services_unaffected_by_admin_inactive(client: TestClient, admin, db: Session) -> None:
    """Inactive services are excluded from public endpoint."""
    ac = admin_client(client)
    from app.models import Service

    db.add(Service(title="Active Service", summary="Summary", icon="icon", is_active=True))
    db.add(Service(title="Inactive Service", summary="Summary", icon="icon", is_active=False))
    db.commit()

    response = client.get("/api/public/services")
    assert response.status_code == 200
    services = response.json()
    titles = [s["title"] for s in services]
    assert "Active Service" in titles
    assert "Inactive Service" not in titles


def test_public_products_unaffected_by_admin_inactive(client: TestClient, admin, db: Session) -> None:
    """Inactive products are excluded from public endpoint."""
    ac = admin_client(client)
    db.add(
        Product(sku="ACTIVE-1", name="Active Product", price_vnd=100000, is_active=True)
    )
    db.add(
        Product(sku="INACTIVE-1", name="Inactive Product", price_vnd=200000, is_active=False)
    )
    db.commit()

    response = client.get("/api/public/products")
    assert response.status_code == 200
    products = response.json()
    names = [p["name"] for p in products]
    assert "Active Product" in names
    assert "Inactive Product" not in names


def test_admin_summary_includes_product_count(client: TestClient, admin) -> None:
    """Admin summary includes product count."""
    ac = admin_client(client)
    # Create products via API
    ac.post("/api/admin/products", json={"sku": "COUNT-1", "name": "Product 1", "price_vnd": 100000})
    ac.post("/api/admin/products", json={"sku": "COUNT-2", "name": "Product 2", "price_vnd": 200000})

    response = ac.get("/api/admin/summary")
    assert response.status_code == 200
    summary = response.json()
    assert summary["products"] >= 2


def test_non_admin_cannot_access_products(client: TestClient, customer) -> None:
    """Non-admin users cannot access admin product endpoints."""
    token = login(client, customer.email)
    client.headers.update(auth_headers(token))
    response = client.get("/api/admin/products")
    assert response.status_code == 403


def test_non_admin_cannot_access_prices(client: TestClient, customer) -> None:
    """Non-admin users cannot access admin price endpoints."""
    token = login(client, customer.email)
    client.headers.update(auth_headers(token))
    response = client.get("/api/admin/prices")
    assert response.status_code == 403


def test_non_admin_cannot_access_services(client: TestClient, customer) -> None:
    """Non-admin users cannot access admin service endpoints."""
    token = login(client, customer.email)
    client.headers.update(auth_headers(token))
    response = client.get("/api/admin/services")
    assert response.status_code == 403


def test_staff_cannot_access_products(client: TestClient, staff) -> None:
    """Staff users cannot access admin product endpoints."""
    token = login(client, staff.email)
    client.headers.update(auth_headers(token))
    response = client.get("/api/admin/products")
    assert response.status_code == 403