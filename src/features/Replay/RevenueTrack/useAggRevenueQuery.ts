import { getAggGranularityForQuery } from "../utils";
import type { AggRevenue } from "../../../api/types";
import { useAggQuery } from "../useAggQuery";
import type { TimelineQueryKey } from "../atoms";
import {
  addAggRevenueAtom,
  deleteAggRevenueBucketsAtom,
  aggRevenueEmitterAtom,
} from "./atoms";

const QUERY_KEY = "query_agg_revenue" satisfies TimelineQueryKey;

const chartId = "revenue-track";

/**
 * At most, how many buckets should be visible
 */
export const AGG_BUCKET_COUNT_THRESHOLD = 600;
export function getGranularity(windowSizeMs: number) {
  return getAggGranularityForQuery(
    QUERY_KEY,
    windowSizeMs,
    AGG_BUCKET_COUNT_THRESHOLD,
  );
}

export default function useAggRevenueQuery() {
  return useAggQuery<AggRevenue>({
    chartId,
    queryKey: QUERY_KEY,
    addAtom: addAggRevenueAtom,
    deleteBucketsAtom: deleteAggRevenueBucketsAtom,
    emitterAtom: aggRevenueEmitterAtom,
  });
}

export type AggRevenueQuery = ReturnType<typeof useAggRevenueQuery>;
