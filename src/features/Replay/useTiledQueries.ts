import { useCallback, useEffect, useMemo, useRef } from "react";
import { atom, getDefaultStore } from "jotai";
import type { NsTsRange } from "../WebGl/webglUtils";
import {
  isLiveAtom,
  referenceNsAtom,
  reserveNextQueryIdAtom,
  worldRangeAtom,
  type TimelineQueryKey,
} from "./atoms";
import { calcAbsoluteNs } from "./utils";
import { useThrottledCallbackIfVisible } from "../../api/useDebounceIfVisible";

interface TileStates {
  fetched: Set<number>;
  pending: Set<number>;
  /**
   * tiles that include the world end and require refreshing
   */
  stale: Set<number>;
}

/** granularity -> tile states */
type ChartQueryState = Map<string, TileStates>;

const store = getDefaultStore();
const tileQueryStateByChartIdAtom = atom<Map<string, ChartQueryState>>(
  new Map(),
);

interface UseTiledQueriesOpts<Granularity extends string> {
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
  ) => void;
  /**
   * When a query completes and the fetched tile count for a granularity exceeds
   * this high watermark, evict tiles outside the visible range (farthest first)
   * down to `tileEvictionLowWatermark`.
   */
  tileEvictionHighWatermark: number;
  /**
   * Evict down to this many tiles.
   * Must be <= tileEvictionHighWatermark.
   */
  tileEvictionLowWatermark: number;
  onEvictTiles: (granularity: Granularity, tileIdxs: number[]) => void;
}

/**
 * Split queries into tiles, which are time windows of equal size (dependent on granularity).
 * Track pending and fetched tile states, and only query for missing tiles.
 */
export function useTiledQueries<Granularity extends string>({
  chartId,
  getTileSizeNs,
  overscanTilesCount,
  queryKey,
  sendQuery,
  tileEvictionHighWatermark,
  tileEvictionLowWatermark,
  onEvictTiles,
}: UseTiledQueriesOpts<Granularity>) {
  const pendingQueriesRef = useRef(
    new Map<
      number,
      { tileIdx: number; granularity: Granularity; isStale: boolean }
    >(),
  );
  const latestRequestRef = useRef<
    | {
        visibleRangeNs: NsTsRange;
        granularity: Granularity;
        /** whether any tile in the last request overlapped the world end */
        hasWorldEndTile: boolean;
      }
    | undefined
  >();

  const { getChartState, getTileStates, getNewQueryId } = useMemo(() => {
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
      pendingQueriesRef.current.set(queryId, {
        tileIdx,
        granularity,
        isStale,
      });
      return queryId;
    };

    return { getChartState, getTileStates, getNewQueryId };
  }, [chartId, queryKey]);

  // On unmount, abandon in-flight queries
  useEffect(() => {
    const pendingQueries = pendingQueriesRef.current;
    return () => {
      for (const { pending } of getChartState().values()) {
        pending.clear();
      }
      pendingQueries.clear();
    };
  }, [getChartState]);

  const dispatchSingleTileQuery = useCallback(
    (granularity: Granularity, queryId: number, tileIdx: number) => {
      const tileSizeNs = getTileSizeNs(granularity);
      const tileStartNs = BigInt(tileIdx) * tileSizeNs;
      const tileEndNs = tileStartNs + tileSizeNs;
      sendQuery(queryId, tileStartNs, tileEndNs, granularity);
    },
    [getTileSizeNs, sendQuery],
  );

  const evictTiles = useCallback(
    (granularity: Granularity, tileIdxs: number[]) => {
      const { fetched, stale } = getTileStates(granularity);
      for (const tileIdx of tileIdxs) {
        fetched.delete(tileIdx);
        stale.delete(tileIdx);
      }
      onEvictTiles(granularity, tileIdxs);
    },
    [getTileStates, onEvictTiles],
  );

  /**
   * Once the fetched count exceeds the high watermark, evict tiles
   * (excluding currently visible ones) down to the low watermark for this
   * granularity. Evict stale tiles first, then tiles farthest from the current range.
   * Return the tile idxs that are evicted.
   */
  const evictTilesIfNeeded = useCallback(
    (granularity: Granularity): number[] => {
      const { fetched, stale } = getTileStates(granularity);
      const storedCount = fetched.size + stale.size;
      if (storedCount <= tileEvictionHighWatermark) return [];

      let countToEvict = storedCount - tileEvictionLowWatermark;
      if (countToEvict <= 0) return [];

      const visibleRange = latestRequestRef.current?.visibleRangeNs;
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
    },
    [
      getTileStates,
      tileEvictionHighWatermark,
      tileEvictionLowWatermark,
      getTileSizeNs,
      evictTiles,
    ],
  );

  const queryRange = useCallback(
    (
      [visibleStartNs, visibleEndNs]: NsTsRange,
      [worldStartNs, worldEndNs]: NsTsRange,
      granularity: Granularity,
      onNothingToFetch?: (granularity: Granularity) => void,
    ) => {
      if (visibleEndNs <= visibleStartNs) {
        latestRequestRef.current = undefined;
        return;
      }

      const tileSizeNs = getTileSizeNs(granularity);

      // no overscan before world start
      const worldFirstTile = getStartTileIdx(worldStartNs, tileSizeNs);
      const firstTile = Math.max(
        worldFirstTile,
        getStartTileIdx(visibleStartNs, tileSizeNs) - overscanTilesCount,
      );
      const worldLastTile = getEndTileIdx(worldEndNs, tileSizeNs);
      // no overscan past world end
      const lastTile = Math.min(
        worldLastTile,
        getEndTileIdx(visibleEndNs, tileSizeNs) + overscanTilesCount,
      );

      const toFetch: { queryId: number; tileIdx: number }[] = [];
      let hasWorldEndTile = false;

      // mark missing tiles as pending
      for (let tileIdx = firstTile; tileIdx <= lastTile; tileIdx++) {
        const tileEndNs = BigInt(tileIdx + 1) * tileSizeNs;
        const isStale = tileEndNs >= worldEndNs;
        if (isStale) hasWorldEndTile = true;

        const queryId = getNewQueryId(granularity, tileIdx, isStale);
        if (queryId == null) continue;
        toFetch.push({ queryId, tileIdx });
      }

      latestRequestRef.current = {
        visibleRangeNs: [visibleStartNs, visibleEndNs],
        granularity,
        hasWorldEndTile,
      };

      // nothing to fetch
      if (!toFetch.length) {
        onNothingToFetch?.(granularity);
        return;
      }

      // fetch tiles closest to the visible center first
      const visibleCenterTile =
        (getStartTileIdx(visibleStartNs, tileSizeNs) +
          getEndTileIdx(visibleEndNs, tileSizeNs)) /
        2;
      toFetch.sort(
        (a, b) =>
          Math.abs(a.tileIdx - visibleCenterTile) -
          Math.abs(b.tileIdx - visibleCenterTile),
      );

      // fetch one tile at a time
      for (const { queryId, tileIdx } of toFetch) {
        dispatchSingleTileQuery(granularity, queryId, tileIdx);
      }
    },
    [getTileSizeNs, overscanTilesCount, getNewQueryId, dispatchSingleTileQuery],
  );

  const markQueryComplete = useCallback(
    (queryId: number) => {
      const queryInfo = pendingQueriesRef.current.get(queryId);
      // query id was not found
      if (queryInfo == null) return;

      const { granularity, tileIdx, isStale } = queryInfo;
      const tilesState = getTileStates(granularity);

      pendingQueriesRef.current.delete(queryId);
      tilesState.pending.delete(tileIdx);

      if (isStale) {
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
    },
    [evictTilesIfNeeded, getTileStates],
  );

  const queryWorldEnd = useThrottledCallbackIfVisible(() => {
    // in live mode, the visible range will automatically query the last tile
    // so skip this query
    if (store.get(isLiveAtom)) return;

    const latestRequest = latestRequestRef.current;
    if (!latestRequest?.hasWorldEndTile) return;

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
    );
  }, 100);

  /**
   * Refresh stale world end data if it was past of the latest request
   */
  useEffect(() => {
    const unsub = store.sub(worldRangeAtom, queryWorldEnd);
    return () => {
      queryWorldEnd.cancel();
      unsub();
    };
  }, [queryWorldEnd]);

  /**
   * Store refreshing stale tiles.
   * Call when this view becomes inactive (e.g. the track switched to a
   * different granularity / aggregate mode).
   */
  const pauseStaleRefreshes = useCallback(() => {
    latestRequestRef.current = undefined;
    queryWorldEnd.cancel();
  }, [queryWorldEnd]);

  return {
    queryRange,
    markQueryComplete,
    pauseStaleRefreshes,
  };
}

/**
 * Get containing floor tile
 */
function getStartTileIdx(tsNs: bigint, tileSizeNs: bigint) {
  return Number(tsNs / tileSizeNs);
}

/**
 * Get containing tile or the smaller time if on boundary
 */
function getEndTileIdx(tsNs: bigint, tileSizeNs: bigint) {
  return Number((tsNs - 1n) / tileSizeNs);
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
