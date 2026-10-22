import { useId, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useHydrated } from "@/hooks/use-hydrated";
import { memberApi, ApiError, ApiUnavailableError } from "@/services/api";
import { routeQuery, type ClimbRoute } from "@/services/arch";

/**
 * The route someone is about to log, when it is already known.
 *
 * A route page passes the route it is showing; a dashboard opens the modal
 * without one, and the member chooses from the routes on the wall.
 */
export type PreselectedRoute = {
  id: string;
  apiId: number;
  name: string;
  grade: string;
};

/**
 * The one place a member logs a climb.
 *
 * The logbook page, the member dashboard and a route page all open this
 * dialog, so the form, the validation and the record it creates are identical
 * everywhere. The submission goes to the backend; the queries that show how
 * many climbs a route has, or where the member stands, are invalidated after
 * a successful save. The request is guarded against double submission: the
 * button is disabled while one is in flight, and a second submit is ignored.
 */
export function LogClimbModal({
  open,
  onClose,
  preselectedRoute,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  preselectedRoute?: PreselectedRoute | null;
  onSuccess?: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const { data: routeResource, isPending: routesPending } = useQuery(routeQuery);
  const routes: ClimbRoute[] = routeResource?.data ?? [];
  const hydrated = useHydrated();
  const titleId = useId();
  const [chooseRoute, setChooseRoute] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A ref, not just the state, because two submit events can arrive before
  // React has re-rendered the button as disabled.
  const inFlight = useRef(false);

  if (!open) return null;

  // A preselected route is used as-is unless the member asks to pick another.
  const usePreset = preselectedRoute != null && !chooseRoute;
  const preset = usePreset ? (preselectedRoute as PreselectedRoute) : null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // One request at a time: a double Enter while saving is ignored.
    if (inFlight.current) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const chosen = routes.find((route) => route.id === data.get("route"));
    const route = preset ?? chosen;
    if (!route) return;

    inFlight.current = true;
    setPending(true);
    setError(null);
    try {
      await memberApi.logClimb({
        route_id: route.apiId || null,
        route_name: route.name,
        grade: route.grade,
        result: data.get("result") === "Sent" ? "sent" : "project",
        attempts: Number(data.get("attempts")),
        climbed_on: String(data.get("date")),
        notes: String(data.get("notes") ?? ""),
      });
      // The member's own numbers and the route's count both change.
      await queryClient.invalidateQueries({ queryKey: ["member", "dashboard"] });
      await queryClient.invalidateQueries({ queryKey: ["member", "logbook"] });
      await queryClient.invalidateQueries({ queryKey: ["arch", "leaderboard"] });
      if (route.apiId) {
        await queryClient.invalidateQueries({ queryKey: ["arch", "route", String(route.apiId)] });
        await queryClient.invalidateQueries({ queryKey: ["member", "vote", String(route.apiId)] });
      }
      onSuccess?.(`${route.name} has been added to your logbook.`);
      onClose();
    } catch (caught) {
      setError(
        caught instanceof ApiError || caught instanceof ApiUnavailableError
          ? caught.message
          : "That climb could not be saved.",
      );
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="log-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-heading">
          <h2 id={titleId}>Log a climb</h2>
          <Button size="icon" variant="ghost" aria-label="Close log form" onClick={onClose}>
            <X />
          </Button>
        </div>
        <form onSubmit={submit}>
          {preset ? (
            <div className="preset-route">
              <span>Route</span>
              <strong>
                {preset.name} · {preset.grade}
              </strong>
              <button type="button" className="preset-switch" onClick={() => setChooseRoute(true)}>
                Choose a different route
              </button>
            </div>
          ) : routesPending ? (
            <p className="photo-note">Loading the routes…</p>
          ) : routes.length === 0 ? (
            <p className="photo-note">No routes are on the wall to log right now.</p>
          ) : (
            <label>
              Route
              <select name="route" autoFocus>
                {routes.map((route) => (
                  <option key={route.id} value={route.id}>
                    {route.name} · {route.grade}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="form-row">
            <label>
              Date
              <input
                required
                type="date"
                name="date"
                defaultValue={new Date().toISOString().slice(0, 10)}
              />
            </label>
            <label>
              Attempts
              <input type="number" name="attempts" min={1} max={999} defaultValue={1} required />
            </label>
          </div>
          <label>
            Result
            <select name="result">
              <option>Sent</option>
              <option>Project</option>
            </select>
          </label>
          <label>
            Notes
            <textarea name="notes" rows={3} placeholder="What did you learn?" />
          </label>
          {error && (
            <p className="feedback error" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" disabled={!hydrated || pending}>
            <Check />
            {pending ? "Saving…" : "Save entry"}
          </Button>
        </form>
      </section>
    </div>
  );
}
