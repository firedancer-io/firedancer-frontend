import { useMemo } from "react";
import { useAtomValue } from "jotai";
import { getAggGranularityForQuery } from "../utils";
import type { AggCpu } from "../../../api/types";
import { useAggQuery } from "../useAggQuery";
import type { TimelineQueryKey } from "../atoms";
import {
  addAggCpuAtom,
  aggCpuEmitterAtom,
  deleteAggCpuBucketsAtom,
  queryTileIdxsAtom,
} from "./atoms";

const QUERY_KEY = "query_agg_cpu" satisfies TimelineQueryKey;

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

interface AggCpuParams {
  tiles: number[];
}

export function useAggCpuQuery(chartId: string) {
  const tiles = useAtomValue(queryTileIdxsAtom);
  const params = useMemo<AggCpuParams>(() => ({ tiles }), [tiles]);

  return useAggQuery<AggCpu, AggCpuParams>({
    chartId,
    queryKey: QUERY_KEY,
    params,
    addAtom: addAggCpuAtom,
    deleteBucketsAtom: deleteAggCpuBucketsAtom,
    emitterAtom: aggCpuEmitterAtom,
  });
}

export type AggCpuQuery = ReturnType<typeof useAggCpuQuery>["query"];
