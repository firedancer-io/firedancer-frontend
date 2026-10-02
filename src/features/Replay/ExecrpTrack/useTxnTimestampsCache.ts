import { useAtomValue } from "jotai";
import { useEffect } from "react";
import { useWebSocketSend } from "../../../api/ws/utils";
import { referenceNsAtom } from "../atoms";
import { useTimelineServerMessage } from "../utils";
import {
  txnTimestampsCaches,
  txnTimestampsRequests,
} from "./txnTimestampsCache";

export function useTxnTimestampsCache(): void {
  const wsSend = useWebSocketSend();
  const referenceNs = useAtomValue(referenceNsAtom);

  useTimelineServerMessage(
    "query_txn_timestamps",
    (m) => txnTimestampsRequests.resolve(m.id, { value: m.value }),
    (e) => txnTimestampsRequests.resolve(e.id, { errorCode: e.error.code }),
  );

  useEffect(() => {
    const unsubs = Object.values(txnTimestampsCaches).map((cache) =>
      cache.init(wsSend),
    );
    return () => {
      for (const unsub of unsubs) unsub();
      for (const cache of Object.values(txnTimestampsCaches)) cache.reset();
    };
  }, [wsSend, referenceNs]);
}
