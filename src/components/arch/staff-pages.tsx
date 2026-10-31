import { useState, type FormEvent, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarDays,
  Check,
  ClipboardList,
  PenLine,
  Plus,
  Search,
  Shield,
  Users,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useHydrated } from "@/hooks/use-hydrated";
import { adminApi, staffApi, ApiError, ApiUnavailableError } from "@/services/api";
import { WALL_TYPES, WALL_TYPE_LABELS, type WallType } from "@/services/arch";
import { useSession } from "@/services/session";
import type {
  ApiAdminAssignee,
  ApiEvent,
  ApiRouteSummary,
  ApiShift,
  ApiTask,
} from "@/services/types";
import { CustomersDirectoryPanel } from "./customer-pages";
import { EmptyNotice } from "./data-state";
import { PageHeading, TextLink } from "./shared";
import { ProductManagementPage } from "./product-management";
import { PriceManagementPage } from "./price-management";
import { OpeningHoursManagementPage } from "./opening-hours-management";
import { CoursesManagementPage } from "./courses-management";
import { EventsManagementPage } from "./events-management";
import { FaqManagementPage } from "./faq-management";
import { RulesManagementPage } from "./rules-management";
import { ServicesManagementPage } from "./services-management";
import { ImageUploadField } from "./image-upload-field";
import { WallManagementPage } from "./wall-management";

/* -------------------------------------------------------------------------- */
/* Shared pieces                                                              */
/* -------------------------------------------------------------------------- */

const TASK_STATUSES = [
  { value: "todo", label: "To do" },
  { value: "in_progress", label: "In progress" },
  { value: "done", label: "Done" },
  { value: "cancelled", label: "Cancelled" },
] as const;

const TASK_PRIORITIES = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
] as const;

function errorMessage(caught: unknown, fallback: string): string {
  if (caught instanceof ApiUnavailableError) {
    return "The ARCH service is not reachable right now. Please try again in a moment.";
  }
  if (caught instanceof ApiError) {
    if (caught.status === 401) return "Your session has expired. Please sign in again.";
    if (caught.status === 403) return "You do not have permission to do that.";
    if (caught.status === 409) return "This status change is not allowed.";
    if (caught.status === 422) return "Invalid status value.";
    return caught.message;
  }
  return fallback;
}

function toDateTimeLocal(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function shiftTime(shift: ApiShift): number {
  const time = new Date(shift.starts_at).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function splitShifts(shifts: ApiShift[]): { upcoming: ApiShift[]; past: ApiShift[] } {
  const now = Date.now();
  const sorted = [...shifts].sort((left, right) => shiftTime(left) - shiftTime(right));
  const upcoming = sorted.filter((shift) => {
    const end = new Date(shift.ends_at).getTime();
    return Number.isNaN(end) ? false : end >= now;
  });
  const past = sorted
    .filter((shift) => {
      const end = new Date(shift.ends_at).getTime();
      return Number.isNaN(end) ? true : end < now;
    })
    .reverse();
  return { upcoming, past };
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

export function StaffShell({ children }: { children: ReactNode }) {
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
          <Link
            to="/staff"
            activeProps={{ className: "workspace-active" }}
            activeOptions={{ exact: true }}
          >
            <ClipboardList size={18} />
            My tasks
          </Link>
          <Link to="/staff/route-setting" activeProps={{ className: "workspace-active" }}>
            <PenLine size={18} />
            Route setting
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
  const [lastValidStatus, setLastValidStatus] = useState<ApiTask["status"]>(task.status);

  async function setStatus(status: ApiTask["status"]) {
    if (status === task.status) return;
    setLastValidStatus(task.status);
    setPending(true);
    setError(null);
    try {
      await staffApi.updateTaskStatus(task.id, status);
      await queryClient.invalidateQueries({ queryKey: ["staff", "tasks"] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "tasks"] });
      setLastValidStatus(status);
    } catch (caught) {
      setError(errorMessage(caught, "The task could not be updated."));
    } finally {
      setPending(false);
    }
  }

  async function retrySetStatus() {
    if (!error) return;
    await setStatus(lastValidStatus);
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
  const cancelled = task.status === "cancelled";

  return (
    <article
      className={`task-card ${done ? "task-card-done" : cancelled ? "task-card-cancelled" : ""}`}
    >
      <div className="task-card-head">
        <div>
          <span className="card-kicker">
            {task.priority} priority
            {task.due_at ? ` · due ${task.due_at.slice(0, 10)}` : ""}
          </span>
          <h3>{task.title}</h3>
        </div>
        <span
          className={`status-${task.status === "done" ? "sent" : task.status === "cancelled" ? "cancelled" : "project"}`}
        >
          {task.status.replace("_", " ")}
        </span>
      </div>
      {task.description && <p className="task-card-description">{task.description}</p>}

      {task.event_title && (
        <p className="task-card-event">
          <CalendarDays size={14} />
          <span>
            {task.event_title}
            {task.event_starts_at ? ` · ${formatDateTime(task.event_starts_at)}` : ""}
          </span>
        </p>
      )}

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
        {TASK_STATUSES.map((option) => {
          return (
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
          );
        })}
      </div>
      {error && (
        <div className="feedback error" role="alert">
          <p>{error}</p>
          <Button type="button" variant="outline" size="sm" onClick={retrySetStatus}>
            Retry
          </Button>
        </div>
      )}
    </article>
  );
}

function ShiftRow({ shift }: { shift: ApiShift }) {
  return (
    <article className="event-row">
      <div className="event-date">
        <CalendarDays size={16} />
        <span>{formatDateTime(shift.starts_at)}</span>
      </div>
      <div className="event-detail">
        <h2>{shift.role || "Shift"}</h2>
        <p>{shift.staff_name ?? "Staff member"}</p>
        {shift.notes && <p>{shift.notes}</p>}
      </div>
      <div className="event-meta">
        <span>Ends {formatDateTime(shift.ends_at)}</span>
      </div>
    </article>
  );
}

function ShiftList({
  shifts,
  emptyTitle = "No shifts scheduled.",
  emptyDescription = "When an administrator adds you to a shift it will appear here.",
}: {
  shifts: ApiShift[];
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const { upcoming, past } = splitShifts(shifts);

  if (shifts.length === 0) {
    return <EmptyNotice title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className="event-list">
      {upcoming.length === 0 ? (
        <p className="muted-note">No upcoming shifts. Earlier shifts are listed below.</p>
      ) : (
        upcoming.map((shift) => <ShiftRow key={shift.id} shift={shift} />)
      )}
      {past.length > 0 && (
        <details className="content-block">
          <summary>Earlier shifts ({past.length})</summary>
          <div className="event-list">
            {past.map((shift) => (
              <ShiftRow key={shift.id} shift={shift} />
            ))}
          </div>
        </details>
      )}
    </div>
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

  const shifts = useQuery({
    queryKey: ["staff", "shifts"],
    queryFn: () => staffApi.shifts(),
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
      await queryClient.invalidateQueries({ queryKey: ["admin", "tasks"] });
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
          { value: "cancelled", label: "Cancelled" },
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

      <section className="content-block">
        <div className="content-block-head">
          <CalendarDays size={22} />
          <div>
            <h2>My shifts</h2>
            <p>Upcoming shifts first, with earlier shifts kept separate.</p>
          </div>
        </div>
        {shifts.isPending ? (
          <div className="loading-block">
            <p>Loading your shifts…</p>
          </div>
        ) : shifts.isError ? (
          <p className="data-banner" role="alert">
            <span>Your shifts could not be loaded.</span>
          </p>
        ) : (
          <ShiftList shifts={shifts.data ?? []} />
        )}
      </section>

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

type AdminTab = "Customers" | "Routes" | "Walls" | "Tasks" | "Shifts" | "Events" | "Courses" | "FAQ" | "Rules" | "Services" | "Messages" | "Products" | "Prices" | "Opening hours";

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

interface RouteEditDialogProps {
  route: ApiRouteSummary;
  walls: { id: number; name: string }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void> | void;
}

function RouteEditDialog({ route, walls, open, onOpenChange, onSaved }: RouteEditDialogProps) {
  const [name, setName] = useState(route.name);
  const [grade, setGrade] = useState(route.grade);
  const [wallId, setWallId] = useState(route.wall_id ? String(route.wall_id) : "");
  const [wallType, setWallType] = useState<WallType>(route.wall_type);
  const [setter, setSetter] = useState(route.setter);
  const [imageUrl, setImageUrl] = useState(route.image_url ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const nextName = name.trim();
    const nextGrade = grade.trim().toUpperCase();
    if (!nextName || !nextGrade) {
      setError("Name and grade are required.");
      return;
    }

    const body: Record<string, unknown> = {};
    if (nextName !== route.name) body["name"] = nextName;
    if (nextGrade !== route.grade) body["grade"] = nextGrade;
    const nextWallId = wallId ? Number(wallId) : null;
    if (nextWallId !== route.wall_id) body["wall_id"] = nextWallId;
    if (wallType !== route.wall_type) body["wall_type"] = wallType;
    if (setter.trim() !== route.setter) body["setter"] = setter.trim();
    if (imageUrl.trim() !== (route.image_url ?? "")) body["image_url"] = imageUrl.trim();

    if (Object.keys(body).length === 0) {
      setError("No changes to save.");
      return;
    }

    setPending(true);
    setError(null);
    try {
      await adminApi.updateRoute(route.id, body);
      await onSaved();
      onOpenChange(false);
    } catch (caught) {
      setError(errorMessage(caught, "The route could not be updated."));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit route</DialogTitle>
          <DialogDescription>
            Only changed fields are sent to the API. Uploading a new picture replaces the route
            image only after the upload succeeds.
          </DialogDescription>
        </DialogHeader>
        <form className="profile-form" onSubmit={save}>
          <div className="form-row">
            <label>
              Name
              <input
                required
                value={name}
                minLength={2}
                onChange={(event) => setName(event.target.value)}
                disabled={pending}
              />
            </label>
            <label>
              Grade
              <input
                required
                value={grade}
                onChange={(event) => setGrade(event.target.value)}
                disabled={pending}
              />
            </label>
          </div>
          <div className="form-row">
            <label>
              Wall
              <select
                value={wallId}
                onChange={(event) => setWallId(event.target.value)}
                disabled={pending}
              >
                <option value="">Not set yet</option>
                {walls.map((wall) => (
                  <option key={wall.id} value={wall.id}>
                    {wall.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Wall type
              <select
                value={wallType}
                onChange={(event) => setWallType(event.target.value as WallType)}
                disabled={pending}
              >
                {WALL_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {WALL_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Setter
            <input
              value={setter}
              onChange={(event) => setSetter(event.target.value)}
              disabled={pending}
            />
          </label>

          <ImageUploadField
            value={imageUrl}
            onChange={setImageUrl}
            label="Route image"
            placeholder="https://…"
            accept="image/jpeg,image/png,image/webp"
            maxSize={10 * 1024 * 1024}
            disabled={pending}
            onError={setError}
          />

          {error && (
            <p className="feedback error" role="alert">
              {error}
            </p>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RoutesTab({ routes }: { routes: ApiRouteSummary[] }) {
  const queryClient = useQueryClient();
  const hydrated = useHydrated();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [grade, setGrade] = useState("");
  const [wallId, setWallId] = useState("");
  const [wallType, setWallType] = useState<WallType>("vertical");
  const [setter, setSetter] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [editingRoute, setEditingRoute] = useState<ApiRouteSummary | null>(null);

  const walls = useQuery({ queryKey: ["admin", "walls"], queryFn: () => adminApi.walls() });

  async function createRoute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setSuccess(null);
    try {
      await adminApi.createRoute({
        name: name.trim(),
        grade: grade.trim().toUpperCase(),
        wall_id: wallId ? Number(wallId) : null,
        wall_type: wallType,
        setter: setter.trim(),
        ...(imageUrl.trim() ? { image_url: imageUrl.trim() } : {}),
      });
      setName("");
      setGrade("");
      setSetter("");
      setImageUrl("");
      await queryClient.invalidateQueries({ queryKey: ["admin", "routes"] });
      await queryClient.invalidateQueries({ queryKey: ["arch", "routes"] });
      setSuccess("Route created.");
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
                <td>
                  {route.wall || "—"}
                  <small>{WALL_TYPE_LABELS[route.wall_type] ?? route.wall_type}</small>
                </td>
                <td>
                  <span className={route.status === "active" ? "status-sent" : "status-project"}>
                    {route.status.replace("_", " ")}
                  </span>
                </td>
                <td>
                  <div className="row-actions">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={!hydrated || pending}
                      onClick={() => setEditingRoute(route)}
                    >
                      <PenLine size={14} /> Edit
                    </Button>
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
                  </div>
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
              <select value={wallId} onChange={(event) => setWallId(event.target.value)}>
                <option value="">Not set yet</option>
                {(walls.data ?? []).map((wall) => (
                  <option key={wall.id} value={wall.id}>
                    {wall.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Wall type
              <select
                value={wallType}
                onChange={(event) => setWallType(event.target.value as WallType)}
              >
                {WALL_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {WALL_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="form-row">
            <label>
              Setter
              <input value={setter} onChange={(event) => setSetter(event.target.value)} />
            </label>
          </div>
          <ImageUploadField
            value={imageUrl}
            onChange={setImageUrl}
            label="Upload Image"
            placeholder="https://…"
            accept="image/jpeg,image/png,image/webp"
            maxSize={10 * 1024 * 1024}
            disabled={pending}
            onError={setError}
            onSuccess={() => setSuccess("Image uploaded successfully.")}
          />

          <p className="auth-note">
            Upload a picture, or paste a link to one that is already published elsewhere. Only the
            resulting URL is stored with the route.
          </p>
          {error && (
            <p className="feedback error" role="alert">
              {error}
            </p>
          )}
          {success && (
            <p className="feedback success" role="status">
              {success}
            </p>
          )}
          <Button type="submit" disabled={!hydrated || pending}>
            {pending ? "Saving…" : "Publish route"}
          </Button>
        </form>
      </section>

      {editingRoute && (
        <RouteEditDialog
          key={editingRoute.id}
          route={editingRoute}
          walls={walls.data ?? []}
          open
          onOpenChange={(open) => {
            if (!open) setEditingRoute(null);
          }}
          onSaved={async () => {
            await queryClient.invalidateQueries({ queryKey: ["admin", "routes"] });
            await queryClient.invalidateQueries({ queryKey: ["arch", "routes"] });
            setSuccess("Route updated.");
          }}
        />
      )}
    </>
  );
}

function useTaskOptions() {
  const assignees = useQuery({
    queryKey: ["admin", "assignees"],
    queryFn: () => adminApi.assignees(),
    retry: false,
  });
  const events = useQuery({
    queryKey: ["admin", "events"],
    queryFn: () => adminApi.events(),
    retry: false,
  });
  return { assignees, events };
}

function OptionStatus({
  label,
  query,
}: {
  label: string;
  query:
    ReturnType<typeof useTaskOptions>["assignees"] | ReturnType<typeof useTaskOptions>["events"];
}) {
  if (query.isPending) {
    return <p className="muted-note">Loading {label.toLowerCase()}…</p>;
  }
  if (query.isError) {
    return (
      <div className="feedback error" role="alert">
        <span>{label} could not be loaded.</span>{" "}
        <Button type="button" variant="outline" size="sm" onClick={() => query.refetch()}>
          Retry
        </Button>
      </div>
    );
  }
  if ((query.data ?? []).length === 0) {
    return <p className="muted-note">No {label.toLowerCase()} available.</p>;
  }
  return null;
}

function TaskForm({
  task,
  submitLabel,
  onSaved,
}: {
  task?: ApiTask;
  submitLabel: string;
  onSaved?: () => void;
}) {
  const queryClient = useQueryClient();
  const hydrated = useHydrated();
  const { assignees, events } = useTaskOptions();
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [assigneeId, setAssigneeId] = useState(task?.assignee_id?.toString() ?? "");
  const [priority, setPriority] = useState<ApiTask["priority"]>(task?.priority ?? "normal");
  const [dueAt, setDueAt] = useState(toDateTimeLocal(task?.due_at ?? null));
  const [eventId, setEventId] = useState(task?.event_id?.toString() ?? "");
  const [checklistText, setChecklistText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const optionsPending = assignees.isPending || events.isPending;
  const optionsError = assignees.isError || events.isError;
  const submitDisabled = !hydrated || pending || optionsPending || optionsError;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const trimmedTitle = title.trim();
    const trimmedDescription = description.trim();
    if (trimmedTitle.length < 3) {
      setError("Give the task a title of at least 3 characters.");
      return;
    }
    if (dueAt && Number.isNaN(new Date(dueAt).getTime())) {
      setError("Choose a valid due date and time.");
      return;
    }
    if (optionsPending) {
      setError("Wait for the assignee and event options to load.");
      return;
    }
    if (optionsError) {
      setError("Retry the failed assignee or event options before saving.");
      return;
    }

    setPending(true);
    setError(null);
    setSuccess(null);
    try {
      if (!task) {
        const checklist = checklistText
          .split("\n")
          .map((label) => label.trim())
          .filter(Boolean)
          .map((label) => ({ label }));
        await adminApi.createTask({
          title: trimmedTitle,
          description: trimmedDescription,
          assignee_id: assigneeId ? Number(assigneeId) : null,
          priority,
          due_at: dueAt ? new Date(dueAt).toISOString() : null,
          event_id: eventId ? Number(eventId) : null,
          checklist,
        });
        setTitle("");
        setDescription("");
        setAssigneeId("");
        setPriority("normal");
        setDueAt("");
        setEventId("");
        setChecklistText("");
        setSuccess("Task created.");
      } else {
        const body: {
          title?: string;
          description?: string;
          assignee_id?: number | null;
          priority?: string;
          due_at?: string | null;
          event_id?: number | null;
        } = {};
        if (trimmedTitle !== task.title) body.title = trimmedTitle;
        if (trimmedDescription !== task.description) body.description = trimmedDescription;
        if (assigneeId !== (task.assignee_id?.toString() ?? "")) {
          body.assignee_id = assigneeId ? Number(assigneeId) : null;
        }
        if (priority !== task.priority) body.priority = priority;
        if (dueAt !== toDateTimeLocal(task.due_at)) {
          body.due_at = dueAt ? new Date(dueAt).toISOString() : null;
        }
        if (eventId !== (task.event_id?.toString() ?? "")) {
          body.event_id = eventId ? Number(eventId) : null;
        }
        if (Object.keys(body).length === 0) {
          setError("No changes to save.");
          return;
        }
        await staffApi.updateTask(task.id, body);
        onSaved?.();
      }
      await queryClient.invalidateQueries({ queryKey: ["admin", "tasks"] });
      await queryClient.invalidateQueries({ queryKey: ["staff", "tasks"] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "summary"] });
    } catch (caught) {
      setError(errorMessage(caught, "The task could not be saved."));
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="profile-form" onSubmit={submit}>
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
          Priority
          <select
            value={priority}
            onChange={(event) => setPriority(event.target.value as ApiTask["priority"])}
          >
            {TASK_PRIORITIES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Description <span className="label-hint">optional</span>
        <textarea
          rows={3}
          maxLength={4000}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>
      <div className="form-row">
        <label>
          Assignee <span className="label-hint">optional</span>
          <select
            value={assigneeId}
            disabled={assignees.isPending || assignees.isError}
            onChange={(event) => setAssigneeId(event.target.value)}
          >
            <option value="">Unassigned</option>
            {(assignees.data ?? []).map((assignee) => (
              <option key={assignee.id} value={assignee.id}>
                {assignee.full_name} ({assignee.email})
              </option>
            ))}
          </select>
        </label>
        <label>
          Event <span className="label-hint">optional</span>
          <select
            value={eventId}
            disabled={events.isPending || events.isError}
            onChange={(event) => setEventId(event.target.value)}
          >
            <option value="">No event</option>
            {(events.data ?? []).map((event) => (
              <option key={event.id} value={event.id}>
                {event.title} · {formatDateTime(event.starts_at)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <OptionStatus label="Assignee options" query={assignees} />
      <OptionStatus label="Event options" query={events} />
      <label>
        Due date and time <span className="label-hint">optional</span>
        <input
          type="datetime-local"
          value={dueAt}
          onChange={(event) => setDueAt(event.target.value)}
        />
      </label>
      {!task && (
        <label>
          Initial checklist <span className="label-hint">one item per line</span>
          <textarea
            rows={3}
            value={checklistText}
            placeholder="Collect the holds&#10;Check the lighting"
            onChange={(event) => setChecklistText(event.target.value)}
          />
        </label>
      )}
      {task && (
        <p className="auth-note">
          Checklist items are managed on the staff task card. This form only changes the task
          details, assignment and event.
        </p>
      )}
      {error && (
        <p className="feedback error" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="feedback" role="status">
          {success}
        </p>
      )}
      <div className="form-row">
        <Button type="submit" disabled={submitDisabled}>
          {pending ? "Saving…" : submitLabel}
        </Button>
        {task && (
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
        )}
      </div>
    </form>
  );
}

function TaskEditDialog({
  task,
  open,
  onOpenChange,
}: {
  task: ApiTask;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit task</DialogTitle>
          <DialogDescription>
            Only changed fields are sent to the API. Clearing an optional field sends an explicit
            null so an unchanged value is never silently removed.
          </DialogDescription>
        </DialogHeader>
        <TaskForm
          key={task.id}
          task={task}
          submitLabel="Save changes"
          onSaved={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function TasksTab({ tasks }: { tasks: ApiTask[] }) {
  const [editingTask, setEditingTask] = useState<ApiTask | null>(null);

  return (
    <>
      {tasks.length === 0 ? (
        <EmptyNotice
          title="No tasks yet."
          description="Create the first task below and assign it to a staff member or administrator."
        />
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Task</th>
                <th>Assignee</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Due</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <tr key={task.id}>
                  <td>
                    <strong>{task.title}</strong>
                    <small>Created by {task.created_by_name ?? "an administrator"}</small>
                    {task.event_title && (
                      <small>
                        Event: {task.event_title}
                        {task.event_starts_at ? ` · ${formatDateTime(task.event_starts_at)}` : ""}
                      </small>
                    )}
                  </td>
                  <td>{task.assignee_name ?? "Unassigned"}</td>
                  <td>{task.priority}</td>
                  <td>
                    <span className={task.status === "done" ? "status-sent" : "status-project"}>
                      {task.status.replace("_", " ")}
                    </span>
                  </td>
                  <td>{task.due_at ? formatDateTime(task.due_at) : "—"}</td>
                  <td>
                    <Button variant="outline" size="sm" onClick={() => setEditingTask(task)}>
                      <PenLine size={14} /> Edit
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section className="content-block">
        <div className="content-block-head">
          <Plus size={22} />
          <div>
            <h2>Create and assign a task</h2>
            <p>Assignments, priority, due date and event are optional.</p>
          </div>
        </div>
        <TaskForm submitLabel="Create task" />
      </section>

      {editingTask && (
        <TaskEditDialog
          task={editingTask}
          open
          onOpenChange={(open) => {
            if (!open) setEditingTask(null);
          }}
        />
      )}
    </>
  );
}

function AdminShiftsTab() {
  const queryClient = useQueryClient();
  const hydrated = useHydrated();
  const assignees = useQuery({
    queryKey: ["admin", "assignees"],
    queryFn: () => adminApi.assignees(),
    retry: false,
  });
  const shifts = useQuery({
    queryKey: ["admin", "shifts"],
    queryFn: () => staffApi.shifts(),
    retry: false,
  });
  const [staffId, setStaffId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [role, setRole] = useState("Floor staff");
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const optionsPending = assignees.isPending;
  const optionsError = assignees.isError;
  const noStaff = !optionsPending && !optionsError && (assignees.data ?? []).length === 0;

  async function createShift(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!staffId) {
      setError("Choose a staff member for the shift.");
      return;
    }
    if (!startsAt || !endsAt) {
      setError("Choose a start and end time.");
      return;
    }
    const start = new Date(startsAt);
    const end = new Date(endsAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      setError("Choose valid start and end times.");
      return;
    }
    if (end <= start) {
      setError("The shift must end after it starts.");
      return;
    }
    if (optionsPending) {
      setError("Wait for the staff options to load.");
      return;
    }
    if (optionsError) {
      setError("Retry the staff options before scheduling.");
      return;
    }

    setPending(true);
    setError(null);
    setSuccess(null);
    try {
      await staffApi.createShift({
        staff_id: Number(staffId),
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
        role: role.trim() || "Floor staff",
        notes: notes.trim(),
      });
      setStaffId("");
      setStartsAt("");
      setEndsAt("");
      setRole("Floor staff");
      setNotes("");
      setSuccess("Shift scheduled.");
      await queryClient.invalidateQueries({ queryKey: ["admin", "shifts"] });
      await queryClient.invalidateQueries({ queryKey: ["staff", "shifts"] });
    } catch (caught) {
      setError(errorMessage(caught, "The shift could not be created."));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      {shifts.isPending ? (
        <div className="loading-block">
          <p>Loading shifts…</p>
        </div>
      ) : shifts.isError ? (
        <p className="data-banner" role="alert">
          <span>Shifts could not be loaded.</span>
        </p>
      ) : (
        <ShiftList
          shifts={shifts.data ?? []}
          emptyTitle="No shifts scheduled."
          emptyDescription="Create a shift below to schedule the team."
        />
      )}

      <section className="content-block">
        <div className="content-block-head">
          <Plus size={22} />
          <div>
            <h2>Schedule a shift</h2>
            <p>Use the staff options and the shift's actual start and end times.</p>
          </div>
        </div>
        <form className="profile-form" onSubmit={createShift}>
          <div className="form-row">
            <label>
              Staff member
              <select
                required
                value={staffId}
                disabled={assignees.isPending || assignees.isError || noStaff}
                onChange={(event) => setStaffId(event.target.value)}
              >
                <option value="">Choose a staff member</option>
                {(assignees.data ?? []).map((assignee) => (
                  <option key={assignee.id} value={assignee.id}>
                    {assignee.full_name} ({assignee.email})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Role
              <input
                value={role}
                maxLength={80}
                onChange={(event) => setRole(event.target.value)}
              />
            </label>
          </div>
          <OptionStatus label="Staff options" query={assignees} />
          <div className="form-row">
            <label>
              Starts
              <input
                required
                type="datetime-local"
                value={startsAt}
                onChange={(event) => setStartsAt(event.target.value)}
              />
            </label>
            <label>
              Ends
              <input
                required
                type="datetime-local"
                value={endsAt}
                onChange={(event) => setEndsAt(event.target.value)}
              />
            </label>
          </div>
          <label>
            Notes <span className="label-hint">optional</span>
            <textarea
              rows={3}
              maxLength={2000}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
          {error && (
            <p className="feedback error" role="alert">
              {error}
            </p>
          )}
          {success && (
            <p className="feedback" role="status">
              {success}
            </p>
          )}
          <Button
            type="submit"
            disabled={!hydrated || pending || optionsPending || optionsError || noStaff}
          >
            {pending ? "Scheduling…" : "Schedule shift"}
          </Button>
        </form>
      </section>
    </>
  );
}


/** The operations workspace for administrators. */
export function AdminDashboardPage() {
  const { status, user } = useSession();
  const [tab, setTab] = useState<AdminTab>("Customers");
  const hydrated = useHydrated();

  const summary = useQuery({
    queryKey: ["admin", "summary"],
    queryFn: () => adminApi.summary(),
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
  const sessionLoading = status === "loading";

  return (
    <StaffShell>
      <PageHeading
        eyebrow="ARCH OPERATIONS"
        title="The gym, at a glance."
        description="Customers, routes, tasks, shifts and events — with the checks the backend makes on every request."
      />
      {sessionLoading ? (
        <div className="loading-block" aria-busy="true">
          <p>Checking your session…</p>
        </div>
      ) : !isAdmin ? (
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
              {(["Customers", "Routes", "Walls", "Tasks", "Shifts", "Events", "Courses", "FAQ", "Rules", "Services", "Messages", "Products", "Prices", "Opening hours"] as AdminTab[]).map(
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

          {tab === "Customers" && <CustomersDirectoryPanel />}
          {tab === "Routes" && <RoutesTab routes={routes.data ?? []} />}
          {tab === "Walls" && <WallManagementPage />}
          {tab === "Tasks" &&
            (tasks.isPending ? (
              <div className="loading-block">
                <p>Loading tasks…</p>
              </div>
            ) : tasks.isError ? (
              <div className="data-banner" role="alert">
                <span>Tasks could not be loaded.</span>
                <Button type="button" variant="outline" size="sm" onClick={() => tasks.refetch()}>
                  Retry
                </Button>
              </div>
            ) : (
              <TasksTab tasks={tasks.data ?? []} />
            ))}
          {tab === "Shifts" && <AdminShiftsTab />}
          {tab === "Events" && <EventsManagementPage />}
          {tab === "Courses" && <CoursesManagementPage />}
          {tab === "FAQ" && <FaqManagementPage />}
          {tab === "Rules" && <RulesManagementPage />}
          {tab === "Services" && <ServicesManagementPage />}
          {tab === "Messages" && <MessagesTab />}
          {tab === "Products" && <ProductManagementPage />}
          {tab === "Prices" && <PriceManagementPage />}
          {tab === "Opening hours" && <OpeningHoursManagementPage />}
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

export { AdminShiftsTab, ShiftList, TaskEditDialog, TaskForm };
export { AlertTriangle, Check, Users, X };
