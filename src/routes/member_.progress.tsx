import { createFileRoute } from "@tanstack/react-router";
import { ProgressPage } from "@/components/arch/member-pages";
import { pageHead } from "@/components/arch/metadata";
export const Route = createFileRoute("/member_/progress")({
  head: () =>
    pageHead("My Progress Preview", "Review sample sends, milestones and climbing progress."),
  component: ProgressPage,
});
