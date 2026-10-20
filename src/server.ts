import {
  createStartHandler,
  defaultStreamHandler,
  type RequestHandler,
} from "@tanstack/react-start/server";
import type { Register } from "@tanstack/react-router";

import { consumeLastCapturedError, describeError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

const handler = createStartHandler(defaultStreamHandler);

/**
 * TanStack Start server entry.
 *
 * The framework's default entry is wrapped so that an unexpected SSR failure
 * renders a small static error page instead of a stack trace. The real error is
 * still written to the server log.
 */
export type ServerEntry = { fetch: RequestHandler<Register> };

export function createServerEntry(entry: ServerEntry): ServerEntry {
  return {
    async fetch(...args) {
      try {
        return await entry.fetch(...args);
      } catch (error) {
        const captured = consumeLastCapturedError() ?? error;
        console.error(`[arch] Server render failed: ${describeError(captured)}`);

        return new Response(renderErrorPage(), {
          status: 500,
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }
    },
  };
}

export default createServerEntry({ fetch: handler });
