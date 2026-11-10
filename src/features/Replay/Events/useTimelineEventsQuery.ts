import { useCallback } from "react";
import { useSetAtom } from "jotai";
import { useWebSocketSend } from "../../../api/ws/utils";
import { type TimelineQueryKey } from "../atoms";
import type { TimelineEvents } from "../../../api/types";
import type { NsTsRange, TsRange } from "../../WebGl/webglUtils";
import { calcAbsoluteNs, useTimelineServerMessage } from "../utils";
import { appendTimelineEventsAtom } from "./atoms";
import useIncrementalQuery from "../useIncrementalQuery";

const QUERY_KEY = "query_events" satisfies TimelineQueryKey;

interface TimelineRequest {
  referenceNs: bigint;
  worldRange: TsRange;
}

export default function useTimelineEventsQuery() {
  const wsSend = useWebSocketSend();
  const appendTimelineEvents = useSetAtom(appendTimelineEventsAtom);

  const query = (queryId: number, rangeNs: NsTsRange) => {
    const [start, end] = rangeNs;
    wsSend({
      topic: "timeline",
      key: QUERY_KEY,
      id: queryId,
      params: {
        start_ns: start.toString(),
        end_ns: end.toString(),
      },
    });
  };

  const [sendQuery, markQueryComplete] = useIncrementalQuery<TimelineRequest>({
    queryKey: QUERY_KEY,
    throttleMs: 200,
    buildQuery: ({ referenceNs, worldRange }) => ({
      worldRangeNs: [
        calcAbsoluteNs(referenceNs, worldRange[0]),
        calcAbsoluteNs(referenceNs, worldRange[1]),
      ],
      shouldResetStates: false,
      sendQuery: (queryId, rangeNs) => query(queryId, rangeNs),
    }),
  });

  useTimelineServerMessage(
    QUERY_KEY,
    (message: { id: number; value: TimelineEvents }) => {
      markQueryComplete(message.id, () => appendTimelineEvents(message.value));
    },
  );

  return useCallback(
    (referenceNs: bigint, worldRange: TsRange) =>
      sendQuery({ referenceNs, worldRange }),
    [sendQuery],
  );
}
