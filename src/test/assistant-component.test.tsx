import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import type { ReactNode } from "react";

import { AssistantWidget } from "@/components/arch/assistant";
import { Button } from "@/components/ui/button";

/**
 * The assistant widget.
 *
 * The widget displays the assistant panel with sources, FAQ suggestions,
 * loading states, and error handling.
 */

const ROOT_ROUTE = createRootRoute();

const ASSISTANT_ROUTE = createRoute({
  getParentRoute: () => ROOT_ROUTE,
  path: "/",
  component: () => <AssistantWidget />,
});

const router = createRouter({
  routeTree: ROOT_ROUTE.addChildren([ASSISTANT_ROUTE]),
});

function renderWithRouter(ui: ReactNode) {
  const queryClient = new QueryClient();
  const history = createMemoryHistory();

  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function mockFetch(handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  return vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(handler);
}

function createFetchMock(responses: Record<string, Response | (() => Promise<Response>)>) {
  return mockFetch(async (url) => {
    const urlStr = url.toString();
    for (const [pattern, response] of Object.entries(responses)) {
      if (urlStr.includes(pattern)) {
        return typeof response === "function" ? await response() : response;
      }
    }
    return jsonResponse({});
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the assistant widget", () => {
  it("shows the launcher button when closed", async () => {
    vi.stubGlobal("fetch", createFetchMock({
      "/api/assistant/status": jsonResponse({ live_model_enabled: false }),
    }));
    renderWithRouter(<AssistantWidget />);

    await screen.findByRole("button", { name: /Ask the ARCH assistant/i });
    expect(screen.getByRole("button", { name: /Ask the ARCH assistant/i })).toBeInTheDocument();
  });

  it("shows the intro when opened", async () => {
    vi.stubGlobal("fetch", createFetchMock({
      "/api/assistant/status": jsonResponse({ live_model_enabled: false }),
    }));
    renderWithRouter(<AssistantWidget />);

    await screen.findByRole("button", { name: /Ask the ARCH assistant/i });
    fireEvent.click(screen.getByRole("button", { name: /Ask the ARCH assistant/i }));

    // Wait for panel to open and intro text to appear
    await screen.findByText((content) => content.includes("Ask about opening hours") && content.includes("prices") && content.includes("courses"));
    expect(screen.getByText(/The assistant only answers from information ARCH has published/i)).toBeInTheDocument();
  });

  it("shows source category labels correctly", async () => {
    vi.stubGlobal("fetch", createFetchMock({
      "/api/assistant/status": jsonResponse({ live_model_enabled: false, provider: null, model: null, mode: "knowledge_base" }),
      "/api/public/faq": jsonResponse([{ id: 1, question: "Test?", answer: "Answer", category: "Visiting", keywords: "test", is_published: true }]),
      "/api/public/routes": jsonResponse([{ id: 1, name: "Test Route", grade: "V3", wall: "The Slab", wall_type: "slab", color: "red", style: "Balance", setter: "Test", status: "active", set_at: "2024-01-01", beta: null, image_url: null }]),
      "/api/public/prices": jsonResponse([{ id: 1, name: "Day Pass", category: "Entry", amount_vnd: 100000, unit: "per visit", description: "", is_active: true, sort_order: 1 }]),
      "/api/public/opening-hours": jsonResponse([{ day_of_week: 1, opens_at: "09:00:00", closes_at: "21:00:00", note: "", is_closed: false }]),
      "/api/public/rules": jsonResponse([{ id: 1, title: "Test Rule", body: "Rule body", category: "Safety", is_active: true, is_confirmed: true, sort_order: 1 }]),
      "/api/public/courses": jsonResponse([{ id: 1, title: "Test Course", level: "Beginner", summary: "Summary", description: "", instructor: "Test", schedule: "Mon 10am", duration_weeks: 4, capacity: 10, price_vnd: 100000, is_active: true }]),
      "/api/public/events": jsonResponse([{ id: 1, title: "Test Event", description: "Desc", starts_at: "2024-01-01T10:00:00Z", ends_at: "2024-01-01T12:00:00Z", location: "ARCH", capacity: 10, is_public: true }]),
      "/api/public/services": jsonResponse([{ id: 1, title: "Service", summary: "Summary", icon: "icon", sort_order: 1, is_active: true }]),
      "/api/assistant/chat": jsonResponse({
        answer: "Test answer",
        mode: "knowledge_base",
        sources: [
          { id: 1, question: "Test FAQ", category: "faq" },
          { id: 2, question: "Test Route", category: "route" },
          { id: 3, question: "Test Price", category: "price" },
          { id: 4, question: "Test Hour", category: "opening_hour" },
          { id: 5, question: "Test Rule", category: "rule" },
          { id: 6, question: "Test Course", category: "course" },
          { id: 7, question: "Test Event", category: "event" },
          { id: 8, question: "Test Service", category: "service" },
          { id: 9, question: "Unknown", category: "unknown" },
        ],
        provider: null,
        model: null,
        created_at: new Date().toISOString(),
        disclaimer: "Test",
      }),
    }));

    renderWithRouter(<AssistantWidget />);

    await screen.findByRole("button", { name: /Ask the ARCH assistant/i });
    fireEvent.click(screen.getByRole("button", { name: /Ask the ARCH assistant/i }));

    await screen.findByPlaceholderText("Ask about the gym…");
    await waitFor(() => {
      fireEvent.change(screen.getByPlaceholderText("Ask about the gym…"), { target: { value: "Test question" } });
    });
    fireEvent.click(screen.getByRole("button", { name: /Send question/i }));

    await screen.findByText(/Test answer/i);

    // Check source labels - use source-category-badge elements which are specific to sources
    const sourceBadges = screen.getAllByRole("listitem").map(li => li.querySelector(".source-category-badge"));
    // Or use getByText within the sources list
    const sourcesList = screen.getByRole("list", { name: /Sources/i });
    expect(sourcesList).toBeInTheDocument();
    
    // Check each label exists in the sources list
    expect(sourcesList).toHaveTextContent(/FAQ/i);
    expect(sourcesList).toHaveTextContent(/Climbing route/i);
    expect(sourcesList).toHaveTextContent(/Price/i);
    expect(sourcesList).toHaveTextContent(/Opening hours/i);
    expect(sourcesList).toHaveTextContent(/Rule/i);
    expect(sourcesList).toHaveTextContent(/Course/i);
    expect(sourcesList).toHaveTextContent(/Event/i);
    expect(sourcesList).toHaveTextContent(/Service/i);
    expect(sourcesList).toHaveTextContent(/Source/i); // unknown category
  });

  it("shows FAQ suggestions when relevant", async () => {
    vi.stubGlobal("fetch", createFetchMock({
      "/api/assistant/status": jsonResponse({ live_model_enabled: false, provider: null, model: null, mode: "knowledge_base" }),
      "/api/public/faq": jsonResponse([
        { id: 1, question: "Do I need experience?", answer: "No.", category: "Visiting", keywords: "beginner", is_published: true },
        { id: 2, question: "What are the prices?", answer: "Day pass 150k.", category: "Pricing", keywords: "price cost", is_published: true },
        { id: 3, question: "What are the rules?", answer: "Follow rules.", category: "Rules", keywords: "rules safety", is_published: true },
      ]),
      "/api/assistant/chat": jsonResponse({
        answer: "Test answer",
        mode: "knowledge_base",
        sources: [{ id: 1, question: "Do I need experience?", category: "Visiting" }],
        provider: null,
        model: null,
        created_at: new Date().toISOString(),
        disclaimer: "Test",
      }),
    }));

    renderWithRouter(<AssistantWidget />);

    await screen.findByRole("button", { name: /Ask the ARCH assistant/i });
    fireEvent.click(screen.getByRole("button", { name: /Ask the ARCH assistant/i }));

    await screen.findByPlaceholderText("Ask about the gym…");

    await waitFor(() => {
      fireEvent.change(screen.getByPlaceholderText("Ask about the gym…"), { target: { value: "Do I need experience?" } });
    });
    fireEvent.click(screen.getByRole("button", { name: /Send question/i }));

    await screen.findByText(/Test answer/i);

    // FAQ suggestions should appear
    await screen.findByText(/Related FAQs/i);
    // The suggestion button contains the question text - find by role/button
    const suggestionButtons = screen.getAllByRole("button", { name: /Do I need experience/i });
    expect(suggestionButtons.length).toBeGreaterThan(0);
  });

  it("shows loading state while fetching", async () => {
    let resolveFetch: (value: Response) => void;
    const fetchPromise = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });

    vi.stubGlobal("fetch", createFetchMock({
      "/api/assistant/status": jsonResponse({ live_model_enabled: false, provider: null, model: null, mode: "knowledge_base" }),
      "/api/assistant/chat": () => fetchPromise,
    }));

    renderWithRouter(<AssistantWidget />);

    await screen.findByRole("button", { name: /Ask the ARCH assistant/i });
    fireEvent.click(screen.getByRole("button", { name: /Ask the ARCH assistant/i }));
    await screen.findByPlaceholderText("Ask about the gym…");

    fireEvent.change(screen.getByPlaceholderText("Ask about the gym…"), { target: { value: "Test" } });
    fireEvent.click(screen.getByRole("button", { name: /Send question/i }));

    expect(screen.getByText(/Looking that up/i)).toBeInTheDocument();

    resolveFetch!(jsonResponse({
      answer: "Answer",
      mode: "knowledge_base",
      sources: [],
      provider: null,
      model: null,
      created_at: new Date().toISOString(),
      disclaimer: "Test",
    }));

    // Find the answer in the message (not in header or footnote)
    await screen.findByText((content, element) => {
      return content.includes("Answer") && element?.closest(".assistant-answer") !== null;
    });
  });

  it("shows error state on API failure", async () => {
    vi.stubGlobal("fetch", createFetchMock({
      "/api/assistant/status": jsonResponse({ live_model_enabled: false, provider: null, model: null, mode: "knowledge_base" }),
      "/api/assistant/chat": () => { throw new TypeError("network down"); },
    }));

    renderWithRouter(<AssistantWidget />);

    await screen.findByRole("button", { name: /Ask the ARCH assistant/i });
    fireEvent.click(screen.getByRole("button", { name: /Ask the ARCH assistant/i }));
    await screen.findByPlaceholderText("Ask about the gym…");

    fireEvent.change(screen.getByPlaceholderText("Ask about the gym…"), { target: { value: "Test" } });
    fireEvent.click(screen.getByRole("button", { name: /Send question/i }));

    await screen.findByText(/The assistant is not reachable right now. Please try again in a moment./i);
    expect(screen.getByRole("button", { name: /Dismiss error/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Dismiss error/i }));
    expect(screen.queryByText(/The assistant is not reachable/i)).not.toBeInTheDocument();
  });

  it("disables form while pending", async () => {
    let resolveFetch: (value: Response) => void;
    const fetchPromise = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });

    vi.stubGlobal("fetch", createFetchMock({
      "/api/assistant/status": jsonResponse({ live_model_enabled: false, provider: null, model: null, mode: "knowledge_base" }),
      "/api/assistant/chat": () => fetchPromise,
    }));

    renderWithRouter(<AssistantWidget />);

    await screen.findByRole("button", { name: /Ask the ARCH assistant/i });
    fireEvent.click(screen.getByRole("button", { name: /Ask the ARCH assistant/i }));
    await screen.findByPlaceholderText("Ask about the gym…");

    fireEvent.change(screen.getByPlaceholderText("Ask about the gym…"), { target: { value: "Test" } });
    fireEvent.click(screen.getByRole("button", { name: /Send question/i }));

    // Check that the submit button is disabled and shows "Sending question"
    const submitButton = screen.getByRole("button", { name: /Sending question/i });
    expect(submitButton).toBeDisabled();
    expect(screen.getByPlaceholderText("Ask about the gym…")).toBeDisabled();

    resolveFetch!(jsonResponse({
      answer: "Answer",
      mode: "knowledge_base",
      sources: [],
      provider: null,
      model: null,
      created_at: new Date().toISOString(),
      disclaimer: "Test",
    }));

    // Find the answer in the message (not in header or footnote)
    await screen.findByText((content, element) => {
      return content.includes("Answer") && element?.closest(".assistant-answer") !== null;
    });
  });

  it("shows not covered state when no answer available", async () => {
    vi.stubGlobal("fetch", createFetchMock({
      "/api/assistant/status": jsonResponse({ live_model_enabled: false, provider: null, model: null, mode: "knowledge_base" }),
      "/api/assistant/chat": jsonResponse({
        answer: "I don't have approved information about that yet.",
        mode: "not_covered",
        sources: [],
        provider: null,
        model: null,
        created_at: new Date().toISOString(),
        disclaimer: "Answers are based on approved ARCH information only.",
      }),
    }));

    renderWithRouter(<AssistantWidget />);

    await screen.findByRole("button", { name: /Ask the ARCH assistant/i });
    fireEvent.click(screen.getByRole("button", { name: /Ask the ARCH assistant/i }));
    await screen.findByPlaceholderText("Ask about the gym…");

    fireEvent.change(screen.getByPlaceholderText("Ask about the gym…"), { target: { value: "What is the meaning of life?" } });
    fireEvent.click(screen.getByRole("button", { name: /Send question/i }));

    await screen.findByText(/Not covered by ARCH's published information/i);
    expect(screen.getByText(/I don't have approved information about that yet/i)).toBeInTheDocument();
  });

  it("does not show FAQ suggestions when no relevant FAQs", async () => {
    vi.stubGlobal("fetch", createFetchMock({
      "/api/assistant/status": jsonResponse({ live_model_enabled: false, provider: null, model: null, mode: "knowledge_base" }),
      "/api/assistant/chat": jsonResponse({
        answer: "Test answer",
        mode: "knowledge_base",
        sources: [{ id: 1, question: "Test route", category: "route" }],
        provider: null,
        model: null,
        created_at: new Date().toISOString(),
        disclaimer: "Test",
      }),
    }));

    renderWithRouter(<AssistantWidget />);

    await screen.findByRole("button", { name: /Ask the ARCH assistant/i });
    fireEvent.click(screen.getByRole("button", { name: /Ask the ARCH assistant/i }));
    await screen.findByPlaceholderText("Ask about the gym…");

    fireEvent.change(screen.getByPlaceholderText("Ask about the gym…"), { target: { value: "Test route" } });
    fireEvent.click(screen.getByRole("button", { name: /Send question/i }));

    await screen.findByText(/Test answer/i);

    // FAQ suggestions should not appear for non-FAQ sources
    expect(screen.queryByText(/Related FAQs/i)).not.toBeInTheDocument();
  });
});

export {};