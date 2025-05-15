import { atom } from "jotai";
import uPlot from "uplot";

export const uplotChartsAtom = atom({} as Record<string, uPlot>);

export const uplotActionAtom = atom(
  null,
  (
    get,
    set,
    action: (u: uPlot, chartId: string) => void,
    options?: {
      chartId?: string;
      isMatchingChartId?: (chartId: string) => boolean;
    },
  ) => {
    const { chartId, isMatchingChartId } = options || {};
    const uplotMap = get(uplotChartsAtom);
    if (chartId && uplotMap[chartId]) {
      action(uplotMap[chartId], chartId);
    } else {
      for (const [chartId, uplot] of Object.entries(uplotMap)) {
        if (isMatchingChartId && !isMatchingChartId(chartId)) continue;
        action(uplot, chartId);
      }
    }
  },
);
