import { useCallback, useRef } from "react";
import { useSetAtom } from "jotai";
import { ascBucketGranularities, msBucketSizes } from "../const";
import { reserveNextQueryIdAtom } from "../atoms";
import type { AggGranularity, AggSlots } from "../../../api/types";
import { AGG_SLOTS_QUERY_KEY, useAggSlotsQuery } from "../useSlotsQuery";
import type { NsTsRange } from "../../WebGl/webglUtils";
import { useThrottledCallbackIfVisible } from "../../../api/useDebounceIfVisible";
import { useTimelineServerMessage } from "../utils";

export default function useMiniMapQuery(
  onMessage: (message: { id: number; value: AggSlots }) => void,
) {
  const pendingQueryIdsRef = useRef(new Set<number>());
  const lastRequestRef = useRef<
    | {
        worldRangeNs: NsTsRange;
        granularity: AggGranularity;
      }
    | undefined
  >(undefined);

  const query = useAggSlotsQuery();
  const reserveNextQueryId = useSetAtom(reserveNextQueryIdAtom);

  const handleMessage = useCallback(
    (message: { id: number; value: AggSlots }) => {
      if (!pendingQueryIdsRef.current.has(message.id)) return;

      pendingQueryIdsRef.current.delete(message.id);
      onMessage(message);
    },
    [onMessage],
  );

  useTimelineServerMessage(AGG_SLOTS_QUERY_KEY, handleMessage);

  return useThrottledCallbackIfVisible(
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
          const queryId = reserveNextQueryId(AGG_SLOTS_QUERY_KEY);
          query(
            queryId,
            [lastRequest.worldRangeNs[1], worldRangeNs[1]],
            granularity,
          );
          pendingQueryIdsRef.current.add(queryId);
        } else {
          // fetch entire world on granularity change or on start range change
          const queryId = reserveNextQueryId(AGG_SLOTS_QUERY_KEY);
          query(queryId, worldRangeNs, granularity);
          pendingQueryIdsRef.current.add(queryId);
        }

        lastRequestRef.current = {
          worldRangeNs,
          granularity,
        };
      },
      [query, reserveNextQueryId],
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
