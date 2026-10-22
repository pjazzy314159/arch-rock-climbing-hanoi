import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ImageOff } from "lucide-react";

import { api } from "@/services/api";
import type { ApiHoldRole, ApiRouteHold } from "@/services/types";

/**
 * The published hold overlay on a member's route page.
 *
 * This is a read-only view of what staff and administrators drew. It only ever
 * asks for the public endpoint, which returns a published set or nothing;
 * drafts are not part of its data shape. The boxes are positioned as
 * percentages inside a wrapper whose height is set by the photograph itself,
 * so the overlay cannot drift when the viewport changes.
 */

const ROLE_LABELS: Record<ApiHoldRole, string> = {
  start: "Start",
  middle: "Middle",
  finish: "Finish",
};

function roleLabel(hold: ApiRouteHold, total: number): string {
  if (hold.role === "middle") return `Hold ${hold.position} of ${total}`;
  return ROLE_LABELS[hold.role];
}

export function PublishedRouteHolds({
  routeId,
  routeName,
  active,
}: {
  routeId: number;
  routeName: string;
  active: boolean;
}) {
  const [imageFailed, setImageFailed] = useState(false);

  const holds = useQuery({
    queryKey: ["arch", "route-holds", routeId],
    queryFn: () => api.routeHolds(routeId),
    enabled: active,
    retry: false,
  });

  const imageUrl = holds.data?.image_url ?? null;
  const published = holds.data?.published ? holds.data : null;

  useEffect(() => {
    setImageFailed(false);
  }, [imageUrl]);

  if (!active) return null;

  return (
    <section className="route-holds" aria-labelledby="route-holds-title">
      <div className="route-holds-heading">
        <div>
          <span className="eyebrow">PUBLISHED HOLD OVERLAY</span>
          <h2 id="route-holds-title">The setter&apos;s line.</h2>
        </div>
        <p>
          Numbers follow the climbing order. The green marker is the start; the orange marker is the
          finish.
        </p>
      </div>

      {holds.isPending && (
        <p className="route-holds-note" role="status">
          Loading the setter&apos;s overlay…
        </p>
      )}

      {holds.isError && (
        <p className="route-holds-note" role="status">
          The setter&apos;s overlay could not be loaded. The route details, voting and logbook are
          unaffected.
        </p>
      )}

      {holds.data && !holds.data.published && (
        <p className="route-holds-note">
          The setters have not published a hold overlay for this route yet.
        </p>
      )}

      {published && published.holds.length === 0 && (
        <p className="route-holds-note">
          The published overlay for this route has no holds in it yet.
        </p>
      )}

      {published && published.holds.length > 0 && (
        <>
          {imageUrl && !imageFailed ? (
            <div className="route-holds-frame">
              <img
                src={imageUrl}
                alt={`The wall for ${routeName}, with the setters' published hold sequence.`}
                onError={() => setImageFailed(true)}
              />
              <div className="route-holds-layer" aria-hidden="true">
                {published.holds.map((hold) => (
                  <span
                    key={hold.id}
                    className={`route-hold-box route-hold-box-${hold.role}`}
                    style={{
                      left: `${hold.x * 100}%`,
                      top: `${hold.y * 100}%`,
                      width: `${hold.width * 100}%`,
                      height: `${hold.height * 100}%`,
                    }}
                  >
                    <span className="route-hold-number">{hold.position}</span>
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <p className="route-holds-note">
              <ImageOff size={18} aria-hidden="true" />
              {imageFailed
                ? "The wall photograph could not be loaded. The hold order is still listed below."
                : "The published overlay has no wall photograph, so the boxes cannot be placed. The hold order is still listed below."}
            </p>
          )}

          <ol className="route-holds-legend" aria-label="Published hold order">
            {published.holds.map((hold) => (
              <li key={hold.id} className={`route-holds-legend-${hold.role}`}>
                <span className="route-holds-dot">{hold.position}</span>
                <span>{roleLabel(hold, published.holds.length)}</span>
                {hold.label && <span className="muted">· {hold.label}</span>}
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
