import { getAggGranularityForQuery, type AggGranularityOpts } from "../utils";
import type { AggShreds } from "../../../api/types";
import { useAggQuery } from "../useAggQuery";
import type { TimelineQueryKey } from "../atoms";
import {
  addAggShredsAtom,
  deleteAggShredsBucketsAtom,
  aggShredsEmitterAtom,
  aggShredsDrawTilesAtom,
} from "./atoms";

const QUERY_KEY = "query_agg_shreds" satisfies TimelineQueryKey;

/**
 * At most, how many buckets should be visible
 */
const AGG_SHREDS_BUCKET_COUNT_THRESHOLD = 2000;

export function getAggGranularity(
  windowSizeMs: number,
  opts?: AggGranularityOpts,
) {
  return getAggGranularityForQuery(
    QUERY_KEY,
    windowSizeMs,
    AGG_SHREDS_BUCKET_COUNT_THRESHOLD,
    opts,
  );
}

export function useAggShredsQuery(chartId: string) {
  return useAggQuery<AggShreds>({
    chartId,
    queryKey: QUERY_KEY,
    addAtom: addAggShredsAtom,
    deleteBucketsAtom: deleteAggShredsBucketsAtom,
    getGranularity: getAggGranularity,
    emitterAtom: aggShredsEmitterAtom,
    drawTilesAtom: aggShredsDrawTilesAtom,
  });
}
