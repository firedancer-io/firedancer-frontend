import { atom } from "jotai";
import type { AggGranularity, AggRevenue } from "../../../api/types";
import type { RevenueType } from "../../../api/entities";
import { nsBucketSizes } from "../const";

type Revenues = Record<RevenueType, bigint | null>;
/**
 * Buckets start at idx 0 for 0n absolute ns ts
 */
type RevenueByBucketIdx = Map<number, Revenues>;
export type RevenueBucketsByGranularity = Map<
  AggGranularity,
  RevenueByBucketIdx
>;

export const [
  lastUpdateTsAtom,
  refreshLastUpdateTsAtom,
  aggRevenueAtom,
  addAggRevenueAtom,
  deleteAggRevenueBucketsAtom,
] = (function getAggRevenueAtom() {
  const _aggRevenueAtom = atom<RevenueBucketsByGranularity>(new Map());
  const lastUpdateTsAtom = atom(performance.now());
  const refreshLastUpdateTsAtom = atom(null, (_get, set) =>
    set(lastUpdateTsAtom, performance.now()),
  );

  return [
    lastUpdateTsAtom,
    refreshLastUpdateTsAtom,
    atom((get) => get(_aggRevenueAtom)),
    atom(
      null,
      (
        _get,
        set,
        { granularity, reference_ts_ns, txn_fees, prio_fees, tips }: AggRevenue,
      ) => {
        if (txn_fees.length === 0) return;

        set(_aggRevenueAtom, (prev) => {
          const revenueByBucketIdx =
            prev.get(granularity) ?? new Map<number, Revenues>();

          const startBucketIdx = Number(
            reference_ts_ns / nsBucketSizes[granularity],
          );
          for (let i = 0; i < txn_fees.length; i++) {
            const values = {
              txn_fees: txn_fees[i],
              prio_fees: prio_fees[i],
              tips: tips[i],
            };
            if (!Object.values(values).some((v) => v != null)) {
              continue;
            }

            const bucketIdx = startBucketIdx + i;
            revenueByBucketIdx.set(bucketIdx, values);
          }

          prev.set(granularity, revenueByBucketIdx);
          return prev;
        });
        set(refreshLastUpdateTsAtom);
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
