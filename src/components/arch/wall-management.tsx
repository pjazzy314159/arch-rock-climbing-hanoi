import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, PenLine, Plus, Trash2, X } from "lucide-react";

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
import type { ApiWall } from "@/services/types";
import { EmptyNotice } from "./data-state";
import { ImageUploadField } from "./image-upload-field";

function errorMessage(caught: unknown, fallback: string): string {
  if (caught instanceof ApiError || caught instanceof ApiUnavailableError) {
    return caught.message;
  }
  return caught instanceof Error && caught.message ? caught.message : fallback;
}

interface WallDialogProps {
  wall: ApiWall | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

function WallDialog({ wall, open, onOpenChange, onSaved }: WallDialogProps) {
  const queryClient = useQueryClient();
  const hydrated = useHydrated();

  const [name, setName] = useState(wall?.name ?? "");
  const [description, setDescription] = useState(wall?.description ?? "");
  const [imageUrl, setImageUrl] = useState(wall?.image_url ?? "");
  const [sortOrder, setSortOrder] = useState(wall?.sort_order ?? 0);
  const [isActive, setIsActive] = useState(wall?.is_active ?? true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const nextName = name.trim();
    if (!nextName) {
      setError("Wall name is required.");
      return;
    }

    setPending(true);
    setError(null);
    setSuccess(null);
    try {
      if (!wall) {
        await adminApi.createWall({
          name: nextName,
          description: description.trim(),
          image_url: imageUrl.trim() || null,
          sort_order: sortOrder,
          is_active: isActive,
        });
        setSuccess("Wall created.");
      } else {
        const body: Record<string, unknown> = {};
        if (nextName !== wall.name) body["name"] = nextName;
        if (description.trim() !== wall.description) body["description"] = description.trim();
        if (imageUrl.trim() !== (wall.image_url ?? "")) body["image_url"] = imageUrl.trim();
        if (sortOrder !== wall.sort_order) body["sort_order"] = sortOrder;
        if (isActive !== wall.is_active) body["is_active"] = isActive;
        if (Object.keys(body).length === 0) {
          setError("No changes to save.");
          return;
        }
        await adminApi.updateWall(wall.id, body);
        setSuccess("Wall updated.");
      }

      await queryClient.invalidateQueries({ queryKey: ["admin", "walls"] });
      await queryClient.invalidateQueries({ queryKey: ["arch", "walls"] });
      onSaved();
    } catch (caught) {
      setError(errorMessage(caught, "The wall could not be saved."));
    } finally {
      setPending(false);
    }
  }

  const submitDisabled = !hydrated || pending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{wall ? "Edit wall" : "Create wall"}</DialogTitle>
          <DialogDescription>
            The wall photograph is used by the route directory. Uploading a new picture replaces
            the existing URL only after the upload succeeds.
          </DialogDescription>
        </DialogHeader>
        <form className="profile-form" onSubmit={submit}>
          <Label>
            Name <span className="label-hint">required</span>
            <Input
              required
              value={name}
              maxLength={140}
              onChange={(event) => setName(event.target.value)}
              disabled={pending}
              placeholder="The Slab"
            />
          </Label>

          <Label>
            Description <span className="label-hint">optional</span>
            <Textarea
              rows={3}
              maxLength={4000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              disabled={pending}
              placeholder="Angle, texture and what the wall is used for…"
            />
          </Label>

          <div className="form-row">
            <Label>
              Sort order
              <Input
                type="number"
                min={0}
                value={sortOrder}
                onChange={(event) => setSortOrder(Number(event.target.value) || 0)}
                disabled={pending}
              />
            </Label>
            <Label>
              Status
              <select
                value={isActive ? "active" : "inactive"}
                onChange={(event) => setIsActive(event.target.value === "active")}
                disabled={pending}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </Label>
          </div>

          <ImageUploadField
            value={imageUrl}
            onChange={setImageUrl}
            label="Wall image"
            placeholder="https://example.com/wall.jpg"
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
          {success && (
            <p className="feedback" role="status">
              {success}
            </p>
          )}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={pending}>
                <X /> Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={submitDisabled}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : wall ? "Save changes" : "Create wall"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function WallManagementPage() {
  const queryClient = useQueryClient();
  const hydrated = useHydrated();
  const walls = useQuery({ queryKey: ["admin", "walls"], queryFn: () => adminApi.walls() });
  const [editing, setEditing] = useState<ApiWall | "new" | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["admin", "walls"] });
    await queryClient.invalidateQueries({ queryKey: ["arch", "walls"] });
  }

  async function toggleActive(wall: ApiWall) {
    setPending(true);
    setError(null);
    try {
      await adminApi.updateWall(wall.id, { is_active: !wall.is_active });
      await refresh();
    } catch (caught) {
      setError(errorMessage(caught, "The wall could not be updated."));
    } finally {
      setPending(false);
    }
  }

  async function deleteWall(wall: ApiWall) {
    if (!window.confirm(`Delete “${wall.name}”? Routes on this wall are kept.`)) return;
    setPending(true);
    setError(null);
    try {
      await adminApi.deleteWall(wall.id);
      setSuccess("Wall deleted.");
      await refresh();
    } catch (caught) {
      setError(errorMessage(caught, "The wall could not be deleted."));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <section className="content-block">
        <div className="content-block-head">
          <Plus size={22} />
          <div>
            <h2>Walls</h2>
            <p>Wall names and photographs appear in the public route directory.</p>
          </div>
        </div>
        <Button
          type="button"
          disabled={!hydrated || pending}
          onClick={() => {
            setError(null);
            setSuccess(null);
            setEditing("new");
          }}
        >
          <Plus size={14} /> Add wall
        </Button>
      </section>

      {walls.isPending ? (
        <div className="loading-block">
          <p>Loading walls…</p>
        </div>
      ) : walls.isError ? (
        <p className="data-banner" role="alert">
          <span>The walls could not be loaded.</span>
        </p>
      ) : walls.data.length === 0 ? (
        <EmptyNotice
          title="No walls yet."
          description="Add the first wall to give routes a home."
        />
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Wall</th>
                <th>Description</th>
                <th>Order</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {walls.data.map((wall) => (
                <tr key={wall.id}>
                  <td>
                    <strong>{wall.name}</strong>
                    <small>{wall.image_url ? "Photograph attached" : "No photograph"}</small>
                  </td>
                  <td>{wall.description || "—"}</td>
                  <td>{wall.sort_order}</td>
                  <td>
                    <span className={wall.is_active ? "status-sent" : "status-project"}>
                      {wall.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td>
                    <div className="row-actions">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={!hydrated || pending}
                        onClick={() => setEditing(wall)}
                      >
                        <PenLine size={14} /> Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!hydrated || pending}
                        onClick={() => toggleActive(wall)}
                      >
                        {wall.is_active ? "Deactivate" : "Activate"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={!hydrated || pending}
                        onClick={() => deleteWall(wall)}
                        aria-label={`Delete ${wall.name}`}
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

      {editing && (
        <WallDialog
          key={editing === "new" ? "new" : editing.id}
          wall={editing === "new" ? undefined : editing}
          open
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          onSaved={() => {
            setSuccess(editing === "new" ? "Wall created." : "Wall updated.");
            setEditing(null);
          }}
        />
      )}
    </>
  );
}
