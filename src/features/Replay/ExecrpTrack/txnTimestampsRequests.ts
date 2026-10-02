import type { TimelineTxnTimestamps } from "../../../api/types";
import { createPendingRequests } from "../tiles/requests";
import { useTimelineServerMessage } from "../utils";

export const txnTimestampsRequests =
  createPendingRequests<TimelineTxnTimestamps>();

export function useTxnTimestampsResponses(): void {
  useTimelineServerMessage(
    "query_txn_timestamps",
    (m) => txnTimestampsRequests.resolve(m.id, { value: m.value }),
    (e) => txnTimestampsRequests.resolve(e.id, { errorCode: e.error.code }),
  );
}
