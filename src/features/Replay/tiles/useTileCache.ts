import { useCallback, useEffect } from "react";
import { useWebSocketSend } from "../../../api/ws/utils";
import type { NsTsRange, TsRange } from "../../WebGl/webglUtils";
import { calcAbsoluteNs } from "../utils";
import type { TileCache, TileCacheDelta } from "./cache";

/**
 * Returns a callback that requests a visible tile range from
 * the cache. The cache dedups identical requests and fetches
 * any missing tiles over the websocket.
 */
export function useTileCacheQuery<TData, TMeta>(
  cache: TileCache<TData, TMeta>,
): (
  referenceNs: bigint,
  visibleRangeMs: TsRange,
  worldRangeMs: TsRange,
) => void {
  const wsSend = useWebSocketSend();

  return useCallback(
    (referenceNs: bigint, visibleRangeMs: TsRange, worldRangeMs: TsRange) => {
      const visibleRangeNs: NsTsRange = [
        calcAbsoluteNs(referenceNs, visibleRangeMs[0]),
        calcAbsoluteNs(referenceNs, visibleRangeMs[1]),
      ];
      const worldEndNs = calcAbsoluteNs(referenceNs, worldRangeMs[1]);
      cache.requestRange(wsSend, visibleRangeNs, worldEndNs);
    },
    [cache, wsSend],
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
