import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, renderHook } from "@testing-library/react";
import { atom, getDefaultStore, type PrimitiveAtom } from "jotai";
import { startupTimeAtom } from "../../../api/atoms";
import { containerElAtom } from "../../../atoms";
import { smoothedNowNsAtom } from "../../../nowAtoms";
import { CHART_NOW_DELAY_MS } from "../const";
import type * as NonAggAtoms from "./nonAggAtoms";
import type { SlotGroup, SlotInfo } from "./nonAggAtoms";

vi.mock("../../../nowAtoms", () => ({
  smoothedNowNsAtom: atom<bigint | undefined>(undefined),
}));
vi.mock("./nonAggAtoms", async (importOriginal) => {
  const original = await importOriginal<typeof NonAggAtoms>();
  return {
    ...original,
    timelineSlotsAtom: atom({
      slotGroups: new Map<number, SlotGroup>(),
      tileSlotGroups: new Map<number, Set<number>>(),
    }),
  };
});

const {
  dismissPinnedAtom,
  initializeVisibleRangeAtom,
  isLiveAtom,
  openOrUpdateOverlapAtom,
  pinnedTooltipAtom,
  resetToLiveAtom,
  selectPinnedSlotAtom,
  selectedSlotAtom,
  clearSelectedSlotAtom,
  nonAggHeaderElAtom,
  visibleRangeAtom,
} = await import("../atoms");
const { timelineSlotsAtom } = await import("./nonAggAtoms");
const { default: OverlapTooltip } = await import("./OverlapTooltip");
const { useExplorableChart } = await import("../useExplorableChart");

const store = getDefaultStore();
const TRACK_WIDTH_PX = 1_000;
const WORLD_END_MS = 100_000;
// the live 12s window is [88s, 100s]; slots 100 and 101 overlap at 92-93s
const OVERLAP_MS = 92_500;
// x of 92.5s in the live window
const OVERLAP_X = ((OVERLAP_MS - 88_000) / 12_000) * TRACK_WIDTH_PX;

let trackEl: HTMLDivElement;
let portalEl: HTMLDivElement;
const cleanUps: (() => void)[] = [];

function slot(slotNumber: number): SlotInfo {
  return {
    slot: slotNumber,
    startMs: 92_000,
    endMs: 93_000,
    isSkipped: false,
    isMine: false,
    shredCnt: null,
    txnFees: null,
    prioFees: null,
    tips: null,
  };
}

function touchEvent(type: string, xs: number[], changedXs = xs) {
  const toTouches = (points: number[]) =>
    points.map((clientX, identifier) => ({
      identifier,
      clientX,
      clientY: 50,
    }));
  return Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
    touches: toTouches(xs),
    changedTouches: toTouches(changedXs),
  });
}

function pan(fromX: number, toX: number) {
  act(() => {
    trackEl.dispatchEvent(touchEvent("touchstart", [fromX]));
    window.dispatchEvent(touchEvent("touchmove", [toX]));
    window.dispatchEvent(touchEvent("touchend", [], [toX]));
  });
}

function tap(x: number) {
  act(() => {
    trackEl.dispatchEvent(touchEvent("touchstart", [x]));
    window.dispatchEvent(touchEvent("touchend", [], [x]));
  });
}

function pinch(from: number[], to: number[]) {
  act(() => {
    trackEl.dispatchEvent(touchEvent("touchstart", from));
    window.dispatchEvent(touchEvent("touchmove", to));
    window.dispatchEvent(touchEvent("touchend", [], to));
  });
}

function wheel(clientX: number, deltaY: number) {
  act(() => {
    trackEl.dispatchEvent(
      new WheelEvent("wheel", { clientX, deltaY, cancelable: true }),
    );
  });
}

function mousePan(fromX: number, toX: number) {
  act(() => {
    trackEl.dispatchEvent(
      new MouseEvent("mousedown", {
        clientX: fromX,
        bubbles: true,
        buttons: 1,
      }),
    );
    window.dispatchEvent(
      new MouseEvent("mousemove", { clientX: toX, buttons: 1 }),
    );
    window.dispatchEvent(new MouseEvent("mouseup", { clientX: toX }));
  });
}

function openDetail() {
  act(() => {
    store.set(openOrUpdateOverlapAtom, {
      ts: OVERLAP_MS,
      clientPos: { x: OVERLAP_X, y: 0 },
    });
    store.set(selectPinnedSlotAtom, 100);
  });
  expect(store.get(pinnedTooltipAtom)?.mode).toBe("detail");
}

// dragging right moves to earlier times; the live view can't move later
const span = () => {
  const [start, end] = store.get(visibleRangeAtom)!;
  return end - start;
};

beforeEach(() => {
  // jsdom has no ResizeObserver; the tooltip uses it to reposition
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );

  store.set(startupTimeAtom, { startupTimeNanos: 0n });
  store.set(
    smoothedNowNsAtom as PrimitiveAtom<bigint | undefined>,
    BigInt((WORLD_END_MS + CHART_NOW_DELAY_MS) * 1_000_000),
  );
  store.set(initializeVisibleRangeAtom);
  store.set(resetToLiveAtom);
  store.set(clearSelectedSlotAtom);

  const slots = new Map([
    [100, slot(100)],
    [101, slot(101)],
  ]);
  // header tiles are 10s, so 92s is in tile 9
  store.set(timelineSlotsAtom as PrimitiveAtom<unknown>, {
    slotGroups: new Map([
      [100, { leaderSlot: 100, slots, tileIdxs: new Set([9]) }],
    ]),
    tileSlotGroups: new Map([[9, new Set([100])]]),
  });

  trackEl = document.createElement("div");
  vi.spyOn(trackEl, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 0, TRACK_WIDTH_PX, 100),
  );
  portalEl = document.createElement("div");
  document.body.append(trackEl, portalEl);
  store.set(containerElAtom, portalEl);

  const { result } = renderHook(() => useExplorableChart());
  cleanUps.push(result.current.setUpExploreListeners(trackEl));
  render(<OverlapTooltip />);
});

afterEach(() => {
  cleanUps.splice(0).forEach((cleanUp) => cleanUp());
  cleanup();
  store.set(dismissPinnedAtom);
  store.set(containerElAtom, null);
  trackEl.remove();
  portalEl.remove();
  vi.unstubAllGlobals();
});

describe("chart gestures with the tooltip closed", () => {
  it("pans with one finger", () => {
    const before = store.get(visibleRangeAtom)!;
    pan(300, 500);
    expect(store.get(visibleRangeAtom)![0]).toBeLessThan(before[0]);
    expect(store.get(isLiveAtom)).toBe(false);
  });

  it("zooms with a pinch", () => {
    const before = span();
    pinch([400, 600], [300, 700]);
    expect(span()).toBeLessThan(before);
  });

  it("zooms with the wheel", () => {
    const before = span();
    wheel(500, -100);
    expect(span()).toBeLessThan(before);
  });

  it("selects the slot under a tap", () => {
    tap(OVERLAP_X);
    expect(store.get(selectedSlotAtom)).toBe(101);
  });

  it("pans with the mouse", () => {
    const before = store.get(visibleRangeAtom)!;
    mousePan(300, 500);
    expect(store.get(visibleRangeAtom)![0]).toBeLessThan(before[0]);
  });
});

describe("chart gestures with the slot details open", () => {
  it("a tap outside only closes it, without selecting", () => {
    openDetail();
    tap(OVERLAP_X);
    expect(store.get(pinnedTooltipAtom)).toBeUndefined();
    expect(store.get(selectedSlotAtom)).toBeUndefined();
  });

  it("cancels the closing tap so the browser fires no emulated mouse events", () => {
    openDetail();
    const closingTouch = touchEvent("touchstart", [OVERLAP_X]);
    act(() => {
      trackEl.dispatchEvent(closingTouch);
      window.dispatchEvent(touchEvent("touchend", [], [OVERLAP_X]));
    });
    expect(closingTouch.defaultPrevented).toBe(true);
  });

  it("a drag outside only closes it, then the next drag pans", () => {
    openDetail();
    const before = store.get(visibleRangeAtom)!;

    pan(300, 500);
    expect(store.get(pinnedTooltipAtom)).toBeUndefined();
    expect(store.get(visibleRangeAtom)).toEqual(before);

    pan(300, 500);
    expect(store.get(visibleRangeAtom)![0]).toBeLessThan(before[0]);
  });

  it("a pinch outside only closes it, then the next pinch zooms", () => {
    openDetail();
    const before = store.get(visibleRangeAtom)!;

    pinch([400, 600], [300, 700]);
    expect(store.get(pinnedTooltipAtom)).toBeUndefined();
    expect(store.get(visibleRangeAtom)).toEqual(before);

    pinch([400, 600], [300, 700]);
    expect(span()).toBeLessThan(before[1] - before[0]);
  });

  it("lets fingers that land after the closing touch pinch", () => {
    openDetail();
    const before = span();
    const firstFinger = touchEvent("touchstart", [400]);
    act(() => {
      trackEl.dispatchEvent(firstFinger);
      trackEl.dispatchEvent(touchEvent("touchstart", [400, 600], [600]));
      window.dispatchEvent(touchEvent("touchmove", [300, 700]));
      window.dispatchEvent(touchEvent("touchend", [], [300, 700]));
    });
    expect(store.get(pinnedTooltipAtom)).toBeUndefined();
    expect(firstFinger.defaultPrevented).toBe(true);
    expect(span()).toBeLessThan(before);
  });

  it("a tap off the chart closes it and still goes through", () => {
    const button = document.createElement("button");
    document.body.appendChild(button);
    openDetail();

    const closingTouch = touchEvent("touchstart", [OVERLAP_X]);
    act(() => {
      button.dispatchEvent(closingTouch);
      window.dispatchEvent(touchEvent("touchend", [], [OVERLAP_X]));
    });
    expect(store.get(pinnedTooltipAtom)).toBeUndefined();
    expect(closingTouch.defaultPrevented).toBe(false);
    button.remove();
  });

  it("a click off the chart closes it and still reaches its target", () => {
    const button = document.createElement("button");
    const onMouseDown = vi.fn();
    button.addEventListener("mousedown", onMouseDown);
    document.body.appendChild(button);
    openDetail();

    act(() => {
      button.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, button: 0 }),
      );
    });
    expect(store.get(pinnedTooltipAtom)).toBeUndefined();
    expect(onMouseDown).toHaveBeenCalled();
    button.remove();
  });

  it("the wheel still zooms", () => {
    openDetail();
    const before = span();
    wheel(OVERLAP_X, -100);
    expect(span()).toBeLessThan(before);
  });

  it("a mouse drag outside only closes it, as before", () => {
    openDetail();
    const before = store.get(visibleRangeAtom)!;
    mousePan(300, 500);
    expect(store.get(pinnedTooltipAtom)).toBeUndefined();
    expect(store.get(visibleRangeAtom)).toEqual(before);
  });
});

describe("chart gestures with the list open", () => {
  // finger 0 on the header (y 10), finger 1 below it (y 60)
  const HEADER_Y = 10;
  const BELOW_HEADER_Y = 60;

  function fingers(
    type: string,
    points: [number, number][],
    changed: number[],
  ) {
    const all = points.map(([clientX, clientY], identifier) => ({
      identifier,
      clientX,
      clientY,
    }));
    return Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
      touches: type === "touchend" ? [] : all,
      changedTouches: changed.map((i) => all[i]),
    });
  }

  let headerEl: HTMLDivElement;

  beforeEach(() => {
    // the header sits in the chart's gesture area, above the tracks
    headerEl = document.createElement("div");
    headerEl.getBoundingClientRect = () =>
      new DOMRect(0, 0, TRACK_WIDTH_PX, 30);
    trackEl.appendChild(headerEl);
    store.set(nonAggHeaderElAtom, headerEl);
    act(() => {
      store.set(openOrUpdateOverlapAtom, {
        ts: OVERLAP_MS,
        clientPos: { x: OVERLAP_X, y: HEADER_Y },
      });
    });
    expect(store.get(pinnedTooltipAtom)?.mode).toBe("list");
  });

  afterEach(() => {
    store.set(nonAggHeaderElAtom, null);
  });

  /** finger 0 lands on the header, then finger 1 lands outside it */
  function headerThenOutsideFinger(x: number) {
    act(() => {
      headerEl.dispatchEvent(fingers("touchstart", [[x, HEADER_Y]], [0]));
      trackEl.dispatchEvent(
        fingers(
          "touchstart",
          [
            [x, HEADER_Y],
            [x, BELOW_HEADER_Y],
          ],
          [1],
        ),
      );
    });
  }

  it("a second finger outside the header closes it, and the fingers pinch instead of panning", () => {
    const before = span();
    headerThenOutsideFinger(300);
    expect(store.get(pinnedTooltipAtom)).toBeUndefined();

    act(() => {
      window.dispatchEvent(
        fingers(
          "touchmove",
          [
            [500, HEADER_Y],
            [300, BELOW_HEADER_Y],
          ],
          [0],
        ),
      );
      window.dispatchEvent(
        fingers(
          "touchend",
          [
            [500, HEADER_Y],
            [300, BELOW_HEADER_Y],
          ],
          [0, 1],
        ),
      );
    });

    expect(span()).not.toEqual(before);
  });

  it("a second finger outside the header cancels the first finger's tap", () => {
    headerThenOutsideFinger(OVERLAP_X);

    act(() => {
      window.dispatchEvent(
        fingers(
          "touchend",
          [
            [OVERLAP_X, HEADER_Y],
            [OVERLAP_X, BELOW_HEADER_Y],
          ],
          [0, 1],
        ),
      );
    });

    expect(store.get(pinnedTooltipAtom)).toBeUndefined();
    expect(store.get(selectedSlotAtom)).toBeUndefined();
  });
});
