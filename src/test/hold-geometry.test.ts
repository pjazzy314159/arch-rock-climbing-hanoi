import { describe, expect, it } from "vitest";

import {
  boxFromPoints,
  boxToPixels,
  containRect,
  defaultBoxAt,
  isInsideImage,
  moveBox,
  moveItem,
  pointToNormalised,
  resizeBox,
  roleAt,
} from "@/components/arch/hold-geometry";

/**
 * The canvas math.
 *
 * Holds are stored as fractions of the photograph. These tests pin down the
 * conversions in both directions, including the letterbox padding a contained
 * image produces, because a mistake there puts every box in the wrong place
 * on a different screen.
 */

describe("containRect", () => {
  it("letterboxes a wide image inside a taller container", () => {
    // A 2:1 picture in an 800x800 box occupies the full width but only half
    // the height, centred vertically.
    const rect = containRect({ width: 800, height: 800 }, { width: 2000, height: 1000 });
    expect(rect).toEqual({ left: 0, top: 200, width: 800, height: 400 });
  });

  it("pillarboxes a tall image inside a wider container", () => {
    const rect = containRect({ width: 800, height: 400 }, { width: 1000, height: 1000 });
    expect(rect).toEqual({ left: 200, top: 0, width: 400, height: 400 });
  });

  it("returns an empty rect before the element is measured", () => {
    expect(containRect({ width: 0, height: 0 }, { width: 4, height: 3 })).toEqual({
      left: 0,
      top: 0,
      width: 0,
      height: 0,
    });
  });
});

describe("pointToNormalised", () => {
  it("converts a pointer to fractions of the rendered picture", () => {
    // The picture sits 100px from the left and 50px from the top of the
    // container, and is 400x200. A pointer 100px into the picture is at 0.25.
    const point = pointToNormalised(
      210,
      170,
      { left: 100, top: 50, width: 400, height: 200 },
      { left: 10, top: 20 },
    );
    expect(point.x).toBeCloseTo(0.25);
    expect(point.y).toBeCloseTo(0.5);
  });

  it("reports pointer positions outside the picture instead of hiding them", () => {
    const point = pointToNormalised(
      -10,
      10,
      { left: 100, top: 0, width: 400, height: 200 },
      { left: 0, top: 0 },
    );
    expect(point.x).toBeLessThan(0);
    expect(isInsideImage(point)).toBe(false);
  });
});

describe("box creation", () => {
  it("centres a default box on a click and keeps it inside at the edge", () => {
    expect(defaultBoxAt({ x: 0.5, y: 0.5 })).toEqual({
      x: 0.48,
      y: 0.48,
      width: 0.04,
      height: 0.04,
    });
    expect(defaultBoxAt({ x: 0.99, y: 0.01 })).toEqual({
      x: 0.96,
      y: 0,
      width: 0.04,
      height: 0.04,
    });
  });

  it("draws a box from two points in any drag direction", () => {
    const forwards = boxFromPoints({ x: 0.2, y: 0.3 }, { x: 0.5, y: 0.7 });
    const backwards = boxFromPoints({ x: 0.5, y: 0.7 }, { x: 0.2, y: 0.3 });
    expect(forwards).toEqual({ x: 0.2, y: 0.3, width: 0.3, height: 0.4 });
    expect(backwards).toEqual(forwards);
  });

  it("expands a negligible drag to the minimum box instead of storing zero", () => {
    const box = boxFromPoints({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 });
    expect(box.width).toBe(0.005);
    expect(box.height).toBe(0.005);
    expect(box.x).toBeLessThan(0.5);
  });

  it("clamps a drag that starts or ends in the letterbox padding", () => {
    const box = boxFromPoints({ x: -0.2, y: 0.4 }, { x: 0.3, y: 1.4 });
    expect(box).toEqual({ x: 0, y: 0.4, width: 0.3, height: 0.6 });
  });
});

describe("moveBox", () => {
  it("moves by a delta and stops at the image edge", () => {
    const box = { x: 0.2, y: 0.2, width: 0.1, height: 0.1 };
    expect(moveBox(box, 0.1, 0.1)).toEqual({
      x: 0.3,
      y: 0.3,
      width: 0.1,
      height: 0.1,
    });
    expect(moveBox(box, 5, 5)).toEqual({
      x: 0.9,
      y: 0.9,
      width: 0.1,
      height: 0.1,
    });
    expect(moveBox(box, -5, -5)).toEqual({
      x: 0,
      y: 0,
      width: 0.1,
      height: 0.1,
    });
  });
});

describe("resizeBox", () => {
  const box = { x: 0.2, y: 0.2, width: 0.2, height: 0.2 };

  it("keeps the opposite corner fixed for every handle", () => {
    expect(resizeBox(box, "se", { x: 0.6, y: 0.7 })).toEqual({
      x: 0.2,
      y: 0.2,
      width: 0.4,
      height: 0.5,
    });
    expect(resizeBox(box, "nw", { x: 0.1, y: 0.1 })).toEqual({
      x: 0.1,
      y: 0.1,
      width: 0.3,
      height: 0.3,
    });
    expect(resizeBox(box, "ne", { x: 0.7, y: 0.1 })).toEqual({
      x: 0.2,
      y: 0.1,
      width: 0.5,
      height: 0.3,
    });
    expect(resizeBox(box, "sw", { x: 0.1, y: 0.7 })).toEqual({
      x: 0.1,
      y: 0.2,
      width: 0.3,
      height: 0.5,
    });
  });

  it("never shrinks below the minimum usable size", () => {
    const shrunk = resizeBox(box, "se", { x: 0.2, y: 0.2 });
    expect(shrunk.width).toBe(0.005);
    expect(shrunk.height).toBe(0.005);
  });
});

describe("rendering and sequence", () => {
  it("maps the same box to proportionally different screen positions", () => {
    const box = { x: 0.25, y: 0.5, width: 0.1, height: 0.2 };
    expect(boxToPixels(box, { left: 20, top: 10, width: 800, height: 600 })).toEqual({
      left: 220,
      top: 310,
      width: 80,
      height: 120,
    });
    expect(boxToPixels(box, { left: 0, top: 0, width: 400, height: 300 })).toEqual({
      left: 100,
      top: 150,
      width: 40,
      height: 60,
    });
  });

  it("derives start and finish from the order, never from a separate flag", () => {
    expect(roleAt(0, 3)).toBe("start");
    expect(roleAt(1, 3)).toBe("middle");
    expect(roleAt(2, 3)).toBe("finish");
    expect(roleAt(0, 1)).toBe("start");
  });

  it("reorders a sequence without losing or duplicating holds", () => {
    expect(moveItem([10, 20, 30], 2, 0)).toEqual([30, 10, 20]);
    expect(moveItem([10, 20, 30], 0, 1)).toEqual([20, 10, 30]);
    expect(moveItem([10, 20, 30], 0, 99)).toEqual([20, 30, 10]);
  });
});
