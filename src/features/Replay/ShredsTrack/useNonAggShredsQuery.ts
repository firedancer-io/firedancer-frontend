import { useCallback, useLayoutEffect, useMemo } from "react";
import { useStore } from "jotai";
import { useWebSocketSend } from "../../../api/ws/utils";
import type { TsRange } from "../../WebGl/webglUtils";
import type { TimelineShreds, ShredsGranularity } from "../../../api/types";
import { ShredsGranularityEnum } from "../../../api/entities";
import {
  calcAbsoluteNsRange,
  getChunksEndNs,
  useTimelineServerMessage,
} from "../utils";
import { getNonAggAtoms } from "./atoms";
import { drawEventType } from "../const";
import { nsPerMs } from "../../../consts";
import { createParallelCache } from "../parallelQueriesCache";
import { hasFallbackData, type DataLevel } from "../coverage";
import type { TimelineQueryKey } from "../atoms";

const QUERY_KEY = "query_shreds" satisfies TimelineQueryKey;

export const OVERSCAN_TILES_COUNT = 3;

function getTileEvictionHighWatermark(granularity: ShredsGranularity): number {
  switch (granularity) {
    case ShredsGranularityEnum.fec:
      return 138;
    case ShredsGranularityEnum.shred:
      return 40;
  }
}
function getTileEvictionLowWatermark(granularity: ShredsGranularity): number {
  switch (granularity) {
    case ShredsGranularityEnum.fec:
      return 126;
    case ShredsGranularityEnum.shred:
      return 28;
  }
}

export const tileSizeMs = 3_000;
export const tileSizeNs = BigInt(tileSizeMs * nsPerMs);

function getTileSizeNs() {
  return tileSizeNs;
}

export function useNonAggShredsQuery(
  chartId: string,
  markMeshesStale: (
    granularity: ShredsGranularity,
    slotNumbers: number[],
  ) => void,
) {
  const store = useStore();
  const wsSend = useWebSocketSend();

  const sendQuery = useCallback(
    (
      queryId: number,
      startNs: bigint,
      endNs: bigint,
      granularity: ShredsGranularity,
    ) => {
      wsSend({
        topic: "timeline",
        key: QUERY_KEY,
        id: queryId,
        params: {
          start_ns: startNs.toString(),
          end_ns: endNs.toString(),
          granularity,
        },
      });
    },
    [wsSend],
  );

  const onEvictTiles = useCallback(
    (granularity: ShredsGranularity, tileIdxs: number[]) => {
      store.set(getNonAggAtoms(granularity).deleteTilesData, tileIdxs);
    },
    [store],
  );

  const cache = useMemo(
    () =>
      createParallelCache<ShredsGranularity>({
        chartId,
        getTileSizeNs,
        overscanTilesCount: OVERSCAN_TILES_COUNT,
        queryKey: QUERY_KEY,
        sendQuery,
        getTileEvictionHighWatermark,
        getTileEvictionLowWatermark,
        onEvictTiles,
      }),
    [chartId, sendQuery, onEvictTiles],
  );
  const { queryRange, markQueryComplete, getLevel, pauseStaleRefreshes } =
    cache;

  useLayoutEffect(() => {
    const unsub = cache.init();
    return () => {
      unsub();
      cache.clearPending();
    };
  }, [cache]);

  useTimelineServerMessage(
    QUERY_KEY,
    useCallback(
      (message: { id: number; value: TimelineShreds }) => {
        const { granularity, chunks, available_start_ns } = message.value;
        const queryInfo = markQueryComplete(
          message.id,
          getChunksEndNs(chunks) ?? 0n,
          available_start_ns,
        );
        if (queryInfo == null) return;
        const touchedSlots = store.set(
          getNonAggAtoms(granularity).addShredEvents,
          queryInfo.tileIdx,
          message.value,
        );
        // next draw redraws these slots with fresh data
        markMeshesStale(granularity, touchedSlots);
        store.get(getNonAggAtoms(granularity).emitter).emit(drawEventType);
      },
      [store, markQueryComplete, markMeshesStale],
    ),
  );

  // trigger redraw if panning to already fetched data
  const onNothingToFetch = useCallback(
    (granularity: ShredsGranularity) => {
      store.get(getNonAggAtoms(granularity).emitter).emit(drawEventType);
    },
    [store],
  );

  const granularityLevels = useMemo(
    () =>
      [ShredsGranularityEnum.fec, ShredsGranularityEnum.shred].map(
        (granularity) => getLevel(granularity, false),
      ),
    [getLevel],
  );

  const query = useCallback(
    (
      referenceNs: bigint,
      visibleRange: TsRange,
      worldRange: TsRange,
      granularity: ShredsGranularity,
      fallbackLevels: DataLevel[],
    ) => {
      const visibleRangeNs = calcAbsoluteNsRange(referenceNs, visibleRange);
      const worldRangeNs = calcAbsoluteNsRange(referenceNs, worldRange);
      queryRange(
        visibleRangeNs,
        worldRangeNs,
        granularity,
        undefined,
        onNothingToFetch,
        (tileRangeNs) =>
          hasFallbackData(
            fallbackLevels,
            granularity,
            tileRangeNs,
            visibleRangeNs[1] - visibleRangeNs[0],
            worldRangeNs,
          ),
      );
    },
    [onNothingToFetch, queryRange],
  );

  return {
    query,
    granularityLevels,
    pauseStaleRefreshes,
  };
}
