import { createContext } from "react";

export type ChartControlsCleanup = () => void;

export const INCLUSION_FILTER_OPTIONS = ["All", "Yes", "No"] as const;
export type InclusionFilterOption = (typeof INCLUSION_FILTER_OPTIONS)[number];

export const enum SearchMode {
  TxnSignature = "Txn Sig",
  Error = "Error",
  Income = "Income",
  Ip = "IPv4",
  Tpu = "TPU",
}
export type Search = { mode: SearchMode; text: string };

export type ChartControlMap = {
  bundle: InclusionFilterOption;
  focusBank: number | undefined;
  search: Search;
};

export type ChartControlKey = keyof ChartControlMap;
export type ChartControlCallback<K extends ChartControlKey> = (
  value: ChartControlMap[K],
) => void;

export const BUNDLE_CONTROL_KEY = "bundle" satisfies ChartControlKey;
export const FOCUS_BANK_KEY = "focusBank" satisfies ChartControlKey;
export const SEARCH_KEY = "search" satisfies ChartControlKey;

export type ChartControls = {
  triggerControl: <K extends ChartControlKey>(
    key: K,
    value: ChartControlMap[K],
  ) => void;
  registerControl: <K extends ChartControlKey>(
    key: K,
    callback: ChartControlCallback<K>,
  ) => ChartControlsCleanup;
};

export const DEFAULT_CHART_CONTROLS_CONTEXT: ChartControls = {
  triggerControl: () => {},
  registerControl: () => () => {},
};

export const ChartControlsContext = createContext<ChartControls>(
  DEFAULT_CHART_CONTROLS_CONTEXT,
);
