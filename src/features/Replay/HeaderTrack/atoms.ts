import { atom } from "jotai";
import type { AggGranularity, AggSlots } from "../../../api/types";
import { nsBucketSizes } from "../const";

export interface SlotCounts {
  start_slot: number | null;
  end_slot: number | null;
  skipped: number | null;
}

/**
 * Buckets start at idx 0 for 0n absolute ns ts
 */
type SlotsByBucketIdx = Map<number, SlotCounts>;
export type SlotBucketsByGranularity = Map<AggGranularity, SlotsByBucketIdx>;

export const [
  lastUpdateTsAtom,
  refreshLastUpdateTsAtom,
  aggSlotsAtom,
  addAggSlotsAtom,
  deleteAggSlotsBucketsAtom,
] = (function getAggSlotsAtom() {
  const _aggSlotsAtom = atom<SlotBucketsByGranularity>(new Map());
  const lastUpdateTsAtom = atom(performance.now());
  const refreshLastUpdateTsAtom = atom(null, (_get, set) =>
    set(lastUpdateTsAtom, performance.now()),
  );

  return [
    lastUpdateTsAtom,
    refreshLastUpdateTsAtom,
    atom((get) => get(_aggSlotsAtom)),
    atom(
      null,
      (
        _get,
        set,
        {
          granularity,
          reference_ts_ns,
          start_slot,
          end_slot,
          skipped,
        }: AggSlots,
      ) => {
        if (start_slot.length === 0) return;

        set(_aggSlotsAtom, (prev) => {
          const slotsByBucketIdx =
            prev.get(granularity) ?? new Map<number, SlotCounts>();

          const startBucketIdx = Number(
            reference_ts_ns / nsBucketSizes[granularity],
          );
          for (let i = 0; i < start_slot.length; i++) {
            const values = {
              start_slot: start_slot[i],
              end_slot: end_slot[i],
              skipped: skipped[i],
            };
            if (!Object.values(values).some((v) => !!v)) {
              continue;
            }

            const bucketIdx = startBucketIdx + i;
            slotsByBucketIdx.set(bucketIdx, values);
          }

          prev.set(granularity, slotsByBucketIdx);
          return prev;
        });
        set(refreshLastUpdateTsAtom);
      },
    ),
    atom(
      null,
      (_get, set, granularity: AggGranularity, bucketIdxs: number[]) => {
        set(_aggSlotsAtom, (prev) => {
          const slotsByBucketIdx = prev.get(granularity);
          if (!slotsByBucketIdx) return prev;

          for (const bucketIdx of bucketIdxs) {
            slotsByBucketIdx.delete(bucketIdx);
          }

          prev.set(granularity, slotsByBucketIdx);
          return prev;
        });
      },
    ),
  ];
})();
