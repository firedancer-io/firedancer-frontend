import { useCallback } from "react";
import { useWebSocketSend } from "../../api/ws/utils";
import type { AggGranularity } from "../../api/types";
import type { NsTsRange } from "../WebGl/webglUtils";
import type { TimelineQueryKey } from "./atoms";

export const AGG_SLOTS_QUERY_KEY = "query_agg_slots" satisfies TimelineQueryKey;
export const SLOTS_QUERY_KEY = "query_slots" satisfies TimelineQueryKey;

export function useAggSlotsQuery() {
  const wsSend = useWebSocketSend();

  return useCallback(
    (queryId: number, rangeNs: NsTsRange, granularity: AggGranularity) => {
      const [start, end] = rangeNs;
      wsSend({
        topic: "timeline",
        key: AGG_SLOTS_QUERY_KEY,
        id: queryId,
        params: {
          start_ns: start.toString(),
          end_ns: end.toString(),
          granularity,
        },
      });
    },
    [wsSend],
  );
}

export function useSlotsQuery() {
  const wsSend = useWebSocketSend();

  return useCallback(
    (queryId: number, rangeNs: NsTsRange) => {
      const [start, end] = rangeNs;
      wsSend({
        topic: "timeline",
        key: SLOTS_QUERY_KEY,
        id: queryId,
        params: {
          start_ns: start.toString(),
          end_ns: end.toString(),
        },
      });
    },
    [wsSend],
  );
}
