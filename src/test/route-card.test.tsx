import { fireEvent, render, screen } from "@testing-library/react";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RouteCard } from "@/components/arch/shared";
import type { ClimbRoute } from "@/services/arch";

/**
 * The route card.
 *
 * A card must say what the route is: its name, grade, wall, wall type and
 * status, and it must link to the route page. It must also survive the
 * pictures that are missing: the route's own picture, then the wall's, then
 * a labelled placeholder. A route that has been archived is never shown as
 * if it were still on the wall.
 */

function route(overrides: Partial<ClimbRoute> = {}): ClimbRoute {
  return {
    id: "7",
    apiId: 7,
    name: "Sloper Opera",
    grade: "V4",
    wall: "The Cave",
    wallId: 2,
    wallImageUrl: null,
    wallType: "overhang",
    color: "coral",
    style: "Steep and technical",
    setter: "Minh",
    status: "active",
    fresh: false,
    sends: 9,
    voteCount: 3,
    perceivedGrade: null,
    imageUrl: null,
    ...overrides,
  };
}

/** Render a card inside a real router, so the link is inspectable. */
async function renderCard(card: ClimbRoute) {
  const rootRoute = createRootRoute();
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <RouteCard route={card} />,
  });
  const routeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/routes/$routeId",
    component: () => null,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, routeRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });

  render(<RouterProvider router={router} />);
  await screen.findByText(card.name);
  return router;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The route photograph, if one is showing. */
function routePhoto(): HTMLImageElement | null {
  return document.querySelector(".route-photo");
}

describe("the route card", () => {
  it("shows the name, grade, wall and wall type", async () => {
    await renderCard(route());

    const card = screen.getByText("Sloper Opera").closest<HTMLElement>(".route-card");
    if (!(card instanceof HTMLElement)) throw new Error("No route card");

    expect(card.textContent).toContain("V4");
    expect(card.textContent).toContain("The Cave");
    expect(card.textContent).toContain("Overhang");
  });

  it("links to the route page", async () => {
    await renderCard(route());

    const link = screen.getByText("Sloper Opera").closest<HTMLElement>("a");
    if (!(link instanceof HTMLAnchorElement)) throw new Error("No route link");
    expect(link.getAttribute("href")).toBe("/routes/7");
  });

  it("states that the wall is to be confirmed when there is none", async () => {
    await renderCard(route({ wall: "", wallId: null }));

    expect(screen.getByText("Wall to be confirmed")).toBeTruthy();
  });

  it("marks a recently set route as new", async () => {
    await renderCard(route({ fresh: true }));

    expect(screen.getByText("NEW SET")).toBeTruthy();
  });

  it("marks an archived route rather than presenting it as active", async () => {
    await renderCard(route({ status: "archived", fresh: false }));

    const card = screen.getByText("Sloper Opera").closest<HTMLElement>(".route-card");
    if (!(card instanceof HTMLElement)) throw new Error("No route card");

    expect(card.classList.contains("route-card-archived")).toBe(true);
    expect(screen.getByText("ARCHIVED")).toBeTruthy();
    // The card is not mistaken for a fresh route.
    expect(screen.queryByText("NEW SET")).toBeNull();
  });

  it("marks a route that is being reset", async () => {
    await renderCard(route({ status: "pending_reset" }));

    expect(screen.getByText("BEING RESET")).toBeTruthy();
  });

  it("shows the route's own picture when there is one", async () => {
    await renderCard(route({ imageUrl: "https://example.com/route.jpg" }));

    const image = routePhoto();
    if (!(image instanceof HTMLImageElement)) throw new Error("No route photograph");
    expect(image.getAttribute("src")).toBe("https://example.com/route.jpg");
    // No placeholder note while a picture is showing.
    expect(screen.queryByText("No photo yet")).toBeNull();
  });

  it("falls back to the wall's picture before the placeholder", async () => {
    await renderCard(route({ imageUrl: null, wallImageUrl: "https://example.com/wall.jpg" }));

    const image = routePhoto();
    if (!(image instanceof HTMLImageElement)) throw new Error("No route photograph");
    expect(image.getAttribute("src")).toBe("https://example.com/wall.jpg");
  });

  it("shows a labelled placeholder when no picture exists", async () => {
    await renderCard(route());

    expect(routePhoto()).toBeNull();
    expect(screen.getByText("No photo yet")).toBeTruthy();
  });

  it("drops a picture that fails and falls back instead of showing a broken image", async () => {
    await renderCard(
      route({
        imageUrl: "https://example.com/broken.jpg",
        wallImageUrl: "https://example.com/wall.jpg",
      }),
    );

    const image = routePhoto();
    if (!(image instanceof HTMLImageElement)) throw new Error("No route photograph");
    fireEvent.error(image);
    // The failing route picture is replaced by the wall's photograph.
    await screen.findByText("Sloper Opera");
    const fallback = routePhoto();
    if (!(fallback instanceof HTMLImageElement)) throw new Error("No fallback photograph");
    expect(fallback.getAttribute("src")).toBe("https://example.com/wall.jpg");
  });

  it("shows the labelled placeholder when every picture fails", async () => {
    await renderCard(route({ imageUrl: "https://example.com/broken.jpg" }));

    const image = routePhoto();
    if (!(image instanceof HTMLImageElement)) throw new Error("No route photograph");
    fireEvent.error(image);

    await screen.findByText("No photo yet");
    expect(routePhoto()).toBeNull();
  });
});
