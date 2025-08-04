import type uPlot from "uplot";
import { xScaleKey } from "../features/Overview/SlotPerformance/ComputeUnitsCard/consts";
import { uplotActionAtom } from "./uplotAtoms";
import { getDefaultStore } from "jotai";

const store = getDefaultStore();
let syncInProgress = false;

export function syncXScalePlugin(): uPlot.Plugin {
  return {
    hooks: {
      setScale: (u, scaleKey) => {
        if (syncInProgress) return;
        if (scaleKey !== xScaleKey) return;

        const xScale = u.scales[xScaleKey];

        syncInProgress = true;
        let min = xScale.min ?? 0;
        let max = xScale.max ?? 0;
        if (max - min < 100) {
          const mid = Math.trunc((max + min) / 2);
          min = mid - 50;
          max = mid + 50;
        }

        store.set(uplotActionAtom, (u) => {
          u.setScale(xScaleKey, { min, max });
        });

        syncInProgress = false;
      },
    },
  };
}
