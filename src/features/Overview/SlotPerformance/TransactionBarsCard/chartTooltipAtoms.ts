import { atom } from "jotai";
import { TxnState } from "./consts";

export const tooltipTxnIdxAtom = atom(-1);

export const tooltipTxnStateAtom = atom(TxnState.DEFAULT);
