import { fireEvent, render, screen, within } from "@testing-library/react";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  DashboardOverview,
  DashboardUnavailable,
  DashboardWelcome,
} from "@/components/arch/member-dashboard";
import { formatClimbDate, shareOf } from "@/services/arch";
import type { MemberDashboard } from "@/services/arch";

/**
 * The dashboard only shows what the backend sent, so these tests give it a
 * payload and check what a member would read. The router is real: the route
 * links are part of the behaviour being tested.
 */

const SCORING_RULE = "Sends count for points: one point for V0, one more for each grade above it.";
const PERCENTILE_RULE =
  "The percentile is the share of ranked climbers who are at or behind your position.";

function dashboard(overrides: Partial<MemberDashboard> = {}): MemberDashboard {
  return {
    activeRoutes: 6,
    totalSends: 8,
    totalSessions: 5,
    bestGrade: "V5",
    activeProjects: 2,
    outcomes: { sends: 8, flashes: 3, projects: 2, attempts: 19 },
    byGrade: [
      { grade: "V1", sends: 2, flashes: 1, projects: 0 },
      { grade: "V3", sends: 5, flashes: 2, projects: 1 },
      { grade: "V5", sends: 1, flashes: 0, projects: 1 },
      { grade: "V6", sends: 0, flashes: 0, projects: 2 },
    ],
    ranking: {
      rank: 4,
      rankedCount: 17,
      ahead: 3,
      percentile: 82,
      score: 18,
      totalSends: 8,
      bestGrade: "V5",
      scoringRule: SCORING_RULE,
      percentileRule: PERCENTILE_RULE,
    },
    recentAttempts: [
      {
        id: "12",
        routeId: 7,
        route: "Sloper Opera",
        grade: "V4",
        result: "sent",
        attempts: 1,
        date: "2026-10-20",
        isFlash: true,
      },
      {
        id: "11",
        routeId: null,
        route: "Dyno-Mite",
        grade: "V6",
        result: "project",
        attempts: 4,
        date: "2026-10-19",
        isFlash: false,
      },
    ],
    hasActivity: true,
    firstClimb: "2026-09-02",
    lastClimb: "2026-10-20",
    agreementStatus: "signed",
    ...overrides,
  };
}

/** Render a dashboard view inside a real router, with the linked pages stubbed. */
async function renderAt(ui: ReactNode, expected: RegExp) {
  const rootRoute = createRootRoute();
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <>{ui}</>,
  });
  const stubs = ["/leaderboard", "/member/logbook", "/routes", "/routes/$routeId"].map((path) =>
    createRoute({ getParentRoute: () => rootRoute, path, component: () => null }),
  );
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, ...stubs]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });

  render(<RouterProvider router={router} />);
  await screen.findByText(expected);
  return router;
}

/** The metric card carrying a given label, so its number is unambiguous. */
function metric(label: string): HTMLElement {
  const card = screen.getByText(label).closest(".metric");
  if (!(card instanceof HTMLElement)) throw new Error(`No metric card labelled ${label}`);
  return card;
}

/** The outcome row for Sent, Flashed or Projecting. */
function outcome(label: string): HTMLElement {
  const list = document.querySelector(".outcome-list");
  if (!(list instanceof HTMLElement)) throw new Error("No outcome distribution");
  const row = within(list).getByText(label).closest(".outcome-row");
  if (!(row instanceof HTMLElement)) throw new Error(`No outcome row labelled ${label}`);
  return row;
}

describe("the member dashboard", () => {
  it("shows the member's headline figures with the meaning of each", async () => {
    await renderAt(<DashboardOverview dashboard={dashboard()} />, /On the wall/);

    expect(within(metric("On the wall")).getByText("6")).toBeTruthy();
    expect(within(metric("On the wall")).getByText("Routes set in the gym")).toBeTruthy();
    expect(within(metric("Sends")).getByText("8")).toBeTruthy();
    expect(within(metric("Flashes")).getByText("3")).toBeTruthy();
    expect(within(metric("Projects")).getByText("2")).toBeTruthy();
    expect(within(metric("Best grade")).getByText("V5")).toBeTruthy();
    expect(within(metric("Sessions")).getByText("5")).toBeTruthy();
    // Sessions are days, not attempts: the card says so.
    expect(within(metric("Sessions")).getByText("Days you have logged a climb")).toBeTruthy();
  });

  it("spells out the outcome distribution and its denominators", async () => {
    await renderAt(<DashboardOverview dashboard={dashboard()} />, /How your climbing went/);

    expect(screen.getByText(/flashes sit inside your sends/)).toBeTruthy();

    expect(within(outcome("Sent")).getByText("8")).toBeTruthy();
    expect(within(outcome("Sent")).getByText("80% of your 10 logged climbs")).toBeTruthy();

    expect(within(outcome("Flashed")).getByText("3")).toBeTruthy();
    expect(within(outcome("Flashed")).getByText("38% of your 8 sends")).toBeTruthy();

    expect(within(outcome("Projecting")).getByText("2")).toBeTruthy();
    expect(within(outcome("Projecting")).getByText("20% of your 10 logged climbs")).toBeTruthy();
  });

  it("speaks about a single climb in the singular", async () => {
    await renderAt(
      <DashboardOverview
        dashboard={dashboard({
          outcomes: { sends: 1, flashes: 1, projects: 0, attempts: 1 },
          byGrade: [{ grade: "V3", sends: 1, flashes: 1, projects: 0 }],
          recentAttempts: [],
          totalSends: 1,
          totalSessions: 1,
          activeProjects: 0,
          bestGrade: "V3",
        })}
      />,
      /On the wall/,
    );

    expect(within(outcome("Sent")).getByText("100% of your 1 logged climb")).toBeTruthy();
    expect(within(outcome("Flashed")).getByText("100% of your 1 send")).toBeTruthy();
    expect(within(outcome("Projecting")).getByText("0% of your 1 logged climb")).toBeTruthy();
  });

  it("survives a record with no attempts instead of dividing by zero", async () => {
    await renderAt(
      <DashboardOverview
        dashboard={dashboard({
          outcomes: { sends: 0, flashes: 0, projects: 0, attempts: 0 },
          byGrade: [],
          recentAttempts: [],
          totalSends: 0,
          totalSessions: 0,
          activeProjects: 0,
          bestGrade: null,
        })}
      />,
      /On the wall/,
    );

    expect(within(outcome("Sent")).getByText("0% no climbs logged yet")).toBeTruthy();
    expect(within(outcome("Flashed")).getByText("0% no sends yet")).toBeTruthy();
    expect(within(outcome("Projecting")).getByText("0% no climbs logged yet")).toBeTruthy();
    expect(screen.getByText("No grades recorded yet.")).toBeTruthy();
    expect(screen.getByText("No climbs logged yet.")).toBeTruthy();
    // No best grade is unavailable, not a zero.
    expect(within(metric("Best grade")).getByText("—")).toBeTruthy();
  });

  it("groups the record by grade with readable values", async () => {
    await renderAt(<DashboardOverview dashboard={dashboard()} />, /Your record by grade/);

    const stats = document.querySelector(".grade-stats");
    if (!(stats instanceof HTMLElement)) throw new Error("No grade statistics");
    const row = (grade: string) => {
      const found = within(stats).getByText(grade).closest(".grade-row");
      if (!(found instanceof HTMLElement)) throw new Error(`No grade row for ${grade}`);
      return found;
    };

    expect(within(row("V3")).getByText("5 sends · 2 flashed · 1 project")).toBeTruthy();
    expect(within(row("V1")).getByText("2 sends · 1 flashed")).toBeTruthy();

    // A grade the member has only projected is still listed, with no send bar
    // rather than a bar that implies one.
    expect(within(row("V6")).getByText("0 sends · 2 projects")).toBeTruthy();
    expect(row("V6").querySelector(".grade-fill")?.getAttribute("style")).toContain("width: 0%");

    // The busiest grade fills the track, so the bars are comparable.
    expect(row("V3").querySelector(".grade-fill")?.getAttribute("style")).toContain("width: 100%");
  });

  it("shows the rank, the ranked population and the rule that came with them", async () => {
    await renderAt(<DashboardOverview dashboard={dashboard()} />, /Where you stand/);

    expect(screen.getByText("#4")).toBeTruthy();
    expect(screen.getByText("17")).toBeTruthy();
    expect(screen.getByText("82")).toBeTruthy();
    expect(screen.getByText(SCORING_RULE)).toBeTruthy();
    expect(screen.getByText(PERCENTILE_RULE)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Leaderboard" }).getAttribute("href")).toBe(
      "/leaderboard",
    );
  });

  it("renders the rules the response carried, not a copy written into the page", async () => {
    const custom = dashboard();
    await renderAt(
      <DashboardOverview
        dashboard={{
          ...custom,
          ranking: {
            ...custom.ranking,
            scoringRule: "Score by sends only.",
            percentileRule: "Share of climbers behind you.",
          },
        }}
      />,
      /Where you stand/,
    );

    expect(screen.getByText("Score by sends only.")).toBeTruthy();
    expect(screen.getByText("Share of climbers behind you.")).toBeTruthy();
    expect(screen.queryByText(SCORING_RULE)).toBeNull();
  });

  it("does not invent a rank or a percentile for an unranked member", async () => {
    const base = dashboard();
    await renderAt(
      <DashboardOverview
        dashboard={{
          ...base,
          ranking: {
            ...base.ranking,
            rank: null,
            ahead: 0,
            percentile: null,
            score: 0,
            totalSends: 0,
            bestGrade: null,
          },
        }}
      />,
      /Where you stand/,
    );

    expect(screen.getByText(/not on the leaderboard yet/i)).toBeTruthy();
    expect(document.body.textContent).not.toContain("#0");
    expect(document.body.textContent).not.toContain("#null");
    // The scoring rule still explains how the leaderboard works.
    expect(screen.getByText(SCORING_RULE)).toBeTruthy();
    // There is no percentile to explain, so the percentile rule is not shown.
    expect(screen.queryByText(PERCENTILE_RULE)).toBeNull();
  });

  it("shows a ranked member with no percentile as unavailable, not as zero", async () => {
    const base = dashboard();
    await renderAt(
      <DashboardOverview dashboard={{ ...base, ranking: { ...base.ranking, percentile: null } }} />,
      /Where you stand/,
    );

    expect(screen.getByText("#4")).toBeTruthy();
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.queryByText("0")).toBeNull();
    expect(screen.queryByText(PERCENTILE_RULE)).toBeNull();
  });

  it("links each recent attempt to its route and names the outcome", async () => {
    await renderAt(<DashboardOverview dashboard={dashboard()} />, /Your recent attempts/);

    const route = screen.getByRole("link", { name: "Sloper Opera" });
    expect(route.getAttribute("href")).toBe("/routes/7");
    expect(screen.getByText("V4 · 20 Oct 2026 · 1 attempt")).toBeTruthy();
    expect(screen.getByText("FIRST TRY")).toBeTruthy();

    const attempts = document.querySelector(".attempt-list");
    if (!(attempts instanceof HTMLElement)) throw new Error("No recent attempts list");
    expect(within(attempts).getByText("Sent")).toBeTruthy();

    // An attempt whose route is no longer in the directory is still listed,
    // but it is not a link to a page that no longer exists.
    expect(screen.getByText("Dyno-Mite")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Dyno-Mite" })).toBeNull();
    expect(within(attempts).getByText("Project")).toBeTruthy();

    expect(screen.getByRole("link", { name: "Logbook" }).getAttribute("href")).toBe(
      "/member/logbook",
    );
  });
});

describe("a member who has not logged anything yet", () => {
  it("is welcomed rather than shown a page of zeroes", async () => {
    await renderAt(
      <DashboardWelcome activeRoutes={6} onLogAttempt={() => {}} />,
      /ready for its first line/,
    );

    expect(screen.getByText(/There are 6 routes on the wall right now/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Log an attempt/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Browse the routes/ }).getAttribute("href")).toBe(
      "/routes",
    );
    // No sample achievements are offered as the member's own.
    expect(document.querySelector(".metric")).toBeNull();
    expect(document.querySelector(".outcome-list")).toBeNull();
    expect(screen.queryByText("Flashes")).toBeNull();
  });

  it("does not promise routes when the wall is empty", async () => {
    await renderAt(
      <DashboardWelcome activeRoutes={0} onLogAttempt={() => {}} />,
      /ready for its first line/,
    );

    expect(screen.queryByText(/routes on the wall right now/)).toBeNull();
    expect(screen.getByText(/Log what you climb/)).toBeTruthy();
  });
});

describe("when the dashboard cannot be loaded", () => {
  it("says the record is unavailable and offers a retry", async () => {
    const onRetry = vi.fn();
    await renderAt(
      <DashboardUnavailable message="The ARCH service is not reachable." onRetry={onRetry} />,
      /could not be loaded/,
    );

    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText(/The ARCH service is not reachable\./)).toBeTruthy();
    expect(screen.getByText(/Nothing is lost/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Try again/ }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe("the dashboard helpers", () => {
  it("works out a share without dividing by zero", () => {
    expect(shareOf(3, 8)).toBe(38);
    expect(shareOf(8, 8)).toBe(100);
    expect(shareOf(0, 10)).toBe(0);
    expect(shareOf(0, 0)).toBe(0);
  });

  it("formats a climbing day without shifting it by a timezone", () => {
    expect(formatClimbDate("2026-10-20")).toBe("20 Oct 2026");
    expect(formatClimbDate("2026-01-05")).toBe("5 Jan 2026");
    expect(formatClimbDate("not a date")).toBe("not a date");
  });
});
