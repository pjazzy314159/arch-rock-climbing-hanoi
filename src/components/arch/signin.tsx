import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowUpRight, KeyRound, LogIn, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useHydrated } from "@/hooks/use-hydrated";
import { useSession } from "@/services/session";
import { PageHeading } from "./shared";

type Mode = "signin" | "register";

/**
 * Sign in and registration.
 *
 * The backend is the authority on who may do what; this page only collects
 * the credentials and reports what the backend says.
 */
export function SignInPage() {
  const [mode, setMode] = useState<Mode>("signin");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hydrated = useHydrated();
  const { signIn, register, status } = useSession();
  const navigate = useNavigate();

  if (status === "authenticated") {
    return (
      <main className="page-main">
        <PageHeading
          eyebrow="YOUR ACCOUNT"
          title="You are already signed in."
          description="Head to your climbing space to see your records."
        />
        <div className="auth-card">
          <Button asChild size="lg">
            <Link to="/member">
              Go to my member area <ArrowUpRight />
            </Link>
          </Button>
        </div>
      </main>
    );
  }

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setPending(true);
    setError(null);
    try {
      await signIn(String(data.get("email") ?? ""), String(data.get("password") ?? ""));
      await navigate({ to: "/member" });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "You could not be signed in.");
    } finally {
      setPending(false);
    }
  }

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const password = String(data.get("password") ?? "");
    if (password.length < 10) {
      setError("Please choose a password with at least 10 characters.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await register({
        email: String(data.get("email") ?? ""),
        full_name: String(data.get("full_name") ?? ""),
        password,
        phone: String(data.get("phone") ?? ""),
      });
      await navigate({ to: "/member" });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Your account could not be created.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="page-main">
      <PageHeading
        eyebrow="MEMBER AREA"
        title="Sign in to your climbing space."
        description="Your logbook, your safety agreement and your climbing records — all in one place."
      />
      <div className="auth-card">
        <div className="auth-tabs" role="tablist" aria-label="Account">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "signin"}
            className={mode === "signin" ? "auth-tab auth-tab-active" : "auth-tab"}
            onClick={() => {
              setMode("signin");
              setError(null);
            }}
          >
            <LogIn size={16} /> Sign in
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "register"}
            className={mode === "register" ? "auth-tab auth-tab-active" : "auth-tab"}
            onClick={() => {
              setMode("register");
              setError(null);
            }}
          >
            <UserPlus size={16} /> Create an account
          </button>
        </div>

        {mode === "signin" ? (
          <form className="auth-form" onSubmit={handleSignIn}>
            <label>
              Email address
              <input
                required
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
              />
            </label>
            <label>
              Password
              <input
                required
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder="Your password"
              />
            </label>
            <Button type="submit" size="lg" disabled={!hydrated || pending}>
              {pending ? "Signing in…" : "Sign in"}
              <ArrowUpRight />
            </Button>
          </form>
        ) : (
          <form className="auth-form" onSubmit={handleRegister}>
            <label>
              Your name
              <input
                required
                name="full_name"
                autoComplete="name"
                placeholder="Alex Nguyen"
                minLength={2}
              />
            </label>
            <label>
              Email address
              <input
                required
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
              />
            </label>
            <label>
              Phone <span className="label-hint">optional</span>
              <input name="phone" type="tel" autoComplete="tel" placeholder="+84 ..." />
            </label>
            <label>
              Password
              <input
                required
                name="password"
                type="password"
                autoComplete="new-password"
                placeholder="At least 10 characters"
                minLength={10}
              />
            </label>
            <p className="auth-note">
              <KeyRound size={15} /> We only ask for the details the gym needs to run your
              membership. Your phone number is optional and is never shown publicly.
            </p>
            <Button type="submit" size="lg" disabled={!hydrated || pending}>
              {pending ? "Creating your account…" : "Create my account"}
              <ArrowUpRight />
            </Button>
          </form>
        )}

        {error && (
          <p className="feedback error" role="alert">
            {error}
          </p>
        )}
      </div>
    </main>
  );
}
