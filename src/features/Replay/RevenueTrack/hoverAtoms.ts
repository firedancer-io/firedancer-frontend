import { atom } from "jotai";
import { atomWithHoveredItem } from "../Tooltip/hoveredItemAtom.ts";
import type { RevenueSeries } from "./consts.ts";
import {
  getTxnMeta,
  type TxnAtPoint,
  type TxnMetaDetails,
} from "./hoverUtils.ts";

export interface HoveredRevenueTxn extends TxnAtPoint {
  /** The track's displayed series */
  series: RevenueSeries;
}

/** The txn under the cursor on the revenue track */
export const hoveredRevenueTxnAtom = atomWithHoveredItem<HoveredRevenueTxn>(
  (a, b) => a.slot === b.slot && a.txnIdx === b.txnIdx && a.series === b.series,
);

export interface RevenueTxnInfo {
  slot: number;
  series: RevenueSeries;
  meta: TxnMetaDetails;
}

/** The hovered revenue txn's details from the txn meta cache */
export const hoveredRevenueTxnInfoAtom = atom<RevenueTxnInfo | undefined>(
  (get) => {
    const hovered = get(hoveredRevenueTxnAtom);
    if (!hovered) return;

    const { slot, txnIdx, ms, series } = hovered;
    const meta = getTxnMeta(slot, txnIdx, ms);
    return meta && { slot, series, meta };
  },
);
