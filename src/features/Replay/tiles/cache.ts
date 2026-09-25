import { getDefaultStore } from "jotai";
import type { SendMessage } from "../../../api/ws/types";
import { socketStateAtom } from "../../../api/ws/atoms";
import { SocketState } from "../../../api/ws/types";
import type { NsTsRange } from "../../WebGl/webglUtils";
import { splitFetch, type FetchResult, type Interval } from "./splitFetch";

const store = getDefaultStore();

export interface Tile<TData, TMeta> {
  startNs: bigint;
  endNs: bigint;
  data: TData;
  meta: TMeta;
}

export interface TileCacheConfig<TData, TMeta> {
  tileNs: bigint;
  minSubTileNs: bigint;
  maxItems: number;
  overscan?: number;
  empty: () => TData;
  merge: (acc: TData, add: TData) => void;
  itemCount: (data: TData) => number;
  deriveMeta: (data: TData) => TMeta;
  fetch: (
    wsSend: SendMessage,
    window: Interval,
    requestId: number,
  ) => Promise<FetchResult<TData>>;
  failPendingRequests: () => void;
}

export type TileCacheDelta<TData, TMeta> =
  | { kind: "add"; tiles: Tile<TData, TMeta>[] }
  | { kind: "live"; tile: Tile<TData, TMeta> }
  | { kind: "reset" };

export type Unsubscribe = () => void;
export interface TileCache<TData, TMeta> {
  subscribe: (
    listener: (delta: TileCacheDelta<TData, TMeta>) => void,
  ) => Unsubscribe;
  getTiles: () => Tile<TData, TMeta>[];
  requestRange: (
    wsSend: SendMessage,
    visibleRangeNs: NsTsRange,
    worldEndNs: bigint,
  ) => void;
  init: () => Unsubscribe;
  reset: () => void;
}

function insertionIndex(sorted: number[], id: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sorted[mid] < id) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

interface CachedTile<TData, TMeta> {
  data: TData;
  meta: TMeta;
}

/**
 * Creates a cache for timeseries data stored as time bucketed tiles that
 * are fetched on demand and published to subscribers as deltas.
 */
export function createTileCache<TData, TMeta>({
  tileNs,
  minSubTileNs,
  maxItems,
  overscan = 1,
  empty,
  merge,
  itemCount,
  deriveMeta,
  fetch,
  failPendingRequests,
}: TileCacheConfig<TData, TMeta>): TileCache<TData, TMeta> {
  const tileCache = new Map<number, CachedTile<TData, TMeta>>();
  const listeners = new Set<(delta: TileCacheDelta<TData, TMeta>) => void>();
  const sortedTileIds: number[] = [];
  const requestedTilesForView = new Set<number>();

  let cachedItems = 0;
  let viewStartTileId = 0;
  let viewEndTileId = -1;
  let liveTileId: number | null = null;
  let lastStartNs: bigint | null = null;
  let lastEndNs: bigint | null = null;
  let lastWorldEndNs: bigint | null = null;
  let inFlightTileId: number | null = null;
  let nextRequestId = 0;

  function tileIdOf(ns: bigint): number {
    return Number(ns / tileNs);
  }

  function getRange(id: number): Interval {
    const start = BigInt(id) * tileNs;
    return [start, start + tileNs - 1n];
  }

  function publish(delta: TileCacheDelta<TData, TMeta>): void {
    for (const listener of listeners) listener(delta);
  }

  function getTiles(): Tile<TData, TMeta>[] {
    const tiles: Tile<TData, TMeta>[] = [];
    for (const id of sortedTileIds) {
      const cached = tileCache.get(id);
      if (!cached) continue;
      const [startNs, endNs] = getRange(id);
      tiles.push({ startNs, endNs, data: cached.data, meta: cached.meta });
    }
    return tiles;
  }

  /**
   * Evicts tiles farthest from current view until back under max cached items
   */
  function evictTilesToMaxItems(): void {
    if (cachedItems <= maxItems) return;

    while (sortedTileIds.length > 0 && cachedItems > maxItems) {
      const earliestTileId = sortedTileIds[0];
      const latestTileId = sortedTileIds[sortedTileIds.length - 1];
      const earliestToViewDist = viewStartTileId - earliestTileId;
      const latestToViewDist = latestTileId - viewEndTileId;
      // Tiles in the current view never get evicted even if over max cached items
      if (earliestToViewDist <= 0 && latestToViewDist <= 0) break;

      let evictedTileId: number;
      if (latestToViewDist >= earliestToViewDist) {
        evictedTileId = latestTileId;
        sortedTileIds.pop();
      } else {
        evictedTileId = earliestTileId;
        sortedTileIds.shift();
      }
      const cached = tileCache.get(evictedTileId);
      if (cached) cachedItems -= itemCount(cached.data);
      tileCache.delete(evictedTileId);
    }
  }

  function publishLiveTile(tileId: number, data: TData): void {
    const [startNs, endNs] = getRange(tileId);
    publish({
      kind: "live",
      tile: { startNs, endNs, data, meta: deriveMeta(data) },
    });
  }

  function cacheTile(tileId: number, data: TData): void {
    sortedTileIds.splice(insertionIndex(sortedTileIds, tileId), 0, tileId);
    cachedItems += itemCount(data);
    const meta = deriveMeta(data);
    tileCache.set(tileId, { data, meta });

    evictTilesToMaxItems();
    const [startNs, endNs] = getRange(tileId);
    const tile: Tile<TData, TMeta> = { startNs, endNs, data, meta };

    publish({ kind: "add", tiles: [tile] });
  }

  function fetchTileData(wsSend: SendMessage, tileId: number) {
    return splitFetch<TData>(getRange(tileId), {
      minWindowInterval: minSubTileNs,
      empty,
      merge,
      fetch: (window) => fetch(wsSend, window, nextRequestId++),
    });
  }

  async function fetchTile(
    wsSend: SendMessage,
    tileId: number,
    isLive: boolean,
  ): Promise<void> {
    inFlightTileId = tileId;
    try {
      const { data, canRetry } = await fetchTileData(wsSend, tileId);
      if (canRetry) return;
      if (isLive) publishLiveTile(tileId, data);
      else cacheTile(tileId, data);
    } finally {
      inFlightTileId = null;
      fetchNextTile(wsSend);
    }
  }

  /** The tile nearest to the center of the current view that still needs to be fetched */
  function nextTileToFetch(): number | undefined {
    if (viewEndTileId < viewStartTileId || liveTileId === null)
      return undefined;

    const low = Math.max(0, viewStartTileId - overscan);
    const high = Math.max(
      viewEndTileId,
      Math.min(liveTileId, viewEndTileId + overscan),
    );
    const center = (viewStartTileId + viewEndTileId) / 2;

    let nextTile: number | undefined;
    let tileDist = 0;
    for (let id = low; id <= high; id++) {
      if (requestedTilesForView.has(id) || tileCache.has(id)) continue;
      const dist = id > center ? id - center : center - id;
      if (nextTile === undefined || dist < tileDist) {
        nextTile = id;
        tileDist = dist;
      }
    }
    return nextTile;
  }

  function fetchNextTile(wsSend: SendMessage): void {
    if (inFlightTileId !== null) return;

    const next = nextTileToFetch();
    if (next === undefined) return;

    requestedTilesForView.add(next);
    void fetchTile(wsSend, next, next === liveTileId);
  }

  function requestRange(
    wsSend: SendMessage,
    visibleRangeNs: NsTsRange,
    worldEndNs: bigint,
  ): void {
    const [startNs, endNs] = visibleRangeNs;
    if (endNs <= startNs) return;
    if (
      startNs === lastStartNs &&
      endNs === lastEndNs &&
      worldEndNs === lastWorldEndNs
    )
      return;

    lastStartNs = startNs;
    lastEndNs = endNs;
    lastWorldEndNs = worldEndNs;

    liveTileId = tileIdOf(worldEndNs);
    requestedTilesForView.clear();

    viewStartTileId = tileIdOf(startNs);
    viewEndTileId = tileIdOf(endNs);

    fetchNextTile(wsSend);
  }

  function init(): () => void {
    return store.sub(socketStateAtom, () => {
      if (store.get(socketStateAtom) === SocketState.Disconnected) {
        failPendingRequests();
      }
    });
  }

  function reset(): void {
    failPendingRequests();
    tileCache.clear();
    sortedTileIds.length = 0;
    cachedItems = 0;
    inFlightTileId = null;
    viewStartTileId = 0;
    viewEndTileId = -1;
    requestedTilesForView.clear();
    liveTileId = null;
    lastStartNs = null;
    lastEndNs = null;
    lastWorldEndNs = null;
    publish({ kind: "reset" });
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getTiles,
    requestRange,
    init,
    reset,
  };
}
