import { createFileRoute } from "@tanstack/react-router";
import { ShopPage } from "@/components/arch/public-pages";
import { pageHead } from "@/components/arch/metadata";
import { productQuery } from "@/services/arch";
export const Route = createFileRoute("/shop")({
 head: () => pageHead('Climbing Shoe Shop', 'Explore a considered selection of climbing shoes at ARCH Hanoi.'),
 loader: async ({context}) => { await Promise.all([context.queryClient.ensureQueryData(productQuery)]); },
 component: ShopPage,
});
