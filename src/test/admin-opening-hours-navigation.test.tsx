import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminDashboardPage } from "@/components/arch/staff-pages";
import { adminApi } from "@/services/api";
import type { ApiUser } from "@/services/types";

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
      openingHours: vi.fn(),
    },
  };
});

function renderWithClient(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
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
  vi.mocked(adminApi.openingHours).mockResolvedValue([]);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("admin opening-hours navigation", () => {
  it("opens the opening-hours management page from the admin tabs", async () => {
    renderWithClient(<AdminDashboardPage />);
    fireEvent.click(screen.getByRole("button", { name: "Opening hours" }));

    expect(await screen.findByText("Opening hours management.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /New opening hour/ })).toBeInTheDocument();
    expect(adminApi.openingHours).toHaveBeenCalled();
  });
});
