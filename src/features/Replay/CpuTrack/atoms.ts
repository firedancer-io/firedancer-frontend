import { atom } from "jotai";
import EventEmitter from "events";
import type { AggCpu, AggGranularity } from "../../../api/types";
import { getBucketIdx } from "../utils";
import { tilesAtom } from "../../../api/atoms";
import { DEFAULT_SELECTED_KINDS, MAX_QUERY_TILES } from "./const";
import { getTileKey } from "../utils";
import { getCpuRows } from "./utils";
import { drawEventType, type DrawEmitter } from "../const";

export type TilesUtilization = (number | null)[];

type UtilizationByBucketIdx = Map<number, TilesUtilization>;
export type CpuUtilizationByGranularity = Map<
  AggGranularity,
  UtilizationByBucketIdx
>;

export const queryTilesAtom = atom((get) =>
  (get(tilesAtom) ?? []).slice(0, MAX_QUERY_TILES),
);

export const cpuSelectedKindsAtom = atom(DEFAULT_SELECTED_KINDS);
export const cpuSplitByTileAtom = atom(false);

export const cpuRowsAtom = atom((get) =>
  getCpuRows(
    get(queryTilesAtom),
    get(cpuSelectedKindsAtom),
    get(cpuSplitByTileAtom),
  ),
);

export const queryTileIdxsAtom = atom((get) =>
  get(queryTilesAtom).map((_, i) => i),
);

export const queryTilesKeyAtom = atom((get) =>
  get(queryTilesAtom).map(getTileKey).join(","),
);

/**
 * Fill each tile's missing sample in place with its value in the previous
 * bucket's utilization
 */
function fillNullsWithPreviousValue(
  tilesUtilization: TilesUtilization,
  prevTilesUtilization: TilesUtilization | undefined,
) {
  // previous bucket isn't loaded
  if (!prevTilesUtilization) return false;

  let filledNull = false;
  for (let i = 0; i < tilesUtilization.length; i++) {
    // skip if the previous value is also missing
    if (tilesUtilization[i] == null && prevTilesUtilization[i] != null) {
      tilesUtilization[i] = prevTilesUtilization[i];
      filledNull = true;
    }
  }
  return filledNull;
}

export const [
  aggCpuEmitterAtom,
  aggCpuAtom,
  addAggCpuAtom,
  deleteAggCpuBucketsAtom,
  setTilesKeyAtom,
] = (function getAggCpuAtom() {
  const _aggCpuAtom = atom<CpuUtilizationByGranularity>(new Map());
  const _tilesKeyAtom = atom<string | undefined>(undefined);

  return [
    atom(new EventEmitter() as DrawEmitter),
    atom((get) => get(_aggCpuAtom)),
    atom(
      null,
      (get, set, { granularity, reference_ts_ns, utilization }: AggCpu) => {
        const responseBucketCount = utilization[0]?.length ?? 0;
        if (responseBucketCount === 0) {
          get(aggCpuEmitterAtom).emit(drawEventType);
          return;
        }

        set(_aggCpuAtom, (prev) => {
          const utilizationByBucketIdx =
            prev.get(granularity) ?? new Map<number, TilesUtilization>();

          const startBucketIdx = getBucketIdx(
            reference_ts_ns,
            granularity,
            false,
          );

          // fill missing samples from the previous bucket's utilization
          let prevTilesUtilization = utilizationByBucketIdx.get(
            startBucketIdx - 1,
          );
          for (let i = 0; i < responseBucketCount; i++) {
            const tilesUtilization = utilization.map(
              (tileUtilization) => tileUtilization[i],
            );
            fillNullsWithPreviousValue(tilesUtilization, prevTilesUtilization);
            utilizationByBucketIdx.set(startBucketIdx + i, tilesUtilization);
            prevTilesUtilization = tilesUtilization;
          }

          for (let idx = startBucketIdx + responseBucketCount; ; idx++) {
            const tilesUtilization = utilizationByBucketIdx.get(idx);
            if (
              !tilesUtilization ||
              !fillNullsWithPreviousValue(
                tilesUtilization,
                prevTilesUtilization,
              )
            ) {
              break;
            }
            prevTilesUtilization = tilesUtilization;
          }

          prev.set(granularity, utilizationByBucketIdx);
          return prev;
        });
        get(aggCpuEmitterAtom).emit(drawEventType);
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
    atom(null, (get, set, tilesKey: string): boolean => {
      const prevTilesKey = get(_tilesKeyAtom);
      set(_tilesKeyAtom, tilesKey);
      return prevTilesKey !== undefined && prevTilesKey !== tilesKey;
    }),
  ];
})();
