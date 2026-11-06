import { describe, it, expect, beforeAll, vi } from "vitest";
import { getDefaultStore, type Atom } from "jotai";
import { serverTimeNanosAtom } from "./api/atoms";

const store = getDefaultStore();
const frames = new Map<number, FrameRequestCallback>();
let nextFrameId = 1;
let nowMs = 0;
let smoothedNowNsAtom: Atom<bigint | undefined>;

function runFrame(ms: number) {
  nowMs += ms;
  const pending = [...frames.values()];
  frames.clear();
  pending.forEach((cb) => cb(nowMs));
}

beforeAll(async () => {
  vi.spyOn(performance, "now").mockImplementation(() => nowMs);
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
    frames.set(nextFrameId, cb);
    return nextFrameId++;
  });
  store.set(serverTimeNanosAtom, 0n);
  ({ smoothedNowNsAtom } = await import("./nowAtoms"));
});

describe("smoothedNowNsAtom", () => {
  it("updates at most every 10ms, skipping frames in between", () => {
    const updates = vi.fn();
    const unsubscribe = store.sub(smoothedNowNsAtom, updates);

    // frames 8ms apart: updates at 8, 24, 40 since the last update
    for (let frame = 0; frame < 5; frame++) runFrame(8);
    expect(updates).toHaveBeenCalledTimes(3);
    unsubscribe();
  });

  it("keeps updating after a subscriber throws", () => {
    const rethrow = vi
      .spyOn(window, "setTimeout")
      .mockImplementation(() => 0 as unknown as ReturnType<typeof setTimeout>);
    const updates = vi.fn();
    let isFirstCall = true;
    const unsubscribeThrowing = store.sub(smoothedNowNsAtom, () => {
      if (isFirstCall) {
        isFirstCall = false;
        throw new Error("subscriber failed");
      }
    });
    const unsubscribe = store.sub(smoothedNowNsAtom, updates);

    runFrame(16);
    runFrame(16);
    expect(updates).toHaveBeenCalledTimes(2);
    unsubscribe();
    unsubscribeThrowing();
    rethrow.mockRestore();
  });
});
