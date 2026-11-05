import { atom } from "jotai";
import EventEmitter from "events";
import type { AggGranularity, AggRevenue } from "../../../api/types";
import type { RevenueType } from "../../../api/entities";
import { getBucketIdx } from "../utils";
import { revenueSeriesAddends, type RevenueSeries } from "./consts";
import { drawEventType, type DrawEmitter } from "../const";

type Revenues = Record<RevenueType, bigint | null>;

export function getAggRevenueValue(
  revenues: Revenues,
  series: RevenueSeries,
): bigint | null {
  let sum: bigint | null = null;
  for (const addend of revenueSeriesAddends[series]) {
    const value = revenues[addend];
    if (value != null) sum = (sum ?? 0n) + value;
  }
  return sum;
}
/**
 * Buckets start at idx 0 of absolute world time
 */
type RevenueByBucketIdx = Map<number, Revenues>;
export type RevenueBucketsByGranularity = Map<
  AggGranularity,
  RevenueByBucketIdx
>;

export const [
  aggRevenueEmitterAtom,
  aggRevenueAtom,
  addAggRevenueAtom,
  /** delete buckets, but don't emit a draw (skip redraw trigger) */
  deleteAggRevenueBucketsAtom,
] = (function getAggRevenueAtom() {
  const _aggRevenueAtom = atom<RevenueBucketsByGranularity>(new Map());

  return [
    atom(new EventEmitter() as DrawEmitter),
    atom((get) => get(_aggRevenueAtom)),
    atom(
      null,
      (
        get,
        set,
        { granularity, reference_ts_ns, txn_fees, prio_fees, tips }: AggRevenue,
      ) => {
        if (txn_fees.length === 0) {
          get(aggRevenueEmitterAtom).emit(drawEventType);
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
        get(aggRevenueEmitterAtom).emit(drawEventType);
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
