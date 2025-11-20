import { getDefaultStore } from "jotai";
import type uPlot from "uplot";
import { isFullXRangeAtom } from "./atoms";
import { banksXScaleKey } from "./consts";

const store = getDefaultStore();

export function cuIsFullXRangePlugin(): uPlot.Plugin {
  let xMin: number | undefined, xMax: number | undefined;

  return {
    hooks: {
      ready(u) {
        xMin = u.scales[banksXScaleKey].min ?? 0;
        xMax = u.scales[banksXScaleKey].max ?? 0;
      },
      setScale(u) {
        store.set(
          isFullXRangeAtom,
          u.scales[banksXScaleKey].min === xMin &&
            u.scales[banksXScaleKey].max === xMax,
        );
      },
    },
  };
}
