import { nsPerMs } from "../../consts.ts";
import {
  AGG_BUCKET_COUNT_THRESHOLD,
  ascBucketGranularities,
  DEFAULT_WINDOW_MS,
  minAggGranularities,
  msBucketSizes,
  nsBucketSizes,
} from "./const.ts";
import { AGG_SLOTS_QUERY_KEY } from "./useSlotsQuery.ts";
import { clamp } from "../../uplotReact/utils.ts";
import type { NsTsRange, TsRange } from "../WebGl/webglUtils.ts";
import { convertToNsTimestamp } from "../../mathUtils.ts";
import { getDefaultStore } from "jotai";
import { useServerMessages } from "../../api/ws/utils.ts";
import type { WsEntity, WsError } from "../../api/worker/types.ts";
import type { AggGranularity, Tile } from "../../api/types.ts";
import type { TimelineAggQueryKey } from "./atoms.ts";
import { rootSlotAtom } from "../../api/atoms.ts";
import { slotPublishAtomFamily } from "../../atoms.ts";
import {
  OVERSCAN_DRAW_TILES_COUNT,
  tileSizeNs,
} from "./HeaderTrack/useNonAggHeaderQuery.ts";

export function getTileKey({ kind, kind_id }: Tile) {
  return `${kind}:${kind_id}`;
}

/**
 * The ts up to which fetched timeline data is final: the completed time of the
 * current root (rooted/confirmed) slot. Data before this will not change.
 */
export function getRootSlotNs(): bigint | undefined {
  const store = getDefaultStore();
  const rootSlot = store.get(rootSlotAtom);
  if (rootSlot == null) return undefined;
  return (
    store.get(slotPublishAtomFamily(rootSlot))?.completed_time_nanos ??
    undefined
  );
}

export function clampToWorld(range: TsRange, worldRange: TsRange) {
  return clamp(
    range[1] - range[0],
    range[0],
    range[1],
    worldRange[1] - worldRange[0],
    worldRange[0],
    worldRange[1],
  );
}

export function getInitVisibleRange(worldRange: TsRange): TsRange {
  return clampToWorld(
    // show right most data
    [worldRange[1] - DEFAULT_WINDOW_MS, worldRange[1]],
    worldRange,
  );
}

export function calcRelativeMs(referenceNs: bigint, valueNs: bigint) {
  return Number(valueNs - referenceNs) / nsPerMs;
}

export function calcAbsoluteNs(referenceNs: bigint, relativeMs: number) {
  return referenceNs + convertToNsTimestamp(relativeMs);
}

/** Map a viewport clientX to a cursor ms within the visible range. */
export function clientXToMs(
  clientX: number,
  rect: { left: number; width: number },
  visibleRange: TsRange,
) {
  const fraction = (clientX - rect.left) / rect.width;
  return visibleRange[0] + fraction * (visibleRange[1] - visibleRange[0]);
}

/** Inverse of clientXToMs: map a cursor ms to its viewport clientX. */
export function msToClientX(
  ms: number,
  rect: { left: number; width: number },
  visibleRange: TsRange,
) {
  const fraction = (ms - visibleRange[0]) / (visibleRange[1] - visibleRange[0]);
  return rect.left + fraction * rect.width;
}

/**
 * Absolute ns of a relative ms range
 */
export function calcAbsoluteNsRange(
  referenceNs: bigint,
  rangeMs: TsRange,
): NsTsRange {
  return [
    calcAbsoluteNs(referenceNs, rangeMs[0]),
    calcAbsoluteNs(referenceNs, rangeMs[1]),
  ];
}

/**
 * Absolute ns of the visible range clamped to the world range
 */
export function getVisibleWorldRangeNs(
  referenceNs: bigint,
  visibleRange: TsRange,
  worldRange: TsRange,
): NsTsRange {
  return [
    calcAbsoluteNs(referenceNs, Math.max(visibleRange[0], worldRange[0])),
    calcAbsoluteNs(referenceNs, Math.min(visibleRange[1], worldRange[1])),
  ];
}

type TimelineEntityForKey<TKey extends string> = Extract<
  WsEntity,
  { topic: "timeline"; key: TKey }
>;

type TimelineErrorForKey<TKey extends string> = Extract<
  WsError,
  { topic: "timeline"; key: TKey }
>;

function isTimelineKey<
  TMessage extends { topic: string; key: string },
  TKey extends string,
>(
  message: TMessage,
  key: TKey,
): message is Extract<TMessage, { topic: "timeline"; key: TKey }> {
  return message.topic === "timeline" && message.key === key;
}

export function useTimelineServerMessage<TKey extends string>(
  key: TKey,
  onMessage: (message: TimelineEntityForKey<TKey>) => void,
  onError?: (message: TimelineErrorForKey<TKey>) => void,
) {
  useServerMessages((message) => {
    if (message.type === "kv" && isTimelineKey(message, key)) {
      onMessage(message);
    } else if (message.type === "kvb") {
      for (const item of message.items) {
        if (isTimelineKey(item, key)) {
          onMessage(item);
        }
      }
    } else if (
      onError &&
      message.type === "error" &&
      isTimelineKey(message, key)
    ) {
      onError(message);
    }
  });
}

export function getBucketIdx(
  tsNs: bigint,
  granularity: AggGranularity,
  isEndTs: boolean,
) {
  const bucketSizeNs = nsBucketSizes[granularity];
  const idx = tsNs / bucketSizeNs;

  // for end ts on bucket boundary, return previous bucket idx
  if (isEndTs && idx * bucketSizeNs === tsNs) {
    return Number(idx) - 1;
  }
  return Number(idx);
}

/** Exclusive end of the window a chunked response covers */
export function getChunksEndNs(
  chunks: { chunk_ts: bigint; chunk_dur: bigint }[],
): bigint | undefined {
  const lastChunk = chunks.at(-1);
  return lastChunk && lastChunk.chunk_ts + lastChunk.chunk_dur;
}

/**
 * Assumes ts > 0
 */
export function getTileIdx(tsNs: bigint, tileSizeNs: bigint, isEndTs: boolean) {
  const idx = tsNs / tileSizeNs;

  // for end ts on tile boundary, return previous tile idx
  if (isEndTs && idx * tileSizeNs === tsNs) {
    return Number(idx) - 1;
  }
  return Number(idx);
}

/**
 * Get first and last tile idx for the visible range including overscan.
 * Clamp to world range tiles.
 */
export function getTileIdxRangeWithOverscan(
  [visibleStartNs, visibleEndNs]: readonly [bigint, bigint],
  [worldStartNs, worldEndNs]: readonly [bigint, bigint],
  tileSizeNs: bigint,
  overscanTilesCount: number,
): { firstTile: number; lastTile: number } {
  // clamp query to world bounds
  const worldFirstTile = getTileIdx(worldStartNs, tileSizeNs, false);
  const worldLastTile = getTileIdx(worldEndNs, tileSizeNs, true);

  const firstTile = Math.max(
    worldFirstTile,
    getTileIdx(visibleStartNs, tileSizeNs, false) - overscanTilesCount,
  );
  const lastTile = Math.min(
    worldLastTile,
    getTileIdx(visibleEndNs, tileSizeNs, true) + overscanTilesCount,
  );

  return { firstTile, lastTile };
}

/**
 * Inclusive tile idxs for slots. Used for slot headers and slot hover
 */
export function getSlotDrawTileIdxs(
  referenceNs: bigint,
  visibleRange: TsRange,
): { startIdx: number; endIdx: number } {
  const startIdx =
    getTileIdx(
      calcAbsoluteNs(referenceNs, visibleRange[0]),
      tileSizeNs,
      false,
    ) - OVERSCAN_DRAW_TILES_COUNT;
  const endIdx =
    getTileIdx(calcAbsoluteNs(referenceNs, visibleRange[1]), tileSizeNs, true) +
    OVERSCAN_DRAW_TILES_COUNT;
  return { startIdx, endIdx };
}

/**
 * Get low insertion idx into a sorted list. Return info on whether
 * there's an order duplicate item (compare fn returning 0)
 */
export function getSortedInsertIdx<T>(
  sorted: T[],
  item: T,
  compare: (a: T, b: T) => number,
): { idx: number; isDuplicate: boolean } {
  // lower bound
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (compare(sorted[mid], item) < 0) lo = mid + 1;
    else hi = mid;
  }

  // an item at the insertion point that compares equal is a duplicate
  const isDuplicate = lo < sorted.length && compare(sorted[lo], item) === 0;

  return { idx: lo, isDuplicate };
}

/**
 * Insert into a sorted array. Returns false if item is a duplicate and is not inserted.
 */
export function insertSorted<T>(
  sorted: T[],
  item: T,
  compare: (a: T, b: T) => number,
): boolean {
  const { idx, isDuplicate } = getSortedInsertIdx(sorted, item, compare);
  if (isDuplicate) return false;

  sorted.splice(idx, 0, item);
  return true;
}

export interface AggGranularityOpts {
  // the level the window would use if the query had no finest granularity
  ignoreMinimum?: boolean;
}

export type GetAggGranularity = (
  windowSizeMs: number,
  opts?: AggGranularityOpts,
) => AggGranularity;

/**
 * Gets the finest granularity allowed for a query that shows at most
 * `bucketCountThreshold` buckets in the window
 */
export function getAggGranularityForQuery(
  queryKey: TimelineAggQueryKey,
  windowSizeMs: number,
  bucketCountThreshold: number,
  { ignoreMinimum = false }: AggGranularityOpts = {},
) {
  const minMs = ignoreMinimum
    ? 0
    : msBucketSizes[minAggGranularities[queryKey]];
  return (
    ascBucketGranularities.find((g) => {
      return (
        msBucketSizes[g] >= minMs &&
        windowSizeMs < bucketCountThreshold * msBucketSizes[g]
      );
    }) ?? ascBucketGranularities[ascBucketGranularities.length - 1]
  );
}

export function getAggSlotsGranularity(
  windowSizeMs: number,
  opts?: AggGranularityOpts,
) {
  return getAggGranularityForQuery(
    AGG_SLOTS_QUERY_KEY,
    windowSizeMs,
    AGG_BUCKET_COUNT_THRESHOLD,
    opts,
  );
}
