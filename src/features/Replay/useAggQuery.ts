import { useCallback } from "react";
import { useAtomValue, useSetAtom, type Atom, type WritableAtom } from "jotai";
import { useWebSocketSend } from "../../api/ws/utils";
import type { AggGranularity } from "../../api/types";
import type { NsTsRange, TsRange } from "../WebGl/webglUtils";
import { calcAbsoluteNs, useTimelineServerMessage } from "./utils";
import { useTiledQueries } from "./useTiledQueries";
import { drawEventType, nsBucketSizes, type DrawEmitter } from "./const";
import type { TimelineQueryKey } from "./atoms";

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

interface UseAggQueryOpts<TValue> {
  chartId: string;
  queryKey: TimelineQueryKey;
  addAtom: AddAtom<TValue>;
  deleteBucketsAtom: DeleteBucketsAtom;
  emitterAtom: Atom<DrawEmitter>;
}

export function useAggQuery<TValue>({
  chartId,
  queryKey,
  addAtom,
  deleteBucketsAtom,
  emitterAtom,
}: UseAggQueryOpts<TValue>) {
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
    ) => {
      wsSend({
        topic: "timeline",
        key: queryKey,
        id: queryId,
        params: {
          start_ns: startNs.toString(),
          end_ns: endNs.toString(),
          granularity,
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

  const { queryRange, markQueryComplete, pauseStaleRefreshes } =
    useTiledQueries<AggGranularity>({
      chartId,
      getTileSizeNs,
      overscanTilesCount: OVERSCAN_TILES_COUNT,
      queryKey,
      sendQuery,
      getTileEvictionHighWatermark,
      getTileEvictionLowWatermark,
      onEvictTiles,
    });

  useTimelineServerMessage(queryKey, (message) => {
    if (!markQueryComplete(message.id)) return;

    addValue(message.value as TValue);
  });

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
