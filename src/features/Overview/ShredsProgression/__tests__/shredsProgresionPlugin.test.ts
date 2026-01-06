import { expect, describe, it } from "vitest";
import {
  estimateSlotTsDeltas,
  getGroupTsDeltas,
  getSlotBlocks,
  type TsDeltasBySlot,
} from "../shredsProgressionPlugin";

describe("shreds progression plugin", () => {
  describe("shred labels", () => {
    it("ignores the missing slots at the start of a label. Useful when first loading chart", () => {
      const slotTsDeltas = {
        "10": [400, 600],
        "11": [600, 800],
        "12": [800, 1100],
      } satisfies TsDeltasBySlot;
      const groupLeaderSlots = [8, 12];
      expect(getGroupTsDeltas(slotTsDeltas, groupLeaderSlots)).toEqual({
        "8": [400, 800],
        "12": [800, undefined],
      });
    });

    it("sets group label end to undefined if valid slots are missing / have undefined end", () => {
      const groupLeaderSlots = [8, 12];

      expect(
        getGroupTsDeltas(
          {
            // ignore missing start
            "9": [200, 400],
            "10": [400, 600],
            // undefined end
            "11": [600, undefined],
            "12": [800, 1100],
          },
          groupLeaderSlots,
        ),
      ).toEqual({
        "8": [200, undefined],
        "12": [800, undefined],
      });

      expect(
        getGroupTsDeltas(
          {
            // ignore missing start
            "9": [200, 400],
            "10": [400, 600],
            // missing 11
            "12": [800, 1100],
          },
          groupLeaderSlots,
        ),
      ).toEqual({
        "8": [200, undefined],
        "12": [800, undefined],
      });
    });

    describe("splits range amongst skipped slots", () => {
      it("handles first skipped slot with max event past its single slot allocation, allocating remaining time to other skipped slots", () => {
        const slotRange = { min: 8, max: 12 };
        const slots = new Map([
          [
            8,
            {
              // skipped, with some events
              minEventTsDelta: 0,
              maxEventTsDelta: 500,
              shreds: [],
            },
          ],
          // 9, 10, 11 skipped
          [
            12,
            {
              minEventTsDelta: 800,
              maxEventTsDelta: 1200,
              completionTsDelta: 1200,
              shreds: [],
            },
          ],
        ]);

        const slotBlocks = getSlotBlocks(slotRange, slots);
        expect(slotBlocks).toEqual([
          {
            type: "incomplete",
            startTsDelta: 0,
            endTsDelta: 800,
            firstSlotMaxEventTsDelta: 500,
            slotNumbers: [8, 9, 10, 11],
          },
          {
            type: "complete",
            startTsDelta: 800,
            endTsDelta: 1200,
            slotNumber: 12,
          },
        ]);

        const skippedSlotsCluster = new Set<number>([8, 9, 10, 11]);
        const slotTsDeltas = estimateSlotTsDeltas(
          slotBlocks,
          skippedSlotsCluster,
        );

        // give first skipped slot up to its max event ts delta,
        // and split remaining time equally amongst other skipped slots
        expect(slotTsDeltas).toEqual({
          "8": [0, 500],
          "9": [500, 600],
          "10": [600, 700],
          "11": [700, 800],
          "12": [800, 1200],
        });

        const groupLeaderSlots = [8, 12];
        const groupTsDeltas = getGroupTsDeltas(slotTsDeltas, groupLeaderSlots);
        expect(groupTsDeltas).toEqual({
          "8": [0, 800],
          "12": [800, undefined],
        });
      });

      it("handles first skipped slot with max event past its single slot allocation, where other skipped slots get negative range", () => {
        const slotRange = { min: 8, max: 12 };
        const slots = new Map([
          [
            8,
            {
              // skipped, with some events
              minEventTsDelta: 0,
              maxEventTsDelta: 1200,
              shreds: [],
            },
          ],
          // 9, 10, 11 skipped
          [
            12,
            {
              // finishes before previous skipped slot's max event
              minEventTsDelta: 800,
              maxEventTsDelta: 1100,
              completionTsDelta: 1100,
              shreds: [],
            },
          ],
        ]);

        const slotBlocks = getSlotBlocks(slotRange, slots);
        expect(slotBlocks).toEqual([
          {
            type: "incomplete",
            startTsDelta: 0,
            endTsDelta: 800,
            firstSlotMaxEventTsDelta: 1200,
            slotNumbers: [8, 9, 10, 11],
          },
          {
            type: "complete",
            startTsDelta: 800,
            endTsDelta: 1100,
            slotNumber: 12,
          },
        ]);

        const skippedSlotsCluster = new Set<number>([8, 9, 10, 11]);
        const slotTsDeltas = estimateSlotTsDeltas(
          slotBlocks,
          skippedSlotsCluster,
        );

        // give first skipped slot up to its max event ts delta,
        // and ignore remaining skipped slots which would have negative estimated ranges
        expect(slotTsDeltas).toEqual({
          "8": [0, 1200],
          "9": undefined,
          "10": undefined,
          "11": undefined,
          "12": [800, 1100],
        });

        const groupLeaderSlots = [8, 12];
        const groupTsDeltas = getGroupTsDeltas(slotTsDeltas, groupLeaderSlots);

        expect(groupTsDeltas).toEqual({
          "8": [0, 1200],
          "12": [800, undefined],
        });
      });

      it("gives first skipped slot its equal range allocation, when the allocation is >= the range to its max event", () => {
        const slotRange = { min: 8, max: 12 };
        const slots = new Map([
          [
            8,
            {
              // skipped, with some events
              minEventTsDelta: 0,
              maxEventTsDelta: 50,
              shreds: [],
            },
          ],
          // 9, 10, 11 skipped
          [
            12,
            {
              minEventTsDelta: 800,
              maxEventTsDelta: 1100,
              completionTsDelta: 1100,
              shreds: [],
            },
          ],
        ]);

        const slotBlocks = getSlotBlocks(slotRange, slots);
        expect(slotBlocks).toEqual([
          {
            type: "incomplete",
            startTsDelta: 0,
            endTsDelta: 800,
            firstSlotMaxEventTsDelta: 50,
            slotNumbers: [8, 9, 10, 11],
          },
          {
            type: "complete",
            startTsDelta: 800,
            endTsDelta: 1100,
            slotNumber: 12,
          },
        ]);

        const skippedSlotsCluster = new Set<number>([8, 9, 10, 11]);
        const slotTsDeltas = estimateSlotTsDeltas(
          slotBlocks,
          skippedSlotsCluster,
        );

        expect(slotTsDeltas).toEqual({
          "8": [0, 200],
          "9": [200, 400],
          "10": [400, 600],
          "11": [600, 800],
          "12": [800, 1100],
        });

        const groupLeaderSlots = [8, 12];
        const groupTsDeltas = getGroupTsDeltas(slotTsDeltas, groupLeaderSlots);
        expect(groupTsDeltas).toEqual({
          "8": [0, 800],
          "12": [800, undefined],
        });
      });
    });

    it("ignores skipped slots with estimated negative range, caused by slot overlap", () => {
      const slotRange = { min: 8, max: 15 };
      const slots = new Map([
        [
          8,
          {
            minEventTsDelta: 0,
            maxEventTsDelta: 400,
            completionTsDelta: 400,
            shreds: [],
          },
        ],
        [
          9,
          {
            minEventTsDelta: 450,
            maxEventTsDelta: 850,
            completionTsDelta: 850,
            shreds: [],
          },
        ],
        [
          10,
          {
            minEventTsDelta: 900,
            maxEventTsDelta: 1300,
            completionTsDelta: 1300,
            shreds: [],
          },
        ],
        [
          11,
          {
            // super long slot
            minEventTsDelta: 1350,
            maxEventTsDelta: 2000,
            completionTsDelta: 2000,
            shreds: [],
          },
        ],
        // 12 and 13 skipped
        [
          14,
          {
            // ends before previous defined slot
            minEventTsDelta: 300,
            maxEventTsDelta: 500,
            completionTsDelta: 500,
            shreds: [],
          },
        ],
        [
          15,
          {
            // ends before previous defined slot
            minEventTsDelta: 520,
            maxEventTsDelta: 700,
            completionTsDelta: 700,
            shreds: [],
          },
        ],
      ]);

      const slotBlocks = getSlotBlocks(slotRange, slots);
      expect(slotBlocks).toEqual([
        { type: "complete", startTsDelta: 0, endTsDelta: 400, slotNumber: 8 },
        {
          type: "complete",
          startTsDelta: 450,
          endTsDelta: 850,
          slotNumber: 9,
        },
        {
          type: "complete",
          startTsDelta: 900,
          endTsDelta: 1300,
          slotNumber: 10,
        },
        {
          type: "complete",
          startTsDelta: 1350,
          endTsDelta: 2000,
          slotNumber: 11,
        },
        {
          type: "incomplete",
          startTsDelta: 2000,
          endTsDelta: 300,
          slotNumbers: [12, 13],
        },
        {
          type: "complete",
          startTsDelta: 300,
          endTsDelta: 500,
          slotNumber: 14,
        },
        {
          type: "complete",
          startTsDelta: 520,
          endTsDelta: 700,
          slotNumber: 15,
        },
      ]);

      const skippedSlotsCluster = new Set<number>([12, 13]);
      const slotTsDeltas = estimateSlotTsDeltas(
        slotBlocks,
        skippedSlotsCluster,
      );
      // correctly ignores slot 12 and 13 which would have negative estimated ranges
      expect(slotTsDeltas).toEqual({
        "8": [0, 400],
        "9": [450, 850],
        "10": [900, 1300],
        "11": [1350, 2000],
        "14": [300, 500],
        "15": [520, 700],
      });

      const groupLeaderSlots = [8, 12];
      const groupTsDeltas = getGroupTsDeltas(slotTsDeltas, groupLeaderSlots);
      expect(groupTsDeltas).toEqual({ "8": [0, 2000], "12": [300, 700] });
    });
  });
});
