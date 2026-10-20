import { useSuspenseQuery } from "@tanstack/react-query";
import { CalendarDays, Check, Clock, MapPin, Ticket, Users } from "lucide-react";

import { EmptyNotice, SampleDataBanner } from "./data-state";
import { PageHeading } from "./shared";
import {
  courseQuery,
  eventQuery,
  formatPrice,
  gymQuery,
  priceQuery,
  ruleQuery,
  type Course,
  type Event,
  type OpeningHour,
  type Price,
  type Rule,
} from "@/services/arch";

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function formatTime(value: string | null): string {
  if (!value) return "—";
  const [hours, minutes] = value.split(":");
  const hour = Number(hours);
  if (Number.isNaN(hour)) return value;
  const suffix = hour >= 12 ? "pm" : "am";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return minutes && minutes !== "00" ? `${display}:${minutes}${suffix}` : `${display}${suffix}`;
}

function formatEventDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function groupPrices(prices: Price[]): { category: string; items: Price[] }[] {
  const groups = new Map<string, Price[]>();
  for (const price of prices) {
    const bucket = groups.get(price.category) ?? [];
    bucket.push(price);
    groups.set(price.category, bucket);
  }
  return Array.from(groups, ([category, items]) => ({ category, items }));
}

function OpeningHoursTable({ hours }: { hours: OpeningHour[] }) {
  return (
    <div className="hours-table">
      {hours.map((hour) => (
        <div className="hours-row" key={hour.dayOfWeek}>
          <span className="hours-day">{DAY_NAMES[hour.dayOfWeek] ?? "Day"}</span>
          <span className="hours-time">
            {hour.isClosed ? (
              <em>Closed — {hour.note || "to be confirmed"}</em>
            ) : (
              <>
                {formatTime(hour.opensAt)} – {formatTime(hour.closesAt)}
              </>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * "Plan your visit" — the practical information a first-time visitor needs:
 * opening hours, prices and the gym rules.
 */
export function VisitPage() {
  const { data: gym } = useSuspenseQuery(gymQuery);
  const { data: prices } = useSuspenseQuery(priceQuery);
  const { data: rules } = useSuspenseQuery(ruleQuery);
  const priceGroups = groupPrices(prices.data);

  return (
    <main className="page-main">
      <PageHeading
        eyebrow="PLAN YOUR VISIT"
        title="Everything you need for your first session."
        description="Opening hours, prices and the rules of the wall. Anything ARCH has not confirmed yet is marked as such."
      >
        <span className="sample-badge">
          {gym.source === "api" ? "LIVE FROM ARCH" : "SAMPLE DATA"}
        </span>
      </PageHeading>

      <SampleDataBanner resource={gym} />

      <section className="content-block">
        <div className="content-block-head">
          <Clock />
          <div>
            <h2>Opening hours</h2>
            <p>
              {gym.data.openingNote || "The hours below are the current published opening times."}
            </p>
          </div>
        </div>
        {gym.data.openingHours.length > 0 ? (
          <OpeningHoursTable hours={gym.data.openingHours} />
        ) : (
          <EmptyNotice
            title="Opening hours are being confirmed."
            description="ARCH has not published the opening times yet. The team at reception will be able to tell you when we are open."
          />
        )}
      </section>

      <section className="content-block">
        <div className="content-block-head">
          <Ticket />
          <div>
            <h2>Prices</h2>
            <p>Passes, memberships and hire prices.</p>
          </div>
        </div>
        <SampleDataBanner resource={prices} />
        {priceGroups.length > 0 ? (
          <div className="price-groups">
            {priceGroups.map((group) => (
              <div className="price-group" key={group.category}>
                <h3>{group.category}</h3>
                <ul>
                  {group.items.map((price) => (
                    <li key={price.id}>
                      <div>
                        <strong>{price.name}</strong>
                        {price.description && <small>{price.description}</small>}
                      </div>
                      <span className="price-amount">
                        {formatPrice(price.amountVnd)}
                        {price.unit && <small> / {price.unit}</small>}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <EmptyNotice
            title="The price list is being confirmed."
            description="ARCH has not published prices yet. Once they are finalised they will appear here — we would rather leave this blank than show you a guess."
          />
        )}
      </section>

      <section className="content-block">
        <div className="content-block-head">
          <Check />
          <div>
            <h2>Gym rules</h2>
            <p>Short, sensible and easy to follow.</p>
          </div>
        </div>
        <SampleDataBanner resource={rules} />
        {rules.data.length > 0 ? (
          <ul className="rule-list">
            {rules.data.map((rule: Rule) => (
              <li key={rule.id}>
                <div>
                  <strong>{rule.title}</strong>
                  <p>{rule.body}</p>
                </div>
                {!rule.isConfirmed && <span className="sample-badge">DRAFT</span>}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyNotice
            title="The rules are being confirmed."
            description="ARCH has not published the gym rules yet. The wall is a shared space, so the team will walk you through them on your first visit."
          />
        )}
      </section>

      <section className="content-block">
        <div className="content-block-head">
          <MapPin />
          <div>
            <h2>Finding us</h2>
            <p>Where to go once you have arrived.</p>
          </div>
        </div>
        <div className="visit-facts">
          <p>
            <MapPin /> {gym.data.address || "Hanoi, Vietnam — street address to be confirmed"}
          </p>
          <p>
            <Users />{" "}
            {gym.data.surfaceAreaM2
              ? `${gym.data.surfaceAreaM2} m² of climbing space`
              : "Bouldering only — no ropes required"}
          </p>
          <p>
            <Ticket />{" "}
            {gym.data.routeCount
              ? `${gym.data.routeCount} routes on the wall`
              : "Routes for every level"}
          </p>
          <small>
            {gym.data.isPlaceholder
              ? "Contact details are placeholders until ARCH confirms them."
              : "These details are published by ARCH."}
          </small>
        </div>
      </section>
    </main>
  );
}

/** The course catalogue. */
export function CoursesPage() {
  const { data: courses } = useSuspenseQuery(courseQuery);
  return (
    <main className="page-main">
      <PageHeading
        eyebrow="COURSES"
        title="Learn the moves, not just the gym."
        description="Intro sessions for first-timers and structured courses for climbers who want a plan."
      >
        <span className="sample-badge">
          {courses.source === "api" ? "LIVE FROM ARCH" : "SAMPLE DATA"}
        </span>
      </PageHeading>
      <SampleDataBanner resource={courses} />
      {courses.data.length > 0 ? (
        <div className="card-grid">
          {courses.data.map((course: Course) => (
            <article className="content-card" key={course.id}>
              <span className="card-kicker">{course.level}</span>
              <h2>{course.title}</h2>
              <p>{course.summary}</p>
              {course.description && <small>{course.description}</small>}
              <dl className="card-facts">
                {course.schedule && (
                  <div>
                    <dt>Schedule</dt>
                    <dd>{course.schedule}</dd>
                  </div>
                )}
                {course.instructor && (
                  <div>
                    <dt>Instructor</dt>
                    <dd>{course.instructor}</dd>
                  </div>
                )}
                {course.durationWeeks && (
                  <div>
                    <dt>Length</dt>
                    <dd>{course.durationWeeks} weeks</dd>
                  </div>
                )}
                {course.capacity && (
                  <div>
                    <dt>Places</dt>
                    <dd>{course.capacity}</dd>
                  </div>
                )}
                {course.priceVnd !== null && (
                  <div>
                    <dt>Price</dt>
                    <dd>{formatPrice(course.priceVnd)}</dd>
                  </div>
                )}
              </dl>
            </article>
          ))}
        </div>
      ) : (
        <EmptyNotice
          title="The course schedule is being confirmed."
          description="ARCH runs introductory and progressing courses. The current schedule, prices and places will be listed here as soon as they are confirmed."
        />
      )}
    </main>
  );
}

/** The public event calendar. */
export function EventsPage() {
  const { data: events } = useSuspenseQuery(eventQuery);
  return (
    <main className="page-main">
      <PageHeading
        eyebrow="EVENTS"
        title="Dates worth showing up for."
        description="Community sessions, workshops and the occasional competition."
      >
        <span className="sample-badge">
          {events.source === "api" ? "LIVE FROM ARCH" : "SAMPLE DATA"}
        </span>
      </PageHeading>
      <SampleDataBanner resource={events} />
      {events.data.length > 0 ? (
        <div className="event-list">
          {events.data.map((event: Event) => (
            <article className="event-row" key={event.id}>
              <div className="event-date">
                <CalendarDays size={20} />
                <span>{formatEventDate(event.startsAt)}</span>
              </div>
              <div className="event-detail">
                <h2>{event.title}</h2>
                {event.description && <p>{event.description}</p>}
                <div className="event-meta">
                  {event.location && <span>{event.location}</span>}
                  {event.capacity && <span>{event.capacity} places</span>}
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyNotice
          title="The event calendar is being confirmed."
          description="ARCH runs community sessions and competitions. The published calendar will appear here as soon as the dates are confirmed."
        />
      )}
    </main>
  );
}
