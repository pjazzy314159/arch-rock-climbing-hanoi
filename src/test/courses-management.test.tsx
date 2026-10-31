import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { CoursesManagementPage, CourseForm, CourseTable } from "@/components/arch/courses-management";
import { adminApi, ApiError } from "@/services/api";
import type { ApiAdminCourse } from "@/services/types";

vi.mock("@/services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/api")>();
  return {
    ...actual,
    adminApi: {
      ...actual.adminApi,
      courses: vi.fn(),
      createCourse: vi.fn(),
      updateCourse: vi.fn(),
      deleteCourse: vi.fn(),
    },
  };
});

const mockCourses: ApiAdminCourse[] = [
  {
    id: 1,
    title: "Beginner Course",
    level: "All levels",
    summary: "Introductory course for beginners",
    description: "Learn the basics of rock climbing in a supportive environment",
    instructor: "John Doe",
    schedule: "Mon, Wed, Fri 09:00-11:00",
    duration_weeks: 4,
    capacity: 8,
    price_vnd: 2500000,
    is_active: true,
  },
  {
    id: 2,
    title: "Advanced Course",
    level: "Advanced",
    summary: "Advanced techniques and training",
    description: "For climbers looking to improve their skills",
    instructor: "Jane Smith",
    schedule: "Tue, Thu 14:00-16:00",
    duration_weeks: 8,
    capacity: 6,
    price_vnd: 4000000,
    is_active: true,
  },
  {
    id: 3,
    title: "Inactive Course",
    level: "All levels",
    summary: "This course is currently inactive",
    description: "Should not appear on the public site",
    instructor: "Bob Johnson",
    schedule: "Mon, Wed, Fri 10:00-12:00",
    duration_weeks: 2,
    capacity: 10,
    price_vnd: null,
    is_active: false,
  },
];

const sampleCourse = mockCourses[0]!;

function renderWithClient(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  vi.mocked(adminApi.courses).mockResolvedValue(mockCourses);
  vi.mocked(adminApi.createCourse).mockResolvedValue({ ...sampleCourse, id: 4 });
  vi.mocked(adminApi.updateCourse).mockResolvedValue({ ...sampleCourse, title: "Updated Course" });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("CoursesManagementPage", () => {
  it("renders loading state", () => {
    vi.mocked(adminApi.courses).mockImplementation(() => new Promise(() => {}));
    renderWithClient(<CoursesManagementPage />);
    expect(screen.getByText("Loading courses…")).toBeInTheDocument();
  });

  it("renders active and inactive courses", async () => {
    renderWithClient(<CoursesManagementPage />);
    await screen.findByText("Beginner Course");
    // At least one course should render as Active.
    const activeStatuses = screen.getAllByText("Active");
    expect(activeStatuses.length).toBeGreaterThan(0);
    expect(activeStatuses[0]).toBeInTheDocument();
    
    const inactiveStatus = screen.getByText("Inactive");
    expect(inactiveStatus).toBeInTheDocument();
    expect(inactiveStatus).toHaveClass("status-project");
  });

  it("shows price as 'Not set' when null", async () => {
    renderWithClient(<CoursesManagementPage />);
    await screen.findByText("Inactive Course");
    expect(screen.getByText("Not set")).toBeInTheDocument();
  });

  it("shows empty state when no courses", async () => {
    vi.mocked(adminApi.courses).mockResolvedValue([]);
    renderWithClient(<CoursesManagementPage />);
    await screen.findByText("No courses yet.");
    expect(screen.getByText("Create the first course below to start building the catalogue.")).toBeInTheDocument();
  });

  it("creates course with optional numeric fields and null price", async () => {
    renderWithClient(<CoursesManagementPage />);
    await screen.findByText("Create a new course");
    fireEvent.click(screen.getByRole("button", { name: "New course" }));
    
    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: "New Course" } });
    fireEvent.change(screen.getByLabelText(/^Summary/), { target: { value: "New summary" } });
    fireEvent.change(screen.getByLabelText(/^Instructor/), { target: { value: "New Instructor" } });
    fireEvent.change(screen.getByLabelText(/^Schedule/), { target: { value: "Tue, Thu 10:00-12:00" } });
    fireEvent.change(screen.getByPlaceholderText("1-52 (leave empty for null)"), { target: { value: "6" } });
    fireEvent.change(screen.getByPlaceholderText("1-100 (leave empty for null)"), { target: { value: "5" } });
    // Leave price empty to test null price
    
    fireEvent.click(screen.getByRole("button", { name: /Create course/ }));
    
    await screen.findByText("Course created.");
    expect(adminApi.createCourse).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "New Course",
        summary: "New summary",
        instructor: "New Instructor",
        schedule: "Tue, Thu 10:00-12:00",
        duration_weeks: 6,
        capacity: 5,
        price_vnd: null,
      })
    );
  });

  it("shows validation error for missing title", async () => {
    renderWithClient(<CoursesManagementPage />);
    await screen.findByText("Create a new course");
    fireEvent.click(screen.getByRole("button", { name: "New course" }));
    
    fireEvent.change(screen.getByLabelText(/^Summary/), { target: { value: "Test" } });
    fireEvent.submit(document.querySelector("form")!);
    
    await screen.findByText("Title is required.");
    expect(adminApi.createCourse).not.toHaveBeenCalled();
  });

  it("shows validation error for zero/negative duration", async () => {
    renderWithClient(<CoursesManagementPage />);
    await screen.findByText("Create a new course");
    fireEvent.click(screen.getByRole("button", { name: "New course" }));
    
    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: "Test" } });
    fireEvent.change(screen.getByPlaceholderText("1-52 (leave empty for null)"), { target: { value: "0" } });
    fireEvent.submit(document.querySelector("form")!);
    
    await screen.findByText("Duration weeks must be at least 1.");
  });

  it("shows validation error for zero/negative capacity", async () => {
    renderWithClient(<CoursesManagementPage />);
    await screen.findByText("Create a new course");
    fireEvent.click(screen.getByRole("button", { name: "New course" }));
    
    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: "Test" } });
    fireEvent.change(screen.getByPlaceholderText("1-100 (leave empty for null)"), { target: { value: "-1" } });
    // Submit with Enter or form submit
    const form = document.querySelector("form");
    if (form) fireEvent.submit(form);
    
    await screen.findByText("Capacity must be at least 1.");
  });

  it("shows validation error for negative price", async () => {
    renderWithClient(<CoursesManagementPage />);
    await screen.findByText("Create a new course");
    fireEvent.click(screen.getByRole("button", { name: "New course" }));
    
    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: "Test" } });
    fireEvent.change(screen.getByPlaceholderText("Leave empty for null"), { target: { value: "-100" } });
    const form = document.querySelector("form");
    if (form) fireEvent.submit(form);
    
    await screen.findByText("Price must be a non-negative number.");
  });

  it("edit sends only changed fields (including clearing price to null)", async () => {
    renderWithClient(<CoursesManagementPage />);
    await screen.findByText("Beginner Course");
    fireEvent.click(screen.getByRole("button", { name: "Edit Beginner Course" }));
    
    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: "Updated Course" } });
    fireEvent.change(screen.getByLabelText(/^Instructor/), { target: { value: "New Instructor" } });
    
    // Clear price (set to empty)
    fireEvent.change(screen.getByPlaceholderText("Leave empty for null"), { target: { value: "" } });
    
    fireEvent.click(screen.getByRole("button", { name: /Save changes/ }));
    
    await vi.waitFor(() =>
      expect(adminApi.updateCourse).toHaveBeenCalledWith(1, {
        title: "Updated Course",
        instructor: "New Instructor",
        price_vnd: null,
      })
    );
  });

  it("activates and deactivates course", async () => {
    renderWithClient(<CoursesManagementPage />);
    await screen.findByText("Inactive Course");
    fireEvent.click(screen.getByRole("button", { name: "Activate Inactive Course" }));
    await screen.findByRole("button", { name: "Activate" });
    fireEvent.click(screen.getByRole("button", { name: "Activate" }));
    
    await vi.waitFor(() =>
      expect(adminApi.updateCourse).toHaveBeenCalledWith(3, { is_active: true })
    );
  });

  it("deletes course after confirmation", async () => {
    renderWithClient(<CoursesManagementPage />);
    await screen.findByText("Beginner Course");
    fireEvent.click(screen.getByRole("button", { name: "Delete Beginner Course" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    
    await screen.findByText("Course deleted.");
    expect(adminApi.deleteCourse).toHaveBeenCalledWith(1);
  });

  it("shows API load error", async () => {
    vi.mocked(adminApi.courses).mockRejectedValue(new Error("API down"));
    renderWithClient(<CoursesManagementPage />);
    await screen.findByText("Courses could not be loaded.");
    expect(screen.getByRole("button", { name: /Retry/ })).toBeInTheDocument();
  });

  it("shows API mutation error", async () => {
    vi.mocked(adminApi.updateCourse).mockRejectedValueOnce(new ApiError("Invalid course data", 422));
    renderWithClient(<CoursesManagementPage />);
    await screen.findByText("Beginner Course");
    fireEvent.click(screen.getByRole("button", { name: "Edit Beginner Course" }));
    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: "Invalid" } });
    fireEvent.click(screen.getByRole("button", { name: /Save changes/ }));
    await screen.findByText("Invalid course data.");
  });
});