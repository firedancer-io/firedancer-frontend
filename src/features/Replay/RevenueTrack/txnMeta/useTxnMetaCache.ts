import { useAtomValue } from "jotai";
import { useEffect } from "react";
import { useWebSocketSend } from "../../../../api/ws/utils";
import { referenceNsAtom } from "../../atoms";
import { useTimelineServerMessage } from "../../utils";
import { txnMetaCache, txnMetaRequests } from "./txnMetaCache";

export function useTxnMetaCache(): void {
  const wsSend = useWebSocketSend();
  const referenceNs = useAtomValue(referenceNsAtom);

  useTimelineServerMessage(
    "query_txn_meta",
    (m) => txnMetaRequests.resolve(m.id, { value: m.value }),
    (e) => txnMetaRequests.resolve(e.id, { errorCode: e.error.code }),
  );

  useEffect(() => {
    const unsub = txnMetaCache.init(wsSend);
    return () => {
      unsub();
      txnMetaCache.reset();
    };
  }, [wsSend, referenceNs]);
}
