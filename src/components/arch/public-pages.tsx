import { useState, useRef, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  ArrowRight,
  Check,
  MapPin,
  Clock,
  Mail,
  RotateCcw,
  Expand,
  ChevronLeft,
  ChevronRight,
  Search,
  Mountain,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useHydrated } from "@/hooks/use-hydrated";
import { api, ApiError, ApiUnavailableError } from "@/services/api";
import { PageHeading, RouteCard, ServiceIcon, TextLink } from "./shared";
import { EmptyNotice, SampleDataBanner } from "./data-state";
import {
  allRoutesQuery,
  productQuery,
  routeQuery,
  serviceQuery,
  formatPrice,
  WALL_TYPE_LABELS,
  ROUTE_STATUS_LABELS,
  type DataSource,
  type Product,
  type RouteStatus,
  type WallType,
} from "@/services/arch";
import gymPhoto from "@/assets/arch-gym.jpg";
import shoePhoto from "@/assets/climbing-shoes.jpg";

export function GymPage() {
  const { data: services } = useSuspenseQuery(serviceQuery);
  return (
    <main className="page-main">
      <PageHeading
        eyebrow="THE GYM"
        title="A space to find your next move."
        description="Built for climbing. Made for connection. Welcome to ARCH."
      />
      <SampleDataBanner resource={services} />
      <img
        className="gym-banner"
        src={gymPhoto}
        width={1920}
        height={1024}
        alt="Industrial bouldering gym with colorful holds and community seating"
      />
      <div className="info-grid">
        {services.data.map((service) => (
          <div key={service.title}>
            <ServiceIcon name={service.icon} />
            <h3>{service.title}</h3>
            <p>{service.summary}</p>
          </div>
        ))}
      </div>
      <section className="split-band">
        <div>
          <span className="eyebrow">YOUR FIRST SESSION</span>
          <h2>All you need is curiosity.</h2>
          <p>
            Comfortable clothes, a water bottle, and a willingness to try. Climbing shoes can be
            rented at reception. Our team will help you get started with a safety introduction.
          </p>
          <TextLink to="/visit">Plan your visit</TextLink>
        </div>
        <div className="visit-facts">
          <h3>Good to know</h3>
          <p>
            <Check /> Beginner introduction available
          </p>
          <p>
            <Check /> Climbing shoe rental
          </p>
          <p>
            <Check /> Changing rooms & lockers
          </p>
          <p>
            <Check /> Bouldering · No ropes required
          </p>
          <small>Facilities and operating details are illustrative pending confirmation.</small>
        </div>
      </section>
    </main>
  );
}

export function TourPage() {
  const [zone, setZone] = useState(0);
  const [pan, setPan] = useState(50);
  const [zoom, setZoom] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const zones = ["The Main Wall", "The Slab", "The Cave", "Training Area"];
  return (
    <main className="page-main">
      <PageHeading
        eyebrow="360° VIRTUAL TOUR"
        title="Get a feel for the space."
        description="A photographic preview of the gym. Full 360° capture coming with the live experience."
      />
      <div className={`tour-view ${zoom ? "tour-zoom" : ""}`} ref={container}>
        <img
          src={gymPhoto}
          width={1920}
          height={1024}
          alt={`${zones[zone]} photographic gym preview`}
          style={{ objectPosition: `${pan}% center` }}
        />
        <div className="tour-caption">
          <span className="eyebrow">PHOTO PREVIEW · NOT A 360° CAPTURE</span>
          <h2>{zones[zone]}</h2>
        </div>
        <div className="tour-controls">
          <Button
            variant="hero"
            size="icon"
            aria-label="Pan left"
            title="Pan left"
            onClick={() => setPan(Math.max(0, pan - 15))}
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="hero"
            size="icon"
            aria-label="Reset view"
            title="Reset view"
            onClick={() => {
              setPan(50);
              setZoom(false);
            }}
          >
            <RotateCcw />
          </Button>
          <Button
            variant="hero"
            size="icon"
            aria-label="Zoom view"
            title="Zoom view"
            onClick={() => setZoom(!zoom)}
          >
            <Expand />
          </Button>
          <Button
            variant="hero"
            size="icon"
            aria-label="Pan right"
            title="Pan right"
            onClick={() => setPan(Math.min(100, pan + 15))}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
      <div className="tour-zones">
        {zones.map((z, i) => (
          <Button
            key={z}
            variant={zone === i ? "default" : "outline"}
            onClick={() => {
              setZone(i);
              setPan([50, 10, 80, 100][i] ?? 50);
            }}
          >
            <span>0{i + 1}</span>
            {z}
            <ArrowUpRight />
          </Button>
        ))}
      </div>
    </main>
  );
}

export function RoutesPage() {
  const { data: routes } = useSuspenseQuery(allRoutesQuery);
  const [grade, setGrade] = useState("All grades");
  const [wall, setWall] = useState("All walls");
  const [wallType, setWallType] = useState("All types");
  const [status, setStatus] = useState("active");
  const [query, setQuery] = useState("");
  const [fresh, setFresh] = useState(false);
  const list = routes.data;
  const filtered = list.filter(
    (r) =>
      (grade === "All grades" || r.grade === grade) &&
      (wall === "All walls" || r.wall === wall) &&
      (wallType === "All types" || r.wallType === wallType) &&
      (status === "all" || r.status === status) &&
      (!fresh || r.fresh) &&
      `${r.name} ${r.style} ${r.wall}`.toLowerCase().includes(query.toLowerCase()),
  );
  const grades = ["All grades", ...Array.from(new Set(list.map((r) => r.grade))).sort()];
  const walls = [
    "All walls",
    ...Array.from(new Set(list.map((r) => r.wall).filter(Boolean))).sort(),
  ];
  const wallTypes = ["All types", ...Array.from(new Set(list.map((r) => r.wallType))).sort()];
  const statuses = ["active", "archived", "pending_reset", "all"];
  return (
    <main className="page-main">
      <PageHeading
        eyebrow="THE ROUTE COLLECTION"
        title="Find your next challenge."
        description="Balance, power, or a little problem-solving. There’s a route with your name on it."
      >
        <span className="sample-badge">
          {routes.source === "api" ? "LIVE ROUTES" : "SAMPLE ROUTES"}
        </span>
      </PageHeading>
      <SampleDataBanner resource={routes} />
      <div className="filter-bar">
        <label className="search-field">
          <Search size={18} />
          <input
            aria-label="Search routes"
            placeholder="Search routes or style…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <select aria-label="Filter grade" value={grade} onChange={(e) => setGrade(e.target.value)}>
          {grades.map((g) => (
            <option key={g}>{g}</option>
          ))}
        </select>
        <select aria-label="Filter wall" value={wall} onChange={(e) => setWall(e.target.value)}>
          {walls.map((w) => (
            <option key={w}>{w}</option>
          ))}
        </select>
        <select
          aria-label="Filter wall type"
          value={wallType}
          onChange={(e) => setWallType(e.target.value)}
        >
          {wallTypes.map((t) => (
            <option key={t} value={t}>
              {t === "All types" ? t : WALL_TYPE_LABELS[t as WallType]}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter route status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          {statuses.map((s) => (
            <option key={s} value={s}>
              {s === "all" ? "All statuses" : ROUTE_STATUS_LABELS[s as RouteStatus]}
            </option>
          ))}
        </select>
        <label className="check-filter">
          <input type="checkbox" checked={fresh} onChange={(e) => setFresh(e.target.checked)} />
          New sets only
        </label>
      </div>
      <div className="result-count">
        {filtered.length} routes{" "}
        <span>
          {routes.source === "api" ? "Live from ARCH" : "Sample collection · October 2026"}
        </span>
      </div>
      {list.length === 0 ? (
        <EmptyNotice
          title="No routes are published yet."
          description="ARCH has not published the current route list. It will appear here as soon as the setters publish it."
        />
      ) : (
        <div className="route-grid">
          {filtered.map((r) => (
            <RouteCard route={r} key={r.id} />
          ))}
        </div>
      )}
      {list.length > 0 && filtered.length === 0 && (
        <div className="empty-state">
          <Mountain />
          <h3>No routes match this search.</h3>
          <Button
            variant="outline"
            onClick={() => {
              setQuery("");
              setGrade("All grades");
              setWall("All walls");
              setWallType("All types");
              setStatus("active");
              setFresh(false);
            }}
          >
            Clear filters
          </Button>
        </div>
      )}
    </main>
  );
}

function ProductCard({ product }: { product: Product }) {
  return (
    <Link to="/shop/$productId" params={{ productId: product.id }} className="product-card">
      <div className="product-image">
        <img
          src={product.imageUrl ?? shoePhoto}
          alt={`${product.name} climbing shoe`}
          width={1024}
          height={1024}
          loading="lazy"
        />
        <span>{product.fit}</span>
        <ArrowUpRight />
      </div>
      <div className="product-info">
        <span className="card-kicker">{product.brand}</span>
        <h3>{product.name}</h3>
        <p>{product.category} climbing shoe</p>
        <strong>{formatPrice(product.price)}</strong>
      </div>
    </Link>
  );
}
export function ShopPage() {
  const { data: products } = useSuspenseQuery(productQuery);
  const [category, setCategory] = useState("All shoes");
  const list = products.data;
  const categories = ["All shoes", ...Array.from(new Set(list.map((p) => p.category)))];
  return (
    <main className="page-main">
      <PageHeading
        eyebrow="ARCH SHOE SHOP"
        title="Every great move starts with a good fit."
        description="A considered selection for your first climb, your next project, and everything between."
      >
        <span className="sample-badge">
          {products.source === "api"
            ? "LIVE CATALOG · NO CHECKOUT"
            : "SAMPLE CATALOG · NO CHECKOUT"}
        </span>
      </PageHeading>
      <SampleDataBanner resource={products} />
      <div className="category-tabs">
        {categories.map((c) => (
          <Button
            variant={category === c ? "default" : "ghost"}
            key={c}
            onClick={() => setCategory(c)}
          >
            {c}
          </Button>
        ))}
      </div>
      {list.length === 0 ? (
        <EmptyNotice
          title="The shoe shop is being set up."
          description="ARCH has not published the current collection yet. It will appear here as soon as it is ready."
        />
      ) : (
        <div className="product-grid">
          {list
            .filter((p) => category === "All shoes" || p.category === category)
            .map((p) => (
              <ProductCard product={p} key={p.id} />
            ))}
        </div>
      )}
      <div className="shop-note">
        <FootnoteIcon />
        <div>
          <h3>Find the fit, not just the size.</h3>
          <p>Visit the gym to try a pair. Sample products, prices and imagery are illustrative.</p>
        </div>
        <TextLink to="/contact">Ask about fitting</TextLink>
      </div>
    </main>
  );
}
function FootnoteIcon() {
  return <Mountain size={26} />;
}
export function ProductPage({
  product,
  source = "sample",
}: {
  product: Product;
  source?: DataSource;
}) {
  const [size, setSize] = useState("");
  const [selected, setSelected] = useState(false);
  return (
    <main className="page-main">
      <div className="breadcrumb">
        <Link to="/shop">Shoe Shop</Link>
        <ChevronRight size={14} />
        {product.name}
      </div>
      <div className="product-detail">
        <img
          src={product.imageUrl ?? shoePhoto}
          width={1024}
          height={1024}
          alt={`${product.name} climbing shoe`}
        />
        <div>
          <span className="eyebrow">
            {product.brand} · {product.category}
          </span>
          <h1>{product.name}</h1>
          <div className="product-price">{formatPrice(product.price)}</div>
          <p>{product.description}</p>
          <span className="sample-badge">
            {source === "api" ? "LIVE PRODUCT · NO CHECKOUT" : "SAMPLE PRODUCT · NO PAYMENTS"}
          </span>
          <fieldset className="size-selector">
            <legend>EU size {size && `— ${size}`}</legend>
            {["36", "37", "38", "39", "40", "41", "42", "43", "44"].map((s) => (
              <Button
                key={s}
                variant={size === s ? "default" : "outline"}
                aria-pressed={size === s}
                onClick={() => {
                  setSize(s);
                  setSelected(false);
                }}
              >
                {s}
              </Button>
            ))}
          </fieldset>
          <Button size="lg" disabled={!size} onClick={() => setSelected(true)}>
            {selected ? (
              <>
                <Check /> Added to fitting list
              </>
            ) : (
              <>
                Save for a fitting <ArrowRight />
              </>
            )}
          </Button>
          {selected && (
            <p className="feedback" role="status">
              Size {size} selected for this preview session. No reservation has been made.
            </p>
          )}
          <div className="product-specs">
            <p>
              <span>Profile</span>
              <strong>{product.fit}</strong>
            </p>
            <p>
              <span>Closure</span>
              <strong>Dual hook-and-loop</strong>
            </p>
            <p>
              <span>Best for</span>
              <strong>{product.category} climbing</strong>
            </p>
          </div>
          <TextLink to="/contact">Arrange an in-person fitting</TextLink>
        </div>
      </div>
    </main>
  );
}

type ContactState =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "sent" }
  | { status: "failed"; message: string };

export function ContactPage() {
  const [state, setState] = useState<ContactState>({ status: "idle" });
  const hydrated = useHydrated();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setState({ status: "sending" });
    try {
      await api.submitContactMessage({
        name: String(data.get("name") ?? ""),
        email: String(data.get("email") ?? ""),
        subject: String(data.get("subject") ?? "General"),
        message: String(data.get("message") ?? ""),
      });
      form.reset();
      setState({ status: "sent" });
    } catch (error) {
      if (error instanceof ApiUnavailableError) {
        setState({
          status: "failed",
          message:
            "The ARCH service is not reachable right now, so your message was not sent. Please try again later or contact the gym directly.",
        });
        return;
      }
      if (error instanceof ApiError) {
        setState({
          status: "failed",
          message: `${error.message} Your message was not sent.`,
        });
        return;
      }
      setState({
        status: "failed",
        message: "Your message could not be sent. Please try again.",
      });
    }
  }

  return (
    <main className="page-main">
      <PageHeading
        eyebrow="LET’S TALK CLIMBING"
        title="See you on the wall."
        description="First session, shoe fitting, or a question about ARCH? We’re happy to help."
      />
      <div className="contact-grid">
        <div>
          <div className="contact-item">
            <MapPin />
            <div>
              <h3>Find us in Hanoi</h3>
              <p>
                ARCH Rock Climbing Hanoi
                <br />
                Hanoi, Vietnam
              </p>
              <small>Street address pending confirmation</small>
            </div>
          </div>
          <div className="contact-item">
            <Clock />
            <div>
              <h3>Make time for a climb</h3>
              <p>Opening hours to be confirmed.</p>
            </div>
          </div>
          <div className="contact-item">
            <Mail />
            <div>
              <h3>Stay in touch</h3>
              <p>Contact details coming soon.</p>
            </div>
          </div>
          <img
            className="contact-photo"
            src={gymPhoto}
            width={1920}
            height={1024}
            loading="lazy"
            alt="The climbing walls and community space"
          />
        </div>
        <form className="contact-form" onSubmit={handleSubmit}>
          <h2>Drop us a message.</h2>
          <label>
            Your name
            <input required name="name" autoComplete="name" placeholder="Name" />
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
            What’s on your mind?
            <select name="subject">
              <option>My first visit</option>
              <option>Membership</option>
              <option>Shoe fitting</option>
              <option>Something else</option>
            </select>
          </label>
          <label>
            Message
            <textarea required name="message" rows={4} placeholder="Tell us a little more…" />
          </label>
          <Button type="submit" size="lg" disabled={!hydrated || state.status === "sending"}>
            {state.status === "sending" ? "Sending…" : "Send message"}
            <ArrowUpRight />
          </Button>
          {state.status === "sent" && (
            <p className="feedback" role="status">
              Thanks — your message reached the ARCH team. They will get back to you.
            </p>
          )}
          {state.status === "failed" && (
            <p className="feedback error" role="alert">
              {state.message}
            </p>
          )}
        </form>
      </div>
    </main>
  );
}
