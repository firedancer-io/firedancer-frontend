import type { TimelineTxnTimestamps } from "../../../api/types";
import {
  createTileCache,
  type Tile,
  type TileCache,
  type TileCacheDelta,
} from "../tiles/cache";
import { createPendingRequests } from "../tiles/requests";
import type { Interval } from "../tiles/splitFetch";
import type { ExecrpGranularity } from "./consts";

export const txnTimestampsRequests =
  createPendingRequests<TimelineTxnTimestamps>();

/**
 * Per-transaction replay lifecycle timestamps, stored as parallel arrays of
 * absolute UNIX nanoseconds. Nullable phases (check/exec/commit start) are
 * `undefined` when the transaction did not reach that phase.
 */
export interface TxnTimestampColumns {
  slot: number[];
  txn_idx: number[];
  txn_exec_idx: number[];
  txn_sigverify_exec_idx: number[];
  txn_sigverify_start_nanos: bigint[];
  txn_sigverify_end_nanos: bigint[];
  txn_load_start_nanos: bigint[];
  txn_check_start_nanos: (bigint | undefined)[];
  txn_exec_start_nanos: (bigint | undefined)[];
  txn_commit_start_nanos: (bigint | undefined)[];
  txn_commit_end_nanos: bigint[];
  txn_error_code: number[];
}

function emptyColumns(): TxnTimestampColumns {
  return {
    slot: [],
    txn_idx: [],
    txn_exec_idx: [],
    txn_sigverify_exec_idx: [],
    txn_sigverify_start_nanos: [],
    txn_sigverify_end_nanos: [],
    txn_load_start_nanos: [],
    txn_check_start_nanos: [],
    txn_exec_start_nanos: [],
    txn_commit_start_nanos: [],
    txn_commit_end_nanos: [],
    txn_error_code: [],
  };
}

function absNs(refTs: bigint, delta: bigint | null): bigint | undefined {
  return delta == null ? undefined : refTs + delta;
}

function parseTxnTimestamps(
  ts: TimelineTxnTimestamps | undefined,
): TxnTimestampColumns {
  const acc = emptyColumns();
  if (!ts || ts.slot_delta.length === 0) return acc;
  if (ts.reference_ts == null || ts.reference_slot == null) return acc;

  const refTs = ts.reference_ts;
  const refSlot = ts.reference_slot;

  for (let i = 0; i < ts.slot_delta.length; i++) {
    acc.slot.push(refSlot + ts.slot_delta[i]);
    acc.txn_idx.push(ts.txn_idx[i]);
    acc.txn_exec_idx.push(ts.txn_exec_idx[i]);
    acc.txn_sigverify_exec_idx.push(ts.txn_sigverify_exec_idx[i]);
    acc.txn_sigverify_start_nanos.push(
      refTs + ts.txn_sigverify_start_ts_delta[i],
    );
    acc.txn_sigverify_end_nanos.push(refTs + ts.txn_sigverify_end_ts_delta[i]);
    acc.txn_load_start_nanos.push(refTs + ts.txn_load_start_ts_delta[i]);
    acc.txn_check_start_nanos.push(
      absNs(refTs, ts.txn_check_start_ts_delta[i]),
    );
    acc.txn_exec_start_nanos.push(absNs(refTs, ts.txn_exec_start_ts_delta[i]));
    acc.txn_commit_start_nanos.push(
      absNs(refTs, ts.txn_commit_start_ts_delta[i]),
    );
    acc.txn_commit_end_nanos.push(refTs + ts.txn_commit_end_ts_delta[i]);
    acc.txn_error_code.push(ts.txn_error_code[i]);
  }
  return acc;
}

function appendColumns(
  acc: TxnTimestampColumns,
  src: TxnTimestampColumns,
): void {
  for (let i = 0; i < src.txn_exec_idx.length; i++) {
    acc.slot.push(src.slot[i]);
    acc.txn_idx.push(src.txn_idx[i]);
    acc.txn_exec_idx.push(src.txn_exec_idx[i]);
    acc.txn_sigverify_exec_idx.push(src.txn_sigverify_exec_idx[i]);
    acc.txn_sigverify_start_nanos.push(src.txn_sigverify_start_nanos[i]);
    acc.txn_sigverify_end_nanos.push(src.txn_sigverify_end_nanos[i]);
    acc.txn_load_start_nanos.push(src.txn_load_start_nanos[i]);
    acc.txn_check_start_nanos.push(src.txn_check_start_nanos[i]);
    acc.txn_exec_start_nanos.push(src.txn_exec_start_nanos[i]);
    acc.txn_commit_start_nanos.push(src.txn_commit_start_nanos[i]);
    acc.txn_commit_end_nanos.push(src.txn_commit_end_nanos[i]);
    acc.txn_error_code.push(src.txn_error_code[i]);
  }
}

function itemCount(txns: TxnTimestampColumns): number {
  return txns.txn_exec_idx.length;
}

/**
 * The server includes a transaction when the later of its execution-commit and
 * signature-verification completion timestamps falls in the window. Filter by
 * that same owning timestamp so a txn straddling a tile boundary is only kept by
 * the tile that owns it (prevents duplicates when tiles are merged).
 */
function filterOwned(
  txns: TxnTimestampColumns,
  [start, end]: Interval,
): TxnTimestampColumns {
  const owned = emptyColumns();
  for (let i = 0; i < txns.txn_exec_idx.length; i++) {
    const commitEnd = txns.txn_commit_end_nanos[i];
    const sigEnd = txns.txn_sigverify_end_nanos[i];
    const owningNs = commitEnd > sigEnd ? commitEnd : sigEnd;
    if (owningNs < start || owningNs > end) continue;
    owned.slot.push(txns.slot[i]);
    owned.txn_idx.push(txns.txn_idx[i]);
    owned.txn_exec_idx.push(txns.txn_exec_idx[i]);
    owned.txn_sigverify_exec_idx.push(txns.txn_sigverify_exec_idx[i]);
    owned.txn_sigverify_start_nanos.push(txns.txn_sigverify_start_nanos[i]);
    owned.txn_sigverify_end_nanos.push(txns.txn_sigverify_end_nanos[i]);
    owned.txn_load_start_nanos.push(txns.txn_load_start_nanos[i]);
    owned.txn_check_start_nanos.push(txns.txn_check_start_nanos[i]);
    owned.txn_exec_start_nanos.push(txns.txn_exec_start_nanos[i]);
    owned.txn_commit_start_nanos.push(txns.txn_commit_start_nanos[i]);
    owned.txn_commit_end_nanos.push(txns.txn_commit_end_nanos[i]);
    owned.txn_error_code.push(txns.txn_error_code[i]);
  }
  return owned;
}

const CACHE_MAX_ITEMS = 1_000_000;
const CACHE_MAX_TILES = 64;
const MIN_SUB_TILE_NS = 1_000_000n; // 1ms
// Per-granularity fetch-window (tile) size. txn_batch has far fewer rows
// (batches of up to 32 txns), so a coarser window is efficient; splitFetch still
// handles result_limit_exceeded. The batch tile is an exact multiple of the txn
// tile so a batch region maps to exactly BATCH_TILE_MULTIPLE txn tiles (needed
// for cross-granularity fallback). Tune these together with OVERSCAN below.
const TXN_TILE_NS = 4_000_000_000n; // 4s
const BATCH_TILE_MULTIPLE = 15; // batch = 60s = 15 × txn
const BATCH_TILE_NS = TXN_TILE_NS * BigInt(BATCH_TILE_MULTIPLE);
const TILE_NS: Record<ExecrpGranularity, bigint> = {
  txn: TXN_TILE_NS,
  txn_batch: BATCH_TILE_NS,
};

// Prefetched neighbor tiles per side — granularity-aware since prefetch distance
// is OVERSCAN * TILE_NS. 2 txn tiles is ±8s; 1 batch tile is ±60s. Keep the
// product (the prefetched time span) comparable across granularities.
const OVERSCAN: Record<ExecrpGranularity, number> = {
  txn: 2,
  txn_batch: 1,
};

export type TxnTimestampTile = Tile<TxnTimestampColumns, null>;
export type TxnTimestampCacheDelta = TileCacheDelta<TxnTimestampColumns, null>;

// Both granularity caches share one pending-request registry, so request ids
// must be globally unique. createTileCache's per-instance counter restarts at 0
// per cache, so ignore the id it passes and allocate from this shared counter.
let nextRequestId = 0;

function createCache(
  granularity: ExecrpGranularity,
): TileCache<TxnTimestampColumns, null> {
  return createTileCache<TxnTimestampColumns, null>({
    tileNs: TILE_NS[granularity],
    minSubTileNs: MIN_SUB_TILE_NS,
    maxItems: CACHE_MAX_ITEMS,
    maxTiles: CACHE_MAX_TILES,
    overscan: OVERSCAN[granularity],
    empty: emptyColumns,
    merge: appendColumns,
    itemCount,
    deriveMeta: () => null,
    filterOwned,
    fetch: async (wsSend, [start, end]) => {
      const id = nextRequestId++;
      wsSend({
        topic: "timeline",
        key: "query_txn_timestamps",
        id,
        params: {
          start_ns: start.toString(),
          end_ns: end.toString(),
          granularity,
        },
      });
      const result = await txnTimestampsRequests.awaitResponse(id);

      return "value" in result
        ? { value: parseTxnTimestamps(result.value) }
        : result;
    },
    failPendingRequests: txnTimestampsRequests.failAll,
  });
}

export const txnTimestampsCaches: Record<
  ExecrpGranularity,
  TileCache<TxnTimestampColumns, null>
> = {
  txn: createCache("txn"),
  txn_batch: createCache("txn_batch"),
};

/** The cached tiles to render for the active granularity. */
export function resolveRenderTiles(
  active: ExecrpGranularity,
): TxnTimestampTile[] {
  return txnTimestampsCaches[active].getTiles();
}
