import { createFileRoute, notFound } from "@tanstack/react-router";
import { ProductPage } from "@/components/arch/public-pages";
import { RouteLoading } from "@/components/arch/data-state";
import { pageHead } from "@/components/arch/metadata";
import { archService } from "@/services/arch";
export const Route = createFileRoute("/shop_/$productId")({
  loader: async ({ params }) => {
    const product = await archService.getProduct(params.productId);
    if (!product.data) throw notFound();
    return product;
  },
  head: ({ loaderData }) =>
    pageHead(
      loaderData?.data?.name ?? "Product unavailable",
      loaderData?.data?.description ?? "This climbing shoe is not available in the collection.",
    ),
  pendingComponent: RouteLoading,
  component: ProductRoute,
});
function ProductRoute() {
  const product = Route.useLoaderData();
  if (!product.data) throw notFound();
  return <ProductPage product={product.data} source={product.source} />;
}
