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
