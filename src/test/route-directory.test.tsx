import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RoutesPage } from "@/components/arch/public-pages";
import { routeQueryString } from "@/services/api";
import type { ApiRouteFilterOptions, ApiRouteSummary } from "@/services/types";

/**
 * The route directory.
 *
 * The filters are applied by the backend, so these tests watch two things:
 * that the filters are passed to the API as plain values, and that the page
 * tells an empty result apart from a failed request.
 */

const ROUTE: ApiRouteSummary = {
  id: 1,
  name: "Quiet the Mind",
  grade: "V3",
  wall: "The Slab",
  wall_id: 1,
  wall_type: "slab",
  color: "lime",
  style: "Balance",
  setter: "Minh",
  status: "active",
  set_at: "2026-10-20",
  beta: null,
  image_url: null,
  wall_image_url: null,
  sends: 4,
  vote_count: 2,
  easier_votes: 0,
  as_set_votes: 2,
  harder_votes: 0,
  perceived_grade: "V3",
  is_fresh: true,
};

const OPTIONS: ApiRouteFilterOptions = {
  grades: ["V1", "V3", "V5"],
  walls: [
    { id: 1, name: "The Slab", image_url: null },
    { id: 2, name: "The Cave", image_url: null },
  ],
  wall_types: ["slab", "overhang"],
  statuses: ["active", "archived"],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** A fetch mock that answers the routes and the filter options. */
function mockDirectory(
  routes: ApiRouteSummary[] = [ROUTE],
  options: ApiRouteFilterOptions = OPTIONS,
  handler?: (url: string) => Response | null,
) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const override = handler?.(url);
    if (override) return override;
    if (url.includes("/api/public/route-filters")) return jsonResponse(options);
    return jsonResponse(routes);
  });
}

async function renderDirectory() {
  const rootRoute = createRootRoute();
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: RoutesPage,
  });
  const routeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/routes/$routeId",
    component: () => null,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, routeRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
    context: { queryClient: new QueryClient() },
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} context={{ queryClient }} />
    </QueryClientProvider>,
  );
  return { router, queryClient };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the route filter query string", () => {
  it("leaves out a filter that is not set", () => {
    expect(routeQueryString({})).toBe("");
    expect(routeQueryString({ grade: "", wall: null })).toBe("");
  });

  it("passes each filter as a plain value", () => {
    expect(routeQueryString({ grade: "V3" })).toBe("?grade=V3");
    expect(routeQueryString({ wallId: 7 })).toBe("?wall_id=7");
    expect(routeQueryString({ wallType: "overhang" })).toBe("?wall_type=overhang");
    expect(routeQueryString({ status: "archived" })).toBe("?status=archived");
    expect(routeQueryString({ search: "the cave" })).toBe("?search=the%20cave");
    expect(routeQueryString({ freshOnly: true })).toBe("?fresh_only=true");
  });

  it("combines the filters", () => {
    expect(routeQueryString({ grade: "V3", wallId: 2, status: "all" })).toBe(
      "?grade=V3&wall_id=2&status=all",
    );
  });
});

describe("the route directory", () => {
  it("offers the filter values the backend reports", async () => {
    vi.stubGlobal("fetch", mockDirectory());
    await renderDirectory();

    await screen.findByText("Quiet the Mind");

    const grade = await screen.findByLabelText("Filter grade");
    expect(
      within(grade)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["All grades", "V1", "V3", "V5"]);

    const wall = await screen.findByLabelText("Filter wall");
    expect(
      within(wall)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["All walls", "The Slab", "The Cave"]);

    const type = await screen.findByLabelText("Filter wall type");
    expect(
      within(type)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["All types", "Slab", "Overhang"]);

    const status = await screen.findByLabelText("Filter route status");
    expect(
      within(status)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["All statuses", "On the wall", "Archived"]);
  });

  it("asks the backend for the list the filters describe", async () => {
    const fetchMock = mockDirectory();
    vi.stubGlobal("fetch", fetchMock);
    const { queryClient } = await renderDirectory();

    await screen.findByText("Quiet the Mind");
    const grade = await screen.findByLabelText("Filter grade");
    fireEvent.change(grade, { target: { value: "V3" } });

    await waitFor(() => {
      const urls = fetchMock.mock.calls.map((call) => String(call[0]));
      expect(urls.some((url) => url.includes("grade=V3"))).toBe(true);
    });

    // The list is cached under a key that carries the filter, so a different
    // filter is a different question rather than the same list re-filtered.
    const keys = queryClient
      .getQueryCache()
      .getAll()
      .map((query) => query.queryKey);
    expect(
      keys.some(
        (key) =>
          Array.isArray(key) && key[0] === "arch" && key[1] === "routes" && key[2] === "filtered",
      ),
    ).toBe(true);
  });

  it("shows the number of routes that match, not the number that exist", async () => {
    vi.stubGlobal("fetch", mockDirectory([ROUTE]));
    await renderDirectory();

    await screen.findByText("Quiet the Mind");
    // With no filter applied the count is the whole collection.
    expect(screen.getByText(/^1 route$/)).toBeTruthy();

    const grade = await screen.findByLabelText("Filter grade");
    fireEvent.change(grade, { target: { value: "V3" } });

    await waitFor(() => {
      expect(screen.getByText(/1 route match your filters/)).toBeTruthy();
    });
  });

  it("tells an empty result apart from a failure", async () => {
    vi.stubGlobal(
      "fetch",
      mockDirectory([], OPTIONS, (url) =>
        url.includes("/api/public/route-filters") ? null : jsonResponse([], 200),
      ),
    );
    await renderDirectory();

    await screen.findByText("No routes match this search.");
    expect(screen.queryByText("The route list could not be loaded.")).toBeNull();
  });

  it("says the list could not be loaded when the backend fails", async () => {
    vi.stubGlobal(
      "fetch",
      mockDirectory([], OPTIONS, (url) =>
        url.includes("/api/public/route-filters") ? null : jsonResponse({ detail: "boom" }, 500),
      ),
    );
    await renderDirectory();

    await screen.findByText("The route list could not be loaded.");
    // A failure is not shown as an empty collection.
    expect(screen.queryByText("No routes match this search.")).toBeNull();
    expect(screen.getByRole("button", { name: /Try again/ })).toBeTruthy();
  });

  it("clears the filters and asks for the whole collection again", async () => {
    const fetchMock = mockDirectory();
    vi.stubGlobal("fetch", fetchMock);
    await renderDirectory();

    await screen.findByText("Quiet the Mind");
    const grade = await screen.findByLabelText("Filter grade");
    fireEvent.change(grade, { target: { value: "V3" } });
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.map((call) => String(call[0])).some((url) => url.includes("grade=V3")),
      ).toBe(true);
    });

    const clear = screen.getByRole("button", { name: /Clear filters/ });
    fireEvent.click(clear);

    await waitFor(() => {
      const urls = fetchMock.mock.calls.map((call) => String(call[0]));
      expect(urls.some((url) => url.includes("grade=V3"))).toBe(true);
      // The last request carries no grade filter.
      const routesCalls = urls.filter((url) => url.includes("/api/public/routes?"));
      expect(routesCalls.at(-1)).not.toContain("grade=");
    });

    expect((await screen.findByLabelText("Filter grade")) as HTMLSelectElement).toHaveValue("");
  });
});
