import { getDefaultStore } from "jotai";
import { sendMessage } from "../../../api/worker/useWsWorker";
import type { NsTsRange, TsRange } from "../../WebGl/webglUtils";
import type { TimelineShreds, ShredsGranularity } from "../../../api/types";
import { ShredsGranularityEnum } from "../../../api/entities";
import { calcAbsoluteNs, subscribeToTimelineMessages } from "../utils";
import { drawEventType, getNonAggAtoms } from "./atoms";
import { nsPerMs } from "../../../consts";
import { createParallelCache } from "../parallelCache";
import type { TimelineQueryKey } from "../atoms";
import { NON_AGG_SHREDS_CHART_ID } from "./const";

const store = getDefaultStore();

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

const sendQuery = (
  queryId: number,
  startNs: bigint,
  endNs: bigint,
  granularity: ShredsGranularity,
) => {
  sendMessage({
    topic: "timeline",
    key: QUERY_KEY,
    id: queryId,
    params: {
      start_ns: startNs.toString(),
      end_ns: endNs.toString(),
      granularity,
    },
  });
};

const onEvictTiles = (granularity: ShredsGranularity, tileIdxs: number[]) => {
  store.set(getNonAggAtoms(granularity).deleteTilesData, tileIdxs);
};

function createNonAggShredsCache() {
  const {
    queryRange,
    markQueryComplete,
    pauseStaleRefreshes,
    dispose: disposeParallelCache,
  } = createParallelCache<ShredsGranularity>({
    chartId: NON_AGG_SHREDS_CHART_ID,
    getTileSizeNs,
    overscanTilesCount: OVERSCAN_TILES_COUNT,
    queryKey: QUERY_KEY,
    sendQuery,
    getTileEvictionHighWatermark,
    getTileEvictionLowWatermark,
    onEvictTiles,
  });

  let unsubscribe: (() => void) | undefined;

  const init = (
    resetMeshes: (
      granularity: ShredsGranularity,
      slotNumbers: number[],
    ) => void,
  ) => {
    unsubscribe?.();
    unsubscribe = subscribeToTimelineMessages(
      QUERY_KEY,
      (message: { id: number; value: TimelineShreds }) => {
        const queryInfo = markQueryComplete(message.id);
        if (queryInfo == null) return;
        const { granularity } = message.value;
        const touchedSlots = store.set(
          getNonAggAtoms(granularity).addShredEvents,
          queryInfo.tileIdx,
          message.value,
        );
        // clear meshes so next draw recreates them with fresh data
        resetMeshes(granularity, touchedSlots);
        store.get(getNonAggAtoms(granularity).emitter).emit(drawEventType);
      },
    );
  };

  // trigger redraw if panning to already fetched data
  const onNothingToFetch = (granularity: ShredsGranularity) => {
    store.get(getNonAggAtoms(granularity).emitter).emit(drawEventType);
  };

  const query = (
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
  };

  const dispose = () => {
    unsubscribe?.();
    unsubscribe = undefined;
    disposeParallelCache();
  };

  return { query, pauseStaleRefreshes, init, dispose };
}

export const nonAggShredsCache = createNonAggShredsCache();
