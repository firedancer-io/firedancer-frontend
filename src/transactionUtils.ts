import { max } from "lodash";
import type { Client, SlotTransactions } from "./api/types";
import { TxnState } from "./features/Overview/SlotPerformance/TransactionBarsCard/consts";
import { ClientEnum } from "./api/entities";

export const chartBufferMs = 2_000_000;

export function getMaxTsWithBuffer(transactions: SlotTransactions) {
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
  return (max(txnTs) ?? 0) + chartBufferMs;
}

export function getTxnStateDurations(
  transactions: SlotTransactions,
  txnIdx: number,
  bundleTxnIdx: number[] | undefined,
  client: Client,
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

  // for bundle txs, we use the previous/next transaction to bound
  if (transactions.txn_from_bundle[txnIdx] && bundleTxnIdx?.length) {
    const bundleIdx = bundleTxnIdx.indexOf(txnIdx) ?? -1;
    const prevTxnIdx = bundleTxnIdx[bundleIdx - 1];
    if (prevTxnIdx > 0) {
      startTs = transactions.txn_preload_end_timestamps_nanos[txnIdx];
    }

    const nextTxnIdx = bundleIdx !== -1 ? bundleTxnIdx[bundleIdx + 1] : -1;
    if (nextTxnIdx > 0) {
      endTs = transactions.txn_preload_end_timestamps_nanos[nextTxnIdx];
    }
  }

  const preLoading =
    transactions.txn_preload_end_timestamps_nanos[txnIdx] - startTs;
  const validating =
    transactions.txn_start_timestamps_nanos[txnIdx] -
    transactions.txn_preload_end_timestamps_nanos[txnIdx];
  const loading =
    transactions.txn_load_end_timestamps_nanos[txnIdx] -
    transactions.txn_start_timestamps_nanos[txnIdx];

  let execute;
  let postExecute;
  if (
    client === ClientEnum.Frankendancer ||
    !transactions.txn_from_bundle[txnIdx] ||
    !bundleTxnIdx?.length
  ) {
    execute =
      transactions.txn_end_timestamps_nanos[txnIdx] -
      transactions.txn_load_end_timestamps_nanos[txnIdx];

    postExecute = endTs - transactions.txn_end_timestamps_nanos[txnIdx];
  } else {
    const bundleIdx = bundleTxnIdx.indexOf(txnIdx) ?? -1;
    const nextTxnIdx = bundleIdx !== -1 ? bundleTxnIdx[bundleIdx + 1] : -1;

    if (nextTxnIdx > 0) {
      execute =
        transactions.txn_preload_end_timestamps_nanos[nextTxnIdx] -
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

export interface TxnBundleStats {
  totalCount: number;
  order: number;
  bundleTxnIdx: number[];
}

export function getTxnBundleStats(
  transactions: SlotTransactions,
  txnIdx: number,
): TxnBundleStats {
  const mbId = transactions.txn_microblock_id[txnIdx];
  const bundleTxnIdx: number[] = [];

  for (let i = 0; i < transactions.txn_microblock_id.length; i++) {
    if (transactions.txn_microblock_id[i] !== mbId) continue;
    bundleTxnIdx.push(i);
  }

  return {
    totalCount: bundleTxnIdx.length,
    order: bundleTxnIdx.indexOf(txnIdx) + 1,
    bundleTxnIdx,
  };
}

export function getTxnState(
  ts: number,
  transactions: SlotTransactions,
  txnIdx: number,
  bundleTxnIdx: number[] | undefined,
  client: Client,
): TxnState {
  // Helper function to calculate relative timestamp
  const relativeTime = (timestamp: bigint): number => {
    return Number(timestamp - transactions.start_timestamp_nanos);
  };

  // Check transaction stages in sequence
  if (
    ts < relativeTime(transactions.txn_preload_end_timestamps_nanos[txnIdx])
  ) {
    return TxnState.PRELOADING;
  }

  if (ts < relativeTime(transactions.txn_start_timestamps_nanos[txnIdx])) {
    return TxnState.VALIDATE;
  }

  if (ts < relativeTime(transactions.txn_load_end_timestamps_nanos[txnIdx])) {
    return TxnState.LOADING;
  }

  // Handle execution phase based on client type and bundle conditions
  const isBundled =
    transactions.txn_from_bundle[txnIdx] && bundleTxnIdx?.length;

  if (!isBundled || client === ClientEnum.Frankendancer) {
    if (ts < relativeTime(transactions.txn_end_timestamps_nanos[txnIdx])) {
      return TxnState.EXECUTE;
    }
  } else {
    const bundleIdx = bundleTxnIdx.indexOf(txnIdx);
    const nextTxnIdx = bundleIdx !== -1 ? bundleTxnIdx[bundleIdx + 1] : -1;

    if (nextTxnIdx > 0) {
      if (
        ts <
        relativeTime(transactions.txn_preload_end_timestamps_nanos[nextTxnIdx])
      ) {
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
