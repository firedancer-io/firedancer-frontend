import { atom } from "jotai";
import {
  liveTxnWaterfallAtom,
  tilesAtom,
  tileTimerAtom,
} from "../../../api/atoms";
import type { TxnWaterfall } from "../../../api/types";
import { atomWithImmer } from "jotai-immer";
import { produce } from "immer";
import { countBy } from "lodash";

// Note: do not user setter directly as it's derived from search params
export const selectedSlotAtom = atom<number>();

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
