export const numQuickSearchSlots = 3;
export const defaultIncomeMaxValue = 100_000_000;

export interface Durations {
  preLoading: number;
  validating: number;
  loading: number;
  execute: number;
  postExecute: number;
  total: number;
}

export interface CuStats {
  vote: number;
  bundle: number;
  other: number;
}

export interface FeeStats {
  tips: number;
  fees: number;
  maxValue: number;
}

export interface TxnBundleStats {
  totalCount: number;
  order: number;
  bundleTxnIdxs: number[];
}
