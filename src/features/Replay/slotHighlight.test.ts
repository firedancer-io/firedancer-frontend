import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { atom, getDefaultStore, type PrimitiveAtom } from "jotai";
import { renderHook } from "@testing-library/react";
import { startupTimeAtom } from "../../api/atoms";
import { smoothedNowNsAtom } from "../../nowAtoms";
import {
  clearHoverInfoAtom,
  clearSelectedSlotAtom,
  hoveredSlotAtom,
  returnToLiveAtom,
  selectedSlotAtom,
  selectSlotAtMsAtom,
  setHoverInfoAtom,
  visibleRangeAtom,
} from "./atoms";
import { addTimelineSlotsAtom } from "./HeaderTrack/nonAggAtoms";
import { CHART_NOW_DELAY_MS } from "./const";
import { HEADER_AGG_THRESHOLD_MS } from "./HeaderTrack/const";
import { useExplorableChart } from "./useExplorableChart";
import {
  createSlotHighlight,
  getGroupLevel,
  getRelativeSlot,
  getSlotFocus,
  NO_SLOT,
  slotHighlightGlsl,
  updateSlotHighlight,
  useSlotHighlightRender,
} from "./slotHighlight";

// Don't spread the original module: it imports ./atoms back, which would then
// bind the real smoothedNowNsAtom instead of this one
vi.mock("../../nowAtoms", () => ({
  smoothedNowNsAtom: atom<bigint | undefined>(undefined),
}));

const store = getDefaultStore();
const nsPerMs = 1_000_000n;
const owner = "test";

// leader 1000's last slot and leader 1004's first slot interleave in 100_600-100_800
const slotSpansMs: [slot: number, startMs: number, endMs: number][] = [
  [1002, 99_200, 100_000],
  [1003, 100_000, 100_800],
  [1004, 100_600, 101_400],
  [1005, 101_400, 102_200],
];
const visibleRange: [number, number] = [100_000, 110_000];

function hover(ms: number) {
  store.set(setHoverInfoAtom, {
    owner,
    cursorMs: ms,
    clientPos: { x: 0, y: 0 },
  });
}

beforeAll(() => {
  store.set(startupTimeAtom, { startupTimeNanos: 0n });
  store.set(
    smoothedNowNsAtom as PrimitiveAtom<bigint | undefined>,
    BigInt(200_000 + CHART_NOW_DELAY_MS) * nsPerMs,
  );
  store.set(addTimelineSlotsAtom, 10, {
    available_start_ns: null,
    available_end_ns: null,
    reference_slot: 1002,
    reference_ts: 0n,
    slot_delta: slotSpansMs.map(([slot]) => slot - 1002),
    start_ts_delta: slotSpansMs.map(([, startMs]) => BigInt(startMs) * nsPerMs),
    end_ts_delta: slotSpansMs.map(([, , endMs]) => BigInt(endMs) * nsPerMs),
    skipped: [],
    mine: [],
    shred_cnt: slotSpansMs.map(() => null),
    txn_fees: slotSpansMs.map(() => null),
    prio_fees: slotSpansMs.map(() => null),
    tips: slotSpansMs.map(() => null),
  });
});

beforeEach(() => {
  store.set(visibleRangeAtom, visibleRange);
  store.set(clearHoverInfoAtom, owner);
  store.set(clearSelectedSlotAtom);
});

describe("slot selection", () => {
  it("selects the later leader's slot where slots interleave", () => {
    hover(100_700);
    expect(store.get(hoveredSlotAtom)).toBe(1004);

    store.set(selectSlotAtMsAtom, 100_700);
    expect(store.get(selectedSlotAtom)).toBe(1004);

    store.set(selectSlotAtMsAtom, 100_100);
    expect(store.get(selectedSlotAtom)).toBe(1003);
  });

  it("clears on a click where there is no slot", () => {
    store.set(selectSlotAtMsAtom, 100_100);
    store.set(selectSlotAtMsAtom, 108_000);
    expect(store.get(selectedSlotAtom)).toBeUndefined();
  });

  it("hides while the header aggregates and returns on zoom in", () => {
    store.set(selectSlotAtMsAtom, 100_100);

    store.set(visibleRangeAtom, [0, HEADER_AGG_THRESHOLD_MS + 10_000]);
    expect(store.get(selectedSlotAtom)).toBeUndefined();

    store.set(visibleRangeAtom, visibleRange);
    expect(store.get(selectedSlotAtom)).toBe(1003);
  });

  it("clears when going live", () => {
    store.set(selectSlotAtMsAtom, 100_100);
    store.set(returnToLiveAtom);
    store.set(visibleRangeAtom, visibleRange);
    expect(store.get(selectedSlotAtom)).toBeUndefined();
  });
});

describe("updateSlotHighlight", () => {
  function update() {
    const highlight = createSlotHighlight();
    // a mark drawn before anything is hovered sets the reference
    getRelativeSlot(highlight, 1004);
    updateSlotHighlight(highlight, 1000);
    const { uniforms } = highlight;
    return {
      active: uniforms.uHighlightActive.value,
      focusSlot: uniforms.uFocusSlot.value,
      hoveredOtherSlot: uniforms.uHoveredOtherSlot.value,
      levels: uniforms.uLevels.value.toArray(),
      lifts: uniforms.uLifts.value.toArray(),
      focusRangePx: uniforms.uFocusRangePx.value.toArray(),
      hoveredOtherRangePx: uniforms.uHoveredOtherRangePx.value.toArray(),
    };
  }

  it("is inactive with nothing hovered or selected", () => {
    expect(update().active).toBe(0);
  });

  it("focuses the hovered slot relative to the track's reference slot", () => {
    hover(100_700);
    expect(update()).toMatchObject({
      active: 1,
      focusSlot: 0,
      hoveredOtherSlot: NO_SLOT,
      levels: [0.85, 0.65],
      lifts: [0.1, 0.2],
    });
  });

  it("keeps the selection in focus while another slot is hovered", () => {
    store.set(selectSlotAtMsAtom, 100_100);
    hover(101_500);
    expect(update()).toMatchObject({
      focusSlot: -1,
      hoveredOtherSlot: 1,
      levels: [0.75, 0.5],
      lifts: [0.14, 0.28],
    });

    hover(100_100);
    expect(update()).toMatchObject({
      hoveredOtherSlot: NO_SLOT,
      lifts: [0.18, 0.4],
    });
  });

  it("maps the focused slot and group to view px", () => {
    store.set(selectSlotAtMsAtom, 100_100);
    hover(101_500);
    // in the 1000px, 10s view: slot 1003 is 100_000-100_800, its group from
    // 99_200; hovered 1005 is 101_400-102_200, its group from 100_600
    expect(update()).toMatchObject({
      focusRangePx: [0, 80, -80, 80],
      hoveredOtherRangePx: [140, 220, 60, 220],
    });
  });
});

describe("getGroupLevel", () => {
  it("dims header cards of other leaders only", () => {
    const focus = getSlotFocus(1005, 1003);
    expect(getGroupLevel(1000, focus)).toBe(1);
    expect(getGroupLevel(1004, focus)).toBe(1);
    expect(getGroupLevel(1008, focus)).toBe(0.5);
    expect(getGroupLevel(1008, undefined)).toBe(1);
  });
});

describe("click to select", () => {
  // 1000px wide over the 10s view: 1px = 10ms
  function setUpTrack() {
    const { result, unmount } = renderHook(() => useExplorableChart());
    const trackEl = document.createElement("div");
    trackEl.getBoundingClientRect = () =>
      ({ left: 0, width: 1000, top: 0, height: 100 }) as DOMRect;
    document.body.appendChild(trackEl);
    const cleanUp = result.current.setUpExploreListeners(trackEl);
    return {
      trackEl,
      tearDown: () => {
        cleanUp();
        unmount();
        trackEl.remove();
      },
    };
  }

  const mouse = (type: string, clientX: number) =>
    new MouseEvent(type, { bubbles: true, clientX, buttons: 1, button: 0 });

  function touch(type: string, clientX: number) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    const touches = [{ identifier: 1, clientX, clientY: 0 }];
    return Object.assign(event, {
      touches: type === "touchend" ? [] : touches,
      changedTouches: touches,
    });
  }

  it("selects on a click, not on a drag", () => {
    const { trackEl, tearDown } = setUpTrack();

    trackEl.dispatchEvent(mouse("mousedown", 1));
    window.dispatchEvent(mouse("mouseup", 1));
    expect(store.get(selectedSlotAtom)).toBe(1003);

    // pressed over 1005, dragged past the pan threshold
    trackEl.dispatchEvent(mouse("mousedown", 150));
    window.dispatchEvent(mouse("mousemove", 250));
    window.dispatchEvent(mouse("mouseup", 250));
    expect(store.get(visibleRangeAtom)).not.toEqual(visibleRange);
    expect(store.get(selectedSlotAtom)).toBe(1003);

    tearDown();
  });

  it("selects on a tap", () => {
    const { trackEl, tearDown } = setUpTrack();

    trackEl.dispatchEvent(touch("touchstart", 150));
    window.dispatchEvent(touch("touchend", 150));
    expect(store.get(selectedSlotAtom)).toBe(1005);

    tearDown();
  });
});

describe("useSlotHighlightRender", () => {
  it("renders on hover and selection changes until unmounted", () => {
    const render = vi.fn();
    const { unmount } = renderHook(() => useSlotHighlightRender(render));

    hover(100_100);
    expect(render).toHaveBeenCalledTimes(1);
    // same slot
    hover(100_200);
    expect(render).toHaveBeenCalledTimes(1);
    store.set(selectSlotAtMsAtom, 101_000);
    expect(render).toHaveBeenCalledTimes(2);

    unmount();
    hover(101_500);
    expect(render).toHaveBeenCalledTimes(2);
  });
});

describe("slotHighlightGlsl", () => {
  // shaders inline these helpers; early returns and ternaries crash Adreno D3D11
  it("only returns at the end of each function", () => {
    const code = slotHighlightGlsl.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, "");
    const returns = code.match(/\breturn\b/g) ?? [];
    const finalReturns = code.match(/\breturn\b[^;]*;\n\}/g) ?? [];
    expect(finalReturns).toHaveLength(returns.length);
    expect(code).not.toContain("?");
  });
});
