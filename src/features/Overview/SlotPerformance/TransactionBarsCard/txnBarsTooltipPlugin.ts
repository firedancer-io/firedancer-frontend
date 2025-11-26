import type uPlot from "uplot";
import type { Client, SlotTransactions } from "../../../../api/types.js";
import type { MutableRefObject } from "react";
import { baseTooltipPlugin } from "../../../../uplotReact/baseTooltipPlugin.js";
import {
  getTxnState,
  type TxnBundleStats,
} from "../../../../transactionUtils.js";
import type { TxnState } from "./consts.js";

export function txnBarsTooltipPlugin({
  transactionsRef,
  setTxnIdx,
  setTxnState,
  transactionsBundleStats,
  client,
}: {
  transactionsRef: MutableRefObject<SlotTransactions | null | undefined>;
  setTxnIdx: (txnIdx: number) => void;
  setTxnState: (state: TxnState) => void;
  transactionsBundleStats: (TxnBundleStats | undefined)[];
  client: Client;
}): uPlot.Plugin {
  function showOnCursor(
    u: uPlot,
    xVal: number,
    idx: number, // closest idx to cursor
  ) {
    let txnIdx = u.data[1][idx];

    // We are "closest" to the start of the next state, but we're actually mousing over the state before.
    if (u.data[0][idx] > xVal) {
      txnIdx = u.data[1][idx - 1];
    }

    // To catch second half of bar where end point is undefined indicating end of state
    if (txnIdx == null && u.data[1][idx - 1] != null) {
      txnIdx = u.data[1][idx - 1];
    }

    // Using the transaction state series as that should always be a value or null if there is a bar visible
    const noDataAtPoint =
      u.cursor.idxs?.length && u.cursor.idxs[1] === undefined;

    if (txnIdx == null || !transactionsRef.current || noDataAtPoint) {
      return false;
    } else {
      const txnState = getTxnState(
        xVal,
        transactionsRef.current,
        txnIdx,
        transactionsBundleStats[txnIdx]?.bundleTxnIdx,
        client,
      );
      setTxnState(txnState);
      setTxnIdx(txnIdx);
      return true;
    }
  }

  return baseTooltipPlugin({
    elId: "txn-bars-tooltip",
    closeTooltipElId: "txn-bars-tooltip-close",
    showOnCursor,
    showPointer: true,
  });
}
