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
  txn_error_code: number[];
  txn_load_start_nanos: bigint[];
  txn_commit_end_nanos: bigint[];
}

export type TxnMetaMaxima = Record<RevenueType, bigint>;

export function emptyMaxima(): TxnMetaMaxima {
  return {
    [RevenueType.TxnFees]: 0n,
    [RevenueType.PrioFees]: 0n,
    [RevenueType.Tips]: 0n,
  };
}

const ALL_REVENUE_TYPES = [
  RevenueType.TxnFees,
  RevenueType.PrioFees,
  RevenueType.Tips,
] as const;

export interface TxnMetaBucket {
  startNs: bigint;
  endNs: bigint;
  txns: TxnMetaColumns;
  maxima: TxnMetaMaxima;
}

export const replayTxnMetaCacheAtom = atom<TxnMetaBucket[]>([]);

export function getPaidTxnValue(
  txns: TxnMetaColumns,
  txnIdx: number,
  type: RevenueType,
): bigint {
  const errorCode = txns.txn_error_code[txnIdx];

  switch (type) {
    case RevenueType.TxnFees:
      return [5, 6].includes(errorCode) ? 0n : txns.txn_transaction_fee[txnIdx];
    case RevenueType.PrioFees:
      return [5, 6].includes(errorCode) ? 0n : txns.txn_priority_fee[txnIdx];
    case RevenueType.Tips:
      return errorCode === 0 ? txns.txn_tips[txnIdx] : 0n;
  }
}

/** The bucket-wide maximum paid value of each revenue type. */
export function computeMaxima(txns: TxnMetaColumns): TxnMetaMaxima {
  const maxima = emptyMaxima();
  for (let i = 0; i < txns.txn_exec_idx.length; i++) {
    for (const type of ALL_REVENUE_TYPES) {
      const value = getPaidTxnValue(txns, i, type);
      if (value > maxima[type]) maxima[type] = value;
    }
  }
  return maxima;
}

export function emptyTxnColumns(): TxnMetaColumns {
  return {
    slot: [],
    txn_idx: [],
    txn_exec_idx: [],
    txn_transaction_fee: [],
    txn_priority_fee: [],
    txn_tips: [],
    txn_error_code: [],
    txn_load_start_nanos: [],
    txn_commit_end_nanos: [],
  };
}

export function appendTxnMeta(
  acc: TxnMetaColumns,
  meta: TimelineTxnMeta | undefined,
): void {
  if (!meta || meta.slot_delta.length === 0) return;
  if (meta.reference_ts == null || meta.reference_slot == null) return;

  const refTs = meta.reference_ts;
  const refSlot = meta.reference_slot;

  for (let i = 0; i < meta.slot_delta.length; i++) {
    acc.slot.push(refSlot + meta.slot_delta[i]);
    acc.txn_idx.push(meta.txn_idx[i]);
    acc.txn_exec_idx.push(meta.txn_exec_idx[i]);
    acc.txn_transaction_fee.push(meta.txn_transaction_fee[i]);
    acc.txn_priority_fee.push(meta.txn_priority_fee[i]);
    acc.txn_tips.push(meta.txn_tips[i]);
    acc.txn_error_code.push(meta.txn_error_code[i]);
    acc.txn_load_start_nanos.push(refTs + meta.txn_load_start_ts_delta[i]);
    acc.txn_commit_end_nanos.push(refTs + meta.txn_commit_end_ts_delta[i]);
  }
}

export function parseTxnMeta(
  meta: TimelineTxnMeta | undefined,
): TxnMetaColumns {
  const txns = emptyTxnColumns();
  appendTxnMeta(txns, meta);
  return txns;
}
