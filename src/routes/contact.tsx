import { createFileRoute } from "@tanstack/react-router";
import { ContactPage } from "@/components/arch/public-pages";
import { pageHead } from "@/components/arch/metadata";
export const Route = createFileRoute("/contact")({
 head: () => pageHead('Contact', 'Plan your first climb or ask about shoe fitting at ARCH Hanoi.'),
 component: ContactPage,
});
