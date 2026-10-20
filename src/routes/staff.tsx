import { createFileRoute } from "@tanstack/react-router";
import { StaffTasksPage } from "@/components/arch/staff-pages";
import { RouteLoading } from "@/components/arch/data-state";
import { pageHead } from "@/components/arch/metadata";
export const Route = createFileRoute("/staff")({
  head: () => pageHead("Staff Tasks", "Tasks assigned to you at ARCH Rock Climbing Hanoi."),
  pendingComponent: RouteLoading,
  component: StaffTasksPage,
});
