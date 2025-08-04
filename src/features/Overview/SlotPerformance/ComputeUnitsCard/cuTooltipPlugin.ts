import type uPlot from "uplot";
import { baseTooltipPlugin } from "../../../../uplotReact/baseTooltipPlugin.js";
import type { CuChartTooltipData } from "./types.js";

export function cuTooltipPlugin(
  setTooltipData: (data: CuChartTooltipData) => void,
): uPlot.Plugin {
  function showOnCursor(
    u: uPlot,
    xVal: number,
    idx: number, // closest idx to cursor
  ) {
    const dataIdx = xVal >= u.data[0][idx] ? idx : idx - 1;
    setTooltipData({
      elapsedTime: xVal,
      activeBanks: u.data[1][dataIdx],
      computeUnits: u.data[2][dataIdx],
      fees: u.data[3][dataIdx],
      tips: u.data[4][dataIdx],
    });
    return true;
  }

  return baseTooltipPlugin({ elId: "cu-chart-tooltip", showOnCursor });
}
