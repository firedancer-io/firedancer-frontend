import { atom } from "jotai";
import EventEmitter from "events";
import type TypedEmitter from "typed-emitter";
import type { AggCpu, AggGranularity } from "../../../api/types";
import { getBucketIdx } from "../utils";
import { tilesAtom } from "../../../api/atoms";
import { MAX_QUERY_TILES } from "./const";

/** buckets in [startBucketIdx, endBucketIdx] changed for a granularity */
export const updateEventType = "update";

/**
 * Utilization (0 - 250) per queried tile, in request order.
 * null if the tile had no samples in the bucket.
 */
export type TilesUtilization = (number | null)[];

/**
 * Buckets start at idx 0 of absolute world time
 */
type UtilizationByBucketIdx = Map<number, TilesUtilization>;
export type CpuBucketsByGranularity = Map<
  AggGranularity,
  UtilizationByBucketIdx
>;

/**
 * Tile indices into `summary.tiles` sent with every query.
 * All tiles are always queried so cached buckets stay valid across row layouts.
 */
export const queryTileIdxsAtom = atom((get) => {
  const tiles = get(tilesAtom) ?? [];
  return tiles.slice(0, MAX_QUERY_TILES).map((_, i) => i);
});

export const [
  aggCpuEmitterAtom,
  aggCpuAtom,
  addAggCpuAtom,
  /** delete buckets of evicted fetch tiles, without an update event */
  deleteAggCpuBucketsAtom,
] = (function getAggCpuAtom() {
  const _aggCpuAtom = atom<CpuBucketsByGranularity>(new Map());

  return [
    atom(
      new EventEmitter() as TypedEmitter<{
        [updateEventType]: (
          granularity: AggGranularity,
          startBucketIdx: number,
          endBucketIdx: number,
        ) => void;
      }>,
    ),
    atom((get) => get(_aggCpuAtom)),
    atom(
      null,
      (get, set, { granularity, reference_ts_ns, utilization }: AggCpu) => {
        const bucketCount = utilization[0]?.length ?? 0;
        if (bucketCount === 0) return;

        // Refreshes of the world end tile resend every bucket, so only report
        // the range that differs from what's stored
        let changedStartIdx: number | undefined;
        let changedEndIdx: number | undefined;

        set(_aggCpuAtom, (prev) => {
          const utilizationByBucketIdx =
            prev.get(granularity) ?? new Map<number, TilesUtilization>();

          const startBucketIdx = getBucketIdx(
            reference_ts_ns,
            granularity,
            false,
          );

          // transpose from per tile to per bucket
          for (let i = 0; i < bucketCount; i++) {
            const bucketIdx = startBucketIdx + i;
            const tilesUtilization = utilization.map(
              (tileUtilization) => tileUtilization[i] ?? null,
            );

            const stored = utilizationByBucketIdx.get(bucketIdx);
            if (stored && isEqualUtilization(stored, tilesUtilization)) {
              continue;
            }

            utilizationByBucketIdx.set(bucketIdx, tilesUtilization);
            changedStartIdx ??= bucketIdx;
            changedEndIdx = bucketIdx;
          }

          prev.set(granularity, utilizationByBucketIdx);
          return prev;
        });

        if (changedStartIdx !== undefined && changedEndIdx !== undefined) {
          get(aggCpuEmitterAtom).emit(
            updateEventType,
            granularity,
            changedStartIdx,
            changedEndIdx,
          );
        }
      },
    ),
    atom(
      null,
      (_get, set, granularity: AggGranularity, bucketIdxs: number[]) => {
        set(_aggCpuAtom, (prev) => {
          const utilizationByBucketIdx = prev.get(granularity);
          if (!utilizationByBucketIdx) return prev;

          for (const bucketIdx of bucketIdxs) {
            utilizationByBucketIdx.delete(bucketIdx);
          }

          prev.set(granularity, utilizationByBucketIdx);
          return prev;
        });
      },
    ),
  ];
})();

function isEqualUtilization(a: TilesUtilization, b: TilesUtilization) {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}
