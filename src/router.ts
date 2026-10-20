import { QueryClient } from "@tanstack/react-query";
import { createRouter as createTanStackRouter } from "@tanstack/react-router";

import { routeTree } from "./routeTree.gen";

/**
 * TanStack Start router entry.
 *
 * The router is created per request on the server and once per browser tab on
 * the client. A fresh `QueryClient` is attached so server renders never share
 * cached data between requests.
 */
export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
      },
    },
  });

  return createTanStackRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: "intent",
    scrollRestoration: true,
  });
}

/** Alias kept for tooling that expects the `createRouter` naming convention. */
export const createRouter = getRouter;
