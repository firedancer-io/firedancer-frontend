import type uPlot from "uplot";
import { baseTooltipPlugin } from "../../../../../uplotReact/baseTooltipPlugin.js";

export function packBufferTooltipPlugin(
  setTooltipDataIdx: (idx: number) => void,
): uPlot.Plugin {
  function showOnCursor(
    u: uPlot,
    xVal: number,
    idx: number, // closest idx to cursor
  ) {
    setTooltipDataIdx(idx);
    return true;
  }

  return baseTooltipPlugin({ elId: "pack-buffer-chart-tooltip", showOnCursor });
}
