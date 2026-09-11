import { atom } from "jotai";
import type { TimelineTxnMeta } from "../../../api/types";
import { RevenueType } from "../../../api/entities";

export interface TxnMetaColumns {
  slot: number[];
  txn_idx: number[];
  txn_exec_idx: number[];
  txn_transaction_fee: bigint[];
  txn_priority_fee: bigint[];
  txn_tips: bigint[];
  txn_load_start_nanos: bigint[];
  txn_commit_end_nanos: bigint[];
}

export type TxnMetaMaxima = Record<RevenueType, bigint>;

export interface TxnMetaBucket {
  startNs: bigint;
  endNs: bigint;
  txns: TxnMetaColumns;
  maxima: TxnMetaMaxima;
}

const TXN_META_COLUMNS = [
  "slot",
  "txn_idx",
  "txn_exec_idx",
  "txn_transaction_fee",
  "txn_priority_fee",
  "txn_tips",
  "txn_load_start_nanos",
  "txn_commit_end_nanos",
] as const satisfies readonly (keyof TxnMetaColumns)[];

const REVENUE_COLUMN = {
  [RevenueType.TxnFees]: "txn_transaction_fee",
  [RevenueType.PrioFees]: "txn_priority_fee",
  [RevenueType.Tips]: "txn_tips",
} as const satisfies Record<RevenueType, keyof TxnMetaColumns>;

const ALL_REVENUE_TYPES = Object.keys(REVENUE_COLUMN) as RevenueType[];

export function emptyTxnColumns(): TxnMetaColumns {
  return Object.fromEntries(
    TXN_META_COLUMNS.map((key) => [key, []]),
  ) as unknown as TxnMetaColumns;
}

export function parseTxnMeta(
  meta: TimelineTxnMeta | undefined,
): TxnMetaColumns {
  const txns = emptyTxnColumns();
  if (!meta || meta.slot_delta.length === 0) return txns;
  if (meta.reference_ts == null || meta.reference_slot == null) return txns;

  const refTs = meta.reference_ts;
  const refSlot = meta.reference_slot;

  for (let i = 0; i < meta.slot_delta.length; i++) {
    txns.slot.push(refSlot + meta.slot_delta[i]);
    txns.txn_idx.push(meta.txn_idx[i]);
    txns.txn_exec_idx.push(meta.txn_exec_idx[i]);
    txns.txn_transaction_fee.push(meta.txn_transaction_fee[i]);
    txns.txn_priority_fee.push(meta.txn_priority_fee[i]);
    txns.txn_tips.push(meta.txn_tips[i]);
    txns.txn_load_start_nanos.push(refTs + meta.txn_load_start_ts_delta[i]);
    txns.txn_commit_end_nanos.push(refTs + meta.txn_commit_end_ts_delta[i]);
  }
  return txns;
}

export function appendColumns(acc: TxnMetaColumns, src: TxnMetaColumns): void {
  for (const key of TXN_META_COLUMNS) {
    const dst = acc[key] as unknown[];
    const add = src[key] as unknown[];
    for (let i = 0; i < add.length; i++) dst.push(add[i]);
  }
}

export function rowCount(txns: TxnMetaColumns): number {
  return txns.txn_exec_idx.length;
}

export function getTxnValue(
  txns: TxnMetaColumns,
  txnIdx: number,
  type: RevenueType,
): bigint {
  return txns[REVENUE_COLUMN[type]][txnIdx];
}

export function computeMaxima(txns: TxnMetaColumns): TxnMetaMaxima {
  const maxima: TxnMetaMaxima = {
    [RevenueType.TxnFees]: 0n,
    [RevenueType.PrioFees]: 0n,
    [RevenueType.Tips]: 0n,
  };
  for (let i = 0; i < rowCount(txns); i++) {
    for (const type of ALL_REVENUE_TYPES) {
      const value = getTxnValue(txns, i, type);
      if (value > maxima[type]) maxima[type] = value;
    }
  }
  return maxima;
}

export const replayTxnMetaCacheAtom = atom<TxnMetaBucket[]>([]);
