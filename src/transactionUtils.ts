import { max } from "lodash";
import { SlotTransactions } from "./api/types";

export const chartBufferMs = 2_000_000;

export function getMaxTsWithBuffer(transactions: SlotTransactions) {
  if (!transactions) return 0;

  const txnTs = transactions.txn_mb_end_timestamps_nanos.map((ts) =>
    Number(ts - transactions.start_timestamp_nanos),
  );
  txnTs.push(
    Number(
      transactions.target_end_timestamp_nanos -
        transactions.start_timestamp_nanos,
    ),
  );
  return (max(txnTs) ?? 0) + chartBufferMs;
}
