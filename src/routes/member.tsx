import { createFileRoute } from "@tanstack/react-router";
import { MemberPage } from "@/components/arch/member-pages";
import { pageHead } from "@/components/arch/metadata";
import { memberQuery, routeQuery } from "@/services/arch";
export const Route = createFileRoute("/member")({
  head: () =>
    pageHead(
      "My Climbing Dashboard",
      "Your routes on the wall, sends, flashes, projects, record by grade and where you stand.",
    ),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(memberQuery),
      context.queryClient.ensureQueryData(routeQuery),
    ]);
  },
  component: MemberPage,
});
