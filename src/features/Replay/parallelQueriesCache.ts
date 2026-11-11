import { atom, getDefaultStore } from "jotai";
import type { NsTsRange } from "../WebGl/webglUtils";
import { throttleIfVisible } from "../../api/useDebounceIfVisible";
import { isConnectedAtom } from "../../api/ws/atoms";
import {
  isLiveAtom,
  referenceNsAtom,
  reserveNextQueryIdAtom,
  worldRangeAtom,
  type TimelineQueryKey,
} from "./atoms";
import { calcAbsoluteNs } from "./utils";
import { getTileIdx, getTileIdxRangeWithOverscan } from "./utils";
import type { DataLevel } from "./coverage";
import { bigIntMax } from "../../mathUtils";

interface TileStates {
  fetched: Set<number>;
  pending: Set<number>;
  /**
   * tiles that include the world end and require refreshing
   */
  stale: Set<number>;
  // tiles that started before the available start when fetched (are missing data)
  partial: Set<number>;
  // latest start of the server's data (tiles ending before it aren't fetched)
  availableStartNs?: bigint;
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
}: CreateParallelCacheOpts<Granularity, Params>) {
  const pendingQueries = new Map<
    number,
    {
      tileIdx: number;
      granularity: Granularity;
      isStale: boolean;
    }
  >();

  let lastPrefetch:
    | { granularity: Granularity; params: Params; worldEndBucket: bigint }
    | undefined;

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
        stale: new Set(),
        partial: new Set(),
      };
      tileStates.set(granularity, states);
    }
    return states;
  };

  /**
   * If tile is not fetched or pending, mark as pending and return query Id
   */
  const getNewQueryId = (
    granularity: Granularity,
    tileIdx: number,
    isStale: boolean,
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
      isStale,
    });
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
    sendQuery(queryId, tileStartNs, tileEndNs, granularity, params);
  };

  const evictTiles = (granularity: Granularity, tileIdxs: number[]) => {
    const { fetched, stale, partial } = getTileStates(granularity);
    for (const tileIdx of tileIdxs) {
      fetched.delete(tileIdx);
      stale.delete(tileIdx);
      partial.delete(tileIdx);
    }
    onEvictTiles(granularity, tileIdxs);
  };

  /**
   * Once the fetched count exceeds the high watermark, evict tiles
   * (excluding currently visible ones) down to the low watermark for this
   * granularity. Evict stale tiles first, then tiles farthest from the current range.
   * Return the tile idxs that are evicted.
   */
  const evictTilesIfNeeded = (granularity: Granularity): number[] => {
    const { fetched, stale } = getTileStates(granularity);
    const storedCount = fetched.size + stale.size;
    if (storedCount <= getTileEvictionHighWatermark(granularity)) return [];

    let countToEvict = storedCount - getTileEvictionLowWatermark(granularity);
    if (countToEvict <= 0) return [];

    const visibleRange = latestRequest?.visibleRangeNs;
    const tileSizeNs = getTileSizeNs(granularity);

    if (visibleRange == null) {
      // grab the first few tiles to evict
      const toEvict = [...stale, ...fetched].slice(0, countToEvict);
      evictTiles(granularity, toEvict);
      return toEvict;
    }

    const toEvict: number[] = [];

    // Evict all off-screen stale tiles first
    for (const tileIdx of stale) {
      const tileStart = tileSizeNs * BigInt(tileIdx);
      if (
        calcDistanceBetween(visibleRange, [
          tileStart,
          tileStart + tileSizeNs,
        ]) != null
      ) {
        toEvict.push(tileIdx);
        countToEvict--;

        if (countToEvict <= 0) {
          evictTiles(granularity, toEvict);
          return toEvict;
        }
      }
    }

    // Evict farthest from the visible range first.
    const evictable = [...fetched].reduce<[dist: bigint, tileIdx: number][]>(
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

    for (const [, tileIdx] of evictable.slice(0, countToEvict)) {
      toEvict.push(tileIdx);
    }

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

    const { availableStartNs } = getTileStates(granularity);

    const isConnected = store.get(isConnectedAtom);

    // mark missing tiles as pending
    for (let tileIdx = firstTile; tileIdx <= lastTile; tileIdx++) {
      const tileEndNs = BigInt(tileIdx + 1) * tileSizeNs;
      // evicted from the server
      if (availableStartNs !== undefined && tileEndNs <= availableStartNs) {
        continue;
      }
      const isStale = tileEndNs >= worldEndNs;

      // while disconnected, don't reserve/query tiles
      if (!isConnected) continue;

      const queryId = getNewQueryId(granularity, tileIdx, isStale);
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

  /** Fetch the whole world, refreshing the tail tile once per new bucket */
  const prefetchWorld = (
    [worldStartNs, worldEndNs]: NsTsRange,
    granularity: Granularity,
    bucketSizeNs: bigint,
    params: Params,
  ) => {
    if (worldEndNs <= worldStartNs || !store.get(isConnectedAtom)) return;

    const worldEndBucket = worldEndNs / bucketSizeNs;
    if (
      lastPrefetch?.granularity === granularity &&
      lastPrefetch.params === params &&
      lastPrefetch.worldEndBucket === worldEndBucket
    ) {
      return;
    }
    lastPrefetch = { granularity, params, worldEndBucket };

    const tileSizeNs = getTileSizeNs(granularity);
    const { availableStartNs } = getTileStates(granularity);
    const firstTile = getTileIdx(worldStartNs, tileSizeNs, false);
    const lastTile = getTileIdx(worldEndNs, tileSizeNs, true);
    for (let tileIdx = firstTile; tileIdx <= lastTile; tileIdx++) {
      const tileEndNs = BigInt(tileIdx + 1) * tileSizeNs;
      // evicted from the server
      if (availableStartNs !== undefined && tileEndNs <= availableStartNs) {
        continue;
      }
      const isStale = tileEndNs >= worldEndNs;
      const queryId = getNewQueryId(granularity, tileIdx, isStale);
      if (queryId == null) continue;
      dispatchSingleTileQuery(granularity, queryId, tileIdx, params);
    }
  };

  /**
   * Mark tile associated with query ID as fetched, and return query info
   */
  const markQueryComplete = (
    queryId: number,
    chunksEndNs?: bigint,
    availableStartNs?: bigint | null,
  ) => {
    const queryInfo = pendingQueries.get(queryId);
    // query id was not found
    if (queryInfo == null) return;

    const { granularity, tileIdx, isStale } = queryInfo;
    const tilesState = getTileStates(granularity);

    tilesState.pending.delete(tileIdx);
    pendingQueries.delete(queryId);

    const tileSizeNs = getTileSizeNs(granularity);
    if (availableStartNs != null) {
      tilesState.availableStartNs = bigIntMax(
        tilesState.availableStartNs ?? availableStartNs,
        availableStartNs,
      );
      if (BigInt(tileIdx) * tileSizeNs < availableStartNs) {
        tilesState.partial.add(tileIdx);
      }
    }

    // a response ending before the tile end leaves it stale
    const tileEndNs = BigInt(tileIdx + 1) * tileSizeNs;
    if (isStale || (chunksEndNs !== undefined && chunksEndNs < tileEndNs)) {
      tilesState.stale.add(tileIdx);
    } else {
      tilesState.stale.delete(tileIdx);
      tilesState.fetched.add(tileIdx);
    }

    // If the new query is evicted (data no longer in range), return undefined
    // to indicate the response was not cached.
    const evicted = evictTilesIfNeeded(granularity);
    if (evicted.includes(tileIdx)) return;

    return queryInfo;
  };

  /**
   * Granularity as a data level. A tile has data if it's fetched or stale,
   * and isn't partial.
   */
  const getLevel = (granularity: Granularity, isAgg: boolean): DataLevel => {
    const tileSizeNs = getTileSizeNs(granularity);
    return {
      id: granularity,
      isAgg,
      tileSizeNs,
      isRangeFetched: (rangeNs) => {
        if (rangeNs[1] <= rangeNs[0]) return true;

        const { fetched, stale, partial, availableStartNs } =
          getTileStates(granularity);
        const allowPartial =
          availableStartNs !== undefined && rangeNs[1] > availableStartNs;
        const startNs = allowPartial
          ? bigIntMax(rangeNs[0], availableStartNs)
          : rangeNs[0];

        const firstTile = getTileIdx(startNs, tileSizeNs, false);
        const lastTile = getTileIdx(rangeNs[1], tileSizeNs, true);

        if (lastTile - firstTile + 1 > fetched.size + stale.size) {
          return false;
        }

        for (let tileIdx = firstTile; tileIdx <= lastTile; tileIdx++) {
          if (!fetched.has(tileIdx) && !stale.has(tileIdx)) return false;
          if (!allowPartial && partial.has(tileIdx)) return false;
        }
        return true;
      },
    };
  };

  const refreshStaleTiles = () => {
    // in live mode, the visible range will automatically query the last tile
    // so skip this query
    if (store.get(isLiveAtom)) return;

    if (!latestRequest) return;

    const worldRange = store.get(worldRangeAtom);
    const referenceNs = store.get(referenceNsAtom);
    if (!worldRange || referenceNs == null) return;

    const worldRangeNs: NsTsRange = [
      calcAbsoluteNs(referenceNs, worldRange[0]),
      calcAbsoluteNs(referenceNs, worldRange[1]),
    ];

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

    const worldRange = store.get(worldRangeAtom);
    const referenceNs = store.get(referenceNsAtom);
    if (!worldRange || referenceNs == null) return;

    const worldRangeNs: NsTsRange = [
      calcAbsoluteNs(referenceNs, worldRange[0]),
      calcAbsoluteNs(referenceNs, worldRange[1]),
    ];
    queryRange(visibleRangeNs, worldRangeNs, granularity, params);
  };

  const init = () => {
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
      unsubWorldRange();
      unsubConnected();
    };
  };

  /**
   * Abandon in-flight queries
   */
  const clearPending = () => {
    scheduleRefreshStaleTiles.cancel();
    for (const { pending } of getChartState().values()) {
      pending.clear();
    }
    pendingQueries.clear();
    lastPrefetch = undefined;
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
      onEvictTiles(granularity as Granularity, [...fetched, ...stale]);
    }
    getChartState().clear();
    pendingQueries.clear();
    lastPrefetch = undefined;
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
