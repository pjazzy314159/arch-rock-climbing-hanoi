import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PublishedRouteHolds } from "@/components/arch/published-holds";
import { setAccessToken } from "@/services/api";
import type { ApiRouteHold } from "@/services/types";

/**
 * The member-facing overlay.
 *
 * It is allowed to say "not published" but it is never allowed to show a
 * draft, invent a box, or keep showing an overlay after the photograph fails.
 */

const HOLDS: ApiRouteHold[] = [
  {
    id: 11,
    wall_hold_id: 4,
    label: "",
    x: 0.2,
    y: 0.3,
    width: 0.1,
    height: 0.08,
    position: 1,
    role: "start",
  },
  {
    id: 12,
    wall_hold_id: 5,
    label: "",
    x: 0.5,
    y: 0.45,
    width: 0.08,
    height: 0.06,
    position: 2,
    role: "middle",
  },
  {
    id: 13,
    wall_hold_id: 6,
    label: "",
    x: 0.75,
    y: 0.6,
    width: 0.1,
    height: 0.08,
    position: 3,
    role: "finish",
  },
];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function stubFetch(handler: () => Response | Promise<Response>) {
  const fetchMock = vi.fn(handler);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderOverlay(props: { active?: boolean } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PublishedRouteHolds routeId={1} routeName="Quiet the Mind" active={props.active ?? true} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  // A signed-in member must still get the public overlay without a bearer
  // token: the endpoint is public and the request should not depend on a login.
  setAccessToken("member-token");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  setAccessToken(null);
});

describe("PublishedRouteHolds", () => {
  it("draws the published boxes and their order against the photograph", async () => {
    const fetchMock = stubFetch(() =>
      jsonResponse({
        route_id: 1,
        image_url: "/walls/main.jpg",
        published: true,
        holds: HOLDS,
      }),
    );
    renderOverlay();

    const image = await screen.findByAltText(
      "The wall for Quiet the Mind, with the setters' published hold sequence.",
    );
    expect(image.getAttribute("src")).toBe("/walls/main.jpg");

    const boxes = Array.from(document.querySelectorAll<HTMLElement>(".route-hold-box"));
    expect(boxes).toHaveLength(3);
    expect(boxes[0]!.style.left).toBe("20%");
    expect(boxes[0]!.style.top).toBe("30%");
    expect(boxes[0]!.style.width).toBe("10%");
    expect(boxes[0]!.style.height).toBe("8%");
    expect(boxes[2]!.style.left).toBe("75%");
    expect(boxes[0]!.className).toContain("route-hold-box-start");
    expect(boxes[2]!.className).toContain("route-hold-box-finish");

    expect(screen.getByText("Start")).toBeInTheDocument();
    expect(screen.getByText("Hold 2 of 3")).toBeInTheDocument();
    expect(screen.getByText("Finish")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Published hold order" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toContain("/api/public/routes/1/holds");
    expect((init.headers as Headers).get("Authorization")).toBeNull();
  });

  it("shows an honest empty state instead of inventing boxes", async () => {
    stubFetch(() =>
      jsonResponse({
        route_id: 1,
        image_url: "/walls/main.jpg",
        published: false,
        holds: HOLDS,
      }),
    );
    renderOverlay();

    await screen.findByText("The setters have not published a hold overlay for this route yet.");
    expect(document.querySelectorAll(".route-hold-box")).toHaveLength(0);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByRole("list", { name: "Published hold order" })).toBeNull();
  });

  it("does not draw a published set that has no holds", async () => {
    stubFetch(() =>
      jsonResponse({
        route_id: 1,
        image_url: "/walls/main.jpg",
        published: true,
        holds: [],
      }),
    );
    renderOverlay();

    await screen.findByText("The published overlay for this route has no holds in it yet.");
    expect(document.querySelectorAll(".route-hold-box")).toHaveLength(0);
  });

  it("keeps the page usable when the overlay request fails", async () => {
    stubFetch(() => jsonResponse({ detail: "unavailable" }, 503));
    renderOverlay();

    await screen.findByText(
      "The setter's overlay could not be loaded. The route details, voting and logbook are unaffected.",
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("still lists the order when the photograph fails to load", async () => {
    stubFetch(() =>
      jsonResponse({
        route_id: 1,
        image_url: "/walls/broken.jpg",
        published: true,
        holds: HOLDS,
      }),
    );
    renderOverlay();

    const image = await screen.findByRole("img");
    fireEvent.error(image);

    await screen.findByText(
      "The wall photograph could not be loaded. The hold order is still listed below.",
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("lists the order when the published set has no photograph", async () => {
    stubFetch(() =>
      jsonResponse({
        route_id: 1,
        image_url: null,
        published: true,
        holds: HOLDS,
      }),
    );
    renderOverlay();

    await screen.findByText(
      "The published overlay has no wall photograph, so the boxes cannot be placed. The hold order is still listed below.",
    );
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("says it is loading before the published set arrives", async () => {
    let resolve!: (response: Response) => void;
    const pending = new Promise<Response>((done) => {
      resolve = done;
    });
    stubFetch(() => pending);
    renderOverlay();

    expect(screen.getByText("Loading the setter's overlay…")).toBeInTheDocument();

    resolve(
      jsonResponse({
        route_id: 1,
        image_url: "/walls/main.jpg",
        published: true,
        holds: HOLDS,
      }),
    );
    await screen.findByAltText(
      "The wall for Quiet the Mind, with the setters' published hold sequence.",
    );
    expect(screen.queryByText("Loading the setter's overlay…")).toBeNull();
  });

  it("does not ask for an overlay on a route that is not active", () => {
    const fetchMock = stubFetch(() =>
      jsonResponse({
        route_id: 1,
        image_url: "/walls/main.jpg",
        published: true,
        holds: HOLDS,
      }),
    );
    const { container } = renderOverlay({ active: false });

    expect(container.firstChild).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
