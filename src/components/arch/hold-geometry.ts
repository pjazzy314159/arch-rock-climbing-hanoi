/**
 * Geometry for the route-setting canvas.
 *
 * Holds are stored as fractions of the photograph, never as screen pixels, so
 * a box keeps its place when the image is resized. Everything that converts
 * between a pointer and those fractions lives here and is unit tested.
 */

export type HoldBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type Size = { width: number; height: number };

export type Rect = { left: number; top: number; width: number; height: number };

export type Point = { x: number; y: number };

/** A click that produces nothing is not a hold; this is the smallest box. */
export const MIN_HOLD_SIZE = 0.005;

/** The default box created by a single click, as a fraction of the image. */
export const DEFAULT_HOLD_SIZE = 0.04;

/** A pointer must travel this many pixels before a click becomes a drag. */
export const DRAG_THRESHOLD_PX = 4;

export type Corner = "nw" | "ne" | "sw" | "se";

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function round(value: number): number {
  // Five decimals is about one pixel on a 3000px photograph and matches the
  // precision the backend stores.
  return Math.round(value * 100_000) / 100_000;
}

/**
 * The rectangle the photograph actually occupies inside its container when it
 * is displayed with `object-fit: contain`.
 *
 * Browsers letterbox a contained image: the element can be wider or taller
 * than the picture. Annotations must be placed against the picture, not the
 * element, or they drift into the empty padding.
 */
export function containRect(container: Size, image: Size): Rect {
  if (container.width <= 0 || container.height <= 0 || image.width <= 0 || image.height <= 0) {
    return { left: 0, top: 0, width: 0, height: 0 };
  }
  const scale = Math.min(container.width / image.width, container.height / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  return {
    left: (container.width - width) / 2,
    top: (container.height - height) / 2,
    width,
    height,
  };
}

/** Convert a pointer position to fractions of the photograph. May fall outside 0..1. */
export function pointToNormalised(
  clientX: number,
  clientY: number,
  imageRect: Rect,
  containerRect: { left: number; top: number } = { left: 0, top: 0 },
): Point {
  if (imageRect.width <= 0 || imageRect.height <= 0) return { x: 0, y: 0 };
  return {
    x: (clientX - containerRect.left - imageRect.left) / imageRect.width,
    y: (clientY - containerRect.top - imageRect.top) / imageRect.height,
  };
}

/** True when a point is on the photograph itself, not the letterbox padding. */
export function isInsideImage(point: Point): boolean {
  return point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1;
}

/** Keep a box inside the image without changing its size if it fits. */
export function moveBox(box: HoldBox, dx: number, dy: number): HoldBox {
  return {
    x: round(clamp(box.x + dx, 0, 1 - box.width)),
    y: round(clamp(box.y + dy, 0, 1 - box.height)),
    width: box.width,
    height: box.height,
  };
}

/** Grow a too-small box around its centre, then keep it inside the image. */
function ensureMinimum(box: HoldBox, minimum: number): HoldBox {
  let { x, y, width, height } = box;
  if (width < minimum) {
    x = clamp(x - (minimum - width) / 2, 0, 1 - minimum);
    width = minimum;
  }
  if (height < minimum) {
    y = clamp(y - (minimum - height) / 2, 0, 1 - minimum);
    height = minimum;
  }
  return {
    x: round(clamp(x, 0, 1 - width)),
    y: round(clamp(y, 0, 1 - height)),
    width: round(width),
    height: round(height),
  };
}

/** A box from two drag points, in any direction. */
export function boxFromPoints(start: Point, end: Point, minimum = MIN_HOLD_SIZE): HoldBox {
  const x1 = clamp01(start.x);
  const y1 = clamp01(start.y);
  const x2 = clamp01(end.x);
  const y2 = clamp01(end.y);
  return ensureMinimum(
    {
      x: Math.min(x1, x2),
      y: Math.min(y1, y2),
      width: Math.abs(x2 - x1),
      height: Math.abs(y2 - y1),
    },
    minimum,
  );
}

/** The default box a single click creates, centred on the click. */
export function defaultBoxAt(point: Point, size = DEFAULT_HOLD_SIZE): HoldBox {
  const half = size / 2;
  return {
    x: round(clamp(point.x - half, 0, 1 - size)),
    y: round(clamp(point.y - half, 0, 1 - size)),
    width: round(size),
    height: round(size),
  };
}

/**
 * Resize a box by dragging one corner. The opposite corner stays put, and the
 * box cannot become smaller than `minimum` or leave the photograph.
 */
export function resizeBox(
  box: HoldBox,
  corner: Corner,
  point: Point,
  minimum = MIN_HOLD_SIZE,
): HoldBox {
  const anchor = {
    x: corner === "nw" || corner === "sw" ? box.x + box.width : box.x,
    y: corner === "nw" || corner === "ne" ? box.y + box.height : box.y,
  };
  return boxFromPoints(anchor, { x: clamp01(point.x), y: clamp01(point.y) }, minimum);
}

/** The screen rectangle for a normalised box inside a rendered image rect. */
export function boxToPixels(
  box: HoldBox,
  imageRect: Rect,
): { left: number; top: number; width: number; height: number } {
  return {
    left: imageRect.left + box.x * imageRect.width,
    top: imageRect.top + box.y * imageRect.height,
    width: box.width * imageRect.width,
    height: box.height * imageRect.height,
  };
}

/** The role implied by a hold's place in the sequence. */
export function roleAt(index: number, total: number): "start" | "middle" | "finish" {
  if (index === 0) return "start";
  if (index === total - 1) return "finish";
  return "middle";
}

/** Move one item within a list, returning a new list. */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= items.length) return items.slice();
  const next = items.slice();
  const [item] = next.splice(from, 1);
  if (item === undefined) return next;
  next.splice(clamp(to, 0, next.length), 0, item);
  return next;
}
