import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { atom, getDefaultStore, type PrimitiveAtom } from "jotai";
import { startupTimeAtom } from "../../api/atoms";
import { smoothedNowNsAtom } from "../../nowAtoms";
import {
  initializeVisibleRangeAtom,
  isLiveAtom,
  resetToLiveAtom,
  visibleRangeAtom,
} from "./atoms";
import { CHART_NOW_DELAY_MS, DEFAULT_WINDOW_MS, MIN_VISIBLE_MS } from "./const";
import { useExplorableChart } from "./useExplorableChart";

vi.mock("../../nowAtoms", () => ({
  smoothedNowNsAtom: atom<bigint | undefined>(undefined),
}));

const store = getDefaultStore();
const TRACK_WIDTH_PX = 1_000;
const WORLD_END_MS = 100_000;

function setWorldEnd(ms: number) {
  store.set(
    smoothedNowNsAtom as PrimitiveAtom<bigint | undefined>,
    BigInt((ms + CHART_NOW_DELAY_MS) * 1_000_000),
  );
}

function setUpTrack() {
  const trackEl = document.createElement("div");
  vi.spyOn(trackEl, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 0, TRACK_WIDTH_PX, 100),
  );
  const { result } = renderHook(() => useExplorableChart());
  cleanUps.push(result.current.setUpExploreListeners(trackEl));
  return trackEl;
}

const cleanUps: (() => void)[] = [];
afterEach(() => {
  cleanUps.splice(0).forEach((cleanUp) => cleanUp());
});

function wheel(trackEl: HTMLElement, clientX: number, deltaY: number) {
  trackEl.dispatchEvent(
    new WheelEvent("wheel", { clientX, deltaY, cancelable: true }),
  );
}

function tsAtClientX(clientX: number) {
  const [start, end] = store.get(visibleRangeAtom)!;
  return start + (clientX / TRACK_WIDTH_PX) * (end - start);
}

beforeEach(() => {
  store.set(startupTimeAtom, { startupTimeNanos: 0n });
  setWorldEnd(WORLD_END_MS);
  store.set(initializeVisibleRangeAtom);
  store.set(resetToLiveAtom);
});

describe("replay wheel zoom", () => {
  it("small zoom-in steps from live stay anchored on the cursor", () => {
    const trackEl = setUpTrack();
    const cursorX = 500;
    const cursorTs = tsAtClientX(cursorX);

    for (let i = 0; i < 10; i++) {
      wheel(trackEl, cursorX, -4);
    }

    expect(store.get(isLiveAtom)).toBe(false);
    expect(tsAtClientX(cursorX)).toBeCloseTo(cursorTs, 6);
    const [start, end] = store.get(visibleRangeAtom)!;
    expect(end - start).toBeLessThan(DEFAULT_WINDOW_MS);
  });

  it("zooming in near the right edge keeps the right edge and stays live", () => {
    const trackEl = setUpTrack();
    wheel(trackEl, 970, -100);

    expect(store.get(isLiveAtom)).toBe(true);
    const [start, end] = store.get(visibleRangeAtom)!;
    expect(end).toBe(WORLD_END_MS);
    expect(end - start).toBeLessThan(DEFAULT_WINDOW_MS);
  });

  it("zooming in near the right edge while paused just short of world end stays paused", () => {
    const trackEl = setUpTrack();
    store.set(visibleRangeAtom, [88_000, 99_900]);

    wheel(trackEl, 990, -100);
    expect(store.get(isLiveAtom)).toBe(false);
    expect(store.get(visibleRangeAtom)![1]).toBe(99_900);
  });

  it("zooming near the left edge keeps the left edge", () => {
    const trackEl = setUpTrack();
    store.set(visibleRangeAtom, [50_000, 60_000]);

    wheel(trackEl, 30, -100);
    expect(store.get(visibleRangeAtom)![0]).toBe(50_000);
    expect(store.get(visibleRangeAtom)![1]).toBeLessThan(60_000);

    wheel(trackEl, 30, 100);
    expect(store.get(visibleRangeAtom)![0]).toBe(50_000);
  });

  it("zooming just outside the edge zone anchors on the cursor", () => {
    const trackEl = setUpTrack();
    store.set(visibleRangeAtom, [50_000, 60_000]);
    const cursorX = 60;
    const cursorTs = tsAtClientX(cursorX);

    wheel(trackEl, cursorX, -100);
    expect(store.get(visibleRangeAtom)![0]).toBeGreaterThan(50_000);
    expect(tsAtClientX(cursorX)).toBeCloseTo(cursorTs, 6);
  });

  it("zooming out from live stays live", () => {
    const trackEl = setUpTrack();
    wheel(trackEl, 500, 100);

    expect(store.get(isLiveAtom)).toBe(true);
    const [start, end] = store.get(visibleRangeAtom)!;
    expect(end).toBe(WORLD_END_MS);
    expect(end - start).toBeGreaterThan(DEFAULT_WINDOW_MS);
  });
});

describe("replay pinch zoom", () => {
  function touches(type: string, xs: number[], changedXs = xs) {
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

  function pinch(trackEl: HTMLElement, from: number[], to: number[]) {
    trackEl.dispatchEvent(touches("touchstart", from));
    window.dispatchEvent(touches("touchmove", to));
  }

  it("zooms around the fingers' midpoint", () => {
    const trackEl = setUpTrack();
    const midTs = tsAtClientX(500);
    const [start, end] = store.get(visibleRangeAtom)!;

    // fingers twice as far apart: half the span, midpoint stays under them
    pinch(trackEl, [400, 600], [300, 700]);

    expect(store.get(isLiveAtom)).toBe(false);
    const [newStart, newEnd] = store.get(visibleRangeAtom)!;
    expect(newEnd - newStart).toBeCloseTo((end - start) / 2, 6);
    expect(tsAtClientX(500)).toBeCloseTo(midTs, 6);
  });

  it("pans with the midpoint while zooming", () => {
    const trackEl = setUpTrack();
    const midTs = tsAtClientX(500);

    pinch(trackEl, [400, 600], [600, 800]);

    expect(tsAtClientX(700)).toBeCloseTo(midTs, 6);
  });

  it("stops zooming in at the minimum span", () => {
    const trackEl = setUpTrack();
    store.set(visibleRangeAtom, [90_000, 90_000 + MIN_VISIBLE_MS * 2]);

    pinch(trackEl, [499, 501], [0, 1000]);

    const [start, end] = store.get(visibleRangeAtom)!;
    expect(end - start).toBeCloseTo(MIN_VISIBLE_MS, 6);
  });

  it("turns a one-finger pan into a pinch when a second finger lands", () => {
    const trackEl = setUpTrack();
    document.body.appendChild(trackEl);
    trackEl.dispatchEvent(touches("touchstart", [400]));
    trackEl.dispatchEvent(touches("touchstart", [400, 600], [600]));
    const [start, end] = store.get(visibleRangeAtom)!;

    window.dispatchEvent(touches("touchmove", [300, 700]));

    const [newStart, newEnd] = store.get(visibleRangeAtom)!;
    expect(newEnd - newStart).toBeCloseTo((end - start) / 2, 6);
  });

  it("ends on lifting a finger, so the next gesture works", () => {
    const trackEl = setUpTrack();
    pinch(trackEl, [400, 600], [300, 700]);
    window.dispatchEvent(touches("touchend", [700], [300]));
    const range = store.get(visibleRangeAtom)!;

    // the remaining finger moving doesn't pan or zoom
    window.dispatchEvent(touches("touchmove", [100]));
    expect(store.get(visibleRangeAtom)).toEqual(range);
    window.dispatchEvent(touches("touchend", [], [100]));

    trackEl.dispatchEvent(
      new MouseEvent("mousedown", { clientX: 500, button: 0, buttons: 1 }),
    );
    window.dispatchEvent(
      new MouseEvent("mousemove", { clientX: 600, buttons: 1 }),
    );
    expect(store.get(visibleRangeAtom)).not.toEqual(range);
  });

  it("recovers when a pinch's touchend was missed", () => {
    const trackEl = setUpTrack();
    pinch(trackEl, [400, 600], [300, 700]);
    const range = store.get(visibleRangeAtom)!;

    // both fingers lifted on a removed element; a new finger pans
    const newFinger = Object.assign(
      new Event("touchstart", { bubbles: true, cancelable: true }),
      {
        touches: [{ identifier: 5, clientX: 500, clientY: 50 }],
        changedTouches: [{ identifier: 5, clientX: 500, clientY: 50 }],
      },
    );
    trackEl.dispatchEvent(newFinger);
    window.dispatchEvent(
      Object.assign(new Event("touchmove", { cancelable: true }), {
        touches: [{ identifier: 5, clientX: 600, clientY: 50 }],
        changedTouches: [{ identifier: 5, clientX: 600, clientY: 50 }],
      }),
    );
    expect(store.get(visibleRangeAtom)).not.toEqual(range);
    window.dispatchEvent(
      Object.assign(new Event("touchend"), {
        touches: [],
        changedTouches: [{ identifier: 5, clientX: 600, clientY: 50 }],
      }),
    );

    const [start, end] = store.get(visibleRangeAtom)!;
    pinch(trackEl, [400, 600], [300, 700]);
    const [newStart, newEnd] = store.get(visibleRangeAtom)!;
    expect(newEnd - newStart).toBeCloseTo((end - start) / 2, 6);
    window.dispatchEvent(touches("touchend", [], [300, 700]));
  });

  it("stops zooming when the chart unmounts mid-pinch", () => {
    const trackEl = document.createElement("div");
    vi.spyOn(trackEl, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 0, TRACK_WIDTH_PX, 100),
    );
    const { result } = renderHook(() => useExplorableChart());
    const cleanUp = result.current.setUpExploreListeners(trackEl);
    trackEl.dispatchEvent(touches("touchstart", [400, 600]));
    const range = store.get(visibleRangeAtom)!;

    cleanUp();
    window.dispatchEvent(touches("touchmove", [300, 700]));
    expect(store.get(visibleRangeAtom)).toEqual(range);
  });

  it("ignores a third finger landing and lifting mid-pinch", () => {
    const trackEl = setUpTrack();
    document.body.appendChild(trackEl);
    pinch(trackEl, [400, 600], [300, 700]);
    const [start, end] = store.get(visibleRangeAtom)!;

    // a third finger lands first in the list, then lifts
    const third = (type: string, ids: number[], xs: number[]) =>
      Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
        touches: ids.map((identifier, i) => ({
          identifier,
          clientX: xs[i],
          clientY: 50,
        })),
        changedTouches: [{ identifier: 2, clientX: 900, clientY: 50 }],
      });
    trackEl.dispatchEvent(third("touchstart", [2, 0, 1], [900, 300, 700]));
    window.dispatchEvent(third("touchmove", [2, 0, 1], [900, 300, 700]));
    expect(store.get(visibleRangeAtom)).toEqual([start, end]);
    window.dispatchEvent(third("touchend", [0, 1], [300, 700]));
    window.dispatchEvent(touches("touchmove", [300, 700]));

    expect(store.get(visibleRangeAtom)).toEqual([start, end]);
    trackEl.dispatchEvent(
      new MouseEvent("mousedown", { clientX: 500, button: 0, buttons: 1 }),
    );
    window.dispatchEvent(
      new MouseEvent("mousemove", { clientX: 600, buttons: 1 }),
    );
    expect(store.get(visibleRangeAtom)).toEqual([start, end]);
  });

  it("starts a fresh pinch after a missed end, even with reused finger ids", () => {
    const trackEl = setUpTrack();
    pinch(trackEl, [400, 600], [300, 700]);

    // both fingers lifted unseen; a new pinch reuses ids 0 and 1
    const [start, end] = store.get(visibleRangeAtom)!;
    pinch(trackEl, [450, 550], [400, 600]);
    const [newStart, newEnd] = store.get(visibleRangeAtom)!;
    expect(newEnd - newStart).toBeCloseTo((end - start) / 2, 6);
  });

  it("pans after a missed pinch end, even when the finger reuses id 0", () => {
    const trackEl = setUpTrack();
    pinch(trackEl, [400, 600], [300, 700]);
    const range = store.get(visibleRangeAtom)!;

    trackEl.dispatchEvent(touches("touchstart", [500]));
    window.dispatchEvent(touches("touchmove", [600]));
    expect(store.get(visibleRangeAtom)).not.toEqual(range);
  });
});
