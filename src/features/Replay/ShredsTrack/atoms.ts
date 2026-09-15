import { atom } from "jotai";
import type { AggGranularity, AggShreds } from "../../../api/types";
import { nsBucketSizes } from "../const";
import type { AggShredEventType } from "../../../api/entities";

export type ShredEventCounts = Record<AggShredEventType, number | null>;

/**
 * Buckets start at idx 0 for 0n absolute ns ts
 */
type EventsByBucketIdx = Map<number, ShredEventCounts>;
export type ShredBucketsByGranularity = Map<AggGranularity, EventsByBucketIdx>;

export const [
  lastUpdateTsAtom,
  refreshLastUpdateTsAtom,
  aggShredsAtom,
  addAggShredsAtom,
  deleteAggShredsBucketsAtom,
] = (function getAggShredsAtom() {
  const _aggShredsAtom = atom<ShredBucketsByGranularity>(new Map());
  const lastUpdateTsAtom = atom(performance.now());
  const refreshLastUpdateTsAtom = atom(null, (_get, set) =>
    set(lastUpdateTsAtom, performance.now()),
  );

  return [
    lastUpdateTsAtom,
    refreshLastUpdateTsAtom,
    atom((get) => get(_aggShredsAtom)),
    atom(
      null,
      (
        _get,
        set,
        {
          granularity,
          reference_ts_ns,
          turbine,
          repair,
          reconstructed,
          published,
        }: AggShreds,
      ) => {
        if (turbine.length === 0) return;

        set(_aggShredsAtom, (prev) => {
          const eventsByBucketIdx =
            prev.get(granularity) ?? new Map<number, ShredEventCounts>();

          const startBucketIdx = Number(
            reference_ts_ns / nsBucketSizes[granularity],
          );
          for (let i = 0; i < turbine.length; i++) {
            const values = {
              turbine: turbine[i],
              repair: repair[i],
              reconstructed: reconstructed[i],
              published: published[i],
            };
            if (!Object.values(values).some((v) => v != null)) {
              continue;
            }

            const bucketIdx = startBucketIdx + i;
            eventsByBucketIdx.set(bucketIdx, values);
          }

          prev.set(granularity, eventsByBucketIdx);
          return prev;
        });
        set(refreshLastUpdateTsAtom);
      },
    ),
    atom(
      null,
      (_get, set, granularity: AggGranularity, bucketIdxs: number[]) => {
        set(_aggShredsAtom, (prev) => {
          const eventsByBucketIdx = prev.get(granularity);
          if (!eventsByBucketIdx) return prev;

          for (const bucketIdx of bucketIdxs) {
            eventsByBucketIdx.delete(bucketIdx);
          }

          prev.set(granularity, eventsByBucketIdx);
          return prev;
        });
      },
    ),
  ];
})();
