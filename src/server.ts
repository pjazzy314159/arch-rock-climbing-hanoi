import { createStartHandler, defaultStreamHandler } from "@tanstack/react-start/server";

import { consumeLastCapturedError, describeError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

const handler = createStartHandler(defaultStreamHandler);

/**
 * TanStack Start server entry.
 *
 * Wraps the framework handler so an unexpected SSR failure renders a small
 * static error page instead of leaking a stack trace to the browser. The real
 * error is still written to the server log.
 */
export default {
  async fetch(request: Request): Promise<Response> {
    try {
      return await handler(request);
    } catch (error) {
      const captured = consumeLastCapturedError() ?? error;
      console.error(`[arch] Server render failed for ${request.url}: ${describeError(captured)}`);

      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
