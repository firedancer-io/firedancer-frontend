import { useCallback } from "react";
import { useSetAtom } from "jotai";
import { ascBucketGranularities, nsBucketSizes } from "../const";
import type { AggGranularity, AggSlots } from "../../../api/types";
import type { NsTsRange } from "../../WebGl/webglUtils";
import { useTimelineServerMessage } from "../utils";
import { useTiledQueries } from "../useTiledQueries";
import useAggSlotsQuery, { StartQueryId } from "../useAggSlotsQuery";
import {
  addAggSlotsAtom,
  deleteAggSlotsBucketsAtom,
  refreshLastUpdateTsAtom,
} from "./atoms";

/**
 * At most, how many buckets should be visible
 */
const BUCKET_COUNT_THRESHOLD = 1000;
export function getAggGranularity(windowSizeNs: bigint) {
  return (
    ascBucketGranularities.find((g) => {
      return windowSizeNs < BigInt(BUCKET_COUNT_THRESHOLD) * nsBucketSizes[g];
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
const TILE_EVICTION_THRESHOLD = 16;

export function getTileSizeNs(granularity: AggGranularity) {
  return BigInt(BUCKETS_PER_TILE) * nsBucketSizes[granularity];
}

export function useAggHeaderQuery() {
  const addAggSlots = useSetAtom(addAggSlotsAtom);
  const deleteAggSlotsBuckets = useSetAtom(deleteAggSlotsBucketsAtom);
  const refreshLastUpdateTs = useSetAtom(refreshLastUpdateTsAtom);
  const slotsQuery = useAggSlotsQuery();

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

  const { queryRange, markQueryComplete } = useTiledQueries<AggGranularity>({
    getTileSizeNs,
    overscanTilesCount: OVERSCAN_TILES_COUNT,
    startQueryId: StartQueryId.HeaderTrack,
    sendQuery,
    tileEvictionThreshold: TILE_EVICTION_THRESHOLD,
    onEvictTiles,
  });

  useTimelineServerMessage(
    "query_agg_slots",
    useCallback(
      (message: { id: number; value: AggSlots }) => {
        // ignore other requesters sharing this channel (e.g. the mini map)
        if (message.id < StartQueryId.HeaderTrack) return;
        markQueryComplete(message.id);
        addAggSlots(message.value);
      },
      [addAggSlots, markQueryComplete],
    ),
  );

  // trigger redraw if panning to already fetched data
  const onNothingToFetch = useCallback(() => {
    refreshLastUpdateTs();
  }, [refreshLastUpdateTs]);

  return useCallback(
    (
      visibleRangeNs: NsTsRange,
      worldRangeNs: NsTsRange,
      granularity: AggGranularity,
    ) => {
      queryRange(visibleRangeNs, worldRangeNs, granularity, onNothingToFetch);
    },
    [onNothingToFetch, queryRange],
  );
}
