import { useCallback } from "react";
import { useWebSocketSend } from "../../api/ws/utils";
import type { AggGranularity } from "../../api/types";
import type { NsTsRange } from "../WebGl/webglUtils";

export enum StartQueryId {
  MiniMap = 0,
  HeaderTrack = 1,
}

export default function useAggSlotsQuery() {
  const wsSend = useWebSocketSend();

  return useCallback(
    (queryId: number, rangeNs: NsTsRange, granularity: AggGranularity) => {
      const [start, end] = rangeNs;
      wsSend({
        topic: "timeline",
        key: "query_agg_slots",
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
