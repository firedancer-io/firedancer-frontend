import type uPlot from "uplot";
import { baseTooltipPlugin } from "../../../../../uplotReact/baseTooltipPlugin";
import { txnExecutionDurationTooltipElId } from "../../../../Overview/SlotPerformance/ComputeUnitsCard/consts";

export function txnExecutionDurationTooltipPlugin(
  setTooltipDataIdx: (idx: number) => void,
): uPlot.Plugin {
  function showOnCursor(_u: uPlot, _xVal: number, idx: number | null) {
    if (idx === null) return false;
    setTooltipDataIdx(idx);
    return true;
  }
  return baseTooltipPlugin({
    elId: txnExecutionDurationTooltipElId,
    showOnCursor,
  });
}
