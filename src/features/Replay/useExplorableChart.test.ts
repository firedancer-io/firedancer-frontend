import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { atom, getDefaultStore, type PrimitiveAtom } from "jotai";
import { smoothedNowNsAtom } from "../../nowAtoms";
import {
  initializeVisibleRangeAtom,
  isLiveAtom,
  isPlayingAtom,
  resetToLiveAtom,
  togglePlaybackAtom,
  visibleRangeAtom,
  worldRangeAtom,
} from "./atoms";
import { CHART_NOW_DELAY_MS, DEFAULT_WINDOW_MS, MIN_VISIBLE_MS } from "./const";
import { useExplorableChart } from "./useExplorableChart";
import { setStartupTimeAtom } from "./resetReplayState";
import chartStyles from "./chart.module.css";

vi.mock("../../nowAtoms", () => ({
  smoothedNowNsAtom: atom<bigint | undefined>(undefined),
}));

const store = getDefaultStore();
const TRACK_WIDTH_PX = 1_000;

let perfNow = 0;
// kept across tests: the frame loop's pending frame request outlives a test
const frames = new Map<number, FrameRequestCallback>();
let nextFrameId = 1;

function runFrame(ms: number) {
  perfNow += ms;
  const pending = [...frames.values()];
  frames.clear();
  pending.forEach((cb) => cb(perfNow));
}
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
  perfNow = 0;
  vi.spyOn(performance, "now").mockImplementation(() => perfNow);
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
    frames.set(nextFrameId, cb);
    return nextFrameId++;
  });
  store.set(setStartupTimeAtom, 0n);
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

  it("zooming while playing keeps playing, anchored on the cursor", () => {
    const trackEl = setUpTrack();
    store.set(visibleRangeAtom, [50_000, 60_000]);
    store.set(togglePlaybackAtom);
    const cursorX = 500;
    const cursorTs = tsAtClientX(cursorX);

    wheel(trackEl, cursorX, -100);

    expect(store.get(isPlayingAtom)).toBe(true);
    expect(tsAtClientX(cursorX)).toBeCloseTo(cursorTs, 6);
    const [start, end] = store.get(visibleRangeAtom)!;
    expect(end - start).toBeLessThan(10_000);
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

  it("pinching while playing keeps playing and follows playback", () => {
    const trackEl = setUpTrack();
    store.set(visibleRangeAtom, [50_000, 60_000]);
    store.set(togglePlaybackAtom);

    pinch(trackEl, [400, 600], [300, 700]);
    expect(store.get(isPlayingAtom)).toBe(true);
    expect(store.get(visibleRangeAtom)).toEqual([52_500, 57_500]);

    // playback advances 1s between moves: the same fingers follow it
    runFrame(1_000);
    expect(store.get(visibleRangeAtom)).toEqual([53_500, 58_500]);
    window.dispatchEvent(touches("touchmove", [300, 700]));
    expect(store.get(visibleRangeAtom)).toEqual([53_500, 58_500]);
  });

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

describe("mini map gestures", () => {
  function setUpMiniMap() {
    const trackEl = document.createElement("div");
    const visibleRangeEl = document.createElement("div");
    const leftHandleEl = document.createElement("div");
    const rightHandleEl = document.createElement("div");
    const pinEl = document.createElement("div");
    pinEl.className = chartStyles.noChartExplore;
    visibleRangeEl.append(leftHandleEl, rightHandleEl);
    trackEl.append(visibleRangeEl, pinEl);
    document.body.appendChild(trackEl);
    vi.spyOn(trackEl, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 0, TRACK_WIDTH_PX, 100),
    );
    const { result } = renderHook(() => useExplorableChart());
    cleanUps.push(
      result.current.setUpMiniMap(
        trackEl,
        visibleRangeEl,
        leftHandleEl,
        rightHandleEl,
      ),
      () => trackEl.remove(),
    );
    return { trackEl, visibleRangeEl, leftHandleEl, rightHandleEl, pinEl };
  }

  function worldTsAt(clientX: number) {
    const [start, end] = store.get(worldRangeAtom)!;
    return start + (clientX / TRACK_WIDTH_PX) * (end - start);
  }

  function worldPxPerMs() {
    const [start, end] = store.get(worldRangeAtom)!;
    return TRACK_WIDTH_PX / (end - start);
  }

  const center = () => {
    const [start, end] = store.get(visibleRangeAtom)!;
    return (start + end) / 2;
  };

  function mouse(el: EventTarget, type: string, clientX: number, button = 0) {
    el.dispatchEvent(
      new MouseEvent(type, {
        clientX,
        clientY: 50,
        button,
        buttons: type === "mouseup" ? 0 : 1,
        bubbles: true,
        cancelable: true,
      }),
    );
  }

  function touch(el: EventTarget, type: string, clientX: number) {
    const touches = [{ identifier: 0, clientX, clientY: 50 }];
    el.dispatchEvent(
      Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
        touches: type === "touchend" ? [] : touches,
        changedTouches: touches,
      }),
    );
  }

  // a second finger landing while the first is down at firstX
  function secondTouchStart(el: EventTarget, firstX: number, clientX: number) {
    const second = { identifier: 1, clientX, clientY: 50 };
    el.dispatchEvent(
      Object.assign(
        new Event("touchstart", { bubbles: true, cancelable: true }),
        {
          touches: [{ identifier: 0, clientX: firstX, clientY: 50 }, second],
          changedTouches: [second],
        },
      ),
    );
  }

  // put the visible range in the middle of the world, away from clamping
  beforeEach(() => {
    const mid = worldTsAt(500);
    store.set(visibleRangeAtom, [mid - 1_000, mid + 1_000]);
  });

  it("pressing the track pans to the press point immediately", () => {
    const { trackEl } = setUpMiniMap();
    mouse(trackEl, "mousedown", 200);
    expect(store.get(isLiveAtom)).toBe(false);
    expect(center()).toBeCloseTo(worldTsAt(200), 6);
    mouse(window, "mouseup", 200);
    expect(center()).toBeCloseTo(worldTsAt(200), 6);
  });

  it("dragging after pressing the track drags the visible range", () => {
    const { trackEl } = setUpMiniMap();
    mouse(trackEl, "mousedown", 200);
    mouse(window, "mousemove", 300);
    expect(center()).toBeCloseTo(worldTsAt(300), 6);
    mouse(window, "mouseup", 300);
    // released: further moves do nothing
    mouse(window, "mousemove", 400);
    expect(center()).toBeCloseTo(worldTsAt(300), 6);
  });

  it("a right-button press mid-drag doesn't recenter on the drag's press point", () => {
    const { trackEl } = setUpMiniMap();
    mouse(trackEl, "mousedown", 200);
    mouse(window, "mousemove", 300);
    mouse(trackEl, "mousedown", 700, 2);
    expect(center()).toBeCloseTo(worldTsAt(300), 6);
    mouse(window, "mouseup", 300);
  });

  it("pressing the visible range bar drags it without jumping", () => {
    const { visibleRangeEl } = setUpMiniMap();
    const startCenter = center();
    mouse(visibleRangeEl, "mousedown", 510);
    expect(center()).toBe(startCenter);
    mouse(window, "mousemove", 560);
    expect(center()).toBeCloseTo(startCenter + 50 / worldPxPerMs(), 6);
    mouse(window, "mouseup", 560);
  });

  it("resizes from the handles without panning", () => {
    const { leftHandleEl, rightHandleEl } = setUpMiniMap();
    const [, end] = store.get(visibleRangeAtom)!;
    mouse(leftHandleEl, "mousedown", 499);
    expect(store.get(visibleRangeAtom)![1]).toBe(end);
    mouse(window, "mousemove", 400);
    expect(store.get(visibleRangeAtom)![0]).toBeCloseTo(worldTsAt(400), 6);
    expect(store.get(visibleRangeAtom)![1]).toBe(end);
    mouse(window, "mouseup", 400);

    const [start] = store.get(visibleRangeAtom)!;
    mouse(rightHandleEl, "mousedown", 501);
    mouse(window, "mousemove", 600);
    expect(store.get(visibleRangeAtom)).toEqual([
      start,
      expect.closeTo(worldTsAt(600), 6),
    ]);
    mouse(window, "mouseup", 600);
  });

  it("ignores presses on excluded elements like event pins", () => {
    const { pinEl } = setUpMiniMap();
    const range = store.get(visibleRangeAtom);
    mouse(pinEl, "mousedown", 200);
    mouse(window, "mousemove", 300);
    expect(store.get(visibleRangeAtom)).toEqual(range);
  });

  it("touch: pressing the track pans, then dragging drags the range", () => {
    const { trackEl } = setUpMiniMap();
    touch(trackEl, "touchstart", 200);
    expect(center()).toBeCloseTo(worldTsAt(200), 6);
    touch(window, "touchmove", 300);
    expect(center()).toBeCloseTo(worldTsAt(300), 6);
    touch(window, "touchend", 300);
    touch(window, "touchmove", 400);
    expect(center()).toBeCloseTo(worldTsAt(300), 6);
  });

  it("touch: a second finger mid-drag doesn't recenter on the drag's press point", () => {
    const { trackEl } = setUpMiniMap();
    touch(trackEl, "touchstart", 200);
    touch(window, "touchmove", 300);
    secondTouchStart(trackEl, 300, 700);
    expect(center()).toBeCloseTo(worldTsAt(300), 6);
    touch(window, "touchend", 300);
  });

  it("touch: dragging the visible range bar doesn't jump", () => {
    const { visibleRangeEl } = setUpMiniMap();
    const startCenter = center();
    touch(visibleRangeEl, "touchstart", 510);
    expect(center()).toBe(startCenter);
    touch(window, "touchmove", 560);
    expect(center()).toBeCloseTo(startCenter + 50 / worldPxPerMs(), 6);
    touch(window, "touchend", 560);
  });

  it("touch: resizes from the handles", () => {
    const { rightHandleEl } = setUpMiniMap();
    const [start] = store.get(visibleRangeAtom)!;
    touch(rightHandleEl, "touchstart", 501);
    expect(store.get(visibleRangeAtom)![0]).toBe(start);
    touch(window, "touchmove", 600);
    expect(store.get(visibleRangeAtom)).toEqual([
      start,
      expect.closeTo(worldTsAt(600), 6),
    ]);
    touch(window, "touchend", 600);
  });
});
