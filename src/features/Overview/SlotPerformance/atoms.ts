import { atom } from "jotai";

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
