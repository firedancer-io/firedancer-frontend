import { createContext } from "react";

export type ChartControlsCleanup = () => void;

export const INCLUSION_FILTER_OPTIONS = ["All", "Yes", "No"] as const;
export type InclusionFilterOptions = (typeof INCLUSION_FILTER_OPTIONS)[number];

export type ChartControlMap = {
  bundle: InclusionFilterOptions;
};

export type ChartControlKey = keyof ChartControlMap;
export type ChartControlCallback<K extends ChartControlKey> = (
  value: ChartControlMap[K],
) => void;

export const BUNDLE_CONTROL_KEY = "bundle" satisfies ChartControlKey;

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
