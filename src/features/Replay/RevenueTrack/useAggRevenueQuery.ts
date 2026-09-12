import { useCallback } from "react";
import { ascBucketGranularities, nsBucketSizes } from "../const";
import type { AggGranularity, AggRevenue } from "../../../api/types";
import { useWebSocketSend } from "../../../api/ws/utils";
import type { NsTsRange } from "../../WebGl/webglUtils";
import {
  addAggRevenueAtom,
  deleteAggRevenueBucketsAtom,
  refreshLastUpdateTsAtom,
} from "./atoms";
import { useSetAtom } from "jotai";
import { useTiledQueries } from "./useTiledQueries";
import { useTimelineServerMessage } from "../utils";

/**
 * At most, how many buckets should be visible
 */
const BUCKET_COUNT_THRESHOLD = 1000;
export function getGranularity(windowSizeNs: bigint) {
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

/** Fetch-tile size (ms) for an agg granularity: a whole number of buckets. */
export function getTileSizeNs(granularity: AggGranularity) {
  return BigInt(BUCKETS_PER_TILE) * nsBucketSizes[granularity];
}

export default function useAggRevenueQuery() {
  const addAggRevenue = useSetAtom(addAggRevenueAtom);
  const deleteAggRevenueBuckets = useSetAtom(deleteAggRevenueBucketsAtom);
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
        key: "query_agg_revenue",
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
      deleteAggRevenueBuckets(granularity, bucketIdxs);
    },
    [deleteAggRevenueBuckets],
  );

  const { queryRange, markQueryComplete } = useTiledQueries<AggGranularity>({
    getTileSizeNs,
    overscanTilesCount: OVERSCAN_TILES_COUNT,
    sendQuery,
    tileEvictionThreshold: TILE_EVICTION_THRESHOLD,
    onEvictTiles,
  });

  useTimelineServerMessage(
    "query_agg_revenue",
    useCallback(
      (message: { id: number; value: AggRevenue }) => {
        markQueryComplete(message.id);
        addAggRevenue(message.value);
      },
      [addAggRevenue, markQueryComplete],
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
