import type uPlot from "uplot";
import type { MutableRefObject } from "react";
import type { SlotTransactions } from "../../../../api/types";
import { getDefaultStore } from "jotai";
import { chartFiltersAtom } from "./atoms";
import { TxnState } from "./consts";

const store = getDefaultStore();

export function getTxnState(
  ts: number,
  txns: SlotTransactions,
  txnIdx: number,
) {
  if (
    ts <
    Number(
      txns.txn_preload_end_timestamps_nanos[txnIdx] -
        txns.start_timestamp_nanos,
    )
  ) {
    return TxnState.PRELOADING;
  }

  if (
    ts <
    Number(txns.txn_start_timestamps_nanos[txnIdx] - txns.start_timestamp_nanos)
  ) {
    return TxnState.VALIDATE;
  }

  if (
    ts <
    Number(
      txns.txn_load_end_timestamps_nanos[txnIdx] - txns.start_timestamp_nanos,
    )
  ) {
    return TxnState.LOADING;
  }

  if (
    ts <
    Number(txns.txn_end_timestamps_nanos[txnIdx] - txns.start_timestamp_nanos)
  ) {
    return TxnState.EXECUTE;
  }

  return TxnState.POST_EXECUTE;
}

export function getChartTxnState(
  chartData: uPlot.AlignedData | undefined,
  dataIdx: number,
  txns: SlotTransactions | undefined | null,
  txnIdx: number,
) {
  if (!chartData || !txns) return TxnState.DEFAULT;

  const ts = chartData[0][dataIdx];

  return getTxnState(ts, txns, txnIdx);
}

export const timeSidx = 0;
export const txnIdxSidx = 1;
export const microblockSidx = 2;

export function isTimeSeries(sidx: number) {
  return sidx === timeSidx;
}

export function isTxnIdxSeries(sidx: number) {
  return sidx === txnIdxSidx;
}

export function isMicroblockSeries(sidx: number) {
  return sidx === microblockSidx;
}

export function isAdditionalSeries(sidx: number) {
  return sidx > microblockSidx;
}

export function bigIntRatio(
  numerator: bigint,
  denominator: bigint,
  precision = 2,
) {
  const scale = 10n ** BigInt(precision);
  const scaledNumerator = numerator * scale;
  const ratio = scaledNumerator / denominator;
  const formattedRatio = Number(ratio) / Number(scale);
  return formattedRatio;
}

function getMax<T extends bigint | number>(
  getSearchArr: (transactions: SlotTransactions) => T[],
  initValue: T,
) {
  return function (
    transactionsRef: MutableRefObject<SlotTransactions | null | undefined>,
  ) {
    if (!transactionsRef.current) return initValue;

    const searchArr = getSearchArr(transactionsRef.current);

    // const filterFunctions = Object.values(store.get(chartFiltersAtom));

    return searchArr.reduce((total, val, txnIdx) => {
      // if (
      //   filterFunctions.some(
      //     (func) =>
      //       transactionsRef.current && !func(transactionsRef.current, txnIdx),
      //   )
      // ) {
      //   return total;
      // }

      if (val > total) return val;
      return total;
    }, initValue);
  };
}

export const getMaxFees = getMax(
  (transactions) =>
    transactions.txn_priority_fee.map(
      (prioFee, i) => prioFee + transactions.txn_transaction_fee[i],
    ),
  0n,
);
export const getMaxTips = getMax((transactions) => transactions.txn_tips, 0n);
export const getMaxCuConsumed = getMax(
  (transactions) => transactions.txn_compute_units_consumed,
  0,
);
export const getMaxCuRequested = getMax(
  (transactions) => transactions.txn_compute_units_requested,
  0,
);

export function calcTxnIncome(transactions: SlotTransactions, txnIdx: number) {
  if (!transactions.txn_landed[txnIdx]) return 0;

  const feesAndTips = Number(
    transactions.txn_priority_fee[txnIdx] +
      transactions.txn_transaction_fee[txnIdx] +
      transactions.txn_tips[txnIdx],
  );

  const cus = transactions.txn_compute_units_consumed[txnIdx];
  if (!cus) return 0;

  return feesAndTips / cus;
}

export function getCuIncomeRankings(
  transactions: SlotTransactions,
  filters: ((transactions: SlotTransactions, txnIdx: number) => boolean)[],
) {
  const incomeToTxnIds = transactions.txn_priority_fee.reduce<
    Record<string, number[]>
  >((incomeToTxnIds, _, txnIdx) => {
    if (!transactions) return incomeToTxnIds;

    // if (filters.some((func) => !func(transactions, txnIdx)))
    //   return incomeToTxnIds;

    const income = calcTxnIncome(transactions, txnIdx);

    incomeToTxnIds[income] ??= [];
    incomeToTxnIds[income].push(txnIdx);

    return incomeToTxnIds;
  }, {});

  const sortedIncome = Object.keys(incomeToTxnIds).sort(
    (a, b) => Number(b) - Number(a),
  );

  return {
    rankings: sortedIncome.reduce<Record<string, number>>(
      (txnIdRank, income, rank) => {
        const txnIds = incomeToTxnIds[income];
        for (const txnId of txnIds) {
          // Rank starts at 1 instead of 0
          txnIdRank[txnId] = rank + 1;
        }
        return txnIdRank;
      },
      {},
    ),
    totalRanks: sortedIncome.length,
  };
}

export function getCuIncomeRankingRatios(
  transactionsRef: MutableRefObject<SlotTransactions | null | undefined>,
) {
  if (!transactionsRef.current) return {};

  const filterFunctions = Object.values(store.get(chartFiltersAtom));
  const { rankings, totalRanks } = getCuIncomeRankings(
    transactionsRef.current,
    filterFunctions,
  );

  const keys = Object.keys(rankings);

  for (const key of keys) {
    rankings[key] = (totalRanks - rankings[key] + 1) / totalRanks;
  }

  return rankings;
}
