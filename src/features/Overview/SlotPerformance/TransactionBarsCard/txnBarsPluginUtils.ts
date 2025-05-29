import uPlot from "uplot";
import { debounce } from "lodash";
import { MutableRefObject } from "react";
import { SlotTransactions } from "../../../../api/types";
import { ZoomRange } from "../ComputeUnitsCard/types";
import { getDefaultStore } from "jotai";
import { zoomRangeAtom } from "../ComputeUnitsCard/atoms";
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
    Number(txns.txn_start_timestamps_nanos[txnIdx] - txns.start_timestamp_nanos)
  ) {
    return TxnState.PRELOADING;
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

const _setZoomRange = (zoomRange: ZoomRange) =>
  store.set(zoomRangeAtom, zoomRange);
export const syncZoom = debounce(_setZoomRange, 50);

function getMax<T extends bigint | number>(
  getSearchArr: (transactions: SlotTransactions) => T[],
  initValue: T,
) {
  return function (
    transactionsRef: MutableRefObject<SlotTransactions | null | undefined>,
  ) {
    if (!transactionsRef.current) return initValue;

    const searchArr = getSearchArr(transactionsRef.current);

    const filterFunctions = Object.values(store.get(chartFiltersAtom));

    return searchArr.reduce((total, val, txnIdx) => {
      if (
        filterFunctions.some(
          (func) =>
            transactionsRef.current && !func(transactionsRef.current, txnIdx),
        )
      )
        return total;

      if (val > total) return val;
      return total;
    }, initValue);
  };
}

export const getMaxFees = getMax(
  (transactions) => transactions.txn_priority_fee,
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

export function getMaxCuIncome(
  transactionsRef: MutableRefObject<SlotTransactions | null | undefined>,
) {
  if (!transactionsRef.current) return {};

  const filterFunctions = Object.values(store.get(chartFiltersAtom));

  const cuIncome = transactionsRef.current.txn_priority_fee.reduce<
    { txnIdx: number; income: number }[]
  >((incomeTxnId, _, txnIdx) => {
    if (
      filterFunctions.some(
        (func) =>
          transactionsRef.current && !func(transactionsRef.current, txnIdx),
      )
    )
      return incomeTxnId;

    if (!transactionsRef.current?.txn_compute_units_consumed[txnIdx])
      return incomeTxnId;

    if (
      !(
        (transactionsRef.current?.txn_priority_fee[txnIdx] ?? 0n) +
        (transactionsRef.current?.txn_tips[txnIdx] ?? 0n)
      )
    )
      return incomeTxnId;

    const income =
      Number(
        (transactionsRef.current?.txn_priority_fee[txnIdx] ?? 0n) +
          (transactionsRef.current?.txn_tips[txnIdx] ?? 0n),
      ) / (transactionsRef.current?.txn_compute_units_consumed[txnIdx] ?? 0);

    incomeTxnId.push({
      txnIdx,
      income,
    });

    return incomeTxnId;
  }, []);

  cuIncome.sort((a, b) => a.income - b.income);

  return cuIncome.reduce<Record<number, number>>(
    (incomeMap, { txnIdx }, rank) => {
      incomeMap[txnIdx] = rank / cuIncome.length;
      return incomeMap;
    },
    {},
  );
}
