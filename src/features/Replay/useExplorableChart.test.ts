import { describe, it, expect, beforeEach, vi } from "vitest";
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
import { CHART_NOW_DELAY_MS, DEFAULT_WINDOW_MS } from "./const";
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
  result.current.setUpExploreListeners(trackEl);
  return trackEl;
}

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

  it("zooming out from live stays live", () => {
    const trackEl = setUpTrack();
    wheel(trackEl, 500, 100);

    expect(store.get(isLiveAtom)).toBe(true);
    const [start, end] = store.get(visibleRangeAtom)!;
    expect(end).toBe(WORLD_END_MS);
    expect(end - start).toBeGreaterThan(DEFAULT_WINDOW_MS);
  });
});
