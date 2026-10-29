import { atom } from "jotai";
import EventEmitter from "events";
import type TypedEmitter from "typed-emitter";
import type { AggCpu, AggGranularity } from "../../../api/types";
import { getBucketIdx } from "../utils";
import { tilesAtom } from "../../../api/atoms";
import { MAX_QUERY_TILES } from "./const";

export const drawEventType = "draw";

export type TilesUtilization = (number | null)[];

type UtilizationByBucketIdx = Map<number, TilesUtilization>;
export type CpuBucketsByGranularity = Map<
  AggGranularity,
  UtilizationByBucketIdx
>;

export const queryTilesAtom = atom((get) =>
  (get(tilesAtom) ?? []).slice(0, MAX_QUERY_TILES),
);

export const queryTileIdxsAtom = atom((get) =>
  get(queryTilesAtom).map((_, i) => i),
);

export const [
  aggCpuEmitterAtom,
  aggCpuAtom,
  addAggCpuAtom,
  deleteAggCpuBucketsAtom,
] = (function getAggCpuAtom() {
  const _aggCpuAtom = atom<CpuBucketsByGranularity>(new Map());

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
        const bucketCount = utilization[0]?.length ?? 0;
        if (bucketCount === 0) {
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

          for (let i = 0; i < bucketCount; i++) {
            utilizationByBucketIdx.set(
              startBucketIdx + i,
              utilization.map((tileUtilization) => tileUtilization[i]),
            );
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
  ];
})();
