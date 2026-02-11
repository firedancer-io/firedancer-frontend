import { createContext } from "react";
import { SearchMode } from "../Overview/SlotPerformance/TransactionBarsCard/consts";
import type { SlotTransactions } from "../../api/types";

export type InclusionFilterOptions = "All" | "Yes" | "No";

export type ChartControls = {
  hasData: boolean;
  transactions: SlotTransactions;
  maxTs: number;
  bundleFilter: InclusionFilterOptions;
  updateBundleFilter: (
    value: ChartControls["bundleFilter"],
    scroll?: boolean,
    externalTrigger?: boolean,
  ) => void;
  search: { mode: SearchMode; text: string };
  updateSearch: (
    value: { mode?: SearchMode; text?: string },
    externalTrigger?: boolean,
  ) => void;
  focusTxn: (txnIdx: number) => void;
  resetTxnFocus: () => void;
  focusedBankIdx?: number;
  triggeredChartControl?: "Bundle" | "Search";
  setTriggeredChartControl: (
    value: ChartControls["triggeredChartControl"],
  ) => void;
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
  bundleFilter: "All",
  updateBundleFilter: () => {},
  search: { mode: SearchMode.TxnSignature, text: "" },
  updateSearch: () => {},
  focusTxn: () => {},
  resetTxnFocus: () => {},
  setTriggeredChartControl: () => {},
};

export const ChartControlsContext = createContext<ChartControls>(
  DEFAULT_CHART_CONTROLS_CONTEXT,
);
