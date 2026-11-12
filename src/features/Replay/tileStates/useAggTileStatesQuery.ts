import { getAggGranularityForQuery, type AggGranularityOpts } from "../utils";
import type { AggTileStates } from "../../../api/types";
import { BUCKETS_PER_TILE, useAggQuery } from "../useAggQuery";
import type { TimelineQueryKey } from "../atoms";
import {
  addAggTileStatesAtom,
  aggTileStatesEmitterAtom,
  deleteAggTileStatesBucketsAtom,
} from "./aggAtoms";

const QUERY_KEY = "query_agg_tile_states" satisfies TimelineQueryKey;

const AGG_TILE_STATES_CHART_ID = "agg-tile-states";

const OVERSCAN_TILES_COUNT = 1;
export const OVERSCAN_BUCKETS = BUCKETS_PER_TILE * OVERSCAN_TILES_COUNT;

/**
 * At most, how many buckets should be visible
 */
const BUCKET_COUNT_THRESHOLD = 1000;
export function getAggGranularity(
  windowSizeMs: number,
  opts?: AggGranularityOpts,
) {
  return getAggGranularityForQuery(
    QUERY_KEY,
    windowSizeMs,
    BUCKET_COUNT_THRESHOLD,
    opts,
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
    getGranularity: getAggGranularity,
    overscanTilesCount: OVERSCAN_TILES_COUNT,
  });
}
