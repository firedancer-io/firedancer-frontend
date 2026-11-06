import { useAtomValue } from "jotai";
import { useEffect, useState } from "react";
import { TileStatesGranularityEnum } from "../../../api/entities.ts";
import { hoveredExecrpTxnKeyAtom } from "./hoverAtoms.ts";
import { getTxnStateDurations, type TxnStates } from "./hoverUtils.ts";
import { tileStatesCaches } from "./tileStatesCache.ts";

/**
 * Segment durations for the hovered txn
 */
export function useTxnStateDurations(): TxnStates | undefined {
  const key = useAtomValue(hoveredExecrpTxnKeyAtom);
  const [snapshot, setSnapshot] = useState(() => ({
    key,
    states: key && getTxnStateDurations(key.slot, key.txnIdx, key.ms),
  }));

  useEffect(() => {
    const update = () =>
      setSnapshot({
        key,
        states: key && getTxnStateDurations(key.slot, key.txnIdx, key.ms),
      });
    update();
    return tileStatesCaches[TileStatesGranularityEnum.txn].subscribe(update);
  }, [key]);

  return snapshot.key === key ? snapshot.states : undefined;
}
