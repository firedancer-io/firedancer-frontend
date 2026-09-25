import type { TimelineTxnMeta } from "../../../../api/types";
import { RevenueType } from "../../../../api/entities";
import {
  createTileCache,
  type Tile,
  type TileCacheDelta,
} from "../../tiles/cache";
import { txnMetaRequests } from "./txnMetaRequests";

type TxnMetaMaxima = Record<RevenueType, bigint>;

interface TxnMetaColumns {
  slot: number[];
  txn_idx: number[];
  txn_exec_idx: number[];
  txn_transaction_fee: bigint[];
  txn_priority_fee: bigint[];
  txn_tips: bigint[];
  txn_load_start_nanos: bigint[];
  txn_commit_end_nanos: bigint[];
}

const TXN_META_COLUMNS: readonly (keyof TxnMetaColumns)[] = [
  "slot",
  "txn_idx",
  "txn_exec_idx",
  "txn_transaction_fee",
  "txn_priority_fee",
  "txn_tips",
  "txn_load_start_nanos",
  "txn_commit_end_nanos",
];

const REVENUE_COLUMN = {
  [RevenueType.TxnFees]: "txn_transaction_fee",
  [RevenueType.PrioFees]: "txn_priority_fee",
  [RevenueType.Tips]: "txn_tips",
} as const satisfies Record<RevenueType, keyof TxnMetaColumns>;

const ALL_REVENUE_TYPES = Object.values(RevenueType);

function emptyTxnColumns(): TxnMetaColumns {
  return {
    slot: [],
    txn_idx: [],
    txn_exec_idx: [],
    txn_transaction_fee: [],
    txn_priority_fee: [],
    txn_tips: [],
    txn_load_start_nanos: [],
    txn_commit_end_nanos: [],
  };
}

function parseTxnMeta(meta: TimelineTxnMeta | undefined): TxnMetaColumns {
  if (!meta || meta.slot_delta.length === 0) return emptyTxnColumns();
  if (meta.reference_ts == null || meta.reference_slot == null)
    return emptyTxnColumns();

  const refTs = meta.reference_ts;
  const refSlot = meta.reference_slot;

  return {
    slot: meta.slot_delta.map((d) => refSlot + d),
    txn_idx: meta.txn_idx,
    txn_exec_idx: meta.txn_exec_idx,
    txn_transaction_fee: meta.txn_transaction_fee,
    txn_priority_fee: meta.txn_priority_fee,
    txn_tips: meta.txn_tips,
    txn_load_start_nanos: meta.txn_load_start_ts_delta.map((d) => refTs + d),
    txn_commit_end_nanos: meta.txn_commit_end_ts_delta.map((d) => refTs + d),
  };
}

function appendColumns(acc: TxnMetaColumns, src: TxnMetaColumns): void {
  for (const key of TXN_META_COLUMNS) {
    const dst = acc[key] as unknown[];
    const add = src[key] as unknown[];
    for (let i = 0; i < add.length; i++) dst.push(add[i]);
  }
}

function itemCount(txns: TxnMetaColumns): number {
  return txns.txn_exec_idx.length;
}

export function getTxnValue(
  txns: TxnMetaColumns,
  txnIdx: number,
  type: RevenueType,
): bigint {
  return txns[REVENUE_COLUMN[type]][txnIdx];
}

function computeMaxima(txns: TxnMetaColumns): TxnMetaMaxima {
  const maxima: TxnMetaMaxima = {
    [RevenueType.TxnFees]: 0n,
    [RevenueType.PrioFees]: 0n,
    [RevenueType.Tips]: 0n,
  };
  for (let i = 0; i < itemCount(txns); i++) {
    for (const type of ALL_REVENUE_TYPES) {
      const value = getTxnValue(txns, i, type);
      if (value > maxima[type]) maxima[type] = value;
    }
  }
  return maxima;
}

const CACHE_MAX_ITEMS = 1_000_000;
const TILE_NS = 4_000_000_000n; // 4s
const MIN_SUB_TILE_NS = 1_000_000n; // 1ms

export type TxnMetaTile = Tile<TxnMetaColumns, TxnMetaMaxima>;
export type TxnMetaCacheDelta = TileCacheDelta<TxnMetaColumns, TxnMetaMaxima>;

// Each txn is drawn by the tile owning its load-start, so one crossing the
// view's left edge belongs to the tile just off-screen. A txn lasts at most
// a slot, so as long as `tileNs` > a slot and `overscan` >= 1, that tile is
// loaded and it's drawn.
export const txnMetaCache = createTileCache<TxnMetaColumns, TxnMetaMaxima>({
  tileNs: TILE_NS,
  minSubTileNs: MIN_SUB_TILE_NS,
  maxItems: CACHE_MAX_ITEMS,
  overscan: 5,
  empty: emptyTxnColumns,
  merge: appendColumns,
  itemCount,
  deriveMeta: computeMaxima,
  fetch: async (wsSend, [start, end], requestId) => {
    wsSend({
      topic: "timeline",
      key: "query_txn_meta",
      id: requestId,
      params: { start_ns: start.toString(), end_ns: end.toString() },
    });
    const result = await txnMetaRequests.awaitResponse(requestId);
    return "value" in result ? { value: parseTxnMeta(result.value) } : result;
  },
  failPendingRequests: txnMetaRequests.failAll,
});
