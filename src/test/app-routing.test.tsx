import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { routeTree } from "@/routeTree.gen";

// Match routes without running loaders or rendering: loaders may need a server or
// network the test run lacks, and jsdom never loads the stylesheets React waits on.
describe("App routing", () => {
  it.each([
    ["/gym", "/gym"],
    ["/tour", "/tour"],
    ["/routes", "/routes"],
    ["/shop", "/shop"],
    ["/shop/ARC-EDG-01", "/shop_/$productId"],
    ["/contact", "/contact"],
    ["/member", "/member"],
    ["/member/logbook", "/member_/logbook"],
    ["/member/beta", "/member_/beta"],
    ["/member/progress", "/member_/progress"],
    ["/admin", "/admin"],
  ])("matches %s to its own page", (path, routeId) => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    expect(router.matchRoutes(path).at(-1)?.routeId).toBe(routeId);
  });

  it("matches a page for / instead of falling back to not found", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

    const matches = router.matchRoutes("/");

    expect(matches.at(-1)?.routeId).not.toBe(rootRouteId);
  });
});
