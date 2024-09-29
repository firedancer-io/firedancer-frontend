import { atom } from "jotai";
import {
  allLeaderNamesAtom,
  currentLeaderSlotAtom,
  epochAtom,
  slotOverrideAtom,
} from "../../atoms";
import { getLeaderSlots } from "../../utils";
import { slotsPerLeader } from "../../consts";

export const enum SearchType {
  MySlots,
  SkippedSlots,
  Text,
}

export const searchTypeAtom = atom<SearchType>(SearchType.Text);

export const searchLeaderSlotsAtom = atom<number[] | undefined>(undefined);

export const setSearchLeaderSlotsAtom = atom(
  null,
  (get, set, searchText: string) => {
    const epoch = get(epochAtom);
    if (!epoch) return;

    searchText = searchText.trim();

    if (!searchText) {
      set(searchLeaderSlotsAtom, undefined);
      set(slotOverrideAtom, undefined);
      return;
    }

    set(searchTypeAtom, SearchType.Text);

    const searchSlot = parseInt(searchText, 10);
    if (
      !isNaN(searchSlot) &&
      searchSlot >= epoch.start_slot &&
      searchSlot <= epoch.end_slot
    ) {
      set(searchLeaderSlotsAtom, undefined);
      set(slotOverrideAtom, searchSlot);
      return;
    }

    if (searchText.length < 3) {
      set(searchLeaderSlotsAtom, []);
      set(slotOverrideAtom, undefined);
      return;
    }

    searchText = searchText.trim().toLowerCase();

    const leaderNames = get(allLeaderNamesAtom);

    const searchPubkeys = leaderNames
      ?.filter(
        ({ name, pubkey }) =>
          name?.includes(searchText) ||
          pubkey.toLowerCase().includes(searchText)
      )
      .map(({ pubkey }) => pubkey);

    if (!searchPubkeys?.length) {
      set(searchLeaderSlotsAtom, []);
      set(slotOverrideAtom, undefined);
      return;
    }

    const leaderSlots = searchPubkeys.flatMap((pubkey) => {
      return getLeaderSlots(epoch, pubkey);
    });

    set(searchLeaderSlotsAtom, leaderSlots);
  }
);

const setSearchOverrideAtom = atom(null, (get, set) => {
  const leaderSlots = get(searchLeaderSlotsAtom);
  if (!leaderSlots) return;

  const slotOverride = get(slotOverrideAtom);
  const currentLeaderSlot = get(currentLeaderSlotAtom);

  const slotDiffs = leaderSlots.map((slot) =>
    Math.abs(slot - (slotOverride ?? currentLeaderSlot ?? 0))
  );
  const minDiff = Math.min(...slotDiffs);
  const minDiffIndex = Math.max(slotDiffs.indexOf(minDiff), 0);
  set(slotOverrideAtom, leaderSlots[minDiffIndex]);
});

export const setSlotOverrideScrollAtom = atom(
  null,
  (get, set, slotOffset: number) => {
    const slotOverride = get(slotOverrideAtom);
    const searchLeaderSlots = get(searchLeaderSlotsAtom);
    const currentLeaderSlot = get(currentLeaderSlotAtom);

    if (currentLeaderSlot === undefined) return;

    if (searchLeaderSlots?.length) {
      if (slotOverride !== undefined) {
        const slotDiffs = searchLeaderSlots.map((slot) =>
          Math.abs(slot - slotOverride)
        );
        const minDiff = Math.min(...slotDiffs);
        const currentSlotIndex = Math.max(slotDiffs.indexOf(minDiff), 0);

        if (currentSlotIndex >= 0) {
          const slotIndex = Math.min(
            Math.max(currentSlotIndex + Math.trunc(slotOffset/4), 0),
            searchLeaderSlots.length - 1
          );
          set(slotOverrideAtom, searchLeaderSlots[slotIndex]);
        }
      } else {
        set(setSearchOverrideAtom);
      }
    } else {
      if (slotOverride !== undefined) {
        set(slotOverrideAtom, slotOverride + slotOffset);
      } else {
        set(
          slotOverrideAtom,
          slotOffset + currentLeaderSlot + slotsPerLeader * 3
        );
      }
    }
  }
);
