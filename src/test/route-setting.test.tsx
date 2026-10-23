import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { SessionProvider } from "@/services/session";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RouteSettingEditor, RouteSettingPage } from "@/components/arch/route-setting";
import { setAccessToken } from "@/services/api";

/**
 * The route-setting page's save, reload and error paths.
 *
 * Each test stands in front of a fake backend that records the requests the
 * page makes. The page is allowed to look busy; it is not allowed to lose an
 * order on a failed save, or to show a draft as published.
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

// jsdom has no PointerEvent, so Testing Library would fall back to a plain
// Event without clientX/clientY. The canvas tests rely on real pointer geometry.
if (typeof window.PointerEvent === "undefined") {
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number;
    pointerType: string;
    isPrimary: boolean;

    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
      this.pointerType = init.pointerType ?? "mouse";
      this.isPrimary = init.isPrimary ?? true;
    }
  }
  Object.defineProperty(window, "PointerEvent", {
    configurable: true,
    writable: true,
    value: PointerEventPolyfill,
  });
}

function domRect(width: number, height: number): DOMRect {
  return {
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: width,
    bottom: height,
    width,
    height,
    toJSON: () => ({}),
  } as DOMRect;
}

function layoutCanvas(canvas: HTMLElement, width = 800, height = 600) {
  Object.defineProperty(canvas, "getBoundingClientRect", {
    configurable: true,
    value: () => domRect(width, height),
  });
  fireEvent(window, new Event("resize"));
}

function pointer(
  element: HTMLElement,
  type: "pointerDown" | "pointerMove" | "pointerUp",
  x: number,
  y: number,
) {
  fireEvent[type](element, {
    clientX: x,
    clientY: y,
    button: 0,
    buttons: type === "pointerUp" ? 0 : 1,
    pointerId: 1,
    pointerType: "mouse",
    isPrimary: true,
  });
}

const STAFF = {
  id: 4,
  email: "staff@example.com",
  full_name: "Sam Staff",
  role: "staff",
  is_active: true,
  phone: null,
  membership_tier: null,
  membership_status: null,
  joined_on: null,
  climbing_level: null,
};

const CUSTOMER = {
  ...STAFF,
  id: 8,
  email: "alex@example.com",
  full_name: "Alex Nguyen",
  role: "customer",
};

const WALL = {
  id: 1,
  name: "The Cave",
  description: "Steep overhang for power and commitment.",
  image_url: "/walls/main.jpg",
  sort_order: 1,
  is_active: true,
};

const ROUTE = {
  id: 1,
  name: "Warm Up",
  grade: "V2",
  wall_id: 1,
  status: "active",
};

const HOLDS = [1, 2].map((id) => ({
  id,
  wall_id: 1,
  label: "",
  x: 0.2 * id,
  y: 0.2 * id,
  width: 0.08,
  height: 0.08,
  created_at: "2026-10-23T00:00:00Z",
  updated_at: "2026-10-23T00:00:00Z",
}));

function holdSet(status: "draft" | "published", wallHoldIds: number[]) {
  return {
    id: 7,
    route_id: 1,
    status,
    wall_image_url: WALL.image_url,
    published_at: status === "published" ? "2026-10-23T01:00:00Z" : null,
    updated_at: "2026-10-23T01:00:00Z",
    holds: wallHoldIds.map((wallHoldId, index) => ({
      id: 100 + index,
      wall_hold_id: wallHoldId,
      label: "",
      x: 0.2,
      y: 0.2,
      width: 0.08,
      height: 0.08,
      position: index + 1,
      role: index === 0 ? "start" : index === wallHoldIds.length - 1 ? "finish" : "middle",
    })),
  };
}

type Hold = (typeof HOLDS)[number];

type Backend = {
  draft: ReturnType<typeof holdSet> | null;
  published: ReturnType<typeof holdSet> | null;
  holdSetStatus?: number;
  saveStatus?: number;
  wall?: Omit<typeof WALL, "image_url"> & { image_url: string | null };
  holds?: Hold[];
};

function mockBackend(backend: Backend) {
  const calls: { method: string; path: string; body?: unknown }[] = [];
  let holds = (backend.holds ?? HOLDS).map((hold) => ({ ...hold }));
  let nextHoldId = Math.max(0, ...holds.map((hold) => hold.id)) + 1;

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const path = url.replace(/^https?:\/\/[^/]+/, "");
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, path, body });

    if (path === "/api/auth/me") return jsonResponse(STAFF);
    if (path === "/api/staff/walls") return jsonResponse([backend.wall ?? WALL]);
    if (path === "/api/staff/walls/1/routes") return jsonResponse([ROUTE]);
    if (path === "/api/staff/walls/1/holds" && method === "GET") {
      return jsonResponse(backend.wall?.image_url === null ? [] : holds);
    }
    if (path === "/api/staff/walls/1/holds" && method === "POST") {
      const created: Hold = {
        ...HOLDS[0]!,
        ...(body as Partial<Hold>),
        id: nextHoldId,
        wall_id: 1,
        label: (body as { label?: string }).label ?? "",
        created_at: "2026-10-23T00:00:00Z",
        updated_at: "2026-10-23T00:00:00Z",
      };
      nextHoldId += 1;
      holds = [...holds, created];
      return jsonResponse(created, 201);
    }
    const holdMatch = path.match(/^\/api\/staff\/holds\/(\d+)$/);
    if (holdMatch && method === "PATCH") {
      const id = Number(holdMatch[1]);
      const index = holds.findIndex((hold) => hold.id === id);
      if (index < 0) return jsonResponse({ detail: "not found" }, 404);
      const updated: Hold = {
        ...holds[index]!,
        ...(body as Partial<Hold>),
        updated_at: "2026-10-23T00:01:00Z",
      };
      holds = holds.map((hold) => (hold.id === id ? updated : hold));
      return jsonResponse(updated);
    }
    if (holdMatch && method === "DELETE") {
      const id = Number(holdMatch[1]);
      holds = holds.filter((hold) => hold.id !== id);
      return new Response(null, { status: 204 });
    }
    if (path === "/api/staff/routes/1/hold-set" && method === "GET") {
      if (backend.holdSetStatus) {
        return jsonResponse({ detail: "The draft is unavailable" }, backend.holdSetStatus);
      }
      return jsonResponse({
        route_id: 1,
        draft: backend.draft,
        published: backend.published,
      });
    }
    if (path === "/api/staff/routes/1/hold-set" && method === "PUT") {
      if (backend.saveStatus) {
        return jsonResponse({ detail: "Database is locked" }, backend.saveStatus);
      }
      const ids = (body as { holds: { wall_hold_id: number }[] }).holds.map(
        (hold) => hold.wall_hold_id,
      );
      backend.draft = holdSet("draft", ids);
      return jsonResponse(backend.draft);
    }
    if (path === "/api/staff/routes/1/hold-set/publish" && method === "POST") {
      backend.published = holdSet(
        "published",
        backend.draft?.holds.map((hold) => hold.wall_hold_id) ?? [],
      );
      backend.draft = null;
      return jsonResponse(backend.published);
    }
    return jsonResponse({ detail: "not found" }, 404);
  });

  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock, getHolds: () => holds };
}

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>
      <SessionProvider>
        <RouteSettingEditor isAdmin />
      </SessionProvider>
    </QueryClientProvider>
  );
}

function queryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

async function chooseRoute() {
  await waitFor(() => expect(screen.getByLabelText("Route")).toBeEnabled());
  fireEvent.change(screen.getByLabelText("Route"), { target: { value: "1" } });
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Save draft" })).toBeInTheDocument(),
  );
}

async function openCanvas() {
  const canvas = await screen.findByTestId("hold-canvas");
  layoutCanvas(canvas);
  await waitFor(() => expect(document.querySelectorAll("[data-hold-id]").length).toBe(2));
  return canvas;
}

function holdBox(id: number): HTMLElement {
  const element = document.querySelector<HTMLElement>(`[data-hold-id="${id}"]`);
  expect(element).not.toBeNull();
  return element!;
}

function steps(): string[] {
  return Array.from(document.querySelectorAll(".hold-step-text strong")).map(
    (element) => element.textContent ?? "",
  );
}

async function selectWallHold(index: number) {
  await waitFor(() => {
    expect(document.querySelectorAll(".wall-hold-list button").length).toBe(2);
  });
  fireEvent.click(document.querySelectorAll<HTMLButtonElement>(".wall-hold-list button")[index]!);
}

beforeEach(() => {
  setAccessToken("test-token");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  setAccessToken(null);
});

describe("route-setting editor", () => {
  it("saves the ordered sequence and reloads it from the server", async () => {
    const backend: Backend = { draft: null, published: null };
    const { calls } = mockBackend(backend);
    render(wrapper());

    await chooseRoute();
    await selectWallHold(0);
    fireEvent.click(screen.getByRole("button", { name: /Add Hold 1 to the route/ }));
    await selectWallHold(1);
    fireEvent.click(screen.getByRole("button", { name: /Add Hold 2 to the route/ }));

    expect(screen.getByText("Step 1 · Start")).toBeInTheDocument();
    expect(screen.getByText("Step 2 · Finish")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await screen.findByText(/Draft saved\. Members still see/);

    const put = calls.find((call) => call.method === "PUT");
    expect(put?.body).toEqual({
      holds: [{ wall_hold_id: 1 }, { wall_hold_id: 2 }],
      wall_image_url: "/walls/main.jpg",
    });
    expect(backend.draft?.status).toBe("draft");

    // Change the page, then reload what the backend now holds: the same order
    // and roles must come back.
    fireEvent.click(screen.getByRole("button", { name: "Remove Hold 2 from the route" }));
    await waitFor(() => expect(screen.queryByText("Step 2 · Finish")).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "Reload draft" }));
    await screen.findByText("Step 2 · Finish");
    expect(screen.getByText("Step 1 · Start")).toBeInTheDocument();
  });

  it("publishes a saved draft and says members now see it", async () => {
    const backend: Backend = { draft: null, published: null };
    const { calls } = mockBackend(backend);
    render(wrapper());

    await chooseRoute();
    await selectWallHold(0);
    fireEvent.click(screen.getByRole("button", { name: /Add Hold 1 to the route/ }));
    await selectWallHold(1);
    fireEvent.click(screen.getByRole("button", { name: /Add Hold 2 to the route/ }));

    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await screen.findByText(/Draft saved\. Members still see/);

    const publish = screen.getByRole("button", { name: "Publish to members" });
    expect(publish).toBeEnabled();
    fireEvent.click(publish);

    await screen.findByText(/Published\. Members now see this sequence/);
    expect(calls.some((call) => call.method === "POST")).toBe(true);
    expect(backend.published?.holds).toHaveLength(2);
    expect(screen.getByText("No draft")).toBeInTheDocument();
  });

  it("keeps every edit when a save fails and allows a retry", async () => {
    const backend: Backend = { draft: null, published: null, saveStatus: 500 };
    mockBackend(backend);
    render(wrapper());

    await chooseRoute();
    await selectWallHold(0);
    fireEvent.click(screen.getByRole("button", { name: /Add Hold 1 to the route/ }));
    await selectWallHold(1);
    fireEvent.click(screen.getByRole("button", { name: /Add Hold 2 to the route/ }));

    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    await screen.findByRole("alert");
    expect(screen.getByRole("alert").textContent).toContain("Database is locked");
    expect(screen.getByText("Step 1 · Start")).toBeInTheDocument();
    expect(screen.getByText("Step 2 · Finish")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save draft" })).toBeEnabled();

    // A failed save must not throw the unsaved history away.
    expect(screen.getByRole("button", { name: "Undo" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(steps()).toEqual(["Hold 1"]));
  });

  it("undoes a new box with a compensating wall-hold delete, not a draft save", async () => {
    const { calls, getHolds } = mockBackend({ draft: null, published: null });
    render(wrapper());

    const canvas = await openCanvas();
    pointer(canvas, "pointerDown", 400, 300);
    pointer(canvas, "pointerUp", 400, 300);
    await waitFor(() => expect(getHolds()).toHaveLength(3));

    const undo = screen.getByRole("button", { name: "Undo" });
    expect(undo).toBeEnabled();
    fireEvent.click(undo);

    await waitFor(() => expect(getHolds()).toHaveLength(2));
    await screen.findByText("Undid adding a box.");
    const deletes = calls.filter((call) => call.method === "DELETE");
    expect(deletes).toHaveLength(1);
    expect(deletes[0]?.path).toContain("/api/staff/holds/3");
    expect(calls.some((call) => call.path.includes("/hold-set"))).toBe(false);
  });

  it("undoes a move and a resize back to the exact previous geometry", async () => {
    const { calls, getHolds } = mockBackend({ draft: null, published: null });
    render(wrapper());

    const canvas = await openCanvas();
    pointer(holdBox(1), "pointerDown", 192, 144);
    pointer(canvas, "pointerMove", 272, 204);
    pointer(canvas, "pointerUp", 272, 204);
    await waitFor(() => expect(getHolds().find((hold) => hold.id === 1)?.x).toBeCloseTo(0.3));

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(getHolds().find((hold) => hold.id === 1)?.x).toBeCloseTo(0.2));
    await screen.findByText("Undid moving a box.");

    const handle = document.querySelector<HTMLElement>('[data-corner="se"]');
    expect(handle).not.toBeNull();
    pointer(handle!, "pointerDown", 224, 168);
    pointer(canvas, "pointerMove", 304, 228);
    pointer(canvas, "pointerUp", 304, 228);
    await waitFor(() => expect(getHolds().find((hold) => hold.id === 1)?.width).toBeCloseTo(0.18));

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(getHolds().find((hold) => hold.id === 1)?.width).toBeCloseTo(0.08));
    await screen.findByText("Undid resizing a box.");
  });

  it("undoes deleting a box by recreating it", async () => {
    const { getHolds } = mockBackend({ draft: null, published: null });
    render(wrapper());

    await openCanvas();
    await selectWallHold(1);
    fireEvent.click(screen.getByRole("button", { name: "Delete box" }));
    await waitFor(() => expect(getHolds()).toHaveLength(1));

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(getHolds()).toHaveLength(2));
    await screen.findByText("Undid deleting a box.");
    expect(getHolds().find((hold) => hold.x === 0.4)?.id).toBe(3);
  });

  it("undoes route membership, order and role changes one operation at a time", async () => {
    const { calls } = mockBackend({ draft: null, published: null });
    render(wrapper());

    await chooseRoute();
    await selectWallHold(0);
    fireEvent.click(screen.getByRole("button", { name: /Add Hold 1 to the route/ }));
    await selectWallHold(1);
    fireEvent.click(screen.getByRole("button", { name: /Add Hold 2 to the route/ }));
    expect(steps()).toEqual(["Hold 1", "Hold 2"]);

    fireEvent.click(screen.getByRole("button", { name: "Move Hold 2 earlier" }));
    expect(steps()).toEqual(["Hold 2", "Hold 1"]);

    const beforeUndo = calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(steps()).toEqual(["Hold 1", "Hold 2"]);
    expect(calls.length).toBe(beforeUndo);
    expect(calls.some((call) => call.method === "POST")).toBe(false);

    fireEvent.click(screen.getAllByRole("button", { name: "Make finish" })[0]!);
    expect(steps()).toEqual(["Hold 2", "Hold 1"]);
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(steps()).toEqual(["Hold 1", "Hold 2"]);

    fireEvent.click(screen.getAllByRole("button", { name: "Make start" })[1]!);
    expect(steps()).toEqual(["Hold 2", "Hold 1"]);
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(steps()).toEqual(["Hold 1", "Hold 2"]);

    fireEvent.click(screen.getByRole("button", { name: "Remove Hold 2 from the route" }));
    expect(steps()).toEqual(["Hold 1"]);
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(steps()).toEqual(["Hold 1", "Hold 2"]);

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(steps()).toEqual(["Hold 1"]);
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(steps()).toEqual([]);
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
  });

  it("starts a fresh undo history after a successful save", async () => {
    const { calls } = mockBackend({ draft: null, published: null });
    render(wrapper());

    await chooseRoute();
    await selectWallHold(0);
    fireEvent.click(screen.getByRole("button", { name: /Add Hold 1 to the route/ }));
    await selectWallHold(1);
    fireEvent.click(screen.getByRole("button", { name: /Add Hold 2 to the route/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await screen.findByText(/Draft saved\. Members still see/);

    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(steps()).toEqual(["Hold 1", "Hold 2"]);

    fireEvent.click(screen.getByRole("button", { name: "Remove Hold 1 from the route" }));
    expect(steps()).toEqual(["Hold 2"]);
    const beforeUndo = calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(steps()).toEqual(["Hold 1", "Hold 2"]);
    expect(calls.length).toBe(beforeUndo);
  });

  it("uses Ctrl+Z only while the editing surface has focus", async () => {
    const { calls } = mockBackend({ draft: null, published: null });
    render(wrapper());

    await chooseRoute();
    const canvas = await openCanvas();
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
    fireEvent.keyDown(canvas, { key: "z", ctrlKey: true });
    expect(steps()).toEqual([]);

    await selectWallHold(0);
    fireEvent.click(screen.getByRole("button", { name: /Add Hold 1 to the route/ }));
    expect(steps()).toEqual(["Hold 1"]);

    const box = holdBox(1);
    box.focus();
    fireEvent.keyDown(box, { key: "z", ctrlKey: true });
    await waitFor(() => expect(steps()).toEqual([]));

    await selectWallHold(0);
    fireEvent.click(screen.getByRole("button", { name: /Add Hold 1 to the route/ }));
    expect(steps()).toEqual(["Hold 1"]);

    const routeSelect = screen.getByLabelText("Route");
    routeSelect.focus();
    const beforeUndo = calls.length;
    fireEvent.keyDown(routeSelect, { key: "z", ctrlKey: true });
    expect(steps()).toEqual(["Hold 1"]);
    expect(calls.length).toBe(beforeUndo);

    fireEvent.keyDown(document.body, { key: "z", ctrlKey: true });
    expect(steps()).toEqual(["Hold 1"]);

    canvas.focus();
    fireEvent.keyDown(canvas, { key: "z", metaKey: true });
    await waitFor(() => expect(steps()).toEqual([]));
  });

  it("does not offer publication to staff without the administrator role", async () => {
    mockBackend({ draft: holdSet("draft", [1, 2]), published: null });
    render(
      <QueryClientProvider client={queryClient()}>
        <RouteSettingEditor isAdmin={false} />
      </QueryClientProvider>,
    );

    await chooseRoute();
    await screen.findByText("Step 1 · Start");
    expect(screen.queryByRole("button", { name: "Publish to members" })).toBeNull();
    expect(screen.getByText("An administrator publishes the sequence.")).toBeInTheDocument();
  });

  it("shows a route's published sequence when no draft exists", async () => {
    mockBackend({
      draft: null,
      published: holdSet("published", [2, 1]),
    });
    render(wrapper());

    await chooseRoute();
    await screen.findByText("Step 1 · Start");
    const items = screen.getAllByRole("listitem");
    expect(items.some((item) => item.textContent?.includes("Hold 2"))).toBe(true);
  });

  it("reports a failed draft load instead of pretending there are no holds", async () => {
    mockBackend({ draft: null, published: null, holdSetStatus: 503 });
    render(wrapper());

    await waitFor(() => expect(screen.getByLabelText("Route")).toBeEnabled());
    fireEvent.change(screen.getByLabelText("Route"), { target: { value: "1" } });
    await screen.findByText("The draft is unavailable");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("asks for a photograph instead of showing an empty annotation area", async () => {
    mockBackend({
      draft: null,
      published: null,
      wall: { ...WALL, image_url: null },
    });
    render(wrapper());

    await screen.findByText("This wall has no photograph");
    expect(screen.queryByTestId("hold-canvas")).toBeNull();
  });

  it("explains a photograph that fails to load", async () => {
    mockBackend({ draft: null, published: null });
    render(wrapper());

    const image = await screen.findByAltText("The selected wall's photograph");
    fireEvent.error(image);
    await screen.findByText("The photograph could not be loaded");
  });

  it("denies the page to a member and keeps the route editor away from them", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input).replace(/^https?:\/\/[^/]+/, "");
      if (path === "/api/auth/me") return jsonResponse(CUSTOMER);
      return jsonResponse({ detail: "not found" }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <QueryClientProvider client={queryClient()}>
        <SessionProvider>
          <RouteSettingPage />
        </SessionProvider>
      </QueryClientProvider>,
    );

    await screen.findByText("You need a staff or administrator account to see this");
    expect(screen.queryByLabelText("Wall")).toBeNull();
  });
});
