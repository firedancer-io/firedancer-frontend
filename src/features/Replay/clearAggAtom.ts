import { atom, type Atom, type PrimitiveAtom } from "jotai";
import type { AggGranularity } from "../../api/types";
import { drawEventType, type DrawEmitter } from "./const";

/** Write atom that empties an agg track's buckets and redraws it */
export function createClearAggAtom<T>(
  bucketsAtom: PrimitiveAtom<Map<AggGranularity, T>>,
  emitterAtom: Atom<DrawEmitter>,
) {
  return atom(null, (get, set) => {
    set(bucketsAtom, new Map());
    get(emitterAtom).emit(drawEventType);
  });
}
