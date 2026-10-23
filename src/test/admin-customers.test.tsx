import { fireEvent, render, screen, within } from "@testing-library/react";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  CustomerDetailView,
  CustomerDirectory,
  type CustomerDirectoryProps,
} from "@/components/arch/customer-pages";
import type { ApiAdminCustomer, ApiAdminCustomerDetail } from "@/services/types";

const customer: ApiAdminCustomer = {
  id: 7,
  email: "alex@example.com",
  full_name: "Alex Nguyen",
  role: "customer",
  is_active: true,
  membership_tier: null,
  membership_status: null,
  joined_on: null,
  agreement_status: "signed",
  total_sends: 3,
  created_at: "2026-01-05T09:00:00Z",
  last_climb_on: "2026-10-20",
};

const detail: ApiAdminCustomerDetail = {
  ...customer,
  phone: "0901234567",
  climbing_level: 4,
  agreement: {
    id: 2,
    version: "2026-01",
    status: "signed",
    method: "digital_signature",
    signed_at: "2026-01-06T10:00:00Z",
    signed_name: "Alex Nguyen",
    notes: null,
  },
  activity: {
    sends: 3,
    flashes: 1,
    projects: 1,
    attempts: 8,
    total_climbs: 4,
  },
  recent_attempts: [
    {
      id: 51,
      route_id: 1,
      route_name: "Quiet the Mind",
      grade: "V3",
      result: "sent",
      attempts: 1,
      climbed_on: "2026-10-20",
      created_at: "2026-10-20T12:00:00Z",
    },
  ],
  recent_contact_messages: [
    {
      id: 9,
      subject: "Opening hours",
      handled: true,
      created_at: "2026-10-19T08:00:00Z",
    },
  ],
  contact_history_note:
    "Contact messages are not linked to customer accounts. These are recent messages using the same email address.",
};

function directoryProps(overrides: Partial<CustomerDirectoryProps> = {}): CustomerDirectoryProps {
  return {
    items: [customer],
    total: 1,
    loading: false,
    error: null,
    search: "",
    role: "",
    offset: 0,
    limit: 20,
    onSearch: vi.fn(),
    onRole: vi.fn(),
    onPage: vi.fn(),
    onRetry: vi.fn(),
    ...overrides,
  };
}

async function renderAt(ui: ReactNode, expected: RegExp) {
  const rootRoute = createRootRoute();
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <>{ui}</>,
  });
  const stubs = ["/admin", "/admin/customers/$customerId", "/routes/$routeId"].map((path) =>
    createRoute({ getParentRoute: () => rootRoute, path, component: () => null }),
  );
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, ...stubs]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });

  render(<RouterProvider router={router} />);
  await screen.findByText(expected);
  return router;
}

describe("the administrator customer directory", () => {
  it("shows safe, linked customer rows and identifies demo accounts", async () => {
    await renderAt(<CustomerDirectory {...directoryProps()} />, /Alex Nguyen/);

    const link = screen.getByRole("link", { name: "Alex Nguyen" });
    expect(link.getAttribute("href")).toBe("/admin/customers/7");
    expect(screen.getByText("alex@example.com")).toBeTruthy();
    expect(screen.getByLabelText("Demo account")).toBeTruthy();
    expect(screen.getByText("signed")).toBeTruthy();
    expect(screen.getByText("Not recorded")).toBeTruthy();
    expect(screen.getByText("2026-10-20")).toBeTruthy();
    expect(screen.getByText("Page 1 of 1")).toBeTruthy();
    expect(screen.queryByText(/password_hash/i)).toBeNull();
  });

  it("shows an empty state rather than inventing customers", async () => {
    await renderAt(
      <CustomerDirectory {...directoryProps({ items: [], total: 0 })} />,
      /No customers match this search/,
    );

    expect(screen.getByText(/Try a different name/)).toBeTruthy();
    expect(screen.getByText("0 customers")).toBeTruthy();
  });

  it("shows a retryable error state", async () => {
    const onRetry = vi.fn();
    await renderAt(
      <CustomerDirectory
        {...directoryProps({ items: [], total: 0, error: "The backend is unavailable.", onRetry })}
      />,
      /Customers could not be loaded/,
    );

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("shows a loading state while the directory is pending", async () => {
    await renderAt(
      <CustomerDirectory {...directoryProps({ items: [], total: 0, loading: true })} />,
      /Loading customers/,
    );
  });

  it("sends search, role and paging changes back to the caller", async () => {
    const onSearch = vi.fn();
    const onRole = vi.fn();
    const onPage = vi.fn();
    await renderAt(
      <CustomerDirectory {...directoryProps({ total: 45, onSearch, onRole, onPage })} />,
      /Page 1 of 3/,
    );

    fireEvent.change(screen.getByLabelText("Search customers"), {
      target: { value: "Alex" },
    });
    expect(onSearch).toHaveBeenCalledWith("Alex");

    fireEvent.change(screen.getByLabelText("Filter by role"), {
      target: { value: "staff" },
    });
    expect(onRole).toHaveBeenCalledWith("staff");

    fireEvent.click(screen.getByRole("button", { name: /Next/ }));
    expect(onPage).toHaveBeenCalledWith(20);
  });
});

describe("the administrator customer detail", () => {
  it("distinguishes recorded account, agreement and climbing data", async () => {
    await renderAt(
      <CustomerDetailView customer={detail} loading={false} error={null} onRetry={vi.fn()} />,
      /Account created/,
    );

    expect(screen.getByText("0901234567")).toBeTruthy();
    expect(screen.getByText("V4")).toBeTruthy();
    expect(screen.getByText("digital_signature")).toBeTruthy();
    expect(screen.getByText("Quiet the Mind")).toBeTruthy();
    expect(screen.getByText("Opening hours")).toBeTruthy();
    expect(screen.getByText(/not linked to customer accounts/)).toBeTruthy();
    expect(screen.getByText(/10 most recent climbs/)).toBeTruthy();
  });

  it("says when there is no agreement or activity instead of showing a false negative", async () => {
    const empty: ApiAdminCustomerDetail = {
      ...detail,
      agreement: null,
      agreement_status: null,
      activity: { sends: 0, flashes: 0, projects: 0, attempts: 0, total_climbs: 0 },
      recent_attempts: [],
      recent_contact_messages: [],
      last_climb_on: null,
    };
    await renderAt(
      <CustomerDetailView customer={empty} loading={false} error={null} onRetry={vi.fn()} />,
      /No safety agreement/,
    );

    expect(screen.getByText(/No climbs are recorded/)).toBeTruthy();
    expect(screen.getByText(/No climbs recorded/)).toBeTruthy();
    expect(screen.getByText(/No contact messages/)).toBeTruthy();
    expect(screen.getAllByText("Not recorded").length).toBeGreaterThan(0);
  });

  it("shows a not-found error with a retry action", async () => {
    const onRetry = vi.fn();
    await renderAt(
      <CustomerDetailView
        customer={null}
        loading={false}
        error="That customer record does not exist."
        onRetry={onRetry}
      />,
      /Customer record unavailable/,
    );

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
