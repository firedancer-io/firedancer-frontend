import { atom, useAtomValue, useSetAtom } from "jotai";
import {
  getHasQueryedAtom,
  getIsFutureSlotAtom,
  getSlotResponseAtom,
  hasQueryedAtom,
  setHasQueryedAtom,
} from "../atoms";
import { useMount } from "react-use";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useWebSocketSend } from "../api/ws/utils";

const checkQueryAtom = atom(
  null,
  (get, set, slot: number, callback: () => void) => {
    if (get(hasQueryedAtom)[slot]) return;

    set(setHasQueryedAtom, slot);
    callback();
  }
);

export default function useSlotQuery(
  slot?: number,
  options?: { requiresTimers?: boolean; requiresComputeUnits?: boolean }
) {
  const wsSend = useWebSocketSend();

  const slotResponse = useAtomValue(
    useMemo(() => getSlotResponseAtom(slot), [slot])
  );
  const hasQueryed = useAtomValue(
    useMemo(() => getHasQueryedAtom(slot), [slot])
  );
  const checkQuery = useSetAtom(checkQueryAtom);

  const isFutureSlot = useAtomValue(
    useMemo(() => getIsFutureSlotAtom(slot), [slot])
  );

  const query = useCallback(() => {
    if (!slot) return;

    const queryTimers = options?.requiresTimers && !slotResponse?.tile_timers;
    const queryComputeUnits =
      options?.requiresComputeUnits && !slotResponse?.compute_units;

    if (isFutureSlot) return;

    if (!slotResponse || queryTimers || queryComputeUnits) {
      checkQuery(slot, () =>
        wsSend({
          topic: "slot",
          key: "query",
          id: 1,
          params: {
            slot: slot,
          },
        })
      );
    }
  }, [checkQuery, isFutureSlot, options, slot, slotResponse, wsSend]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(query, [slot]);

  const [waitingForData, setWaitingForData] = useState(true);
  useMount(() => {
    setTimeout(() => setWaitingForData(false), 3_000);
  });

  const hasWaitedForData = hasQueryed && !waitingForData;

  return { slotResponse, hasWaitedForData };
}
