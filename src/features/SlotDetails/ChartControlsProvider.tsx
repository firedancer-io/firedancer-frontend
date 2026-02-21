import { useCallback, useMemo, useState, type PropsWithChildren } from "react";
import {
  ChartControlsContext,
  type ChartControls,
  type InclusionFilterOptions,
  type UpdateBundleCallback,
} from "./ChartControlsContext";

export default function ChartControlsProvider({ children }: PropsWithChildren) {
  const [updateBundleCallback, setUpdateBundleCallback] =
    useState<UpdateBundleCallback>();

  const updateBundleFilter: UpdateBundleCallback = useCallback(
    (value: InclusionFilterOptions) => {
      updateBundleCallback?.(value);
    },
    [updateBundleCallback],
  );

  const registerChartControl = useCallback((callback: UpdateBundleCallback) => {
    setUpdateBundleCallback(() => callback);
    return () => setUpdateBundleCallback(undefined);
  }, []);

  const value: ChartControls = useMemo(() => {
    return {
      updateBundleFilter,
      registerChartControl,
    };
  }, [updateBundleFilter, registerChartControl]);

  return (
    <ChartControlsContext.Provider value={value}>
      {children}
    </ChartControlsContext.Provider>
  );
}
