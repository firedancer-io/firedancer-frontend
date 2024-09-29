import { useAtomValue, useSetAtom } from "jotai";
import {
  getHasQueryedAtom,
  getIsFutureSlotAtom,
  getSlotResponseAtom,
  setHasQueryedAtom,
} from "../atoms";
import { useMount } from "react-use";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useWebSocketSend } from "../api/ws/utils";

export default function useSlotQuery(slot?: number, needsTimers?: boolean) {
  const wsSend = useWebSocketSend();

  const slotResponse = useAtomValue(
    useMemo(() => getSlotResponseAtom(slot), [slot])
  );
  const hasQueryed = useAtomValue(
    useMemo(() => getHasQueryedAtom(slot), [slot])
  );
  const setHasQueryed = useSetAtom(setHasQueryedAtom);
  const isFutureSlot = useAtomValue(
    useMemo(() => getIsFutureSlotAtom(slot), [slot])
  );

  const query = useCallback(() => {
    if (hasQueryed) return;
    if (!slot) return;

    const stillNeedsTimer = needsTimers && !slotResponse?.tile_timers;
    if (slotResponse && !stillNeedsTimer) return;
    if (isFutureSlot) return;

    wsSend({
      topic: "slot",
      key: "query",
      id: 1,
      params: {
        slot: slot,
      },
    });
    setHasQueryed(slot);
  }, [
    hasQueryed,
    isFutureSlot,
    needsTimers,
    setHasQueryed,
    slot,
    slotResponse,
    wsSend,
  ]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(query, [slot]);

  // useInterval(query, 5_000);

  const [waitingForData, setWaitingForData] = useState(true);
  useMount(() => {
    setTimeout(() => setWaitingForData(false), 3_000);
  });

  const hasWaitedForData = hasQueryed && !waitingForData;

  return { slotResponse, hasWaitedForData };
}
