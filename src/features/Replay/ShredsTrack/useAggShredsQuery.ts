import { getAggGranularityForQuery } from "../utils";
import type { AggShreds } from "../../../api/types";
import { useAggQuery } from "../useAggQuery";
import type { TimelineQueryKey } from "../atoms";
import { AGG_BUCKET_COUNT_THRESHOLD } from "../const";
import {
  addAggShredsAtom,
  deleteAggShredsBucketsAtom,
  aggShredsEmitterAtom,
  aggShredsDrawTilesAtom,
} from "./atoms";

const QUERY_KEY = "query_agg_shreds" satisfies TimelineQueryKey;

export function getAggGranularity(windowSizeMs: number) {
  return getAggGranularityForQuery(
    QUERY_KEY,
    windowSizeMs,
    AGG_BUCKET_COUNT_THRESHOLD,
  );
}

export function useAggShredsQuery(chartId: string) {
  return useAggQuery<AggShreds>({
    chartId,
    queryKey: QUERY_KEY,
    addAtom: addAggShredsAtom,
    deleteBucketsAtom: deleteAggShredsBucketsAtom,
    emitterAtom: aggShredsEmitterAtom,
    drawTilesAtom: aggShredsDrawTilesAtom,
  });
}
