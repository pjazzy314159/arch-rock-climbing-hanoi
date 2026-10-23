import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  ArrowRight,
  Mountain,
  Menu,
  X,
  MapPin,
  Instagram,
  MoveUpRight,
  Users,
  Dumbbell,
  Footprints,
  Sparkles,
  Shirt,
} from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { gymQuery, serviceStatusQuery, type ClimbRoute, WALL_TYPE_LABELS } from "@/services/arch";
import { useSession } from "@/services/session";

const nav = [
  { to: "/", label: "Home" },
  { to: "/gym", label: "The Gym" },
  { to: "/tour", label: "360° Tour" },
  { to: "/routes", label: "Routes" },
  { to: "/leaderboard", label: "Leaderboard" },
  { to: "/courses", label: "Courses" },
  { to: "/events", label: "Events" },
  { to: "/visit", label: "Visit" },
  { to: "/shop", label: "Shoe Shop" },
  { to: "/contact", label: "Contact" },
] as const;

/** Icons the backend can ask for by name. */
const serviceIcons = {
  mountain: Mountain,
  users: Users,
  dumbbell: Dumbbell,
  footprints: Footprints,
  sparkles: Sparkles,
  shirt: Shirt,
} as const;

export function ServiceIcon({ name }: { name: string }) {
  const Icon = serviceIcons[name as keyof typeof serviceIcons] ?? Mountain;
  return <Icon />;
}
export function Brand() {
  return (
    <Link to="/" aria-label="ARCH home" className="brand">
      <span className="brand-mark">
        <Mountain />
      </span>
      <span className="brand-type">
        ARCH<small>ROCK CLIMBING HANOI</small>
      </span>
    </Link>
  );
}
export function Header() {
  const [open, setOpen] = useState(false);
  const { status, user } = useSession();
  const signedIn = status === "authenticated";
  const memberTarget = signedIn ? "/member" : "/signin";
  const memberLabel = signedIn ? "My climbing space" : "Sign in";
  return (
    <header className="site-header">
      <div className="header-inner">
        <Brand />
        <nav className="desktop-nav" aria-label="Main navigation">
          {nav.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              activeProps={{ className: "nav-active" }}
              activeOptions={{ exact: true }}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <Button asChild className="member-button">
          <Link to={memberTarget}>
            {memberLabel} <ArrowUpRight />
          </Link>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="mobile-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen(!open)}
        >
          {open ? <X /> : <Menu />}
        </Button>
      </div>
      {open && (
        <nav className="mobile-nav" aria-label="Mobile navigation">
          {nav.map((n) => (
            <Link to={n.to} key={n.to} onClick={() => setOpen(false)}>
              {n.label}
              <ArrowUpRight size={16} />
            </Link>
          ))}
          <Link to={memberTarget} onClick={() => setOpen(false)}>
            {memberLabel}
            {signedIn && user ? ` · ${user.full_name.split(" ")[0]}` : ""}
            <ArrowUpRight size={16} />
          </Link>
        </nav>
      )}
    </header>
  );
}
export function Footer() {
  // A non-suspense query so the footer can report where the page data came
  // from without needing a loader on every route. The root route prefetches
  // it, so the first render already has the right answer.
  const { data } = useQuery(serviceStatusQuery);
  const live = data?.data === true;
  return (
    <footer className="site-footer">
      <div className="footer-top">
        <Brand />
        <p>
          Different people. One wall.
          <br />
          Find your place at ARCH.
        </p>
        <Link to="/contact" className="footer-contact">
          Let’s climb <ArrowUpRight />
        </Link>
      </div>
      <div className="footer-bottom">
        <span>© {new Date().getFullYear()} ARCH Rock Climbing Hanoi</span>
        <span className="footer-location">
          <MapPin size={13} /> Hanoi, Vietnam
        </span>
        {/* The service status is fetched on the server and again on the
            client, so the first client render can briefly disagree with the
            server-rendered text. React patches this one node instead of
            re-rendering the whole tree. */}
        <span suppressHydrationWarning>{live ? "Live from ARCH" : "Sample data"}</span>
        <Link to="/admin">
          Admin preview <MoveUpRight size={12} />
        </Link>
      </div>
    </footer>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {children}
    </div>
  );
}
export function RouteCard({ route }: { route: ClimbRoute }) {
  // An image is only worth showing when it actually loads. Try the route's
  // own picture first, then the wall's photograph, then the placeholder.
  const candidates = [route.imageUrl, route.wallImageUrl].filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
  const [failed, setFailed] = useState<string[]>([]);
  const photo = candidates.find((url) => !failed.includes(url)) ?? null;

  const isArchived = route.status === "archived";
  const isResetting = route.status === "pending_reset";

  return (
    <Link
      to="/routes/$routeId"
      params={{ routeId: route.id }}
      className={`route-card hold-${route.color}${isArchived ? " route-card-archived" : ""}`}
    >
      <div className="route-card-top">
        <span className="route-dot" />
        <span>{route.wall || "Wall to be confirmed"}</span>
        <span className="route-card-tags">
          {route.wallType && (
            <span className="route-type-tag">{WALL_TYPE_LABELS[route.wallType]}</span>
          )}
          {route.fresh && !isArchived && <span className="fresh-tag">NEW SET</span>}
          {isArchived && <span className="route-status-tag status-archived">ARCHIVED</span>}
          {isResetting && <span className="route-status-tag status-resetting">BEING RESET</span>}
        </span>
      </div>
      <div className="route-card-art">
        {photo ? (
          <img
            className="route-photo"
            src={photo}
            alt=""
            loading="lazy"
            onError={() => setFailed((previous) => [...previous, photo])}
          />
        ) : (
          <>
            <span className="hold hold-one" aria-hidden="true" />
            <span className="hold hold-two" aria-hidden="true" />
            <span className="hold hold-three" aria-hidden="true" />
            <span className="hold hold-four" aria-hidden="true" />
            <span className="photo-note">No photo yet</span>
          </>
        )}
        <span className="route-grade-art">{route.grade}</span>
      </div>
      <div className="route-card-bottom">
        <div>
          <span className="card-kicker">{route.style}</span>
          <h3>{route.name}</h3>
        </div>
        <ArrowUpRight size={22} />
      </div>
      <div className="route-meta">
        <span>
          {WALL_TYPE_LABELS[route.wallType]} type
          {route.setter ? ` · Set by ${route.setter}` : ""}
        </span>
        <span>
          {route.sends} {route.sends === 1 ? "send" : "sends"}
          {route.voteCount > 0 && ` · ${route.voteCount} vote${route.voteCount === 1 ? "" : "s"}`}
        </span>
      </div>
      {route.perceivedGrade && route.perceivedGrade !== route.grade && (
        <div className="route-perceived">Climbers say {route.perceivedGrade}</div>
      )}
    </Link>
  );
}
export function TextLink({
  to,
  children,
}: {
  to:
    | "/"
    | "/gym"
    | "/tour"
    | "/routes"
    | "/courses"
    | "/events"
    | "/visit"
    | "/shop"
    | "/contact"
    | "/member"
    | "/member/logbook"
    | "/admin"
    | "/leaderboard";
  children: ReactNode;
}) {
  return (
    <Link className="text-link" to={to}>
      {children}
      <ArrowRight size={17} />
    </Link>
  );
}
