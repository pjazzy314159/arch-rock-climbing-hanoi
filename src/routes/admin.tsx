import { createFileRoute } from "@tanstack/react-router";
import { AdminPage } from "@/components/arch/member-pages";
import { pageHead } from "@/components/arch/metadata";
import { adminQuery, routeQuery } from "@/services/arch";
export const Route = createFileRoute("/admin")({
 head: () => pageHead('Admin Dashboard Preview', 'Read-only sample gym operations, members, routes and inventory.'),
 loader: async ({context}) => { await Promise.all([context.queryClient.ensureQueryData(adminQuery), context.queryClient.ensureQueryData(routeQuery)]); },
 component: AdminPage,
});
