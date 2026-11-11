import { useEffect } from "react";
import { useTimelineServerMessage } from "../../utils";
import { txnMetaCache, txnMetaRequests } from "./txnMetaCache";

export function useTxnMetaCache(): void {
  useTimelineServerMessage(
    "query_txn_meta",
    (m) => txnMetaRequests.resolve(m.id, { value: m.value }),
    (e) => txnMetaRequests.resolve(e.id, { errorCode: e.error.code }),
  );

  useEffect(() => {
    const unsub = txnMetaCache.init();
    return () => {
      unsub();
      txnMetaCache.reset();
    };
  }, []);
}
