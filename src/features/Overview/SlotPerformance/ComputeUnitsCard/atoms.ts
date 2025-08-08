import { atom } from "jotai";
import type { CuChartTooltipData } from "./types";
import { scheduleStrategyAtom } from "../../../../api/atoms";
import { ScheduleStrategyEnum } from "../../../../api/entities";

export const cuChartTooltipDataAtom = atom<CuChartTooltipData>();

export const leftAxisSizeAtom = atom(0);
export const rightAxisSizeAtom = atom(0);

export const isFullXRangeAtom = atom(true);

const _showChartProjectionsAtom = atom<boolean | undefined>(undefined);
export const showChartProjectionsAtom = atom(
  (get) => {
    const showChartProjections = get(_showChartProjectionsAtom);
    if (showChartProjections === undefined) {
      // default state
      return get(scheduleStrategyAtom) === ScheduleStrategyEnum.balanced;
    }

    return showChartProjections;
  },
  (_, set, showChartProjections: boolean) => {
    set(_showChartProjectionsAtom, showChartProjections);
  },
);
