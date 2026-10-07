import { useCallback } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import type { TimelineSlots } from "../../../api/types";
import type { NsTsRange, TsRange } from "../../WebGl/webglUtils";
import { calcAbsoluteNs, useTimelineServerMessage } from "../utils";
import { useTiledQueries } from "../useTiledQueries";
import { SLOTS_QUERY_KEY, useSlotsQuery } from "../useSlotsQuery";
import { nsPerMs } from "../../../consts";
import {
  addTimelineSlotsAtom,
  deleteTimelineSlotTilesAtom,
  drawEventType,
  timelineSlotsEmitterAtom,
} from "./nonAggAtoms";
const granularity = "";

export const OVERSCAN_TILES_COUNT = 2;
const TILE_EVICTION_HIGH_WATERMARK = 24;
const TILE_EVICTION_LOW_WATERMARK = 16;

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

  const { queryRange, markQueryComplete } = useTiledQueries<typeof granularity>(
    {
      chartId,
      getTileSizeNs,
      overscanTilesCount: OVERSCAN_TILES_COUNT,
      queryKey: SLOTS_QUERY_KEY,
      sendQuery,
      tileEvictionHighWatermark: TILE_EVICTION_HIGH_WATERMARK,
      tileEvictionLowWatermark: TILE_EVICTION_LOW_WATERMARK,
      onEvictTiles,
    },
  );

  useTimelineServerMessage(
    SLOTS_QUERY_KEY,
    useCallback(
      (message: { id: number; value: TimelineSlots }) => {
        const tileIdx = markQueryComplete(message.id)?.tileIdx;
        if (tileIdx == null) return;

        addTimelineSlots(tileIdx, message.value);
      },
      [addTimelineSlots, markQueryComplete],
    ),
  );

  // trigger redraw if panning to already fetched data
  const onNothingToFetch = useCallback(() => {
    emitter.emit(drawEventType);
  }, [emitter]);

  return useCallback(
    (referenceNs: bigint, visibleRange: TsRange, worldRange: TsRange) => {
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
}
