import { startupTimeAtom } from "../../api/atoms";
import { smoothedNowNsAtom } from "../../nowAtoms";
import type { TsRange } from "../WebGl/webglUtils";
import { atom, type createStore, type Getter, type Setter } from "jotai";
import { selectAtom } from "jotai/utils";
import { CHART_NOW_DELAY_MS, type PlaybackRate } from "./const";
import {
  calcAbsoluteNs,
  calcRelativeMs,
  clampToWorld,
  getAggSlotsGranularity,
  getBucketIdx,
  getInitVisibleRange,
  getSlotDrawTileIdxs,
} from "./utils";
import type { WsEntity } from "../../api/worker/types";
import { timelineSlotsAtom } from "./HeaderTrack/nonAggAtoms";
import type { SlotInfo } from "./HeaderTrack/nonAggAtoms";
import { getSlotGroupLeader } from "../../utils";
import { slotsPerLeader } from "../../consts";
import { isAggHeaderVisibleAtom } from "./HeaderTrack/aggAtoms";
import { isAggregate } from "./HeaderTrack/utils";
import type { TrackId } from "./layout";
import type { SetStateAction } from "react";
import { atomWithImmer } from "jotai-immer";
import { onFrameUpdate } from "../../frameLoop";
import {
  type HoveredShred,
  isSameHoveredShred,
} from "../Shreds/WebGl/shredHover";
import { atomWithIsSameCheck } from "../../atomUtils";
import type { AggGranularity } from "../../api/types";
import type { ShredEventCounts } from "./ShredsTrack/atoms";
import { aggShredEvents } from "./ShredsTrack/const";
import type { RevenueSeries, TxnMetaDetails } from "./RevenueTrack/consts";
import type { TileState } from "../../api/entities";
import type { TxnSegment, TxnStates } from "./tileStates/hoverUtils";

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

const _selectedSlotAtom = atom<number | undefined>(undefined);

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
    set(_selectedSlotAtom, undefined);
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
      // a pan/zoom that reaches world end resumes live; anything else pauses
      if (worldRange != null && value[1] >= worldRange[1]) {
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

  const pauseAtom = atom(null, (get, set, range?: TsRange) => {
    // an explicit range pauses directly, even if already paused
    if (range) {
      set(playbackAtom, { kind: "paused", range });
      return;
    }

    const currentRange = get(visibleRangeAtom);
    if (!currentRange || get(playbackAtom)?.kind === "paused") return;

    set(playbackAtom, { kind: "paused", range: currentRange });
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

const windowSizeMs = 15_000;

export const navigateToReplaySlotAtom = atom(
  null,
  (get, set, slot: number, centerNs: bigint) => {
    const referenceNs = get(referenceNsAtom);
    if (referenceNs == null) return;

    const centerMs = calcRelativeMs(referenceNs, centerNs);
    const half = windowSizeMs / 2;
    let range: TsRange = [centerMs - half, centerMs + half];

    const worldRange = get(worldRangeAtom);
    if (worldRange) range = clampToWorld(range, worldRange);

    set(_selectedSlotAtom, slot);
    set(pauseAtom, range);
  },
);

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

type Store = ReturnType<typeof createStore>;

const HOVERED_SLOT_CLEAR_DELAY_MS = 150;

export interface HoverInfo {
  owner: string;
  cursorMs: number;
  /** cursor position in px, in viewport coords */
  clientPos: ClientPos;
}

function collectLeaderSlotsInRange(
  tileSlotGroups: Map<number, Set<number>>,
  referenceNs: bigint,
  visibleRange: TsRange,
): Set<number> {
  const { startIdx, endIdx } = getSlotDrawTileIdxs(referenceNs, visibleRange);

  const leaderSlots = new Set<number>();
  for (let tileIdx = startIdx; tileIdx <= endIdx; tileIdx++) {
    const tileGroups = tileSlotGroups.get(tileIdx);
    if (!tileGroups) continue;
    for (const leaderSlot of tileGroups) leaderSlots.add(leaderSlot);
  }
  return leaderSlots;
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
  const leaderSlots = collectLeaderSlotsInRange(
    tileSlotGroups,
    referenceNs,
    visibleRange,
  );
  if (leaderSlots.size === 0) return;

  return { slotGroups, leaderSlots };
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

function isSameSlotList(a: SlotInfo[], b: SlotInfo[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].slot !== b[i].slot) return false;
  }
  return true;
}

const _pinnedSpotlightSlotAtom = atom<number | undefined>(undefined);

/**
 * Explicit slot to spotlight while the overlap tooltip is pinned, overriding the
 * cursor-derived slot. undefined when no pin-driven spotlight is active, or the
 * pinned tooltip is hidden.
 */
const pinnedSpotlightSlotAtom = atom((get) =>
  get(pinnedTooltipAtom) ? get(_pinnedSpotlightSlotAtom) : undefined,
);

export const [
  hoveredSlotAtom,
  hoveredMsAtom,
  hoveredClientPosAtom,
  setHoverInfoAtom,
  clearHoverInfoAtom,
  delayHoveredSlotClear,
] = (function getHoveredSlotAtoms() {
  const _hoverInfoAtom = atom<HoverInfo | undefined>(undefined);

  /**
   * hovered cursor ts in ms, or undefined when nothing is hovered. The pinned
   * overlap tooltip takes priority over the cursor.
   */
  const hoveredMsAtom = atom(
    (get) => get(pinnedTooltipAtom)?.ts ?? get(_hoverInfoAtom)?.cursorMs,
  );

  /** hovered cursor position in px (viewport coords), or undefined */
  const hoveredClientPosAtom = atom(
    (get) =>
      get(pinnedTooltipAtom)?.clientPos ?? get(_hoverInfoAtom)?.clientPos,
  );

  /**
   * The hovered slot number, resolved from the cursor ms against the timeline
   * slots, or undefined when nothing is hovered.
   */
  const _rawHoveredSlotAtom = atom<number | undefined>((get) => {
    const hoveredShredSlot = get(hoveredShredAtom)?.slot;
    if (hoveredShredSlot != null) return hoveredShredSlot;

    const hoveredExecrpSlot = get(hoveredExecrpTxnAtom)?.slot;
    if (hoveredExecrpSlot != null) return hoveredExecrpSlot;

    if (get(hoveredAggShredsAtom) != null) return undefined;
    const hoveredRevenueTxnSlot = get(hoveredRevenueTxnAtom)?.slot;
    if (hoveredRevenueTxnSlot != null) return hoveredRevenueTxnSlot;

    const cursorMs = get(hoveredMsAtom);
    if (cursorMs == null) return;
    // keep hover highlight consistent with the drawn-on-top slot and with what a
    // click would select (selectSlotAtMsAtom also uses getSlotAtMs)
    return getSlotAtMs(get, cursorMs);
  });

  /** the last hovered slot, kept briefly after it's unhovered */
  const _lingeringSlotAtom = atom<number | undefined>(undefined);

  // a pinned overlap tooltip spotlights an explicit slot
  const hoveredSlotAtom = atom(
    (get) =>
      get(pinnedSpotlightSlotAtom) ??
      get(_rawHoveredSlotAtom) ??
      get(_lingeringSlotAtom),
  );

  function delayHoveredSlotClear(store: Store) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let prevSlot = store.get(_rawHoveredSlotAtom);
    const unsub = store.sub(_rawHoveredSlotAtom, () => {
      const slot = store.get(_rawHoveredSlotAtom);
      if (slot === undefined && prevSlot !== undefined) {
        clearTimeout(timer);
        store.set(_lingeringSlotAtom, prevSlot);
        timer = setTimeout(
          () => store.set(_lingeringSlotAtom, undefined),
          HOVERED_SLOT_CLEAR_DELAY_MS,
        );
      }
      prevSlot = slot;
    });
    return () => {
      unsub();
      clearTimeout(timer);
      store.set(_lingeringSlotAtom, undefined);
    };
  }

  return [
    hoveredSlotAtom,
    hoveredMsAtom,
    hoveredClientPosAtom,
    atom(null, (_get, set, value: HoverInfo) => {
      set(_hoverInfoAtom, value);
    }),
    atom(null, (get, set, owner: string) => {
      // clear only if the setting owner is still the current owner
      if (get(_hoverInfoAtom)?.owner === owner) {
        set(_hoverInfoAtom, undefined);
      }
    }),
    delayHoveredSlotClear,
  ] as const;
})();

// the slot drawn on top at ms: the selected slot's group is raised, else the highest slot; only in non-aggregate slot mode
function getSlotAtMs(get: Getter, ms: number) {
  const referenceNs = get(referenceNsAtom);
  const visibleRange = get(visibleRangeAtom);
  if (referenceNs == null || !visibleRange || get(isAggHeaderVisibleAtom))
    return;

  const { slotGroups, tileSlotGroups } = get(timelineSlotsAtom);

  const selectedSlot = get(_selectedSlotAtom);
  const selectedGroup =
    selectedSlot === undefined
      ? undefined
      : slotGroups.get(getSlotGroupLeader(selectedSlot));
  if (selectedGroup) {
    let topSlot: number | undefined;
    for (const { slot, startMs, endMs } of selectedGroup.slots.values()) {
      if (ms < startMs || endMs < ms) continue;
      if (slot === selectedSlot) return slot;
      if (topSlot === undefined || slot > topSlot) topSlot = slot;
    }
    if (topSlot !== undefined) return topSlot;
  }

  const leaderSlots = collectLeaderSlotsInRange(
    tileSlotGroups,
    referenceNs,
    visibleRange,
  );
  if (leaderSlots.size === 0) return;

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
        return slot.slot;
      }
    }
  }
}

export interface SlotRange {
  group: TsRange;
  slot: TsRange;
}

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

function getSlotRange(get: Getter, slot: number | undefined) {
  if (slot === undefined) return;

  const { slotGroups } = get(timelineSlotsAtom);
  const group = slotGroups.get(getSlotGroupLeader(slot));
  const slotInfo = group?.slots.get(slot);
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
  } satisfies SlotRange;
}

export const hoveredRangeAtom = atom((get) =>
  getSlotRange(get, get(hoveredSlotAtom)),
);

export const selectedSlotAtom = atom((get) => {
  const visibleRange = get(visibleRangeAtom);
  if (!visibleRange || get(isAggHeaderVisibleAtom)) return;
  return get(_selectedSlotAtom);
});

// a slot drawn at the point (overlapping shreds) wins over the slot at ms
export const selectSlotAtMsAtom = atom(
  null,
  (get, set, ms: number, drawnSlot?: number) => {
    const slot = drawnSlot ?? getSlotAtMs(get, ms);
    set(_selectedSlotAtom, slot === get(selectedSlotAtom) ? undefined : slot);
  },
);

export const clearSelectedSlotAtom = atom(null, (_get, set) => {
  set(_selectedSlotAtom, undefined);
});

export const selectedRangeAtom = atom((get) =>
  getSlotRange(get, get(selectedSlotAtom)),
);

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

export const hoveredShredAtom =
  atomWithIsSameCheck<HoveredShred>(isSameHoveredShred);

export interface HoveredExecrpTxn {
  slot: number;
  txnIdx: number;
  ms: number;
  state: TileState | undefined;
  states: TxnStates;
}

function isSameTxnSegment(
  a: TxnSegment | undefined,
  b: TxnSegment | undefined,
) {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.tileIdx === b.tileIdx &&
    a.startMs === b.startMs &&
    a.endMs === b.endMs &&
    a.errorCode === b.errorCode &&
    a.stateMs.size === b.stateMs.size &&
    [...a.stateMs].every(([state, ms]) => b.stateMs.get(state) === ms)
  );
}

function isSameHoveredExecrpTxn(a: HoveredExecrpTxn, b: HoveredExecrpTxn) {
  return (
    a.slot === b.slot &&
    a.txnIdx === b.txnIdx &&
    a.state === b.state &&
    isSameTxnSegment(a.states.exec, b.states.exec) &&
    isSameTxnSegment(a.states.sigverify, b.states.sigverify)
  );
}

export const hoveredExecrpTxnAtom = atomWithIsSameCheck<HoveredExecrpTxn>(
  isSameHoveredExecrpTxn,
);

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

export interface HoveredAggCpu {
  bucketIdx: number;
  granularity: AggGranularity;
}

export const hoveredAggCpuAtom = atomWithIsSameCheck<HoveredAggCpu>(
  (a, b) => a.bucketIdx === b.bucketIdx && a.granularity === b.granularity,
);

export interface HoveredRevenueTxn {
  slot: number;
  series: RevenueSeries;
  meta: TxnMetaDetails;
}

function isSameHoveredRevenueTxn(a: HoveredRevenueTxn, b: HoveredRevenueTxn) {
  return (
    a.slot === b.slot &&
    a.series === b.series &&
    a.meta.execIdx === b.meta.execIdx &&
    a.meta.loadStartMs === b.meta.loadStartMs
  );
}

export const hoveredRevenueTxnAtom = atomWithIsSameCheck<HoveredRevenueTxn>(
  isSameHoveredRevenueTxn,
);

export interface HoveredAggHeader {
  bucketIdx: number;
  granularity: AggGranularity;
}

/** Which tooltip the Replay chart should show for the current hover. */
export enum TooltipType {
  Shred,
  ExecrpTxn,
  AggShred,
  AggRevenue,
  AggCpu,
  RevenueTxn,
  Slot,
  AggHeader,
}

export const tooltipTypeAtom = atom<TooltipType | null>((get) => {
  if (get(hoveredMsAtom) == null) return null;

  if (get(hoveredShredAtom) != null) return TooltipType.Shred;
  if (get(hoveredExecrpTxnAtom) != null) return TooltipType.ExecrpTxn;
  if (get(hoveredAggShredsAtom) != null) return TooltipType.AggShred;
  if (get(hoveredAggRevenueAtom) != null) return TooltipType.AggRevenue;
  if (get(hoveredAggCpuAtom) != null) return TooltipType.AggCpu;

  // fallback non-agg tooltip
  if (get(hoveredRevenueTxnAtom) != null) return TooltipType.RevenueTxn;
  if (get(hoveredSlotInfoAtom) != null) return TooltipType.Slot;

  // fallback agg tooltip
  if (get(hoveredAggHeaderAtom) != null) return TooltipType.AggHeader;
  return null;
});

export const hoveredAggHeaderAtom = selectAtom(
  atom<HoveredAggHeader | undefined>((get) => {
    const cursorMs = get(hoveredMsAtom);
    const referenceNs = get(referenceNsAtom);
    const visibleRange = get(visibleRangeAtom);
    if (
      cursorMs == null ||
      referenceNs == null ||
      !visibleRange ||
      !get(isAggHeaderVisibleAtom)
    )
      return;

    const granularity = getAggSlotsGranularity(
      visibleRange[1] - visibleRange[0],
    );
    const bucketIdx = getBucketIdx(
      calcAbsoluteNs(referenceNs, cursorMs),
      granularity,
      false,
    );
    return { bucketIdx, granularity };
  }),
  (hovered) => hovered,
  (a, b) =>
    a === b ||
    (a != null &&
      b != null &&
      a.bucketIdx === b.bucketIdx &&
      a.granularity === b.granularity),
);

export const nonAggHeaderElAtom = atom<HTMLElement | null>(null);

export interface PinnedTooltip {
  ts: number;
  /** highest slot number at ts */
  anchorSlot: number;
  mode: "list" | "detail";
  selectedSlot?: number;
  clientPos: ClientPos;
  /**
   * Set when returning from detail to list: suppress leave-dismissal (from
   * either the tooltip's own hover handler or the header's hover handler) until
   * the cursor is confirmed back over the tooltip/header. Cleared on re-entry.
   */
  suppressLeaveUntilReentry?: boolean;
}

const _pinnedTooltipAtom = atom<PinnedTooltip | undefined>(undefined);

/**
 * The pinned overlap tooltip, hidden while its ts is outside the visible range
 * or in aggregate mode. Writers set _pinnedTooltipAtom; everything else reads this.
 */
export const pinnedTooltipAtom = atom((get) => {
  const pinned = get(_pinnedTooltipAtom);
  const visibleRange = get(visibleRangeAtom);
  if (!pinned || !visibleRange || isAggregate(visibleRange)) return;
  if (pinned.ts < visibleRange[0] || pinned.ts > visibleRange[1]) return;
  return pinned;
});

export const isReplayTooltipPinnedAtom = atom(
  (get) => get(pinnedTooltipAtom) != null,
);

const overlappingSlotsBaseAtom = atom<SlotInfo[]>((get) => {
  const pinned = get(pinnedTooltipAtom);
  if (!pinned) return [];
  return overlappingSlotsAtMs(get, pinned.ts);
});

/**
 * All slots overlapping the pinned ts, sorted ascending by start ts.
 */
export const overlappingSlotsAtom = selectAtom(
  overlappingSlotsBaseAtom,
  (list) => list,
  isSameSlotList,
);

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

/**
 * Open or refresh the overlap list at the cursor ts when 2+ slots overlap there;
 * close it when they don't. A detail-mode tooltip is left untouched.
 */
export const openOrUpdateOverlapAtom = atom(
  null,
  (get, set, { ts, clientPos }: { ts: number; clientPos: ClientPos }) => {
    const current = get(pinnedTooltipAtom);

    if (current?.mode === "detail") return;

    const overlapping = overlappingSlotsAtMs(get, ts);
    if (overlapping.length <= 1) {
      // No overlap under the cursor: close the list if one is showing. After
      // a detail→list return, keep it open until the cursor is confirmed over an
      // overlap region / the tooltip.
      if (current && !current.suppressLeaveUntilReentry) set(dismissPinnedAtom);
      return;
    }

    // anchor on the highest slot number in the overlap
    const anchorSlot = overlapping.reduce(
      (max, s) => Math.max(max, s.slot),
      -1,
    );

    if (
      current &&
      current.mode === "list" &&
      !current.suppressLeaveUntilReentry &&
      current.anchorSlot === anchorSlot &&
      isSameSlotList(get(overlappingSlotsAtom), overlapping)
    ) {
      return;
    }

    // cursor is over a real overlap region: re-entry satisfied
    set(_pinnedTooltipAtom, {
      ts,
      anchorSlot,
      clientPos,
      mode: "list",
    });
    set(_pinnedSpotlightSlotAtom, anchorSlot);
  },
);

/** Switch to the detail view for a slot and spotlight it. */
export const selectPinnedSlotAtom = atom(null, (get, set, slot: number) => {
  const pinned = get(pinnedTooltipAtom);
  if (!pinned) return;
  set(_pinnedTooltipAtom, { ...pinned, mode: "detail", selectedSlot: slot });
  set(_pinnedSpotlightSlotAtom, slot);
});

/** Return to the list view and clear the spotlight. */
export const pinnedBackToListAtom = atom(null, (get, set) => {
  const pinned = get(pinnedTooltipAtom);
  if (!pinned) return;
  // The tooltip jumps from the detail position back under the header,
  // so the cursor is left off the list. Suppress leave-dismissal
  // until the cursor is seen over the tooltip/header again.
  set(_pinnedTooltipAtom, {
    ...pinned,
    mode: "list",
    selectedSlot: undefined,
    suppressLeaveUntilReentry: true,
  });
  set(_pinnedSpotlightSlotAtom, undefined);
});

export const clearPinnedReentryGateAtom = atom(null, (get, set) => {
  const pinned = get(pinnedTooltipAtom);
  if (!pinned?.suppressLeaveUntilReentry) return;
  set(_pinnedTooltipAtom, { ...pinned, suppressLeaveUntilReentry: false });
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
    if (!get(pinnedTooltipAtom)) return;
    set(_pinnedSpotlightSlotAtom, slot);
  },
);

/** Close the pinned tooltip and clear its spotlight. */
export const dismissPinnedAtom = atom(null, (_get, set) => {
  set(_pinnedTooltipAtom, undefined);
  set(_pinnedSpotlightSlotAtom, undefined);
});

export const miniMapPopoverBoundaryElAtom = atom<HTMLDivElement | null>(null);
export const miniMapPopoverBoundaryWidthAtom = atom(0);
