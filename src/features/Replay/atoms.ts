import { startupTimeAtom } from "../../api/atoms";
import { smoothedNowNsAtom } from "../../atoms";
import type { TsRange } from "../WebGl/webglUtils";
import { atom } from "jotai";
import { CHART_NOW_DELAY_MS, RESUME_LIVE_THRESHOLD_FRAC } from "./const";
import {
  calcRelativeMs,
  getInitVisibleRange,
  getSlotDrawTileIdxs,
} from "./utils";
import type { WsEntity } from "../../api/worker/types";
import { timelineSlotsAtom } from "./HeaderTrack/nonAggAtoms";
import { getSlotGroupLeader } from "../../utils";
import { slotsPerLeader } from "../../consts";
import { isAggregate } from "./HeaderTrack/utils";

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

    set(staticVisibleRangeAtom, getInitVisibleRange(worldRange));
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

export interface HoverInfo {
  owner: string;
  cursorMs: number;
}

export const [
  hoveredSlotAtom,
  hoveredMsAtom,
  setHoverInfoAtom,
  clearHoverInfoAtom,
] = (function getHoveredSlotAtoms() {
  const _hoverInfoAtom = atom<HoverInfo | undefined>(undefined);

  /** hovered cursor ts in ms, or undefined when nothing is hovered */
  const hoveredMsAtom = atom((get) => get(_hoverInfoAtom)?.cursorMs);

  /**
   * The hovered slot number, resolved from the cursor ms against the timeline
   * slots, or undefined when nothing is hovered.
   */
  const hoveredSlotAtom = atom<number | undefined>((get) => {
    const cursorMs = get(hoveredMsAtom);
    const referenceNs = get(referenceNsAtom);
    if (cursorMs == null || referenceNs == null) return;

    // only spotlight slot if in non-aggregate slot mode
    const visibleRange = get(visibleRangeAtom);
    if (!visibleRange || isAggregate(visibleRange)) return;

    const { slotGroups, tileSlotGroups } = get(timelineSlotsAtom);

    const { startIdx, endIdx } = getSlotDrawTileIdxs(referenceNs, visibleRange);

    const leaderSlots = new Set<number>();
    for (let tileIdx = startIdx; tileIdx <= endIdx; tileIdx++) {
      const tileGroups = tileSlotGroups.get(tileIdx);
      if (!tileGroups) continue;
      for (const leaderSlot of tileGroups) leaderSlots.add(leaderSlot);
    }
    if (leaderSlots.size === 0) return;

    const descLeaders = [...leaderSlots].sort((a, b) => b - a);

    // find highest slot number under the cursor.
    for (const leaderSlot of descLeaders) {
      const group = slotGroups.get(leaderSlot);
      if (!group) continue;

      for (
        let slotNumber = leaderSlot + slotsPerLeader - 1;
        slotNumber >= leaderSlot;
        slotNumber--
      ) {
        const slot = group.slots.get(slotNumber);
        if (slot && slot.startMs <= cursorMs && cursorMs <= slot.endMs) {
          return slot.slot;
        }
      }
    }
  });

  return [
    hoveredSlotAtom,
    hoveredMsAtom,
    atom(null, (_get, set, value: HoverInfo) => {
      set(_hoverInfoAtom, value);
    }),
    atom(null, (get, set, owner: string) => {
      // clear only if the setting owner is still the current owner
      if (get(_hoverInfoAtom)?.owner === owner) {
        set(_hoverInfoAtom, undefined);
      }
    }),
  ] as const;
})();

/**
 * ms ranges of the hovered slot and group, resolved from the
 * hovered slot against the timeline slot
 */
export const hoveredRangeAtom = atom<
  | {
      group: TsRange;
      slot: TsRange;
    }
  | undefined
>((get) => {
  const hoveredSlot = get(hoveredSlotAtom);
  if (hoveredSlot === undefined) return;

  const { slotGroups } = get(timelineSlotsAtom);
  const group = slotGroups.get(getSlotGroupLeader(hoveredSlot));
  const slotInfo = group?.slots.get(hoveredSlot);
  if (!group || group.slots.size === 0 || !slotInfo) return;

  let groupStartMs = Infinity;
  let groupEndMs = -Infinity;
  for (const { startMs, endMs } of group.slots.values()) {
    if (startMs < groupStartMs) groupStartMs = startMs;
    if (endMs > groupEndMs) groupEndMs = endMs;
  }

  return {
    group: [groupStartMs, groupEndMs],
    slot: [slotInfo.startMs, slotInfo.endMs],
  };
});
