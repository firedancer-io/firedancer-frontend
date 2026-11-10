import { useCallback } from "react";
import { getAggGranularityForQuery } from "../utils";
import type { AggGranularity, AggSlots } from "../../../api/types";
import { AGG_SLOTS_QUERY_KEY, useSlotsQuery } from "../useSlotsQuery";
import type { NsTsRange } from "../../WebGl/webglUtils";
import { useTimelineServerMessage } from "../utils";
import useIncrementalQuery from "../useIncrementalQuery";

interface MiniMapRequest {
  worldRangeNs: NsTsRange;
  granularity: AggGranularity;
}

export default function useMiniMapQuery(
  onMessage: (message: { id: number; value: AggSlots }) => void,
) {
  const query = useSlotsQuery();

  const [sendQuery, markQueryComplete] = useIncrementalQuery<MiniMapRequest>({
    queryKey: AGG_SLOTS_QUERY_KEY,
    throttleMs: 400,
    buildQuery: ({ worldRangeNs, granularity }, prevReq) => ({
      worldRangeNs,
      // refetch from start of world on granularity or world start change
      shouldResetStates:
        granularity !== prevReq?.granularity ||
        worldRangeNs[0] !== prevReq.worldRangeNs[0],
      sendQuery: (queryId, rangeNs) => query(queryId, rangeNs, granularity),
    }),
  });

  useTimelineServerMessage(
    AGG_SLOTS_QUERY_KEY,
    (message: { id: number; value: AggSlots }) => {
      markQueryComplete(message.id, () => onMessage(message));
    },
  );

  return useCallback(
    (worldRangeNs: NsTsRange, granularity: AggGranularity) =>
      sendQuery({ worldRangeNs, granularity }),
    [sendQuery],
  );
}

/**
 * At most, how many buckets should be visible
 */
const BUCKET_COUNT_THRESHOLD = 2000;
export function getMiniMapGranularity(worldSizeMs: number) {
  return getAggGranularityForQuery(
    AGG_SLOTS_QUERY_KEY,
    worldSizeMs,
    BUCKET_COUNT_THRESHOLD,
  );
}
