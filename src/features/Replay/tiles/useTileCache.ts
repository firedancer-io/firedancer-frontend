import { useCallback, useEffect } from "react";
import { useWebSocketSend } from "../../../api/ws/utils";
import type { NsTsRange } from "../../WebGl/webglUtils";
import type { TileCache, TileCacheDelta } from "./cache";

/**
 * Returns a callback that requests a visible tile range from
 * the cache. The cache dedups identical requests and fetches
 * any missing tiles over the websocket.
 */
export function useTileCacheQuery<TData, TMeta>(
  cache: TileCache<TData, TMeta>,
): (visibleRangeNs: NsTsRange, worldEndNs: bigint) => void {
  const wsSend = useWebSocketSend();

  return useCallback(
    (visibleRangeNs: NsTsRange, worldEndNs: bigint) => {
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
