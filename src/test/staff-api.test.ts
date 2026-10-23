import { describe, expect, it, vi, afterEach } from "vitest";

import { API_BASE_URL, ApiError, setAccessToken } from "@/services/api";

/**
 * The staff and administration endpoints. The permission checks themselves
 * live in the backend; these tests pin the request shapes and the way a
 * refusal is reported.
 */
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function mockFetch(handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  return vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(handler);
}

afterEach(() => {
  vi.unstubAllGlobals();
  setAccessToken(null);
});

describe("the staff endpoints", () => {
  it("asks for the signed-in member's own tasks", async () => {
    const fetchMock = mockFetch(async () => jsonResponse([]));
    vi.stubGlobal("fetch", fetchMock);

    const { staffApi } = await import("@/services/api");
    await staffApi.myTasks();

    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toBe(`${API_BASE_URL}/api/staff/tasks`);
  });

  it("can ask for every task", async () => {
    const fetchMock = mockFetch(async () => jsonResponse([]));
    vi.stubGlobal("fetch", fetchMock);

    const { staffApi } = await import("@/services/api");
    await staffApi.myTasks(true);

    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toBe(`${API_BASE_URL}/api/staff/tasks?all=true`);
  });

  it("reports a refusal as an ApiError with the status", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(async () => jsonResponse({ detail: "You do not have permission" }, 403)),
    );

    const { staffApi } = await import("@/services/api");
    await expect(staffApi.myTasks()).rejects.toMatchObject({
      status: 403,
      message: "You do not have permission",
    });
  });
});

describe("the administration endpoints", () => {
  it("sends the access token with a protected request", async () => {
    setAccessToken("token-123");
    const fetchMock = mockFetch(async () =>
      jsonResponse({
        members: 3,
        staff: 1,
        active_routes: 6,
        archived_routes: 0,
        upcoming_events: 1,
        open_tasks: 2,
        pending_agreements: 1,
        products: 3,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { adminApi } = await import("@/services/api");
    const summary = await adminApi.summary();

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${API_BASE_URL}/api/admin/summary`);
    expect((init.headers as Headers).get("Authorization")).toBe("Bearer token-123");
    expect(summary.members).toBe(3);
  });

  it("encodes the member search", async () => {
    const fetchMock = mockFetch(async () => jsonResponse([]));
    vi.stubGlobal("fetch", fetchMock);

    const { adminApi } = await import("@/services/api");
    await adminApi.members("Alex Nguyen");

    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toBe(`${API_BASE_URL}/api/admin/members?search=Alex%20Nguyen`);
  });

  it("builds the customer directory query and detail URL", async () => {
    const fetchMock = mockFetch(async () =>
      jsonResponse({ items: [], total: 0, limit: 20, offset: 0 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { adminApi } = await import("@/services/api");
    await adminApi.customers({
      search: "Alex Nguyen",
      role: "customer",
      status: "active",
      limit: 20,
      offset: 40,
    });
    await adminApi.customer(7);

    const [listUrl] = fetchMock.mock.calls[0] as unknown as [string];
    const [detailUrl] = fetchMock.mock.calls[1] as unknown as [string];
    expect(listUrl).toBe(
      `${API_BASE_URL}/api/admin/customers?search=Alex+Nguyen&role=customer&status=active&limit=20&offset=40`,
    );
    expect(detailUrl).toBe(`${API_BASE_URL}/api/admin/customers/7`);
  });

  it("posts a new route with the official grade", async () => {
    const fetchMock = mockFetch(async () => jsonResponse({ id: 9, name: "New Route" }));
    vi.stubGlobal("fetch", fetchMock);

    const { adminApi } = await import("@/services/api");
    await adminApi.createRoute({ name: "New Route", grade: "V4" });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${API_BASE_URL}/api/admin/routes`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ name: "New Route", grade: "V4" });
  });

  it("raises an ApiError for a rejected request", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(async () => jsonResponse({ detail: "nope" }, 422)),
    );

    const { adminApi } = await import("@/services/api");
    await expect(adminApi.createRoute({ name: "x", grade: "V0" })).rejects.toBeInstanceOf(ApiError);
  });

  it("loads the administrator assignee options", async () => {
    const fetchMock = mockFetch(async () =>
      jsonResponse([{ id: 4, full_name: "Sam Staff", email: "sam@example.com", role: "staff" }]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { adminApi } = await import("@/services/api");
    const assignees = await adminApi.assignees();

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${API_BASE_URL}/api/admin/assignees`);
    expect(init.method ?? "GET").toBe("GET");
    expect(assignees[0]?.full_name).toBe("Sam Staff");
  });

  it("creates a task with assignee, priority, due date, event and checklist", async () => {
    const fetchMock = mockFetch(async () => jsonResponse({ id: 12, title: "Open the wall" }));
    vi.stubGlobal("fetch", fetchMock);

    const { adminApi } = await import("@/services/api");
    await adminApi.createTask({
      title: "Open the wall",
      description: "Check the holds",
      assignee_id: 4,
      priority: "high",
      due_at: "2026-11-05T18:00:00.000Z",
      event_id: 3,
      checklist: [{ label: "Collect the holds" }, { label: "Check the lighting" }],
    });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${API_BASE_URL}/api/staff/tasks`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      title: "Open the wall",
      description: "Check the holds",
      assignee_id: 4,
      priority: "high",
      due_at: "2026-11-05T18:00:00.000Z",
      event_id: 3,
      checklist: [{ label: "Collect the holds" }, { label: "Check the lighting" }],
    });
  });

  it("patches changed task fields and can explicitly clear optional fields", async () => {
    const fetchMock = mockFetch(async () => jsonResponse({ id: 12, title: "Reassigned" }));
    vi.stubGlobal("fetch", fetchMock);

    const { staffApi } = await import("@/services/api");
    await staffApi.updateTask(12, {
      title: "Reassigned",
      assignee_id: null,
      due_at: null,
      event_id: null,
    });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${API_BASE_URL}/api/staff/tasks/12`);
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(String(init.body))).toEqual({
      title: "Reassigned",
      assignee_id: null,
      due_at: null,
      event_id: null,
    });
  });

  it("lists and creates shifts", async () => {
    const fetchMock = mockFetch(async (input, init) => {
      if (String(input).endsWith("/api/staff/shifts") && init?.method === "POST") {
        return jsonResponse({ id: 9, staff_id: 4, starts_at: "2026-11-05T09:00:00.000Z" });
      }
      return jsonResponse([]);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { staffApi } = await import("@/services/api");
    await staffApi.shifts();
    await staffApi.createShift({
      staff_id: 4,
      starts_at: "2026-11-05T09:00:00.000Z",
      ends_at: "2026-11-05T17:00:00.000Z",
      role: "Floor staff",
      notes: "Open the bouldering area",
    });

    const [listUrl, listInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const [createUrl, createInit] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(listUrl).toBe(`${API_BASE_URL}/api/staff/shifts`);
    expect(listInit.method ?? "GET").toBe("GET");
    expect(createUrl).toBe(`${API_BASE_URL}/api/staff/shifts`);
    expect(createInit.method).toBe("POST");
    expect(JSON.parse(String(createInit.body))).toEqual({
      staff_id: 4,
      starts_at: "2026-11-05T09:00:00.000Z",
      ends_at: "2026-11-05T17:00:00.000Z",
      role: "Floor staff",
      notes: "Open the bouldering area",
    });
  });
});
