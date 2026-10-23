import { createFileRoute } from "@tanstack/react-router";

import { CustomerDetailPage } from "@/components/arch/customer-pages";
import { RouteLoading } from "@/components/arch/data-state";
import { pageHead } from "@/components/arch/metadata";

export const Route = createFileRoute("/admin_/customers/$customerId")({
  head: () =>
    pageHead("Customer record", "Account, safety agreement and climbing activity at ARCH."),
  pendingComponent: RouteLoading,
  component: CustomerDetailRoute,
});

function CustomerDetailRoute() {
  const { customerId } = Route.useParams();
  return <CustomerDetailPage customerId={Number(customerId)} />;
}
