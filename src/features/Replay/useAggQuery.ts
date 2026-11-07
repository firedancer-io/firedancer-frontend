import { useCallback, useMemo } from "react";
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
  calcAbsoluteNsRange,
  getVisibleWorldRangeNs,
  useTimelineServerMessage,
} from "./utils";
import { useTiledQueries } from "./useTiledQueries";
import { isRangeCovered, resolveCoverage, type DataLevel } from "./coverage";
import { ascBucketGranularities, msBucketSizes, nsBucketSizes } from "./const";
import {
  referenceNsAtom,
  worldRangeAtom,
  type TimelineQueryKey,
} from "./atoms";

const store = getDefaultStore();

const drawEventType = "draw";

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

type DrawEmitter = TypedEmitter<{ [drawEventType]: () => void }>;

type AddAtom<TValue> = WritableAtom<null, [TValue], void>;

type DeleteBucketsAtom = WritableAtom<null, [AggGranularity, number[]], void>;

interface UseAggQueryOpts<TValue, TParams extends object> {
  chartId: string;
  queryKey: TimelineQueryKey;
  addAtom: AddAtom<TValue>;
  deleteBucketsAtom: DeleteBucketsAtom;
  emitterAtom: Atom<DrawEmitter>;
  params?: TParams;
}

export function useAggQuery<TValue, TParams extends object = object>({
  chartId,
  queryKey,
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
    getLevel,
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

  /** agg granularities from coarsest to finest */
  const granularityLevels = useMemo(
    () =>
      [...ascBucketGranularities]
        .reverse()
        .map((granularity) => getLevel(granularity, true)),
    [getLevel],
  );

  /**
   * Draw tiles resolved from agg granularities only
   */
  const getDrawTiles: GetDrawTiles = useCallback(
    (drawGranularity, firstBucketIdx, lastBucketIdx) => {
      const referenceNs = store.get(referenceNsAtom);
      const worldRange = store.get(worldRangeAtom);
      return getCoverageDrawTiles(
        granularityLevels,
        drawGranularity,
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

  /**
   * Whether every in-world visible tile can be drawn from some granularity
   */
  const isVisibleDrawable = useCallback(
    (
      targetGranularity: AggGranularity,
      referenceNs: bigint,
      visibleRange: TsRange,
      worldRange: TsRange,
    ) =>
      isRangeCovered(
        granularityLevels,
        targetGranularity,
        getVisibleWorldRangeNs(referenceNs, visibleRange, worldRange),
        calcAbsoluteNsRange(referenceNs, worldRange),
      ),
    [granularityLevels],
  );

  return {
    query,
    granularityLevels,
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

export type GetDrawTiles = (
  drawGranularity: AggGranularity,
  firstBucketIdx: number,
  lastBucketIdx: number,
) => AggDrawTile[];

/**
 * One entry per agg span of draw granularity buckets
 * [firstBucketIdx, lastBucketIdx], with the agg granularity the span is drawn
 * from. Spans are resolved for the target level, which may be non agg. Spans
 * without agg data are skipped.
 */
export function getCoverageDrawTiles<Id extends string>(
  granularityLevels: DataLevel<Id>[],
  targetId: Id,
  worldRangeNs: NsTsRange | undefined,
  drawGranularity: AggGranularity,
  firstBucketIdx: number,
  lastBucketIdx: number,
): AggDrawTile[] {
  const bucketNs = nsBucketSizes[drawGranularity];
  const ceilBucketIdx = (ns: bigint) => Number((ns + bucketNs - 1n) / bucketNs);

  const drawTiles: AggDrawTile[] = [];
  for (const { rangeNs, level } of resolveCoverage(
    granularityLevels,
    targetId,
    [BigInt(firstBucketIdx) * bucketNs, BigInt(lastBucketIdx + 1) * bucketNs],
    worldRangeNs,
  )) {
    if (!level?.isAgg) continue;
    // A bucket belongs to the span containing its start, so spans that aren't
    // bucket aligned don't share buckets
    const first = ceilBucketIdx(rangeNs[0]);
    const last = ceilBucketIdx(rangeNs[1]) - 1;
    if (last < first) continue;
    drawTiles.push({
      // agg levels are agg granularities
      granularity: level.id as AggGranularity,
      first,
      last,
    });
  }
  return drawTiles;
}

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
