import { describe, expect, it } from "vitest";

import {
  toClimbRoute,
  toGymProfile,
  toOpeningHour,
  toProduct,
  toVoteTally,
  type ClimbRoute,
} from "@/services/arch";

/**
 * The service layer has to keep the sample data clearly separate from live
 * data. These tests cover the mapping between the backend's wire format and
 * the shapes the pages render.
 */

const apiRoute = {
  id: 7,
  name: "Quiet the Mind",
  grade: "V3",
  zone: "The Slab",
  color: "coral",
  style: "Balance",
  setter: "Minh",
  status: "active",
  set_at: "2026-10-14",
  beta: null,
  sends: 12,
  vote_count: 4,
  easier_votes: 1,
  as_set_votes: 2,
  harder_votes: 1,
  perceived_grade: "V3",
  is_fresh: true,
};

describe("route mapping", () => {
  it("copies the fields the route card needs", () => {
    const route: ClimbRoute = toClimbRoute(apiRoute);
    expect(route.id).toBe("7");
    expect(route.apiId).toBe(7);
    expect(route.name).toBe("Quiet the Mind");
    expect(route.grade).toBe("V3");
    expect(route.zone).toBe("The Slab");
    expect(route.sends).toBe(12);
    expect(route.fresh).toBe(true);
  });

  it("keeps a known hold colour", () => {
    expect(toClimbRoute(apiRoute).color).toBe("coral");
  });

  it("falls back to a known colour for an unknown one", () => {
    expect(toClimbRoute({ ...apiRoute, color: "chartreuse" }).color).toBe("lime");
  });

  it("keeps the community feedback separate from the official grade", () => {
    const route = toClimbRoute({ ...apiRoute, perceived_grade: "V4" });
    expect(route.grade).toBe("V3");
    expect(route.perceivedGrade).toBe("V4");
    expect(route.voteCount).toBe(4);
  });
});

describe("product mapping", () => {
  const apiProduct = {
    id: 3,
    sku: "ARC-EDG-01",
    name: "Edge Performance",
    brand: "ARCH Selection",
    category: "Performance",
    fit: "Aggressive",
    price_vnd: 2490000,
    description: "A precise, downturned shoe.",
    image_url: null,
    stock: 8,
    is_active: true,
  };

  it("uses the sku as the identifier so the shop links stay stable", () => {
    expect(toProduct(apiProduct).id).toBe("ARC-EDG-01");
  });

  it("keeps the price in Vietnamese đồng", () => {
    expect(toProduct(apiProduct).price).toBe(2490000);
  });
});

describe("gym mapping", () => {
  const apiGym = {
    name: "ARCH Rock Climbing Hanoi",
    tagline: "Rock climbing. Real connection.",
    address: "",
    phone: "",
    email: "",
    instagram: "",
    map_url: "",
    about: "An indoor bouldering gym.",
    surface_area_m2: 600,
    route_count: 64,
    opening_note: "Opening hours are to be confirmed by ARCH.",
    opening_hours: [
      {
        day_of_week: 0,
        opens_at: "09:00:00",
        closes_at: "21:00:00",
        note: "To be confirmed by ARCH",
        is_closed: true,
      },
    ],
    is_placeholder: true,
  };

  it("maps the opening hours", () => {
    const gym = toGymProfile(apiGym);
    expect(gym.openingHours).toHaveLength(1);
    expect(gym.openingHours[0]).toMatchObject({ dayOfWeek: 0, isClosed: true });
  });

  it("marks the record as a placeholder while it is unconfirmed", () => {
    expect(toGymProfile(apiGym).isPlaceholder).toBe(true);
  });

  it("handles a gym with no opening hours", () => {
    const gym = toGymProfile({ ...apiGym, opening_hours: [] });
    expect(gym.openingHours).toEqual([]);
  });
});

describe("vote tally mapping", () => {
  it("keeps the official grade and the perceived grade apart", () => {
    const tally = toVoteTally({
      route_id: 7,
      total: 4,
      easier: 1,
      as_set: 2,
      harder: 1,
      perceived_grade: "V3",
      official_grade: "V3",
    });
    expect(tally.officialGrade).toBe("V3");
    expect(tally.perceivedGrade).toBe("V3");
    expect(tally.total).toBe(4);
  });
});

describe("opening hours mapping", () => {
  it("keeps a closed day closed", () => {
    const hour = toOpeningHour({
      day_of_week: 6,
      opens_at: "09:00:00",
      closes_at: "21:00:00",
      note: "To be confirmed",
      is_closed: true,
    });
    expect(hour.isClosed).toBe(true);
    expect(hour.note).toBe("To be confirmed");
  });
});
