import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  Check,
  Edit,
  Loader2,
  Plus,
  Trash2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
import { adminApi, ApiError, ApiUnavailableError } from "@/services/api";
import type {
  ApiAdminEvent,
  ApiAdminEventCreate,
  ApiAdminEventUpdate,
} from "@/services/types";
import { EmptyNotice } from "./data-state";
import { PageHeading } from "./shared";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function errorMessage(caught: unknown, fallback: string): string {
  if (caught instanceof ApiUnavailableError) {
    return "The ARCH service is not reachable right now. Please try again in a moment.";
  }
  if (caught instanceof ApiError) {
    if (caught.status === 401) return "Your session has expired. Please sign in again.";
    if (caught.status === 403) return "You do not have permission to do that.";
    if (caught.status === 404) return "Event not found.";
    if (caught.status === 422) return "Invalid event data.";
    return caught.message;
  }
  return fallback;
}

/** Convert an ISO datetime string to a `datetime-local` value for editing. */
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

/* -------------------------------------------------------------------------- */
/* Form                                                                        */
/* -------------------------------------------------------------------------- */

interface EventFormProps {
  event?: ApiAdminEvent;
  submitLabel: string;
  onSaved: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function EventForm({ event, submitLabel, onSaved, open, onOpenChange }: EventFormProps) {
  const queryClient = useQueryClient();
  const hydrated = useHydrated();

  const [title, setTitle] = useState(event?.title ?? "");
  const [startsAt, setStartsAt] = useState(() => toDateTimeLocal(event?.starts_at ?? null));
  const [endsAt, setEndsAt] = useState(() => toDateTimeLocal(event?.ends_at ?? null));
  const [location, setLocation] = useState(event?.location ?? "");
  const [capacity, setCapacity] = useState<string>(event?.capacity?.toString() ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [isPublic, setIsPublic] = useState(event?.is_public ?? true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function submit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    if (pending) return;

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Title is required.");
      return;
    }
    if (!startsAt) {
      setError("Choose a start time.");
      return;
    }
    const parsedStart = new Date(startsAt);
    if (Number.isNaN(parsedStart.getTime())) {
      setError("Choose a valid start time.");
      return;
    }

    const parsedEnd = endsAt ? new Date(endsAt) : null;
    if (parsedEnd && Number.isNaN(parsedEnd.getTime())) {
      setError("Choose a valid end time.");
      return;
    }
    if (parsedEnd && (!parsedStart || parsedEnd <= parsedStart)) {
      setError("The end must be after the start.");
      return;
    }

    if (capacity) {
      const capNum = Number(capacity);
      if (Number.isNaN(capNum) || capNum < 1 || capNum > 10000) {
        setError("Capacity must be between 1 and 10000.");
        return;
      }
    }

    if (description.length > 4000) {
      setError("Description must be 4000 characters or fewer.");
      return;
    }

    setPending(true);
    setError(null);
    setSuccess(null);

    try {
      if (!event) {
        const body: ApiAdminEventCreate = {
          title: trimmedTitle,
          starts_at: new Date(startsAt).toISOString(),
          is_public: isPublic,
        };
        if (location.trim()) body.location = location.trim();
        if (description.trim()) body.description = description.trim();
        if (endsAt) body.ends_at = new Date(endsAt).toISOString();
        if (capacity) body.capacity = Number(capacity);

        await adminApi.createEvent(body);
      } else {
        const updateBody: ApiAdminEventUpdate = {};
        if (trimmedTitle !== event.title) updateBody.title = trimmedTitle;
        if (toDateTimeLocal(event.starts_at) !== startsAt) {
          updateBody.starts_at = new Date(startsAt).toISOString();
        }
        if (endsAt !== toDateTimeLocal(event.ends_at)) {
          updateBody.ends_at = endsAt ? new Date(endsAt).toISOString() : null;
        }
        if (location.trim() !== event.location) updateBody.location = location.trim();
        if (description.trim() !== event.description) updateBody.description = description.trim();
        if (capacity !== event.capacity?.toString()) {
          updateBody.capacity = capacity ? Number(capacity) : null;
        }
        if (isPublic !== event.is_public) updateBody.is_public = isPublic;

        if (Object.keys(updateBody).length === 0) {
          setError("No changes to save.");
          return;
        }
        await adminApi.updateEvent(event.id, updateBody);
      }

      await queryClient.invalidateQueries({ queryKey: ["admin", "events"] });
      await queryClient.invalidateQueries({ queryKey: ["arch", "events"] });

      if (!event) {
        setSuccess("Event added.");
      } else {
        setSuccess("Event updated.");
      }
      onSaved();
    } catch (caught) {
      setError(errorMessage(caught, event ? "The event could not be saved." : "The event could not be created."));
    } finally {
      setPending(false);
    }
  }

  const submitDisabled = !hydrated || pending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{event ? "Edit event" : "Add event"}</DialogTitle>
          <DialogDescription>
            {event
              ? "Only changed fields are sent to the API."
              : "Fill in the required fields. All other fields are optional."}
          </DialogDescription>
        </DialogHeader>
        <form className="profile-form" onSubmit={submit} noValidate>
          <div className="form-row">
            <Label>
              Title <span className="label-hint">required</span>
              <input
                required
                maxLength={160}
                value={title}
                minLength={1}
                onChange={(event) => setTitle(event.target.value)}
                disabled={pending}
                placeholder="Event title"
              />
            </Label>
            <Label>
              Location <span className="label-hint">optional</span>
              <input
                maxLength={160}
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                disabled={pending}
                placeholder="Venue or address"
              />
            </Label>
          </div>
          <div className="form-row">
            <Label>
              Starts <span className="label-hint">required</span>
              <input
                required
                type="datetime-local"
                value={startsAt}
                onChange={(event) => setStartsAt(event.target.value)}
                disabled={pending}
              />
            </Label>
            <Label>
              Ends <span className="label-hint">optional</span>
              <input
                type="datetime-local"
                value={endsAt}
                onChange={(event) => setEndsAt(event.target.value)}
                disabled={pending}
              />
            </Label>
          </div>
          <div className="form-row">
            <Label>
              Capacity <span className="label-hint">optional</span>
              <input
                type="number"
                value={capacity}
                min={1}
                max={10000}
                onChange={(event) => setCapacity(event.target.value)}
                disabled={pending}
                placeholder="Up to 10,000"
              />
            </Label>
            <Label>
              Visibility <span className="label-hint">optional</span>
              <select
                value={isPublic ? "true" : "false"}
                onChange={(event) => setIsPublic(event.target.value === "true")}
                disabled={pending}
              >
                <option value="true">Public</option>
                <option value="false">Staff only</option>
              </select>
            </Label>
          </div>
          <Label>
            Description <span className="label-hint">optional</span>
            <textarea
              rows={3}
              maxLength={4000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              disabled={pending}
              placeholder="What to expect…"
            />
          </Label>
          {error && <p className="feedback error" role="alert">{error}</p>}
          {success && <p className="feedback" role="status">{success}</p>}
          <div className="form-row">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                <X /> Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={submitDisabled}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : submitLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Row                                                                          */
/* -------------------------------------------------------------------------- */

function EventRow({
  event,
  onEdit,
  onTogglePublic,
  onDelete,
}: {
  event: ApiAdminEvent;
  onEdit: (event: ApiAdminEvent) => void;
  onTogglePublic: (event: ApiAdminEvent) => void;
  onDelete: (event: ApiAdminEvent) => void;
}) {
  return (
    <tr className="event-row">
      <td>
        <strong>{event.title}</strong>
        {event.description && <small>{event.description}</small>}
      </td>
      <td>{formatDateTime(event.starts_at)}</td>
      <td>{event.ends_at ? formatDateTime(event.ends_at) : "—"}</td>
      <td>{event.location || "—"}</td>
      <td>
        {event.capacity !== null && event.capacity !== undefined
          ? event.capacity.toLocaleString()
          : "—"}
      </td>
      <td>
        <span className={event.is_public ? "status-sent" : "status-project"}>
          {event.is_public ? "Public" : "Staff only"}
        </span>
      </td>
      <td>
        <div className="task-actions">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onEdit(event)}
            aria-label={`Edit ${event.title}`}
          >
            <Edit size={14} /> Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onTogglePublic(event)}
            aria-label={event.is_public ? `Hide ${event.title}` : `Publish ${event.title}`}
          >
            <Check size={14} />
            {event.is_public ? "Hide" : "Publish"}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => onDelete(event)}
            aria-label={`Delete ${event.title}`}
          >
            <Trash2 size={14} /> Delete
          </Button>
        </div>
      </td>
    </tr>
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

export function EventsManagementPage() {
  const queryClient = useQueryClient();
  const hydrated = useHydrated();
  const [editingEvent, setEditingEvent] = useState<ApiAdminEvent | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ApiAdminEvent | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const events = useQuery({
    queryKey: ["admin", "events"],
    queryFn: () => adminApi.events(),
    retry: false,
  });

  async function confirmDelete() {
    if (!deleteTarget) return;
    setPending(true);
    setActionError(null);
    try {
      await adminApi.deleteEvent(deleteTarget.id);
      queryClient.invalidateQueries({ queryKey: ["admin", "events"] });
      setNotice(`Event "${deleteTarget.title}" deleted.`);
      setDeleteTarget(null);
    } catch (caught) {
      setActionError(errorMessage(caught, "The event could not be deleted."));
    } finally {
      setPending(false);
    }
  }

  async function handleTogglePublic(event: ApiAdminEvent) {
    setActionError(null);
    setEditingEvent(null);
    try {
      await adminApi.updateEvent(event.id, { is_public: !event.is_public });
      queryClient.invalidateQueries({ queryKey: ["admin", "events"] });
      await queryClient.invalidateQueries({ queryKey: ["arch", "events"] });
      setNotice(event.is_public ? "Hidden." : "Published.");
    } catch (caught) {
      setActionError(errorMessage(caught, "Could not change visibility."));
    }
  }

  function handleEdit(event: ApiAdminEvent) {
    setNotice(null);
    setActionError(null);
    setEditingEvent(event);
  }

  function handleDelete(event: ApiAdminEvent) {
    setActionError(null);
    setDeleteTarget(event);
  }

  if (events.isPending) {
    return (
      <div className="loading-block" aria-busy="true">
        <p>Loading events…</p>
      </div>
    );
  }

  if (events.isError) {
    return (
      <div className="feedback error" role="alert">
        <span>Events could not be loaded.</span>
        <Button variant="outline" size="sm" onClick={() => events.refetch()}>
          <Check size={14} /> Retry
        </Button>
      </div>
    );
  }

  const list = events.data ?? [];

  return (
    <>
      <PageHeading
        eyebrow="ARCH OPERATIONS"
        title="Events management."
        description="Configure events the gym offers — publishing them to the public site or locking them to staff access only."
      />

      {notice && <p className="feedback" role="status">{notice}</p>}
      {actionError && <p className="feedback error" role="alert">{actionError}</p>}

      {list.length === 0 ? (
        <EmptyNotice title="No events yet." description="Add an event below to start scheduling." />
      ) : (
        <div className="event-list">
          {list.map((event) => (
            <EventRow
              key={event.id}
              event={event}
              onEdit={handleEdit}
              onTogglePublic={handleTogglePublic}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      <section className="content-block">
        <div className="content-block-head">
          <Plus size={22} />
          <div>
            <h2>Add an event</h2>
            <p>Required fields are marked. Optional fields let you attach a venue, capacity, and longer details.</p>
          </div>
          <Button onClick={() => { setEditingEvent(null); setNotice(null); setActionError(null); setCreateOpen(true); }}>
            New event
          </Button>
        </div>
      </section>

      {editingEvent && (
        <EventForm
          key={editingEvent.id}
          event={editingEvent}
          submitLabel="Save changes"
          onSaved={() => {
            setEditingEvent(null);
            setNotice("Event updated.");
          }}
          open
          onOpenChange={(open) => {
            if (!open) setEditingEvent(null);
          }}
        />
      )}

      {createOpen && !editingEvent && (
        <EventForm
          submitLabel="Create event"
          onSaved={() => {
            setCreateOpen(false);
            setNotice("Event added.");
          }}
          open={createOpen}
          onOpenChange={setCreateOpen}
        />
      )}

      {deleteTarget && (
        <Dialog open={true} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete event</DialogTitle>
              <DialogDescription>
                This will remove{" "}
                <strong>{deleteTarget.title}</strong>
                {deleteTarget.description && ` · ${deleteTarget.description.slice(0, 60)}`}
                . Staff tasks referencing this event will lose their link. This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <Button
                variant="destructive"
                onClick={confirmDelete}
                disabled={!hydrated || pending}
              >
                {pending ? "Deleting…" : "Delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
