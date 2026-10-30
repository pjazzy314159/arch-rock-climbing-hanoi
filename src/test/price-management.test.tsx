import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PriceForm, PriceManagementPage, PriceTable } from "@/components/arch/price-management";
import { adminApi, ApiError } from "@/services/api";
import type { ApiAdminPrice } from "@/services/types";

vi.mock("@/services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/api")>();
  return {
    ...actual,
    adminApi: {
      ...actual.adminApi,
      prices: vi.fn(),
      createPrice: vi.fn(),
      updatePrice: vi.fn(),
    },
  };
});

const mockPrices: ApiAdminPrice[] = [
  {
    id: 1,
    category: "Entry",
    name: "Day Pass",
    description: "Full day access",
    amount_vnd: 150000,
    unit: "per visit",
    sort_order: 1,
    is_active: true,
  },
  {
    id: 2,
    category: "Membership",
    name: "Monthly Membership",
    description: "Unlimited visits for 30 days",
    amount_vnd: 1200000,
    unit: "per month",
    sort_order: 2,
    is_active: true,
  },
  {
    id: 3,
    category: "Rental",
    name: "Shoe Rental",
    description: "Climbing shoes per session",
    amount_vnd: 50000,
    unit: "per session",
    sort_order: 3,
    is_active: false,
  },
];

const samplePrice = mockPrices[0]!;

function renderWithClient(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  vi.mocked(adminApi.prices).mockResolvedValue(mockPrices);
  vi.mocked(adminApi.createPrice).mockResolvedValue({ ...samplePrice, id: 4 });
  vi.mocked(adminApi.updatePrice).mockResolvedValue({ ...samplePrice, name: "Updated Price" });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("PriceManagementPage", () => {
  it("renders loading state", () => {
    vi.mocked(adminApi.prices).mockImplementation(() => new Promise(() => {}));
    renderWithClient(<PriceManagementPage />);
    expect(screen.getByText("Loading price entries…")).toBeInTheDocument();
  });

  it("renders price table with data", async () => {
    renderWithClient(<PriceManagementPage />);
    await screen.findByText("Day Pass");
    expect(screen.getByText("Entry")).toBeInTheDocument();
    expect(screen.getByText("150,000")).toBeInTheDocument();
    expect(screen.getByText("per visit")).toBeInTheDocument();
    expect(screen.getAllByText("Active").length).toBeGreaterThan(0);
  });

  it("shows empty state when no prices", async () => {
    vi.mocked(adminApi.prices).mockResolvedValue([]);
    renderWithClient(<PriceManagementPage />);
    await screen.findByText("No price entries yet.");
    expect(
      screen.getByText("Create the first price entry below to start building the price list."),
    ).toBeInTheDocument();
  });

  it("shows error state on API failure", async () => {
    vi.mocked(adminApi.prices).mockRejectedValue(new Error("API down"));
    renderWithClient(<PriceManagementPage />);
    await screen.findByText("Price entries could not be loaded.");
    expect(screen.getByRole("button", { name: /Retry/ })).toBeInTheDocument();
  });

  it("opens the create dialog and creates a price entry", async () => {
    renderWithClient(<PriceManagementPage />);
    await screen.findByText("Day Pass");
    fireEvent.click(screen.getByRole("button", { name: "New price" }));
    fireEvent.change(await screen.findByLabelText(/^Name/), {
      target: { value: "New Price" },
    });
    fireEvent.change(screen.getByLabelText(/^Amount/), { target: { value: "200000" } });
    fireEvent.click(screen.getByRole("button", { name: /Create price entry/ }));

    await screen.findByText("Price entry created.");
    expect(adminApi.createPrice).toHaveBeenCalledWith(
      expect.objectContaining({ name: "New Price", amount_vnd: 200000 }),
    );
  });

  it("edits a price entry from the table", async () => {
    renderWithClient(<PriceManagementPage />);
    await screen.findByText("Day Pass");
    fireEvent.click(screen.getByRole("button", { name: "Edit Day Pass" }));

    const nameInput = await screen.findByLabelText(/^Name/);
    expect(nameInput).toHaveValue("Day Pass");
    fireEvent.change(nameInput, { target: { value: "Day Pass Updated" } });
    fireEvent.click(screen.getByRole("button", { name: /Save changes/ }));

    await vi.waitFor(() =>
      expect(adminApi.updatePrice).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ name: "Day Pass Updated" }),
      ),
    );
  });

  it("toggles price status", async () => {
    renderWithClient(<PriceManagementPage />);
    await screen.findByText("Day Pass");
    fireEvent.click(screen.getByRole("button", { name: "Deactivate Day Pass" }));

    await vi.waitFor(() =>
      expect(adminApi.updatePrice).toHaveBeenCalledWith(1, { is_active: false }),
    );
  });

  it("shows an error when a status change fails", async () => {
    vi.mocked(adminApi.updatePrice).mockRejectedValueOnce(new Error("API down"));
    renderWithClient(<PriceManagementPage />);
    await screen.findByText("Day Pass");
    fireEvent.click(screen.getByRole("button", { name: "Deactivate Day Pass" }));

    await screen.findByText("The price status could not be changed.");
  });
});

describe("PriceTable", () => {
  it("renders price rows with correct data", () => {
    renderWithClient(<PriceTable prices={mockPrices} onEdit={vi.fn()} onToggleActive={vi.fn()} />);
    expect(screen.getByText("Entry")).toBeInTheDocument();
    expect(screen.getByText("Day Pass")).toBeInTheDocument();
    expect(screen.getByText("150,000")).toBeInTheDocument();
    expect(screen.getByText("per visit")).toBeInTheDocument();
    expect(screen.getAllByText("Active").length).toBeGreaterThan(0);
  });

  it("shows inactive status correctly", () => {
    renderWithClient(
      <PriceTable prices={[mockPrices[2]!]} onEdit={vi.fn()} onToggleActive={vi.fn()} />,
    );
    expect(screen.getByText("Inactive")).toHaveClass("status-project");
  });

  it("shows empty notice when no prices", () => {
    renderWithClient(<PriceTable prices={[]} onEdit={vi.fn()} onToggleActive={vi.fn()} />);
    expect(screen.getByText("No price entries yet.")).toBeInTheDocument();
  });

  it("calls onEdit when Edit button clicked", () => {
    const onEdit = vi.fn();
    renderWithClient(
      <PriceTable prices={mockPrices} onEdit={onEdit} onToggleActive={vi.fn()} />,
    );
    fireEvent.click(screen.getAllByRole("button", { name: /Edit/ })[0]!);
    expect(onEdit).toHaveBeenCalledWith(samplePrice);
  });

  it("calls onToggleActive when Activate/Deactivate button clicked", () => {
    const onToggle = vi.fn();
    renderWithClient(
      <PriceTable prices={mockPrices} onEdit={vi.fn()} onToggleActive={onToggle} />,
    );
    fireEvent.click(screen.getAllByRole("button", { name: /Deactivate|Activate/ })[0]!);
    expect(onToggle).toHaveBeenCalledWith(samplePrice);
  });
});

describe("PriceForm (create mode)", () => {
  function renderCreate(onSaved = vi.fn()) {
    return renderWithClient(
      <PriceForm
        submitLabel="Create price entry"
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
    expect(screen.getByLabelText("Category")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Name/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Amount/)).toBeInTheDocument();
    expect(screen.getByLabelText("Unit")).toBeInTheDocument();
    expect(screen.getByLabelText("Sort Order")).toBeInTheDocument();
    expect(screen.getByLabelText("Status")).toBeInTheDocument();
  });

  it("shows validation error for missing name", async () => {
    renderCreate();
    submitForm();
    await screen.findByText("Name is required.");
    expect(adminApi.createPrice).not.toHaveBeenCalled();
  });

  it("shows validation error for negative amount", async () => {
    renderCreate();
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "Test" } });
    fireEvent.change(screen.getByLabelText(/^Amount/), { target: { value: "-100" } });
    submitForm();
    await screen.findByText("Amount must be a non-negative number.");
  });

  it("shows validation error for negative sort order", async () => {
    renderCreate();
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "Test" } });
    fireEvent.change(screen.getByLabelText("Sort Order"), { target: { value: "-5" } });
    submitForm();
    await screen.findByText("Sort order must be a non-negative number.");
  });

  it("calls createPrice and shows success", async () => {
    renderCreate();
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "New Price" } });
    fireEvent.change(screen.getByLabelText(/^Amount/), { target: { value: "200000" } });
    fireEvent.click(screen.getByRole("button", { name: /Create price entry/ }));

    await screen.findByText("Price entry created.");
    expect(adminApi.createPrice).toHaveBeenCalledWith(
      expect.objectContaining({ name: "New Price", amount_vnd: 200000 }),
    );
  });

  it("shows API error on create failure", async () => {
    vi.mocked(adminApi.createPrice).mockRejectedValueOnce(new Error("API down"));
    renderCreate();
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "Test" } });
    fireEvent.change(screen.getByLabelText(/^Amount/), { target: { value: "100000" } });
    fireEvent.click(screen.getByRole("button", { name: /Create price entry/ }));
    await screen.findByText("The price entry could not be saved.");
  });

  it("disables submit while pending", async () => {
    let resolveCreate!: (value: ApiAdminPrice) => void;
    const createPromise = new Promise<ApiAdminPrice>((resolve) => {
      resolveCreate = resolve;
    });
    vi.mocked(adminApi.createPrice).mockReturnValueOnce(createPromise);
    renderCreate();
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "Test" } });
    fireEvent.change(screen.getByLabelText(/^Amount/), { target: { value: "100000" } });
    fireEvent.click(screen.getByRole("button", { name: /Create price entry/ }));

    expect(document.querySelector('form button[type="submit"]')).toBeDisabled();
    resolveCreate({ ...samplePrice, id: 9 });
    await screen.findByText("Price entry created.");
  });
});

describe("PriceForm (edit mode)", () => {
  it("pre-fills data when editing", () => {
    renderWithClient(
      <PriceForm
        price={samplePrice}
        submitLabel="Save changes"
        onSaved={vi.fn()}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(/^Name/)).toHaveValue(samplePrice.name);
    expect(screen.getByLabelText(/^Description/)).toHaveValue(samplePrice.description);
    expect(screen.getByLabelText(/^Amount/)).toHaveValue(samplePrice.amount_vnd);
    expect(screen.getByLabelText("Sort Order")).toHaveValue(samplePrice.sort_order);
  });

  it("calls updatePrice and shows success", async () => {
    const onSaved = vi.fn();
    renderWithClient(
      <PriceForm
        price={samplePrice}
        submitLabel="Save changes"
        onSaved={onSaved}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "Updated Day Pass" } });
    fireEvent.click(screen.getByRole("button", { name: /Save changes/ }));

    await screen.findByText("Price entry updated.");
    expect(onSaved).toHaveBeenCalled();
    expect(adminApi.updatePrice).toHaveBeenCalledWith(1, { name: "Updated Day Pass" });
  });

  it("shows validation error for negative amount when editing", async () => {
    renderWithClient(
      <PriceForm
        price={samplePrice}
        submitLabel="Save changes"
        onSaved={vi.fn()}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText(/^Amount/), { target: { value: "-10" } });
    fireEvent.submit(document.querySelector("form")!);
    await screen.findByText("Amount must be a non-negative number.");
  });

  it("shows API error on update failure", async () => {
    vi.mocked(adminApi.updatePrice).mockRejectedValueOnce(new Error("API down"));
    renderWithClient(
      <PriceForm
        price={samplePrice}
        submitLabel="Save changes"
        onSaved={vi.fn()}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "Changed" } });
    fireEvent.click(screen.getByRole("button", { name: /Save changes/ }));
    await screen.findByText("The price entry could not be saved.");
  });
});
