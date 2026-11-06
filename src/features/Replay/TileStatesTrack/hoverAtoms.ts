import { selectAtom } from "jotai/utils";
import { atomWithIsSameCheck } from "../../../atomUtils";
import type { ExecrpTxnAtPoint } from "./hoverUtils.ts";

export const hoveredExecrpTxnAtom = atomWithIsSameCheck<ExecrpTxnAtPoint>(
  (a, b) => a.slot === b.slot && a.txnIdx === b.txnIdx && a.state === b.state,
);

export const hoveredExecrpTxnKeyAtom = selectAtom(
  hoveredExecrpTxnAtom,
  (hovered) =>
    hovered && { slot: hovered.slot, txnIdx: hovered.txnIdx, ms: hovered.ms },
  (a, b) => a?.slot === b?.slot && a?.txnIdx === b?.txnIdx,
);
