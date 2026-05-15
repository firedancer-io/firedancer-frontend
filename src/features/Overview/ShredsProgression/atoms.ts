import { atom } from "jotai";
import { slotsPerLeader } from "../../../consts";
import { getSlotGroupLeader } from "../../../utils";
import { startupFinalTurbineHeadAtom } from "../../StartupProgress/atoms";
import type { LiveShredsData } from "./types";

export const liveShredsDataAtom = atom<LiveShredsData>();

export const liveShredsPostStartupRangeAtom = atom((get) => {
  const range = get(liveShredsDataAtom)?.range;
  const startupFinalTurbineHead = get(startupFinalTurbineHeadAtom);
  if (!range || startupFinalTurbineHead == null) return;

  // no slots after final turbine head
  if (startupFinalTurbineHead + 1 > range.max) return;

  return {
    min: Math.max(startupFinalTurbineHead + 1, range.min),
    max: range.max,
  };
});

/**
 * leader slots after turbine head at the end of startup
 */
export const liveShredsPostStartupLeaderSlotsAtom = atom((get) => {
  const range = get(liveShredsPostStartupRangeAtom);
  const startupFinalTurbineHead = get(startupFinalTurbineHeadAtom);
  if (!range || startupFinalTurbineHead == null) return [];

  const min = Math.max(startupFinalTurbineHead + 1, range.min);

  const slots = [getSlotGroupLeader(min)];
  while (slots[slots.length - 1] + slotsPerLeader - 1 < range.max) {
    slots.push(getSlotGroupLeader(slots[slots.length - 1] + slotsPerLeader));
  }
  return slots;
});
