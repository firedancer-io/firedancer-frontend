import { getDefaultStore } from "jotai";
import type { TimelineTxnMeta } from "../../../../api/types";
import { RevenueType } from "../../../../api/entities";
import {
  createTileCache,
  type Tile,
  type TileCacheDelta,
} from "../../tiles/cache";
import type { Interval } from "../../tiles/splitFetch";
import { referenceNsAtom } from "../../atoms";
import { calcRelativeMs } from "../../utils";
import { txnMetaRequests } from "./txnMetaRequests";

const store = getDefaultStore();

type TxnMetaMaxima = Record<RevenueType, bigint>;

interface TxnMetaColumns {
  slots: number[];
  txn_exec_idx: number[];
  txn_transaction_fee: bigint[];
  txn_priority_fee: bigint[];
  txn_tips: bigint[];
  txn_load_start_ms: number[];
  txn_commit_end_ms: number[];
}

const REVENUE_COLUMN = {
  [RevenueType.TxnFees]: "txn_transaction_fee",
  [RevenueType.PrioFees]: "txn_priority_fee",
  [RevenueType.Tips]: "txn_tips",
} as const satisfies Record<RevenueType, keyof TxnMetaColumns>;

const ALL_REVENUE_TYPES = Object.values(RevenueType);

function emptyTxnColumns(): TxnMetaColumns {
  return {
    slots: [],
    txn_exec_idx: [],
    txn_transaction_fee: [],
    txn_priority_fee: [],
    txn_tips: [],
    txn_load_start_ms: [],
    txn_commit_end_ms: [],
  };
}

function parseTxnMeta(meta: TimelineTxnMeta | undefined): TxnMetaColumns {
  if (!meta || meta.slot_delta.length === 0) return emptyTxnColumns();
  if (meta.reference_ts == null || meta.reference_slot == null)
    return emptyTxnColumns();

  const referenceNs = store.get(referenceNsAtom);
  if (referenceNs == null) return emptyTxnColumns();

  const refTs = meta.reference_ts;
  const refSlot = meta.reference_slot;

  const commitEndNanos = meta.txn_commit_end_ts_delta.map((d) => refTs + d);

  return {
    slots: meta.slot_delta.map((d) => refSlot + d),
    txn_exec_idx: meta.txn_exec_idx,
    txn_transaction_fee: meta.txn_transaction_fee,
    txn_priority_fee: meta.txn_priority_fee,
    txn_tips: meta.txn_tips,
    txn_load_start_ms: meta.txn_load_start_ts_delta.map((d) =>
      calcRelativeMs(referenceNs, refTs + d),
    ),
    txn_commit_end_ms: commitEndNanos.map((ns) =>
      calcRelativeMs(referenceNs, ns),
    ),
  };
}

function appendColumns(acc: TxnMetaColumns, src: TxnMetaColumns): void {
  for (let i = 0; i < src.txn_exec_idx.length; i++) {
    acc.slots.push(src.slots[i]);
    acc.txn_exec_idx.push(src.txn_exec_idx[i]);
    acc.txn_transaction_fee.push(src.txn_transaction_fee[i]);
    acc.txn_priority_fee.push(src.txn_priority_fee[i]);
    acc.txn_tips.push(src.txn_tips[i]);
    acc.txn_load_start_ms.push(src.txn_load_start_ms[i]);
    acc.txn_commit_end_ms.push(src.txn_commit_end_ms[i]);
  }
}

function itemCount(txns: TxnMetaColumns): number {
  return txns.txn_exec_idx.length;
}

function filterOwned(
  txns: TxnMetaColumns,
  [startNs, endNs]: Interval,
): TxnMetaColumns {
  const owned = emptyTxnColumns();
  const referenceNs = store.get(referenceNsAtom);
  if (referenceNs == null) return owned;

  const startMs = calcRelativeMs(referenceNs, startNs);
  const endMs = calcRelativeMs(referenceNs, endNs);
  const txnEnds = txns.txn_commit_end_ms;
  for (let i = 0; i < txnEnds.length; i++) {
    const txnEnd = txnEnds[i];
    if (startMs > txnEnd || txnEnd > endMs) continue;
    owned.slots.push(txns.slots[i]);
    owned.txn_exec_idx.push(txns.txn_exec_idx[i]);
    owned.txn_transaction_fee.push(txns.txn_transaction_fee[i]);
    owned.txn_priority_fee.push(txns.txn_priority_fee[i]);
    owned.txn_tips.push(txns.txn_tips[i]);
    owned.txn_load_start_ms.push(txns.txn_load_start_ms[i]);
    owned.txn_commit_end_ms.push(txns.txn_commit_end_ms[i]);
  }
  return owned;
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
const CACHE_MAX_TILES = 64;
const TILE_NS = 4_000_000_000n; // 4s
const MIN_SUB_TILE_NS = 1_000_000n; // 1ms

export type TxnMetaTile = Tile<TxnMetaColumns, TxnMetaMaxima>;
export type TxnMetaCacheDelta = TileCacheDelta<TxnMetaColumns, TxnMetaMaxima>;

export const txnMetaCache = createTileCache<TxnMetaColumns, TxnMetaMaxima>({
  tileNs: TILE_NS,
  minSubTileNs: MIN_SUB_TILE_NS,
  maxItems: CACHE_MAX_ITEMS,
  maxTiles: CACHE_MAX_TILES,
  overscan: 5,
  empty: emptyTxnColumns,
  merge: appendColumns,
  itemCount,
  deriveMeta: computeMaxima,
  filterOwned,
  fetch: async (wsSend, [startNs, endNs], requestId) => {
    wsSend({
      topic: "timeline",
      key: "query_txn_meta",
      id: requestId,
      params: { start_ns: startNs.toString(), end_ns: endNs.toString() },
    });
    const result = await txnMetaRequests.awaitResponse(requestId);
    return "value" in result ? { value: parseTxnMeta(result.value) } : result;
  },
  failPendingRequests: txnMetaRequests.failAll,
});
