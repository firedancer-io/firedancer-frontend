import { atom } from "jotai";
import type { TimelineTxnTimestamps } from "../../../api/types";

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

export interface TxnTimestampBucket {
  startNs: bigint;
  endNs: bigint;
  txns: TxnTimestampColumns;
}

export const replayTxnTimestampsCacheAtom = atom<TxnTimestampBucket[]>([]);

export function emptyTxnTimestampColumns(): TxnTimestampColumns {
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

export function appendTxnTimestamps(
  acc: TxnTimestampColumns,
  ts: TimelineTxnTimestamps | undefined,
): void {
  if (!ts || ts.slot_delta.length === 0) return;
  if (ts.reference_ts == null || ts.reference_slot == null) return;

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
}
