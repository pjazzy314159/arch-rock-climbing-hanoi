import { useState, type FormEvent, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, PenLine, Plus, RotateCcw, Trash2, X } from "lucide-react";

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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useHydrated } from "@/hooks/use-hydrated";
import { adminApi, ApiError, ApiUnavailableError } from "@/services/api";
import type { ApiAdminPrice, ApiAdminPriceCreate, ApiAdminPriceUpdate } from "@/services/types";
import { EmptyNotice } from "./data-state";
import { PageHeading, TextLink } from "./shared";

/* -------------------------------------------------------------------------- */
/* Shared helpers                                                             */
/* -------------------------------------------------------------------------- */

function errorMessage(caught: unknown, fallback: string): string {
  if (caught instanceof ApiUnavailableError) {
    return "The ARCH service is not reachable right now. Please try again in a moment.";
  }
  if (caught instanceof ApiError) {
    if (caught.status === 401) return "Your session has expired. Please sign in again.";
    if (caught.status === 403) return "You do not have permission to do that.";
    if (caught.status === 422) return "Invalid price data.";
    return caught.message;
  }
  return fallback;
}

const UNIT_OPTIONS = ["per visit", "per month", "per session", "per item", "per hour", "per day"] as const;
const CATEGORY_OPTIONS = ["Entry", "Membership", "Rental", "Course", "Event", "Shop", "Other"] as const;

/* -------------------------------------------------------------------------- */
/* Price form (shared for create and edit)                                    */
/* -------------------------------------------------------------------------- */

interface PriceFormProps {
  price?: ApiAdminPrice;
  submitLabel: string;
  onSaved: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function PriceForm({ price, submitLabel, onSaved, open, onOpenChange }: PriceFormProps) {
  const queryClient = useQueryClient();
  const hydrated = useHydrated();

  const [category, setCategory] = useState(price?.category ?? "Entry");
  const [name, setName] = useState(price?.name ?? "");
  const [description, setDescription] = useState(price?.description ?? "");
  const [amountVnd, setAmountVnd] = useState(price?.amount_vnd ?? 0);
  const [unit, setUnit] = useState(price?.unit ?? "per visit");
  const [sortOrder, setSortOrder] = useState(price?.sort_order ?? 0);
  const [isActive, setIsActive] = useState(price?.is_active ?? true);

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const submitDisabled = !hydrated || pending;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Name is required.");
      return;
    }
    if (amountVnd < 0) {
      setError("Amount must be a non-negative number.");
      return;
    }
    if (sortOrder < 0) {
      setError("Sort order must be a non-negative number.");
      return;
    }

    setPending(true);
    setError(null);
    setSuccess(null);

    try {
      if (!price) {
        await adminApi.createPrice({
          category,
          name: trimmedName,
          description: description.trim(),
          amount_vnd: amountVnd,
          unit,
          sort_order: sortOrder,
          is_active: isActive,
        });
        setCategory("Entry");
        setName("");
        setDescription("");
        setAmountVnd(0);
        setUnit("per visit");
        setSortOrder(0);
        setIsActive(true);
        setSuccess("Price entry created.");
      } else {
        const body: ApiAdminPriceUpdate = {};
        if (category !== price.category) body.category = category;
        if (trimmedName !== price.name) body.name = trimmedName;
        if (description.trim() !== price.description) body.description = description.trim();
        if (amountVnd !== price.amount_vnd) body.amount_vnd = amountVnd;
        if (unit !== price.unit) body.unit = unit;
        if (sortOrder !== price.sort_order) body.sort_order = sortOrder;
        if (isActive !== price.is_active) body.is_active = isActive;

        if (Object.keys(body).length === 0) {
          setError("No changes to save.");
          return;
        }

        await adminApi.updatePrice(price.id, body);
        onSaved();
        setSuccess("Price entry updated.");
      }

      await queryClient.invalidateQueries({ queryKey: ["admin", "prices"] });
    } catch (caught) {
      setError(errorMessage(caught, "The price entry could not be saved."));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{price ? "Edit price" : "Create price entry"}</DialogTitle>
          <DialogDescription>
            {price
              ? "Only changed fields are sent to the API."
              : "Fill in the required fields. All other fields are optional."}
          </DialogDescription>
        </DialogHeader>
        <form className="profile-form" onSubmit={submit}>
          <div className="form-row">
            <Label>
              Category
              <Select value={category} onValueChange={setCategory} disabled={pending}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Label>
            <Label>
              Name <span className="label-hint">required</span>
              <Input
                required
                value={name}
                minLength={1}
                maxLength={120}
                onChange={(event) => setName(event.target.value)}
                disabled={pending}
                placeholder="Day Pass"
              />
            </Label>
          </div>

          <Label>
            Description <span className="label-hint">optional</span>
            <Textarea
              rows={2}
              maxLength={4000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              disabled={pending}
              placeholder="Details about what this price covers…"
            />
          </Label>

          <div className="form-row">
            <Label>
              Amount (VND) <span className="label-hint">required</span>
              <Input
                type="number"
                required
                value={amountVnd}
                min={0}
                onChange={(event) => setAmountVnd(Number(event.target.value) || 0)}
                disabled={pending}
                placeholder="150000"
              />
            </Label>
            <Label>
              Unit
              <Select value={unit} onValueChange={setUnit} disabled={pending}>
                <SelectTrigger>
                  <SelectValue placeholder="Select unit" />
                </SelectTrigger>
                <SelectContent>
                  {UNIT_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Label>
          </div>

          <div className="form-row">
            <Label>
              Sort Order
              <Input
                type="number"
                value={sortOrder}
                min={0}
                onChange={(event) => setSortOrder(Number(event.target.value) || 0)}
                disabled={pending}
                placeholder="0"
              />
            </Label>
            <Label>
              Status
              <Select value={isActive ? "active" : "inactive"} onValueChange={(v) => setIsActive(v === "active")} disabled={pending}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </Label>
          </div>

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

/* -------------------------------------------------------------------------- */
/* Price list table                                                           */
/* -------------------------------------------------------------------------- */

function PriceTable({ prices, onEdit, onToggleActive }: {
  prices: ApiAdminPrice[];
  onEdit: (price: ApiAdminPrice) => void;
  onToggleActive: (price: ApiAdminPrice) => void;
}) {
  if (prices.length === 0) {
    return (
      <EmptyNotice
        title="No price entries yet."
        description="Create the first price entry below to start building the price list."
      />
    );
  }

  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Category</th>
            <th>Name</th>
            <th>Amount (VND)</th>
            <th>Unit</th>
            <th>Sort</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {prices.map((price) => (
            <tr key={price.id}>
              <td>{price.category}</td>
              <td>
                <strong>{price.name}</strong>
              </td>
              <td>{price.amount_vnd.toLocaleString()}</td>
              <td>{price.unit}</td>
              <td>{price.sort_order}</td>
              <td>
                <span className={price.is_active ? "status-sent" : "status-project"}>
                  {price.is_active ? "Active" : "Inactive"}
                </span>
              </td>
              <td>
                <div className="task-actions">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onEdit(price)}
                    aria-label={`Edit ${price.name}`}
                  >
                    <PenLine size={14} /> Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onToggleActive(price)}
                    aria-label={price.is_active ? `Deactivate ${price.name}` : `Activate ${price.name}`}
                  >
                    <RotateCcw size={14} />
                    {price.is_active ? "Deactivate" : "Activate"}
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Price Management Page                                                      */
/* -------------------------------------------------------------------------- */

export function PriceManagementPage() {
  const queryClient = useQueryClient();
  const [editingPrice, setEditingPrice] = useState<ApiAdminPrice | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);

  const prices = useQuery({
    queryKey: ["admin", "prices"],
    queryFn: () => adminApi.prices(),
    retry: false,
  });

  async function handleToggleActive(price: ApiAdminPrice) {
    setToggleError(null);
    try {
      await adminApi.updatePrice(price.id, { is_active: !price.is_active });
      await queryClient.invalidateQueries({ queryKey: ["admin", "prices"] });
    } catch (caught) {
      setToggleError(errorMessage(caught, "The price status could not be changed."));
    }
  }

  if (prices.isPending) {
    return (
      <div className="loading-block" aria-busy="true">
        <p>Loading price entries…</p>
      </div>
    );
  }

  if (prices.isError) {
    return (
      <div className="feedback error" role="alert">
        <span>Price entries could not be loaded.</span>
        <Button variant="outline" size="sm" onClick={() => prices.refetch()}>
          <Loader2 size={14} className="animate-spin" /> Retry
        </Button>
      </div>
    );
  }

  const list = prices.data ?? [];

  return (
    <>
      <PriceTable
        prices={list}
        onEdit={setEditingPrice}
        onToggleActive={handleToggleActive}
      />

      <section className="content-block">
        <div className="content-block-head">
          <Plus size={22} />
          <div>
            <h2>Create a new price entry</h2>
            <p>Price entries appear on the public price list when active.</p>
          </div>
          <Button onClick={() => setCreateOpen(true)}>New price</Button>
        </div>
      </section>

      {toggleError && (
        <p className="feedback error" role="alert">
          {toggleError}
        </p>
      )}

      <PriceForm
        submitLabel="Create price entry"
        onSaved={() => {}}
        open={createOpen}
        onOpenChange={setCreateOpen}
      />

      {editingPrice && (
        <PriceForm
          key={editingPrice.id}
          price={editingPrice}
          submitLabel="Save changes"
          onSaved={() => setEditingPrice(null)}
          open={true}
          onOpenChange={(open) => {
            if (!open) setEditingPrice(null);
          }}
        />
      )}
    </>
  );
}

export { PriceForm, PriceTable };