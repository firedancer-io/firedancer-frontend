import { useCallback, useLayoutEffect, useMemo } from "react";
import {
  getDefaultStore,
  useAtomValue,
  useSetAtom,
  type Atom,
  type PrimitiveAtom,
  type WritableAtom,
} from "jotai";
import { useWebSocketSend } from "../../api/ws/utils";
import type { AggGranularity } from "../../api/types";
import type { NsTsRange, TsRange } from "../WebGl/webglUtils";
import {
  calcAbsoluteNsRange,
  getWindowNs,
  useTimelineServerMessage,
} from "./utils";
import { createParallelCache } from "./parallelQueriesCache";
import { registerPrefetcher } from "./prefetchQueue";
import {
  ascBucketGranularities,
  drawEventType,
  nsBucketSizes,
  type DrawEmitter,
} from "./const";
import {
  referenceNsAtom,
  visibleRangeAtom,
  worldRangeAtom,
  type TimelineQueryKey,
} from "./atoms";
import { hasFallbackData, type DataLevel } from "./coverage";
import { getCoverageDrawTiles, type GetDrawTiles } from "./aggDraw";

const store = getDefaultStore();

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

type AddAtom<TValue> = WritableAtom<null, [TValue], void>;

type DeleteBucketsAtom = WritableAtom<null, [AggGranularity, number[]], void>;

interface UseAggQueryOpts<TValue, TParams extends object> {
  chartId: string;
  queryKey: TimelineQueryKey;
  addAtom: AddAtom<TValue>;
  deleteBucketsAtom: DeleteBucketsAtom;
  emitterAtom: Atom<DrawEmitter>;
  drawTilesAtom?: PrimitiveAtom<GetDrawTiles | undefined>;
  getGranularity: (windowSizeMs: number) => AggGranularity;
  params?: TParams;
  overscanTilesCount?: number;
}

export function useAggQuery<TValue, TParams extends object = object>({
  chartId,
  queryKey,
  addAtom,
  deleteBucketsAtom,
  emitterAtom,
  drawTilesAtom,
  getGranularity,
  params,
  overscanTilesCount = OVERSCAN_TILES_COUNT,
}: UseAggQueryOpts<TValue, TParams>) {
  const addValue = useSetAtom(addAtom);
  const deleteBuckets = useSetAtom(deleteBucketsAtom);
  const emitter = useAtomValue(emitterAtom);
  const wsSend = useWebSocketSend();

  const sendQuery = useCallback(
    (
      queryId: number,
      startNs: bigint,
      endNs: bigint,
      granularity: AggGranularity,
      params: TParams | undefined,
    ) => {
      wsSend({
        topic: "timeline",
        key: queryKey,
        id: queryId,
        params: {
          start_ns: startNs.toString(),
          end_ns: endNs.toString(),
          granularity,
          ...params,
        },
      });
    },
    [wsSend, queryKey],
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
      deleteBuckets(granularity, bucketIdxs);
    },
    [deleteBuckets],
  );

  const cache = useMemo(
    () =>
      createParallelCache<AggGranularity, TParams | undefined>({
        chartId,
        getTileSizeNs,
        overscanTilesCount,
        queryKey,
        sendQuery,
        getTileEvictionHighWatermark,
        getTileEvictionLowWatermark,
        onEvictTiles,
      }),
    [chartId, overscanTilesCount, queryKey, sendQuery, onEvictTiles],
  );
  const {
    queryRange,
    prefetchWorld,
    markQueryComplete,
    pauseStaleRefreshes,
    clearCache,
    getLevel,
  } = cache;

  useLayoutEffect(() => {
    const unsub = cache.init();
    return () => {
      unsub();
      cache.clearPending();
    };
  }, [cache]);

  // so zooming all the way out doesn't wait on the network
  const prefetch = useCallback(() => {
    const referenceNs = store.get(referenceNsAtom);
    const worldRange = store.get(worldRangeAtom);
    if (referenceNs == null || !worldRange) return false;

    const worldGranularity = getGranularity(worldRange[1] - worldRange[0]);
    return prefetchWorld(
      calcAbsoluteNsRange(referenceNs, worldRange),
      worldGranularity,
      nsBucketSizes[worldGranularity],
      params,
    );
  }, [prefetchWorld, getGranularity, params]);

  useTimelineServerMessage(queryKey, (message) => {
    if (!markQueryComplete(message.id)) return;

    addValue(message.value as TValue);
  });

  // trigger redraw if panning to already fetched data
  const onNothingToFetch = useCallback(() => {
    emitter.emit(drawEventType);
  }, [emitter]);

  // Agg granularities ordered from coarsest to finest
  const granularityLevels = useMemo(
    () =>
      [...ascBucketGranularities].reverse().map((granularity) => ({
        ...getLevel(granularity, true),
        bucketSizeNs: nsBucketSizes[granularity],
      })),
    [getLevel],
  );

  const query = useCallback(
    (
      referenceNs: bigint,
      visibleRange: TsRange,
      worldRange: TsRange,
      granularity: AggGranularity,
      fallbackLevels: DataLevel[] = granularityLevels,
    ) => {
      const visibleRangeNs: NsTsRange = calcAbsoluteNsRange(
        referenceNs,
        visibleRange,
      );
      const worldRangeNs: NsTsRange = calcAbsoluteNsRange(
        referenceNs,
        worldRange,
      );
      queryRange(
        visibleRangeNs,
        worldRangeNs,
        granularity,
        params,
        onNothingToFetch,
        (tileRangeNs) =>
          hasFallbackData(
            fallbackLevels,
            granularity,
            tileRangeNs,
            visibleRangeNs[1] - visibleRangeNs[0],
            worldRangeNs,
          ),
      );
    },
    [granularityLevels, onNothingToFetch, queryRange, params],
  );

  useLayoutEffect(() => registerPrefetcher(prefetch), [prefetch]);

  /** Agg granularity to draw each span from, or a fallback if not loaded */
  const getDrawTiles: GetDrawTiles = useCallback(
    (drawGranularity, firstBucketIdx, lastBucketIdx) => {
      const referenceNs = store.get(referenceNsAtom);
      const visibleRange = store.get(visibleRangeAtom);
      const worldRange = store.get(worldRangeAtom);
      return getCoverageDrawTiles(
        granularityLevels,
        drawGranularity,
        visibleRange ? getWindowNs(visibleRange) : 0n,
        referenceNs != null && worldRange
          ? calcAbsoluteNsRange(referenceNs, worldRange)
          : undefined,
        drawGranularity,
        firstBucketIdx,
        lastBucketIdx,
      );
    },
    [granularityLevels],
  );

  useLayoutEffect(() => {
    if (!drawTilesAtom) return;
    store.set(drawTilesAtom, () => getDrawTiles);
    return () => store.set(drawTilesAtom, undefined);
  }, [drawTilesAtom, getDrawTiles]);

  return {
    query,
    granularityLevels,
    getDrawTiles,
    pauseStaleRefreshes,
    clearCache,
  };
}
