import { startupTimeAtom } from "../../api/atoms";
import { smoothedNowNsAtom } from "../../nowAtoms";
import type { TsRange } from "../WebGl/webglUtils";
import { atom, type Getter, type Setter } from "jotai";
import {
  AGG_SLOTS_BUCKET_COUNT_THRESHOLD,
  CHART_NOW_DELAY_MS,
  RESUME_LIVE_THRESHOLD_FRAC,
  type PlaybackRate,
} from "./const";
import {
  calcAbsoluteNs,
  calcRelativeMs,
  getAggGranularityForQuery,
  getBucketIdx,
  getInitVisibleRange,
  getSlotDrawTileIdxs,
} from "./utils";
import type { WsEntity } from "../../api/worker/types";
import { timelineSlotsAtom } from "./HeaderTrack/nonAggAtoms";
import type { SlotInfo } from "./HeaderTrack/nonAggAtoms";
import { getSlotGroupLeader } from "../../utils";
import { slotsPerLeader } from "../../consts";
import { isAggregate } from "./HeaderTrack/utils";
import type { TrackId } from "./layout";
import type { SetStateAction } from "react";
import { atomWithImmer } from "jotai-immer";
import { onFrameUpdate } from "../../frameLoop";
import type { ShredEventTsDeltas } from "../Shreds/types";
import { atomWithIsSameCheck } from "../../atomUtils";
import type { AggGranularity } from "../../api/types";
import type { ShredEventCounts } from "./ShredsTrack/atoms";
import { aggShredEvents } from "./ShredsTrack/const";
import type { RevenueSeries } from "./RevenueTrack/consts";

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

type Playback =
  | { kind: "live"; windowSizeMs: number }
  | { kind: "paused"; range: TsRange }
  | { kind: "playing"; clockStartMs: number; startRange: TsRange };

export const {
  isLiveAtom,
  isPlayingAtom,
  isInitializedAtom,
  referenceNsAtom,
  initializeVisibleRangeAtom,
  resetToLiveAtom,
  returnToLiveAtom,
  pauseAtom,
  togglePlaybackAtom,
  playbackRateAtom,
  setPlaybackRateAtom,
  visibleRangeAtom,
  worldRangeAtom,
} = (function getReplayChartAtoms() {
  const referenceNsAtom = atom((get) => get(startupTimeAtom)?.startupTimeNanos);
  const playbackAtom = atom<Playback | undefined>(undefined);
  const playbackRateAtom = atom<PlaybackRate>(1);

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

  const setLiveAtom = atom(null, (_get, set, windowSizeMs: number) => {
    set(playbackAtom, { kind: "live", windowSizeMs });
    set(playbackRateAtom, 1);
  });

  const playbackNowAtom = atom(0);
  let stopPlaybackClock: (() => void) | undefined;
  const startPlayingAtom = atom(null, (get, set, range: TsRange) => {
    const nowMs = performance.now();
    set(playbackNowAtom, nowMs);
    set(playbackAtom, {
      kind: "playing",
      clockStartMs: nowMs,
      startRange: range,
    });

    stopPlaybackClock?.();
    stopPlaybackClock = onFrameUpdate(() => {
      const playback = get(playbackAtom);
      if (playback?.kind !== "playing") {
        stopPlaybackClock?.();
        return;
      }

      const tickMs = performance.now();
      const rate = get(playbackRateAtom);
      const currentRange = getPlayingRange(playback, tickMs, rate);
      const worldEnd = get(worldRangeAtom)?.[1] ?? Infinity;

      // only faster than live playback can catch up to the world end
      if (rate > 1 && currentRange[1] >= worldEnd) {
        set(setLiveAtom, currentRange[1] - currentRange[0]);
        return;
      }

      // slower playback waits at the world end until it moves
      const clockAtWorldEndMs =
        playback.clockStartMs + (worldEnd - playback.startRange[1]) / rate;
      set(playbackNowAtom, Math.min(tickMs, clockAtWorldEndMs));
    });
  });

  const visibleRangeAtom = atom(
    (get): TsRange | undefined => {
      const playback = get(playbackAtom);
      if (!playback) return;

      switch (playback.kind) {
        case "live": {
          const worldRange = get(worldRangeAtom);
          if (!worldRange) return;
          return [worldRange[1] - playback.windowSizeMs, worldRange[1]];
        }
        case "paused":
          return playback.range;
        case "playing":
          return getPlayingRange(
            playback,
            get(playbackNowAtom),
            get(playbackRateAtom),
          );
      }
    },
    (get, set, value: TsRange) => {
      const worldRange = get(worldRangeAtom);
      // A pan/zoom whose right edge reaches world end resumes live mode;
      // any other manual range change pauses.

      // Resume live if new window is within this distance from world end
      const liveThreshold = (value[1] - value[0]) * RESUME_LIVE_THRESHOLD_FRAC;
      const resumeLive =
        worldRange != null && value[1] >= worldRange[1] - liveThreshold;

      if (resumeLive) {
        set(setLiveAtom, value[1] - value[0]);
        return;
      }

      const prev = get(playbackAtom);
      if (
        prev?.kind === "paused" &&
        prev.range[0] === value[0] &&
        prev.range[1] === value[1]
      ) {
        return;
      }
      set(playbackAtom, { kind: "paused", range: value });
    },
  );

  const resetToLiveAtom = atom(null, (get, set) => {
    const worldRange = get(worldRangeAtom);
    if (!worldRange) return;

    const [start, end] = getInitVisibleRange(worldRange);
    set(setLiveAtom, end - start);
  });

  const pauseAtom = atom(null, (get, set) => {
    const range = get(visibleRangeAtom);
    if (!range || get(playbackAtom)?.kind === "paused") return;

    set(playbackAtom, { kind: "paused", range });
  });

  return {
    isLiveAtom: atom((get) => get(playbackAtom)?.kind === "live"),
    isPlayingAtom: atom((get) => get(playbackAtom)?.kind === "playing"),
    isInitializedAtom,
    referenceNsAtom,
    worldRangeAtom,
    /**
     * Set to default live range if world range is initialized but visible range is not initialized
     */
    initializeVisibleRangeAtom: atom(null, (get, set) => {
      if (get(playbackAtom)) return;

      set(resetToLiveAtom);
    }),
    resetToLiveAtom,
    // keeps the current window size
    returnToLiveAtom: atom(null, (get, set) => {
      const range = get(visibleRangeAtom);
      if (!range) return;

      set(setLiveAtom, range[1] - range[0]);
    }),
    pauseAtom,
    togglePlaybackAtom: atom(null, (get, set) => {
      const playback = get(playbackAtom);
      if (playback?.kind === "paused") {
        set(startPlayingAtom, playback.range);
      } else {
        set(pauseAtom);
      }
    }),
    playbackRateAtom: atom((get) => get(playbackRateAtom)),
    setPlaybackRateAtom: atom(null, (get, set, rate: PlaybackRate) => {
      const playback = get(playbackAtom);
      const range = get(visibleRangeAtom);
      if (playback?.kind === "live" && rate >= 1) return;

      set(playbackRateAtom, rate);
      if (range && playback && playback.kind !== "paused") {
        set(startPlayingAtom, range);
      }
    }),
    visibleRangeAtom,
  };
})();

function getPlayingRange(
  playback: Extract<Playback, { kind: "playing" }>,
  nowMs: number,
  rate: number,
): TsRange {
  const elapsed = Math.max(0, nowMs - playback.clockStartMs) * rate;
  return [playback.startRange[0] + elapsed, playback.startRange[1] + elapsed];
}

/** cursor position in px, in viewport coords */
export interface ClientPos {
  x: number;
  y: number;
}

export interface HoverInfo {
  owner: string;
  cursorMs: number;
  /** cursor position in px, in viewport coords */
  clientPos: ClientPos;
}

/**
 * Leader slots whose tiles overlap the visible range, or undefined when not in
 * non-aggregate slot mode / timeline not ready.
 */
function getVisibleLeaderSlots(get: Getter) {
  const referenceNs = get(referenceNsAtom);
  if (referenceNs == null) return;

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

  return { slotGroups, leaderSlots };
}

/** Highest slot number whose range contains ms, or undefined. */
function highestSlotAtMs(get: Getter, ms: number): SlotInfo | undefined {
  const resolved = getVisibleLeaderSlots(get);
  if (!resolved) return;
  const { slotGroups, leaderSlots } = resolved;

  const descLeaders = [...leaderSlots].sort((a, b) => b - a);
  for (const leaderSlot of descLeaders) {
    const group = slotGroups.get(leaderSlot);
    if (!group) continue;

    for (
      let slotNumber = leaderSlot + slotsPerLeader - 1;
      slotNumber >= leaderSlot;
      slotNumber--
    ) {
      const slot = group.slots.get(slotNumber);
      if (slot && slot.startMs <= ms && ms <= slot.endMs) {
        return slot;
      }
    }
  }
}

/** All slots whose range contains ms, sorted ascending by start ts. */
function overlappingSlotsAtMs(get: Getter, ms: number): SlotInfo[] {
  const resolved = getVisibleLeaderSlots(get);
  if (!resolved) return [];
  const { slotGroups, leaderSlots } = resolved;

  const overlapping: SlotInfo[] = [];
  for (const leaderSlot of leaderSlots) {
    const group = slotGroups.get(leaderSlot);
    if (!group) continue;
    for (const slot of group.slots.values()) {
      if (slot.startMs <= ms && ms <= slot.endMs) overlapping.push(slot);
    }
  }
  overlapping.sort((a, b) => a.startMs - b.startMs);
  return overlapping;
}

/**
 * Explicit slot to spotlight while the overlap tooltip is pinned, overriding the
 * cursor-derived slot. undefined when no pin-driven spotlight is active.
 */
export const pinnedSpotlightSlotAtom = atom<number | undefined>(undefined);

export const [
  hoveredSlotAtom,
  hoveredMsAtom,
  hoveredClientPosAtom,
  hoverInfoAtom,
  setHoverInfoAtom,
  clearHoverInfoAtom,
] = (function getHoveredSlotAtoms() {
  const _hoverInfoAtom = atom<HoverInfo | undefined>(undefined);

  /** hovered cursor ts in ms, or undefined when nothing is hovered */
  const hoveredMsAtom = atom((get) => get(_hoverInfoAtom)?.cursorMs);

  /** hovered cursor position in px (viewport coords), or undefined */
  const hoveredClientPosAtom = atom((get) => get(_hoverInfoAtom)?.clientPos);

  /**
   * The hovered slot number, resolved from the cursor ms against the timeline
   * slots, or undefined when nothing is hovered.
   */
  const hoveredSlotAtom = atom<number | undefined>((get) => {
    // a pinned overlap tooltip spotlights an explicit slot
    const pinnedSlot = get(pinnedSpotlightSlotAtom);
    if (pinnedSlot != null) return pinnedSlot;

    const hoveredShredSlot = get(hoveredShredAtom)?.slot;
    if (hoveredShredSlot != null) return hoveredShredSlot;
    if (get(hoveredAggShredsAtom) != null) return undefined;

    const cursorMs = get(hoveredMsAtom);
    if (cursorMs == null) return;

    return highestSlotAtMs(get, cursorMs)?.slot;
  });

  return [
    hoveredSlotAtom,
    hoveredMsAtom,
    hoveredClientPosAtom,
    atom((get) => get(_hoverInfoAtom)),
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
 * Full SlotInfo for the hovered slot (startMs/endMs/isSkipped/isMine), resolved
 * from the timeline slots.
 */
export const hoveredSlotInfoAtom = atom<SlotInfo | undefined>((get) => {
  const hoveredSlot = get(hoveredSlotAtom);
  if (hoveredSlot === undefined) return;

  const { slotGroups } = get(timelineSlotsAtom);
  const group = slotGroups.get(getSlotGroupLeader(hoveredSlot));
  return group?.slots.get(hoveredSlot);
});

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
  const slotInfo = get(hoveredSlotInfoAtom);
  if (!slotInfo) return;

  const { slotGroups } = get(timelineSlotsAtom);
  const group = slotGroups.get(getSlotGroupLeader(slotInfo.slot));
  if (!group || group.slots.size === 0) return;

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

export const isFullScreenAtom = (function () {
  const _isFullScreenAtom = atom(false);

  async function enterFullScreen(get: Getter, set: Setter) {
    const onFullscreenChange = () => {
      if (document.fullscreenElement) return;
      set(_isFullScreenAtom, false);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);

    try {
      await document.documentElement.requestFullscreen();
      if (!get(_isFullScreenAtom)) await document.exitFullscreen();
    } catch {
      set(_isFullScreenAtom, false);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    }
  }

  return atom(
    (get) => get(_isFullScreenAtom),
    (get, set, update: SetStateAction<boolean>) => {
      if (!document.fullscreenEnabled) return;

      const isFullScreen =
        typeof update === "function" ? update(get(_isFullScreenAtom)) : update;
      set(_isFullScreenAtom, isFullScreen);

      if (isFullScreen && !document.fullscreenElement) {
        void enterFullScreen(get, set);
      } else if (!isFullScreen && document.fullscreenElement) {
        void document.exitFullscreen();
      }
    },
  );
})();

export const [hiddenTracksAtom, setTrackHiddenAtom] = (function () {
  const _hiddenTracksAtom = atomWithImmer(new Set<TrackId>());
  return [
    atom((get) => get(_hiddenTracksAtom)),
    atom(null, (_get, set, id: TrackId, hidden: boolean) => {
      set(_hiddenTracksAtom, (draft) => {
        if (hidden) draft.add(id);
        else draft.delete(id);
      });
    }),
  ] as const;
})();

export interface HoveredShred {
  slot: number;
  isFec: boolean;
  idx: number;
  maxIdx: number;
  shred: ShredEventTsDeltas;
  completeTs: number | undefined;
  skipped: boolean;
}

function isSameHoveredShred(a: HoveredShred, b: HoveredShred): boolean {
  return (
    a.slot === b.slot &&
    a.isFec === b.isFec &&
    a.idx === b.idx &&
    a.maxIdx === b.maxIdx &&
    a.completeTs === b.completeTs &&
    a.skipped === b.skipped &&
    a.shred.length === b.shred.length &&
    a.shred.every((d, i) => d === b.shred[i])
  );
}

export const hoveredShredAtom =
  atomWithIsSameCheck<HoveredShred>(isSameHoveredShred);

export interface HoveredAggShreds {
  bucketIdx: number;
  granularity: AggGranularity;
  counts: ShredEventCounts;
}

function isSameHoveredAggShred(a: HoveredAggShreds, b: HoveredAggShreds) {
  return (
    a.bucketIdx === b.bucketIdx &&
    a.granularity === b.granularity &&
    aggShredEvents.every(({ type }) => a.counts[type] === b.counts[type])
  );
}

export const hoveredAggShredsAtom = atomWithIsSameCheck<HoveredAggShreds>(
  isSameHoveredAggShred,
);

export interface HoveredAggRevenue {
  bucketIdx: number;
  granularity: AggGranularity;
  type: RevenueSeries;
  lamportValue: bigint;
}

function isSameHoveredAggRevenue(a: HoveredAggRevenue, b: HoveredAggRevenue) {
  return (
    a.bucketIdx === b.bucketIdx &&
    a.granularity === b.granularity &&
    a.type === b.type &&
    a.lamportValue === b.lamportValue
  );
}

export const hoveredAggRevenueAtom = atomWithIsSameCheck<HoveredAggRevenue>(
  isSameHoveredAggRevenue,
);

export interface HoveredAggHeader {
  bucketIdx: number;
  granularity: AggGranularity;
}

/** Which tooltip the Replay chart should show for the current hover. */
export enum TooltipType {
  Shred,
  AggShred,
  AggRevenue,
  Slot,
  AggHeader,
}

export const tooltipTypeAtom = atom<TooltipType | null>((get) => {
  if (get(hoveredMsAtom) == null) return null;

  if (get(hoveredShredAtom) != null) return TooltipType.Shred;
  if (get(hoveredAggShredsAtom) != null) return TooltipType.AggShred;
  if (get(hoveredAggRevenueAtom) != null) return TooltipType.AggRevenue;
  if (get(hoveredSlotInfoAtom) != null) return TooltipType.Slot;

  const visibleRange = get(visibleRangeAtom);
  if (visibleRange != null && isAggregate(visibleRange)) {
    return TooltipType.AggHeader;
  }
  return null;
});

export const hoveredAggHeaderAtom = atom<HoveredAggHeader | undefined>(
  (get) => {
    if (get(tooltipTypeAtom) !== TooltipType.AggHeader) return;

    const cursorMs = get(hoveredMsAtom);
    const referenceNs = get(referenceNsAtom);
    const visibleRange = get(visibleRangeAtom);
    if (cursorMs == null || referenceNs == null || !visibleRange) return;

    const granularity = getAggGranularityForQuery(
      "query_agg_slots",
      visibleRange[1] - visibleRange[0],
      AGG_SLOTS_BUCKET_COUNT_THRESHOLD,
    );
    const bucketIdx = getBucketIdx(
      calcAbsoluteNs(referenceNs, cursorMs),
      granularity,
      false,
    );
    return { bucketIdx, granularity };
  },
);

/** Owner used when the pinned overlap tooltip drives the spotlight. */
export const PINNED_HOVER_OWNER = "replay-pinned";

export interface PinnedTooltip {
  ts: number;
  /** highest slot number at ts */
  anchorSlot: number;
  mode: "list" | "detail";
  selectedSlot?: number;
  clientPos: ClientPos;
  /** true once the cursor enters the tooltip — the list stops following the cursor */
  isFrozen: boolean;
}

export const pinnedTooltipAtom = atom<PinnedTooltip | undefined>(undefined);

export const isReplayTooltipPinnedAtom = atom(
  (get) => get(pinnedTooltipAtom) != null,
);

/**
 * All slots overlapping the pinned ts, sorted ascending by start ts.
 * Empty when nothing is pinned.
 */
export const overlappingSlotsAtom = atom<SlotInfo[]>((get) => {
  const pinned = get(pinnedTooltipAtom);
  if (!pinned) return [];
  return overlappingSlotsAtMs(get, pinned.ts);
});

export const pinnedSelectedSlotInfoAtom = atom<SlotInfo | undefined>((get) => {
  const pinned = get(pinnedTooltipAtom);
  if (pinned?.mode !== "detail" || pinned.selectedSlot == null) return;
  return get(overlappingSlotsAtom).find((s) => s.slot === pinned.selectedSlot);
});

/** Index of the selected slot in the overlap list, or -1. */
export const pinnedSelectedIdxAtom = atom((get) => {
  const pinned = get(pinnedTooltipAtom);
  if (pinned?.mode !== "detail" || pinned.selectedSlot == null) return -1;
  return get(overlappingSlotsAtom).findIndex(
    (s) => s.slot === pinned.selectedSlot,
  );
});

function pushPinnedSpotlight(get: Getter, set: Setter, slot: number) {
  const pinned = get(pinnedTooltipAtom);
  if (!pinned) return;
  set(pinnedSpotlightSlotAtom, slot);
  set(setHoverInfoAtom, {
    owner: PINNED_HOVER_OWNER,
    cursorMs: pinned.ts,
    clientPos: pinned.clientPos,
  });
}

/**
 * Open or refresh the overlap list at the cursor ts when 2+ slots overlap there;
 * close it when they don't. A frozen or detail-mode tooltip is left untouched.
 */
export const openOrUpdateOverlapAtom = atom(
  null,
  (get, set, { ts, clientPos }: { ts: number; clientPos: ClientPos }) => {
    const current = get(pinnedTooltipAtom);

    if (current && (current.isFrozen || current.mode === "detail")) return;

    const overlapping = overlappingSlotsAtMs(get, ts);
    if (overlapping.length <= 1) {
      // No overlap under the cursor: close the list if one is showing.
      if (current) set(dismissPinnedAtom);
      return;
    }

    // anchor on the highest slot number in the overlap
    const anchorSlot = overlapping.reduce(
      (max, s) => Math.max(max, s.slot),
      -1,
    );

    set(pinnedTooltipAtom, {
      ts,
      anchorSlot,
      clientPos,
      mode: "list",
      isFrozen: false,
    });

    pushPinnedSpotlight(get, set, anchorSlot);
  },
);

/** Freeze the list (cursor entered the tooltip) so it stops following the cursor. */
export const freezeOverlapAtom = atom(null, (get, set) => {
  const current = get(pinnedTooltipAtom);
  if (!current || current.mode !== "list" || current.isFrozen) return;
  set(pinnedTooltipAtom, { ...current, isFrozen: true });
});

/** Switch to the detail view for a slot and spotlight it. */
export const selectPinnedSlotAtom = atom(null, (get, set, slot: number) => {
  const pinned = get(pinnedTooltipAtom);
  if (!pinned) return;
  set(pinnedTooltipAtom, { ...pinned, mode: "detail", selectedSlot: slot });
  pushPinnedSpotlight(get, set, slot);
});

/** Return to the list view and clear the spotlight. */
export const pinnedBackToListAtom = atom(null, (get, set) => {
  const pinned = get(pinnedTooltipAtom);
  if (!pinned) return;
  set(pinnedTooltipAtom, { ...pinned, mode: "list", selectedSlot: undefined });
  set(pinnedSpotlightSlotAtom, undefined);
  set(clearHoverInfoAtom, PINNED_HOVER_OWNER);
});

/** Step through the overlap list (clamped at ends). */
export const pinnedStepAtom = atom(null, (get, set, delta: number) => {
  const list = get(overlappingSlotsAtom);
  if (list.length === 0) return;
  const curIdx = get(pinnedSelectedIdxAtom);
  const nextIdx = Math.min(Math.max(curIdx + delta, 0), list.length - 1);
  if (nextIdx === curIdx) return;
  set(selectPinnedSlotAtom, list[nextIdx].slot);
});

/** List-mode row hover: spotlight the slot, or clear when slot is undefined. */
export const pinnedHoverRowAtom = atom(
  null,
  (get, set, slot: number | undefined) => {
    if (slot == null) {
      set(pinnedSpotlightSlotAtom, undefined);
      set(clearHoverInfoAtom, PINNED_HOVER_OWNER);
      return;
    }
    pushPinnedSpotlight(get, set, slot);
  },
);

/**
 * Cursor position (viewport px) captured at dismiss time, so the regular hover
 * tooltip can be replayed at the real cursor location the instant the pin closes.
 */
export const lastDismissPosAtom = atom<ClientPos | undefined>(undefined);

/** Close the pinned tooltip and clear its spotlight. */
export const dismissPinnedAtom = atom(
  null,
  (_get, set, clientPos?: ClientPos) => {
    set(lastDismissPosAtom, clientPos);
    set(pinnedTooltipAtom, undefined);
    set(pinnedSpotlightSlotAtom, undefined);
    set(clearHoverInfoAtom, PINNED_HOVER_OWNER);
  },
);

/**
 * Close the pinned tooltip once its ts scrolls out of the visible range or in agg mode
 */
export const dismissPinnedIfOffscreenAtom = atom(null, (get, set) => {
  const pinned = get(pinnedTooltipAtom);
  if (!pinned) return;
  const visibleRange = get(visibleRangeAtom);
  if (!visibleRange) return;
  if (
    isAggregate(visibleRange) ||
    pinned.ts < visibleRange[0] ||
    pinned.ts > visibleRange[1]
  ) {
    set(dismissPinnedAtom);
  }
});
