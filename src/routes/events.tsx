import { createFileRoute } from "@tanstack/react-router";
import { EventsPage } from "@/components/arch/content-pages";
import { RouteLoading } from "@/components/arch/data-state";
import { pageHead } from "@/components/arch/metadata";
import { eventQuery } from "@/services/arch";
export const Route = createFileRoute("/events")({
  head: () =>
    pageHead(
      "Events",
      "Community sessions, workshops and competitions at ARCH Rock Climbing Hanoi.",
    ),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(eventQuery);
  },
  pendingComponent: RouteLoading,
  component: EventsPage,
});
