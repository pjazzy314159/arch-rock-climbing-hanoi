import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Edit,
  Loader2,
  Plus,
  Trash2,
  X,
} from "lucide-react";

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
  ApiAdminService,
  ApiAdminServiceCreate,
  ApiAdminServiceUpdate,
} from "@/services/types";
import { EmptyNotice } from "./data-state";
import { PageHeading } from "./shared";

function errorMessage(caught: unknown, fallback: string): string {
  if (caught instanceof ApiUnavailableError) {
    return "The ARCH service is not reachable right now. Please try again in a moment.";
  }
  if (caught instanceof ApiError) {
    if (caught.status === 401) return "Your session has expired. Please sign in again.";
    if (caught.status === 403) return "You do not have permission to do that.";
    if (caught.status === 404) return "Service not found.";
    if (caught.status === 422) return "Invalid service data.";
    return caught.message;
  }
  return fallback;
}

interface ServiceFormProps {
  service?: ApiAdminService;
  submitLabel: string;
  onSaved: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function ServiceForm({ service, submitLabel, onSaved, open, onOpenChange }: ServiceFormProps) {
  const queryClient = useQueryClient();
  const hydrated = useHydrated();

  const [title, setTitle] = useState(service?.title ?? "");
  const [summary, setSummary] = useState(service?.summary ?? "");
  const [icon, setIcon] = useState(service?.icon ?? "mountain");
  const [sortOrder, setSortOrder] = useState(String(service?.sort_order ?? 0));
  const [isActive, setIsActive] = useState(service?.is_active ?? true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Title is required.");
      return;
    }

    setPending(true);
    setError(null);
    setSuccess(null);

    try {
      if (!service) {
        const body: ApiAdminServiceCreate = {
          title: trimmedTitle,
          summary: summary.trim(),
          icon: icon.trim() || "mountain",
          sort_order: Number(sortOrder) || 0,
          is_active: isActive,
        };
        await adminApi.createService(body);
        setSuccess("Service created.");
      } else {
        const body: ApiAdminServiceUpdate = {};
        if (trimmedTitle !== service.title) body.title = trimmedTitle;
        if (summary.trim() !== service.summary) body.summary = summary.trim();
        if (icon.trim() !== service.icon) body.icon = icon.trim() || "mountain";
        if (Number(sortOrder) !== service.sort_order) body.sort_order = Number(sortOrder) || 0;
        if (isActive !== service.is_active) body.is_active = isActive;

        if (Object.keys(body).length === 0) {
          setError("No changes to save.");
          return;
        }
        await adminApi.updateService(service.id, body);
        setSuccess("Service updated.");
      }

      await queryClient.invalidateQueries({ queryKey: ["admin", "services"] });
      onSaved();
      if (!service) {
        setTitle("");
        setSummary("");
        setIcon("mountain");
        setSortOrder("0");
        setIsActive(true);
      }
    } catch (caught) {
      setError(errorMessage(caught, service ? "The service could not be saved." : "The service could not be created."));
    } finally {
      setPending(false);
    }
  }

  const submitDisabled = !hydrated || pending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{service ? "Edit service" : "Add service"}</DialogTitle>
          <DialogDescription>
            {service
              ? "Only changed fields are sent to the API."
              : "Fill in the required fields. Optional fields can be left blank."}
          </DialogDescription>
        </DialogHeader>
        <form className="profile-form" onSubmit={submit}>
          <Label>
            Title <span className="label-hint">required</span>
            <Input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              disabled={pending}
              placeholder="Service title"
            />
          </Label>

          <Label>
            Summary <span className="label-hint">optional</span>
            <Textarea
              rows={2}
              maxLength={4000}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              disabled={pending}
              placeholder="Brief description"
            />
          </Label>

          <div className="form-row">
            <Label>
              Icon
              <Input
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                maxLength={40}
                disabled={pending}
                placeholder="mountain"
              />
            </Label>
            <Label>
              Sort order
              <Input
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                min={0}
                max={999}
                disabled={pending}
              />
            </Label>
          </div>

          <Label>
            Active <span className="label-hint">optional</span>
            <select
              value={isActive ? "true" : "false"}
              onChange={(e) => setIsActive(e.target.value === "true")}
              disabled={pending}
            >
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
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

export function ServicesManagementPage() {
  const queryClient = useQueryClient();
  const hydrated = useHydrated();
  const [editingService, setEditingService] = useState<ApiAdminService | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ApiAdminService | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const services = useQuery({
    queryKey: ["admin", "services"],
    queryFn: () => adminApi.services(),
    retry: false,
  });

  async function confirmDelete() {
    if (!deleteTarget) return;
    setPending(true);
    setDeleteError(null);
    try {
      await adminApi.deleteService(deleteTarget.id);
      queryClient.invalidateQueries({ queryKey: ["admin", "services"] });
      setDeleteTarget(null);
      setNotice(`Service "${deleteTarget.title}" deleted.`);
    } catch (caught) {
      setDeleteError(errorMessage(caught, "The service could not be deleted."));
    } finally {
      setPending(false);
    }
  }

  function handleEdit(service: ApiAdminService) {
    setEditingService(service);
    setNotice(null);
  }

  function handleDelete(service: ApiAdminService) {
    setDeleteError(null);
    setDeleteTarget(service);
  }

  if (services.isPending) {
    return (
      <div className="loading-block" aria-busy="true">
        <p>Loading services…</p>
      </div>
    );
  }

  if (services.isError) {
    return (
      <div className="feedback error" role="alert">
        <span>Services could not be loaded.</span>
        <Button variant="outline" size="sm" onClick={() => services.refetch()}>
          <Check size={14} /> Retry
        </Button>
      </div>
    );
  }

  const list = services.data ?? [];

  return (
    <>
      <PageHeading
        eyebrow="ARCH OPERATIONS"
        title="Services management."
        description="The services offered by the gym — coaching, zones, and specialist facilities."
      />

      {notice && <p className="feedback" role="status">{notice}</p>}

      {list.length === 0 ? (
        <EmptyNotice
          title="No services set yet."
          description="Use the form below to define the services available at ARCH."
        />
      ) : (
        <div className="opening-hours-list">
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Summary</th>
                <th>Icon</th>
                <th>Order</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((service) => (
                <tr className="event-row" key={service.id}>
                  <td className="event-detail">
                    <h3 className="event-title">{service.title}</h3>
                  </td>
                  <td className="event-meta">{service.summary || "—"}</td>
                  <td className="event-meta">{service.icon || "—"}</td>
                  <td className="event-meta">{service.sort_order}</td>
                  <td>
                    <span className={service.is_active ? "status-sent" : "status-project"}>
                      {service.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td>
                    <div className="task-actions">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(service)}
                        aria-label={`Edit ${service.title}`}
                      >
                        <Edit size={14} /> Edit
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(service)}
                        aria-label={`Delete ${service.title}`}
                      >
                        <Trash2 size={14} /> Delete
                      </Button>
                    </div>
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
            <h2>Add a service</h2>
            <p>Define coaching zones, specialist facilities, or other gym services.</p>
          </div>
          <Button onClick={() => { setEditingService(null); setNotice(null); setCreateOpen(true); }}>
            New service
          </Button>
        </div>
      </section>

      {deleteTarget && (
        <Dialog open={true} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete service</DialogTitle>
              <DialogDescription>
                Remove <strong>{deleteTarget.title}</strong>? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            {deleteError && <p className="feedback error" role="alert">{deleteError}</p>}
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

      {editingService && (
        <ServiceForm
          key={editingService.id}
          service={editingService}
          submitLabel="Save changes"
          onSaved={() => {
            setEditingService(null);
            setNotice("Service updated.");
          }}
          open={true}
          onOpenChange={(open) => {
            if (!open) setEditingService(null);
          }}
        />
      )}

      {createOpen && !editingService && (
        <ServiceForm
          submitLabel="Create service"
          onSaved={() => {
            setCreateOpen(false);
            setNotice("Service added.");
          }}
          open={createOpen}
          onOpenChange={setCreateOpen}
        />
      )}
    </>
  );
}
