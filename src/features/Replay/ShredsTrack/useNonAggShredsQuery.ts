import { useCallback, useRef } from "react";
import { useSetAtom } from "jotai";
import { useWebSocketSend } from "../../../api/ws/utils";
import type { NsTsRange, TsRange } from "../../WebGl/webglUtils";
import type { TimelineShreds, ShredsGranularity } from "../../../api/types";
import { ShredsGranularityEnum } from "../../../api/entities";
import { calcAbsoluteNs, useTimelineServerMessage } from "../utils";
import { timelineFecShredsAtoms, timelineShredsAtoms } from "./atoms";
import { nsPerMs } from "../../../consts";
import { useTiledQueries } from "../useTiledQueries";
import type { TimelineQueryKey } from "../atoms";

const QUERY_KEY = "query_shreds" satisfies TimelineQueryKey;

export const OVERSCAN_TILES_COUNT = 3;
const TILE_EVICTION_HIGH_WATERMARK = 24;
const TILE_EVICTION_LOW_WATERMARK = 16;

export const tileSizeMs = 3_000;
export const tileSizeNs = BigInt(tileSizeMs * nsPerMs);

function getTileSizeNs() {
  return tileSizeNs;
}

export function useNonAggShredsQuery(chartId: string) {
  const addShredEvents = useSetAtom(timelineShredsAtoms.addShredEvents);
  const addFecShredEvents = useSetAtom(timelineFecShredsAtoms.addShredEvents);
  const addForGranularity = useCallback(
    (granularity: ShredsGranularity) =>
      granularity === ShredsGranularityEnum.fec
        ? addFecShredEvents
        : addShredEvents,
    [addShredEvents, addFecShredEvents],
  );

  // granularity of the last query, so hasPendingTiles can read the active one
  const latestGranularityRef = useRef<ShredsGranularity>();

  const deleteShredTilesForGranularity = useSetAtom(
    timelineShredsAtoms.deleteTilesData,
  );
  const deleteFecTilesForGranularity = useSetAtom(
    timelineFecShredsAtoms.deleteTilesData,
  );

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
      const del =
        granularity === ShredsGranularityEnum.fec
          ? deleteFecTilesForGranularity
          : deleteShredTilesForGranularity;
      del(tileIdxs);
    },
    [deleteFecTilesForGranularity, deleteShredTilesForGranularity],
  );

  const { queryRange, markQueryComplete, hasPendingTiles } =
    useTiledQueries<ShredsGranularity>({
      chartId,
      getTileSizeNs,
      overscanTilesCount: OVERSCAN_TILES_COUNT,
      queryKey: QUERY_KEY,
      sendQuery,
      tileEvictionHighWatermark: TILE_EVICTION_HIGH_WATERMARK,
      tileEvictionLowWatermark: TILE_EVICTION_LOW_WATERMARK,
      onEvictTiles,
    });

  useTimelineServerMessage(
    QUERY_KEY,
    useCallback(
      (message: { id: number; value: TimelineShreds }) => {
        const queryInfo = markQueryComplete(message.id);
        if (queryInfo == null) return;
        addForGranularity(message.value.granularity)(queryInfo.tileIdx, [
          message.value,
        ]);
      },
      [addForGranularity, markQueryComplete],
    ),
  );

  // trigger redraw if panning to already fetched data
  const onNothingToFetch = useCallback(
    (granularity: ShredsGranularity) => {
      addForGranularity(granularity)(-1, []);
    },
    [addForGranularity],
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
      latestGranularityRef.current = granularity;
      queryRange(visibleRangeNs, worldRangeNs, granularity, onNothingToFetch);
    },
    [onNothingToFetch, queryRange],
  );

  // whether any tile is still in flight for the last-queried non-agg
  // granularity. The draw path uses this to gate hiding of trailing incomplete
  // slots (their data may not be settled yet).
  const hasPendingTiles_ = useCallback((): boolean => {
    const granularity = latestGranularityRef.current;
    if (granularity == null) return false;
    return hasPendingTiles(granularity);
  }, [hasPendingTiles]);

  return { query, hasPendingTiles: hasPendingTiles_ };
}

const NON_AGG_FEC_THRESHOLD_MS = 30_000;

export function getNonAggGranularity(windowSizeMs: number) {
  return windowSizeMs > NON_AGG_FEC_THRESHOLD_MS
    ? ShredsGranularityEnum.fec
    : ShredsGranularityEnum.shred;
}
