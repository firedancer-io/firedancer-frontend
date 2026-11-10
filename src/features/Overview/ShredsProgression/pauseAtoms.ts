import { atom, type Getter } from "jotai";
import type { Slot, SlotRange, SlotsShreds } from "../../Shreds/types";
import { smoothedNowNsAtom } from "../../../nowAtoms";
import { showStartupProgressAtom } from "../../StartupProgress/atoms";
import { minDirtySlotByChartAtom } from "../../Shreds/atoms";
import { xRangeMs } from "../../Shreds/const";
import type { TsRange } from "../../WebGl/webglUtils";
import { calcRelativeMs } from "../../Replay/utils";
import { getDelayedNowNs } from "./utils";
import { maxShredsChartScale } from "./useShredsChartScale";
import {
  shredsAtoms,
  liveShredsPostStartupRangeAtom,
  getLeaderSlotsRange,
} from "./atoms";

export interface ShredsState {
  liveShreds: SlotsShreds;
  slotRange: SlotRange;
  minCompletedSlot: number;
  rangeAfterStartup: SlotRange;
  nowNs: bigint;
}

const _snapshotAtom = atom<ShredsState | null>(null);

export const isShredsPausedAtom = atom((get) => get(_snapshotAtom) != null);

function getLiveShredsState(get: Getter): ShredsState | undefined {
  const liveShreds = get(shredsAtoms.slotsShreds);
  const slotRange = get(shredsAtoms.range);
  const minCompletedSlot = get(shredsAtoms.minCompletedSlot);
  const rangeAfterStartup = get(liveShredsPostStartupRangeAtom);
  const nowNs = get(smoothedNowNsAtom);
  if (
    !liveShreds ||
    !slotRange ||
    get(showStartupProgressAtom) ||
    minCompletedSlot == null ||
    !rangeAfterStartup ||
    nowNs == null
  ) {
    return;
  }
  return { liveShreds, slotRange, minCompletedSlot, rangeAfterStartup, nowNs };
}

export function getShredsState(get: Getter) {
  return get(_snapshotAtom) ?? getLiveShredsState(get);
}

export const shredsLeaderSlotsRangeAtom = atom((get) => {
  const range =
    get(_snapshotAtom)?.rangeAfterStartup ??
    get(liveShredsPostStartupRangeAtom);
  return range ? getLeaderSlotsRange(range) : undefined;
});

export function getVisibleTsRange(
  { liveShreds, nowNs }: ShredsState,
  scale: number,
): TsRange {
  const maxTs = calcRelativeMs(liveShreds.referenceTs, getDelayedNowNs(nowNs));
  return [maxTs - xRangeMs * scale, maxTs];
}

function copySlot(slot: Slot): Slot {
  return { ...slot, shreds: slot.shreds.map((shred) => shred && [...shred]) };
}

// Deep copy of the visible slots. Live events are merged in place, and late
// ones can land inside the frozen range.
function copyVisibleShreds(
  { referenceTs, slots }: SlotsShreds,
  [visibleStart]: TsRange,
): SlotsShreds {
  const visibleSlots = new Map<number, Slot>();
  // last slot completed before the range, kept like live data for label spacing
  let boundary: [number, Slot] | undefined;
  for (const [slotNumber, slot] of slots) {
    if (
      slot.completionTsDelta != null &&
      slot.completionTsDelta < visibleStart
    ) {
      if (!boundary || slotNumber > boundary[0]) boundary = [slotNumber, slot];
      continue;
    }
    visibleSlots.set(slotNumber, copySlot(slot));
  }
  if (boundary) visibleSlots.set(boundary[0], copySlot(boundary[1]));
  return { referenceTs, slots: visibleSlots };
}

// no-op while paused or before there's live state
export const pauseShredsAtom = atom(null, (get, set) => {
  if (get(_snapshotAtom) != null) return;

  const state = getLiveShredsState(get);
  if (!state) return;

  set(_snapshotAtom, {
    ...state,
    liveShreds: copyVisibleShreds(
      state.liveShreds,
      // the widest scale, so paused resizes still have history to draw
      getVisibleTsRange(state, maxShredsChartScale),
    ),
    slotRange: { ...state.slotRange },
    rangeAfterStartup: { ...state.rangeAfterStartup },
  });
});

export const resumeShredsAtom = atom(null, (get, set) => {
  if (get(_snapshotAtom) == null) return;

  // redraw every slot, since incomplete slots were drawn to the frozen right edge
  set(minDirtySlotByChartAtom, (prev) => {
    for (const chartId of prev.keys()) prev.set(chartId, -Infinity);
    return prev;
  });
  set(_snapshotAtom, null);
});
