import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { authApi, ApiError, ApiUnavailableError, getAccessToken, setAccessToken } from "./api";
import type { ApiUser } from "./types";

/**
 * The signed-in member's session.
 *
 * The session only ever holds the member's own access token and profile. It
 * is not a substitute for the backend's checks: every protected endpoint
 * verifies the token and the role again on the server.
 */

export type SessionStatus = "loading" | "authenticated" | "anonymous";

export type RegisterInput = {
  email: string;
  full_name: string;
  password: string;
  phone?: string;
};

export type SessionValue = {
  status: SessionStatus;
  user: ApiUser | null;
  /** Set when the session could not be restored, or an action failed. */
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  signOut: () => void;
  refresh: () => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

function messageFor(error: unknown, fallback: string): string {
  if (error instanceof ApiUnavailableError) {
    return "The ARCH service is not reachable right now. Please try again in a moment.";
  }
  if (error instanceof ApiError) {
    if (error.status === 401) return "That email and password combination was not recognised.";
    if (error.status === 409) return "An account with that email already exists.";
    if (error.status === 422) return "Please check the details you entered and try again.";
    return error.message;
  }
  return fallback;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  // "loading" is the state on the server and on the first client render, so
  // the two agree and hydration does not mismatch.
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [user, setUser] = useState<ApiUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  /**
   * Drop any cached member records.
   *
   * The cache is shared for the whole tab, so signing in or out has to clear
   * the previous member's data rather than leave it on screen.
   */
  const clearMemberCache = useCallback(() => {
    queryClient.removeQueries({ queryKey: ["member"] });
  }, [queryClient]);

  const refresh = useCallback(async () => {
    if (!getAccessToken()) {
      setUser(null);
      setStatus("anonymous");
      return;
    }
    try {
      const profile = await authApi.me();
      setUser(profile);
      setStatus("authenticated");
      setError(null);
    } catch (caught) {
      // A token the backend does not accept is discarded, exactly as a
      // browser would discard an expired session.
      setAccessToken(null);
      setUser(null);
      setStatus("anonymous");
      clearMemberCache();
      if (caught instanceof ApiError && caught.status === 401) return;
      setError(messageFor(caught, "Your session could not be restored."));
    }
  }, [clearMemberCache]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      setError(null);
      try {
        const result = await authApi.login({ email: email.trim(), password });
        setAccessToken(result.access_token);
        setUser(result.user);
        setStatus("authenticated");
        clearMemberCache();
      } catch (caught) {
        setStatus("anonymous");
        setUser(null);
        const message = messageFor(caught, "You could not be signed in.");
        setError(message);
        throw new Error(message);
      }
    },
    [clearMemberCache],
  );

  const register = useCallback(
    async (input: RegisterInput) => {
      setError(null);
      try {
        const result = await authApi.register({
          email: input.email.trim(),
          full_name: input.full_name.trim(),
          password: input.password,
          ...(input.phone?.trim() ? { phone: input.phone.trim() } : {}),
        });
        setAccessToken(result.access_token);
        setUser(result.user);
        setStatus("authenticated");
        clearMemberCache();
      } catch (caught) {
        setStatus("anonymous");
        setUser(null);
        const message = messageFor(caught, "Your account could not be created.");
        setError(message);
        throw new Error(message);
      }
    },
    [clearMemberCache],
  );

  const signOut = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    setStatus("anonymous");
    setError(null);
    clearMemberCache();
  }, [clearMemberCache]);

  const value = useMemo<SessionValue>(
    () => ({ status, user, error, signIn, register, signOut, refresh }),
    [status, user, error, signIn, register, signOut, refresh],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/** Read the current session. Must be used inside a `SessionProvider`. */
export function useSession(): SessionValue {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession must be used inside a SessionProvider");
  }
  return context;
}

/** Initials for the avatar, derived from the member's name. */
export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
}
