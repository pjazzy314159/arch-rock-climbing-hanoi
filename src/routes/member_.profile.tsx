import { createFileRoute } from "@tanstack/react-router";
import { ProfilePage } from "@/components/arch/member-pages";
import { RouteLoading } from "@/components/arch/data-state";
import { pageHead } from "@/components/arch/metadata";
export const Route = createFileRoute("/member_/profile")({
  head: () => pageHead("My Profile", "Your ARCH membership details, climbing level and password."),
  pendingComponent: RouteLoading,
  component: ProfilePage,
});
