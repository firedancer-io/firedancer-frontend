import { getDefaultStore } from "jotai";
import { TileStatesGranularityEnum } from "../../../api/entities";
import type {
  TileStatesGranularity,
  TimelineTileStatesChunk,
} from "../../../api/types";
import { sendMessage } from "../../../api/worker/useWsWorker";
import { nsPerMs } from "../../../consts";
import {
  createTileCache,
  type Tile,
  type TileCache,
  type TileCacheDelta,
} from "../tiles/cache";
import { createPendingRequests } from "../tiles/requests";
import { getChunksEndNs } from "../utils";
import { referenceNsAtom } from "../atoms";
import { tileKinds, tileStatesTileNs } from "./consts";
import {
  concatLevels,
  pruneLevels,
  type MergedLevels,
  type MergedTileStatesResponse,
} from "./mergeTileStates";
import type { NsTsRange } from "../../WebGl/webglUtils";
import type { DataLevel } from "../coverage";

const store = getDefaultStore();

export const tileStatesRequests =
  createPendingRequests<MergedTileStatesResponse>();

/** Txn timestamps are relative to referenceNsAtom */
export interface TileStatesData {
  levels: MergedLevels;
  // the levels' slots are from it, NaN without slots
  referenceSlot: number;
  // One entry per txn segment: a sigverify, or a txn's execution stages
  txn_slot: number[];
  txn_idx: number[];
  txn_tile: number[];
  txn_start_ms: number[];
  txn_end_ms: number[];
  txn_error_code: (number | null)[];
  lthash_slot: number[];
  lthash_tile: number[];
  lthash_start_ms: number[];
  lthash_end_ms: number[];
}

function emptyData(): TileStatesData {
  return {
    levels: { execrp: [], replay: [] },
    referenceSlot: NaN,
    txn_slot: [],
    txn_idx: [],
    txn_tile: [],
    txn_start_ms: [],
    txn_end_ms: [],
    txn_error_code: [],
    lthash_slot: [],
    lthash_tile: [],
    lthash_start_ms: [],
    lthash_end_ms: [],
  };
}

function parseTxns(
  res: TimelineTileStatesChunk,
  referenceNs: bigint,
  acc: TileStatesData,
) {
  const baseStartNs = Number(res.start_ts - referenceNs);
  const stateStartNs = new Float64Array(res.state.length);
  const stateTile = new Int32Array(res.state.length);

  // `state` and `dur` hold every tile's states back to back, e.g.
  //
  //   stateIdx:  0  1  2 | 3  4  5  6  7  8 | 9  10 11
  //   tileIdx:   0       | 1                | 2
  //   state_cnt: 3       | 6                | 3
  //
  // The tile at `tileIdx` owns the next `state_cnt[tileIdx]` entries
  // in `state` and `dur`. A tile's first state starts at `start_ts` plus its
  // `tile_start_ts_delta`, which can be negative, and each later state where
  // the previous one ends.
  let stateIdx = 0;
  for (let tileIdx = 0; tileIdx < res.tile.length; tileIdx++) {
    const tile = res.tile[tileIdx] ?? -1;
    const endStateIdxForTile = stateIdx + res.state_cnt[tileIdx];
    let nextStateStartNs =
      baseStartNs + (res.tile_start_ts_delta[tileIdx] || 0);
    for (; stateIdx < endStateIdxForTile; stateIdx++) {
      stateStartNs[stateIdx] = nextStateStartNs;
      stateTile[stateIdx] = tile;
      nextStateStartNs += res.dur[stateIdx];
    }
  }

  // Each txn segment is a slice of one tile's states (a sigverify or an execution), e.g.
  //
  //   stateIdx:  0  1  2 | 3  4  5  6  7  8
  //   state:     ·  S  · | ·  L  V  E  P  ·
  //   segment 0:    ^    |                    lo 1, cnt 1
  //   segment 1:         |    ^--------^      lo 4, cnt 4
  const refSlot = res.reference_slot ?? 0;
  for (let segmentIdx = 0; segmentIdx < res.txn_state_lo.length; segmentIdx++) {
    const firstStateIdx = res.txn_state_lo[segmentIdx];
    const lastStateIdx = firstStateIdx + res.txn_state_cnt[segmentIdx] - 1;
    if (stateTile[firstStateIdx] < 0) continue;
    acc.txn_slot.push(refSlot + res.txn_slot_delta[segmentIdx]);
    acc.txn_idx.push(res.txn_idx[segmentIdx]);
    acc.txn_tile.push(stateTile[firstStateIdx]);
    acc.txn_start_ms.push(stateStartNs[firstStateIdx] / nsPerMs);
    acc.txn_end_ms.push(
      (stateStartNs[lastStateIdx] + res.dur[lastStateIdx]) / nsPerMs,
    );
    const errorCode = res.txn_error_code[segmentIdx];
    acc.txn_error_code.push(Number.isNaN(errorCode) ? null : errorCode);
  }

  for (let taskIdx = 0; taskIdx < res.lthash_state_lo.length; taskIdx++) {
    const stateIdx = res.lthash_state_lo[taskIdx];
    if (stateTile[stateIdx] < 0 || !res.dur[stateIdx]) continue;
    acc.lthash_slot.push(refSlot + res.lthash_slot_delta[taskIdx]);
    acc.lthash_tile.push(stateTile[stateIdx]);
    acc.lthash_start_ms.push(stateStartNs[stateIdx] / nsPerMs);
    acc.lthash_end_ms.push(
      (stateStartNs[stateIdx] + res.dur[stateIdx]) / nsPerMs,
    );
  }
}

function parseTileStates(res: MergedTileStatesResponse): TileStatesData {
  const acc = emptyData();
  const referenceNs = store.get(referenceNsAtom);
  if (referenceNs == null || !res.merged) return acc;
  acc.levels = res.merged.levels;
  acc.referenceSlot = res.merged.referenceSlot;
  for (const chunk of res.chunks) parseTxns(chunk, referenceNs, acc);
  return acc;
}

function appendData(acc: TileStatesData, src: TileStatesData): void {
  if (Number.isNaN(acc.referenceSlot)) acc.referenceSlot = src.referenceSlot;
  const slotShift = src.referenceSlot - acc.referenceSlot;
  for (const kind of tileKinds) {
    acc.levels[kind] = concatLevels(
      acc.levels[kind],
      src.levels[kind],
      slotShift,
    );
  }
  for (let i = 0; i < src.txn_idx.length; i++) {
    acc.txn_slot.push(src.txn_slot[i]);
    acc.txn_idx.push(src.txn_idx[i]);
    acc.txn_tile.push(src.txn_tile[i]);
    acc.txn_start_ms.push(src.txn_start_ms[i]);
    acc.txn_end_ms.push(src.txn_end_ms[i]);
    acc.txn_error_code.push(src.txn_error_code[i]);
  }
  for (let i = 0; i < src.lthash_slot.length; i++) {
    acc.lthash_slot.push(src.lthash_slot[i]);
    acc.lthash_tile.push(src.lthash_tile[i]);
    acc.lthash_start_ms.push(src.lthash_start_ms[i]);
    acc.lthash_end_ms.push(src.lthash_end_ms[i]);
  }
}

function itemCount(data: TileStatesData): number {
  let rectCount = 0;
  for (const kind of tileKinds) {
    for (const { count } of data.levels[kind]) rectCount += count;
  }
  return rectCount + data.txn_idx.length + data.lthash_slot.length;
}

// only a fully fetched tile's rect counts tell which levels to drop
function completeData(data: TileStatesData): TileStatesData {
  return {
    ...data,
    levels: {
      execrp: pruneLevels(data.levels.execrp),
      replay: pruneLevels(data.levels.replay),
    },
  };
}

const CACHE_MAX_TILES = 128;
const MIN_SUB_TILE_NS = 1_000_000n; // 1ms

// items count every kept level
const CACHE_MAX_ITEMS: Record<TileStatesGranularity, number> = {
  txn: 2_000_000,
  txn_batch: 4_000_000,
};

export type TileStatesDataTile = Tile<TileStatesData, null>;
export type TileStatesCacheDelta = TileCacheDelta<TileStatesData, null>;

function createCache(
  granularity: TileStatesGranularity,
): TileCache<TileStatesData, null> {
  return createTileCache<TileStatesData, null>({
    tileNs: tileStatesTileNs[granularity],
    minSubTileNs: MIN_SUB_TILE_NS,
    maxItems: CACHE_MAX_ITEMS[granularity],
    maxTiles: CACHE_MAX_TILES,
    empty: emptyData,
    merge: appendData,
    itemCount,
    complete: completeData,
    deriveMeta: () => null,
    fetch: async ([start, end], id) => {
      sendMessage({
        topic: "timeline",
        key: "query_tile_states",
        id,
        params: {
          start_ns: start.toString(),
          // end_ns is exclusive so +1n includes items at end
          end_ns: (end + 1n).toString(),
          granularity,
        },
      });
      const result = await tileStatesRequests.awaitResponse(id);

      return "value" in result
        ? {
            value: parseTileStates(result.value),
            chunksEndNs: getChunksEndNs(result.value.chunks),
            availableStartNs: result.value.available_start_ns,
          }
        : result;
    },
    failPendingRequests: tileStatesRequests.failAll,
  });
}

export const tileStatesCaches: Record<
  TileStatesGranularity,
  TileCache<TileStatesData, null>
> = {
  txn: createCache(TileStatesGranularityEnum.txn),
  txn_batch: createCache(TileStatesGranularityEnum.txn_batch),
};

/**
 * Whether a data tile's range has other granularity data to draw while it loads
 */
export const hasFallbackData: Record<
  TileStatesGranularity,
  (tileRangeNs: NsTsRange) => boolean
> = {
  txn: (tileRangeNs) => tileStatesCaches.txn_batch.isRangeFetched(tileRangeNs),
  txn_batch: (tileRangeNs) => {
    for (
      let txnStartNs =
        (tileRangeNs[0] / tileStatesTileNs.txn) * tileStatesTileNs.txn;
      txnStartNs < tileRangeNs[1];
      txnStartNs += tileStatesTileNs.txn
    ) {
      const txnRangeNs: NsTsRange = [
        txnStartNs,
        txnStartNs + tileStatesTileNs.txn,
      ];
      if (tileStatesCaches.txn.isRangeFetched(txnRangeNs)) return true;
    }
    return false;
  },
};

export const tileStatesLevels: DataLevel[] = [
  TileStatesGranularityEnum.txn_batch,
  TileStatesGranularityEnum.txn,
].map((granularity) => ({
  id: granularity,
  isAgg: false,
  tileSizeNs: tileStatesTileNs[granularity],
  isRangeFetched: (rangeNs) =>
    tileStatesCaches[granularity].isRangeFetched(rangeNs),
  getAvailableStartNs: tileStatesCaches[granularity].getAvailableStartNs,
}));
