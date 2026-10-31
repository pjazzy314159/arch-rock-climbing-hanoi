import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EventsManagementPage } from "@/components/arch/events-management";
import { adminApi, ApiError } from "@/services/api";
import type { ApiAdminEvent } from "@/services/types";

vi.mock("@/services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/api")>();
  return {
    ...actual,
    adminApi: {
      ...actual.adminApi,
      events: vi.fn(),
      createEvent: vi.fn(),
      updateEvent: vi.fn(),
      deleteEvent: vi.fn(),
    },
  };
});

const mockEvents: ApiAdminEvent[] = [
  {
    id: 1,
    title: "Morning Climb",
    description: "Beginner session",
    starts_at: "2025-06-15T09:00:00.000Z",
    ends_at: "2025-06-15T11:00:00.000Z",
    location: "Main Hall",
    capacity: 12,
    is_public: true,
  },
  {
    id: 2,
    title: "Staff Retrospective",
    description: "",
    starts_at: "2025-06-16T14:00:00.000Z",
    ends_at: null,
    location: "Meeting Room B",
    capacity: 5,
    is_public: false,
  },
];

const sampleEvent = mockEvents[0]!;

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <EventsManagementPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(adminApi.events).mockResolvedValue(mockEvents);
  vi.mocked(adminApi.createEvent).mockResolvedValue({ ...sampleEvent, id: 3 });
  vi.mocked(adminApi.updateEvent).mockResolvedValue({ ...sampleEvent, title: "Updated" });
  vi.mocked(adminApi.deleteEvent).mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("EventsManagementPage", () => {
  it("renders the loading state", () => {
    vi.mocked(adminApi.events).mockImplementation(() => new Promise(() => {}));
    renderPage();
    expect(screen.getByText("Loading events…")).toBeInTheDocument();
  });

  it("renders both public and unpublished events", async () => {
    renderPage();
    await screen.findByText("Morning Climb");
    expect(screen.getByText("Staff Retrospective")).toBeInTheDocument();
    expect(screen.getByText("Public")).toBeInTheDocument();
    expect(screen.getByText("Staff only")).toBeInTheDocument();
  });

  it("shows an empty state when there are no events", async () => {
    vi.mocked(adminApi.events).mockResolvedValue([]);
    renderPage();
    await screen.findByText("No events yet.");
    expect(screen.queryByText("Morning Climb")).not.toBeInTheDocument();
  });

  it("shows a load error with a retry action", async () => {
    vi.mocked(adminApi.events).mockRejectedValue(new Error("API down"));
    renderPage();
    await screen.findByText("Events could not be loaded.");
    expect(screen.getByRole("button", { name: /Retry/ })).toBeInTheDocument();
  });

  it("creates an event with ISO date conversion and shows success feedback", async () => {
    renderPage();
    await screen.findByText("Morning Climb");
    fireEvent.click(screen.getByRole("button", { name: /New event/ }));
    fireEvent.change(await screen.findByLabelText(/^Title/), { target: { value: "Test Event" } });
    fireEvent.change(await screen.findByLabelText(/^Starts/), { target: { value: "2025-07-20T10:00" } });
    fireEvent.click(await screen.findByRole("button", { name: /Create event/ }));

    await screen.findByText("Event added.");
    expect(adminApi.createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Test Event",
        starts_at: expect.stringContaining("2025-07-20T"),
        is_public: true,
      }),
    );
  });

  it("validates that title is required", async () => {
    renderPage();
    await screen.findByText("Morning Climb");
    fireEvent.click(screen.getByRole("button", { name: /New event/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Create event/ }));

    expect(await screen.findByText("Title is required.")).toBeInTheDocument();
    expect(adminApi.createEvent).not.toHaveBeenCalled();
  });

  it("validates that start time is required", async () => {
    renderPage();
    await screen.findByText("Morning Climb");
    fireEvent.click(screen.getByRole("button", { name: /New event/ }));
    fireEvent.change(await screen.findByLabelText(/^Title/), { target: { value: "Startless Event" } });
    fireEvent.click(await screen.findByRole("button", { name: /Create event/ }));

    expect(await screen.findByText("Choose a start time.")).toBeInTheDocument();
    expect(adminApi.createEvent).not.toHaveBeenCalled();
  });

  it("validates that end must be after start", async () => {
    renderPage();
    await screen.findByText("Morning Climb");
    fireEvent.click(screen.getByRole("button", { name: /New event/ }));
    fireEvent.change(await screen.findByLabelText(/^Title/), { target: { value: "Bad End" } });
    fireEvent.change(await screen.findByLabelText(/^Starts/), { target: { value: "2025-07-20T11:00" } });
    fireEvent.change(await screen.findByLabelText(/^Ends/), { target: { value: "2025-07-20T10:00" } });
    fireEvent.click(await screen.findByRole("button", { name: /Create event/ }));

    expect(await screen.findByText("The end must be after the start.")).toBeInTheDocument();
    expect(adminApi.createEvent).not.toHaveBeenCalled();
  });

  it("validates capacity range", async () => {
    renderPage();
    await screen.findByText("Morning Climb");
    fireEvent.click(screen.getByRole("button", { name: /New event/ }));
    fireEvent.change(await screen.findByLabelText(/^Title/), { target: { value: "Small Capacity" } });
    fireEvent.change(await screen.findByLabelText(/^Starts/), { target: { value: "2025-07-20T10:00" } });
    fireEvent.change(await screen.findByLabelText(/^Capacity/), { target: { value: "0" } });
    fireEvent.click(await screen.findByRole("button", { name: /Create event/ }));

    expect(await screen.findByText("Capacity must be between 1 and 10000.")).toBeInTheDocument();
    expect(adminApi.createEvent).not.toHaveBeenCalled();
  });

  it("pre-fills the edit form and sends only changed fields", async () => {
    renderPage();
    await screen.findByText("Morning Climb");
    fireEvent.click(screen.getByRole("button", { name: "Edit Morning Climb" }));

    expect(await screen.findByText("Edit event")).toBeInTheDocument();
    const titleInput = await screen.findByLabelText(/^Title/);
    expect(titleInput).toHaveValue("Morning Climb");
    expect((titleInput as HTMLInputElement).maxLength).toBe(160);

    fireEvent.change(titleInput, { target: { value: "Updated Title" } });
    fireEvent.click(await screen.findByRole("button", { name: /Save changes/ }));

    await screen.findByText("Event updated.");
    expect(adminApi.updateEvent).toHaveBeenCalledWith(sampleEvent.id, {
      title: "Updated Title",
    });
  });

  it("toggles public/staff-only status via PATCH", async () => {
    renderPage();
    await screen.findByText("Staff Retrospective");
    fireEvent.click(screen.getByRole("button", { name: "Publish Staff Retrospective" }));

    await vi.waitFor(() =>
      expect(adminApi.updateEvent).toHaveBeenCalledWith(2, { is_public: true }),
    );

    vi.mocked(adminApi.updateEvent).mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Hide Morning Climb" }));

    await vi.waitFor(() =>
      expect(adminApi.updateEvent).toHaveBeenCalledWith(1, { is_public: false }),
    );
  });

  it("deletes an event after confirmation", async () => {
    renderPage();
    await screen.findByText("Morning Climb");
    fireEvent.click(screen.getByRole("button", { name: "Delete Morning Climb" }));

    expect(await screen.findByText("Delete event")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await vi.waitFor(() => expect(adminApi.deleteEvent).toHaveBeenCalledWith(1));
    expect(await screen.findByText("Event \"Morning Climb\" deleted.")).toBeInTheDocument();
  });

  it("shows a mutation error on create failure", async () => {
    vi.mocked(adminApi.createEvent).mockRejectedValueOnce(
      new ApiError("Body is invalid", 422),
    );
    renderPage();
    await screen.findByText("Morning Climb");
    fireEvent.click(screen.getByRole("button", { name: /New event/ }));
    fireEvent.change(await screen.findByLabelText(/^Title/), { target: { value: "Failed Event" } });
    fireEvent.change(await screen.findByLabelText(/^Starts/), { target: { value: "2025-07-20T10:00" } });
    fireEvent.click(await screen.findByRole("button", { name: /Create event/ }));

    expect(await screen.findByText("Invalid event data.")).toBeInTheDocument();
    expect(screen.getByText("Add event")).toBeInTheDocument();
  });

  it("shows a mutation error on delete failure inside the dialog", async () => {
    vi.mocked(adminApi.deleteEvent).mockRejectedValueOnce(
      new ApiError("Not found", 404),
    );
    renderPage();
    await screen.findByText("Morning Climb");
    fireEvent.click(screen.getByRole("button", { name: "Delete Morning Climb" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));

    expect(await screen.findByText("Event not found.")).toBeInTheDocument();
    expect(screen.getByText("Delete event")).toBeInTheDocument();
  });

  it("shows a mutation error when toggling visibility fails", async () => {
    vi.mocked(adminApi.updateEvent).mockRejectedValueOnce(new Error("API down"));
    renderPage();
    await screen.findByText("Morning Climb");
    fireEvent.click(screen.getByRole("button", { name: "Hide Morning Climb" }));

    expect(await screen.findByText("Could not change visibility.")).toBeInTheDocument();
  });
});
