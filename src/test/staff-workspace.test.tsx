import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminShiftsTab, ShiftList, TaskEditDialog, TaskForm } from "@/components/arch/staff-pages";
import { adminApi, staffApi } from "@/services/api";
import type { ApiAdminAssignee, ApiEvent, ApiShift, ApiTask } from "@/services/types";

vi.mock("@/services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/api")>();
  return {
    ...actual,
    adminApi: {
      ...actual.adminApi,
      assignees: vi.fn(),
      events: vi.fn(),
      createTask: vi.fn(),
    },
    staffApi: {
      ...actual.staffApi,
      updateTask: vi.fn(),
      shifts: vi.fn(),
      createShift: vi.fn(),
    },
  };
});

const assignees: ApiAdminAssignee[] = [
  { id: 4, full_name: "Sam Staff", email: "sam@example.com", role: "staff" },
];

const events: ApiEvent[] = [
  {
    id: 3,
    title: "Comp night",
    description: "",
    starts_at: "2099-11-05T18:00:00Z",
    ends_at: null,
    location: "Main wall",
    capacity: null,
    is_public: true,
  },
];

const task: ApiTask = {
  id: 12,
  title: "Open the wall",
  description: "Check the holds",
  status: "todo",
  priority: "high",
  due_at: "2099-11-05T18:00:00Z",
  completed_at: null,
  assignee_id: 4,
  assignee_name: "Sam Staff",
  created_by_id: 1,
  created_by_name: "Admin",
  event_id: 3,
  event_title: "Comp night",
  event_starts_at: "2099-11-05T18:00:00Z",
  event_ends_at: null,
  created_at: "2099-10-23T00:00:00Z",
  checklist: [],
};

const upcomingShift: ApiShift = {
  id: 1,
  staff_id: 4,
  staff_name: "Sam Staff",
  starts_at: "2099-11-06T09:00:00Z",
  ends_at: "2099-11-06T17:00:00Z",
  role: "Morning floor",
  notes: "Open the bouldering area",
};

const pastShift: ApiShift = {
  id: 2,
  staff_id: 4,
  staff_name: "Sam Staff",
  starts_at: "2000-11-06T09:00:00Z",
  ends_at: "2000-11-06T17:00:00Z",
  role: "Evening floor",
  notes: "",
};

function renderWithClient(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  vi.mocked(adminApi.assignees).mockResolvedValue(assignees);
  vi.mocked(adminApi.events).mockResolvedValue(events);
  vi.mocked(adminApi.createTask).mockResolvedValue({ ...task, id: 13, title: "New task" });
  vi.mocked(staffApi.updateTask).mockResolvedValue(task);
  vi.mocked(staffApi.shifts).mockResolvedValue([upcomingShift]);
  vi.mocked(staffApi.createShift).mockResolvedValue(upcomingShift);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("the administrator task form", () => {
  it("creates a task with assignee, priority, due date, event and checklist", async () => {
    renderWithClient(<TaskForm submitLabel="Create task" />);

    await screen.findByLabelText("Title");
    await screen.findByRole("option", { name: "Sam Staff (sam@example.com)" });

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "  Open the wall  " } });
    fireEvent.change(screen.getByLabelText(/Description/i), {
      target: { value: "Check the holds" },
    });
    fireEvent.change(screen.getByLabelText(/Assignee/i), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("Priority"), { target: { value: "high" } });
    fireEvent.change(screen.getByLabelText(/Due date and time/i), {
      target: { value: "2099-11-05T18:00" },
    });
    fireEvent.change(screen.getByLabelText(/Event/i), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText(/Initial checklist/i), {
      target: { value: "Collect the holds\nCheck the lighting" },
    });

    const submit = screen.getByRole("button", { name: "Create task" });
    await waitFor(() => expect(submit).toBeEnabled());
    fireEvent.click(submit);

    await waitFor(() => expect(adminApi.createTask).toHaveBeenCalledTimes(1));
    expect(vi.mocked(adminApi.createTask).mock.calls[0]?.[0]).toEqual({
      title: "Open the wall",
      description: "Check the holds",
      assignee_id: 4,
      priority: "high",
      due_at: new Date("2099-11-05T18:00").toISOString(),
      event_id: 3,
      checklist: [{ label: "Collect the holds" }, { label: "Check the lighting" }],
    });
    await screen.findByText("Task created.");
    await waitFor(() => expect(screen.getByLabelText("Title")).toHaveValue(""));
  });

  it("disables submission and explains a failed assignee option request", async () => {
    vi.mocked(adminApi.assignees).mockRejectedValue(new Error("assignees unavailable"));
    renderWithClient(<TaskForm submitLabel="Create task" />);

    await screen.findByText("Assignee options could not be loaded.");
    expect(screen.getByRole("button", { name: "Create task" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Retry" })).toBeVisible();
  });

  it("reports validation errors without sending an incomplete task", async () => {
    renderWithClient(<TaskForm submitLabel="Create task" />);

    await screen.findByLabelText("Title");
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "ab" } });
    const form = screen.getByRole("button", { name: "Create task" }).closest("form");
    expect(form).not.toBeNull();
    fireEvent.submit(form!);

    await screen.findByText("Give the task a title of at least 3 characters.");
    expect(adminApi.createTask).not.toHaveBeenCalled();
  });

  it("keeps entered values when the mutation fails", async () => {
    vi.mocked(adminApi.createTask).mockRejectedValue(new Error("not saved"));
    renderWithClient(<TaskForm submitLabel="Create task" />);

    await screen.findByLabelText("Title");
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Keep this title" } });
    const submit = screen.getByRole("button", { name: "Create task" });
    await waitFor(() => expect(submit).toBeEnabled());
    fireEvent.click(submit);

    await screen.findByText("The task could not be saved.");
    expect(screen.getByLabelText("Title")).toHaveValue("Keep this title");
  });
});

describe("the administrator task editor", () => {
  it("sends only changed fields and clears optional fields with explicit nulls", async () => {
    const onOpenChange = vi.fn();
    renderWithClient(<TaskEditDialog task={task} open onOpenChange={onOpenChange} />);

    await screen.findByText("Edit task");
    await screen.findByRole("option", { name: "Sam Staff (sam@example.com)" });

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Reassigned" } });
    fireEvent.change(screen.getByLabelText(/Assignee/i), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText(/Event/i), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText(/Due date and time/i), { target: { value: "" } });

    const submit = screen.getByRole("button", { name: "Save changes" });
    await waitFor(() => expect(submit).toBeEnabled());
    fireEvent.click(submit);

    await waitFor(() => expect(staffApi.updateTask).toHaveBeenCalledTimes(1));
    expect(vi.mocked(staffApi.updateTask).mock.calls[0]).toEqual([
      12,
      {
        title: "Reassigned",
        assignee_id: null,
        event_id: null,
        due_at: null,
      },
    ]);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe("the administrator shift workspace", () => {
  it("lists existing shifts and creates a new one", async () => {
    renderWithClient(<AdminShiftsTab />);

    await screen.findByText("Morning floor");
    await screen.findByRole("option", { name: "Sam Staff (sam@example.com)" });

    fireEvent.change(screen.getByLabelText("Staff member"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("Starts"), {
      target: { value: "2099-11-07T09:00" },
    });
    fireEvent.change(screen.getByLabelText("Ends"), {
      target: { value: "2099-11-07T17:00" },
    });
    fireEvent.change(screen.getByLabelText("Role"), { target: { value: "Floor staff" } });
    fireEvent.change(screen.getByLabelText(/Notes/i), {
      target: { value: "Open the bouldering area" },
    });

    const submit = screen.getByRole("button", { name: "Schedule shift" });
    await waitFor(() => expect(submit).toBeEnabled());
    fireEvent.click(submit);

    await waitFor(() => expect(staffApi.createShift).toHaveBeenCalledTimes(1));
    expect(vi.mocked(staffApi.createShift).mock.calls[0]?.[0]).toEqual({
      staff_id: 4,
      starts_at: new Date("2099-11-07T09:00").toISOString(),
      ends_at: new Date("2099-11-07T17:00").toISOString(),
      role: "Floor staff",
      notes: "Open the bouldering area",
    });
    await screen.findByText("Shift scheduled.");
  });

  it("distinguishes an empty shift list from a failed request", async () => {
    vi.mocked(staffApi.shifts).mockResolvedValue([]);
    const { unmount } = renderWithClient(<AdminShiftsTab />);
    await screen.findByText("No shifts scheduled.");
    expect(screen.getByText("Create a shift below to schedule the team.")).toBeVisible();
    unmount();

    vi.mocked(staffApi.shifts).mockRejectedValue(new Error("shifts unavailable"));
    renderWithClient(<AdminShiftsTab />);
    await screen.findByText("Shifts could not be loaded.");
    expect(screen.queryByText("No shifts scheduled.")).toBeNull();
  });
});

describe("the staff shift list", () => {
  it("shows upcoming shifts before earlier shifts and handles an empty schedule", () => {
    const { container, rerender } = renderWithClient(
      <ShiftList shifts={[pastShift, upcomingShift]} />,
    );

    const rows = container.querySelectorAll("article");
    expect(rows[0]).toHaveTextContent("Morning floor");
    expect(rows[1]).toHaveTextContent("Evening floor");
    expect(screen.getByText("Earlier shifts (1)")).toBeVisible();

    rerender(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ShiftList shifts={[]} />
      </QueryClientProvider>,
    );
    expect(screen.getByText("No shifts scheduled.")).toBeVisible();
  });
});
