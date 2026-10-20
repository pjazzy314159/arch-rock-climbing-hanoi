import { createFileRoute } from "@tanstack/react-router";
import { LogbookPage } from "@/components/arch/member-pages";
import { pageHead } from "@/components/arch/metadata";
import { logbookQuery, routeQuery } from "@/services/arch";
export const Route = createFileRoute("/member_/logbook")({
  head: () =>
    pageHead(
      "My Logbook Preview",
      "A sample climbing logbook to track sends, attempts and projects.",
    ),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(logbookQuery),
      context.queryClient.ensureQueryData(routeQuery),
    ]);
  },
  component: LogbookPage,
});
