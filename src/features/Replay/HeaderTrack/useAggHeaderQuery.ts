import { useCallback } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { ascBucketGranularities, msBucketSizes, nsBucketSizes } from "../const";
import type { AggGranularity, AggSlots } from "../../../api/types";
import type { NsTsRange, TsRange } from "../../WebGl/webglUtils";
import { calcAbsoluteNs, useTimelineServerMessage } from "../utils";
import { useTiledQueries } from "../useTiledQueries";
import { AGG_SLOTS_QUERY_KEY, useSlotsQuery } from "../useSlotsQuery";
import {
  addAggSlotsAtom,
  deleteAggSlotsBucketsAtom,
  drawEventType,
  aggHeaderEmitterAtom,
} from "./aggAtoms";

/**
 * At most, how many buckets should be visible
 */
const BUCKET_COUNT_THRESHOLD = 1000;
export function getAggGranularity(windowSizeMs: number) {
  return (
    ascBucketGranularities.find((g) => {
      return windowSizeMs < BUCKET_COUNT_THRESHOLD * msBucketSizes[g];
    }) ?? ascBucketGranularities[ascBucketGranularities.length - 1]
  );
}

/**
 * Number of current granularity buckets per fetch tile.
 * The tile ns size increases as a bucket size increases.
 */
export const BUCKETS_PER_TILE = 250;
export const OVERSCAN_TILES_COUNT = 2;
export const OVERSCAN_BUCKETS = BUCKETS_PER_TILE * OVERSCAN_TILES_COUNT;
const TILE_EVICTION_HIGH_WATERMARK = 24;
const TILE_EVICTION_LOW_WATERMARK = 16;
const getTileEvictionHighWatermark = () => TILE_EVICTION_HIGH_WATERMARK;
const getTileEvictionLowWatermark = () => TILE_EVICTION_LOW_WATERMARK;

export function getTileSizeNs(granularity: AggGranularity) {
  return BigInt(BUCKETS_PER_TILE) * nsBucketSizes[granularity];
}

export function useAggHeaderQuery(chartId: string) {
  const addAggSlots = useSetAtom(addAggSlotsAtom);
  const deleteAggSlotsBuckets = useSetAtom(deleteAggSlotsBucketsAtom);
  const emitter = useAtomValue(aggHeaderEmitterAtom);
  const slotsQuery = useSlotsQuery();

  const sendQuery = useCallback(
    (
      queryId: number,
      startNs: bigint,
      endNs: bigint,
      granularity: AggGranularity,
    ) => {
      slotsQuery(queryId, [startNs, endNs], granularity);
    },
    [slotsQuery],
  );

  const onEvictTiles = useCallback(
    (granularity: AggGranularity, tileIdxs: number[]) => {
      const bucketIdxs = tileIdxs.reduce<number[]>((acc, tileIdx) => {
        const start = tileIdx * BUCKETS_PER_TILE;
        const end = start + BUCKETS_PER_TILE;
        for (let i = start; i < end; i++) {
          acc.push(i);
        }
        return acc;
      }, []);
      deleteAggSlotsBuckets(granularity, bucketIdxs);
    },
    [deleteAggSlotsBuckets],
  );

  const { queryRange, markQueryComplete, pauseStaleRefreshes } =
    useTiledQueries<AggGranularity>({
      chartId,
      getTileSizeNs,
      overscanTilesCount: OVERSCAN_TILES_COUNT,
      queryKey: AGG_SLOTS_QUERY_KEY,
      sendQuery,
      getTileEvictionHighWatermark,
      getTileEvictionLowWatermark,
      onEvictTiles,
    });

  useTimelineServerMessage(
    AGG_SLOTS_QUERY_KEY,
    (message: { id: number; value: AggSlots }) => {
      if (!markQueryComplete(message.id)) return;

      addAggSlots(message.value);
    },
  );

  // trigger redraw if panning to already fetched data
  const onNothingToFetch = useCallback(() => {
    emitter.emit(drawEventType);
  }, [emitter]);

  const query = useCallback(
    (
      referenceNs: bigint,
      visibleRange: TsRange,
      worldRange: TsRange,
      granularity: AggGranularity,
    ) => {
      const visibleRangeNs: NsTsRange = [
        calcAbsoluteNs(referenceNs, visibleRange[0]),
        calcAbsoluteNs(referenceNs, visibleRange[1]),
      ];

      const worldRangeNs: NsTsRange = [
        calcAbsoluteNs(referenceNs, worldRange[0]),
        calcAbsoluteNs(referenceNs, worldRange[1]),
      ];
      queryRange(visibleRangeNs, worldRangeNs, granularity, onNothingToFetch);
    },
    [onNothingToFetch, queryRange],
  );

  return { query, pauseStaleRefreshes };
}
