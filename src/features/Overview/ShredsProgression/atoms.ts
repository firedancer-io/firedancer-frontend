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

/*
 * Maps chartId to the minimum slot number that received a shred update since the last draw.
 * null means the chart is registered but has no pending dirty slots.
 * Reset each entry to null after the chart consumes it (do not delete, so new updates can accumulate).
 */
export const minDirtySlotByChartAtom = atom<
  Map<string, { slot: number; idx: number } | null>
>(new Map());

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
