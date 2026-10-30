import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ServicesManagementPage } from "@/components/arch/services-management";
import { adminApi, ApiError } from "@/services/api";
import type { ApiAdminService } from "@/services/types";

vi.mock("@/services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/api")>();
  return {
    ...actual,
    adminApi: {
      ...actual.adminApi,
      services: vi.fn(),
      createService: vi.fn(),
      updateService: vi.fn(),
      deleteService: vi.fn(),
    },
  };
});

const mockServices: ApiAdminService[] = [
  {
    id: 1,
    title: "Bouldering",
    summary: "Climbing on boulders.",
    icon: "mountain",
    sort_order: 1,
    is_active: true,
  },
  {
    id: 2,
    title: "Coaching",
    summary: "Professional coaching.",
    icon: "star",
    sort_order: 2,
    is_active: false,
  },
];

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><ServicesManagementPage /></QueryClientProvider>);
}

beforeEach(() => {
  vi.mocked(adminApi.services).mockResolvedValue(mockServices);
  vi.mocked(adminApi.createService).mockResolvedValue({ ...mockServices[0]!, id: 3 });
  vi.mocked(adminApi.updateService).mockResolvedValue(mockServices[0]!);
  vi.mocked(adminApi.deleteService).mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("ServicesManagementPage", () => {
  it("renders active and inactive services", async () => {
    renderPage();
    await screen.findByText("Bouldering");
    expect(screen.getByText("Coaching")).toBeInTheDocument();
    expect(screen.getByText("Inactive")).toBeInTheDocument();
  });

  it("creates a service", async () => {
    renderPage();
    await screen.findByText("Bouldering");
    fireEvent.click(screen.getByRole("button", { name: /New service/ }));
    fireEvent.change(await screen.findByLabelText(/^Title/), { target: { value: "Yoga" } });
    fireEvent.click(await screen.findByRole("button", { name: /Create service/ }));
    await screen.findByText("Service added.");
    expect(adminApi.createService).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Yoga", is_active: true }),
    );
  });

  it("deletes a service", async () => {
    renderPage();
    await screen.findByText("Bouldering");
    fireEvent.click(screen.getByRole("button", { name: /Delete Bouldering/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Delete/ }));
    await screen.findByText("Service \"Bouldering\" deleted.");
    expect(adminApi.deleteService).toHaveBeenCalledWith(1);
  });

  it("shows load error", async () => {
    vi.mocked(adminApi.services).mockRejectedValue(new Error("API down"));
    renderPage();
    await screen.findByText("Services could not be loaded.");
  });
});
