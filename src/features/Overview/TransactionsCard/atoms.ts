import type { EstimatedTps } from "../../../api/types";
import { atomWithImmer } from "jotai-immer";

export interface TpsDataPoint {
  ts: number;
  tps: EstimatedTps;
}

export const tpsDataAtom = atomWithImmer<TpsDataPoint[]>([]);
