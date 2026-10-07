import { useCallback } from "react";
import { ascBucketGranularities, msBucketSizes, nsBucketSizes } from "../const";
import type { AggGranularity, AggRevenue } from "../../../api/types";
import { useWebSocketSend } from "../../../api/ws/utils";
import type { NsTsRange, TsRange } from "../../WebGl/webglUtils";
import {
  addAggRevenueAtom,
  deleteAggRevenueBucketsAtom,
  drawEventType,
  aggRevenueEmitterAtom,
} from "./atoms";
import { useAtomValue, useSetAtom } from "jotai";
import { useTiledQueries } from "../useTiledQueries";
import { calcAbsoluteNs, useTimelineServerMessage } from "../utils";
import type { TimelineQueryKey } from "../atoms";

const QUERY_KEY = "query_agg_revenue" satisfies TimelineQueryKey;

const chartId = "revenue-track";

/**
 * At most, how many buckets should be visible
 */
const BUCKET_COUNT_THRESHOLD = 1000;
export function getGranularity(windowSizeMs: number) {
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

export function getTileSizeNs(granularity: AggGranularity) {
  return BigInt(BUCKETS_PER_TILE) * nsBucketSizes[granularity];
}

export default function useAggRevenueQuery() {
  const addAggRevenue = useSetAtom(addAggRevenueAtom);
  const deleteAggRevenueBuckets = useSetAtom(deleteAggRevenueBucketsAtom);
  const emitter = useAtomValue(aggRevenueEmitterAtom);
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
        key: QUERY_KEY,
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
    chartId,
    getTileSizeNs,
    overscanTilesCount: OVERSCAN_TILES_COUNT,
    queryKey: QUERY_KEY,
    sendQuery,
    tileEvictionHighWatermark: TILE_EVICTION_HIGH_WATERMARK,
    tileEvictionLowWatermark: TILE_EVICTION_LOW_WATERMARK,
    onEvictTiles,
  });

  useTimelineServerMessage(
    QUERY_KEY,
    useCallback(
      (message: { id: number; value: AggRevenue }) => {
        if (!markQueryComplete(message.id)) return;

        addAggRevenue(message.value);
      },
      [addAggRevenue, markQueryComplete],
    ),
  );

  // trigger redraw if panning to already fetched data
  const onNothingToFetch = useCallback(() => {
    emitter.emit(drawEventType);
  }, [emitter]);

  return useCallback(
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
}
