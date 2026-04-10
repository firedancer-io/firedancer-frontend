import { useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  ChartControlsContext,
  type ChartControlCallback,
  type ChartControlKey,
} from "../../../../SlotDetails/ChartControlsContext";

export default function useChartControl<K extends ChartControlKey>(
  key: K,
  update: ChartControlCallback<K>,
  reset: () => void,
) {
  const { registerControl } = useContext(ChartControlsContext);
  const updateRef = useRef(update);
  updateRef.current = update;
  const resetRef = useRef(reset);
  resetRef.current = reset;

  const [isTooltipOpen, setIsTooltipOpen] = useState(false);
  const closeTooltip = useCallback(() => setIsTooltipOpen(false), []);

  useEffect(() => {
    return registerControl(
      key,
      (value) => {
        updateRef.current(value);
        setIsTooltipOpen(true);
      },
      () => resetRef.current(),
    );
  }, [key, registerControl]);

  return { isTooltipOpen, closeTooltip };
}
