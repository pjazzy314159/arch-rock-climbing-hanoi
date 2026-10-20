import { Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  ArrowRight,
  MoveUpRight,
  Play,
  MapPin,
  Mountain,
  Footprints,
  Users,
} from "lucide-react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { routeQuery } from "@/services/arch";
import { RouteCard, TextLink } from "./shared";
import gymPhoto from "@/assets/arch-gym.jpg";
import shoePhoto from "@/assets/climbing-shoes.jpg";
export function Home() {
  const { data: routes } = useSuspenseQuery(routeQuery);
  return (
    <>
      <section className="home-hero">
        <img
          className="hero-photo"
          src={gymPhoto}
          alt="A climber on an overhanging wall in an industrial climbing gym"
          width={1920}
          height={1024}
        />
        <div className="hero-shade" />
        <div className="hero-inner">
          <div className="hero-eyebrow">
            <span className="live-dot" /> YOUR CLIMBING COMMUNITY IN HANOI
          </div>
          <h1>
            ARCH
            <span>
              Rock climbing.
              <br />
              Real connection.
            </span>
          </h1>
          <p>
            A little chalk. A new challenge. A place to belong.
            <br className="desktop-break" /> Your next move starts here.
          </p>
          <div className="hero-actions">
            <Button size="lg" asChild>
              <Link to="/gym">
                Explore the gym <ArrowUpRight />
              </Link>
            </Button>
            <Button variant="hero" size="lg" asChild>
              <Link to="/tour">
                <Play size={15} /> Take a virtual tour
              </Link>
            </Button>
          </div>
          <div className="hero-bottom">
            <span>
              <MapPin size={15} /> HANOI, VIETNAM
            </span>
            <Link to="/routes">
              FIND YOUR NEXT CHALLENGE <MoveUpRight size={16} />
            </Link>
          </div>
        </div>
        <div className="hero-side-label">CLIMB HIGHER. CONNECT DEEPER.</div>
      </section>
      <section className="stats-strip" aria-label="Gym at a glance">
        <div>
          <Mountain />
          <strong>
            600<span>m²</span>
          </strong>
          <span>Space to move</span>
        </div>
        <div>
          <Footprints />
          <strong>
            64<span>+</span>
          </strong>
          <span>Routes to discover</span>
        </div>
        <div>
          <ArrowUpRight />
          <strong>V0–V8</strong>
          <span>Every level welcome</span>
        </div>
        <div>
          <Users />
          <strong>One</strong>
          <span>Climbing community</span>
        </div>
      </section>
      <section className="home-routes section-wrap">
        <div className="section-title">
          <div>
            <span className="eyebrow">FRESH CHALK. FRESH CHALLENGES.</span>
            <h2>Your next project awaits.</h2>
          </div>
          <TextLink to="/routes">Explore all routes</TextLink>
        </div>
        <div className="route-grid">
          {routes.slice(0, 3).map((r) => (
            <RouteCard key={r.id} route={r} />
          ))}
        </div>
        <div className="section-footnote">
          <span className="live-dot" /> Fresh sets, new possibilities. A different challenge every
          week.
        </div>
      </section>
      <section className="community-section section-wrap">
        <div className="community-copy">
          <span className="eyebrow">MORE THAN A CLIMBING GYM</span>
          <h2>
            Come for the climb.
            <br />
            Stay for the people.
          </h2>
          <p>
            First-timer or seasoned sender, there’s a place for you on our walls. We’re here for the
            small wins, the big sends, and everything in between.
          </p>
          <TextLink to="/gym">Get to know ARCH</TextLink>
          <div className="community-tags">
            <span>BOULDERING</span>
            <span>COMMUNITY</span>
            <span>GOOD ENERGY</span>
          </div>
        </div>
        <img
          src={gymPhoto}
          loading="lazy"
          width={1920}
          height={1024}
          alt="Climbers sharing a session at an indoor bouldering wall"
        />
      </section>
      <section className="shop-teaser section-wrap">
        <img
          src={shoePhoto}
          loading="lazy"
          width={1024}
          height={1024}
          alt="Black and yellow performance climbing shoes"
        />
        <div>
          <span className="eyebrow">BETTER FIT. BETTER FOOTWORK.</span>
          <h2>Find your footing.</h2>
          <p>
            From your first pair to your next performance upgrade. Discover our climbing shoe
            selection.
          </p>
          <Button asChild size="lg">
            <Link to="/shop">
              Explore the shoe shop <ArrowRight />
            </Link>
          </Button>
        </div>
      </section>
    </>
  );
}
