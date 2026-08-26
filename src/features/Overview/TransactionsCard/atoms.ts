import type { EstimatedTps } from "../../../api/types";
import { atomWithImmer } from "jotai-immer";
import { atom } from "jotai";
import { estimatedTpsAtom, tpsHistoryAtom } from "../../../api/atoms";

export interface TpsDataPoint {
  ts: number;
  tps: EstimatedTps;
}

export const tpsDataAtom = atomWithImmer<TpsDataPoint[]>([]);

// First-flight fallback: tps_history rides the connect burst's opening
// batch while estimated_tps trails the multi-MB backlog frames, so the
// last history sample (same shape) fills the card in the reveal
// commit; the live estimate wins once present
export const estimatedTpsSeededAtom = atom<EstimatedTps | undefined>((get) => {
  return get(estimatedTpsAtom) ?? get(tpsHistoryAtom)?.at(-1);
});
