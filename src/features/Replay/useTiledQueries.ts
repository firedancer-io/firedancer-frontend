import { useCallback, useEffect, useMemo, useRef } from "react";
import { atom, getDefaultStore } from "jotai";
import type { NsTsRange } from "../WebGl/webglUtils";

interface TileStates {
  fetched: Set<number>;
  pending: Set<number>;
}

interface ChartQueryState {
  /** granularity -> tile states */
  tileStates: Map<string, TileStates>;
  nextQueryId: number;
}

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
  sendQuery,
  tileEvictionHighWatermark,
  tileEvictionLowWatermark,
  onEvictTiles,
}: UseTiledQueriesOpts<Granularity>) {
  const pendingQueriesRef = useRef(
    new Map<number, { tileIdx: number; granularity: Granularity }>(),
  );
  const latestVisibleRangeRef = useRef<
    [startNs: bigint, endNs: bigint] | undefined
  >();

  const { getChartState, getTileStates, getNewQueryId } = useMemo(() => {
    /**
     * Get or create this chart's persistent query state
     */
    const getChartState = (): ChartQueryState => {
      const byChartId = store.get(tileQueryStateByChartIdAtom);
      let chartState = byChartId.get(chartId);
      if (!chartState) {
        chartState = { tileStates: new Map(), nextQueryId: 0 };
        byChartId.set(chartId, chartState);
      }
      return chartState;
    };

    /**
     * Get or create tile states for this granularity
     */
    const getTileStates = (granularity: Granularity): TileStates => {
      const { tileStates } = getChartState();
      let states = tileStates.get(granularity);
      if (!states) {
        states = {
          fetched: new Set(),
          pending: new Set(),
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
    ): number | undefined => {
      const tileQueryStates = getTileStates(granularity);
      if (
        tileQueryStates.fetched.has(tileIdx) ||
        tileQueryStates.pending.has(tileIdx)
      ) {
        return;
      }

      const chartState = getChartState();
      const queryId = chartState.nextQueryId++;
      tileQueryStates.pending.add(tileIdx);
      pendingQueriesRef.current.set(queryId, { tileIdx, granularity });
      return queryId;
    };

    return { getChartState, getTileStates, getNewQueryId };
  }, [chartId]);

  // On unmount, abandon in-flight queries
  useEffect(() => {
    const pendingQueries = pendingQueriesRef.current;
    return () => {
      for (const { pending } of getChartState().tileStates.values()) {
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
      const fetched = getTileStates(granularity).fetched;
      for (const tileIdx of tileIdxs) fetched.delete(tileIdx);
      onEvictTiles(granularity, tileIdxs);
    },
    [getTileStates, onEvictTiles],
  );

  /**
   * Once the fetched count exceeds the high watermark, evict fetched tiles
   * (excluding currently visible ones) down to the low watermark for this granularity.
   * Farthest tiles from the current range are evicted first
   */
  const evictTilesIfNeeded = useCallback(
    (granularity: Granularity) => {
      const fetched = getTileStates(granularity).fetched;
      if (fetched.size <= tileEvictionHighWatermark) return;

      const countToEvict = fetched.size - tileEvictionLowWatermark;
      if (countToEvict <= 0) return;

      const visibleRange = latestVisibleRangeRef.current;
      if (visibleRange == null) {
        // grab the first few tiles to evict
        const toEvict = [...fetched].slice(0, countToEvict);
        evictTiles(granularity, toEvict);
        return;
      }

      const tileSizeNs = getTileSizeNs(granularity);

      const evictable = [...fetched].reduce<[dist: bigint, tileIdx: number][]>(
        (acc, tileIdx) => {
          const tileStart = tileSizeNs * BigInt(tileIdx);
          const tileRange = [
            tileStart,
            tileStart + tileSizeNs,
          ] satisfies NsTsRange;
          const dist = calcDistanceBetween(visibleRange, tileRange);
          if (dist != null) {
            acc.push([dist, tileIdx]);
          }
          return acc;
        },
        [],
      );

      const sortedEvictable = evictable.sort(([dist1], [dist2]) => {
        if (dist1 < dist2) return 1;
        if (dist1 > dist2) return -1;
        // delete older fetched tile for ties
        return 0;
      });

      if (sortedEvictable.length === 0) return;
      const toEvict = sortedEvictable
        .slice(0, countToEvict)
        .map(([_, tileIdx]) => tileIdx);
      evictTiles(granularity, toEvict);
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
        latestVisibleRangeRef.current = undefined;
        return;
      }

      latestVisibleRangeRef.current = [visibleStartNs, visibleEndNs];

      const tileSizeNs = getTileSizeNs(granularity);

      // clamp query to world bounds
      const worldFirstTile = getStartTileIdx(worldStartNs, tileSizeNs);
      const worldLastTile = getEndTileIdx(worldEndNs, tileSizeNs);

      const firstTile = Math.max(
        worldFirstTile,
        getStartTileIdx(visibleStartNs, tileSizeNs) - overscanTilesCount,
      );
      const lastTile = Math.min(
        worldLastTile,
        getEndTileIdx(visibleEndNs, tileSizeNs) + overscanTilesCount,
      );

      const toFetch: { queryId: number; tileIdx: number }[] = [];

      // mark missing tiles as pending
      for (let tileIdx = firstTile; tileIdx <= lastTile; tileIdx++) {
        const queryId = getNewQueryId(granularity, tileIdx);
        if (queryId == null) continue;
        toFetch.push({ queryId, tileIdx });
      }

      // nothing to fetch
      if (!toFetch.length) {
        onNothingToFetch?.(granularity);
        return;
      }

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
      if (queryInfo == null) return;

      const { granularity, tileIdx } = queryInfo;
      const tilesState = getTileStates(granularity);

      pendingQueriesRef.current.delete(queryId);
      tilesState.pending.delete(tileIdx);
      tilesState.fetched.add(tileIdx);

      // evict if needed
      evictTilesIfNeeded(granularity);
    },
    [evictTilesIfNeeded, getTileStates],
  );

  return {
    queryRange,
    markQueryComplete,
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
