import type uPlot from "uplot";
import { baseTooltipPlugin } from "../../../../../uplotReact/baseTooltipPlugin";

export function txnExecutionDurationTooltipPlugin(
  elId: string,
  setTooltipDataIdx: (idx: number) => void,
): uPlot.Plugin {
  function showOnCursor(_u: uPlot, _xVal: number, idx: number | null) {
    if (idx === null) return false;
    setTooltipDataIdx(idx);
    return true;
  }
  return baseTooltipPlugin({ elId, showOnCursor });
}
