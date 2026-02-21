import { useCallback, useMemo, useState, type PropsWithChildren } from "react";
import {
  ChartControlsContext,
  type InclusionFilterOptions,
  type Search,
  type FocusBankCallback,
  type ChartControlUtils,
  type ChartControlProps,
} from "./ChartControlsContext";

export default function ChartControlsProvider({ children }: PropsWithChildren) {
  const [chartControlUtils, setChartControlUtils] = useState<ChartControlUtils>(
    {},
  );

  const updateBundleFilter = useCallback(
    (value: InclusionFilterOptions) => {
      chartControlUtils["Bundle"]?.(value);
    },
    [chartControlUtils],
  );

  const updateSearch = useCallback(
    (value: Search) => {
      chartControlUtils["Search"]?.(value);
    },
    [chartControlUtils],
  );

  const [focusBank, setFocusBankCallback] =
    useState<(bankIdx?: number) => void>();

  const registerChartControl = useCallback(
    ({ chartControl, handleExternalValueUpdate }: ChartControlProps) => {
      setChartControlUtils((prev) => {
        return { ...prev, [chartControl]: handleExternalValueUpdate };
      });
      return () => {
        setChartControlUtils((prev) => {
          const next = { ...prev };
          delete next[chartControl];
          return next;
        });
      };
    },
    [],
  );

  const registerChart = useCallback((callback: FocusBankCallback) => {
    setFocusBankCallback(() => callback);
    return () => {
      setFocusBankCallback(undefined);
    };
  }, []);

  const value = useMemo(() => {
    return {
      updateBundleFilter,
      updateSearch,
      focusBank,
      registerChartControl,
      registerChart,
    };
  }, [
    updateBundleFilter,
    updateSearch,
    focusBank,
    registerChartControl,
    registerChart,
  ]);

  return (
    <ChartControlsContext.Provider value={value}>
      {children}
    </ChartControlsContext.Provider>
  );
}
