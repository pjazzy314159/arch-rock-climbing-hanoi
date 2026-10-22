import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  BookOpen,
  LayoutDashboard,
  LogOut,
  Mountain,
  Shield,
  TrendingUp,
  UserCog,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ROLE_LABELS } from "@/services/arch";
import { initialsFor, useSession } from "@/services/session";

/**
 * The frame every page in the member area sits in, and the small pieces the
 * member pages share.
 *
 * They live here rather than in `member-pages.tsx` so the member dashboard
 * can use them without importing the whole member area.
 */

const memberNav = [
  { to: "/member", label: "Overview", icon: LayoutDashboard },
  { to: "/member/logbook", label: "My logbook", icon: BookOpen },
  { to: "/member/beta", label: "Route beta", icon: Mountain },
  { to: "/member/progress", label: "My progress", icon: TrendingUp },
  { to: "/member/profile", label: "My profile", icon: UserCog },
] as const;

/** One figure with a label and a line explaining what it means. */
export function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

/** Shown to a visitor who is not signed in. */
export function SignInPrompt({ what }: { what: string }) {
  return (
    <div className="auth-card">
      <div className="empty-state">
        <Shield size={26} />
        <h3>Sign in to see {what}</h3>
        <p>
          Your records are private. Sign in with your ARCH account, or create one, and they will
          appear here.
        </p>
        <Button asChild size="lg">
          <Link to="/signin">
            Sign in or create an account <ArrowUpRight />
          </Link>
        </Button>
      </div>
    </div>
  );
}

/** Placeholder while a member's own records are loading. */
export function MemberLoading() {
  return (
    <div className="loading-block" aria-busy="true">
      <p>Loading your records…</p>
    </div>
  );
}

/**
 * Shown when a member's records could not be loaded.
 *
 * This is deliberately not the same as an empty logbook: the records are
 * still there, they just could not be reached.
 */
export function MemberError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="data-banner" role="alert">
      <span>
        <strong>Your records could not be loaded.</strong> {message}
      </span>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function MemberShell({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  const { status, user, signOut, error, refresh } = useSession();
  const signedIn = status === "authenticated" && user !== null;

  return (
    <div className="workspace">
      <aside className="workspace-sidebar">
        <span className="eyebrow">{admin ? "ARCH OPERATIONS" : "YOUR CLIMBING SPACE"}</span>
        <div className="profile">
          <span className="avatar">
            {admin ? <Shield size={22} /> : signedIn ? initialsFor(user.full_name) : "?"}
          </span>
          <div>
            <strong>{admin ? "Admin preview" : signedIn ? user.full_name : "Not signed in"}</strong>
            <small>
              {admin
                ? "Operations workspace"
                : signedIn
                  ? `${ROLE_LABELS[user.role] ?? user.role} · ${
                      user.membership_tier ?? "No membership recorded"
                    }`
                  : "Your records are private"}
            </small>
          </div>
        </div>
        <nav aria-label="Workspace navigation">
          {admin ? (
            <Link to="/admin" className="workspace-active">
              <LayoutDashboard size={18} />
              Overview
            </Link>
          ) : (
            memberNav.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                activeProps={{ className: "workspace-active" }}
                activeOptions={{ exact: true }}
              >
                <n.icon size={18} />
                {n.label}
              </Link>
            ))
          )}
        </nav>
        <div className="preview-note">
          {error && (
            <p className="session-warning" role="alert">
              {error}
              <Button variant="outline" size="sm" onClick={() => void refresh()}>
                Try again
              </Button>
            </p>
          )}
          {signedIn && !admin ? (
            <>
              <span className="sample-badge">SIGNED IN</span>
              <p>
                Signed in as {user.email}. Your records are shown from the ARCH database and are
                visible only to you.
              </p>
              {(user.role === "staff" || user.role === "admin") && (
                <Link to="/staff">
                  Staff tools <ArrowUpRight size={14} />
                </Link>
              )}
              <Button variant="outline" size="sm" onClick={signOut}>
                <LogOut size={14} /> Sign out
              </Button>
            </>
          ) : (
            <>
              <span className="sample-badge">SAMPLE PREVIEW</span>
              <p>
                {admin
                  ? "The operations workspace is a preview. Protected administration arrives with the staff tools."
                  : "Sign in to replace the sample records with your own."}
              </p>
              <Link to={admin ? "/member" : "/signin"}>
                {admin ? "Member area" : "Sign in"} <ArrowUpRight size={14} />
              </Link>
            </>
          )}
        </div>
      </aside>
      <main className="workspace-content">{children}</main>
    </div>
  );
}
