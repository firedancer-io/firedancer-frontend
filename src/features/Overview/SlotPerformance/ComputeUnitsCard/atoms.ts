import { atom } from "jotai";
import type { CuChartTooltipData } from "./types";

export const cuChartTooltipDataAtom = atom<CuChartTooltipData>();

export const leftAxisSizeAtom = atom(0);
export const rightAxisSizeAtom = atom(0);

export const isFullXRangeAtom = atom(true);
