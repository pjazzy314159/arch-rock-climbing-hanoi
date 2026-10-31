import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FaqManagementPage } from "@/components/arch/faq-management";
import { adminApi, ApiError } from "@/services/api";
import type { ApiFaqEntry } from "@/services/types";

vi.mock("@/services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/api")>();
  return {
    ...actual,
    adminApi: {
      ...actual.adminApi,
      faq: vi.fn(),
      createFaq: vi.fn(),
      updateFaq: vi.fn(),
      deleteFaq: vi.fn(),
    },
  };
});

const mockFaqs: ApiFaqEntry[] = [
  {
    id: 1,
    question: "What is bouldering?",
    answer: "Climbing without ropes.",
    category: "General",
    keywords: "bouldering",
    is_published: true,
  },
  {
    id: 2,
    question: "Is there parking?",
    answer: "Yes, limited spaces.",
    category: "Logistics",
    keywords: "parking",
    is_published: false,
  },
];

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><FaqManagementPage /></QueryClientProvider>);
}

beforeEach(() => {
  vi.mocked(adminApi.faq).mockResolvedValue(mockFaqs);
  vi.mocked(adminApi.createFaq).mockResolvedValue({ ...mockFaqs[0]!, id: 3 });
  vi.mocked(adminApi.updateFaq).mockResolvedValue(mockFaqs[0]!);
  vi.mocked(adminApi.deleteFaq).mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("FaqManagementPage", () => {
  it("lists published and unpublished FAQs", async () => {
    renderPage();
    await screen.findByText("What is bouldering?");
    expect(screen.getByText("Is there parking?")).toBeInTheDocument();
  });

  it("creates a FAQ entry", async () => {
    renderPage();
    await screen.findByText("What is bouldering?");
    fireEvent.click(screen.getByRole("button", { name: /New FAQ/ }));
    fireEvent.change(await screen.findByLabelText(/^Question/), { target: { value: "New Q" } });
    fireEvent.change(await screen.findByLabelText(/^Answer/), { target: { value: "New A" } });
    fireEvent.click(await screen.findByRole("button", { name: /Create FAQ/ }));
    await screen.findByText("FAQ added.");
    expect(adminApi.createFaq).toHaveBeenCalled();
  });

  it("deletes a FAQ entry", async () => {
    renderPage();
    await screen.findByText("What is bouldering?");
    fireEvent.click(screen.getByRole("button", { name: /Delete What is bouldering/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Delete/ }));
    await screen.findByText("FAQ deleted.");
    expect(adminApi.deleteFaq).toHaveBeenCalledWith(1);
  });

  it("shows load error", async () => {
    vi.mocked(adminApi.faq).mockRejectedValue(new Error("API down"));
    renderPage();
    await screen.findByText("FAQ entries could not be loaded.");
  });
});
