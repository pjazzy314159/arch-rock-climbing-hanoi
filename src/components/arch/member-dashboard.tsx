import { Link } from "@tanstack/react-router";
import { ArrowUpRight, CloudOff, Mountain, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import type {
  DashboardAttempt,
  DashboardGradeStat,
  DashboardOutcomes,
  DashboardRanking,
  MemberDashboard,
} from "@/services/arch";
import { formatClimbDate, shareOf } from "@/services/arch";
import { TextLink } from "./shared";

/**
 * The member dashboard.
 *
 * Everything shown here comes from the signed-in member's own records, or
 * from the gym's own route list. There are three states, and they are kept
 * apart on purpose:
 *
 * 1. the member has records — the dashboard is shown;
 * 2. the member has no records yet — a welcoming empty state, never a page of
 *    zeroes that reads like a record of failure;
 * 3. the records could not be loaded — an explanation and a way to try again,
 *    never an empty climbing history.
 */

/* -------------------------------------------------------------------------- */
/* The headline figures                                                         */
/* -------------------------------------------------------------------------- */

function DashboardMetrics({ dashboard }: { dashboard: MemberDashboard }) {
  const metrics = [
    {
      label: "On the wall",
      value: dashboard.activeRoutes,
      detail: "Routes set in the gym",
    },
    { label: "Sends", value: dashboard.totalSends, detail: "Climbs you have sent" },
    {
      label: "Flashes",
      value: dashboard.outcomes.flashes,
      detail: "Sent on the first try",
    },
    { label: "Projects", value: dashboard.activeProjects, detail: "Still to crack" },
    {
      label: "Best grade",
      value: dashboard.bestGrade ?? "—",
      detail: "Your hardest send",
    },
    {
      label: "Sessions",
      value: dashboard.totalSessions,
      detail: "Days you have logged a climb",
    },
  ];

  return (
    <div className="metric-grid dashboard-metrics">
      {metrics.map((metric) => (
        <div className="metric" key={metric.label}>
          <span>{metric.label}</span>
          <strong>{metric.value}</strong>
          <small>{metric.detail}</small>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* How the climbs went                                                         */
/* -------------------------------------------------------------------------- */

function OutcomeDistribution({ outcomes }: { outcomes: DashboardOutcomes }) {
  const logged = outcomes.sends + outcomes.projects;
  const loggedNoun = logged === 1 ? "climb" : "climbs";
  const sendNoun = outcomes.sends === 1 ? "send" : "sends";

  const rows = [
    {
      key: "sent",
      label: "Sent",
      count: outcomes.sends,
      total: logged,
      note: logged > 0 ? `of your ${logged} logged ${loggedNoun}` : "no climbs logged yet",
      tone: "sent",
    },
    {
      key: "flashed",
      label: "Flashed",
      count: outcomes.flashes,
      total: outcomes.sends,
      note: outcomes.sends > 0 ? `of your ${outcomes.sends} ${sendNoun}` : "no sends yet",
      tone: "flashed",
    },
    {
      key: "project",
      label: "Projecting",
      count: outcomes.projects,
      total: logged,
      note: logged > 0 ? `of your ${logged} logged ${loggedNoun}` : "no climbs logged yet",
      tone: "project",
    },
  ];

  return (
    <>
      <p className="dashboard-note">
        A flash is a send you climbed on the first try, so flashes sit inside your sends rather than
        beside them.
      </p>
      <div className="outcome-list">
        {rows.map((row) => {
          const percent = shareOf(row.count, row.total);
          return (
            <div className="outcome-row" key={row.key}>
              <div className="outcome-head">
                <span className="outcome-label">{row.label}</span>
                <span className="outcome-count">{row.count}</span>
              </div>
              <div className="outcome-track" aria-hidden="true">
                <span
                  className={`outcome-fill outcome-${row.tone}`}
                  style={{
                    width: `${percent}%`,
                    minWidth: row.count > 0 ? "2px" : 0,
                  }}
                />
              </div>
              <small>
                {percent}% {row.note}
              </small>
            </div>
          );
        })}
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* The record by grade                                                         */
/* -------------------------------------------------------------------------- */

function GradeStatistics({ byGrade }: { byGrade: DashboardGradeStat[] }) {
  if (byGrade.length === 0) {
    return <p className="muted-note">No grades recorded yet.</p>;
  }

  const busiest = Math.max(...byGrade.map((item) => item.sends), 1);

  return (
    <>
      <p className="dashboard-note">The bar shows your sends at each grade.</p>
      <div className="grade-stats">
        {byGrade.map((item) => {
          const parts = [`${item.sends} ${item.sends === 1 ? "send" : "sends"}`];
          if (item.flashes > 0) parts.push(`${item.flashes} flashed`);
          if (item.projects > 0) {
            parts.push(`${item.projects} ${item.projects === 1 ? "project" : "projects"}`);
          }
          return (
            <div className="grade-row" key={item.grade}>
              <strong>{item.grade}</strong>
              <div className="grade-track" aria-hidden="true">
                <span
                  className="grade-fill"
                  style={{
                    width: `${(item.sends / busiest) * 100}%`,
                    minWidth: item.sends > 0 ? "2px" : 0,
                  }}
                />
              </div>
              <small>{parts.join(" · ")}</small>
            </div>
          );
        })}
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Where the member stands                                                     */
/* -------------------------------------------------------------------------- */

function RankingCard({ ranking }: { ranking: DashboardRanking }) {
  const ranked = ranking.rank !== null;

  return (
    <section className="dashboard-card">
      <div className="section-title">
        <h2>Where you stand</h2>
        <TextLink to="/leaderboard">Leaderboard</TextLink>
      </div>

      {ranked ? (
        <>
          <div className="rank-grid">
            <div>
              <span>Your rank</span>
              <strong>#{ranking.rank}</strong>
            </div>
            <div>
              <span>Ranked climbers</span>
              <strong>{ranking.rankedCount}</strong>
            </div>
            <div>
              <span>Ahead of you</span>
              <strong>{ranking.ahead}</strong>
            </div>
            <div>
              <span>Percentile</span>
              <strong>{ranking.percentile ?? "—"}</strong>
            </div>
          </div>
          {ranking.percentile !== null && (
            <p className="dashboard-note">{ranking.percentileRule}</p>
          )}
        </>
      ) : (
        <p className="dashboard-note">
          You are not on the leaderboard yet. Climbers are ranked once they have logged a send.
        </p>
      )}

      <p className="dashboard-note rule-note">{ranking.scoringRule}</p>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* The recent attempts                                                         */
/* -------------------------------------------------------------------------- */

function RecentAttempts({ attempts }: { attempts: DashboardAttempt[] }) {
  if (attempts.length === 0) {
    return <p className="muted-note">No climbs logged yet.</p>;
  }

  return (
    <ul className="attempt-list">
      {attempts.map((attempt) => (
        <li key={attempt.id}>
          <div className="attempt-main">
            {attempt.routeId !== null ? (
              <Link
                to="/routes/$routeId"
                params={{ routeId: String(attempt.routeId) }}
                className="attempt-route"
              >
                {attempt.route}
              </Link>
            ) : (
              <strong>{attempt.route}</strong>
            )}
            <small>
              {attempt.grade} · {formatClimbDate(attempt.date)} · {attempt.attempts}{" "}
              {attempt.attempts === 1 ? "attempt" : "attempts"}
            </small>
          </div>
          <div className="attempt-tags">
            {attempt.isFlash && <span className="fresh-tag">FIRST TRY</span>}
            <span className={attempt.result === "sent" ? "status-sent" : "status-project"}>
              {attempt.result === "sent" ? "Sent" : "Project"}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------------------------------------------------- */
/* The three states                                                            */
/* -------------------------------------------------------------------------- */

/** The member is signed in and has logged climbs. */
export function DashboardOverview({ dashboard }: { dashboard: MemberDashboard }) {
  return (
    <>
      <DashboardMetrics dashboard={dashboard} />

      <div className="dashboard-columns">
        <section className="dashboard-card">
          <div className="section-title">
            <h2>How your climbing went</h2>
          </div>
          <OutcomeDistribution outcomes={dashboard.outcomes} />
        </section>

        <section className="dashboard-card">
          <div className="section-title">
            <h2>Your recent attempts</h2>
            <TextLink to="/member/logbook">Logbook</TextLink>
          </div>
          <RecentAttempts attempts={dashboard.recentAttempts} />
        </section>
      </div>

      <section className="dashboard-card">
        <div className="section-title">
          <h2>Your record by grade</h2>
        </div>
        <GradeStatistics byGrade={dashboard.byGrade} />
      </section>

      <RankingCard ranking={dashboard.ranking} />
    </>
  );
}

/** The member is signed in but has not logged anything yet. */
export function DashboardWelcome({
  activeRoutes,
  onLogAttempt,
}: {
  activeRoutes: number;
  onLogAttempt: () => void;
}) {
  return (
    <div className="dashboard-empty">
      <Mountain size={26} />
      <h3>Your climbing space is ready for its first line.</h3>
      <p>
        {activeRoutes > 0
          ? `There are ${activeRoutes} routes on the wall right now. Log what you climb and this page fills up with your sends, your first tries and your projects.`
          : "Log what you climb and this page fills up with your sends, your first tries and your projects."}
      </p>
      <div className="dashboard-empty-actions">
        <Button onClick={onLogAttempt}>
          <Plus />
          Log an attempt
        </Button>
        <Button asChild variant="outline">
          <Link to="/routes">
            Browse the routes <ArrowUpRight />
          </Link>
        </Button>
      </div>
    </div>
  );
}

/** The member's records could not be loaded. */
export function DashboardUnavailable({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="dashboard-empty" role="alert">
      <CloudOff size={26} />
      <h3>Your climbing record could not be loaded.</h3>
      <p>
        {message} Nothing is lost — your climbs are still saved, and nothing here has been changed.
      </p>
      <div className="dashboard-empty-actions">
        <Button variant="outline" onClick={onRetry}>
          Try again
        </Button>
      </div>
    </div>
  );
}
