import { atom } from "jotai";
import {
  liveTxnWaterfallAtom,
  tilesAtom,
  tileTimerAtom,
} from "../../../api/atoms";
import type { Epoch, TxnWaterfall } from "../../../api/types";
import { atomWithImmer } from "jotai-immer";
import { produce } from "immer";
import { countBy } from "lodash";
import {
  currentSlotAtom,
  earliestProcessedSlotLeaderAtom,
  epochAtom,
  leaderSlotsAtom,
  slotOverrideAtom,
} from "../../../atoms";
import { getSlotGroupLeader } from "../../../utils";

export enum SelectedSlotValidityState {
  Valid = "valid",
  NotReady = "invalid",
  OutsideEpoch = "outside-epoch",
  BeforeFirstProcessed = "before-first-processed",
  Future = "future",
  NotYou = "not-you",
}

function getSlotState(
  slot?: number,
  epoch?: Epoch,
  leaderSlots?: number[],
  earliestProcessedSlotLeader?: number,
  currentSlot?: number,
) {
  if (slot === undefined) return SelectedSlotValidityState.Valid;
  if (
    !epoch ||
    !leaderSlots ||
    earliestProcessedSlotLeader === undefined ||
    currentSlot === undefined
  )
    return SelectedSlotValidityState.NotReady;
  if (slot < epoch.start_slot || epoch.end_slot < slot)
    return SelectedSlotValidityState.OutsideEpoch;
  if (!leaderSlots.includes(getSlotGroupLeader(slot)))
    return SelectedSlotValidityState.NotYou;
  if (slot < earliestProcessedSlotLeader)
    return SelectedSlotValidityState.BeforeFirstProcessed;
  if (slot > currentSlot) return SelectedSlotValidityState.Future;
  return SelectedSlotValidityState.Valid;
}

export const baseSelectedSlotAtom = (function () {
  const _baseSelectedSlotAtom = atom<number>();
  const _isInitializedAtom = atom(false);

  return atom(
    (get) => {
      const epoch = get(epochAtom);
      const slot = get(_baseSelectedSlotAtom);
      const leaderSlots = get(leaderSlotsAtom);
      const earliestProcessedSlotLeader = get(earliestProcessedSlotLeaderAtom);
      const currentSlot = get(currentSlotAtom);
      const state = getSlotState(
        slot,
        epoch,
        leaderSlots,
        earliestProcessedSlotLeader,
        currentSlot,
      );
      return {
        slot,
        state,
        isValid: state === SelectedSlotValidityState.Valid,
        isInitialized: get(_isInitializedAtom),
      };
    },
    (get, set, slot?: number, epoch?: Epoch) => {
      const leaderSlots = get(leaderSlotsAtom);
      const earliestProcessedSlotLeader = get(earliestProcessedSlotLeaderAtom);
      const currentSlot = get(currentSlotAtom);
      if (
        !epoch ||
        !leaderSlots ||
        earliestProcessedSlotLeader === undefined ||
        currentSlot === undefined
      ) {
        set(_baseSelectedSlotAtom, undefined);
        return;
      }

      set(_baseSelectedSlotAtom, slot);
      set(_isInitializedAtom, true);
      const isValid =
        getSlotState(
          slot,
          epoch,
          leaderSlots,
          earliestProcessedSlotLeader,
          currentSlot,
        ) === SelectedSlotValidityState.Valid;

      if (isValid && slot !== undefined) {
        // Scroll to selected slot if new selection is defined
        set(slotOverrideAtom, slot);
      }
    },
  );
})();

export const selectedSlotAtom = atom<number | undefined>((get) => {
  const { slot, isValid } = get(baseSelectedSlotAtom);
  return isValid ? slot : undefined;
});

export enum DisplayType {
  Count = "Count",
  Pct = "Pct %",
  Rate = "Rate",
}

export const sankeyDisplayTypeAtom = atom(DisplayType.Count);

export const liveTileTimerfallAtom = atom((get) => {
  const selectedSlot = get(selectedSlotAtom);
  if (selectedSlot) return;

  return get(tileTimerAtom);
});

export const liveWaterfallAtom = atom((get) => {
  const selectedSlot = get(selectedSlotAtom);
  if (selectedSlot) return;

  const displayType = get(sankeyDisplayTypeAtom);
  if (displayType === DisplayType.Rate) {
    return get(rateLiveWaterfallAtom);
  }

  return get(liveTxnWaterfallAtom)?.waterfall;
});

const _rateLiveWaterfallAtom = atomWithImmer<
  { waterfall: TxnWaterfall; ts: number }[]
>([]);
export const rateLiveWaterfallAtom = atom(
  (get) => {
    const displayType = get(sankeyDisplayTypeAtom);
    if (displayType !== DisplayType.Rate) return;

    const buffer = get(_rateLiveWaterfallAtom);
    if (buffer.length < 2) {
      return buffer[0]?.waterfall;
    }

    const mostRecent = buffer[buffer.length - 1];
    const leastRecent = buffer[0];
    const diffS = (mostRecent.ts - leastRecent.ts) / 1_000;

    const diffWaterfall = produce(mostRecent.waterfall, (draft) => {
      for (const key in draft.in) {
        if (Object.prototype.hasOwnProperty.call(draft.in, key)) {
          const diffValue =
            draft.in[key as keyof typeof draft.in] -
            leastRecent.waterfall.in[key as keyof typeof draft.in];

          draft.in[key as keyof typeof draft.in] = Math.trunc(
            diffValue / diffS,
          );
        }
      }

      for (const key in draft.out) {
        if (Object.prototype.hasOwnProperty.call(draft.out, key)) {
          const diffValue =
            draft.out[key as keyof typeof draft.out] -
            leastRecent.waterfall.out[key as keyof typeof draft.out];

          draft.out[key as keyof typeof draft.out] = Math.trunc(
            diffValue / diffS,
          );
        }
      }
    });

    return diffWaterfall;
  },
  (get, set, waterfall?: TxnWaterfall) => {
    set(_rateLiveWaterfallAtom, (draft) => {
      const now = performance.now();
      if (waterfall) {
        draft.push({ waterfall, ts: now });
      }
      while (draft.length && now - draft[0].ts > 1_000) {
        draft.shift();
      }

      // Intended to remove all previous leader slot items, as counts reset each leader slot
      const mostRecent = Object.values(draft[draft.length - 1].waterfall.in);
      while (
        draft.length > 1 &&
        Object.values(draft[0].waterfall.in).some(
          (leastRecent, i) => mostRecent[i] - leastRecent < 0,
        )
      ) {
        draft.shift();
      }
    });
  },
);

export const isTileSparkLineExpandedAtom = atom(false);

export const tileCountAtom = atom((get) => {
  const tiles = get(tilesAtom);
  return countBy(tiles, (t) => t.kind);
});
