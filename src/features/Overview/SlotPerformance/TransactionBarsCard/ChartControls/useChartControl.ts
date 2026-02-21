import { useCallback, useContext, useEffect, useState } from "react";
import {
  ChartControlsContext,
  type UpdateBundleCallback,
} from "../../../../SlotDetails/ChartControlsContext";

export default function useChartControl(update: UpdateBundleCallback) {
  const { registerChartControl } = useContext(ChartControlsContext);

  const [isTooltipOpen, setIsTooltipOpen] = useState<boolean>(false);
  const closeTooltip = useCallback(() => setIsTooltipOpen(false), []);

  const handleUpdateAndShowTooltip: UpdateBundleCallback = useCallback(
    (value) => {
      update(value);
      setIsTooltipOpen(true);
    },
    [update],
  );

  useEffect(() => {
    const cleanup = registerChartControl(handleUpdateAndShowTooltip);
    return cleanup;
  }, [registerChartControl, handleUpdateAndShowTooltip]);

  return { isTooltipOpen, closeTooltip };
}
