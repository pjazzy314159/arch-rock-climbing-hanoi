import { createFileRoute } from "@tanstack/react-router";
import { AdminDashboardPage } from "@/components/arch/staff-pages";
import { RouteLoading } from "@/components/arch/data-state";
import { pageHead } from "@/components/arch/metadata";
export const Route = createFileRoute("/admin")({
  head: () =>
    pageHead("Operations", "Members, routes, tasks and events at ARCH Rock Climbing Hanoi."),
  pendingComponent: RouteLoading,
  component: AdminDashboardPage,
});
