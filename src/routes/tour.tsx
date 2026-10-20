import { createFileRoute } from "@tanstack/react-router";
import { TourPage } from "@/components/arch/public-pages";
import { pageHead } from "@/components/arch/metadata";
export const Route = createFileRoute("/tour")({
 head: () => pageHead('360 Virtual Tour', 'Get a photographic preview of ARCH’s climbing walls and gym space.'),
 component: TourPage,
});
