import type uPlot from "uplot";
import { baseTooltipPlugin } from "../../../../../uplotReact/baseTooltipPlugin";
import { incomeChartPointRadius } from "../../consts";

const HOVER_RADIUS_SQ = (incomeChartPointRadius + 2) ** 2; // slightly larger point for easier hover

export function incomeScatterTooltipPlugin(
  elId: string,
  xScaleKey: string,
  yScaleKey: string,
  setTooltipData: (data: { x: number; y: number }) => void,
): uPlot.Plugin {
  function getClosestIdx(u: uPlot): number | null {
    const { left, top } = u.cursor;
    if (left == null || top == null) return null;

    const xData = u.data[0];
    const yData = u.data[1];
    let minIdx: number | null = null;
    let minDistSq = Infinity;

    for (let i = 0; i < yData.length; i++) {
      const xVal = xData[i];
      const yVal = yData[i];
      if (xVal == null || yVal == null) continue;
      const xPos = u.valToPos(xVal, xScaleKey);
      const yPos = u.valToPos(yVal, yScaleKey);
      const distSq = (left - xPos) ** 2 + (top - yPos) ** 2;
      if (distSq < minDistSq && distSq <= HOVER_RADIUS_SQ) {
        minDistSq = distSq;
        minIdx = i;
      }
    }

    return minIdx;
  }

  function showOnCursor(u: uPlot, _xVal: number, idx: number) {
    const x = u.data[0][idx];
    const y = u.data[1][idx];
    if (x == null || y == null) return false;

    setTooltipData({ x, y });
    return true;
  }

  return baseTooltipPlugin({
    elId,
    getClosestIdx,
    showOnCursor,
  });
}
