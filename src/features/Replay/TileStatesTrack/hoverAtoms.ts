import { atom } from "jotai";
import { selectAtom } from "jotai/utils";
import { atomWithIsSameCheckItem } from "../Tooltip/hoveredItemAtom.ts";
import { getTxnStateDurations, type ExecrpTxnAtPoint } from "./hoverUtils.ts";

export const hoveredExecrpTxnAtom = atomWithIsSameCheckItem<ExecrpTxnAtPoint>(
  (a, b) => a.slot === b.slot && a.txnIdx === b.txnIdx && a.state === b.state,
);

const hoveredExecrpTxnKeyAtom = selectAtom(
  hoveredExecrpTxnAtom,
  (hovered) =>
    hovered && { slot: hovered.slot, txnIdx: hovered.txnIdx, ms: hovered.ms },
  (a, b) => a?.slot === b?.slot && a?.txnIdx === b?.txnIdx,
);

const hoveredExecrpTxnSegmentsAtom = atom((get) => {
  const key = get(hoveredExecrpTxnKeyAtom);
  return key && getTxnStateDurations(key.slot, key.txnIdx, key.ms);
});

export const hoveredExecrpTxnInfoAtom = atom((get) => {
  const hovered = get(hoveredExecrpTxnAtom);
  const states = get(hoveredExecrpTxnSegmentsAtom);
  if (!hovered || !states) return;
  return { slot: hovered.slot, state: hovered.state, states };
});
