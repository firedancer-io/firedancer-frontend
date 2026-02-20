import { useCallback, useMemo, useRef, type PropsWithChildren } from "react";
import {
  ChartControlsContext,
  DEFAULT_CHART_CONTROLS_CONTEXT,
  type InclusionFilterOptions,
  type Search,
  type FocusBankCallback,
  type UpdateBundleCallback,
  type UpdateSeachCallback,
  type ChartControlProps,
} from "./ChartControlsContext";
import { useAtomValue } from "jotai";
import { selectedSlotAtom } from "../Overview/SlotPerformance/atoms";
import { useSlotQueryResponseTransactions } from "../../hooks/useSlotQuery";
import { getMaxTsWithBuffer } from "../../transactionUtils";

export default function ChartControlsProvider({ children }: PropsWithChildren) {
  const selectedSlot = useAtomValue(selectedSlotAtom);
  const selectedSlotTransactions =
    useSlotQueryResponseTransactions(selectedSlot).response?.transactions;
  const transactions =
    selectedSlotTransactions ?? DEFAULT_CHART_CONTROLS_CONTEXT.transactions;

  const bundleUpdaterRef = useRef<UpdateBundleCallback>();
  const searchUpdaterRef = useRef<UpdateSeachCallback>();
  const focusBankCallbackRef = useRef<FocusBankCallback>();

  const maxTs = useMemo(
    () => (transactions ? getMaxTsWithBuffer(transactions) : 0),
    [transactions],
  );

  const updateBundleFilter = useCallback((value: InclusionFilterOptions) => {
    bundleUpdaterRef.current?.(value);
  }, []);

  const updateSearch = useCallback((value: Search) => {
    searchUpdaterRef.current?.(value);
  }, []);

  const focusBank = useCallback((bankIdx?: number) => {
    focusBankCallbackRef.current?.(bankIdx);
  }, []);

  const registerChartControl = useCallback(
    ({ chartControl, handleExternalValueUpdate }: ChartControlProps) => {
      if (chartControl === "Bundle") {
        bundleUpdaterRef.current = handleExternalValueUpdate;
      } else if (chartControl === "Search") {
        searchUpdaterRef.current = handleExternalValueUpdate;
      }
    },
    [],
  );

  const registerChart = useCallback((focusBankCallback: FocusBankCallback) => {
    focusBankCallbackRef.current = focusBankCallback;
  }, []);

  const value = useMemo(() => {
    return selectedSlotTransactions
      ? {
          hasData: true,
          transactions,
          maxTs,
          updateBundleFilter,
          updateSearch,
          focusBank,
          registerChartControl,
          registerChart,
        }
      : DEFAULT_CHART_CONTROLS_CONTEXT;
  }, [
    selectedSlotTransactions,
    transactions,
    maxTs,
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
