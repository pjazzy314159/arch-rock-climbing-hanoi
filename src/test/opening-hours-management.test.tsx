import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { OpeningHoursManagementPage } from "@/components/arch/opening-hours-management";
import { adminApi, ApiError } from "@/services/api";
import type { ApiAdminOpeningHour } from "@/services/types";

vi.mock("@/services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/api")>();
  return {
    ...actual,
    adminApi: {
      ...actual.adminApi,
      openingHours: vi.fn(),
      createOpeningHour: vi.fn(),
      updateOpeningHour: vi.fn(),
      deleteOpeningHour: vi.fn(),
    },
  };
});

const mockHours: ApiAdminOpeningHour[] = [
  {
    id: 1,
    day_of_week: 0,
    opens_at: "09:00:00",
    closes_at: "12:00:00",
    note: "Morning session",
    is_closed: false,
  },
  {
    id: 2,
    day_of_week: 0,
    opens_at: "14:00:00",
    closes_at: "18:00:00",
    note: "Afternoon session",
    is_closed: false,
  },
  {
    id: 3,
    day_of_week: 2,
    opens_at: null,
    closes_at: null,
    note: "Public holiday",
    is_closed: true,
  },
];

const sampleHour = mockHours[0]!;

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <OpeningHoursManagementPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(adminApi.openingHours).mockResolvedValue(mockHours);
  vi.mocked(adminApi.createOpeningHour).mockResolvedValue({ ...sampleHour, id: 4 });
  vi.mocked(adminApi.updateOpeningHour).mockResolvedValue(sampleHour);
  vi.mocked(adminApi.deleteOpeningHour).mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

async function openDialog() {
  fireEvent.click(screen.getByRole("button", { name: /New opening hour/ }));
  await screen.findByRole("button", { name: "Create opening hour" });
}

function selectDay(index: number) {
  fireEvent.change(screen.getByLabelText(/^Day/), { target: { value: String(index) } });
}

describe("OpeningHoursManagementPage", () => {
  it("renders the loading state", () => {
    vi.mocked(adminApi.openingHours).mockImplementation(() => new Promise(() => {}));
    renderPage();
    expect(screen.getByText("Loading opening hours…")).toBeInTheDocument();
  });

  it("groups multiple intervals by weekday and shows closed days", async () => {
    renderPage();
    await screen.findByText("Morning session");

    expect(screen.getByRole("heading", { name: "Monday" })).toBeInTheDocument();
    expect(screen.getByText("09:00 – 12:00")).toBeInTheDocument();
    expect(screen.getByText("14:00 – 18:00")).toBeInTheDocument();
    expect(screen.getByText("Afternoon session")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Wednesday" })).toBeInTheDocument();
    expect(screen.getByText("Closed")).toBeInTheDocument();
    expect(screen.getByText("Public holiday")).toBeInTheDocument();
  });

  it("shows an empty state without inventing hours", async () => {
    vi.mocked(adminApi.openingHours).mockResolvedValue([]);
    renderPage();
    await screen.findByText("No opening hours set yet.");
    expect(screen.queryByText("09:00 – 12:00")).not.toBeInTheDocument();
  });

  it("shows a load error with a retry action", async () => {
    vi.mocked(adminApi.openingHours).mockRejectedValue(new Error("API down"));
    renderPage();
    await screen.findByText("Opening hours could not be loaded.");
    expect(screen.getByRole("button", { name: /Retry/ })).toBeInTheDocument();
  });

  it("validates that a day is required", async () => {
    renderPage();
    await screen.findByText("Morning session");
    await openDialog();
    fireEvent.click(screen.getByRole("button", { name: "Create opening hour" }));

    expect(await screen.findByText("Choose a day of the week.")).toBeInTheDocument();
    expect(adminApi.createOpeningHour).not.toHaveBeenCalled();
  });

  it("validates that open intervals need both times", async () => {
    renderPage();
    await screen.findByText("Morning session");
    await openDialog();
    await selectDay(1);
    fireEvent.click(screen.getByRole("button", { name: "Create opening hour" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Both start and end times are required for open intervals.",
    );
    expect(adminApi.createOpeningHour).not.toHaveBeenCalled();
  });

  it("creates an interval and shows success feedback", async () => {
    renderPage();
    await screen.findByText("Morning session");
    await openDialog();
    await selectDay(1);
    fireEvent.change(screen.getByLabelText(/^Opens/), { target: { value: "10:00" } });
    fireEvent.change(screen.getByLabelText(/^Closes/), { target: { value: "18:00" } });
    fireEvent.change(screen.getByLabelText(/^Note/), { target: { value: "Evening climb" } });
    fireEvent.click(screen.getByRole("button", { name: "Create opening hour" }));

    expect(await screen.findByText("Opening hour added.")).toBeInTheDocument();
    expect(adminApi.createOpeningHour).toHaveBeenCalledWith({
      day_of_week: 1,
      opens_at: "10:00",
      closes_at: "18:00",
      note: "Evening climb",
      is_closed: false,
    });
  });

  it("edits an interval from the weekly table", async () => {
    renderPage();
    await screen.findByText("Morning session");
    fireEvent.click(screen.getAllByRole("button", { name: "Edit Monday opening hour" })[0]!);

    expect(await screen.findByText("Edit opening hour")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Opens/)).toHaveValue("09:00");
    fireEvent.change(screen.getByLabelText(/^Closes/), { target: { value: "13:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await vi.waitFor(() =>
      expect(adminApi.updateOpeningHour).toHaveBeenCalledWith(1, { closes_at: "13:00" }),
    );
    expect(await screen.findByText("Opening hours updated.")).toBeInTheDocument();
  });

  it("keeps a closed day closed when editing its note", async () => {
    renderPage();
    await screen.findByText("Public holiday");
    fireEvent.click(screen.getByRole("button", { name: "Edit Wednesday opening hour" }));

    expect(await screen.findByText("Edit opening hour")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Opens/)).toHaveValue("");
    expect(screen.getByLabelText(/^Closes/)).toHaveValue("");
    fireEvent.change(screen.getByLabelText(/^Note/), { target: { value: "Closed all day" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await vi.waitFor(() =>
      expect(adminApi.updateOpeningHour).toHaveBeenCalledWith(3, { note: "Closed all day" }),
    );
  });

  it("deletes an interval after confirmation", async () => {
    renderPage();
    await screen.findByText("Public holiday");
    fireEvent.click(screen.getByRole("button", { name: "Delete Wednesday opening hour" }));

    expect(await screen.findByText("Delete opening hour")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await vi.waitFor(() => expect(adminApi.deleteOpeningHour).toHaveBeenCalledWith(3));
    expect(await screen.findByText("Opening hour deleted.")).toBeInTheDocument();
  });

  it("shows a mutation error from the API", async () => {
    vi.mocked(adminApi.createOpeningHour).mockRejectedValueOnce(
      new ApiError("Body is invalid", 422),
    );
    renderPage();
    await screen.findByText("Morning session");
    await openDialog();
    await selectDay(1);
    fireEvent.change(screen.getByLabelText(/^Opens/), { target: { value: "10:00" } });
    fireEvent.change(screen.getByLabelText(/^Closes/), { target: { value: "18:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Create opening hour" }));

    expect(await screen.findByText("Invalid opening hours data.")).toBeInTheDocument();
    expect(screen.getByText("Add opening hour")).toBeInTheDocument();
  });

  it("shows a delete failure inside the confirmation dialog", async () => {
    vi.mocked(adminApi.deleteOpeningHour).mockRejectedValueOnce(
      new ApiError("Not found", 404),
    );
    renderPage();
    await screen.findByText("Public holiday");
    fireEvent.click(screen.getByRole("button", { name: "Delete Wednesday opening hour" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));

    expect(await screen.findByText("That interval could not be found.")).toBeInTheDocument();
    expect(screen.getByText("Delete opening hour")).toBeInTheDocument();
  });
});
