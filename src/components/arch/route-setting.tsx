import { useEffect, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ImageOff,
  Loader2,
  Save,
  Trash2,
  Undo2,
  Upload,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { useHydrated } from "@/hooks/use-hydrated";
import { ApiError, ApiUnavailableError, routeSettingApi } from "@/services/api";
import { useSession } from "@/services/session";
import type { ApiRouteHoldSet, ApiStaffRouteOption, ApiWall, ApiWallHold } from "@/services/types";
import { EmptyNotice } from "./data-state";
import { HoldCanvas } from "./hold-canvas";
import { moveItem, roleAt, type HoldBox } from "./hold-geometry";
import { PageHeading } from "./shared";
import { PermissionDenied, StaffShell } from "./staff-pages";
import { pushUndo, remapUndo, type EditorSnapshot, type UndoEntry } from "./undo-history";

/**
 * The staff route-setting tool.
 *
 * Staff draw hold boxes on a wall photograph and put them in an order for a
 * route. Saving writes a draft; only an administrator can publish it, and
 * members never see a draft. A click creates a default box because a click
 * cannot know the real boundary of a hold — staff adjust it by hand.
 */

function errorMessage(caught: unknown, fallback: string): string {
  if (caught instanceof ApiUnavailableError) {
    return "The ARCH service is not reachable right now. Your edits are still on this page; try again in a moment.";
  }
  if (caught instanceof ApiError) {
    if (caught.status === 401) return "Your session has expired. Sign in again to keep editing.";
    if (caught.status === 403) return "Your account does not have permission to do that.";
    return caught.message;
  }
  return fallback;
}

type Pending = "create" | "update" | "delete" | "save" | "publish" | "undo" | null;

type Notice = { tone: "success" | "error" | "info"; text: string } | null;

const ROLE_LABEL = {
  start: "Start",
  middle: "Middle",
  finish: "Finish",
} as const;

function idsOf(set: ApiRouteHoldSet | null): number[] {
  return set ? set.holds.map((hold) => hold.wall_hold_id) : [];
}

function holdLabel(hold: ApiWallHold | undefined, id: number): string {
  return hold?.label?.trim() || `Hold ${id}`;
}

function boxOf(hold: ApiWallHold): HoldBox {
  return { x: hold.x, y: hold.y, width: hold.width, height: hold.height };
}

function sameBox(a: HoldBox, b: HoldBox): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

function sameSequence(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.isContentEditable
  );
}

export function RouteSettingPage() {
  const { status, user } = useSession();
  const hydrated = useHydrated();

  return (
    <StaffShell>
      <PageHeading
        eyebrow="ROUTE SETTING"
        title="Draw the line."
        description="Annotate the wall photograph, put the holds in climbing order, and save a draft. Members see only a published sequence."
      />
      {!hydrated || status === "loading" ? (
        <div className="loading-block" aria-busy="true">
          <Loader2 className="loading-spinner" size={22} />
          <p>Checking your account…</p>
        </div>
      ) : status !== "authenticated" ||
        !user ||
        (user.role !== "staff" && user.role !== "admin") ? (
        <PermissionDenied need="a staff or administrator account" />
      ) : (
        <RouteSettingEditor isAdmin={user.role === "admin"} />
      )}
    </StaffShell>
  );
}

export function RouteSettingEditor({ isAdmin }: { isAdmin: boolean }) {
  const queryClient = useQueryClient();
  const [wallId, setWallId] = useState<number | null>(null);
  const [routeId, setRouteId] = useState<number | null>(null);
  const [holds, setHolds] = useState<ApiWallHold[]>([]);
  const [holdsState, setHoldsState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [holdsError, setHoldsError] = useState<string | null>(null);
  const [holdsReload, setHoldsReload] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState<ApiRouteHoldSet | null>(null);
  const [published, setPublished] = useState<ApiRouteHoldSet | null>(null);
  const [sequence, setSequence] = useState<number[]>([]);
  const [savedSequence, setSavedSequence] = useState<number[]>([]);
  const [setState, setSetState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [setError, setSetError] = useState<string | null>(null);
  const [setReload, setSetReload] = useState(0);
  const [pending, setPending] = useState<Pending>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const [undoHistory, setUndoHistory] = useState<UndoEntry[]>([]);

  const wallsQuery = useQuery({
    queryKey: ["route-setting", "walls"],
    queryFn: routeSettingApi.walls,
    retry: false,
  });

  const wall: ApiWall | null = wallsQuery.data?.find((item) => item.id === wallId) ?? null;

  useEffect(() => {
    if (wallId === null && wallsQuery.data && wallsQuery.data.length > 0) {
      setWallId(wallsQuery.data[0]!.id);
    }
  }, [wallId, wallsQuery.data]);

  const routesQuery = useQuery({
    queryKey: ["route-setting", "routes", wallId],
    queryFn: () => routeSettingApi.wallRoutes(wallId!),
    enabled: wallId !== null,
    retry: false,
  });

  useEffect(() => {
    // A route belongs to one wall, so a wall change cannot keep the old one.
    setRouteId(null);
    setImageFailed(false);
    setUndoHistory([]);
  }, [wallId]);

  useEffect(() => {
    if (!routesQuery.data) return;
    if (routeId !== null && !routesQuery.data.some((route) => route.id === routeId)) {
      setRouteId(null);
    }
  }, [routeId, routesQuery.data]);

  useEffect(() => {
    if (wallId === null) {
      setHolds([]);
      setHoldsState("idle");
      return;
    }
    let cancelled = false;
    setHoldsState("loading");
    setHoldsError(null);
    routeSettingApi
      .wallHolds(wallId)
      .then((rows) => {
        if (cancelled) return;
        setHolds(rows);
        setHoldsState("ready");
      })
      .catch((caught) => {
        if (cancelled) return;
        setHoldsState("error");
        setHoldsError(errorMessage(caught, "The holds could not be loaded."));
      });
    return () => {
      cancelled = true;
    };
  }, [wallId, holdsReload]);

  useEffect(() => {
    // Undo is scoped to one route's unsaved work. Loading another route (or
    // reloading this one from the server) starts a new history.
    setUndoHistory([]);
    if (routeId === null) {
      setDraft(null);
      setPublished(null);
      setSequence([]);
      setSavedSequence([]);
      setSetState("idle");
      setSetError(null);
      return;
    }
    let cancelled = false;
    setSetState("loading");
    setSetError(null);
    setSequence([]);
    setSavedSequence([]);
    setDraft(null);
    setPublished(null);
    setSelectedId(null);
    routeSettingApi
      .holdSet(routeId)
      .then((state) => {
        if (cancelled) return;
        const baseline = idsOf(state.draft ?? state.published);
        setDraft(state.draft);
        setPublished(state.published);
        setSequence(baseline);
        setSavedSequence(baseline);
        setSetState("ready");
      })
      .catch((caught) => {
        if (cancelled) return;
        setSetState("error");
        setSetError(errorMessage(caught, "The route's holds could not be loaded."));
      });
    return () => {
      cancelled = true;
    };
  }, [routeId, setReload]);

  useEffect(() => {
    if (selectedId !== null && !holds.some((hold) => hold.id === selectedId)) {
      setSelectedId(null);
    }
  }, [holds, selectedId]);

  const selectedHold = holds.find((hold) => hold.id === selectedId) ?? null;
  const selectedIndex = selectedId === null ? -1 : sequence.indexOf(selectedId);
  const dirty = sequence.join(",") !== savedSequence.join(",");
  const busy = pending !== null;
  const canUndo = undoHistory.length > 0 && !busy;
  const lastUndo = undoHistory[undoHistory.length - 1] ?? null;
  const inPublished =
    selectedId !== null &&
    (published?.holds.some((hold) => hold.wall_hold_id === selectedId) ?? false);

  const activeRoute: ApiStaffRouteOption | null =
    routesQuery.data?.find((route) => route.id === routeId) ?? null;

  const annotatedImage = (draft ?? published)?.wall_image_url ?? null;
  const imageMismatch = Boolean(
    annotatedImage && wall?.image_url && annotatedImage !== wall.image_url,
  );

  const canPublish =
    isAdmin &&
    routeId !== null &&
    draft !== null &&
    !dirty &&
    sequence.length >= 2 &&
    pending === null;

  function snapshotEditor(): EditorSnapshot {
    return { holds, sequence, selectedId };
  }

  function rememberEdit(
    snapshot: EditorSnapshot,
    label: string,
    affectedHoldId: number | null = null,
  ) {
    setUndoHistory((current) => pushUndo(current, snapshot, label, affectedHoldId));
  }

  async function createHold(box: HoldBox) {
    if (wallId === null || busy) return;
    const before = snapshotEditor();
    setPending("create");
    setNotice(null);
    try {
      const created = await routeSettingApi.createHold(wallId, box);
      rememberEdit(before, "adding a box", created.id);
      setHolds((previous) => [...previous, created]);
      setSelectedId(created.id);
      setNotice({
        tone: "success",
        text: "Box added. Drag it into place, then add it to the route.",
      });
    } catch (caught) {
      setNotice({ tone: "error", text: errorMessage(caught, "The box could not be saved.") });
    } finally {
      setPending(null);
    }
  }

  async function updateHold(id: number, box: HoldBox) {
    if (busy) return;
    const previous = holds.find((hold) => hold.id === id);
    if (!previous || sameBox(boxOf(previous), box)) return;
    const before = snapshotEditor();
    const wasPublished = published?.holds.some((hold) => hold.wall_hold_id === id) ?? false;
    const moved = previous.x !== box.x || previous.y !== box.y;
    const resized = previous.width !== box.width || previous.height !== box.height;
    const label = moved && resized ? "editing a box" : resized ? "resizing a box" : "moving a box";
    setHolds((rows) => rows.map((hold) => (hold.id === id ? { ...hold, ...box } : hold)));
    setPending("update");
    setNotice(null);
    try {
      const saved = await routeSettingApi.updateHold(id, box);
      rememberEdit(before, label, id);
      setHolds((rows) => rows.map((hold) => (hold.id === id ? saved : hold)));
      if (wasPublished) {
        setNotice({
          tone: "info",
          text: "Box saved. It is part of the published route, so members see the new position now.",
        });
      }
    } catch (caught) {
      setHolds((rows) => rows.map((hold) => (hold.id === id ? previous : hold)));
      setNotice({
        tone: "error",
        text: errorMessage(caught, "The box could not be moved."),
      });
    } finally {
      setPending(null);
    }
  }

  async function deleteHold(id: number) {
    if (busy) return;
    // The Delete key on the canvas reaches this function directly, so the
    // same guard the disabled button uses has to live here too.
    if (published?.holds.some((hold) => hold.wall_hold_id === id)) {
      setSelectedId(id);
      setNotice({
        tone: "info",
        text: "This box is part of the published route. Publish a sequence without it before deleting the box.",
      });
      return;
    }
    if (sequence.includes(id)) {
      setSelectedId(id);
      setNotice({
        tone: "info",
        text: "Remove this hold from the route and save the draft before deleting the box.",
      });
      return;
    }
    const before = snapshotEditor();
    setPending("delete");
    setNotice(null);
    try {
      await routeSettingApi.deleteHold(id);
      rememberEdit(before, "deleting a box", id);
      setHolds((rows) => rows.filter((hold) => hold.id !== id));
      setSelectedId(null);
      setNotice({ tone: "success", text: "Box deleted from the wall." });
    } catch (caught) {
      setNotice({
        tone: "error",
        text: errorMessage(caught, "The box could not be deleted."),
      });
    } finally {
      setPending(null);
    }
  }

  function commitSequence(next: number[], label: string) {
    if (sameSequence(next, sequence)) return;
    rememberEdit(snapshotEditor(), label);
    setSequence(next);
  }

  function addSelectedToRoute() {
    if (selectedId === null || sequence.includes(selectedId)) return;
    commitSequence([...sequence, selectedId], "adding a hold to the route");
    setNotice({ tone: "info", text: "Added to the route. Save the draft to keep it." });
  }

  function removeFromRoute(id: number) {
    commitSequence(
      sequence.filter((holdId) => holdId !== id),
      "removing a hold from the route",
    );
  }

  function moveStep(index: number, delta: number) {
    commitSequence(moveItem(sequence, index, index + delta), "reordering the holds");
  }

  function makeStart(id: number) {
    commitSequence([id, ...sequence.filter((holdId) => holdId !== id)], "changing the start hold");
  }

  function makeFinish(id: number) {
    commitSequence([...sequence.filter((holdId) => holdId !== id), id], "changing the finish hold");
  }

  async function undoLastEdit() {
    if (busy || undoHistory.length === 0) return;
    const entry = undoHistory[undoHistory.length - 1]!;
    const target = entry.snapshot;
    const affectedHoldId = entry.affectedHoldId;
    const currentById = new Map(holds.map((hold) => [hold.id, hold]));
    const targetById = new Map(target.holds.map((hold) => [hold.id, hold]));
    const changed =
      affectedHoldId === null
        ? []
        : target.holds.filter((wanted) => {
            if (wanted.id !== affectedHoldId) return false;
            const current = currentById.get(wanted.id);
            return current !== undefined && !sameBox(boxOf(current), boxOf(wanted));
          });
    const missing =
      affectedHoldId === null
        ? []
        : target.holds.filter(
            (wanted) => wanted.id === affectedHoldId && !currentById.has(wanted.id),
          );
    const extra =
      affectedHoldId === null
        ? []
        : holds.filter((hold) => hold.id === affectedHoldId && !targetById.has(hold.id));
    const needsWallWrite = changed.length > 0 || missing.length > 0 || extra.length > 0;

    if (!needsWallWrite) {
      // Membership, order and role changes are local; preserve boxes exactly as
      // they are now rather than reverting unrelated concurrent work.
      setSequence([...target.sequence]);
      setSelectedId(target.selectedId);
      setUndoHistory((current) => current.slice(0, -1));
      setNotice({ tone: "info", text: `Undid ${entry.label}.` });
      return;
    }

    setPending("undo");
    setNotice(null);
    const idMap = new Map<number, number>();
    try {
      const nextById = new Map(holds.map((hold) => [hold.id, hold]));
      for (const wanted of target.holds) {
        if (wanted.id !== affectedHoldId) continue;
        const current = currentById.get(wanted.id);
        if (current === undefined) {
          const created = await routeSettingApi.createHold(wanted.wall_id, {
            ...boxOf(wanted),
            ...(wanted.label ? { label: wanted.label } : {}),
          });
          idMap.set(wanted.id, created.id);
          nextById.set(created.id, created);
        } else if (!sameBox(boxOf(current), boxOf(wanted))) {
          const saved = await routeSettingApi.updateHold(wanted.id, {
            ...boxOf(wanted),
            ...(wanted.label ? { label: wanted.label } : {}),
          });
          nextById.set(wanted.id, saved);
        }
      }
      for (const unwanted of extra) {
        await routeSettingApi.deleteHold(unwanted.id);
        nextById.delete(unwanted.id);
      }

      const publishedIds = new Set(published?.holds.map((hold) => hold.wall_hold_id) ?? []);
      const touchesPublished = [...changed, ...missing, ...extra].some((hold) =>
        publishedIds.has(hold.id),
      );
      setHolds([...nextById.values()]);
      setSequence(target.sequence.map((id) => idMap.get(id) ?? id));
      setSelectedId(
        target.selectedId === null ? null : (idMap.get(target.selectedId) ?? target.selectedId),
      );
      setUndoHistory((current) => remapUndo(current, idMap).slice(0, -1));
      setNotice({
        tone: "info",
        text: touchesPublished
          ? `Undid ${entry.label}. A box in the published route changed too, so members see the restored position now.`
          : `Undid ${entry.label}.`,
      });
    } catch (caught) {
      setNotice({
        tone: "error",
        text: errorMessage(caught, "The last edit could not be undone."),
      });
    } finally {
      setPending(null);
    }
  }

  function handleEditorKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
    if (event.key.toLowerCase() !== "z") return;
    if (isEditableTarget(event.target)) return;
    if (!canUndo) return;
    event.preventDefault();
    void undoLastEdit();
  }

  async function saveDraft() {
    if (routeId === null || busy) return;
    setPending("save");
    setNotice(null);
    try {
      const saved = await routeSettingApi.saveHoldSet(routeId, {
        holds: sequence.map((wallHoldId) => ({ wall_hold_id: wallHoldId })),
        wall_image_url: wall?.image_url ?? null,
      });
      const ids = idsOf(saved);
      setDraft(saved);
      setSequence(ids);
      setSavedSequence(ids);
      setUndoHistory([]);
      setNotice({
        tone: "success",
        text: "Draft saved. Members still see the published sequence.",
      });
      await queryClient.invalidateQueries({
        queryKey: ["arch", "route-holds", routeId],
      });
    } catch (caught) {
      // Keep the sequence exactly as it is so a failed save can be retried.
      setNotice({
        tone: "error",
        text: errorMessage(caught, "The draft could not be saved. Your changes are still here."),
      });
    } finally {
      setPending(null);
    }
  }

  async function publishDraft() {
    if (routeId === null || !canPublish || busy) return;
    setPending("publish");
    setNotice(null);
    try {
      const publishedSet = await routeSettingApi.publishHoldSet(routeId);
      const ids = idsOf(publishedSet);
      setDraft(null);
      setPublished(publishedSet);
      setSequence(ids);
      setSavedSequence(ids);
      setUndoHistory([]);
      setNotice({
        tone: "success",
        text: "Published. Members now see this sequence; the previous one is kept as history.",
      });
      await queryClient.invalidateQueries({
        queryKey: ["arch", "route-holds", routeId],
      });
      await queryClient.invalidateQueries({ queryKey: ["arch", "route", routeId] });
    } catch (caught) {
      setNotice({
        tone: "error",
        text: errorMessage(caught, "The draft could not be published."),
      });
    } finally {
      setPending(null);
    }
  }

  if (wallsQuery.isPending) {
    return (
      <div className="loading-block" aria-busy="true">
        <Loader2 className="loading-spinner" size={22} />
        <p>Loading the walls…</p>
      </div>
    );
  }

  if (wallsQuery.isError) {
    return (
      <p className="data-banner" role="alert">
        <span>
          The wall list could not be loaded. {errorMessage(wallsQuery.error, "Please try again.")}
        </span>
      </p>
    );
  }

  if (!wallsQuery.data || wallsQuery.data.length === 0) {
    return (
      <EmptyNotice
        title="No walls to set on yet"
        description="Add a wall and a photograph in the operations area before drawing holds."
      >
        <Link className="text-link" to="/admin">
          Open operations
        </Link>
      </EmptyNotice>
    );
  }

  return (
    <div className="route-setting-editor" onKeyDown={handleEditorKeyDown}>
      <div className="route-setting-toolbar">
        <label>
          Wall
          <select
            value={wallId ?? ""}
            onChange={(event) => setWallId(Number(event.target.value))}
            disabled={busy}
          >
            {wallsQuery.data.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Route
          <select
            value={routeId ?? ""}
            onChange={(event) =>
              setRouteId(event.target.value === "" ? null : Number(event.target.value))
            }
            disabled={busy || wallId === null || routesQuery.isPending}
          >
            <option value="">Choose a route on this wall</option>
            {(routesQuery.data ?? []).map((route) => (
              <option key={route.id} value={route.id}>
                {route.name} · {route.grade} · {route.status.replace("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <div className="route-setting-toolbar-actions">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canUndo}
            onClick={() => void undoLastEdit()}
            title={lastUndo ? `Undo ${lastUndo.label} (Ctrl+Z)` : "Nothing to undo"}
          >
            <Undo2 size={15} /> Undo
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={routeId === null || busy}
            onClick={() => {
              setUndoHistory([]);
              setSetReload((value) => value + 1);
            }}
          >
            Reload draft
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={wallId === null || busy}
            onClick={() => {
              setUndoHistory([]);
              setHoldsReload((value) => value + 1);
            }}
          >
            Reload holds
          </Button>
        </div>
      </div>

      {notice && (
        <p
          className={`editor-notice editor-notice-${notice.tone}`}
          role={notice.tone === "error" ? "alert" : "status"}
        >
          {notice.tone === "success" ? <Check size={16} /> : null}
          <span>{notice.text}</span>
        </p>
      )}

      {routesQuery.isError && (
        <p className="data-banner" role="alert">
          <span>
            The routes for this wall could not be loaded.{" "}
            {errorMessage(routesQuery.error, "Please try again.")}
          </span>
        </p>
      )}

      <div className="route-setting-layout">
        <section className="content-block route-setting-canvas-block">
          <div className="content-block-head">
            {imageFailed || !wall?.image_url ? <ImageOff size={22} /> : <Save size={22} />}
            <div>
              <h2>{wall?.name ?? "Wall photograph"}</h2>
              <p>{wall?.description || "Draw the holds exactly where they are on the wall."}</p>
            </div>
          </div>

          {!wall?.image_url ? (
            <EmptyNotice
              title="This wall has no photograph"
              description="A hold box is drawn on a photograph, so there is nothing to annotate yet. Add an image URL to this wall in the operations area, then come back."
            />
          ) : imageFailed ? (
            <EmptyNotice
              title="The photograph could not be loaded"
              description="The wall's image URL did not return a picture. Check the URL in the operations area; no boxes can be placed until it loads."
            >
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setImageFailed(false)}
              >
                Try again
              </Button>
            </EmptyNotice>
          ) : (
            <HoldCanvas
              key={wall.id}
              imageUrl={wall.image_url}
              holds={holds}
              selectedId={selectedId}
              sequence={sequence}
              busy={busy}
              onSelect={setSelectedId}
              onCreate={createHold}
              onUpdate={updateHold}
              onDelete={deleteHold}
              onImageError={() => setImageFailed(true)}
            />
          )}

          {holdsState === "loading" && (
            <p className="muted">
              <Loader2 className="loading-spinner" size={16} /> Loading the holds drawn on this
              wall…
            </p>
          )}
          {holdsState === "error" && (
            <p className="data-banner" role="alert">
              <span>{holdsError}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setUndoHistory([]);
                  setHoldsReload((value) => value + 1);
                }}
              >
                Try again
              </Button>
            </p>
          )}
        </section>

        <aside className="route-setting-side">
          <section className="content-block">
            <div className="content-block-head">
              <Upload size={22} />
              <div>
                <h2>Route sequence</h2>
                <p>The first hold is the start; the last is the finish.</p>
              </div>
            </div>

            {routeId === null ? (
              <p className="muted">
                Choose a route above to build its sequence. You can still draw and adjust boxes on
                the wall without one.
              </p>
            ) : setState === "loading" ? (
              <p className="muted">
                <Loader2 className="loading-spinner" size={16} /> Loading the route's draft…
              </p>
            ) : setState === "error" ? (
              <p className="data-banner" role="alert">
                <span>{setError}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setUndoHistory([]);
                    setSetReload((value) => value + 1);
                  }}
                >
                  Try again
                </Button>
              </p>
            ) : (
              <>
                {activeRoute && (
                  <p className="route-setting-route-line">
                    <strong>{activeRoute.name}</strong> · {activeRoute.grade} ·{" "}
                    {activeRoute.status.replace("_", " ")}
                    {activeRoute.status !== "active" && (
                      <span className="muted">
                        {" "}
                        — this route is not active, so members do not see its overlay.
                      </span>
                    )}
                  </p>
                )}

                {imageMismatch && (
                  <p className="editor-notice editor-notice-info" role="status">
                    <span>
                      This sequence was saved against a different wall photograph. Check the boxes
                      against the picture above before publishing.
                    </span>
                  </p>
                )}

                <div className="route-setting-state">
                  <span className={draft ? "status-project" : "status-sent"}>
                    {draft ? "Draft saved" : "No draft"}
                  </span>
                  <span className={published ? "status-sent" : "status-project"}>
                    {published ? "Published" : "Not published"}
                  </span>
                  {dirty && <span className="status-project">Unsaved changes</span>}
                </div>

                {selectedHold && selectedIndex < 0 && (
                  <Button
                    type="button"
                    size="sm"
                    className="route-setting-add"
                    disabled={busy}
                    onClick={addSelectedToRoute}
                  >
                    Add {holdLabel(selectedHold, selectedHold.id)} to the route
                  </Button>
                )}

                {sequence.length === 0 ? (
                  <p className="muted">
                    No holds assigned yet. Select a box on the photograph and add it, in climbing
                    order.
                  </p>
                ) : (
                  <ol className="hold-sequence">
                    {sequence.map((holdId, index) => {
                      const role = roleAt(index, sequence.length);
                      return (
                        <li key={holdId} className={`hold-step hold-step-${role}`}>
                          <span className="hold-step-number">{index + 1}</span>
                          <div className="hold-step-text">
                            <strong>
                              {holdLabel(
                                holds.find((h) => h.id === holdId),
                                holdId,
                              )}
                            </strong>
                            <small>{ROLE_LABEL[role]}</small>
                          </div>
                          <div className="hold-step-actions">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              aria-label={`Move ${holdLabel(
                                holds.find((h) => h.id === holdId),
                                holdId,
                              )} earlier`}
                              disabled={index === 0 || busy}
                              onClick={() => moveStep(index, -1)}
                            >
                              <ArrowUp size={15} />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              aria-label={`Move ${holdLabel(
                                holds.find((h) => h.id === holdId),
                                holdId,
                              )} later`}
                              disabled={index === sequence.length - 1 || busy}
                              onClick={() => moveStep(index, 1)}
                            >
                              <ArrowDown size={15} />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              aria-label="Make start"
                              disabled={index === 0 || busy}
                              onClick={() => makeStart(holdId)}
                            >
                              Start
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              aria-label="Make finish"
                              disabled={index === sequence.length - 1 || busy}
                              onClick={() => makeFinish(holdId)}
                            >
                              Finish
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              aria-label={`Remove ${holdLabel(
                                holds.find((h) => h.id === holdId),
                                holdId,
                              )} from the route`}
                              disabled={busy}
                              onClick={() => removeFromRoute(holdId)}
                            >
                              <X size={15} />
                            </Button>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}

                <div className="route-setting-actions">
                  <Button
                    type="button"
                    size="sm"
                    disabled={!dirty || busy || routeId === null}
                    onClick={saveDraft}
                  >
                    {pending === "save" ? "Saving…" : "Save draft"}
                  </Button>
                  {isAdmin ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!canPublish}
                      onClick={publishDraft}
                    >
                      {pending === "publish" ? "Publishing…" : "Publish to members"}
                    </Button>
                  ) : (
                    <span className="muted">An administrator publishes the sequence.</span>
                  )}
                </div>
                {isAdmin && draft !== null && sequence.length < 2 && (
                  <p className="muted">Add at least a start and a finish hold before publishing.</p>
                )}
              </>
            )}
          </section>

          <section className="content-block">
            <div className="content-block-head">
              <Save size={22} />
              <div>
                <h2>Holds on this wall</h2>
                <p>
                  {holds.length} box{holds.length === 1 ? "" : "es"} drawn.
                </p>
              </div>
            </div>

            {holds.length === 0 && holdsState === "ready" ? (
              <p className="muted">
                Nothing drawn yet. Click the photograph to create the first box.
              </p>
            ) : (
              <ul className="wall-hold-list">
                {holds.map((hold) => {
                  const step = sequence.indexOf(hold.id);
                  return (
                    <li key={hold.id}>
                      <button
                        type="button"
                        className={selectedId === hold.id ? "is-selected" : ""}
                        onClick={() => setSelectedId(hold.id)}
                      >
                        <span>{holdLabel(hold, hold.id)}</span>
                        <small>
                          {step >= 0
                            ? `Step ${step + 1} · ${ROLE_LABEL[roleAt(step, sequence.length)]}`
                            : "Not in the route"}
                        </small>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {selectedHold && (
              <div className="selected-hold">
                <h3>{holdLabel(selectedHold, selectedHold.id)}</h3>
                <p className="muted">
                  x {selectedHold.x.toFixed(3)} · y {selectedHold.y.toFixed(3)} ·{" "}
                  {selectedHold.width.toFixed(3)} × {selectedHold.height.toFixed(3)}
                </p>
                {selectedIndex >= 0 && (
                  <p className="muted">
                    In the route at step {selectedIndex + 1}. Remove it and save before deleting the
                    box.
                  </p>
                )}
                {inPublished && (
                  <p className="muted">
                    This box is part of the published route. Moving or resizing it updates the
                    members' overlay immediately; publish a sequence without it before deleting the
                    box.
                  </p>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy || selectedIndex >= 0 || inPublished}
                  onClick={() => deleteHold(selectedHold.id)}
                >
                  <Trash2 size={15} /> Delete box
                </Button>
              </div>
            )}
          </section>

          <section className="content-block">
            <h2>Need another route?</h2>
            <p className="muted">
              Routes are created and archived in the operations area. This tool only annotates a
              route that already belongs to the selected wall.
            </p>
            {isAdmin ? (
              <Link className="text-link" to="/admin">
                Manage routes in operations
              </Link>
            ) : (
              <p className="muted">Ask an administrator to create the route.</p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
