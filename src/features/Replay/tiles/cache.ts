import { getDefaultStore } from "jotai";
import { uniqueId } from "lodash";
import { isConnectedAtom, socketStateAtom } from "../../../api/ws/atoms";
import { SocketState } from "../../../api/ws/types";
import { smoothedNowNsAtom } from "../../../nowAtoms";
import { bigIntMax, bigIntMin } from "../../../mathUtils";
import { logError } from "../../../logger";
import type { NsTsRange } from "../../WebGl/webglUtils";
import { getSortedInsertIdx } from "../utils";
import { splitFetch, type FetchResult, type Interval } from "./splitFetch";

const store = getDefaultStore();

const LIVE_QUERY_INTERVAL_MS = 100;

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
  // a tile's data once it's fully fetched, as the cache keeps it
  complete?: (data: TData) => TData;
  deriveMeta: (data: TData) => TMeta;
  filterOwned?: (data: TData, window: Interval) => TData;
  fetch: (window: Interval, requestId: number) => Promise<FetchResult<TData>>;
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
  /**
   * Get the data of all tiles overlapping [startNs, endNs], including the live
   * tile's current data. Include boolean indicating whether there are missing
   * cached tiles.
   */
  getDataInRange: (
    startNs: bigint,
    endNs: bigint,
  ) => { data: TData[]; hasAllTilesCached: boolean };
  requestRange: (visibleRangeNs: NsTsRange, worldEndNs: bigint) => void;
  init: () => Unsubscribe;
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
  return getSortedInsertIdx(sorted, id, (a, b) => a - b).idx;
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
  complete = (data) => data,
  deriveMeta,
  filterOwned,
  fetch,
  failPendingRequests,
}: TileCacheConfig<TData, TMeta>): TileCache<TData, TMeta> {
  const tileCache = new Map<number, CachedTile<TData, TMeta>>();
  const listeners = new Set<(delta: TileCacheDelta<TData, TMeta>) => void>();
  const sortedTileIds: number[] = [];
  const requestedTilesForView = new Set<number>();

  // Prevents async work started before a reset from clobbering fresh cache state
  let controller = new AbortController();

  let cachedItems = 0;
  let lastStartNs: bigint | null = null;
  let lastEndNs: bigint | null = null;
  let lastWorldEndNs: bigint | null = null;
  const inFlightTileIds = new Set<number>();

  const live: LiveState<TData> = {
    acc: null,
    inFlight: false,
    targetEndNs: null,
    lastQueryTime: -Infinity,
  };

  function tileIdOf(ns: bigint): number {
    return Number(ns / tileNs);
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
    for (const listener of listeners) {
      try {
        listener(delta);
      } catch (e) {
        logError("TileCache", "Error in delta listener:", delta.kind, e);
        // still surface it as uncaught, without stopping the other listeners
        setTimeout(() => {
          throw e;
        });
      }
    }
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

  function getDataInRange(
    startNs: bigint,
    endNs: bigint,
  ): { data: TData[]; hasAllTilesCached: boolean } {
    const data: TData[] = [];
    if (endNs < startNs) {
      return { data, hasAllTilesCached: true };
    }

    const firstId = tileIdOf(startNs);
    const lastId = tileIdOf(endNs);
    const liveTileId = live.acc?.tileId;

    let hasAllTilesCached = true;
    for (let id = firstId; id <= lastId; id++) {
      const cached = tileCache.get(id);
      if (cached) {
        data.push(cached.data);
        continue;
      }

      if (id === liveTileId && live.acc) {
        data.push(live.acc.data);
        if (bigIntMin(endNs, getRange(id)[1]) > live.acc.fetchedEndNs) {
          hasAllTilesCached = false;
        }
        continue;
      }

      // bucket is neither settled nor live: an unfetched gap
      hasAllTilesCached = false;
    }

    return { data, hasAllTilesCached };
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

  function cacheTile(tileId: number, fetchedData: TData): void {
    if (tileCache.has(tileId)) return;

    const data = complete(fetchedData);
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
    const { signal } = controller;
    return splitFetch<TData>(range, {
      minWindowInterval: minSubTileNs,
      empty,
      merge,
      filterOwned,
      fetch: (window) => fetch(window, Number(uniqueId())),
      signal,
    });
  }

  /**
   * Tiles in view that still need to be fetched, nearest to the view center
   * first, right before left at the same distance
   */
  function tilesToFetch(): number[] {
    const liveTileId =
      lastWorldEndNs === null ? null : tileIdOf(lastWorldEndNs);
    const [viewStartTileId, viewEndTileId] = getViewTileRange();
    if (viewEndTileId < viewStartTileId || liveTileId === null) return [];

    const low = Math.max(0, viewStartTileId - overscan);
    const high = Math.max(
      viewEndTileId,
      Math.min(liveTileId, viewEndTileId + overscan),
    );
    const center = (viewStartTileId + viewEndTileId) / 2;

    const tileIds: number[] = [];
    for (let id = low; id <= high; id++) {
      if (id === liveTileId || id === live.acc?.tileId) continue;
      if (requestedTilesForView.has(id) || inFlightTileIds.has(id)) continue;
      if (tileCache.has(id)) continue;
      tileIds.push(id);
    }
    return tileIds.sort(
      (a, b) => Math.abs(a - center) - Math.abs(b - center) || b - a,
    );
  }

  function fetchMissingTiles(): void {
    if (!store.get(isConnectedAtom)) return;
    for (const tileId of tilesToFetch()) void fetchTile(tileId);
  }

  async function fetchTile(tileId: number): Promise<void> {
    const { signal } = controller;
    requestedTilesForView.add(tileId);
    inFlightTileIds.add(tileId);
    const [tileStartNs, tileEndNs] = getRange(tileId);
    const data = empty();
    let fetchedEndNs = tileStartNs - 1n;
    // responses can stop short of the window, so request the rest
    while (fetchedEndNs < tileEndNs) {
      const result = await fetchDataForRange([fetchedEndNs + 1n, tileEndNs]);
      if (signal.aborted) return;
      if (result.canRetry || result.fetchedEndNs <= fetchedEndNs) break;
      merge(data, result.data);
      fetchedEndNs = result.fetchedEndNs;
    }

    inFlightTileIds.delete(tileId);
    if (fetchedEndNs === tileEndNs) cacheTile(tileId, data);
    else fetchMissingTiles();
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

    const { signal } = controller;
    const { data, canRetry, fetchedEndNs } = await fetchDataForRange([
      startNs,
      endNs,
    ]);
    if (signal.aborted) return false;
    if (canRetry || fetchedEndNs < startNs) return true;
    if (live.acc === null || startNs !== live.acc.fetchedEndNs + 1n)
      return true;

    merge(live.acc.data, data);
    live.acc.fetchedEndNs = fetchedEndNs;
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
    return fetchedEndNs < endNs;
  }

  async function advanceLive(worldEndNs: bigint): Promise<void> {
    const worldEndTileId = tileIdOf(worldEndNs);
    if (!isTileInView(worldEndTileId)) {
      if (live.acc !== null) {
        resetLive();
        publish({ kind: "clearLive" });
        fetchMissingTiles();
      }
      return;
    }

    if (!live.inFlight && live.acc !== null && !isTileInView(live.acc.tileId)) {
      live.acc = null;
    }

    if (!store.get(isConnectedAtom)) return;

    if (live.acc === null) {
      // the tile before can still be missing its newest chunks until they're final
      const prevTileId = worldEndTileId - 1;
      const isPrevPending =
        isTileInView(prevTileId) && !tileCache.has(prevTileId);
      startLive(isPrevPending ? prevTileId : worldEndTileId);
    }

    if (live.inFlight) {
      live.targetEndNs = worldEndNs;
      return;
    }

    // Throttle queries
    if (performance.now() - live.lastQueryTime < LIVE_QUERY_INTERVAL_MS) return;

    live.lastQueryTime = performance.now();
    live.inFlight = true;

    // request ahead of the world end; the server only returns final chunks
    const serverNowNs = store.get(smoothedNowNsAtom) ?? worldEndNs;
    const [, worldEndTileEndNs] = getRange(worldEndTileId);
    const fetchEndNs = bigIntMin(
      bigIntMax(serverNowNs, worldEndNs),
      worldEndTileEndNs,
    );
    const fetchEndTileId = tileIdOf(fetchEndNs);

    const { signal } = controller;
    while (live.acc !== null && live.acc.tileId < fetchEndTileId) {
      const tileId = live.acc.tileId;
      const [, tileEndNs] = getRange(tileId);
      const canRetry = await fetchLiveRange(tileEndNs);
      if (signal.aborted) return;
      if (live.acc === null || live.acc.tileId !== tileId) break;
      if (canRetry) {
        live.inFlight = false;
        return;
      }
      cacheTile(tileId, live.acc.data);
      startLive(tileId + 1);
    }

    if (live.acc?.tileId === fetchEndTileId) {
      const canRetry = await fetchLiveRange(fetchEndNs);
      if (signal.aborted) return;
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

    // start live first so the historical fetch skips the tile live claims
    if (worldChanged) void advanceLive(worldEndNs);

    if (viewChanged) {
      requestedTilesForView.clear();
      fetchMissingTiles();
    }
  }

  function init(): () => void {
    const unsubSocketState = store.sub(socketStateAtom, () => {
      if (store.get(socketStateAtom) === SocketState.Disconnected) {
        failPendingRequests();
      }
    });
    // refetch tiles whose requests the disconnect dropped
    const unsubConnected = store.sub(isConnectedAtom, () => {
      if (!store.get(isConnectedAtom)) return;
      requestedTilesForView.clear();
      fetchMissingTiles();
    });
    return () => {
      unsubSocketState();
      unsubConnected();
    };
  }

  function reset(): void {
    controller.abort();
    controller = new AbortController();
    failPendingRequests();
    tileCache.clear();
    sortedTileIds.length = 0;
    cachedItems = 0;
    inFlightTileIds.clear();
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
    getDataInRange,
    requestRange,
    init,
    reset,
  };
}
