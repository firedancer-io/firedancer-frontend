import { getDefaultStore } from "jotai";
import type uPlot from "uplot";
import { isFullXRangeAtom } from "./atoms";

const store = getDefaultStore();

export function cuIsFullXRangePlugin(): uPlot.Plugin {
  let xMin: number | undefined, xMax: number | undefined;

  return {
    hooks: {
      ready(u) {
        xMin = u.scales.x.min ?? 0;
        xMax = u.scales.x.max ?? 0;
      },
      setScale(u) {
        store.set(
          isFullXRangeAtom,
          u.scales.x.min === xMin && u.scales.x.max === xMax,
        );
      },
    },
  };
}
