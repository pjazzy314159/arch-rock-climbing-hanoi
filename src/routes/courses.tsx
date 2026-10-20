import { createFileRoute } from "@tanstack/react-router";
import { CoursesPage } from "@/components/arch/content-pages";
import { RouteLoading } from "@/components/arch/data-state";
import { pageHead } from "@/components/arch/metadata";
import { courseQuery } from "@/services/arch";
export const Route = createFileRoute("/courses")({
  head: () =>
    pageHead("Courses", "Climbing courses and coaching programmes at ARCH Rock Climbing Hanoi."),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(courseQuery);
  },
  pendingComponent: RouteLoading,
  component: CoursesPage,
});
