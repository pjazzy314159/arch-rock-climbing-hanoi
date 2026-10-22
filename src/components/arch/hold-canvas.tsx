import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";

import {
  boxFromPoints,
  boxToPixels,
  clamp01,
  containRect,
  defaultBoxAt,
  isInsideImage,
  moveBox,
  pointToNormalised,
  resizeBox,
  roleAt,
  type Corner,
  type HoldBox,
  type Point,
  type Size,
} from "./hold-geometry";

/**
 * A photograph with hand-drawn hold boxes on top.
 *
 * This is deliberately not computer vision: a click creates a default box and
 * a drag draws one, and staff adjust it by hand. Coordinates are always
 * fractions of the photograph, never screen pixels, so the overlay survives a
 * resize and a different viewport.
 */

export type CanvasHold = {
  id: number;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

type Gesture =
  | {
      kind: "draw";
      start: Point;
      current: Point;
      startClient: Point;
      moved: boolean;
    }
  | {
      kind: "move";
      id: number;
      start: Point;
      original: HoldBox;
      current: HoldBox;
      startClient: Point;
      moved: boolean;
    }
  | {
      kind: "resize";
      id: number;
      corner: Corner;
      original: HoldBox;
      current: HoldBox;
      startClient: Point;
      moved: boolean;
    };

type Props = {
  imageUrl: string;
  holds: CanvasHold[];
  selectedId: number | null;
  sequence: number[];
  busy?: boolean;
  onSelect: (id: number | null) => void;
  onCreate: (box: HoldBox) => void;
  onUpdate: (id: number, box: HoldBox) => void;
  onDelete: (id: number) => void;
  onImageError?: () => void;
};

function useContainerSize(container: { current: HTMLDivElement | null }): Size {
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      setSize((previous) =>
        previous.width === rect.width && previous.height === rect.height
          ? previous
          : { width: rect.width, height: rect.height },
      );
    };
    measure();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    observer?.observe(element);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [container]);

  return size;
}

function boxOf(hold: CanvasHold): HoldBox {
  return { x: hold.x, y: hold.y, width: hold.width, height: hold.height };
}

function sameBox(a: HoldBox, b: HoldBox): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

export function HoldCanvas({
  imageUrl,
  holds,
  selectedId,
  sequence,
  busy = false,
  onSelect,
  onCreate,
  onUpdate,
  onDelete,
  onImageError,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [aspect, setAspect] = useState(4 / 3);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const size = useContainerSize(containerRef);

  const contentRect = containRect(size, { width: aspect, height: 1 });

  function pointerAt(event: ReactPointerEvent<HTMLElement>): Point {
    const element = containerRef.current;
    if (!element) return { x: 0, y: 0 };
    const rect = element.getBoundingClientRect();
    const content = containRect(
      { width: rect.width, height: rect.height },
      { width: aspect, height: 1 },
    );
    return pointToNormalised(event.clientX, event.clientY, content, {
      left: rect.left,
      top: rect.top,
    });
  }

  function beginGesture(event: ReactPointerEvent<HTMLElement>, next: Gesture) {
    event.preventDefault();
    event.stopPropagation();
    containerRef.current?.focus();
    containerRef.current?.setPointerCapture?.(event.pointerId);
    setGesture(next);
  }

  function handleCanvasPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (busy) return;
    if (event.button !== 0 && event.pointerType === "mouse") return;
    const point = pointerAt(event);
    if (!isInsideImage(point)) return;
    onSelect(null);
    beginGesture(event, {
      kind: "draw",
      start: point,
      current: point,
      startClient: { x: event.clientX, y: event.clientY },
      moved: false,
    });
  }

  function handleHoldPointerDown(event: ReactPointerEvent<HTMLDivElement>, hold: CanvasHold) {
    if (busy) return;
    if (event.button !== 0 && event.pointerType === "mouse") return;
    onSelect(hold.id);
    beginGesture(event, {
      kind: "move",
      id: hold.id,
      start: pointerAt(event),
      original: boxOf(hold),
      current: boxOf(hold),
      startClient: { x: event.clientX, y: event.clientY },
      moved: false,
    });
  }

  function handleHandlePointerDown(
    event: ReactPointerEvent<HTMLElement>,
    hold: CanvasHold,
    corner: Corner,
  ) {
    if (busy) return;
    onSelect(hold.id);
    beginGesture(event, {
      kind: "resize",
      id: hold.id,
      corner,
      original: boxOf(hold),
      current: boxOf(hold),
      startClient: { x: event.clientX, y: event.clientY },
      moved: false,
    });
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!gesture) return;
    const point = pointerAt(event);
    const moved =
      gesture.moved ||
      Math.hypot(event.clientX - gesture.startClient.x, event.clientY - gesture.startClient.y) >= 4;

    if (gesture.kind === "draw") {
      setGesture({
        ...gesture,
        current: { x: clamp01(point.x), y: clamp01(point.y) },
        moved,
      });
    } else if (gesture.kind === "move") {
      setGesture({
        ...gesture,
        current: moveBox(gesture.original, point.x - gesture.start.x, point.y - gesture.start.y),
        moved,
      });
    } else {
      setGesture({
        ...gesture,
        current: resizeBox(gesture.original, gesture.corner, point),
        moved,
      });
    }
    event.preventDefault();
  }

  function finishGesture(event: ReactPointerEvent<HTMLDivElement>) {
    if (!gesture) return;
    containerRef.current?.releasePointerCapture?.(event.pointerId);
    if (gesture.kind === "draw") {
      onCreate(
        gesture.moved ? boxFromPoints(gesture.start, gesture.current) : defaultBoxAt(gesture.start),
      );
    } else if (gesture.moved && !sameBox(gesture.original, gesture.current)) {
      onUpdate(gesture.id, gesture.current);
    }
    setGesture(null);
    event.preventDefault();
  }

  function cancelGesture() {
    setGesture(null);
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      cancelGesture();
      onSelect(null);
    }
  }

  function displayBox(hold: CanvasHold): HoldBox {
    if (gesture && gesture.kind !== "draw" && gesture.id === hold.id) {
      return gesture.current;
    }
    return boxOf(hold);
  }

  const preview =
    gesture?.kind === "draw" && gesture.moved
      ? boxFromPoints(gesture.start, gesture.current)
      : null;

  return (
    <div className="hold-canvas-wrap">
      <div
        ref={containerRef}
        className="hold-canvas"
        data-testid="hold-canvas"
        role="application"
        aria-label="Hold annotation canvas"
        tabIndex={0}
        style={{ aspectRatio: String(aspect) }}
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishGesture}
        onPointerCancel={cancelGesture}
        onKeyDown={handleKeyDown}
      >
        <img
          className="hold-canvas-image"
          src={imageUrl}
          alt="The selected wall's photograph"
          draggable={false}
          onError={onImageError}
          onLoad={(event) => {
            const image = event.currentTarget;
            if (image.naturalWidth > 0 && image.naturalHeight > 0) {
              setAspect(image.naturalWidth / image.naturalHeight);
            }
          }}
        />
        {contentRect.width > 0 &&
          holds.map((hold) => {
            const index = sequence.indexOf(hold.id);
            const role = index >= 0 ? roleAt(index, sequence.length) : null;
            const selected = selectedId === hold.id;
            const style = boxToPixels(displayBox(hold), contentRect);
            return (
              <div
                key={hold.id}
                data-hold-id={hold.id}
                role="button"
                tabIndex={0}
                aria-pressed={selected}
                aria-label={`Hold ${hold.id}${role ? `, step ${index + 1}, ${role}` : ""}`}
                className={[
                  "hold-box",
                  selected ? "hold-box-selected" : "",
                  role ? `hold-box-${role}` : "hold-box-unassigned",
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={{
                  left: `${style.left}px`,
                  top: `${style.top}px`,
                  width: `${style.width}px`,
                  height: `${style.height}px`,
                }}
                onPointerDown={(event) => handleHoldPointerDown(event, hold)}
                onKeyDown={(event) => {
                  event.stopPropagation();
                  if (event.key === "Delete" || event.key === "Backspace") {
                    event.preventDefault();
                    onDelete(hold.id);
                  } else if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(hold.id);
                  }
                }}
              >
                {index >= 0 && <span className="hold-badge">{index + 1}</span>}
                {selected && (
                  <>
                    {(["nw", "ne", "sw", "se"] as Corner[]).map((corner) => (
                      <span
                        key={corner}
                        className={`hold-handle hold-handle-${corner}`}
                        data-corner={corner}
                        onPointerDown={(event) => handleHandlePointerDown(event, hold, corner)}
                      />
                    ))}
                  </>
                )}
              </div>
            );
          })}
        {preview && contentRect.width > 0 && (
          <div
            className="hold-box hold-box-preview"
            style={{
              left: `${contentRect.left + preview.x * contentRect.width}px`,
              top: `${contentRect.top + preview.y * contentRect.height}px`,
              width: `${preview.width * contentRect.width}px`,
              height: `${preview.height * contentRect.height}px`,
            }}
          />
        )}
      </div>
      <p className="hold-canvas-hint">
        Click the photograph to add a box, or drag to draw one. Select a box to move or resize it
        with the corner handles; press Delete to remove it.
      </p>
    </div>
  );
}
