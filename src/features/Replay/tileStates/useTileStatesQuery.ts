import { getDefaultStore, useAtomValue } from "jotai";
import { useCallback, useLayoutEffect, useMemo, useState } from "react";
import { useThrottledCallback } from "use-debounce";
import type { NsTsRange, TsRange } from "../../WebGl/webglUtils.ts";
import { tilesAtom } from "../../../api/atoms.ts";
import type {
  AggGranularity,
  TileStatesGranularity,
} from "../../../api/types.ts";
import { TileStatesGranularityEnum } from "../../../api/entities.ts";
import { referenceNsAtom, visibleRangeAtom, worldRangeAtom } from "../atoms.ts";
import { useTileCacheQuery } from "../tiles/useTileCache.ts";
import { getTileKey } from "../utils.ts";
import {
  hasFallbackData,
  tileStatesCaches,
  tileStatesLevels,
} from "./tileStatesCache.ts";
import { getTileStatesGranularity, isAggregate } from "./consts.ts";
import { syncAggTileStatesTilesAtom } from "./aggAtoms.ts";
import { isUsableAggFallback, type DataLevel } from "../coverage.ts";
import {
  getAggGranularity,
  type AggTileStatesQuery,
} from "./useAggTileStatesQuery.ts";

const store = getDefaultStore();

/**
 * Queries the visible range's tile states, from the txn, batch, or agg data by
 * its span. Requeries agg states when the tiles change.
 */
export function useTileStatesQuery({
  query: aggQuery,
  granularityLevels: aggLevels,
  pauseStaleRefreshes: pauseStaleAggRefreshes,
  clearCache: clearAggCache,
}: AggTileStatesQuery) {
  const [aggGranularity, setAggGranularity] = useState<AggGranularity>();

  const granularityLevels = useMemo<DataLevel[]>(
    () => [...aggLevels, ...tileStatesLevels],
    [aggLevels],
  );

  const getHasFallbackData = useCallback(
    (granularity: TileStatesGranularity) => (tileRangeNs: NsTsRange) => {
      if (hasFallbackData[granularity](tileRangeNs)) return true;
      const visibleRange = store.get(visibleRangeAtom);
      if (!visibleRange) return false;
      const viewAggId = getAggGranularity(visibleRange[1] - visibleRange[0], {
        ignoreMinimum: true,
      });
      return aggLevels.some(
        (level, idx) =>
          isUsableAggFallback(aggLevels, idx, viewAggId) &&
          level.isRangeFetched(tileRangeNs, false),
      );
    },
    [aggLevels],
  );
  const hasTxnFallback = useMemo(
    () => getHasFallbackData(TileStatesGranularityEnum.txn),
    [getHasFallbackData],
  );
  const hasBatchFallback = useMemo(
    () => getHasFallbackData(TileStatesGranularityEnum.txn_batch),
    [getHasFallbackData],
  );
  const queryTxn = useTileCacheQuery(tileStatesCaches.txn, hasTxnFallback);
  const queryBatch = useTileCacheQuery(
    tileStatesCaches.txn_batch,
    hasBatchFallback,
  );

  const query = useThrottledCallback(
    (referenceNs: bigint, visibleRangeMs: TsRange, worldRangeMs: TsRange) => {
      if (isAggregate(visibleRangeMs)) {
        const aggGranularity = getAggGranularity(
          visibleRangeMs[1] - visibleRangeMs[0],
        );
        aggQuery(
          referenceNs,
          visibleRangeMs,
          worldRangeMs,
          aggGranularity,
          granularityLevels,
        );
        setAggGranularity(aggGranularity);
        return;
      }

      pauseStaleAggRefreshes();
      const granularity = getTileStatesGranularity(
        visibleRangeMs[1] - visibleRangeMs[0],
      );
      const query =
        granularity === TileStatesGranularityEnum.txn ? queryTxn : queryBatch;
      query(referenceNs, visibleRangeMs, worldRangeMs);
    },
    100,
    { leading: true, trailing: true },
  );

  useLayoutEffect(() => () => query.cancel(), [query]);

  const tiles = useAtomValue(tilesAtom);
  const tilesKey = useMemo(
    () => (tiles ?? []).map(getTileKey).join(","),
    [tiles],
  );

  const requery = useCallback(() => {
    const refNs = store.get(referenceNsAtom);
    const visibleRangeMs = store.get(visibleRangeAtom);
    const worldRangeMs = store.get(worldRangeAtom);
    if (refNs == null || !visibleRangeMs || !worldRangeMs) return;
    query(refNs, visibleRangeMs, worldRangeMs);
  }, [query]);

  // Refresh agg states if list of tiles change
  useLayoutEffect(() => {
    if (!store.set(syncAggTileStatesTilesAtom, tilesKey)) return;
    clearAggCache();
    requery();
  }, [tilesKey, clearAggCache, requery]);

  return { query, aggGranularity, granularityLevels };
}
