import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RouteDetailPage } from "@/components/arch/route-pages";
import { SessionProvider } from "@/services/session";
import { setAccessToken } from "@/services/api";

/**
 * The overlay on the real member route page: it has to arrive alongside the
 * existing grade, voting and logbook controls without replacing them.
 */

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({ to, children }: { to?: unknown; children?: ReactNode }) => (
      <a href={typeof to === "string" ? to : "#"}>{children}</a>
    ),
  };
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const ROUTE = {
  id: 1,
  name: "Quiet the Mind",
  grade: "V3",
  wall: "The Slab",
  wall_id: 3,
  wall_image_url: "/walls/placeholder-gym.jpg",
  wall_type: "slab",
  color: "#c8f542",
  style: "Balance, quiet feet and a patient finish.",
  setter: "Demo Setter",
  status: "active",
  set_at: "2026-10-01",
  beta: null,
  image_url: null,
  sends: 12,
  vote_count: 4,
  easier_votes: 1,
  as_set_votes: 2,
  harder_votes: 1,
  perceived_grade: "V3",
  is_fresh: false,
};

const HOLDS = [
  { position: 1, role: "start", x: 0.2, y: 0.3 },
  { position: 2, role: "middle", x: 0.5, y: 0.45 },
  { position: 3, role: "finish", x: 0.75, y: 0.6 },
].map((hold, index) => ({
  id: 20 + index,
  wall_hold_id: 30 + index,
  label: "",
  width: 0.08,
  height: 0.06,
  ...hold,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  setAccessToken(null);
});

describe("the member route page", () => {
  it("shows the published overlay beside the existing route controls", async () => {
    setAccessToken(null);
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const path = String(input).replace(/^https?:\/\/[^/]+/, "");
        calls.push(path);
        if (path === "/api/public/routes/1") return jsonResponse(ROUTE);
        if (path === "/api/me/routes/1/tally") {
          return jsonResponse({
            route_id: 1,
            total: 4,
            easier: 1,
            as_set: 2,
            harder: 1,
            perceived_grade: "V3",
          });
        }
        if (path === "/api/public/routes/1/holds") {
          return jsonResponse({
            route_id: 1,
            image_url: "/walls/placeholder-gym.jpg",
            published: true,
            holds: HOLDS,
          });
        }
        return jsonResponse({ detail: "not found" }, 404);
      }),
    );

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <SessionProvider>
          <RouteDetailPage routeId="1" />
        </SessionProvider>
      </QueryClientProvider>,
    );

    expect(
      await screen.findByRole("heading", { level: 1, name: "Quiet the Mind" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { level: 2, name: "The setter's line." }),
    ).toBeInTheDocument();
    expect(
      screen.getByAltText(
        "The wall for Quiet the Mind, with the setters' published hold sequence.",
      ),
    ).toBeInTheDocument();
    expect(document.querySelectorAll(".route-hold-box")).toHaveLength(3);
    expect(screen.getByText("Hold 2 of 3")).toBeInTheDocument();

    const overlayHeading = screen.getByRole("heading", {
      level: 2,
      name: "The setter's line.",
    });
    const voteHeading = screen.getByRole("heading", { name: "How did it feel?" });
    expect(
      overlayHeading.compareDocumentPosition(voteHeading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // The rest of the page is still there.
    expect(screen.getByRole("heading", { name: "How did it feel?" })).toBeInTheDocument();
    expect(screen.getByText("Sign in to vote.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Sign in to log this climb/ })).toBeInTheDocument();
    expect(screen.queryByText("Log this climb")).toBeNull();

    expect(calls).toContain("/api/public/routes/1/holds");
    expect(calls.some((path) => path.startsWith("/api/staff/"))).toBe(false);
  });
});
