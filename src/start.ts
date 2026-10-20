import { createStart } from "@tanstack/react-start";
import { createCsrfMiddleware } from "@tanstack/react-start";

/**
 * TanStack Start global entry.
 *
 * The CSRF middleware protects server-function RPC endpoints, which are
 * same-origin POST endpoints and must not be callable cross-site.
 */
export const startInstance = createStart(() => ({
  requestMiddleware: [
    createCsrfMiddleware({
      filter: (ctx) => ctx.handlerType === "serverFn",
    }),
  ],
}));
