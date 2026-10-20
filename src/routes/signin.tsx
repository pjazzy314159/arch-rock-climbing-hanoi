import { createFileRoute } from "@tanstack/react-router";
import { SignInPage } from "@/components/arch/signin";
import { RouteLoading } from "@/components/arch/data-state";
import { pageHead } from "@/components/arch/metadata";
export const Route = createFileRoute("/signin")({
  head: () => pageHead("Member Sign In", "Sign in to your ARCH Rock Climbing Hanoi member area."),
  pendingComponent: RouteLoading,
  component: SignInPage,
});
