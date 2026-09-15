import { startupTimeAtom } from "../../api/atoms";
import { smoothedNowNsAtom } from "../../atoms";
import type { TsRange } from "../WebGl/webglUtils";
import { atom } from "jotai";
import { CHART_NOW_DELAY_MS } from "./const";
import { calcRelativeMs, getInitVisibleRange } from "./utils";

export const {
  isInitializedAtom,
  referenceNsAtom,
  initializeVisibleRangeAtom,
  visibleRangeAtom,
  worldRangeAtom,
} = (function getReplayChartAtoms() {
  const referenceNsAtom = atom((get) => get(startupTimeAtom)?.startupTimeNanos);
  const visibleRangeAtom = atom<TsRange | undefined>(undefined);

  /**
   * Auto-increments as server time progresses
   */
  const worldRangeAtom = atom((get) => {
    const referenceNs = get(referenceNsAtom);
    const smoothedNowNs = get(smoothedNowNsAtom);

    if (referenceNs == null || smoothedNowNs == null) return;

    const worldEnd =
      calcRelativeMs(referenceNs, smoothedNowNs) - CHART_NOW_DELAY_MS;
    if (worldEnd <= 0) return;

    return [0, worldEnd] satisfies TsRange;
  });

  const isInitializedAtom = atom((get) => {
    return !!get(worldRangeAtom);
  });

  return {
    isInitializedAtom,
    referenceNsAtom,
    worldRangeAtom,
    /**
     * Call to set initial visible range. Only call when world range and selected ts have been initialized
     */
    initializeVisibleRangeAtom: atom(null, (get, set) => {
      const worldRange = get(worldRangeAtom);
      if (!worldRange) return;

      set(visibleRangeAtom, (prev) => {
        if (prev) return prev;
        return getInitVisibleRange(get(selectedMsAtom), worldRange);
      });
    }),
    visibleRangeAtom: atom(
      (get) => get(visibleRangeAtom),
      (_, set, value: TsRange) => {
        set(visibleRangeAtom, (prev) => {
          if (prev && prev[0] === value[0] && prev[1] === value[1]) return prev;
          return value;
        });
      },
    ),
  };
})();

export const selectedMsAtom = atom<number | undefined>();
