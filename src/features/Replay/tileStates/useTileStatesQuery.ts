import { getDefaultStore, useAtomValue } from "jotai";
import { useCallback, useLayoutEffect, useMemo, useState } from "react";
import { useThrottledCallback } from "use-debounce";
import type { TsRange } from "../../WebGl/webglUtils.ts";
import { tilesAtom } from "../../../api/atoms.ts";
import type { AggGranularity } from "../../../api/types.ts";
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
import type { DataLevel } from "../coverage.ts";
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

  const queryTxn = useTileCacheQuery(tileStatesCaches.txn, hasFallbackData.txn);
  const queryBatch = useTileCacheQuery(
    tileStatesCaches.txn_batch,
    hasFallbackData.txn_batch,
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
