import { getAggGranularityForQuery } from "../utils";
import type { AggSlots } from "../../../api/types";
import { useAggQuery } from "../useAggQuery";
import { AGG_SLOTS_QUERY_KEY } from "../useSlotsQuery";
import { AGG_SLOTS_BUCKET_COUNT_THRESHOLD } from "../const";
import {
  addAggSlotsAtom,
  deleteAggSlotsBucketsAtom,
  aggHeaderEmitterAtom,
} from "./aggAtoms";

export function getAggGranularity(windowSizeMs: number) {
  return getAggGranularityForQuery(
    AGG_SLOTS_QUERY_KEY,
    windowSizeMs,
    AGG_SLOTS_BUCKET_COUNT_THRESHOLD,
  );
}

export function useAggHeaderQuery(chartId: string) {
  return useAggQuery<AggSlots>({
    chartId,
    queryKey: AGG_SLOTS_QUERY_KEY,
    addAtom: addAggSlotsAtom,
    deleteBucketsAtom: deleteAggSlotsBucketsAtom,
    emitterAtom: aggHeaderEmitterAtom,
  });
}
