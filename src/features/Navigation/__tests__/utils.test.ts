import { describe, it, expect } from "vitest";
import { getAllSlotsListProps, getMySlotsListProps } from "../utils";

describe("navigation utils", () => {
  describe("getAllSlotsListProps", () => {
    it("gets correct values", () => {
      const result = getAllSlotsListProps({
        epoch: 1,
        start_time_nanos: null,
        end_time_nanos: null,
        start_slot: 4,
        end_slot: 15,
        excluded_stake_lamports: 0n,
        staked_pubkeys: [],
        staked_lamports: [],
        leader_slots: [],
      });

      expect(result).not.toBeUndefined();
      const { itemsCount, getSlotAtIndex, getIndexForSlot } = result!;
      expect(itemsCount).toBe(3);
      expect(getSlotAtIndex(0)).toBe(12);
      expect(getSlotAtIndex(1)).toBe(8);
      expect(getSlotAtIndex(2)).toBe(4);

      expect(getIndexForSlot(4)).toBe(2);
      expect(getIndexForSlot(9)).toBe(1);
      expect(getIndexForSlot(15)).toBe(0);

      // out of bounds
      expect(getSlotAtIndex(-1)).toBeUndefined();
      expect(getSlotAtIndex(3)).toBeUndefined();
      expect(getIndexForSlot(3)).toBeUndefined();
      expect(getIndexForSlot(16)).toBeUndefined();
    });

    it("handles undefined epoch", () => {
      const result = getAllSlotsListProps(undefined);
      expect(result).toBeUndefined();
    });
  });

  describe("getMySlotsListProps", () => {
    it("gets correct values and gives the index for the closest smaller my slot leader", () => {
      const result = getMySlotsListProps([4, 12, 20, 40, 44, 48]);

      expect(result).not.toBeUndefined();
      const { itemsCount, getSlotAtIndex, getIndexForSlot } = result!;

      expect(itemsCount).toBe(6);
      expect(getSlotAtIndex(0)).toBe(48);
      expect(getSlotAtIndex(1)).toBe(44);
      expect(getSlotAtIndex(5)).toBe(4);

      // slot leader in my slots
      expect(getIndexForSlot(4)).toBe(5);
      expect(getIndexForSlot(13)).toBe(4);
      expect(getIndexForSlot(50)).toBe(0);

      // get closest my slot leader that is smaller than slot
      // Ex. 38 => 36 (leader) => 20 (closest smaller my slot)
      expect(getIndexForSlot(30)).toBe(2);
      expect(getIndexForSlot(58)).toBe(0);

      // get closest my slot leader (smaller my slot is unavailable)
      // Ex. 2 => 0 (leader) => no smaller leader; closest my slot leader is 4
      expect(getIndexForSlot(2)).toBe(5);

      // out of bounds
      expect(getSlotAtIndex(-1)).toBeUndefined();
      expect(getSlotAtIndex(6)).toBeUndefined();
    });
  });
});
