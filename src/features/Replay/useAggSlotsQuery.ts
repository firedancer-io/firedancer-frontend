import { useCallback } from "react";
import { useWebSocketSend } from "../../api/ws/utils";
import type { AggGranularity } from "../../api/types";
import type { NsTsRange } from "../WebGl/webglUtils";

export enum RequesterId {
  MiniMap = 0,
}

export default function useAggSlotsQuery(requesterId: RequesterId) {
  const wsSend = useWebSocketSend();

  return useCallback(
    (rangeNs: NsTsRange, granularity: AggGranularity) => {
      const [start, end] = rangeNs;
      wsSend({
        topic: "timeline",
        key: "query_agg_slots",
        id: requesterId,
        params: {
          start_ns: start.toString(),
          end_ns: end.toString(),
          granularity,
        },
      });
    },
    [requesterId, wsSend],
  );
}
