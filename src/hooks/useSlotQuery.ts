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

const getSendQuery = memoize(
  (wsSend: SendMessage, slot: number, isDetailed: boolean) => {
    return throttle(
      () => {
        wsSend({
          topic: "slot",
          key: isDetailed ? "query_detailed" : "query",
          id: 1,
          params: {
            slot: slot,
          },
        });
      },
      5_000,
      { trailing: false },
    );
  },
  { maxSize: 250 },
);

function useSlotQuery(
  slot: number | undefined,
  isDetailed: boolean,
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

    const sendQuery = getSendQuery(wsSend, slot, isDetailed);
    sendQuery();
  }, [isDetailed, isFutureSlot, slot, skipQuery, wsSend]);

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

  const { hasWaitedForData } = useSlotQuery(slot, false, skipQuery);

  return { publish, hasWaitedForData };
}

export function useSlotQueryResponse(slot?: number) {
  const response = useAtomValue(
    useMemo(() => getSlotResponseAtom(slot), [slot]),
  );
  const skipQuery = !!response?.compute_units;

  const { hasWaitedForData } = useSlotQuery(slot, true, skipQuery);

  return { response, hasWaitedForData };
}
