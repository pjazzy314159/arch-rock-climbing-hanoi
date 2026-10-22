/**
 * Typed client for the ARCH FastAPI backend.
 *
 * The backend is the source of truth for everything the website shows. This
 * module is the only place that talks to it, so the rest of the frontend never
 * has to know the base URL, the response shapes or the error handling.
 *
 * Rules this module follows:
 *
 * - No secret ever appears here. The backend holds its own credentials; this
 *   client only sends the user's own access token.
 * - Reads never throw: the calling service decides whether to fall back to
 *   sample data, and always reports which one it used.
 * - Writes do throw, so the UI can show a real error.
 */

import type {
  ApiAchievement,
  ApiAdminMember,
  ApiAdminSummary,
  ApiAgreement,
  ApiAssistantAnswer,
  ApiAssistantStatus,
  ApiCatalogProduct,
  ApiChecklistItem,
  ApiContactMessage,
  ApiCourse,
  ApiDashboard,
  ApiEvent,
  ApiFaqEntry,
  ApiGym,
  ApiLeaderboardEntry,
  ApiLeaderboardRules,
  ApiPrice,
  ApiPublicRouteHolds,
  ApiRouteHoldSet,
  ApiRouteHoldSetState,
  ApiRouteFilterOptions,
  ApiRouteSummary,
  ApiStaffRouteOption,
  ApiWallHold,
  ApiRule,
  ApiService,
  ApiShift,
  ApiTask,
  ApiToken,
  ApiUser,
  ApiVote,
  ApiVoteTally,
  ApiWall,
} from "./types";

/** Base URL of the backend. Empty means "no backend configured". */
export const API_BASE_URL = (import.meta.env["VITE_API_BASE_URL"] ?? "").replace(/\/+$/, "");

/** True when the frontend has been pointed at a backend. */
export const isApiConfigured = API_BASE_URL.length > 0;

/**
 * The filters the route directory can be narrowed by.
 *
 * They are passed to the backend, which applies them in the database. Every
 * value is a plain one: a React Query context object is never mistaken for a
 * filter.
 */
export type RouteFilterParams = {
  grade?: string | null;
  wall?: string | null;
  wallId?: number | null;
  wallType?: string | null;
  status?: string | null;
  search?: string | null;
  freshOnly?: boolean;
};

/**
 * Build the query string for the route directory.
 *
 * Empty values are left out entirely, so an unset filter never narrows the
 * list. The values are encoded, so a grade or a wall name with a space in it
 * is sent correctly.
 */
export function routeQueryString(filters?: RouteFilterParams): string {
  if (!filters) return "";
  const parts: string[] = [];
  const add = (key: string, value: string | number | boolean | null | undefined) => {
    if (value === null || value === undefined || value === "") return;
    parts.push(`${key}=${encodeURIComponent(String(value))}`);
  };
  add("grade", filters.grade);
  add("wall", filters.wall);
  add("wall_id", filters.wallId);
  add("wall_type", filters.wallType);
  add("status", filters.status);
  add("search", filters.search);
  if (filters.freshOnly) parts.push("fresh_only=true");
  return parts.length > 0 ? `?${parts.join("&")}` : "";
}

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** The backend could not be reached at all. */
export class ApiUnavailableError extends ApiError {
  constructor(message = "The ARCH service could not be reached.") {
    super(message, 0);
    this.name = "ApiUnavailableError";
  }
}

/* -------------------------------------------------------------------------- */
/* Access token                                                               */
/* -------------------------------------------------------------------------- */

const TOKEN_STORAGE_KEY = "arch.access_token";

let memoryToken: string | null = null;

/**
 * Store (or clear) the signed-in member's access token.
 *
 * The token is held in memory and mirrored into `localStorage` so a page
 * reload keeps the session. It is the member's own token — no backend secret
 * is ever handled by the browser.
 */
export function setAccessToken(token: string | null): void {
  memoryToken = token;
  if (typeof window === "undefined") return;
  try {
    if (token) {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    /* Storage can be unavailable (private mode, blocked cookies). The token
       still works for the lifetime of the page because it is kept in memory. */
  }
}

/** Read the stored access token, if there is one. */
export function getAccessToken(): string | null {
  if (memoryToken) return memoryToken;
  if (typeof window === "undefined") return null;
  try {
    memoryToken = window.localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    memoryToken = null;
  }
  return memoryToken;
}

/* -------------------------------------------------------------------------- */
/* Request plumbing                                                           */
/* -------------------------------------------------------------------------- */

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** Send the access token with this request. Defaults to true. */
  auth?: boolean;
};

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function detailFromPayload(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const detail = (payload as { detail?: unknown }).detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0] as { msg?: unknown };
    if (typeof first?.msg === "string") return first.msg;
  }
  return undefined;
}

/** Perform a request against the backend and return the decoded body. */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  if (!isApiConfigured) {
    throw new ApiUnavailableError("The ARCH service is not configured for this site.");
  }

  const headers = new Headers({ Accept: "application/json" });
  if (options.body !== undefined) headers.set("Content-Type", "application/json");

  const token = options.auth === false ? null : getAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const init: RequestInit = { method: options.method ?? "GET", headers };
  if (options.body !== undefined) init.body = JSON.stringify(options.body);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, init);
  } catch {
    throw new ApiUnavailableError();
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const payload = parseJson(text);

  if (!response.ok) {
    throw new ApiError(
      detailFromPayload(payload) ?? `The request failed (${response.status}).`,
      response.status,
    );
  }

  return payload as T;
}

/* -------------------------------------------------------------------------- */
/* Endpoints                                                                  */
/* -------------------------------------------------------------------------- */

export const api = {
  health: () => apiRequest<{ status: string; database: string }>("/api/health"),
  gym: () => apiRequest<ApiGym>("/api/public/gym"),
  prices: () => apiRequest<ApiPrice[]>("/api/public/prices"),
  services: () => apiRequest<ApiService[]>("/api/public/services"),
  courses: () => apiRequest<ApiCourse[]>("/api/public/courses"),
  events: () => apiRequest<ApiEvent[]>("/api/public/events"),
  rules: () => apiRequest<ApiRule[]>("/api/public/rules"),
  faq: () => apiRequest<ApiFaqEntry[]>("/api/public/faq"),
  products: () => apiRequest<ApiCatalogProduct[]>("/api/public/products"),
  routes: (options?: RouteFilterParams) =>
    apiRequest<ApiRouteSummary[]>(`/api/public/routes${routeQueryString(options)}`),
  route: (id: number | string) => apiRequest<ApiRouteSummary>(`/api/public/routes/${id}`),
  routeFilters: () => apiRequest<ApiRouteFilterOptions>("/api/public/route-filters"),
  walls: () => apiRequest<ApiWall[]>("/api/public/walls"),
  product: (id: number | string) => apiRequest<ApiCatalogProduct>(`/api/public/products/${id}`),

  submitContactMessage: (body: { name: string; email: string; subject: string; message: string }) =>
    apiRequest<{ id: number }>("/api/public/contact", {
      method: "POST",
      body,
      auth: false,
    }),

  leaderboard: () => apiRequest<ApiLeaderboardEntry[]>("/api/me/leaderboard"),
  leaderboardRules: () =>
    apiRequest<ApiLeaderboardRules>("/api/public/leaderboard/rules", { auth: false }),
  routeTally: (routeId: number | string) =>
    apiRequest<ApiVoteTally>(`/api/me/routes/${routeId}/tally`),

  assistantStatus: () => apiRequest<ApiAssistantStatus>("/api/assistant/status"),
  askAssistant: (question: string) =>
    apiRequest<ApiAssistantAnswer>("/api/assistant/chat", {
      method: "POST",
      body: { question },
    }),
};

/**
 * The account endpoints.
 *
 * `register` and `login` are sent without the access token on purpose: there
 * is no session yet when they are called.
 */
export const authApi = {
  register: (body: { email: string; full_name: string; password: string; phone?: string }) =>
    apiRequest<ApiToken>("/api/auth/register", { method: "POST", body, auth: false }),

  login: (body: { email: string; password: string }) =>
    apiRequest<ApiToken>("/api/auth/login", { method: "POST", body, auth: false }),

  me: () => apiRequest<ApiUser>("/api/auth/me"),

  updateMe: (body: { full_name?: string; phone?: string | null; climbing_level?: number }) =>
    apiRequest<ApiUser>("/api/auth/me", { method: "PATCH", body }),

  changePassword: (body: { current_password: string; new_password: string }) =>
    apiRequest<{ detail: string }>("/api/auth/password", { method: "POST", body }),
};

/** The endpoints that need a signed-in member. */
export const memberApi = {
  dashboard: () => apiRequest<ApiDashboard>("/api/me/dashboard"),
  logbook: () => apiRequest<ApiAchievement[]>("/api/me/logbook"),
  agreement: () => apiRequest<ApiAgreement>("/api/me/agreement"),
  signAgreement: (body: { signed_name: string; accepted: boolean }) =>
    apiRequest<ApiAgreement>("/api/me/agreement/signature", { method: "POST", body }),
  logClimb: (body: {
    route_id?: number | null;
    route_name: string;
    grade: string;
    result: "sent" | "project";
    attempts: number;
    climbed_on?: string;
    notes?: string;
  }) => apiRequest<ApiAchievement>("/api/me/logbook", { method: "POST", body }),

  myVote: (routeId: number | string) =>
    apiRequest<ApiVote | null>(`/api/me/routes/${routeId}/vote`),

  castVote: (routeId: number | string, body: { value: string; comment?: string }) =>
    apiRequest<ApiVote>(`/api/me/routes/${routeId}/vote`, { method: "POST", body }),

  withdrawVote: (routeId: number | string) =>
    apiRequest<void>(`/api/me/routes/${routeId}/vote`, { method: "DELETE" }),
};

/** The endpoints a member of staff uses for their own work. */
export const staffApi = {
  myTasks: (all = false) => apiRequest<ApiTask[]>(`/api/staff/tasks${all ? "?all=true" : ""}`),

  updateTask: (taskId: number, body: { status?: string; title?: string; description?: string }) =>
    apiRequest<ApiTask>(`/api/staff/tasks/${taskId}`, { method: "PATCH", body }),

  updateTaskStatus: (taskId: number, status: string) =>
    apiRequest<ApiTask>(`/api/staff/tasks/${taskId}/status`, { method: "POST", body: { status } }),

  addChecklistItem: (taskId: number, label: string) =>
    apiRequest<ApiChecklistItem>(`/api/staff/tasks/${taskId}/checklist`, {
      method: "POST",
      body: { label },
    }),

  updateChecklistItem: (itemId: number, body: { is_done: boolean; label?: string }) =>
    apiRequest<ApiChecklistItem>(`/api/staff/checklist/${itemId}`, { method: "PATCH", body }),

  shifts: () => apiRequest<ApiShift[]>("/api/staff/shifts"),
};

/** The endpoints only an administrator may use. */
export const adminApi = {
  summary: () => apiRequest<ApiAdminSummary>("/api/admin/summary"),

  members: (search?: string) =>
    apiRequest<ApiAdminMember[]>(
      `/api/admin/members${search ? `?search=${encodeURIComponent(search)}` : ""}`,
    ),

  routes: (status?: string) =>
    apiRequest<ApiRouteSummary[]>(`/api/admin/routes${status ? `?status=${status}` : ""}`),

  walls: () => apiRequest<ApiWall[]>("/api/admin/walls"),

  createRoute: (body: {
    name: string;
    grade: string;
    wall_id?: number | null;
    wall_type?: string;
    color?: string;
    style?: string;
    setter?: string;
    image_url?: string;
    status?: string;
  }) => apiRequest<ApiRouteSummary>("/api/admin/routes", { method: "POST", body }),

  updateRoute: (routeId: number, body: Record<string, unknown>) =>
    apiRequest<ApiRouteSummary>(`/api/admin/routes/${routeId}`, { method: "PATCH", body }),

  tasks: () => apiRequest<ApiTask[]>("/api/admin/tasks"),

  createTask: (body: {
    title: string;
    description?: string;
    assignee_id?: number | null;
    priority?: string;
    due_at?: string | null;
  }) => apiRequest<ApiTask>("/api/staff/tasks", { method: "POST", body }),

  events: () => apiRequest<ApiEvent[]>("/api/admin/events"),

  createEvent: (body: {
    title: string;
    starts_at: string;
    description?: string;
    location?: string;
    capacity?: number | null;
    is_public?: boolean;
  }) => apiRequest<ApiEvent>("/api/admin/events", { method: "POST", body }),

  agreements: (status?: string) =>
    apiRequest<ApiAgreement[]>(`/api/admin/agreements${status ? `?status=${status}` : ""}`),

  contactMessages: (includeHandled = false) =>
    apiRequest<ApiContactMessage[]>(
      `/api/admin/contact${includeHandled ? "?include_handled=true" : ""}`,
    ),

  markContactMessage: (messageId: number, handled: boolean) =>
    apiRequest<ApiContactMessage>(`/api/admin/contact/${messageId}?handled=${handled}`, {
      method: "PATCH",
    }),

  votes: (routeId?: number) =>
    apiRequest<
      {
        id: number;
        route_id: number;
        user_id: number;
        user_name: string;
        value: string;
        voter_level: number;
        created_at: string;
      }[]
    >(`/api/admin/votes${routeId ? `?route_id=${routeId}` : ""}`),
};

/**
 * The route-setting tool's own endpoints.
 *
 * Walls and holds are staff data; the publish call is additionally restricted
 * to administrators by the backend, not by this client.
 */
export const routeSettingApi = {
  walls: () => apiRequest<ApiWall[]>("/api/staff/walls"),

  wallRoutes: (wallId: number) =>
    apiRequest<ApiStaffRouteOption[]>(`/api/staff/walls/${wallId}/routes`),

  wallHolds: (wallId: number) => apiRequest<ApiWallHold[]>(`/api/staff/walls/${wallId}/holds`),

  createHold: (
    wallId: number,
    body: { x: number; y: number; width: number; height: number; label?: string },
  ) => apiRequest<ApiWallHold>(`/api/staff/walls/${wallId}/holds`, { method: "POST", body }),

  updateHold: (
    holdId: number,
    body: {
      x?: number;
      y?: number;
      width?: number;
      height?: number;
      label?: string;
    },
  ) => apiRequest<ApiWallHold>(`/api/staff/holds/${holdId}`, { method: "PATCH", body }),

  deleteHold: (holdId: number) =>
    apiRequest<void>(`/api/staff/holds/${holdId}`, { method: "DELETE" }),

  holdSet: (routeId: number) =>
    apiRequest<ApiRouteHoldSetState>(`/api/staff/routes/${routeId}/hold-set`),

  saveHoldSet: (
    routeId: number,
    body: { holds: { wall_hold_id: number }[]; wall_image_url?: string | null },
  ) =>
    apiRequest<ApiRouteHoldSet>(`/api/staff/routes/${routeId}/hold-set`, {
      method: "PUT",
      body,
    }),

  publishHoldSet: (routeId: number) =>
    apiRequest<ApiRouteHoldSet>(`/api/staff/routes/${routeId}/hold-set/publish`, {
      method: "POST",
    }),

  /** The published annotation of an active route, readable without a token. */
  publicHolds: (routeId: number) =>
    apiRequest<ApiPublicRouteHolds>(`/api/public/routes/${routeId}/holds`, {
      auth: false,
    }),
};
