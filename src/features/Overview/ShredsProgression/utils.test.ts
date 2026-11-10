import { describe, it, expect } from "vitest";
import { createLabelsState, getLabelSlotAtX, type LabelsState } from "./utils";

// group 1000 spans 100-200 and group 1004 spans 200-300; bars are relative
// to their group, and slot 1003's bar overlaps 1004's at 190-200
function labels(): LabelsState {
  const state = createLabelsState();
  state.groups.set(1000, { transformX: 100, width: 100 });
  state.groups.set(1004, { transformX: 200, width: 100 });
  state.slots.set(1000, { transformX: 0, width: 20 });
  state.slots.set(1001, { transformX: 30, width: 20 });
  state.slots.set(1002, { transformX: 60, width: 20 });
  state.slots.set(1003, { transformX: 80, width: 20 });
  state.slots.set(1004, { transformX: 0, width: 25 });
  return state;
}

describe("getLabelSlotAtX", () => {
  it("returns the slot whose bar is under x", () => {
    expect(getLabelSlotAtX(labels(), 140)).toBe(1001);
    expect(getLabelSlotAtX(labels(), 210)).toBe(1004);
  });

  it("prefers the higher slot where bars overlap", () => {
    const state = labels();
    state.slots.set(1002, { transformX: 60, width: 30 });
    expect(getLabelSlotAtX(state, 185)).toBe(1003);
  });

  it("picks the nearest bar within the group under x", () => {
    // between 1000 (100-120) and 1001 (130-150), nearer 1001
    expect(getLabelSlotAtX(labels(), 127)).toBe(1001);
    // past group 1004's only bar, but still inside the group
    expect(getLabelSlotAtX(labels(), 290)).toBe(1004);
  });

  it("skips hidden bars", () => {
    const state = labels();
    state.slots.set(1001, { transformX: -100_000, width: 20 });
    expect(getLabelSlotAtX(state, 125)).toBe(1000);
  });

  it("uses the newest group where labels overlap", () => {
    const state = labels();
    // incomplete group 1000 extends across group 1004
    state.groups.set(1000, { transformX: 100, width: 100_000 });
    // inserted out of paint order
    const groups = new Map([...state.groups].reverse());
    expect(getLabelSlotAtX({ ...state, groups }, 210)).toBe(1004);
  });

  it("returns undefined outside every group", () => {
    expect(getLabelSlotAtX(labels(), 50)).toBeUndefined();
  });
});
