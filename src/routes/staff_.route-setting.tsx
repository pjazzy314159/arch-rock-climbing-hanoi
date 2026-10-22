import { createFileRoute } from "@tanstack/react-router";
import { RouteSettingPage } from "@/components/arch/route-setting";
import { RouteLoading } from "@/components/arch/data-state";
import { pageHead } from "@/components/arch/metadata";
export const Route = createFileRoute("/staff_/route-setting")({
  head: () =>
    pageHead(
      "Route Setting",
      "Annotate holds on a wall photograph and publish a route sequence at ARCH Rock Climbing Hanoi.",
    ),
  pendingComponent: RouteLoading,
  component: RouteSettingPage,
});
