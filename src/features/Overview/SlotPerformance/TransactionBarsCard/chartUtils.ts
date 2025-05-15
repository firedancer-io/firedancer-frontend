import { SlotTransactions } from "../../../../api/types";
import uPlot from "uplot";

export function getSlotStateTs(transactions: SlotTransactions, txnIdx: number) {
  if (txnIdx < 0) return;
  if (transactions.txn_mb_start_timestamps_nanos[txnIdx] === undefined) return;

  const startTs = transactions.start_timestamp_nanos;
  const mbStartTs = Number(
    transactions.txn_mb_start_timestamps_nanos[txnIdx] - startTs,
  );
  const txnStartTs = Number(
    transactions.txn_start_timestamps_nanos[txnIdx] - startTs,
  );
  const loadEndTs = Number(
    transactions.txn_load_end_timestamps_nanos[txnIdx] - startTs,
  );
  const txnEndTs = Number(
    transactions.txn_end_timestamps_nanos[txnIdx] - startTs,
  );
  const mbEndTs = Number(
    transactions.txn_mb_end_timestamps_nanos[txnIdx] - startTs,
  );

  return { mbStartTs, txnStartTs, loadEndTs, txnEndTs, mbEndTs };
}

export function getChartData(
  transactions: SlotTransactions,
  bankIdx: number,
  maxTs: number,
  filterFunctions?: ((
    transactions: SlotTransactions,
    txnIdx: number,
  ) => boolean)[],
) {
  const tsToTxnIdx: Record<number, number | null> = {};

  for (let txnIdx = 0; txnIdx < transactions.txn_bank_idx.length; txnIdx++) {
    if (transactions.txn_bank_idx[txnIdx] !== bankIdx) continue;
    const stateTs = getSlotStateTs(transactions, txnIdx);
    if (!stateTs) continue;

    const { mbStartTs, txnStartTs, loadEndTs, txnEndTs, mbEndTs } = stateTs;
    if (tsToTxnIdx[mbStartTs] != null) {
      if (
        transactions.txn_start_timestamps_nanos[txnIdx] <
        transactions.txn_start_timestamps_nanos[tsToTxnIdx[mbStartTs]]
      ) {
        tsToTxnIdx[mbStartTs] = txnIdx;
      }
    } else {
      tsToTxnIdx[mbStartTs] = txnIdx;
    }
    tsToTxnIdx[txnStartTs] = txnIdx;
    tsToTxnIdx[loadEndTs] = txnIdx;
    tsToTxnIdx[txnEndTs] = txnIdx;
    tsToTxnIdx[mbEndTs] = null;
  }

  const sortedTs = Object.keys(tsToTxnIdx)
    .map((ts) => +ts)
    .sort((a, b) => a - b);

  const res: (number | null | undefined)[][] = [[0], [null], [null]];

  for (let i = 0; i < sortedTs.length; i++) {
    const ts = sortedTs[i];
    const txnIdx = tsToTxnIdx[ts];

    res[0].push(ts);

    if (
      txnIdx != null &&
      filterFunctions?.length &&
      filterFunctions.some((func) => !func(transactions, txnIdx))
    ) {
      res[1].push(null);
      res[2].push(null);
    } else {
      res[1].push(txnIdx);
      if (txnIdx === null) {
        res[2].push(null);
      } else {
        const mbId = transactions.txn_microblock_id[txnIdx];
        if (
          res[2][res[2].length - 1] === mbId ||
          res[2][res[2].length - 1] === undefined
        ) {
          res[2].push(undefined);
        } else {
          res[2].push(mbId);
        }
      }
    }
  }

  res[0].push(maxTs);
  for (let i = 1; i < res.length; i++) {
    res[i].push(null);
  }

  return res as uPlot.AlignedData;
}
