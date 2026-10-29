import { startupTimeAtom } from "../../api/atoms";
import { smoothedNowNsAtom } from "../../atoms";
import type { TsRange } from "../WebGl/webglUtils";
import { atom } from "jotai";
import { CHART_NOW_DELAY_MS, RESUME_LIVE_THRESHOLD_FRAC } from "./const";
import { calcRelativeMs, getInitVisibleRange } from "./utils";
import type { WsEntity } from "../../api/worker/types";

export type TimelineQueryKey = Extract<WsEntity, { topic: "timeline" }>["key"];
export type TimelineAggQueryKey = Extract<
  TimelineQueryKey,
  `query_agg_${string}`
>;

/** query key -> next id to assign for that key */
export const [nextQueryIdByKeyAtom, reserveNextQueryIdAtom] = (function () {
  const _nextQueryIdByKeyAtom = atom(new Map<TimelineQueryKey, number>());
  return [
    atom((get) => get(_nextQueryIdByKeyAtom)),
    atom(null, (get, set, key: TimelineQueryKey) => {
      const map = get(_nextQueryIdByKeyAtom);
      const id = map.get(key) ?? 1;
      // new Map so jotai sees a changed reference
      set(_nextQueryIdByKeyAtom, new Map(map).set(key, id + 1));
      return id;
    }),
  ];
})();

export const {
  isLiveAtom,
  isInitializedAtom,
  referenceNsAtom,
  initializeVisibleRangeAtom,
  resetToLiveAtom,
  visibleRangeAtom,
  worldRangeAtom,
} = (function getReplayChartAtoms() {
  const isLiveAtom = atom(true);
  const referenceNsAtom = atom((get) => get(startupTimeAtom)?.startupTimeNanos);
  const staticVisibleRangeAtom = atom<TsRange | undefined>(undefined);

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

  /**
   * live mode: show same visible window size but at world end
   */
  const liveVisibleRangeAtom = atom((get) => {
    const staticVisibleRange = get(staticVisibleRangeAtom);
    const worldRange = get(worldRangeAtom);
    if (!staticVisibleRange || !worldRange) return;

    const visibleWindowSize = staticVisibleRange[1] - staticVisibleRange[0];

    return [worldRange[1] - visibleWindowSize, worldRange[1]] satisfies TsRange;
  });

  const isInitializedAtom = atom((get) => {
    return !!get(worldRangeAtom);
  });

  const resetToLiveAtom = atom(null, (get, set) => {
    const worldRange = get(worldRangeAtom);
    if (!worldRange) return;

    set(staticVisibleRangeAtom, getInitVisibleRange(undefined, worldRange));
    set(isLiveAtom, true);
  });

  return {
    isLiveAtom,
    isInitializedAtom,
    referenceNsAtom,
    worldRangeAtom,
    /**
     * Set to default live range if world range is initialized but visible range is not initialized
     */
    initializeVisibleRangeAtom: atom(null, (get, set) => {
      if (get(staticVisibleRangeAtom)) return;

      set(resetToLiveAtom);
    }),
    resetToLiveAtom,
    /**
     * get static visible range or live visible range
     */
    visibleRangeAtom: atom(
      (get) => {
        const isLive = get(isLiveAtom);
        return get(isLive ? liveVisibleRangeAtom : staticVisibleRangeAtom);
      },
      (get, set, value: TsRange) => {
        const worldRange = get(worldRangeAtom);
        // A pan/zoom whose right edge reaches world end resumes live mode;
        // any other manual range change exits live mode.

        // Resume live if new window is within this distance from world end
        const liveThreshold =
          (value[1] - value[0]) * RESUME_LIVE_THRESHOLD_FRAC;
        const resumeLive =
          worldRange != null && value[1] >= worldRange[1] - liveThreshold;

        set(staticVisibleRangeAtom, (prev) => {
          if (prev && prev[0] === value[0] && prev[1] === value[1]) {
            return prev;
          }
          return value;
        });
        set(isLiveAtom, resumeLive);
      },
    ),
  };
})();

/**
 * selected ts in ms
 */
export const selectedMsAtom = atom<number | undefined>(undefined);
