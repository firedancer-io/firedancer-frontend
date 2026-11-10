import { useCallback, useLayoutEffect, useRef } from "react";
import { getDefaultStore, useSetAtom } from "jotai";
import { useThrottledCallbackIfVisible } from "../../api/useDebounceIfVisible";
import { isConnectedAtom } from "../../api/ws/atoms";
import { reserveNextQueryIdAtom, type TimelineQueryKey } from "./atoms";
import { getRootSlotNs } from "./utils";
import type { NsTsRange } from "../WebGl/webglUtils";

const store = getDefaultStore();

interface Options<TReq> {
  queryKey: TimelineQueryKey;
  throttleMs: number;
  buildQuery: (
    req: TReq,
    prevReq: TReq | undefined,
  ) => {
    worldRangeNs: NsTsRange;
    shouldResetStates: boolean;
    sendQuery: (queryId: number, rangeNs: NsTsRange) => void;
  };
}

/**
 * one query at a time, retry on reconnect
 */
export default function useIncrementalQuery<TReq>({
  queryKey,
  throttleMs,
  buildQuery,
}: Options<TReq>) {
  // data before this ts is final; query from here on
  const lastStableNsRef = useRef<bigint | undefined>();

  const pendingRef = useRef<{
    queryId: number;
    stableNs: bigint | undefined;
  } | null>(null);
  // last request we actually sent, re-sent on reconnect if it was in flight
  const lastReqRef = useRef<TReq | undefined>(undefined);
  // latest caller request not yet sent: waiting in the throttle, queued behind
  // the in-flight query, or held while disconnected
  const unsentReqRef = useRef<TReq | undefined>(undefined);

  const reserveNextQueryId = useSetAtom(reserveNextQueryIdAtom);

  const throttledSendQuery = useThrottledCallbackIfVisible(
    (req: TReq) => {
      // stays in unsentReqRef for reconnect
      if (!store.get(isConnectedAtom)) return;

      const prevReq = lastReqRef.current;
      const query = buildQuery(req, prevReq);

      if (query.shouldResetStates) {
        // re-query from start of world
        pendingRef.current = null;
        lastStableNsRef.current = undefined;
      } else if (pendingRef.current != null) {
        // stays in unsentReqRef until the in-flight query completes
        return;
      }

      const [worldStartNs, worldEndNs] = query.worldRangeNs;

      const startNs = lastStableNsRef.current ?? worldStartNs;
      if (startNs >= worldEndNs) {
        // invalid query, nothing to fetch
        if (unsentReqRef.current === req) unsentReqRef.current = undefined;
        return;
      }

      // known stable data boundary for this request's response
      const rootSlotNs = getRootSlotNs();
      const stableNs =
        rootSlotNs == null
          ? lastStableNsRef.current
          : rootSlotNs <= worldEndNs
            ? rootSlotNs
            : worldEndNs;

      const queryId = reserveNextQueryId(queryKey);
      query.sendQuery(queryId, [startNs, worldEndNs]);
      lastReqRef.current = req;
      if (unsentReqRef.current === req) unsentReqRef.current = undefined;
      pendingRef.current = { queryId, stableNs };
    },
    throttleMs,
    { leading: true, trailing: true },
  );

  const sendQuery = useCallback(
    (req: TReq) => {
      unsentReqRef.current = req;
      throttledSendQuery(req);
    },
    [throttledSendQuery],
  );

  function markQueryComplete(queryId: number, onResponseAccepted: () => void) {
    const pending = pendingRef.current;
    if (pending?.queryId !== queryId) return;

    lastStableNsRef.current = pending.stableNs;
    pendingRef.current = null;
    onResponseAccepted();

    const unsent = unsentReqRef.current;
    if (unsent != null) sendQuery(unsent);
  }

  // on reconnect replay the unsent request, else the last request if it was in
  // flight
  useLayoutEffect(() => {
    const unsub = store.sub(isConnectedAtom, () => {
      if (store.get(isConnectedAtom)) {
        const req =
          unsentReqRef.current ??
          (pendingRef.current != null ? lastReqRef.current : undefined);
        pendingRef.current = null;
        if (req == null) return;

        sendQuery(req);
      } else {
        // drop the throttled call; the request stays in unsentReqRef
        throttledSendQuery.cancel();
      }
    });
    return () => {
      unsub();
      throttledSendQuery.cancel();
    };
  }, [sendQuery, throttledSendQuery]);

  return [sendQuery, markQueryComplete] as const;
}
