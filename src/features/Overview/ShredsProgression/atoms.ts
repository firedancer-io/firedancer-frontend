import { atom } from "jotai";
import { getSlotGroupLeader } from "../../../utils";
import { slotCaughtUpAtom } from "../../../api/atoms";
import type { LiveShredsData } from "../../../api/worker/cache/shreds/types";

export const liveShredsDataAtom = atom<LiveShredsData>();

export const liveShredsPostStartupRangeAtom = atom((get) => {
  const range = get(liveShredsDataAtom)?.range;
  const slotCaughtUp = get(slotCaughtUpAtom);
  if (!range || slotCaughtUp == null) return;

  // no slots after startup
  if (slotCaughtUp + 1 > range.max) return;

  return {
    min: Math.max(slotCaughtUp + 1, range.min),
    max: range.max,
  };
});

/**
 *  leader slots after startup, used for labels
 * */
export const liveShredsPostStartupLeaderSlotsAtom = atom((get) => {
  const rangeAfterStartup = get(liveShredsPostStartupRangeAtom);
  if (!rangeAfterStartup) return;

  return {
    min: getSlotGroupLeader(rangeAfterStartup.min),
    max: getSlotGroupLeader(rangeAfterStartup.max),
  };
});
