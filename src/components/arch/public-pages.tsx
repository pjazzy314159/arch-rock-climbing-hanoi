import { useState, useRef } from "react";
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
  Users,
  Dumbbell,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeading, RouteCard, TextLink } from "./shared";
import { productQuery, routeQuery, formatPrice, type Product } from "@/services/arch";
import gymPhoto from "@/assets/arch-gym.jpg";
import shoePhoto from "@/assets/climbing-shoes.jpg";

export function GymPage() {
  return (
    <main className="page-main">
      <PageHeading
        eyebrow="THE GYM"
        title="A space to find your next move."
        description="Built for climbing. Made for connection. Welcome to ARCH."
      />
      <img
        className="gym-banner"
        src={gymPhoto}
        width={1920}
        height={1024}
        alt="Industrial bouldering gym with colorful holds and community seating"
      />
      <div className="info-grid">
        <div>
          <Mountain />
          <h3>Walls for every climber</h3>
          <p>
            From approachable slabs to powerful overhangs. Find your flow on a variety of wall
            angles and climbing styles.
          </p>
        </div>
        <div>
          <Users />
          <h3>Your people are here</h3>
          <p>
            Share a beta, celebrate a send, or take your first step. Our community makes every
            session a little better.
          </p>
        </div>
        <div>
          <Dumbbell />
          <h3>Room to grow</h3>
          <p>
            Warm-up areas, a training zone, and fresh route setting keep your sessions challenging
            and rewarding.
          </p>
        </div>
      </div>
      <section className="split-band">
        <div>
          <span className="eyebrow">YOUR FIRST SESSION</span>
          <h2>All you need is curiosity.</h2>
          <p>
            Comfortable clothes, a water bottle, and a willingness to try. Climbing shoes can be
            rented at reception. Our team will help you get started with a safety introduction.
          </p>
          <TextLink to="/contact">Plan your visit</TextLink>
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
  const { data: routes } = useSuspenseQuery(routeQuery);
  const [grade, setGrade] = useState("All grades");
  const [zone, setZone] = useState("All walls");
  const [query, setQuery] = useState("");
  const [fresh, setFresh] = useState(false);
  const filtered = routes.filter(
    (r) =>
      (grade === "All grades" || r.grade === grade) &&
      (zone === "All walls" || r.zone === zone) &&
      (!fresh || r.fresh) &&
      `${r.name} ${r.style}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <main className="page-main">
      <PageHeading
        eyebrow="THE ROUTE COLLECTION"
        title="Find your next challenge."
        description="Balance, power, or a little problem-solving. There’s a route with your name on it."
      >
        <span className="sample-badge">SAMPLE ROUTES</span>
      </PageHeading>
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
          {["All grades", "V0", "V1", "V3", "V4", "V5", "V6"].map((g) => (
            <option key={g}>{g}</option>
          ))}
        </select>
        <select aria-label="Filter wall" value={zone} onChange={(e) => setZone(e.target.value)}>
          {["All walls", "The Main Wall", "The Slab", "The Cave"].map((z) => (
            <option key={z}>{z}</option>
          ))}
        </select>
        <label className="check-filter">
          <input type="checkbox" checked={fresh} onChange={(e) => setFresh(e.target.checked)} />
          New sets only
        </label>
      </div>
      <div className="result-count">
        {filtered.length} routes <span>Sample collection · October 2026</span>
      </div>
      <div className="route-grid">
        {filtered.map((r) => (
          <RouteCard route={r} key={r.id} />
        ))}
      </div>
      {filtered.length === 0 && (
        <div className="empty-state">
          <Mountain />
          <h3>No routes match this search.</h3>
          <Button
            variant="outline"
            onClick={() => {
              setQuery("");
              setGrade("All grades");
              setZone("All walls");
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
          src={shoePhoto}
          alt={`${product.name} climbing shoe — illustrative image`}
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
  return (
    <main className="page-main">
      <PageHeading
        eyebrow="ARCH SHOE SHOP"
        title="Every great move starts with a good fit."
        description="A considered selection for your first climb, your next project, and everything between."
      >
        <span className="sample-badge">SAMPLE CATALOG · NO CHECKOUT</span>
      </PageHeading>
      <div className="category-tabs">
        {["All shoes", "Beginner", "All-round", "Performance"].map((c) => (
          <Button
            variant={category === c ? "default" : "ghost"}
            key={c}
            onClick={() => setCategory(c)}
          >
            {c}
          </Button>
        ))}
      </div>
      <div className="product-grid">
        {products
          .filter((p) => category === "All shoes" || p.category === category)
          .map((p) => (
            <ProductCard product={p} key={p.id} />
          ))}
      </div>
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
export function ProductPage({ product }: { product: Product }) {
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
          src={shoePhoto}
          width={1024}
          height={1024}
          alt={`${product.name} illustrative climbing shoe`}
        />
        <div>
          <span className="eyebrow">
            {product.brand} · {product.category}
          </span>
          <h1>{product.name}</h1>
          <div className="product-price">{formatPrice(product.price)}</div>
          <p>{product.description}</p>
          <span className="sample-badge">SAMPLE PRODUCT · NO PAYMENTS</span>
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

export function ContactPage() {
  const [sent, setSent] = useState(false);
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
        <form
          className="contact-form"
          onSubmit={(e) => {
            e.preventDefault();
            setSent(true);
          }}
        >
          <h2>Drop us a message.</h2>
          <span className="sample-badge">PREVIEW FORM · NOT SENT</span>
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
          <Button type="submit" size="lg">
            Preview message <ArrowUpRight />
          </Button>
          {sent && (
            <p className="feedback" role="status">
              Your message passed validation. This preview does not send or store messages.
            </p>
          )}
        </form>
      </div>
    </main>
  );
}
