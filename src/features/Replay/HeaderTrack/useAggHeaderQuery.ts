import type { AggSlots } from "../../../api/types";
import { useAggQuery } from "../useAggQuery";
import { AGG_SLOTS_QUERY_KEY } from "../useSlotsQuery";
import {
  addAggSlotsAtom,
  deleteAggSlotsBucketsAtom,
  aggHeaderEmitterAtom,
} from "./aggAtoms";

export function useAggHeaderQuery(chartId: string) {
  return useAggQuery<AggSlots>({
    chartId,
    queryKey: AGG_SLOTS_QUERY_KEY,
    addAtom: addAggSlotsAtom,
    deleteBucketsAtom: deleteAggSlotsBucketsAtom,
    emitterAtom: aggHeaderEmitterAtom,
  });
}
