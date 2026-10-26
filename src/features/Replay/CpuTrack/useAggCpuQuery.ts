import { useCallback } from "react";
import { getDefaultStore, useSetAtom } from "jotai";
import { ascBucketGranularities, msBucketSizes, nsBucketSizes } from "../const";
import { useWebSocketSend } from "../../../api/ws/utils";
import type { AggCpu, AggGranularity } from "../../../api/types";
import type { NsTsRange, TsRange } from "../../WebGl/webglUtils";
import { calcAbsoluteNs, useTimelineServerMessage } from "../utils";
import { useTiledQueries } from "../useTiledQueries";
import type { TimelineQueryKey } from "../atoms";
import {
  addAggCpuAtom,
  deleteAggCpuBucketsAtom,
  queryTileIdxsAtom,
} from "./atoms";

const QUERY_KEY = "query_agg_cpu" satisfies TimelineQueryKey;

const store = getDefaultStore();

/**
 * At most, how many buckets should be visible
 */
const BUCKET_COUNT_THRESHOLD = 400;
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

export function useAggCpuQuery(chartId: string) {
  const addAggCpu = useSetAtom(addAggCpuAtom);
  const deleteAggCpuBuckets = useSetAtom(deleteAggCpuBucketsAtom);
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
          tiles: store.get(queryTileIdxsAtom),
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
      deleteAggCpuBuckets(granularity, bucketIdxs);
    },
    [deleteAggCpuBuckets],
  );

  const { queryRange, markQueryComplete } = useTiledQueries<AggGranularity>({
    chartId,
    getTileSizeNs,
    overscanTilesCount: OVERSCAN_TILES_COUNT,
    queryKey: QUERY_KEY,
    sendQuery,
    getTileEvictionHighWatermark,
    getTileEvictionLowWatermark,
    onEvictTiles,
  });

  useTimelineServerMessage(
    QUERY_KEY,
    (message: { id: number; value: AggCpu }) => {
      if (!markQueryComplete(message.id)) return;

      addAggCpu(message.value);
    },
  );

  const query = useCallback(
    (
      referenceNs: bigint,
      visibleRange: TsRange,
      worldRange: TsRange,
      granularity: AggGranularity,
    ) => {
      // the server rejects an empty tiles list
      if (!store.get(queryTileIdxsAtom).length) return;

      const visibleRangeNs: NsTsRange = [
        calcAbsoluteNs(referenceNs, visibleRange[0]),
        calcAbsoluteNs(referenceNs, visibleRange[1]),
      ];

      const worldRangeNs: NsTsRange = [
        calcAbsoluteNs(referenceNs, worldRange[0]),
        calcAbsoluteNs(referenceNs, worldRange[1]),
      ];
      // nothing to redraw if there's nothing to fetch: panning only moves the
      // camera over already built tile meshes
      queryRange(visibleRangeNs, worldRangeNs, granularity);
    },
    [queryRange],
  );

  return { query };
}

export type AggCpuQuery = ReturnType<typeof useAggCpuQuery>;
