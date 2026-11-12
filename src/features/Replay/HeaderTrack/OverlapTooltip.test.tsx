import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { atom, getDefaultStore, type PrimitiveAtom } from "jotai";
import { containerElAtom } from "../../../atoms";
import { markGestureSurface } from "../gestureUtils";
import type * as NonAggAtoms from "./nonAggAtoms";
import type { SlotGroup, SlotInfo } from "./nonAggAtoms";

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
  openOrUpdateOverlapAtom,
  pinnedBackToListAtom,
  pinnedTooltipAtom,
  selectPinnedSlotAtom,
  visibleRangeAtom,
} = await import("../atoms");
const { timelineSlotsAtom } = await import("./nonAggAtoms");
const { setStartupTimeAtom } = await import("../resetReplayState");
const { default: OverlapTooltip } = await import("./OverlapTooltip");

const store = getDefaultStore();
const TS_OVERLAP = 1500;
const clientPos = { x: 0, y: 0 };
let portalEl: HTMLDivElement;
let outsideEl: HTMLDivElement;

function slot(slotNumber: number): SlotInfo {
  return {
    slot: slotNumber,
    startMs: 1000,
    endMs: 2000,
    isSkipped: false,
    isMine: false,
    shredCnt: null,
    txnFees: null,
    prioFees: null,
    tips: null,
  };
}

// jsdom has no Touch constructor; the handler only reads these fields
function tap(target: Element) {
  const touch = { clientX: 5, clientY: 5, target } as unknown as Touch;
  act(() => {
    target.dispatchEvent(
      new TouchEvent("touchstart", {
        bubbles: true,
        cancelable: true,
        touches: [touch],
        changedTouches: [touch],
      }),
    );
  });
}

const tapOutside = () => tap(outsideEl);

function openDetail() {
  act(() => {
    store.set(openOrUpdateOverlapAtom, { ts: TS_OVERLAP, clientPos });
    store.set(selectPinnedSlotAtom, 100);
  });
}

beforeEach(() => {
  // jsdom has no ResizeObserver; the tooltip uses it to reposition
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  portalEl = document.createElement("div");
  outsideEl = document.createElement("div");
  document.body.append(portalEl, outsideEl);
  store.set(containerElAtom, portalEl);

  // referenceNs = 0 so a slot's relative ms maps straight into the tile math
  store.set(setStartupTimeAtom, 0n);
  store.set(visibleRangeAtom, [0, 10_000]);
  const slots = new Map([
    [100, slot(100)],
    [101, slot(101)],
  ]);
  store.set(timelineSlotsAtom as PrimitiveAtom<unknown>, {
    slotGroups: new Map([
      [100, { leaderSlot: 100, slots, tileIdxs: new Set([0]) }],
    ]),
    tileSlotGroups: new Map([[0, new Set([100])]]),
  });
  render(<OverlapTooltip />);
});

afterEach(() => {
  cleanup();
  store.set(dismissPinnedAtom);
  store.set(containerElAtom, null);
  portalEl.remove();
  outsideEl.remove();
  vi.unstubAllGlobals();
});

describe("OverlapTooltip", () => {
  it("closes the slot detail on a tap outside it", () => {
    openDetail();
    expect(store.get(pinnedTooltipAtom)?.mode).toBe("detail");

    tapOutside();

    expect(store.get(pinnedTooltipAtom)).toBeUndefined();
  });

  it("doesn't let the closing tap reach the chart", () => {
    const unmark = markGestureSurface(outsideEl);
    openDetail();
    const chartTouchStart = vi.fn();
    outsideEl.addEventListener("touchstart", chartTouchStart);

    tapOutside();

    expect(chartTouchStart).not.toHaveBeenCalled();
    unmark();
  });

  it("stays open on a tap inside it", () => {
    openDetail();
    const tooltipEl = portalEl.firstElementChild;
    if (!tooltipEl) throw new Error("tooltip not rendered");

    tap(tooltipEl);

    expect(store.get(pinnedTooltipAtom)?.mode).toBe("detail");
  });

  it("closes the list on a tap outside it and the header", () => {
    openDetail();
    act(() => {
      store.set(pinnedBackToListAtom);
    });

    tapOutside();

    expect(store.get(pinnedTooltipAtom)).toBeUndefined();
  });
});
