import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Check, Edit, Loader2, Plus, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useHydrated } from "@/hooks/use-hydrated";
import { adminApi, ApiError, ApiUnavailableError } from "@/services/api";
import type {
  ApiAdminOpeningHour,
  ApiAdminOpeningHourCreate,
  ApiAdminOpeningHourUpdate,
} from "@/services/types";
import { EmptyNotice } from "./data-state";
import { PageHeading } from "./shared";

const DAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

function errorMessage(caught: unknown, fallback: string): string {
  if (caught instanceof ApiUnavailableError) {
    return "The ARCH service is not reachable right now. Please try again in a moment.";
  }
  if (caught instanceof ApiError) {
    if (caught.status === 401) return "Your session has expired. Please sign in again.";
    if (caught.status === 403) return "You do not have permission to do that.";
    if (caught.status === 404) return "That interval could not be found.";
    if (caught.status === 422) return "Invalid opening hours data.";
    return caught.message;
  }
  return fallback;
}

/** Normalise an API time such as "09:00:00" to the "HH:MM" a time input needs. */
function toHHMM(time: string | null | undefined): string | null {
  if (!time) return null;
  const match = time.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  const hours = (match[1] ?? "").padStart(2, "0");
  const minutes = match[2] ?? "00";
  return `${hours}:${minutes}`;
}

interface OpeningHoursFormProps {
  interval?: ApiAdminOpeningHour;
  submitLabel: string;
  onSaved: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function OpeningHoursForm({
  interval,
  submitLabel,
  onSaved,
  open,
  onOpenChange,
}: OpeningHoursFormProps) {
  const queryClient = useQueryClient();
  const hydrated = useHydrated();

  const [dayOfWeek, setDayOfWeek] = useState(
    interval ? String(interval.day_of_week) : "",
  );
  const [opensAt, setOpensAt] = useState(toHHMM(interval?.opens_at) ?? "");
  const [closesAt, setClosesAt] = useState(toHHMM(interval?.closes_at) ?? "");
  const [note, setNote] = useState(interval?.note ?? "");
  const [isClosed, setIsClosed] = useState(interval?.is_closed ?? false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const dow = dayOfWeek === "" ? NaN : Number(dayOfWeek);
    if (Number.isNaN(dow) || dow < 0 || dow > 6) {
      setError("Choose a day of the week.");
      return;
    }
    if (!isClosed && (!opensAt || !closesAt)) {
      setError("Both start and end times are required for open intervals.");
      return;
    }

    const body = {
      day_of_week: dow,
      opens_at: isClosed ? null : opensAt || null,
      closes_at: isClosed ? null : closesAt || null,
      note: note.trim(),
      is_closed: isClosed,
    } satisfies ApiAdminOpeningHourCreate;

    try {
      setPending(true);
      setError(null);
      setSuccess(null);

      if (!interval) {
        await adminApi.createOpeningHour(body);
      } else {
        const updateBody: ApiAdminOpeningHourUpdate = {};
        if (body.day_of_week !== interval.day_of_week) {
          updateBody.day_of_week = body.day_of_week;
        }
        if (body.opens_at !== toHHMM(interval.opens_at)) {
          updateBody.opens_at = body.opens_at;
        }
        if (body.closes_at !== toHHMM(interval.closes_at)) {
          updateBody.closes_at = body.closes_at;
        }
        if (body.note !== (interval.note ?? "")) updateBody.note = body.note;
        if (body.is_closed !== interval.is_closed) updateBody.is_closed = body.is_closed;

        if (Object.keys(updateBody).length === 0) {
          setError("No changes to save.");
          return;
        }
        await adminApi.updateOpeningHour(interval.id, updateBody);
      }

      queryClient.invalidateQueries({ queryKey: ["admin", "opening-hours"] });
      setSuccess(interval ? "Opening hours updated." : "Opening hour added.");
      onSaved();

      // Reset the form only in create mode.
      if (!interval) {
        setDayOfWeek("");
        setOpensAt("");
        setClosesAt("");
        setNote("");
        setIsClosed(false);
      }
    } catch (caught) {
      setError(
        errorMessage(
          caught,
          interval
            ? "The opening hours could not be saved."
            : "The opening hour could not be created.",
        ),
      );
    } finally {
      setPending(false);
    }
  }

  const submitDisabled = !hydrated || pending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{interval ? "Edit opening hour" : "Add opening hour"}</DialogTitle>
          <DialogDescription>
            {interval
              ? "Only changed fields are sent to the API. An empty note clears the existing text."
              : "Choose a day and an open–close window for the venue."}
          </DialogDescription>
        </DialogHeader>
        <form className="profile-form" onSubmit={submit}>
          <div className="form-row">
            <Label>
              Day <span className="label-hint">required</span>
              <select
                value={dayOfWeek}
                onChange={(event) => setDayOfWeek(event.target.value)}
                disabled={pending}
              >
                <option value="">Select day</option>
                {DAY_NAMES.map((name, index) => (
                  <option key={name} value={String(index)}>
                    {name}
                  </option>
                ))}
              </select>
            </Label>
            <Label>
              Mode <span className="label-hint">required</span>
              <select
                value={isClosed ? "closed" : "open"}
                onChange={(event) => setIsClosed(event.target.value === "closed")}
                disabled={pending}
              >
                <option value="open">Open</option>
                <option value="closed">Closed</option>
              </select>
            </Label>
          </div>

          <div className="form-row">
            <Label>
              Opens
              <Input
                type="time"
                value={opensAt}
                onChange={(event) => setOpensAt(event.target.value)}
                disabled={pending || isClosed}
                placeholder="09:00"
              />
            </Label>
            <Label>
              Closes
              <Input
                type="time"
                value={closesAt}
                onChange={(event) => setClosesAt(event.target.value)}
                disabled={pending || isClosed}
                placeholder="17:00"
              />
            </Label>
          </div>

          {!isClosed && (
            <p className="auth-note">
              Both start and end times are required for open intervals.
            </p>
          )}

          <Label>
            Note <span className="label-hint">optional</span>
            <Textarea
              rows={2}
              maxLength={200}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              disabled={pending}
              placeholder="Extra detail…"
            />
          </Label>

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

interface OpeningHoursRowProps {
  hour: ApiAdminOpeningHour;
  onEdit: (hour: ApiAdminOpeningHour) => void;
  onDelete: (hour: ApiAdminOpeningHour) => void;
}

function OpeningHoursRow({ hour, onEdit, onDelete }: OpeningHoursRowProps) {
  const displayTimes = hour.is_closed
    ? "Closed"
    : `${toHHMM(hour.opens_at)} – ${toHHMM(hour.closes_at)}`;
  const noteDisplay = hour.note && hour.note.length > 0 ? hour.note : "—";

  return (
    <tr className="event-row">
      <td className="event-date">
        <CalendarDays size={16} />
        <span>{DAY_NAMES[hour.day_of_week]}</span>
      </td>
      <td className="event-detail">
        <h3 className="event-title">{displayTimes}</h3>
        {!hour.is_closed && (
          <p className="event-meta">
            Opens {toHHMM(hour.opens_at)} · Closes {toHHMM(hour.closes_at)}
          </p>
        )}
      </td>
      <td className="event-meta">{noteDisplay}</td>
      <td>
        <div className="task-actions">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onEdit(hour)}
            aria-label={`Edit ${DAY_NAMES[hour.day_of_week]} opening hour`}
          >
            <Edit size={14} /> Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onDelete(hour)}
            aria-label={`Delete ${DAY_NAMES[hour.day_of_week]} opening hour`}
          >
            <Trash2 size={14} /> Delete
          </Button>
        </div>
      </td>
    </tr>
  );
}

export function OpeningHoursManagementPage() {
  const queryClient = useQueryClient();
  const hydrated = useHydrated();
  const [editingHour, setEditingHour] = useState<ApiAdminOpeningHour | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ApiAdminOpeningHour | null>(null);
  const [pending, setPending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const hours = useQuery({
    queryKey: ["admin", "opening-hours"],
    queryFn: () => adminApi.openingHours(),
    retry: false,
  });

  async function confirmDelete() {
    if (!deleteTarget) return;
    setPending(true);
    setDeleteError(null);
    try {
      await adminApi.deleteOpeningHour(deleteTarget.id);
      queryClient.invalidateQueries({ queryKey: ["admin", "opening-hours"] });
      setDeleteTarget(null);
      setNotice("Opening hour deleted.");
    } catch (caught) {
      setDeleteError(errorMessage(caught, "The opening hour could not be deleted."));
    } finally {
      setPending(false);
    }
  }

  function handleEdit(hour: ApiAdminOpeningHour) {
    setCreateOpen(false);
    setNotice(null);
    setEditingHour(hour);
  }

  function handleDelete(hour: ApiAdminOpeningHour) {
    setDeleteError(null);
    setDeleteTarget(hour);
  }

  if (hours.isPending) {
    return (
      <div className="loading-block" aria-busy="true">
        <p>Loading opening hours…</p>
      </div>
    );
  }

  if (hours.isError) {
    return (
      <div className="feedback error" role="alert">
        <span>Opening hours could not be loaded.</span>
        <Button variant="outline" size="sm" onClick={() => hours.refetch()}>
          <Check size={14} /> Retry
        </Button>
      </div>
    );
  }

  const list = hours.data ?? [];

  // Group by weekday, preserving the API order within each day.
  const grouped: Array<{ day: number; items: ApiAdminOpeningHour[] }> = [];
  for (let day = 0; day <= 6; day++) {
    grouped.push({ day, items: list.filter((hour) => hour.day_of_week === day) });
  }

  return (
    <>
      <PageHeading
        eyebrow="ARCH OPERATIONS"
        title="Opening hours management."
        description="Day-by-day intervals for the gym's open times."
      />

      {notice && (
        <p className="feedback" role="status">
          {notice}
        </p>
      )}

      {list.length === 0 ? (
        <EmptyNotice
          title="No opening hours set yet."
          description="Choose a day and an open–close window below to define when the venue is open."
        />
      ) : (
        <div className="opening-hours-list">
          {grouped.map((group) => (
            <section className="content-block" key={group.day}>
              <h2>{DAY_NAMES[group.day]}</h2>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Times</th>
                      <th>Details</th>
                      <th>Note</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {group.items.length === 0 ? (
                      <tr>
                        <td className="event-meta" colSpan={4}>
                          No intervals stored for this day.
                        </td>
                      </tr>
                    ) : (
                      group.items.map((hour) => (
                        <OpeningHoursRow
                          key={hour.id}
                          hour={hour}
                          onEdit={handleEdit}
                          onDelete={handleDelete}
                        />
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}

      <section className="content-block">
        <div className="content-block-head">
          <Plus size={22} />
          <div>
            <h2>Add an opening hour</h2>
            <p>Define one interval for a specific day.</p>
          </div>
          <Button
            onClick={() => {
              setEditingHour(null);
              setNotice(null);
              setCreateOpen(true);
            }}
            aria-label="New opening hour"
          >
            New opening hour
          </Button>
        </div>
      </section>

      {editingHour && (
        <OpeningHoursForm
          key={editingHour.id}
          interval={editingHour}
          submitLabel="Save changes"
          onSaved={() => {
            setEditingHour(null);
            setNotice("Opening hours updated.");
          }}
          open
          onOpenChange={(open) => {
            if (!open) setEditingHour(null);
          }}
        />
      )}

      {createOpen && !editingHour && (
        <OpeningHoursForm
          submitLabel="Create opening hour"
          onSaved={() => {
            setCreateOpen(false);
            setNotice("Opening hour added.");
          }}
          open={createOpen}
          onOpenChange={setCreateOpen}
        />
      )}

      {deleteTarget && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setDeleteTarget(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete opening hour</DialogTitle>
              <DialogDescription>
                This will remove the interval for{" "}
                <strong>{DAY_NAMES[deleteTarget.day_of_week]}</strong> at{" "}
                {deleteTarget.is_closed
                  ? "closed"
                  : `${toHHMM(deleteTarget.opens_at)} – ${toHHMM(deleteTarget.closes_at)}`}
                . This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            {deleteError && (
              <p className="feedback error" role="alert">
                {deleteError}
              </p>
            )}
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
