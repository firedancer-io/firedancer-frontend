import { atom } from "jotai";
import type { AggGranularity, AggRevenue } from "../../../api/types";
import type { RevenueType } from "../../../api/entities";
import { getBucketIdx } from "../utils";

type Revenues = Record<RevenueType, bigint | null>;
/**
 * Buckets start at idx 0 of absolute world time
 */
type RevenueByBucketIdx = Map<number, Revenues>;
export type RevenueBucketsByGranularity = Map<
  AggGranularity,
  RevenueByBucketIdx
>;

export const [
  revisionAtom,
  incrementRevisionAtom,
  aggRevenueAtom,
  addAggRevenueAtom,
  /** delete buckets, but don't bump the revision (skip redraw trigger) */
  deleteAggRevenueBucketsAtom,
] = (function getAggRevenueAtom() {
  const _aggRevenueAtom = atom<RevenueBucketsByGranularity>(new Map());
  const revisionAtom = atom(0);
  const incrementRevisionAtom = atom(null, (_get, set) =>
    set(revisionAtom, (prev) => (prev + 1) % 100),
  );

  return [
    revisionAtom,
    incrementRevisionAtom,
    atom((get) => get(_aggRevenueAtom)),
    atom(
      null,
      (
        get,
        set,
        { granularity, reference_ts_ns, txn_fees, prio_fees, tips }: AggRevenue,
      ) => {
        if (txn_fees.length === 0) {
          set(incrementRevisionAtom);
          return;
        }

        set(_aggRevenueAtom, (prev) => {
          const revenueByBucketIdx =
            prev.get(granularity) ?? new Map<number, Revenues>();

          const startBucketIdx = getBucketIdx(
            reference_ts_ns,
            granularity,
            false,
          );

          for (let i = 0; i < txn_fees.length; i++) {
            const values = {
              txn_fees: txn_fees[i],
              prio_fees: prio_fees[i],
              tips: tips[i],
            };

            const bucketIdx = startBucketIdx + i;
            revenueByBucketIdx.set(bucketIdx, values);
          }

          prev.set(granularity, revenueByBucketIdx);
          return prev;
        });
        set(incrementRevisionAtom);
      },
    ),
    atom(
      null,
      (_get, set, granularity: AggGranularity, bucketIdxs: number[]) => {
        set(_aggRevenueAtom, (prev) => {
          const revenueByBucketIdx = prev.get(granularity);
          if (!revenueByBucketIdx) return prev;

          for (const bucketIdx of bucketIdxs) {
            revenueByBucketIdx.delete(bucketIdx);
          }

          prev.set(granularity, revenueByBucketIdx);
          return prev;
        });
      },
    ),
  ];
})();
