import type { TimelineTxnMeta } from "../../../../api/types";
import { createPendingRequests } from "../../tiles/requests";
import { useTimelineServerMessage } from "../../utils";

export const txnMetaRequests = createPendingRequests<TimelineTxnMeta>();

export function useTxnMetaResponses(): void {
  useTimelineServerMessage(
    "query_txn_meta",
    (m) => txnMetaRequests.resolve(m.id, { value: m.value }),
    (e) => txnMetaRequests.resolve(e.id, { errorCode: e.error.code }),
  );
}
