import { atom } from "jotai";
import uPlot, { AlignedData } from "uplot";
import { SlotTransactions } from "../../../../api/types";
import { setBarCount } from "./txnBarsPlugin";
import { getChartData } from "./chartUtils";
import { FilterEnum } from "./consts";

const landedKey = "landed";
function landedFilter(transactions: SlotTransactions, txnIdx: number) {
  return transactions.txn_landed[txnIdx];
}

// indexed by bank id
export const baseChartDataAtom = atom<uPlot.AlignedData[]>([]);

export const defaultChartFilters = {};
// export const defaultChartFilters = { [landedKey]: landedFilter };

export const chartFiltersAtom = atom<
  Record<string, (transactions: SlotTransactions, txnIdx: number) => boolean>
>({ ...defaultChartFilters });

function getNewDataSeries({
  baseChartData,
  transactions,
  value,
  filterEnum,
  filterFunc,
  mergeMatchingPoints,
}: {
  baseChartData: AlignedData;
  transactions: SlotTransactions;
  value?: number;
  filterEnum: FilterEnum;
  filterFunc: (
    transactions: SlotTransactions,
    idx: number,
    value?: number,
  ) => boolean;
  mergeMatchingPoints?: boolean;
}) {
  const newData: (number | null | undefined)[] = [null];
  let lastTxnIdx: number | null = null;

  for (let i = 1; i < baseChartData[0].length - 1; i++) {
    const txnIdx = baseChartData[1][i];
    if (txnIdx != null) {
      // to not have the filter span all states of txn
      // if (txnIdx === u.data[1][i - 1]) {
      //   newData.push(null);
      //   continue;
      // }
      if (filterFunc(transactions, txnIdx, value)) {
        if (lastTxnIdx === txnIdx) {
          newData.push(undefined);
        } else {
          newData.push(filterEnum);
        }
      } else {
        newData.push(null);
      }

      lastTxnIdx = txnIdx;
    } else {
      newData.push(txnIdx);

      if (txnIdx === null) lastTxnIdx = null;
    }
  }
  newData.push(null);

  if (mergeMatchingPoints) {
    for (let i = 1; i < newData.length - 1; i++) {
      if (newData[i] === null && newData[i + 1] != null) {
        newData[i] = undefined;
      }
    }
  }

  return newData;
}

function filterChartDataAtom<T>(
  key: string,
  filterFunc: (
    transactions: SlotTransactions,
    idx: number,
    value: T,
  ) => boolean,
) {
  return atom(
    null,
    (
      get,
      set,
      u: uPlot,
      transactions: SlotTransactions,
      bankIdx: number,
      maxTs: number,
      value?: T,
    ) => {
      const filters = { ...get(chartFiltersAtom) };

      if (value === undefined) {
        delete filters[key];
      } else {
        filters[key] = (transactions, txnIdx) => {
          return filterFunc(transactions, txnIdx, value);
        };
      }

      const filteredData = getChartData(
        transactions,
        bankIdx,
        maxTs,
        Object.values(filters),
      );

      set(chartFiltersAtom, filters);

      u.data.splice(1, 1, filteredData[1]);
      u.data.splice(2, 1, filteredData[2]);
      u.setData(u.data, false);
      u.redraw(true, true);
    },
  );
}

function booleanFilterChartDataAtom(
  key: string,
  filterFunc: (transactions: SlotTransactions, idx: number) => boolean,
) {
  function booleanFilterFunc(
    transactions: SlotTransactions,
    idx: number,
    value: "All" | "Yes" | "No",
  ) {
    switch (value) {
      case "All":
        return true;
      case "Yes":
        return filterFunc(transactions, idx);
      case "No":
        return !filterFunc(transactions, idx);
    }
  }

  return filterChartDataAtom(key, booleanFilterFunc);
}

export const filterErrorDataAtom = booleanFilterChartDataAtom(
  "error",
  (transactions, idx) => transactions.txn_error_code[idx] !== 0,
);

export const filterBundleDataAtom = booleanFilterChartDataAtom(
  "bundle",
  (transactions, idx) => transactions.txn_from_bundle[idx],
);

export const filterLandedDataAtom = booleanFilterChartDataAtom(
  landedKey,
  landedFilter,
);

export const filterSimpleDataAtom = booleanFilterChartDataAtom(
  "simple",
  (transactions, idx) => transactions.txn_is_simple_vote[idx],
);

export const filterArrivalDataAtom = filterChartDataAtom(
  "arrival",
  (transactions, idx, { min, max }: { min?: number; max: number }) => {
    const txnArrival = Number(
      transactions.txn_arrival_timestamps_nanos[idx] -
        transactions.start_timestamp_nanos,
    );
    return (min === undefined || txnArrival >= min) && txnArrival <= max;
  },
);

let addSeriesFunc: Partial<
  Record<FilterEnum, (u: uPlot, bankIdx: number) => void>
> = {};
export function addPrevSeries(u: uPlot, bankIdx: number) {
  Object.values(addSeriesFunc).forEach((addSeries) => addSeries(u, bankIdx));
}

export function clearAddPrevSeries() {
  addSeriesFunc = {};
}

function addSeriesAtom(
  filterEnum: FilterEnum,
  filterFunc: (
    transactions: SlotTransactions,
    idx: number,
    value?: number,
  ) => boolean,
  mergeMatchingPoints?: boolean,
) {
  return atom(
    null,
    (
      get,
      set,
      _u: uPlot,
      transactions: SlotTransactions,
      _bankIdx: number,
      value?: number,
    ) => {
      function addSeries(u: uPlot, bankIdx: number) {
        const sidx = u.data.length;
        const baseChartData = get(baseChartDataAtom);

        const newData = getNewDataSeries({
          filterEnum,
          filterFunc,
          transactions,
          baseChartData: baseChartData[bankIdx],
          value,
          mergeMatchingPoints,
        });
        u.data.splice(sidx, 0, newData);
        u.addSeries({ ...u.series[1], label: `${filterEnum}` }, sidx);
        setBarCount(u.series.filter((s) => s.show).length - 1);
        u.setData(u.data, false);
        if (get(selectedBankAtom) === undefined) u.redraw(true, true);
      }

      addSeriesFunc[filterEnum] = addSeries;
      addSeries(_u, _bankIdx);
    },
  );
}

export const addFeeSeriesAtom = addSeriesAtom(
  FilterEnum.FEES,
  (transactions, idx) =>
    !!Number(
      transactions.txn_priority_fee[idx] +
        transactions.txn_transaction_fee[idx],
    ),
);

export const addMinTipsSeriesAtom = addSeriesAtom(
  FilterEnum.TIPS,
  (transactions, idx) => !!Number(transactions.txn_tips[idx]),
);

export const addMinCuSeriesAtom = addSeriesAtom(
  FilterEnum.CUS_CONSUMED,
  (transactions, idx) => !!transactions.txn_compute_units_consumed[idx],
);

export const addCuRequestedSeriesAtom = addSeriesAtom(
  FilterEnum.CUS_REQUESTED,
  (transactions, idx, value) => !!transactions.txn_compute_units_requested[idx],
);

export const addIncomeCuSeriesAtom = addSeriesAtom(
  FilterEnum.INCOME_CUS,
  (transactions, idx) => {
    return (
      transactions.txn_compute_units_consumed[idx] > 0 &&
      Number(
        transactions.txn_priority_fee[idx] +
          transactions.txn_transaction_fee[idx] +
          transactions.txn_tips[idx],
      ) /
        transactions.txn_compute_units_consumed[idx] >
        0
    );
  },
);

export const removeSeriesAtom = atom(
  null,
  (get, set, u: uPlot, filterEnum: FilterEnum) => {
    const sidx = u.series.findIndex((s) => s.label === `${filterEnum}`);
    if (sidx === -1) return;

    u.delSeries(sidx);
    u.data.splice(sidx, 1);
    setBarCount(u.data.length - 1);
    u.setData(u.data, false);
    if (get(selectedBankAtom) === undefined) u.redraw(true, true);

    delete addSeriesFunc[filterEnum];
  },
);

export const barCountAtom = atom(1);

export const selectedBankAtom = atom<number | undefined>();
