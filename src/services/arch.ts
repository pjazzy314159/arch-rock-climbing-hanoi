/** Mock-only adapter. Replace this implementation with an authenticated FastAPI client.
 * No credentials, access decisions, payments or durable mutations belong here.
 */
export type ClimbRoute = {
  id: string;
  name: string;
  grade: string;
  zone: string;
  color: "lime" | "coral" | "blue" | "yellow";
  style: string;
  setter: string;
  fresh: boolean;
  sends: number;
};
export type Product = {
  id: string;
  name: string;
  brand: string;
  category: string;
  price: number;
  fit: string;
  description: string;
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
export const mockRoutes: ClimbRoute[] = [
  {
    id: "r1",
    name: "Quiet the Mind",
    grade: "V3",
    zone: "The Slab",
    color: "lime",
    style: "Balance · Technical",
    setter: "Minh",
    fresh: true,
    sends: 24,
  },
  {
    id: "r2",
    name: "Against the Grain",
    grade: "V5",
    zone: "The Cave",
    color: "coral",
    style: "Power · Overhang",
    setter: "Linh",
    fresh: true,
    sends: 12,
  },
  {
    id: "r3",
    name: "Little by Little",
    grade: "V1",
    zone: "The Main Wall",
    color: "blue",
    style: "Flow · Beginner-friendly",
    setter: "An",
    fresh: false,
    sends: 68,
  },
  {
    id: "r4",
    name: "Trust Your Feet",
    grade: "V4",
    zone: "The Slab",
    color: "yellow",
    style: "Footwork · Technical",
    setter: "Minh",
    fresh: true,
    sends: 19,
  },
  {
    id: "r5",
    name: "After Hours",
    grade: "V6",
    zone: "The Cave",
    color: "blue",
    style: "Compression · Power",
    setter: "Linh",
    fresh: false,
    sends: 7,
  },
  {
    id: "r6",
    name: "First Ascent",
    grade: "V0",
    zone: "The Main Wall",
    color: "coral",
    style: "Beginner-friendly · Flow",
    setter: "An",
    fresh: true,
    sends: 91,
  },
];
export const mockProducts: Product[] = [
  {
    id: "arch-edge",
    name: "Edge Performance",
    brand: "ARCH Selection",
    category: "Performance",
    price: 2490000,
    fit: "Aggressive",
    description:
      "A precise, downturned shoe for steep terrain and small footholds. A dual-strap closure keeps the fit secure, while a sensitive midsole brings you closer to every move.",
  },
  {
    id: "arch-flow",
    name: "Flow All-round",
    brand: "ARCH Selection",
    category: "All-round",
    price: 1890000,
    fit: "Moderate",
    description:
      "Comfort meets precision. A versatile climbing shoe for longer sessions, developing technique and finding your flow on any wall.",
  },
  {
    id: "arch-start",
    name: "Start Essential",
    brand: "ARCH Selection",
    category: "Beginner",
    price: 1290000,
    fit: "Neutral",
    description:
      "An easy-wearing, supportive shoe for your first moves. A neutral profile and forgiving fit let you focus on the climb.",
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
export const archService = {
  listRoutes: async (): Promise<ClimbRoute[]> => [...mockRoutes],
  listProducts: async (): Promise<Product[]> => [...mockProducts],
  getProduct: async (id: string): Promise<Product | undefined> =>
    mockProducts.find((p) => p.id === id),
  getMember: async () => ({
    displayName: "Alex Nguyen",
    initials: "AN",
    membership: "Monthly pass",
    totalSends: 42,
    sessions: 18,
    bestGrade: "V5",
    activeProjects: 3,
  }),
  getLogbook: async (): Promise<LogEntry[]> => [...initialLogbook],
  getAdminSummary: async () => ({ members: 248, checkIns: 36, activeRoutes: 64, products: 12 }),
};
export const formatPrice = (price: number) =>
  new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(price);
export const routeQuery = { queryKey: ["mock", "routes"], queryFn: archService.listRoutes };
export const productQuery = { queryKey: ["mock", "products"], queryFn: archService.listProducts };
export const memberQuery = { queryKey: ["mock", "member"], queryFn: archService.getMember };
export const logbookQuery = { queryKey: ["mock", "logbook"], queryFn: archService.getLogbook };
export const adminQuery = { queryKey: ["mock", "admin"], queryFn: archService.getAdminSummary };
