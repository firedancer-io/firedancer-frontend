import { useCallback } from "react";
import { ascBucketGranularities, msBucketSizes } from "../const";
import { useWebSocketSend } from "../../../api/ws/utils";
import type { AggGranularity } from "../../../api/types";
import type { NsTsRange } from "../../WebGl/webglUtils";

export default function useAggSlotsQuery() {
  const wsSend = useWebSocketSend();

  return useCallback(
    (visibleRangeNs: NsTsRange, granularity: AggGranularity) => {
      const [visibleStart, visibleEnd] = visibleRangeNs;
      wsSend({
        topic: "timeline",
        key: "query_agg_shreds",
        id: 32,
        params: {
          start_ns: visibleStart.toString(),
          end_ns: visibleEnd.toString(),
          granularity,
        },
      });
    },
    [wsSend],
  );
}

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
