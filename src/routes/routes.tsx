import { createFileRoute } from "@tanstack/react-router";
import { RoutesPage } from "@/components/arch/public-pages";
import { pageHead } from "@/components/arch/metadata";
import { routeQuery } from "@/services/arch";
export const Route = createFileRoute("/routes")({
 head: () => pageHead('Climbing Routes', 'Discover routes by grade, wall and climbing style at ARCH Hanoi.'),
 loader: async ({context}) => { await Promise.all([context.queryClient.ensureQueryData(routeQuery)]); },
 component: RoutesPage,
});
