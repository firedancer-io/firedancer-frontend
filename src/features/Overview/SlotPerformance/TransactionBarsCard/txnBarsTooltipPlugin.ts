import type uPlot from "uplot";
import type { SlotTransactions } from "../../../../api/types.js";
import type { MutableRefObject } from "react";
import type { TxnState } from "./consts.js";
import { getTxnState } from "./txnBarsPluginUtils.js";
import { baseTooltipPlugin } from "../../../../uplotReact/baseTooltipPlugin.js";

export function txnBarsTooltipPlugin({
  transactionsRef,
  setTxnIdx,
  setTxnState,
}: {
  transactionsRef: MutableRefObject<SlotTransactions | null | undefined>;
  setTxnIdx: (txnIdx: number) => void;
  setTxnState: (state: TxnState) => void;
}): uPlot.Plugin {
  function showOnCursor(
    u: uPlot,
    xVal: number,
    idx: number, // closest idx to cursor
  ) {
    let txnIdx = u.data[1][idx];
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
      setTxnState(getTxnState(xVal, transactionsRef.current, txnIdx));
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
