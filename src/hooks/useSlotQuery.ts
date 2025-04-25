import { useAtomValue } from "jotai";
import {
  getIsFutureSlotAtom,
  getSlotPublishAtom,
  getSlotResponseAtom,
} from "../atoms";
import { useMount } from "react-use";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useWebSocketSend } from "../api/ws/utils";
import memoize from "micro-memoize";
import { SendMessage } from "../api/ws/types";
import { throttle } from "lodash";

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

  const isFutureSlot = useAtomValue(
    useMemo(() => getIsFutureSlotAtom(slot), [slot]),
  );

  const query = useCallback(() => {
    if (!slot) return;
    if (isFutureSlot) return;
    if (skipQuery) return;

    const sendQuery = getSendQuery(wsSend, slot, query_type);
    sendQuery();
  }, [query_type, isFutureSlot, slot, skipQuery, wsSend]);

  useEffect(query, [query]);

  const [waitingForData, setWaitingForData] = useState(true);
  useMount(() => {
    setTimeout(() => setWaitingForData(false), 3_000);
  });

  const hasWaitedForData = !waitingForData;

  return { hasWaitedForData };
}

export function useSlotQueryPublish(slot?: number) {
  const publish = useAtomValue(useMemo(() => getSlotPublishAtom(slot), [slot]));

  const skipQuery = !!publish;

  const { hasWaitedForData } = useSlotQuery(
    slot,
    SlotQueryType.Publish,
    skipQuery,
  );

  return { publish, hasWaitedForData };
}

export function useSlotQueryResponseDetailed(slot?: number) {
  const response = useAtomValue(
    useMemo(() => getSlotResponseAtom(slot), [slot]),
  );
  const skipQuery =
    !!response?.waterfall &&
    !!response?.tile_timers &&
    !!response?.tile_primary_metric;

  const { hasWaitedForData } = useSlotQuery(
    slot,
    SlotQueryType.Detailed,
    skipQuery,
  );

  return { response, hasWaitedForData };
}

export function useSlotQueryResponseTransactions(slot?: number) {
  const response = useAtomValue(
    useMemo(() => getSlotResponseAtom(slot), [slot]),
  );
  const skipQuery = !!response?.transactions;

  const { hasWaitedForData } = useSlotQuery(
    slot,
    SlotQueryType.Transactions,
    skipQuery,
  );

  return { response, hasWaitedForData };
}
