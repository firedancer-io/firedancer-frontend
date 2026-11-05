import { useCallback } from "react";
import {
  getDefaultStore,
  useAtomValue,
  useSetAtom,
  type Atom,
  type WritableAtom,
} from "jotai";
import type TypedEmitter from "typed-emitter";
import { useWebSocketSend } from "../../api/ws/utils";
import type { AggGranularity } from "../../api/types";
import type { NsTsRange, TsRange } from "../WebGl/webglUtils";
import {
  calcAbsoluteNs,
  getTileIdx,
  getVisibleWorldRangeNs,
  useTimelineServerMessage,
} from "./utils";
import { useTiledQueries } from "./useTiledQueries";
import { ascBucketGranularities, msBucketSizes, nsBucketSizes } from "./const";
import {
  referenceNsAtom,
  worldRangeAtom,
  type TimelineQueryKey,
} from "./atoms";

const store = getDefaultStore();

export const drawEventType = "draw";

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

export type DrawEmitter = TypedEmitter<{ [drawEventType]: () => void }>;

type AddAtom<TValue> = WritableAtom<null, [TValue], void>;

type DeleteBucketsAtom = WritableAtom<null, [AggGranularity, number[]], void>;

interface UseAggQueryOpts<TValue, TParams extends object> {
  chartId: string;
  queryKey: TimelineQueryKey;
  /** target granularity for a visible window size */
  getGranularity: (windowSizeMs: number) => AggGranularity;
  addAtom: AddAtom<TValue>;
  deleteBucketsAtom: DeleteBucketsAtom;
  emitterAtom: Atom<DrawEmitter>;
  params?: TParams;
}

export function useAggQuery<TValue, TParams extends object = object>({
  chartId,
  queryKey,
  getGranularity,
  addAtom,
  deleteBucketsAtom,
  emitterAtom,
  params,
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
    [wsSend, queryKey, params],
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

  const {
    queryRange,
    markQueryComplete,
    isRangeFetched,
    getGranularitiesWithData,
    pauseStaleRefreshes,
    resetQueries,
  } = useTiledQueries<AggGranularity>({
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

  /**
   * Granularity to draw each target tile in [firstTileIdx, lastTileIdx] from:
   * the target if its tile has loaded, otherwise the closest (coarser on ties)
   * granularity whose loaded tiles fully cover its in-world range. Tiles are
   * never fetched outside the world, so the world start and end (live) tiles
   * can only be covered within it.
   */
  const getTileGranularities = useCallback(
    (
      targetGranularity: AggGranularity,
      firstTileIdx: number,
      lastTileIdx: number,
    ): (AggGranularity | undefined)[] => {
      const targetIdx = ascBucketGranularities.indexOf(targetGranularity);
      const getDist = (g: AggGranularity) =>
        ascBucketGranularities.indexOf(g) - targetIdx;
      const candidates = getGranularitiesWithData().sort(
        (a, b) =>
          Math.abs(getDist(a)) - Math.abs(getDist(b)) ||
          getDist(b) - getDist(a),
      );
      const tileSizeNs = getTileSizeNs(targetGranularity);

      const referenceNs = store.get(referenceNsAtom);
      const worldRange = store.get(worldRangeAtom);
      const [worldStartNs, worldEndNs]: NsTsRange =
        referenceNs != null && worldRange
          ? [
              calcAbsoluteNs(referenceNs, worldRange[0]),
              calcAbsoluteNs(referenceNs, worldRange[1]),
            ]
          : [0n, BigInt(lastTileIdx + 1) * tileSizeNs];

      const granularities: (AggGranularity | undefined)[] = [];
      for (let tileIdx = firstTileIdx; tileIdx <= lastTileIdx; tileIdx++) {
        const tileStartNs = BigInt(tileIdx) * tileSizeNs;
        const tileRangeNs: NsTsRange = [
          tileStartNs > worldStartNs ? tileStartNs : worldStartNs,
          tileStartNs + tileSizeNs < worldEndNs
            ? tileStartNs + tileSizeNs
            : worldEndNs,
        ];
        granularities.push(
          candidates.find((g) => isRangeFetched(g, tileRangeNs)),
        );
      }
      return granularities;
    },
    [getGranularitiesWithData, isRangeFetched],
  );

  /**
   * One entry per tile overlapping target granularity buckets
   * [firstBucketIdx, lastBucketIdx], clipped to them, with the granularity the
   * tile is drawn from. Tiles without data are skipped.
   */
  const getDrawTiles = useCallback(
    (
      targetGranularity: AggGranularity,
      firstBucketIdx: number,
      lastBucketIdx: number,
    ): AggDrawTile[] => {
      const firstTileIdx = Math.floor(firstBucketIdx / BUCKETS_PER_TILE);
      const tileGranularities = getTileGranularities(
        targetGranularity,
        firstTileIdx,
        Math.floor(lastBucketIdx / BUCKETS_PER_TILE),
      );

      const drawTiles: AggDrawTile[] = [];
      tileGranularities.forEach((granularity, i) => {
        if (granularity == null) return;

        const tileIdx = firstTileIdx + i;
        drawTiles.push({
          granularity,
          first: Math.max(firstBucketIdx, tileIdx * BUCKETS_PER_TILE),
          last: Math.min(lastBucketIdx, (tileIdx + 1) * BUCKETS_PER_TILE - 1),
        });
      });
      return drawTiles;
    },
    [getTileGranularities],
  );

  /**
   * Whether every in-world visible tile can be drawn from some granularity
   */
  const isVisibleDrawable = useCallback(
    (referenceNs: bigint, visibleRange: TsRange, worldRange: TsRange) => {
      const targetGranularity = getGranularity(
        visibleRange[1] - visibleRange[0],
      );
      const [startNs, endNs] = getVisibleWorldRangeNs(
        referenceNs,
        visibleRange,
        worldRange,
      );
      if (endNs <= startNs) return true;

      const tileSizeNs = getTileSizeNs(targetGranularity);
      return getTileGranularities(
        targetGranularity,
        getTileIdx(startNs, tileSizeNs, false),
        getTileIdx(endNs, tileSizeNs, true),
      ).every((g) => g != null);
    },
    [getGranularity, getTileGranularities],
  );

  return {
    query,
    getDrawTiles,
    isVisibleDrawable,
    pauseStaleRefreshes,
    resetQueries,
  };
}

/**
 * A tile's inclusive target granularity buckets, drawn from `granularity` data
 */
interface AggDrawTile {
  granularity: AggGranularity;
  first: number;
  last: number;
}

export type GetDrawTiles = ReturnType<typeof useAggQuery>["getDrawTiles"];

/**
 * A bucket overlapping a target bucket, with the overlap duration
 */
export interface BucketOverlap<V> {
  value: V;
  overlapMs: number;
  bucketMs: number;
}

/**
 * Call `fn` with each draw tile bucket that has data. Buckets from a fallback
 * granularity are resampled to the target granularity by `resample`, from
 * the fallback buckets overlapping it.
 */
export function forEachDrawnBucket<V>(
  drawTiles: AggDrawTile[],
  targetGranularity: AggGranularity,
  bucketsByGranularity: Map<AggGranularity, Map<number, V>>,
  resample: (overlaps: BucketOverlap<V>[]) => V,
  fn: (bucketIdx: number, value: V) => void,
) {
  const targetMs = msBucketSizes[targetGranularity];
  for (const { granularity, first, last } of drawTiles) {
    const buckets = bucketsByGranularity.get(granularity);
    if (!buckets) continue;
    const bucketMs = msBucketSizes[granularity];

    for (let bucketIdx = first; bucketIdx <= last; bucketIdx++) {
      if (granularity === targetGranularity) {
        const value = buckets.get(bucketIdx);
        if (value !== undefined) fn(bucketIdx, value);
        continue;
      }

      const startMs = bucketIdx * targetMs;
      const endMs = startMs + targetMs;
      const overlaps: BucketOverlap<V>[] = [];
      for (
        let idx = Math.floor(startMs / bucketMs);
        idx * bucketMs < endMs;
        idx++
      ) {
        const value = buckets.get(idx);
        if (value === undefined) continue;
        const overlapMs =
          Math.min(endMs, (idx + 1) * bucketMs) -
          Math.max(startMs, idx * bucketMs);
        overlaps.push({ value, overlapMs, bucketMs });
      }
      if (overlaps.length) fn(bucketIdx, resample(overlaps));
    }
  }
}

/**
 * Keep drawing `prev` until all of `target`'s visible data has arrived, as
 * long as all of `prev`'s visible data is still available.
 */
export function resolveHeldDraw<T>(
  prev: T | undefined,
  target: T,
  isVisibleDrawable: (value: T) => boolean,
): T {
  if (prev === undefined || prev === target || isVisibleDrawable(target))
    return target;
  return isVisibleDrawable(prev) ? prev : target;
}
