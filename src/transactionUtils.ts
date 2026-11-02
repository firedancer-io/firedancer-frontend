import { max } from "lodash";
import type { SlotTransactions } from "./api/types";
import { TxnState } from "./features/Overview/SlotPerformance/TransactionBarsCard/consts";

export const chartBufferMs = 2_000_000;

export function getMaxTs(
  transactions: SlotTransactions,
  includeBuffer: boolean = false,
) {
  if (!transactions) return 0;

  const txnTs = transactions.txn_mb_end_timestamps_nanos.map((ts) =>
    Number(ts - transactions.start_timestamp_nanos),
  );
  txnTs.push(
    Number(
      transactions.target_end_timestamp_nanos -
        transactions.start_timestamp_nanos,
    ),
  );
  const maxTxnTs = max(txnTs) ?? 0;
  return includeBuffer ? maxTxnTs + chartBufferMs : maxTxnTs;
}

export function getTxnStateDurations(
  transactions: SlotTransactions,
  txnIdx: number,
  bundleTxnIdxs: number[] | undefined,
) {
  if (txnIdx < 0)
    return {
      preLoading: 0n,
      validating: 0n,
      loading: 0n,
      execute: 0n,
      postExecute: 0n,
    };
  let startTs = transactions.txn_mb_start_timestamps_nanos[txnIdx];
  let endTs = transactions.txn_mb_end_timestamps_nanos[txnIdx];

  // for bundle txs, we use the previous/next transaction to bound.
  const firstPhaseBoundary = transactions.txn_start_timestamps_nanos;
  if (bundleTxnIdxs) {
    const bundleIdx = bundleTxnIdxs.indexOf(txnIdx) ?? -1;
    const prevTxnIdx = bundleTxnIdxs[bundleIdx - 1];
    if (prevTxnIdx > 0) {
      startTs = firstPhaseBoundary[txnIdx];
    }

    const nextTxnIdx = bundleIdx !== -1 ? bundleTxnIdxs[bundleIdx + 1] : -1;
    if (nextTxnIdx > 0) {
      endTs = firstPhaseBoundary[nextTxnIdx];
    }
  }

  // Chronological order: start < preload_end < load_end < end
  //
  // There are 4 phases between startTs and endTs:
  //   Pre-Loading, Loading, Validating, Execute
  const preload_end = transactions.txn_preload_end_timestamps_nanos[txnIdx];
  const start = transactions.txn_start_timestamps_nanos[txnIdx];
  const load_end = transactions.txn_load_end_timestamps_nanos[txnIdx];

  // startTs -> start(load_start) -> preload_end(check_start) -> load_end(exec_start)
  const preLoading = start - startTs;
  const loading = preload_end - start;
  const validating = load_end - preload_end;

  let execute;
  let postExecute;
  if (!bundleTxnIdxs) {
    execute =
      transactions.txn_end_timestamps_nanos[txnIdx] -
      transactions.txn_load_end_timestamps_nanos[txnIdx];

    postExecute = endTs - transactions.txn_end_timestamps_nanos[txnIdx];
  } else {
    const bundleIdx = bundleTxnIdxs.indexOf(txnIdx);
    const nextTxnIdx = bundleIdx !== -1 ? bundleTxnIdxs[bundleIdx + 1] : -1;

    if (nextTxnIdx > 0) {
      execute =
        firstPhaseBoundary[nextTxnIdx] -
        transactions.txn_load_end_timestamps_nanos[txnIdx];
      postExecute =
        transactions.txn_end_timestamps_nanos[nextTxnIdx] -
        transactions.txn_end_timestamps_nanos[txnIdx];
    } else {
      execute =
        transactions.txn_end_timestamps_nanos[txnIdx] -
        transactions.txn_load_end_timestamps_nanos[txnIdx];

      postExecute = endTs - transactions.txn_end_timestamps_nanos[txnIdx];
    }
  }

  return {
    preLoading,
    validating,
    loading,
    execute,
    postExecute,
  };
}

export function getTxnState(
  ts: number,
  transactions: SlotTransactions,
  txnIdx: number,
  bundleTxnIdxs: number[] | undefined,
): TxnState {
  // Helper function to calculate relative timestamp
  const relativeTime = (timestamp: bigint): number => {
    return Number(timestamp - transactions.start_timestamp_nanos);
  };

  // Check transaction stages in chronological order:
  //   start < preload_end < load_end   (Pre-Loading, Loading, Validate)
  if (ts < relativeTime(transactions.txn_start_timestamps_nanos[txnIdx])) {
    return TxnState.PRELOADING;
  }
  if (
    ts < relativeTime(transactions.txn_preload_end_timestamps_nanos[txnIdx])
  ) {
    return TxnState.LOADING;
  }
  if (ts < relativeTime(transactions.txn_load_end_timestamps_nanos[txnIdx])) {
    return TxnState.VALIDATE;
  }

  // Handle execution phase based on bundle conditions
  if (!bundleTxnIdxs) {
    if (ts < relativeTime(transactions.txn_end_timestamps_nanos[txnIdx])) {
      return TxnState.EXECUTE;
    }
  } else {
    const bundleIdx = bundleTxnIdxs.indexOf(txnIdx);
    const nextTxnIdx = bundleIdx !== -1 ? bundleTxnIdxs[bundleIdx + 1] : -1;

    // Use the first phase boundary of the next txn (see comment
    // in getTxnStateDurations for the ordering).
    const nextFirstBoundary =
      transactions.txn_start_timestamps_nanos[nextTxnIdx];

    if (nextTxnIdx > 0) {
      if (ts < relativeTime(nextFirstBoundary)) {
        return TxnState.EXECUTE;
      }
    } else if (
      ts < relativeTime(transactions.txn_end_timestamps_nanos[txnIdx])
    ) {
      return TxnState.EXECUTE;
    }
  }

  return TxnState.POST_EXECUTE;
}
