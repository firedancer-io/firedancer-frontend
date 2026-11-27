import { atom, getDefaultStore } from "jotai";
import type { NsTsRange } from "../WebGl/webglUtils";
import { throttleIfVisible } from "../../api/useDebounceIfVisible";
import { isConnectedAtom } from "../../api/ws/atoms";
import {
  isLiveAtom,
  reserveNextQueryIdAtom,
  worldRangeAtom,
  worldRangeNsAtom,
  type TimelineQueryKey,
} from "./atoms";
import { getTileIdx, getTileIdxRangeWithOverscan } from "./utils";
import type { DataLevel } from "./coverage";
import { endPrefetch, setLoading } from "./prefetchQueue";
import { bigIntMax } from "../../mathUtils";

interface TileStates {
  fetched: Set<number>;
  pending: Set<number>;
  /**
   * tiles that require refreshing either from the specified ts, or from the start of the tile
   */
  stale: Map<number, bigint | undefined>;
  // tiles that started before the available start when fetched (are missing data)
  partial: Set<number>;
  /**
   * tile idx -> world end bucket when prefetchWorld last fetched it.
   * Each incomplete tile is prefetched at most once per bucket
   */
  prefetchBucketForTile: Map<number, bigint>;
  maxAvailableStartNs?: bigint;
  maxAvailableEndNs?: bigint;
}

/** granularity -> tile states */
type ChartQueryState = Map<string, TileStates>;

const store = getDefaultStore();
const tileQueryStateByChartIdAtom = atom<Map<string, ChartQueryState>>(
  new Map(),
);

/** forget every chart's fetched/pending/stale tiles */
export const clearAllTileQueryStateAtom = atom(null, (_get, set) => {
  set(tileQueryStateByChartIdAtom, new Map());
});

interface CreateParallelCacheOpts<
  Granularity extends string,
  Params = undefined,
> {
  chartId: string;
  getTileSizeNs: (granularity: Granularity) => bigint;
  /**
   * Extra tiles to be fetched on either side of the query range
   */
  overscanTilesCount: number;
  /** query key used to reserve a unique query ID */
  queryKey: TimelineQueryKey;
  sendQuery: (
    queryId: number,
    startNs: bigint,
    endNs: bigint,
    granularity: Granularity,
    params: Params,
  ) => void;
  /**
   * When a query completes and the fetched tile count for a granularity exceeds
   * this high watermark, evict tiles outside the visible range (farthest first)
   * down to `getTileEvictionLowWatermark`.
   */
  getTileEvictionHighWatermark: (granularity: Granularity) => number;
  /**
   * Evict down to this many tiles.
   * Must be <= getTileEvictionHighWatermark.
   */
  getTileEvictionLowWatermark: (granularity: Granularity) => number;
  onEvictTiles: (granularity: Granularity, tileIdxs: number[]) => void;
  /**
   * Refresh stale tiles from the stable data ts, instead of the whole tile
   */
  fetchPartialStaleTile?: boolean;
}

/**
 * Split queries into tiles, which are time windows of equal size (dependent on granularity).
 * Track pending and fetched tile states, and only query for missing tiles.
 */
export function createParallelCache<
  Granularity extends string,
  Params = undefined,
>({
  chartId,
  getTileSizeNs,
  overscanTilesCount,
  queryKey,
  sendQuery,
  getTileEvictionHighWatermark,
  getTileEvictionLowWatermark,
  onEvictTiles,
  fetchPartialStaleTile = false,
}: CreateParallelCacheOpts<Granularity, Params>) {
  const pendingQueries = new Map<
    number,
    {
      tileIdx: number;
      granularity: Granularity;
      isPrefetch: boolean;
      hasData: boolean;
    }
  >();
  const loadingOwner = {};
  // only prefetch between init and its cleanup
  let isActive = false;

  let latestRequest:
    | {
        visibleRangeNs: NsTsRange;
        granularity: Granularity;
        params: Params;
      }
    | undefined;

  /**
   * Get or create this chart's persistent query state
   */
  const getChartState = (): ChartQueryState => {
    const byChartId = store.get(tileQueryStateByChartIdAtom);
    let chartState = byChartId.get(chartId);
    if (!chartState) {
      chartState = new Map();
      byChartId.set(chartId, chartState);
    }
    return chartState;
  };

  /**
   * Get or create tile states for this granularity
   */
  const getTileStates = (granularity: Granularity): TileStates => {
    const tileStates = getChartState();
    let states = tileStates.get(granularity);
    if (!states) {
      states = {
        fetched: new Set(),
        pending: new Set(),
        stale: new Map(),
        partial: new Set(),
        prefetchBucketForTile: new Map(),
      };
      tileStates.set(granularity, states);
    }
    return states;
  };

  const updateLoading = () => {
    let isLoading = false;
    for (const { isPrefetch, hasData } of pendingQueries.values()) {
      if (!isPrefetch && !hasData) isLoading = true;
    }
    setLoading(loadingOwner, isLoading);
  };

  /**
   * Drop in-flight queries.
   * If dropping a prefetch, free the prefetch slot.
   */
  const dropQueries = (
    shouldDrop: (query: {
      granularity: Granularity;
      tileIdx: number;
    }) => boolean,
  ) => {
    let droppedPrefetch = false;
    for (const [queryId, query] of pendingQueries) {
      if (!shouldDrop(query)) continue;
      pendingQueries.delete(queryId);
      droppedPrefetch ||= query.isPrefetch;
    }
    updateLoading();
    if (droppedPrefetch) endPrefetch();
  };

  /**
   * If tile is not fetched or pending, mark as pending and return query Id
   */
  const getNewQueryId = (
    granularity: Granularity,
    tileIdx: number,
    isPrefetch = false,
  ): number | undefined => {
    const tileQueryStates = getTileStates(granularity);
    if (
      tileQueryStates.fetched.has(tileIdx) ||
      tileQueryStates.pending.has(tileIdx)
    ) {
      return;
    }

    const queryId = store.set(reserveNextQueryIdAtom, queryKey);
    tileQueryStates.pending.add(tileIdx);
    pendingQueries.set(queryId, {
      tileIdx,
      granularity,
      isPrefetch,
      hasData: tileQueryStates.stale.has(tileIdx),
    });
    updateLoading();
    return queryId;
  };

  const dispatchSingleTileQuery = (
    granularity: Granularity,
    queryId: number,
    tileIdx: number,
    params: Params,
  ) => {
    const tileSizeNs = getTileSizeNs(granularity);
    const tileStartNs = BigInt(tileIdx) * tileSizeNs;
    const tileEndNs = tileStartNs + tileSizeNs;
    const startNs =
      getTileStates(granularity).stale.get(tileIdx) ?? tileStartNs;
    sendQuery(queryId, startNs, tileEndNs, granularity, params);
  };

  const evictTiles = (granularity: Granularity, tileIdxs: number[]) => {
    const { fetched, stale, partial, pending, prefetchBucketForTile } =
      getTileStates(granularity);
    let evictedPending = false;
    for (const tileIdx of tileIdxs) {
      fetched.delete(tileIdx);
      stale.delete(tileIdx);
      partial.delete(tileIdx);
      prefetchBucketForTile.delete(tileIdx);
      if (pending.delete(tileIdx)) evictedPending = true;
    }

    // clear all pending that were evicted
    if (evictedPending) {
      const evicted = new Set(tileIdxs);
      dropQueries(
        (query) =>
          query.granularity === granularity && evicted.has(query.tileIdx),
      );
    }
    onEvictTiles(granularity, tileIdxs);
  };

  /**
   * Once the stored (fetched or stale) count exceeds the high watermark, evict
   * tiles (excluding currently visible ones) down to the low watermark for
   * this granularity, farthest from the current range first.
   * Return the tile idxs that are evicted.
   */
  const evictTilesIfNeeded = (granularity: Granularity): number[] => {
    const { fetched, stale } = getTileStates(granularity);
    const storedCount = fetched.size + stale.size;
    if (storedCount <= getTileEvictionHighWatermark(granularity)) return [];

    const countToEvict = storedCount - getTileEvictionLowWatermark(granularity);
    if (countToEvict <= 0) return [];

    const stored = [...fetched, ...stale.keys()];

    const visibleRange = latestRequest?.visibleRangeNs;
    const tileSizeNs = getTileSizeNs(granularity);

    if (visibleRange == null) {
      // grab the first few tiles to evict
      const toEvict = stored.slice(0, countToEvict);
      evictTiles(granularity, toEvict);
      return toEvict;
    }

    // Evict farthest from the visible range first.
    const evictable = stored.reduce<[dist: bigint, tileIdx: number][]>(
      (acc, tileIdx) => {
        const tileStart = tileSizeNs * BigInt(tileIdx);
        const dist = calcDistanceBetween(visibleRange, [
          tileStart,
          tileStart + tileSizeNs,
        ]);
        if (dist != null) {
          acc.push([dist, tileIdx]);
        }
        return acc;
      },
      [],
    );

    evictable.sort(([dist1], [dist2]) => {
      if (dist1 < dist2) return 1;
      if (dist1 > dist2) return -1;
      return 0;
    });

    const toEvict = evictable
      .slice(0, countToEvict)
      .map(([, tileIdx]) => tileIdx);
    if (toEvict.length > 0) evictTiles(granularity, toEvict);
    return toEvict;
  };

  const queryRange = (
    [visibleStartNs, visibleEndNs]: NsTsRange,
    [worldStartNs, worldEndNs]: NsTsRange,
    granularity: Granularity,
    params: Params,
    onNothingToFetch?: (granularity: Granularity) => void,
    hasFallbackData?: (tileRangeNs: NsTsRange) => boolean,
  ) => {
    if (visibleEndNs <= visibleStartNs) {
      latestRequest = undefined;
      return;
    }

    const tileSizeNs = getTileSizeNs(granularity);

    const { firstTile, lastTile } = getTileIdxRangeWithOverscan(
      [visibleStartNs, visibleEndNs],
      [worldStartNs, worldEndNs],
      tileSizeNs,
      overscanTilesCount,
    );

    const toFetch: {
      queryId: number;
      tileIdx: number;
      hasFallback: boolean;
    }[] = [];

    const { maxAvailableStartNs } = getTileStates(granularity);

    const isConnected = store.get(isConnectedAtom);

    // mark missing tiles as pending
    for (let tileIdx = firstTile; tileIdx <= lastTile; tileIdx++) {
      const tileEndNs = BigInt(tileIdx + 1) * tileSizeNs;
      // evicted from the server
      if (
        maxAvailableStartNs !== undefined &&
        tileEndNs <= maxAvailableStartNs
      ) {
        continue;
      }
      // while disconnected, don't reserve/query tiles
      if (!isConnected) continue;

      const queryId = getNewQueryId(granularity, tileIdx);
      if (queryId == null) continue;
      const tileStartNs = BigInt(tileIdx) * tileSizeNs;
      toFetch.push({
        queryId,
        tileIdx,
        hasFallback:
          hasFallbackData?.([tileStartNs, tileStartNs + tileSizeNs]) ?? false,
      });
    }

    latestRequest = {
      visibleRangeNs: [visibleStartNs, visibleEndNs],
      granularity,
      params,
    };

    // nothing to fetch (also covers the disconnected case)
    if (!toFetch.length) {
      onNothingToFetch?.(granularity);
      return;
    }

    // fetch tiles with nothing to draw first, then those closest to the
    // visible center
    const visibleCenterTile =
      (getTileIdx(visibleStartNs, tileSizeNs, false) +
        getTileIdx(visibleEndNs, tileSizeNs, true)) /
      2;
    toFetch.sort(
      (a, b) =>
        Number(a.hasFallback) - Number(b.hasFallback) ||
        Math.abs(a.tileIdx - visibleCenterTile) -
          Math.abs(b.tileIdx - visibleCenterTile),
    );

    // fetch one tile at a time
    for (const { queryId, tileIdx } of toFetch) {
      dispatchSingleTileQuery(granularity, queryId, tileIdx, params);
    }
  };

  /** Send the next missing world tile; incomplete tiles refresh once per bucket */
  const prefetchWorld = (
    [worldStartNs, worldEndNs]: NsTsRange,
    granularity: Granularity,
    bucketSizeNs: bigint,
    params: Params,
  ): boolean => {
    if (
      !isActive ||
      worldEndNs <= worldStartNs ||
      !store.get(isConnectedAtom)
    ) {
      return false;
    }

    const worldEndBucket = worldEndNs / bucketSizeNs;
    const tileSizeNs = getTileSizeNs(granularity);
    const {
      fetched,
      pending,
      prefetchBucketForTile,
      maxAvailableStartNs,
      maxAvailableEndNs,
    } = getTileStates(granularity);
    const firstTile = getTileIdx(worldStartNs, tileSizeNs, false);
    const lastTile = getTileIdx(worldEndNs, tileSizeNs, true);
    for (let tileIdx = firstTile; tileIdx <= lastTile; tileIdx++) {
      const tileEndNs = BigInt(tileIdx + 1) * tileSizeNs;
      // evicted from the server
      if (
        maxAvailableStartNs !== undefined &&
        tileEndNs <= maxAvailableStartNs
      ) {
        continue;
      }
      if (fetched.has(tileIdx)) continue;
      // wait for the tile's query in flight
      if (pending.has(tileIdx)) return false;

      // Fetch each at most once per world end bucket
      const isIncomplete =
        maxAvailableEndNs === undefined || tileEndNs > maxAvailableEndNs;
      if (
        isIncomplete &&
        prefetchBucketForTile.get(tileIdx) === worldEndBucket
      ) {
        continue;
      }

      const queryId = getNewQueryId(granularity, tileIdx, true);
      if (queryId == null) return false;
      if (isIncomplete) prefetchBucketForTile.set(tileIdx, worldEndBucket);
      dispatchSingleTileQuery(granularity, queryId, tileIdx, params);
      return true;
    }
    return false;
  };

  /**
   * Mark tile associated with query ID as fetched, and return query info.
   */
  const markQueryComplete = (
    queryId: number,
    dataEndNs?: bigint | null,
    availableStartNs?: bigint | null,
  ) => {
    const queryInfo = pendingQueries.get(queryId);
    // query id was not found
    if (queryInfo == null) return;

    const { granularity, tileIdx } = queryInfo;
    const tilesState = getTileStates(granularity);

    tilesState.pending.delete(tileIdx);
    pendingQueries.delete(queryId);

    const tileSizeNs = getTileSizeNs(granularity);
    if (availableStartNs != null) {
      tilesState.maxAvailableStartNs = bigIntMax(
        tilesState.maxAvailableStartNs ?? availableStartNs,
        availableStartNs,
      );
      if (BigInt(tileIdx) * tileSizeNs < availableStartNs) {
        tilesState.partial.add(tileIdx);
      }
    }

    if (dataEndNs != null) {
      tilesState.maxAvailableEndNs = bigIntMax(
        tilesState.maxAvailableEndNs ?? dataEndNs,
        dataEndNs,
      );
    }

    // data ending before the tile end leaves it stale
    const tileEndNs = BigInt(tileIdx + 1) * tileSizeNs;
    if (dataEndNs == null || dataEndNs < tileEndNs) {
      const prevEndNs = tilesState.stale.get(tileIdx);
      // the next partial refresh resumes from the furthest data end in the tile
      const resumeNs =
        fetchPartialStaleTile &&
        dataEndNs != null &&
        dataEndNs > tileEndNs - tileSizeNs
          ? bigIntMax(prevEndNs ?? dataEndNs, dataEndNs)
          : prevEndNs;
      tilesState.stale.set(tileIdx, resumeNs);
    } else {
      tilesState.stale.delete(tileIdx);
      tilesState.fetched.add(tileIdx);
    }

    const evicted = evictTilesIfNeeded(granularity);

    // the tile's state is settled, so the next fetch won't resend it
    updateLoading();
    if (queryInfo.isPrefetch) endPrefetch();

    // If the new query is evicted (data no longer in range), return undefined
    // to indicate the response was not cached.
    if (evicted.includes(tileIdx)) return;

    return queryInfo;
  };

  /**
   * Granularity as a data level. A tile has data if it's fetched (or stale,
   * when included) and isn't partial.
   */
  const getLevel = (granularity: Granularity, isAgg: boolean): DataLevel => {
    const tileSizeNs = getTileSizeNs(granularity);
    return {
      id: granularity,
      isAgg,
      tileSizeNs,
      isRangeFetched: (rangeNs, includeStale = true) => {
        if (rangeNs[1] <= rangeNs[0]) return true;

        const { fetched, stale, partial, maxAvailableStartNs } =
          getTileStates(granularity);
        const allowPartial =
          maxAvailableStartNs !== undefined && rangeNs[1] > maxAvailableStartNs;
        const startNs = allowPartial
          ? bigIntMax(rangeNs[0], maxAvailableStartNs)
          : rangeNs[0];

        const firstTile = getTileIdx(startNs, tileSizeNs, false);
        const lastTile = getTileIdx(rangeNs[1], tileSizeNs, true);

        const dataTileCount = fetched.size + (includeStale ? stale.size : 0);
        if (lastTile - firstTile + 1 > dataTileCount) return false;

        for (let tileIdx = firstTile; tileIdx <= lastTile; tileIdx++) {
          const hasData =
            fetched.has(tileIdx) || (includeStale && stale.has(tileIdx));
          if (!hasData) return false;
          if (!allowPartial && partial.has(tileIdx)) return false;
        }
        return true;
      },
      getAvailableStartNs: () => getTileStates(granularity).maxAvailableStartNs,
    };
  };

  const refreshStaleTiles = () => {
    // in live mode, the visible range will automatically query the last tile
    // so skip this query
    if (store.get(isLiveAtom)) return;

    if (!latestRequest) return;

    const worldRangeNs = store.get(worldRangeNsAtom);
    if (!worldRangeNs) return;

    queryRange(
      latestRequest.visibleRangeNs,
      worldRangeNs,
      latestRequest.granularity,
      latestRequest.params,
    );
  };

  // While visible, throttle. While hidden, cancel the throttle and fall back to
  // requestAnimationFrame
  const scheduleRefreshStaleTiles = throttleIfVisible(refreshStaleTiles, 100);

  /** Re-send the last visible range */
  const requeryLatestRange = () => {
    if (!latestRequest) return;
    const { visibleRangeNs, granularity, params } = latestRequest;

    const worldRangeNs = store.get(worldRangeNsAtom);
    if (!worldRangeNs) return;
    queryRange(visibleRangeNs, worldRangeNs, granularity, params);
  };

  const init = () => {
    isActive = true;
    if (store.get(isConnectedAtom)) requeryLatestRange();

    const unsubWorldRange = store.sub(
      worldRangeAtom,
      scheduleRefreshStaleTiles,
    );
    const unsubConnected = store.sub(isConnectedAtom, () => {
      // isConnectedAtom only notifies when the value actually changes
      if (store.get(isConnectedAtom)) requeryLatestRange();
      else clearPending();
    });
    return () => {
      isActive = false;
      unsubWorldRange();
      unsubConnected();
    };
  };

  /**
   * Abandon in-flight queries
   */
  const clearPending = () => {
    scheduleRefreshStaleTiles.cancel();
    for (const { pending, prefetchBucketForTile } of getChartState().values()) {
      pending.clear();
      prefetchBucketForTile.clear();
    }
    dropQueries(() => true);
  };

  /**
   * Store refreshing stale tiles.
   * Call when this view becomes inactive (e.g. the track switched to a
   * different granularity / aggregate mode).
   */
  const pauseStaleRefreshes = () => {
    latestRequest = undefined;
    scheduleRefreshStaleTiles.cancel();
  };

  /**
   * Evict all cached tiles and drop pending queries.
   */
  const clearCache = () => {
    for (const [granularity, { fetched, stale }] of getChartState()) {
      onEvictTiles(granularity as Granularity, [...fetched, ...stale.keys()]);
    }
    getChartState().clear();
    dropQueries(() => true);
    pauseStaleRefreshes();
  };

  return {
    queryRange,
    prefetchWorld,
    markQueryComplete,
    pauseStaleRefreshes,
    clearCache,
    init,
    clearPending,
    getLevel,
  };
}

/**
 * Distance between two ranges (0 if they touch), or undefined if they overlap.
 */
function calcDistanceBetween(
  [start1, end1]: NsTsRange,
  [start2, end2]: NsTsRange,
): bigint | undefined {
  if (end1 <= start2) return start2 - end1;
  if (end2 <= start1) return start1 - end2;
}
