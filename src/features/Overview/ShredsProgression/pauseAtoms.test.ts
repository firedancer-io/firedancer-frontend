import { describe, it, expect, vi, beforeEach } from "vitest";
import { atom, getDefaultStore } from "jotai";
import type { Slot, SlotRange, SlotsShreds } from "../../Shreds/types";
import { delayNs, xRangeMs } from "../../Shreds/const";
import { minDirtySlotByChartAtom } from "../../Shreds/atoms";
import { showStartupProgressAtom } from "../../StartupProgress/atoms";
import { smoothedNowNsAtom } from "../../../nowAtoms";
import { shredsAtoms, liveShredsPostStartupRangeAtom } from "./atoms";
import {
  getShredsState,
  isShredsPausedAtom,
  pauseShredsAtom,
  resumeShredsAtom,
} from "./pauseAtoms";

vi.mock("../../../nowAtoms", () => ({
  smoothedNowNsAtom: atom<bigint | undefined>(undefined),
}));
vi.mock("./atoms", () => ({
  shredsAtoms: {
    slotsShreds: atom<SlotsShreds | undefined>(undefined),
    range: atom<SlotRange | undefined>(undefined),
    minCompletedSlot: atom<number | undefined>(undefined),
  },
  liveShredsPostStartupRangeAtom: atom<SlotRange | undefined>(undefined),
  getLeaderSlotsRange: (range: SlotRange) => range,
}));

const store = getDefaultStore();
// delayed now is 100s; pauses keep history for the widest scale (1)
const nowMs = 100_000;
const visibleStart = nowMs - xRangeMs;

function slot(completionTsDelta?: number): Slot {
  const shred: number[] = [];
  shred[0] = visibleStart + 1;
  return { shreds: [shred], minEventTsDelta: visibleStart, completionTsDelta };
}

function setLiveState() {
  const slots = new Map([
    // completed before the visible range
    [998, slot(visibleStart - 20)],
    [999, slot(visibleStart - 10)],
    [1001, slot(visibleStart + 10)],
    // incomplete
    [1002, slot()],
  ]);
  store.set(shredsAtoms.slotsShreds as never, { referenceTs: 0n, slots });
  store.set(shredsAtoms.range as never, { min: 998, max: 1002 });
  store.set(shredsAtoms.minCompletedSlot as never, 1000);
  store.set(liveShredsPostStartupRangeAtom as never, { min: 1000, max: 1002 });
  store.set(smoothedNowNsAtom as never, BigInt(nowMs) * 1_000_000n + delayNs);
  return slots;
}

describe("pauseAtoms", () => {
  beforeEach(() => {
    store.set(resumeShredsAtom);
    store.set(showStartupProgressAtom, false);
    store.set(shredsAtoms.slotsShreds as never, undefined);
    store.set(smoothedNowNsAtom as never, undefined);
  });

  it("freezes a copy of the visible slots and the boundary slot", () => {
    const live = setLiveState();
    store.set(pauseShredsAtom);
    expect(store.get(isShredsPausedAtom)).toBe(true);

    const frozen = getShredsState(store.get)!.liveShreds.slots;
    expect([...frozen.keys()].sort((a, b) => a - b)).toEqual([999, 1001, 1002]);

    // live events merge in place, including late ones in the frozen range
    live.get(1001)!.shreds[0]![1] = visibleStart + 5;
    live.get(1002)!.completionTsDelta = nowMs;
    expect(frozen.get(1001)!.shreds[0]![1]).toBeUndefined();
    expect(frozen.get(1002)!.completionTsDelta).toBeUndefined();
  });

  it("waits for data, and a retry pauses once it arrives", () => {
    store.set(pauseShredsAtom);
    expect(store.get(isShredsPausedAtom)).toBe(false);

    setLiveState();
    store.set(pauseShredsAtom);
    expect(store.get(isShredsPausedAtom)).toBe(true);
  });

  it("keeps the first snapshot on a retry while paused", () => {
    setLiveState();
    store.set(pauseShredsAtom);
    const frozen = getShredsState(store.get);
    store.set(pauseShredsAtom);
    expect(getShredsState(store.get)).toBe(frozen);
  });

  it("redraws every slot on resume", () => {
    setLiveState();
    store.set(minDirtySlotByChartAtom, new Map([["chart", Infinity]]));
    store.set(pauseShredsAtom);
    store.set(resumeShredsAtom);

    expect(store.get(isShredsPausedAtom)).toBe(false);
    expect(store.get(minDirtySlotByChartAtom).get("chart")).toBe(-Infinity);
  });
});
