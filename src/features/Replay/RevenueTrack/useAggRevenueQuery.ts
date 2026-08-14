import { useCallback } from "react";
import { ascBucketGranularities, msBucketSizes, type TsRange } from "../const";
import type { AggGranularity } from "../../../api/types";
import { useWebSocketSend } from "../../../api/ws/utils";
import { getNsStringFromMs } from "../utils";

// TODO: throttle across revenue types
export default function useAggRevenueQuery() {
  const wsSend = useWebSocketSend();

  return useCallback(
    (
      visibleRangeMs: TsRange,
      _worldRangeMs: TsRange,
      granularity: AggGranularity,
    ) => {
      const [visibleStart, visibleEnd] = visibleRangeMs;
      wsSend({
        topic: "timeline",
        key: "query_agg_revenue",
        id: 32,
        params: {
          start_ns: getNsStringFromMs(visibleStart, "ceil"),
          end_ns: getNsStringFromMs(visibleEnd, "floor"),
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
const BUCKET_COUNT_THRESHOLD = 300;
export function getGranularity(windowSizeMs: number) {
  return (
    ascBucketGranularities.find((g) => {
      return windowSizeMs < BUCKET_COUNT_THRESHOLD * msBucketSizes[g];
    }) ?? ascBucketGranularities[ascBucketGranularities.length - 1]
  );
}
