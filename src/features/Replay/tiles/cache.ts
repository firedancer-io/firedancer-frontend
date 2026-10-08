import { getDefaultStore } from "jotai";
import type { SendMessage } from "../../../api/ws/types";
import { isConnectedAtom, socketStateAtom } from "../../../api/ws/atoms";
import { SocketState } from "../../../api/ws/types";
import type { NsTsRange } from "../../WebGl/webglUtils";
import { splitFetch, type FetchResult, type Interval } from "./splitFetch";

const store = getDefaultStore();

const LIVE_QUERY_INTERVAL_MS = 100;
const LIVE_QUERY_STEP_NS = 100_000_000n; // 100ms

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
  maxTiles: number;
  overscan?: number;
  empty: () => TData;
  merge: (acc: TData, add: TData) => void;
  itemCount: (data: TData) => number;
  deriveMeta: (data: TData) => TMeta;
  filterOwned: (data: TData, window: Interval) => TData;
  fetch: (
    wsSend: SendMessage,
    window: Interval,
    requestId: number,
  ) => Promise<FetchResult<TData>>;
  failPendingRequests: () => void;
}

export type TileCacheDelta<TData, TMeta> =
  | { kind: "add"; tiles: Tile<TData, TMeta>[] }
  | {
      kind: "live";
      tile: Tile<TData, TMeta>;
      newData: TData;
      isNewTile: boolean;
    }
  | { kind: "clearLive" }
  | { kind: "reset" };

export type Unsubscribe = () => void;
export interface TileCache<TData, TMeta> {
  subscribe: (
    listener: (delta: TileCacheDelta<TData, TMeta>) => void,
  ) => Unsubscribe;
  getTiles: () => Tile<TData, TMeta>[];
  requestRange: (visibleRangeNs: NsTsRange, worldEndNs: bigint) => void;
  init: (wsSend: SendMessage) => Unsubscribe;
  reset: () => void;
}

interface CachedTile<TData, TMeta> {
  data: TData;
  meta: TMeta;
}

interface LiveState<TData> {
  acc: { tileId: number; data: TData; fetchedEndNs: bigint } | null;
  inFlight: boolean;
  targetEndNs: bigint | null;
  lastQueryTime: number;
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

/**
 * Creates a cache for timeseries data stored as time bucketed tiles that
 * are fetched on demand and published to subscribers as deltas.
 */
export function createTileCache<TData, TMeta>({
  tileNs,
  minSubTileNs,
  maxItems,
  maxTiles,
  overscan = 1,
  empty,
  merge,
  itemCount,
  deriveMeta,
  filterOwned,
  fetch,
  failPendingRequests,
}: TileCacheConfig<TData, TMeta>): TileCache<TData, TMeta> {
  const tileCache = new Map<number, CachedTile<TData, TMeta>>();
  const listeners = new Set<(delta: TileCacheDelta<TData, TMeta>) => void>();
  const sortedTileIds: number[] = [];
  const requestedTilesForView = new Set<number>();

  let send: SendMessage | null = null;
  let generation = 0;
  let cachedItems = 0;
  let lastStartNs: bigint | null = null;
  let lastEndNs: bigint | null = null;
  let lastWorldEndNs: bigint | null = null;
  let inFlightTileId: number | null = null;
  let nextRequestId = 0;

  const live: LiveState<TData> = {
    acc: null,
    inFlight: false,
    targetEndNs: null,
    lastQueryTime: -Infinity,
  };

  function tileIdOf(ns: bigint): number {
    return Number(ns / tileNs);
  }

  // Used to prevent a fetch that resolved before a cache reset from clobbering
  // current cache state when its handling runs after the reset
  function isStale(gen: number): boolean {
    return gen !== generation;
  }

  function getRange(id: number): Interval {
    const startNs = BigInt(id) * tileNs;
    return [startNs, startNs + tileNs - 1n];
  }

  function getViewTileRange(): [number, number] {
    if (lastStartNs === null || lastEndNs === null) return [0, -1];
    return [tileIdOf(lastStartNs), tileIdOf(lastEndNs)];
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

  function isTileInView(tileId: number): boolean {
    const [viewStartTileId, viewEndTileId] = getViewTileRange();
    if (viewEndTileId < viewStartTileId) return false;
    return (
      viewStartTileId - overscan <= tileId && tileId <= viewEndTileId + overscan
    );
  }

  function isCacheOverBudget(): boolean {
    return cachedItems > maxItems || sortedTileIds.length > maxTiles;
  }

  /**
   * Evicts tiles farthest from current view until back under both the max item
   * and max tile budget
   */
  function evictToBudget(): void {
    if (!isCacheOverBudget()) return;

    const [viewStartTileId, viewEndTileId] = getViewTileRange();
    while (sortedTileIds.length > 0 && isCacheOverBudget()) {
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

  function cacheTile(tileId: number, data: TData): void {
    if (tileCache.has(tileId)) return;

    sortedTileIds.splice(insertionIndex(sortedTileIds, tileId), 0, tileId);
    cachedItems += itemCount(data);
    const meta = deriveMeta(data);
    tileCache.set(tileId, { data, meta });
    evictToBudget();

    if (!tileCache.has(tileId)) return;

    const [startNs, endNs] = getRange(tileId);
    publish({ kind: "add", tiles: [{ startNs, endNs, data, meta }] });
  }

  function fetchDataForRange(range: Interval) {
    const gen = generation;
    return splitFetch<TData>(range, {
      minWindowInterval: minSubTileNs,
      empty,
      merge,
      filterOwned,
      fetch: (window) =>
        isStale(gen) || send === null
          ? Promise.resolve<FetchResult<TData>>({ errorCode: "cancelled" })
          : fetch(send, window, nextRequestId++),
    });
  }

  /** The tile nearest to the center of the current view that still needs to be fetched */
  function nextTileToFetch(): number | undefined {
    const liveTileId =
      lastWorldEndNs === null ? null : tileIdOf(lastWorldEndNs);
    const [viewStartTileId, viewEndTileId] = getViewTileRange();
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
      if (id === liveTileId || id === live.acc?.tileId) continue;
      if (requestedTilesForView.has(id) || tileCache.has(id)) continue;
      const dist = id > center ? id - center : center - id;
      if (nextTile === undefined || dist < tileDist) {
        nextTile = id;
        tileDist = dist;
      }
    }
    return nextTile;
  }

  async function fetchNextTile(): Promise<void> {
    if (inFlightTileId !== null) return;
    if (send === null) return;
    if (!store.get(isConnectedAtom)) return;

    const tileId = nextTileToFetch();
    if (tileId === undefined) return;

    const gen = generation;
    requestedTilesForView.add(tileId);
    inFlightTileId = tileId;
    const { data, canRetry } = await fetchDataForRange(getRange(tileId));
    if (isStale(gen)) return;

    if (!canRetry) cacheTile(tileId, data);
    inFlightTileId = null;
    void fetchNextTile();
  }

  function startLive(tileId: number): void {
    const [tileStartNs] = getRange(tileId);
    live.acc = {
      tileId,
      data: empty(),
      fetchedEndNs: tileStartNs - 1n,
    };
  }

  function resetLive(): void {
    live.acc = null;
    live.targetEndNs = null;
    live.lastQueryTime = -Infinity;
  }

  async function fetchLiveRange(endNs: bigint): Promise<boolean> {
    if (live.acc === null) return false;

    const startNs = live.acc.fetchedEndNs + 1n;
    if (endNs < startNs) return false;

    const gen = generation;
    const { data, canRetry } = await fetchDataForRange([startNs, endNs]);
    if (isStale(gen)) return false;
    if (canRetry) return true;
    if (live.acc === null || startNs !== live.acc.fetchedEndNs + 1n)
      return true;

    merge(live.acc.data, data);
    live.acc.fetchedEndNs = endNs;
    const [tileStartNs, tileEndNs] = getRange(live.acc.tileId);
    publish({
      kind: "live",
      tile: {
        startNs: tileStartNs,
        endNs: tileEndNs,
        data: live.acc.data,
        meta: deriveMeta(live.acc.data),
      },
      newData: data,
      isNewTile: startNs === tileStartNs,
    });
    return false;
  }

  async function advanceLive(worldEndNs: bigint): Promise<void> {
    if (send === null) return;
    const worldEndTileId = tileIdOf(worldEndNs);
    if (!isTileInView(worldEndTileId)) {
      if (live.acc !== null) {
        resetLive();
        publish({ kind: "clearLive" });
        void fetchNextTile();
      }
      return;
    }

    if (!live.inFlight && live.acc !== null && !isTileInView(live.acc.tileId)) {
      live.acc = null;
    }

    if (!store.get(isConnectedAtom)) return;

    if (live.acc === null) startLive(worldEndTileId);

    if (live.inFlight) {
      live.targetEndNs = worldEndNs;
      return;
    }

    // Throttle queries
    if (performance.now() - live.lastQueryTime < LIVE_QUERY_INTERVAL_MS) return;

    live.lastQueryTime = performance.now();
    live.inFlight = true;

    const gen = generation;
    while (live.acc !== null && live.acc.tileId < worldEndTileId) {
      const tileId = live.acc.tileId;
      const [, tileEndNs] = getRange(tileId);
      const canRetry = await fetchLiveRange(tileEndNs);
      if (isStale(gen)) return;
      if (live.acc === null || live.acc.tileId !== tileId) break;
      if (canRetry) {
        live.inFlight = false;
        return;
      }
      cacheTile(tileId, live.acc.data);
      startLive(tileId + 1);
    }

    if (live.acc?.tileId === worldEndTileId) {
      const alignedEndNs =
        (worldEndNs / LIVE_QUERY_STEP_NS) * LIVE_QUERY_STEP_NS - 1n;
      const canRetry = await fetchLiveRange(alignedEndNs);
      if (isStale(gen)) return;
      if (canRetry) {
        live.inFlight = false;
        return;
      }
    }

    live.inFlight = false;
    if (live.targetEndNs !== null) {
      const next = live.targetEndNs;
      live.targetEndNs = null;
      void advanceLive(next);
    }
  }

  function requestRange(visibleRangeNs: NsTsRange, worldEndNs: bigint): void {
    const [startNs, endNs] = visibleRangeNs;
    if (endNs <= startNs) return;

    const viewChanged = startNs !== lastStartNs || endNs !== lastEndNs;
    const worldChanged = worldEndNs !== lastWorldEndNs;
    if (!viewChanged && !worldChanged) return;

    lastStartNs = startNs;
    lastEndNs = endNs;
    lastWorldEndNs = worldEndNs;

    if (viewChanged) {
      requestedTilesForView.clear();
      void fetchNextTile();
    }

    if (worldChanged) void advanceLive(worldEndNs);
  }

  function init(wsSend: SendMessage): () => void {
    send = wsSend;

    // If a range was already requested while send was still not set, pick it back up now.
    if (lastStartNs !== null && lastEndNs !== null) void fetchNextTile();
    if (lastWorldEndNs !== null) void advanceLive(lastWorldEndNs);

    return store.sub(socketStateAtom, () => {
      if (store.get(socketStateAtom) === SocketState.Disconnected) {
        failPendingRequests();
      }
    });
  }

  function reset(): void {
    generation++;
    failPendingRequests();
    tileCache.clear();
    sortedTileIds.length = 0;
    cachedItems = 0;
    inFlightTileId = null;
    requestedTilesForView.clear();
    lastStartNs = null;
    lastEndNs = null;
    lastWorldEndNs = null;
    live.inFlight = false;
    resetLive();
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
