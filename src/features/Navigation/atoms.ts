import { atom } from "jotai";
import {
  currentLeaderSlotAtom,
  firstProcessedSlotAtom,
  leaderSlotsAtom,
  nextLeaderSlotAtom,
} from "../../atoms";
import { slotsPerLeader } from "../../consts";
import { areInSameGroup } from "../../utils";
import { selectedSlotAtom } from "../Overview/SlotPerformance/atoms";

export const isScrollingAtom = atom(false);

export enum SlotGroupType {
  Current,
  FutureYourNext,
  FutureNotYourNext,
  PastProcessed,
  PastUnprocessed,
}

export const getSlotGroupTypeAtom = atom((get) => {
  const currentLeaderSlot = get(currentLeaderSlotAtom);
  const firstProcessedSlot = get(firstProcessedSlotAtom);
  const leaderSlots = get(leaderSlotsAtom);

  if (
    !leaderSlots ||
    currentLeaderSlot === undefined ||
    firstProcessedSlot === undefined
  )
    return;

  const nextLeaderSlot = get(nextLeaderSlotAtom);

  return function getSlotGroupType(slot: number) {
    if (areInSameGroup(slot, currentLeaderSlot)) {
      return SlotGroupType.Current;
    }
    if (nextLeaderSlot && areInSameGroup(slot, nextLeaderSlot)) {
      return SlotGroupType.FutureYourNext;
    }
    if (currentLeaderSlot + slotsPerLeader <= slot) {
      return SlotGroupType.FutureNotYourNext;
    }
    if (firstProcessedSlot <= slot && slot <= currentLeaderSlot) {
      return SlotGroupType.PastProcessed;
    }
    return SlotGroupType.PastUnprocessed;
  };
});

export const getIsGroupSelectedAtom = atom((get) => {
  const selectedSlot = get(selectedSlotAtom);
  return function isGroupSelected(slot: number) {
    if (selectedSlot == null) return false;
    return areInSameGroup(slot, selectedSlot);
  };
});
