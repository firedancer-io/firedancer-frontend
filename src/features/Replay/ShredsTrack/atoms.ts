import { atom } from "jotai";
import type { AggGranularity, AggShreds } from "../../../api/types";
import type { AggShredEventType } from "../../../api/entities";
import { getBucketIdx } from "../utils";

export type ShredEventCounts = Record<AggShredEventType, number | null>;

/**
 * Buckets start at idx 0 of absolute world time
 */
type EventsByBucketIdx = Map<number, ShredEventCounts>;
export type ShredBucketsByGranularity = Map<AggGranularity, EventsByBucketIdx>;

export const [
  revisionAtom,
  incrementRevisionAtom,
  aggShredsAtom,
  addAggShredsAtom,
  /** delete buckets, but don't bump the revision (skip redraw trigger) */
  deleteAggShredsBucketsAtom,
] = (function getAggShredsAtom() {
  const _aggShredsAtom = atom<ShredBucketsByGranularity>(new Map());
  const revisionAtom = atom(0);
  const incrementRevisionAtom = atom(null, (_get, set) =>
    set(revisionAtom, (prev) => (prev + 1) % 100),
  );

  return [
    revisionAtom,
    incrementRevisionAtom,
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
        if (turbine.length === 0) {
          set(incrementRevisionAtom);
          return;
        }

        set(_aggShredsAtom, (prev) => {
          const eventsByBucketIdx =
            prev.get(granularity) ?? new Map<number, ShredEventCounts>();

          const startBucketIdx = getBucketIdx(
            reference_ts_ns,
            granularity,
            false,
          );

          for (let i = 0; i < turbine.length; i++) {
            const values = {
              turbine: turbine[i],
              repair: repair[i],
              reconstructed: reconstructed[i],
              published: published[i],
            };

            const bucketIdx = startBucketIdx + i;
            eventsByBucketIdx.set(bucketIdx, values);
          }

          prev.set(granularity, eventsByBucketIdx);
          return prev;
        });
        set(incrementRevisionAtom);
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
