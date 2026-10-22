import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HoldCanvas, type CanvasHold } from "@/components/arch/hold-canvas";
import type { HoldBox } from "@/components/arch/hold-geometry";

/**
 * Interaction tests for the annotation canvas.
 *
 * jsdom has no layout, so the canvas rectangle is stubbed. Everything else —
 * pointer handling, the click-versus-drag threshold, resize anchors and the
 * fraction-to-pixel placement — runs as it does in the browser.
 */

afterEach(cleanup);

// jsdom has no PointerEvent, so Testing Library would fall back to a plain
// Event without clientX/clientY. This small polyfill makes pointer geometry
// testable without changing the component.
if (typeof window.PointerEvent === "undefined") {
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number;
    pointerType: string;
    isPrimary: boolean;

    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
      this.pointerType = init.pointerType ?? "mouse";
      this.isPrimary = init.isPrimary ?? true;
    }
  }
  Object.defineProperty(window, "PointerEvent", {
    configurable: true,
    writable: true,
    value: PointerEventPolyfill,
  });
}

const HOLDS: CanvasHold[] = [
  { id: 1, label: "", x: 0.2, y: 0.2, width: 0.1, height: 0.1 },
  { id: 2, label: "", x: 0.6, y: 0.6, width: 0.1, height: 0.1 },
];

function domRect(width: number, height: number): DOMRect {
  return {
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: width,
    bottom: height,
    width,
    height,
    toJSON: () => ({}),
  } as DOMRect;
}

function layout(canvas: HTMLElement, width = 800, height = 600) {
  Object.defineProperty(canvas, "getBoundingClientRect", {
    configurable: true,
    value: () => domRect(width, height),
  });
  fireEvent(window, new Event("resize"));
}

function pointer(
  element: HTMLElement,
  type: "pointerDown" | "pointerMove" | "pointerUp",
  x: number,
  y: number,
) {
  fireEvent[type](element, {
    clientX: x,
    clientY: y,
    button: 0,
    buttons: type === "pointerUp" ? 0 : 1,
    pointerId: 1,
    pointerType: "mouse",
    isPrimary: true,
  });
}

type Props = {
  holds?: CanvasHold[];
  selectedId?: number | null;
  sequence?: number[];
  onCreate?: (box: HoldBox) => void;
  onUpdate?: (id: number, box: HoldBox) => void;
  onDelete?: (id: number) => void;
  onSelect?: (id: number | null) => void;
  onImageError?: () => void;
};

function renderCanvas(props: Props = {}) {
  const handlers = {
    onCreate: props.onCreate ?? vi.fn(),
    onUpdate: props.onUpdate ?? vi.fn(),
    onDelete: props.onDelete ?? vi.fn(),
    onSelect: props.onSelect ?? vi.fn(),
    onImageError: props.onImageError ?? vi.fn(),
  };
  render(
    <HoldCanvas
      imageUrl="/walls/main.jpg"
      holds={props.holds ?? HOLDS}
      selectedId={props.selectedId ?? null}
      sequence={props.sequence ?? []}
      onCreate={handlers.onCreate}
      onUpdate={handlers.onUpdate}
      onDelete={handlers.onDelete}
      onSelect={handlers.onSelect}
      onImageError={handlers.onImageError}
    />,
  );
  const canvas = screen.getByTestId("hold-canvas");
  layout(canvas);
  return { canvas, ...handlers };
}

async function holdBox(id: number): Promise<HTMLElement> {
  const element = document.querySelector<HTMLElement>(`[data-hold-id="${id}"]`);
  expect(element).not.toBeNull();
  return element!;
}

describe("HoldCanvas", () => {
  it("creates a default box on a click", async () => {
    const onCreate = vi.fn();
    const { canvas } = renderCanvas({ onCreate });
    await holdBox(1);

    pointer(canvas, "pointerDown", 400, 300);
    pointer(canvas, "pointerUp", 400, 300);

    expect(onCreate).toHaveBeenCalledWith({
      x: 0.48,
      y: 0.48,
      width: 0.04,
      height: 0.04,
    });
  });

  it("draws a custom box when the pointer is dragged", async () => {
    const onCreate = vi.fn();
    const { canvas } = renderCanvas({ onCreate });
    await holdBox(1);

    pointer(canvas, "pointerDown", 200, 150);
    pointer(canvas, "pointerMove", 400, 300);
    pointer(canvas, "pointerUp", 400, 300);

    expect(onCreate).toHaveBeenCalledWith({
      x: 0.25,
      y: 0.25,
      width: 0.25,
      height: 0.25,
    });
  });

  it("treats a tiny accidental movement as a click, not a box", async () => {
    const onCreate = vi.fn();
    const { canvas } = renderCanvas({ onCreate });
    await holdBox(1);

    pointer(canvas, "pointerDown", 400, 300);
    pointer(canvas, "pointerMove", 402, 301);
    pointer(canvas, "pointerUp", 402, 301);

    expect(onCreate).toHaveBeenCalledWith({
      x: 0.48,
      y: 0.48,
      width: 0.04,
      height: 0.04,
    });
  });

  it("places boxes against the picture, not the letterbox padding", async () => {
    const onCreate = vi.fn();
    const { canvas } = renderCanvas({ onCreate });

    const image = screen.getByAltText("The selected wall's photograph");
    Object.defineProperty(image, "naturalWidth", { configurable: true, value: 2000 });
    Object.defineProperty(image, "naturalHeight", { configurable: true, value: 1000 });
    fireEvent.load(image);

    // In an 800x600 element a 2:1 picture is 800x400, centred at y=100.
    await waitFor(() =>
      expect(document.querySelector<HTMLElement>('[data-hold-id="1"]')?.style.top).toBe("180px"),
    );
    const first = await holdBox(1);
    expect(first.style.left).toBe("160px");
    expect(first.style.top).toBe("180px");
    expect(first.style.width).toBe("80px");
    expect(first.style.height).toBe("40px");

    pointer(canvas, "pointerDown", 400, 50);
    pointer(canvas, "pointerUp", 400, 50);
    expect(onCreate).not.toHaveBeenCalled();

    pointer(canvas, "pointerDown", 400, 300);
    pointer(canvas, "pointerUp", 400, 300);
    expect(onCreate).toHaveBeenCalledWith({
      x: 0.48,
      y: 0.48,
      width: 0.04,
      height: 0.04,
    });
  });

  it("moves a selected hold and saves the new position once", async () => {
    const onUpdate = vi.fn();
    const onSelect = vi.fn();
    const { canvas } = renderCanvas({ onUpdate, onSelect });
    const box = await holdBox(1);

    pointer(box, "pointerDown", 200, 150);
    expect(onSelect).toHaveBeenCalledWith(1);
    pointer(canvas, "pointerMove", 280, 210);
    pointer(canvas, "pointerUp", 280, 210);

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith(1, {
      x: 0.3,
      y: 0.3,
      width: 0.1,
      height: 0.1,
    });
  });

  it("resizes from a visible corner handle", async () => {
    const onUpdate = vi.fn();
    const { canvas } = renderCanvas({ selectedId: 1, onUpdate });
    await holdBox(1);
    const handle = document.querySelector<HTMLElement>('[data-corner="se"]');
    expect(handle).not.toBeNull();

    pointer(handle!, "pointerDown", 240, 180);
    pointer(canvas, "pointerMove", 320, 240);
    pointer(canvas, "pointerUp", 320, 240);

    expect(onUpdate).toHaveBeenCalledWith(1, {
      x: 0.2,
      y: 0.2,
      width: 0.2,
      height: 0.2,
    });
  });

  it("deletes the selected hold from the keyboard", async () => {
    const onDelete = vi.fn();
    renderCanvas({ selectedId: 1, onDelete });
    const box = await holdBox(1);
    fireEvent.keyDown(box, { key: "Delete" });
    expect(onDelete).toHaveBeenCalledWith(1);
  });

  it("shows the sequence number and role on a box", async () => {
    renderCanvas({ sequence: [2, 1] });
    const first = await holdBox(2);
    const second = await holdBox(1);
    expect(first.textContent).toContain("1");
    expect(first.className).toContain("hold-box-start");
    expect(second.textContent).toContain("2");
    expect(second.className).toContain("hold-box-finish");
  });

  it("keeps boxes aligned when the viewport changes", async () => {
    const { canvas } = renderCanvas();
    const box = await holdBox(1);
    expect(box.style.left).toBe("160px");

    layout(canvas, 400, 300);
    await waitFor(() => expect(box.style.left).toBe("80px"));
    expect(box.style.top).toBe("60px");
    expect(box.style.width).toBe("40px");
    expect(box.style.height).toBe("30px");
  });

  it("reports a broken photograph instead of drawing on empty space", async () => {
    const onImageError = vi.fn();
    renderCanvas({ onImageError });
    const image = screen.getByAltText("The selected wall's photograph");
    fireEvent.error(image);
    expect(onImageError).toHaveBeenCalledTimes(1);
  });
});
