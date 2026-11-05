import { useCallback } from "react";
import { useStore } from "jotai";
import { useWebSocketSend } from "../../../api/ws/utils";
import type { NsTsRange, TsRange } from "../../WebGl/webglUtils";
import type { TimelineShreds, ShredsGranularity } from "../../../api/types";
import { ShredsGranularityEnum } from "../../../api/entities";
import {
  calcAbsoluteNs,
  getChunksEndNs,
  getVisibleWorldRangeNs,
  useTimelineServerMessage,
} from "../utils";
import { drawEventType, getNonAggAtoms } from "./atoms";
import { nsPerMs } from "../../../consts";
import { useTiledQueries } from "../useTiledQueries";
import type { TimelineQueryKey } from "../atoms";

const QUERY_KEY = "query_shreds" satisfies TimelineQueryKey;

export const OVERSCAN_TILES_COUNT = 3;

function getTileEvictionHighWatermark(granularity: ShredsGranularity): number {
  switch (granularity) {
    case ShredsGranularityEnum.fec:
      return 80;
    case ShredsGranularityEnum.shred:
      return 40;
  }
}
function getTileEvictionLowWatermark(granularity: ShredsGranularity): number {
  switch (granularity) {
    case ShredsGranularityEnum.fec:
      return 68;
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
  resetMeshes: (granularity: ShredsGranularity, slotNumbers: number[]) => void,
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

  const { queryRange, markQueryComplete, isRangeFetched, pauseStaleRefreshes } =
    useTiledQueries<ShredsGranularity>({
      chartId,
      getTileSizeNs,
      overscanTilesCount: OVERSCAN_TILES_COUNT,
      queryKey: QUERY_KEY,
      sendQuery,
      getTileEvictionHighWatermark,
      getTileEvictionLowWatermark,
      onEvictTiles,
    });

  useTimelineServerMessage(
    QUERY_KEY,
    useCallback(
      (message: { id: number; value: TimelineShreds }) => {
        const { granularity, chunks } = message.value;
        const queryInfo = markQueryComplete(
          message.id,
          getChunksEndNs(chunks) ?? 0n,
        );
        if (queryInfo == null) return;
        const touchedSlots = store.set(
          getNonAggAtoms(granularity).addShredEvents,
          queryInfo.tileIdx,
          message.value,
        );
        // clear meshes so next draw recreates them with fresh data
        resetMeshes(granularity, touchedSlots);
        store.get(getNonAggAtoms(granularity).emitter).emit(drawEventType);
      },
      [store, markQueryComplete, resetMeshes],
    ),
  );

  // trigger redraw if panning to already fetched data
  const onNothingToFetch = useCallback(
    (granularity: ShredsGranularity) => {
      store.get(getNonAggAtoms(granularity).emitter).emit(drawEventType);
    },
    [store],
  );

  const query = useCallback(
    (
      referenceNs: bigint,
      visibleRange: TsRange,
      worldRange: TsRange,
      granularity: ShredsGranularity,
    ) => {
      const visibleRangeNs: NsTsRange = [
        calcAbsoluteNs(referenceNs, visibleRange[0]),
        calcAbsoluteNs(referenceNs, visibleRange[1]),
      ];
      const worldRangeNs: NsTsRange = [
        calcAbsoluteNs(referenceNs, worldRange[0]),
        calcAbsoluteNs(referenceNs, worldRange[1]),
      ];
      queryRange(visibleRangeNs, worldRangeNs, granularity, onNothingToFetch);
    },
    [onNothingToFetch, queryRange],
  );

  /**
   * Whether every visible tile has data in either granularity, since drawing
   * falls back to the other granularity
   */
  const isVisibleDrawable = useCallback(
    (referenceNs: bigint, visibleRange: TsRange, worldRange: TsRange) => {
      const [startNs, endNs] = getVisibleWorldRangeNs(
        referenceNs,
        visibleRange,
        worldRange,
      );
      for (
        let tileStartNs = (startNs / tileSizeNs) * tileSizeNs;
        tileStartNs < endNs;
        tileStartNs += tileSizeNs
      ) {
        const tileRangeNs: NsTsRange = [tileStartNs, tileStartNs + tileSizeNs];
        if (
          !isRangeFetched(ShredsGranularityEnum.fec, tileRangeNs) &&
          !isRangeFetched(ShredsGranularityEnum.shred, tileRangeNs)
        ) {
          return false;
        }
      }
      return true;
    },
    [isRangeFetched],
  );

  return {
    query,
    isVisibleDrawable,
    pauseStaleRefreshes,
  };
}
