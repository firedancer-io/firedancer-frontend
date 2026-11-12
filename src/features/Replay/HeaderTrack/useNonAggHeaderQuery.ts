import { useCallback, useLayoutEffect, useMemo } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import type { TimelineSlots } from "../../../api/types";
import type { TsRange } from "../../WebGl/webglUtils";
import {
  calcAbsoluteNsRange,
  getVisibleWorldRangeNs,
  useTimelineServerMessage,
} from "../utils";
import { createParallelCache } from "../parallelQueriesCache";
import { SLOTS_QUERY_KEY, useSlotsQuery } from "../useSlotsQuery";
import { nsPerMs } from "../../../consts";
import { bigIntMax } from "../../../mathUtils";
import {
  addTimelineSlotsAtom,
  deleteTimelineSlotTilesAtom,
  timelineSlotsEmitterAtom,
} from "./nonAggAtoms";
import { drawEventType } from "../const";
const granularity = "";

export const OVERSCAN_TILES_COUNT = 2;
export const OVERSCAN_DRAW_TILES_COUNT = 1;
const TILE_EVICTION_HIGH_WATERMARK = 48;
const TILE_EVICTION_LOW_WATERMARK = 40;
const getTileEvictionHighWatermark = () => TILE_EVICTION_HIGH_WATERMARK;
const getTileEvictionLowWatermark = () => TILE_EVICTION_LOW_WATERMARK;

export const tileSizeNs = BigInt(10_000 * nsPerMs);

function getTileSizeNs() {
  return tileSizeNs;
}

export function useNonAggHeaderQuery(chartId: string) {
  const addTimelineSlots = useSetAtom(addTimelineSlotsAtom);
  const deleteTimelineSlotTiles = useSetAtom(deleteTimelineSlotTilesAtom);
  const emitter = useAtomValue(timelineSlotsEmitterAtom);
  const slotsQuery = useSlotsQuery();

  const sendQuery = useCallback(
    (queryId: number, startNs: bigint, endNs: bigint) => {
      slotsQuery(queryId, [startNs, endNs]);
    },
    [slotsQuery],
  );

  const onEvictTiles = useCallback(
    (_granularity: string, tileIdxs: number[]) => {
      deleteTimelineSlotTiles(tileIdxs);
    },
    [deleteTimelineSlotTiles],
  );

  const cache = useMemo(
    () =>
      createParallelCache<typeof granularity>({
        chartId,
        getTileSizeNs,
        overscanTilesCount: OVERSCAN_TILES_COUNT,
        queryKey: SLOTS_QUERY_KEY,
        sendQuery,
        getTileEvictionHighWatermark,
        getTileEvictionLowWatermark,
        onEvictTiles,
      }),
    [chartId, sendQuery, onEvictTiles],
  );
  const { queryRange, markQueryComplete, getLevel } = cache;

  useLayoutEffect(() => {
    const unsub = cache.init();
    return () => {
      unsub();
      cache.clearPending();
    };
  }, [cache]);

  useTimelineServerMessage(
    SLOTS_QUERY_KEY,
    (message: { id: number; value: TimelineSlots }) => {
      const tileIdx = markQueryComplete(
        message.id,
        undefined,
        message.value.available_start_ns,
      )?.tileIdx;
      if (tileIdx == null) return;

      addTimelineSlots(tileIdx, message.value);
    },
  );

  // trigger redraw if panning to already fetched data
  const onNothingToFetch = useCallback(() => {
    emitter.emit(drawEventType);
  }, [emitter]);

  const query = useCallback(
    (referenceNs: bigint, visibleRange: TsRange, worldRange: TsRange) => {
      queryRange(
        calcAbsoluteNsRange(referenceNs, visibleRange),
        calcAbsoluteNsRange(referenceNs, worldRange),
        granularity,
        undefined,
        onNothingToFetch,
      );
    },
    [onNothingToFetch, queryRange],
  );

  const level = useMemo(() => getLevel(granularity, false), [getLevel]);

  /**
   * Whether every in world visible tile has loaded. The server has no slots
   * before the available start, so only the rest of the range needs to load.
   */
  const isVisibleFetched = useCallback(
    (referenceNs: bigint, visibleRange: TsRange, worldRange: TsRange) => {
      const [startNs, endNs] = getVisibleWorldRangeNs(
        referenceNs,
        visibleRange,
        worldRange,
      );
      const availableStartNs = level.getAvailableStartNs?.();
      const fetchStartNs =
        availableStartNs === undefined
          ? startNs
          : bigIntMax(startNs, availableStartNs);
      return (
        fetchStartNs >= endNs || level.isRangeFetched([fetchStartNs, endNs])
      );
    },
    [level],
  );

  return { query, isVisibleFetched };
}
