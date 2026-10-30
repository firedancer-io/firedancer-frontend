import { getAggGranularityForQuery } from "../utils";
import type { AggTileStates } from "../../../api/types";
import { useAggQuery } from "../useAggQuery";
import type { TimelineQueryKey } from "../atoms";
import {
  addAggTileStatesAtom,
  aggTileStatesEmitterAtom,
  deleteAggTileStatesBucketsAtom,
} from "./aggAtoms";

const QUERY_KEY = "query_agg_tile_states" satisfies TimelineQueryKey;

export const AGG_TILE_STATES_CHART_ID = "agg-tile-states";

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

export type AggTileStatesQuery = ReturnType<typeof useAggTileStatesQuery>;

export function useAggTileStatesQuery() {
  return useAggQuery<AggTileStates>({
    chartId: AGG_TILE_STATES_CHART_ID,
    queryKey: QUERY_KEY,
    addAtom: addAggTileStatesAtom,
    deleteBucketsAtom: deleteAggTileStatesBucketsAtom,
    emitterAtom: aggTileStatesEmitterAtom,
  });
}
