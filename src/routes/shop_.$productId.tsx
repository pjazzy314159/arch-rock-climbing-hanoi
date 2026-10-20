import { createFileRoute, notFound } from '@tanstack/react-router';
import { ProductPage } from '@/components/arch/public-pages';
import { pageHead } from '@/components/arch/metadata';
import { archService } from '@/services/arch';
export const Route = createFileRoute('/shop_/$productId')({
 loader: async ({params}) => { const product = await archService.getProduct(params.productId); if(!product) throw notFound(); return product; },
 head: ({loaderData}) => pageHead(loaderData?.name ?? 'Product unavailable',loaderData?.description ?? 'This climbing shoe is not available in the sample collection.'),
 component: ProductRoute,
});
function ProductRoute(){const product=Route.useLoaderData();return <ProductPage product={product}/>}
