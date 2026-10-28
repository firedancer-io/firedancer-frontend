import { ascBucketGranularities, msBucketSizes } from "../const";
import type { AggShreds } from "../../../api/types";
import { createAggCache } from "../aggCache";
import type { TimelineQueryKey } from "../atoms";
import { AGG_SHREDS_CHART_ID } from "./const";
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
  return (
    ascBucketGranularities.find((g) => {
      return windowSizeMs < BUCKET_COUNT_THRESHOLD * msBucketSizes[g];
    }) ?? ascBucketGranularities[ascBucketGranularities.length - 1]
  );
}

export const aggShredsCache = createAggCache<AggShreds>({
  chartId: AGG_SHREDS_CHART_ID,
  queryKey: QUERY_KEY,
  addAtom: addAggShredsAtom,
  deleteBucketsAtom: deleteAggShredsBucketsAtom,
  emitterAtom: aggShredsEmitterAtom,
});
