import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminDashboardPage } from "@/components/arch/staff-pages";
import { adminApi } from "@/services/api";
import type { ApiAdminImage, ApiAdminProduct, ApiRouteSummary, ApiUser, ApiWall } from "@/services/types";

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({ to, children }: { to?: unknown; children?: ReactNode }) => (
      <a href={typeof to === "string" ? to : "#"}>{children}</a>
    ),
  };
});

const adminUser: ApiUser = {
  id: 1,
  email: "admin@example.com",
  full_name: "Arch Admin",
  role: "admin",
  is_active: true,
  phone: null,
  membership_tier: null,
  membership_status: null,
  joined_on: null,
  climbing_level: 0,
};

vi.mock("@/services/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/session")>();
  return {
    ...actual,
    useSession: () => ({
      status: "authenticated",
      user: adminUser,
      error: null,
      signIn: vi.fn(),
      register: vi.fn(),
      signOut: vi.fn(),
      refresh: vi.fn(),
    }),
  };
});

vi.mock("@/services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/api")>();
  return {
    ...actual,
    adminApi: {
      ...actual.adminApi,
      summary: vi.fn(),
      routes: vi.fn(),
      tasks: vi.fn(),
      walls: vi.fn(),
      products: vi.fn(),
      createProduct: vi.fn(),
      updateProduct: vi.fn(),
      createRoute: vi.fn(),
      updateRoute: vi.fn(),
      createWall: vi.fn(),
      updateWall: vi.fn(),
      uploadImage: vi.fn(),
    },
  };
});

const UPLOADED_URL = "https://cdn.arch.example/uploads/photo.png";

function stored(url = UPLOADED_URL): ApiAdminImage {
  return {
    url,
    object_key: "uploads/photo.png",
    content_type: "image/png",
    size_bytes: 12,
    width: null,
    height: null,
  };
}

function product(overrides: Partial<ApiAdminProduct> = {}): ApiAdminProduct {
  return {
    id: 11,
    sku: "SHOE-1",
    name: "Miura",
    brand: "La Sportiva",
    category: "Climbing Shoes",
    fit: "Moderate",
    price_vnd: 100,
    description: "",
    image_url: "https://old.example/old.jpg",
    stock: 1,
    is_active: true,
    ...overrides,
  };
}

function route(overrides: Partial<ApiRouteSummary> = {}): ApiRouteSummary {
  return {
    id: 21,
    name: "Quiet the Mind",
    grade: "V3",
    wall: "The Slab",
    wall_id: null,
    wall_image_url: null,
    wall_type: "slab",
    color: "lime",
    style: "Balance",
    setter: "Minh",
    status: "active",
    set_at: null,
    beta: null,
    image_url: "https://old.example/route.jpg",
    sends: 0,
    vote_count: 0,
    easier_votes: 0,
    as_set_votes: 0,
    harder_votes: 0,
    perceived_grade: null,
    is_fresh: false,
    ...overrides,
  };
}

function wall(overrides: Partial<ApiWall> = {}): ApiWall {
  return {
    id: 31,
    name: "The Slab",
    description: "Low-angle wall",
    image_url: "https://old.example/wall.jpg",
    sort_order: 1,
    is_active: true,
    ...overrides,
  };
}

function renderWithClient(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

async function chooseAndUpload(fileLabel: RegExp) {
  const file = new File(["png-bytes"], "photo.png", { type: "image/png" });
  fireEvent.change(screen.getByLabelText(fileLabel), { target: { files: [file] } });
  fireEvent.click(await screen.findByRole("button", { name: /^Upload$/ }));
  await waitFor(() => expect(adminApi.uploadImage).toHaveBeenCalledWith(file));
}

beforeEach(() => {
  vi.mocked(adminApi.summary).mockResolvedValue({
    members: 0,
    staff: 0,
    active_routes: 0,
    archived_routes: 0,
    open_tasks: 0,
    upcoming_events: 0,
    pending_agreements: 0,
    products: 0,
  });
  vi.mocked(adminApi.routes).mockResolvedValue([]);
  vi.mocked(adminApi.tasks).mockResolvedValue([]);
  vi.mocked(adminApi.walls).mockResolvedValue([]);
  vi.mocked(adminApi.products).mockResolvedValue([]);
  vi.mocked(adminApi.uploadImage).mockResolvedValue(stored());
  vi.mocked(adminApi.createProduct).mockResolvedValue(product());
  vi.mocked(adminApi.updateProduct).mockResolvedValue(product());
  vi.mocked(adminApi.createRoute).mockResolvedValue(route());
  vi.mocked(adminApi.updateRoute).mockResolvedValue(route());
  vi.mocked(adminApi.createWall).mockResolvedValue(wall());
  vi.mocked(adminApi.updateWall).mockResolvedValue(wall());
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("admin image integration", () => {
  it("persists an uploaded image on product creation", async () => {
    renderWithClient(<AdminDashboardPage />);
    fireEvent.click(screen.getByRole("button", { name: "Products" }));
    fireEvent.click(await screen.findByRole("button", { name: "New product" }));

    fireEvent.change(screen.getByPlaceholderText("SHOE-001"), { target: { value: "NEW-1" } });
    fireEvent.change(screen.getByPlaceholderText("Miura VS"), { target: { value: "New shoe" } });
    await chooseAndUpload(/Upload Image/);

    fireEvent.click(screen.getByRole("button", { name: "Create product" }));

    await waitFor(() =>
      expect(adminApi.createProduct).toHaveBeenCalledWith(
        expect.objectContaining({ sku: "NEW-1", name: "New shoe", image_url: UPLOADED_URL }),
      ),
    );
  });

  it("persists a replacement uploaded image on product editing", async () => {
    vi.mocked(adminApi.products).mockResolvedValue([product()]);
    renderWithClient(<AdminDashboardPage />);
    fireEvent.click(screen.getByRole("button", { name: "Products" }));
    fireEvent.click(await screen.findByRole("button", { name: "Edit Miura" }));

    await chooseAndUpload(/Upload Image/);
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(adminApi.updateProduct).toHaveBeenCalledWith(11, { image_url: UPLOADED_URL }),
    );
  });

  it("keeps the previous product image when an upload fails", async () => {
    vi.mocked(adminApi.products).mockResolvedValue([product()]);
    vi.mocked(adminApi.uploadImage).mockRejectedValue(new Error("Storage unavailable"));
    renderWithClient(<AdminDashboardPage />);
    fireEvent.click(screen.getByRole("button", { name: "Products" }));
    fireEvent.click(await screen.findByRole("button", { name: "Edit Miura" }));

    const file = new File(["png-bytes"], "photo.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText(/Upload Image/), { target: { files: [file] } });
    fireEvent.click(await screen.findByRole("button", { name: /^Upload$/ }));

    const alerts = await screen.findAllByRole("alert");
    expect(alerts.some((node) => node.textContent?.includes("Storage unavailable"))).toBe(true);
    const urlInputs = screen.getAllByDisplayValue("https://old.example/old.jpg");
    expect(urlInputs.length).toBeGreaterThan(0);
    expect(adminApi.updateProduct).not.toHaveBeenCalled();
  });

  it("persists an uploaded image on route creation", async () => {
    renderWithClient(<AdminDashboardPage />);
    fireEvent.click(screen.getByRole("button", { name: "Routes" }));

    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "New route" } });
    fireEvent.change(screen.getByLabelText(/^Grade/), { target: { value: "v4" } });
    await chooseAndUpload(/Upload Image/);

    fireEvent.click(screen.getByRole("button", { name: "Publish route" }));

    await waitFor(() =>
      expect(adminApi.createRoute).toHaveBeenCalledWith(
        expect.objectContaining({ name: "New route", grade: "V4", image_url: UPLOADED_URL }),
      ),
    );
  });

  it("persists a replacement uploaded image on route editing", async () => {
    vi.mocked(adminApi.routes).mockResolvedValue([route()]);
    renderWithClient(<AdminDashboardPage />);
    fireEvent.click(screen.getByRole("button", { name: "Routes" }));
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));

    expect(await screen.findByText("Edit route")).toBeInTheDocument();
    await chooseAndUpload(/Route image/);
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(adminApi.updateRoute).toHaveBeenCalledWith(21, { image_url: UPLOADED_URL }),
    );
  });

  it("persists an uploaded image on wall creation", async () => {
    renderWithClient(<AdminDashboardPage />);
    fireEvent.click(screen.getByRole("button", { name: "Walls" }));
    fireEvent.click(await screen.findByRole("button", { name: "Add wall" }));

    fireEvent.change(screen.getByPlaceholderText("The Slab"), {
      target: { value: "New wall" },
    });
    await chooseAndUpload(/Wall image/);
    fireEvent.click(screen.getByRole("button", { name: "Create wall" }));

    await waitFor(() =>
      expect(adminApi.createWall).toHaveBeenCalledWith(
        expect.objectContaining({ name: "New wall", image_url: UPLOADED_URL }),
      ),
    );
  });

  it("persists a replacement uploaded image on wall editing", async () => {
    vi.mocked(adminApi.walls).mockResolvedValue([wall()]);
    renderWithClient(<AdminDashboardPage />);
    fireEvent.click(screen.getByRole("button", { name: "Walls" }));
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));

    expect(await screen.findByText("Edit wall")).toBeInTheDocument();
    await chooseAndUpload(/Wall image/);
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(adminApi.updateWall).toHaveBeenCalledWith(31, { image_url: UPLOADED_URL }),
    );
  });

  it("keeps manual URLs usable without an upload", async () => {
    vi.mocked(adminApi.products).mockResolvedValue([product({ image_url: null })]);
    renderWithClient(<AdminDashboardPage />);
    fireEvent.click(screen.getByRole("button", { name: "Products" }));
    fireEvent.click(await screen.findByRole("button", { name: "Edit Miura" }));

    fireEvent.change(screen.getByPlaceholderText("https://example.com/product-image.jpg"), {
      target: { value: "https://manual.example/image.jpg" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(adminApi.updateProduct).toHaveBeenCalledWith(11, {
        image_url: "https://manual.example/image.jpg",
      }),
    );
    expect(adminApi.uploadImage).not.toHaveBeenCalled();
  });
});
