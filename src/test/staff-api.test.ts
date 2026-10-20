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
});
