import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LogClimbModal } from "@/components/arch/log-climb-modal";
import { setAccessToken } from "@/services/api";
import type { ApiRouteSummary } from "@/services/types";

/**
 * The log-a-climb dialog.
 *
 * It is the one place a climb is logged, wherever it is opened from. These
 * tests watch the actual submission: that it posts to the member's own
 * endpoint, that a second submission while one is in flight is ignored, that
 * an authentication failure is shown rather than swallowed, and that the
 * queries the member's numbers come from are invalidated afterwards.
 */

const ROUTE: ApiRouteSummary = {
  id: 7,
  name: "Sloper Opera",
  grade: "V4",
  wall: "The Cave",
  wall_id: 2,
  wall_image_url: null,
  wall_type: "overhang",
  color: "coral",
  style: "Steep and technical",
  setter: "Minh",
  status: "active",
  set_at: "2026-10-20",
  beta: null,
  image_url: null,
  sends: 9,
  vote_count: 3,
  easier_votes: 0,
  as_set_votes: 3,
  harder_votes: 0,
  perceived_grade: "V4",
  is_fresh: false,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** A fetch mock that answers the route list and (if asked) the logbook POST. */
function mockFetch(logPost?: (body: unknown) => Promise<Response>) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/api/public/routes")) return jsonResponse([ROUTE]);
    if (url.includes("/api/me/logbook") && (init?.method ?? "GET") === "POST") {
      if (!logPost) throw new Error("Unexpected logbook POST");
      if (!init?.body) throw new Error("No logbook body");
      return logPost(JSON.parse(String(init.body)));
    }
    throw new Error(`Unexpected request: ${url}`);
  });
}

async function renderModal(overrides: { preselectedRouteId?: number } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const route =
    overrides.preselectedRouteId === undefined
      ? null
      : {
          id: String(overrides.preselectedRouteId),
          apiId: overrides.preselectedRouteId,
          name: "Sloper Opera",
          grade: "V4",
        };
  render(
    <QueryClientProvider client={queryClient}>
      <LogClimbModal
        open
        onClose={onCloseMock}
        onSuccess={onSuccessMock}
        preselectedRoute={route}
      />
    </QueryClientProvider>,
  );
  return queryClient;
}

const onCloseMock = vi.fn();
const onSuccessMock = vi.fn();

function chooseRoute(routeId = "7") {
  const select = document.querySelector('select[name="route"]');
  if (!(select instanceof HTMLSelectElement)) throw new Error("No route select");
  fireEvent.change(select, { target: { value: routeId } });
}

async function fillAndSubmit() {
  // The dialog loads the route list from the backend; wait for an option to
  // exist before choosing one, or a submission would have nothing to post.
  await waitFor(() => {
    const select = document.querySelector('select[name="route"]');
    expect(select).not.toBeNull();
    if (select instanceof HTMLSelectElement) {
      expect(select.options.length).toBeGreaterThan(0);
    }
  });
  chooseRoute();
  const form = document.querySelector("form");
  if (!(form instanceof HTMLFormElement)) throw new Error("No form");
  fireEvent.submit(form);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  setAccessToken(null);
});

describe("the log-a-climb dialog", () => {
  it("posts the climb to the member's own endpoint and closes", async () => {
    let posted: unknown = null;
    vi.stubGlobal(
      "fetch",
      mockFetch(async (body) => {
        posted = body;
        return jsonResponse({ id: 99, ...(body as object) });
      }),
    );
    setAccessToken("a-token");
    await renderModal();

    await fillAndSubmit();
    await waitFor(() => expect(onCloseMock).toHaveBeenCalled());

    expect(posted).toMatchObject({
      route_id: 7,
      route_name: "Sloper Opera",
      grade: "V4",
      result: "sent",
      attempts: 1,
    });
    expect(onSuccessMock).toHaveBeenCalledWith("Sloper Opera has been added to your logbook.");
  });

  it("says so when there is no route on the wall to log", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse([])),
    );
    setAccessToken("a-token");
    await renderModal();

    await screen.findByText("No routes are on the wall to log right now.");
    expect(document.querySelector('select[name="route"]')).toBeNull();
  });

  it("invalidates the dashboard, logbook and leaderboard queries when it saves", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(async () => jsonResponse({ id: 99 })),
    );
    setAccessToken("a-token");
    const queryClient = await renderModal();

    // The submission is the thing under test; the invalidation is what makes
    // the dashboard and logbook redraw with the new number.
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    await fillAndSubmit();
    await waitFor(() => expect(onCloseMock).toHaveBeenCalled());

    const keys = invalidate.mock.calls.map((call) => JSON.stringify(call[0]?.queryKey));
    expect(keys).toContain(JSON.stringify(["member", "dashboard"]));
    expect(keys).toContain(JSON.stringify(["member", "logbook"]));
    expect(keys).toContain(JSON.stringify(["arch", "leaderboard"]));
    expect(keys).toContain(JSON.stringify(["arch", "route", "7"]));
  });

  it("keeps the route pre-filled when one is provided", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(async () => jsonResponse({ id: 99 })),
    );
    setAccessToken("a-token");
    await renderModal({ preselectedRouteId: 7 });

    const preset = document.querySelector(".preset-route");
    if (!(preset instanceof HTMLElement)) throw new Error("No preset route");
    expect(preset.textContent).toContain("Sloper Opera · V4");
    // There is no route select while the preset is in use.
    expect(document.querySelector('select[name="route"]')).toBeNull();
  });

  it("does nothing when no route was chosen", async () => {
    const fetchMock = mockFetch(async () => jsonResponse({ id: 99 }));
    vi.stubGlobal("fetch", fetchMock);
    setAccessToken("a-token");
    await renderModal();

    const form = document.querySelector("form");
    if (!(form instanceof HTMLFormElement)) throw new Error("No form");
    fireEvent.submit(form);

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(
      fetchMock.mock.calls.some(
        (call) =>
          String(call[0]).includes("/api/me/logbook") && (call[1]?.method ?? "GET") === "POST",
      ),
    ).toBe(false);
    expect(onCloseMock).not.toHaveBeenCalled();
  });

  it("ignores a second submission while the first is in flight", async () => {
    // The first POST never resolves until we let it, so the dialog stays
    // pending and a second submit must not send another request.
    let release: () => void = () => {};
    const gate = new Promise<Response>((resolve) => {
      release = () => resolve(jsonResponse({ id: 99 }));
    });
    const fetchMock = mockFetch(async () => gate);
    vi.stubGlobal("fetch", fetchMock);
    setAccessToken("a-token");
    await renderModal();
    await waitFor(() => {
      const select = document.querySelector('select[name="route"]');
      if (!(select instanceof HTMLSelectElement)) throw new Error("No route select");
      expect(select.options.length).toBeGreaterThan(0);
    });
    chooseRoute();

    const form = document.querySelector("form");
    if (!(form instanceof HTMLFormElement)) throw new Error("No form");
    fireEvent.submit(form);
    fireEvent.submit(form);

    await new Promise((resolve) => setTimeout(resolve, 50));
    const posts = fetchMock.mock.calls.filter(
      (call) =>
        String(call[0]).includes("/api/me/logbook") && (call[1]?.method ?? "GET") === "POST",
    );
    expect(posts).toHaveLength(1);

    release();
    await waitFor(() => expect(onCloseMock).toHaveBeenCalledTimes(1));
  });

  it("shows an authentication failure instead of pretending the climb was saved", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(async () => jsonResponse({ detail: "Not authenticated" }, 401)),
    );
    setAccessToken("invalid-token");
    await renderModal();

    await fillAndSubmit();
    await screen.findByRole("alert");
    expect(screen.getByText(/Not authenticated/)).toBeTruthy();
    expect(onCloseMock).not.toHaveBeenCalled();
    expect(onSuccessMock).not.toHaveBeenCalled();
  });

  it("lets the member choose a different route than the one pre-filled", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(async () => jsonResponse({ id: 99 })),
    );
    setAccessToken("a-token");
    await renderModal({ preselectedRouteId: 7 });

    const switchButton = document.querySelector(".preset-switch");
    if (!(switchButton instanceof HTMLButtonElement)) throw new Error("No switch button");
    fireEvent.click(switchButton);

    const select = await waitFor(() => {
      const element = document.querySelector('select[name="route"]');
      if (!(element instanceof HTMLSelectElement)) throw new Error("No route select");
      expect(element.options.length).toBeGreaterThan(0);
      return element;
    });
    expect(
      within(select as HTMLElement)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Sloper Opera · V4"]);
  });
});
