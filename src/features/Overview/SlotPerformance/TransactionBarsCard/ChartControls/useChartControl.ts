import { useCallback, useContext, useEffect, useState } from "react";
import {
  ChartControlsContext,
  type ChartControlProps,
} from "../../../../SlotDetails/ChartControlsContext";

export default function useChartControl({
  chartControl,
  handleExternalValueUpdate,
}: ChartControlProps) {
  const { registerChartControl } = useContext(ChartControlsContext);

  const [isTooltipOpen, setIsTooltipOpen] = useState<boolean>(false);
  const closeTooltip = useCallback(() => setIsTooltipOpen(false), []);

  /**
   * `handleExternalValueUpdate`'s argument type depends on `chartControl`,
   * but Typescript loses that relationship when we destructure props,
   * so we need to cast it to accept `value`
   */
  const handleUpdateAndShowTooltip = useCallback(
    (value: Parameters<typeof handleExternalValueUpdate>[0]) => {
      (handleExternalValueUpdate as (v: typeof value) => void)(value);
      setIsTooltipOpen(true);
    },
    [handleExternalValueUpdate],
  );

  useEffect(() => {
    const cleanup = registerChartControl({
      chartControl,
      handleExternalValueUpdate: handleUpdateAndShowTooltip,
    });
    return cleanup;
  }, [chartControl, registerChartControl, handleUpdateAndShowTooltip]);

  return { isTooltipOpen, closeTooltip };
}
