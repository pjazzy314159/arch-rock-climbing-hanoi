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
  zone: string;
  color: "lime" | "coral" | "blue" | "yellow";
  style: string;
  setter: string;
  fresh: boolean;
  sends: number;
  voteCount: number;
  perceivedGrade: string | null;
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
  userId: number;
  displayName: string;
  totalSends: number;
  bestGrade: string | null;
  score: number;
  climbingLevel: number;
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

export type MemberDashboard = {
  totalSends: number;
  totalSessions: number;
  bestGrade: string | null;
  activeProjects: number;
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
    zone: "The Slab",
    color: "lime",
    style: "Balance · Technical",
    setter: "Minh",
    fresh: true,
    sends: 24,
    voteCount: 0,
    perceivedGrade: null,
  },
  {
    id: "r2",
    apiId: 0,
    name: "Against the Grain",
    grade: "V5",
    zone: "The Cave",
    color: "coral",
    style: "Power · Overhang",
    setter: "Linh",
    fresh: true,
    sends: 12,
    voteCount: 0,
    perceivedGrade: null,
  },
  {
    id: "r3",
    apiId: 0,
    name: "Little by Little",
    grade: "V1",
    zone: "The Main Wall",
    color: "blue",
    style: "Flow · Beginner-friendly",
    setter: "An",
    fresh: false,
    sends: 68,
    voteCount: 0,
    perceivedGrade: null,
  },
  {
    id: "r4",
    apiId: 0,
    name: "Trust Your Feet",
    grade: "V4",
    zone: "The Slab",
    color: "yellow",
    style: "Footwork · Technical",
    setter: "Minh",
    fresh: true,
    sends: 19,
    voteCount: 0,
    perceivedGrade: null,
  },
  {
    id: "r5",
    apiId: 0,
    name: "After Hours",
    grade: "V6",
    zone: "The Cave",
    color: "blue",
    style: "Compression · Power",
    setter: "Linh",
    fresh: false,
    sends: 7,
    voteCount: 0,
    perceivedGrade: null,
  },
  {
    id: "r6",
    apiId: 0,
    name: "First Ascent",
    grade: "V0",
    zone: "The Main Wall",
    color: "coral",
    style: "Beginner-friendly · Flow",
    setter: "An",
    fresh: true,
    sends: 91,
    voteCount: 0,
    perceivedGrade: null,
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

function toRouteColor(value: string): RouteColor {
  return ROUTE_COLORS.find((color) => color === value) ?? "lime";
}

export function toClimbRoute(route: ApiRouteSummary): ClimbRoute {
  return {
    id: String(route.id),
    apiId: route.id,
    name: route.name,
    grade: route.grade,
    zone: route.zone,
    color: toRouteColor(route.color),
    style: route.style,
    setter: route.setter,
    fresh: route.is_fresh,
    sends: route.sends,
    voteCount: route.vote_count,
    perceivedGrade: route.perceived_grade,
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
    userId: entry.user_id,
    displayName: entry.display_name,
    totalSends: entry.total_sends,
    bestGrade: entry.best_grade,
    score: entry.score,
    climbingLevel: entry.climbing_level,
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
        totalSends: dashboard.total_sends,
        totalSessions: dashboard.total_sessions,
        bestGrade: dashboard.best_grade,
        activeProjects: dashboard.active_projects,
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

export const routeQuery = { queryKey: ["arch", "routes"], queryFn: archService.listRoutes };
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
