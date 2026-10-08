import { startupTimeAtom } from "../../api/atoms";
import { smoothedNowNsAtom } from "../../atoms";
import type { TsRange } from "../WebGl/webglUtils";
import { atom } from "jotai";
import { CHART_NOW_DELAY_MS } from "./const";
import { calcRelativeMs, getInitVisibleRange } from "./utils";
import type { WsEntity } from "../../api/worker/types";

export type TimelineQueryKey = Extract<WsEntity, { topic: "timeline" }>["key"];

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
  visibleRangeAtom,
  worldRangeAtom,
  selectedMsAtom,
} = (function getReplayChartAtoms() {
  const _isLiveAtom = atom(true);
  const _selectedMsAtom = atom<number | undefined>(undefined);
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

  const liveVisibleRangeAtom = atom((get) => {
    const visibleRange = get(visibleRangeAtom);
    const worldRange = get(worldRangeAtom);
    if (!visibleRange || !worldRange) return;

    const visibleWindowSize = visibleRange[1] - visibleRange[0];

    // live mode: show same visible window size but at world end
    return [worldRange[1] - visibleWindowSize, worldRange[1]] satisfies TsRange;
  });

  const isLiveAtom = atom(
    (get) => get(_isLiveAtom),
    (get, set, isLive: boolean) => {
      set(_isLiveAtom, (prev) => {
        if (prev && !isLive) {
          // store the current live visible range as the static visible range
          set(visibleRangeAtom, get(liveVisibleRangeAtom));
        }
        return isLive;
      });
    },
  );

  const isInitializedAtom = atom((get) => {
    return !!get(worldRangeAtom);
  });

  return {
    isLiveAtom,
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
        return getInitVisibleRange(get(_selectedMsAtom), worldRange);
      });
    }),
    /**
     * selected ts in ms. Assigning a value exits live mode.
     */
    selectedMsAtom: atom(
      (get) => get(_selectedMsAtom),
      (_, set, value: number | undefined) => {
        if (value != null) set(isLiveAtom, false);
        set(_selectedMsAtom, value);
      },
    ),
    /**
     * get static visible range or live visible range
     */
    visibleRangeAtom: atom(
      (get) => {
        const isLive = get(isLiveAtom);
        if (isLive) {
          return get(liveVisibleRangeAtom);
        }
        return get(visibleRangeAtom);
      },
      (_, set, value: TsRange) => {
        // a manual range change (pan/zoom) exits live mode
        set(isLiveAtom, false);
        set(visibleRangeAtom, (prev) => {
          if (prev && prev[0] === value[0] && prev[1] === value[1]) return prev;
          return value;
        });
      },
    ),
  };
})();
