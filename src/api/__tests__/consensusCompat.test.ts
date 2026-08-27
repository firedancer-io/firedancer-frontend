import { describe, expect, test } from "vitest";
import {
  estimatedTpsSchema,
  slotPublishSchema,
  slotSchema,
  tpsHistorySchema,
} from "../entities";

/* The websocket API is served by both Tower and Alpenglow validators,
   and the two send different shapes for the same information.  The
   schemas accept either and normalise to the Tower shape at parse time,
   so that consumers never branch on consensus mode.

   These tests pin that down in both directions: a Tower server must keep
   parsing exactly as before, and an Alpenglow server must parse to
   something a Tower-shaped consumer can read. */

const baseSlot = {
  slot: 100,
  mine: false,
  level: "rooted",
  priority_fee: 1,
  transaction_fee: 2,
  tips: 3,
  max_compute_units: 4,
  compute_units: 5,
  duration_nanos: 6,
  completed_time_nanos: 7,
};

describe("slot publish", () => {
  test("a Tower publish keeps its four-way split and its skipped flag", () => {
    const parsed = slotPublishSchema.parse({
      ...baseSlot,
      skipped: true,
      success_nonvote_transaction_cnt: 10,
      failed_nonvote_transaction_cnt: 2,
      success_vote_transaction_cnt: 30,
      failed_vote_transaction_cnt: 1,
    });

    expect(parsed.skipped).toBe(true);
    expect(parsed.success_nonvote_transaction_cnt).toBe(10);
    expect(parsed.failed_nonvote_transaction_cnt).toBe(2);
    expect(parsed.success_vote_transaction_cnt).toBe(30);
    expect(parsed.failed_vote_transaction_cnt).toBe(1);
  });

  test("an Alpenglow publish projects onto the same fields", () => {
    const parsed = slotPublishSchema.parse({
      ...baseSlot,
      success_transaction_cnt: 10,
      failed_transaction_cnt: 2,
      notarization_kind: "regular",
      finalization_kind: "fast",
      vote_rewarded: true,
    });

    expect(parsed.success_nonvote_transaction_cnt).toBe(10);
    expect(parsed.failed_nonvote_transaction_cnt).toBe(2);
    // Not unknown: Alpenglow votes are not transactions, so zero.
    expect(parsed.success_vote_transaction_cnt).toBe(0);
    expect(parsed.failed_vote_transaction_cnt).toBe(0);
    // Passed through for consumers that want them.
    expect(parsed.notarization_kind).toBe("regular");
    expect(parsed.finalization_kind).toBe("fast");
    expect(parsed.vote_rewarded).toBe(true);
  });

  test("skipped is derived from the level when the flag is absent", () => {
    expect(
      slotPublishSchema.parse({ ...baseSlot, level: "skipped" }).skipped,
    ).toBe(true);
    expect(
      slotPublishSchema.parse({ ...baseSlot, level: "notarized" }).skipped,
    ).toBe(false);
  });

  test("every Alpenglow level is accepted", () => {
    for (const level of ["notarized", "skip_notarized", "skipped"]) {
      expect(slotPublishSchema.parse({ ...baseSlot, level }).level).toBe(level);
    }
  });

  test("unknown transaction counts stay null rather than becoming zero", () => {
    const parsed = slotPublishSchema.parse({
      ...baseSlot,
      success_transaction_cnt: null,
      failed_transaction_cnt: null,
    });
    expect(parsed.success_nonvote_transaction_cnt).toBeNull();
    expect(parsed.failed_nonvote_transaction_cnt).toBeNull();
  });
});

describe("estimated tps", () => {
  test("a Tower object is unchanged", () => {
    expect(
      estimatedTpsSchema.parse({
        total: 100,
        vote: 60,
        nonvote_success: 30,
        nonvote_failed: 10,
      }),
    ).toEqual({
      total: 100,
      vote: 60,
      nonvote_success: 30,
      nonvote_failed: 10,
    });
  });

  test("an Alpenglow object becomes the Tower shape with no vote rate", () => {
    expect(estimatedTpsSchema.parse({ success: 30, failed: 10 })).toEqual({
      total: 40,
      vote: 0,
      nonvote_success: 30,
      nonvote_failed: 10,
    });
  });
});

describe("tps history", () => {
  test("both sample widths normalise to four elements", () => {
    expect(
      tpsHistorySchema.parse([
        [100, 60, 30, 10],
        [30, 10],
      ]),
    ).toEqual([
      [100, 60, 30, 10],
      [40, 0, 30, 10],
    ]);
  });
});

describe("history messages", () => {
  test("Alpenglow missed_vote_history parses", () => {
    const parsed = slotSchema.parse({
      topic: "slot",
      key: "missed_vote_history",
      value: { slot: [10, 12, 20, 20] },
    });
    expect(parsed.key).toBe("missed_vote_history");
  });

  test("Tower late_votes_history still parses", () => {
    const parsed = slotSchema.parse({
      topic: "slot",
      key: "late_votes_history",
      value: { slot: [10, 12], latency: [1, null] },
    });
    expect(parsed.key).toBe("late_votes_history");
  });
});
