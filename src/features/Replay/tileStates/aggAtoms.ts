import { atom } from "jotai";
import EventEmitter from "events";
import type { AggGranularity, AggTileStates } from "../../../api/types";
import { getBucketIdx } from "../utils";
import { createClearAggAtom } from "../clearAggAtom";
import { dataChangeEventType, drawEventType, type DrawEmitter } from "../const";

export type StateDurationsByTile = Map<number, (number | null)[]>;

type StatesByBucketIdx = Map<number, StateDurationsByTile>;
export type TileStatesBucketsByGranularity = Map<
  AggGranularity,
  StatesByBucketIdx
>;

export const [
  aggTileStatesEmitterAtom,
  aggTileStatesAtom,
  addAggTileStatesAtom,
  deleteAggTileStatesBucketsAtom,
  syncAggTileStatesTilesAtom,
  clearAggTileStatesAtom,
] = (function getAggTileStatesAtom() {
  const _aggTileStatesAtom = atom<TileStatesBucketsByGranularity>(new Map());
  const emitterAtom = atom(new EventEmitter() as DrawEmitter);
  const _tilesKeyAtom = atom<string | undefined>(undefined);

  return [
    emitterAtom,
    atom((get) => get(_aggTileStatesAtom)),
    atom(
      null,
      (
        get,
        set,
        { granularity, reference_ts_ns, tiles, tile_states }: AggTileStates,
      ) => {
        const bucketCount =
          tile_states.flat().find((buckets) => buckets != null)?.length ?? 0;
        if (bucketCount === 0) {
          get(aggTileStatesEmitterAtom).emit(drawEventType);
          return;
        }

        set(_aggTileStatesAtom, (prev) => {
          const statesByBucketIdx =
            prev.get(granularity) ?? new Map<number, StateDurationsByTile>();

          const startBucketIdx = getBucketIdx(
            reference_ts_ns,
            granularity,
            false,
          );

          for (let i = 0; i < bucketCount; i++) {
            const statesByTile: StateDurationsByTile = new Map();
            for (let t = 0; t < tiles.length; t++) {
              const tileIdx = tiles[t];
              if (tileIdx == null) continue;
              statesByTile.set(
                tileIdx,
                tile_states[t].map((buckets) => buckets?.[i] ?? null),
              );
            }
            statesByBucketIdx.set(startBucketIdx + i, statesByTile);
          }

          prev.set(granularity, statesByBucketIdx);
          return prev;
        });
        get(aggTileStatesEmitterAtom).emit(dataChangeEventType);
        get(aggTileStatesEmitterAtom).emit(drawEventType);
      },
    ),
    atom(
      null,
      (get, set, granularity: AggGranularity, bucketIdxs: number[]) => {
        set(_aggTileStatesAtom, (prev) => {
          const statesByBucketIdx = prev.get(granularity);
          if (!statesByBucketIdx) return prev;

          for (const bucketIdx of bucketIdxs) {
            statesByBucketIdx.delete(bucketIdx);
          }

          return prev;
        });
        get(aggTileStatesEmitterAtom).emit(dataChangeEventType);
      },
    ),
    /**
     * States are indexed by tile so clear cached states if the tiles change
     */
    atom(null, (get, set, tilesKey: string) => {
      const prevTilesKey = get(_tilesKeyAtom);
      set(_tilesKeyAtom, tilesKey);
      if (prevTilesKey === undefined || prevTilesKey === tilesKey) return false;

      set(_aggTileStatesAtom, new Map());
      get(aggTileStatesEmitterAtom).emit(dataChangeEventType);
      return true;
    }),
    createClearAggAtom(_aggTileStatesAtom, emitterAtom),
  ];
})();
