import { atom } from "jotai";
import { tileTimerAtom } from "../../../api/atoms";

export const selectedSlotStrAtom = atom<string>();

export const selectedSlotAtom = atom((get) => {
  const slot: number = Number(get(selectedSlotStrAtom));
  if (isNaN(slot)) return undefined;
  return slot;
});

export enum DisplayType {
  Count = "Count",
  Pct = "Pct %",
}

export const sankeyDisplayTypeAtom = atom(DisplayType.Count);

export const liveTileTimerfallAtom = atom((get) => {
  const selectedSlot = get(selectedSlotAtom);
  if (selectedSlot) return;

  return get(tileTimerAtom);
});

export const isTileSparkLineExpandedAtom = atom(false);