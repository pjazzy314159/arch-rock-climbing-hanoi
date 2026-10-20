import { createFileRoute } from "@tanstack/react-router";
import { BetaPage } from "@/components/arch/member-pages";
import { pageHead } from "@/components/arch/metadata";
import { routeQuery } from "@/services/arch";
export const Route = createFileRoute("/member_/beta")({
 head: () => pageHead('Route Beta Explorer Preview', 'Explore sample climbing beta and route details.'),
 validateSearch: (search: Record<string, unknown>): { route?: string } => typeof search['route'] === "string" ? {route:search['route']} : {},
 loader: async ({context}) => { await Promise.all([context.queryClient.ensureQueryData(routeQuery)]); },
 component: BetaRoute,
});
function BetaRoute(){const {route}=Route.useSearch();return <BetaPage selectedId={route}/>;}
