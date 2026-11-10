import { describe, it, expect } from "vitest";
import { shredEventDescPriorities } from "../const";
import type { DrawableSlot } from "../chartUtils";
import { getShredAtPosition, type DrawInfo } from "./shredHover";

const shred: number[] = [];
shred[shredEventDescPriorities[0]] = 0;

function drawSlot(slotNumber: number, completionTsDelta = 100): DrawableSlot {
  return {
    slotNumber,
    slot: { shreds: [shred], minEventTsDelta: 0, completionTsDelta },
    isFec: false,
    skipped: false,
  };
}

function drawInfo(slots: DrawableSlot[]): DrawInfo {
  return { slots, incompleteRightEdges: new Map() };
}

const getKey = (d: DrawableSlot) => String(d.slotNumber);

describe("getShredAtPosition", () => {
  it("picks the higher slot where slots overlap, in any order", () => {
    const slots = [drawSlot(1004), drawSlot(1003), drawSlot(1005, 10)];
    expect(getShredAtPosition(50, -0.5, drawInfo(slots), getKey)?.slot).toBe(
      1004,
    );
  });

  it("follows a custom draw order", () => {
    const slots = [drawSlot(1003), drawSlot(1004)];
    const order = (slot: number) => (slot === 1003 ? 1e10 : slot);
    expect(
      getShredAtPosition(50, -0.5, drawInfo(slots), getKey, order)?.slot,
    ).toBe(1003);
  });

  it("misses past the right edge or outside the rows", () => {
    const info = drawInfo([drawSlot(1003)]);
    expect(getShredAtPosition(150, -0.5, info, getKey)).toBeUndefined();
    expect(getShredAtPosition(50, -1.5, info, getKey)).toBeUndefined();
  });

  it("copies the hovered shred's events", () => {
    const hovered = getShredAtPosition(
      50,
      -0.5,
      drawInfo([drawSlot(1003)]),
      getKey,
    );
    expect(hovered?.shred).toEqual(shred);
    expect(hovered?.shred).not.toBe(shred);
  });
});
