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

const chartId = "revenue-track";

/**
 * At most, how many buckets should be visible
 */
export const AGG_BUCKET_COUNT_THRESHOLD = 600;
export function getGranularity(windowSizeMs: number) {
  return (
    ascBucketGranularities.find((g) => {
      return windowSizeMs < AGG_BUCKET_COUNT_THRESHOLD * msBucketSizes[g];
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
    chartId,
    getTileSizeNs,
    overscanTilesCount: OVERSCAN_TILES_COUNT,
    sendQuery,
    tileEvictionHighWatermark: TILE_EVICTION_HIGH_WATERMARK,
    tileEvictionLowWatermark: TILE_EVICTION_LOW_WATERMARK,
    onEvictTiles,
  });

  useTimelineServerMessage(
    "query_agg_revenue",
    useCallback(
      (message: { id: number; value: AggRevenue }) => {
        addAggRevenue(message.value);
        markQueryComplete(message.id);
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
      visibleRangeMs: TsRange,
      worldRangeMs: TsRange,
      granularity: AggGranularity,
    ) => {
      const visibleRangeNs: NsTsRange = [
        calcAbsoluteNs(referenceNs, visibleRangeMs[0]),
        calcAbsoluteNs(referenceNs, visibleRangeMs[1]),
      ];

      const worldRangeNs: NsTsRange = [
        calcAbsoluteNs(referenceNs, worldRangeMs[0]),
        calcAbsoluteNs(referenceNs, worldRangeMs[1]),
      ];
      queryRange(visibleRangeNs, worldRangeNs, granularity, onNothingToFetch);
    },
    [onNothingToFetch, queryRange],
  );
}
