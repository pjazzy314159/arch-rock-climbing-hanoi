import { createFileRoute } from "@tanstack/react-router";
import { GymPage } from "@/components/arch/public-pages";
import { pageHead } from "@/components/arch/metadata";
export const Route = createFileRoute("/gym")({
 head: () => pageHead('The Gym', 'Explore the climbing walls, training space and community at ARCH Hanoi.'),
 component: GymPage,
});
