import { atom } from "jotai";
import EventEmitter from "events";
import type TypedEmitter from "typed-emitter";
import type { AggCpu, AggGranularity } from "../../../api/types";
import { getBucketIdx } from "../utils";
import { tilesAtom } from "../../../api/atoms";
import { getTileKey, MAX_QUERY_TILES } from "./const";

export const drawEventType = "draw";

export type TilesUtilization = (number | null)[];

type UtilizationByBucketIdx = Map<number, TilesUtilization>;
export type CpuUtilizationByGranularity = Map<
  AggGranularity,
  UtilizationByBucketIdx
>;

export const queryTilesAtom = atom((get) =>
  (get(tilesAtom) ?? []).slice(0, MAX_QUERY_TILES),
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
  syncAggCpuTilesAtom,
] = (function getAggCpuAtom() {
  const _aggCpuAtom = atom<CpuUtilizationByGranularity>(new Map());
  const _tilesKeyAtom = atom<string | undefined>(undefined);

  return [
    atom(
      new EventEmitter() as TypedEmitter<{
        [drawEventType]: () => void;
      }>,
    ),
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
    /**
     * Data is indexed by tile so clear cached utilization if the tiles change
     */
    atom(null, (get, set, tilesKey: string) => {
      const prevTilesKey = get(_tilesKeyAtom);
      set(_tilesKeyAtom, tilesKey);
      if (prevTilesKey === undefined || prevTilesKey === tilesKey) return false;

      set(_aggCpuAtom, new Map());
      return true;
    }),
  ];
})();
