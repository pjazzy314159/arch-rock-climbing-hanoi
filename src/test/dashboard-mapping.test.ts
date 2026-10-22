import { describe, expect, it, vi, afterEach } from "vitest";

import { API_BASE_URL, setAccessToken } from "@/services/api";
import type { ApiDashboard } from "@/services/types";

/**
 * The member dashboard.
 *
 * The backend sends the member's own record, and the service layer maps it to
 * the shape the pages render. Two things matter here: every field arrives,
 * and a value that is not available stays unavailable — it never quietly
 * becomes a zero, and the dashboard never falls back to made-up numbers.
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

const apiDashboard: ApiDashboard = {
  active_routes: 12,
  total_sends: 8,
  total_sessions: 3,
  best_grade: "V4",
  active_projects: 2,
  outcomes: { sends: 8, flashes: 3, projects: 2, attempts: 14 },
  by_grade: [
    { grade: "V1", sends: 2, flashes: 1, projects: 0 },
    { grade: "V4", sends: 6, flashes: 2, projects: 2 },
  ],
  ranking: {
    rank: 4,
    ranked_count: 17,
    ahead: 3,
    percentile: 82,
    score: 41,
    total_sends: 8,
    best_grade: "V4",
    scoring_rule: "Sends only. A logged send is worth one point per grade step.",
    percentile_rule: "The share of ranked climbers at or behind your position.",
  },
  recent_attempts: [
    {
      id: 31,
      route_id: 5,
      route_name: "Quiet the Mind",
      grade: "V4",
      result: "sent",
      attempts: 1,
      climbed_on: "2026-10-20",
      is_flash: true,
    },
    {
      id: 30,
      route_id: 6,
      route_name: "After Hours",
      grade: "V6",
      result: "project",
      attempts: 4,
      climbed_on: "2026-10-19",
      is_flash: false,
    },
  ],
  has_activity: true,
  first_climb: "2026-09-02",
  last_climb: "2026-10-20",
  agreement_status: "signed",
};

afterEach(() => {
  vi.unstubAllGlobals();
  setAccessToken(null);
});

describe("the member dashboard mapping", () => {
  it("carries every part of the answer across", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(async () => jsonResponse(apiDashboard)),
    );

    const { archService } = await import("@/services/arch");
    const result = await archService.getMyDashboard();

    expect(result.source).toBe("api");
    const dashboard = result.data;
    if (!dashboard) throw new Error("expected a dashboard");

    expect(dashboard.activeRoutes).toBe(12);
    expect(dashboard.totalSends).toBe(8);
    expect(dashboard.totalSessions).toBe(3);
    expect(dashboard.bestGrade).toBe("V4");
    expect(dashboard.activeProjects).toBe(2);
    expect(dashboard.hasActivity).toBe(true);
    expect(dashboard.firstClimb).toBe("2026-09-02");
    expect(dashboard.lastClimb).toBe("2026-10-20");
    expect(dashboard.agreementStatus).toBe("signed");

    expect(dashboard.outcomes).toEqual({
      sends: 8,
      flashes: 3,
      projects: 2,
      attempts: 14,
    });
    expect(dashboard.byGrade).toHaveLength(2);
    expect(dashboard.byGrade[1]).toEqual({
      grade: "V4",
      sends: 6,
      flashes: 2,
      projects: 2,
    });
    expect(dashboard.recentAttempts).toHaveLength(2);
    expect(dashboard.recentAttempts[0]).toEqual({
      id: "31",
      routeId: 5,
      route: "Quiet the Mind",
      grade: "V4",
      result: "sent",
      attempts: 1,
      date: "2026-10-20",
      isFlash: true,
    });
  });

  it("keeps the ranking rule that came with the numbers", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(async () => jsonResponse(apiDashboard)),
    );

    const { archService } = await import("@/services/arch");
    const result = await archService.getMyDashboard();

    const dashboard = result.data;
    if (!dashboard) throw new Error("expected a dashboard");
    expect(dashboard.ranking.rank).toBe(4);
    expect(dashboard.ranking.rankedCount).toBe(17);
    expect(dashboard.ranking.ahead).toBe(3);
    expect(dashboard.ranking.percentile).toBe(82);
    expect(dashboard.ranking.score).toBe(41);
    expect(dashboard.ranking.bestGrade).toBe("V4");
    // The rule is not written out again in the interface; it travels with the
    // answer so the two cannot drift apart.
    expect(dashboard.ranking.scoringRule).toBe(apiDashboard.ranking.scoring_rule);
    expect(dashboard.ranking.percentileRule).toBe(apiDashboard.ranking.percentile_rule);
  });

  it("keeps a value that is not available unavailable", async () => {
    const emptyMember: ApiDashboard = {
      ...apiDashboard,
      total_sends: 0,
      total_sessions: 0,
      best_grade: null,
      active_projects: 0,
      outcomes: { sends: 0, flashes: 0, projects: 0, attempts: 0 },
      by_grade: [],
      recent_attempts: [],
      has_activity: false,
      first_climb: null,
      last_climb: null,
      ranking: {
        ...apiDashboard.ranking,
        rank: null,
        percentile: null,
        score: 0,
        total_sends: 0,
        best_grade: null,
      },
    };
    vi.stubGlobal(
      "fetch",
      mockFetch(async () => jsonResponse(emptyMember)),
    );

    const { archService } = await import("@/services/arch");
    const result = await archService.getMyDashboard();

    const dashboard = result.data;
    if (!dashboard) throw new Error("expected a dashboard");
    // No best grade is not a best grade of V0, and no rank is not rank 0.
    expect(dashboard.bestGrade).toBeNull();
    expect(dashboard.ranking.rank).toBeNull();
    expect(dashboard.ranking.percentile).toBeNull();
    expect(dashboard.hasActivity).toBe(false);
    expect(dashboard.firstClimb).toBeNull();
    expect(dashboard.lastClimb).toBeNull();
  });

  it("never replaces the member's record with sample numbers", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(async () => jsonResponse({ detail: "boom" }, 500)),
    );

    const { archService } = await import("@/services/arch");
    const result = await archService.getMyDashboard();

    // Unavailable is shown as unavailable, not as a dashboard of zeroes.
    expect(result.data).toBeNull();
    expect(result.error).toBeTruthy();
  });

  it("asks the backend for the signed-in member's own dashboard", async () => {
    const fetchMock = mockFetch(async () => jsonResponse(apiDashboard));
    vi.stubGlobal("fetch", fetchMock);

    const { archService } = await import("@/services/arch");
    await archService.getMyDashboard();

    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toBe(`${API_BASE_URL}/api/me/dashboard`);
  });
});
