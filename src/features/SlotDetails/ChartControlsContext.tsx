import { createContext } from "react";

export type ChartControlsCleanup = () => void;

export const INCLUSION_FILTER_OPTIONS = ["All", "Yes", "No"] as const;
export type InclusionFilterOptions = (typeof INCLUSION_FILTER_OPTIONS)[number];

export type UpdateBundleCallback = (value: InclusionFilterOptions) => void;

export type ChartControls = {
  updateBundleFilter: UpdateBundleCallback;
  registerChartControl: (update: UpdateBundleCallback) => ChartControlsCleanup;
};

export const DEFAULT_CHART_CONTROLS_CONTEXT: ChartControls = {
  updateBundleFilter: () => {},
  registerChartControl: () => () => {},
};

export const ChartControlsContext = createContext<ChartControls>(
  DEFAULT_CHART_CONTROLS_CONTEXT,
);
