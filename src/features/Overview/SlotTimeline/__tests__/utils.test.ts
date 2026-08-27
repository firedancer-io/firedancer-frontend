import { describe, expect, it } from "vitest";
import type { SlotTimelineValues } from "../types";
import {
  getCurrentSlotRange,
  getFutureSlotCellCount,
  getSlotLanes,
  maxCurrentSlotCount,
  maxFutureSlotCellCount,
  minCurrentSlotCount,
  shouldShowNextLeaderColumn,
} from "../utils";

const baseValues = {
  nextLeaderSlot: 140,
  turbineSlot: 101,
  repairSlot: 100,
  replaySlot: 100,
  voteSlot: 99,
  optimisticallyConfirmedSlot: 98,
  rootSlot: 70,
  finalizedSlot: 95,
  storageSlot: 69,
} satisfies Omit<SlotTimelineValues, "isAlpenglow">;

describe("getSlotLanes", () => {
  it("builds the Tower lanes in display order", () => {
    const lanes = getSlotLanes({ ...baseValues, isAlpenglow: false });

    expect(lanes.map(({ label }) => label)).toEqual([
      "Next Leader",
      "Turbine",
      "Repair",
      "Processed",
      "Voted",
      "Confirmed",
      "Root",
      "Storage",
    ]);
    expect(lanes.find(({ label }) => label === "Confirmed")?.slot).toBe(98);
  });

  it("builds Alpenglow lanes without a notarized lane", () => {
    const lanes = getSlotLanes({ ...baseValues, isAlpenglow: true });

    expect(lanes.map(({ label }) => label)).toEqual([
      "Next Leader",
      "Rotor",
      "Repair",
      "Replayed",
      "Confirmed",
      "Finalized",
      "Storage",
    ]);
    expect(lanes.find(({ label }) => label === "Confirmed")?.slot).toBe(99);
    expect(lanes.find(({ label }) => label === "Finalized")?.slot).toBe(95);
  });

  it("omits lanes whose slot is unavailable", () => {
    const lanes = getSlotLanes({
      ...baseValues,
      isAlpenglow: true,
      nextLeaderSlot: undefined,
      repairSlot: null,
      voteSlot: null,
    });

    expect(lanes.map(({ label }) => label)).toEqual([
      "Next Leader",
      "Rotor",
      "Replayed",
      "Finalized",
      "Storage",
    ]);
  });

  it("keeps the next leader lane with a null slot when we never lead", () => {
    const lanes = getSlotLanes({
      ...baseValues,
      isAlpenglow: true,
      nextLeaderSlot: undefined,
    });

    expect(lanes.find(({ id }) => id === "nextLeader")?.slot).toBeNull();
  });

  it("keeps the next leader slot when there is one", () => {
    const lanes = getSlotLanes({
      ...baseValues,
      isAlpenglow: true,
      nextLeaderSlot: 140,
    });

    expect(lanes.find(({ id }) => id === "nextLeader")?.slot).toBe(140);
  });
});

describe("getCurrentSlotRange", () => {
  it("pads a short range to the minimum slot count", () => {
    const lanes = getSlotLanes({
      isAlpenglow: true,
      replaySlot: 100,
    });
    const range = getCurrentSlotRange(lanes, 100);

    expect(range.slots).toHaveLength(minCurrentSlotCount);
    expect(range.minSlot).toBe(88);
    expect(range.maxSlot).toBe(100);
  });

  it("includes recent slots ahead of replay", () => {
    const lanes = getSlotLanes({
      isAlpenglow: true,
      replaySlot: 100,
      turbineSlot: 102,
    });
    const range = getCurrentSlotRange(lanes, 100);

    expect(range.slots).toHaveLength(minCurrentSlotCount);
    expect(range.minSlot).toBe(90);
    expect(range.maxSlot).toBe(102);
  });

  it("caps exceptionally large ranges", () => {
    const lanes = getSlotLanes({
      isAlpenglow: true,
      replaySlot: 100,
      storageSlot: 1,
    });
    const range = getCurrentSlotRange(lanes, 100);

    expect(range.slots).toHaveLength(maxCurrentSlotCount);
    expect(range.minSlot).toBe(53);
    expect(range.maxSlot).toBe(100);
  });
});

describe("getFutureSlotCellCount", () => {
  it("counts only slots between the current range and next leader", () => {
    expect(getFutureSlotCellCount(100, 105)).toBe(4);
    expect(getFutureSlotCellCount(100, 101)).toBe(0);
  });

  it("caps distant leaders and handles missing data", () => {
    expect(getFutureSlotCellCount(100, 1_000)).toBe(maxFutureSlotCellCount);
    expect(getFutureSlotCellCount(100, undefined)).toBe(0);
  });
});

describe("shouldShowNextLeaderColumn", () => {
  /* The column is what tells an unstaked validator it will never lead,
     so a null slot has to keep it rather than drop it. */

  it("keeps the column when we will never lead", () => {
    expect(shouldShowNextLeaderColumn(null, 100)).toBe(true);
  });

  it("keeps the column when the next leader slot is ahead of the range", () => {
    expect(shouldShowNextLeaderColumn(140, 100)).toBe(true);
  });

  it("drops the column when the slot is already inside the range", () => {
    expect(shouldShowNextLeaderColumn(100, 100)).toBe(false);
    expect(shouldShowNextLeaderColumn(80, 100)).toBe(false);
  });
});
