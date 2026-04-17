import { expect, describe, it } from "vitest";
import {
  formatBytes,
  formatTimeNanos,
  getDiscountedVoteLatency,
  getDurationText,
  hasLateVote,
} from "../utils";
import { Duration } from "luxon";
import type { SlotPublish } from "../api/types";

describe("formatBytes", () => {
  describe("auto unit selection", () => {
    it("returns 0 with unit B for zero bytes (noDecimalForZero default)", () => {
      expect(formatBytes(0)).toEqual({ value: "0", unit: "B" });
    });

    it("returns zero with decimal when noDecimalForZero is false", () => {
      expect(formatBytes(0, 1, undefined, false)).toEqual({
        value: "0.0",
        unit: "B",
      });
    });

    it("formats bytes below 1000 as B", () => {
      expect(formatBytes(500)).toEqual({ value: "500.0", unit: "B" });
    });

    it("formats value at threshold boundary (999) as B", () => {
      expect(formatBytes(999)).toEqual({ value: "999.0", unit: "B" });
    });

    it("formats value at 1_000 as kB", () => {
      expect(formatBytes(1_000)).toEqual({ value: "1.0", unit: "kB" });
    });

    it("formats bytes in kB range", () => {
      expect(formatBytes(1_500)).toEqual({ value: "1.5", unit: "kB" });
    });

    it("formats value at 1_000_000 as MB", () => {
      expect(formatBytes(1_000_000)).toEqual({ value: "1.0", unit: "MB" });
    });

    it("formats bytes in MB range", () => {
      expect(formatBytes(2_500_000)).toEqual({ value: "2.5", unit: "MB" });
    });

    it("formats value at 1_000_000_000 as GB", () => {
      expect(formatBytes(1_000_000_000)).toEqual({ value: "1.0", unit: "GB" });
    });

    it("formats bytes in GB range", () => {
      expect(formatBytes(3_200_000_000)).toEqual({ value: "3.2", unit: "GB" });
    });

    it("formats very large values in GB", () => {
      expect(formatBytes(1_000_000_000_000)).toEqual({
        value: "1000.0",
        unit: "GB",
      });
    });
  });

  describe("explicit unit override", () => {
    it("forces B unit regardless of magnitude", () => {
      expect(formatBytes(1_000_000, 1, "B")).toEqual({
        value: "1000000.0",
        unit: "B",
      });
    });

    it("forces kB unit regardless of magnitude", () => {
      expect(formatBytes(1_000_000, 1, "kB")).toEqual({
        value: "1000.0",
        unit: "kB",
      });
    });

    it("forces MB unit for small value", () => {
      expect(formatBytes(500, 4, "MB")).toEqual({
        value: "0.0005",
        unit: "MB",
      });
    });

    it("forces GB unit for small value", () => {
      expect(formatBytes(500, 7, "GB")).toEqual({
        value: "0.0000005",
        unit: "GB",
      });
    });

    it("returns zero with forced unit when bytes is 0 and noDecimalForZero is true", () => {
      expect(formatBytes(0, 1, "MB")).toEqual({ value: "0", unit: "MB" });
    });

    it("returns zero with forced unit and decimal when noDecimalForZero is false", () => {
      expect(formatBytes(0, 1, "MB", false)).toEqual({
        value: "0.0",
        unit: "MB",
      });
    });
  });

  describe("precision", () => {
    it("uses default precision of 1", () => {
      expect(formatBytes(1_500)).toEqual({ value: "1.5", unit: "kB" });
    });

    it("uses precision 0 (no decimal)", () => {
      expect(formatBytes(1_500, 0)).toEqual({ value: "2", unit: "kB" });
    });

    it("uses precision 2", () => {
      expect(formatBytes(1_234, 2)).toEqual({ value: "1.23", unit: "kB" });
    });

    it("uses precision 3", () => {
      expect(formatBytes(1_234_567, 3)).toEqual({ value: "1.235", unit: "MB" });
    });
  });
});

describe("getDurationText", () => {
  it("shows Never if duration is not defined", () => {
    expect(getDurationText(undefined)).toEqual("Never");
  });

  it("shows 0s if duration is less than a second", () => {
    expect(
      getDurationText(
        Duration.fromObject({
          millisecond: 999,
        }),
      ),
    ).toEqual("0s");
  });

  it("shows full duration", () => {
    expect(
      getDurationText(
        Duration.fromObject({
          years: 1,
          months: 2,
          weeks: 3,
          days: 20,
          hours: 13,
          minutes: 4,
          seconds: 52,
        }),
      ),
    ).toEqual("1y 2m 3w 20d 13h 4m 52s");
  });

  it("shows full duration, omitting zero values", () => {
    expect(
      getDurationText(
        Duration.fromObject({
          years: 1,
          months: 2,
          weeks: 0,
          days: 20,
          hours: 0,
          minutes: 4,
          seconds: 0,
        }),
      ),
    ).toEqual("1y 2m 20d 4m");
  });

  it("shows duration without seconds", () => {
    expect(
      getDurationText(
        Duration.fromObject({
          years: 1,
          months: 2,
          weeks: 3,
          days: 20,
          hours: 13,
          minutes: 4,
          seconds: 52,
        }),
        {
          omitSeconds: true,
        },
      ),
    ).toEqual("1y 2m 3w 20d 13h 4m");
  });

  describe("showTwoSignificantUnits", () => {
    it("shows the two most significant units", () => {
      expect(
        getDurationText(
          Duration.fromObject({
            years: 1,
            months: 2,
            weeks: 3,
            days: 20,
            hours: 13,
            minutes: 4,
            seconds: 52,
          }),
          {
            showOnlyTwoSignificantUnits: true,
          },
        ),
      ).toEqual("1y 2m");

      expect(
        getDurationText(
          Duration.fromObject({
            years: 0,
            months: 0,
            weeks: 3,
            days: 20,
            hours: 13,
            minutes: 4,
            seconds: 52,
          }),
          {
            showOnlyTwoSignificantUnits: true,
          },
        ),
      ).toEqual("3w 20d");
    });

    it("shows zero second most significant unit value", () => {
      expect(
        getDurationText(
          Duration.fromObject({
            years: 0,
            months: 2,
            weeks: 0,
            days: 20,
            hours: 13,
            minutes: 4,
            seconds: 52,
          }),
          {
            showOnlyTwoSignificantUnits: true,
          },
        ),
      ).toEqual("2m 0w");
    });

    it("shows only seconds if duration is less than a minute", () => {
      expect(
        getDurationText(
          Duration.fromObject({
            years: 0,
            months: 0,
            weeks: 0,
            days: 0,
            hours: 0,
            minutes: 0,
            seconds: 52,
          }),
          {
            showOnlyTwoSignificantUnits: false,
          },
        ),
      ).toEqual("52s");
    });
  });
});

describe("formatTimeNanos", () => {
  it("formats times correctly", () => {
    expect(formatTimeNanos(1764892025356640223n)).toEqual({
      inMillis: "Dec 4, 05:47:05.356 PM CST",
      inNanos: "Dec 4, 05:47:05.356640223 PM CST",
    });
  });

  it("zero prefixes nanos correctly", () => {
    expect(formatTimeNanos(1764921600000000123n)).toEqual({
      inMillis: "Dec 5, 02:00:00.000 AM CST",
      inNanos: "Dec 5, 02:00:00.000000123 AM CST",
    });
  });

  it("custom format options", () => {
    expect(
      formatTimeNanos(1764892025356640223n, {
        timezone: "local",
        showTimezoneName: false,
      }),
    ).toEqual({
      inMillis: "Dec 4, 05:47:05.356 PM",
      inNanos: "Dec 4, 05:47:05.356640223 PM",
    });

    expect(
      formatTimeNanos(1764892025356640223n, {
        timezone: "utc",
        showTimezoneName: true,
      }),
    ).toEqual({
      inMillis: "Dec 4, 11:47:05.356 PM UTC",
      inNanos: "Dec 4, 11:47:05.356640223 PM UTC",
    });
  });
});

describe("hasLateVote and getDiscountedVoteLatency", () => {
  it("slot is not rooted", () => {
    const skippedClusterSlots = new Set<number>();
    const publish: SlotPublish = {
      slot: 1,
      mine: false,
      skipped: false,
      level: "optimistically_confirmed",
      success_nonvote_transaction_cnt: null,
      failed_nonvote_transaction_cnt: null,
      success_vote_transaction_cnt: null,
      failed_vote_transaction_cnt: null,
      priority_fee: null,
      transaction_fee: null,
      tips: null,
      max_compute_units: null,
      compute_units: null,
      duration_nanos: null,
      completed_time_nanos: null,
      vote_latency: 2,
    };
    expect(hasLateVote(publish)).toBeFalsy();
    expect(
      getDiscountedVoteLatency(
        publish.slot,
        publish.vote_latency!,
        skippedClusterSlots,
      ),
    ).toBe(2);
  });

  it("slot has null vote latency", () => {
    const publish: SlotPublish = {
      slot: 1,
      mine: false,
      skipped: false,
      level: "rooted",
      success_nonvote_transaction_cnt: null,
      failed_nonvote_transaction_cnt: null,
      success_vote_transaction_cnt: null,
      failed_vote_transaction_cnt: null,
      priority_fee: null,
      transaction_fee: null,
      tips: null,
      max_compute_units: null,
      compute_units: null,
      duration_nanos: null,
      completed_time_nanos: null,
      vote_latency: null,
    };
    expect(hasLateVote(publish)).toBeTruthy();
    expect(hasLateVote({ ...publish, skipped: true })).toBeFalsy();
  });

  it("slot has > 1 vote latency", () => {
    const skippedClusterSlots = new Set<number>();
    const publish: SlotPublish = {
      slot: 1,
      mine: false,
      skipped: false,
      level: "rooted",
      success_nonvote_transaction_cnt: null,
      failed_nonvote_transaction_cnt: null,
      success_vote_transaction_cnt: null,
      failed_vote_transaction_cnt: null,
      priority_fee: null,
      transaction_fee: null,
      tips: null,
      max_compute_units: null,
      compute_units: null,
      duration_nanos: null,
      completed_time_nanos: null,
      vote_latency: 2,
    };
    expect(hasLateVote(publish)).toBeTruthy();
    expect(
      getDiscountedVoteLatency(
        publish.slot,
        publish.vote_latency!,
        skippedClusterSlots,
      ),
    ).toBe(2);
  });

  it("no skipped slots within latency range", () => {
    const skippedClusterSlots = new Set<number>([6, 7]);
    const publish: SlotPublish = {
      slot: 1,
      mine: false,
      skipped: false,
      level: "rooted",
      success_nonvote_transaction_cnt: null,
      failed_nonvote_transaction_cnt: null,
      success_vote_transaction_cnt: null,
      failed_vote_transaction_cnt: null,
      priority_fee: null,
      transaction_fee: null,
      tips: null,
      max_compute_units: null,
      compute_units: null,
      duration_nanos: null,
      completed_time_nanos: null,
      vote_latency: 5,
    };
    expect(hasLateVote(publish)).toBeTruthy();
    expect(
      getDiscountedVoteLatency(
        publish.slot,
        publish.vote_latency!,
        skippedClusterSlots,
      ),
    ).toBe(5);
  });

  it("has some skipped slots within latency range", () => {
    const skippedClusterSlots = new Set<number>([3, 5]);
    const publish: SlotPublish = {
      slot: 1,
      mine: false,
      skipped: false,
      level: "rooted",
      success_nonvote_transaction_cnt: null,
      failed_nonvote_transaction_cnt: null,
      success_vote_transaction_cnt: null,
      failed_vote_transaction_cnt: null,
      priority_fee: null,
      transaction_fee: null,
      tips: null,
      max_compute_units: null,
      compute_units: null,
      duration_nanos: null,
      completed_time_nanos: null,
      vote_latency: 5,
    };
    expect(hasLateVote(publish)).toBeTruthy();
    expect(
      getDiscountedVoteLatency(
        publish.slot,
        publish.vote_latency!,
        skippedClusterSlots,
      ),
    ).toBe(3);
  });

  it("all slots within latency range are skipped", () => {
    const skippedClusterSlots = new Set<number>([2, 3, 4, 5]);
    const publish: SlotPublish = {
      slot: 1,
      mine: false,
      skipped: false,
      level: "rooted",
      success_nonvote_transaction_cnt: null,
      failed_nonvote_transaction_cnt: null,
      success_vote_transaction_cnt: null,
      failed_vote_transaction_cnt: null,
      priority_fee: null,
      transaction_fee: null,
      tips: null,
      max_compute_units: null,
      compute_units: null,
      duration_nanos: null,
      completed_time_nanos: null,
      vote_latency: 5,
    };
    expect(hasLateVote(publish)).toBeTruthy();
    expect(
      getDiscountedVoteLatency(
        publish.slot,
        publish.vote_latency!,
        skippedClusterSlots,
      ),
    ).toBe(1);
  });
});
