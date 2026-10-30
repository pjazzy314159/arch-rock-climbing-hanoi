import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ProductForm,
  ProductManagementPage,
  ProductTable,
} from "@/components/arch/product-management";
import { adminApi, ApiError } from "@/services/api";
import type { ApiAdminProduct } from "@/services/types";

vi.mock("@/services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/api")>();
  return {
    ...actual,
    adminApi: {
      ...actual.adminApi,
      products: vi.fn(),
      createProduct: vi.fn(),
      updateProduct: vi.fn(),
    },
  };
});

const mockProducts: ApiAdminProduct[] = [
  {
    id: 1,
    sku: "SHOE-001",
    name: "Miura VS",
    brand: "La Sportiva",
    category: "Climbing Shoes",
    fit: "Tight",
    price_vnd: 3500000,
    description: "High-performance climbing shoe",
    image_url: "https://example.com/miura.jpg",
    stock: 5,
    is_active: true,
  },
  {
    id: 2,
    sku: "CHALK-001",
    name: "Loose Chalk 300g",
    brand: "ARCH",
    category: "Chalk",
    fit: "Moderate",
    price_vnd: 150000,
    description: "Pure magnesium carbonate",
    image_url: null,
    stock: 20,
    is_active: true,
  },
  {
    id: 3,
    sku: "SHIRT-001",
    name: "ARCH Logo Tee",
    brand: "ARCH",
    category: "Apparel",
    fit: "Relaxed",
    price_vnd: 350000,
    description: "Cotton t-shirt",
    image_url: "https://example.com/tee.jpg",
    stock: 0,
    is_active: false,
  },
];

const sampleProduct = mockProducts[0]!;

function renderWithClient(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  vi.mocked(adminApi.products).mockResolvedValue(mockProducts);
  vi.mocked(adminApi.createProduct).mockResolvedValue({ ...sampleProduct, id: 4 });
  vi.mocked(adminApi.updateProduct).mockResolvedValue({ ...sampleProduct, name: "Updated" });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("ProductManagementPage", () => {
  it("renders loading state", () => {
    vi.mocked(adminApi.products).mockImplementation(() => new Promise(() => {}));
    renderWithClient(<ProductManagementPage />);
    expect(screen.getByText("Loading products…")).toBeInTheDocument();
  });

  it("renders product table with data", async () => {
    renderWithClient(<ProductManagementPage />);
    await screen.findByText("Miura VS");
    expect(screen.getByText("La Sportiva")).toBeInTheDocument();
    expect(screen.getByText("3,500,000")).toBeInTheDocument();
    expect(screen.getAllByText("Active").length).toBeGreaterThan(0);
  });

  it("shows empty state when no products", async () => {
    vi.mocked(adminApi.products).mockResolvedValue([]);
    renderWithClient(<ProductManagementPage />);
    await screen.findByText("No products yet.");
    expect(
      screen.getByText("Create the first product below to start building the catalogue."),
    ).toBeInTheDocument();
  });

  it("shows error state on API failure", async () => {
    vi.mocked(adminApi.products).mockRejectedValue(new Error("API down"));
    renderWithClient(<ProductManagementPage />);
    await screen.findByText("Products could not be loaded.");
    expect(screen.getByRole("button", { name: /Retry/ })).toBeInTheDocument();
  });

  it("opens the create dialog and creates a product", async () => {
    renderWithClient(<ProductManagementPage />);
    await screen.findByText("Miura VS");
    fireEvent.click(screen.getByRole("button", { name: "New product" }));
    fireEvent.change(await screen.findByLabelText(/^SKU/), {
      target: { value: "NEW-001" },
    });
    fireEvent.change(screen.getByLabelText(/^Name/), {
      target: { value: "New Product" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Create product/ }));

    await screen.findByText("Product created.");
    expect(adminApi.createProduct).toHaveBeenCalledWith(
      expect.objectContaining({ sku: "NEW-001", name: "New Product" }),
    );
  });

  it("edits a product from the table", async () => {
    renderWithClient(<ProductManagementPage />);
    await screen.findByText("Miura VS");
    fireEvent.click(screen.getByRole("button", { name: "Edit Miura VS" }));

    const nameInput = await screen.findByLabelText(/^Name/);
    expect(nameInput).toHaveValue("Miura VS");
    fireEvent.change(nameInput, { target: { value: "Miura VS Updated" } });
    fireEvent.click(screen.getByRole("button", { name: /Save changes/ }));

    await vi.waitFor(() =>
      expect(adminApi.updateProduct).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ name: "Miura VS Updated" }),
      ),
    );
  });

  it("toggles product status after confirmation", async () => {
    renderWithClient(<ProductManagementPage />);
    await screen.findByText("Miura VS");
    fireEvent.click(screen.getByRole("button", { name: "Deactivate Miura VS" }));
    fireEvent.click(await screen.findByRole("button", { name: "Deactivate" }));

    await vi.waitFor(() =>
      expect(adminApi.updateProduct).toHaveBeenCalledWith(1, { is_active: false }),
    );
  });

  it("shows an error when a status change fails", async () => {
    vi.mocked(adminApi.updateProduct).mockRejectedValueOnce(new Error("API down"));
    renderWithClient(<ProductManagementPage />);
    await screen.findByText("Miura VS");
    fireEvent.click(screen.getByRole("button", { name: "Deactivate Miura VS" }));
    fireEvent.click(await screen.findByRole("button", { name: "Deactivate" }));

    await screen.findByText("The product status could not be changed.");
  });
});

describe("ProductTable", () => {
  it("renders product rows with correct data", () => {
    renderWithClient(
      <ProductTable products={mockProducts} onEdit={vi.fn()} onToggleActive={vi.fn()} />,
    );
    expect(screen.getByText("SHOE-001")).toBeInTheDocument();
    expect(screen.getByText("Miura VS")).toBeInTheDocument();
    expect(screen.getByText("La Sportiva")).toBeInTheDocument();
    expect(screen.getByText("Climbing Shoes")).toBeInTheDocument();
    expect(screen.getByText("3,500,000")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("shows inactive status correctly", () => {
    renderWithClient(
      <ProductTable products={[mockProducts[2]!]} onEdit={vi.fn()} onToggleActive={vi.fn()} />,
    );
    expect(screen.getByText("Inactive")).toHaveClass("status-project");
  });

  it("shows empty notice when no products", () => {
    renderWithClient(<ProductTable products={[]} onEdit={vi.fn()} onToggleActive={vi.fn()} />);
    expect(screen.getByText("No products yet.")).toBeInTheDocument();
  });

  it("calls onEdit when Edit button clicked", () => {
    const onEdit = vi.fn();
    renderWithClient(
      <ProductTable products={mockProducts} onEdit={onEdit} onToggleActive={vi.fn()} />,
    );
    fireEvent.click(screen.getAllByRole("button", { name: /Edit/ })[0]!);
    expect(onEdit).toHaveBeenCalledWith(sampleProduct);
  });

  it("calls onToggleActive when Activate/Deactivate button clicked", () => {
    const onToggle = vi.fn();
    renderWithClient(
      <ProductTable products={mockProducts} onEdit={vi.fn()} onToggleActive={onToggle} />,
    );
    fireEvent.click(screen.getAllByRole("button", { name: /Deactivate|Activate/ })[0]!);
    expect(onToggle).toHaveBeenCalledWith(sampleProduct);
  });
});

describe("ProductForm (create mode)", () => {
  function renderCreate(onSaved = vi.fn()) {
    return renderWithClient(
      <ProductForm
        submitLabel="Create product"
        onSaved={onSaved}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );
  }

  function submitForm() {
    fireEvent.submit(document.querySelector("form")!);
  }

  it("renders create form with required fields", () => {
    renderCreate();
    expect(screen.getByLabelText(/^SKU/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Name/)).toBeInTheDocument();
    expect(screen.getByLabelText("Brand")).toBeInTheDocument();
    expect(screen.getByLabelText("Category")).toBeInTheDocument();
    expect(screen.getByLabelText("Fit")).toBeInTheDocument();
    expect(screen.getByLabelText("Price (VND)")).toBeInTheDocument();
    expect(screen.getByLabelText("Stock")).toBeInTheDocument();
    expect(screen.getByLabelText("Status")).toBeInTheDocument();
  });

  it("shows validation error for missing SKU", async () => {
    renderCreate();
    submitForm();
    await screen.findByText("SKU is required.");
    expect(adminApi.createProduct).not.toHaveBeenCalled();
  });

  it("shows validation error for missing name", async () => {
    renderCreate();
    fireEvent.change(screen.getByLabelText(/^SKU/), { target: { value: "TEST-001" } });
    submitForm();
    await screen.findByText("Name is required.");
  });

  it("shows validation error for negative price", async () => {
    renderCreate();
    fireEvent.change(screen.getByLabelText(/^SKU/), { target: { value: "TEST-001" } });
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "Test" } });
    fireEvent.change(screen.getByLabelText("Price (VND)"), { target: { value: "-100" } });
    submitForm();
    await screen.findByText("Price must be a non-negative number.");
  });

  it("shows validation error for negative stock", async () => {
    renderCreate();
    fireEvent.change(screen.getByLabelText(/^SKU/), { target: { value: "TEST-001" } });
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "Test" } });
    fireEvent.change(screen.getByLabelText("Stock"), { target: { value: "-5" } });
    submitForm();
    await screen.findByText("Stock must be a non-negative number.");
  });

  it("calls createProduct and shows success", async () => {
    renderCreate();
    fireEvent.change(screen.getByLabelText(/^SKU/), { target: { value: "NEW-001" } });
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "New Product" } });
    fireEvent.click(screen.getByRole("button", { name: /Create product/ }));

    await screen.findByText("Product created.");
    expect(adminApi.createProduct).toHaveBeenCalledWith(
      expect.objectContaining({ sku: "NEW-001", name: "New Product" }),
    );
  });

  it("shows API error on create failure", async () => {
    vi.mocked(adminApi.createProduct).mockRejectedValueOnce(new Error("API down"));
    renderCreate();
    fireEvent.change(screen.getByLabelText(/^SKU/), { target: { value: "TEST-001" } });
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "Test" } });
    fireEvent.click(screen.getByRole("button", { name: /Create product/ }));
    await screen.findByText("The product could not be saved.");
  });

  it("shows duplicate SKU error", async () => {
    vi.mocked(adminApi.createProduct).mockRejectedValueOnce(
      new ApiError("Conflict", 409),
    );
    renderCreate();
    fireEvent.change(screen.getByLabelText(/^SKU/), { target: { value: "SHOE-001" } });
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "Test" } });
    fireEvent.click(screen.getByRole("button", { name: /Create product/ }));
    await screen.findByText("A product with this SKU already exists.");
  });

  it("disables submit while pending", async () => {
    let resolveCreate!: (value: ApiAdminProduct) => void;
    const createPromise = new Promise<ApiAdminProduct>((resolve) => {
      resolveCreate = resolve;
    });
    vi.mocked(adminApi.createProduct).mockReturnValueOnce(createPromise);
    const { container: _container } = renderCreate();
    fireEvent.change(screen.getByLabelText(/^SKU/), { target: { value: "TEST-001" } });
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "Test" } });
    fireEvent.click(screen.getByRole("button", { name: /Create product/ }));

    expect(document.querySelector('form button[type="submit"]')).toBeDisabled();
    resolveCreate({ ...sampleProduct, id: 9 });
    await screen.findByText("Product created.");
  });
});

describe("ProductForm (edit mode)", () => {
  it("pre-fills data when editing", () => {
    renderWithClient(
      <ProductForm
        product={sampleProduct}
        submitLabel="Save changes"
        onSaved={vi.fn()}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(/^SKU/)).toHaveValue(sampleProduct.sku);
    expect(screen.getByLabelText(/^Name/)).toHaveValue(sampleProduct.name);
    expect(screen.getByLabelText("Brand")).toHaveValue(sampleProduct.brand);
    expect(screen.getByLabelText("Price (VND)")).toHaveValue(sampleProduct.price_vnd);
    expect(screen.getByLabelText("Stock")).toHaveValue(sampleProduct.stock);
  });

  it("shows validation error for missing name when editing", async () => {
    renderWithClient(
      <ProductForm
        product={sampleProduct}
        submitLabel="Save changes"
        onSaved={vi.fn()}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "" } });
    fireEvent.submit(document.querySelector("form")!);
    await screen.findByText("Name is required.");
  });

  it("calls updateProduct with only changed fields", async () => {
    const onSaved = vi.fn();
    renderWithClient(
      <ProductForm
        product={sampleProduct}
        submitLabel="Save changes"
        onSaved={onSaved}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "Updated Miura" } });
    fireEvent.click(screen.getByRole("button", { name: /Save changes/ }));

    await screen.findByText("Product updated.");
    expect(onSaved).toHaveBeenCalled();
    expect(adminApi.updateProduct).toHaveBeenCalledWith(1, { name: "Updated Miura" });
  });

  it("shows API error on update failure", async () => {
    vi.mocked(adminApi.updateProduct).mockRejectedValueOnce(new Error("API down"));
    renderWithClient(
      <ProductForm
        product={sampleProduct}
        submitLabel="Save changes"
        onSaved={vi.fn()}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "Changed" } });
    fireEvent.click(screen.getByRole("button", { name: /Save changes/ }));
    await screen.findByText("The product could not be saved.");
  });
});
