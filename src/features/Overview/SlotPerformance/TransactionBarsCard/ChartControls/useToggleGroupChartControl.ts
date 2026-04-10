import { useCallback, useRef } from "react";
import type {
  ChartControlKey,
  ChartControlMap,
} from "../../../../SlotDetails/ChartControlsContext";
import type { ToggleGroupControlRef } from "./ToggleGroupControl";
import useChartControl from "./useChartControl";
import { getUplotId } from "../chartUtils";

export default function useToggleGroupChartControl<K extends ChartControlKey>(
  key: K,
  update: (value: ChartControlMap[K]) => void,
  reset: () => void,
) {
  const toggleGroupRef =
    useRef<ToggleGroupControlRef<ChartControlMap[K] & string>>(null);

  const handleUpdate = useCallback(
    (value: ChartControlMap[K]) => {
      update(value);
      toggleGroupRef.current?.focus(value as ChartControlMap[K] & string);
      // Targets the first bank tile since the filter affects all tiles
      document
        .getElementById(getUplotId(0))
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    },
    [update],
  );

  const { isTooltipOpen, closeTooltip } = useChartControl(
    key,
    handleUpdate,
    reset,
  );

  return { isTooltipOpen, closeTooltip, toggleGroupRef };
}
