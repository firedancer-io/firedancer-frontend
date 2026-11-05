import { describe, it, expect, beforeEach, vi } from "vitest";
import { atom, createStore, type PrimitiveAtom } from "jotai";
import { startupTimeAtom } from "../../api/atoms";
import type * as NonAggAtoms from "./HeaderTrack/nonAggAtoms";
import type { SlotGroup, SlotInfo } from "./HeaderTrack/nonAggAtoms";

vi.mock("./HeaderTrack/nonAggAtoms", async (importOriginal) => {
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
  openOrUpdateOverlapAtom,
  selectPinnedSlotAtom,
  pinnedBackToListAtom,
  pinnedTooltipAtom,
  overlappingSlotsAtom,
  hoveredMsAtom,
  hoveredSlotAtom,
  setHoverInfoAtom,
  visibleRangeAtom,
} = await import("./atoms");
const { timelineSlotsAtom } = await import("./HeaderTrack/nonAggAtoms");

type Store = ReturnType<typeof createStore>;
let store: Store;

const clientPos = { x: 0, y: 0 };

function slot(slotNumber: number, startMs: number, endMs: number): SlotInfo {
  return {
    slot: slotNumber,
    startMs,
    endMs,
    isSkipped: false,
    isMine: false,
    shredCnt: null,
    txnFees: null,
    prioFees: null,
    tips: null,
  };
}

function seedSlots() {
  const slots = new Map<number, SlotInfo>([
    [100, slot(100, 1000, 2000)],
    [101, slot(101, 1000, 2000)],
    [102, slot(102, 4000, 5000)],
    [103, slot(103, 7000, 8000)],
    [104, slot(104, 7000, 8000)],
  ]);
  const group: SlotGroup = {
    leaderSlot: 100,
    slots,
    tileIdxs: new Set([0]),
  };
  store.set(timelineSlotsAtom as PrimitiveAtom<unknown>, {
    slotGroups: new Map([[100, group]]),
    tileSlotGroups: new Map([[0, new Set([100])]]),
  });
}

const TS_OVERLAP = 1500; // 2 slots overlap here
const TS_NO_OVERLAP = 4500; // only 1 slot here
const TS_OTHER_OVERLAP = 7500; // a different pair overlaps here

beforeEach(() => {
  store = createStore();
  // referenceNs = 0 so a slot's relative ms maps straight into the tile math
  store.set(startupTimeAtom, { startupTimeNanos: 0n });
  // No world clock set, so this pauses the range over tile 0
  store.set(visibleRangeAtom, [0, 10_000]);
  seedSlots();
});

describe("overlap tooltip re-entry gate", () => {
  it("opens the list where 2+ slots overlap", () => {
    store.set(openOrUpdateOverlapAtom, { ts: TS_OVERLAP, clientPos });
    expect(store.get(pinnedTooltipAtom)?.mode).toBe("list");
  });

  it("dismisses on a header move to a non-overlap ts (normal list behavior)", () => {
    store.set(openOrUpdateOverlapAtom, { ts: TS_OVERLAP, clientPos });
    store.set(openOrUpdateOverlapAtom, { ts: TS_NO_OVERLAP, clientPos });
    expect(store.get(pinnedTooltipAtom)).toBeUndefined();
  });

  it("stays open after returning from detail when the next header move is over a non-overlap ts", () => {
    // open list -> enter detail -> click "All" back to list
    store.set(openOrUpdateOverlapAtom, { ts: TS_OVERLAP, clientPos });
    store.set(selectPinnedSlotAtom, 100);
    expect(store.get(pinnedTooltipAtom)?.mode).toBe("detail");

    store.set(pinnedBackToListAtom);
    const pinned = store.get(pinnedTooltipAtom);
    expect(pinned?.mode).toBe("list");
    expect(pinned?.suppressLeaveUntilReentry).toBe(true);

    // header mousemove to a non-overlap ts: must NOT dismiss
    store.set(openOrUpdateOverlapAtom, { ts: TS_NO_OVERLAP, clientPos });
    expect(store.get(pinnedTooltipAtom)?.mode).toBe("list");
  });

  it("clears the gate on re-entry over an overlap ts, so a later leave dismisses", () => {
    store.set(openOrUpdateOverlapAtom, { ts: TS_OVERLAP, clientPos });
    store.set(selectPinnedSlotAtom, 100);
    store.set(pinnedBackToListAtom);

    // re-entry: cursor back over an overlap region clears the gate (the list is
    // rebuilt fresh, so the flag is no longer set)
    store.set(openOrUpdateOverlapAtom, { ts: TS_OVERLAP, clientPos });
    expect(store.get(pinnedTooltipAtom)?.suppressLeaveUntilReentry).toBeFalsy();

    // now a move to a non-overlap ts dismisses as normal
    store.set(openOrUpdateOverlapAtom, { ts: TS_NO_OVERLAP, clientPos });
    expect(store.get(pinnedTooltipAtom)).toBeUndefined();
  });
});

describe("overlap tooltip list", () => {
  it("follows the cursor to a different overlap", () => {
    store.set(openOrUpdateOverlapAtom, { ts: TS_OVERLAP, clientPos });
    store.set(openOrUpdateOverlapAtom, { ts: TS_OTHER_OVERLAP, clientPos });

    expect(store.get(pinnedTooltipAtom)?.anchorSlot).toBe(104);
    expect(store.get(overlappingSlotsAtom).map((s) => s.slot)).toEqual([
      103, 104,
    ]);
  });

  it("takes priority over the cursor in the hover atoms", () => {
    store.set(setHoverInfoAtom, {
      owner: "test",
      cursorMs: TS_NO_OVERLAP,
      clientPos,
    });
    store.set(openOrUpdateOverlapAtom, { ts: TS_OVERLAP, clientPos });

    expect(store.get(hoveredMsAtom)).toBe(TS_OVERLAP);
    expect(store.get(hoveredSlotAtom)).toBe(101);
  });
});

describe("overlap tooltip off screen", () => {
  it("hides the tooltip and its spotlight while its ts is off screen", () => {
    store.set(openOrUpdateOverlapAtom, { ts: TS_OVERLAP, clientPos });
    store.set(selectPinnedSlotAtom, 100);

    store.set(visibleRangeAtom, [3000, 10_000]);
    expect(store.get(pinnedTooltipAtom)).toBeUndefined();
    expect(store.get(hoveredSlotAtom)).not.toBe(100);

    // panning back shows the detail view again
    store.set(visibleRangeAtom, [0, 10_000]);
    expect(store.get(pinnedTooltipAtom)?.mode).toBe("detail");
    expect(store.get(hoveredSlotAtom)).toBe(100);
  });

  it("doesn't let a hidden detail view block a new list", () => {
    store.set(openOrUpdateOverlapAtom, { ts: TS_OVERLAP, clientPos });
    store.set(selectPinnedSlotAtom, 100);
    store.set(visibleRangeAtom, [3000, 10_000]);

    store.set(openOrUpdateOverlapAtom, { ts: TS_OTHER_OVERLAP, clientPos });
    expect(store.get(pinnedTooltipAtom)).toMatchObject({
      mode: "list",
      anchorSlot: 104,
    });
  });
});
