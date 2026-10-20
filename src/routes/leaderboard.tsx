import { createFileRoute } from "@tanstack/react-router";
import { LeaderboardPage } from "@/components/arch/route-pages";
import { RouteLoading } from "@/components/arch/data-state";
import { pageHead } from "@/components/arch/metadata";
import { leaderboardQuery } from "@/services/arch";
export const Route = createFileRoute("/leaderboard")({
  head: () =>
    pageHead("Leaderboard", "The ARCH community leaderboard: sends, best grades and scores."),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(leaderboardQuery);
  },
  pendingComponent: RouteLoading,
  component: LeaderboardPage,
});
