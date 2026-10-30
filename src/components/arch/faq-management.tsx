import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Edit, Loader2, Plus, Trash2, X } from "lucide-react";

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
  ApiFaqEntry,
  ApiFaqCreate,
  ApiFaqUpdate,
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
    if (caught.status === 404) return "FAQ entry not found.";
    if (caught.status === 422) return "Invalid FAQ data.";
    return caught.message;
  }
  return fallback;
}

interface FaqFormProps {
  faq?: ApiFaqEntry;
  submitLabel: string;
  onSaved: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function FaqForm({ faq, submitLabel, onSaved, open, onOpenChange }: FaqFormProps) {
  const queryClient = useQueryClient();
  const hydrated = useHydrated();

  const [question, setQuestion] = useState(faq?.question ?? "");
  const [answer, setAnswer] = useState(faq?.answer ?? "");
  const [category, setCategory] = useState(faq?.category ?? "General");
  const [keywords, setKeywords] = useState(faq?.keywords ?? "");
  const [isPublished, setIsPublished] = useState(faq?.is_published ?? true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const trimmedQuestion = question.trim();
    if (!trimmedQuestion) {
      setError("Question is required.");
      return;
    }
    const trimmedAnswer = answer.trim();
    if (!trimmedAnswer) {
      setError("Answer is required.");
      return;
    }

    setPending(true);
    setError(null);
    setSuccess(null);

    try {
      if (!faq) {
        const body: ApiFaqCreate = {
          question: trimmedQuestion,
          answer: trimmedAnswer,
          category: category.trim() || "General",
          keywords: keywords.trim(),
          is_published: isPublished,
        };
        await adminApi.createFaq(body);
        setSuccess("FAQ entry added.");
      } else {
        const body: ApiFaqUpdate = {};
        if (trimmedQuestion !== faq.question) body.question = trimmedQuestion;
        if (trimmedAnswer !== faq.answer) body.answer = trimmedAnswer;
        if (category.trim() !== faq.category) body.category = category.trim() || "General";
        if (keywords.trim() !== faq.keywords) body.keywords = keywords.trim();
        if (isPublished !== faq.is_published) body.is_published = isPublished;
        if (Object.keys(body).length === 0) {
          setError("No changes to save.");
          return;
        }
        await adminApi.updateFaq(faq.id, body);
        setSuccess("FAQ entry updated.");
      }
      await queryClient.invalidateQueries({ queryKey: ["admin", "faq"] });
      onSaved();
      if (!faq) {
        setQuestion("");
        setAnswer("");
        setCategory("General");
        setKeywords("");
        setIsPublished(false);
      }
    } catch (caught) {
      setError(errorMessage(caught, faq ? "The FAQ entry could not be saved." : "The FAQ entry could not be created."));
    } finally {
      setPending(false);
    }
  }

  const submitDisabled = !hydrated || pending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{faq ? "Edit FAQ entry" : "Add FAQ entry"}</DialogTitle>
          <DialogDescription>
            {faq ? "Only changed fields are sent." : "Provide the question and answer for the public site."}
          </DialogDescription>
        </DialogHeader>
        <form className="profile-form" onSubmit={submit}>
          <Label>
            Question <span className="label-hint">required</span>
            <Input
              required
              maxLength={200}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              disabled={pending}
              placeholder="Frequently asked question"
            />
          </Label>

          <Label>
            Answer <span className="label-hint">required</span>
            <Textarea
              rows={4}
              maxLength={4000}
              required
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              disabled={pending}
              placeholder="Clear, concise answer"
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
              Keywords <span className="label-hint">optional</span>
              <Input
                maxLength={200}
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                disabled={pending}
                placeholder="search terms"
              />
            </Label>
          </div>

          <Label>
            Published
            <select
              value={isPublished ? "true" : "false"}
              onChange={(e) => setIsPublished(e.target.value === "true")}
              disabled={pending}
            >
              <option value="true">Published</option>
              <option value="false">Unpublished</option>
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

export function FaqManagementPage() {
  const queryClient = useQueryClient();
  const hydrated = useHydrated();
  const [editingFaq, setEditingFaq] = useState<ApiFaqEntry | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ApiFaqEntry | null>(null);
  const [pending, setPending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const faqs = useQuery({
    queryKey: ["admin", "faq"],
    queryFn: () => adminApi.faq(),
    retry: false,
  });

  async function confirmDelete() {
    if (!deleteTarget) return;
    setPending(true);
    setDeleteError(null);
    try {
      await adminApi.deleteFaq(deleteTarget.id);
      queryClient.invalidateQueries({ queryKey: ["admin", "faq"] });
      setDeleteTarget(null);
      setNotice(`FAQ deleted.`);
    } catch (caught) {
      setDeleteError(errorMessage(caught, "The FAQ entry could not be deleted."));
    } finally {
      setPending(false);
    }
  }

  function handleEdit(faq: ApiFaqEntry) {
    setEditingFaq(faq);
    setNotice(null);
  }

  function handleDelete(faq: ApiFaqEntry) {
    setDeleteError(null);
    setDeleteTarget(faq);
  }

  if (faqs.isPending) {
    return <div className="loading-block" aria-busy="true"><p>Loading FAQ…</p></div>;
  }

  if (faqs.isError) {
    return (
      <div className="feedback error" role="alert">
        <span>FAQ entries could not be loaded.</span>
        <Button variant="outline" size="sm" onClick={() => faqs.refetch()}>
          <Check size={14} /> Retry
        </Button>
      </div>
    );
  }

  const list = faqs.data ?? [];

  return (
    <>
      <PageHeading eyebrow="ARCH OPERATIONS" title="FAQ management." description="Frequently asked questions shown on the public site and used by the assistant." />
      {notice && <p className="feedback" role="status">{notice}</p>}
      {list.length === 0 ? (
        <EmptyNotice title="No FAQ entries yet." description="Add the first question below." />
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Question</th>
                <th>Category</th>
                <th>Published</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((faq) => (
                <tr className="event-row" key={faq.id}>
                  <td>
                    <strong>{faq.question}</strong>
                    <p className="event-meta">{faq.answer.slice(0, 120)}{faq.answer.length > 120 ? "…" : ""}</p>
                  </td>
                  <td>{faq.category || "—"}</td>
                  <td>
                    <span className={faq.is_published ? "status-sent" : "status-project"}>
                      {faq.is_published ? "Yes" : "No"}
                    </span>
                  </td>
                  <td>
                    <div className="task-actions">
                      <Button variant="outline" size="sm" onClick={() => handleEdit(faq)} aria-label={`Edit ${faq.question}`}>
                        <Edit size={14} /> Edit
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => handleDelete(faq)} aria-label={`Delete ${faq.question}`}>
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
            <h2>Add a FAQ entry</h2>
            <p>Entries marked Published appear on the public site and in the assistant.</p>
          </div>
          <Button onClick={() => { setEditingFaq(null); setNotice(null); setCreateOpen(true); }}>New FAQ</Button>
        </div>
      </section>
      {editingFaq && (
        <FaqForm key={editingFaq.id} faq={editingFaq} submitLabel="Save changes" onSaved={() => { setEditingFaq(null); setNotice("FAQ updated."); }} open onOpenChange={(o) => { if (!o) setEditingFaq(null); }} />
      )}
      {createOpen && !editingFaq && (
        <FaqForm submitLabel="Create FAQ" onSaved={() => { setCreateOpen(false); setNotice("FAQ added."); }} open={createOpen} onOpenChange={setCreateOpen} />
      )}
      {deleteTarget && (
        <Dialog open={true} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete FAQ entry</DialogTitle>
              <DialogDescription>Remove <strong>{deleteTarget.question}</strong>? This cannot be undone.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
              <Button variant="destructive" onClick={confirmDelete} disabled={pending}>
                {pending ? "Deleting…" : "Delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
