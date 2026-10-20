import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { API_BASE_URL, ApiError, getAccessToken, setAccessToken } from "@/services/api";
import { SessionProvider, initialsFor, useSession } from "@/services/session";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const MEMBER = {
  id: 1,
  email: "alex@example.com",
  full_name: "Alex Nguyen",
  role: "customer",
  is_active: true,
  phone: null,
  membership_tier: "Monthly pass",
  membership_status: "Active",
  joined_on: "2026-09-01",
  climbing_level: 4,
};

/** A fetch mock whose call signature matches the real one. */
function mockFetch(handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  return vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(handler);
}

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <SessionProvider>{children}</SessionProvider>
      </QueryClientProvider>
    );
  };
}

function renderSession() {
  return renderHook(() => useSession(), { wrapper: createWrapper() });
}

beforeEach(() => {
  setAccessToken(null);
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  setAccessToken(null);
});

describe("initialsFor", () => {
  it("uses the first and last name", () => {
    expect(initialsFor("Alex Nguyen")).toBe("AN");
  });

  it("uses the first two letters of a single name", () => {
    expect(initialsFor("Cher")).toBe("CH");
  });

  it("copes with an empty name", () => {
    expect(initialsFor("   ")).toBe("?");
  });
});

describe("the session without a stored token", () => {
  it("ends up anonymous without calling the backend", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderSession();

    await waitFor(() => expect(result.current.status).toBe("anonymous"));
    expect(result.current.user).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("signing in", () => {
  it("stores the token and the member", async () => {
    const fetchMock = mockFetch(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/auth/login")) {
        return jsonResponse({
          access_token: "token-123",
          token_type: "bearer",
          expires_in: 3600,
          user: MEMBER,
        });
      }
      return jsonResponse({ detail: "not found" }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderSession();
    await waitFor(() => expect(result.current.status).toBe("anonymous"));

    await act(async () => {
      await result.current.signIn("alex@example.com", "a-long-password");
    });

    expect(result.current.status).toBe("authenticated");
    expect(result.current.user?.email).toBe("alex@example.com");
    expect(getAccessToken()).toBe("token-123");
    expect(window.localStorage.getItem("arch.access_token")).toBe("token-123");
  });

  it("sends the credentials to the login endpoint", async () => {
    const fetchMock = mockFetch(async () =>
      jsonResponse({
        access_token: "token-123",
        token_type: "bearer",
        expires_in: 1,
        user: MEMBER,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderSession();
    await waitFor(() => expect(result.current.status).toBe("anonymous"));

    await act(async () => {
      await result.current.signIn("  alex@example.com  ", "a-long-password");
    });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${API_BASE_URL}/api/auth/login`);
    expect(JSON.parse(String(init.body))).toEqual({
      email: "alex@example.com",
      password: "a-long-password",
    });
  });

  it("stays anonymous and explains the problem when the password is wrong", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ detail: "Incorrect email or password" }, 401)),
    );

    const { result } = renderSession();
    await waitFor(() => expect(result.current.status).toBe("anonymous"));

    await act(async () => {
      await expect(result.current.signIn("alex@example.com", "wrong-password")).rejects.toThrow(
        /not recognised/i,
      );
    });

    expect(result.current.status).toBe("anonymous");
    expect(result.current.user).toBeNull();
    expect(getAccessToken()).toBeNull();
  });
});

describe("registering", () => {
  it("stores the token and the new member", async () => {
    const fetchMock = mockFetch(async () =>
      jsonResponse({
        access_token: "token-456",
        token_type: "bearer",
        expires_in: 1,
        user: MEMBER,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderSession();
    await waitFor(() => expect(result.current.status).toBe("anonymous"));

    await act(async () => {
      await result.current.register({
        email: "alex@example.com",
        full_name: "Alex Nguyen",
        password: "a-long-password",
        phone: "",
      });
    });

    expect(result.current.status).toBe("authenticated");
    expect(getAccessToken()).toBe("token-456");

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body["email"]).toBe("alex@example.com");
    expect(body["full_name"]).toBe("Alex Nguyen");
    // An empty phone number is not sent at all.
    expect("phone" in body).toBe(false);
  });

  it("reports a duplicate account", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ detail: "already exists" }, 409)),
    );

    const { result } = renderSession();
    await waitFor(() => expect(result.current.status).toBe("anonymous"));

    await act(async () => {
      await expect(
        result.current.register({
          email: "alex@example.com",
          full_name: "Alex Nguyen",
          password: "a-long-password",
        }),
      ).rejects.toThrow(/already exists/i);
    });

    expect(result.current.status).toBe("anonymous");
  });
});

describe("a stored token the backend rejects", () => {
  it("is discarded and the session falls back to anonymous", async () => {
    setAccessToken("stale-token");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ detail: "Authentication required" }, 401)),
    );

    const { result } = renderSession();

    await waitFor(() => expect(result.current.status).toBe("anonymous"));
    expect(getAccessToken()).toBeNull();
    expect(result.current.user).toBeNull();
  });
});

describe("a stored token the backend cannot be asked about", () => {
  it("is kept, so a temporary failure does not sign the member out", async () => {
    setAccessToken("good-token");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("network down");
      }),
    );

    const { result } = renderSession();

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(getAccessToken()).toBe("good-token");
    expect(result.current.status).toBe("anonymous");
    expect(result.current.error).toMatch(/could not reach the ARCH service/i);
  });

  it("is also kept when the backend answers with an error", async () => {
    setAccessToken("good-token");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ detail: "Server error" }, 500)),
    );

    const { result } = renderSession();

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(getAccessToken()).toBe("good-token");
    expect(result.current.status).toBe("anonymous");
  });
});

describe("signing out", () => {
  it("clears the token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          access_token: "token-123",
          token_type: "bearer",
          expires_in: 1,
          user: MEMBER,
        }),
      ),
    );

    const { result } = renderSession();
    await waitFor(() => expect(result.current.status).toBe("anonymous"));

    await act(async () => {
      await result.current.signIn("alex@example.com", "a-long-password");
    });
    expect(getAccessToken()).toBe("token-123");

    act(() => {
      result.current.signOut();
    });

    expect(result.current.status).toBe("anonymous");
    expect(result.current.user).toBeNull();
    expect(getAccessToken()).toBeNull();
    expect(window.localStorage.getItem("arch.access_token")).toBeNull();
  });
});

describe("the account API", () => {
  it("sends the access token with a protected request", async () => {
    setAccessToken("token-123");
    const fetchMock = mockFetch(async () =>
      jsonResponse({ detail: "Your password has been changed." }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { authApi } = await import("@/services/api");
    await authApi.changePassword({
      current_password: "old-password",
      new_password: "new-password",
    });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${API_BASE_URL}/api/auth/password`);
    expect((init.headers as Headers).get("Authorization")).toBe("Bearer token-123");
  });

  it("raises an ApiError with the backend's message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ detail: "Your current password is not correct" }, 400)),
    );

    const { authApi } = await import("@/services/api");
    await expect(
      authApi.changePassword({ current_password: "wrong", new_password: "new-password" }),
    ).rejects.toBeInstanceOf(ApiError);
  });
});
