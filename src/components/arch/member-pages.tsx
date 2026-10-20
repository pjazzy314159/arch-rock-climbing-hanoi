import { useState, type FormEvent, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
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
  UserCog,
  Users,
  LogOut,
  Signature,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useHydrated } from "@/hooks/use-hydrated";
import { authApi, memberApi, ApiError, ApiUnavailableError } from "@/services/api";
import { initialsFor, useSession } from "@/services/session";
import type { ApiUser } from "@/services/types";
import { PageHeading, RouteCard, TextLink } from "./shared";
import { EmptyNotice, SampleDataBanner } from "./data-state";
import {
  adminQuery,
  myAgreementQuery,
  myDashboardQuery,
  myLogbookQuery,
  routeQuery,
  type LogEntry,
} from "@/services/arch";

const memberNav = [
  { to: "/member", label: "Overview", icon: LayoutDashboard },
  { to: "/member/logbook", label: "My logbook", icon: BookOpen },
  { to: "/member/beta", label: "Route beta", icon: Mountain },
  { to: "/member/progress", label: "My progress", icon: TrendingUp },
  { to: "/member/profile", label: "My profile", icon: UserCog },
] as const;

const ROLE_LABELS: Record<string, string> = {
  customer: "Member",
  staff: "Staff",
  admin: "Administrator",
};

/* -------------------------------------------------------------------------- */
/* Shared pieces                                                              */
/* -------------------------------------------------------------------------- */

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

/** Shown to a visitor who is not signed in. */
export function SignInPrompt({ what }: { what: string }) {
  return (
    <div className="auth-card">
      <div className="empty-state">
        <Shield size={26} />
        <h3>Sign in to see {what}</h3>
        <p>
          Your records are private. Sign in with your ARCH account, or create one, and they will
          appear here.
        </p>
        <Button asChild size="lg">
          <Link to="/signin">
            Sign in or create an account <ArrowUpRight />
          </Link>
        </Button>
      </div>
    </div>
  );
}

/** Placeholder while a member's own records are loading. */
function MemberLoading() {
  return (
    <div className="loading-block" aria-busy="true">
      <p>Loading your records…</p>
    </div>
  );
}

function MemberError({ message }: { message: string }) {
  return (
    <p className="data-banner" role="alert">
      <span>{message}</span>
    </p>
  );
}

/* -------------------------------------------------------------------------- */
/* Shell                                                                      */
/* -------------------------------------------------------------------------- */

export function MemberShell({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  const { status, user, signOut } = useSession();
  const signedIn = status === "authenticated" && user !== null;

  return (
    <div className="workspace">
      <aside className="workspace-sidebar">
        <span className="eyebrow">{admin ? "ARCH OPERATIONS" : "YOUR CLIMBING SPACE"}</span>
        <div className="profile">
          <span className="avatar">
            {admin ? <Shield size={22} /> : signedIn ? initialsFor(user.full_name) : "?"}
          </span>
          <div>
            <strong>{admin ? "Admin preview" : signedIn ? user.full_name : "Not signed in"}</strong>
            <small>
              {admin
                ? "Operations workspace"
                : signedIn
                  ? `${ROLE_LABELS[user.role] ?? user.role} · ${
                      user.membership_tier ?? "No membership recorded"
                    }`
                  : "Your records are private"}
            </small>
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
          {signedIn && !admin ? (
            <>
              <span className="sample-badge">SIGNED IN</span>
              <p>
                Signed in as {user.email}. Your records are shown from the ARCH database and are
                visible only to you.
              </p>
              {(user.role === "staff" || user.role === "admin") && (
                <Link to="/staff">
                  Staff tools <ArrowUpRight size={14} />
                </Link>
              )}
              <Button variant="outline" size="sm" onClick={signOut}>
                <LogOut size={14} /> Sign out
              </Button>
            </>
          ) : (
            <>
              <span className="sample-badge">SAMPLE PREVIEW</span>
              <p>
                {admin
                  ? "The operations workspace is a preview. Protected administration arrives with the staff tools."
                  : "Sign in to replace the sample records with your own."}
              </p>
              <Link to={admin ? "/member" : "/signin"}>
                {admin ? "Member area" : "Sign in"} <ArrowUpRight size={14} />
              </Link>
            </>
          )}
        </div>
      </aside>
      <main className="workspace-content">{children}</main>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Overview                                                                   */
/* -------------------------------------------------------------------------- */

export function MemberPage() {
  const { status } = useSession();
  const { data: routes } = useSuspenseQuery(routeQuery);
  const signedIn = status === "authenticated";
  const dashboard = useQuery({ ...myDashboardQuery, enabled: signedIn });

  return (
    <MemberShell>
      <PageHeading
        eyebrow="BACK ON THE WALL"
        title={signedIn ? "Your climbing space." : "Sign in to your climbing space."}
        description="Every session is a step forward. Make this one count."
      />
      {!signedIn ? (
        <SignInPrompt what="your statistics" />
      ) : (
        <>
          {dashboard.isPending ? (
            <MemberLoading />
          ) : dashboard.data?.error ? (
            <MemberError message={dashboard.data.error} />
          ) : (
            <div className="metric-grid">
              <Metric
                label="Total sends"
                value={dashboard.data?.data?.totalSends ?? 0}
                detail="Logged sends"
              />
              <Metric
                label="Sessions"
                value={dashboard.data?.data?.totalSessions ?? 0}
                detail="Days you have climbed"
              />
              <Metric
                label="Highest grade"
                value={dashboard.data?.data?.bestGrade ?? "—"}
                detail="Your personal best"
              />
              <Metric
                label="Active projects"
                value={dashboard.data?.data?.activeProjects ?? 0}
                detail="Still open"
              />
            </div>
          )}
          <AgreementPanel />
        </>
      )}
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

/* -------------------------------------------------------------------------- */
/* Safety agreement                                                           */
/* -------------------------------------------------------------------------- */

export function AgreementPanel() {
  const { status } = useSession();
  const queryClient = useQueryClient();
  const signedIn = status === "authenticated";
  const agreement = useQuery({ ...myAgreementQuery, enabled: signedIn });
  const [name, setName] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hydrated = useHydrated();

  if (!signedIn) return null;

  async function sign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      await memberApi.signAgreement({ signed_name: name.trim(), accepted });
      await queryClient.invalidateQueries({ queryKey: ["member"] });
      setMessage("Your safety agreement has been recorded.");
    } catch (caught) {
      setError(
        caught instanceof ApiError || caught instanceof ApiUnavailableError
          ? caught.message
          : "Your agreement could not be saved.",
      );
    } finally {
      setPending(false);
    }
  }

  const record = agreement.data?.data;

  return (
    <section className="agreement-panel">
      <div className="content-block-head">
        <Signature size={22} />
        <div>
          <h2>Your safety agreement</h2>
          <p>
            Every member signs the safety agreement before climbing. The exact process is still
            being finalised by ARCH.
          </p>
        </div>
      </div>

      {agreement.isPending ? (
        <MemberLoading />
      ) : agreement.data?.error ? (
        <MemberError message={agreement.data.error} />
      ) : record?.status === "signed" ? (
        <p className="agreement-status agreement-signed">
          <Check size={16} /> Signed on {record.signedAt?.slice(0, 10)}
          {record.signedName ? ` by ${record.signedName}` : ""}.
        </p>
      ) : (
        <form className="agreement-form" onSubmit={sign}>
          <p className="agreement-status agreement-pending">
            Status: {record?.status ?? "pending"}. Read the rules on the{" "}
            <Link to="/visit">visit page</Link> before you sign.
          </p>
          <label>
            Type your full name to sign
            <input
              required
              name="signed_name"
              value={name}
              minLength={2}
              autoComplete="name"
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className="check-filter">
            <Checkbox
              checked={accepted}
              onCheckedChange={(checked) => setAccepted(checked === true)}
              aria-label="I have read and accept the safety agreement"
            />
            I have read and accept the safety agreement
          </label>
          <Button type="submit" disabled={!hydrated || pending || !accepted}>
            {pending ? "Saving…" : "Sign the agreement"}
            <ArrowUpRight />
          </Button>
        </form>
      )}

      {/* The confirmation is rendered outside the form, because signing swaps
          the form for the signed state and would otherwise remove it. */}
      {message && (
        <p className="feedback" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="feedback error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Logbook                                                                    */
/* -------------------------------------------------------------------------- */

export function LogbookPage() {
  const { status } = useSession();
  const { data: routes } = useSuspenseQuery(routeQuery);
  const signedIn = status === "authenticated";
  const logbook = useQuery({ ...myLogbookQuery, enabled: signedIn });
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("All climbs");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hydrated = useHydrated();

  const entries: LogEntry[] = logbook.data?.data ?? [];

  async function submitClimb(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const route = routes.data.find((r) => r.id === data.get("route"));
    if (!route) return;
    setPending(true);
    setError(null);
    try {
      await memberApi.logClimb({
        route_id: route.apiId || null,
        route_name: route.name,
        grade: route.grade,
        result: data.get("result") === "Sent" ? "sent" : "project",
        attempts: Number(data.get("attempts")),
        climbed_on: String(data.get("date")),
        notes: String(data.get("notes") ?? ""),
      });
      await queryClient.invalidateQueries({ queryKey: ["member"] });
      setOpen(false);
    } catch (caught) {
      setError(
        caught instanceof ApiError || caught instanceof ApiUnavailableError
          ? caught.message
          : "That climb could not be saved.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <MemberShell>
      <PageHeading
        eyebrow="MY LOGBOOK"
        title="Every attempt counts."
        description="The sends, the projects, and the lessons along the way."
      >
        {signedIn && (
          <Button onClick={() => setOpen(true)}>
            <Plus />
            Log a climb
          </Button>
        )}
      </PageHeading>

      {!signedIn ? (
        <SignInPrompt what="your logbook" />
      ) : (
        <>
          {logbook.isPending ? (
            <MemberLoading />
          ) : logbook.data?.error ? (
            <MemberError message={logbook.data.error} />
          ) : entries.length === 0 ? (
            <EmptyNotice
              title="No climbs logged yet."
              description="Log your first climb and it will show up here — the sends, the projects and the notes you want to keep."
            />
          ) : (
            <>
              <div className="category-tabs">
                {["All climbs", "Sent", "Project"].map((f) => (
                  <Button
                    variant={filter === f ? "default" : "ghost"}
                    key={f}
                    onClick={() => setFilter(f)}
                  >
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
                            {e.notes && <small>{e.notes}</small>}
                          </td>
                          <td>{e.grade}</td>
                          <td>{e.date}</td>
                          <td>
                            <span
                              className={e.result === "Sent" ? "status-sent" : "status-project"}
                            >
                              {e.result}
                            </span>
                          </td>
                          <td>{e.attempts}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

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
            <form onSubmit={submitClimb}>
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
                  <input
                    required
                    type="date"
                    name="date"
                    defaultValue={new Date().toISOString().slice(0, 10)}
                  />
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
              {error && (
                <p className="feedback error" role="alert">
                  {error}
                </p>
              )}
              <Button type="submit" disabled={!hydrated || pending}>
                <Check />
                {pending ? "Saving…" : "Save entry"}
              </Button>
            </form>
          </section>
        </div>
      )}
    </MemberShell>
  );
}

/* -------------------------------------------------------------------------- */
/* Profile                                                                    */
/* -------------------------------------------------------------------------- */

function describeError(caught: unknown, fallback: string): string {
  if (caught instanceof ApiUnavailableError) {
    return "The ARCH service is not reachable right now. Please try again in a moment.";
  }
  if (caught instanceof ApiError) {
    if (caught.status === 400) return caught.message;
    if (caught.status === 401) return "Your session has expired. Please sign in again.";
    if (caught.status === 422) return "Please check the details you entered and try again.";
    return caught.message;
  }
  return fallback;
}

export function ProfilePage() {
  const { status, user, refresh } = useSession();
  const signedIn = status === "authenticated" && user !== null;
  const hydrated = useHydrated();

  const [name, setName] = useState(user?.full_name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [level, setLevel] = useState(String(user?.climbing_level ?? 0));
  const [profilePending, setProfilePending] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordPending, setPasswordPending] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfilePending(true);
    setProfileError(null);
    setProfileMessage(null);
    try {
      await authApi.updateMe({
        full_name: name.trim(),
        phone: phone.trim() || null,
        climbing_level: Number(level),
      });
      await refresh();
      setProfileMessage("Your details have been saved.");
    } catch (caught) {
      setProfileError(describeError(caught, "Your details could not be saved."));
    } finally {
      setProfilePending(false);
    }
  }

  async function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordPending(true);
    setPasswordError(null);
    setPasswordMessage(null);
    try {
      await authApi.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setPasswordMessage("Your password has been changed.");
    } catch (caught) {
      setPasswordError(describeError(caught, "Your password could not be changed."));
    } finally {
      setPasswordPending(false);
    }
  }

  return (
    <MemberShell>
      <PageHeading
        eyebrow="MY PROFILE"
        title="Your details."
        description="Only what the gym needs to run your membership. Nothing here is shown publicly."
      />
      {!signedIn ? (
        <SignInPrompt what="your details" />
      ) : (
        <>
          <section className="profile-summary">
            <div>
              <span>Email</span>
              <strong>{user.email}</strong>
            </div>
            <div>
              <span>Role</span>
              <strong>{ROLE_LABELS[user.role] ?? user.role}</strong>
            </div>
            <div>
              <span>Member since</span>
              <strong>{user.joined_on ?? "—"}</strong>
            </div>
            <div>
              <span>Membership</span>
              <strong>{user.membership_tier ?? "Not recorded"}</strong>
            </div>
          </section>

          <section className="content-block">
            <div className="content-block-head">
              <Users size={22} />
              <div>
                <h2>Your details</h2>
                <p>Your name, a contact number if you want one, and your climbing level.</p>
              </div>
            </div>
            <form className="profile-form" onSubmit={saveProfile}>
              <div className="form-row">
                <label>
                  Full name
                  <input
                    required
                    name="full_name"
                    value={name}
                    minLength={2}
                    autoComplete="name"
                    onChange={(event) => setName(event.target.value)}
                  />
                </label>
                <label>
                  Phone <span className="label-hint">optional</span>
                  <input
                    name="phone"
                    type="tel"
                    value={phone}
                    autoComplete="tel"
                    onChange={(event) => setPhone(event.target.value)}
                  />
                </label>
              </div>
              <label>
                Climbing level
                <select
                  name="climbing_level"
                  value={level}
                  onChange={(event) => setLevel(event.target.value)}
                >
                  {["0", "1", "2", "3", "4", "5", "6", "7", "8"].map((value) => (
                    <option key={value} value={value}>
                      V{value}
                    </option>
                  ))}
                </select>
              </label>
              <p className="auth-note">
                Your level is used as context when you vote on route difficulty. Height and weight
                are not collected.
              </p>
              {profileMessage && (
                <p className="feedback" role="status">
                  {profileMessage}
                </p>
              )}
              {profileError && (
                <p className="feedback error" role="alert">
                  {profileError}
                </p>
              )}
              <Button type="submit" disabled={!hydrated || profilePending}>
                {profilePending ? "Saving…" : "Save details"}
              </Button>
            </form>
          </section>

          <section className="content-block">
            <div className="content-block-head">
              <Shield size={22} />
              <div>
                <h2>Password</h2>
                <p>Change the password you sign in with.</p>
              </div>
            </div>
            <form className="profile-form" onSubmit={savePassword}>
              <label>
                Current password
                <input
                  required
                  name="current_password"
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                />
              </label>
              <label>
                New password
                <input
                  required
                  name="new_password"
                  type="password"
                  autoComplete="new-password"
                  minLength={10}
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                />
              </label>
              {passwordMessage && (
                <p className="feedback" role="status">
                  {passwordMessage}
                </p>
              )}
              {passwordError && (
                <p className="feedback error" role="alert">
                  {passwordError}
                </p>
              )}
              <Button type="submit" disabled={!hydrated || passwordPending}>
                {passwordPending ? "Changing…" : "Change password"}
              </Button>
            </form>
          </section>
        </>
      )}
    </MemberShell>
  );
}

/* -------------------------------------------------------------------------- */
/* Still sample data (route beta and progress arrive with the voting work)    */
/* -------------------------------------------------------------------------- */

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
      <SampleDataBanner resource={routes} />
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
  const { status } = useSession();
  const signedIn = status === "authenticated";
  const logbook = useQuery({ ...myLogbookQuery, enabled: signedIn });

  const entries = logbook.data?.data ?? [];
  const sends = entries.filter((entry) => entry.result === "Sent");
  const projects = entries.filter((entry) => entry.result === "Project");
  const sessions = new Set(entries.map((entry) => entry.date)).size;

  const byGrade = new Map<string, number>();
  for (const entry of sends) {
    byGrade.set(entry.grade, (byGrade.get(entry.grade) ?? 0) + 1);
  }
  const bars = Array.from(byGrade.entries()).sort(([a], [b]) => a.localeCompare(b));

  let bestGrade: string | null = null;
  for (const entry of sends) {
    if (!bestGrade || entry.grade.localeCompare(bestGrade) > 0) bestGrade = entry.grade;
  }

  return (
    <MemberShell>
      <PageHeading
        eyebrow="MY PROGRESS"
        title="Look how far you’ve come."
        description="Progress isn’t always a number. But sometimes it’s nice to see one."
      />
      {!signedIn ? (
        <SignInPrompt what="your progress" />
      ) : logbook.isPending ? (
        <MemberLoading />
      ) : logbook.data?.error ? (
        <MemberError message={logbook.data.error} />
      ) : entries.length === 0 ? (
        <EmptyNotice
          title="Nothing logged yet."
          description="Log your first climb and your progress will start building here."
        />
      ) : (
        <>
          <div className="metric-grid">
            <Metric
              label="Total sends"
              value={sends.length}
              detail={`Across ${sessions} sessions`}
            />
            <Metric label="Highest grade" value={bestGrade ?? "—"} detail="Your personal best" />
            <Metric label="Projects" value={projects.length} detail="Still open" />
            <Metric label="Sessions" value={sessions} detail="Days you have climbed" />
          </div>
          <section className="progress-chart">
            <div className="section-title">
              <h2>Sends by grade</h2>
              <span className="sample-badge">YOUR LOGBOOK</span>
            </div>
            {bars.length === 0 ? (
              <p className="muted-note">No sends logged yet.</p>
            ) : (
              <div className="chart-bars">
                {bars.map(([grade, count]) => (
                  <div className="chart-column" key={grade}>
                    <span>{count}</span>
                    <div className="chart-bar" style={{ height: `${count * 15}px` }} />
                    <strong>{grade}</strong>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </MemberShell>
  );
}

/* -------------------------------------------------------------------------- */
/* Admin (staff tools arrive with the operations task)                        */
/* -------------------------------------------------------------------------- */

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
        This is still a preview. The staff tools, with real role checks on the server, arrive with
        the operations work.
      </p>
    </MemberShell>
  );
}

export type { ApiUser };
