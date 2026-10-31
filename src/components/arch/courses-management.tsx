import { useState, type FormEvent, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useHydrated } from "@/hooks/use-hydrated";
import { Loader2, Plus, Edit, RotateCcw, Trash2, X } from "lucide-react";
import { adminApi, ApiError, ApiUnavailableError } from "@/services/api";
import type { ApiAdminCourse, ApiAdminCourseCreate, ApiAdminCourseUpdate } from "@/services/types";
import { EmptyNotice } from "./data-state";

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
    if (caught.status === 404) return "That course could not be found.";
    if (caught.status === 422) return "Invalid course data.";
    return caught.message;
  }
  return fallback;
}

/* -------------------------------------------------------------------------- */
/* Course form (shared for create and edit)                                    */
/* -------------------------------------------------------------------------- */

interface CourseFormProps {
  course?: ApiAdminCourse;
  submitLabel: string;
  onSaved: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function CourseForm({ course, submitLabel, onSaved, open, onOpenChange }: CourseFormProps) {
  const queryClient = useQueryClient();
  const hydrated = useHydrated();

  const [title, setTitle] = useState(course?.title ?? "");
  const [level, setLevel] = useState(course?.level ?? "");
  const [summary, setSummary] = useState(course?.summary ?? "");
  const [description, setDescription] = useState(course?.description ?? "");
  const [instructor, setInstructor] = useState(course?.instructor ?? "");
  const [schedule, setSchedule] = useState(course?.schedule ?? "");
  const [duration_weeks, setDurationWeeks] = useState(course?.duration_weeks ?? null);
  const [capacity, setCapacity] = useState(course?.capacity ?? null);
  const [price_vnd, setPriceVnd] = useState(course?.price_vnd ?? null);

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const submitDisabled = !hydrated || pending;

  const numFromInput = (value: string): number | null => {
    if (value.trim() === "") return null;
    const num = Number(value);
    return Number.isNaN(num) ? null : num;
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Title is required.");
      return;
    }
    if (duration_weeks !== null && duration_weeks < 1) {
      setError("Duration weeks must be at least 1.");
      return;
    }
    if (capacity !== null && capacity < 1) {
      setError("Capacity must be at least 1.");
      return;
    }
    if (price_vnd !== null && price_vnd < 0) {
      setError("Price must be a non-negative number.");
      return;
    }

    setPending(true);
    setError(null);
    setSuccess(null);

    try {
      if (!course) {
        const body: ApiAdminCourseCreate = { title: trimmedTitle };
        if (level.trim()) body.level = level.trim();
        body.summary = summary.trim();
        body.description = description.trim();
        body.instructor = instructor.trim();
        body.schedule = schedule.trim();
        body.duration_weeks = duration_weeks;
        body.capacity = capacity;
        body.price_vnd = price_vnd;
        body.is_active = true;

        await adminApi.createCourse(body);

        setTitle("");
        setLevel("");
        setSummary("");
        setDescription("");
        setInstructor("");
        setSchedule("");
        setDurationWeeks(null);
        setCapacity(null);
        setPriceVnd(null);
        setSuccess("Course created.");
      } else {
        const body: ApiAdminCourseUpdate = {};
        if (trimmedTitle !== course.title) body.title = trimmedTitle;
        if (level !== course.level) body.level = level.trim();
        if (summary.trim() !== course.summary) body.summary = summary.trim();
        if (description.trim() !== course.description) body.description = description.trim();
        if (instructor !== course.instructor) body.instructor = instructor;
        if (schedule !== course.schedule) body.schedule = schedule;
        if (duration_weeks !== course.duration_weeks) body.duration_weeks = duration_weeks;
        if (capacity !== course.capacity) body.capacity = capacity;
        if (price_vnd !== course.price_vnd) body.price_vnd = price_vnd;

        if (Object.keys(body).length === 0) {
          setError("No changes to save.");
          return;
        }

        await adminApi.updateCourse(course.id, body);
        setSuccess("Course updated.");
      }

      await queryClient.invalidateQueries({ queryKey: ["admin", "courses"] });
      onSaved();
    } catch (caught) {
      setError(errorMessage(caught, "The course could not be saved."));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{course ? "Edit course" : "Create course"}</DialogTitle>
          <DialogDescription>
            {course
              ? "Only changed fields are sent to the API. An empty price (null) is allowed."
              : "Fill in the required fields. All other fields are optional."}
          </DialogDescription>
        </DialogHeader>
        <form className="profile-form" onSubmit={submit}>
          <div className="form-row">
            <Label>
              Title <span className="label-hint">required</span>
              <Input
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                minLength={1}
                maxLength={140}
                disabled={submitDisabled}
                placeholder="Course title"
              />
            </Label>
          </div>

          <div className="form-row">
            <Label>
              Level
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                disabled={submitDisabled}
              >
                <option value="">Select level</option>
                <option value="All levels">All levels</option>
                <option value="Beginner">Beginner</option>
                <option value="Intermediate">Intermediate</option>
                <option value="Advanced">Advanced</option>
              </select>
            </Label>
          </div>

          <div className="form-row">
            <Label>
              Summary
              <Input
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                maxLength={4000}
                disabled={submitDisabled}
                placeholder="Brief description"
              />
            </Label>
          </div>

          <div className="form-row">
            <Label>
              Instructor
              <Input
                value={instructor}
                onChange={(e) => setInstructor(e.target.value)}
                maxLength={120}
                disabled={submitDisabled}
                placeholder="Instructor name"
              />
            </Label>
          </div>

          <div className="form-row">
            <Label>
              Schedule
              <Input
                value={schedule}
                onChange={(e) => setSchedule(e.target.value)}
                maxLength={200}
                disabled={submitDisabled}
                placeholder="e.g., Mon, Wed, Fri 09:00-11:00"
              />
            </Label>
          </div>

          <div className="form-row">
            <Label>
              Duration (weeks)
              <Input
                type="number"
                value={duration_weeks ?? ""}
                onChange={(e) => setDurationWeeks(numFromInput(e.target.value))}
                min={1}
                disabled={submitDisabled}
                placeholder="1-52 (leave empty for null)"
              />
            </Label>
          </div>

          <div className="form-row">
            <Label>
              Capacity
              <Input
                type="number"
                value={capacity ?? ""}
                onChange={(e) => setCapacity(numFromInput(e.target.value))}
                min={1}
                disabled={submitDisabled}
                placeholder="1-100 (leave empty for null)"
              />
            </Label>
          </div>

          <div className="form-row">
            <Label>
              Price (VND)
              <Input
                type="number"
                value={price_vnd ?? ""}
                onChange={(e) => setPriceVnd(numFromInput(e.target.value))}
                min={0}
                disabled={submitDisabled}
                placeholder="Leave empty for null"
              />
            </Label>
          </div>

          <Label>
            Description
            <Textarea
              rows={3}
              maxLength={4000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={submitDisabled}
              placeholder="Full description of the course…"
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

/* -------------------------------------------------------------------------- */
/* Course table (list)                                                        */
/* -------------------------------------------------------------------------- */

function CourseTable({ courses, onEdit, onToggleActive, onDelete }: {
  courses: ApiAdminCourse[];
  onEdit: (course: ApiAdminCourse) => void;
  onToggleActive: (course: ApiAdminCourse) => void;
  onDelete: (course: ApiAdminCourse) => void;
}) {
  if (courses.length === 0) {
    return (
      <EmptyNotice
        title="No courses yet."
        description="Create the first course below to start building the catalogue."
      />
    );
  }

  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Title</th>
            <th>Level</th>
            <th>Instructor</th>
            <th>Schedule</th>
            <th>Duration (weeks)</th>
            <th>Capacity</th>
            <th>Price (VND)</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {courses.map((course) => (
            <tr key={course.id}>
              <td>
                <strong>{course.title}</strong>
              </td>
              <td>{course.level}</td>
              <td>{course.instructor}</td>
              <td>{course.schedule}</td>
              <td>{course.duration_weeks ?? "—"}</td>
              <td>{course.capacity ?? "—"}</td>
              <td>
                {course.price_vnd === null ? "Not set" : course.price_vnd.toLocaleString()}
              </td>
              <td>
                <span className={course.is_active ? "status-sent" : "status-project"}>
                  {course.is_active ? "Active" : "Inactive"}
                </span>
              </td>
              <td>
                <div className="task-actions">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onEdit(course)}
                    aria-label={`Edit ${course.title}`}
                  >
                    <Edit size={14} /> Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onToggleActive(course)}
                    aria-label={course.is_active ? `Deactivate ${course.title}` : `Activate ${course.title}`}
                  >
                    <RotateCcw size={14} />
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => onDelete(course)}
                    aria-label={`Delete ${course.title}`}
                  >
                    <Trash2 size={14} />
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
/* Main page                                                                  */
/* -------------------------------------------------------------------------- */

export function CoursesManagementPage() {
  const queryClient = useQueryClient();
  const hydrated = useHydrated();
  const [editingCourse, setEditingCourse] = useState<ApiAdminCourse | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<ApiAdminCourse | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ApiAdminCourse | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const courses = useQuery({
    queryKey: ["admin", "courses"],
    queryFn: () => adminApi.courses(),
    retry: false,
  });

  async function handleToggleActive(course: ApiAdminCourse) {
    setConfirmDeactivate(course);
  }

  async function confirmToggleActive(course: ApiAdminCourse) {
    setToggleError(null);
    try {
      await adminApi.updateCourse(course.id, { is_active: !course.is_active });
      await queryClient.invalidateQueries({ queryKey: ["admin", "courses"] });
      setNotice(course.is_active ? "Course deactivated." : "Course activated.");
    } catch (caught) {
      setToggleError(errorMessage(caught, "The course status could not be changed."));
    } finally {
      setConfirmDeactivate(null);
    }
  }

  function handleDelete(course: ApiAdminCourse) {
    setDeleteTarget(course);
    setDeleteError(null);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeletePending(true);
    setDeleteError(null);
    try {
      await adminApi.deleteCourse(deleteTarget.id);
      await queryClient.invalidateQueries({ queryKey: ["admin", "courses"] });
      setDeleteTarget(null);
      setNotice("Course deleted.");
    } catch (caught) {
      setDeleteError(errorMessage(caught, "The course could not be deleted."));
    } finally {
      setDeletePending(false);
    }
  }

  if (courses.isPending) {
    return (
      <div className="loading-block" aria-busy="true">
        <p>Loading courses…</p>
      </div>
    );
  }

  if (courses.isError) {
    return (
      <div className="feedback error" role="alert">
        <span>Courses could not be loaded.</span>
        <Button variant="outline" size="sm" onClick={() => courses.refetch()}>
          <Loader2 size={14} className="animate-spin" /> Retry
        </Button>
      </div>
    );
  }

  const list = courses.data ?? [];

  return (
    <>
      {notice && (
        <p className="feedback" role="status">
          {notice}
        </p>
      )}

      <CourseTable
        courses={list}
        onEdit={setEditingCourse}
        onToggleActive={handleToggleActive}
        onDelete={handleDelete}
      />

      <section className="content-block">
        <div className="content-block-head">
          <Plus size={22} />
          <div>
            <h2>Create a new course</h2>
            <p>All fields except title are optional.</p>
          </div>
          <Button onClick={() => setCreateOpen(true)}>New course</Button>
        </div>
      </section>

      {toggleError && (
        <p className="feedback error" role="alert">
          {toggleError}
        </p>
      )}

      <CourseForm
        submitLabel="Create course"
        onSaved={() => {}}
        open={createOpen}
        onOpenChange={setCreateOpen}
      />

      {editingCourse && (
        <CourseForm
          key={editingCourse.id}
          course={editingCourse}
          submitLabel="Save changes"
          onSaved={() => setEditingCourse(null)}
          open={true}
          onOpenChange={(open) => {
            if (!open) setEditingCourse(null);
          }}
        />
      )}

      {confirmDeactivate && (
        <Dialog open={true} onOpenChange={(open) => {
          if (!open) setConfirmDeactivate(null);
        }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {confirmDeactivate.is_active ? "Deactivate course" : "Activate course"}
              </DialogTitle>
              <DialogDescription>
                This will {confirmDeactivate.is_active ? "hide" : "show"} the course on the public site.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <Button
                variant={confirmDeactivate.is_active ? "destructive" : "default"}
                onClick={() => confirmToggleActive(confirmDeactivate)}
              >
                {confirmDeactivate.is_active ? "Deactivate" : "Activate"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {deleteTarget && (
        <Dialog open={true} onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete course</DialogTitle>
              <DialogDescription>
                This will permanently delete <strong>{deleteTarget.title}</strong>. This action cannot be undone.
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
                disabled={!hydrated || deletePending}
              >
                {deletePending ? "Deleting…" : "Delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

export { CourseForm, CourseTable };