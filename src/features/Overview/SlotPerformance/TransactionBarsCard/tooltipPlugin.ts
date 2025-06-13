import uPlot from "uplot";
import placement from "../../../../uplot/placement.js";
import { SlotTransactions } from "../../../../api/types.js";
import { MutableRefObject } from "react";
import { TxnState } from "./consts.js";
import { getTxnState } from "./txnBarsPluginUtils.js";

export function tooltipPlugin({
  transactionsRef,
  setTxnIdx,
  setTxnState,
}: {
  transactionsRef: MutableRefObject<SlotTransactions | null | undefined>;
  setTxnIdx: (txnIdx: number) => void;
  setTxnState: (state: TxnState) => void;
}): uPlot.Plugin {
  let over: HTMLDivElement;
  let bound: HTMLElement;
  let bLeft: number;
  let bTop: number;

  function syncBounds() {
    const bbox = over.getBoundingClientRect();
    bLeft = bbox.left;
    bTop = bbox.top;
  }

  let overlay: HTMLElement;

  // setTimeout(() => syncBounds(), 10_000);

  return {
    hooks: {
      init: (u) => {
        const el = document.getElementById("uplot-tooltip");
        if (el) {
          overlay = el;
        } else {
          overlay = document.createElement("div");
          overlay.id = "uplot-tooltip";
          document.body.appendChild(overlay);
        }
        if (!overlay) return;

        overlay.style.display = "none";

        // overlay.style.zIndex = "10000"

        over = u.over;

        // bound = over;
        bound = document.body;

        over.onmouseenter = () => {
          overlay.style.display = "block";
        };

        over.onmouseleave = () => {
          overlay.style.display = "none";
        };
      },
      destroy: () => {
        over.onmouseenter = null;
        over.onmouseleave = null;
        // document.getElementById("overlay")?.remove();
      },
      setSize: (u) => {
        syncBounds();
      },
      syncRect: () => {
        syncBounds();
      },
      setCursor: (u) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { left, top, idx, dataIdx, idxs } = u.cursor;
        if (left === undefined || top === undefined || idx == null) return;
        const val = u.posToVal(left ?? 0, "x");
        const anchor = { left: left + bLeft + 10, top: top + bTop + 10 };

        let txnIdx = u.data[1][idx];
        // To catch second half of bar where end point is undefined indicating end of state
        if (txnIdx == null && u.data[1][idx - 1] != null) {
          txnIdx = u.data[1][idx - 1];
        }

        if (
          txnIdx == null ||
          !transactionsRef.current ||
          (idxs?.length && idxs[1] === undefined)
        ) {
          overlay.style.display = "none";
          return;
        } else {
          overlay.style.display = "block";
        }

        setTxnState(getTxnState(val, transactionsRef.current, txnIdx));
        setTxnIdx(txnIdx);

        placement(overlay, anchor, "bottom", "start", { bound });
      },
    },
  };
}
