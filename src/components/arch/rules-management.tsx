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
  ApiRule,
  ApiRuleCreate,
  ApiRuleUpdate,
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
    if (caught.status === 404) return "Rule not found.";
    if (caught.status === 422) return "Invalid rule data.";
    return caught.message;
  }
  return fallback;
}

interface RuleFormProps {
  rule?: ApiRule;
  submitLabel: string;
  onSaved: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function RuleForm({ rule, submitLabel, onSaved, open, onOpenChange }: RuleFormProps) {
  const queryClient = useQueryClient();
  const hydrated = useHydrated();

  const [title, setTitle] = useState(rule?.title ?? "");
  const [body, setBody] = useState(rule?.body ?? "");
  const [category, setCategory] = useState(rule?.category ?? "General");
  const [sortOrder, setSortOrder] = useState(String(rule?.sort_order ?? 0));
  const [isActive, setIsActive] = useState(rule?.is_active ?? true);
  const [isConfirmed, setIsConfirmed] = useState(rule?.is_confirmed ?? false);
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
      if (!rule) {
        const createBody: ApiRuleCreate = {
          title: trimmedTitle,
          body: body.trim(),
          category: category.trim() || "General",
          sort_order: Number(sortOrder) || 0,
          is_active: isActive,
          is_confirmed: isConfirmed,
        };
        await adminApi.createRule(createBody);
        setSuccess("Rule added.");
      } else {
        const updateBody: ApiRuleUpdate = {};
        if (trimmedTitle !== rule.title) updateBody.title = trimmedTitle;
        if (body.trim() !== rule.body) updateBody.body = body.trim();
        if (category.trim() !== rule.category) updateBody.category = category.trim() || "General";
        if (Number(sortOrder) !== rule.sort_order) updateBody.sort_order = Number(sortOrder) || 0;
        if (isActive !== rule.is_active) updateBody.is_active = isActive;
        if (isConfirmed !== rule.is_confirmed) updateBody.is_confirmed = isConfirmed;

        if (Object.keys(updateBody).length === 0) {
          setError("No changes to save.");
          return;
        }
        await adminApi.updateRule(rule.id, updateBody);
        setSuccess("Rule updated.");
      }

      await queryClient.invalidateQueries({ queryKey: ["admin", "rules"] });
      onSaved();
      if (!rule) {
        setTitle("");
        setBody("");
        setCategory("General");
        setSortOrder("0");
        setIsActive(true);
        setIsConfirmed(false);
      }
    } catch (caught) {
      setError(errorMessage(caught, rule ? "The rule could not be saved." : "The rule could not be created."));
    } finally {
      setPending(false);
    }
  }

  const submitDisabled = !hydrated || pending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{rule ? "Edit rule" : "Add rule"}</DialogTitle>
          <DialogDescription>
            {rule ? "Only changed fields are sent." : "Define a new gym rule."}
          </DialogDescription>
        </DialogHeader>
        <form className="profile-form" onSubmit={submit}>
          <Label>
            Title <span className="label-hint">required</span>
            <Input
              required
              maxLength={160}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={pending}
              placeholder="Rule title"
            />
          </Label>

          <Label>
            Body <span className="label-hint">required</span>
            <Textarea
              rows={3}
              maxLength={4000}
              required
              value={body}
              onChange={(e) => setBody(e.target.value)}
              disabled={pending}
              placeholder="Rule text"
            />
          </Label>

          <div className="form-row">
            <Label>
              Category <span className="label-hint">optional</span>
              <Input
                maxLength={80}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                disabled={pending}
                placeholder="General"
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

          <div className="form-row">
            <Label>
              Active
              <select
                value={isActive ? "true" : "false"}
                onChange={(e) => setIsActive(e.target.value === "true")}
                disabled={pending}
              >
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </Label>
            <Label>
              Confirmed
              <select
                value={isConfirmed ? "true" : "false"}
                onChange={(e) => setIsConfirmed(e.target.value === "true")}
                disabled={pending}
              >
                <option value="false">Not confirmed</option>
                <option value="true">Confirmed</option>
              </select>
            </Label>
          </div>

          {error && <p className="feedback error" role="alert">{error}</p>}
          {success && <p className="feedback" role="status">{success}</p>}

          <div className="form-row">
            <DialogClose asChild>
              <Button type="button" variant="outline"><X /> Cancel</Button>
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

export function RulesManagementPage() {
  const queryClient = useQueryClient();
  const hydrated = useHydrated();
  const [editingRule, setEditingRule] = useState<ApiRule | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ApiRule | null>(null);
  const [pending, setPending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const rules = useQuery({
    queryKey: ["admin", "rules"],
    queryFn: () => adminApi.rules(),
    retry: false,
  });

  async function confirmDelete() {
    if (!deleteTarget) return;
    setPending(true);
    setDeleteError(null);
    try {
      await adminApi.deleteRule(deleteTarget.id);
      queryClient.invalidateQueries({ queryKey: ["admin", "rules"] });
      setDeleteTarget(null);
      setNotice(`Rule deleted.`);
    } catch (caught) {
      setDeleteError(errorMessage(caught, "The rule could not be deleted."));
    } finally {
      setPending(false);
    }
  }

  function handleEdit(rule: ApiRule) {
    setEditingRule(rule);
    setNotice(null);
  }

  function handleDelete(rule: ApiRule) {
    setDeleteError(null);
    setDeleteTarget(rule);
  }

  if (rules.isPending) {
    return <div className="loading-block" aria-busy="true"><p>Loading rules…</p></div>;
  }

  if (rules.isError) {
    return (
      <div className="feedback error" role="alert">
        <span>Rules could not be loaded.</span>
        <Button variant="outline" size="sm" onClick={() => rules.refetch()}><Check size={14} /> Retry</Button>
      </div>
    );
  }

  const list = rules.data ?? [];

  return (
    <>
      <PageHeading eyebrow="ARCH OPERATIONS" title="Rules management." description="Gym rules shown to members. Active and confirmed rules appear on the public site." />
      {notice && <p className="feedback" role="status">{notice}</p>}
      {list.length === 0 ? (
        <EmptyNotice title="No rules set yet." description="Use the form below to define the first rule." />
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr><th>Title</th><th>Category</th><th>Active</th><th>Confirmed</th><th /></tr>
            </thead>
            <tbody>
              {list.map((rule) => (
                <tr className="event-row" key={rule.id}>
                  <td className="event-detail"><strong>{rule.title}</strong></td>
                  <td className="event-meta">{rule.category || "—"}</td>
                  <td><span className={rule.is_active ? "status-sent" : "status-project"}>{rule.is_active ? "Yes" : "No"}</span></td>
                  <td><span className={rule.is_confirmed ? "status-sent" : "status-project"}>{rule.is_confirmed ? "Yes" : "No"}</span></td>
                  <td>
                    <div className="task-actions">
                      <Button variant="outline" size="sm" onClick={() => handleEdit(rule)} aria-label={`Edit ${rule.title}`}><Edit size={14} /> Edit</Button>
                      <Button variant="destructive" size="sm" onClick={() => handleDelete(rule)} aria-label={`Delete ${rule.title}`}><Trash2 size={14} /> Delete</Button>
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
          <div><h2>Add a rule</h2><p>Active and confirmed rules are shown publicly.</p></div>
          <Button onClick={() => { setEditingRule(null); setCreateOpen(true); }}>New rule</Button>
        </div>
      </section>
      {editingRule && (
        <RuleForm key={editingRule.id} rule={editingRule} submitLabel="Save changes" onSaved={() => { setEditingRule(null); setNotice("Rule updated."); }} open onOpenChange={(o) => { if (!o) setEditingRule(null); }} />
      )}
      {createOpen && !editingRule && (
        <RuleForm submitLabel="Create rule" onSaved={() => { setCreateOpen(false); setNotice("Rule added."); }} open={createOpen} onOpenChange={setCreateOpen} />
      )}
      {deleteTarget && (
        <Dialog open={true} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
          <DialogContent>
            <DialogHeader><DialogTitle>Delete rule</DialogTitle>
              <DialogDescription>Remove <strong>{deleteTarget.title}</strong>? This cannot be undone.</DialogDescription></DialogHeader>
            <DialogFooter>
              <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
              <Button variant="destructive" onClick={confirmDelete} disabled={pending}>{pending ? "Deleting…" : "Delete"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
