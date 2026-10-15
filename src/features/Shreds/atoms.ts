import { atom } from "jotai";
import { skippedClusterSlotsAtom } from "../../atoms";

export const minDirtySlotByChartAtom = atom<Map<string, number>>(new Map());

/*
 * Maps chartId to the minimum slot number that received a shred update since the last draw.
 * Reset each entry to Infinity after the chart consumes it (do not delete, so new updates can accumulate).
 */
export const setMinDirtySlotByChartIfSmaller = atom(
  null,
  (_get, set, updatedSlot: number) => {
    set(minDirtySlotByChartAtom, (prev) => {
      for (const [chartId, minDirtySlot] of prev) {
        if (updatedSlot < minDirtySlot) {
          prev.set(chartId, updatedSlot);
        }
      }
      return prev;
    });
  },
);

/**
 * Mark a slot as dirty if skipped state changed
 */
export const setDirtySlotOnSkippedChangeAtom = atom(
  null,
  (get, set, slot: number, isSkipped: boolean) => {
    const wasSkipped = get(skippedClusterSlotsAtom).has(slot);
    if (wasSkipped === isSkipped) return;

    set(setMinDirtySlotByChartIfSmaller, slot);
  },
);
