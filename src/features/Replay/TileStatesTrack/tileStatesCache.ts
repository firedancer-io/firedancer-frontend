import { getDefaultStore } from "jotai";
import { TileState, TileStatesGranularityEnum } from "../../../api/entities";
import type {
  TileStatesGranularity,
  TimelineTileStates,
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
import { referenceNsAtom } from "../atoms";

const store = getDefaultStore();

export const tileStatesRequests = createPendingRequests<TimelineTileStates>();

const tileStatesSet = new Set<number>(
  Object.values(TileState).filter(
    (value): value is number => typeof value === "number",
  ),
);

// only log unknown states once each
const loggedUnknownTileStates = new Set<number>();

function isKnownTileState(state: number): state is TileState {
  const isKnown = tileStatesSet.has(state);
  if (!isKnown && !loggedUnknownTileStates.has(state)) {
    loggedUnknownTileStates.add(state);
    console.error(`Received unrecognized tile state: ${state}`);
  }
  return isKnown;
}

/** Timestamps are relative to referenceNsAtom */
export interface TileStateColumns {
  // One entry per drawn state (Idle is dropped)
  state: TileState[];
  state_tile: number[];
  state_start_ms: number[];
  state_end_ms: number[];
  // One entry per txn segment: a sigverify, or a txn's execution stages
  txn_slot: number[];
  txn_idx: number[];
  txn_tile: number[];
  txn_start_ms: number[];
  txn_end_ms: number[];
  txn_error_code: (number | null)[];
}

function emptyColumns(): TileStateColumns {
  return {
    state: [],
    state_tile: [],
    state_start_ms: [],
    state_end_ms: [],
    txn_slot: [],
    txn_idx: [],
    txn_tile: [],
    txn_start_ms: [],
    txn_end_ms: [],
    txn_error_code: [],
  };
}

function parseTileStates(res: TimelineTileStates): TileStateColumns {
  const acc = emptyColumns();
  if (res.state.length === 0) return acc;

  const referenceNs = store.get(referenceNsAtom);
  if (referenceNs == null) return acc;
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
  // in `state` and `dur`. Each tile starts at the response's `start_ts`.
  let stateIdx = 0;
  for (let tileIdx = 0; tileIdx < res.tile.length; tileIdx++) {
    const tile = res.tile[tileIdx] ?? -1;
    const endStateIdxForTile = stateIdx + res.state_cnt[tileIdx];

    let nextStateStartNs = baseStartNs;
    for (; stateIdx < endStateIdxForTile; stateIdx++) {
      const state = res.state[stateIdx];
      const startNs = nextStateStartNs;
      const endNs = startNs + res.dur[stateIdx];
      nextStateStartNs = endNs;

      stateStartNs[stateIdx] = startNs;
      stateTile[stateIdx] = tile;

      // Skips idle state because it isn't drawn, and unknown states since
      // they have no color or channel
      if (
        tile < 0 ||
        state === TileState.Idle ||
        endNs === startNs ||
        !isKnownTileState(state)
      )
        continue;
      acc.state.push(state);
      acc.state_tile.push(tile);
      acc.state_start_ms.push(startNs / nsPerMs);
      acc.state_end_ms.push(endNs / nsPerMs);
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
    acc.txn_error_code.push(res.txn_error_code[segmentIdx]);
  }
  return acc;
}

function appendColumns(acc: TileStateColumns, src: TileStateColumns): void {
  for (let i = 0; i < src.state.length; i++) {
    acc.state.push(src.state[i]);
    acc.state_tile.push(src.state_tile[i]);
    acc.state_start_ms.push(src.state_start_ms[i]);
    acc.state_end_ms.push(src.state_end_ms[i]);
  }
  for (let i = 0; i < src.txn_idx.length; i++) {
    acc.txn_slot.push(src.txn_slot[i]);
    acc.txn_idx.push(src.txn_idx[i]);
    acc.txn_tile.push(src.txn_tile[i]);
    acc.txn_start_ms.push(src.txn_start_ms[i]);
    acc.txn_end_ms.push(src.txn_end_ms[i]);
    acc.txn_error_code.push(src.txn_error_code[i]);
  }
}

function itemCount(states: TileStateColumns): number {
  return states.state.length + states.txn_idx.length;
}

const CACHE_MAX_TILES = 128;
const MIN_SUB_TILE_NS = 1_000_000n; // 1ms
const TXN_TILE_NS = 8_000_000_000n; // 8s
const BATCH_TILE_MULTIPLE = 8; // 64s
const BATCH_TILE_NS = TXN_TILE_NS * BigInt(BATCH_TILE_MULTIPLE);

const TILE_NS: Record<TileStatesGranularity, bigint> = {
  txn: TXN_TILE_NS,
  txn_batch: BATCH_TILE_NS,
};

const CACHE_MAX_ITEMS: Record<TileStatesGranularity, number> = {
  txn: 1_000_000,
  txn_batch: 2_000_000,
};

export type TileStatesDataTile = Tile<TileStateColumns, null>;
export type TileStatesCacheDelta = TileCacheDelta<TileStateColumns, null>;

function createCache(
  granularity: TileStatesGranularity,
): TileCache<TileStateColumns, null> {
  return createTileCache<TileStateColumns, null>({
    tileNs: TILE_NS[granularity],
    minSubTileNs: MIN_SUB_TILE_NS,
    maxItems: CACHE_MAX_ITEMS[granularity],
    maxTiles: CACHE_MAX_TILES,
    empty: emptyColumns,
    merge: appendColumns,
    itemCount,
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
            availableEndNs: result.value.available_end_ns,
          }
        : result;
    },
    failPendingRequests: tileStatesRequests.failAll,
  });
}

export const tileStatesCaches: Record<
  TileStatesGranularity,
  TileCache<TileStateColumns, null>
> = {
  txn: createCache(TileStatesGranularityEnum.txn),
  txn_batch: createCache(TileStatesGranularityEnum.txn_batch),
};
