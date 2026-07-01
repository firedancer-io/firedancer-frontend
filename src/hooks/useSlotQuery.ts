import { useAtomValue } from "jotai";
import {
  getIsFutureSlotAtom,
  slotPublishAtomFamily,
  slotResponseAtomFamily,
} from "../atoms";
import { useCallback, useEffect, useRef, useState } from "react";
import { useWebSocketSend } from "../api/ws/utils";
import memoize from "micro-memoize";
import type { SendMessage } from "../api/ws/types";
import { throttle } from "lodash";
import useIsDocumentVisible from "./useIsDocumentVisible";
import { useUnmount } from "react-use";

enum SlotQueryType {
  Publish = "publish",
  Detailed = "detailed",
  Transactions = "transactions",
}

const getSendQuery = memoize(
  (wsSend: SendMessage, slot: number, query_type: SlotQueryType) => {
    return throttle(
      () => {
        switch (query_type) {
          case SlotQueryType.Publish: {
            wsSend({
              topic: "slot",
              key: "query",
              id: 1,
              params: {
                slot: slot,
              },
            });
            break;
          }
          case SlotQueryType.Detailed: {
            wsSend({
              topic: "slot",
              key: "query_detailed",
              id: 2,
              params: {
                slot: slot,
              },
            });
            break;
          }
          case SlotQueryType.Transactions: {
            wsSend({
              topic: "slot",
              key: "query_transactions",
              id: 3,
              params: {
                slot: slot,
              },
            });
            break;
          }
        }
      },
      5_000,
      { trailing: false },
    );
  },
  { maxSize: 250 },
);

function useSlotQuery(
  slot: number | undefined,
  query_type: SlotQueryType,
  skipQuery: boolean,
) {
  const wsSend = useWebSocketSend();
  const queryTimerRef = useRef<{
    query: () => void;
    queryTimeoutId: ReturnType<typeof setTimeout>;
    waitedForDataTimeoutId: ReturnType<typeof setTimeout>;
  } | null>(null);

  const isFutureSlot = useAtomValue(getIsFutureSlotAtom(slot));
  const isDocumentVisible = useIsDocumentVisible();
  const [waitingForData, setWaitingForData] = useState(true);

  const query = useCallback(() => {
    if (!slot) return;
    if (isFutureSlot) return;
    if (skipQuery) return;

    const sendQuery = getSendQuery(wsSend, slot, query_type);
    sendQuery();
  }, [query_type, isFutureSlot, slot, skipQuery, wsSend]);

  useEffect(() => {
    if (!isDocumentVisible || queryTimerRef.current?.query === query) return;

    // new query
    if (queryTimerRef.current) {
      clearTimeout(queryTimerRef.current.queryTimeoutId);
      clearTimeout(queryTimerRef.current.waitedForDataTimeoutId);
      setWaitingForData(true);
    }
    const queryTimeout = setTimeout(() => query(), 250);
    const waitingTimeout = setTimeout(() => setWaitingForData(false), 3_000);

    queryTimerRef.current = {
      query,
      queryTimeoutId: queryTimeout,
      waitedForDataTimeoutId: waitingTimeout,
    };
  }, [query, isDocumentVisible]);

  useUnmount(() => {
    if (queryTimerRef.current) {
      clearTimeout(queryTimerRef.current.queryTimeoutId);
      clearTimeout(queryTimerRef.current.waitedForDataTimeoutId);
      queryTimerRef.current = null;
    }
  });

  const hasWaitedForData = !waitingForData;

  return { hasWaitedForData };
}

export function useSlotQueryPublish(slot?: number) {
  const publish = useAtomValue(slotPublishAtomFamily(slot));

  const skipQuery = !!publish;

  const { hasWaitedForData } = useSlotQuery(
    slot,
    SlotQueryType.Publish,
    skipQuery,
  );

  return { publish, hasWaitedForData };
}

export function useSlotQueryResponseDetailed(slot?: number) {
  const response = useAtomValue(slotResponseAtomFamily(slot));

  const skipQuery =
    !!response?.waterfall &&
    !!response?.tile_timers &&
    !!response?.tile_primary_metric &&
    !!response.scheduler_counts &&
    !!response.scheduler_stats &&
    !!response.limits;

  const { hasWaitedForData } = useSlotQuery(
    slot,
    SlotQueryType.Detailed,
    skipQuery,
  );

  return { response, hasWaitedForData };
}

export function useSlotQueryResponseTransactions(slot?: number) {
  const response = useAtomValue(slotResponseAtomFamily(slot));

  const skipQuery = !!response?.transactions;

  const { hasWaitedForData } = useSlotQuery(
    slot,
    SlotQueryType.Transactions,
    skipQuery,
  );

  return { response, hasWaitedForData };
}
