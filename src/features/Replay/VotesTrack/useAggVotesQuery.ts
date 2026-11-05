import type { AggVotes } from "../../../api/types";
import type { TimelineQueryKey } from "../atoms";
import { useAggQuery } from "../useAggQuery";
import { getAggGranularityForQuery } from "../utils";
import {
  addAggVotesAtom,
  aggVotesEmitterAtom,
  deleteAggVotesBucketsAtom,
} from "./aggAtoms";

const QUERY_KEY = "query_agg_votes" satisfies TimelineQueryKey;

/** At most, how many buckets should be visible */
const BUCKET_COUNT_THRESHOLD = 1000;

export function getAggVotesGranularity(windowSizeMs: number) {
  return getAggGranularityForQuery(
    QUERY_KEY,
    windowSizeMs,
    BUCKET_COUNT_THRESHOLD,
  );
}

export function useAggVotesQuery(chartId: string) {
  return useAggQuery<AggVotes>({
    chartId,
    queryKey: QUERY_KEY,
    addAtom: addAggVotesAtom,
    deleteBucketsAtom: deleteAggVotesBucketsAtom,
    emitterAtom: aggVotesEmitterAtom,
  });
}
