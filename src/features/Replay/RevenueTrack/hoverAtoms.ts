import { atom } from "jotai";
import { hoveredRevenueTxnAtom } from "../atoms.ts";
import type { RevenueSeries, TxnMetaDetails } from "./consts.ts";

export interface RevenueTxnInfo {
  slot: number;
  series: RevenueSeries;
  meta: TxnMetaDetails;
}

/** The hovered revenue txn's details */
export const hoveredRevenueTxnInfoAtom = atom<RevenueTxnInfo | undefined>(
  (get) => {
    const hovered = get(hoveredRevenueTxnAtom);
    if (!hovered) return;

    const { slot, series, meta } = hovered;
    return { slot, series, meta };
  },
);
