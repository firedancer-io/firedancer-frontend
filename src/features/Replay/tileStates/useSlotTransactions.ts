import { useEffect, useState } from "react";
import { useThrottledCallbackIfVisible } from "../../../api/useDebounceIfVisible";
import { TileStatesGranularityEnum } from "../../../api/entities";
import { tileStatesCaches } from "./tileStatesCache";

/**
 * Count a slot's transactions from the cached tile-states tiles.
 * Return undefined if the slot's span isn't fully fetched (has gaps).
 * Dedupe by txn_idx and treat it as failed if any segment is erroring.
 */
function readSlotTransactions(
  slot: number,
  slotStartNs: bigint,
  slotEndNs: bigint,
):
  | {
      totalCount: number;
      failedCount: number;
    }
  | undefined {
  const { data, hasAllTilesCached } = tileStatesCaches[
    TileStatesGranularityEnum.txn
  ].getDataInRange(slotStartNs, slotEndNs);

  // fallback to slot query publish
  if (!hasAllTilesCached) return undefined;

  // distinct txn idxs seen, and the subset that failed (any segment errored)
  const txnIdxs = new Set<number>();
  const failedTxnIdxs = new Set<number>();

  for (const { txn_slot, txn_idx, txn_error_code } of data) {
    for (let i = 0; i < txn_slot.length; i++) {
      if (txn_slot[i] !== slot) continue;
      txnIdxs.add(txn_idx[i]);
      // error code 0 is success
      const errorCode = txn_error_code[i];
      if (errorCode !== null && errorCode !== 0) failedTxnIdxs.add(txn_idx[i]);
    }
  }

  // tiles are fully cached, so zero matches means the slot genuinely has no
  // transactions (e.g. empty/skipped)
  return {
    totalCount: txnIdxs.size,
    failedCount: failedTxnIdxs.size,
  };
}

/**
 * Live per-slot transaction counts from the tile-states cache
 */
export function useSlotTransactions(
  slot: number,
  slotStartNs: bigint,
  slotEndNs: bigint,
  throttleMs: number,
) {
  const [transactions, setTransactions] = useState(() =>
    readSlotTransactions(slot, slotStartNs, slotEndNs),
  );

  const update = useThrottledCallbackIfVisible(() => {
    setTransactions(readSlotTransactions(slot, slotStartNs, slotEndNs));
  }, throttleMs);

  useEffect(() => {
    update();
    const unsubscribe =
      tileStatesCaches[TileStatesGranularityEnum.txn].subscribe(update);
    return () => {
      unsubscribe();
      update.cancel();
    };
  }, [slot, slotStartNs, slotEndNs, update]);

  return transactions;
}
