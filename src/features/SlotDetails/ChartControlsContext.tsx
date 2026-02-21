import { createContext } from "react";
import type { SearchMode } from "../Overview/SlotPerformance/TransactionBarsCard/consts";

export const INCLUSION_FILTER_OPTIONS = ["All", "Yes", "No"] as const;
export type InclusionFilterOptions = (typeof INCLUSION_FILTER_OPTIONS)[number];

export type Search = { mode: SearchMode; text: string };

export type FocusBankCallback = (bankIdx?: number) => void;
export type UpdateBundleCallback = (value: InclusionFilterOptions) => void;
export type UpdateSearchCallback = (value: Search) => void;

export type ChartControlUtils = {
  Bundle?: UpdateBundleCallback;
  Search?: UpdateSearchCallback;
};

export type ChartControlProps =
  | {
      chartControl: "Bundle";
      handleExternalValueUpdate: UpdateBundleCallback;
    }
  | {
      chartControl: "Search";
      handleExternalValueUpdate: UpdateSearchCallback;
    };

export type ChartControls = {
  updateBundleFilter: UpdateBundleCallback;
  updateSearch: UpdateSearchCallback;
  focusBank?: FocusBankCallback;
  registerChartControl: (props: ChartControlProps) => () => void;
  registerChart: (focusBank: FocusBankCallback) => () => void;
};

export const DEFAULT_CHART_CONTROLS_CONTEXT: ChartControls = {
  updateBundleFilter: () => {},
  updateSearch: () => {},
  registerChartControl: () => () => {},
  registerChart: () => () => {},
};

export const ChartControlsContext = createContext<ChartControls>(
  DEFAULT_CHART_CONTROLS_CONTEXT,
);
