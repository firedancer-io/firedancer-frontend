import { useEffect, useState } from "react";
import { useThrottledCallbackIfVisible } from "../../../../api/useDebounceIfVisible";
import { txnMetaCache } from "./txnMetaCache";

/**
 * Sum a slot's revenue from the cached txn-meta tiles.
 * Return undefined if the slot's span isn't fully fetched (has gaps).
 */
function readSlotRevenue(
  slot: number,
  slotStartNs: bigint,
  slotEndNs: bigint,
):
  | {
      feesLamports: bigint;
      tipsLamports: bigint;
      incomeLamports: bigint;
    }
  | undefined {
  const { tiles, hasAllTilesCached } = txnMetaCache.getTilesInRange(
    slotStartNs,
    slotEndNs,
  );

  // fallback to slot query publish
  if (!hasAllTilesCached) {
    return undefined;
  }

  let feesLamports = 0n;
  let tipsLamports = 0n;

  for (const tile of tiles) {
    const { slots, txn_transaction_fee, txn_priority_fee, txn_tips } =
      tile.data;
    for (let i = 0; i < slots.length; i++) {
      if (slots[i] !== slot) continue;
      feesLamports += txn_transaction_fee[i] + txn_priority_fee[i];
      tipsLamports += txn_tips[i];
    }
  }

  return {
    feesLamports,
    tipsLamports,
    incomeLamports: feesLamports + tipsLamports,
  };
}

/**
 * Live per-slot revenue from the txn-meta cache
 */
export function useSlotRevenue(
  slot: number,
  slotStartNs: bigint,
  slotEndNs: bigint,
  throttleMs: number,
) {
  const [revenue, setRevenue] = useState(() =>
    readSlotRevenue(slot, slotStartNs, slotEndNs),
  );

  const update = useThrottledCallbackIfVisible(() => {
    setRevenue(readSlotRevenue(slot, slotStartNs, slotEndNs));
  }, throttleMs);

  useEffect(() => {
    update();
    const unsubscribe = txnMetaCache.subscribe(update);
    return () => {
      unsubscribe();
      update.cancel();
    };
  }, [slot, slotStartNs, slotEndNs, update]);

  return revenue;
}
