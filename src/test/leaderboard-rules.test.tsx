import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LeaderboardRulesPanel } from "@/components/arch/route-pages";

/**
 * The ranking explanation on the leaderboard.
 *
 * The panel must show the backend's own words. These tests stand in for the
 * API with text that appears nowhere else, so a passing test means the words
 * on the page came from the response and not from a second copy in the
 * frontend. When the explanation cannot be fetched, the page says so instead
 * of describing a different rule.
 */

const SCORING = "SENTINEL SEND RULE: only sends count, one point per grade step.";
const PERCENTILE = "SENTINEL PERCENTILE RULE: the share of ranked climbers at or behind you.";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <LeaderboardRulesPanel />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the leaderboard's scoring explanation", () => {
  it("shows the scoring and percentile rules the backend published", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) =>
      jsonResponse({ scoring_rule: SCORING, percentile_rule: PERCENTILE }),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderPanel();

    expect(await screen.findByText(SCORING)).toBeTruthy();
    expect(screen.getByText(PERCENTILE)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "How the ranking works" })).toBeTruthy();
    // It asks the public endpoint, so a signed-out visitor can read the rule.
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/api/public/leaderboard/rules");
  });

  it("says it is loading before the rule arrives", () => {
    // A request that never settles keeps the panel in its loading state.
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    renderPanel();

    expect(screen.getByText("Loading how the ranking works…")).toBeTruthy();
  });

  it("says the explanation is unavailable rather than inventing a rule", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ detail: "down" }, 503)),
    );
    renderPanel();

    expect(await screen.findByText(/could not be loaded right now/)).toBeTruthy();
    // No rule is described when the backend did not describe one.
    expect(screen.queryByText(/Ties are broken/)).toBeNull();
    expect(screen.queryByText(/percentile/i)).toBeNull();
  });
});
