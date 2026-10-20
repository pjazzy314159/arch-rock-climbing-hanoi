import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  LayoutDashboard,
  BookOpen,
  Mountain,
  TrendingUp,
  ArrowUpRight,
  Plus,
  X,
  Check,
  Shield,
  Users,
  Activity,
  Package,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useHydrated } from "@/hooks/use-hydrated";
import { PageHeading, RouteCard, TextLink } from "./shared";
import { SampleDataBanner } from "./data-state";
import { memberQuery, routeQuery, logbookQuery, adminQuery, type LogEntry } from "@/services/arch";
const memberNav = [
  { to: "/member", label: "Overview", icon: LayoutDashboard },
  { to: "/member/logbook", label: "My logbook", icon: BookOpen },
  { to: "/member/beta", label: "Route beta", icon: Mountain },
  { to: "/member/progress", label: "My progress", icon: TrendingUp },
] as const;
export function MemberShell({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  return (
    <div className="workspace">
      <aside className="workspace-sidebar">
        <span className="eyebrow">{admin ? "ARCH OPERATIONS" : "YOUR CLIMBING SPACE"}</span>
        <div className="profile">
          <span className="avatar">{admin ? <Shield size={22} /> : "AN"}</span>
          <div>
            <strong>{admin ? "Admin preview" : "Alex Nguyen"}</strong>
            <small>{admin ? "Operations workspace" : "Monthly pass · Sample profile"}</small>
          </div>
        </div>
        <nav aria-label="Workspace navigation">
          {admin ? (
            <Link to="/admin" className="workspace-active">
              <LayoutDashboard size={18} />
              Overview
            </Link>
          ) : (
            memberNav.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                activeProps={{ className: "workspace-active" }}
                activeOptions={{ exact: true }}
              >
                <n.icon size={18} />
                {n.label}
              </Link>
            ))
          )}
        </nav>
        <div className="preview-note">
          <span className="sample-badge">MOCK PREVIEW</span>
          <p>
            No sign-in or access protection.
            <br />
            All records are sample data.
          </p>{" "}
          {admin ? (
            <Link to="/member">
              Member preview <ArrowUpRight size={14} />
            </Link>
          ) : (
            <Link to="/admin">
              Admin preview <ArrowUpRight size={14} />
            </Link>
          )}
        </div>
      </aside>
      <main className="workspace-content">{children}</main>
    </div>
  );
}
export function MemberPage() {
  const { data: member } = useSuspenseQuery(memberQuery);
  const summary = member.data;
  const { data: routes } = useSuspenseQuery(routeQuery);
  return (
    <MemberShell>
      <PageHeading
        eyebrow="BACK ON THE WALL"
        title={`Hey, ${summary.displayName.split(" ")[0]}.`}
        description="Every session is a step forward. Make this one count."
      />
      <SampleDataBanner resource={member} />
      <div className="metric-grid">
        <Metric label="Total sends" value={summary.totalSends} detail="+8 this month" />
        <Metric label="Sessions" value={summary.sessions} detail="3 this week" />
        <Metric label="Highest grade" value={summary.bestGrade} detail="Your personal best" />
        <Metric label="Active projects" value={summary.activeProjects} detail="Keep showing up" />
      </div>
      <div className="section-title">
        <h2>Your next session</h2>
        <TextLink to="/member/logbook">Open logbook</TextLink>
      </div>
      <div className="session-band">
        <Mountain />
        <div>
          <h3>Small moves. Big progress.</h3>
          <p>Pick a warm-up, revisit a project, and find something new.</p>
        </div>
        <Button asChild>
          <Link to="/member/beta">
            Explore beta <ArrowUpRight />
          </Link>
        </Button>
      </div>
      <div className="section-title">
        <h2>Projects to come back to</h2>
        <TextLink to="/routes">All routes</TextLink>
      </div>
      <div className="route-grid member-route-grid">
        {routes.data.slice(0, 2).map((r) => (
          <RouteCard route={r} key={r.id} />
        ))}
      </div>
    </MemberShell>
  );
}
function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}
export function LogbookPage() {
  const { data: initial } = useSuspenseQuery(logbookQuery);
  const { data: routes } = useSuspenseQuery(routeQuery);
  const [entries, setEntries] = useState<LogEntry[]>(initial.data);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("All climbs");
  const hydrated = useHydrated();
  return (
    <MemberShell>
      <PageHeading
        eyebrow="MY LOGBOOK"
        title="Every attempt counts."
        description="The sends, the projects, and the lessons along the way."
      >
        <Button onClick={() => setOpen(true)}>
          <Plus />
          Log a climb
        </Button>
      </PageHeading>
      <div className="category-tabs">
        {["All climbs", "Sent", "Project"].map((f) => (
          <Button variant={filter === f ? "default" : "ghost"} key={f} onClick={() => setFilter(f)}>
            {f}
          </Button>
        ))}
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Route</th>
              <th>Grade</th>
              <th>Date</th>
              <th>Result</th>
              <th>Attempts</th>
            </tr>
          </thead>
          <tbody>
            {entries
              .filter((e) => filter === "All climbs" || e.result === filter)
              .map((e) => (
                <tr key={e.id}>
                  <td>
                    <strong>{e.route}</strong>
                    <small>{e.notes}</small>
                  </td>
                  <td>{e.grade}</td>
                  <td>{e.date}</td>
                  <td>
                    <span className={e.result === "Sent" ? "status-sent" : "status-project"}>
                      {e.result}
                    </span>
                  </td>
                  <td>{e.attempts}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <p className="muted-note">Sample records. New entries last only for this page session.</p>
      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="log-title"
            className="log-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-heading">
              <h2 id="log-title">Log a climb</h2>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Close log form"
                onClick={() => setOpen(false)}
              >
                <X />
              </Button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const route = routes.data.find((r) => r.id === f.get("route"));
                if (!route) return;
                setEntries([
                  {
                    id: crypto.randomUUID(),
                    route: route.name,
                    grade: route.grade,
                    date: String(f.get("date")),
                    result: f.get("result") === "Sent" ? "Sent" : "Project",
                    attempts: Number(f.get("attempts")),
                    notes: String(f.get("notes")),
                  },
                  ...entries,
                ]);
                setOpen(false);
              }}
            >
              <label>
                Route
                <select name="route" autoFocus>
                  {routes.data.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} · {r.grade}
                    </option>
                  ))}
                </select>
              </label>
              <div className="form-row">
                <label>
                  Date
                  <input required type="date" name="date" defaultValue="2026-10-15" />
                </label>
                <label>
                  Attempts
                  <input
                    type="number"
                    name="attempts"
                    min={1}
                    max={999}
                    defaultValue={1}
                    required
                  />
                </label>
              </div>
              <label>
                Result
                <select name="result">
                  <option>Sent</option>
                  <option>Project</option>
                </select>
              </label>
              <label>
                Notes
                <textarea name="notes" rows={3} placeholder="What did you learn?" />
              </label>
              <Button type="submit" disabled={!hydrated}>
                <Check />
                Save preview entry
              </Button>
            </form>
          </section>
        </div>
      )}
    </MemberShell>
  );
}
export function BetaPage({ selectedId }: { selectedId?: string | undefined }) {
  const { data: routes } = useSuspenseQuery(routeQuery);
  const [id, setId] = useState(selectedId || routes.data[0]?.id || "");
  const route = routes.data.find((r) => r.id === id);
  const [show, setShow] = useState(false);
  return (
    <MemberShell>
      <PageHeading
        eyebrow="ROUTE BETA EXPLORER"
        title="A different way to see the move."
        description="Find an idea, try it your way, and make the route your own."
      />
      <label className="beta-select">
        Choose a route
        <select
          value={id}
          onChange={(e) => {
            setId(e.target.value);
            setShow(false);
          }}
        >
          {routes.data.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} · {r.grade}
            </option>
          ))}
        </select>
      </label>
      {route && (
        <div className="beta-layout">
          <RouteCard route={route} />
          <div>
            <span className="eyebrow">
              {route.zone} · {route.grade}
            </span>
            <h2>{route.name}</h2>
            <p>{route.style}</p>
            <div className="beta-details">
              <p>
                Setter <strong>{route.setter}</strong>
              </p>
              <p>
                Community sends <strong>{route.sends}</strong>
              </p>
            </div>
            <Button variant="outline" onClick={() => setShow(!show)}>
              {show ? "Hide beta" : "Reveal sample beta"}
              <ArrowUpRight />
            </Button>
            {show && (
              <div className="beta-tips">
                <h3>A starting point</h3>
                <ol>
                  <li>Establish on the marked start holds with quiet feet.</li>
                  <li>Shift your hips over the supporting foot before reaching.</li>
                  <li>Pause to find balance, then commit to the final move.</li>
                </ol>
                <small>Illustrative beta only, not route-specific safety advice.</small>
              </div>
            )}
          </div>
        </div>
      )}
    </MemberShell>
  );
}
export function ProgressPage() {
  return (
    <MemberShell>
      <PageHeading
        eyebrow="MY PROGRESS"
        title="Look how far you’ve come."
        description="Progress isn’t always a number. But sometimes it’s nice to see one."
      />
      <div className="metric-grid">
        <Metric label="Total sends" value="42" detail="Across 18 sessions" />
        <Metric label="Highest grade" value="V5" detail="Up from V3 in August" />
        <Metric label="This month" value="8" detail="Successful sends" />
        <Metric label="Consistency" value="3 weeks" detail="Keep the rhythm" />
      </div>
      <section className="progress-chart">
        <div className="section-title">
          <h2>Sends by grade</h2>
          <span className="sample-badge">SAMPLE HISTORY</span>
        </div>
        <div className="chart-bars">
          {[
            { g: "V0", n: 9 },
            { g: "V1", n: 12 },
            { g: "V2", n: 10 },
            { g: "V3", n: 6 },
            { g: "V4", n: 4 },
            { g: "V5", n: 1 },
          ].map((d) => (
            <div className="chart-column" key={d.g}>
              <span>{d.n}</span>
              <div className="chart-bar" style={{ height: `${d.n * 15}px` }} />
              <strong>{d.g}</strong>
            </div>
          ))}
        </div>
      </section>
      <div className="milestones">
        <h2>Little milestones. Big feelings.</h2>
        <div>
          <span className="milestone-icon">
            <Check />
          </span>
          <div>
            <strong>First V5 send</strong>
            <p>October 8, 2026 · A new personal best.</p>
          </div>
        </div>
        <div>
          <span className="milestone-icon">
            <Mountain />
          </span>
          <div>
            <strong>10 sessions on the wall</strong>
            <p>September 12, 2026 · Building the habit.</p>
          </div>
        </div>
      </div>
    </MemberShell>
  );
}
export function AdminPage() {
  const { data: summary } = useSuspenseQuery(adminQuery);
  const { data: routes } = useSuspenseQuery(routeQuery);
  const [tab, setTab] = useState("Routes");
  const [q, setQ] = useState("");
  return (
    <MemberShell admin>
      <PageHeading
        eyebrow="ADMIN DASHBOARD"
        title="The gym, at a glance."
        description="A read-only operations preview. No production records or administrative actions."
      />
      <SampleDataBanner resource={summary} />
      <div className="metric-grid">
        <Metric label="Sample members" value={summary.data.members} detail="Illustrative total" />
        <Metric label="Check-ins today" value={summary.data.checkIns} detail="Sample activity" />
        <Metric label="Active routes" value={summary.data.activeRoutes} detail="Across all walls" />
        <Metric label="Shop products" value={summary.data.products} detail="Sample inventory" />
      </div>
      <div className="admin-toolbar">
        <div className="category-tabs">
          {["Routes", "Members", "Inventory"].map((t) => (
            <Button
              key={t}
              variant={t === tab ? "default" : "ghost"}
              onClick={() => {
                setTab(t);
                setQ("");
              }}
            >
              {t}
            </Button>
          ))}
        </div>
        <label className="search-field">
          <Search size={17} />
          <input
            aria-label="Search admin records"
            placeholder={`Search ${tab.toLowerCase()}…`}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {(tab === "Routes"
                ? ["Route", "Grade", "Setter", "Wall", "Status"]
                : tab === "Members"
                  ? ["Member", "Pass", "Activity", "Status"]
                  : ["Product", "SKU", "Stock", "Status"]
              ).map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tab === "Routes"
              ? routes.data
                  .filter((r) => r.name.toLowerCase().includes(q.toLowerCase()))
                  .map((r) => (
                    <tr key={r.id}>
                      <td>
                        <strong>{r.name}</strong>
                      </td>
                      <td>{r.grade}</td>
                      <td>{r.setter}</td>
                      <td>{r.zone}</td>
                      <td>
                        <span className="status-sent">Active</span>
                      </td>
                    </tr>
                  ))
              : (tab === "Members"
                  ? [
                      ["Alex Nguyen", "Monthly", "Oct 14, 2026", "Active"],
                      ["Minh Tran", "Monthly", "Oct 15, 2026", "Active"],
                      ["Linh Pham", "Day pass", "Oct 12, 2026", "Active"],
                    ]
                  : [
                      ["Edge Performance", "ARC-EDG-01", "8 pairs", "In stock"],
                      ["Flow All-round", "ARC-FLW-01", "12 pairs", "In stock"],
                      ["Start Essential", "ARC-STA-01", "4 pairs", "Low stock"],
                    ]
                )
                  .filter((row) => row[0]?.toLowerCase().includes(q.toLowerCase()))
                  .map((row) => (
                    <tr key={row[0]}>
                      {row.map((v, i) => (
                        <td key={i}>{i === 0 ? <strong>{v}</strong> : v}</td>
                      ))}
                    </tr>
                  ))}
          </tbody>
        </table>
      </div>
      <p className="muted-note">
        No role verification or protected data is implemented. Secure administration belongs in the
        future backend.
      </p>
    </MemberShell>
  );
}
