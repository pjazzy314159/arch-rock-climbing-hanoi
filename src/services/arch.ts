/**
 * Content service for the ARCH website.
 *
 * Everything the pages render comes through here. Each call returns a
 * `Resource<T>` that says where the data came from:
 *
 * - `source: "api"`    - live data from the ARCH backend.
 * - `source: "sample"` - the backend could not be reached, so the page is
 *   showing the bundled sample data. `error` explains why.
 *
 * The sample data is only ever a stand-in for content that already existed in
 * the original concept site. Nothing here invents prices, opening hours,
 * courses or events: where no confirmed information exists the fallback is
 * empty and the page says so.
 */

import { api, ApiError, ApiUnavailableError, memberApi } from "./api";
import type { RouteFilterParams } from "./api";
import type {
  ApiAgreement,
  ApiAchievement,
  ApiCatalogProduct,
  ApiCourse,
  ApiDashboard,
  ApiEvent,
  ApiFaqEntry,
  ApiGym,
  ApiLeaderboardEntry,
  ApiLeaderboardRules,
  ApiOpeningHour,
  ApiPrice,
  ApiRouteSummary,
  ApiRule,
  ApiService,
  ApiVoteTally,
} from "./types";

/* -------------------------------------------------------------------------- */
/* Shapes used by the UI                                                      */
/* -------------------------------------------------------------------------- */

export type ClimbRoute = {
  id: string;
  apiId: number;
  name: string;
  grade: string;
  /** The wall the route is set on. */
  wall: string;
  wallId: number | null;
  /** The photograph of the wall, when the gym has published one. */
  wallImageUrl: string | null;
  /** The kind of surface the problem is set on. */
  wallType: WallType;
  color: "lime" | "coral" | "blue" | "yellow";
  style: string;
  setter: string;
  status: RouteStatus;
  fresh: boolean;
  sends: number;
  voteCount: number;
  perceivedGrade: string | null;
  imageUrl: string | null;
};

export type Product = {
  id: string;
  apiId: number;
  name: string;
  brand: string;
  category: string;
  price: number;
  fit: string;
  description: string;
  stock: number;
  /** A reference to a picture of the shoe, if the shop published one. */
  imageUrl: string | null;
};

export type LogEntry = {
  id: string;
  route: string;
  grade: string;
  date: string;
  result: "Sent" | "Project";
  attempts: number;
  notes: string;
};

export type MemberSummary = {
  displayName: string;
  initials: string;
  membership: string;
  totalSends: number;
  sessions: number;
  bestGrade: string;
  activeProjects: number;
};

export type AdminSummary = {
  members: number;
  checkIns: number;
  activeRoutes: number;
  products: number;
};

export type OpeningHour = {
  dayOfWeek: number;
  opensAt: string | null;
  closesAt: string | null;
  note: string;
  isClosed: boolean;
};

export type GymProfile = {
  name: string;
  tagline: string;
  address: string;
  phone: string;
  email: string;
  instagram: string;
  mapUrl: string;
  about: string;
  surfaceAreaM2: number | null;
  routeCount: number | null;
  openingNote: string;
  openingHours: OpeningHour[];
  /** True while ARCH has not published the real contact details yet. */
  isPlaceholder: boolean;
};

export type Price = {
  id: number;
  category: string;
  name: string;
  description: string;
  amountVnd: number;
  unit: string;
  sortOrder: number;
};

export type Service = {
  id: number;
  title: string;
  summary: string;
  icon: string;
  sortOrder: number;
};

export type Course = {
  id: number;
  title: string;
  level: string;
  summary: string;
  description: string;
  instructor: string;
  schedule: string;
  durationWeeks: number | null;
  capacity: number | null;
  priceVnd: number | null;
};

export type Event = {
  id: number;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string | null;
  location: string;
  capacity: number | null;
};

export type Rule = {
  id: number;
  title: string;
  body: string;
  category: string;
  sortOrder: number;
  /** False while ARCH has not approved the wording yet. */
  isConfirmed: boolean;
};

export type FaqEntry = {
  id: number;
  question: string;
  answer: string;
  category: string;
  keywords: string;
};

export type LeaderboardEntry = {
  rank: number;
  displayName: string;
  totalSends: number;
  bestGrade: string | null;
  score: number;
};

/**
 * The ranking's own explanation.
 *
 * These are the backend's words, fetched from the ranking code. There is no
 * sample copy behind them: if the API cannot be reached the page says so
 * rather than describing a rule the numbers were not worked out with.
 */
export type LeaderboardRules = {
  scoringRule: string;
  percentileRule: string;
};

export type VoteTally = {
  routeId: number;
  total: number;
  easier: number;
  asSet: number;
  harder: number;
  perceivedGrade: string | null;
  officialGrade: string;
};

export type Agreement = {
  id: number;
  version: string;
  status: "pending" | "signed" | "waived" | "expired";
  method: string | null;
  signedAt: string | null;
  signedName: string | null;
  notes: string | null;
};

/** How the member's logged climbs break down. */
export type DashboardOutcomes = {
  sends: number;
  /** The sends that were climbed on the first attempt. A subset of `sends`. */
  flashes: number;
  projects: number;
  attempts: number;
};

/** One grade in the member's own record. */
export type DashboardGradeStat = {
  grade: string;
  sends: number;
  flashes: number;
  projects: number;
};

/** Where the member stands, together with the rule that produced it. */
export type DashboardRanking = {
  /** `null` when the member is not ranked, which is not the same as rank 0. */
  rank: number | null;
  rankedCount: number;
  ahead: number;
  /** `null` when the member is not ranked. */
  percentile: number | null;
  score: number;
  totalSends: number;
  bestGrade: string | null;
  /** The scoring rule in words, as the backend applied it. */
  scoringRule: string;
  /** How the percentile is worked out, in words. */
  percentileRule: string;
};

/** One of the member's most recent logged climbs. */
export type DashboardAttempt = {
  id: string;
  routeId: number | null;
  route: string;
  grade: string;
  result: "sent" | "project";
  attempts: number;
  date: string;
  /** True when the climb was a send on the first attempt. */
  isFlash: boolean;
};

/**
 * The member's own picture of their climbing.
 *
 * Every field comes from the backend's own records. A value that is not
 * available is `null`, never zero, so the interface can tell "there is
 * nothing here yet" from "the number is zero".
 */
export type MemberDashboard = {
  /** How many routes are on the wall at the gym right now. */
  activeRoutes: number;
  totalSends: number;
  totalSessions: number;
  bestGrade: string | null;
  activeProjects: number;
  outcomes: DashboardOutcomes;
  byGrade: DashboardGradeStat[];
  ranking: DashboardRanking;
  recentAttempts: DashboardAttempt[];
  /** False for a member who has never logged a climb. */
  hasActivity: boolean;
  firstClimb: string | null;
  lastClimb: string | null;
  agreementStatus: string | null;
};

/** Where a piece of data came from. */
export type DataSource = "api" | "sample";

export type Resource<T> = {
  data: T;
  source: DataSource;
  /** Set when the backend could not be used. */
  error?: string;
  /** True when the backend answered, but the collection is empty. */
  isEmpty?: boolean;
  /**
   * True when the backend could not be reached and there is nothing to show.
   *
   * It is different from `isEmpty`: an empty collection is an answer, while
   * an unavailable one is a failure to answer.
   */
  isUnavailable?: boolean;
};

/** A wall the route directory can be filtered by. */
export type RouteFilterWall = {
  id: number;
  name: string;
  imageUrl: string | null;
};

/** The values the route directory can be filtered by. */
export type RouteFilterOptions = {
  grades: string[];
  walls: RouteFilterWall[];
  wallTypes: WallType[];
  statuses: RouteStatus[];
};

/**
 * The filters the route directory is narrowed by.
 *
 * The backend applies them, so each one is a plain value: a React Query
 * context object is never passed as a filter.
 */
export type RouteFilters = {
  grade?: string | null;
  wall?: string | null;
  wallId?: number | null;
  wallType?: string | null;
  status?: string | null;
  search?: string | null;
  freshOnly?: boolean;
};

/* -------------------------------------------------------------------------- */
/* Sample data (carried over from the original concept site)                  */
/* -------------------------------------------------------------------------- */

export const mockRoutes: ClimbRoute[] = [
  {
    id: "r1",
    apiId: 0,
    name: "Quiet the Mind",
    grade: "V3",
    wall: "The Slab",
    wallId: 3,
    wallType: "slab",
    color: "lime",
    style: "Balance · Technical",
    setter: "Minh",
    fresh: true,
    sends: 24,
    voteCount: 0,
    perceivedGrade: null,
    status: "active",
    imageUrl: null,
    wallImageUrl: null,
  },
  {
    id: "r2",
    apiId: 0,
    name: "Against the Grain",
    grade: "V5",
    wall: "The Cave",
    wallId: 1,
    wallType: "overhang",
    color: "coral",
    style: "Power · Overhang",
    setter: "Linh",
    fresh: true,
    sends: 12,
    voteCount: 0,
    perceivedGrade: null,
    status: "active",
    imageUrl: null,
    wallImageUrl: null,
  },
  {
    id: "r3",
    apiId: 0,
    name: "Little by Little",
    grade: "V1",
    wall: "The Main Wall",
    wallId: 2,
    wallType: "vertical",
    color: "blue",
    style: "Flow · Beginner-friendly",
    setter: "An",
    fresh: false,
    sends: 68,
    voteCount: 0,
    perceivedGrade: null,
    status: "active",
    imageUrl: null,
    wallImageUrl: null,
  },
  {
    id: "r4",
    apiId: 0,
    name: "Trust Your Feet",
    grade: "V4",
    wall: "The Slab",
    wallId: 3,
    wallType: "slab",
    color: "yellow",
    style: "Footwork · Technical",
    setter: "Minh",
    fresh: true,
    sends: 19,
    voteCount: 0,
    perceivedGrade: null,
    status: "active",
    imageUrl: null,
    wallImageUrl: null,
  },
  {
    id: "r5",
    apiId: 0,
    name: "After Hours",
    grade: "V6",
    wall: "The Cave",
    wallId: 1,
    wallType: "overhang",
    color: "blue",
    style: "Compression · Power",
    setter: "Linh",
    fresh: false,
    sends: 7,
    voteCount: 0,
    perceivedGrade: null,
    status: "active",
    imageUrl: null,
    wallImageUrl: null,
  },
  {
    id: "r6",
    apiId: 0,
    name: "First Ascent",
    grade: "V0",
    wall: "The Main Wall",
    wallId: 2,
    wallType: "vertical",
    color: "coral",
    style: "Beginner-friendly · Flow",
    setter: "An",
    fresh: true,
    sends: 91,
    voteCount: 0,
    perceivedGrade: null,
    status: "active",
    imageUrl: null,
    wallImageUrl: null,
  },
];

export const mockProducts: Product[] = [
  {
    id: "ARC-EDG-01",
    apiId: 0,
    name: "Edge Performance",
    brand: "ARCH Selection",
    category: "Performance",
    price: 2490000,
    fit: "Aggressive",
    description:
      "A precise, downturned shoe for steep terrain and small footholds. A dual-strap closure keeps the fit secure, while a sensitive midsole brings you closer to every move.",
    stock: 8,
    imageUrl: null,
  },
  {
    id: "ARC-FLW-01",
    apiId: 0,
    name: "Flow All-round",
    brand: "ARCH Selection",
    category: "All-round",
    price: 1890000,
    fit: "Moderate",
    description:
      "Comfort meets precision. A versatile climbing shoe for longer sessions, developing technique and finding your flow on any wall.",
    stock: 12,
    imageUrl: null,
  },
  {
    id: "ARC-STA-01",
    apiId: 0,
    name: "Start Essential",
    brand: "ARCH Selection",
    category: "Beginner",
    price: 1290000,
    fit: "Neutral",
    description:
      "An easy-wearing, supportive shoe for your first moves. A neutral profile and forgiving fit let you focus on the climb.",
    stock: 4,
    imageUrl: null,
  },
];

export const initialLogbook: LogEntry[] = [
  {
    id: "l1",
    route: "Quiet the Mind",
    grade: "V3",
    date: "2026-10-14",
    result: "Sent",
    attempts: 3,
    notes: "Trusting the left foot made all the difference.",
  },
  {
    id: "l2",
    route: "Against the Grain",
    grade: "V5",
    date: "2026-10-14",
    result: "Project",
    attempts: 6,
    notes: "Working on the final move.",
  },
  {
    id: "l3",
    route: "Little by Little",
    grade: "V1",
    date: "2026-10-12",
    result: "Sent",
    attempts: 1,
    notes: "Warm-up lap.",
  },
];

/**
 * The facility descriptions the concept site already published. They are used
 * when the backend is unreachable so the page keeps its shape; the live list
 * comes from the backend.
 */
export const mockServices: Service[] = [
  {
    id: 0,
    title: "Walls for every climber",
    summary:
      "From approachable slabs to powerful overhangs. Find your flow on a variety of wall angles and climbing styles.",
    icon: "mountain",
    sortOrder: 1,
  },
  {
    id: 0,
    title: "Your people are here",
    summary:
      "Share a beta, celebrate a send, or take your first step. Our community makes every session a little better.",
    icon: "users",
    sortOrder: 2,
  },
  {
    id: 0,
    title: "Room to grow",
    summary:
      "Warm-up areas, a training zone, and fresh route setting keep your sessions challenging and rewarding.",
    icon: "dumbbell",
    sortOrder: 3,
  },
];

const mockMember: MemberSummary = {
  displayName: "Alex Nguyen",
  initials: "AN",
  membership: "Monthly pass",
  totalSends: 42,
  sessions: 18,
  bestGrade: "V5",
  activeProjects: 3,
};

const mockAdmin: AdminSummary = {
  members: 248,
  checkIns: 36,
  activeRoutes: 64,
  products: 12,
};

const mockGym: GymProfile = {
  name: "ARCH Rock Climbing Hanoi",
  tagline: "Rock climbing. Real connection.",
  address: "",
  phone: "",
  email: "",
  instagram: "",
  mapUrl: "",
  about: "",
  surfaceAreaM2: 600,
  routeCount: 64,
  openingNote: "Opening hours are to be confirmed by ARCH.",
  openingHours: [],
  isPlaceholder: true,
};

/* -------------------------------------------------------------------------- */
/* Mapping                                                                    */
/* -------------------------------------------------------------------------- */

const ROUTE_COLORS = ["lime", "coral", "blue", "yellow"] as const;
type RouteColor = (typeof ROUTE_COLORS)[number];

export const WALL_TYPES = ["slab", "vertical", "overhang", "roof", "boulder"] as const;
export type WallType = (typeof WALL_TYPES)[number];

export const ROUTE_STATUSES = ["active", "archived", "pending_reset"] as const;
export type RouteStatus = (typeof ROUTE_STATUSES)[number];

/** Human labels for the wall types, used in the interface. */
export const WALL_TYPE_LABELS: Record<WallType, string> = {
  slab: "Slab",
  vertical: "Vertical",
  overhang: "Overhang",
  roof: "Roof",
  boulder: "Boulder",
};

/** Human labels for the route statuses. */
export const ROUTE_STATUS_LABELS: Record<RouteStatus, string> = {
  active: "On the wall",
  archived: "Archived",
  pending_reset: "Being reset",
};

function toRouteColor(value: string): RouteColor {
  return ROUTE_COLORS.find((color) => color === value) ?? "lime";
}

function toWallType(value: string): WallType {
  return WALL_TYPES.find((type) => type === value) ?? "vertical";
}

function toRouteStatus(value: string): RouteStatus {
  return ROUTE_STATUSES.find((status) => status === value) ?? "active";
}

export function toClimbRoute(route: ApiRouteSummary): ClimbRoute {
  return {
    id: String(route.id),
    apiId: route.id,
    name: route.name,
    grade: route.grade,
    wall: route.wall ?? "",
    wallId: route.wall_id ?? null,
    wallType: toWallType(route.wall_type),
    color: toRouteColor(route.color),
    style: route.style,
    setter: route.setter,
    status: toRouteStatus(route.status),
    fresh: route.is_fresh,
    sends: route.sends,
    voteCount: route.vote_count,
    perceivedGrade: route.perceived_grade,
    imageUrl: route.image_url ?? null,
    wallImageUrl: route.wall_image_url ?? null,
  };
}

export function toProduct(product: ApiCatalogProduct): Product {
  return {
    id: product.sku || String(product.id),
    apiId: product.id,
    name: product.name,
    brand: product.brand,
    category: product.category,
    price: product.price_vnd,
    fit: product.fit,
    description: product.description,
    stock: product.stock,
    imageUrl: product.image_url ?? null,
  };
}

export function toOpeningHour(hour: ApiOpeningHour): OpeningHour {
  return {
    dayOfWeek: hour.day_of_week,
    opensAt: hour.opens_at,
    closesAt: hour.closes_at,
    note: hour.note,
    isClosed: hour.is_closed,
  };
}

export function toGymProfile(gym: ApiGym): GymProfile {
  return {
    name: gym.name,
    tagline: gym.tagline,
    address: gym.address,
    phone: gym.phone,
    email: gym.email,
    instagram: gym.instagram,
    mapUrl: gym.map_url,
    about: gym.about,
    surfaceAreaM2: gym.surface_area_m2,
    routeCount: gym.route_count,
    openingNote: gym.opening_note,
    openingHours: (gym.opening_hours ?? []).map(toOpeningHour),
    isPlaceholder: gym.is_placeholder,
  };
}

export function toPrice(price: ApiPrice): Price {
  return {
    id: price.id,
    category: price.category,
    name: price.name,
    description: price.description,
    amountVnd: price.amount_vnd,
    unit: price.unit,
    sortOrder: price.sort_order,
  };
}

export function toService(service: ApiService): Service {
  return {
    id: service.id,
    title: service.title,
    summary: service.summary,
    icon: service.icon,
    sortOrder: service.sort_order,
  };
}

export function toCourse(course: ApiCourse): Course {
  return {
    id: course.id,
    title: course.title,
    level: course.level,
    summary: course.summary,
    description: course.description,
    instructor: course.instructor,
    schedule: course.schedule,
    durationWeeks: course.duration_weeks,
    capacity: course.capacity,
    priceVnd: course.price_vnd,
  };
}

export function toEvent(event: ApiEvent): Event {
  return {
    id: event.id,
    title: event.title,
    description: event.description,
    startsAt: event.starts_at,
    endsAt: event.ends_at,
    location: event.location,
    capacity: event.capacity,
  };
}

export function toRule(rule: ApiRule): Rule {
  return {
    id: rule.id,
    title: rule.title,
    body: rule.body,
    category: rule.category,
    sortOrder: rule.sort_order,
    isConfirmed: rule.is_confirmed,
  };
}

export function toFaqEntry(entry: ApiFaqEntry): FaqEntry {
  return {
    id: entry.id,
    question: entry.question,
    answer: entry.answer,
    category: entry.category,
    keywords: entry.keywords,
  };
}

export function toLeaderboardEntry(entry: ApiLeaderboardEntry): LeaderboardEntry {
  return {
    rank: entry.rank,
    displayName: entry.display_name,
    totalSends: entry.total_sends,
    bestGrade: entry.best_grade,
    score: entry.score,
  };
}

export function toLeaderboardRules(rules: ApiLeaderboardRules): LeaderboardRules {
  return {
    scoringRule: rules.scoring_rule,
    percentileRule: rules.percentile_rule,
  };
}

export function toVoteTally(tally: ApiVoteTally): VoteTally {
  return {
    routeId: tally.route_id,
    total: tally.total,
    easier: tally.easier,
    asSet: tally.as_set,
    harder: tally.harder,
    perceivedGrade: tally.perceived_grade,
    officialGrade: tally.official_grade,
  };
}

/* -------------------------------------------------------------------------- */
/* Loading with an explicit fallback                                          */
/* -------------------------------------------------------------------------- */

function describeFailure(error: unknown, subject: string): string {
  if (error instanceof ApiUnavailableError) {
    return `${subject} could not be loaded because the ARCH service is not reachable.`;
  }
  if (error instanceof ApiError) {
    return `${subject} could not be loaded (the service replied with ${error.status}).`;
  }
  return `${subject} could not be loaded.`;
}

/**
 * Run a read and fall back to sample data when the backend is unusable.
 *
 * The fallback is never silently presented as live data: the result always
 * carries its `source` so the UI can label it.
 */
async function load<T>(
  subject: string,
  fetcher: () => Promise<T>,
  fallback: T,
  isEmptyWhen: (value: T) => boolean = () => false,
): Promise<Resource<T>> {
  try {
    const data = await fetcher();
    return { data, source: "api", isEmpty: isEmptyWhen(data) };
  } catch (error) {
    return { data: fallback, source: "sample", error: describeFailure(error, subject) };
  }
}

/**
 * Run a read that answers a filter.
 *
 * Unlike `load`, this never substitutes sample data: a sample collection
 * would not honour the filter that was asked for. An empty answer and a
 * failure are reported apart, so the interface can show "no routes match"
 * and "the route list could not be loaded" as the different things they are.
 */
async function loadFiltered<T>(
  subject: string,
  fetcher: () => Promise<T>,
  empty: T,
): Promise<Resource<T>> {
  try {
    const data = await fetcher();
    const isEmpty = Array.isArray(data) && data.length === 0;
    return { data, source: "api", isEmpty };
  } catch (error) {
    return {
      data: empty,
      source: "sample",
      error: describeFailure(error, subject),
      isUnavailable: true,
    };
  }
}

/**
 * Run a read that needs a signed-in member.
 *
 * Unlike `load`, this never substitutes sample data: a member's own records
 * are either shown or the reason they could not be shown is reported. A 401
 * means "sign in", a 403 means "not permitted".
 */
async function loadAuthenticated<T>(
  subject: string,
  fetcher: () => Promise<T>,
): Promise<Resource<T | null>> {
  try {
    const data = await fetcher();
    return { data, source: "api" };
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return {
        data: null,
        source: "sample",
        error: `${subject} are only available once you sign in.`,
      };
    }
    if (error instanceof ApiError && error.status === 403) {
      return {
        data: null,
        source: "sample",
        error: `You do not have permission to see ${subject}.`,
      };
    }
    return { data: null, source: "sample", error: describeFailure(error, subject) };
  }
}

/* -------------------------------------------------------------------------- */
/* Service                                                                    */
/* -------------------------------------------------------------------------- */

export const archService = {
  listRoutes: (): Promise<Resource<ClimbRoute[]>> =>
    load(
      "The route list",
      async () => (await api.routes()).map(toClimbRoute),
      mockRoutes,
      (routes) => routes.length === 0,
    ),

  /**
   * The route directory, narrowed by the filters the member chose.
   *
   * There is no sample fallback here on purpose: sample routes would not
   * answer the filter that was asked for, so an empty list and a failure are
   * kept apart instead.
   */
  listFilteredRoutes: (filters: RouteFilters): Promise<Resource<ClimbRoute[]>> =>
    loadFiltered("The route list", async () => (await api.routes(filters)).map(toClimbRoute), []),

  /** The values the route directory can be filtered by. */
  listRouteFilterOptions: (): Promise<Resource<RouteFilterOptions>> =>
    loadFiltered(
      "The route filters",
      async () => {
        const options = await api.routeFilters();
        return {
          grades: options.grades,
          walls: options.walls.map((wall) => ({
            id: wall.id,
            name: wall.name,
            imageUrl: wall.image_url,
          })),
          wallTypes: options.wall_types.map((value) => toWallType(value)),
          statuses: options.statuses.map((value) => toRouteStatus(value)),
        };
      },
      { grades: [], walls: [], wallTypes: [], statuses: [] },
    ),

  listProducts: (): Promise<Resource<Product[]>> =>
    load(
      "The shoe collection",
      async () => (await api.products()).map(toProduct),
      mockProducts,
      (products) => products.length === 0,
    ),

  getProduct: async (id: string): Promise<Resource<Product | undefined>> => {
    const listed = await archService.listProducts();
    const match = listed.data.find((product) => product.id === id);
    return {
      data: match,
      source: listed.source,
      ...(listed.error ? { error: listed.error } : {}),
    };
  },

  listPrices: (): Promise<Resource<Price[]>> =>
    load(
      "The price list",
      async () => (await api.prices()).map(toPrice),
      [],
      (prices) => prices.length === 0,
    ),

  listServices: (): Promise<Resource<Service[]>> =>
    load(
      "The service list",
      async () => (await api.services()).map(toService),
      mockServices,
      (services) => services.length === 0,
    ),

  listCourses: (): Promise<Resource<Course[]>> =>
    load(
      "The course list",
      async () => (await api.courses()).map(toCourse),
      [],
      (courses) => courses.length === 0,
    ),

  listEvents: (): Promise<Resource<Event[]>> =>
    load(
      "The event calendar",
      async () => (await api.events()).map(toEvent),
      [],
      (events) => events.length === 0,
    ),

  listRules: (): Promise<Resource<Rule[]>> =>
    load(
      "The gym rules",
      async () => (await api.rules()).map(toRule),
      [],
      (rules) => rules.length === 0,
    ),

  listFaq: (): Promise<Resource<FaqEntry[]>> =>
    load(
      "The FAQ",
      async () => (await api.faq()).map(toFaqEntry),
      [],
      (entries) => entries.length === 0,
    ),

  getGym: (): Promise<Resource<GymProfile>> =>
    load("The gym information", async () => toGymProfile(await api.gym()), mockGym),

  getMember: (): Promise<Resource<MemberSummary>> =>
    load("Your member summary", async () => mockMember, mockMember),

  getLogbook: (): Promise<Resource<LogEntry[]>> =>
    load("Your logbook", async () => [...initialLogbook], [...initialLogbook]),

  getAdminSummary: (): Promise<Resource<AdminSummary>> =>
    load("The operations summary", async () => mockAdmin, mockAdmin),

  getLeaderboard: (): Promise<Resource<LeaderboardEntry[]>> =>
    load(
      "The leaderboard",
      async () => (await api.leaderboard()).map(toLeaderboardEntry),
      [],
      (entries) => entries.length === 0,
    ),

  /**
   * The ranking's explanation, fetched rather than written on the page.
   *
   * No sample fallback: a different rule in the browser would be a different
   * rule from the one the ranking applies, which is worse than saying the
   * explanation could not be loaded.
   */
  getLeaderboardRules: (): Promise<Resource<LeaderboardRules | null>> =>
    loadFiltered(
      "the leaderboard rules",
      async () => toLeaderboardRules(await api.leaderboardRules()),
      null,
    ),

  getRouteTally: (routeId: number | string): Promise<Resource<VoteTally | null>> =>
    load("The community feedback", async () => toVoteTally(await api.routeTally(routeId)), null),

  /**
   * Whether the ARCH service can be reached at all.
   *
   * Used by the footer so the site never claims to be live while it is
   * actually serving sample data.
   */
  getServiceStatus: (): Promise<Resource<boolean>> =>
    load("The service status", async () => (await api.health()).status === "ok", false),

  /* --- the signed-in member's own records -------------------------------- */

  getMyDashboard: (): Promise<Resource<MemberDashboard | null>> =>
    loadAuthenticated("Your statistics", async () => {
      const dashboard: ApiDashboard = await memberApi.dashboard();
      return {
        activeRoutes: dashboard.active_routes,
        totalSends: dashboard.total_sends,
        totalSessions: dashboard.total_sessions,
        bestGrade: dashboard.best_grade,
        activeProjects: dashboard.active_projects,
        outcomes: {
          sends: dashboard.outcomes.sends,
          flashes: dashboard.outcomes.flashes,
          projects: dashboard.outcomes.projects,
          attempts: dashboard.outcomes.attempts,
        },
        byGrade: dashboard.by_grade.map((item) => ({
          grade: item.grade,
          sends: item.sends,
          flashes: item.flashes,
          projects: item.projects,
        })),
        ranking: {
          rank: dashboard.ranking.rank,
          rankedCount: dashboard.ranking.ranked_count,
          ahead: dashboard.ranking.ahead,
          percentile: dashboard.ranking.percentile,
          score: dashboard.ranking.score,
          totalSends: dashboard.ranking.total_sends,
          bestGrade: dashboard.ranking.best_grade,
          scoringRule: dashboard.ranking.scoring_rule,
          percentileRule: dashboard.ranking.percentile_rule,
        },
        recentAttempts: dashboard.recent_attempts.map((item) => ({
          id: String(item.id),
          routeId: item.route_id,
          route: item.route_name,
          grade: item.grade,
          result: item.result,
          attempts: item.attempts,
          date: item.climbed_on,
          isFlash: item.is_flash,
        })),
        hasActivity: dashboard.has_activity,
        firstClimb: dashboard.first_climb,
        lastClimb: dashboard.last_climb,
        agreementStatus: dashboard.agreement_status,
      };
    }),

  getMyLogbook: (): Promise<Resource<LogEntry[] | null>> =>
    loadAuthenticated("Your logbook", async () => {
      const entries: ApiAchievement[] = await memberApi.logbook();
      return entries.map((entry) => ({
        id: String(entry.id),
        route: entry.route_name,
        grade: entry.grade,
        date: entry.climbed_on,
        result: entry.result === "sent" ? "Sent" : "Project",
        attempts: entry.attempts,
        notes: entry.notes ?? "",
      }));
    }),

  getMyAgreement: (): Promise<Resource<Agreement | null>> =>
    loadAuthenticated("Your safety agreement", async () => {
      const agreement: ApiAgreement = await memberApi.agreement();
      return {
        id: agreement.id,
        version: agreement.version,
        status: agreement.status,
        method: agreement.method,
        signedAt: agreement.signed_at,
        signedName: agreement.signed_name,
        notes: agreement.notes,
      };
    }),
};

export const formatPrice = (price: number) =>
  new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(price);

/** The account roles, as they are shown to the member. */
export const ROLE_LABELS: Record<string, string> = {
  customer: "Member",
  staff: "Staff",
  admin: "Administrator",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Format a `YYYY-MM-DD` day as `20 Oct 2026`.
 *
 * The day is parsed and formatted without a timezone, so the server and the
 * browser always show the same day.
 */
export const formatClimbDate = (value: string): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  const [, year, month, day] = match;
  const name = MONTHS[Number(month) - 1] ?? month;
  return `${Number(day)} ${name} ${year}`;
};

/** A share of a whole, as a whole percentage. Zero never divides by zero. */
export const shareOf = (count: number, total: number): number =>
  total > 0 ? Math.round((count / total) * 100) : 0;

export const routeQuery = { queryKey: ["arch", "routes"], queryFn: archService.listRoutes };
/** The values the route directory can be filtered by. */
export const routeFilterOptionsQuery = {
  queryKey: ["arch", "route-filters"],
  queryFn: archService.listRouteFilterOptions,
};

/**
 * The route directory, narrowed by the member's filters.
 *
 * The filters are part of the query key, so changing one asks the backend for
 * a different list rather than filtering the list already in hand.
 */
export function filteredRoutesQuery(filters: RouteFilters) {
  return {
    queryKey: ["arch", "routes", "filtered", filters] as const,
    queryFn: () => archService.listFilteredRoutes(filters),
  };
}
export const productQuery = { queryKey: ["arch", "products"], queryFn: archService.listProducts };
export const memberQuery = { queryKey: ["arch", "member"], queryFn: archService.getMember };
export const logbookQuery = { queryKey: ["arch", "logbook"], queryFn: archService.getLogbook };
export const adminQuery = { queryKey: ["arch", "admin"], queryFn: archService.getAdminSummary };
export const priceQuery = { queryKey: ["arch", "prices"], queryFn: archService.listPrices };
export const serviceQuery = { queryKey: ["arch", "services"], queryFn: archService.listServices };
export const courseQuery = { queryKey: ["arch", "courses"], queryFn: archService.listCourses };
export const eventQuery = { queryKey: ["arch", "events"], queryFn: archService.listEvents };
export const ruleQuery = { queryKey: ["arch", "rules"], queryFn: archService.listRules };
export const faqQuery = { queryKey: ["arch", "faq"], queryFn: archService.listFaq };
export const gymQuery = { queryKey: ["arch", "gym"], queryFn: archService.getGym };
export const leaderboardQuery = {
  queryKey: ["arch", "leaderboard"],
  queryFn: archService.getLeaderboard,
};
export const leaderboardRulesQuery = {
  queryKey: ["arch", "leaderboard-rules"],
  queryFn: archService.getLeaderboardRules,
};
export const serviceStatusQuery = {
  queryKey: ["arch", "service-status"],
  queryFn: archService.getServiceStatus,
};
export const myDashboardQuery = {
  queryKey: ["member", "dashboard"],
  queryFn: archService.getMyDashboard,
};
export const myLogbookQuery = {
  queryKey: ["member", "logbook"],
  queryFn: archService.getMyLogbook,
};
export const myAgreementQuery = {
  queryKey: ["member", "agreement"],
  queryFn: archService.getMyAgreement,
};
