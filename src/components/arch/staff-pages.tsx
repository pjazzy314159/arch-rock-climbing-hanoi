import { useState, type FormEvent, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarDays,
  Check,
  ClipboardList,
  Plus,
  Search,
  Shield,
  Users,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useHydrated } from "@/hooks/use-hydrated";
import { adminApi, staffApi, ApiError, ApiUnavailableError } from "@/services/api";
import { useSession } from "@/services/session";
import type { ApiAdminMember, ApiRouteSummary, ApiTask } from "@/services/types";
import { EmptyNotice } from "./data-state";
import { PageHeading, TextLink } from "./shared";

/* -------------------------------------------------------------------------- */
/* Shared pieces                                                              */
/* -------------------------------------------------------------------------- */

const TASK_STATUSES = [
  { value: "todo", label: "To do" },
  { value: "in_progress", label: "In progress" },
  { value: "done", label: "Done" },
] as const;

function errorMessage(caught: unknown, fallback: string): string {
  if (caught instanceof ApiUnavailableError) {
    return "The ARCH service is not reachable right now. Please try again in a moment.";
  }
  if (caught instanceof ApiError) {
    if (caught.status === 401) return "Your session has expired. Please sign in again.";
    if (caught.status === 403) return "You do not have permission to do that.";
    return caught.message;
  }
  return fallback;
}

/** Shown when the signed-in account may not open the page. */
export function PermissionDenied({ need }: { need: string }) {
  return (
    <div className="auth-card">
      <div className="empty-state">
        <Shield size={26} />
        <h3>You need {need} to see this</h3>
        <p>
          The ARCH backend checks the role of your account on every request, so this page cannot be
          reached without it.
        </p>
        <Button asChild size="lg">
          <Link to="/member">
            Back to my member area <ArrowUpRight />
          </Link>
        </Button>
      </div>
    </div>
  );
}

function StaffShell({ children }: { children: ReactNode }) {
  const { user } = useSession();
  return (
    <div className="workspace">
      <aside className="workspace-sidebar">
        <span className="eyebrow">STAFF TOOLS</span>
        <div className="profile">
          <span className="avatar">
            <ClipboardList size={20} />
          </span>
          <div>
            <strong>{user?.full_name ?? "Staff"}</strong>
            <small>{user?.role === "admin" ? "Administrator" : "Floor staff"}</small>
          </div>
        </div>
        <nav aria-label="Staff navigation">
          <Link to="/staff" className="workspace-active">
            <ClipboardList size={18} />
            My tasks
          </Link>
          {user?.role === "admin" && (
            <Link to="/admin">
              <Shield size={18} />
              Operations
            </Link>
          )}
          <Link to="/routes">
            <Search size={18} />
            Routes
          </Link>
        </nav>
        <div className="preview-note">
          <span className="sample-badge">STAFF</span>
          <p>The ARCH backend checks your role and your assignments on every request.</p>
          <Link to="/member">
            Member area <ArrowUpRight size={14} />
          </Link>
        </div>
      </aside>
      <main className="workspace-content">{children}</main>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Staff tasks                                                                */
/* -------------------------------------------------------------------------- */

function TaskCard({ task }: { task: ApiTask }) {
  const queryClient = useQueryClient();
  const hydrated = useHydrated();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newItem, setNewItem] = useState("");

  async function setStatus(status: string) {
    setPending(true);
    setError(null);
    try {
      await staffApi.updateTaskStatus(task.id, status);
      await queryClient.invalidateQueries({ queryKey: ["staff", "tasks"] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "tasks"] });
    } catch (caught) {
      setError(errorMessage(caught, "The task could not be updated."));
    } finally {
      setPending(false);
    }
  }

  async function toggleItem(itemId: number, isDone: boolean) {
    setPending(true);
    setError(null);
    try {
      await staffApi.updateChecklistItem(itemId, { is_done: isDone });
      await queryClient.invalidateQueries({ queryKey: ["staff", "tasks"] });
    } catch (caught) {
      setError(errorMessage(caught, "The checklist could not be updated."));
    } finally {
      setPending(false);
    }
  }

  async function addItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const label = newItem.trim();
    if (!label) return;
    setPending(true);
    setError(null);
    try {
      await staffApi.addChecklistItem(task.id, label);
      setNewItem("");
      await queryClient.invalidateQueries({ queryKey: ["staff", "tasks"] });
    } catch (caught) {
      setError(errorMessage(caught, "The item could not be added."));
    } finally {
      setPending(false);
    }
  }

  const done = task.status === "done";

  return (
    <article className={`task-card ${done ? "task-card-done" : ""}`}>
      <div className="task-card-head">
        <div>
          <span className="card-kicker">
            {task.priority} priority
            {task.due_at ? ` · due ${task.due_at.slice(0, 10)}` : ""}
          </span>
          <h3>{task.title}</h3>
        </div>
        <span className={`status-${task.status === "done" ? "sent" : "project"}`}>
          {task.status.replace("_", " ")}
        </span>
      </div>
      {task.description && <p className="task-card-description">{task.description}</p>}

      {task.checklist.length > 0 && (
        <ul className="checklist">
          {task.checklist.map((item) => (
            <li key={item.id}>
              <label>
                <Checkbox
                  checked={item.is_done}
                  disabled={!hydrated || pending}
                  onCheckedChange={(checked) => toggleItem(item.id, checked === true)}
                  aria-label={item.label}
                />
                <span className={item.is_done ? "checklist-done" : ""}>{item.label}</span>
              </label>
            </li>
          ))}
        </ul>
      )}

      <form className="checklist-add" onSubmit={addItem}>
        <input
          name="item"
          value={newItem}
          placeholder="Add a checklist item"
          onChange={(event) => setNewItem(event.target.value)}
        />
        <Button type="submit" variant="outline" size="sm" disabled={!hydrated || pending}>
          <Plus /> Add
        </Button>
      </form>

      <div className="task-actions">
        {TASK_STATUSES.map((option) => (
          <Button
            key={option.value}
            variant={task.status === option.value ? "default" : "outline"}
            size="sm"
            disabled={!hydrated || pending}
            aria-pressed={task.status === option.value}
            onClick={() => setStatus(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>
      {error && (
        <p className="feedback error" role="alert">
          {error}
        </p>
      )}
    </article>
  );
}

/** The signed-in staff member's own tasks. */
export function StaffTasksPage() {
  const { status, user } = useSession();
  const queryClient = useQueryClient();
  const hydrated = useHydrated();
  const [filter, setFilter] = useState("all");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const tasks = useQuery({
    queryKey: ["staff", "tasks"],
    queryFn: () => staffApi.myTasks(),
    // Only ask for staff work once the account is known to be staff: a
    // customer would only ever get a refusal from the backend.
    enabled: status === "authenticated" && (user?.role === "staff" || user?.role === "admin"),
    retry: false,
  });

  if (status === "loading") {
    return (
      <StaffShell>
        <div className="loading-block">
          <p>Loading your tasks…</p>
        </div>
      </StaffShell>
    );
  }

  if (status !== "authenticated" || (user?.role !== "staff" && user?.role !== "admin")) {
    return (
      <StaffShell>
        <PageHeading
          eyebrow="STAFF TOOLS"
          title="Staff tasks."
          description="Assigned work for the team."
        />
        <PermissionDenied need="a staff or administrator account" />
      </StaffShell>
    );
  }

  const list = (tasks.data ?? []).filter((task) => filter === "all" || task.status === filter);

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await adminApi.createTask({ title: title.trim(), description: description.trim() });
      setTitle("");
      setDescription("");
      await queryClient.invalidateQueries({ queryKey: ["staff", "tasks"] });
    } catch (caught) {
      setError(errorMessage(caught, "The task could not be created."));
    } finally {
      setPending(false);
    }
  }

  return (
    <StaffShell>
      <PageHeading
        eyebrow="STAFF TOOLS"
        title="My tasks."
        description="Everything assigned to you, with its checklist."
      />
      <div className="category-tabs">
        {[
          { value: "all", label: "All" },
          { value: "todo", label: "To do" },
          { value: "in_progress", label: "In progress" },
          { value: "done", label: "Done" },
        ].map((option) => (
          <Button
            key={option.value}
            variant={filter === option.value ? "default" : "ghost"}
            onClick={() => setFilter(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>

      {tasks.isPending ? (
        <div className="loading-block">
          <p>Loading your tasks…</p>
        </div>
      ) : tasks.isError ? (
        <p className="data-banner" role="alert">
          <span>Your tasks could not be loaded.</span>
        </p>
      ) : list.length === 0 ? (
        <EmptyNotice
          title="Nothing assigned to you."
          description="When the gym assigns you a task it will appear here, with its checklist."
        />
      ) : (
        <div className="task-list">
          {list.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </div>
      )}

      {user?.role === "admin" && (
        <section className="content-block">
          <div className="content-block-head">
            <Plus size={22} />
            <div>
              <h2>Assign yourself a task</h2>
              <p>Administrators can create work and assign it to the team.</p>
            </div>
          </div>
          <form className="profile-form" onSubmit={createTask}>
            <label>
              Title
              <input
                required
                value={title}
                minLength={3}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <label>
              Description
              <textarea
                rows={3}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
            {error && (
              <p className="feedback error" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" disabled={!hydrated || pending}>
              {pending ? "Creating…" : "Create task"}
            </Button>
          </form>
        </section>
      )}
    </StaffShell>
  );
}

/* -------------------------------------------------------------------------- */
/* Administration                                                             */
/* -------------------------------------------------------------------------- */

type AdminTab = "Members" | "Routes" | "Tasks" | "Events" | "Messages";

function MessagesTab() {
  const queryClient = useQueryClient();
  const hydrated = useHydrated();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messages = useQuery({
    queryKey: ["admin", "contact"],
    queryFn: () => adminApi.contactMessages(),
  });

  async function markHandled(id: number, handled: boolean) {
    setPending(true);
    setError(null);
    try {
      await adminApi.markContactMessage(id, handled);
      await queryClient.invalidateQueries({ queryKey: ["admin", "contact"] });
    } catch (caught) {
      setError(errorMessage(caught, "The message could not be updated."));
    } finally {
      setPending(false);
    }
  }

  const list = messages.data ?? [];

  return (
    <>
      {list.length === 0 ? (
        <EmptyNotice
          title="No enquiries waiting."
          description="Messages sent through the contact form arrive here."
        />
      ) : (
        <div className="message-list">
          {list.map((message) => (
            <article className="message-card" key={message.id}>
              <div className="message-head">
                <div>
                  <strong>{message.name}</strong>
                  <a href={`mailto:${message.email}`}>{message.email}</a>
                </div>
                <div className="message-meta">
                  <span>{message.subject}</span>
                  <span>{message.created_at.slice(0, 10)}</span>
                </div>
              </div>
              <p className="message-body">{message.message}</p>
              <div className="task-actions">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!hydrated || pending}
                  onClick={() => markHandled(message.id, true)}
                >
                  <Check size={14} /> Mark as handled
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
      {error && (
        <p className="feedback error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

function MembersTab({ members }: { members: ApiAdminMember[] }) {
  const [search, setSearch] = useState("");
  const filtered = members.filter((member) =>
    `${member.full_name} ${member.email}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <label className="search-field">
        <Search size={17} />
        <input
          aria-label="Search members"
          placeholder="Search members…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Member</th>
              <th>Role</th>
              <th>Membership</th>
              <th>Agreement</th>
              <th>Sends</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((member) => (
              <tr key={member.id}>
                <td>
                  <strong>{member.full_name}</strong>
                  <small>{member.email}</small>
                </td>
                <td>{member.role}</td>
                <td>{member.membership_tier ?? "—"}</td>
                <td>
                  <span
                    className={
                      member.agreement_status === "signed" ? "status-sent" : "status-project"
                    }
                  >
                    {member.agreement_status ?? "none"}
                  </span>
                </td>
                <td>{member.total_sends}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function RoutesTab({ routes }: { routes: ApiRouteSummary[] }) {
  const queryClient = useQueryClient();
  const hydrated = useHydrated();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [grade, setGrade] = useState("");
  const [zone, setZone] = useState("The Main Wall");
  const [setter, setSetter] = useState("");
  const [imageUrl, setImageUrl] = useState("");

  async function createRoute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await adminApi.createRoute({
        name: name.trim(),
        grade: grade.trim().toUpperCase(),
        zone: zone.trim(),
        setter: setter.trim(),
        ...(imageUrl.trim() ? { image_url: imageUrl.trim() } : {}),
      });
      setName("");
      setGrade("");
      setSetter("");
      setImageUrl("");
      await queryClient.invalidateQueries({ queryKey: ["admin", "routes"] });
      await queryClient.invalidateQueries({ queryKey: ["arch", "routes"] });
    } catch (caught) {
      setError(errorMessage(caught, "The route could not be created."));
    } finally {
      setPending(false);
    }
  }

  async function setStatus(routeId: number, status: string) {
    setPending(true);
    setError(null);
    try {
      await adminApi.updateRoute(routeId, { status });
      await queryClient.invalidateQueries({ queryKey: ["admin", "routes"] });
      await queryClient.invalidateQueries({ queryKey: ["arch", "routes"] });
    } catch (caught) {
      setError(errorMessage(caught, "The route could not be updated."));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Route</th>
              <th>Grade</th>
              <th>Wall</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {routes.map((route) => (
              <tr key={route.id}>
                <td>
                  <strong>{route.name}</strong>
                  <small>Set by {route.setter || "—"}</small>
                </td>
                <td>{route.grade}</td>
                <td>{route.zone}</td>
                <td>
                  <span className={route.status === "active" ? "status-sent" : "status-project"}>
                    {route.status.replace("_", " ")}
                  </span>
                </td>
                <td>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!hydrated || pending}
                    onClick={() =>
                      setStatus(route.id, route.status === "active" ? "archived" : "active")
                    }
                  >
                    {route.status === "active" ? "Archive" : "Activate"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="content-block">
        <div className="content-block-head">
          <Plus size={22} />
          <div>
            <h2>Set a new route</h2>
            <p>The grade you publish is the official one.</p>
          </div>
        </div>
        <form className="profile-form" onSubmit={createRoute}>
          <div className="form-row">
            <label>
              Name
              <input
                required
                value={name}
                minLength={2}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label>
              Grade
              <input
                required
                value={grade}
                placeholder="V3"
                onChange={(event) => setGrade(event.target.value)}
              />
            </label>
          </div>
          <div className="form-row">
            <label>
              Wall
              <input value={zone} onChange={(event) => setZone(event.target.value)} />
            </label>
            <label>
              Setter
              <input value={setter} onChange={(event) => setSetter(event.target.value)} />
            </label>
          </div>
          <label>
            Picture <span className="label-hint">optional</span>
            <input
              type="url"
              value={imageUrl}
              placeholder="https://…"
              onChange={(event) => setImageUrl(event.target.value)}
            />
          </label>
          <p className="auth-note">
            A link to a picture that is already published somewhere. The picture itself is never
            uploaded into the database.
          </p>
          {error && (
            <p className="feedback error" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" disabled={!hydrated || pending}>
            {pending ? "Saving…" : "Publish route"}
          </Button>
        </form>
      </section>
    </>
  );
}

function TasksTab({ tasks }: { tasks: ApiTask[] }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Task</th>
            <th>Assignee</th>
            <th>Priority</th>
            <th>Status</th>
            <th>Due</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr key={task.id}>
              <td>
                <strong>{task.title}</strong>
              </td>
              <td>{task.assignee_name ?? "Unassigned"}</td>
              <td>{task.priority}</td>
              <td>
                <span className={task.status === "done" ? "status-sent" : "status-project"}>
                  {task.status.replace("_", " ")}
                </span>
              </td>
              <td>{task.due_at ? task.due_at.slice(0, 10) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EventsTab() {
  const queryClient = useQueryClient();
  const hydrated = useHydrated();
  const events = useQuery({ queryKey: ["admin", "events"], queryFn: () => adminApi.events() });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [location, setLocation] = useState("");

  async function createEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await adminApi.createEvent({
        title: title.trim(),
        starts_at: new Date(startsAt).toISOString(),
        location: location.trim(),
      });
      setTitle("");
      setStartsAt("");
      setLocation("");
      await queryClient.invalidateQueries({ queryKey: ["admin", "events"] });
      await queryClient.invalidateQueries({ queryKey: ["arch", "events"] });
    } catch (caught) {
      setError(errorMessage(caught, "The event could not be created."));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <div className="event-list">
        {(events.data ?? []).map((event) => (
          <article className="event-row" key={event.id}>
            <div className="event-date">
              <CalendarDays size={20} />
              <span>{event.starts_at.slice(0, 16).replace("T", " ")}</span>
            </div>
            <div className="event-detail">
              <h2>{event.title}</h2>
              {event.description && <p>{event.description}</p>}
              <div className="event-meta">
                {event.location && <span>{event.location}</span>}
                <span>{event.is_public ? "Public" : "Staff only"}</span>
              </div>
            </div>
          </article>
        ))}
      </div>

      <section className="content-block">
        <div className="content-block-head">
          <Plus size={22} />
          <div>
            <h2>Publish an event</h2>
            <p>Public events appear in the calendar on the site.</p>
          </div>
        </div>
        <form className="profile-form" onSubmit={createEvent}>
          <div className="form-row">
            <label>
              Title
              <input
                required
                value={title}
                minLength={3}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <label>
              Starts
              <input
                required
                type="datetime-local"
                value={startsAt}
                onChange={(event) => setStartsAt(event.target.value)}
              />
            </label>
          </div>
          <label>
            Location
            <input value={location} onChange={(event) => setLocation(event.target.value)} />
          </label>
          {error && (
            <p className="feedback error" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" disabled={!hydrated || pending}>
            {pending ? "Publishing…" : "Publish event"}
          </Button>
        </form>
      </section>
    </>
  );
}

/** The operations workspace for administrators. */
export function AdminDashboardPage() {
  const { status, user } = useSession();
  const [tab, setTab] = useState<AdminTab>("Members");
  const hydrated = useHydrated();

  const summary = useQuery({
    queryKey: ["admin", "summary"],
    queryFn: () => adminApi.summary(),
    enabled: status === "authenticated" && user?.role === "admin",
    retry: false,
  });
  const members = useQuery({
    queryKey: ["admin", "members"],
    queryFn: () => adminApi.members(),
    enabled: status === "authenticated" && user?.role === "admin",
    retry: false,
  });
  const routes = useQuery({
    queryKey: ["admin", "routes"],
    queryFn: () => adminApi.routes(),
    enabled: status === "authenticated" && user?.role === "admin",
    retry: false,
  });
  const tasks = useQuery({
    queryKey: ["admin", "tasks"],
    queryFn: () => adminApi.tasks(),
    enabled: status === "authenticated" && user?.role === "admin",
    retry: false,
  });

  const isAdmin = status === "authenticated" && user?.role === "admin";

  return (
    <StaffShell>
      <PageHeading
        eyebrow="ARCH OPERATIONS"
        title="The gym, at a glance."
        description="Members, routes, tasks and events — with the checks the backend makes on every request."
      />
      {!isAdmin ? (
        <PermissionDenied need="an administrator account" />
      ) : (
        <>
          {summary.isPending ? (
            <div className="loading-block">
              <p>Loading the operations summary…</p>
            </div>
          ) : summary.isError ? (
            <p className="data-banner" role="alert">
              <span>The summary could not be loaded.</span>
            </p>
          ) : (
            <div className="metric-grid">
              <Metric
                label="Members"
                value={summary.data?.members ?? 0}
                detail="Customer accounts"
              />
              <Metric label="Staff" value={summary.data?.staff ?? 0} detail="Floor and admin" />
              <Metric
                label="Active routes"
                value={summary.data?.active_routes ?? 0}
                detail={`${summary.data?.archived_routes ?? 0} archived`}
              />
              <Metric
                label="Open tasks"
                value={summary.data?.open_tasks ?? 0}
                detail="Not finished yet"
              />
              <Metric
                label="Events"
                value={summary.data?.upcoming_events ?? 0}
                detail="Coming up"
              />
              <Metric
                label="Pending agreements"
                value={summary.data?.pending_agreements ?? 0}
                detail="Still to sign"
              />
            </div>
          )}

          <div className="admin-toolbar">
            <div className="category-tabs">
              {(["Members", "Routes", "Tasks", "Events", "Messages"] as AdminTab[]).map(
                (option) => (
                  <Button
                    key={option}
                    variant={tab === option ? "default" : "ghost"}
                    onClick={() => setTab(option)}
                  >
                    {option}
                  </Button>
                ),
              )}
            </div>
          </div>

          {tab === "Members" &&
            (members.isPending ? (
              <div className="loading-block">
                <p>Loading members…</p>
              </div>
            ) : (
              <MembersTab members={members.data ?? []} />
            ))}
          {tab === "Routes" && <RoutesTab routes={routes.data ?? []} />}
          {tab === "Tasks" &&
            (tasks.isPending ? (
              <div className="loading-block">
                <p>Loading tasks…</p>
              </div>
            ) : (
              <TasksTab tasks={tasks.data ?? []} />
            ))}
          {tab === "Events" && <EventsTab />}
          {tab === "Messages" && <MessagesTab />}
        </>
      )}
      <p className="muted-note">
        Every figure on this page comes from the ARCH database.{" "}
        <TextLink to="/member">Back to the member area</TextLink>
      </p>
      {hydrated && null}
    </StaffShell>
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

export { AlertTriangle, Check, Users, X };
