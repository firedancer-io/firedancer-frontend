import { atom } from "jotai";
import { atomWithHoveredItem } from "../Tooltip/hoveredItemAtom.ts";
import {
  getReplaySlotSegment,
  getTxnStates,
  type ExecrpTxnAtPoint,
  type ReplaySlotAtPoint,
} from "./hoverUtils.ts";

/** The txn under the cursor on the execrp track */
export const hoveredExecrpTxnAtom = atomWithHoveredItem<ExecrpTxnAtPoint>(
  (a, b) => a.slot === b.slot && a.txnIdx === b.txnIdx,
);

/** The hovered execrp txn's segments from the tile states cache */
export const hoveredExecrpTxnInfoAtom = atom((get) => {
  const hovered = get(hoveredExecrpTxnAtom);
  if (!hovered) return;

  const { slot, txnIdx, ms } = hovered;
  const states = getTxnStates(slot, txnIdx, ms);
  return states && { slot, states };
});

/** The slot a tile was replaying under the cursor on the replay track */
export const hoveredReplaySlotAtom = atomWithHoveredItem<ReplaySlotAtPoint>(
  (a, b) =>
    a.slot === b.slot &&
    a.tileIdx === b.tileIdx &&
    a.granularity === b.granularity,
);

/** The hovered replay slot's segment from the tile states cache */
export const hoveredReplaySlotInfoAtom = atom((get) => {
  const hovered = get(hoveredReplaySlotAtom);
  return hovered && getReplaySlotSegment(hovered);
});
