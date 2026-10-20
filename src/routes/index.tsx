import { createFileRoute } from "@tanstack/react-router";
import { Home } from "@/components/arch/home";
import { pageHead } from "@/components/arch/metadata";
import { routeQuery } from "@/services/arch";
export const Route = createFileRoute("/")({
  head: () =>
    pageHead(
      "Home",
      "Find your next move. Bouldering, community and climbing shoes at ARCH Hanoi.",
    ),
  loader: async ({ context }) => {
    await Promise.all([context.queryClient.ensureQueryData(routeQuery)]);
  },
  component: Home,
});
