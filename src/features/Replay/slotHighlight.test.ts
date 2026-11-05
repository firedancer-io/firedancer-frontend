import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import { atom, getDefaultStore, type PrimitiveAtom } from "jotai";
import { renderHook } from "@testing-library/react";
import { startupTimeAtom } from "../../api/atoms";
import { smoothedNowNsAtom } from "../../nowAtoms";
import {
  clearHoverInfoAtom,
  clearSelectedSlotAtom,
  hoveredShredAtom,
  hoveredSlotAtom,
  returnToLiveAtom,
  selectedSlotAtom,
  selectSlotAtMsAtom,
  setHoverInfoAtom,
  visibleRangeAtom,
} from "./atoms";
import { addTimelineSlotsAtom } from "./HeaderTrack/nonAggAtoms";
import { CHART_NOW_DELAY_MS } from "./const";
import { isAggHeaderVisibleAtom } from "./HeaderTrack/aggAtoms";
import { useExplorableChart } from "./useExplorableChart";
import {
  createSlotHighlight,
  getGroupLevel,
  getRelativeSlot,
  getSlotFocus,
  NO_SLOT,
  slotHighlightGlsl,
  updateSlotHighlight,
  useDismissSelection,
  useSlotHighlightRender,
  useSlotHitTest,
} from "./slotHighlight";
import {
  getShredAtPosition,
  updateSlotMeshes,
} from "./ShredsTrack/nonAggUtils";
import { shredEventDescPriorities } from "../Shreds/const";
import type { NonAggRendererResources } from "./ShredsTrack/const";
import type { RectMesh } from "../WebGl/webglUtils";

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

function hoveredShred(slot: number) {
  return {
    slot,
    isFec: false,
    idx: 0,
    maxIdx: 0,
    shred: [],
    completeTs: undefined,
    skipped: false,
  };
}

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
    BigInt(400_000 + CHART_NOW_DELAY_MS) * nsPerMs,
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
  store.set(hoveredShredAtom, undefined);
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

  it("keeps the selected slot on top where it overlaps a later slot", () => {
    store.set(selectSlotAtMsAtom, 100_100);
    hover(100_700);
    expect(store.get(hoveredSlotAtom)).toBe(1003);
  });

  it("deselects on a click on the selected slot", () => {
    store.set(selectSlotAtMsAtom, 100_100);
    store.set(selectSlotAtMsAtom, 100_700);
    expect(store.get(selectedSlotAtom)).toBeUndefined();

    store.set(selectSlotAtMsAtom, 100_700);
    expect(store.get(selectedSlotAtom)).toBe(1004);
  });

  it("deselects on a click on the selected slot's drawn mark", () => {
    store.set(selectSlotAtMsAtom, 100_100, 1004);
    store.set(selectSlotAtMsAtom, 100_100, 1004);
    expect(store.get(selectedSlotAtom)).toBeUndefined();
  });

  it("clears on a click where there is no slot", () => {
    store.set(selectSlotAtMsAtom, 100_100);
    store.set(selectSlotAtMsAtom, 108_000);
    expect(store.get(selectedSlotAtom)).toBeUndefined();
  });

  it("keeps the selected slot's group on top, as the header draws it", () => {
    store.set(selectSlotAtMsAtom, 99_500);
    expect(store.get(selectedSlotAtom)).toBe(1002);

    // 1002 has ended; its group's 1003 is drawn above 1004 here
    hover(100_700);
    expect(store.get(hoveredSlotAtom)).toBe(1003);
    store.set(selectSlotAtMsAtom, 100_700);
    expect(store.get(selectedSlotAtom)).toBe(1003);
  });

  it("hides while the header aggregates and returns on zoom in", () => {
    store.set(selectSlotAtMsAtom, 100_100);

    store.set(isAggHeaderVisibleAtom, true);
    expect(store.get(selectedSlotAtom)).toBeUndefined();

    store.set(isAggHeaderVisibleAtom, false);
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

  const mouse = (type: string, clientX: number, clientY = 0) =>
    new MouseEvent(type, {
      bubbles: true,
      clientX,
      clientY,
      buttons: 1,
      button: 0,
    });

  function touch(type: string, clientX: number, clientY = 0) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    const touches = [{ identifier: 1, clientX, clientY }];
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

  it("clears the selection on a double click reset to live", () => {
    const { trackEl, tearDown } = setUpTrack();

    trackEl.dispatchEvent(mouse("mousedown", 1));
    window.dispatchEvent(mouse("mouseup", 1));
    expect(store.get(selectedSlotAtom)).toBe(1003);
    trackEl.dispatchEvent(mouse("dblclick", 1));
    store.set(visibleRangeAtom, visibleRange);
    expect(store.get(selectedSlotAtom)).toBeUndefined();

    tearDown();
  });

  // a shreds-like track: slot 1002's shred is drawn in the top-left corner
  function drawSlot1002Shred() {
    return renderHook(() =>
      useSlotHitTest((clientX, clientY) =>
        clientX < 5 && clientY < 50 ? 1002 : undefined,
      ),
    );
  }

  it("selects the slot drawn at a click, even if the hover hit-test lags", () => {
    const { trackEl, tearDown } = setUpTrack();
    const { unmount } = drawSlot1002Shred();
    // the throttled hover hit-test still reports the previous shred
    store.set(hoveredShredAtom, hoveredShred(1004));

    trackEl.dispatchEvent(mouse("mousedown", 1));
    window.dispatchEvent(mouse("mouseup", 1));
    expect(store.get(selectedSlotAtom)).toBe(1002);

    unmount();
    tearDown();
  });

  it("selects the slot drawn under a tap", () => {
    const { trackEl, tearDown } = setUpTrack();
    const { unmount } = drawSlot1002Shred();

    trackEl.dispatchEvent(touch("touchstart", 1, 10));
    window.dispatchEvent(touch("touchend", 1, 10));
    expect(store.get(selectedSlotAtom)).toBe(1002);

    // below the shred: the slot at the tap time
    trackEl.dispatchEvent(touch("touchstart", 1, 80));
    window.dispatchEvent(touch("touchend", 1, 80));
    expect(store.get(selectedSlotAtom)).toBe(1003);

    unmount();
    tearDown();
  });

  it("selects at the press point when the release lands a few px away", () => {
    const { trackEl, tearDown } = setUpTrack();
    const { unmount } = drawSlot1002Shred();

    trackEl.dispatchEvent(mouse("mousedown", 1, 10));
    window.dispatchEvent(mouse("mouseup", 7, 10));
    expect(store.get(selectedSlotAtom)).toBe(1002);

    unmount();
    tearDown();
  });

  it("selects the slot at the press time where no track draws a slot", () => {
    const { trackEl, tearDown } = setUpTrack();
    const { unmount } = drawSlot1002Shred();
    store.set(hoveredShredAtom, hoveredShred(1004));

    trackEl.dispatchEvent(mouse("mousedown", 150));
    window.dispatchEvent(mouse("mouseup", 150));
    expect(store.get(selectedSlotAtom)).toBe(1005);

    unmount();
    tearDown();
  });

  it("doesn't select on a vertical drag or swipe", () => {
    const { trackEl, tearDown } = setUpTrack();

    trackEl.dispatchEvent(mouse("mousedown", 1, 10));
    window.dispatchEvent(mouse("mousemove", 1, 160));
    window.dispatchEvent(mouse("mouseup", 1, 160));
    expect(store.get(selectedSlotAtom)).toBeUndefined();

    trackEl.dispatchEvent(touch("touchstart", 1, 10));
    window.dispatchEvent(touch("touchend", 1, 160));
    expect(store.get(selectedSlotAtom)).toBeUndefined();

    tearDown();
  });

  it("doesn't count two vertical swipes as a double tap", () => {
    const { trackEl, tearDown } = setUpTrack();

    for (let i = 0; i < 2; i++) {
      trackEl.dispatchEvent(touch("touchstart", 1, 10));
      window.dispatchEvent(touch("touchend", 1, 160));
    }
    expect(store.get(visibleRangeAtom)).toEqual(visibleRange);

    tearDown();
  });

  it("ignores another button's release during a left-button press", () => {
    const { trackEl, tearDown } = setUpTrack();

    trackEl.dispatchEvent(mouse("mousedown", 1));
    window.dispatchEvent(
      new MouseEvent("mouseup", { bubbles: true, clientX: 1, button: 2 }),
    );
    expect(store.get(selectedSlotAtom)).toBeUndefined();

    // the left-button drag still pans
    window.dispatchEvent(mouse("mousemove", 150));
    expect(store.get(visibleRangeAtom)).not.toEqual(visibleRange);
    window.dispatchEvent(mouse("mouseup", 150));

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
    expect(render).toHaveBeenCalled();
    render.mockClear();
    // same slot
    hover(100_200);
    expect(render).not.toHaveBeenCalled();
    store.set(selectSlotAtMsAtom, 101_000);
    expect(render).toHaveBeenCalled();
    render.mockClear();

    unmount();
    hover(101_500);
    expect(render).not.toHaveBeenCalled();
  });
});

describe("useDismissSelection", () => {
  let replay: HTMLDivElement;
  let unmount: () => void;

  beforeEach(() => {
    replay = document.createElement("div");
    document.body.appendChild(replay);
    const replayRef = { current: replay };
    ({ unmount } = renderHook(() => useDismissSelection(replayRef)));
    store.set(selectSlotAtMsAtom, 100_100);
  });

  afterEach(() => {
    unmount();
    document.body.replaceChildren();
  });

  const addToBody = (attribute: string, value = "") => {
    const layer = document.createElement("div");
    layer.setAttribute(attribute, value);
    const item = document.createElement("div");
    layer.appendChild(item);
    document.body.appendChild(layer);
    return item;
  };
  const pressEscape = (target: Element) =>
    target.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    );
  const mouseDown = (target: Element) =>
    target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  const touchStart = (target: Element) =>
    target.dispatchEvent(new Event("touchstart", { bubbles: true }));

  it("clears on Escape", () => {
    pressEscape(document.body);
    expect(store.get(selectedSlotAtom)).toBeUndefined();
  });

  it("clears on Escape while an always-open popover handles it", () => {
    // the minimap's permanent Radix popover marks every Escape as handled
    const popoverListener = (e: Event) => e.preventDefault();
    document.addEventListener("keydown", popoverListener, { capture: true });

    pressEscape(document.body);
    expect(store.get(selectedSlotAtom)).toBeUndefined();

    document.removeEventListener("keydown", popoverListener, {
      capture: true,
    });
  });

  it("leaves Escape to a menu that closes on it", () => {
    const option = addToBody("role", "listbox");
    // Radix removes the menu before the Escape reaches window
    const closeMenu = () => option.parentElement?.remove();
    document.addEventListener("keydown", closeMenu, { capture: true });

    pressEscape(option);
    expect(store.get(selectedSlotAtom)).toBe(1003);

    document.removeEventListener("keydown", closeMenu, { capture: true });
  });

  it("clears on a mouse press outside Replay", () => {
    mouseDown(document.body);
    expect(store.get(selectedSlotAtom)).toBeUndefined();
  });

  it("clears on a touch outside Replay", () => {
    touchStart(document.body);
    expect(store.get(selectedSlotAtom)).toBeUndefined();
  });

  it("keeps the selection on presses inside Replay", () => {
    const control = document.createElement("button");
    replay.appendChild(control);
    mouseDown(control);
    touchStart(control);
    expect(store.get(selectedSlotAtom)).toBe(1003);
  });

  it("keeps the selection on presses in popups and selects outside Replay", () => {
    for (const [attribute, value] of [
      ["data-radix-popper-content-wrapper", ""],
      ["role", "listbox"],
      ["data-replay-popup", ""],
    ]) {
      const item = addToBody(attribute, value);
      mouseDown(item);
      touchStart(item);
    }
    expect(store.get(selectedSlotAtom)).toBe(1003);
  });

  it("stops listening on unmount", () => {
    unmount();
    unmount = () => {};
    mouseDown(document.body);
    pressEscape(document.body);
    expect(store.get(selectedSlotAtom)).toBe(1003);
  });
});

describe("getShredAtPosition", () => {
  it("picks the shred drawn on top where slots overlap", () => {
    const shred: number[] = [];
    shred[shredEventDescPriorities[0]] = 0;
    const drawSlot = (slotNumber: number) => ({
      slotNumber,
      slot: { shreds: [shred], minEventTsDelta: 0, completionTsDelta: 100 },
      isFec: false,
      skipped: false,
    });
    const resources = {
      lastDrawInfo: {
        slots: [drawSlot(1003), drawSlot(1004)],
        incompleteRightEdges: new Map(),
      },
    } as unknown as NonAggRendererResources;

    expect(getShredAtPosition(50, -0.5, resources)?.slot).toBe(1004);
    store.set(hoveredShredAtom, hoveredShred(1003));
    expect(getShredAtPosition(50, -0.5, resources)?.slot).toBe(1004);
    store.set(selectSlotAtMsAtom, 100_100);
    expect(getShredAtPosition(50, -0.5, resources)?.slot).toBe(1003);
  });
});

describe("updateSlotMeshes", () => {
  function createMesh() {
    return {
      mesh: { renderOrder: 0, material: { uniforms: { uSlot: { value: 0 } } } },
    } as unknown as RectMesh;
  }

  function createResources(slots: number[]) {
    const meshes = new Map(
      slots.map((slot) => [`shred:${slot}`, createMesh()]),
    );
    const edgeMeshes = new Map(
      slots.map((slot) => [`shred:${slot}`, createMesh()]),
    );
    const highlight = createSlotHighlight();
    getRelativeSlot(highlight, 1000);
    return {
      meshes,
      edgeMeshes,
      highlight,
      highlightMesh: createMesh(),
    } as unknown as NonAggRendererResources;
  }

  const slotUniform = (slotMesh: RectMesh | undefined) =>
    (
      slotMesh?.mesh.material as unknown as {
        uniforms: { uSlot: { value: number } };
      }
    ).uniforms.uSlot.value;

  it("draws each mesh's slot, including a mesh reused for another slot", () => {
    const resources = createResources([1002, 1003]);
    updateSlotMeshes(resources);
    expect(slotUniform(resources.meshes.get("shred:1003"))).toBe(3);

    const reused = resources.meshes.get("shred:1002");
    resources.meshes.delete("shred:1002");
    if (reused) resources.meshes.set("shred:1005", reused);
    updateSlotMeshes(resources);
    expect(slotUniform(resources.meshes.get("shred:1005"))).toBe(5);
  });

  it("draws the selected slot on top, then bigger slots, each edge above its shreds", () => {
    const resources = createResources([1002, 1003, 1004, 1005]);
    store.set(selectSlotAtMsAtom, 100_100);
    hover(99_500);
    updateSlotMeshes(resources);

    const order = (key: string) => resources.meshes.get(key)?.mesh.renderOrder;
    const edgeOrder = (key: string) =>
      resources.edgeMeshes.get(key)?.mesh.renderOrder;
    const selected = order("shred:1003") ?? 0;
    expect(selected).toBeGreaterThan(order("shred:1005") ?? 0);
    expect(order("shred:1005")).toBeGreaterThan(order("shred:1004") ?? 0);
    // hovering doesn't raise a slot
    expect(order("shred:1004")).toBeGreaterThan(order("shred:1002") ?? 0);
    expect(edgeOrder("shred:1003")).toBe(selected + 0.5);
  });

  it("draws the hovered shred's highlight just above its slot's shreds", () => {
    const resources = createResources([1004, 1005]);
    store.set(hoveredShredAtom, hoveredShred(1005));
    updateSlotMeshes(resources);

    const slotOrder = resources.meshes.get("shred:1005")?.mesh.renderOrder ?? 0;
    expect(resources.highlightMesh.mesh.renderOrder).toBe(slotOrder + 0.5);
  });
});
