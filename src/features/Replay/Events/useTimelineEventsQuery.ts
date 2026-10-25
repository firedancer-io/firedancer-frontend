import { useCallback, useRef } from "react";
import { getDefaultStore, useSetAtom } from "jotai";
import { useWebSocketSend } from "../../../api/ws/utils";
import { reserveNextQueryIdAtom, type TimelineQueryKey } from "../atoms";
import type { TimelineEvents } from "../../../api/types";
import type { NsTsRange, TsRange } from "../../WebGl/webglUtils";
import { useThrottledCallbackIfVisible } from "../../../api/useDebounceIfVisible";
import { calcAbsoluteNs, useTimelineServerMessage } from "../utils";
import { appendTimelineEventsAtom } from "./atoms";
import { rootSlotAtom } from "../../../api/atoms";
import { slotPublishAtomFamily } from "../../../atoms";

const QUERY_KEY = "query_events" satisfies TimelineQueryKey;

const store = getDefaultStore();

/**
 * Data fetched before this ts will not change
 */
function getRootSlotNs(): bigint | undefined {
  const rootSlot = store.get(rootSlotAtom);
  if (rootSlot == null) return undefined;
  return (
    store.get(slotPublishAtomFamily(rootSlot))?.completed_time_nanos ??
    undefined
  );
}

export default function useTimelineEventsQuery() {
  // only query one at a time
  const pendingQueryRef = useRef<{
    queryId: number;
    stableNs: bigint | undefined;
  } | null>(null);

  // only store one at a time
  const nextQueryRef = useRef<{
    referenceNs: bigint;
    worldRange: TsRange;
  } | null>(null);

  // data before this ts will not change. Query from this ts on
  const lastStableNsRef = useRef<bigint | undefined>();

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

  /**
   * Query one at a time
   */
  const sendQuery = useThrottledCallbackIfVisible(
    (referenceNs: bigint, worldRange: TsRange) => {
      if (pendingQueryRef.current != null) {
        nextQueryRef.current = { referenceNs, worldRange };
        return;
      }

      const worldStartNs = calcAbsoluteNs(referenceNs, worldRange[0]);
      const worldEndNs = calcAbsoluteNs(referenceNs, worldRange[1]);

      const startNs = lastStableNsRef.current ?? worldStartNs;
      const rootSlotNs = getRootSlotNs();

      // known stable data boundary for this request's response
      const stableNs =
        rootSlotNs == null
          ? lastStableNsRef.current
          : // min of root slot or world end
            rootSlotNs <= worldEndNs
            ? rootSlotNs
            : worldEndNs;

      if (startNs >= worldEndNs) {
        // trigger next query if there is one
        const nextQuery = nextQueryRef.current;
        if (nextQuery) {
          nextQueryRef.current = null;
          sendQuery(nextQuery.referenceNs, nextQuery.worldRange);
        }
        return;
      }

      const queryId = reserveNextQueryId(QUERY_KEY);
      query(queryId, [startNs, worldEndNs]);
      pendingQueryRef.current = { queryId, stableNs };
    },
    200,
    { leading: true, trailing: true },
  );

  useTimelineServerMessage(
    QUERY_KEY,
    (message: { id: number; value: TimelineEvents }) => {
      if (pendingQueryRef.current?.queryId !== message.id) return;

      lastStableNsRef.current = pendingQueryRef.current.stableNs;
      pendingQueryRef.current = null;
      appendTimelineEvents(message.value);

      // trigger next query if there is one
      const nextQuery = nextQueryRef.current;
      if (nextQuery) {
        nextQueryRef.current = null;
        sendQuery(nextQuery.referenceNs, nextQuery.worldRange);
      }
    },
  );

  return sendQuery;
}
