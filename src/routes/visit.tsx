import { createFileRoute } from "@tanstack/react-router";
import { VisitPage } from "@/components/arch/content-pages";
import { RouteLoading } from "@/components/arch/data-state";
import { pageHead } from "@/components/arch/metadata";
import { gymQuery, priceQuery, ruleQuery } from "@/services/arch";
export const Route = createFileRoute("/visit")({
  head: () =>
    pageHead(
      "Plan Your Visit",
      "Opening hours, prices and gym rules for ARCH Rock Climbing Hanoi.",
    ),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(gymQuery),
      context.queryClient.ensureQueryData(priceQuery),
      context.queryClient.ensureQueryData(ruleQuery),
    ]);
  },
  pendingComponent: RouteLoading,
  component: VisitPage,
});
