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
  ApiAgreement,
  ApiAssistantAnswer,
  ApiAssistantStatus,
  ApiCatalogProduct,
  ApiCourse,
  ApiDashboard,
  ApiEvent,
  ApiFaqEntry,
  ApiGym,
  ApiLeaderboardEntry,
  ApiPrice,
  ApiRouteSummary,
  ApiRule,
  ApiService,
  ApiToken,
  ApiUser,
  ApiVote,
  ApiVoteTally,
} from "./types";

/** Base URL of the backend. Empty means "no backend configured". */
export const API_BASE_URL = (import.meta.env["VITE_API_BASE_URL"] ?? "").replace(/\/+$/, "");

/** True when the frontend has been pointed at a backend. */
export const isApiConfigured = API_BASE_URL.length > 0;

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
  method?: "GET" | "POST" | "PATCH" | "DELETE";
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
  routes: () => apiRequest<ApiRouteSummary[]>("/api/public/routes"),
  route: (id: number | string) => apiRequest<ApiRouteSummary>(`/api/public/routes/${id}`),
  product: (id: number | string) => apiRequest<ApiCatalogProduct>(`/api/public/products/${id}`),

  submitContactMessage: (body: { name: string; email: string; subject: string; message: string }) =>
    apiRequest<{ id: number }>("/api/public/contact", {
      method: "POST",
      body,
      auth: false,
    }),

  leaderboard: () => apiRequest<ApiLeaderboardEntry[]>("/api/me/leaderboard"),
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
