import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RulesManagementPage } from "@/components/arch/rules-management";
import { adminApi, ApiError } from "@/services/api";
import type { ApiRule } from "@/services/types";

vi.mock("@/services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/api")>();
  return {
    ...actual,
    adminApi: {
      ...actual.adminApi,
      rules: vi.fn(),
      createRule: vi.fn(),
      updateRule: vi.fn(),
      deleteRule: vi.fn(),
    },
  };
});

const mockRules: ApiRule[] = [
  {
    id: 1,
    title: "No shoes on pads",
    body: "Keep climbing shoes off crash pads.",
    category: "Safety",
    sort_order: 1,
    is_active: true,
    is_confirmed: true,
  },
  {
    id: 2,
    title: "No food near walls",
    body: "Keep snacks away from climbing surfaces.",
    category: "General",
    sort_order: 2,
    is_active: false,
    is_confirmed: false,
  },
];

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><RulesManagementPage /></QueryClientProvider>);
}

beforeEach(() => {
  vi.mocked(adminApi.rules).mockResolvedValue(mockRules);
  vi.mocked(adminApi.createRule).mockResolvedValue({ ...mockRules[0]!, id: 3 });
  vi.mocked(adminApi.updateRule).mockResolvedValue(mockRules[0]!);
  vi.mocked(adminApi.deleteRule).mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("RulesManagementPage", () => {
  it("lists rules with status flags", async () => {
    renderPage();
    await screen.findByText("No shoes on pads");
    expect(screen.getByText("No food near walls")).toBeInTheDocument();
    expect(screen.getAllByText("Yes").length).toBeGreaterThanOrEqual(2);
  });

  it("creates a rule", async () => {
    renderPage();
    await screen.findByText("No shoes on pads");
    fireEvent.click(screen.getByRole("button", { name: /New rule/ }));
    fireEvent.change(await screen.findByLabelText(/^Title/), { target: { value: "New Rule" } });
    fireEvent.change(await screen.findByLabelText(/^Body/), { target: { value: "New body" } });
    fireEvent.click(await screen.findByRole("button", { name: /Create rule/ }));
    await screen.findByText("Rule added.");
    expect(adminApi.createRule).toHaveBeenCalled();
  });

  it("deletes a rule", async () => {
    renderPage();
    await screen.findByText("No shoes on pads");
    fireEvent.click(screen.getByRole("button", { name: /Delete No shoes on pads/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Delete/ }));
    await screen.findByText("Rule deleted.");
    expect(adminApi.deleteRule).toHaveBeenCalledWith(1);
  });

  it("shows load error", async () => {
    vi.mocked(adminApi.rules).mockRejectedValue(new Error("API down"));
    renderPage();
    await screen.findByText("Rules could not be loaded.");
  });
});
