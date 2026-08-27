import { useCallback } from "react";
import { ascBucketGranularities, msBucketSizes } from "../const";
import type { AggGranularity } from "../../../api/types";
import { useWebSocketSend } from "../../../api/ws/utils";
import type { NsTsRange } from "../../WebGl/webglUtils";

// TODO: throttle across revenue types
export default function useAggRevenueQuery() {
  const wsSend = useWebSocketSend();

  return useCallback(
    (visibleRangeNs: NsTsRange, granularity: AggGranularity) => {
      const [visibleStart, visibleEnd] = visibleRangeNs;
      wsSend({
        topic: "timeline",
        key: "query_agg_revenue",
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
const BUCKET_COUNT_THRESHOLD = 600;
export function getGranularity(windowSizeMs: number) {
  return (
    ascBucketGranularities.find((g) => {
      return windowSizeMs < BUCKET_COUNT_THRESHOLD * msBucketSizes[g];
    }) ?? ascBucketGranularities[ascBucketGranularities.length - 1]
  );
}
