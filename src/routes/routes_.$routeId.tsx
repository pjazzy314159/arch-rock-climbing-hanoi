import { createFileRoute, notFound } from "@tanstack/react-router";
import { RouteDetailPage } from "@/components/arch/route-pages";
import { RouteLoading } from "@/components/arch/data-state";
import { pageHead } from "@/components/arch/metadata";
import { api } from "@/services/api";
export const Route = createFileRoute("/routes_/$routeId")({
  loader: async ({ params }) => {
    try {
      return await api.route(params.routeId);
    } catch {
      throw notFound();
    }
  },
  head: ({ loaderData }) =>
    pageHead(
      loaderData?.name ?? "Route unavailable",
      loaderData?.style ?? "A route on the wall at ARCH Rock Climbing Hanoi.",
    ),
  pendingComponent: RouteLoading,
  component: RouteRoute,
});
function RouteRoute() {
  const { routeId } = Route.useParams();
  return <RouteDetailPage routeId={routeId} />;
}
