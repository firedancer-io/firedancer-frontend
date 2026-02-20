import { createContext } from "react";
import type { SearchMode } from "../Overview/SlotPerformance/TransactionBarsCard/consts";
import type { SlotTransactions } from "../../api/types";

export const INCLUSION_FILTER_OPTIONS = ["All", "Yes", "No"] as const;
export type InclusionFilterOptions = (typeof INCLUSION_FILTER_OPTIONS)[number];

export type Search = { mode: SearchMode; text: string };

export type FocusBankCallback = (bankIdx?: number) => void;
export type UpdateBundleCallback = (value: InclusionFilterOptions) => void;
export type UpdateSeachCallback = (value: Search) => void;

export type ChartControlProps =
  | {
      chartControl: "Bundle";
      handleExternalValueUpdate: UpdateBundleCallback;
    }
  | {
      chartControl: "Search";
      handleExternalValueUpdate: UpdateSeachCallback;
    };

export type ChartControls = {
  hasData: boolean;
  transactions: SlotTransactions;
  maxTs: number;
  updateBundleFilter: UpdateBundleCallback;
  updateSearch: UpdateSeachCallback;
  focusBank?: FocusBankCallback;
  registerChartControl: (props: ChartControlProps) => void;
  registerChart: (focusBank: FocusBankCallback) => void;
};

export const DEFAULT_CHART_CONTROLS_CONTEXT: ChartControls = {
  hasData: false,
  transactions: {
    start_timestamp_nanos: 0n,
    target_end_timestamp_nanos: 0n,
    txn_mb_start_timestamps_nanos: [],
    txn_mb_end_timestamps_nanos: [],
    txn_compute_units_requested: [],
    txn_compute_units_consumed: [],
    txn_transaction_fee: [],
    txn_priority_fee: [],
    txn_tips: [],
    txn_error_code: [],
    txn_from_bundle: [],
    txn_is_simple_vote: [],
    txn_bank_idx: [],
    txn_preload_end_timestamps_nanos: [],
    txn_start_timestamps_nanos: [],
    txn_load_end_timestamps_nanos: [],
    txn_end_timestamps_nanos: [],
    txn_arrival_timestamps_nanos: [],
    txn_microblock_id: [],
    txn_landed: [],
    txn_signature: [],
    txn_source_ipv4: [],
    txn_source_tpu: [],
  },
  maxTs: 0,
  updateBundleFilter: () => {},
  updateSearch: () => {},
  registerChartControl: () => {},
  registerChart: () => {},
};

export const ChartControlsContext = createContext<ChartControls>(
  DEFAULT_CHART_CONTROLS_CONTEXT,
);
