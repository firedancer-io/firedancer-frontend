import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { atom, getDefaultStore, type PrimitiveAtom } from "jotai";
import chartStyles from "./chart.module.css";
import { useHoveredPosition } from "./useHoveredPosition";
import { visibleRangeAtom } from "./atoms";

vi.mock("./atoms", () => ({
  visibleRangeAtom: atom<[number, number] | undefined>(undefined),
}));

const store = getDefaultStore();

const onHoverChange = vi.fn();
const onHoverLeave = vi.fn();
let container: HTMLDivElement;
let button: HTMLButtonElement;

beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});

beforeEach(() => {
  onHoverChange.mockClear();
  onHoverLeave.mockClear();
  document.body.innerHTML = "";
  container = document.createElement("div");
  container.getBoundingClientRect = () => new DOMRect(0, 0, 1000, 100);
  button = document.createElement("button");
  button.className = chartStyles.noChartExplore;
  container.appendChild(button);
  document.body.appendChild(container);
  const { result } = renderHook(() =>
    useHoveredPosition({ onHoverChange, onHoverLeave }),
  );
  result.current.setContainer(container);
  onHoverChange.mockClear();
});

function pointer(
  target: Element,
  type: string,
  pointerType: string,
  clientX: number,
  pointerId = 1,
) {
  target.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      pointerType,
      pointerId,
      clientX,
      clientY: 50,
    }),
  );
}

describe("useHoveredPosition", () => {
  it("follows the mouse and clears when it leaves", () => {
    pointer(container, "pointermove", "mouse", 300);
    expect(onHoverChange).toHaveBeenLastCalledWith(300, 50, expect.anything());

    pointer(container, "pointerleave", "mouse", 300);
    expect(onHoverLeave).toHaveBeenCalled();
  });

  it("ignores the mouse events a browser emulates after a tap", () => {
    container.dispatchEvent(
      new MouseEvent("mousemove", { bubbles: true, clientX: 300 }),
    );
    expect(onHoverChange).not.toHaveBeenCalled();
  });

  it("hovers the point a tap lands on", () => {
    pointer(container, "pointerdown", "touch", 300);
    pointer(container, "pointerup", "touch", 302);
    onHoverLeave.mockClear();
    // browsers send a touch pointerleave right after the tap
    pointer(container, "pointerleave", "touch", 302);
    expect(onHoverLeave).not.toHaveBeenCalled();
    expect(onHoverChange).toHaveBeenLastCalledWith(302, 50, expect.anything());
  });

  it("clears the hover on a touch, and keeps it cleared after a drag", () => {
    pointer(container, "pointerdown", "touch", 300);
    pointer(container, "pointerup", "touch", 300);
    onHoverChange.mockClear();

    pointer(container, "pointerdown", "touch", 300);
    expect(onHoverLeave).toHaveBeenCalled();
    pointer(container, "pointermove", "touch", 400);
    pointer(container, "pointerup", "touch", 400);
    expect(onHoverChange).not.toHaveBeenCalled();
  });

  it("doesn't hover when a control like Return to Live is tapped", () => {
    pointer(button, "pointerdown", "touch", 300);
    pointer(button, "pointerup", "touch", 300);
    expect(onHoverChange).not.toHaveBeenCalled();
  });

  it("clears the hover when a touch lands outside", () => {
    pointer(container, "pointerdown", "touch", 300);
    pointer(container, "pointerup", "touch", 300);
    onHoverLeave.mockClear();

    pointer(document.body, "pointerdown", "touch", 300);
    expect(onHoverLeave).toHaveBeenCalled();
  });

  it("doesn't hover when a finger lifts while another finger is down", () => {
    // a pinch whose second finger stays still and lifts at its press point
    pointer(container, "pointerdown", "touch", 300, 1);
    pointer(container, "pointerdown", "touch", 600, 2);
    pointer(container, "pointermove", "touch", 200, 1);
    pointer(container, "pointerup", "touch", 600, 2);
    pointer(container, "pointerup", "touch", 200, 1);
    expect(onHoverChange).not.toHaveBeenCalled();
  });

  it("doesn't hover when the other finger lands outside", () => {
    pointer(container, "pointerdown", "touch", 300, 1);
    pointer(document.body, "pointerdown", "touch", 600, 2);
    pointer(container, "pointerup", "touch", 300, 1);
    expect(onHoverChange).not.toHaveBeenCalled();
  });

  it("doesn't hover after a drag that returns to its start", () => {
    pointer(container, "pointerdown", "touch", 300);
    pointer(container, "pointermove", "touch", 400);
    pointer(container, "pointermove", "touch", 301);
    pointer(container, "pointerup", "touch", 301);
    expect(onHoverChange).not.toHaveBeenCalled();
  });

  it("doesn't hover after a cancelled touch", () => {
    pointer(container, "pointerdown", "touch", 300);
    pointer(container, "pointercancel", "touch", 300);
    pointer(container, "pointerup", "touch", 300);
    expect(onHoverChange).not.toHaveBeenCalled();
  });

  it("still hovers a tap after a multi-touch gesture ends", () => {
    pointer(container, "pointerdown", "touch", 300, 1);
    pointer(container, "pointerdown", "touch", 600, 2);
    pointer(container, "pointerup", "touch", 300, 1);
    pointer(container, "pointerup", "touch", 600, 2);

    pointer(container, "pointerdown", "touch", 500, 3);
    pointer(container, "pointerup", "touch", 500, 3);
    expect(onHoverChange).toHaveBeenLastCalledWith(500, 50, expect.anything());
  });

  it("doesn't hover when a second finger lands and lifts in place", () => {
    pointer(container, "pointerdown", "touch", 300, 1);
    pointer(container, "pointerdown", "touch", 600, 2);
    pointer(container, "pointerup", "touch", 600, 2);
    expect(onHoverChange).not.toHaveBeenCalled();
  });

  it("only hovers on the release of the finger that started the tap", () => {
    pointer(container, "pointerdown", "touch", 300, 1);
    pointer(container, "pointerdown", "touch", 600, 2);
    pointer(container, "pointerup", "touch", 600, 2);
    // finger 1 is still down when finger 3 starts a tap
    pointer(container, "pointerdown", "touch", 300, 3);
    pointer(container, "pointerup", "touch", 300, 1);
    expect(onHoverChange).not.toHaveBeenCalled();
  });

  describe("visible range changes", () => {
    const moveRange = () =>
      store.set(
        visibleRangeAtom as unknown as PrimitiveAtom<[number, number]>,
        [Math.random(), 1],
      );

    it("re-resolve a still cursor", () => {
      pointer(container, "pointermove", "mouse", 300);
      onHoverChange.mockClear();
      moveRange();
      expect(onHoverChange).toHaveBeenLastCalledWith(
        300,
        50,
        expect.anything(),
      );
    });

    it("are ignored by charts outside Replay", () => {
      const onOtherHoverChange = vi.fn();
      const other = document.createElement("div");
      other.getBoundingClientRect = () => new DOMRect(0, 0, 1000, 100);
      document.body.appendChild(other);
      const { result } = renderHook(() =>
        useHoveredPosition({
          onHoverChange: onOtherHoverChange,
          onHoverLeave,
          followsVisibleRange: false,
        }),
      );
      result.current.setContainer(other);
      pointer(other, "pointermove", "mouse", 300);
      onOtherHoverChange.mockClear();
      moveRange();
      expect(onOtherHoverChange).not.toHaveBeenCalled();
    });
  });
});
