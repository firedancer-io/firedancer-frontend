import { getAggGranularityForQuery } from "../utils";
import type { AggShreds } from "../../../api/types";
import { useAggQuery } from "../useAggQuery";
import type { TimelineQueryKey } from "../atoms";
import {
  addAggShredsAtom,
  deleteAggShredsBucketsAtom,
  aggShredsEmitterAtom,
} from "./atoms";

const QUERY_KEY = "query_agg_shreds" satisfies TimelineQueryKey;

/**
 * At most, how many buckets should be visible
 */
const BUCKET_COUNT_THRESHOLD = 1000;
export function getAggGranularity(windowSizeMs: number) {
  return getAggGranularityForQuery(
    QUERY_KEY,
    windowSizeMs,
    BUCKET_COUNT_THRESHOLD,
  );
}

export function useAggShredsQuery(chartId: string) {
  return useAggQuery<AggShreds>({
    chartId,
    queryKey: QUERY_KEY,
    addAtom: addAggShredsAtom,
    deleteBucketsAtom: deleteAggShredsBucketsAtom,
    emitterAtom: aggShredsEmitterAtom,
  });
}
