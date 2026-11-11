import { useCallback, useEffect } from "react";
import type { NsTsRange, TsRange } from "../../WebGl/webglUtils";
import { calcAbsoluteNs, calcAbsoluteNsRange } from "../utils";
import type { TileCache, TileCacheDelta } from "./cache";

/**
 * Returns a callback that requests a visible tile range from
 * the cache. The cache dedups identical requests and fetches
 * any missing tiles over the websocket.
 */
export function useTileCacheQuery<TData, TMeta>(
  cache: TileCache<TData, TMeta>,
  hasFallbackData?: (tileRangeNs: NsTsRange) => boolean,
): (
  referenceNs: bigint,
  visibleRangeMs: TsRange,
  worldRangeMs: TsRange,
) => void {
  return useCallback(
    (referenceNs: bigint, visibleRangeMs: TsRange, worldRangeMs: TsRange) => {
      const visibleRangeNs = calcAbsoluteNsRange(referenceNs, visibleRangeMs);
      const worldEndNs = calcAbsoluteNs(referenceNs, worldRangeMs[1]);
      cache.requestRange(visibleRangeNs, worldEndNs, hasFallbackData);
    },
    [cache, hasFallbackData],
  );
}

/**
 * Subscribes to cache deltas
 */
export function useTileCacheSubscription<TData, TMeta>(
  cache: TileCache<TData, TMeta>,
  onDelta: (delta: TileCacheDelta<TData, TMeta>) => void,
): void {
  useEffect(() => cache.subscribe(onDelta), [cache, onDelta]);
}
