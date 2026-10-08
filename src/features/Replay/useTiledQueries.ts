import { useCallback, useEffect, useMemo, useRef } from "react";
import { atom, getDefaultStore } from "jotai";
import type { NsTsRange } from "../WebGl/webglUtils";
import {
  referenceNsAtom,
  reserveNextQueryIdAtom,
  worldRangeAtom,
  type TimelineQueryKey,
} from "./atoms";
import { calcAbsoluteNs } from "./utils";

interface TileStates {
  fetched: Set<number>;
  pending: Set<number>;
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
      { tileIdx: number; granularity: Granularity; doNotCache: boolean }
    >(),
  );
  const latestRequestRef = useRef<
    | {
        visibleRangeNs: [startNs: bigint, endNs: bigint];
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
      doNotCache: boolean,
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
        doNotCache,
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

      const visibleRange = latestRequestRef.current?.visibleRangeNs;
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
      [, worldEndNs]: NsTsRange,
      granularity: Granularity,
      onNothingToFetch?: (granularity: Granularity) => void,
    ) => {
      if (visibleEndNs <= visibleStartNs) {
        latestRequestRef.current = undefined;
        return;
      }

      const tileSizeNs = getTileSizeNs(granularity);

      const firstTile =
        getStartTileIdx(visibleStartNs, tileSizeNs) - overscanTilesCount;
      const lastTile =
        getEndTileIdx(visibleEndNs, tileSizeNs) + overscanTilesCount;

      const toFetch: { queryId: number; tileIdx: number }[] = [];
      let hasWorldEndTile = false;

      // mark missing tiles as pending
      for (let tileIdx = firstTile; tileIdx <= lastTile; tileIdx++) {
        const tileEndNs = BigInt(tileIdx + 1) * tileSizeNs;
        const doNotCache = tileEndNs >= worldEndNs;
        if (doNotCache) hasWorldEndTile = true;

        const queryId = getNewQueryId(granularity, tileIdx, doNotCache);
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

  /**
   * Mark tile associated with query ID as fetched, and return query info
   */
  const markQueryComplete = useCallback(
    (
      queryId: number,
    ):
      | {
          tileIdx: number;
          granularity: Granularity;
        }
      | undefined => {
      const queryInfo = pendingQueriesRef.current.get(queryId);
      // query id was not found
      if (queryInfo == null) return;

      const { granularity, tileIdx, doNotCache } = queryInfo;
      const tilesState = getTileStates(granularity);

      pendingQueriesRef.current.delete(queryId);
      tilesState.pending.delete(tileIdx);

      // don't cache tiles that include the progressing world end
      if (!doNotCache) {
        tilesState.fetched.add(tileIdx);
        // evict if needed
        evictTilesIfNeeded(granularity);
      }

      return queryInfo;
    },
    [evictTilesIfNeeded, getTileStates],
  );

  // whether any tile is still in flight for a granularity. With per-response
  // forwarding there is no buffered-but-unapplied state, so "pending" is the only
  // unsettled state. Used by the draw layer to decide whether to hide trailing
  // incomplete slots (their data may not be settled yet).
  const hasPendingTiles = useCallback(
    (granularity: Granularity): boolean => {
      const tilesState = getTileStates(granularity);
      return !!tilesState && tilesState.pending.size > 0;
    },
    [getTileStates],
  );

  // When the world end advances, repeat the last query if it included the world end
  useEffect(() => {
    return store.sub(worldRangeAtom, () => {
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
    });
  }, [queryRange]);

  return {
    queryRange,
    markQueryComplete,
    hasPendingTiles,
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
