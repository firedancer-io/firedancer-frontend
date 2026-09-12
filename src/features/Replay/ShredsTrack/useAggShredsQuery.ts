import { useCallback } from "react";
import { useSetAtom } from "jotai";
import { ascBucketGranularities, nsBucketSizes } from "../const";
import { useWebSocketSend } from "../../../api/ws/utils";
import type { AggGranularity, AggShreds } from "../../../api/types";
import type { NsTsRange } from "../../WebGl/webglUtils";
import { useTimelineServerMessage } from "../utils";
import { useTiledQueries } from "../useTiledQueries";
import {
  addAggShredsAtom,
  deleteAggShredsBucketsAtom,
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

export function useAggShredsQuery() {
  const addAggShreds = useSetAtom(addAggShredsAtom);
  const deleteAggShredsBuckets = useSetAtom(deleteAggShredsBucketsAtom);
  const refreshLastUpdateTs = useSetAtom(refreshLastUpdateTsAtom);
  const wsSend = useWebSocketSend();

  const sendQuery = useCallback(
    (
      queryId: number,
      startNs: bigint,
      endNs: bigint,
      granularity: AggGranularity,
    ) => {
      wsSend({
        topic: "timeline",
        key: "query_agg_shreds",
        id: queryId,
        params: {
          start_ns: startNs.toString(),
          end_ns: endNs.toString(),
          granularity,
        },
      });
    },
    [wsSend],
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
      deleteAggShredsBuckets(granularity, bucketIdxs);
    },
    [deleteAggShredsBuckets],
  );

  const { queryRange, markQueryComplete } = useTiledQueries<AggGranularity>({
    getTileSizeNs,
    overscanTilesCount: OVERSCAN_TILES_COUNT,
    sendQuery,
    tileEvictionThreshold: TILE_EVICTION_THRESHOLD,
    onEvictTiles,
  });

  useTimelineServerMessage(
    "query_agg_shreds",
    useCallback(
      (message: { id: number; value: AggShreds }) => {
        markQueryComplete(message.id);
        addAggShreds(message.value);
      },
      [addAggShreds, markQueryComplete],
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
