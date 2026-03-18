import type uPlot from "uplot";
import { uplotActionAtom } from "./uplotAtoms";
import { getDefaultStore } from "jotai";

const store = getDefaultStore();
let syncInProgress = false;

export function syncXScalePlugin(opts?: { minRange?: number }): uPlot.Plugin {
  const minRange = opts?.minRange ?? 0;

  return {
    hooks: {
      setScale: (u, scaleKey) => {
        const xScaleKey = u.series[0].scale ?? "x";

        if (syncInProgress) return;
        if (scaleKey !== xScaleKey) return;

        const xScale = u.scales[xScaleKey];

        syncInProgress = true;
        let min = xScale.min ?? 0;
        let max = xScale.max ?? 0;
        if (max - min < minRange) {
          const mid = Math.trunc((max + min) / 2);
          min = mid - Math.trunc(minRange / 2);
          max = mid + Math.ceil(minRange / 2);
        }

        // Find matching charts with the same xScaleKey to sync scales with
        store.set(uplotActionAtom, (u) => {
          if (xScaleKey === (u.series[0].scale ?? "x")) {
            u.setScale(xScaleKey, { min, max });
          }
        });

        syncInProgress = false;
      },
    },
  };
}
