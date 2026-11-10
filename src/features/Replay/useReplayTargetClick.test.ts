import { describe, it, expect, vi, beforeEach } from "vitest";
import type { MouseEvent, PointerEvent } from "react";
import { atom } from "jotai";
import { renderHook } from "@testing-library/react";
import { useReplayTargetClick } from "./useReplayTargetClick";

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock("./atoms", () => ({
  navigateToReplaySlotAtom: atom(
    null,
    (_get, _set, slot: number, centerNs: bigint) => {
      navigate(slot, centerNs);
    },
  ),
}));

const target = { slot: 1003, centerNs: 5n };
const click = {} as MouseEvent;
const press = (pointerType: string) => ({ pointerType }) as PointerEvent;

function renderClick(
  getTarget = () => target as typeof target | undefined,
  // hovered slot at the press, then at the click
  ...hoveredSlots: (number | undefined)[]
) {
  const getHoveredSlot = vi.fn<() => number | undefined>();
  for (const slot of hoveredSlots) getHoveredSlot.mockReturnValueOnce(slot);
  return renderHook(() => useReplayTargetClick(getTarget, getHoveredSlot))
    .result.current;
}

describe("useReplayTargetClick", () => {
  beforeEach(() => navigate.mockClear());

  it("navigates on a mouse click", () => {
    const { onPointerDown, onClick } = renderClick();
    onPointerDown(press("mouse"));
    expect(onClick(click)).toBe(true);
    expect(navigate).toHaveBeenCalledWith(1003, 5n);
  });

  it("navigates on keyboard activation, which has no press", () => {
    expect(renderClick().onClick(click)).toBe(true);
  });

  it("cancels when there's no target", () => {
    const { onClick } = renderClick(() => undefined);
    expect(onClick(click)).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("only previews on the first tap", () => {
    const { onPointerDown, onClick } = renderClick(undefined, undefined, 1003);
    onPointerDown(press("touch"));
    expect(onClick(click)).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("navigates on a tap on the previewed slot", () => {
    const { onPointerDown, onClick } = renderClick(undefined, 1003, 1003);
    onPointerDown(press("touch"));
    expect(onClick(click)).toBe(true);
  });

  it("doesn't navigate after a drag, which leaves the hover cleared", () => {
    const { onPointerDown, onClick } = renderClick(undefined, 1003, undefined);
    onPointerDown(press("touch"));
    expect(onClick(click)).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("previews again on a tap on another slot", () => {
    const { onPointerDown, onClick } = renderClick(undefined, 1002, 1003);
    onPointerDown(press("pen"));
    expect(onClick(click)).toBe(false);
  });
});
