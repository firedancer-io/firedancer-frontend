import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { atom, createStore, type PrimitiveAtom } from "jotai";
import { startupTimeAtom } from "../../api/atoms";
import { smoothedNowNsAtom } from "../../nowAtoms";
import { onFrameUpdate } from "../../frameLoop";
import type * as FrameLoop from "../../frameLoop";
import {
  initializeVisibleRangeAtom,
  isLiveAtom,
  isPlayingAtom,
  pauseAtom,
  playbackRateAtom,
  returnToLiveAtom,
  setPlaybackRateAtom,
  togglePlaybackAtom,
  visibleRangeAtom,
} from "./atoms";
import { CHART_NOW_DELAY_MS, DEFAULT_WINDOW_MS } from "./const";

vi.mock("../../nowAtoms", () => ({
  smoothedNowNsAtom: atom<bigint | undefined>(undefined),
}));

vi.mock("../../frameLoop", async (importOriginal) => {
  const frameLoop = await importOriginal<typeof FrameLoop>();
  return {
    ...frameLoop,
    onFrameUpdate: vi.fn(
      (update: Parameters<typeof frameLoop.onFrameUpdate>[0]) =>
        vi.fn(frameLoop.onFrameUpdate(update)),
    ),
  };
});

type Store = ReturnType<typeof createStore>;

let store: Store;
let perfNow = 0;
// kept across tests: the frame loop's pending frame request outlives a test
const frames = new Map<number, FrameRequestCallback>();
let nextFrameId = 1;

const startedClocks = () => vi.mocked(onFrameUpdate).mock.results;

function runFrame(ms: number) {
  perfNow += ms;
  const pending = [...frames.values()];
  frames.clear();
  pending.forEach((cb) => cb(perfNow));
}

function setWorldEnd(ms: number) {
  store.set(
    smoothedNowNsAtom as PrimitiveAtom<bigint | undefined>,
    BigInt((ms + CHART_NOW_DELAY_MS) * 1_000_000),
  );
}

function range() {
  return store.get(visibleRangeAtom);
}

beforeEach(() => {
  perfNow = 0;
  vi.spyOn(performance, "now").mockImplementation(() => perfNow);
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
    frames.set(nextFrameId, cb);
    return nextFrameId++;
  });
  store = createStore();
  store.set(startupTimeAtom, { startupTimeNanos: 0n });
  setWorldEnd(100_000);
  store.set(initializeVisibleRangeAtom);
});

describe("replay playback", () => {
  it("starts live at world end", () => {
    expect(store.get(isLiveAtom)).toBe(true);
    expect(range()).toEqual([100_000 - DEFAULT_WINDOW_MS, 100_000]);
  });

  it("pausing from live freezes the window", () => {
    store.set(togglePlaybackAtom);
    setWorldEnd(105_000);
    expect(store.get(isLiveAtom)).toBe(false);
    expect(range()).toEqual([100_000 - DEFAULT_WINDOW_MS, 100_000]);
  });

  it("plays from the paused range on the local clock, not world time", () => {
    store.set(visibleRangeAtom, [10_000, 20_000]);
    store.set(togglePlaybackAtom);
    expect(store.get(isPlayingAtom)).toBe(true);

    setWorldEnd(200_000);
    runFrame(1_000);
    expect(range()).toEqual([11_000, 21_000]);
  });

  it("applies the playback rate", () => {
    store.set(visibleRangeAtom, [10_000, 20_000]);
    store.set(setPlaybackRateAtom, 0.5);
    store.set(togglePlaybackAtom);
    runFrame(1_000);
    expect(range()).toEqual([10_500, 20_500]);
  });

  it("changing rate mid-play restarts from the current position", () => {
    store.set(visibleRangeAtom, [10_000, 20_000]);
    store.set(togglePlaybackAtom);
    runFrame(1_000);
    store.set(setPlaybackRateAtom, 2);
    runFrame(1_000);
    expect(range()).toEqual([13_000, 23_000]);
  });

  it("pausing while playing freezes at the current position", () => {
    store.set(visibleRangeAtom, [10_000, 20_000]);
    store.set(togglePlaybackAtom);
    runFrame(1_000);
    store.set(togglePlaybackAtom);
    runFrame(1_000);
    expect(store.get(isPlayingAtom)).toBe(false);
    expect(range()).toEqual([11_000, 21_000]);
  });

  it("pan while playing pauses at the new range", () => {
    store.set(visibleRangeAtom, [10_000, 20_000]);
    store.set(togglePlaybackAtom);
    store.set(visibleRangeAtom, [30_000, 40_000]);
    runFrame(1_000);
    expect(store.get(isPlayingAtom)).toBe(false);
    expect(range()).toEqual([30_000, 40_000]);
  });

  it("clock runs every frame while playing and stops when paused", () => {
    store.set(visibleRangeAtom, [10_000, 20_000]);
    store.set(togglePlaybackAtom);

    runFrame(500);
    runFrame(500);
    expect(range()).toEqual([11_000, 21_000]);

    store.set(pauseAtom);
    runFrame(500);
    expect(frames.size).toBe(0);
    expect(range()).toEqual([11_000, 21_000]);
  });

  it("restarting playback doesn't leave a second clock running", () => {
    store.set(visibleRangeAtom, [10_000, 20_000]);
    store.set(togglePlaybackAtom);
    const firstClock = startedClocks().at(-1)?.value as Mock;
    store.set(setPlaybackRateAtom, 2);
    const secondClock = startedClocks().at(-1)?.value as Mock;

    expect(firstClock).toHaveBeenCalled();
    expect(secondClock).not.toHaveBeenCalled();
  });

  it("keeps playing after a range subscriber throws", () => {
    const rethrow = vi
      .spyOn(window, "setTimeout")
      .mockImplementation(() => 0 as unknown as ReturnType<typeof setTimeout>);
    store.set(visibleRangeAtom, [10_000, 20_000]);
    store.set(togglePlaybackAtom);
    let isFirstCall = true;
    const unsubscribe = store.sub(visibleRangeAtom, () => {
      if (isFirstCall) {
        isFirstCall = false;
        throw new Error("track failed");
      }
    });

    runFrame(500);
    runFrame(500);
    expect(range()).toEqual([11_000, 21_000]);
    unsubscribe();
    rethrow.mockRestore();
  });

  it("returning to live keeps the window size and resets rate", () => {
    store.set(visibleRangeAtom, [10_000, 15_000]);
    store.set(setPlaybackRateAtom, 2);
    store.set(togglePlaybackAtom);
    runFrame(1_000);

    store.set(returnToLiveAtom);
    expect(store.get(isLiveAtom)).toBe(true);
    expect(store.get(playbackRateAtom)).toBe(1);
    expect(range()).toEqual([95_000, 100_000]);
  });

  it("pauseAtom pauses but never resumes", () => {
    store.set(visibleRangeAtom, [10_000, 20_000]);
    store.set(pauseAtom);
    expect(store.get(isPlayingAtom)).toBe(false);
    expect(range()).toEqual([10_000, 20_000]);
  });

  it("catching up to world end goes live and resets rate", () => {
    store.set(visibleRangeAtom, [80_000, 90_000]);
    store.set(setPlaybackRateAtom, 4);
    store.set(togglePlaybackAtom);
    runFrame(1_250);
    expect(range()).toEqual([85_000, 95_000]);
    runFrame(1_500);
    expect(store.get(isLiveAtom)).toBe(true);
    expect(store.get(playbackRateAtom)).toBe(1);
    expect(range()).toEqual([90_000, 100_000]);
  });

  it("catching up never publishes a range past world end", () => {
    store.set(visibleRangeAtom, [80_000, 90_000]);
    store.set(setPlaybackRateAtom, 4);
    store.set(togglePlaybackAtom);
    const published: number[] = [];
    store.sub(visibleRangeAtom, () => published.push(range()![1]));

    runFrame(1_250);
    runFrame(5_000);
    expect(store.get(isLiveAtom)).toBe(true);
    expect(Math.max(...published)).toBeLessThanOrEqual(100_000);
  });

  it("slow playback from live survives frames without a world time update", () => {
    store.set(setPlaybackRateAtom, 0.25);
    runFrame(8);
    runFrame(8);
    expect(store.get(isPlayingAtom)).toBe(true);
    expect(store.get(playbackRateAtom)).toBe(0.25);
    expect(range()![1]).toBeLessThanOrEqual(100_000);
  });

  it("1x playback waits at a stalled world end, then continues", () => {
    store.set(visibleRangeAtom, [80_000, 90_000]);
    store.set(togglePlaybackAtom);

    runFrame(15_000);
    expect(store.get(isPlayingAtom)).toBe(true);
    expect(range()).toEqual([90_000, 100_000]);

    setWorldEnd(120_000);
    runFrame(1_000);
    expect(range()).toEqual([96_000, 106_000]);
  });

  it("world time ticks don't notify the visible range while playing", () => {
    store.set(visibleRangeAtom, [10_000, 20_000]);
    store.set(togglePlaybackAtom);
    const onChange = vi.fn();
    store.sub(visibleRangeAtom, onChange);
    onChange.mockClear();

    setWorldEnd(100_100);
    setWorldEnd(100_200);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("zooming in from live pauses at the zoomed range", () => {
    store.set(visibleRangeAtom, [92_000, 99_900]);
    setWorldEnd(101_000);
    expect(store.get(isLiveAtom)).toBe(false);
    expect(range()).toEqual([92_000, 99_900]);
  });

  it("zooming out to world end resumes live", () => {
    store.set(visibleRangeAtom, [90_000, 99_000]);
    store.set(visibleRangeAtom, [85_000, 100_000]);
    expect(store.get(isLiveAtom)).toBe(true);
  });

  it("moving the left edge while live stays live", () => {
    store.set(visibleRangeAtom, [95_000, 100_000]);
    expect(store.get(isLiveAtom)).toBe(true);
    expect(range()).toEqual([95_000, 100_000]);
  });

  it("slowing down while live drops behind, speeding up is ignored", () => {
    store.set(setPlaybackRateAtom, 2);
    expect(store.get(isLiveAtom)).toBe(true);
    expect(store.get(playbackRateAtom)).toBe(1);

    store.set(setPlaybackRateAtom, 0.5);
    expect(store.get(isPlayingAtom)).toBe(true);
    setWorldEnd(101_000);
    runFrame(1_000);
    expect(range()).toEqual([100_500 - DEFAULT_WINDOW_MS, 100_500]);
  });
});
