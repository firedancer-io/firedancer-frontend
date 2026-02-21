import { useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  ChartControlsContext,
  type ChartControlCallback,
  type ChartControlKey,
} from "../../../../SlotDetails/ChartControlsContext";

export default function useChartControl<K extends ChartControlKey>(
  key: K,
  update: ChartControlCallback<K>,
) {
  const { registerControl } = useContext(ChartControlsContext);
  const updateRef = useRef(update);
  updateRef.current = update;

  const [isTooltipOpen, setIsTooltipOpen] = useState(false);
  const closeTooltip = useCallback(() => setIsTooltipOpen(false), []);

  useEffect(() => {
    return registerControl(key, (value) => {
      updateRef.current(value);
      setIsTooltipOpen(true);
    });
  }, [key, registerControl]);

  return { isTooltipOpen, closeTooltip };
}
