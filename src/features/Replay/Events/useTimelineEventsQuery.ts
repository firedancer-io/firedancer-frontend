import { useCallback, useRef } from "react";
import { useSetAtom } from "jotai";
import { useWebSocketSend } from "../../../api/ws/utils";
import { reserveNextQueryIdAtom, type TimelineQueryKey } from "../atoms";
import type { TimelineEvents } from "../../../api/types";
import type { NsTsRange } from "../../WebGl/webglUtils";
import { useThrottledCallbackIfVisible } from "../../../api/useDebounceIfVisible";
import { useTimelineServerMessage } from "../utils";
import { appendTimelineEventsAtom } from "./atoms";

const QUERY_KEY = "query_events" satisfies TimelineQueryKey;

export default function useTimelineEventsQuery() {
  const pendingQueryIdsRef = useRef(new Set<number>());
  const lastRequestEndNsRef = useRef<bigint | undefined>(undefined);

  const wsSend = useWebSocketSend();
  const reserveNextQueryId = useSetAtom(reserveNextQueryIdAtom);
  const appendTimelineEvents = useSetAtom(appendTimelineEventsAtom);

  const query = useCallback(
    (queryId: number, rangeNs: NsTsRange) => {
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
    },
    [wsSend],
  );

  useTimelineServerMessage(
    QUERY_KEY,
    (message: { id: number; value: TimelineEvents }) => {
      if (!pendingQueryIdsRef.current.has(message.id)) return;

      pendingQueryIdsRef.current.delete(message.id);
      appendTimelineEvents(message.value);
    },
  );

  return useThrottledCallbackIfVisible(
    useCallback(
      (worldRangeNs: NsTsRange) => {
        const lastRequestEndNs = lastRequestEndNsRef.current;
        if (lastRequestEndNs == null) {
          // fetch entire world on start range change
          const queryId = reserveNextQueryId(QUERY_KEY);
          query(queryId, worldRangeNs);
          pendingQueryIdsRef.current.add(queryId);
        } else {
          if (lastRequestEndNs === worldRangeNs[1]) {
            // nothing to fetch
            return;
          }

          // fetch only missing data at end
          const queryId = reserveNextQueryId(QUERY_KEY);
          query(queryId, [lastRequestEndNs, worldRangeNs[1]]);
          pendingQueryIdsRef.current.add(queryId);
        }
        lastRequestEndNsRef.current = worldRangeNs[1];
      },
      [query, reserveNextQueryId],
    ),
    200,
    {
      leading: true,
      trailing: true,
    },
  );
}
