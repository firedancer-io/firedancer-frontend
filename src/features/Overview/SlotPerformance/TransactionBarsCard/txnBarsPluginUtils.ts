import type { MutableRefObject } from "react";
import type { SlotTransactions } from "../../../../api/types";
import { getTxnIncome } from "../../../../utils";

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

  const cus = transactions.txn_compute_units_consumed[txnIdx];
  if (!cus) return 0;

  return Number(getTxnIncome(transactions, txnIdx)) / cus;
}

export function getCuIncomeRankings(transactions: SlotTransactions) {
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
    rankings: sortedIncome.reduce<Map<number, number>>(
      (txnIdxRank, income, rank) => {
        const txnIdxs = incomeToTxnIds[income];
        for (const txnIdx of txnIdxs) {
          // Rank starts at 1 instead of 0
          txnIdxRank.set(txnIdx, rank + 1);
        }
        return txnIdxRank;
      },
      new Map(),
    ),
    totalRanks: sortedIncome.length,
  };
}

export function getCuIncomeRankingRatios(
  transactionsRef: MutableRefObject<SlotTransactions | null | undefined>,
): Map<number, number> {
  if (!transactionsRef.current) return new Map();

  const { rankings, totalRanks } = getCuIncomeRankings(transactionsRef.current);

  for (const [txnIdx, rank] of rankings) {
    rankings.set(txnIdx, (totalRanks - rank + 1) / totalRanks);
  }
  return rankings;
}
