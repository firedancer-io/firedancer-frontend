import { useCallback, useRef } from "react";
import { ascBucketGranularities, msBucketSizes } from "../const";
import useAggSlotsQuery, { RequesterId } from "../useAggSlotsQuery";
import type { AggGranularity } from "../../../api/types";
import type { NsTsRange } from "../../WebGl/webglUtils";
import { useThrottledCallback } from "use-debounce";

export default function useMiniMapQuery() {
  const lastRequestRef = useRef<
    | {
        worldRangeNs: NsTsRange;
        granularity: AggGranularity;
      }
    | undefined
  >(undefined);

  const query = useAggSlotsQuery(RequesterId.MiniMap);

  return useThrottledCallback(
    useCallback(
      (worldRangeNs: NsTsRange, granularity: AggGranularity) => {
        const lastRequest = lastRequestRef.current;
        if (
          lastRequest?.granularity === granularity &&
          lastRequest.worldRangeNs[0] === worldRangeNs[0]
        ) {
          if (lastRequest.worldRangeNs[1] === worldRangeNs[1]) {
            // nothing to fetch
            return;
          }

          // fetch only missing data at end
          query([lastRequest.worldRangeNs[1], worldRangeNs[1]], granularity);
        } else {
          // fetch entire world on granularity change or on start range change
          query(worldRangeNs, granularity);
        }

        lastRequestRef.current = {
          worldRangeNs,
          granularity,
        };
      },
      [query],
    ),
    400,
    {
      leading: true,
      trailing: true,
    },
  );
}

/**
 * At most, how many buckets should be visible
 */
const BUCKET_COUNT_THRESHOLD = 1000;
export function getMiniMapGranularity(worldSizeMs: number) {
  return (
    ascBucketGranularities.find((g) => {
      return worldSizeMs < BUCKET_COUNT_THRESHOLD * msBucketSizes[g];
    }) ?? ascBucketGranularities[ascBucketGranularities.length - 1]
  );
}
