import { Epoch } from "../../../api/types";
import { slotsPerLeader } from "../../../consts";
import { SlotType } from "./types";

export function getSlotType(slot: number, currentLeaderSlot: number) {
  if (slot < currentLeaderSlot) return SlotType.Past;
  if (slot > currentLeaderSlot) return SlotType.Upcoming;
  return SlotType.Now;
}

export function getSearchLeaderSlots({
  currentLeaderSlot,
  searchLeaderSlots,
  slotOverride,
  curCardCount = 0,
  cardCount = 1,
}: {
  currentLeaderSlot: number;
  searchLeaderSlots: number[];
  slotOverride: number | undefined;
  curCardCount: number;
  cardCount: number;
}) {
  const descSlots = searchLeaderSlots.toReversed();

  if (slotOverride === undefined) {
    if (descSlots.length <= cardCount) {
      return descSlots[curCardCount];
    } else {
      const firstPastSlotIndex = descSlots.findIndex(
        (slot) => slot < currentLeaderSlot,
      );
      const initPastSlotGroups = 3;
      const indexOffset = Math.max(firstPastSlotIndex - initPastSlotGroups, 0);
      return descSlots[curCardCount + indexOffset];
    }
  } else {
    const slotDiffs = descSlots.map((slot) => Math.abs(slot - slotOverride));
    const minDiff = Math.min(...slotDiffs);
    const indexOffset = Math.max(slotDiffs.indexOf(minDiff) - 3, 0);
    return descSlots[curCardCount + indexOffset];
  }
}

export function getSlotCards({
  cardCount,
  currentLeaderSlot,
  epoch,
  searchLeaderSlots,
  slotOverride,
  topSlot,
}: {
  cardCount: number;
  currentLeaderSlot: number | undefined;
  epoch: Epoch | undefined;
  searchLeaderSlots: number[] | undefined;
  slotOverride: number | undefined;
  topSlot: number;
}) {
  const upcoming: number[] = [];
  const now: number[] = [];
  const past: number[] = [];

  if (currentLeaderSlot === undefined) return { upcoming, now, past };

  for (let i = 0; i < cardCount; i++) {
    let slot = 0;

    if (searchLeaderSlots?.length) {
      slot = getSearchLeaderSlots({
        curCardCount: i,
        cardCount,
        currentLeaderSlot,
        searchLeaderSlots,
        slotOverride,
      });

      if (!slot) break;
    } else {
      slot = topSlot - i * slotsPerLeader;
    }

    if (epoch && (slot < epoch.start_slot || slot > epoch.end_slot)) {
      continue;
    }

    const slotType = getSlotType(slot, currentLeaderSlot);

    if (slotType === SlotType.Upcoming) {
      upcoming.push(slot);
    }

    if (slotType === SlotType.Now) {
      now.push(slot);
    }

    if (slotType === SlotType.Past) {
      past.push(slot);
    }
  }

  return { upcoming, now, past };
}
